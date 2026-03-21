# Sprint03-4: CI Diagnostics and Runtime Observability Hardening

## Summary

CI now has a focused simulator regression job with runtime budget guardrails, but triage context is fragmented across ad-hoc logs and draft PR comments. This ticket consolidates diagnostics guidance and adds durable observability notes for future sprints.

## Requirements

- Document a standard CI triage flow for failed matrix jobs.
- Record where runtime evidence for focused jobs should be logged.
- Ensure failure artifacts/log retrieval commands are captured in one place.
- Keep documentation concise and operational.

## Acceptance Criteria

- [x] CI troubleshooting section exists in project docs or `.todo/ci.md` with concrete commands.
- [x] Runtime evidence logging pattern is documented for focused jobs (e.g., `sprint01-chat-e2e`).
- [x] Future sprint planners can identify failure source + repro commands in <5 minutes.

## Suggested Commands to Document

```bash
gh run list --workflow "Check" --limit 10
gh run view <run-id> --json jobs,status,conclusion
gh run view <run-id> --job <job-id> --log-failed
```

## Progress / Notes

- 2026-03-21: Added `## CI Triage & Runtime Observability` section to `CONTRIBUTE.md` with:
  - run listing command (`gh run list --workflow "Check" --limit 10`)
  - job/status introspection command (`gh run view <run-id> --json jobs,status,conclusion,url`)
  - failure-log retrieval command (`gh run view <run-id> --log-failed`)
  - local repro commands for both matrix `check` and focused simulator regression job
  - runtime evidence recording convention (run URL, job URL, duration, budget PASS/FAIL)
  - explicit budget reminder (`<= 8 minutes` for focused `sprint01-chat-e2e` on ubuntu-latest)
- Also documented Node runtime migration posture in the same section so CI triage includes policy context.
