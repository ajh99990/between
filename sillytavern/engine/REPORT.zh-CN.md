# Between 独立角色引擎：已实现与验证结果

2026-10-08。本轮已得到一个可直接嵌入Node进程、无需浏览器/DOM/完整酒馆服务的角色后端研究原型。它不是另写一套简化prompt拼接：角色字段、旧宏替换、PromptManager、历史/示例预算、WI扫描/递归/计时、多模态消息构造和媒体转换直接抽取SillyTavern原声明；新代码负责状态绑定、I/O、会话队列、事务和存储。

入口为engine/index.mjs的RoleEngine模块API；engine/demo.mjs提供可直接执行的本机语音/图像演示。普通运行没有Chromium、Playwright、HTML页面、jQuery或webpack。模块的VM执行上下文只含抽取的原代码及明确适配，不启动ST应用。

## 来源、分支与隔离

固定官方上游06bde939fb1e9c4c8d8641d810f0a916b5bce127，package版本1.19.0；不称其等于发布tag。前一轮已交付b357a7bf91d3bb5efda00c7ea633528619051090保持原样可回退。

新独立工作树：/workspace/st-research/engine；本地分支research/independent-role-engine。最终运行实现提交b0ec082ad57196d202e0f9354c730564788d5b22。后续提交仅补独立验证与文档。未修改/workspace/between、Mac或Seed；未push/发布/部署、未使用生产.env或真实key、未调用外部付费模型。网络研究服务仅回环监听。

环境曾短暂报告exec-server transport disconnected。重试普通pwd恢复，之后Node测试、Git检查、两次独立导出安装及最终演示均实际返回成功，未创建新环境或丢弃工作。03:57UTC再次收到断连通知时，随后的实际命令与最终测试仍成功；不是根据任务inProgress状态推断正常。

## 如何独立运行

工程根目录：

```sh
npm ci --prefix engine --omit=dev --ignore-scripts --cache /tmp/st-engine-npm-cache
npm test --prefix engine
npm run demo --prefix engine
```

需Node24；测试不需要真实模型、凭据、浏览器或模型下载。demo实际走原ASR波形处理→角色编排→custom TTS处理，以及同角色quiet生成→原SD WebUI请求→图片保存、原caption处理；模型边界返回合成结果。输出reply.mp3、scene.png和会话快照至独立/tmp目录。测试音频是音调，不能视为真人语音。

详细配置、API示例、恢复及限制见engine/README.zh-CN.md。适配本机真实OpenAI-compatible服务时修改可信宿主配置；当前只允许显式127.0.0.1或[::1] HTTP地址，并拒绝重定向。没有默认HTTP公网服务或面向用户的身份认证入口，模块API的principal必须来自宿主已验证身份。

## 原代码继承与适配规模

| 部分 | 实测规模 | 说明 |
|---|---:|---|
| 抽取的原运行声明 | 3文件，281519字节，7072物理行 | core.js、media.js、stream.mjs；保留原算法、注释及部分未调用UI方法 |
| 新运行适配 | 3文件，24986字节，133物理行 | core/index/media；部分长行，不能拿行数推估工作量 |
| 上游默认设置 | 26726字节，639行 | 原官方settings.json，运行读取其默认预设 |
| 构建产物 | 0 | 不做前端构建 |
| 基本生产依赖 | 3直接、93安装包 | tiktoken1.0.22、Jimp0.22.12、wavefile11.0.0 |
| 安装依赖磁盘 | 1506文件，50905642字节 | 不包含可选本地模型运行时和权重 |

core抽取86个声明，逐项来源/行号/hash在vendor/provenance.json；媒体来源在media-provenance.json。EventSourceStream直接继承public/scripts/sse-stream.js。全部保留AGPL-3.0及原版权信息。抽取脚本和原文件都随包提供。

核心声明内的明确适配：prepareOpenAIMessages的catch改为重新抛错，防止后端在预算错误后提交部分prompt。PromptManager用原prototype和显式配置，绕过DOM构造/init；render是无副作用边界。WI输入适配为显式entries，按原order方向排序，不读取UI选择的世界书。Node图像尺寸/WAV持续时间/token计数适配替换浏览器I/O。Generate没有整函数搬移，新协调代码执行其已选单角色chat-completion子链路；不能称整个Generate零改动移植。

