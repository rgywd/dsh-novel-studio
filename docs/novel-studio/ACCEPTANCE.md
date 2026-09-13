# 验收记录

## 0.3 原作、继承与分支验收（实施中，原有验收记录保留）

| 本轮原始场景 | 实现/验证 | 当前状态 |
|---|---|---|
| A 旧版回归/迁移 | 56旧测试通过；10实际旧项目副本/重启待验 | NOT_RUN（实际迁移） |
| B >16角色 | 60章64人HTTP导入调度/分页/17、33、64召回与写作 | PASS（替身）；NOT_RUN（真实） |
| C 密集段/预算 | 饱和细分；预算暂停重启后授权恢复；不重扫已完成 | PASS（替身） |
| D 前缀/未来泄漏 | 全60章分析在20截止重建，45死亡/50化名/早期秘密不入实际下一章请求 | PASS（替身） |
| E 章卷定位 | 序章/重名/重编号/缺章提示/前后边界/只读目录修订 | PASS（单元） |
| F 选择依赖 | 背景/省略/排除/关系丢弃及有限依赖补全 | PASS（集成）；UI NOT_RUN |
| G 有意分歧 | 前缀冲突显式retcon，A合作与B原状态隔离 | PASS（集成）；真实生成审校NOT_RUN |
| H 资料包 | 无小说正文人物+世界→真实项目 | PASS（替身）；实际生成NOT_RUN |
| I 分支隔离 | A改动不影响源/B；新增源版本不改旧项目哈希；引用删除阻止 | PASS（集成） |
| J 幂等恢复 | 预算/重启/事务写入故障/取消晚到/非法结构保留缺口 | PASS（集成）；归并依赖失效补测中 |
| K 双模式 | 导入→接续→首章→人工蓝缎带→下一章请求引用新版本 | PASS（HTTP替身）；真实/UI NOT_RUN |
| L 规模/实际质量 | 千级列表性能、真实抽取召回与声音/连贯性 | NOT_RUN |

当前命令：npm run typecheck / npm run build / npm test，62 PASS，证据source-slice-tests.txt。source-fixture明确原创人工构造，模型替身按标记解析，验证调度与隔离，不证明真实语义召回或文学质量。原始材料、真实模型和浏览器必须分开验收，后续完成后更新本表，不能仅依据此切片宣布完成。


## 当前增量升级 A–H（独立于下方已完成 V1）

起点 `7839613`。升级前 `npm run typecheck` 与41项完整回归 PASS；证据 `evidence/upgrade-baseline-*.txt`。8个旧作品先备份再增量迁移，回执 `evidence/upgrade-backup-receipt.json`。本轮0.2.0验收 A–H 已收口，56项自动测试、真实模型与实际浏览器分别通过；以下不借用历史 V1 的 PASS。

