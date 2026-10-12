> 已否决候选记录：用户随后明确要求保留多模态与语音。本文件中的纯文本支持边界、494 包/128 MB 和13.3 MB不再是合格交付。当前结论见 REPORT.zh-CN.md。

# SillyTavern 角色聊天切片研究

本轮已经得到可运行、保留上游核心算法的研究切片，而不是重新写一套 prompt 拼接器。验证的范围是单角色、用户 persona、角色/示例/系统提示、选定世界书行为、历史与 token 预算、单一 chat-completion transport 和回复保存。核心仍在浏览器，原 UI 及一部分初始化依赖仍保留。它是本轮实际验证到的最小版本，不是理论最小，也不是已经完成的无 UI 云端引擎。

研究只发生在 `/workspace/st-research`。原 `/workspace/between` HEAD 为 `e00c2876ab30b14566bc3748676fa8201e777e4b`，开始和结束均检查工作树；未编辑它、未更改既有历史、未操作 Mac/Seed、未推送/发布/部署。没有恢复 Qwen Code/通用 Agent 路线。检查了 `/workspace/.agents`、`.codex`、Between 及上游目录，未发现 AGENTS.md 或可适用的本地 .agents/skills；不套用现有 Between relationship 技能改变本研究算法。

## 1. 固定来源与核心证据

官方仓库 `https://github.com/SillyTavern/SillyTavern.git`，固定 commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`，package 版本 **1.19.0**。没有把 SHA 冒称 release tag。baseline 是 detached 原样工作树，修改只在独立研究分支。

以下行号均对应该固定原版，最终版本中 script.js 仅因入口支持范围检查向后偏移 4 行：

| 模块 | 可核实定位 | 职责与状态/依赖 |
|---|---|---|
| 生成入口 | `public/script.js:4290 Generate` | 从 textarea、chat、characters、this_chid、name1/name2、power_user、oai_settings、chat_metadata、extension_prompts、在线状态读取上下文；调用命令、事件、interceptors、WI、预算及 transport，再处理回复/UI/保存 |
| 角色材料 | `script.js:3402 getCharacterCardFieldsLazy`、`:3476 getCharacterCardFields` | 字段宏替换、persona、角色系统覆盖、post-history、角色深度提示；依赖角色/会话覆盖及 power_user |
| 提示配置 | `scripts/PromptManager.js:1277 preparePrompt`、`:1516 getPromptCollection` | Prompt/PromptCollection、顺序和覆盖、宏替换；不等于整个预算算法 |
| 编排 | `scripts/openai.js:1542 prepareOpenAIMessages`、`:1185 populateChatCompletion` | 固定预算/控制提示预留、字段注入，最后还调用 PromptManager 渲染，仍依赖 DOM |
| 历史/示例 | `openai.js:885 populateChatHistory`、`:1101 populateDialogueExamples`、`:3917 ChatCompletion` | 新到旧选取、首个超预算即停止；pin_examples 改变分配顺序；Message/MessageCollection 和原 tokenizer 计数 |
| 世界书 | `world-info.js:199 WorldInfoBuffer`、`:479 WorldInfoTimedEffects`、`:4709 checkWorldInfo` | 关键词/regex、二级条件、递归、概率、独立预算、计时效果、位置/深度；顶层有 DOM 初始化，依赖全局聊天、角色、cache、metadata、tokenizer、regex、作者注记和事件 |
| 作者注记 | `authors-note.js:324 setFloatingPrompt` | 从 chat_metadata/extension_settings 计算浮动注入；本轮原样保留，复杂作者注记组合未专测 |
| 扩展钩子 | `script.js:4564` → `extensions.js:2024 runGenerationInterceptors` | 真 Generate 会执行；dryRun 会跳过。此测试扩展启用列表为空，不代表兼容有实际扩展 interceptor 的原版 |
| 请求/回复 | `openai.js:3138 sendOpenAIRequest`、`script.js finishGenerating` | 浏览器组装请求、解析 JSON/错误、生成消息。未改写原实现 |
| provider 转换 | `src/endpoints/backends/chat-completions.js` 原版 `/generate` 约 2242 行 | 接收已经组装的 messages，转换 provider 参数/响应。最终仅裁留 custom 路径及原公共逻辑 |
| 保存 | `script.js:7395 saveChat` → `src/endpoints/chats.js:545 /save` | 原 JSONL 存储与完整性检查；测试最后另调 force-save 固化研究夹具，未验证冲突交互 |

调用与状态图（静态简图）：

```text
DOM / chat / characters / persona / power_user / oai_settings / metadata
                       │
                    Generate
   ┌───────────────────┼───────────────────┐
