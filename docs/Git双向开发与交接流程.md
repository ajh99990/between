# Between 双向 Git 开发与交接流程

本流程适用于云端开发后本机验证，以及本机开发后云端继续开发。两端角色互换，步骤一致。仓库为 https://github.com/ajh99990/between；独立分支的 push 只保存协作版本，不代表产品发布、main 合并或公网部署。

## 1. 开工及整理

先读根 AGENTS.md 和适用子目录规则。执行 `git rev-parse --show-toplevel`、`git status --short`、`git branch --show-current`、`git rev-parse HEAD`。核对 remote 指向上述 Between 仓库，绝不能向 SillyTavern 官方仓库误推。远程 URL 若含凭据，不得复制到日志。

已有未提交改动不得覆盖或静默 stash。盘点文件、来源、用途和验证状态；可验证的有效修改审查后提交到独立分支，暂不能验证的保留在原目录并记录原因。用 `git diff`、`git diff --cached` 和未跟踪文件清单共同审查；禁止盲目 `git add .`。排除秘密、真实对话、个人路径、运行配置、依赖和缓存，核查复制代码的许可证。

并行任务使用不同分支和 worktree，例如 `git worktree add ../between-task -b research/任务名 确定SHA`。创建前检查路径和分支不存在；不要复用另一任务正在写入的 worktree。不得把无 .git 的旧交付解压目录作为新开发源。

## 2. 源端验证、提交和推送

按当前代际运行测试。酒馆版要求 Node >=24，在仓库根执行：

```sh
npm ci --prefix sillytavern/engine --ignore-scripts --no-audit --no-fund
npm ci --prefix sillytavern/admin --ignore-scripts --no-audit --no-fund
npm run setup --prefix sillytavern/admin
npm run build --prefix sillytavern/admin
npm test --prefix sillytavern/admin
npm test --prefix sillytavern/engine
npm run test:app --prefix sillytavern/engine
npm run test:plan --prefix sillytavern/engine
npm run test:local --prefix sillytavern/engine
```

管理员页面从源文件构建，必须先完成 admin build，再运行 test:local 或本机启动健康检查；不能并行于尚未完成的构建。构建产物不入库。

`npm ci` 按现有锁文件安装；不得为躲过失败更新依赖版本。需要浏览器测试时另按酒馆版说明安装锁定的研究依赖，保留 Chromium sandbox，不启动真实模型请求。报告测试实际范围，不把 mock 测试当作自然度或真实授权验证。

审查实际拟提交内容、工作区状态和许可证，按白名单 add 文件，再用中文标题和中文正文提交。所有本次新增 commit 均须中文。示例：

```sh
git diff --cached --check
git commit -m '整理酒馆版基线与双向交接规则'
git push -u origin HEAD:refs/heads/research/本次独立分支
git rev-parse HEAD
git ls-remote origin refs/heads/research/本次独立分支
```

最后两条输出的完整 SHA 必须一致。禁止 force push；拒绝非快进说明分支已变化，先 fetch 检查，不覆盖远端。push 失败则标记未交接，不能以代码 ZIP 或散文件替代。

## 3. 目标端接收

先保护目标端已有改动。已有仓库且不干净时用独立 worktree，不 checkout 覆盖。首次使用可 git clone，同样不能解压包代替。

```sh
git fetch origin refs/heads/research/源分支
git rev-parse FETCH_HEAD
# 确认与源端交接完整 SHA 一致后执行：
git worktree add ../between-received --detach 确定的完整SHA
cd ../between-received
git status --short
git rev-parse HEAD
```

读取新版本 AGENTS.md，执行第 2 节锁文件安装和相关测试。确认后若需继续开发，用 `git switch -c research/目标端新任务`。目标端修改再按相同流程提交、push 和核验，交回源端。禁止双方共同写一个任务分支。

旧的本机解压目录仅用作待审查补丁来源；对确定 SHA 逐文件比较，识别已包含的修复，只移入有效独有改动，在真实 Git 工作区测试提交。凭据和用户存储不随代码迁移。测试配置和未运行辅助脚本不自动视为可交付功能。

## 4. 冲突、回滚与保护

不要自动选择 ours/theirs 来吞掉另一端修改。记录共同基点、双方提交、冲突原因和解决结果；解决后再次运行相关测试。需要恢复时优先在任务分支创建中文 revert 提交，保留审计历史。未经授权不合并 main、不删除旧分支、不强推、不重写历史。依赖失败、权限失败和真实服务验证缺失须如实记录。

## 5. 每次交接清单

- 仓库 URL、方向、源端工作区、独立分支、完整提交 SHA、远端已核验 SHA。
- 变更范围、代际与启动入口、许可证和来源、有效独有修改的处置。
- 安装及测试命令、结果、mock/真实服务边界；是否尚有未提交内容。
- 排除的凭据/个人数据/产物类别，不列出秘密值。
- 目标端 fetch SHA、锁文件依赖复测结果、继续开发分支；尚未接收须标记待完成。
- 服务启动与清理状态、未解决阻塞和下一负责人。入库不自动授权启动应用。

## 6. 已授权的本机启动验收

本次本机启动已获用户授权。先把本机有效修改中文提交并推送独立分支，核验远端完整 SHA，再从 GitHub 创建干净接收工作区并检出同一 SHA。锁文件安装和四组离线测试通过后，运行 `npm run start:local --prefix sillytavern/engine`。验证用户页、管理页、用户会话状态及管理员登录后的状态接口，报告真实 HTTP 状态；不能把授权元数据可用等同于真实模型推理验证。默认模型 `gpt-6.1-sol`、思考档位 `medium`。服务仅绑定 localhost，保留运行并交付访问地址、停止方式和管理员口令文件位置；不要把口令写入报告。