| 本轮场景 | 实现与实际验证 | 状态 / 证据 |
|---|---|---|
| A 旧版数据与双模式迁移回归 | `store/domain/config` 增量schema2，两代备份恢复为独立副本；8/8升级前作品的项目、对象、正文版本、任务、产物和导入哈希相同。最新构建实际重启4317/4318后，10/10项目完整备份校验和相同。 | PASS；`upgrade-old-projects.json`、`upgrade-runtime.json`、`configuration.test.ts`、`upgrade-http.test.ts` |
| B 预设、顺序/角色/宏、任务隔离和固定版本 | `config/compiler` 原文件/转换/未支持报告、两种编排、范围来源、固定任务快照；真实上传包含启停/排序/角色/深度/宏的原创样例，预览与实际请求核对；Writer生效，Reviewer/Summarizer/Extractor结构合法。祖先警告在适配/恢复后仍可见。 | PASS；`compiler-unit.test.ts`、`configuration.test.ts`、`upgrade-real.json`、`upgrade-import-report.png` |
| C 三阶段 regex、原始响应、非法规则与隔离终止 | `text-pipeline` 完整文本Worker、500ms可终止隔离、中文/跨行/捕获组、非法规则、替换次数上限、回放不叠加。HTTP验证发送前/生成后/展示独立，接受后资料来自相同候选版本；浏览器运行/关闭单规则、高耗时与非法输入均能结束。 | PASS；`configuration.test.ts`、`upgrade-http.test.ts`、`upgrade-regex-error.png` |
| D 关系/世界时态、单方知情和有界召回 | `temporal/context/lorebook` 按章/视角/来源查询；早期信任和后期决裂、单方秘密与未来状态隔离；世界必要规则保留、关键词与深度2/24条限制；关系只扩一跳。UI上传世界条目、编辑条件例外代价、搜索局部图、点边、第3/12章历史状态实际读回。 | PASS；`memory.test.ts`、`upgrade-relations-desktop.png`、`upgrade-browser.json` |
| E 长篇证据召回、覆盖缺口、失效重建与晚到保护 | `memory/context` 40章原创合成Fixture，37章摘要、3章缺口、7封存段；邝昶/阿晷别名、早期物品转移、因果和义务召回；18000字符预算，未来/其他分支/未接受排除；修订/改序/分支/回滚/晚到/锁定失效、恢复后重复总结幂等。真实旧摘要失效、精确原文跳转通过。 | PASS；`memory.test.ts`、`upgrade-http.test.ts`、`upgrade-source-handoff.png`、`upgrade-final.json` |
| F 确定性编译、稳定前缀与真实缓存计量 | 同快照编译一致；仅动态目标变化时稳定块一致；文风/核心修改更新依赖；比较最终角色/模型/工具schema请求及最早变化。27次实际服务读量回执中17次大于0，0–4480 token；写入量UNKNOWN。输入总数按SDK未缓存+缓存读取字段校验，不重复计数。 | PASS；`compiler-unit.test.ts`、`configuration.test.ts`、`upgrade-request-cache.png`、`upgrade-final.json` |
| G 双模式完整升级闭环 | 真实预设/正则→首章935字接受→记忆→接管归还钥匙→旧资料失效→中性刷新→第二章1025字引用新版本；原始响应/候选/正文/状态校验。另用实际浏览器上传配置、演示首章644字、接管地图新事实、委派下一章和记忆2章覆盖。演示不充当语义效果证据。 | PASS；`upgrade-real.json`、`upgrade-http.test.ts`、`upgrade-browser.json`、`upgrade-director-real.png` |
| H 三种文风的真实可读样本 | 同目标/输入版本、默认与两种原生配置；逐篇阅读完整样本，默认第三人称、冒险第三人称限知短段行动、对白驱动第一人称邝昶。禁用表达未出现。852/567/763字候选均未接受；567字偏短明确记录，不作为完整章节验收。 | PASS；`upgrade-style-review.json`、`upgrade-style-samples.md`；首轮/中间失败保留 |

本轮五类证据分别记录：

| 类型 | 命令 / 方法 | 结果 |
|---|---|---|
| 单元 | `npm run test:unit` | 11 PASS / 0 FAIL / 0 skipped；`upgrade-test-unit.txt` |
| 集成 | `npm run test:integration` | 43 PASS / 0 FAIL / 0 skipped；`upgrade-test-integration.txt` |
| 确定性提供方HTTP E2E | `npm run test:e2e` | 2 PASS / 0 FAIL / 0 skipped；`upgrade-test-e2e.txt`，不等于真实模型 |
| 真实已配置模型 | `npm run smoke:upgrade -- --continue` 与有限修复重测、完整人工读稿 | PASS；`upgrade-real.json`、`upgrade-style-review.json`，没有增大失败任务预算 |
| 实际浏览器与视觉 | in-app browser，1280x900/390x844、深浅主题、原生文件选择器与真实页面交互 | PASS；`upgrade-browser.json`，11张截图带SHA256，最终error console为空，viewport已重置 |

`npm run typecheck`、`npm run build`：PASS。`node scripts/upgrade-final.mjs` 是不调用模型的最终读回，核对日志计数、样本hash/人工读稿、源版本与已接受正文、失效记忆、当前覆盖和服务端缓存计量，写入 `upgrade-final.json`。`node scripts/upgrade-runtime.mjs capture` → 用 `serve.ps1 -Restart` 重启两个自有服务 → `node scripts/upgrade-runtime.mjs verify` 验证完整持久化。`upgrade-tests.txt` 是中途51项测试的历史记录，最终结果以分类56项回执为准。

可复核真实作品：`project_fbc9e2a1-059a-4735-a987-6ed9eb38f068`，修订17；第二章任务 `task_4f197e8e-fc94-4295-893d-ea168881d858`，7次调用（含审校重试），使用作者版本 `version_14ffe512-affc-4037-8708-a7b9658da21f`。两章主线记忆已覆盖；第三章是独立静态文风输入Fixture，保留未总结缺口。最终第二章Writer实际缓存读256/写UNKNOWN，总输入15603、未缓存15347、输出969，首token888ms、总耗时6949ms；检查器显示实际DSH参数，不冒充下游HTTP抓包。

