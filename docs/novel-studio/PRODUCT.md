# DSH Novel Studio V1

## 本轮增量升级约定（2026-09-13，实施中）

保持同一个产品与双模式。新增功能必须进入现有生成、审校、提取与接管流程：全局/项目/任务版本化创作配置；Chat Completion 预设可见兼容子集和小说适配提案；原生文风/视角/对白/禁用表达；安全固定宏；发送前/生成后/展示三个隔离的正则阶段；所有 AI 经 P0–P5 确定性编译和实际请求检查器；关系/世界按来源、章节和知情范围参与生成；可重建章节/封存段记忆、覆盖缺口、证据召回与滚动未来规划；实际 DSH Provider 缓存用量与延迟，未知不记零。

本轮原始验收 A–H：A 旧版与非破坏迁移；B 预设生效/结构化任务隔离/运行任务固定版本；C regex 中文跨行捕获、非法/高耗时隔离终止、原始响应与非叠加处理；D 关系和世界时态、单方秘密、有界递归；E 数十章合成记忆召回/缺口/改文晚到保护/回滚；F 固定编译、动态变化边界、真实有限缓存测量；G 预设→处理→导演正文接受→记忆状态→作者改事实→重新委派的双模式闭环；H 默认与两种原创文风的实际可读样本。五类验证分别报告，不能将本轮未完成项改称未来增强。

不实现任意 JS/STscript、聊天皮肤、多媒体、全社区预设兼容、向量数据库或多 Agent 社会。未启用功能不回写历史正文；数据库用迁移及备份恢复，所有写入沿用范围、版本与事务保护。

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

## Verified V1 behavior and explicit tradeoffs

Acceptance A–L passed on the final code commit `b4ea427`; the actual evidence, historical failures and environment limits are in ACCEPTANCE.md. This status does not remove any original requirement above.

- Writer selection operations remain scoped proposals. Director has its own goal/contract/stages/artifact center, and its new-task composer collapses during review. Viewing and takeover remain different actions.
- Alternate story directions are editable candidates. Choosing another direction creates a new setup proposal with a concise reason; adopting an Inbox item creates only an empty future plan. Neither operation manufactures happened facts.
- Chapter ordering follows volume order then chapter order in navigation, export and context. Future replans show dependency impacts, apply atomically and can be undone only while their affected revisions still match.
- Important structured properties require usable property/value fields and source quotes. Extracted objects remain uncertain candidates until the author binds and accepts them; per-chapter extraction can yield repeated names. Dreams, rumors, memories and character knowledge retain their narrative layer.
- Target length is a quality signal: below 60% blocks acceptance, outside 75%–135% warns. This conservative empty/short-output guard is not a promise that every chapter exactly meets its target. The real 4000-word acceptance produced 4232 and 4830 counted words.
- One local SQLite writer and conservative project revisions favor reliable recovery over concurrent automation. Context uses a bounded character budget and scoped structured/text matching, not exact tokenizer accounting. Oversized mandatory information stops visibly.
- The actual configured DSH model is used only through DSH; the fixed original demo is explicitly labeled. Literary suggestions remain fallible, and failed model outputs and manual recovery stay visible in evidence.

## References and evidence level

- https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant at 24832d5eb0ded8c39cfaab9971af2a57e1827a22 (2026-09-12): README describes Agent/world/context/book production. Read actual checkpoint runtime and DirectorCommandLeaseService; these contain checkpoint persistence and stale lease/manual recovery branches. Not locally executed. LICENSE says AGPL-3.0-only community plus separate commercial authorization; implementation/assets not copied.
- https://maliangwriter.com/features/ and https://maliangwriter.com/docs (read 2026-09-13): official descriptions of layered outline, entity context, writing/review workflow. Marketing claims of eliminating inconsistencies are not treated as verified capability. No authenticated demo execution or source equivalence claimed.
- Local DSH D:\workspace\DSH HEAD 16838a9, dirty user checkout: existing plugin route registration, llm.stream, default model selection, CodeMirror/proposals observed in source. Its pinned 0.1.1-rc.2 differs from installed CLI 0.1.5-rc.1; this plugin targets the installed 0.1.5-rc.1 deliberately.
