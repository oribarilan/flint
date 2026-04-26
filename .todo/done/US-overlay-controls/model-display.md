# model-display

## Context

The bottom bar currently shows only a settings gear button. Users have no visibility into which Copilot model is active. This task adds a model indicator to the left side of the bottom bar and builds the IPC + state infrastructure that the model picker (next task) will use.

**Value delivered**: Users see which model is powering their chat. The IPC and store foundation enables model switching.

## Related Files

- `src/renderer/src/App.tsx` — bottom bar `<footer>`
- `src/renderer/src/App.module.css` — bottom bar styles
- `src/main/ipc/channels.ts` — `IPC_CHANNELS`
- `src/main/ipc/handlers.ts` — IPC handler registration
- `src/preload/index.ts` — `contextBridge` API
- `src/renderer/src/lib/ipc.ts` — typed `FlintAPI`
- `src/main/index.ts` — CopilotClient and session creation (model is hardcoded `"gpt-4.1"`)
- `src/renderer/src/stores/modelStore.ts` — new store (to be created)
- `src/renderer/src/styles/global.css` — design tokens

## Dependencies

- None

## Acceptance Criteria

- [ ] `FlintConfig` has a `model` field (default `"gpt-4.1"`), persisted via electron-store
- [ ] Main process reads `model` from config at startup and passes it to `createSession({ model })`
- [ ] Three new IPC channels added to `IPC_CHANNELS`: `model:list`, `model:set`, `model:changed`
- [ ] `window.flint` exposes: `listModels() → Promise<{id, name}[]>`, `setModel(id: string) → void`, `onModelChanged(cb) → unsubscribe`
- [ ] `model:list` handler calls `client.listModels()`, filters out `policy: "disabled"`, returns `{id, name}[]`
- [ ] `model:set` handler calls `session.setModel(id)`, persists to config, sends `model:changed` to renderer. On failure: logs error, does not update config or renderer.
- [ ] New `modelStore` (Zustand): `{ currentModel: string, models: {id, name}[] }` with actions to set each
- [ ] On renderer init, `currentModel` is populated from `window.flint.getConfig()` (reads the `model` field from `FlintConfig`)
- [ ] Bottom bar left side shows: Lucide icon (16px) + model name (`--font-mono`, `--font-xs`, `--text-secondary`) + `ChevronUp` (12px, `--text-tertiary`)
- [ ] The model cluster is a `<button>` with `--bg-hover` on hover, `--radius-sm`, proper `focus-visible` outline, min 44px touch target
- [ ] Bottom bar layout: model indicator left, settings gear right (existing)
- [ ] Unit tests for: IPC handlers (list filters disabled models, set persists and pushes, set error doesn't propagate), modelStore actions, bottom bar renders model name

## Verification

- **Automated**: Unit tests for IPC handlers (mock client/session/config), modelStore, and bottom bar component
- **Ad-hoc**: `just check` passes. Dev mode shows model name in bottom bar. Changing config manually updates display.

## Notes

The bottom bar button click handler should be a no-op in this task (or toggle a state that the picker task will use). The important thing is the button is rendered and wired, and all IPC + store infra is in place.
