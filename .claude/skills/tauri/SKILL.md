---
name: tauri
description: "Tauri v2 framework reference for building cross-platform desktop apps. Use when working with IPC commands, capabilities, plugins, window management, distribution, or Tauri-specific debugging."
---

# Tauri v2 Reference

## Architecture

Tauri uses a **multi-process** model:

- **Core Process** (Rust): Manages windows, system tray, IPC routing, plugins, and has full OS access. One per app.
- **WebView Process** (system WebView): Renders UI. No direct OS access — must go through IPC.
- **No bundled browser**: Uses OS-native WebViews (Edge WebView2 / WKWebView / webkitgtk).

All sensitive operations live in the Core Process. The WebView is treated as untrusted.

## IPC Patterns

### Commands (Request → Response)

Frontend calls Rust via `invoke()`. Always async, always validated on the Rust side.

```rust
use tauri::command;

#[command]
async fn search_files(query: String, limit: u32) -> Result<Vec<SearchResult>, String> {
    // Validation happens here, at the IPC boundary
    if query.is_empty() {
        return Err("Query cannot be empty".into());
    }
    // ...
}

// Register in builder
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![search_files])
```

```typescript
import { invoke } from '@tauri-apps/api/core';

const results = await invoke<SearchResult[]>('search_files', { query: 'foo', limit: 50 });
```

### Events (Fire-and-Forget)

Bidirectional, one-way messages. Use for push notifications, progress updates, state broadcasts.

```rust
use tauri::Emitter;

// Core → WebView (all windows)
app.emit("index-progress", IndexProgress { done: 42, total: 100 })?;

// Core → specific window
window.emit("search-results", results)?;
```

```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<IndexProgress>('index-progress', (event) => {
    console.log(`${event.payload.done}/${event.payload.total}`);
});

// Clean up when done
unlisten();
```

### Channels (Streaming)

For high-throughput data from Rust to frontend (e.g., streaming search results, SSE relay):

```rust
use tauri::ipc::Channel;

#[command]
async fn stream_results(query: String, on_result: Channel<SearchResult>) -> Result<(), String> {
    for result in search(&query) {
        on_result.send(result).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

```typescript
import { invoke, Channel } from '@tauri-apps/api/core';

const channel = new Channel<SearchResult>();
channel.onmessage = (result) => {
    addToResultsList(result);
};
await invoke('stream_results', { query: 'foo', onResult: channel });
```

### Async vs Sync Commands

```rust
// GOOD: Async — runs on tokio threadpool, never blocks main thread
#[command]
async fn read_config() -> Result<Config, String> {
    tokio::fs::read_to_string("config.json").await.map_err(|e| e.to_string())?;
    // ...
}

// BAD: Sync — blocks the main thread, freezes the UI
#[command]
fn read_config() -> Result<Config, String> {
    std::fs::read_to_string("config.json").map_err(|e| e.to_string())?;
    // ...
}
```

**Rule:** All commands that do I/O, network, or computation must be `async`.

## Capabilities & Permissions

Tauri v2 uses a **capability-based security model**. Each window gets an explicit set of permissions.

### Capability File Structure

```
src-tauri/capabilities/
├── default.json      # Main window permissions
└── settings.json     # Settings window permissions (if separate)
```

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissions for the main overlay window",
  "windows": ["main"],
  "permissions": [
    "core:event:default",
    "core:window:default",
    {
      "identifier": "fs:read-files",
      "allow": ["$APPDATA/*", "$RESOURCE/*"]
    },
    {
      "identifier": "fs:write-files",
      "allow": ["$APPDATA/*"]
    }
  ]
}
```

### Key Rules