基本依赖50.91MB是真实测量，但不代表完整本地模型部署大小。可选localInference()使用sillytavern-transformers2.14.6，需另装此原依赖并提供已有本地模型；禁远程模型下载。本次未装载Whisper/SpeechT5/caption权重，不以省略模型资源宣称真实推理只要50MB。原媒体处理代码没有删除成空接口。

源码归档保留上一轮ST切片作为来源、回退及浏览器oracle复现材料，所以还含public页面源码；它们不被独立入口导入或初始化。归档体积与运行依赖、抽取代码分别列示，不宣称整个源码包只有281KB。

## 保留的角色语义与明确差异

已保留单角色、persona、系统/角色覆盖、示例、post-history、角色深度提示、所选常用宏、历史预算与pin_examples；WI关键词/regex/二级条件、概率、递归、扫描深度/注入深度、独立预算、delay/sticky/cooldown；普通回复、再生成、quiet图片提示及图片/音频同上下文。

仅接受已验证gpt-4o-mini tokenizer配置和custom聊天传输。真实所接模型的模态能力需另行验证，这个固定测试模型名不是实际音频能力的证明。流式文本已恢复，使用原EventSourceStream。

不支持的配置明确报错：群聊/swipe/continue/impersonate、工具和推理metadata、实验/变量/时间/随机宏、非in-prompt persona、WI作者注记位置/outlet/decorators、隐藏system历史消息、内嵌character_book及未适配角色扩展。未知preset/power/WI/操作字段会拒绝。其他已保留WI组合未穷举，不宣称全部ST配置兼容。

完整UI、任意扩展interceptor、自动发图触发、作者注记编辑/计数、浏览器音频播放没有搬到后端。媒体改为显式操作模式。角色回复持久化、取消、失败和幂等为新的事务边界：失败不提交输入或WI变化，与ST浏览器失败时可能保留输入/部分状态不同。这是公开记录的行为差异，不用删除测试掩盖。

## 多用户、并发、保存与长期记忆

tenant/user/conversation三元组决定存储哈希键。调用端只持有绑定principal的API，用户提供的conversation不能成为磁盘路径。同会话队列串行，不同会话可并发；输入入队即复制。每次角色编排创建独立VM上下文，原模块全局状态不跨会话共享；WI计时状态仅从本会话metadata恢复。

普通回复、语音媒体、WI及幂等记录在同一JSON事务内原子提交。临时文件fsync→rename→目录fsync；失败/取消/截断SSE回滚。重复消息id相同内容返回提交结果，不同内容拒绝；特殊原型键拒绝。外部provider已经执行的操作不能回滚，崩溃发生在远端完成与本地提交之间，重试可能再次请求provider，因此不是分布式exactly-once。

一个数据根只允许一个实例。异常退出后由单一可信主管显式recover：存活PID拒绝，PID不存在才恢复；下一次open清理本引擎严格命名的未提交.tmp。测试包括SIGKILL和孤立临时文件，未模拟硬件损坏。PID复用保守拒绝；多个恢复主管并发不在支持范围。磁盘root与宿主代码受信任，VM不是恶意JavaScript安全沙箱。

长期历史完整保存，prompt预算只选取上下文，不删除旧消息。summary带coveredThrough与revision，经原1_memory注入；regenerate影响已覆盖消息时清空摘要并递增revision。可插拔retrieve回调接收绑定principal、conversation、快照和实际输入（语音使用ASR文本），经原3_vectors路径注入。没有内置自动摘要模型/向量数据库；summary不自动裁掉已覆盖历史，可能重复信息。外部索引隔离、删除和恢复由宿主插件履行，不能称已完成自动长期记忆产品。

## 媒体与语音可运行到哪

图片/WAV输入由原Message.addImage/addAudio和原embedOpenRouterMedia进入同一角色上下文；Node适配读取尺寸和时长。caption复用原handler；本地ASR复用原getWaveFile/recognize，确实处理3200样本；本地合成复用原synthesize输出12844字节RIFF。TTS复用原OpenAICompatibleTtsProvider方法和custom endpoint转换，以角色voiceMap选择声音，返回音频给客户端。

