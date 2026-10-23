# 酒馆与 AI 陪伴项目的人物机制源码调研

用途：候选筛选与固定版本源码证据。后续解释见 [四项目主线](四个人物系统的核心设计逻辑与运行主线.md)；我方采用与未决项见 [当前 Agent 方案](../plans/人物主体Agent方案/README.md)。

日期：2026-10-22。对照基线：[人物行为变化框架 v0.1](../plans/人物行为变化框架-v0.1.md)，含后续确认的独立当前环境与有限察觉。

## 1. 结论：方向有同行实现，效果还不能由此担保

本轮找到了与我们明显相近的实际机制：稳定人物与持续状态分离、角色自己的活动和目标、先选择怎样回应再组织语言、环境导致的暂时不可用、带原因的状态更新，以及区分自己的经历和双方共同知识。它们不是只存在于论文中的设想。Yuralume、Eros 和 Emotion Engine 分别提供了不同部分的源码参照。[^yura-flow][^eros-flow][^ee-record]

但在本轮目的性样本和实际核读范围内，没有找到可核查的证据，证明我们的六类信息加环境这一整套组合，已经成为成熟标准，或者一定胜过简单人设加历史。多数项目提供的是代码、示例、契约测试或作者经验；不是同模型、同材料下对普通中文陪伴自然度的可信对照。样本偏向具有相关机制的项目，对“试过后变差”的用户行为结果检索不系统，不能据此排除反面证据。**建议保留框架作为待验证的问题拆分方式，同时保留简洁上下文方案作为未来对照，不把“找到相似项目”当作效果验收。**

最值得吸收的并非某套好感公式，而是几个具体约束：变化属于谁、有何依据、什么时候有效、计划是否真的发生、对方究竟是否知道，以及这些信息是否真的被回复路径采用。细节做错会让一个概念上相似的项目产生相反体验。

本轮仅调研、核读与编写报告。未导入第三方代码或提示词，未安装依赖、启动候选服务、调用产品聊天模型或开展对话测试；不决定继续使用或替换当前引擎。

## 2. 范围、版本和证据等级

筛选先覆盖酒馆基础工具、状态扩展、陪伴运行时、独立状态层及公开产品文档，再对相关机制追踪实际读写和上下文消费。以下是有目的的候选样本，不是互联网全量统计，也不按 stars 推断成熟度。

| 对象 | 本轮固定版本或资料 | 实际核查深度 |
| --- | --- | --- |
| SillyTavern 基础路径 | 官方 Character Design、Prompts、World Info 文档，2026-10-22 查阅 | 配置与上下文契约；不推断所有扩展能力 |
| BetterSimTracker | `5b818855c0f8a4f93a9633eaff4f1287ac26ab9c` | 提取、保存、分支快照、可见性、注入和相关测试源码 |
| SillyTavern-StateEngine | `e993d4962f229880a8238128b99823438f22c074` | 类型、触发、模型请求、写入与宏消费 |
| Yuralume | `6996b152604e83a1cf6344cd236a9b9456f47bba` | 活动、记忆、披露、场景、回复上下文链及测试源码 |
| Eros | `9715af2ce7d8524ca5ce8771059d436c31951977` | 决策、状态读写、环境事件、记忆与回复路径及配置 |
| AICO | GitHub 历史快照 `aad0a889cccabcd5f75335c89ec5d7a5705adc4c` | 评价到状态写入、主回复路径、占位与断链 |
| Emotion Engine | `e7fab5c3984a4885ac74c972d573b05b45a8c496` | 身份、事件、信任证据、结算与 mock 演示 |
| Nomi | Nomipedia 的 Backstory+、记忆说明 | 面向使用者的产品文档，未核查闭源内部实现 |
| 中文情绪实践笔记 | `yanke521/ai-companion-cot-emotion`，`8a29e6ce054a57eaffcb0fa1e8c3d721f94321de` | README 中的方案、代码片段与作者自述，非完整运行仓库 |
| Affinity Agent | `maniac8/galgame-emotion-agent`，`642edf8dfcc540b649260a5c662c8d06238a9f3f` | 仅设计说明，没有其宣称目录中的运行实现 |

