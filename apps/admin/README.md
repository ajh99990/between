# Between 管理员后台

面向管理员的独立内容和运行管理界面，通过同源 `/api/admin/*` 调用服务。React、TypeScript、Tailwind CSS 与 Vite 负责界面；业务状态、路由、请求和草稿由本应用管理。通用控件、图标、字体、玻璃、程序背景与浮层动画统一从私有 `@between/ui` 引入；不保留另一套应用内组件或重复设计目录。仓库另有服务、角色引擎和共享 UI，共四个 npm workspace。

现行组件接口与工作台场景见 [UI 包说明](../../packages/ui/README.md)；重写及迁移经过见 [后台演进记录](../../docs/records/后台演进记录.md)。

## 工作区

| 页面 | 已接入的能力 | 边界 |
| --- | --- | --- |
| 角色库 | 全文搜索、11 个正文字段阅读、字段目录、逐字段大编辑区、新建/删除、关联世界书 | 保存完整角色对象并保留原始来源及未编辑扩展；配置用于新会话 |
| 世界书 | 库与条目搜索、完整正文、触发条件、条目 UID、扩展 JSON、新建/删除、版本冲突处理 | `entries` 缺省是简单模式，空数组是零条目；删除书时同步解除角色绑定；扩展 JSON 是完整替换，不是递归合并 |
| 社区素材 | 固定本地目录的来源、许可、内容特点与导入 | 没有任意上传、外部 URL 导入或导出接口；调研过程与内部文件标识不进入运行目录 |
| 模型与提示词 | 模型地址/名称、套餐连接管理、上下文与输出预算、温度、示例和历史后指令预设 | 密钥只由服务端提供；保存不发推理请求；角色/世界书/预设只应用于新会话 |
| 会话与任务 | 筛选与分页、完整聊天记录与全文查找、停止正在生成的任务、确认删除会话 | 正文仅管理员可读，保留换行与图片，不返回内部提示或隐藏字段；停止会丢弃本轮尚未完成内容 |
| 用户与全局 | 浏览器身份查询与禁用、允许新用户、暂停后续生成 | 全局暂停不等于停止现有任务；禁用新注册不驱逐已有身份 |
| 诊断 | 现有运行诊断及当前进程审计记录的筛选和阅读 | 未接入 Langfuse 或世界书最终纳入条目诊断；“已配置”不等于真实推理已验证 |

角色设定、世界书、内部提示词和诊断只在管理员界面呈现；不向聊天消息或 TTS 注入。登录保持独立管理员 Cookie、Origin 与 CSRF 校验。登录失效会隐藏管理内容，重新登录后可继续未保存草稿；敏感凭据不在前端回显。

## 代码与设计资源

| 路径 | 职责 |
| --- | --- |
| `src/app.tsx`、`src/state.tsx` | 鉴权、路由、共享数据、保存确认与离开保护 |
| `src/api.ts`、`src/types.ts` | 同源 API、请求超时/错误、现有服务契约 |
| `src/pages/Roles.tsx` | 角色全文阅读和编辑 |
| `src/pages/Books.tsx`、`book-utils.ts` | 世界书、条目、字段保留与冲突草稿 |
| `src/pages/Operations.tsx` | 素材、模型、会话、用户和诊断 |
| `src/styles.css` | 应用网格、业务阅读与编辑布局、页面密度和响应式装配；共享样式从 `@between/ui/styles.css` 引入 |
| `src/motion.tsx`、`src/reader-motion.tsx` | 路由和业务文档切换提示；身份只取实际文档/字段，不按输入重新播放 |
| `../../packages/ui/src` | 唯一通用控件、图标、视觉基元、材质、背景、浮层交互及动画实现 |
| `../../packages/ui/design-assets.json` | 共享运行资源实际字节及来源 SHA-256 清单 |
| `design-assets.json`、`scripts/verify-assets.mjs` | 指向共享清单并拒绝重复 `public/design`；不再复制运行资源 |
| `tests`、`scripts` | 单元/静态/浏览器验证、隔离预览、设计资源校验 |

