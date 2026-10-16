# Between

基于裁剪并复用 SillyTavern 核心的角色聊天应用，包含独立管理员后台。当前第一版只运行在本机回环地址；真实文本聊天已实现，模型服务由运行配置提供。演示模式使用本地合成流，不代表真实模型效果。

## 目录与依赖

| 路径 | 职责 |
| --- | --- |
| `apps/admin` | React / TypeScript / Tailwind CSS / Vite 管理员后台，源码页面在 `src/pages`，构建到 `dist`；旧后台已整体替换 |
| `apps/server` | 聊天静态页面、HTTP API、管理员鉴权、角色卡/世界书/会话管理、套餐兼容服务与本机启动器 |
| `packages/role-engine` | 角色上下文组装、世界书、会话事务/隔离、模型流、多模态与语音适配；`vendor` 保存实际复用的上游代码 |
| `scripts/vendor` | 从外部固定 SillyTavern checkout 重新抽取源码的开发工具，不是另一套运行应用 |
| `tests/browser` | 聊天入口的隔离浏览器回归；后台完整浏览器回归在 `apps/admin/tests` |
| `docs`、`design-system` | 当前协作、配置、结构决策与后台设计规范 |
| `licenses` | 已安装依赖的许可证/版权通知及目标平台覆盖范围 |

依赖方向为 `apps/server → @between/role-engine`；后台只通过同源 HTTP API 调用服务。服务同时提供 `/` 聊天和 `/admin/` 后台，后台不能读取运行时模型凭据。根 npm workspaces 和唯一 `package-lock.json` 管理全部第一方包。Electron、Qwen Host、独立 MCP、旧 Skills 产品及原酒馆完整应用已删除；追溯使用 Git 历史。

## 开发与验证

使用 Node **24.x**（`.node-version` 为 24.19.0）、npm **11.x**（锁文件使用 11.6.1）。在仓库根执行：

```sh
npm ci
npm run check
```

`.npmrc` 禁止依赖安装脚本；`setup` 校验随包设计资源的 SHA-256，`typecheck` 先执行该校验，再运行后台 TypeScript 检查与服务/引擎模块解析。`check` 顺序运行上述检查、Biome lint、Vite 后台构建与离线测试。不要先运行依赖后台静态产物的测试再构建。界面交付还须在实际浏览器操作、截图并查看像素效果，自动化结果不能代替视觉验收。

```sh
npm run build
npm test
npm run test:engine
npm run test:app
npm run test:plan
npm run test:local
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:browser
```

也可安装 Playwright Chromium 后省略 `CHROMIUM_PATH`。浏览器保留 sandbox，仅访问本次随机回环服务。测试用虚构角色、临时数据和模拟服务验证管理员登录、全文查看/编辑、版本冲突、会话隔离、套餐协议、上下文隐私与启动清理；不读真实授权、不发收费模型请求。输出在被忽略的 `artifacts` / `evidence` 中。CI 使用同一 `npm run check` 与浏览器入口，不部署。

`npm run dev` 启动后台开发服务器 `127.0.0.1:8888/admin/`；API 目标由 `BETWEEN_ADMIN_DEV_API` 设置为自己已启动的回环服务，例如 `http://127.0.0.1:8799`。只允许显式指定回环地址，代理保留管理员同源请求约束。开发服务器不是完整应用入口。后台目录职责、组件与接口见 [后台说明](apps/admin/README.md)。

## 启动

先 `npm run build`。隔离预览后台与聊天（临时虚构数据、不调用真实模型）：

```sh
BETWEEN_ADMIN_PREVIEW_PORT=0 npm run preview
```

它输出随机回环入口及示例管理员口令；可读的原创虚构角色、世界书与离线套餐替身在 `apps/admin/tests/preview-fixtures.mjs`，与压力回归 fixture 分离。用户/会话为临时示例，聊天采用合成流，不读取真实凭据或调用付费模型。管理操作调用隔离服务的真实 HTTP API。按 Ctrl+C 清理服务与临时数据。演示应用需要自行选择未占用端口和新的数据目录：

```sh
npm run start:demo -- --data /tmp/between-demo-new --port 8799
```

该命令没有默认管理员口令。需要管理能力时以标准输入提供至少 12 字符口令：

```sh
read -rs 'between_password?管理员口令：'
printf '%s' "$between_password" | npm run start:demo -- --data /tmp/between-demo-new --port 8799 --admin-password-stdin
unset between_password
```

`npm start -- --data /绝对路径/专用数据目录 --port 8799 --admin-password-stdin` 为真实配置入口：读取 `BETWEEN_MODEL_URL`（HTTPS 或本机 HTTP 的 Chat Completions 根地址）、`BETWEEN_MODEL_NAME`、可选 `BETWEEN_MODEL_KEY`。环境变量优先于保存设置，不自动读取 `.env`。后台修改配置不会自动发送推理请求；“已配置”不等于“真实推理通过”。当前计数器固定 `gpt-4o-mini`，换出站模型名不保证预算精确一致。