文中“已接线”指本轮从固定源码追到了读写与调用，不代表已经部署或实际运行成功；“测试存在”指读到了测试，**本轮未执行这些仓库的测试**。维护状态和实现只对应列出的版本。

## 3. 大家实际采用哪些路线

### 3.1 基础酒馆：用上下文承载人物，由模型推断变化

SillyTavern 将角色描述、性格、场景与历史等组织进请求，世界书负责按条件加入材料。官方文档明确：加入 World Info 不保证生成采用；模型也可以从历史推断人物变化，不必先有显式情绪系统。因而不能说“普通酒馆没有状态字段，所以人物不会变化”，也不能把世界书等同于完整的人物或环境模型。[^st]

这条路线是必要的比较基线：更复杂的机制应解决具体的连续性、归属或行为问题，而不能仅凭字段更多就获得优先权。

### 3.2 状态扩展：把变化保存下来，再影响下一次生成

BetterSimTracker 的实际路径是：AI 消息生成后提取状态，限制变化，按消息和备选回复保存，再注入后续上下文。它明确分开即时 mood、长期关系、角色核心和 Scene；私有字段可限制只对所属角色注入。与我们的分层有相近之处，但仍主要是对生成文本的事后观察器。**若先生成了错误行为，再把它提取为状态，可能形成自我强化；这是架构风险推论，本轮未做行为实测。**[^bst-layer][^bst-storage]

StateEngine 更接近可配置变量工具箱：不同字段可选择手动、计数、循环或模型更新；提示独立请求读取近期对话与当前值，再写入酒馆变量，由模板宏消费。它能承载人物和天气、时段等不同字段，但“能配置某个字段”不等于已经实现该字段的心理语义或有限察觉。[^se]

### 3.3 陪伴运行时：把生活、状态和行为组织起来

Yuralume 有当前活动、已完成活动、目标、关系、情绪事件和交流场景等实际输入；Eros 则提供决策引擎、需要、环境事件和可选的场外生活导演。这两者最值得对照整体方向，但各自也包含与普通日常人物不同的叙事及产品策略。[^yura-flow][^eros-flow]

### 3.4 独立状态层与产品配置：可以分层，不必整套自研

Emotion Engine 维护连续状态与变化证据，要求宿主负责语境判断和生成；它不是完整陪伴应用。Nomi 的公开资料则把 backstory、当前情境、表达偏好、愿望、边界等分开配置。这说明拆分信息并不一定意味着建立复杂多 Agent 系统。Nomi 内部如何实现、采用何种模型和状态公式，本轮无法核实。[^ee-record][^nomi]

## 4. 最接近的参照之一：Yuralume

### 4.1 自己的生活不只靠一句“我今天很忙”

实际链可以追到：

> `ChatService._load_current_schedule()` → `ScheduleService.resolve_current()` 区分当前、接下来、刚结束的活动 → `DefaultPromptBuilder.build()` 接收活动、目标、关系、记忆和 presence frame → 各 section 组装进回复上下文。

`schedule_service.py:1334–1403` 根据时间处理当前和已完成活动；`schedule.py:307–420` 把活动时间、地点、同伴与忙碌情况表达给模型，并明确当前所在地与旧故事材料的优先级。它还允许空档，不要求全天始终有活动。[^yura-flow]

上述调用链以相关服务已经装配为条件：`ChatService` 接受可空的 schedule service／memorializer，空依赖时读取或处理会直接返回。本轮核到的是装配后的消费链及空值退化分支，未逐一核验所有部署 profile 的默认装配，不能说任意安装都无条件启用这些功能。[^yura-flow]

值得借的是**当前事实与过去材料的权威性、时间范围与转场**。不能直接把“活动计划的时间结束”当成所有现实结果已经发生；代码的许多日常活动本就是虚构生活的模拟约定，需要与用户实际参与的事情分开。

### 4.2 活动可以留下余味，也允许没有明显情绪

`ScheduleMemorializer` 对结束的活动调用 aftermath 判断，将余味附进活动记忆；`aftermath.txt` 接收人物、活动、地点、同伴等，允许无显著影响时返回空。写入经过去重与活动领取标记，持久化失败还会释放标记，而不是重复生成同一生活经历。[^yura-aftermath]

