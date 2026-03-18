# Add Missing Frontend Component & Hook Tests

## Summary

AGENTS.md requires "at least one test per component/hook." Several components and hooks currently lack test files. This task tracks adding baseline test coverage for each.

## Components Without Tests

| Component            | File                                             | Priority | Notes                                                                             |
| -------------------- | ------------------------------------------------ | -------- | --------------------------------------------------------------------------------- |
| `ChatPanel`          | `src/components/ChatPanel.tsx`                   | High     | Complex — agent mode, streaming, tool calls. Mock SSE events + chat store.        |
| `Settings`           | `src/components/Settings.tsx`                    | Medium   | Page routing, config loading, window show. Mock `useConfig` + `getCurrentWindow`. |
| `ResultsList`        | `src/components/ResultsList.tsx`                 | High     | Core search UI — selection, scrolling, action panel trigger. Mock search store.   |
| `ActionPanel`        | `src/components/ActionPanel.tsx`                 | Medium   | Action display + execution. Mock action panel store.                              |
| `ResultMeta`         | `src/components/ResultMeta.tsx`                  | Low      | Simple display component.                                                         |
| `KindIcon`           | `src/components/KindIcon.tsx`                    | Low      | Simple icon mapping.                                                              |
| `GeneralSettings`    | `src/components/settings/GeneralSettings.tsx`    | Medium   | Config form with hotkey recorder.                                                 |
| `KitsSettings`       | `src/components/settings/KitsSettings.tsx`       | Medium   | Kit toggle, command config, restart banner.                                       |
| `HotkeyRecorder`     | `src/components/settings/HotkeyRecorder.tsx`     | Medium   | Keyboard capture, recording state.                                                |
| `AppearanceSettings` | `src/components/settings/AppearanceSettings.tsx` | Low      | Theme selection.                                                                  |

## Hooks Without Tests

| Hook                   | File                                | Priority | Notes                                                               |
| ---------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------- |
| `useCommandActivation` | `src/hooks/useCommandActivation.ts` | High     | Command chip lifecycle — activation, deactivation, query stripping. |
| `useActionPanelDebug`  | `src/hooks/useActionPanelDebug.ts`  | Low      | Debug utility — lower priority.                                     |
| `useAppIcon`           | `src/hooks/useAppIcon.ts`           | Low      | Icon caching hook.                                                  |

## Implementation

1. Start with high-priority items: `ResultsList`, `ChatPanel`, `useCommandActivation`.
2. Each test file should cover: rendering, key interactions, error states.
3. Mock Tauri IPC calls via `vi.mock("@tauri-apps/api/core")`.
4. Mock stores via direct Zustand state manipulation.
5. Follow existing test patterns from `SearchBar.test.tsx`, `HintBar.test.tsx`, `Kbd.test.tsx`.
6. Run `just test-frontend` after each new test file.

## Out of Scope

- E2E tests (covered separately via simulator).
- Coverage threshold enforcement (separate `.todo/test-coverage.md`).
