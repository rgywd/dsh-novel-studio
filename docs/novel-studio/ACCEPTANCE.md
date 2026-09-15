# 验收记录

## Director Agent 会话布局增量（2026-09-15）

| 检查项 | 实际结果 | 状态与证据 |
|---|---|---|
| 参考与许可边界 | 核对 NeuroBook `45906272915ff43e83318653af62afa9ce668206` 的公开 Agent 截图及四个会话组件；许可证 AGPL-3.0-only。只重做可观察布局，不复制源码、CSS 或素材 | PASS；PRODUCT/ARCHITECTURE、`evidence/director-layout-20260915.json` |
| 真实会话导航 | Director 左栏使用实际 CreativeTask，支持搜索和选择；从 Writer 切入且没有当前任务时自动打开本项目最新任务，没有复制旧任务列表或制造演示会话 | PASS；1280×720 实际 CUA 操作，搜索“第4章”后清除并恢复完整列表 |
| 执行流与控制 | 中央显示真实用户委派、持久化 RunStep、部分输出、产物和事件；暂停/恢复/取消/重新委派、查看、接管、请求检查与新任务完整选项仍调用原逻辑 | PASS；实际完成任务检查、输入区展开/收起、任务约定收起/恢复 |
| 桌面布局与主题 | 1280×720 浅色/深色均检查；任务约定收起后中央扩展，body/workspace/director 无水平溢出，console error/warning 为空 | PASS；结构化回执和实际页面检查 |
| 窄屏布局 | 已实现 1280/1120/820/560px 响应式规则；当前 CUA 页面无法调整视口，本次没有实际操作新 Director 窄屏 | NOT_RUN；不借用 Writer 或历史 Director 截图宣称通过 |
| 回归与运行态 | `npm test` 74 PASS、0 FAIL/skip；typecheck/build PASS；4318 最终构建可用；无模型调用、正文或数据库变更 | PASS；`evidence/director-layout-20260915.json` |

本次只改变 Director 的信息结构和显示密度，原有 A–L、任务状态机、版本保护及写作/导演共享数据条件全部保留。参考项目仍可能变化，本记录只描述已核对提交。

## Writer 编辑器布局增量（2026-09-15）

| 检查项 | 实际结果 | 状态与证据 |
|---|---|---|
| 参考与许可边界 | 核对 NeuroBook `45906272915ff43e83318653af62afa9ce668206` 的公开截图、页面壳、功能轨、Markdown Studio 与 editorial token；许可证 AGPL-3.0-only。只重做可观察布局思路，不复制代码、CSS 或素材 | PASS；PRODUCT/ARCHITECTURE 的参考记录 |
| Writer 桌面布局 | 1280×720 实际页面显示紧凑顶栏、功能轨、章节树、带保存状态的章节标签、正文与 AI 助手；助手收起/恢复后正文实时扩展 | PASS；`evidence/writer-layout-20260915.json`、实际 CUA 操作 |
| 入口与双模式 | 功能轨实际打开人物页并保留全部产品入口；Writer→Director 正常切换，导演仍以任务为中心，未改变接管、保存或任务协议 | PASS；实际 CUA 可访问树和截图检查 |
| 响应式和主题 | 390×844 body 390/390、工具栏 346/346，无水平溢出；44px 功能轨保留，章节树为 270px 覆盖抽屉且正文宽度不变，AI 默认收起；浅色/深色均检查 | PASS；`evidence/writer-layout-20260915.json` |
| 回归与运行态 | `npm test` 74 PASS、0 FAIL/skip；typecheck/build PASS；4318 重启后页面可用，console error/warning 为空；无模型调用、正文或数据库变更 | PASS；本节命令与结构化回执 |

本次布局不变更原有 A–L 验收条件、API、schema、模型或作品状态。浏览器临时 390×844 设备指标已清除，用户浅色主题已恢复。参考项目仍在快速开发，本记录只描述已核对提交，不宣称两者功能等价。

## 0.3 原作、继承与分支验收（已完成；原有验收记录保留）

起点f271345，56旧测试和类型检查先建立基线，保留10份旧项目备份。74项最终自动验证均PASS；真实DSH、实际浏览器、重启持久化单独核对。总回执 [source-final.json](evidence/source-final.json)，最新实现切片f782ecf；后续交付提交见git log。本表保留本轮原始A–L，不用上轮PASS代替本轮验证。