这与“同一事件对不同人物意义不同”“事情结束，感受未必结束”“普通活动可以没什么变化”相近。值得研究其输入和空结果约定；其中人格示例与默认语言不应直接当作我们普通人物的定律。读到完整判断提示词也不证明模型稳定遵从。

### 4.3 共同经历与共同知识，是两道不同的检查

第一道是有没有共同参加。`shared_activity_evidence.py` 区分未答应、已答应但未核实、允许共享叙述等情况；memorializer 对未经支持的共同活动，不把原计划直接写成共同记忆。没有合适事实改述时可以不写。[^yura-evidence]

第二道是有没有告诉过对方。`player_knowledge` 分 private、disclosed、shared；`MemoryDisclosureService` 只根据本次候选及实际披露结果改变账本。记忆进入上下文不算已披露；`memory_lines.py` 再把这一区别表达给回复模型，避免开口就把自己的私下经历当成对方早已知道的往事。该字段表达系统维护的知识判断，不是对用户真实理解的直接观测。[^yura-disclosure]

**不能照搬其“参加证明”的具体判据。** 当前实现把“已同意＋活动期间有互动时间戳”视为 VERIFIED；在我们的场景中，期间发过一条消息不一定证明共同赴约。应借“不同证据支持不同叙述”的结构，另行讨论什么算参与证据。[^yura-evidence]

### 4.4 文档与当前源码也会不一致

README 仍介绍 Scene Access 检查，但本轮固定源码 `PresenceFrame.AccessContext` 明确注明该 judge 已于 2026-07-30 退役：Stage 采用玩家声明同场，旧判定值只作兼容解析。私讯与外部消息仍单独标为 text-message-only。因此不能把它推荐成现成的客观同场校验器。[^yura-presence]

另外，`state.py:240–271` 仍将 0–100 状态映射成语气指导。我们可以研究状态如何被消费，但不能据此接受“一个分数决定关心、冷淡和亲密程度”的全部策略。

## 5. 最接近的参照之二：Eros

### 5.1 先决定怎样接，再组织表达，确实有实现

启用 LLM 判官时，PDE 可以输出动作、当前内在状态、回复方式和需要；`ChatRepo::set_needs()` 保存到消息 metadata，下一轮 `load_needs()` 按时间锚点读取。相关回复构造使用本轮新状态或沿用值，而不是只把字段放在数据库。模型判官需配置才启用，未配置或失败存在规则回退；示例判官提示主体默认仍是注释。[^eros-flow]

值得借的是**行为选择与措辞分开讨论、本轮所用状态能追溯、弃权时延续既有信息**，不必因此照搬完整 Rust 服务或多次模型调用。

需要注意，行动判官得到的是人物简报、近期对话、关系档位、需要与事件等；长期记忆、world/story 摘要和 character state 在后续回复构造才另读。于是“决定做什么”和“决定怎样说”可能使用不一样的信息。我们若以后拆阶段，需要防止这种知识差，而不是机械复制分层。[^eros-context]

### 5.2 离线不回复，不自动算成关系冷处理

`stream.rs:4453–4511` 读取当前生活事件：在配置允许、非动作轮且非强制图片等条件下，离线事件可以直接结束该轮，不增加关系 ghost 计数。恢复时也有专用的未解释离线事件。这与我们强调的环境影响和关系判断分开十分贴近。[^eros-offline]

它的范围有限：动作轮、客户端强制图片和关闭 ghosting 的部署可以绕过静默；事件还需要调用方请求抽取。世界与个人生活导演是有配置和开关条件的可选功能，不代表所有部署都会一直模拟日常。

### 5.3 行为许可和关系规则，需要逐项取舍

`settle_action_response()` 在用户带动作、判官没有给出判断时默认 Accept；规则路径也让动作轮始终回复。仓库测试明确覆盖判官失败回退接受。它适合哪种产品是另一回事，对我们的人物边界不应作为默认方案。[^eros-action]

关系逻辑还有固定档位、消息长度增益、缺席降温及友情／恋爱轴制衡等规则，属于其产品设计。记忆中虽然保存 evidence、temporality、confidence 等元数据，`MemoryRow` 注释明确这些目前是 opaque，不能把“有字段”说成“召回已经按证据推理”。[^eros-memory]

## 6. 可复用的连续状态层：Emotion Engine

