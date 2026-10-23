# Eros：运行机制全貌、持久事实与行为链路

[返回研究总索引](../README.md)
核查日期：2026-10-23。固定版本：`etherfunlab/eros-engine@9715af2ce7d8524ca5ce8771059d436c31951977`。

这是新一轮完整入口核读，不是上一轮关系／离线段落的扩写。已读服务装配、所有 pipeline 文件的职责和关键实现，以及相应存储写入、真实消费点。此次是静态源码核查：未启动数据库／服务、未运行 Rust 测试、未调用模型，不能据此保证人物表现自然。下文“默认”指源码默认值／无配置时的分支，不代表任一线上部署实际已开启。

## 先把作者在做什么说清楚

从实际接线可以归纳：**让一次回复成为“既有人物、已有生活和已有关系在此刻产生的结果”，再把这次交流留下的后果写回去。** 不让回复模型每轮从零发明人生；但也没有一个掌握全部状态、统一决定所有事情的“大脑”。

它实际由几种不同的决定者共同构成：

- 世界导演维护一群人物所处的共同故事；个人故事导演维护某个人的人生近况。
- PDE 判官决定当轮采取什么交流动作，并判断短暂内在状态、需求与回应方式。
- 回复模型拿更完整的背景，把动作写成话。
- 事后提取器把事实、人物画像、关系变化留下来。
- 时间规则、概率抽签、数据库约束和队列调度在模型之外决定某些事情能否发生。

这条主线不是“后台每秒更新一个真实人的全部状态”。世界导演、离线事件、需求、关系、礼物余效各有自己的时间尺度和触发来源，连接并不完整。尤其要把“模型写了一条生活进展”与“工具真的在现实平台完成了一件事”分开。

## 入口、后台、状态、消费点清单

### 服务到底启动了什么

`run_server` 建立 PostgreSQL 连接、OpenRouter 与 embedding 客户端、Supabase JWT 验证、模型配置，构造一个共享 AppState；再合并 HTTP 路由，启动五个后台任务。不存在从文件名推测的“人物主循环”。[^src-1][^src-2]

| 实际入口 | 谁触发 | 作用与边界 |
|---|---|---|
| 文本 `/comp/chat/{session_id}/message/stream` | 外部客户端提交消息 | 保存用户消息、争用队列驱动权、运行文本管线、SSE 返回；连接断开仍继续文本生成。 |
| `/v2/comp/session/{session_id}/message/async` | 外部客户端 | 保存同一种待生成消息，交给后台队列。队列是可靠生成工具，不是人物日程。 |
| `/comp/voice/{session_id}/turn/stream` 与 `interrupt` | 通话客户端提供已识别文字、打断回执 | 独立的短上下文语音回复管线，和文本不是完全相同的决策流程。 |
| `/v2/comp/session/{session_id}/open` | 客户端报告打开会话 | 判断生日、节日、首次见面、回来等开场；符合条件才生成主动消息。 |
| `/v2/comp/session/{session_id}/events` | 外部调用方要求抽取一次生活事件 | 程序抽事件，可写入持续事件并生成告知消息；不是自行按日程定时发起。 |
| 群聊创建／成员／message stream | 客户端 | 群聊导演排发言顺序，再逐个调用人物回复。 |
| 世界 Town feed、评论接口 | 客户端看动态／发评论 | 读取内部人物动态，写入用户评论供后台角色回复。 |
| 图片构图、已有图片编辑、图片结果回写 | 客户端 | 产生绘图指令或记录客户端生成的结果；文本引擎不是实际绘图器。 |
| 人物物品／衣柜、表情回应、effects、画像、历史／归档 | 客户端与管理层 | 持久配置或查询；其中有的进入模型，有的仅供 UI／导出。 |

完整路由装配包含上述分支、BFF、BYOC 和受独立服务密钥保护的导出接口。不能把“代码里存在 Event::ProactiveTrigger”当成已挂载的定时主动联系入口：生产 Rust 路径中这些枚举没有形成一个独立后台生产者；本次查到的主动私信生成调用来自 open 与 events。[^src-3][^src-4][^src-5][^src-6]

