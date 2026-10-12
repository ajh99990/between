# Between 独立 OAuth 实现与离线验证报告

更新说明：下文原阶段的“未执行真实授权/模型”描述保留为历史记录。2026-10-12 本机真实链路已由父会话复验通过，见文末补验记录；本云环境只执行离线回归。

日期：2026-10-12。研究分支：research/between-oauth-ready，起点 2be0dc03676c8f74f62a5e8b274dbb769399665a。

## 本轮结果

独立 Between 登录、回调验证、受保护文件存储、刷新、退出、重登和显式安全导入均已实现。保留管理员管理一份授权、单独兼容服务持有及刷新、业务用户会话隔离的架构；默认不启用套餐，失败不会自动切换账单。没有真实注册、真实授权、真实模型调用，也没有读取生产凭据或重新提取 Mac 上已取消的源码。

本轮只增加认证/兼容层，没有改写 ST 角色算法。原 ST 固定来源 06bde939fb1e9c4c8d8641d810f0a916b5bce127、版本 1.19.0，不能把此 SHA 称作发布 tag。更早的裁剪图、测量、保留/删除清单、原始基线与回归路径继续见 `research/REPORT.zh-CN.md`、`engine/REPORT.zh-CN.md`。这些历史报告中的分支及数量对应当时阶段，并非本轮新增 OAuth 的测量。

## 复用与新增代码

| 文件 | 归属及作用 |
|---|---|
| app/lingguang/compat.mjs | 原样复用用户提供灵光字段转换与 SSE 校验 |
| app/lingguang/credentials.mjs | 原样保留；复用共享刷新 Promise、有令牌记录的原子保存 |
| app/plan-credentials.mjs | Between 包装：安全路径、单 owner、终止/冷却状态机、退出与关闭等待；覆盖原 obtainToken |
| app/plan-oauth-protocol.mjs | 新写的 Between 协议实现：PKCE/state/nonce、严格 RS256/JWKS、签发 client 与 subject 绑定 |
| app/plan-oauth.mjs | 新写本机 helper、稳定 host ID、HttpOnly Cookie、CSRF/Origin/Host、单次回调 |
| app/plan-auth.mjs | 显式 login/status/logout/import CLI；导入模块不触发运行 |
| app/plan-grant-import.mjs | 仅显式指定的受保护源文件；再次验签，保留接收机 host |
| app/plan-service.mjs | 延续已有 Between 兼容服务；刷新前后权限检查与健康状态 |

来源与许可说明保留于 `app/lingguang/SOURCE.zh-CN.md`、provenance.json。灵光完整 OAuth 源码没有收到，不声称复制过它。用户提供代码的授权仅按已有来源说明保留，不擅自改标许可。ST LICENSE、版权和 AGPL 来源继续完整保留；发布、分发或提供网络服务时的相应源码义务不能因抽取成模块而忽略。本轮未公开发布。

## 安全复核与实际修正

独立只读复核发现并修复：错误 state 消耗 attempt、JWT 非对象输入、退出/关闭竞态、helper 关闭重入、CSP 跳转限制、非对象 token JSON 热循环、独立应用来源校验缺失。真实 Chromium 又发现 no-referrer 导致本地 POST Origin 丢失，调整为 same-origin；仍拒绝外部 Origin，跨源不发送本地 referrer。

终止刷新错误、scope 丢失清除可用令牌并持久停用，进程重启也不再次刷新。503/429/网络或无效 JSON 保留凭据、冷却30秒，没有后台自动循环。退出等待在途刷新后撤销新令牌，关闭等待退出；远端撤销未确认时仍清除本地令牌并明确提示。

新协议只支持官方来源的 RS256 RSA>=2048签名，验证 iss/aud/azp/exp/iat/nbf/nonce/sub；不支持的算法拒绝。没有猜测 opaque token 内部账户/工作区信息，registration 标识不冒充真实 workspace ID。自写小型校验器有明确有限支持面，未宣称已通过全面外部密码学审计。

## 验证与复现

在 `engine` 目录运行 `npm ci --omit=dev --ignore-scripts` 后：

```bash
npm test
npm run test:app
npm run test:plan
PLAYWRIGHT_MODULE=/安装路径/playwright/index.mjs node app/test/oauth-browser.mjs
PLAYWRIGHT_MODULE=/安装路径/playwright/index.mjs node app/test/plan-browser.mjs
```