它最值得借的不是 PAD 或 trust 数值，而是**状态归属、证据与重复结算约束**：写操作要求 `character_id + relationship_id`；事件记录可包含 situation、character lens、relational meaning、open loop；`settle_trust()` 检查会话结束、证据、事件是否已处理，并记录哪些证据已经消费。普通信息也不必都变成关系变化。[^ee-record]

这为“对甲的事情不能写到乙”“同一句话不能因为重放而重复改变关系”“变化理由和数值不是一回事”提供了具体参照。

不应照搬全部策略：其 trust tier 将单值映射到 New→Intimate，长期不联系会降低信任；这些会混淆信任、熟悉与亲近。它也没有完整描述角色自己的生活、环境和全部行动后果。[^ee-policy]

效果证据尤其要分清：网页 demo 是策划过的说明性展示；`minimal-agent` 从 JSON 读取 mock 决策，不调用真实 LLM；API 文档是宿主集成指导。它能帮助检查状态协议，不能证明已实现自然陪伴对话。[^ee-demo]

## 7. 酒馆生态能直接教我们的细节

### BetterSimTracker：借快照、归属与保守更新

- 状态按消息及当前 swipe 保存；当前分支没有数据时不偷用另一条回复的状态。
- 过期 extraction 任务可被 runSequence 拒绝，避免旧结果覆盖新状态。
- 提取提示允许零变化、负变化，并提醒亲切或打趣不自动等于恋爱。
- 私有状态与全局 Scene 分开，track、inject、display 也能分别配置。[^bst-layer][^bst-storage]

但不能整套直接采用：固定源码已经宣布 abandoned；关系主要朝向用户，不是任意人物的完整两两关系；私有注入也不等于完整的察觉／理解模型。默认高 affection 对应更多 caring language、concern、emotional support，正好可能引向我们已经不喜欢的持续关心。这里说的是**策略与目标冲突**，不是本轮实测出了模型行为。[^bst-policy]

### StateEngine：借字段更新条件，不借失败重置

不同变量可用不同触发与更新方式，字符串、枚举和数组也能表示状态，不必全部量化。另一方面，`validateValueStrict()` 的不合法值可转默认值，`setVarValue()` 即使校验失败仍写转换结果。若用作人物账本，结构错误可能变成状态重置；不能把这种校验描述成“失败保持原状”。其扩展自身也未提供 BST 那样的逐 swipe 历史恢复。[^se]

这两者共同提醒我们：**能生成一个状态表，远不等于能可靠地维持同一个人。** 但这些工程问题只是未来实现时的候选要求，本轮不据此选择框架或开始编码。

## 8. 不要被“相似架构”误导的三个反例

| 对象 | 看起来与我们相似 | 实际证据与限制 | 可借之处 |
| --- | --- | --- | --- |
| AICO GitHub 历史快照 | 四阶段 appraisal、情绪惯性、人格与 world model | sentiment confidence／valence 启发式占主要作用；目标偏支持与陪伴。含情绪指导的 `_build_system_prompt()` 只有定义，主回复实际调用 `CharacterManager.build_system_message()` 再交 LLM，未带这条 emotion guidance；不能声称这条主路径已采用情绪。迁到 Gitoro 后当前代码本轮不可达，结论仅限快照。[^aico] | 检查读写消费链、状态历史、假设与反证结构；不照搬系统全局情绪或固定关心导向 |
| 中文情绪实践笔记 | 情绪漂移、前后两阶段分析、内心独白、残留 | 只有 README／片段，作者自报时延与效果无法独立复现；强制长独白、文艺示例、离线增长依恋及固定冲突参数，与我们的目标有明显差异。[^notes] | 关注实际上下文位置、状态是否晚一轮、词语需结合语境、状态是否真正进入每条生成路径 |
| Affinity Agent | 性格、关系、生活模拟、未处理问题和修复 | 固定树实际只有 README 与 gitignore，目录和能力描述是设计计划；不能当现成实现或成功经验。[^design-only] | 作为概念旁证，不作为源码复用候选 |

“反例容易被模型复述”“某种独白长度最好”等个人经验，都不能直接改成我们的硬性提示词原则。需要知道其材料、模型与任务是否相同；本轮不据此改动已有正反例模块。

## 9. 哪些值得借鉴，哪些值得原样保存

