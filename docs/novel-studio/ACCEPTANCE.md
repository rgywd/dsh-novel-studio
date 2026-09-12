# Acceptance

Statuses: PASS / FAIL / BLOCKED / NOT_RUN. All original V1 scenarios retained.

| Scenario | Required evidence | State |
|---|---|---|
| A persistence, version and save failure | unit/integration/restart/browser | NOT_RUN |
| B dual-mode new-version inheritance | deterministic E2E + real model + browser | NOT_RUN |
| C late call after takeover | controlled integration and UI | NOT_RUN |
| D future-plan separation | context tests | NOT_RUN |
| E sourced key conflict, recall/retrieval exception | review tests and UI localization | NOT_RUN |
| F finite chapter/call/token/length, sequential state | runner and real model | NOT_RUN |
| G pause/restart/resume/idempotence | disk-backed integration | NOT_RUN |
| H timeout/JSON/save/budget/partial/cancel-late | injected faults | NOT_RUN |
| I rollback and future replan impacts/locks | integration | NOT_RUN |
| J raw import/export/full backup/restore | integration and browser | NOT_RUN |
| K both modes, graph/forms/Diff/takeover/errors/responsive | actual browser/screenshots | NOT_RUN |
| L large context/locks/ranges/stale summaries | synthetic long-book tests | NOT_RUN |

## Validation categories

1. Unit tests: NOT_RUN.
2. Integration tests: NOT_RUN.
3. Deterministic provider E2E: NOT_RUN, never evidence of real model capability.
4. Real configured model smoke: NOT_RUN, availability unknown. No credential discovery.
5. Browser interaction and visual inspection: NOT_RUN.

Baseline: preexisting DSH typecheck PASS; it uses 0.1.1-rc.2 dependencies, separate from installed CLI 0.1.5-rc.1. No baseline tests existed in empty novel directory.
