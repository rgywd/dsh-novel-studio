# Architecture

## DSH integration and boundaries

This is a full-page DSH plugin: Novel Studio Domain + UI + a small DSH adapter in one local process. The inspected host provides web routes, model selection, credential handling, `llm.stream` and ToolRuntime. Its existing writing plugin did not provide a reusable persistent director with the required state/version semantics. The domain-specific runner therefore lives here; no DSH Core edits or replacement generic agent framework were introduced.

The separate dirty `D:\workspace\DSH` checkout at `16838a9` remains untouched. It pins 0.1.1-rc.2; this plugin deliberately targets installed DSH 0.1.5-rc.1. Model selection is cloned from the host, credentials remain in DSH and no fallback provider is selected silently. The `novel-studio` profile and port 4318 isolate this work from the existing port 3080 instance.

`src/plugin.ts` mounts `/novel-studio/` and `/api/novel-studio`, adds a DSH navigation link and registers three composite tools:

- `novel_read`: project metadata, scoped objects/search, context or task state.
- `novel_task`: bounded task create/get/pause/resume/cancel. Model-created tasks force candidate-only acceptance; the UI records explicit author auto-accept policy.
- `novel_propose`: version-bound selection proposal for an existing author-scoped assist task; cannot change scope or accept it.

The UI, those tools and Director reuse the same domain methods. Fine-grained chapter/canon/plan/context/changeset responsibilities are methods rather than a large public tool list. Model output never performs core business through simulated UI actions. Plugin disposal unregisters routes, tools and navigation before closing the runner and SQLite. `test/plugin.test.ts` invokes the actual DSH ToolRuntime; model/web services there are controlled stubs, while real model smoke runs the installed host.

## Code map

| Path | Responsibility |
|---|---|
| `src/contracts.ts` | Zod contracts, source/narrative types, task budgets, word count, shared volume/chapter ordering |
| `src/store.ts` | Native SQLite WAL, transactions, JSON rows, indexes, FTS5 projection, immutable version commit keys |
| `src/domain.ts` | All business mutations, scope/revision guards, source validation, acceptance/rollback, ideas/replan, import/backup |
| `src/context.ts` | Scoped prioritized packs, current state projection, provenance, omission and stale-summary trace |
| `src/review.ts` | Exact quote validation, known IDs, item/state/locked constraints, length checks, evidence-backed issues |
| `src/prompts.ts` | Prompt IDs/versions, schemas, purposes, context and model/retry policies |
| `src/provider.ts` | DSH streaming adapter, bounded structured return, trustworthy usage; explicitly labeled original demo |
| `src/runtime.ts` | One persisted orchestrator, safe boundaries, retry/checkpoint/epoch/late-result protection |
| `src/http.ts` | Shared HTTP transport, loopback/origin controls, static page and attachment exports |
| `src/ui/` | React Writer/Director, CodeMirror editor, object tree/forms/graph, evidence/Diff/task/backup views |
| `scripts/serve.ps1` | Hidden local process startup, owned-process restart, bounded health check and PID receipt |
| `scripts/real-smoke.mjs` | Real configured-model test with preserved artifacts and resumable finite budgets |

## Storage, facts and versions

New SQLite schema 1 contains projects, typed structured objects, immutable chapter versions, tasks with steps/checkpoints, artifacts, actual runtime events, changesets and original imports. Domain concepts share these tables instead of each requiring a separate framework/table. JSON fields are additive; no existing DSH database or Markdown book is migrated, silently imported or rewritten. React 18 / CodeMirror 6 reuse the editor technology present in the host; SQLite is native to Node 24. No graph/vector database or separate background service is required.

All mutations are validated through `domain.ts`. Material project revisions deliberately invalidate pending shared-state dependencies; chapter revisions also protect autosave and proposals. Metadata routes reject body/status/version/summary projection forgery. Viewing changes no write authority. Takeover changes control, invalidates the old task epoch and preserves late results as stale artifacts. Source-only changes are material too.

A chapter acceptance transaction creates the accepted version, facts, states, events, foreshadow updates and changeset together. Unique commit keys prevent repeated side effects. Source records include chapter/version, exact quote/range, entity/property/value, time/range, modality, inference and task/policy provenance. Auto acceptance is distinguishable from author acceptance.

Rollback revokes affected projections and invalidates downstream tasks/summaries before rebuilding effective state. Author edits to sourced facts/events create a replacement with `supersedes`; the original record and evidence remain immutable. Rollback cannot revive an explicitly superseded fact. History remains inspectable while current state is selected per entity/property/narrative layer; character knowledge accumulates instead of replacing earlier knowledge.

Objective facts, character knowledge, memory, rumor, dream and uncertain claims are distinct. Non-objective/inferred events stay candidates outside the happened timeline. Missing event modality in pre-existing V1 artifacts defaults to the original objective behavior for compatibility. Future chapter plans and unadopted ideas never become happened facts.

## Bounded execution and recovery

A task persists goal, scope, input references, constraints/locks, allowed decisions, deliverables, budget, stop conditions, status, current step, checkpoint, artifacts and errors. The model first produces a concise visible task brief; a material authorization/story ambiguity can pause for an author answer. Clarification/redelegation retains the original budget and builds a fresh epoch/context. Internal reasoning is not displayed.

