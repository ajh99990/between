# Between Orbit · 本机管理员 V1 重写交付

从 `4ed481a458e9a7af818d3f898d171afd0b2c286c` 在独立 Mac 工作区重新实现。保留完整 Ant Design Pro、React、TypeScript、Umi Max、Tailwind 功能框架；管理端改为顶部品牌导航、全宽玻璃工作区、角色卡板、世界书档案和分区运维面板。没有旧后台兼容或双版本界面。

## 设计与验收记录

- [设计选择与技能原始查询](MASTER.md)：本轮运行的查询输入、原始 stdout/stderr、时间与哈希位于 `runs/`。
- [七项 UI/UX Self Check](SELF-CHECK.md)：记录真实失败、修复、受影响路径复验和实际像素观察。
- [64 项浏览器完整流程记录](validation/browser-full.json)：Chrome 155，真实浏览器操作，独立临时虚构数据。最后的 CSS 对比度和焦点细调以局部截图另行复验，未混称为再跑完整流程。
- [引擎分轮测试记录](validation/summary.json)：四组初验、UTF-8 修复后应用与套餐复验，以及最终本机启动复验分别列出。本地 `.log` 原始日志按仓库规则忽略，摘要与最终启动 stdout/stderr 可随 Git 交付。
- [精选截图与来源映射](../../docs/images/admin-mac-20261013/README.md)：安全的虚构数据截图，可通过同一仓库查看与分享。

实际处理的功能包括角色和世界书全文阅读、正文搜索、完整编辑、来源与未知字段保留，模型连接、medium/high 套餐思考档位、上下文预设，会话与任务、用户访问控制、社区导入及运行诊断。编辑保存使用打开时的快照做并发覆盖保护；409 与其他失败保留草稿，取消、登录失效和键盘返回各有回归。

浏览器大包保存真实暴露了服务端跨网络分块解码损坏中文的问题。新增 `readUtf8Body`，管理请求与模型桥均先按原始字节计限、合并后统一解码；测试覆盖 1/2/3/7/65535/65536 字节分块与大小边界。没有修改用户聊天界面、认证权限含义或模型收费路径。

## 安全的离线预览

在仓库根目录，使用 Node.js 24 或更新版本：

```sh
npm ci --prefix sillytavern/engine --ignore-scripts --no-audit --no-fund
npm ci --prefix sillytavern/admin --ignore-scripts --no-audit --no-fund
npm run setup --prefix sillytavern/admin
npm run build --prefix sillytavern/admin
BETWEEN_ADMIN_PREVIEW_PORT=8889 node sillytavern/admin/tests/preview.mjs
```

打开终端输出的 `127.0.0.1` 管理入口。预览专用虚构口令为 `synthetic-admin-qa-password`；它只用于这个临时测试进程，不是产品默认账户或真实管理员凭据。预览使用新建的临时目录、有许可的仓库虚构素材和禁止生成的套餐提供器；退出时清理自己的数据。端口被占用会退出，禁止使用既有服务端口 8787、8766、59720。需要随机可用端口时设 `BETWEEN_ADMIN_PREVIEW_PORT=0`。

浏览器复现：

```sh
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser --prefix sillytavern/admin
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node sillytavern/admin/tests/table-evidence.mjs
```

上例显式使用本机系统 Chrome，开启 Chromium 沙箱；不设置 CHROMIUM_PATH 时使用 Playwright 自带的 Chromium，需另行安装对应浏览器。两条命令各自创建隔离服务与虚构数据，不需要运行上述预览；第二条只补下方表格、危险操作颜色和表单焦点的局部证据。未执行真实模型推理、真实授权有效性验证或公开部署。运行中任务的界面状态使用明确标注的浏览器响应模拟，实际后端任务控制另由引擎测试覆盖。
