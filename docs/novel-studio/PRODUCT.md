# DSH Novel Studio V1

## 第二阶段增量约定：请求诊断与按需读取（2026-09-16）

请求摘要与可含作品正文的详细请求分开读取，已接受章节、待审成果及活跃任务所依赖的详情受引用保护。未引用详情与摘要分别受时间、容量规则约束；用户主动清理可选择只清详情或连摘要清理，界面明确显示保留与已清理状态。保留策略不改变故事内容、模型调用或任务恢复语义。

打开作品只读取元数据、导航摘要、必要的单章正文及任务摘要；真正打开任务/成果/请求后再加载详情。项目 revision、全局章序和正文/记忆版本是缓存有效性依据。100/500/1000 章性能以原创合成内容分别观察记忆关闭/启用，测试报告必须区分索引路径的埋点查询数与全部 SQLite 查询，并写明环境、响应体、延迟与内存。第三阶段才改全局书架布局与封面，不借第二阶段的按需端点宣称书架体验完成。既有所有 V1 与原作 A–L 验收要求继续保留。

## 第一阶段增量约定：边界与状态一致性（2026-09-16，已实现）

本阶段保留现有 Writer / Director、CodeMirror、DSH Adapter、SQLite、正文版本、任务 epoch、接管、暂停恢复和 `pending artifact → acceptArtifact` 事务。没有另建第二套上下文、状态或审查系统，也没有修改 DSH Core。

- 所有小说模型请求先解析同一个故事读取范围：项目 revision、分支、稳定章节截止 ID、来源版本、人物视角、读者/角色知情范围和证据水位。范围过滤先于检索与预算。重规划默认只读当前分支；作者可以在任务表单明确授权读取全部分支规划，该授权不放宽正文事实、角色知情或来源截止点。
- 浏览器中的每个项目会话和异步意图都有 epoch。打开另一作品、返回书架或发起同类新请求会中止旧请求；任何迟到结果还必须通过项目、会话和意图序号检查才能写入 React 状态。正文保存失败仍阻止离开，并由编辑器本地恢复草稿保留恢复路径。
- 卷排序、章排序、跨卷移动和章节分支变化共用全局结构指纹与失效流程。新的事实与记忆来源记录稳定 `chapterId` / `versionId`；旧数字范围只作为兼容字段，结构变化后不能继续被当作可靠当前投影。
- 伏笔只有一个读取投影，同时给出作者的 `plannedState` 与由仍有效、已接受正文证据计算的 `confirmedState`。正文接管、改写、回滚或证据失效会重新计算确认状态，不删除历史事实，也不把计划字段静默改写成正文结论。

本阶段不新增 World / Plot 页面，不声称模型不会犯错。产品承诺的是输入范围可解释、写入权限由代码校验、迟到 UI/模型结果不能覆盖当前状态，以及事实和伏笔结论可追溯、可失效、可恢复。

## 本轮原作与衍生作品升级约定（0.3.0，已交付）

从只读、有版本的本地原作/资料包，按明确章前/章后/卷前/卷后截止点抽取证据，选择人物/状态/关系/世界/历史/线索/文风并处理有限依赖，原子激活为现有系统可写项目。支持原作续写、指定分歧、独立同人；原作相容/指定分歧/平行设定为可解释模板。来源、作者与使用范围保留，非商业标签不等于授权。角色总量无隐性固定上限；单批/调用/上下文/显示分页有边界，饱和或预算不足必须显示覆盖缺口。源版本更新不自动修改分支，默认导出仅本书新增/改编正文。

本轮完整验收 A–L：A旧版/迁移；B真实导入调度超过16且17/33/64可搜索选择入书并召回；C密集段和预算授权恢复；D60章截止20排除45章死亡/50章化名与早期秘密揭露的所有派生资料；E章前后/卷边界/序章/重号/缺章；F实体与字段选择、背景引用、排除和依赖；G敌对改为合作的有意分歧及前缀冲突；H无小说正文资料包；I原作版本及两个分支隔离；J分段/建书/索引中断、取消、重启、晚到与幂等；K导入→续写→接管→新事实继承；L千级角色列表/局部图实际耗时、少量真实抽取与续写质量。五类验证分别报告，使用原创60章64人合成Fixture；不靠直接插入64条记录冒充抽取。可选EPUB不绕过DRM，不创建采集发布/付费/多宇宙框架。

本轮在TXT/Markdown及文本资料包范围内完成A–L，74项自动测试、实际DSH抽取和两章接续、浏览器及持久化验证分别通过。没有减少上述原始验收条件；语义抽取的召回与误归类按真实样本报告，不承诺所有人物绝不遗漏。