下面是**待选资产目录**，“高／中”仅指后续调研优先级。尚未下载进项目、启用或改写。原样保存和接入使用是两个决定；用户要求复用上游核心提示词时保持原文，本轮沿用该约束。

| 调研优先级 | 候选资产与固定来源 | 可借用途 | 采用前还需要决定什么 |
| --- | --- | --- | --- |
| 高 | Yuralume `application/services/memory_disclosure_service.py`、`infrastructure/prompt/memory_lines.py` | 区分私下经历、已告诉对方、共同经历；候选集合限定披露判定 | 哪些信号足以支持“说过／看过”；撤销后知识是否还保留 |
| 高 | Yuralume `domain/services/shared_activity_evidence.py` 及对应测试 | 邀请、同意、实际参与的区别；不把计划写成共同回忆 | 不直接接受“期间有聊天”就是共同参与的判据 |
| 高 | Emotion Engine `spec/emotion-state.schema.json`、`scripts/emotion_engine_utils.py` 的 identity／event／settlement | 状态归属、原因、重复事件与已消费证据的契约 | 不整包带入单轴信任等级、缺席衰减及 PAD 参数 |
| 高 | BetterSimTracker `src/storage.ts` 及 `tests/storageRuntimeState.test.ts` | 分支快照、重生成基线、过期结果防写的测试思路 | 酒馆消息结构不是我们最终运行结构；只借契约不急着移植 |
| 中 | Eros `examples/model_config.toml:462–495,551–583,682–712` 的完整提示词块 | 归属、时态、暂时状态不升级为特质、正反例与提取输出协议 | 连同 task 配置审查角色假设、内容域及用户画像提取是否需要；元数据由谁读取、如何影响决策；原文保留不等于当前已有效使用 |
| 中 | Yuralume `data/prompts/schedule/aftermath.txt` 全文件 | 以人物和活动判断余味，允许无变化的上游提示词候选 | 文体、例子和角色假设是否适合；不擅自将繁体改写、压缩为“优化版” |
| 中 | BetterSimTracker `src/prompts.ts` 的 `MAIN_PROMPT`、`DEFAULT_UNIFIED_PROMPT_INSTRUCTION` 和完整关联规则 | 保守变化、零变化、对象与最近证据的提取约束 | 这些协议与默认关系模板的依赖要整体审查，不能摘一句就说原样复现 |
| 中 | Eros 离线事件处理及同事件重放测试 | 环境不可用不罚关系；同一时间点使用相同事件 | 原产品的动作／图片绕过策略是否应采用；目前不照搬 |

上述路径分别归属第 2 节的固定 SHA，可从文末链接取回。Yuralume aftermath 文件本轮核读原始字节为 1768 bytes，SHA-256 为 `ba100020b33e51062c35842437bca59cd6d87a23e20e2b2788f152bdd97290ca`，方便未来原样核对，不代表本轮已采纳。[^yura-aftermath][^ee-record][^bst-storage][^eros-assets]

实际选用时再保存完整原文、来源、提交号与字节 hash，旁列新增胶水及停用项；不把几份核心提示词揉成自写概括。存在目标冲突的原文可以不采用，不能偷偷改完仍称照搬。

许可本轮仅记录来源，不作为调研排序：Yuralume 源码可读但采用 BUSL-1.1，不能笼统称为无条件开源；Eros 为 AGPL-3.0-only，Emotion Engine 为 MIT。发布前再按实际采用的内容核对，本轮不作发布或授权结论。[^licenses]

## 10. 对我们框架的判断与后续讨论顺序

| 我们的部分 | 本轮核到的局部对应 | 本轮仍未验证或需要另行决定 |
| --- | --- | --- |
| 人物底稿 | 酒馆长期角色定义，运行时也保留静态人物材料 | 稳定倾向如何形成自然而非刻板的日常表现 |
| 自己的生活与关切 | Yuralume 的目标／日程；Eros 的需要和可选个人生活 | 生活规划何时算发生，个人关切冲突怎样取舍 |
| 对特定人的关系 | 关系身份、关系轴、显式证据与更新记录 | 信任、喜欢、熟悉、边界不应被一根进度条包办 |
| 当前事情的理解 | 部分评价、事件意义、假设／反证结构 | 完整分清事实、转述、猜测和后来修正，仍多靠提示约定 |
| 当下感受与倾向 | mood、持续情绪事件、短时 pulse、活动余味 | 参数来自工程选择，未验证普通人物的具体时程 |
| 当前行动与进程 | PDE、暂缓／静默、待跟进事件、证据结算 | 决策与表达共享什么知识；不回复何时代表环境、选择或故障 |
| 当前环境与有限察觉 | 场景／私讯、当前活动、私有知识和披露账本 | 环境真实情况不等于人物所知；也不等于对方所知 |