`npm run start:local` 启动已接入的独立套餐兼容服务与应用，默认使用仓库外 macOS `~/Library/Application Support/Between` 的独立 Between 授权和数据，仅监听 `8787` / `8766`，不抢占现存服务。它会常驻；停止须核验状态文件中的本次 PID 后发送 SIGTERM。本次重组未启动或修改用户现有运行目录。配置、授权与恢复边界见 [套餐后端](docs/套餐后端.md) 和 [服务说明](apps/server/README.md)。

## 能力与限制

保留真实文本聊天、角色卡/世界书管理和全文、管理员鉴权、模型设置、套餐兼容后端、用户与会话隔离、流式停止/重试及上下文组装。角色设定、世界书和内部字段仅参与模型上下文，不能进入用户 API/SSE 的可见消息或朗读输入；回归覆盖该边界。角色/世界书/预设修改作用于新会话，既有快照不被重写。

后台围绕角色库、世界书、社区素材、模型与提示词、会话与任务、用户与全局、诊断七个工作区组织。角色提供 11 个正文字段的全文阅读、字段定位与编辑；世界书区分简单模式和独立条目模式，提供正文搜索、触发配置与完整原始字段。保存等待服务器确认，配置版本冲突保留草稿；世界书冲突不自动覆盖或合并同一本书。导航、按钮与弹窗采用不同玻璃配方，长正文保留稳定阅读衬底。通用字体、玻璃组件、抽象背景与只读验证探针来自自包含的 `glass-workbench-ui` 资源，不依赖其他业务仓库。交互研究与参考许可见 [管理员内容编辑调研](docs/管理员内容编辑调研.md)。

当前 API 只支持固定社区目录导入，不支持任意文件上传、外部 URL 导入或角色卡导出；会话管理只提供元数据、停止任务和删除，没有管理员聊天正文查看接口。后台不能读取或修改模型密钥，保存连接配置不会试跑推理。世界书最终纳入上下文的运行诊断尚未接通，不能把关键词搜索命中解释为实际激活。全局暂停阻止后续生成，不会自动停止正在运行的任务；禁止新用户只影响尚未初始化的浏览器身份。审计记录为当前进程内存记录。

有效图像、音频、ASR、TTS 适配保留在角色引擎；真实连接默认仅开放文本，媒体能力须由宿主显式配置。可选本地推理宿主需自行安装 `sillytavern-transformers@2.14.6`；仓库安装不会下载模型，实时双工语音未实现。Langfuse **未接入**。当前是单进程本机应用，生产账号/SSO、多机器凭据协调、断电级应用索引持久性、真实模型自然度和完整媒体服务验收仍未覆盖。

## 数据、许可证与协作

真实聊天、授权、密钥、运行配置和构建产物不得提交。数据目录包含身份材料和聊天，禁止放入 Git；所有权锁存在时先核实进程，不盲删、不自动迁移旧数据。结构重组不影响其他检出或现存服务。

SillyTavern 固定源码 `06bde939fb1e9c4c8d8641d810f0a916b5bce127` 的 AGPL 正文在 [LICENSE](LICENSE)，来源/抽取适配见 [引擎 SOURCE](packages/role-engine/SOURCE.md)。新后台未沿用旧模板 UI；通用设计资源的来源、Geist 字体 OFL 及随包公开对照模块 MIT 见 [设计资源说明](apps/admin/public/design/ASSET-SOURCES.md)。本次对 SillyTavern、RisuAI 和 Lorebook Manager 的编辑体验研究不复制其 UI 代码，不改变各项目原有许可。四张社区卡保留 [CC BY 4.0 与归因](apps/server/community/manifest.json)。灵光复用模块遵守其原有 [来源与许可边界](apps/server/lingguang/SOURCE.zh-CN.md)，不为用户自有代码新增第三方许可。`npm run licenses` 更新当前安装平台的依赖通知；分发其他平台须在目标依赖安装后重新收集，不能把上游链接当成本修改版对应源码。

只使用 `dev` 开发、验收后正常快进 `main`，中文提交、不强推。见 [AGENTS.md](AGENTS.md) 与 [Git 交接流程](docs/Git双向开发与交接流程.md)。当前后台的实际视觉修正、七项自查和实测范围见 [玻璃工作台验收](docs/后台玻璃工作台重写与验收.md)；浮层、切换与保存动效见 [过渡动画验收](docs/后台过渡动画与视觉验收.md)；研发文案与预览残留清理见 [产品内容验收](docs/后台产品内容清理与验收.md)；早先目录重组记录见 [历史重组验收](docs/项目结构重组与验收.md)。
