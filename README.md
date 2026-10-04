# Between

第一版线上关系Agent的开发候选。TypeScript、Electron、固定Qwen Code宿主、Skills和MCP；当前单角色阿岚，记忆默认关闭，保留成人/AI披露、暂停与退出控制。Langfuse属于开发后台观测和排错，不是聊天前台功能。

## Workspace

- `apps/desktop`：main、sandboxed preload、renderer、业务运行入口
- `packages/contracts`：浏览器可加载的schema和HostAdapter契约
- `packages/core`：会话/存储/权限/幂等/隐私/删除/恢复
- `packages/host-qwen`：固定宿主启动、权限收敛、事件和资源核验
- `packages/mcp-server`：独立stdio发行包与受信host生命周期API
- `skills/relationship`：独立版本内容资产
- `patches/qwen-code`、`upstream`：精确上游锁、补丁、合同和检查；不包含上游展开源码

依赖方向由`pnpm check:boundaries`检查。无旧根src/electron/renderer入口或兼容fallback；无Turbo/Nx。

## 安装与验证

固定Node24.19.0、pnpm11.19.0。安装官方Node和pnpm后，在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:release
pnpm start
```

测试默认临时目录位于仓库相邻的`.between-test-tmp`，避免将依赖安装包堆到RAM-backed `/tmp`；可以显式设置绝对路径`BETWEEN_TEST_TMPDIR`。这不改变OS或网络安全设置。

first-party统一`pnpm-lock.yaml`；Qwen保持上游独立锁。pnpm11使用精确版本allowBuilds：仅Electron、esbuild允许脚本；better-sqlite3明确false，因为13.0.3官方包已附prebuild，禁止binding.gyp触发不必要隐式重编译。`pnpm native:check`实际载入官方包内prebuild并执行SQLite事务；没有适配当前平台的二进制时直接失败，不静默替代。当前Linux Node验证不代表macOS安装包/签名通过。桌面broker用外部Node24，不在Electron main加载SQLite。

`pnpm test`按包执行同一保留的业务/进程故障测试、浏览器contracts及Skills测试。`test:release`还检查独立分发产物；只通过单测不能当成完整产品完成。

## 独立MCP与Skills

[独立MCP使用和可信hook协议](packages/mcp-server/README.md)。MCP tarball内联第一方库，干净Node环境不需要Electron或Qwen。默认`serve`只允许握手/发现，业务调用没有可信当前输入时拒绝。`trusted-init`是用户/可信host入口；`trusted-turn`是单轮启动；公开`trusted-host` API支持同一连接多轮begin/end。grant和控制永远不是模型工具。

普通静态MCP配置不能证明“当前真实用户输入来自谁”，不能承诺任意host装上即自动获得安全长期记忆。通用host必须接入独立受信生命周期hook。当前协议测试使用真实MCP SDK和合成输入，不是已完成所有第三方宿主或真实模型聊天验收。

[Skill内容包](skills/README.md)独立打包和安装，校验版本、host-context schema、hash、引用、大小及路径。安装用明确目的地和已核对hash，不从开发机cwd读取资源。

[桌面分发说明](docs/desktop-distribution.md)包含独立Linux目录/tarball验证，和尚未覆盖的系统安装包差异。合成布局夹具仅使用原创文字/几何图；第三方参考截图不进入公开源码或发行物。

## Qwen固定上游

[构建与核验](upstream/README.md)。当前CLI v0.24.7、SDK0.1.17、managed host contract2，使用完整123文件源码补丁；本轮应用整体验收仍在进行，不得将旧contract1运行时视为兼容。上游archive与补丁受hash约束；运行时必须核整套dist、chunks、assets，不只loader。无凭据/运行时配置时生产明确失败，不使用测试Host替身。

## 数据边界和未完成项

当前开发树使用main schema6、authority2、spool2，默认新数据目录为`.runtime/data-v6`；旧库拒绝打开，不做自动迁移。已发布schema5快照保留独立身份。记忆关闭收件需可用安全密钥；Linux明文safeStorage backend拒绝。原始关闭记忆输入仅有界加密保留，不提供明文fallback。停止/取消控制优先于满普通队列。

[删除与备份](docs/privacy-and-backups.md)、[离线封存恢复](docs/offline-recovery.md)说明确切范围。可信API支持完整关系删除及独立权威屏障、当前离线seal的受限恢复；一般任意历史备份恢复、权威/密钥丢失恢复、前台恢复流程仍未实现。底层文件删除不声称介质物理擦除。

[记忆候选边界](docs/memory-boundaries.md)：分层记忆候选只证明引文/状态/来源有效性与预算等机械边界，普通偏好自动语义准入、自然语言纠错和真实角色自然度仍未验证。needs_review为内部状态，不增加逐条确认前台。

真实provider回合、完整Langfuse链路、OS级宿主隔离和跨平台签名安装包尚未通过。bwrap已遇到环境权限拒绝，不绕过；不能把未完成开发一概归为环境限制。云端实际Electron正常开窗/披露/开始/关闭有历史观察；设置/删除/恢复GUI未获准复测，不冒充通过。每次迁移后的视觉证据以最终验收报告为准。

[后续顺序与角色适配病例](docs/next-product-gates.md)。这是持续开发候选，不是已完成整个产品roadmap。

## 许可证与隐私

第三方依赖声明和通知见`licenses/`与`upstream/QWEN-LICENSE`。第一方开源许可证尚未选择，不擅自授予许可证。不要提交实际聊天、DB、密钥、`.runtime`、私有研究资料或参考截图。公开发布只使用审核后的白名单快照。
