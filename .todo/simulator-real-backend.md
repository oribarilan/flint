# Simulator: Use Real OpenCode Backend in Dev Mode

## Summary

The simulator currently mocks all Tauri IPC calls including OpenCode API interactions. In dev mode, it should proxy chat/provider/model commands to a real running OpenCode server over HTTP, only mocking Tauri-specific platform APIs (window management, file dialogs, global shortcuts). Test mode keeps full mocks for deterministic automation.

## Requirements

1. **Two simulator modes**:
   - `npm run sim` (dev) — real OpenCode backend, mocked platform APIs only
   - `npm run sim:test` — full mocks for E2E automation (current behavior)

2. **Dev mode proxies these to real OpenCode HTTP API**:
   - `send_chat_message` → `POST /session/{id}/message`
   - `get_chat_status` → derived from OpenCode health + session state
   - `get_available_models` → `GET /config/providers`
   - `get_provider_auth` → `GET /provider`
   - `start_provider_auth` → `POST /provider/{id}/oauth/authorize`
   - `init_opencode` → start OpenCode server process (or connect to existing)
   - `abort_chat` → `POST /session/{id}/abort`
   - `clear_chat` → `POST /session` (new session)
   - SSE events → `GET /global/event` bridged to the Tauri event system mock

3. **Dev mode still mocks these (Tauri platform APIs)**:
   - Window commands (hide, show, toggle, open_settings)
   - File operations (open_file, reveal_in_file_manager, delete_to_trash)
   - Search (search_all, search_files) — these use macOS Spotlight
   - App icons
   - Dialog plugin (directory picker)
   - Kit manifests

4. **Configuration**: Dev mode needs to know the OpenCode server URL (default `http://localhost:4096`) and optionally auto-start it.

## Implementation

### Phase 1: Split mock-tauri.ts
- Extract platform mocks into `simulator/mock-platform.ts`
- Extract OpenCode mocks into `simulator/mock-opencode.ts`
- Create `simulator/opencode-proxy.ts` that calls real HTTP API
- `mock-tauri.ts` becomes a router that delegates to platform mocks + either real proxy or mock based on mode

### Phase 2: SSE bridge
- In dev mode, connect to `GET /global/event` SSE stream
- Map OpenCode events to the Tauri event mock system (same as `events.rs` does)
- This enables real streaming chat responses in the browser

### Phase 3: Vite config
- `vite.config.simulator.ts` — add env variable `FLINT_SIM_MODE=dev|test`
- Dev mode: `npm run sim` sets `FLINT_SIM_MODE=dev`
- Test mode: `npm run sim:test` sets `FLINT_SIM_MODE=test`
- Playwright config uses `sim:test`

## Notes

- The `@opencode-ai/sdk` npm package could be used directly in the browser proxy
- The OpenCode server needs `--cors http://localhost:3000` flag for browser access
- Session management (create, reuse) needs to be handled in the proxy layer