情境图片先运行同一角色的quiet请求，再经原generatePrompt/processReply/generateAutoImage调用SD WebUI，图片存入会话媒体。对照时发现模块默认scene提示与官方随包预设不同，已使用oracle相同的官方预设；没有篡改baseline。

HTTP取消/错误会传播并阻止提交；第三方本地CPU推理只能协作取消，不能承诺强制抢占。浏览器播放队列替换为后端会话任务队列，不在服务端播放声音。原SD save_images:true保留，provider可能自行留图；引擎delete只删除自身会话/媒体/幂等，不清除provider目录、日志、备份或外部检索索引。不能把本引擎隔离测试扩张为外部provider端的隔离认证。

未实现麦克风采集/WebRTC/VAD/回声消除/barge-in/全双工协议；流式文本和消息式语音链不是完整电话产品。模型自然度、ASR准确率、音色/音质、实际看图能力和通话延迟仍未验证。

## 验证与审查

旧15组文本与6组媒体fixture/oracle文件保持逐字节不变；没有重录替换baseline来适应新实现。新核心测试对照messages与角色fields；独立服务经真实回环provider HTTP比对最终完整请求、文本聊天写回、TTS请求和SD请求。媒体浏览器播放状态不作为Node一致性的声明。

21组原用例：basic、budget-first-overflow、budget-unpinned、budget-pinned、wi-keyword、wi-recursive、wi-off、wi-regex-secondary-probability、wi-depth、wi-scan-depth、wi-budget、wi-delay、wi-sticky-cooldown、regenerate、transport-retry、tts-character-queue、image-context、audio-context、voice-roundtrip、contextual-image-generation、caption-context。

新增20项服务/生命周期检查，最终integration输出ALL PASS 34（21+13），lifecycle输出LIFECYCLE PASS 7：跨tenant交错/WI隔离、同tenant不同user、同会话顺序、重复id和冲突、并发重复只请求一次、流式取消回滚重试、逐字节CRLF、截断流回滚、预取消、错误TTS原子回滚、重定向拒绝、重启摘要/WI恢复、SIGKILL及孤立tmp、覆盖摘要再生成失效、队列入参复制、语音检索实际文本、媒体越权/删除/URL拒绝、原本地RIFF合成、配置/宏/模型范围拒绝等。部分复合检查含多个断言，不把数量当完整安全证明。

第二遍独立只读代码审查曾复现并指出：__proto__幂等漏洞、覆盖开关被覆盖、装饰器静默丢失、宏未展开、tokenizer模型范围、fetch重定向、CRLF边界、voice检索时机、入参引用、摘要失效、重启测试误用旧client。全部修复并增补测试；后续还修复caption白名单和崩溃tmp清理。详见evidence/independent-review.md。它是工程审查，不是生产安全认证。

最终从运行提交b0ec082ad导出到/workspace/st-research/engine-verify-final，无Git元数据、不复用原node_modules；独立npm ci实际安装93包，完整npm test及demo均exit0。原21核心对照、34集成和7生命周期均通过。日志：evidence/clean-install.log、clean-test.log、clean-demo.log、clean-integration.json、clean-lifecycle.json。

独立导入一次实测约672ms，RSS132489216字节；完整测试后的RSS另记于clean-integration.json。它们是单次mock负载快照，不是稳定延迟/并发/真实模型内存基准。没有前端构建、没有常驻浏览器。

## 清理、交付和下一步判断

最终检查无活跃研究Node/Chromium服务；demo输出的合成文件和独立依赖安装保留在研究/tmp目录，不随源码打包。旧环境已退出的Chromium僵尸不属于运行服务，未操作PID1。Between和已交付ST切片工作树未修改。

本轮成果已证明可以优先直接复用ST算法，拆掉运行时对完整页面的依赖；无需重写角色核心或引入通用Agent/Qwen。LangGraph不是必需依赖。下一步应在明确终端接口下接宿主身份验证、真实模型/媒体服务和长期记忆策略；继续复用当前经过oracle验证的核心，再补对应行为测试。当前可作为本机可信宿主中的独立研究引擎，尚不能当作已经完成真实自然度、外部provider隔离或双工通话验证的生产系统。

AGPL-3.0、来源和修改说明随源码保留；没有更换许可或部署发布。对外分发/提供修改版网络服务时须评估并履行对应源码义务，不能只给原上游链接代替本修改版源码。
