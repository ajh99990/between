# SillyTavern 角色、多模态与语音切片研究

**本轮得到的是保留原版角色聊天、图像/音频上下文、图像生成与语音路径的可运行研究切片。** 用户最新明确要求多模态和语音属于必需能力，已覆盖最初允许删除它们的边界；相关上游原代码和依赖已恢复。此前纯文本 494 包/128 MB/13.3 MB 版本只是已否决的实验候选，不能用作成果指标。

最终仍采用浏览器中的 ST 原核心实现，没有重写玩具 prompt 引擎，也没有立即移植 LangGraph 或恢复 Qwen Agent。它是本轮有回归证据的最小版本，不是理论最小、不是完成的无 UI 云端 IM 服务，也不是双向低延迟语音通话系统。

## 来源、隔离与交付

官方源码来自 `https://github.com/SillyTavern/SillyTavern.git`，固定 `06bde939fb1e9c4c8d8641d810f0a916b5bce127`，package 版本 1.19.0；不声称 SHA 等于发布 tag。原样 `/workspace/st-research/baseline` 为 detached 工作树。最终工程 `/workspace/st-research/minimal` 在本地分支 `research/multimodal-voice-core`。源文件 LICENSE、版权注释和来源说明保留，package 的 AGPL-3.0 没有被替换成其他许可。

`/workspace/between` 初始 HEAD `e00c2876ab30b14566bc3748676fa8201e777e4b`，初始工作树干净；研究没有编辑该目录、改其历史、操作 Mac/Seed、推送、发布或部署。检查了工作区及项目的 AGENTS.md/.agents/skills，没有找到可适用的额外指引。完整复现见 REPRODUCE.md，最终独立复核、提交/补丁和停服记录见 FINAL-VERIFICATION.md。

## 核心链路与依赖

详细调用/状态图、原版定位和静态导入图见 CORE-MAP.md、evidence/import-graph.json。重要定位均为固定基线：

| 链路 | 原文件/函数 | 状态及依赖 |
|---|---|---|
| 生成入口 | `public/script.js:4290 Generate` | DOM、chat、characters、persona/power_user、oai_settings、metadata、extension_prompts、事件、interceptors |
| 角色材料 | `script.js:3402 getCharacterCardFieldsLazy` / `:3476 getCharacterCardFields` | 描述/性格/场景/示例、persona、角色系统及post-history覆盖、宏和深度提示 |
| 提示编排 | `PromptManager.js:1277 preparePrompt` / `:1516 getPromptCollection`；`openai.js:1542 prepareOpenAIMessages` | 配置顺序、覆盖与渲染；finally 仍有 DOM 副作用 |
| 预算 | `openai.js:885 populateChatHistory`、`:1101 populateDialogueExamples`、`:1185 populateChatCompletion`、`:3917 ChatCompletion` | 固定/控制预算预留与展示顺序不同；history 新到旧、首个超预算停止；pin_examples 改变分配 |
| 世界书 | `world-info.js:199 WorldInfoBuffer`、`:479 WorldInfoTimedEffects`、`:4709 checkWorldInfo` | 关键词/regex/二级条件/递归/概率/计时效果、独立预算及位置；缓存、metadata、角色、tokenizer、DOM |
| 作者注记 | `authors-note.js:324 setFloatingPrompt` | 原样保留，复杂组合未专测 |
| 传输/保存 | `openai.js:3138 sendOpenAIRequest` → 后端chat-completions；`script.js:7395 saveChat` → `src/endpoints/chats.js:545 /save` | 原响应处理、chat写回、JSONL保存与完整性保护 |
| 图片/音频进模型 | `openai.js:885 populateChatHistory` 内 inlineMediaAttachment → `Message.addImage:3624` / `addAudio:3693` | chat.extra.media + media_inlining；原图片压缩/尺寸和token成本、音频时长估计；custom后端 `embedOpenRouterMedia` 把audio_url转为input_audio |
| 图片描述 | `extensions/caption/index.js` caption命令 / getCaptionForFile / captionLocal → `/api/extra/caption` → transformers `getRawImage/getPipeline` | 保留真实图片解码、caption结果；测试只mock推理 |
| 情境发图 | `extensions/stable-diffusion/index.js:2990 generatePicture` → getPrompt → `generatePrompt:3292` → `generateQuietPrompt` → 原Generate('quiet') → `sendGenerationRequest` / `generateAutoImage:3797` → `/api/sd/generate` | quiet请求含同一个角色/persona/历史，模型回复处理为图片提示，图片保存并加入角色聊天；SD_ProcessTriggers也是实际generation interceptor |
| 语音输入 | `src/endpoints/speech.js /recognize` → getWaveFile → getPipeline(automatic-speech-recognition)；`openai.js /transcribe-audio`等 | WAV解码、转32f、16kHz、合并声道；远端转写为文件上传接口。固定源码未发现一套默认内置的麦克风/录音到发送UI闭环，转写进入Generate在测试入口桥接，不冒称原版已有完整电话 |
| 语音输出 | `extensions/tts/index.js` onMessageEvent / processAndQueueTtsMessage / processTtsQueue / voiceMap / audioElement；`tts/openai-compatible.js` generateTts → `/api/openai/custom/generate-voice`；`speech.js /synthesize` | 从聊天消息与角色名选择voice，队列/清理/播放；本地SpeechT5和远端TTS实现都保留 |