| 创作方式 | 默认继承 | 默认排除与作者修改 |
|---|---|---|
| 原作续写 | 选定章之后1..N的锁定原文、允许证据、状态、关系与未决线索；新章N+1 | 原作后文、后期揭露和后续主线不作本书已发生事实或必走计划 |
| 分歧改编 | 从N章重写时只保留1..N-1；未改动资料继续有来源 | 新剧情在独立项目；推翻已继承前缀的事件须前移边界或登记明确回溯改编及原因 |
| 独立同人 | 指定版本/阶段下选择角色静态特征与世界规则，原生第一章 | 默认重置地点、伤势、物品、知情、成长与原作主线；显式字段勾选和作者覆盖可以改变模板默认 |

一份原作源可以建立多本书。角色“本次不导入”在保留历史时降为必要背景引用；“明确排除”是改编决定，不能等价于历史中从未出现。关系缺端点默认补最小背景引用，可选完整补入/丢弃关系/替换；只扩展明确的依赖，不做无限闭包。类别、跨页选择和字段都有落盘manifest，必要关系/事实字段缺失会阻止激活。

当前实现复用原有预设、正则、记忆、图谱与缓存。源发现/抽取走中性Extractor，原文只读且不应用写作正则；新章仍使用冻结文风与生成后管线。继承原文仅作为锁定参考，作者在新章节接管或修改本书设定不会改回来源库。新来源版本只提出比较，不自动升级已有基线。

入口为书架“从已有作品创作”及作品侧栏“原作资料库”。推荐路径可在预算、覆盖及证据校验通过后创建；有歧义集中停在预览，不让用户逐个确认所有配角。补充深度档案只针对选择对象，不是开写前置。字段表单复用已有角色/世界编辑器；“继承与改编”区分来源、改编、新增及已撤销历史。

边界：无DRM绕过/采集/自动发布；未实现可选EPUB。支持来源资料包中的基线材料和仅供作者隔离阅读材料；后者目前不进入模型规划。按来源版本新增清单/独立副本进行选择升级，不实现跨宇宙自动合并。本轮核心未完成项/外部阻塞为无；明确格式与语义限制见ACCEPTANCE。

## 本轮增量升级约定（2026-09-13，0.2.0 已交付）

保持同一个产品与双模式。新增功能必须进入现有生成、审校、提取与接管流程：全局/项目/任务版本化创作配置；Chat Completion 预设可见兼容子集和小说适配提案；原生文风/视角/对白/禁用表达；安全固定宏；发送前/生成后/展示三个隔离的正则阶段；所有 AI 经 P0–P5 确定性编译和实际请求检查器；关系/世界按来源、章节和知情范围参与生成；可重建章节/封存段记忆、覆盖缺口、证据召回与滚动未来规划；实际 DSH Provider 缓存用量与延迟，未知不记零。

本轮原始验收 A–H：A 旧版与非破坏迁移；B 预设生效/结构化任务隔离/运行任务固定版本；C regex 中文跨行捕获、非法/高耗时隔离终止、原始响应与非叠加处理；D 关系和世界时态、单方秘密、有界递归；E 数十章合成记忆召回/缺口/改文晚到保护/回滚；F 固定编译、动态变化边界、真实有限缓存测量；G 预设→处理→导演正文接受→记忆状态→作者改事实→重新委派的双模式闭环；H 默认与两种原创文风的实际可读样本。五类验证分别报告，不能将本轮未完成项改称未来增强。

不实现任意 JS/STscript、聊天皮肤、多媒体、全社区预设兼容、向量数据库或多 Agent 社会。未启用功能不回写历史正文；数据库用迁移及备份恢复，所有写入沿用范围、版本与事务保护。

升级 A–H 在明确的兼容子集内验收通过：11单元、43集成、2模拟HTTP E2E；实际模型与浏览器分开验证。旧8作品没有内容变化，重启后10作品完整校验和相同。风格效果按完整可读样本核对，不用AI评分或字符串哈希替代读稿；567字的冒险样本明确作为偏短的未接受建议。失败和预算暂停记录保留，具体边界见 ACCEPTANCE 与 ARCHITECTURE。

2026-09-13. Personal, local-first long-form fiction workbench. Writer is author-led editing; Director executes a scoped CreativeTask. Both use exactly one project, body/version store, canon and domain service. Viewing never acquires write control; takeover invalidates old AI dependencies. Accepted is distinct from published.