| 启动的后台任务 | 源码默认节奏／开关 | 真正工作 |
|---|---|---|
| dreaming | 默认每 300 秒扫描，闲置 1800 秒后可处理；任务配置缺失或禁用则不工作 | 从闲置会话提取分类记忆。 |
| snapshot | 默认新加坡时区每日 23:00，可禁用 | 给 human_insights 留日快照；不调用模型，不生成生活。 |
| world | 默认每 300 秒检查；世界轮次默认隔 24 小时 | 先世界导演，随后可选个人故事扫描。Stories 默认隔 8 小时、近期活跃窗口 72 小时。 |
| world_town | 30 秒 tick；依赖 world 开启和导演配置 | 发布到期动态；可选小时级角色互评、用户评论回应。 |
| chat_queue | 默认 5 秒扫描、并发 4、最多尝试 3 次、待处理深度 20、单轮超时 300 秒 | 驱动未完成的文本／群聊生成，回收失效占用。 |

world／stories／Town 都有独立任务配置、总开关／子开关与参与用户条件。**扫描默认开启，不等于付费模型任务已经配置，更不等于所有用户都参与世界。**[^src-7][^src-8][^src-9][^src-10][^src-11][^src-12]

### 保存了什么，谁真的在读

下表是行为机制清单，而非数据库目录。最后一列尤为重要：**保存不等于影响人物。**

| 状态 | 写入者／作用域 | 实际消费者与作用 |
|---|---|---|
| persona genome、实例、物品／衣柜 | 配置／创建接口；实例有 owner | 回复、判官简述、世界导演、构图读取不同子集。固定底稿与提取画像不是同一来源。 |
| chat_sessions、chat_messages、队列行 | 路由、生成执行器 | 历史、下一轮提示、异步驱动、未读／ghost、回放与修复。 |
| companion_affinity 及事件审计 | 回复后关系评分 + Rust 事务规则 | 下轮判官档位、回复态度、沉默规则、生活事件资格、Stories 的参考输入。 |
| needs，存当前 user message 的 metadata | PDE 模型评定；读取时按时间漂移 | 下一轮判官、同轮回复、生活事件权重、语音开场冻结快照、UI 查询。不是单独全局情绪表。 |
| 接受动作及其余效 | 成功回复时在消息上保存动作决定 | 从此前接受过的给物动作推导多轮身体效果，判官、回复、构图读。 |
| raw profile／relationship memory | 成功对话后的异步写入；用户级／用户×人物实例 | 向量检索召回。**当前 writer 两层实际都以用户原话为主，关系层加“用户：”前缀，不是保存整段双向对话。** |
| human_insights | 两阶段提取；user_id 全局 | 主要画像常驻回复、语音启动快照；还有导出、日快照。 |
| character_insights | 两阶段提取；instance_id | 四项当前状态进入文本回复；十项完整程度决定历史窗。其余不是都回灌。 |
| user_insights | 另一套两阶段提取；instance_id | 接口查询／存储用途。源码明确 DB-only，**不进入当前人物提示词**；不要与 human_insights 混称。 |
| world_states 的 seed/digests + world_memories | 世界导演；owner 的一组人物 | seed 给下轮导演；人物 digest 常驻文本回复；片段按向量召回。 |
| persona_story_insights/events/memories | 个人故事导演；实例 | 当前人生 digest 常驻、过去经历召回；近期故事反馈世界导演。 |
| persona_events | /events 程序抽签；实例，共享给其文本会话 | 当前前景／背景事件、离线拦截、事后解释、主动开场闸门。与 story_events 完全不同。 |
| world_posts/comments | 世界导演、Town worker、用户评论接口 | 内部 feed 展示，评论与回复模型读取；不是 B 站／小红书的外部发布记录。 |
| 生成、判官、提取、关系审计 | 各调用点 | 排障、关联失败、费用／模型来源；审计失败尽量不拖垮回复。 |