| 原始场景 | 实现与实际验证 | 状态与证据 |
|---|---|---|
| A 旧版/迁移 | schema3增量迁移；全部56旧回归保留；10/10升级前作品完整项目备份校验和相同，最终11项目两服务重启读回不变 | PASS；source-final.json、source-final-runtime.json、分类测试 |
| B 数量限制 | 60章64人经真实HTTP导入和确定性抽取调度；17、33、64可搜索/勾选/入书/相关上下文使用；UI跨页筛选全选及第二独立作品均64人。真实模型另外发现24/24已知具名角色 | PASS；source-http.test.ts、source-browser-fixture.json、source-real.json。真实64人未运行，不冒充已测 |
| C 密集段/预算 | 单段20人触发16批容量细分；预算暂停、数据库重启、显式增加后续跑，无重扫已完成或重复实体；结构无效/取消晚到保留缺口。真实18调用/6段完成 | PASS；source-integration.test.ts、source-http.test.ts、source-real.json |
| D 未来边界 | 全60章分析截20后重建视图，排除45死亡/50化名和“第5章前秘密”的后期揭露；检查实际任务输入、上下文、scope和资料，不只正文。真实5章源只发送前3章，分支22次请求无隔离信息 | PASS；source-boundary.test.ts、source-http.test.ts、source-real.json |
| E 章卷定位 | 章后含N/重写不含N，卷前/后、序章、同标题、编号重置和缺章警告；目录修订新版本，原文不变 | PASS；source-unit.test.ts，实际UI目录/边界 |
| F 选择/依赖 | 字段/类别/实体选择；背景和明确排除区分；关系丢弃/替代/最小补全，未选择感情线不复活；必要字段不完整则阻止激活；跨页真实UI创建65项独立基线 | PASS；source-integration/source-boundary测试、source-browser.json |
| G 有意分歧 | 敌对→合作明示覆盖；前缀内推翻需retcon；生成/审校使用本书契约，原敌对引用不进入生成；锁定规则仍检查，不改A/B/原文 | PASS（正常Runner确定性集成）；source-integration.test.ts。此方式未额外进行真实模型专测 |
| H 无连续正文资料包 | 原创人物/世界文本资料→选择版本→新项目→正常Runner第一章接受；无需完整小说或模型补官方设定 | PASS（确定性集成）；source-integration.test.ts。UI另外从同来源建立独立同人；资料包真实模型专测NOT_RUN |
| I 分支/源隔离 | 同一来源A修改不影响B及源；新版本不变旧基线；已激活项目备份恢复保留独立映射，引用来源删除被拒绝，非级联 | PASS；source-integration/source-boundary测试；实际两本64人项目读回 |
| J 中断/幂等/修订 | 分段暂停/取消/重启/无效结构，激活事务索引/写入故障回滚，重复激活单一projectId；人工归并/拆分/撤销使依赖失效，档案晚到隔离不覆盖；来源状态最终重启校验 | PASS；source-integration/source-boundary测试、source-final-runtime.json |
| K 双模式闭环 | 实际上传源→截至3章建书→真实第4章→Writer接管并归还钥匙→新版本同步→真实第5章以新持有者开场；最终记忆2/2对应同版本。配置/正则/Inspector仍接在既有路径 | PASS（真实DSH+浏览器+HTTP替身）；source-real.json、source-real-samples.md、source-browser.json |
| L 规模/实际质量 | 千级元数据列表/搜索/全选/局部图各12次；实际24人抽取和两篇完整续写读稿，区分别名/误归类与证据准确性，不用AI评分 | PASS；source-scale.json、source-real.json的人读记录。不是千人语义全召回证明 |

### 五类证据与命令

| 类型 | 运行方式 | 实际结果 |
|---|---|---|
| 单元 | npm run test:unit | 16 PASS、0失败/跳过；source-test-unit.txt |
| 集成 | npm run test:integration | 55 PASS、0失败/跳过；source-test-integration.txt |
| 确定性HTTP E2E | npm run test:e2e | 3 PASS、0失败/跳过；source-test-e2e.txt。新64人来自导入与抽取，不是直接插DB |
| 真实模型 | 4318配置的deepseek-official/deepseek-flash；node scripts/source-smoke.mjs capture为保留作品的只读复核 | PASS；18抽取+10首章+5次章+7精修复核=40次调用（含失败），均有真实usage/最终产物 |
| 浏览器/视觉 | CUA真实应用，1280×900与390×844，恢复窗口覆盖；13张已查看截图 | PASS；source-browser.json。4320是隔离确定性验收，4318为真实DSH，二者不混计 |

类型检查和build均PASS，source-typecheck.txt/source-build.txt。source-final.mjs只读核对自动结果、真实版本/记忆/原文、10旧作品、重启回执和截图哈希；它不会生成小说。source-browser-fixture.ts复用完整应用与独立SQLite，仅用于可重置测试，不是产品运行依赖或另一套Demo；临时端口/标签已关闭。

