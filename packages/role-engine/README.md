# Between 角色引擎

原 SillyTavern 的角色、宏、世界书、提示编排与媒体逻辑经裁剪后运行于 Node 24。实际复用源码在 `vendor`，来源、适配、固定 commit 及重新抽取方式见 [SOURCE.md](SOURCE.md)。不需要原酒馆服务或完整前端。

包导出 `@between/role-engine`（`RoleEngine`、`validateSnapshot`）、`/core`（`createCore`）、`/media`、`/stream`。应用服务依赖包名，不越过包路径读取引擎实现。

`RoleEngine.open({root, endpoint, ...})` 独占专用数据目录；`forPrincipal({tenant,user})` 由可信服务绑定身份，再调用 `create`、`snapshot`、`turn`、`delete`。身份不能直接来自未经鉴权的浏览器输入。每会话串行、请求幂等、失败回滚；支持摘要/检索注入与已接入的媒体模式。`close()` 等待任务后释放所有权锁，`recover(root)` 只在确认记录 PID 不存在时移除残留锁。

引擎底层会返回内部 `fields` 用于可信诊断，上层必须通过白名单投影公共结果，不能直接把它发送给浏览器、消息列表或 TTS。`apps/server` 已执行此投影。TTS 仅消费模型回复。

当前上下文模型/计数器校验固定 `gpt-4o-mini`；应用可在出站桥替换模型名，预算仍须承认这个限制。只支持明确的角色/世界书/宏子集，未知配置拒绝，不能宣称完整酒馆等价。媒体只接受有界 inline PNG/JPEG/WebP/WAV；网络提供方必须由宿主明确配置。

默认依赖为 tiktoken / Jimp / wavefile。`localInference()` 保留可选本地模型适配，宿主显式安装 optional peer `sillytavern-transformers@2.14.6` 并提供已有本地模型路径；关闭远程模型下载，默认安装不含模型。实时双工语音未实现。

根 `npm run test:engine` 执行文本 oracle、媒体 oracle、集成与生命周期回归。`test/fixtures` 是虚构固定基线，不能为使测试通过而重新生成；合成 provider 不证明真实模型效果。
