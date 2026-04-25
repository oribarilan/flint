# pulse-scheduler

## Context

The core background polling scheduler. Runs on an adaptive schedule (tighter during work hours, looser off-hours), with user-configurable frequency. Handles power management and overlay focus freeze.

**Value delivered**: Background intelligence runs automatically. The attention panel populates without user interaction.

## Related Files

- `src/main/pulse/scheduler.ts` — new module
- `src/main/copilot/sessions.ts` — calls `sendMonitorPoll` (interface defined in monitor-session task)
- `src/main/index.ts` — wire PulseScheduler into startup
- `src/main/types.ts` — `FlintConfig` (reads pollEnabled, pollFrequency)

## Dependencies

- `refactor-main-wiring.md` (needs CopilotManager/SessionManager wired)
- `config-background-agent.md` (needs pollEnabled/pollFrequency/pollModel in config)
- `monitor-session.md` (needs sendMonitorPoll signature and prompt builders)

## Acceptance Criteria

- [ ] `createPulseScheduler()` factory returns `PulseScheduler` interface (`start`, `stop`, `pollNow`)
- [ ] `start()` fires bootstrap poll immediately (no lastPollTime)
- [ ] Subsequent polls pass lastPollTime and serialized current items to `sendMonitorPoll`
- [ ] Interval adapts: work hours (9-17 weekdays) use base interval, off-hours use 3× multiplier
- [ ] Interval respects `pollFrequency` config: relaxed=20min, normal=10min, aggressive=5min
- [ ] `pollEnabled: false` prevents all polling
- [ ] `pollNow()` triggers immediate poll regardless of schedule
- [ ] `stop()` clears all timers
- [ ] On `powerMonitor.resume`: `pollNow()` fires
- [ ] On overlay focus: polling pauses. On blur: resumes. Deferred poll fires immediately on blur.
- [ ] On CopilotManager `disconnected`: polls skip. On reconnection: `pollNow()`
- [ ] Poll failure: items unchanged, logged, next poll scheduled normally
- [ ] 3 consecutive failures: warning logged
- [ ] `just check` passes

## Verification

- **Automated**: Unit tests for interval calculation, frequency mapping, focus freeze logic, power management, failure handling
- **Ad-hoc**: `just check` passes; observe polling in dev mode console logs
