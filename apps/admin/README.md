# Between 管理端

Ant Design Pro / React / TypeScript / Umi Max / Tailwind 管理控制台。源码位于 `apps/admin`，使用 `apps/server` 的管理 API；用户聊天页面与 `/admin/` 的构建产物均由 `apps/server/server.mjs` 提供。

## 安装、构建与离线验证

要求 Node >=24。仓库根执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run setup --workspace @between/admin
npm run typecheck --workspace @between/admin
npm run lint --workspace @between/admin
npm run build --workspace @between/admin
npm test --workspace @between/admin
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser --workspace @between/admin
```

没有系统 Chromium 时，先在仓库根运行 `npm exec --workspace @between/admin -- playwright install chromium`，随后不设置 `CHROMIUM_PATH`。浏览器测试保留 Chromium sandbox，自行创建临时虚构数据、回环服务和浏览器，结束后关闭服务并清理数据。完整验收输出到 `artifacts/browser/admin`，补充表格验收输出到 `artifacts/browser/tables`，每次运行使用独立目录；`BETWEEN_ADMIN_EVIDENCE` 可指定相应输出根目录内的子目录。这些产物被 Git 忽略。测试不会请求外部模型或使用运行环境凭据。

完整应用从仓库根运行 `npm start`，先完成管理端构建后访问该服务的 `/admin/`。此命令使用本机运行配置，只应在已获授权的目标机器执行。`npm run dev --workspace @between/admin` 启动 127.0.0.1:8888 的 Umi 开发服务；需要 API 时用 `BETWEEN_ADMIN_DEV_API` 指向本次创建的隔离服务。离线预览可运行 `node apps/admin/tests/preview.mjs`，它创建独立虚构数据，按 Ctrl+C 清理退出。

## 功能范围

六个页面：角色库、世界书、模型与提示词、会话与任务、用户与全局、素材与诊断。角色的 11 个正文字段和每个世界书条目完整呈现，列表摘要可以截断，详情全文不截断。目录、全文筛选、来源、未知世界书元数据都可查看。编辑使用原 API 版本检查，失败保留草稿；取消和离开有确认，保存范围提示说明新会话生效。

管理员身份和用户身份仍由现有服务隔离；管理页不接收套餐凭据。这里是本机匿名浏览器身份管理，不是新建的生产多租户账户体系。真实模型自然度、真实套餐登录以及多人托管适用性不属于本次离线验收。

## 来源与适配

官方 Ant Design Pro 模板提交 `4ee65150b7318af933e56267d257bd9fe644fbd4`，MIT 原文在 `LICENSE`。保留 Umi 的路由、模型、请求、权限和布局插件，使用 ProLayout / ProTable；清理未使用的模板依赖、演示页面及占位组件。角色引擎与社区资源分别沿用原有 AGPL / 内容许可，不因这个 MIT 模板改变许可。

依赖统一由根 npm workspace 与根 `package-lock.json` 管理。`npm ci --ignore-scripts` 后由 setup/build/dev 显式执行 `scripts/prepare-pro.mjs`。脚本通过 Node 的包解析定位当前管理端实际使用的依赖，支持根目录 hoist；仅修改当前检出中 `node_modules` 下的锁定版本，拒绝修改检出之外的依赖。所有补丁目标先通过检查再写入，重复执行不会重复插入 CSP 适配：

- ProComponents 3.1.14-2 的 provider token 样式补传现有 `csp.nonce`。
- rc-component/util 1.12.0 的动态样式读取服务端 meta nonce，处理 portal 滚动锁与滚动条测量未传入 CSP 的调用。
- 版本或补丁目标变化立即报错，不能静默套用。依赖升级须重审两个补丁。

Umi runtime `antd` 配置也传入 nonce；Umi 插件使用同一 icons 主版本。`esbuildMinifyIIFE` 解决构建时 helper 名称冲突，未关闭错误检测。详情见 [Umi 配置说明](https://umijs.org/docs/api/config/#esbuildminifyiife)。未放宽已有 script-src / style-src nonce 策略，未修改 DOM 全局 API。

后台设计规范见仓库 `design-system/between-admin/MASTER.md`；当前运行与验收命令以根 `README.md` 为准。
