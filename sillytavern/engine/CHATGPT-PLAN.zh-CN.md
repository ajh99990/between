# Between：灵光方式的独立套餐兼容后端

本轮按用户最新批准，改为**管理员管理一份独立 Between 套餐授权、兼容服务统一刷新、业务用户和会话仍隔离**。不要求每位内测用户分别登录。默认关闭；管理员明确选择后才作为应用后端。此架构选择不等于官方已确认个人套餐供多人远程托管的适用性。

## 当前模型默认与本机启动

套餐默认模型为用户已确认的 `gpt-6.1-sol`，默认思考档位为 `medium`。管理员「提示词与模型」可选择 `medium` / `high`；`reasoningEffort` 映射为出站 `reasoning.effort`，其他值在本地拒绝。普通 `npm start` 仍须管理员显式启用套餐后端；既有持久配置保留原模型与选择。上下文、输出预留、计数器和世界书预算未修改。

本次入库只保留模型与档位配置、离线合成验证。原本机测试的请求、对话、账户模型目录及原始报告不入库；没有新增真实模型测试。下文“本轮未运行”等描述属于前期 OAuth 研究阶段。

已获本机启动授权时，先完成 GitHub 推送及干净 Git 接收，使用 Node 24+ 在仓库根执行：

```sh
npm ci --prefix sillytavern/engine --ignore-scripts --no-audit --no-fund
npm run start:local --prefix sillytavern/engine
```

`app/local-start.mjs` 默认在 macOS 用户的 `Library/Application Support/Between` 下存放 `runtime` 与 `app-data`，仅沿用 `siwc/between.json` 的既有独立授权。可用 `BETWEEN_LOCAL_ROOT` 指定运行目录、`BETWEEN_PLAN_CREDENTIALS` 指定已有凭据的绝对路径；凭据必须位于仓库外。启动不登录、不复制授权、不发现模型、不刷新令牌、不推理。

应用固定监听 `127.0.0.1:8787`，管理入口为 `/admin`，兼容服务固定监听 `127.0.0.1:8766`。首次启动经应用管理接口初始化 `gpt-6.1-sol / medium`；以后保留已有设置和管理员口令。口令只保存在运行目录的 `runtime/admin-password.txt`（0600），不会回显。`runtime/status.json` 记录 PID、入口及 HTTP 验收结果，不含 token 或管理员口令。停止时向该 PID 发送 SIGTERM；退出释放凭据、引擎和启动器的所有权锁。现有锁或端口占用会拒绝启动，不能靠删除原文件来绕过。

启动器脱离终端后持续运行，不是开机自启服务。离线验收命令为 `npm run test:local --prefix sillytavern/engine`，使用独立临时目录与合成授权，验证启动、用户与管理 HTTP、重启保留设置、端口冲突和清理，不访问真实模型。

## 当前能做什么

已实现可运行的独立loopback套餐兼容服务、配置入口与离线验证；**独立 Between OAuth 模块与离线全流程已实现；真实授权及真实模型测试未执行**。没有读取或搬运灵光/Codex凭据，没有部署、推送、代理或安全设置修改。之前的个人连接选择只是上一阶段设计，本版已被新的管理员后端选择替代；Git与旧测试证据保留该历史。

管理员在 `/admin` →「提示词与模型」勾选“显式启用套餐后端”、填写模型名称并确认影响所有应用用户。普通用户不能修改。授权未接入时显示未授权且不能发送。额度上限会暂停整个套餐后端；管理员检查Usage后手动恢复。切换后端要求没有在途任务；本地断开会取消当前请求。失败不自动改用API计费。

原Chat Completions/演示模式继续保留。套餐模式只支持文字，不发送工具或媒体。

## 直接复用与适配

来源详情及许可证边界见 [灵光来源说明](app/lingguang/SOURCE.zh-CN.md)。实际收到两个完整模块，以及server/audit接口和OAuth结构说明：

- `app/lingguang/compat.mjs`：直接复用原 `adaptRequest`、`ResponsesFrames`，未重新实现其字段删除/system转换逻辑。Between先构造严格文本子集，禁用工具；原ST消息顺序和内容保留，name字段转为文本说话者标签。
- `app/lingguang/credentials.mjs`：直接复用 `PlanCredentials`，保留共享Promise与有令牌记录的原子文件写入。刷新状态机由 Between 包装层扩展，原文件不修改。新增 `app/plan-credentials.mjs` 包装，校验真正位于当前研究仓库及指定仓库之外，拒绝符号链接/硬链接、不安全权限，并以独占文件锁限制同一文件一个持有进程。12并发只刷新一次。不是多机器分布式锁；崩溃后须人工核验残留锁。
- `app/plan-service.mjs`：按照所收到的灵光server接口实现Between适配；完整server源码未提供，不声称原样搬入。服务只监听127.0.0.1，要求至少24字符本地服务密钥，拒绝Origin。提供受保护 `/health` 与 `/v1/responses`，固定调用公共OpenAI端点，无自动重试。health不刷新、不推理、不返回OAuth token。
- `app/plan-service-main.mjs`：默认不执行，必须带显式启用参数。不执行OAuth，也不自动读取已知Codex/灵光路径。独立服务可由可信宿主注入 `getAccessToken/inspectGrant`；实际应用只持有本地服务密钥。
- 现有 `app/chatgpt-plan.mjs` 保留UI错误映射、完成事件验证、取消与回滚接口；现在调用复用的兼容逻辑。引擎仍是原ST角色编排，不导入Qwen/Codex agent。

