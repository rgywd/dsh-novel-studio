# DSH Novel Studio

本地小说创作工作台：作者主导的 Writer 与有范围、有预算、有检查点的 Director，共享同一本作品、正文版本与事实状态。

V1 本地交付已完成，原始验收 A–L 通过。41 项自动测试、真实 DSH 模型、浏览器操作与重启读回分别留有证据；开发期间的失败和过期产物保留在 [验收记录](docs/novel-studio/ACCEPTANCE.md) 中。

- Writer：CodeMirror 正文、自动保存与失败重试、撤销重做、选区 AI、Diff 与部分采用、版本恢复、专注布局。
- Director：开书方向、有限章节创作、审校修复、未来重规划、资料抽取和剧情推演；任务约定、预算、事件、产物与恢复持久化。
- 共享资料：分层大纲、人物树与关系图、世界树、时间线、伏笔、事实来源、灵感、导入导出和完整项目备份。
- 人机交接：查看不终止任务；接管保护作者版本，旧调用只能成为过期产物；重新委派从新正文重建状态。

## 在 DSH 中运行

需要 Node.js 24.14 或更新版本，以及已配置模型的 DSH 0.1.5-rc.1。当前开发目录为 `C:\Users\rgywd\Documents\novel`。

```powershell
cd C:\Users\rgywd\Documents\novel
npm ci
npm run build
```

首次安装到独立的 DSH 配置（本机已完成）：

```powershell
dsh --profile novel-studio --from-default-profile web --dump-config | Out-Null
dsh plugin --profile novel-studio add C:\Users\rgywd\Documents\novel
```

启动：

```powershell
npm run start:dsh
```

打开 [DSH Novel Studio](http://127.0.0.1:4318/novel-studio/)。模型连接和凭据由 DSH 管理，在 DSH 的 Models 设置中选择模型。任务的“均衡创作”优先使用模型公开支持的非推理模式，否则使用低推理档；也可以按任务沿用 DSH 配置。实际调用配置和 token 用量会进入步骤记录。

修改代码后：

```powershell
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Dsh -Restart
```

服务重启会将中断任务保留为暂停状态。打开任务后选择恢复；作品已变化时，选择重新委派。

## 独立写作与演示

```powershell
npm run build
npm start
```

打开 [本地写作实例](http://127.0.0.1:4317/novel-studio/)。此入口支持离线编辑、导入、备份和显式演示模型，真实模型需要通过 DSH 插件入口使用。

两个运行实例默认使用不同的 SQLite 文件，避免两个服务同时写一个库。每个实例内 Writer 与 Director 共享作品。推荐日常使用 DSH 入口。

## 从第一章到下一章

1. 在书架选择“我有一个灵感”，填写作品名与一句前提；已有小说选择 TXT/Markdown 导入。
2. 在 Director 选择“从灵感开书”，填写目标，检查自动接受与预算，然后执行。
3. 选择“创作章节”，填写目标字数与禁区。真实草稿、审校、状态提交会依次出现在任务中。
4. 从成果跳到 Writer，点击“接管并编辑”。修改正文后检查“已保存”和修订号。
5. 再到 Director 委派下一章。运行器先从作者最新正文重建状态，再构建下一章上下文。
6. 在成果的“资料依据”查看所用正文版本、来源和省略原因；重大问题会暂停并展示可处理的审查成果。

本机已有“纸灯与归信 · 真实 AI 验收”的成功作品：修订 12，四章正文。可直接查看第二章任务的资料依据及两章 4000 字任务。另一个同名早期验收作品保留了预算耗尽的暂停记录；成功作品 ID 为 `project_08a514b1-1198-4741-9ac0-836da5d3764d`。

书架的原创演示会新建独立示例作品，可重复创建。演示内容明确标注为固定测试样本，不能用来判断真实 AI 的创作质量。

## 保存与迁移

- DSH 实例：`.local/dsh-novel-studio.sqlite`。
- 独立实例：`.local/novel-studio.sqlite`。
- “导入、导出与备份”支持 UTF-8 / GB18030 TXT 和 Markdown、拆分预览、原文保留、正文导出和带校验和的完整 JSON 备份。
- 恢复备份会创建独立副本，保留正文版本、设定、来源和任务关联。
- 运行中的数据库请通过应用备份。手工复制 SQLite 文件应先停止对应服务。
- 本地日志在 `.local/`，不进入 Git。DSH 日志可能含本地 Web 访问令牌，请勿分享未经处理的日志。

## 验证

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
npm run smoke:real
```

真实烟雾测试使用已配置的 DSH 模型，在独立原创验收作品中执行开书、章节生成、作者修改、状态继承与有限连续创作。它会产生真实模型调用；失败时保留作品、草稿和回执。修复后用 `npm run smoke:real -- --continue` 从已有验收断点继续，总任务预算不会自动增加。

证据保存在 `docs/novel-studio/evidence/`。浏览器检查通过实际运行的前端完成，与确定性提供方测试及真实模型验证分别记录。

当前结果：9 单元 + 31 集成 + 1 确定性 HTTP E2E 全部通过；类型检查、构建通过。真实 `deepseek-official / deepseek-flash` 完成开书、第一章、作者修改后的第二章，以及两章连续创作（4,232 / 4,830 字，11 / 18 次调用）；另外验证了方向切换和分章抽取。重启两个本地实例后，8 个作品的正文版本、对象内容、任务和用量均保持一致。

## 已知边界

- 当前验证环境是 Windows、Node 24.14、DSH 0.1.5-rc.1；其他 DSH 版本及模型供应商尚未验收。
- 每个任务最多 3 章、每章最多 2 轮自动修复。项目修改采用保守的依赖失效策略，可能需要重新委派；不会静默放大预算。
- 字数按汉字、Latin 单词和数字计数，不计标点和空白。低于目标 60% 阻塞接受，75%–135% 为建议范围；不会重复或截断文本凑数。
- 上下文以字符控制预算（默认 18,000，上限 48,000），不是精确 tokenizer 计数。单章超过抽取预算时需在拆分预览中继续分段。导入上限 500 万字符，每段上限 10 万字符。
- 抽取结果保持待确认；跨章同名候选需要作者绑定到正式实体，不自动假定是同一人。关系图同时显示前 30 位角色，其他角色在人物树中查找。
- 一致性工具提供证据、确定性约束和 AI 风险判断，不能证明文学质量或保证没有设定冲突。真实模型验收包含修复后续跑，首次尝试全部成功的可靠性尚未做统计。
- 仅在本机运行，不自动发布。模型费用不编造金额，只记录可信 token 回执或保守预留。

## 开发入口

先读 [执行状态](docs/novel-studio/EXECUTION_STATE.md)，再读 [产品约定](docs/novel-studio/PRODUCT.md)、[验收记录](docs/novel-studio/ACCEPTANCE.md) 和 [架构](docs/novel-studio/ARCHITECTURE.md)。

插件只在此仓库实现。现有 `D:\workspace\DSH` 的 Writing Studio 与未提交修改保持原状。私有仓库已创建，远端推送需要单独授权。
