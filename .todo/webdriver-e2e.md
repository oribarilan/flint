# WebDriver E2E Smoke Tests

## Summary

Set up automated E2E smoke tests using `tauri-driver` and WebdriverIO to test critical paths: app launch, search, settings window, and mode switching.

## Context

Flint is a Tauri v2 app. Tauri provides `tauri-driver` (cargo-installable) which acts as a WebDriver server, allowing tools like WebdriverIO to automate the app.

## Platform Requirements

- **macOS**: WKWebView has no native WebDriver support. Requires either:
  - `@crabnebula/tauri-driver` (npm package) — commercial, simplest
  - `tauri-plugin-webdriver-automation` (crate) — open source, adds a WebDriver endpoint to the app
  - See: https://docs.crabnebula.dev/plugins/tauri-e2e-tests/
- **Linux**: Needs `webkit2gtk-driver` (apt/dnf installable). `tauri-driver` works natively.
- **Windows**: Needs `msedgedriver.exe` in PATH. `tauri-driver` works natively.

## Proposed Test Cases

1. **App launches** — binary starts, main window is created
2. **Search works** — type in search bar, results appear
3. **Mode switching** — Tab toggles between search and chat mode (visual indicator changes)
4. **Settings opens** — tray menu "Settings..." opens settings window
5. **Settings auth section** — Settings window shows "Sign in with GitHub" when not authenticated

## Setup

```bash
# Install tauri-driver
cargo install tauri-driver

# Install WebdriverIO
npm install --save-dev @wdio/cli webdriverio @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter

# Build debug binary
cargo build --manifest-path src-tauri/Cargo.toml
```

## Config (wdio.conf.ts)

```typescript
export const config = {
  runner: 'local',
  specs: ['./tests/e2e/**/*.spec.ts'],
  framework: 'mocha',
  reporters: ['spec'],
  capabilities: [{
    'tauri:options': {
      binary: './src-tauri/target/debug/flint',
    },
  }],
  port: 4444,
  logLevel: 'info',
  mochaOpts: { timeout: 60000 },
};
```

## justfile recipe

```just
test-e2e:
    cargo build --manifest-path src-tauri/Cargo.toml
    npx wdio run wdio.conf.ts
```

## Notes

- Start with Linux CI (easiest platform for WebDriver)
- macOS local dev: defer until CrabNebula plugin is evaluated
- Use `data-testid` attributes on key UI elements for stable selectors
- Debug builds are required (release builds may strip automation hooks)