Default task limits: at most 3 chapters, 18 calls, 48000 output tokens, 18000 context characters; configurable upper limits are 40 calls, 150000 output tokens and 48000 context characters. Each automatic step has at most 2 retries and each chapter at most 2 repair rounds. Only one shared-state task runs per project. Budget exhaustion retains outputs and pauses, without automatic budget increases.

The chapter path is brief → refresh changed author states when necessary → context → plan → streamed draft saved before review → sourced review and deterministic checks → finite repair/recheck → policy-gated atomic acceptance → next chapter. A completed model message cannot mark a task complete by itself.

QUEUED, RUNNING, PAUSE_REQUESTED, PAUSED, NEEDS_INPUT, FAILED, COMPLETED and CANCELED are durable. The runner checks status/epoch/version after every external call and before any official commit. Abort is attempted; ignored abort and late output cannot bypass guards. Successful identical-input steps are reused after restart. Interrupted tasks recover as visible PAUSED rather than falsely completed. External calls may execute more than once, but official domain writes are idempotent.

Accepted-state refresh reads the author's current body and earlier formal state, excluding superseded unlocked chapter plans and unrelated future-task restrictions. AI risks appear as reviewable `state-review` artifacts. An intentional-arrangement decision can accept the state projection without rewriting the body or counting another chapter; deterministic hard conflicts remain blocking. A manually repaired working draft has one durable artifact that stays unacceptably pending until its new review fills the same artifact.

Future replan proposals list impacts on later plans, arcs, foreshadowing, planned events and tasks, with unknown dependencies marked possible. Application cannot touch locked or accepted bodies. Undo is atomic, repeated undo is harmless and mismatching later author revisions block it. Adopting an idea is also idempotent and creates only an empty future chapter.

## Context and AI contracts

Context prioritizes project promises/locks/current plan, current volume, previous ending, recent valid summaries, involved entities and one-hop world relations, current facts/knowledge, active foreshadowing and relevant events. IDs, chapter/time scope and text matches drive selection; an FTS5 projection exists, but V1 does not depend on vector retrieval. Previous-ending entity matching keeps carried items available even under a broad next-chapter goal. Whole-book input is never the fallback.

Packs deduplicate, recognize stale versions and show used/omitted items with reasons and versions. Their budget is characters rather than exact tokenizer tokens. Mandatory locked constraints cannot be silently truncated: overflow stops. Derived summaries match a source version; body edits invalidate them. The large-book test exceeds one million characters.

Prompt schemas are generated from actual Zod 3 contracts via pinned `zod-to-json-schema` 3.24.6. Current semantic contracts include brief v3, plan v3, review v10 and extract v4. DSH structured calls use native `submit_novel_result` function return as data only; unknown or multiple calls are rejected. Valid JSON text fallback is supported. Normal prose remains streamed text and is saved before subsequent review.

Evidence validation reports exact schema field paths/known IDs and requests bounded repair. Extraction requires canonical property/value fields for facts and exact chapter quotes. Each chapter is extracted separately; oversized input fails visibly before a model call. Outputs remain uncertain candidates even after accepting the extraction artifact. Related extraction siblings rebase only while their source chapter versions remain unchanged; names are not silently merged into entities.

The adapter records each actual attempt's usage, selected model route and effort, or conservative reserved output when a trustworthy receipt is missing. Balanced tasks use advertised off effort, otherwise advertised low; configured mode preserves the selected host setting. No fabricated fee amount. Imported/model/reference content is untrusted task data, not tool authorization.

## UI, files and security limits

Writer centers prose, save status, goal and selection operations. Director centers the contract, actual stages, artifacts and interventions. Both render the same project data. Autosave has honest failure/retry and local recovery text. Diff supports full/partial acceptance. Character/world source forms, relationship graph and timeline link back to actual objects; the graph renders 30 characters at a time with a visible limit. Desktop/narrow drawers and light/dark schemes are verified in the browser.

Imports preserve raw text, allow adjusted chapter splits, and append volumes using the same ordering as export/context. Limits are 5 million raw characters and 100000 per imported chunk. UTF-8/GB18030 TXT and Markdown are the V1 path. Export uses actual UTF-8 HTTP attachment responses. Project backup is schema-versioned JSON with a checksum and all core settings, versions, tasks, artifacts, events, changesets and raw imports. Restore remaps IDs/references into an independent copy and pauses active tasks.

The standalone server binds 127.0.0.1:4317; DSH helper binds 127.0.0.1:4318. HTTP checks local host, same Origin/Sec-Fetch-Site and a JSON application header on writes; CSP/static allowlist and a 64 MiB request cap apply. This is local single-user access, not SaaS authentication or multi-host concurrent editing. Host credentials, database files and logs are ignored by Git. The helper checks owned process identity/profile and never stops an unrelated listener.

Operational/compatibility limits, evidence and final receipts are in ACCEPTANCE.md. Daily startup, configuration and the handoff demo are in README.md; recovery starts in EXECUTION_STATE.md.
