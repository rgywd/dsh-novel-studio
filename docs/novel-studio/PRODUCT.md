# DSH Novel Studio V1

2026-09-13. Personal, local-first long-form fiction workbench. Writer is author-led editing; Director executes a scoped CreativeTask. Both use exactly one project, body/version store, canon and domain service. Viewing never acquires write control; takeover invalidates old AI dependencies. Accepted is distinct from published.

## Original V1 scope (not optional)

Projects create/open/rename/save/archive; inspiration onboarding and existing-book import; divergent story directions and inspiration Inbox; book/volume/chapter outlines, reorder/move/lock and future replan; real body editor, autosave/error states, count, undo/redo, selection AI, preview/Diff/partial adoption, versions/focus/export; structured characters/groups/relationships/states/history/knowledge/voice; structured world tree/types/properties/relations/sources; timeline with story time vs chapter order, planned vs happened; foreshadowing planting/recovery; sourced canon and disputes; persistent Director tasks for bootstrap/write/batch/review/replan/extract; TXT/Markdown raw-preserving import, exports, full project backup/restore.

Context must be bounded, prioritized, deduplicated, version-aware, inspectable, and preserve locked constraints. Future plans, candidate ideas, working drafts and accepted material remain distinct. Facts carry sources/evidence/version/time/modality; inference is not objective truth. Accept body and derived states atomically and idempotently. Rollback handles facts and downstream validity. No AI last-write-wins.

Director default max 3 chapters, 2 retries per step, 2 repair rounds, task call/output budgets, one shared-state writer per book. QUEUED/RUNNING/PAUSE_REQUESTED/PAUSED/NEEDS_INPUT/FAILED/COMPLETED/CANCELED are durable. Interrupted work resumes from safe checkpoints. Cancellation and late results never bypass acceptance guards. Serious conflicts block acceptance. Auto acceptance has explicit policy/task provenance.

## Acceptance contract

A persistence including restart and honest save errors; B Director chapter 1 → Writer takeover and fact change → redelegate chapter 2 with new version; C stale call protection; D future-plan/canon separation; E sourced contradiction detection with memory/retrieval exceptions; F bounded multi-chapter production, inherited state, real target word counts; G pause/restart/resume without duplicate writes; H timeout/invalid JSON/save failure/budget/partial failure/cancel-late; I derived-state rollback and scoped future replan; J raw-preserving import/export/backup restore; K actual browser use of both modes, graph, forms, Diff, takeover/errors and responsive views; L large-book scoped context, budget/locks/stale summaries. Each is tracked separately in ACCEPTANCE.md. Deterministic models never count as real AI validation.

## Decisions

- Full independent DSH plugin page, not changes to the existing dirty Writing Studio checkout. DSH native model, credentials and tool runtime are reused. No copied reference implementation.
- SQLite native to Node 24: transactions and revisions, no vector/graph database or generic agent framework. CodeMirror 6 reuses the editor technology already present in DSH.
- Chinese word count: each Han character, each Latin word/number counts as one; punctuation/whitespace excluded. Target is a range, never filled by repetition or truncation.
- No publishing, multi-tenancy, payments, complex RBAC, real-time multi-user editing or agent society. Bind local server to loopback; same-origin requests for mutation.

## References and evidence level

- https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant at 24832d5eb0ded8c39cfaab9971af2a57e1827a22 (2026-09-12): README describes Agent/world/context/book production. Read actual checkpoint runtime and DirectorCommandLeaseService; these contain checkpoint persistence and stale lease/manual recovery branches. Not locally executed. LICENSE says AGPL-3.0-only community plus separate commercial authorization; implementation/assets not copied.
- https://maliangwriter.com/features/ and https://maliangwriter.com/docs (read 2026-09-13): official descriptions of layered outline, entity context, writing/review workflow. Marketing claims of eliminating inconsistencies are not treated as verified capability. No authenticated demo execution or source equivalence claimed.
- Local DSH D:\workspace\DSH HEAD 16838a9, dirty user checkout: existing plugin route registration, llm.stream, default model selection, CodeMirror/proposals observed in source. Its pinned 0.1.1-rc.2 differs from installed CLI 0.1.5-rc.1; this plugin targets the installed 0.1.5-rc.1 deliberately.
