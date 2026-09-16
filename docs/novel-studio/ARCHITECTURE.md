# Architecture

## 2026-09-16 Stage 3：全局壳、书架投影和创作资产

`src/ui/ProjectShelf.tsx` 只在没有选中项目时渲染三个全局页签。原作页签复用 `SourceLibrary` 的既有分析和激活逻辑，以 inline 容器呈现；创作资产页签通过 `src/ui/CreativeAssets.tsx` 调用同一 `config_versions`、`config_bindings` 和 `resolveConfig`。全局绑定拒绝角色/视角的项目 ID；导入先预览兼容报告，保存独立版本后须显式设为全局。项目级覆盖和任务固定快照照旧。`main.tsx` 的项目会话协调器保护异步提交，返回书架先 flush 编辑器；URL `?project=` 与本地位置仅恢复视图，不启动任务，损坏或失效的定位回退到有效章节和工作台。

schema 4→5 在事务中新增 `project_shelf`（最近章节 ID、标题、时间和待审数）及 `project_covers`（项目私有 BLOB、格式、独立乐观修订）。旧数据只做一次投影回填；后续 `Store.put` 在同一 SQLite 事务中更新投影。`GET /shelf` 只读项目元数据与投影，不扫正文/成果 payload；`/projects/:id/cover` 读取或按修订替换/移除，上传限制格式、签名和 2 MB。项目 JSON 备份有封面时包含原字节的 base64，并在独立副本中验证格式后恢复。来源工作空间不进入书架，也不能设置封面。

迁移前使用只读 SQLite `VACUUM INTO` 在忽略的 `.local/backups/stage3-20260916/` 保存两个完整运行库，先在副本升级并比较 20 类旧表的行数与哈希、PRAGMA integrity_check 和旧项目独立恢复；失败时停止升级，保留原库。已升级的库若需回退程序，应先停止服务，从对应完整旧库副本恢复，不能让 schema 4 程序写 schema 5 数据库。无新增 npm 依赖、DSH Core 修改或正文格式迁移。

## 2026-09-16 Stage 2：诊断保留与读取投影

schema 3→4 是增量事务迁移：保留旧 `requests` 表及字节不变的原行，复制为 `request_summaries`（不含编译正文/原始响应）和按 ID 读取的 `request_details`。新写入只进入新表。`src/requests.ts` 按任务、待审 artifact 的 generation/requestIds、已接受版本显式 requestIds 或旧 commitKey 反查保护引用；未终结请求也不清。100 条/90 天详情与 500 条/365 天摘要独立限额，单项目主动清理与清理痕迹可见；导出/恢复同时保存可用详情或墓碑摘要。旧请求表作为迁移来源保留，后续归档策略仍可审计，不误把详情物理存在理解为可以无限增长。

`src/projections.ts` 提供 metadata/navigation/taskSummary/artifactSummary/detail；`src/ui/main.tsx` 首屏并行读取元数据、导航、任务和成果摘要，只对当前章节调用 detail。旧完整 `/projects/:id` 保留给旧集成和备份语义。任务详情按项目+任务索引取成果。`src/read-model.ts` 的 ProjectReadIndex 只活在一次读取范围中，缓存章节次序/全局结构指纹、来源前缀 hash、版本/记忆行与时态投影；新请求重新读取实际项目 revision 和结构，不用计时器复用可能过期的数据。`scope.ts`、`temporal.ts`、`memory.ts`、`context.ts` 共用该索引，不允许跨作者接管复用旧派生资料。

迁移回退：运行前通过只读 SQLite `VACUUM INTO` 制作完整一致性私有副本；升级失败保持原库不变或停服务用完整副本恢复，不在运行中的库上覆盖文件。旧 JSON 项目备份可以恢复为独立项目，旧请求迁移测试逐行核对；schema 4 已写入后若回滚程序，应先退回完整 schema 3 副本或保留新程序读取新表，不能用旧二进制继续写一份分叉请求历史。没有新 npm 依赖、DSH Core 变更或正文重存储。

## 2026-09-16 Stage 1：统一读取范围与状态投影

