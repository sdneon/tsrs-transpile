@echo off
rem Builds tsrs_wasm (with the tsrs-transpile patch applied) for wasm32-wasip1.
rem Usage:  build.cmd [path-to-patched-tsrs-checkout]      (default: current directory)
rem Needs: Rust per the checkout's rust-toolchain.toml with the wasm32-wasip1 target (rustup target add wasm32-wasip1).
rem Output: <checkout>\target\wasm32-wasip1\release\tsrs_wasm.wasm - then run tools\wasm-opt.cjs on it.
rem Build paths (checkout, cargo registry, home dir) are remapped (the most specific rule is listed last and wins) so no machine-specific path ends up inside the .wasm.
rem Paths containing spaces are not supported by the RUSTFLAGS below.
setlocal
if not "%~1"=="" cd /d "%~1"
if not exist Cargo.toml (echo Run from, or pass, a patched tsrs checkout & exit /b 1)
if "%CARGO_HOME%"=="" set "CARGO_HOME=%USERPROFILE%\.cargo"
set "CARGO_PROFILE_RELEASE_OPT_LEVEL=s"
set "CARGO_PROFILE_RELEASE_LTO=fat"
set "CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1"
set "CARGO_PROFILE_RELEASE_PANIC=abort"
set "CARGO_PROFILE_RELEASE_DEBUG=false"
set "CARGO_PROFILE_RELEASE_STRIP=debuginfo"
set "CARGO_TARGET_WASM32_WASIP1_RUSTFLAGS=--remap-path-prefix=%USERPROFILE%=/home --remap-path-prefix=%CARGO_HOME%=/cargo-home --remap-path-prefix=%CARGO_HOME%\registry\src=/cargo --remap-path-prefix=%CD%=/tsrs -C llvm-args=-inlinehint-threshold=150"
cargo build --release -p tsrs_wasm --target wasm32-wasip1
