# surface-connection-status

## Context

The `connection:status` IPC channel is fully wired:
- Main process: `src/main/copilot/client.ts` emits status changes (`connected` | `reconnecting` | `disconnected`) via `onStatusChange`
- Main forwards to renderer: `src/main/index.ts:102-107`
- Preload exposes it: `src/preload/index.ts:39-47` (`onConnectionStatus`)
- Renderer: **does nothing with it**

When Copilot disconnects (network drop, CLI crash, sleep/wake), `PulseScheduler` silently halts polling (`scheduler.ts:86-90`) and the empty attention panel says "No items yet" — indistinguishable from a calm day with no items.

This violates AGENTS.md's "no dead wires" principle and breaks user trust: silent failures are worse than visible ones.

**Value delivered**: Users always know whether Flint is connected. Empty states become informative instead of ambiguous. Or — alternative path — if status visibility isn't worth the UI surface area, delete the channel entirely.

## Related Files

- `src/main/copilot/client.ts:6-83` — `getStatus`, `onStatusChange`
- `src/main/index.ts:102-107` — main → renderer wiring
- `src/preload/index.ts:39-47` — `onConnectionStatus` API
- `src/renderer/src/App.tsx:215-258` — bottom bar (where the indicator should live)
- `src/renderer/src/components/AttentionPanel.tsx:21-31` — empty state (also benefits from connection-aware messaging)

## Dependencies

None.

## Acceptance Criteria

Path A — render it (default):
- [ ] New component `src/renderer/src/components/ConnectionDot.tsx` (small, ~30 LOC) showing a colored dot + tooltip:
  - `connected` → green/accent dot, tooltip "Connected"
  - `reconnecting` → amber dot with subtle pulse, tooltip "Reconnecting…"
  - `disconnected` → red dot, tooltip "Disconnected — check Copilot CLI"
- [ ] Dot lives in the bottom bar, left of the model picker
- [ ] Subscribes to `window.flint.onConnectionStatus`; default state before first event is `reconnecting`
- [ ] Empty `AttentionPanel` state changes copy when not connected: "Not connected to Copilot" instead of "No items yet"
- [ ] Respects `prefers-reduced-motion`: amber dot does NOT pulse if reduced-motion is set
- [ ] All colors via design tokens (`--color-success`, `--color-warning`, `--color-error`)
- [ ] Unit tests in `src/renderer/src/components/__tests__/ConnectionDot.test.tsx` covering all three states
- [ ] Accessible: dot has `role="status"`, `aria-live="polite"`, screen-reader-only text

Path B — delete it (only if Path A is rejected):
- [ ] Remove `connection:status` from `IPC_CHANNELS`
- [ ] Remove `onStatusChange` listener wiring in `src/main/index.ts`
- [ ] Remove `onConnectionStatus` from preload
- [ ] Note in commit message: "explicitly chose not to surface connection status; revisit if user reports silent failures"

## Verification

**Automated (required for Path A):** unit tests above + integration test asserting state transitions are reflected in the rendered dot.

**Ad-hoc:** in dev mode, kill the Copilot CLI process — confirm dot turns red within a few seconds. Restart it — confirm dot returns to green.

## Notes

- Path A is recommended (council unanimous P1).
- The dot should be SMALL (8px). It's a peripheral signal, not a UI element competing for attention.
- Future enhancement (out of scope): clicking the dot when disconnected opens a help dialog with the `copilot auth` reconnection steps. For V1, tooltip + log message is sufficient.
- Consider whether the dot also reflects Work IQ MCP status (separate from Copilot connection) — defer unless trivially testable.
