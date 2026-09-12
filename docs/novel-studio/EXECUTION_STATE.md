# Execution state — recovery entry

2026-09-13（Asia/Shanghai）。目标：交付用户要求的完整双模式小说创作 V1。阶段 0–5 已完成，A–L 验收通过。实现、文档与证据已收口，无需重跑开书流程或重新设计架构。

## 完成状态与下一项

- Writer 与 Director 从第一条纵向闭环起共用项目、Domain、版本、事实与任务。开书、正文生成、接管、重新委派、完整创作资料、审校/回滚/重规划、导入备份及界面精修均已实现。
- 最终实现提交 `b4ea427` 已通过 9 单元 + 31 集成 + 1 确定性 HTTP E2E，共 41 项，无跳过；类型检查与构建通过。之后仅修改交付文档与证据。
- 真实 DSH 开书 → 第一章 → 作者接管/明确修改事实规则 → 第二章读取新版本：PASS。真实两章批次目标各 4000 字，实际 4232 / 4830，11/18 调用、34726/100000 实际输出 token。
- 真实方向 B 选择、重新生成并接受开书资料：PASS。真实两章资料抽取：PASS，15 个有来源候选（6 条事实），3/8 调用、2059 token；保留 candidate/uncertain/inference 待作者绑定确认。
- 实际浏览器：保存故障/重试/刷新、模式切换与接管、选区 Diff/部分采用、人物/世界表单、可点击关系边、冲突定位/局部修复/重新审查、灵感采用、未来重规划/撤回、文件导入/下载/备份恢复；桌面 1280、窄窗口 390、深浅主题和抽屉 PASS。
- 最终重启两个本项目服务后，8 个验收作品的修订号、所有对象 SHA256、正文版本、任务状态及用量完全一致。原有 3080 服务未动。
- V1 未完成项：无。外部阻塞：无。下一项可执行工作：用户可按 README 日常运行或演示；只有新需求才开启后续实现。无需在后台继续创作小说。

## 运行状态

工作目录 `C:\Users\rgywd\Documents\novel`，Node 24.14，已安装 DSH 0.1.5-rc.1。插件已安装到独立 `novel-studio` profile，复用已配置的 `deepseek-official / deepseek-flash`。

| 实例 | 访问地址 | 最终核对 PID | 数据文件 |
|---|---|---|---|
| 日常 DSH 入口 | http://127.0.0.1:4318/novel-studio/ | 29576 | `.local/dsh-novel-studio.sqlite` |
| 离线/显式演示 | http://127.0.0.1:4317/novel-studio/ | 66788 | `.local/novel-studio.sqlite` |
| 用户既有 DSH | 127.0.0.1:3080 | 10956，保持原状 | 不操作 |

PID 可能随重启变化，使用脚本的进程回执和实际监听端口核对，不依据文档 PID 杀进程。脚本后台启动隐藏窗口。DSH stdout 可能含本地访问令牌，不打印或提交原始日志、配置及凭据。

```powershell
cd C:\Users\rgywd\Documents\novel
npm run start:dsh
# 初次检出需先 npm ci 和 npm run build；本机已完成安装和模型配置。
# 仅在代码有修改时构建并重启：
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Dsh -Restart
# 独立离线实例：
npm run start:local
```

## 验证与证据

```powershell
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e
# 会产生真实模型调用；没有必要为查看成果重复执行：
npm run smoke:real -- --continue
```

- `evidence/automated-final.json` 和 `test-*.txt`：41 项最终自动验证与类型/构建回执。
- `evidence/real-final.json`：真实模型结果的最终只读核对，含章节哈希、版本、预算、顺序继承、来源与候选隔离。
- `evidence/runtime-final.json`：两个实际进程重启后的完整对象/版本/任务读回。
- `evidence/browser-final.json`：实际浏览器操作和 15 张截图的文件哈希。最终浏览器保留 DSH 真实第二章任务，临时测试标签关闭，视口覆盖已重置；最终 DSH error console 为空。
- `evidence/real-smoke.json`、`real-extra.json` 及 `real-smoke-initial-failure.json`、`real-smoke-development-failures.json` 保留失败与修复历程。schema 字段/证据/输出截断/物品召回问题已修复重测；早期耗尽预算任务仍暂停。
- 最终只读核对脚本曾错误访问可选 source/版本字段、比较 JSON 省略字段与 undefined；修正验证脚本后通过，未改作品或产品代码。该脚本在忽略的 `.local/`，不是交付运行依赖。

## 可复核对象

成功主作品 `project_08a514b1-1198-4741-9ac0-836da5d3764d`（纸灯与归信 · 真实 AI 验收，修订 12、四章正文）；作者版本 `version_80b6b9ee-b926-4dcb-8956-396e535bacb9`；第二章任务 `task_2dc7a7f9-ee89-4cc1-9fa9-7e8a8242d785`；批次任务 `task_9aa05bda-94ed-4379-9da3-be0fccbc6881`。

方向选择作品 `project_a1bd5917-88f8-4b54-bc7b-f88fe5814a99`，任务 `task_bc33ea4b-84ff-4219-983e-c4c8a807fa0d`。真实抽取作品 `project_859081f7-7f04-4e57-ad4e-32ff3263a33f`，任务 `task_2498ee58-58e5-468b-9a78-c39b78ac35ba`。早期同名失败作品 `project_5c52031c-dabb-4fd5-9180-a5f5e6782aa8` 保留在 16 次预算耗尽后的暂停状态，不能为了美化验收而删除或增大预算。

## 关键决定、代码与 Git

完整页面插件 + 共用 Domain + 原生 SQLite schema 1 + Context Engine + 单个持久化 Runner + React/CodeMirror。DSH 复用模型/凭据/流式调用/ToolRuntime/网页注册；Core 零修改，无新增外部服务。采用项目修订保守失效、正文与派生状态事务提交、幂等键、作者接管 epoch 保护、可解释来源与叙述层级。详细边界与数据机制见 ARCHITECTURE，实际限制见 ACCEPTANCE。

`D:\workspace\DSH` 在 `16838a9` 且有用户未提交修改；仅做只读调查和已通过的基线验证，不修改、合并、stash、reset 或 clean。

关键代码为 `src/{contracts,store,domain,context,review,prompts,provider,runtime,http,plugin,server}.ts` 和 `src/ui/`；验证为 `test/`；启动/真实烟雾为 `scripts/`。新增 SQLite 属于本产品，不迁移/重置真实数据库；JSON 字段采用向后兼容增加。依赖及锁文件已固定。

本地可靠实现提交：

- `65fa545`：双模式、版本安全与有界导演纵向闭环。
- `1e3f118`：作者接管、来源状态和真实模型验证保护。
- `b4ea427`：完整创作工作台、恢复可靠性及最终 41 项验证。

本文件、README、PRODUCT、ARCHITECTURE、ACCEPTANCE 与最终 evidence 随独立文档提交收口；最终文档提交号用 `git log -1 --oneline` 获取。提交只涉及本任务。当前未提交内容：无，以 `git status --short` 核对；`.local/` 数据/日志、`node_modules/` 和 `dist/` 均忽略，不作为未提交源码。

用户授权使用 gh 创建的私有远端为 https://github.com/rgywd/dsh-novel-studio，已确认 PRIVATE，远端仍为空。未推送、未公开部署、未合并到其他仓库。

下次恢复顺序：本文件 → PRODUCT/ACCEPTANCE → 必要 ARCHITECTURE → `git status` → 最近提交 → 当前 diff。保留原始验收、可靠实现和历史失败，不基于聊天记忆另起架构。
