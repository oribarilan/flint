# Sprint01-3: Agent Settings Controls (Repo Path + Status + Restart)

## Summary

To make second-brain chat usable for new users, Agent Settings must expose repo path configuration and operational controls. Backend capabilities already exist; this task focuses on a keyboard-friendly, backend-authoritative Settings UI that reflects actual runtime state and allows safe restart.

## Requirements

- Implement controls aligned with `spec.md` Agent Settings expectations.
- UI must consume backend-reported state (no config-fallback drift).
- Keep interactions accessible and keyboard-first.

## Implementation

### Scope

1. Add repo path display/edit flow in `AgentSettings`.
2. Add connection status indicator wired to live backend state.
3. Add explicit "Restart OpenCode" action with progress/error feedback.
4. Ensure persisted settings round-trip correctly.

### Proposed Changes

- **Repo path controls**
  - In `src/components/settings/AgentSettings.tsx`, add path input + choose-folder action (per existing Tauri capabilities/utilities).
  - Validate non-empty path and show contextual errors.

- **Status + restart**
  - Surface current connection status and last error state.
  - Wire restart button to existing backend init/restart command path (`init_opencode` and related command wrappers).
  - **Audit note — no separate `restart_opencode` command exists or should be created.** `commands.rs:202` already calls `shutdown()` then `init()`. The restart button should invoke `initOpencode` directly via `src/lib/commands.ts`. `AgentSettings.tsx` already calls `initOpencode` on mount; the restart button reuses that same path.
  - Disable restart during in-flight operation to avoid race conditions.
  - Ensure status refresh points are explicit: on mount, after restart completion, and after repo path update.

- **Default model section behavior**
  - `AgentSettings.tsx` currently hides the model section when `models.length === 0`.
  - Show an explicit empty/unavailable state instead of hiding the section, so Settings remains backend-authoritative and understandable while disconnected.

- **State authority**
  - Ensure all displayed values (enabled/status/current path) come from backend responses where available.

### Related Files

- `src/components/settings/AgentSettings.tsx`
- `src/lib/commands.ts`
- `src/stores/settingsStore.ts` (if needed — **audit note:** this file does not currently exist; settings state is prop-drilled from `Settings.tsx` via `getConfig`/`updateConfig` IPC. Do not create a `settingsStore.ts` unless the new controls genuinely require cross-cutting state that cannot be held locally in `AgentSettings.tsx`.)
- `src-tauri/src/commands.rs` (only if command surface adjustment needed)
- `spec.md` (Agent settings section)

## Acceptance Criteria

- [ ] User can view and update second-brain repo path in Settings.
- [ ] Connection status is derived from backend responses and refreshed on mount, post-restart, and post-path-change.
- [ ] Restart action works, shows in-flight state, and handles failures gracefully.
- [ ] Default model area remains visible with clear empty/unavailable state when models cannot be fetched.
- [ ] Keyboard navigation and focus order are correct for added controls.
- [ ] Tests cover success and failure UI states.

## Verification

- Frontend component tests for settings controls and restart behavior.
- Optional focused simulator test for settings interaction if harness already supports it.
- Run: `just test-frontend`

## Risks

- Path picker behavior differences across OSs.
- State races between status polling and restart completion.
- Repo path change during active stream can leave stale streaming indicators unless stream is aborted/reset before restart.

## Out of Scope

- New auth/provider onboarding flows beyond OpenCode lifecycle controls.
- Broad settings redesign unrelated to agent controls.
