# Debug-Mode File-Based Credential Storage

## Problem

During development, `cargo tauri dev` produces an unsigned binary. macOS prompts
"Flint wants to access your keychain" on every keychain read because unsigned
apps cannot silently access keychain items. This happens at least twice per app
launch (reading `github_access_token` and `copilot_token` in
`TokenManager::new()`), and again on every token refresh (~every 25 min).

## Approach

Extract credential storage from `token.rs` into a dedicated `credential_store`
module with two `cfg`-gated backends:

- **Release** (`not(debug_assertions)`): Uses `keyring` crate — current behavior, unchanged.
- **Debug** (`debug_assertions`): Uses file-based storage in `~/.flint/dev-tokens/`
  with `0600` permissions. Zero-friction, fully automatic, no manual setup needed.

This follows Single Responsibility (token lifecycle vs. storage mechanism) and
keeps production code untouched.

## Todos

### 1. Create `credential_store` module
**File:** `src-tauri/src/providers/copilot/credential_store.rs`

- Public API: `load(key) -> Option<String>`, `save(key, value) -> Result<(), String>`, `delete(key)`
- Uses `KEYRING_SERVICE` constant as the service identifier
- **Release path:** Delegates to `keyring::Entry` (existing logic, moved here)
- **Debug path:** Reads/writes files at `~/.flint/dev-tokens/{key}`. Directory
  created on first write. File permissions set to `0600` on Unix via
  `std::os::unix::fs::PermissionsExt`.
- Guard `keyring` import with `#[cfg(not(debug_assertions))]`
- Log which backend is in use on first access (once, via `tracing::info!`)

### 2. Update `token.rs` to use `credential_store`
**File:** `src-tauri/src/providers/copilot/token.rs`

- Replace `load_from_keychain`, `save_to_keychain`, `delete_from_keychain` with
  calls to `credential_store::load`, `credential_store::save`,
  `credential_store::delete`
- Remove direct `keyring` usage from this file
- Rename `TokenError::Keychain` → `TokenError::Storage` (backend-agnostic)

### 3. Register the module
**File:** `src-tauri/src/providers/copilot/mod.rs`

- Add `mod credential_store;`

### 4. Add unit tests
**File:** `src-tauri/src/providers/copilot/credential_store.rs`

- Test file-based `save` → `load` round-trip
- Test `delete` removes the file
- Test `load` returns `None` for non-existent key
- Test file permissions are `0600` on Unix
- Use a temp directory for test isolation

### 5. Verify
- Run `cargo clippy` and `cargo test` to ensure no regressions
- Run `cargo tauri dev` and confirm no keychain prompt appears

## Notes

- `keyring` remains in `Cargo.toml` unconditionally — Cargo doesn't support
  `cfg(debug_assertions)` for deps. The crate compiles in debug but its API is
  gated behind `cfg(not(debug_assertions))` in source.
- File path `~/.flint/dev-tokens/` is outside the project directory and won't
  be committed.
- The debug file store uses plain text files (one per key). These are dev-only
  tokens with restricted permissions — acceptable trade-off vs. the alternative
  of no token persistence in dev.