证据：[^src-13][^src-14][^src-15][^src-16][^src-17][^src-18]

原项目的“一个 owner 的人物实例与世界”也不能直接等同于我们决定的“现实世界中同一个公共人物面对全部用户”。现有 ownership、世界归属、会话关系索引都要重新映射；本研究只还原上游，不提前决定全局情绪、逐关系情绪或条件外溢。

## 专题阅读顺序

- [生活世界与公开痕迹](01-生活世界与公开痕迹.md)：世界导演、个人故事、短时生活事件、主动开场、内部动态与恢复。
- [关系需求与交流决策](02-关系需求与交流决策.md)：PDE、语义关系评估、程序连续性、需求、礼物余效。
- [记忆画像与上下文](03-记忆画像与上下文.md)：原话记忆、三套画像、真实回灌边界、历史清理、dreaming 与感知旁路。
- [通道工具与失败恢复](04-通道工具与失败恢复.md)：文本/图片/语音/群聊、产品咨询、队列、取消、归档与审计。

各专题可独立阅读；以下统一案例用于检查专题之间究竟有没有实际接线。

## 用同一天把这些机制串起来

以下是**依据代码构造的情境，不是实际模型运行记录**。假定相关可选任务均启用、人物实例与世界已报名。

1. 前一天故事导演保存“她做财务工作，最近在赶月报”，当前 digest 每轮都给回复模型；世界导演保存她与同事的小圈子近况。这不会自动让她今天 14:00 离线。
2. 14:00，宿主调用 /events。程序抽到 busy，持续一小时。若关系达到告知门槛，greet 生成告知，事件与消息一起写入；否则只写事件。
3. 14:10，用户发“晚上八点聊会儿？”：先入库，离线闸门命中，PDE 与回复都没读内容；返回 ghost 完成且不记关系冷处理。这里没有保存“15:00 必须处理这句邀请”的承诺。
4. 15:00，时间越过事件终点。不会仅因钟到点自动发消息；这条邀请也没有重新排队。
5. 15:05，用户再发“忙完没？”：新的文本回合可以继续。系统带入“刚才离线期间有人发过消息，尚未解释”；旧邀请若仍在历史窗内也可被这次模型看到。PDE 决定动作、临时内在状态、需求和回应模式；真正回复模型还读到人生 digest、世界摘要、常驻用户画像和召回的旧事。
6. 假设用户接着不满地催促：成功回复之后关系评估才留下耐心降低、紧张变化与原因；这次说出的人物近况被 character_insights 提取，用户陈述被 raw memory 保存。下一轮道歉可能改变端点态度，但长期信任是否上升由评估结果与持久化规则共同形成。
7. 晚些时候会话闲置，dreaming 提炼分类用户记忆；到 Stories 周期，导演带真实聊天证据更新人生近况与用户关系，只能从聊天证据确认约定，不能擅自替用户说“已经赴约”。
8. 下一个世界轮读取这些近期生活事件，为小圈子续写。它可以安排她发一条内部动态；Town 到时间发布，其他角色评论，用户评论后又可触发作者回应。
9. 若同一时刻用户发起语音，请求进入另一个薄管线，并非自动复用文本 busy 硬阻断。这是采用前必须明确统一的跨通道策略。

这一串最值得借鉴的是**事实先保存、不同读者拿有边界的视图、行为后果写回、后台再推进**。而值得警惕的是：多条链拼起来容易看似一个完整人，实际存在世界／故事／离线／需求之间断开的边，需要逐条验证，不能只看模块名称。

## 与我们设想的关系：可借实现与尚缺证明

