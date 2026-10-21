# tsrs-transpile - TypeScript 7 (tsrs) as a synchronous `transpileModule` for Node.JS+

[tsrs](https://github.com/oxc-project/tsrs) is a Rust port of the TypeScript 7 compiler.[^claims] This experimental project packages a transpile-only WASM build of it for the [Node.JS+ mod](https://github.com/sdneon/node/) (as an alternative to its bundled TypeScript 6).[^why]

Compatibility: output matches TS6.[^match]

Unofficial, unaffiliated with Microsoft or the oxc project. Licence: Apache-2.0 (`LICENSE`).

## Use it with a plain Node.JS+ (no rebuild)
```
node -r ./src_pack/TypeScript.packed.js yourscript.ds        # or: NODE_OPTIONS=--require=<path>/TypeScript.packed.js
```
Replaces `global.transpiler.typescript` for `#ts` blocks and `.ts` files. Syntax errors are warned on stderr.[^errors] First use takes ~70 ms, then ~3 ms per call (bundled TS6: ~1 ms), so expect no speed-up for transpiling. The same file is in Node.JS+'s `src_packs/ts/7.1.0-dev-tsrs-0.18.0/`.

Or TypeScript REPL mode:
```
node -i --repl=ts -r ./src_pack/TypeScript.packed.js
```

## Layout
- `tsrs-transpile.patch`, `build.cmd`, `dist/tsrs_transpile.wasm` - the fork patch, build recipe and built module.
- `src_pack/TypeScript.packed.js` - generated drop-in (`tools/make-pack.cjs`).
- `tools/` - generators and test scripts: `make-pack.cjs` (drop-in pack), `make-splice.cjs` (splices the engine into `loader.js` behind a `TS_ENGINE=tsrs` switch), `make-embed.cjs` (stand-alone preload shim), `wasm-opt.cjs` (optimizer wrapper), and `corpus.cjs` / `transpile-tree.cjs` / `app-drive.js` (TS6-vs-tsrs comparisons; they need `npm i typescript`).

## The patch
Against [tsrs @ `1932525c59ab3d8ab93d117df4b85acb998c1096`](https://github.com/oxc-project/tsrs/commit/1932525c59ab3d8ab93d117df4b85acb998c1096) (v0.18.0, TS 7.1 dev). Adds a `tsrs_transpile` export to the `tsrs_wasm` crate (single-file transpile, no module resolution, syntax diagnostics, source maps) and drops the embedded `lib.*.d.ts`.[^libs]

- `tsrs-transpile.patch` - the whole change (new `crates/tsrs_wasm/src/transpile.rs`, `lib.rs` export, Cargo.toml/lock).
- `dist/tsrs_transpile.wasm` - the built module, already optimized with `wasm-opt`:[^wasmopt] 6.0 MB raw, ~1.62 MB brotli.
- `build.cmd` - release-build recipe; takes the path of the patched tsrs checkout, or run it from there.[^paths]

## Rebuild
1. `git clone https://github.com/oxc-project/tsrs && cd tsrs && git checkout 1932525c && git apply <this>/tsrs-transpile.patch`
2. `rustup toolchain install 1.99.1 -t wasm32-wasip1` (pinned by upstream's `rust-toolchain.toml`)
3. run `build.cmd` from the tsrs checkout (Windows; about 3 min; on other systems see upstream's `tools/wasm/build.sh`). Output: `target/wasm32-wasip1/release/tsrs_wasm.wasm`.
4. `npm i binaryen`, then `node <this>/tools/wasm-opt.cjs target/wasm32-wasip1/release/tsrs_wasm.wasm <this>/dist/tsrs_transpile.wasm` (about 45 s).
5. regenerate the drop-in: `node tools/make-pack.cjs dist/tsrs_transpile.wasm src_pack/TypeScript.packed.js`.

## ABI of `tsrs_transpile`
Uses a new WASM instance per call. `p = tsrs_input(len)`; write `fileName \0 compilerOptionsJson \0 source` (UTF-8) at `p`;[^view] `st = tsrs_transpile()`; reply at `tsrs_output()`/`tsrs_output_len()`.
- `st == 0`: reply = emitted JS.
- `st == 1`: reply = `diag1\ndiag2\0partial emit` (syntax errors, format `line:col TSnnnn: message`) or a plain error message with no NUL (bad options JSON, internal error).

Compiler options are Go-JSON: enums are **numbers** (`target:99` = ESNext, `module:1` = CommonJS, `jsx:1`...).
Source maps: with `sourceMap:true`, read the map JSON from `tsrs_map()`/`tsrs_map_len()` after a status-0 call (empty otherwise); the JS ends with the `//# sourceMappingURL=...` comment like TS6.

[^claims]: Its authors claim lower memory use and faster speed: up to ~8x faster and ~70% less memory than TS 7.0. That is for type-checking whole projects, not for transpiling single files.
[^why]: TS 7.0 ships as a standalone native executable with no JavaScript API (a programmatic API is planned for 7.1). tsrs, on the other hand, offers an embeddable WASM build, which suits Node.JS+ (it transpiles TS synchronously, in-process).
[^match]: Identical to TS6 on 99.2% of the 10,545 files of VS Code's `src` (compared after ignoring whitespace and comments); the rest differ cosmetically, e.g. redundant parentheses.
[^errors]: The code is still emitted; `TSRS_QUIET=1` silences the warning. Spliced into `loader.js` with `tools/make-splice.cjs`, syntax errors instead abort with a `SyntaxError` listing file line numbers.
[^libs]: Via `tsrs_vfs`' existing `noembed` feature, so the 3.8 MB of type declarations (`lib.*.d.ts`), which are only needed for type-checking, are not linked in.
[^wasmopt]: `wasm-opt` (Binaryen) is a separate post-build optimizer, run by `tools/wasm-opt.cjs`; it shrinks the Rust build output from 8.25 MB to 6.0 MB raw. The brotli compression and base64 encoding for embedding into a script (so Node.JS+ can load it without extra files) happen later, in `tools/make-pack.cjs`.
[^paths]: Cargo profile settings are copied from upstream `tools/wasm/build.sh`. Build paths are remapped so no machine-specific path ends up in the `.wasm`.
[^view]: Call `tsrs_input` first, then take a view of the memory: allocating can grow it and detach older views.
