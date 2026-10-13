# Between 双向 Git 开发与交接流程

仓库固定为 https://github.com/ajh99990/between，只保留两个分支：`main` 为默认分支与验收通过的稳定基线，`dev` 为唯一日常开发分支。云端和本机遵循同一流程；不再按日期、环境、任务或交接创建分支。目录用途与历史恢复点见[分支与本机目录](分支与本机目录.md)。

## 1. 开工与写入责任

先读根 AGENTS.md 和适用子目录规则，确认真实 Git 根、分支、HEAD、remote、工作区状态与当前写入负责人。核对仓库为上述 Between 仓库；含凭据的远程 URL 不得输出。

`dev` 同时只有一位写入负责人。源端交出责任后停止写入；接收方确认远端 SHA 和本机状态后才接管。不得让云端与本机同时提交、推送或修改同一个开发分支。并行评审、测试使用固定 SHA 的 detached worktree，不新增任务分支。主运行目录的 `main` 只用于接收已验收代码。

已有未提交改动不得覆盖、静默 stash 或丢弃。来源不明的改动留在原目录，先确定归属；可用 detached worktree 开展只读审查与验证。日常开发继续使用已指定的 `dev` 工作区。禁止用无 .git 的解压目录作为开发源。

普通仓库应抓取两个固定分支，避免旧单分支 clone 规则漏掉交接内容：

```sh
git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git fetch origin --prune
git branch --show-current
git status --short
git rev-parse HEAD
```

在已有 `dev` 检出里，以 `git merge --ff-only origin/dev` 接收。若本地尚无 `dev`，可在干净且未被其他 worktree 占用的目录执行 `git switch --track origin/dev`。拒绝快进时先比较双方提交，不强推、不 reset。

## 2. 在 dev 验证并推送

酒馆版使用 Node >=24；按现有锁文件安装，不为躲过失败升级依赖。完整接收验收在仓库根执行：

```sh
npm ci --prefix sillytavern/engine --ignore-scripts --no-audit --no-fund
npm ci --prefix sillytavern/admin --ignore-scripts --no-audit --no-fund
npm run setup --prefix sillytavern/admin
npm run typecheck --prefix sillytavern/admin
npm run lint --prefix sillytavern/admin
npm run build --prefix sillytavern/admin
npm test --prefix sillytavern/admin
npm test --prefix sillytavern/engine
npm run test:app --prefix sillytavern/engine
npm run test:plan --prefix sillytavern/engine
npm run test:local --prefix sillytavern/engine
```

管理员静态资源测试、`test:local` 与启动核验都依赖先完成管理端构建，不能与构建并行。UI 改动还须实际浏览器检查；Mac 可显式使用系统 Chrome：

```sh
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser --prefix sillytavern/admin
```

保持浏览器沙箱，使用隔离虚构数据，禁止把离线验收扩大为真实模型请求。报告实际测试范围；文档改动可通过产品树一致性和相关检查复用既有验证，不冒称重新运行未执行的测试。

审查完整 diff、未跟踪文件和许可证，按白名单暂存。禁止提交凭据、真实聊天、用户数据、运行配置、依赖、缓存或构建产物。原始证据的空白若需保留，记录例外并核验哈希，不加工后冒充原输出。

```sh
git diff --cached --check
git commit -m '中文说明本次变更与验证结果'
git push origin dev
git rev-parse dev
git ls-remote origin refs/heads/dev
```

本机与远端完整 SHA 必须相同。推送被拒绝时先 fetch 比较，不覆盖远端。推送失败不能用 ZIP 或散文件代替交接。

## 3. 跨端接收与验收后推进 main

交出方提供 `dev` 完整 SHA、测试范围、剩余问题，并停止写入。接收方先保护本机状态，fetch 后核对 `origin/dev` 与交接 SHA 一致。需要干净复测时可执行：

```sh
git fetch origin --prune
git rev-parse origin/dev
git worktree add ../between-verify --detach 已核对的完整SHA
```

读取接收版本的 AGENTS.md，按锁文件安装并执行相应检查。若继续开发，在指定 `dev` 目录快进到这个 SHA，再接管写入；不要在 detached 验证目录另建分支。

验收通过后，由当前负责人在干净的 `main` 检出中推进稳定基线：

```sh
git fetch origin --prune
git rev-parse origin/dev
# 在本次 fetch 后核对上行输出等于已验收的完整 SHA；不一致则停止。
git merge --ff-only origin/main
git merge --ff-only 已验收的完整SHA
git push origin main
git rev-parse main
git ls-remote origin refs/heads/main refs/heads/dev
```

执行上述命令前必须确认当前分支是 `main`；把 SHA 占位文字替换为实际核对过的 40 位提交号。必须在该次 fetch 之后核对 `origin/dev`，再合入固定的已验收 SHA，不能以可移动引用替代。若远端 `dev` 已变化，不能连带发布未验收提交。若 `main`、`dev` 分叉，回到 `dev` 逐项整合并复测，使 `main` 能保留历史地前进；禁止强推或自动选择整片 ours/theirs。

运行端再 fetch、核对 `origin/main`、快进自己的 `main`。推进 `main` 不自动授权公网部署、账号授权或付费推理。

## 4. 历史恢复、数据与运行保护

旧分支清理前列出独有提交，确认仍有用的业务改动已保留。正常祖先由 `main` 历史恢复；不能从 `main` 到达的废弃草稿可保留少量明确命名的 archive 标签，不恢复废弃界面或兼容层。标签只是恢复点，不是第三条开发线。

回滚优先在 `dev` 创建中文 revert 提交，验证后推进 `main`，不重写共享历史。不删除不明改动、用户存储或认证文件；不得读取、输出、复制或提交令牌。涉及旧运行目录时先核实 PID、端口、源码版本及数据边界。可保留旧服务在原 SHA 的 detached 检出运行，避免为改分支名而迁移数据或重启。

隔离 UI 预览可使用 `node sillytavern/admin/tests/preview.mjs`，仅绑定 localhost，使用自建临时虚构数据；不要复用用户服务端口或真实凭据。实际应用启动使用酒馆版入口，先完成管理端构建与相应启动验收。模型默认 `gpt-6.1-sol`，思考档位为 `medium`/`high`；授权元数据可用不等于已验证真实推理。

## 5. 每次交接清单

- 仓库、`main`/`dev` 完整 SHA、远端核验，以及本次已验收 SHA。
- 写入责任交出与接管状态；指定开发、验证和运行目录。
- 变更范围、许可证、独有修改处置；未提交内容及其归属。
- 安装、构建、测试和实际浏览器结果；复用既有验证时说明依据。
- 用户数据与认证文件的保护边界，运行端口、停止方式和剩余阻塞。

历史文档中的日期化分支名保留为当时事实；现行规范以本文件和 AGENTS.md 为准。