- **Least privilege**: Only grant permissions each window actually needs.
- **Scope filesystem access** to specific directories — never grant `fs:default` or `fs:scope-home`.
- **Shell execution** is disabled by default. If needed, use a strict allowlist:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [{ "name": "git", "cmd": "git", "args": ["status"] }]
}
```

- **Separate capabilities per window** when windows have different trust levels (e.g., main overlay vs settings).

### Common Permission Identifiers

| Plugin | Read | Write | Full |
|--------|------|-------|------|
| `fs` | `fs:read-files` | `fs:write-files` | `fs:default` (avoid) |
| `shell` | — | — | `shell:allow-execute` (avoid) |
| `notification` | — | `notification:default` | — |
| `global-shortcut` | — | `global-shortcut:default` | — |
| `dialog` | `dialog:allow-open` | `dialog:allow-save` | `dialog:default` |

## Content Security Policy

Configured in `tauri.conf.json`. Tauri auto-injects nonces for scripts in dev mode.

```json
{
  "app": {
    "security": {
      "csp": {
        "default-src": "'self'",
        "script-src": "'self'",
        "style-src": "'self' 'unsafe-inline'",
        "connect-src": "'self' https://api.github.com https://api.githubcopilot.com",
        "img-src": "'self' asset: https://avatars.githubusercontent.com",
        "object-src": "'none'",
        "frame-ancestors": "'none'"
      },
      "freezePrototype": true
    }
  }
}
```

- **`freezePrototype: true`** — prevents prototype pollution attacks. Always enable.
- **Never use `unsafe-eval`** — blocks `eval()` and `new Function()`.
- **`connect-src`** — whitelist only domains you actually call.
- **`style-src 'unsafe-inline'`** — often needed for CSS-in-JS or dynamic styles. Acceptable tradeoff.

## State Management (Rust Side)

### Managed State

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

struct AppState {
    index: Arc<RwLock<SearchIndex>>,
    config: Arc<RwLock<AppConfig>>,
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            index: Arc::new(RwLock::new(SearchIndex::new())),
            config: Arc::new(RwLock::new(AppConfig::default())),
        })
        .invoke_handler(tauri::generate_handler![search])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}

#[command]
async fn search(query: String, state: tauri::State<'_, AppState>) -> Result<Vec<Hit>, String> {
    let index = state.index.read().await;
    index.search(&query).map_err(|e| e.to_string())
}
```

### Access Patterns

| Pattern | When |
|---------|------|
| `Arc<RwLock<T>>` | Shared mutable state (most common) |
| `Arc<Mutex<T>>` | Short critical sections, no async holding |
| `Arc<T>` (immutable) | Read-only config loaded at startup |
| `State<'_, T>` directly | Small, `Clone`-cheap data |

**Never clone large state per-command.** Use `Arc` for cheap reference sharing.

## Window Management

### Creating and Reusing Windows

```rust
use tauri::Manager;

fn show_settings(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    // Reuse existing window if possible
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        window.set_focus()?;
    } else {
        tauri::WebviewWindowBuilder::new(app, "settings", tauri::WebviewUrl::App("/settings".into()))
            .title("Settings")
            .inner_size(600.0, 400.0)
            .build()?;
    }
    Ok(())
}
```

### Window Lifecycle Cleanup

```rust
app.on_window_event(|window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        cleanup_window_resources(window.label());
    }
});
```

### Overlay Window Properties

For overlay/launcher-style windows (like Flint):

```json
{
  "windows": [
    {
      "label": "main",
      "title": "Flint",
      "decorations": false,
      "transparent": true,
      "alwaysOnTop": true,
      "visible": false,
      "skipTaskbar": true,
      "width": 680,
      "height": 480
    }
  ]
}
```

## Plugin System

### Using Official Plugins

```toml
# Cargo.toml
[dependencies]
tauri-plugin-global-shortcut = "2"
tauri-plugin-shell = "2"
tauri-plugin-notification = "2"
```

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error");
}
```

Register corresponding permissions in capabilities:

```json
{
  "permissions": [
    "global-shortcut:default",
    "shell:allow-open",
    "notification:default"
  ]
}
```

### Plugin Lifecycle

Plugins can hook into app lifecycle events:

```rust
use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("my-plugin")
        .setup(|app, _api| {
            // Initialize on app start
            Ok(())
        })
        .on_event(|_app, event| {
            // Handle app events
        })
        .build()
}
```

## Auto-Updater

```rust
use tauri_plugin_updater::UpdaterExt;