## Original V1 scope (not optional)

Projects create/open/rename/save/archive; inspiration onboarding and existing-book import; divergent story directions and inspiration Inbox; book/volume/chapter outlines, reorder/move/lock and future replan; real body editor, autosave/error states, count, undo/redo, selection AI, preview/Diff/partial adoption, versions/focus/export; structured characters/groups/relationships/states/history/knowledge/voice; structured world tree/types/properties/relations/sources; timeline with story time vs chapter order, planned vs happened; foreshadowing planting/recovery; sourced canon and disputes; persistent Director tasks for bootstrap/write/batch/review/replan/extract; TXT/Markdown raw-preserving import, exports, full project backup/restore.

Context must be bounded, prioritized, deduplicated, version-aware, inspectable, and preserve locked constraints. Future plans, candidate ideas, working drafts and accepted material remain distinct. Facts carry sources/evidence/version/time/modality; inference is not objective truth. Accept body and derived states atomically and idempotently. Rollback handles facts and downstream validity. No AI last-write-wins.

Director default max 3 chapters, 2 retries per step, 2 repair rounds, task call/output budgets, one shared-state writer per book. QUEUED/RUNNING/PAUSE_REQUESTED/PAUSED/NEEDS_INPUT/FAILED/COMPLETED/CANCELED are durable. Interrupted work resumes from safe checkpoints. Cancellation and late results never bypass acceptance guards. Serious conflicts block acceptance. Auto acceptance has explicit policy/task provenance.

## Acceptance contract

A persistence including restart and honest save errors; B Director chapter 1 → Writer takeover and fact change → redelegate chapter 2 with new version; C stale call protection; D future-plan/canon separation; E sourced contradiction detection with memory/retrieval exceptions; F bounded multi-chapter production, inherited state, real target word counts; G pause/restart/resume without duplicate writes; H timeout/invalid JSON/save failure/budget/partial failure/cancel-late; I derived-state rollback and scoped future replan; J raw-preserving import/export/backup restore; K actual browser use of both modes, graph, forms, Diff, takeover/errors and responsive views; L large-book scoped context, budget/locks/stale summaries. Each is tracked separately in ACCEPTANCE.md. Deterministic models never count as real AI validation.

## Decisions

- Full independent DSH plugin page, not changes to the existing dirty Writing Studio checkout. DSH native model, credentials and tool runtime are reused. No copied reference implementation.
- Writer uses a compact IDE-like shell: global mode/project controls, a narrow functional activity rail, a contextual chapter/task tree, the prose canvas and an optional AI inspector. This keeps the manuscript central while every rail entry remains a real route into the existing product. The 2026-09-15 layout takes only observable interaction ideas from NeuroBook; its AGPL source and visual assets are not copied.
- Director uses an Agent-session workbench: a searchable CreativeTask session list, compact current-task header, central persisted event/step/artifact flow, docked delegation composer and optional task-contract inspector. It preserves the bounded runner, task contract, real progress, view/takeover distinction and all shared revisions. The layout is independently implemented from observable NeuroBook interaction patterns; no reference source or asset is copied.
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

- https://github.com/notnotype/neuro-book at 45906272915ff43e83318653af62afa9ce668206 (2026-09-14): inspected the public home screenshots plus `pages/index.vue`, activity bar, Markdown Studio workbench and editorial theme tokens to understand the editor's visible pane hierarchy. License is AGPL-3.0-only. Only the layout principles were reimplemented with existing Novel Studio components; no code, styles or assets were copied.
- https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant at 24832d5eb0ded8c39cfaab9971af2a57e1827a22 (2026-09-12): README describes Agent/world/context/book production. Read actual checkpoint runtime and DirectorCommandLeaseService; these contain checkpoint persistence and stale lease/manual recovery branches. Not locally executed. LICENSE says AGPL-3.0-only community plus separate commercial authorization; implementation/assets not copied.
- https://maliangwriter.com/features/ and https://maliangwriter.com/docs (read 2026-09-13): official descriptions of layered outline, entity context, writing/review workflow. Marketing claims of eliminating inconsistencies are not treated as verified capability. No authenticated demo execution or source equivalence claimed.
- Local DSH D:\workspace\DSH HEAD 16838a9, dirty user checkout: existing plugin route registration, llm.stream, default model selection, CodeMirror/proposals observed in source. Its pinned 0.1.1-rc.2 differs from installed CLI 0.1.5-rc.1; this plugin targets the installed 0.1.5-rc.1 deliberately.
