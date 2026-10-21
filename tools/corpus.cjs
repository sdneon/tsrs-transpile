// usage: node corpus.cjs <root> [optionsJson] [maxFiles]   - compares TS6 transpileModule vs tsrs_transpile over all .ts/.tsx
const fs = require('fs'), path = require('path');
const ts = require(process.env.TS_MODULE || 'typescript');
const wasmPath = process.env.WASM || require('path').join(__dirname, '..', 'dist', 'tsrs_transpile.wasm');
const mod = new WebAssembly.Module(fs.readFileSync(wasmPath));
function tsrs(fileName, opts, src) {
  let mem; const v = () => new DataView(mem.buffer);
  const wasi = new Proxy({ random_get(p, l) { const u = new Uint8Array(mem.buffer, p, l); for (let i = 0; i < l; i++) u[i] = (Math.random() * 256) | 0; return 0; },
    clock_time_get(id, pr, o) { v().setBigUint64(o, BigInt(Date.now()) * 1000000n, true); return 0; },
    environ_sizes_get(a, b) { v().setUint32(a, 0, true); v().setUint32(b, 0, true); return 0; }, environ_get() { return 0; },
    fd_write(fd, iov, n, w) { let t = 0; for (let i = 0; i < n; i++) t += v().getUint32(iov + i * 8 + 4, true); v().setUint32(w, t, true); return 0; },
    fd_fdstat_get() { return 8; }, fd_prestat_get() { return 8; }, fd_close() { return 8; }, proc_exit(c) { throw new Error('proc_exit ' + c); } }, { get: (o, k) => o[k] || (() => 52) });
  const inst = new WebAssembly.Instance(mod, { tsrs_host: { fs: () => -1, fs_take() {} }, wasi_snapshot_preview1: wasi }); mem = inst.exports.memory;
  const req = Buffer.from([fileName, JSON.stringify(opts), src].join(String.fromCharCode(0)));
  { const ptr = inst.exports.tsrs_input(req.length); new Uint8Array(mem.buffer).set(req, ptr); }
  const st = inst.exports.tsrs_transpile();
  const out = Buffer.from(mem.buffer, inst.exports.tsrs_output(), inst.exports.tsrs_output_len()).toString();
  if (st === 0) return { js: out, diag: [] };
  const i = out.indexOf(String.fromCharCode(0)); return { js: i < 0 ? '' : out.slice(i + 1), diag: (i < 0 ? out : out.slice(0, i)).split('\n'), fail: i < 0 };
}
const root = process.argv[2]; const opts = JSON.parse(process.argv[3] || '{}'); const max = +(process.argv[4] || 1e9);
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p); } })(root);
const numVal = m => { const v = Number(m.replace(/_/g, '')); return Number.isNaN(v) ? m : String(v); };
const norm = s => s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/\b0[xXbBoO][0-9a-fA-F_]+n?\b|\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?\b/g, numVal).replace(/\s+/g, '').replace(/;/g, '');
let n = 0, same = 0, diff = 0, hard = 0, d6 = 0, dr = 0, bytes = 0, t6 = 0, tr = 0; const diffs = [], diagDisagree = [];
for (const f of files.slice(0, max)) {
  const src = fs.readFileSync(f, 'utf8'); bytes += src.length; n++;
  const tsx = /\.tsx$/.test(f); const o = tsx ? { ...opts, jsx: opts.jsx || 1 } : opts;
  let t = performance.now(); const a = ts.transpileModule(src, { compilerOptions: o, fileName: path.basename(f), reportDiagnostics: true }); t6 += performance.now() - t;
  t = performance.now(); let b; try { b = tsrs(path.basename(f), o, src); } catch (e) { hard++; diffs.push([f, 'EXC ' + e.message]); continue; } tr += performance.now() - t;
  if (b.fail) { hard++; diffs.push([f, 'FAIL ' + b.diag[0]]); continue; }
  const e6 = (a.diagnostics || []).filter(d => d.category === 1).length; if (e6) d6++; if (b.diag.length) dr++; if ((e6 > 0) !== (b.diag.length > 0)) diagDisagree.push([f, e6, b.diag.slice(0, 1)]);
  if (norm(a.outputText) === norm(b.js)) same++; else { diff++; diffs.push([f, a.outputText, b.js]); }
}
console.log(`root=${root} opts=${JSON.stringify(opts)} files=${n} (${(bytes / 1e6).toFixed(1)} MB) identical=${same} different=${diff} hard-fail=${hard}`);
console.log(`ts6 syntax-error files=${d6} tsrs=${dr} disagree=${diagDisagree.length}; time ts6=${(t6 / 1000).toFixed(1)}s tsrs=${(tr / 1000).toFixed(1)}s`);
for (const d of diagDisagree.slice(0, 3)) console.log('DIAG DISAGREE', d[0], d[1], d[2]);
fs.writeFileSync(process.env.OUT || 'corpus-diffs.json', JSON.stringify(diffs.map(d => d.length === 2 ? d : [d[0], d[1].slice(0, 20000), d[2].slice(0, 20000)])));
const cats = new Map();
for (const d of diffs) { if (d.length === 2) continue; const A = norm(d[1]), B = norm(d[2]); let i = 0; while (i < A.length && A[i] === B[i]) i++; const key = A.slice(Math.max(0, i - 20), i + 30) + '   <ts6 | tsrs>   ' + B.slice(Math.max(0, i - 20), i + 30); const c = cats.get(key) || { n: 0, ex: d[0] }; c.n++; cats.set(key, c); }
console.log('distinct first-difference signatures:', cats.size);
for (const [k, c] of [...cats].sort((x, y) => y[1].n - x[1].n).slice(0, 12)) console.log(String(c.n).padStart(5), k.slice(0, 200), '\n      e.g.', c.ex);
for (const d of []) { if (d.length === 2) { console.log('--', d[0], d[1]); continue; } const A = d[1].split('\n'), B = d[2].split('\n'); let i = 0; while (i < A.length && A[i] === B[i]) i++; console.log('--', d[0], '\n ts6 :', A.slice(i, i + 2).join(' | ').slice(0, 220), '\n tsrs:', B.slice(i, i + 2).join(' | ').slice(0, 220)); }
