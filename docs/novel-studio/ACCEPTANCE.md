# Acceptance

Statuses: PASS / FAIL / BLOCKED / NOT_RUN. All original V1 scenarios retained.

| Scenario | Required evidence | State |
|---|---|---|
| A persistence, version and save failure | unit/integration/restart/browser | NOT_RUN |
| B dual-mode new-version inheritance | deterministic E2E + real model + browser | NOT_RUN |
| C late call after takeover | runtime.test C + guards cancel-late; Writer takeover operated in browser | PASS |
| D future-plan separation | context.test + guards state-refresh excludes old plans | PASS |
| E sourced key conflict, recall/retrieval exception | review.test exact quotes and exceptions pass; UI localization remains in K | PASS |
| F finite chapter/call/token/length, sequential state | runner and real model | NOT_RUN |
| G pause/restart/resume/idempotence | disk-backed integration | NOT_RUN |
| H timeout/JSON/save/budget/partial/cancel-late | runtime, domain transaction failure, guards receipts/cancel/draft recovery, save-failure.png | PASS |
| I rollback and future replan impacts/locks | domain + guards atomic rejection, sourced supersession and rollback pass; UI replan undo pending | NOT_RUN |
| J raw import/export/full backup/restore | domain + HTTP tests pass; browser file operations pending | NOT_RUN |
| K both modes, graph/forms/Diff/takeover/errors/responsive | actual browser/screenshots | NOT_RUN |
| L large context/locks/ranges/stale summaries | context.test 1M+ chars, scoped pack, mandatory overflow and stale summary rejection | PASS |

## Validation categories

1. Unit tests: PASS, context/review tests (7), 2026-09-13.
2. Integration tests: PASS, domain/runtime/guards tests (21), 2026-09-13. Actual safe-boundary multi-chapter pause/restart test still to add for G.
3. Deterministic provider HTTP E2E: PASS (1). Full suite 29 PASS; deterministic results never substitute for real-model validation.
4. Real configured model smoke: FAIL / IN PROGRESS. DSH connected, bootstrap and first chapter accepted. Initial schema and token-limit failures retained in evidence/real-smoke-initial-failure.json and cumulative real-smoke.json. Author state refresh scope was fixed; current continuation tests chapter 2 and 4000-word batch. Do not claim B/F pass yet.
5. Browser: partial. Real in-app browser operated library, Director bootstrap and chapter 1, Writer takeover and body edit, save failure during an actual local server outage, recovery/retry/reload, Director chapter 2 and Context Trace, character tree/form editing. Evidence screenshots in evidence/. Narrow viewport, graph/world forms, Diff/partial adoption, imports/backup and DSH page checks still pending.

Baseline: preexisting DSH typecheck and recursive tests PASS; it uses 0.1.1-rc.2 dependencies, separate from installed CLI 0.1.5-rc.1. No baseline tests existed in empty novel directory. The separate DSH checkout's dirty files were untouched.