1. **值得保留为复用候选：** 世界／个人生活的“当前摘要常驻 + 旧经历检索”；模型关系判断与程序连续性保存分工；已读消费点；离线与关系沉默分开记账；后台 claim、版本和事务；真实说出内容与未说出内容区分；主动消息幂等；人物动态 feed 的发布—评论—回应链。
2. **需要重新决定的产品策略：** 关系交叉惩罚与增长速度、沉默保护、随机生活事件、强制图片可穿透离线、每轮动作描写／第一句清理、owner 私有世界、worldview 重置旧人生。它们不是“工程正确所以人物心理也正确”。
3. **不能因此声称已有：** 共用一个现实身份面对所有用户的完整状态模型；B 站／小红书真实消费与发布工具；真实工作任务的完成凭证；统一日程编辑与历史保护；到期查看收件箱／履行已读延期责任的调度器；已证明优于普通模型的情绪质量。
4. **已读字段的限制：** 当前 read_at 只有 PDE 派发点写；关闭 PDE 时，回复模型读了内容也可能保持 NULL。所以不能直接把这列当作我们“信息进入人物注意范围”的全链路真相。必须把所有感知入口纳入统一可审计边界。[^src-19]
5. **感情范围仍开放：** 本稿不替我们排除数值情绪系统，也不决定全局、逐关系、条件外溢中的任何一种。Eros 的关系数据和简单需求可分别评估复用；若目标是更成熟的情绪连续性，需要继续与专门系统对照，另做可复查的行为实验。

## 本轮覆盖与未验证范围

已独立核查：main 装配和完整路由合并；五个 worker 的启动与门槛；文本、async、voice、group、open/events 主路径；世界、Stories、Town 的输入／写入／消费者；原话与三套画像、dreaming、需求、关系、身体余效、历史处理；文本和语音断线／重试差异；相关事务、归档保护、幂等、审计降级。所有链接都固定在同一个 SHA。

只做外围盘点、没有逐分支穷尽：BYOC/BYOK 所有校验、图片编辑的全部变体、管理员/BFF 每个返回字段、每个事件种类的提示文本、每个 filter/parser 的异常形态、部署脚本与外部前端。没有把“未发现通用 MCP 运行循环”写成“所有生态仓库都不存在工具扩展”。

未运行：Rust 单元／数据库集成测试、真实模型对话、后台跨日调度、多实例并发、实际照片生成、外部社交平台操作。源中有大量单元与 sqlx/wiremock 测试，能证明作者提供了检验入口，不能算本轮已经通过。源码注释有生产观测（例如审计写入超时的样本数字），本稿仅将其视为作者报告，不转述为独立效果实测。




## 源码依据

[^src-1]: [启动依赖](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/main.rs#L163-L220)

[^src-2]: [实际装配](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/main.rs#L381-L438)

[^src-3]: [完整路由树](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/routes/mod.rs#L19-L74)

[^src-4]: [open 实际调用](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/routes/session_open.rs#L234-L319)

[^src-5]: [events 实际调用](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/routes/session_events.rs#L439-L596)

[^src-6]: [仅有枚举分支不足以证明调度](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-core/src/pde.rs#L101-L138)

[^src-7]: [world 与队列默认](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/state.rs#L192-L280)

[^src-8]: [dreaming 默认](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/state.rs#L530-L560)

[^src-9]: [快照任务](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/snapshot.rs#L21-L84)

[^src-10]: [世界与故事串联](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/world.rs#L105-L151)

[^src-11]: [世界任务启用与默认周期](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-llm/src/model_config.rs#L2385-L2505)

[^src-12]: [Town 实际 tick](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/world_town.rs#L54-L129)

[^src-13]: [回合后五条写入链](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/post_process.rs#L90-L236)

[^src-14]: [原话实际写入](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/post_process.rs#L617-L711)

[^src-15]: [文本真正读取](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/handlers.rs#L937-L1082)

[^src-16]: [角色画像四项消费](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/post_process.rs#L1640-L1652)

[^src-17]: [另一套用户画像不回灌](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/post_process.rs#L1951-L1961)

[^src-18]: [关系、世界、故事、角色状态的提示块](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/prompt.rs#L1409-L1543)

[^src-19]: [已读写入的真实语义](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L4599-L4615)
