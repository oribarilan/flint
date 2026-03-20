# Sprint03-4: CI Diagnostics and Runtime Observability Hardening

## Summary

CI now has a focused simulator regression job with runtime budget guardrails, but triage context is fragmented across ad-hoc logs and draft PR comments. This ticket consolidates diagnostics guidance and adds durable observability notes for future sprints.

## Requirements

- Document a standard CI triage flow for failed matrix jobs.
- Record where runtime evidence for focused jobs should be logged.
- Ensure failure artifacts/log retrieval commands are captured in one place.
- Keep documentation concise and operational.

## Acceptance Criteria

- [ ] CI troubleshooting section exists in project docs or `.todo/ci.md` with concrete commands.
- [ ] Runtime evidence logging pattern is documented for focused jobs (e.g., `sprint01-chat-e2e`).
- [ ] Future sprint planners can identify failure source + repro commands in <5 minutes.

## Suggested Commands to Document

```bash
gh run list --workflow "Check" --limit 10
gh run view <run-id> --json jobs,status,conclusion
gh run view <run-id> --job <job-id> --log-failed
```