getCharacterCardFields  runGenerationInterceptors  setFloatingPrompt
   │                                       │
   └──────────── checkWorldInfo ────────────┘
                    │ buffer + timedEffects + cache + tokenizer
             prepareOpenAIMessages
                    │ PromptManager / PromptCollection
             populateChatCompletion
             ├─ reserve fixed/control budget
             ├─ examples/history (pin_examples changes priority)
             └─ ChatCompletion / Message collections → ordered messages
                    │
             sendOpenAIRequest
                    │ HTTP /api/backends/chat-completions/generate
             retained custom provider conversion
                    │ HTTP 127.0.0.1 mock /v1/chat/completions
             original response processing → chat/UI → saveChat → JSONL
```

`evidence/import-graph.json` 给出原版模块、字节/行数及候选导入边：它是静态扫描，包含注释中的类型导入候选，不是精确运行调用覆盖。`baseline.json` 的 requests 给出实际浏览器资源/接口路径。`evidence/core-hashes.json` 证明 openai.js、PromptManager.js、world-info.js、authors-note.js、浏览器 tokenizers.js、macros.js 和后端 chats.js 与原版逐字节相同。

## 2. 保留、删除、待拆

**当前验证支持**：一个角色、一份 persona；宏替换后的角色描述/性格/场景、系统覆盖、示例、post-history 和角色深度提示；普通发送、regenerate；custom OpenAI-compatible 非流式文本请求，GPT 系列 tokenizer；原 tiktoken 计数与预算；WI 关键词命中/不命中、regex、AND_ANY 二级条件、普通递归、固定随机下的概率通过/拒绝、before 与 atDepth、scanDepth、预算溢出/ignoreBudget、delay 抑制和 sticky/cooldown；回复写回与保存；一次 transport 失败后由调用者显式重试。

**已删除或明确拒绝**：记忆总结、vectors、TTS、图像/字幕、翻译、表情、图库、Quick Reply 等扩展；Horde、文本补全、多 provider 后端与非 tiktoken 模型文件；大量示例角色/背景/主题、非英语翻译、字体粗细变体和部分跨平台发行脚本。扩展安装接口返回 501；不支持的 provider/stream/多模态/tools/schema/logit-bias/非 GPT 模型生成返回 422；群聊和 swipe/continue/quiet/impersonate 等生成类型被前端入口拒绝。仍保留字体普通字重，粗体/斜体由浏览器合成。损失包括上述能力、翻译 UI、示例资源和完整字体外观。

**还在，但不能冒称支持验证完毕**：全部 WI 算法保留，NOT_ALL/NOT_ANY/AND_ALL、inclusion groups、min activation、递归上限/延迟递归、其他注入位置、cooldown 结束后的重激活等未穷举。高级作者注记、工具调用、多模态、streaming、实际扩展 interception 不在兼容承诺内。测试中 WI scanDepth 与 insertion depth 是分开验证的概念，不能混用。

**待拆技术债**：完整 HTML/DOM 骨架、浏览器多 provider 设置代码、slash command/宏系统、角色编辑/导入、旧 UI/主题/群聊管理代码仍有静态或初始化依赖。后端保留原 auth/CSRF/users、角色、聊天、WI、settings、presets 和若干 UI 支撑路由。image-metadata、sprites、assets 源码保留为 thumbnail/character/files 的间接依赖，但相应功能路由已关闭。不是所有已保留管理路由都已裁为只读；这是回环研究切片，不是可对外部署的最小产品服务。

没有把 DOM 解耦说成零成本：下一层需要拆分浏览器初始化和逻辑依赖，给 Generate 的状态/事件/渲染副作用明确接口，并继续跑这个请求 oracle。不能只删除文件后用 stub 拼一个看似相似的 prompt。

## 3. 基线、测试与边界

原版服务实际启动。浏览器使用 Chromium 151、Playwright 1.58.2，明确 `chromiumSandbox:true`；第一次外层执行沙箱下启动失败，日志显示 SUID sandbox helper 不可用，随后在获准的外层执行方式下启动，未传 `--no-sandbox`、未修改系统安全设置。服务始终监听回环。

无真实 key、无外部模型请求、不读取生产 .env/凭据。自创角色 Mira、persona Lin、世界书和历史保存在 fixtures/run.mjs 中。基线与切片使用相同设置：UTC/英文 locale、固定 2025-01-01 时钟、Math.random=0.42、seed=42、gpt-4o-mini、原版 tiktoken。mock 位于**后端发向 provider 的真实 HTTP 边界**，保存最终 body，返回 OpenAI-compatible JSON，另有第一次 503 的错误用例。mock usage 是占位，不用于预算。所有生成用 `dryRun=false`，并验证实际 interceptor 调用日志。

夹具会直接填充原版导出的角色数组、WI cache、设置与历史；因此未覆盖导入角色 UI、世界书导入/关联向导，也未声称完整原版 UI e2e。界面动画在测试中关闭：固定 Date 导致原 jQuery 删除动画永不结束，关闭动画后原 regenerate 算法才可重现。这是双方一致的测试环境设置，不是生产算法修改。

15 组覆盖：基础提示顺序；首个超大历史停止；pin off/on 预算竞争；WI 命中、未命中、递归、regex/二级条件/概率、atDepth、scanDepth、独立预算、delay、sticky/cooldown；regenerate；transport 失败后显式重试。每组用新浏览器 context，连续效果用同一 context 的多个真实 turn。检查完整 provider JSON、角色字段、聊天 role/name/content 和真实磁盘 JSONL 回复；只在对照中忽略时间戳、内部 ID 等非语义字段，**没有对 messages 顺序、内容或请求参数做忽略比较**。

特别结果：预算 260 时，pin off 丢弃示例并保留 HISTORY_14/15；pin on 保留示例但只保留 HISTORY_15。大历史用例独立验证 HISTORY_12 超预算后，较老但更小的 HISTORY_11 不会被跳跃选入。WI sticky 按消息数而非轮数：sticky=2 在下一轮扫描已经到期；最终夹具用 sticky=3 检查保持一期及随后的 cooldown 抑制。

已诊断而不是掩盖的失败：settingsReady 不等于 APP 完成，早设 provider 被预设覆写；修正为等待 preloader 消失再设置。初始 sticky 预期把消息当轮次；按上游日志修正。差分一次因为内存 undefined 与 JSON 省略字段不一致；双方序列化后严格比较，未忽略语义。补充用例与完整 baseline 合并前的一次比较缺项，保存的用例之后与完整基线复核通过。删除 image-metadata/sprites/assets 导致启动 import 缺失，恢复其工具代码、关闭路由后成功。

## 4. 实测裁剪

以下是**上游跟踪文件**口径，排除 .git、node_modules、运行数据、webpack 缓存和新增 research 工具/证据。MB 为十进制。文本行统计覆盖 js/ts/html/css/json/yaml，包含锁文件、上游 tests、minified/vendored 文件及 tokenizer JSON，不等于纯手写引擎 SLOC。

| 阶段 | 文件数 | 跟踪文件 MB | 文本文件数/行数/MB | 直接依赖 | 安装生产包 | 生产依赖文件/MB | 启动/行为 |
|---|---:|---:|---|---:|---:|---|---|
| 原版 | 1010 | 61.993 | 754 / 279035 / 25.445 | 96 | 667 | 20000 / 293.710 | 成功 / 15 组基线 |
| 1：扩展与内容 | 790 | 39.394 | 589 / 205461 / 18.826 | 96 | 667 | 同原版，研究中共享只读使用 | 成功 / 15 组一致 |
| 2：后端与 tokenizer | 736 | 21.491 | 553 / 190664 / 10.405 | 88 | 494 | 14209 / 127.628 | 成功 / 15 组一致 |
| 3：字体变体 | 694 | 13.292 | 553 / 190431 / 10.399 | 88 | 494 | 同阶段 2 | 独立复现见下方最终结果 |

最终上游文件体积减少 **78.56%**，文本行减少 **31.75%**，安装包数量减少 **25.94%**，依赖字节减少 **56.55%**。其中相当部分来自移除内容/模型/字体，不能宣称业务逻辑同幅缩减。依赖包数以 npm query 的安装树（去掉根包）核对；早期 metrics JSON 中按磁盘 package.json 推导会计入包内夹带清单，因此正式包数采用 667/494，lock_packages 含未安装 dev/optional 节点，不能当安装数量。

webpack 实际输出均为 2 个文件（lib.js 与 LICENSE 文本），约 **1.948 MB**；依赖库前端 bundle 基本没变，说明 UI/lib 耦合尚在。构建缓存约 11.94 MB，单列不作交付。构建输出存放独立 dataRoot/_webpack，不在源码目录的 dist，所以原 metrics 的 dist=0 不是“没有构建产物”。首次编译约 25 秒；本轮不是严谨冷启动速度基准。

15 组回归后 server RSS 快照：原版 501728 KiB、第一层 432892 KiB、第二层 480356 KiB。不同服务存活时间、webpack/GC 状态不同，不能据此宣称稳定内存节省；删除源码/依赖显著，不等于进程 RSS 同幅下降。最终独立复现另存 server-memory.txt、浏览器每组 heap/DOM node 指标；没有测真实模型延迟/并发吞吐。

## 5. 路线判断

**路线 A：直接复用 ST 并逐层拆依赖。** 证据比静态阅读更强了：原算法完全可复用，删除扩展和多 provider 不必重写 WI、PromptManager、预算逻辑，也不需要 summary/vector 才能跑角色聊天。建议保留这份原版请求 oracle，把下一轮工作放在运行入口/状态边界的逐步抽取。当前 13.3 MB 仍带较大 UI 和 127.6 MB 生产依赖，不能将其说成已可嵌入云端 IM 的小纯函数库。

**路线 B：在 Between/LangGraph 上承载抽出的 ST 逻辑。** 长期可考虑，但本轮没有移植。LangGraph 不能替代这些具体角色/WI/预算语义；即使未来用图编排，也优先搬运已验证原函数，再隔离副作用，而不是重新实现“差不多”的 prompt。要把 chat、metadata、WI timed effects/cache、persona、token cache、settings、文件路径按 tenant/user/conversation 明确隔离，并设计并发锁/事务和生命周期。当前浏览器单例绝不能直接变成云端多用户共享单例；原后端按用户目录保存不是本研究已经证明的端到端记忆隔离。

模型自然度比较仍未完成。mock 回复固定，只证明请求和状态行为可比，不能证明人设自然、长期记忆好、真实 provider 兼容或产品体验完成。

## 6. 交付与复现

- 原样 baseline：`/workspace/st-research/baseline`，固定官方 SHA，工作树未改。
- 第一层：`/workspace/st-research/slice`，分支 `research/minimal-character`，提交 `8138ce3c3`。
- 最终切片：`/workspace/st-research/minimal`，分支 `research/minimal-character-core`。运行代码及自包含测试固定在 `024af3daa`；后续研究提交只加报告/证据。
- 第二层提交 `d800bc116`；字体阶段为 `245154d40` 与 `024af3daa`。
- `research/REPRODUCE.md`、`verify.mjs`、`fixtures.mjs`、`baseline.json`、`evidence/core-hashes.json`、`evidence/import-graph.json`；裁剪脚本、阶段 metrics、差分日志、完整本地 patch 另附。
- 原版及阶段原始运行日志、失败诊断留在父研究目录，未把它们清掉来伪造全绿。

详细许可证义务见 SOURCE.md 和根 LICENSE。未来分发/网络提供修改版需考虑 AGPL 对应源码义务；本次没有擅自换许可，也没有给未审查的闭源组合下结论。

最终独立验证与清理结果将在 `FINAL-VERIFICATION.md` 记录：从本地保存提交 git archive 到全新目录、重新 npm ci、重新启动、全套行为对照、明确拒绝测试、停止服务及原 Between/基线未污染复核。
