# Between Agent 工作规则

开工与交接先读本文件、适用子目录规则和 [Git 交接流程](docs/Git双向开发与交接流程.md)。用户本轮明确指令优先于旧说明。

1. 核实真实 Git 根、remote、HEAD、main/dev、远端最新提交和未提交状态。仅用 main/dev，不新增任务分支；dev 同一时间只有一个写入负责人，并行审查/测试可用固定 SHA detached 检出。保护别人的未提交工作，不静默 stash、reset、clean 或覆盖。
2. 当前产品仅由 `apps/admin`、`apps/server`、`packages/role-engine` 三 npm workspace 构成。根 `package-lock.json` 是唯一锁文件；禁止恢复 Electron/Qwen、旧 MCP/Skills 或原酒馆完整应用，不保留兼容入口和空壳。Git 历史负责追溯。源码重组不授权删除任何真实用户数据、凭据或无关项目。
3. Node 24.x/npm 11.x。根 `npm ci` → `npm run check`；浏览器验证执行 `npm run test:browser`。后台构建必须先于静态资源/本机启动测试。`setup` 校验随包设计资源 SHA-256；`typecheck` 包含该校验、后台 TypeScript 检查及服务/引擎模块语法/依赖解析，`build` 使用 Vite；JavaScript 没有声称通过 TypeScript 类型检查。UI 改动仍需实际浏览器操作、截图目视验收与适用设计技能自查。
4. 角色上下文、世界书、内部字段只能进入模型上下文，不得进入普通用户状态、SSE、消息或语音输入。保留会话隔离、鉴权/Origin/CSRF、当前套餐后端，以及有效媒体/语音适配；不得擅自切换技术栈或模型服务。
5. 测试优先临时虚构数据与随机回环端口。不要扩大网络暴露、干扰现存服务、读取运行凭据或调用收费模型。真实模型验证须有单独授权；合成测试不能写成真实模型测试。启动已有服务前核实 PID、源码、端口、数据目录，锁冲突时拒绝，不盲删锁。
6. 保留实际复用代码的第三方许可证、原作者归因、vendor provenance 和社区资源原始 hash。依赖通知用 `npm run licenses` 按当前安装平台更新，明确平台/缺失范围；不为私有来源模块擅自新增许可。
7. 新提交标题/说明使用中文。提交前检查完整 diff、未跟踪文件、许可证、秘密与用户数据；只暂存本次源码。node_modules、产物、聊天、授权/密钥、运行配置不入库。源码交接只经 GitHub，不用 ZIP/散文件。
8. 用户授权验收后推 main 时持续完成 dev 提交/推送、fetch 核验固定 SHA、正常快进 main、main 推送及远端 SHA 核验。不得只推 dev 即报告完成；禁止 force push、改分支保护。真实冲突逐项理解并解决复测，保护双方有效修改。
9. 回报目录职责、删除模块、实测范围/未测限制、中文提交与完整 SHA、main/dev 远端核验、写入负责人、开发/运行目录和工作区状态。main 推送不等于公网部署；保护策略阻塞如实报告，不绕过。