`evidence/core-hashes.json` 及媒体hash证明原openai.js/PromptManager/WI/作者注记/聊天保存、恢复的媒体扩展和端点与官方源码逐字节一致。核心改动主要是入口范围guard、路由注册和后端仅保留custom chat-completion/tiktoken的结构删除；不是另写预算/WI算法。静态导入图包含类型注释候选，不能当精确运行覆盖；实际资源/接口路径另外保存在测试记录requests中。

## 当前保留与裁剪边界

**必需且已保留、被测路径**：单角色、persona、角色/系统/示例与post-history、选定WI行为、历史预算、普通发送/再生成/图片用quiet生成、custom OpenAI-compatible聊天、图像/音频上下文；图像描述与情境生成、图片写回/存储；本地语音识别/合成原处理代码、OpenAI-compatible TTS provider、TTS角色voice映射与播放队列。恢复的扩展为 attachments/caption/stable-diffusion/gallery/tts；恢复 speech/caption/images/Stable Diffusion/google/anthropic/azure/minimax/volcengine/transformers 和图片metadata路由；Comfy默认工作流也恢复。

图像/语音服务的原多供应商代码暂不继续细切，避免破坏必要能力。验收选用无密钥的custom聊天、custom TTS、mock本地Whisper/SpeechT5/caption、mock SD WebUI；其余语音/媒体供应商代码保留不等于逐个真实服务兼容测试通过。原novelai/Horde等已裁端点仍显式返回501，故依赖那些供应商的媒体选项不属于当前支持列表。后续若裁剪重复供应商，应先沿这张功能依赖表选定目标提供商，再跑媒体oracle。

**继续删除**：summary/vector memory、翻译、表情、Quick Reply等可选扩展；Horde/novel/text-completion聊天分支、多chat provider与非tiktoken模型；非英语UI翻译、示例角色/背景/主题、部分跨平台发行脚本、粗细字体变体。不会再以删除图片/语音获得更小数字。默认字体普通字重保留，其他字重浏览器合成。外部扩展安装管理501；不支持的chat provider、streaming chat、tools/schema/logit-bias和非GPT模型生成422；群聊和swipe/continue/impersonate生成拒绝。图片/音频messages不再被纯文本guard拦截。

**仍需拆解**：完整HTML/DOM及初始化、副作用/全局单例、slash/宏、旧provider设置UI、角色编辑/导入/部分管理路由、Jimp/媒体库与前端lib。assets/sprites等工具因角色/文件间接依赖仍在；不能把“还在仓库里”与“已测试产品能力”混为一谈。保留管理路由也说明这不是对外最小生产服务。复杂WI逻辑如全部NOT/AND组合、inclusion groups、min activation、延迟递归/递归上限、其他注入位置、cooldown结束后重激活及复杂作者注记未穷举，但其原代码没有改写。