OAuth 的52项离线检查覆盖绑定、签名/时间/nonce/subject、单次回调、拒绝登录、终止状态跨重启、scope丢失、冷却/旋转、退出并发、完整loopback回调与安全导入。另有32项传输、43项共享服务应用回归。原核心15文本/6媒体、34服务/7生命周期及应用32/连接8/独立10/社区60/独立17也重新通过。结果保存在 `app/evidence/oauth-*`；浏览器8项OAuth/7项后台检查通过，均保留sandbox；最终导出验证结果随同该目录保存。

所有测试用临时自造 token、RSA 密钥和 mock；测试结束删除临时授权文件并关闭服务。浏览器测试必须保留 sandbox，不接受 --no-sandbox。初次默认执行沙箱无法启动 Chromium，经执行环境批准在保留 Chromium sandbox 的条件下重试；没有修改系统 sandbox 权限或配置。

浏览器第一次跨源跳转测试的 Playwright route 未覆盖 303 的后续请求，代理返回 ERR_TUNNEL_CONNECTION_FAILED；没有获得真实授权响应、没有交换真实 code。最终改为 CDP 请求阶段拦截整个跳转链，官方地址只返回自造页面，其他外部请求一律拒绝。不能把最初失败抹去或称为完成真实授权。

## 使用边界与剩余事项

具体 CLI、本机到云端安全转移、退出重登说明见 [CHATGPT-PLAN.zh-CN.md](CHATGPT-PLAN.zh-CN.md)。云端 loopback 不能直接回调用户电脑；本机登录后用户安全转移独立 Between grant，停用源端刷新，由云端单独持有。文件锁不是跨机器锁，不能允许两个设备继续共享旋转令牌。

待用户本人正式授权后才可验证真实注册和账户模型调用；本轮没有把其尚未同意当作代码未完成的理由。多人远程托管共用个人套餐的官方适用性仍未确认；用户选用架构不等于平台已批准。真实模型自然度比较尚未完成，源码行为与 mock 成功都不能替代自然对话评测。

后台的断开按钮是本进程禁用，不代表远端撤销；持久退出用 CLI。崩溃残留 .owner 锁需人工确认进程退出后处理，不自动抢锁。文件安全以专用 OS 用户/0700目录为边界，无法防御同一 OS 身份恶意篡改。JWT过期拒绝导入，须本机重新登录；模型名称仍手工配置。

## 最终保存版本及清理

运行实现提交 `80de9afce8599009225c1e8767cbd2e694f1aca9` 已从 Git 独立导出，949个源blob逐一比对无差异；独立重跑套餐127项和连接8项通过。导出源未发现凭据文件。此后的提交仅增加复核证据和说明。OAuth四个新增运行模块合计17,227字节/164物理行，未新增安装依赖；这不含包装层、测试和旧引擎，不能当整应用大小。

最终检查0活动Node/Chromium研究服务；19个Chromium僵尸进程为已退出子进程，不监听服务，无法由本代理reap。研究与导出目录中本轮创建的依赖符号链接已移除；依赖未装入交付包。原Between HEAD与工作区未变，旧社区版ZIP SHA256仍为375accdeacf6458d53cf71a0235e2686dc38cdd79122e7e8565980b704378ba2。详细记录见oauth-cleanup.json。

## 2026-10-12 补验：Mac 临时路径与本机真实文字链路

父会话报告：macOS 的 `/tmp` 映射到 `/private/tmp`，两项测试最初直接使用 mkdtemp 返回路径，会与生产凭据路径的符号链接保护冲突。此次仅把 `app/test/plan-shared.mjs` 的 root 和 `app/test/plan-oauth.mjs` 的 temp 改为 `await fs.realpath(await fs.mkdtemp(...))`；同一行其他代码保持不变。没有放松或修改生产路径保护。

父会话提供的本机复验结果（本云代理未独立调用真实模型复测）：

- Mac 修复后 `test:plan` 127 项通过。
- 本机真实授权及 gpt-6-luna 文字测试通过，路径为应用接口 → RoleEngine → compatibility 服务。
- 共 4 个请求：3 个完成、1 个按计划取消、0 个意外失败；18 项检查通过。
- 三个正常请求 TTFT 分别为 2.58 / 2.60 / 3.15 秒，总耗时分别为 3.46 / 3.66 / 4.19 秒。

这证明上述本机样例的真实链路可用，不是云端授权/模型验证，也不是长期角色质量、自然度对比或 UI 验证。共享套餐的托管适用性等既有边界未因此改变。本记录仅接收无秘密、无私人聊天的汇总数据；未迁移、读取或打包本机凭据。此次不重新生成或发送交付包。

本云环境对两处修复重新运行 `npm run test:plan --prefix engine`，离线 32 + 43 + 52 = 127 项全部通过，检查明细见 `app/evidence/plan-portability-regression.log`；全部官方授权与模型端点仍使用 mock。
