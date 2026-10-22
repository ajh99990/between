# Between 双向 Git 开发与交接流程

仓库为 https://github.com/ajh99990/between 。只保留 `main` 和 `dev`：`dev` 承载日常开发，`main` 接收已验收的稳定提交。代码交接通过远端仓库完成，不使用 ZIP、散文件或没有 `.git` 的解压目录。

## 开工与写入责任

先阅读根 [AGENTS.md](../AGENTS.md) 和适用的子目录规则，核实 Git 根、分支、完整 HEAD、remote、工作区及 worktree 状态。核对远端属于上述仓库，但不要在报告中输出含凭据的 URL。目录名、旧文档和既往报告不能代替实际检查。

```sh
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short
git worktree list
git fetch origin --prune
git ls-remote origin refs/heads/main refs/heads/dev
```

`dev` 同时只有一位写入负责人；负责人可协调互不冲突的并行子任务。跨端交接时，源端停止写入，接收方确认远端 SHA、本机状态和责任后继续。不得覆盖未提交改动、静默 stash、`reset --hard`、`clean` 或强推。较新有效改动应先辨认和整合，不能因目录整理丢失。

已有干净 `dev` 检出可用 `git merge --ff-only origin/dev` 接收。若本地尚无 `dev`，先确认该分支未被其他 worktree 占用，再建立跟踪。拒绝快进时比较双方提交并保留历史地整合，不整体采用 ours/theirs。并行只读评审或干净复测可使用固定 SHA 的 detached 检出，不增加长期分支。

## 统一安装与验收

当前产品使用根 npm workspace 和单个 `package-lock.json`，四个运行 workspace 为 `apps/admin`、`apps/server`、`packages/role-engine`、`packages/ui`。Node 版本与完整命令以 [根 README](../README.md) 和根 `package.json` 为准。

在仓库根执行：

```sh
npm ci
npm run check
```

`check` 聚合后台/UI 资源校验与类型检查、lint、管理端构建及离线测试；测试依赖管理端已构建。根 `.npmrc` 统一安装脚本策略，管理端所需准备步骤由项目命令显式执行。不得回到旧目录分别安装、生成第二份锁文件或为绕过错误升级依赖。

结构调整至少覆盖依赖解析、管理端类型与构建、角色引擎和应用回归、套餐后端离线测试、启动冒烟与关键接口。实际执行范围及无法覆盖项需逐项记录。浏览器可用时执行根 `npm run test:browser`，也可通过 `CHROMIUM_PATH` 指向本机 Chrome；必须保留浏览器沙箱，使用隔离虚构数据和随机回环端口。共享 UI 的单独开发/验收入口为 `npm run dev:ui`、`npm run build:ui-playground`、`npm run test:ui:browser`；根 `test:browser` 包含共享 UI 与业务浏览器回归。工作台不发布到后台。证据位于忽略目录 `artifacts/browser/ui`、`artifacts/browser/admin` 等对应测试目录。离线模拟、接口测试和真实模型推理是不同证据，不相互替代。

提交前检查完整 diff、未跟踪文件、许可证及归因。不得提交凭据、运行配置、真实聊天、用户存储、依赖、缓存、构建或本机测试产物。只暂存已审查的改动，不能依赖忽略规则代替内容核验。

## 提交、远端交接与 main

新提交说明使用中文。源端验证后推送 `dev`，核验本地完整 SHA 与远端一致：

```sh
git diff --check
git diff --cached --check
git commit -m '中文说明本次变更与验证结果'
git push origin dev
git rev-parse dev
git ls-remote origin refs/heads/dev
```

接收方 fetch 后核对同一完整 SHA，再按锁文件安装和复测。提交已存在于远端、接收已完成、复测已通过必须分别核实；不能提前报告。推送被拒绝时先 fetch 比较，不覆盖远端或用压缩包代替。

验收通过且任务已授权推进 main 后，在已核实、干净的 `main` 检出中执行：

```sh
git fetch origin --prune
git branch --show-current
git merge --ff-only origin/main
git merge --ff-only 已验收的完整SHA
git push origin main
git rev-parse main
git ls-remote origin refs/heads/main refs/heads/dev
```

命令中的 SHA 必须替换为本次已验收的 40 位提交号，并在本次 fetch 后重新核对 `origin/dev`。不要将移动引用带来的未验收提交一并推向 main。分支分叉时回到 `dev` 整合、复测，保留历史地推进；分支保护阻塞时明确报告，不绕过、不修改保护、不 force push。只推送 dev 不代表交付完成。

## 运行与数据保护

目录用途通过 Git、进程与端口实查，不由目录名决定：

- 开发检出：确认是 `dev`，接管写入责任并保全已有修改。
- 验证检出：可固定完整 SHA 使用 detached 检出；只用自己的临时数据和回环端口。
- 稳定运行检出：核实已验收的 `main` 完整 SHA，按根 README 安装、构建；代码接收与服务重启分别执行和报告。

源码可以放在任意已授权路径；workspace 职责统一见 [根 README](../README.md)，不在文档保存会漂移的个人目录、HEAD 或 PID。旧目录名只是排查线索，不证明分支、进程或可删除性；共享 Git 元数据的 worktree 不能作为普通文件夹直接删除。

启动仅在授权范围内监听回环地址。`npm run preview` 为隔离离线预览；`npm run start:local` 使用本机运行配置，须先读 [套餐后端](套餐后端.md) 的首次初始化与授权路径规则。不要复用正在运行的用户服务、凭据或数据测试；运行数据、身份、聊天和所有权锁不随源码整理自动迁移或删除。测试结束精确清理自己的资源，不影响无关服务。

修改已运行服务前核实 PID、端口、源码 SHA、数据目录和所有权。目录重组不要求迁移、删除或重新初始化原机器上的数据。不得读取、输出、复制或提交授权材料；不得盲删 `.owner` 锁。合入 main 不等于公开部署、真实 OAuth 验证或收费模型调用授权。

交接报告给出 main/dev 完整 SHA、远端核验、写入责任、开发/验证/运行目录、测试结果、未提交状态及剩余阻塞。回滚优先在 dev 创建中文 revert 提交，经验证后正常推进 main；旧源码通过 Git 历史追溯，不恢复废弃入口或双轨兼容层。