pub fn check_for_updates(app: &tauri::AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let updater = handle.updater_builder()
            .endpoints(vec!["https://releases.example.com/{{target}}/{{current_version}}".into()])
            .pubkey("YOUR_ED25519_PUBLIC_KEY")
            .build()
            .expect("failed to build updater");

        match updater.check().await {
            Ok(Some(update)) => {
                let _ = update.download_and_install(|_, _| {}, || {}).await;
            }
            Ok(None) => { /* up to date */ }
            Err(e) => tracing::warn!("Update check failed: {e}"),
        }
    });
}
```

- **Always sign updates** with Ed25519 keys. Never ship unsigned updates.
- **Never expose `TAURI_SIGNING_PRIVATE_KEY`** to the frontend. Keep it in CI secrets only.
- Check updates in background, never block the overlay ready path.

## Debugging

### VS Code Setup

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Tauri Dev Debug",
      "cargo": {
        "args": ["build", "--manifest-path=./src-tauri/Cargo.toml", "--no-default-features"]
      },
      "preLaunchTask": "ui:dev"
    }
  ]
}
```

Requires the `vscode-lldb` (CodeLLDB) extension.

### Rust Backtraces

```bash
RUST_BACKTRACE=1 cargo tauri dev          # Stack traces
RUST_BACKTRACE=full cargo tauri dev       # With source locations
```

### WebView DevTools

```rust
use tauri::Manager;

// Open programmatically (dev/debug builds only)
window.open_devtools();
window.close_devtools();
```

**Warning:** DevTools API is private on macOS. Using it in production prevents App Store acceptance.

### Debug Build

```bash
cargo tauri build --debug
```

Produces an unoptimized build with debug symbols. Useful for profiling and inspecting crashes.

## Distribution

### Platform Packaging

| Platform | Format | WebView |
|----------|--------|---------|
| Windows | `.msi`, `.exe` (NSIS) | Edge WebView2 (auto-installed on Win 11) |
| macOS | `.dmg`, `.app` | WKWebView (native) |
| Linux | `.deb`, `.rpm`, `.AppImage` | webkitgtk (must be installed) |

### Code Signing