真实失败保留：`upgrade-extractor-failure.json` 包含过宽 enum 导致的三次输出失败；同任务后续引文不匹配，5次预算耗尽后暂停，不增大预算。修正schema后另开限定最多6条候选的抽取验收，成功。`upgrade-style-initial.json` 保存首轮第一人称失败；`upgrade-style-viewpoint-failure.json` 保存第二轮因视角说明引入“我”造成的冒险人称错误。修正形式协议、按人称生成视角说明后有限重测，完整阅读并核对原配置与禁用表达，最终PASS。全部28条请求记录中21条COMPLETED、6条FAILED、1条历史PREPARED（预算边界未发送）；历史记录不改成成功，最终代码已将请求准备记录移到预算校验之后。

本轮未完成项：无；外部阻塞：无。此结论限定在 ARCHITECTURE 的兼容子集和已测环境。未提供用户社区预设，不能宣称全社区兼容；任意脚本和其他厂商缓存对象/TTL不属于本轮实现。服务端缓存写量和费用UNKNOWN是接口可观测边界，不填零。文风和审校仍是模型建议，无法保证每次完全遵守；567字样本的篇幅不足不是文学质量PASS。关系查询不对任意自然语言时间强行排序，超预算核心资料明确暂停。

## 历史 V1 验收

2026-09-13（Asia/Shanghai）。状态：PASS / FAIL / BLOCKED / NOT_RUN。保留全部原始 V1 场景 A–L。最终实现提交 `b4ea427`；下列收口仅更新文档与证据，没有再修改实现。

## 原始场景与结果

| 场景 | 对应实现和实际验证 | 状态 | 证据 |
|---|---|---|---|
| A 创建、保存、刷新、重启、保存失败 | `domain.ts` / SQLite 版本与事务；作者保存与旧修订拒绝测试。浏览器实际停止本项目服务后编辑，显示保存失败，重启后重试并刷新。最终两个实例重启，8 个作品的修订、全部对象哈希、正文版本、任务状态及用量均相同。 | PASS | `test/domain.test.ts`；`evidence/save-failure.png`；`evidence/runtime-final.json` |
| B 导演第一章 → 作者接管改事实 → 第二章继承 | 共用 Domain；确定性 HTTP/运行器闭环，真实 DSH 模型闭环，以及浏览器接管、保存、委派和 Context Trace 操作分别验证。真实第二章使用作者版本 `version_80b6b9ee-b926-4dcb-8956-396e535bacb9`。 | PASS | `test/runtime.test.ts`；`evidence/real-final.json`；`evidence/context-handoff.png`；`evidence/director-real-desktop.png` |
| C 接管后旧调用晚到 | 对象修订、项目修订、任务 epoch 和接受前校验。忽略 AbortSignal 的测试提供方在作者保存后返回，不能覆盖正文，只保留过期产物。 | PASS | `test/runtime.test.ts` 的 C；`test/guards.test.ts` 的 cancel-late；`evidence/test-integration.txt` |
| D 规划与事实隔离 | 候选与计划不进入正式事实；状态刷新不沿用过时章纲；梦境、传闻事件保持原叙述层级。 | PASS | `test/context.test.ts` 的 D；`test/guards.test.ts`；`test/workbench.test.ts` |
| E 冲突、来源、定位与局部处理 | 唯一钥匙持有冲突引用本章原文及已有来源；回忆、明确取回、角色 ID/姓名等价测试避免误报。实际 UI 展示冲突、定位句子，作者局部修改后重新审校并接受。 | PASS | `test/review.test.ts`；`evidence/consistency-conflict.png`；`evidence/browser-final.json` |
| F 有限连续创作、长度、预算与状态继承 | 3 章范围上限、调用与输出预算、两轮修复上限。真实连续两章目标各 4000 字，实际 4232 / 4830；11/18 次调用、34726/100000 实际输出 token；后章上下文引用前章已接受版本。 | PASS | `test/runtime.test.ts` 的 B/F 与 F/H；`evidence/real-final.json` |
| G 暂停、磁盘重启、恢复与幂等 | 在第二章规划进行中请求暂停，提供方仍晚返回；关闭并重开 SQLite/Runner，再恢复。第一章已完成步骤不重跑，已接受正文及事实不重复，原预算保持。实际宿主重启的数据读回另有验证。 | PASS | `test/runtime.test.ts` 的 G；`evidence/test-integration.txt`；`evidence/runtime-final.json` |
| H 超时、结构失败、保存失败、预算、部分成功、取消晚到 | 有限重试、逐次用量、部分草稿、事务注入失败、过期产物和检查点测试。浏览器实际保存故障；真实模型初期 schema/证据失败及 16 次预算耗尽记录保留。 | PASS | `test/runtime.test.ts`；`test/guards.test.ts`；`test/domain.test.ts`；历史证据见下文 |
| I 回滚与未来重规划 | 回滚撤销/重建派生事实、状态和下游任务；作者明确覆盖的事实不会复活。重规划先预览影响，仅作用未锁未来章；原子应用、幂等撤回，不能覆盖随后人工修改。UI 实际接受并撤回一次未来重规划。 | PASS | `test/domain.test.ts`；`test/guards.test.ts`；`test/workbench.test.ts`；`evidence/replan-diff.png` |
| J 导入、导出、备份与恢复 | TXT/Markdown 原文保留、可调整拆分、正文导出、校验和备份和完整 ID/版本重映射。浏览器上传原始 Markdown、修改拆分标题、触发下载、上传备份并打开恢复版本。 | PASS | `test/domain.test.ts` 的 J；`test/http.test.ts`；`evidence/restored-versions.png`；`evidence/browser-final.json` |
| K 真实界面 | 书架、空态/未配置模型、Writer/Director、任务详情、人物/世界/关系表单、关系边、Diff/部分采用、接管、失败重试、导入恢复均实际操作。桌面 1280 与窄窗口 390，深浅主题与抽屉，未出现水平溢出；最终 DSH error console 为空。 | PASS | `evidence/browser-final.json` 记录操作与 15 张截图哈希；不是静态页面或截图模拟交互 |
| L 长篇上下文 | 超过 100 万字符的合成作品，按章节、实体及来源筛选；去重与字符预算生效；锁定资料超限时显式停止；旧摘要剔除，计划不变成已发生事实。 | PASS | `test/context.test.ts` 的 L；`evidence/test-unit.txt` |