## 可重复验收与真实边界

系统Chromium 151.0.7922.173，Playwright1.58.2，Node24.19.0/npm11.9.0。Chromium明确开启sandbox。首次外层执行沙箱不允许其SUID helper，改用获准外层执行上下文后启动成功，没有--no-sandbox、没有修改安全设置。所有服务只监听127.0.0.1。

自创Mira/Lin角色与persona、历史/WI、2×2红蓝PNG、0.2秒合成音调WAV及真实编码MP3，没有用户素材/敏感数据。固定UTC/locale、2025-01-01时间、Math.random=0.42、seed42，固定GPT tokenizer；预算用原版tiktoken，不用mock token usage。测试关闭动画，避免冻结Date使原jQuery动画永久等待。测试设置直接注入原导出状态/缓存，不覆盖角色导入向导。

**15组文本/WI回归**：提示字段及顺序；首个巨大历史停止；pin off/on分配差异；WI命中/未命中/普通递归、regex/AND_ANY/固定概率、insertion depth、独立scanDepth、独立预算/ignoreBudget、delay抑制、sticky/cooldown；regenerate；503后显式重试。mock位于服务端向provider发出真实HTTP的边界，捕获完整最终JSON；原响应处理和JSONL落盘实际执行。比较完整provider请求、字段和聊天role/name/content，只忽略时间戳/内部ID，不忽略messages的内容或顺序。

**6组媒体语音回归**：

1. 原TTS控制从聊天末条Mira回复取文本，经原voiceMap选alloy、原队列和provider发请求，校验原provider收到该回复及选定voice；播放元素与逻辑原样保留，未进行真人听感测试。
2. 图像附件随角色/persona/历史进入provider的image_url部分；图片token计数路径运行。
3. WAV音频附件经原addAudio和custom后端转换，最终provider JSON包含input_audio和正确base64/格式，同时保留角色上下文。
4. `/speech/recognize`接受合成WAV并运行原解码/重采样；mock转写成为Lin的用户消息→原Generate→Mira回复；原custom TTS provider拿该回复发音，并让浏览器解码mock的真实MP3；另验原`/speech/synthesize`生成RIFF/WAV。
5. 原`/imagine scene`回调做真实quiet角色请求→mock模型生成图片提示→原SD WebUI请求→mockPNG→原图片保存和角色聊天media写回；图片可HTTP读取。不是直接编一条图片URL冒充上下文发图。
6. 原caption命令读聊天图片，真实RawImage解码，原caption端点调用推理边界，返回合成描述。

文本/媒体测试都用真实Generate而非仅dryRun；启用媒体扩展的用例执行真实SD interceptor调用，但并未穷举每种自动触发策略。图片/音频推理没有真实模型、真实key或模型下载。仅测试用`--import mock-media-register.mjs`在`sillytavern-transformers.pipeline`边界替换推理；保留真实RawImage、wavefile、原端点及模型选择/参数传递。普通启动没有该mock。测试工具把STT转写放入原输入框，它是验收桥接，不是新增生产录音UI。mock声音是音调，不是有自然音色的语音。测试中的gpt-4o-mini是固定计数/请求夹具，mock不检查真实模型的媒体能力；实际接入必须选择支持所需图片/音频模态的模型，不能据此声称任意模型均支持。

已解决的真实失败：异步预设在settingsReady后覆写配置，改为等完整启动；sticky原先误按轮次理解，依原源码改为消息数边界；冻结时钟导致动画等待，双方同样禁用动画；删除工具文件导致import失败，恢复间接依赖；JSON省略undefined造成比较不一致，双方序列化后严格比较。没有通过删测试掩盖差异。

## 更新后的实际体积

口径：上游跟踪文件排除.git/node_modules/运行数据/新增research工具。文本统计含js/ts/html/css/json/yaml、上游tests、锁文件和vendored/minified文件；不是纯手写核心SLOC。MB十进制。依赖包数用npm query安装树去根包核对；磁盘递归package.json数会含包内清单，不能替代该数字。