`src/scope.ts` 是现有 Domain 之上的唯一小说读取范围解析器。`resolveStoryScope` 以项目、章节、分支、截止水位、来源版本、视角和规划授权为输入，先调用时态投影排除未来证据、其他分支、未接受内容、旧正文版本和角色未知资料，再交给 Context Engine 做相关性与预算筛选。它输出本次可读对象、章节、规划、任务依赖及 `StoryScopeTrace`。传给模型的 trace 会汇总省略原因，不发送范围外对象 ID；本地 Context Inspector 保留完整诊断。任务约定编译、正文上下文、滚动规划、重规划依赖、编译预览和最终请求复用同一个已解析 scope。

`CreativeTask.planningScope` 是任务快照的一部分，默认 `current-branch`；`all-branches` 只能由 Director 重规划表单明确选择。旧任务缺少该 JSON 字段时在读取处采用默认值，服务启动不会为了补默认值改写旧任务。恢复旧备份会在新建的独立副本中规范化该字段。数据库 schema 仍为 3，本阶段没有迁移、清库或正文重写。

`src/ui/project-session.ts` 提供轻量项目会话协调器。`enter/leave` 增加项目 epoch 并取消全部旧意图；每个 `begin(project,intent)` 增加意图序号并取消同类前请求；`commit` 同时校验项目、epoch、意图序号和 AbortSignal。`main.tsx` 将打开、刷新、配置、任务详情、轮询、证据定位、历史、Context、展示、任务控制、接管和正文保存回执接入这道提交门。AbortController 只减少无用工作，正确性依赖提交检查和服务端 revision/epoch 校验。

`chapterStructureFingerprint` 对稳定章节 ID、父卷、局部顺序和分支做确定性哈希。卷/章排序、跨卷移动和章节分支改变时，Domain 统一使结构相关记忆失效，使仅有旧数字范围的派生对象过期，并记录带前后指纹的 `structure.reordered` changeset；正文和已接受版本不修改。新来源同时记录旧 ordinal 和稳定 `fromChapterId`，时态查询优先稳定 ID。

`src/foreshadow.ts` 是伏笔状态的单一读取投影。计划值来自伏笔对象，确认值只来自当前 scope 中状态为 accepted、正文版本仍为 current 的 `foreshadowState` 事实。Context、滚动规划、项目 snapshot 和 UI 共用该投影；确认 resolved 后不再建议重复回收，正文证据失效后恢复为 unconfirmed，历史事实仍留在账本中。

模型边界仍由单一 Runner 和共享 Domain 执行。Prompt、导入文件和模型输出都是数据；重规划 artifact 接受时会再次以任务固定 scope 校验每个 change 和 impact。预览和最终调用采用同一 scope，缓存键包含规划授权与最终 Context Pack，不能以缓存复用绕过新 revision 或结构指纹。

## 2026-09-15 Director 会话工作台布局

这是 UI 层增量，没有新增领域模型、API、schema、依赖或第二套任务状态。`DirectorTaskSidebar.tsx` 从现有 `CreativeTask[]` 渲染可搜索会话并通过原有 `onLoadTask` 选择；`main.tsx` 在 Director 模式挂载该侧栏，并在没有当前任务时选择本项目最新任务。`Director.tsx` 继续消费原有任务、步骤、产物、事件、请求记录和控制回调，只把结构调整为紧凑会话头、中央实际执行流、底部委派输入和右侧任务约定。`WorkbenchRail.tsx` 根据模式标记“导演会话/任务约定”，资料入口保持当前模式；`style.css` 提供桌面、折叠面板和窄屏抽屉规则。

显示进度只来自已持久化步骤、事件和产物；任务输入仍调用现有创建接口，暂停/恢复/取消/重新委派/查看/接管仍走原回调与 Domain。切换页面不取消任务，收起输入或检查器不改变任务状态。进入 Director 自动选择最新任务只是视图恢复，没有运行副作用。参考 NeuroBook Agent 会话的可观察布局和公开组件职责，独立实现；未复用其 AGPL-3.0-only 源码、样式或素材。

## 0.3 原作衍生升级（已验证）

在既有 Domain + UI + DSH Adapter 上增量扩展，DSH Core及独立脏checkout均未改动，npm没有新增依赖。schema2→3在事务内新增 `source_works/source_versions/source_runs/source_assets/source_decisions/import_manifests` 六表及版本索引。旧项目JSON行不迁移重写；升级前10项目私人备份，最终校验和10/10相同。完整数据恢复：项目JSON备份恢复为独立副本；来源库冷备先停对应服务，再复制整个SQLite库，不在线覆盖或清库。

`SourceVersion`不可变，保存每份原文件base64、SHA256、编码、解码正文、材料类型/阶段/用途、稳定章节ID和UTF-16范围。UTF-8/BOM/GB18030按明确选择解析；无连续正文也可以人物/世界文本组成资料包。目录校正创建新版本，不能回写旧证据；序章、卷重编号、重名与缺章展示实际目录。界面“章之后”含本章，“从章重写”不含本章；卷前后解析为真实位置，不靠标题排序。文件整体哈希用于身份，不作为唯一上下文缓存键。

`source-runner.ts`复用Runner.step、配置快照、编译器、DSH、usage、epoch/修订fence、中断和重启恢复。每段先直接原文发现实体，再整理事实/事件/关系/世界。发现容量默认16，可配置4–32；结构化整理每次最多48项。达到容量/报告饱和继续细分并保留重叠；太密无法可靠分割或结构无效就留缺口，不冒称完整。一步最多两次自动重试；同来源工作空间串行写入。当前来源总预算默认24调用/10万输出token、最高1000/300万，UI需明确授权增加，历史用量不重置。每个片段、重试、已完成副作用和未覆盖原因落盘；源扫描成功也不等价语义全召回。

`assetsAt`按run/version/揭露章节先裁允许范围，再聚合有证据观察和生效时点的人工归并。身份和别名不因字符串相似自动合并；不相容同名作为待确认，支持定点merge/split/resolve/undo。源实体深度档案是独立候选，作者接受后才继承；晚到档案必须匹配analysisRevision。人工更改影响registry中的解析依赖时，重置相应后续覆盖、隔离原产物并暂停；已激活分支保持独立。引文必须实际存在，重复引文要求准确段内偏移或更长唯一证据，不能虚构位置；传闻/梦/推断/角色知情分层，knownBy映射到真实实体。

范围隔离覆盖正文、段摘要、实体别名/历史状态、图关系、召回、编译及请求：检索前就形成允许素材集合，不能整库top-K后删未来。完整来源分析可按证据重建早期视图；来源段摘要只由此前已处理registry和当前允许原文形成。每一步hash含Prompt版本、sourceVersion、cutoff、片段、analysisRevision及registry版本/哈希；这里只复用已有任务落盘步骤和同一分析的安全前缀视图，不宣称跨所有任务免重复付费。模型预训练信息无法物理删除，任务明确要求来源约束，审校引文/实体必须可查。

`inheritance.ts`保存staging manifest，固定版本、边界、字段选择、关系依赖、排除、覆盖、配置版本和analysisRevision。preview给出数量、背景补全理由、缺口、前缀冲突及回溯改编影响；激活在同一SQLite事务内复制已有Novel/Chapter/Character/World/Canon/Event对象、版本、映射和来源证据，再标active。幂等重试返回同一projectId；中途索引或写入失败整个创建回滚，不暴露半本就绪作品。源和其他分支从不共享可变人物记录。

继承正文为locked/referenceOnly，不能通过编辑器、unlock、takeover、review/extract/summarize任务绕过写保护。世界/角色动态状态按允许证据保留历史投影；knowledge的主体不是知情者本人时，必须按knownByIds隔离。独立同人使用静态字段白名单，未知动态字段默认重置；显式勾选优先且可包含自定义字段。取消事实property/value或关系type/state将产生可见冲突，不能生成不可解释的正式对象。最小背景不携带完整档案、别名/秘密或无限关系依赖。

