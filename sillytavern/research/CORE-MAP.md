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