未导入undici、Mihomo观察器或代理配置。原audit实现和测试仅有接口/文件清单，未收到其代码，未声称已运行原测试。

## 协议和行为边界

出站固定为 `https://api.openai.com/v1/responses`。强制 `store:false,stream:true`，不带 `previous_response_id`。每轮发送ST在本地预算内选中的完整上下文，不代表发送磁盘全部历史。

system消息在原位置转developer；深度世界书不统一移到开头。这是协议语义变化，不能承诺自然聊天效果等价。温度、top_p、seed、penalties、max_output_tokens等不发送。现有输出上限只作本地提示预算预留，不能限制套餐模型真实输出；计数器仍固定gpt-4o-mini。模型slug暂手工填写，账户模型目录尚未接入；仅模型列表成功不得标记推理成功。

只有 `response.completed` 且状态completed和有文本才允许写回。额度流中失败、incomplete、断流、取消、管理员断开均回滚。一般429频率限制与明确的subscription-sharing额度上限区分。401表示授权未接受，不直接断言撤销；无隐式账单切换。原始上游诊断不显示在浏览器。Between消费端保留120秒/8MiB整流限制，兼容服务默认180秒、16MiB请求、64KiB错误及原帧大小上限。

共享的是授权与额度，不是聊天状态。已测试两位业务用户的角色/persona/历史/WI分别编排，跨用户会话读取仍被拒绝。

## 待用户正式授权后使用的入口（本轮未运行）

以下命令仅为用户正式授权后的入口，本轮没有运行真实登录、导入或退出。需要 Node 24+。在有浏览器的本机进入源码 `engine` 目录；不要把凭据放在仓库、聊天、截图或压缩包里。

```bash
node app/plan-auth.mjs login --credentials /绝对路径/专用私有目录/between.json --consent
node app/plan-auth.mjs status --credentials /绝对路径/专用私有目录/between.json
node app/plan-auth.mjs logout --credentials /绝对路径/专用私有目录/between.json --confirm
```

`login` 先监听随机 127.0.0.1 端口，输出仅本地的临时入口；必须打开入口并点击 **Continue with ChatGPT** 才跳转官方授权。首次使用 dynamic_agent_client，后续使用回调签发的 client_id。state、nonce、PKCE S256 与确切 redirect_uri 全部绑定；回调仅用一次。仅允许 RS256、官方同源 discovery/JWKS，验证签名、issuer、audience、azp、时间、nonce、subject。未支持的签名算法明确拒绝。没有读取或照抄旧灵光 OAuth 源码，这部分是依官方协议新增的 Between 实现。[^sign-in]

退出保留注册及 host 标识，清除 access/refresh/ID token；尝试一次最多十秒的官方撤销，失败时明确显示远端未确认，不自动反复重试。退出等待在途刷新，关闭等待退出，避免旋转后令牌重新出现。再次 `login` 复用注册；不同身份不会覆盖原绑定，换账号/工作区须使用另一个独立文件。仅 `sub` 与 `client_id` 用于绑定；`workspace` 字段显示的是 `registration:<client_id>`，不是从 email/sub 推断出的真实工作区 ID。[^sessions]

云端方案：本机完成 **Between 自己** 的授权后，先停止本机 helper/兼容服务，确保不再刷新；用户通过其可信 SSH/SCP 或其他端到端安全通道把这个独立文件转移到云端专用 0700 目录，落盘权限 0600。不要转移 `.owner`、`.host` 或灵光/Codex 文件。云端先停止兼容服务，再运行：

```bash
node app/plan-auth.mjs import --source /绝对路径/安全暂存/between-transfer.json --credentials /绝对路径/云端私有目录/between.json --confirm
```

导入再次验签、验有效期/身份/权限并保留云端自己的 host identity；过期 ID token 拒绝导入，需本机重新登录后及时转移。导入不调用模型。成功后由操作者安全删除转移暂存和停用源副本，云端成为唯一刷新持有者；本地文件锁不能防止两台机器同时刷新同一个 grant。具体 SCP 主机、用户名和目录由实际部署决定，此处没有执行传输或创建授权。官方 VM 指南适用于同一用户及工作区，不能据此推导多人托管资格。[^vm]