源事实、继承基线、作者改编、本书正文事实和AI候选使用同一source元数据，provenance分别标记。改编覆盖独立保留原证据并撤销同属性基线投影；回溯改编/明确排除时参考前文不再作为当前生成事实证据。`source.activated` changeset包含选择清单、映射、引用证据副本；书内编辑/回滚继续用Domain既有版本、派生失效与任务保护。本书接受新章仅改变本项目。来源升级生成新version，可比较并新建选择清单或副本，既有同人正文不自动改写。来源删除有引用保护，归档不会影响分支。

Context Engine向新书提供基线契约、允许的必要原文末段、参与状态/关系、规则及未决义务；源证据即使未启用记忆也可有限召回。源任务隐藏在分析工作空间，通用读写工具不能自行扩大来源范围；专用HTTP与共享服务验证版本/截止点。新书Director默认创作现有起点，跳过重新开书；Writer查看原文和证据、编辑新稿、接管后下一任务先重建同版本状态。所有新正文继续使用已有文风/regex/raw→candidate→accept→memory管线；来源Extractor强制中性配置。

审校可靠性修正：Reviewer v15要求稳定规则无变化时不重复抽取，不把测量事件作为规则value。虚拟任务约定证据源包含完整goal与constraints；错引sourceId时报告实际匹配来源，仍拒绝错误引用。记忆引文只可来自本次draft。只有源结构化解析允许删除末尾1–2个多余闭括号，并保留raw、重新Schema校验和记录修复；不补缺失JSON。局部修复只接收阻塞问题，review-only无默认整章字数要求。自由文本语义差异仍可能触发保守冲突，不能宣称永不误报。

本书默认TXT/MD导出只包含新稿和来源说明；私人备份显式包含所继承前缀/证据，不附带资料库隔离后文。恢复创建副本并保留来源关联、配置与记忆历史；源库不随作品删除。原作不会自动上传；云抽取必须明确同意选定范围及预算，真实调用仅走已配置DSH。

### 数量与资源分层

| 层级 | 当前边界 |
|---|---|
| 作品/来源实体总量 | 无16/32/128等业务截断，受存储/设备资源约束 |
| 发现/整理批次 | 默认16个发现（4–32），整理48项；满批细分或明确缺口 |
| 文件/请求 | TXT/MD与文本包；每版本20份、500万解码字符，单文件20MB；HTTP请求64MiB含base64/JSON |
| 扫描片段 | 默认4000字符，可200–10000；最小可靠细分120字符、深度10、60字符重叠 |
| 列表/图 | HTTP页面最多200，UI素材30、继承40；筛选全选/导出覆盖全部；局部图30一跳 |
| 生成上下文 | 独立有界召回，核心材料放不下则显式暂停；不发送全部角色 |
| 请求记录 | 每项目最近100次本地快照；更早正文及处理链保存在成果/版本/步骤，来源证据另存 |

### 参考审计与实现边界

只读核对 [AI-Novel-Writing-Assistant @24832d5](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/tree/24832d5eb0ded8c39cfaab9971af2a57e1827a22)，提交日期2026-09-12。LICENSE为AGPL-3.0-only加独立商业授权说明；未复制实现/素材、未运行该项目，也不把README宣称计为本项目验证。按用户提供路径读取bookAnalysis路由、BookAnalysisCharacterService、schemas/prompts/shared types、notes缓存与发布/前端链路。实际角色API max16、Service MAX_IDENTIFIED_CANDIDATES16/slice16、具名输入slice8、Prompt min16；source notes每段characters/world等max5、evidence max3，可在上游造成候选损失，均不等价数据库作品总容量。

实际参考流为原文段→notes/cache→identify→规范化姓名upsert→逐候选profile→Prisma/CharacterPanel；cache键包含documentVersionId/sourceScopeKey/provider/model/temperature/token/segmentVersion，不能误称仅按书名。publish通过KnowledgePublishService形成版本化知识文档并绑定novel，不是本轮所需原子基线。这里仅借鉴分阶段、证据与恢复思路，以现有领域服务自主实现。