### 真实抽取、读稿与失败恢复

原创test/fixtures/source-real.md为5章24具名角色，截止第3章，后2章含死亡/身份/早期秘密的晚揭露。实际发现24/24，4组同名重复候选（6次人物合并，另有4次地点/物品合并，共10次人工决定）根据原文职责与连续行为归并；额外“失主”可作背景，“南岸的值守者”是群体误分类，不能称100%语义精确率。总77处引文均由程序验证存在，不能由此证明每一条结论都被引文完整蕴含。67个归并后素材中9项不明结构/未证实结论明确不继承，58项激活（56主要、2最小背景），未删原记录。深入档案按需，不影响已经可写。

首章原生成1027字、作者交还钥匙后1128字，第二章1251字（目标各1000，字数口径为汉字/Latin词数字，不含标点）；人物报数、先核对、逐项画线的语言区别在两章可观察，缺页保持未决。真实Writer请求request_b0394839-fcb9-4c7d-a6e3-694d0f3b9062使用第4章作者version_152189ba-2757-487e-8b07-e371c3a0d92b。作者修正一处病句及第二章两处“三星五”；最终第5章version_9e1c153a-1bde-4b4a-94ae-43f1edb53c7f为1581字符，与原候选只差两处错字，未采用无关扩写。完整raw/正则后候选/已接受文本见[source-real-samples.md](evidence/source-real-samples.md)。

保留的失败包括：末尾额外闭括号；审校错引历史义务或任务目标；结构化输出截断；预算不足；稳定规则混入本章测量信息触发保守冲突。分别通过精确语法诊断、真实任务证据、有限中性抽取协议和修复范围修正后恢复，未放宽证据/锁定/版本检查；成功规划与正文不重跑。精修任务显式预算4→6→8调用，实际7次、28662输出token完成；预算并未自动扩张。原先不必要的扩写只保存在步骤中，没有覆盖作者正文。

一次浏览器测试自动化误将虚拟化CodeMirror DOM当成完整正文，产生601字符的临时编辑；已用实际“版本→恢复”恢复，再从完整版本文本精确修正两处错字。最终长度、完整哈希、接受版本与记忆逐项读回；错误版本保留，不能将其视为产品自动保存丢字。最终服务重启保留原文与版本。

真实缓存统计：40次DSH回执均有缓存读字段，33次>0，合计62592读token；cacheWrite与费用UNKNOWN。这包含抽取/生成/审校/失败/重试，不是固定负载命中率。单个Writer示例：总输入19818=未缓存19178+缓存640，输出1140；首token633ms/总7996ms。检查器同时展示本地编译MISS与稳定块相同，不混称服务端缓存命中。

千级性能仅直接合成元数据，不作为数量抽取验收：Intel Core Ultra5 225H、14线程、31GiB、Windows/Node24.14；分页40中位13.14ms，搜索15.39ms，筛选全选13.53ms，局部图14.98ms；各12次最大分别23.35/18.71/19.01/19.96ms。没有百万字实时吞吐或无限规模承诺。

### 兼容与当前限制

- SUPPORTED：UTF-8/BOM/GB18030的TXT/Markdown、人物/世界文本资料包、目录修订版本；明确章卷边界、选择/背景依赖/原子创建、当前双模式、来源证据与作者覆盖。
- PARTIAL：机器语义抽取可能漏识别、同人重复或群体误分类；精确引文验证不等于语义事实证明。动态自定义属性在独立模板默认不继承，作者可明确勾选。新源版本通过比较+新清单/独立副本选择升级，无自动多分支合并。author-reference材料当前只供作者隔离阅读，不进入规划模型。
- UNSUPPORTED：可选EPUB解析、自动采集/DRM绕过/外部发布；完整受保护小说未放入测试仓库。源码参考不复制，也没有把公开可读或“非商业”当成内容授权。
- 资源：每源版本20份/500万解码字符、单文件20MB、HTTP64MiB；抽取16单批不是角色总数；局部图30、UI分页30/40不影响全量选择导出。请求检查器保留最近100次，来源证据和正文版本独立保留。
- 自由文本规则/状态的语义复述仍可能触发需审阅的风险。文学质量无客观保证；模型预训练中可能知道原作，不宣称让模型绝对遗忘。此实现负责允许数据隔离与引用追踪。

本轮核心未完成项：无。外部阻塞：无。可选EPUB未实现，以及额外真实64人/独立资料包/分歧模式模型专测未执行，均在上述边界内明示，不把它们标成通过。所有真实生成仅限原创验收材料和已配置授权DSH服务，未推送远端或部署公网。

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