`@between/ui` 使用 Base UI 管理键盘、焦点、交互状态、浮层和无障碍语义；共享 React 组件补齐默认样式、材质和生命周期。材质与字体源于已保存在包内的通用 `glass-workbench-ui` 资源，使用时不读取其他项目或仓库。导航/按钮与弹窗使用不同配方，长正文优先保证阅读。通用复杂组件仍可进入 UI 包；角色、世界书、模型设置等业务组合，以及权限、草稿、请求、保存和冲突处理留在本应用。

图标统一从 `@between/ui` 的 `Icon` / `IconButton` 使用，语义映射在 `packages/ui/src/icons.tsx` 静态登记，使用本地锁定的 Lucide，无 CDN。导航和操作默认 18px / 1.75 线宽，辅助图标 14–17px，空状态 26px。图标按钮提供可访问名称，SVG 作为装饰隐藏。选型背景见 [图标选型与历史修正](../../docs/records/后台演进记录.md)；第三方依赖完整许可由根 `licenses/THIRD-PARTY-NOTICES.txt` 随依赖清单更新。

共享资源验证覆盖 SHA-256、完整目录和本地依赖闭包。失败时辨认来源，审查实际代码、来源 hash 与许可后更新清单，不删除验证绕过问题。公开字体许可与归因保留在 [共享资源](../../packages/ui/src/materials/runtime/ASSET-SOURCES.md) 中；内容编辑的设计依据和固定上游版本见 [调研](../../docs/research/管理员内容编辑调研.md)。旧 `src/ui.tsx`、`src/skill.ts`、原生控件控制器和 `public/design` 不再是当前入口。

## 开发与验证

全部命令在仓库根执行，要求 Node 24.x 与 npm 11.x，使用根唯一锁文件：

```sh
npm ci
npm run check
npm run test:browser
# 单独验证共享 UI（包含 playground 构建）
npm run test:ui:browser
```

`check` 顺序包含共享资源校验、后台与 UI 包 TypeScript、模块解析、Biome、后台 Vite 构建及离线测试。根 `test:browser` 先运行共享 UI，再运行后台、聊天与 OAuth 浏览器回归。浏览器回归可通过 `CHROMIUM_PATH` 指向本机 Chrome；只启动临时虚构数据与随机回环服务，不读取真实运行配置，也不调用付费模型。后台测试输出位于忽略目录 `artifacts/browser/admin`，共享组件回归位于 `artifacts/browser/ui`。自动化结果和生成截图不能代替实际浏览器操作与目视验收；交付前还应按 `ui-ux-self-check` 检查全文阅读、展开菜单、弹窗、状态恢复及常用屏幕尺寸。

共享组件开发使用独立入口：

```sh
npm run dev:ui
npm run build:ui-playground
```

开发服务输出随机回环 URL，构建产物只在 `packages/ui/dist-playground`。它直接引用正式组件和样式，包含长表单、菜单、表格、草稿与故障场景；测试数据只在页面内存，不访问后台业务服务，也不随 `/admin/` 发布。完整场景和组件接口见 [UI 包说明](../../packages/ui/README.md)。工作台调试后仍须回到真实后台检查路由、长文、权限、保存失败和 409；不得将历史验收或工作台模拟当成本轮业务验收。

启动隔离业务预览：

```sh
npm run build
BETWEEN_ADMIN_PREVIEW_PORT=0 npm run preview
```

终端输出随机回环 URL 与示例管理员口令。`tests/preview-fixtures.mjs` 提供可阅读的原创虚构角色、世界书与默认未连接的离线套餐替身；`browser-fixtures.mjs` 保留压力载荷和异常回归数据，不能把后者当正式展示内容。用户及会话为临时示例，使用实际 HTTP 接口，聊天为合成流；页面标题及模型模式保留示例身份。该预览不能证明真实模型、OAuth 或生产服务可用。Ctrl+C 清理此次服务和临时目录；不要把已有用户数据目录交给测试入口。内容审查、保留边界与实测结果见 [产品内容清理记录](../../docs/records/后台演进记录.md)。

开发界面并代理自己已经启动的回环测试服务：

```sh
BETWEEN_ADMIN_DEV_API=http://127.0.0.1:8799 npm run dev
```

访问 `http://127.0.0.1:8888/admin/`。Vite 开发服务器不提供完整业务后端；构建后由 `apps/server` 在同一来源的 `/admin/` 服务。完整应用启动、凭据与数据保护要求见 [根 README](../../README.md) 和 [服务说明](../server/README.md)。