## 五类验证分别记录

| 类别 | 实际执行 | 结果 |
|---|---|---|
| 单元 | `npm run test:unit`，上下文/审校/计数 | 9 PASS，0 FAIL |
| 集成 | `npm run test:integration`，Domain/Runner/保护/工作台/原生 DSH ToolRuntime | 31 PASS，0 FAIL |
| 确定性提供方 E2E | `npm run test:e2e`，真实 HTTP 服务与完整持久化链路 | 1 PASS，0 FAIL；明确不等于真实 AI |
| 已配置真实模型 | `npm run smoke:real -- --continue`，原生 DSH `deepseek-official / deepseek-flash`；额外方向选择和资料抽取 | PASS；包含修复后的有限续跑，原失败和消耗保留 |
| 浏览器交互与视觉 | 实际 in-app browser 操作 4317 与 4318，桌面/窄窗口、深浅主题、模型成果和故障处理 | PASS；见 `browser-final.json` 与截图 |

`npm run typecheck`、`npm run build`：PASS。总计 41 项自动测试，无跳过。`evidence/automated-final.json` 及 `typecheck.txt`、`build.txt`、`test-*.txt` 是最终回执。Node 原生 SQLite 的 experimental warning 是该运行时已知提示，测试退出码为 0。

基线：初始 novel 目录为空，无可运行基线。另一个 `D:\workspace\DSH` 检出 `16838a9` 的 `pnpm typecheck`、`pnpm -r test` 均通过；保留全部用户未提交修改。它锁定的 DSH 0.1.1-rc.2 与本机安装 0.1.5-rc.1 不同；插件面向并验证安装版本，没有修改 Core。

## 真实模型与可复核作品

