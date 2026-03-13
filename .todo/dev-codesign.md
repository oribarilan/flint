# Dev Binary Code-Signing for Keychain Access

## Problem

During development, `cargo build` produces a new binary on each compile. macOS treats each new binary as a different application for keychain access purposes, causing repeated "Flint wants to use your keychain" permission prompts. This happens because:

- We use the `keyring` crate (v3) to store GitHub and Copilot tokens in the OS keychain
- The keychain service identifier is `sh.oribi.flint` (set in `src-tauri/src/providers/copilot/token.rs`)
- The app identifier is `sh.oribi.flint` (set in `src-tauri/tauri.conf.json`)
- Without code-signing, macOS has no stable identity to remember the "Always Allow" permission

**This is dev-only.** Production builds are signed and bundled as a `.app`, so end users never see repeated prompts.

## Solution

Ad-hoc code-sign the dev binary after each build so macOS sees a consistent identity.

```bash
codesign -s - src-tauri/target/debug/flint
```

The `-s -` flag uses ad-hoc signing (no Apple Developer certificate needed). This gives the binary a stable code identity that macOS can remember for keychain access.

## Implementation

### Option A: Add a `just dev-signed` recipe

```just
# Dev mode with code-signed binary (avoids keychain prompts)
dev-signed:
    cargo build --manifest-path src-tauri/Cargo.toml
    codesign -s - src-tauri/target/debug/flint
    npm run tauri dev
```

### Option B: Add a post-build hook

Add to `justfile`:

```just
# Sign the dev binary (run after cargo build)
sign-dev:
    codesign -s - src-tauri/target/debug/flint
```

Then run `just build-rust && just sign-dev` before `just dev`.

### Option C: Tauri beforeDevCommand hook

In `tauri.conf.json`, the `beforeDevCommand` runs before the app launches. However, this runs the frontend dev server, not the Rust build. Tauri handles the Rust build internally during `cargo tauri dev`, so hooking into the post-build step requires a `build.rs` or a wrapper script.

## Recommended Approach

Option A is simplest. Add a `just dev-signed` recipe. The regular `just dev` still works for when keychain access isn't needed.

## Files to Modify

- `justfile` — add the new recipe
- Optionally `.gitignore` — no changes needed

## Notes

- The `codesign` command is macOS-only. Guard with a platform check if cross-platform justfile is needed.
- The ad-hoc signature is lost on each rebuild, so the signing step must happen after each `cargo build`.
- `cargo tauri dev` does its own `cargo build` internally, so Option A pre-builds then runs dev. This may cause a double-build. A wrapper script that signs after Tauri's internal build would be more efficient but more complex.
