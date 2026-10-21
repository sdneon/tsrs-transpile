// usage: node transpile-tree.cjs <srcDir> <outDir> <ts6|tsrs> [optionsJson]
// Transpiles every .ts under srcDir to .js under outDir (same layout) with TS6 or the tsrs wasm, module CommonJS by default.
const fs = require('fs'), path = require('path');
const [srcDir, outDir, engine, optsJson] = process.argv.slice(2);
const opts = Object.assign({ module: 1, target: 9 }, JSON.parse(optsJson || '{}')); // CommonJS, ES2022
let transpile;
if (engine === 'ts6') {
  const ts = require(process.env.TS_MODULE || 'typescript');
  transpile = (name, src) => ts.transpileModule(src, { compilerOptions: opts, fileName: name }).outputText;
} else {
  const mod = new WebAssembly.Module(fs.readFileSync(process.env.WASM || require('path').join(__dirname, '..', 'dist', 'tsrs_transpile.wasm')));
  transpile = (name, src) => {
    let mem; const v = () => new DataView(mem.buffer);
    const wasi = new Proxy({ random_get(p, l) { const u = new Uint8Array(mem.buffer, p, l); for (let i = 0; i < l; i++) u[i] = (Math.random() * 256) | 0; return 0; },
      clock_time_get(id, pr, o) { v().setBigUint64(o, BigInt(Date.now()) * 1000000n, true); return 0; },
      environ_sizes_get(a, b) { v().setUint32(a, 0, true); v().setUint32(b, 0, true); return 0; }, environ_get() { return 0; },
      fd_write(fd, iov, n, w) { let t = 0; for (let i = 0; i < n; i++) t += v().getUint32(iov + i * 8 + 4, true); v().setUint32(w, t, true); return 0; },
      fd_fdstat_get() { return 8; }, fd_prestat_get() { return 8; }, fd_close() { return 8; }, proc_exit(c) { throw new Error('proc_exit ' + c); } }, { get: (o, k) => o[k] || (() => 52) });
    const inst = new WebAssembly.Instance(mod, { tsrs_host: { fs: () => -1, fs_take() {} }, wasi_snapshot_preview1: wasi }); mem = inst.exports.memory;
    const req = Buffer.from([name, JSON.stringify(opts), src].join(String.fromCharCode(0)));
    { const ptr = inst.exports.tsrs_input(req.length); new Uint8Array(mem.buffer).set(req, ptr); }
    const st = inst.exports.tsrs_transpile();
    const out = Buffer.from(mem.buffer, inst.exports.tsrs_output(), inst.exports.tsrs_output_len()).toString();
    if (st !== 0) throw new Error(name + ': ' + out.split(String.fromCharCode(0))[0]);
    return out;
  };
}
let n = 0, bytes = 0; const t0 = performance.now();
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '__tests__') walk(p); continue; }
    if (!/\.ts$/.test(e.name) || /\.d\.ts$|\.test\.ts$/.test(e.name)) continue;
    const rel = path.relative(srcDir, p).replace(/\.ts$/, '.js');
    const outFile = path.join(outDir, rel); fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const src = fs.readFileSync(p, 'utf8'); bytes += src.length; n++;
    fs.writeFileSync(outFile, transpile(e.name, src));
  }
})(srcDir);
console.log(`${engine}: ${n} files, ${(bytes / 1e3).toFixed(0)} KB in ${(performance.now() - t0).toFixed(0)} ms -> ${outDir}`);
