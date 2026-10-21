// usage: node wasm-opt.cjs <in.wasm> <out.wasm>
// Runs Binaryen's wasm-opt (npm package `binaryen`, install it next to where you run this: `npm i binaryen`) with -Os,
// enabling exactly the wasm features rustc recorded in the module's target_features section (as upstream tsrs does).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [inFile, outFile] = process.argv.slice(2);
if (!inFile || !outFile) { console.error('usage: node wasm-opt.cjs <in.wasm> <out.wasm>'); process.exit(2); }
const pkg = require.resolve('binaryen/package.json', { paths: [process.cwd(), __dirname] });
const bin = path.join(path.dirname(pkg), 'bin', 'wasm-opt');
const m = new WebAssembly.Module(fs.readFileSync(inFile));
const sec = WebAssembly.Module.customSections(m, 'target_features')[0];
const feats = [];
if (sec) {
  const b = new Uint8Array(sec); let i = 0;
  const leb = () => { let r = 0, sh = 0, x; do { x = b[i++]; r |= (x & 127) << sh; sh += 7; } while (x & 128); return r; };
  const n = leb();
  for (let k = 0; k < n; k++) {
    const prefix = String.fromCharCode(b[i++]); const len = leb();
    const name = new TextDecoder().decode(b.subarray(i, i + len)); i += len;
    if (prefix === '+') feats.push('--enable-' + (name === 'nontrapping-fptoint' ? 'nontrapping-float-to-int' : name));
  }
}
const r = cp.spawnSync(process.execPath, [bin, ...feats, '-Os', '--strip-debug', '--strip-producers', inFile, '-o', outFile], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log('wrote', outFile, fs.statSync(outFile).size, 'bytes');