实现入口：`source-contracts.ts/sources.ts/source-runner.ts/source-http.ts/inheritance.ts`；既有`context/temporal/domain/runtime/review`扩展；`ui/SourceLibrary.tsx`共享Modal/Field/graph/Inspector，从书架及侧栏进入。专用unit/integration/boundary/HTTP测试及原创Fixture、source-scale/smoke/final脚本可复核。74自动测试PASS；真实24/24已知人及77/77有效引文、两次接续与人工交接，40次DSH实际请求中33次缓存读取>0、合计62592，写入/金额UNKNOWN。实测与失败详情见ACCEPTANCE，元数据性能与替身不得充当真实召回。

未实现可选EPUB解析，未做爬书/DRM/发布。author-reference材料目前仅作者隔离阅读，不送规划模型；版本升级以比较+新清单/独立副本进行，不提供自动多分支合并。无其他本轮核心未完成项。

## 2026-09-13 incremental upgrade — 0.2.0 verified

Schema 2 adds immutable `config_versions`, scope bindings, last 100 local request snapshots per project, and derived memories. Migration is additive in one SQLite transaction. Legacy projects/versions are not rewritten. JSON backups support schema 1 and 2; restoration creates a separate project and freezes its restored effective configuration, without changing global defaults. Before migration, eight real project backups were saved privately; see the non-secret receipt in evidence.

`config.ts` imports and resolves global → project → task fields; arrays replace, native fields override individually. Every new CreativeTask saves a full configuration snapshot. Legacy unfinished tasks without snapshots retain disabled upgrade behavior. Changing a binding does not change the story revision or a running task. `compiler.ts` is called by the shared Runner.step for every prompt: task snapshot → scope resolution → task-role filter → read-only macro expansion → bounded Context Pack → whitelisted before-text transforms → deterministic P0–P5 messages/budget → DSH adapter → observable invocation snapshot → call. Writer uses literary entries and sampling; Reviewer reads native style only as evaluation data; Planner/Extractor/Summarizer stay neutral. Runtime/schema remain in the protected system slot. Compatibility entries keep their supported roles/order/positions; source trust does not imply tool authority.

`text-pipeline.ts` executes only a fixed Worker program with user patterns as RegExp data. Per rule: 500 ms termination, 1000 matches, 100000 input and 120000 output characters, bounded worker heap. Generated prose is processed only after the complete response; review sees the candidate. Replay starts from raw response and fixed rules. Display produces an escaped read-only preview; it cannot affect facts. Raw/candidate/transform lineage is retained in artifacts beyond request-log retention.

The installed DSH 0.1.5-rc.1 GenerateOptions exposes temperature/maxTokens/stop, not top_p or provider-specific cache controls. The actual DeepSeek adapter maps prompt_cache_hit_tokens (or cached_tokens) to cacheReadTokens and subtracts it from inputTokens: DSH input is uncached input. The inspector separately reports local compilation reuse, local stable-block comparison and actual server read/write fields. Missing cache fields remain UNKNOWN; full input is calculated only when cache detail is available. It stores the observed llm.stream invocation, not guessed HTTP headers or credentials. No price estimate, cache-control passthrough, keepalive or filler requests.

