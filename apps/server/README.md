# Between 应用服务

`server.mjs` 提供 `/` 聊天静态页、`/api/*` 与 `/admin/` 管理端。聊天资源在 `public`，后台静态资源来自同一仓库 `apps/admin/dist`。`createApp(options)` 仅绑定 `127.0.0.1`；`root` 是专用持久数据目录，`port:0` 可分配随机端口。安装、构建、启动及全部验证入口见 [根 README](../../README.md)。

## 模块职责

- `server.mjs`：浏览器身份、管理员口令、Origin/CSRF、会话归属、角色/世界书设置、任务与用户控制。
- `provider.mjs`：Chat Completions 适配及完全本地演示；不读取 `.env`、不自动连接收费模型。演示媒体在 `fixtures`，不是用户素材。
- `roles.mjs` / `community.mjs` / `vendor/character-book.mjs`：显式角色快照、独立世界书、固定版本社区卡转换。
- `chatgpt-plan.mjs` / `plan-service.mjs` / `lingguang`：已有套餐兼容后端、错误分类与协议；见 [套餐配置](../../docs/套餐后端.md)。
- `plan-auth.mjs` / `plan-oauth*.mjs` / `plan-credentials.mjs`：独立 Between 授权、刷新状态、私有文件及单持有进程。
- `local-start.mjs`：使用已有独立授权启动两个本地服务；启动健康检查不推理，不接管现存服务。

`@between/role-engine` 是唯一第一方运行依赖。角色内部设定及世界书只送给引擎；普通用户只能得到白名单状态、公开消息与媒体，SSE 的 done 也采用白名单。TTS 输入只使用完成的回复，不能把内部 fields 交给前端或语音。

## 使用与数据边界

聊天流程：选角色、设置称呼/Persona、开始会话、发送消息。支持流式显示、停止、失败幂等重试、刷新和正常重启恢复。演示媒体包括合成 ASR、TTS、Caption 与图片，均不是真实模型验收。

管理员提供至少 12 字符口令；登录会话只在进程内保留，最长 8 小时。管理员可管理角色卡、独立世界书及完整条目、提示预算/模型、会话/任务、用户停用与全局控制。`GET /api/admin/conversation?userId=…&conversation=…` 在管理员鉴权与归属校验后只读返回已保存消息的文本、姓名、角色及受限内联图片；隐藏消息、内部状态和上下文不会进入响应。版本检查避免覆盖并发保存；修改角色/世界书影响新会话，模型设置影响之后的请求。后台没有模型凭据输入框，也不显示令牌。

每个浏览器使用不可猜测 HttpOnly / SameSite=Strict cookie；索引保存令牌 hash。引擎按 tenant/user/conversation 分开，普通用户不能读取其他会话。所有写请求核验 Origin，已认证写请求还须 CSRF。应用配置/索引原子替换，但未承诺断电级持久性；所有权锁需核实原进程后恢复。不能把单进程本机身份当生产 SSO。

社区卡固定为裴聿、唐团团、晚孤市、霍聿深，原始文件、CC BY 4.0、作者与字节清单在 `community`；来源及许可 hash 在导入时核验。内容只显示纯文本，不解释 HTML、不加载外链。高级世界书字段和备用开场的完整视觉兼容未实现，不能声称等同完整 SillyTavern。

Langfuse 当前返回 `not_connected`，未接入。世界书最终预算后激活诊断尚未接出，不能把关键词命中当最终纳入。运行配置和授权文件必须保留在仓库外，测试使用独立临时数据，不迁移既有用户数据。

供专用记录复查宿主使用的 `createApp({readOnly:true})` 在服务层阻止业务写入与生成，只允许 GET/HEAD 和管理员登录/退出；默认关闭。它不能通过管理员切换模型后端绕过限制。聊天对比工具的边界见 [实验说明](../../experiments/conversation-comparison/README.md)。