| 版本 | 状态 | 上游文件/MB | 文本文件/行/MB | 直接依赖/安装生产包 | 依赖文件/MB |
|---|---|---|---|---|---|
| 固定原版 | 对照基线 | 1010 / 61.993 | 754 / 279035 / 25.445 | 96 / 667 | 20000 / 293.710 |
| 纯文本阶段1 | 已否决边界，仅留历史 | 790 / 39.394 | 589 / 205461 / 18.826 | 96 / 667 | 同原版 |
| 纯文本阶段2 | 已否决候选 | 736 / 21.491 | 553 / 190664 / 10.405 | 88 / 494 | 14209 / 127.628 |
| 纯文本字体阶段 | 已否决候选 | 694 / 13.292 | 553 / 190431 / 10.399 | 88 / 494 | 同上 |
| **恢复多模态/语音** | **最新合格边界** | **777 / 16.830** | **634 / 218861 / 13.933** | **91 / 595** | **18264 / 278.056** |

最终源文件字节约降72.85%，文本行约降21.57%，包数降10.79%，依赖字节只降5.33%。内置媒体/语音推理重新带回了较重依赖，这是保留必需能力的真实成本；不能仍宣传128MB依赖。原版/切片前端webpack产物约1.948MB、2文件（lib.js+LICENSE），说明UI/lib耦合仍在；运行数据目录里的约12MB构建缓存单列，不随源码交付。

旧纯文本回归后RSS快照原版501728KiB、阶段1 432892KiB、阶段2 480356KiB，不能作为新版本内存指标或稳定节省率。最新独立复核将另记RSS、浏览器heap/DOM、构建输出。GC/首次webpack影响显著；没有做真实模型推理内存、并发、低延迟或吞吐基准；mock推理不加载真实模型权重，RSS不能代表装载Whisper/SpeechT5后的完整占用。

## 距离真实双向语音通话还有什么

ST原版保留的是按消息/分段文本驱动TTS、浏览器音频播放，以及本地/远端转写端点。它不等于完整电话。固定源码中未验证到默认麦克风采集→实时传输→增量转写→轮次判定的闭环。未来仍需设计并验证：录音权限与采集、VAD/结束说话判定、流式或增量ASR、回声消除、用户插话/barge-in、取消与播放缓冲、网络抖动/重连、全双工时序、端到端延迟、声音/情绪/角色音色控制和IM/微信终端约束。当前chat生成仍限定非流式；不能承诺电话体验。

语音文本、图片及caption是同一角色会话材料，隔离要求与聊天记忆相同。进入云端时必须按tenant/user/conversation隔离chat、persona、WI timed effects/cache、settings、token cache、媒体文件、转写/TTS队列及任务取消范围；当前浏览器单例不能共享给多用户。原后端用户目录不等于本轮已经证明端到端多用户记忆隔离。

## 两条路线更新

**直接复用ST继续裁剪**仍是证据更充分的下一步：世界书、PromptManager、预算、多模态消息与媒体/语音模块都可直接复用原实现。保留同一原版请求oracle，逐层拆初始化、状态和渲染边界。不能靠删除图片/语音这种必需能力达成“轻”。下一轮最有价值的是脱离完整DOM/管理UI，以及媒体provider的明确选择，而不是重新实现角色逻辑。

**未来移植Between/LangGraph承载**仍可行，但未在本轮执行。LangGraph只可能承载编排/状态流程，不能替代ST的具体角色/WI/预算/多模态语义；优先移植经过对照验证的原函数和适配层。须先明确多用户隔离、媒体存储、语音任务生命周期和AGPL对应源码边界，不能把现浏览器全局变量简单搬到共享后端。

模型自然度、真实看图能力、真实语音识别准确率/音色/情感/音质，以及双向通话延迟都未验证。mock证明路径、请求形状和原版行为对照，不证明“像真人”。

许可证义务详见SOURCE.md和根LICENSE；AGPL修改版的传播/网络交互可能要求提供对应源码，不能只给原版上游链接，也不能因为只放云端或另开进程就预设豁免。没有擅自换许可或发布。