本表列的是跨项目的局部对应，本轮没有核实到某一个项目已经完整实现并验证了我们的组合。这些对应支持继续研究当前划分，**不支持把六类信息直接做成六个模型、每轮生成全部字段或引入一个大而全的心理引擎。** 类别首先帮助发现混淆；是否需要独立存储、调用或调度，要根据具体收益讨论。

本次调研提出的下列问题已进入后续设计；当前决定、运行建议和剩余未决项见 [Agent 方案](../plans/人物主体Agent方案/README.md)。以下保留问题来源，便于核对设计依据：

1. **什么算一件事真的发生。** 特别是计划、独自经历、共同活动、承诺、说过的话，分别需要什么依据。
2. **谁知道什么。** 人物知道、人物猜测、人物以为对方知道、对方实际收到哪些内容，要怎样表达边界；不把账本当读心。
3. **什么决定本轮行为。** 关切、习惯、环境限制和关系如何共同参与；记录必须读到而且读对，不用自动亲密升级或固定情绪公式代替。

本轮材料未提供要求推翻这套划分的依据，但也不足以证明其优越性；建议继续保留为待验证框架。更应防范的是表面上每层都有，实际却只剩 sentiment、好感数值和一份关怀模板；或者机制很多，但行动判断和表达根本没有读到同一份事实。自然措辞、时延与实际聊天仍需独立验证，现阶段不作成功声明。

## 11. 核查范围与未做事项

本轮按 `research-zh` 并行核查酒馆状态扩展、Eros、AICO／Emotion Engine；主线程独立核读 Yuralume，并复查 AICO 主回复、Eros 动作／离线、Emotion Engine 身份／结算、BST 默认行为映射和 StateEngine 无效值写入等关键反例。使用 GitHub connector、官方文档和固定提交原文；大文件采用临时静态源码查阅，未执行第三方源码。

AICO 新 Gitoro 托管本轮网页获取及 Git TLS 均失败，故仅判断 GitHub 历史快照。Nomi 只查公开产品资料；中文笔记的量化自述未独立验证；候选测试只阅读未运行。未登录付费陪伴网站、未做真人长期测试，也没有同模型同材料对照来判定显式状态优于简单上下文。临时资料在交付前清理，正式保留本报告与固定源码链接。

### 审查与修正

三个并行核查分别复查酒馆状态扩展、Eros、AICO／Emotion Engine；主线程修正了 Eros 完整提示词块边界和判官失败回退测试链接。另使用 OpenCode 的 `opencode-go/deepseek-v4.1-flash` 对报告进行只读审查，并在同一会话中讨论处理意见。

对可选服务条件及样本代表性的意见部分采纳：补充未装配时的退化路径、部署默认值未全面核查及负面行为结果检索不系统，避免把这些限制反推成默认关闭或框架无效。采纳“局部对应”表述、Eros 内容域与画像用途适配检查，将候选排序改为调研优先级。未采纳新增许可审批门槛的建议，因为当前仅记录候选、未导入且用户明确暂不以此限制调研；保留实际许可来源，接入与发布另议。

复核方在读到上述处理后未提出剩余必改项，但没有重新抓取核对链接修正；该项仍由主线程和对应源码核查负责。以上审查验证的是报告证据与表述边界，不是运行结果或聊天效果。

## 参考文献

