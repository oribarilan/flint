# Flint

A fast, keyboard-driven app launcher with built-in AI chat.

> **Mission:** Replace the default launcher with something that feels instant, stays out of the way, and puts an LLM one keystroke away — without another subscription.

![Flint screenshot](docs/screenshot.png)
<!-- TODO: add actual screenshot -->

## Features

**Tab** toggles between two modes:

- **Search** — fuzzy file and app search powered by [nucleo](https://github.com/helix-editor/nucleo). Type, arrow, Enter to open.
- **Chat** — conversational AI inside the launcher overlay. Bring your own provider — GitHub Copilot is supported today, more coming.

### Platform support

Flint is **macOS-only** for now. Search is built on top of macOS Spotlight — Flint does not build or maintain its own file index but queries the OS-level index that macOS already maintains. This means zero indexing overhead, instant results, and automatic updates as files change.

Windows and Linux support is planned but not yet implemented. See `gaps.md` for details.

| Feature | macOS | Windows | Linux |
|---|:---:|:---:|:---:|
| Overlay (hotkey, borderless, transparent) | ✅ | ✅ | ✅ |
| File & app search (via Spotlight) | ✅ | ❌ | ❌ |
| App icon extraction | ✅ | ❌ | ❌ |
| Focus restoration | ✅ | ❌ | ⚠️ |
| System tray | ✅ | ✅ | ✅ |
| Global hotkey | ✅ | ✅ | ✅ |
| Copilot auth (OAuth device flow) | ✅ | ✅ | ✅ |
| OS keychain token storage | ✅ | ✅ | ✅ |
| AI chat (streaming) | ✅ | ✅ | ✅ |
| Settings window | ✅ | ✅ | ✅ |
| Config file (`~/.config/flint/`) | ✅ | ✅ | ✅ |
| Themes (dark + light) | ✅ | ✅ | ✅ |
| Launch at login | ❌ | ❌ | ❌ |

✅ Supported&ensp; ⚠️ Partial (requires `xdotool`)&ensp; ❌ Not yet implemented

> **Note:** Windows and Linux builds are not yet tested. If you hit issues, please open one.

## Install

No pre-built binaries yet. Build from source:

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) ≥ 18
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Build & run

```bash
git clone https://github.com/AriaBaghworksource/flint.git
cd flint
npm install
# Development (hot reload)
npm run tauri dev
# Production build
npm run tauri build
```

A [justfile](https://just.systems/) is included for common tasks — run `just` to list them.

## Tech

| Layer | Stack |
|---|---|
| Shell | Tauri v2 (Rust) |
| Frontend | React + TypeScript + Vite |
| State | Zustand |
| Search | nucleo |
| AI | GitHub Copilot (BYOK — more providers planned) |

## License

<!-- TODO: choose a license -->