**Windows:**
- OV certificates build SmartScreen reputation over time. EV certificates get immediate trust.
- Azure Key Vault or local certificate:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.comodoca.com"
    }
  }
}
```

**macOS:**
- Requires Apple Developer certificate.
- Notarization required for distribution outside the App Store.

### GitHub Actions Release

```yaml
name: release
on:
  push:
    tags: ['app-v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: macos-latest
            target: aarch64-apple-darwin
          - platform: macos-latest
            target: x86_64-apple-darwin
          - platform: ubuntu-22.04
            target: x86_64-unknown-linux-gnu
          - platform: windows-latest
            target: x86_64-pc-windows-msvc
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          tagName: app-v__VERSION__
          releaseName: 'v__VERSION__'
```

## Known Vulnerabilities

Keep Tauri and Rust updated. These are the significant CVEs to be aware of:

| CVE | Severity | Impact | Fix |
|-----|----------|--------|-----|
| CVE-2024-35222 | HIGH | iFrames bypass origin checks | Tauri ≥ 1.6.7 or ≥ 2.0.0-beta.20 |
| CVE-2024-24576 | CRITICAL | Command injection via Rust `Command` on Windows | Rust ≥ 1.77.2 |
| CVE-2023-46115 | MEDIUM | Updater private keys leaked via Vite `envPrefix` | Remove `TAURI_` from envPrefix |
| CVE-2023-34460 | MEDIUM | Filesystem scope bypass via symlinks | Tauri ≥ 1.4.1 |
| CVE-2022-46171 | HIGH | Overly permissive glob patterns in fs scope | Use explicit path allowlists |

### Critical: Vite envPrefix

```typescript
// DANGEROUS — leaks TAURI_SIGNING_PRIVATE_KEY to frontend bundle
export default defineConfig({ envPrefix: ['VITE_', 'TAURI_'] });

// SAFE — only VITE_ variables reach the frontend
export default defineConfig({ envPrefix: ['VITE_'] });
```

## Anti-Patterns

### Overly Permissive Capabilities

```json
// NEVER — grants access to entire filesystem
{ "permissions": ["fs:default", "fs:scope-home"] }

// ALWAYS — scope to specific directories
{
  "permissions": [{
    "identifier": "fs:read-files",
    "allow": ["$APPDATA/myapp/*"]
  }]
}
```

### Disabled CSP

```json
// NEVER
{ "security": { "csp": null } }

// ALWAYS — at minimum
{ "security": { "csp": "default-src 'self'; script-src 'self'" } }
```

### Unvalidated IPC Input

```rust
// NEVER — direct use of user input
#[command]
fn read_file(path: String) -> String {
    std::fs::read_to_string(path).unwrap()
}

// ALWAYS — validate, scope, return Result
#[command]
async fn read_file(path: String, app: AppHandle) -> Result<String, AppError> {
    let app_dir = app.path().app_data_dir().map_err(AppError::from)?;
    let full_path = app_dir.join(&path);
    let canonical = dunce::canonicalize(&full_path).map_err(|_| AppError::InvalidPath)?;

    if !canonical.starts_with(&app_dir) {
        return Err(AppError::PathTraversal);
    }

    tokio::fs::read_to_string(canonical).await.map_err(AppError::from)
}
```

### Blocking Sync Commands

```rust
// NEVER — blocks main thread
#[command]
fn heavy_search(query: String) -> Vec<Result> {
    expensive_computation(&query)
}

// ALWAYS — async
#[command]
async fn heavy_search(query: String) -> Result<Vec<Result>, String> {
    tokio::task::spawn_blocking(move || expensive_computation(&query))
        .await
        .map_err(|e| e.to_string())
}
```

### Leaking Internals in Errors

```rust
// NEVER — exposes stack traces and internal paths to WebView
#[command]
fn get_data() -> Result<Data, String> {
    load_data().map_err(|e| format!("{:?}", e))  // Debug format leaks internals
}

// ALWAYS — user-facing message, log the details server-side
#[command]
fn get_data() -> Result<Data, AppError> {
    load_data().map_err(|e| {
        tracing::error!("Failed to load data: {:?}", e);
        AppError::Internal
    })
}
```

## Configuration Reference

### tauri.conf.json Key Sections

```
{
  "productName": "...",
  "version": "...",
  "identifier": "com.example.app",
  "build": {
    "frontendDist": "../dist",       // Built frontend assets
    "devUrl": "http://localhost:1420", // Vite dev server
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [...],                // Window definitions
    "security": {
      "csp": {...},                  // Content Security Policy
      "freezePrototype": true        // Prototype pollution protection
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",                // Or ["msi", "dmg", "deb"]
    "icon": [...]
  }
}
```

## Platform-Specific Notes

| | Windows | macOS | Linux |
|---|---|---|---|
| **WebView** | Edge WebView2 | WKWebView | webkitgtk |
| **WebView install** | Auto (Win 11), bootstrapper (Win 10) | Native | Package manager |
| **DevTools** | Supported | Private API (no App Store) | Supported |
| **Code signing** | OV/EV certificate | Apple Developer cert | Optional GPG |
| **Package formats** | `.msi`, `.exe` (NSIS) | `.dmg`, `.app` | `.deb`, `.rpm`, `.AppImage` |
| **Known issues** | WebView2 version fragmentation | — | webkitgtk version differences |