[^st]: SillyTavern 官方文档，2026-10-22 查阅：[Character Design](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)、[Prompts](https://docs.sillytavern.app/usage/prompts/)、[World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)。用于基础配置契约，不宣称本轮审计核心引擎全部路径。
[^bst-layer]: ghostd93，BetterSimTracker，固定提交 `5b818855c0f8a4f93a9633eaff4f1287ac26ab9c`：[types.ts](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/types.ts#L66)、[promptInjection.ts 私有／Scene](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/promptInjection.ts#L430)、[prompts.ts 保守变化](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/prompts.ts#L35)。
[^bst-storage]: 同上：[逐 swipe 保存](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/storage.ts#L1459)、[不跨 swipe 取值](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/storage.ts#L829)、[过期任务检查](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/index.ts#L4372)、[重生成基线测试](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/tests/storageRuntimeState.test.ts#L1664)。
[^bst-policy]: 同上：[默认行为映射与层次](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/src/promptInjection.ts#L559)、[README 弃用说明](https://github.com/ghostd93/BetterSimTracker/blob/5b818855c0f8a4f93a9633eaff4f1287ac26ab9c/README.md#L1)。
[^se]: StygianTechnica，SillyTavern-StateEngine，固定提交 `e993d4962f229880a8238128b99823438f22c074`：[变量定义](https://github.com/StygianTechnica/SillyTavern-StateEngine/blob/e993d4962f229880a8238128b99823438f22c074/index.js#L1135)、[无效值转换](https://github.com/StygianTechnica/SillyTavern-StateEngine/blob/e993d4962f229880a8238128b99823438f22c074/index.js#L1190)、[实际写入](https://github.com/StygianTechnica/SillyTavern-StateEngine/blob/e993d4962f229880a8238128b99823438f22c074/index.js#L1344)、[prompted update](https://github.com/StygianTechnica/SillyTavern-StateEngine/blob/e993d4962f229880a8238128b99823438f22c074/index.js#L1704)。manifest 为0.9.6，与 README 及外部 Wiki 描述不完全一致。
[^yura-flow]: Yuralume，固定提交 `6996b152604e83a1cf6344cd236a9b9456f47bba`：[chat 活动读取](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/chat_service.py#L6062)、[活动时间选择](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/schedule_service.py#L1334)、[回复上下文组装](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/prompt/default.py#L199)、[活动渲染](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/prompt/sections/schedule.py#L307)、[目标／意图](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/prompt/sections/state.py#L427)。
[^yura-aftermath]: 同上：[ScheduleMemorializer](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/schedule_memorializer.py#L120)、[余味写入](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/schedule_memorializer.py#L439)、[完整 aftermath 提示词](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/data/prompts/schedule/aftermath.txt)、[活动后判断实现](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/schedule/llm_aftermath.py)。
[^yura-evidence]: 同上：[共同活动判据](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/domain/services/shared_activity_evidence.py#L140)、[未经核实的共同记忆处理](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/schedule_memorializer.py#L211)、[相关测试](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/tests/unit/test_schedule_memorializer_shared_activity.py#L146)。
[^yura-disclosure]: 同上：[披露账本写入](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/application/services/memory_disclosure_service.py#L1)、[记忆知识边界渲染](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/prompt/memory_lines.py#L90)、[实体／持久化测试](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/tests/unit/test_memory_player_knowledge.py)。不是用户实际理解的心理测量。
[^yura-presence]: 同上：[PresenceFrame 与已退役 judge](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/domain/value_objects/presence_frame.py#L40)、[当前场景测试](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/tests/unit/test_prompt_builder_presence_frame.py#L106)、[README](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/README.md)、[状态语气映射](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/src/kokoro_link/infrastructure/prompt/sections/state.py#L240)。
[^eros-flow]: etherfunlab，eros-engine，固定提交 `9715af2ce7d8524ca5ce8771059d436c31951977`：[needs 写入](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L4632)、[保存和时间锚点](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-store/src/chat.rs#L584)、[读取](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/handlers.rs#L667)、[判官启用条件](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-llm/src/model_config.rs#L1875)。
[^eros-context]: 同上：[行动判官上下文](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L2669)、[回复阶段额外读取](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/handlers.rs#L937)。
[^eros-offline]: 同上：[离线及绕过条件](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L4453)、[未解释事件](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L4513)、[world 开关](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/world.rs#L103)。
[^eros-action]: 同上：[默认动作接受](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-core/src/pde.rs#L28)、[判官失败回退测试](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-server/src/pipeline/stream.rs#L22724)。
[^eros-memory]: 同上：[opaque memory metadata](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-store/src/memory.rs#L36)、[关系增益设计](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-core/src/affinity.rs#L535)、[消息长度与缺席规则](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-core/src/pde.rs#L242)。
[^eros-assets]: 同上：[完整示例配置](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/examples/model_config.toml#L462)，提示词块 462–495、551–583、682–712，采用时还要连同所在 task 配置核查；PDE 提示词正文 740–770 默认注释，task 参数并非全部注释，缺少有效 `filter_prompt` 才不启用 LLM 判官。它们是待选上游资产，不是本轮新提示词。
[^ee-record]: pioneerjeff-labs，Emotion Engine，固定提交 `e7fab5c3984a4885ac74c972d573b05b45a8c496`：[身份约束](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L1033)、[事件记录](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L3301)、[信任结算](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L3035)、[完整协议](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/spec/emotion-state.schema.json)。
[^ee-policy]: 同上：[trust tier](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L1435)、[缺席衰减](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L2011)、[关键词 fallback](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/scripts/emotion_engine_utils.py#L2207)。
[^ee-demo]: 同上：[README 的演示限制](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/README.md)、[mock 输入读取](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/examples/minimal-agent/run_demo.py#L136)、[无证据不变测试](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/tests/test_emotion_engine_utils.py#L626)。
[^aico]: boeni-industries，AICO，GitHub 历史提交 `aad0a889cccabcd5f75335c89ec5d7a5705adc4c`：[评价启发式](https://github.com/boeni-industries/aico/blob/aad0a889cccabcd5f75335c89ec5d7a5705adc4c/core/services/emotion_engine.py#L503)、[主回复组装与调用](https://github.com/boeni-industries/aico/blob/aad0a889cccabcd5f75335c89ec5d7a5705adc4c/core/services/conversation_engine.py#L825)、[未被该路径调用的 builder](https://github.com/boeni-industries/aico/blob/aad0a889cccabcd5f75335c89ec5d7a5705adc4c/core/services/conversation_engine.py#L1506)、[CharacterManager](https://github.com/boeni-industries/aico/blob/aad0a889cccabcd5f75335c89ec5d7a5705adc4c/shared/aico/ai/characters.py#L46)、[迁移公告](https://github.com/boeni-industries/aico)。结论不外推到 Gitoro 新代码。
[^nomi]: Nomipedia，2026-10-22 查阅：[What is Backstory+?](https://wiki.nomi.ai/What_are_shared_notes%3F)、[How does Nomi memory and knowledge work?](https://wiki.nomi.ai/How_does_Nomi_memory_and_knowledge_work%3F)。前者页面最后修改2026-08-22，后者2026-08-24；是公开产品说明，不是后端源码审计。
[^notes]: yanke521，*给 AI 伴侣装一套「会想事情」和「有情绪」的系统*，固定提交 `8a29e6ce054a57eaffcb0fa1e8c3d721f94321de`：[完整原文](https://github.com/yanke521/ai-companion-cot-emotion/blob/8a29e6ce054a57eaffcb0fa1e8c3d721f94321de/README.md)。重点 §1.1、§1.3、§2.3–2.6；作者实测自述不当作独立复现或普遍规律。
[^design-only]: maniac8，Affinity Agent，固定提交 `642edf8dfcc540b649260a5c662c8d06238a9f3f`：[仓库树](https://github.com/maniac8/galgame-emotion-agent/tree/642edf8dfcc540b649260a5c662c8d06238a9f3f)、[README](https://github.com/maniac8/galgame-emotion-agent/blob/642edf8dfcc540b649260a5c662c8d06238a9f3f/README.md)。本轮查到的是设计阶段，不按其描述的目录视作实现。
[^licenses]: 固定版本许可文本：[Yuralume LICENSE](https://github.com/Yuralume/yuralume-core/blob/6996b152604e83a1cf6344cd236a9b9456f47bba/LICENSE)、[Eros 源码 SPDX](https://github.com/etherfunlab/eros-engine/blob/9715af2ce7d8524ca5ce8771059d436c31951977/crates/eros-engine-core/src/pde.rs#L1)、[Emotion Engine README 与 LICENSE 入口](https://github.com/pioneerjeff-labs/emotion-engine/blob/e7fab5c3984a4885ac74c972d573b05b45a8c496/README.md)。
