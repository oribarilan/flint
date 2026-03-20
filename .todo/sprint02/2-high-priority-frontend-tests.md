# Sprint02-2: High-Priority Frontend Component & Hook Tests

## Summary

This ticket closes high-impact frontend test gaps that currently weaken refactor safety. It prioritizes components and hooks with central interaction logic (results navigation, command activation, action execution, and settings routing). The goal is broad confidence with concise, deterministic unit tests.

## Requirements

- Add/expand tests for high-priority UI and hook surfaces.
- Keep tests deterministic with mocked Tauri IPC boundaries.
- Cover both positive and failure/edge paths.
- Avoid duplicating existing coverage from Sprint 01 chat-focused tests.

## Implementation

### Scope

1. `ResultsList` interaction tests (selection rendering, pointer interactions, action triggers).
2. `ActionPanel` tests (action rendering, invocation wiring, state transitions).
3. `Settings` tests (page routing for current pages: General/Search/Agent/Kits, config load behavior, resilience to load failures).
4. `useCommandActivation` hook tests (event-driven activation + listener cleanup on unmount).

### Proposed Changes

- Add test files:
  - `src/components/__tests__/ResultsList.test.tsx`
  - `src/components/__tests__/ActionPanel.test.tsx`
  - `src/components/__tests__/Settings.test.tsx`
  - `src/hooks/__tests__/useCommandActivation.test.ts`

- Expand existing tests where lower effort than creating new suites.
- Use existing testing patterns from:
  - `SearchBar.test.tsx`
  - `HintBar.test.tsx`
  - `ChatPanel.test.tsx`

### Related Files

- `src/components/ResultsList.tsx`
- `src/components/ActionPanel.tsx`
- `src/components/Settings.tsx`
- `src/components/settings/GeneralSettings.tsx`
- `src/components/settings/SearchSettings.tsx`
- `src/components/settings/KitsSettings.tsx`
- `src/hooks/useCommandActivation.ts`
- `src/stores/searchStore.ts`
- `src/stores/chatStore.ts`
- `src/stores/__tests__/actionPanel.test.ts`

### Current State Notes

- `src/stores/__tests__/actionPanel.test.ts` already covers a substantial portion of Action Panel store behavior.
- Ticket focus should prioritize missing component/hook rendering/wiring behavior and avoid duplicating store-only assertions.

## Acceptance Criteria

- [x] Each high-priority target has baseline tests with clear assertions.
- [x] Tests cover core interaction path + at least one edge/failure path per target.
- [x] Tests pass in isolation and in full frontend suite.
- [x] New tests avoid flakiness (no arbitrary timers unless controlled).

## Task Tracker

- **Status:** Done
- **Owner:** TBD
- **Blocked By:** None
- **Unblocks:** Ticket 3

## Implementation Checklist

- [x] `ResultsList.test.tsx`
  - [x] empty-query empty-state behavior
  - [x] non-empty no-results behavior
  - [x] pointer selection / default action wiring
- [x] `ActionPanel.test.tsx`
  - [x] filtered action rendering
  - [x] destructive action arm/confirm flow
  - [x] non-destructive execute-and-close flow
- [x] `Settings.test.tsx`
  - [x] renders General/Search/Agent/Kits nav and route switching
  - [x] loading state path
  - [x] config load failure resilience path
- [x] `useCommandActivation.test.ts`
  - [x] listens for `command:activate` and calls `activateCommand`
  - [x] unregisters listener on unmount

## Verification

- `just test-frontend`
- Optional focused run(s) for new files in local iteration.

## Verification Commands

```bash
just test-frontend
npm run test -- src/components/__tests__/ResultsList.test.tsx
npm run test -- src/components/__tests__/ActionPanel.test.tsx
npm run test -- src/components/__tests__/Settings.test.tsx
npm run test -- src/hooks/__tests__/useCommandActivation.test.ts
```

## Risks

- Store-heavy components can produce brittle tests if mocked too deeply.
- UI copy changes may cause snapshot/assertion churn; prefer behavior assertions.

## Out of Scope

- Full frontend parity for every component/hook in one sprint.
- New E2E scenarios not directly needed for these unit gaps.