Reference study (read, not run or copied): SillyTavern release `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8` (2026-07-07), AGPL-3.0, actual PromptManager.js and regex/engine.js; [Prompt Manager](https://docs.sillytavern.app/usage/prompts/prompt-manager/), [Regex](https://docs.sillytavern.app/extensions/regex/), [Macros](https://docs.sillytavern.app/usage/core-concepts/macros/), [World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/), [Summarize](https://docs.sillytavern.app/extensions/summarize/). LittleWhiteBox by **biex**, commit `960b3233c90cdd7de7ac61becb7f00b05fa8a21b` (2026-09-10), actual source-boundary.js/direct-evidence-packing.js, [official docs](https://docs.littlewhitebox.qzz.io/). Its docs/LICENSE.md adds attribution conditions to Apache 2.0; no implementation/assets copied. DeepSeek [context caching](https://api-docs.deepseek.com/guides/kv_cache/) informs the current implicit-cache adapter; only exposed usage is measured. No user community preset was supplied; tests use original fixtures and style descriptions.

| Compatibility | State | Mapping |
|---|---|---|
| Chat Completion prompts/prompt_order, enabled, relative roles/order | SUPPORTED | Ordered supported entries, independent immutable import version; never auto-enable |
| Absolute depth 0/1, markers, normal/continue/quiet | PARTIAL | Before/after current task, selected novel entities/current prior prose; no invented chat history |
| Other chat depths/triggers, assistant prefill, TC/Instruct/Context templates | UNSUPPORTED | Identified, preserved and disabled with reports |
| temperature, max output, stop | SUPPORTED | Writer only; task/step budget limits still apply |
| top_p/top_k/penalties and provider cache controls | UNSUPPORTED | DSH has no public parameter; never converted into instructions |
| char/user/viewpoint, project/chapterGoal/style, getvar | PARTIAL | Explicit independent bindings, read-only snapshot variables; unresolved macro remains visible |
| date/time/random | PARTIAL | Fixed snapshot seed/date; preview has fixed values; dynamic values appear in trace |
| setvar/STscript/eval/HTML execution | UNSUPPORTED | No execution, no persistent variable mutation |
| JS regex captures/flags/multiline/ordering/enabled | SUPPORTED | Whole-text isolated Worker, bounded execution and visible traces |
| ST regex placement/edit/macros | PARTIAL | Whitelisted goal/selection/world before, prose after/display; unsupported combinations disabled; onEdit tested explicitly |
| Regex chat depth, Trim Out, script/reasoning/tool replacement | UNSUPPORTED | Preserved import diagnostics; protected protocol/schema never processed |
| Lorebook / World Info JSON entries, key/keysecondary, content, constant, disable, order | SUPPORTED | Original retained; acceptance maps to the existing world tree; repeat import is idempotent |
| World Info selective, recursion, aliases/entity links | PARTIAL | AND_ANY secondary match, depth 2, 24 nonmandatory entries, token/character budget; core/pinned rules retained or fail visibly |
| World Info advanced positions, probability and scripts | UNSUPPORTED | Reported and disabled; no arbitrary execution |
| LittleWhiteBox memory ideas | PARTIAL | Native source/version coverage, evidence recall and checkpoints; no chat floors, plugin scripts or external retrieval stack |

## Source-bound memory and temporal projection

`temporal.ts` queries accepted entities and changeset history at a chapter boundary (and optionally an exact/relative story-time label); arbitrary prose time strings are not falsely ordered as dates. Relationship identity is from/to/type, with separate states, causes, sources, visibility and each party's knowledge. New sourced versions supersede that edge at their effective chapter; historical queries retain earlier states. Character perspective filters secret data and other characters' knowledge; reader visibility is explicit. `worldRecall` includes core/pinned rules, entity links, aliases/keys and secondary matches with bounded recursion. `lorebook.ts` previews and preserves original files/reports, then accepts into unified world objects.

`memory.ts` keeps accepted original versions, chapter evidence summaries and derived checkpoint groups (default every 5 complete chapters, configurable 3–12). It never repeatedly rewrites a sole grand summary. Each record holds exact source IDs, hashes, order/branch, coverage and edit history. Scene/event causes, knowledge differences, transfers and unresolved obligations preserve quotes/modality/uncertainty. Author edits to summaries are not author canon. Accepting a reviewed chapter commits body/state/memory together; standalone neutral Summarizer proposals recheck exact sources before installing. Replays are idempotent.

Context retains recent necessary original text; uncovered accepted chapters are added in full or stop at the budget. Older evidence is retrieved by Intl.Segmenter Chinese terms, rare-name/alias exact matches, explicit IDs and related entities, narrative importance and obligations, with surrounding quotes and source versions. It excludes future/other-branch/candidate/stale material. Core/current/recent/history priorities and omissions are inspectable. Accepted body changes, rollback, ordering and branch changes invalidate affected sources/checkpoints and dependent tasks. The conservative project revision fence remains intentional. Rolling planning passes commitments/arcs/near three chapters/far volume goals/obligations as evidence for a future-only proposal; it does not pretend to prove all narrative dependencies.

Backup includes the ancestry of every effective/task configuration, raw imports, native scope snapshot, memory histories and request records. Restore creates independent IDs and a frozen local effective configuration; it never changes other projects' global default. Original configured schema-1 backups remain supported. Model usage is retained on failures when DSH supplies it; final request budget also checks tool schemas before stream invocation.

Final verified boundaries: effective compatibility reports retain and deduplicate ancestor warnings after native adaptation and backup restore. Remapped memory sources get new source hashes, so rebuilding a restored chapter does not duplicate its memory. Relationship expansion freezes its initial seed set and follows one hop; storage order cannot trigger unlimited graph expansion. Native style templates replace prior literary entries explicitly. Writer's form protocol distinguishes narrator person from the bound viewpoint's knowledge; first-person “I” is introduced only for first-person configuration. These paths have targeted integration/HTTP assertions and actual browser checks.

Evidence: `upgrade-final.json` verifies 56 automated results, actual request/version lineage, 8 unchanged old projects and 10 complete backups across the final two-service restart. `upgrade-browser.json` records manual interaction and hashes of 11 captured screenshots. Real DeepSeek returned cache-read usage for 27 requests, including retries/failures; 17 were positive, range 0–4480 tokens, aggregate read 27008. Cache writes and monetary cost remain UNKNOWN. This is observation of the actual workload, not an isolated cache-hit benchmark. No dependency was added in this upgrade; package version is 0.2.0, DSH Core remains untouched.

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

The 2026-09-15 Writer layout keeps the same React state and domain calls while separating workspace chrome into four visible layers: `WorkbenchRail.tsx` owns compact product navigation, the existing sidebar owns the current chapter/task tree, `Editor.tsx` owns the active file tab and prose surface, and the existing assistant/Director inspector remains an optional right pane. At desktop widths the rail/sidebar/main are a three-column CSS grid and Writer adds its inspector inside main; at 820px and below the tree becomes an overlay, while at 1120px and below the inspector becomes an opt-in overlay. Crossing that boundary resets inspector visibility to prevent a desktop-open panel covering a newly narrow editor. Focus mode removes both rails without changing editor state.

The visual reference was NeuroBook commit `45906272915ff43e83318653af62afa9ce668206` (public screenshot, page shell, activity bar, Markdown Studio workbench and editorial tokens). It is AGPL-3.0-only. The implementation uses only the observed ideas of a compact top bar, narrow tool rail, contextual tree, centered manuscript and line-separated assistant. No reference component, CSS, icon asset or source text was copied; existing Lucide, CodeMirror and Novel Studio theme tokens implement the result.

Writer centers prose, save status, goal and selection operations. Director centers the contract, actual stages, artifacts and interventions. Both render the same project data. Autosave has honest failure/retry and local recovery text. Diff supports full/partial acceptance. Character/world source forms, relationship graph and timeline link back to actual objects; the graph renders 30 characters at a time with a visible limit. Desktop/narrow drawers and light/dark schemes are verified in the browser.

Imports preserve raw text, allow adjusted chapter splits, and append volumes using the same ordering as export/context. Limits are 5 million raw characters and 100000 per imported chunk. UTF-8/GB18030 TXT and Markdown are the V1 path. Export uses actual UTF-8 HTTP attachment responses. Project backup is schema-versioned JSON with a checksum and all core settings, versions, tasks, artifacts, events, changesets and raw imports. Restore remaps IDs/references into an independent copy and pauses active tasks.

The standalone server binds 127.0.0.1:4317; DSH helper binds 127.0.0.1:4318. HTTP checks local host, same Origin/Sec-Fetch-Site and a JSON application header on writes; CSP/static allowlist and a 64 MiB request cap apply. This is local single-user access, not SaaS authentication or multi-host concurrent editing. Host credentials, database files and logs are ignored by Git. The helper checks owned process identity/profile and never stops an unrelated listener.

Operational/compatibility limits, evidence and final receipts are in ACCEPTANCE.md. Daily startup, configuration and the handoff demo are in README.md; recovery starts in EXECUTION_STATE.md.