独立兼容服务配置：

- `BETWEEN_PLAN_CREDENTIALS`：独立Between记录的绝对路径，位于仓库外专用0700目录；文件0600。不得指向现有灵光/Codex凭据。
- `BETWEEN_PLAN_LOCAL_KEY`：兼容服务专用本地访问密钥，至少24字符。
- `BETWEEN_PLAN_PORT`：loopback端口，默认8766。
- 启动入口：`node app/plan-service-main.mjs --enable-plan-service`。

Between应用进程配置：

- `BETWEEN_PLAN_SERVICE_URL`：例如 `http://127.0.0.1:8766/v1`，只允许loopback该路径。
- `BETWEEN_PLAN_LOCAL_KEY`：与兼容服务一致的本地访问密钥，不是OAuth token。
- 仍需管理员在UI显式启用；仅启动服务/填写URL不自动切换后端。

记录的 `expires_at` 为毫秒，文件与稳定 host 文件均 owner-only。包装层要求 app=Between、schema=1、官方 issuer、validated=true；此标记只供受信本地宿主使用，不能抵御同一 OS 用户篡改。安全文件保留单进程独占锁；进程崩溃后不自动抢锁，需操作者确认原进程已退出后处理残留锁。登录、导入、退出之前必须先停兼容服务，否则文件锁会显式拒绝。完成重新登录或导入后，同时重启兼容服务和 Between 应用，清除应用进程先前的断开/拒绝状态；不自动恢复旧的在途请求。

`invalid_grant`、refresh_token_reused/expired/invalidated 等终止型刷新错误清除不可用令牌并持久进入 reauthorization_required；invalid_client 进入 configuration_error；授予 scope 丢失进入 scope_missing。重启不会再次刷新，也不会调用模型。临时网络/503/429与无效响应保留凭据，持久冷却30秒，下次显式请求才尝试，没有后台自动重试。新版 ID token（如刷新返回）再验签并检查 subject。[^recovery]

本地 UI“断开连接”只停止应用进程使用，永久本地退出及远端撤销须用上述 logout 命令。本轮没有把云端按钮伪装成用户电脑的 loopback 登录入口；后台按钮显示本机助手说明。

## 官方路径与当前阻塞

已核对官方 [注册登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理及官方curl/Python示例](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)、[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[错误恢复](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)。本轮只阅读和模拟，没有实际交换code、刷新真实token或调用真实模型。

官方[个人自托管VM指南](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)支持同一用户/workspace：浏览器loopback回调抵达本地电脑，需要在那里完成同一应用OAuth，再经用户批准安全转移独立会话给VM；VM保持自己的host ID并负责后续刷新。实际使用这一官方路线需要本地辅助，不可将云容器127.0.0.1误作用户电脑回调。

独立登录模块现已完成离线实现。进一步提取灵光 OAuth 源码已被取消，未绕路重试。剩余真实流程需要用户本人正式同意授权、具备适用账户以及安全传输入口；未取得许可不阻碍本轮代码和模拟测试完成，也不代表真实注册或真实模型链路已经验证。

官方[开源套餐概览](https://developers.openai.com/siwc/token-sharing-open-source)要求远程托管/付费产品另行申请。没有公开证据确认开发者个人套餐可作为所有内测用户额度池；也不编造文档逐字禁止免费少量内测的结论。用户选择此架构不代替官方适用性确认。

## 离线复现

在源码engine目录、已有依赖时：

```bash
npm run test:plan
npm run test:app
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node app/test/plan-browser.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node app/test/oauth-browser.mjs
```

只使用合成凭据临时文件、mock刷新和mock模型流，finally关闭服务并删除测试凭据。原核心测试仍通过 `npm test` 复跑。最新结果见 `app/evidence/reuse-plan-*`；旧 `plan-*` 是此前个人模式阶段证据，不代表当前配置语义。

本轮结果及最终保存版本复现记录见 `app/evidence/oauth-*` 和 [授权实现复核报告](OAuth实现与离线验证报告.md)。旧 `reuse-plan-*` 保留为上一版证据；当前 OAuth 测试使用内存生成 RSA 密钥与临时合成 grant，所有官方端点注入 mock。Chromium 测试保留 sandbox，官方授权 URL 在浏览器网络层截获，不访问真实 OAuth 服务。

## 参考文献

[^sign-in]: OpenAI，SIWC token sharing Sign-in，https://developers.openai.com/siwc/token-sharing-open-source/sign-in
[^sessions]: OpenAI，Profiles and sessions，https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
[^vm]: OpenAI，Self-hosted VMs，https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
[^recovery]: OpenAI，Errors and recovery，https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery
