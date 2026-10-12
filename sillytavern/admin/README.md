# Between 管理端

完整 Ant Design Pro / React / TypeScript / Umi Max / Tailwind 管理控制台。使用现有酒馆版 API，用户聊天页面仍由 `../engine/app/server.mjs` 提供。

## 安装、构建与离线验证

要求 Node >=24。仓库根执行：

```sh
npm ci --prefix sillytavern/engine --ignore-scripts --no-audit --no-fund
npm ci --prefix sillytavern/admin --ignore-scripts --no-audit --no-fund
npm run setup --prefix sillytavern/admin
npm run typecheck --prefix sillytavern/admin
npm run lint --prefix sillytavern/admin
npm run build --prefix sillytavern/admin
npm test --prefix sillytavern/admin
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser --prefix sillytavern/admin
```

没有系统 Chromium 时，先运行 `cd sillytavern/admin && npx playwright install chromium`，随后不设置 CHROMIUM_PATH。浏览器测试必须在允许 Chromium sandbox 的操作系统环境运行；不得用 `--no-sandbox` 绕过。测试自行创建临时虚构数据、回环服务和浏览器，结束后关闭服务并清理数据；截图及结果默认写入忽略目录 `sillytavern/admin/evidence`，可通过 `BETWEEN_ADMIN_EVIDENCE` 更改。不会请求外部模型或使用运行环境凭据。

现有应用启动方式：`npm run start:local --prefix sillytavern/engine`；生产构建后访问该服务的 `/admin`。此命令会使用本机运行配置，请只在已获授权的目标机器执行。`npm run dev --prefix sillytavern/admin` 是 127.0.0.1:8888 的 Umi 开发入口，不替代应用 API 服务。

## 功能范围

六个页面：角色库、世界书、模型与提示词、会话与任务、用户与全局、素材与诊断。角色的 11 个正文字段和每个世界书条目完整呈现，列表摘要可以截断，详情全文不截断。目录、全文筛选、来源、未知世界书元数据都可查看。编辑使用原 API 版本检查，失败保留草稿；取消和离开有确认，保存范围提示说明新会话生效。

管理员身份和用户身份仍由现有服务隔离；管理页不接收套餐凭据。这里是本机匿名浏览器身份管理，不是新建的生产多租户账户体系。真实模型自然度、真实套餐登录以及多人托管适用性不属于本次离线验收。

## 来源与适配

官方 Ant Design Pro 模板提交 `4ee65150b7318af933e56267d257bd9fe644fbd4`，MIT 原文在 `LICENSE`。保留 Umi 的路由、模型、请求、权限和布局插件，使用 ProLayout / ProTable；清理未使用的模板依赖、演示页面及占位组件。角色引擎与社区资源分别沿用原有 AGPL / 内容许可，不因这个 MIT 模板改变许可。

`npm ci --ignore-scripts` 后由 setup/build/dev 显式执行 `scripts/prepare-pro.mjs`。它只对锁定版本依赖做可重复 CSP 适配：

- ProComponents 3.1.14-2 的 provider token 样式补传现有 `csp.nonce`。
- rc-component/util 1.12.0 的动态样式读取服务端 meta nonce，处理 portal 滚动锁与滚动条测量未传入 CSP 的调用。
- 版本或补丁目标变化立即报错，不能静默套用。依赖升级须重审两个补丁。

Umi runtime `antd` 配置也传入 nonce；Umi 插件使用同一 icons 主版本。`esbuildMinifyIIFE` 解决构建时 helper 名称冲突，未关闭错误检测。详情见 [Umi 配置说明](https://umijs.org/docs/api/config/#esbuildminifyiife)。未放宽已有 script-src / style-src nonce 策略，未修改 DOM 全局 API。

设计系统与验收见仓库 `design-system/between-admin/MASTER.md` 和 `docs/管理端云端验收-20261012.md`。