- 成功作品 `project_08a514b1-1198-4741-9ac0-836da5d3764d`，修订 12。开书、第一章、作者修改后的第二章和两章连续创作全部已接受。正文、状态、产物、每次调用用量和 Context Trace 已持久化。首章原限制不允许转交；作者明确改了正文及转交规则，并补足交接地点/取出物品的证据，旧版本保留；没有靠放松检查器抹掉冲突。
- 第二章任务 `task_2dc7a7f9-ee89-4cc1-9fa9-7e8a8242d785`：6 次调用、11937 实际输出 token；使用作者新版本而非旧聊天。
- 两章任务 `task_9aa05bda-94ed-4379-9da3-be0fccbc6881`：4232 / 4830 字；11/18 次调用，34726/100000 输出 token。真实回执不是费用估算。
- 方向作品 `project_a1bd5917-88f8-4b54-bc7b-f88fe5814a99`：浏览器选择“投递坐标”方向 B，生成并接受新的校准天线世界与人物资料，而非继续沿用方向 A。
- 抽取作品 `project_859081f7-7f04-4e57-ad4e-32ff3263a33f`：按两章分别抽取，3/8 次调用、2059 token；UI 接受两份抽取产物后，15 个对象（含 6 条事实）仍为有来源的 uncertain/candidate，尚未冒充作者确认。
- `evidence/real-final.json` 是最终只读核对：正文哈希、版本引用、连续章依赖、预算、候选隔离和每条抽取引用均检查；`real-smoke.json`、`real-extra.json` 保存执行历程。真实调用只发送本任务原创验收内容及所需上下文，没有上传无关用户作品或代码。

## 失败与修复没有被隐藏

初期真实结构化输出存在字段错误、输出截断、缺少关键物品状态和错误的来源对象引用。按实际字段错误修复 Prompt/schema、原生结构化返回和相关实体召回，保留旧产物后重新审查。最初抽取把 holder/state 当成事实顶层字段，现已在 schema 中强制 property/value；新增回归测试并用真实模型重测。

`real-smoke-initial-failure.json`、`real-smoke-development-failures.json` 以及累计的 `real-smoke.json` 保留失败回执。早期作品 `project_5c52031c-dabb-4fd5-9180-a5f5e6782aa8` 仍在耗尽 16 次预算后暂停，没有增大预算、删除数据或改成完成。它与成功作品最初使用同名，可依据修订 12/四章正文识别成功作品。

浏览器验收中曾发现 Blob 下载没有可见下载事件、窄窗口顶部重叠、选中任务仍被新建表单占据、关系边箭头/可访问性和旧草稿重复问题；均修复后针对性重测。最终导出使用真实 HTTP attachment。浏览器下载事件已观察；下载目录文件内容没有直接读取，备份恢复使用同一个下载接口保存的响应并通过文件选择器上传，不能将两者混为一谈。

最终重启验证脚本首次比较了“JSON 省略字段”与“JS undefined 字段”，误报差异；改为比较序列化表示后全部对象哈希相同，无产品代码改动。最终模型只读核对脚本的临时字段访问错误同样只修正了验证脚本，没有改变作品或验收标准。

## 适用范围和实际限制

- 已验证 Windows + Node 24.14 + DSH 0.1.5-rc.1 + 当前 DeepSeek 模型。其他系统、DSH 版本与供应商兼容性 NOT_RUN，不据此宣称跨平台/全模型支持。
- 一次最多 3 章，每步最多自动重试 2 次，每章自动修复最多 2 轮。项目修订保守失效可能暂停本可并行的工作；作者明确重新委派后继续。外部调用不声称严格只执行一次，正式写入具备幂等保护。
- 上下文按字符预算（默认 18000，上限 48000），并非精确 tokenizer 预算；优先保存核心锁定约束。大章抽取不能在一次调用中超预算，需在导入拆分预览中继续分段；单次导入限 500 万字符、每段 10 万字符。数据索引存在，但 V1 主要采用范围、实体关系和文本匹配，未依赖向量召回。
- 抽取按章生成候选，跨章同名对象可能重复，需要作者绑定正式实体并确认事实。不会自动把同名人物合并或把推断变成正式世界状态。
- 图显示前 30 位角色，其余在人物树/列表中查询。关系的方向、来源和双方认知可编辑，不提供复杂图分析。
- 目标字数 60% 为严重短缺阻塞阈值，75%–135% 为建议区间。机械重复不会作为补足策略；文学质量及复杂语义判断仍依赖 AI 审读和作者决定，不能保证“永不吃书”。首次全自动成功率没有统计，真实验收包含有限恢复与作者处理。
- 本地单人环境，loopback 与同源写入限制；不支持多主机并发写同一 SQLite。无公网部署、平台自动发布、远端 push、费用估算或备用模型自动切换。

V1 A–L 当前无未完成项或外部阻塞。上述界限保留为可见产品约束；更多模型兼容、候选实体合并辅助与检索增强属于后续增强。启动和完整演示步骤见仓库 README。
