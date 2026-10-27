# Agent 承载基础怎么选

更新：2026-10-28。本篇回答 [S01：先确定承载基础](../../../discussions/对话过程中的小决策.md#agent-foundation-first)。**本轮推荐明确选 LangGraph 开源版承载运行，用 LangChain 的模型、消息及工具接口；不从零编写底层 Agent 框架。** 这是阅读反馈后的推荐方案，尚未合入正式决定02，也未安装、接线或运行验证。本文研究的源码版本列在末尾，不把框架功能清单当作我方已实现能力。[返回回答索引](README.md)。

## 1. 你在问什么，为什么应先答

原方案已经说明“一个人物、多个 run、短步骤、工具等待、恢复与检查”，却没有指明谁负责把这些步骤运行起来。用户明确不接受自己重造底层框架，这不是希望换一个库名，而是要让已有设计落实到可复用的运行能力。

判断标准因此是：能否保存同一任务的消息与步骤、在模型和工具之间继续、暂停与恢复、在下一次模型请求前刷新生活背景、把业务提交留在我们能核查的位置。内置浏览器、漂亮的控制台、MCP 数量、社区热度都不能替代这几项。

按你理解 Agent 的方式：LLM 负责理解和提出下一步；提示词、人物资料和当前材料组织成输入；工具背后的领域服务处理日程、关系、消息、平台动作；承载基础负责这些模型与工具步骤的执行、保存和恢复。**LangGraph 是其中的运行基础，不是人物本身，更不负责自动写出真实自然的人格。**

## 2. 比较结果与没有选择的理由

| 候选 | 实际可复用部分 | 本项目仍要做什么 | 本轮判断 |
| --- | --- | --- | --- |
| LangGraph 开源版 + LangChain 适配 | 状态图执行、节点调度、检查点、消息 ID 合并、暂停/恢复；模型与工具协议 | 人物级公平调度、已读和事实规则、生活/关系服务、业务操作防重、对外检查 | **主选。** 能把我们的业务边界放在清晰节点内，Python/PG 可直接承接；代价是仍要设计业务图及服务，不是配置完就有角色 |
| LangChain `create_agent` | 已经装好的模型—工具循环，中间件、状态及 checkpointer 接口；底层也是 LangGraph | 定制请求前后与工具调用中间件，避免默认循环越过领域提交规则 | 有价值，但首个核心不直接把全部写工具丢进默认循环。我们先明确业务图，之后独立只读探索可复用它；不是再叠一个平行框架 |
| DeepSeek Harness（DSH） | 现成 Agent、多步工具执行、Cordis 插件、运行中输入队列、会话事件、请求构造与压缩；有 Python SDK | 自定义 profile/插件，约束默认工具；将其会话持久化与我方 PG 领域提交协调；人物级多会话控制仍要补 | 是认真考虑的备选，不是“只有编码功能所以不能用”。本轮暂不作核心，因为已有生命周期与存储边界要再次适配，我方最难的共享生活/跨联系人约束不会因此消失 |
| Deep Agents | 在 LangChain 上组合文件系统、压缩、Skill、子任务等能力，源码支持选择或排除中间件 | 取消不适合的文件/子任务默认权力，另接世界事实与社交权限 | 可作为后续受限资料研究/创作执行者；主角色不需要先继承全部这类默认习惯。可配置并不等于必须采用 |

这些判断来自下面的具体源码；没有做四种实现的性能比赛，不声称 LangGraph 更快、更省钱或已经证明维护成本最低。选择它主要是**状态恢复接口与我们需要插入业务校验的位置较吻合**，保留现行 Python 栈只是附加收益。[^lg-types][^lg-pg][^lc-agent][^dsh-core][^da]

### DSH 到底有什么，为什么没有简单排除

DSH 的 `send` 可把输入放到 `next-turn` 或 `next-step`；`followup` 和 `steer` 使用不同目标。运行循环在步骤边界领取输入、重新组装 system prompt，走 `agent/pre-step`；随后构造并冻结本次请求。工具执行完再看下一步有没有新输入。会话事件与正在运行的控制事件分开。因此它确实具有“任务继续做，同时在下一步得到新背景”的具体机制，不只是一个插件宣传语。[^dsh-inbox][^dsh-core]

但这个 inbox 是 **Agent 运行输入队列**，不是我们“人物还没看手机”的收件箱。把微信原文直接 `steer` 进去，会绕过人物决定是否查看的边界；需要先由业务服务控制哪些材料可进入。DSH 的 session 持久化也不能直接替代我们的事件表、日程过去保护及人物级承诺唯一性。

其 `sdk-minimal` 是完整而精简的编码 Agent profile：默认 shell、读图、工作目录与自动压缩，JSONL 会话持久化；它可以通过 profile 改装，但不能原封不动用于公开人物。Python SDK 能调用它，不代表核心变成 Python 进程，也不代表其持久化与我们的数据库同事务。[^dsh-sdk]

**可以借它的步骤边界、输入排队及会话事件分工，不必同时跑两套核心。** 若后续证实我们需自写的框架设施过多，而 DSH 插件能完整承接这些边界，应重新比较；重新比较的门槛是实际适配切片，不是项目星数。

## 3. 采用后怎样分工，避免换名字后仍自造框架

| 部分 | 交给已有基础 | 我们保留的业务职责 |
| --- | --- | --- |
| 多步运行 | LangGraph `StateGraph`、条件边、状态与 checkpoint；使用已有运行器 | 哪些节点需要刷新处境、哪些写入要校验、何时结束或等待 |
| 请求与工具描述 | LangChain 模型适配和工具 schema；结构化调用 | 提供哪些人物工具，权限、参数、错误与具体领域服务 |
| 任务恢复 | `thread_id` + 持久 checkpointer；中断/恢复能力 | 稳定业务操作ID、真实工具结果、过期依据复查；不能从头重发已成功动作 |
| 消息状态 | 消息对象与 `add_messages` 的按ID更新能力 | 权威 IM 原话、当前联系人、首次提供记录；不把工具日志当用户聊天 |
| 持久层 | 官方 PostgreSQL checkpointer | SQLAlchemy/Alembic 管理领域表；框架表迁移使用官方入口，分 schema/权限，勿重复创建官方表 |
| 到期与渠道输入 | 框架接受恢复输入 | 到期任务、收件概况、生活更新及平台结果进入调度；每项为何唤醒是业务，不是另写通用 Agent 引擎 |

不能自写一套通用节点执行器、checkpoint 序列化、interrupt 协议，再说“用了 LangChain 的 HTTP 调用所以满足复用”。也不需要额外搭建通用 Skill 市场、插件市场、MCP 网关或分布式事件总线。内部服务先是普通模块，确需跨进程复用再暴露工具协议。

## 4. 具体如何运行一次任务

例如她已获准查看甲发的视频，正在读评论；此时饭做好了。

```text
DecisionRun r-a：围绕甲的视频继续交流
LangGraph thread_id：r-a（一次业务运行，不是整个人物，也不是联系人名字）
Conversation c-a：她与甲的长期真实聊天，另存在消息表
Person p：唯一共享生活与当前处境，另存在领域表

准备本次步骤 → 人物模型选择 → 校验并提交/读工具/等待 → 回到准备
                    └→ 形成待发回复 → 检查 → outbox → 等结果/结束
```

1. 框架恢复 `r-a` 的工作轨迹，程序补当前处境和本轮输入。甲的真实聊天原文还在；上一步工具结果也在，而不是只剩一段“他们在聊视频”。
2. 模型决定先读一部分评论。只读工具经权限过滤；慢操作保存任务ID并暂停，人物的运行机会让给其他待处理任务。
3. 生活服务确认模拟的“饭好了”，提交新处境与共享变更通知。甲的 run 与其他活跃会话各自收到允许共享的更新，不能包含甲的私聊。
4. 评论工具完成，恢复仍用 `r-a` 的 checkpoint；先并入结果与当前处境，再由模型判断是否说“我先吃饭，晚点看”。不是调度器替她写好这句话。
5. 若提议发送，领域服务把已检查的载荷和 outbox 保存；之后框架继续或结束。发送结果不明就核查，不能因为节点重跑再次发送。

这是业务图示意，不是已经运行的代码。消息续接、生活更新和复看合并的完整规则只在[02](02-连续对话与生活变化怎样衔接.md)维护。

```python
# 我方拟议节点分工；不是复制上游函数，也不是可运行实现。
graph = StateGraph(RunState)
graph.add_node("prepare", refresh_current_context_and_keep_working_history)
graph.add_node("decide", call_configured_model)
graph.add_node("apply", validate_and_apply_domain_proposal)
graph.add_node("await_result", await_persisted_result_or_yield)
graph.add_node("outbound", inspect_and_stage_outbound_payload)
# 条件边依据模型提议与服务实际结果路由，不按情绪分数选台词。
compiled = graph.compile(checkpointer=official_postgres_checkpointer)
```

节点数量是说明分工，不是要求每次回复依次跑五个模型。`prepare/apply/outbound` 的确定性部分不调用模型；需要语义窄审查时才作单独调用。模型仍可以直接回应、不行动、继续工具或结束，没有固定“先查记忆再评情绪再改日程”的流程。

## 5. 两份持久状态怎样避免各说各话

`checkpoint` 记录“运行停在哪、已取得哪些工作结果”；领域表记录“人物生活已经成立什么、操作实际发生什么”。两个存储都用了 PostgreSQL，也**不自动共享同一个事务**。官方 `PostgresSaver.put/put_writes` 有自己的写入路径；必须承认这条边界。[^lg-pg]

本轮建议：以领域事务及稳定 `operation_id` 为业务真相，框架状态记引用。

- 节点提交领域变更和相应 outbox 成功，进程却没来得及保存 checkpoint：重跑节点先按操作ID查询，返回先前结果，不再次改日程或发帖。
- checkpoint 留着旧处境，生活表已更新：下一请求前刷新。checkpoint 不是覆盖世界的指令。
- 远端操作可能已发生，本地无回执：状态是 unknown，恢复去核对。框架的重试不能获得平台不提供的幂等保证。
- `interrupt` 恢复从节点开头重新执行，不是从 Python 中断那一行继续；不可把未经防重的发布、发送放在它前面。等待节点只读取已经保存的任务及结果，提交动作的节点须幂等。[^lg-types]

人物级短步骤排队是本项目业务协调，不替换 LangGraph 内部调度。每次调用前短事务领取带代次的资格；调用中不持数据库锁。超时释放资格并阻止旧输出提交。任务切片公平轮转；慢平台工具不能占着全人物。准确接线仍须故障试验证明，不能仅靠伪代码判定正确。

### checkpoint中的正文怎样删除，而不是只在查询时藏起来

可以保存运行需要的工作消息，但它们属于有来源的派生副本。每次写checkpoint前，宿主登记`run/thread → conversation、contact、source_id/revision`的依赖清单；跨联系人回想也登记实际来源，不能只按当前聊天对象寻找副本。未确认提供的首次正文即使暂存在checkpoint中，也保持原读取资格，不能被当成普通已知材料。

固定版本的`PostgresSaver.delete_thread`按thread删除checkpoint、blob和pending writes；没有按我们`source_id`选择性删除的业务接口。[^lg-delete] 因此首版建议**粗粒度作废受影响thread**：来源先撤权/标删除，阻止新读取及旧运行提交；列出所有依赖该来源的thread；取消或隔离在途写入，清除其checkpoint各版本；需要续办的任务根据领域操作、尚存合法轨迹与责任重建一个新generation/thread。原`operation_id`仍保留，不因重建重复发消息或发布。代价是可能丢掉一些便利的工作缓存，优先避免私密正文残留在可恢复状态里。

这需要在checkpointer调用边界校验run generation与删除状态，并协调在途写入完成后的再次清理，不能在删完时让旧worker又写回。只读过滤只保证不再使用，**副本清除完成**还必须逐项检查checkpoint、工具缓存、输入快照及备份策略；清除失败记为待重试。若某段工具过程只有checkpoint存过，删除它后就不能宣称完整恢复，只能从剩余有效资料继续或明确无法恢复；已经发生/未知的外部动作仍靠领域操作记录核查。来源→副本清单与粗粒度清理是我方适配，不是上游自动提供的保证。

## 6. 在开工前后怎样验证这个选择

本轮只读研究，不因选型回答恢复实施。后续获准时，先做一个可丢弃、无付费模型的框架切片：

1. 官方 PG checkpointer 保存两次工具往返，杀进程后续同一任务，原工作消息不丢。
2. 同一人甲乙两个 run 轮转；视频任务等待时乙可处理；两个联系人原话不自动混合。
3. 领域提交后、checkpoint 前故障：恢复只得到一次生效记录和一次外部操作ID。
4. 已发出模型请求期间饭好：旧请求保持原快照；新背景主动排到后续边界，过期草稿不出站；测排队、请求与检查耗时，不能先承诺“几秒全部知道”。
5. `interrupt` 恢复、重复结果和未知发送都不重复外部动作；检查模型实际请求，不以“checkpoint里有数据”代替“模型收到”。
6. 同联系人隔一个月续聊，收到一段末尾原话；长工具结果压缩不消掉这段原话和未完成责任。
7. 删除一个联系人来源后，枚举受影响thread及跨人回想派生副本；并发的旧checkpoint写入不能复活正文。清理后的续办仍沿用原操作身份，无法恢复的过程如实标明。

这些切片过关，才说明承载接线可用；真实模型自然度、情绪效果和平台账号能力仍各自验证。若官方接口无法支持上述边界或适配复杂度明显失控，重新比较 DSH，不在失败路线继续堆补丁。

## 来源与核查范围

以下是2026-10-28取得并阅读的固定源码。仅做代码/文档核查，没有安装候选框架、调用真实模型或测负载。

[^lg-types]: LangGraph `858891aaa164ebdacf33b8f5e7f88b38b9132211`，[interrupt与Command](https://github.com/langchain-ai/langgraph/blob/858891aaa164ebdacf33b8f5e7f88b38b9132211/libs/langgraph/langgraph/types.py#L903-L1037)，[消息ID合并](https://github.com/langchain-ai/langgraph/blob/858891aaa164ebdacf33b8f5e7f88b38b9132211/libs/langgraph/langgraph/graph/message.py#L64-L210)。[官方持久化说明](https://docs.langchain.com/oss/python/langgraph/persistence)辅助区分checkpointer与跨thread store。
[^lg-pg]: 同版 [PostgresSaver](https://github.com/langchain-ai/langgraph/blob/858891aaa164ebdacf33b8f5e7f88b38b9132211/libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py#L45-L400)：setup、put与put_writes；不代表与我方SQLAlchemy会话原子提交。
[^lg-delete]: 同版 [delete_thread及prune](https://github.com/langchain-ai/langgraph/blob/858891aaa164ebdacf33b8f5e7f88b38b9132211/libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py#L386-L462)。核查的是同步PostgresSaver路径；若实施使用异步saver，须核对该实现的对应清理入口及事务行为，不能只凭同名推定。
[^lc-agent]: LangChain `4b80abeadd6faf7f321ac5d690602812f82a3baf`，[create_agent及工具节点构造](https://github.com/langchain-ai/langchain/blob/4b80abeadd6faf7f321ac5d690602812f82a3baf/libs/langchain_v1/langchain/agents/factory.py#L892-L1175)、[图编译](https://github.com/langchain-ai/langchain/blob/4b80abeadd6faf7f321ac5d690602812f82a3baf/libs/langchain_v1/langchain/agents/factory.py#L1900-L1925)。
[^dsh-core]: DSH `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，[send与后续步骤](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-loop/src/agent.ts#L163-L181)、[preStep与turn循环](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-loop/src/agent.ts#L278-L395)、[冻结请求](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-loop/src/agent.ts#L648-L730)。
[^dsh-inbox]: 同版 [inbox.ts](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/core/agent-loop/src/inbox.ts#L73-L130)；[完整调用时序](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/agent-lifecycle.md)。
[^dsh-sdk]: 同版 [sdk-minimal profile说明](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/bundle/sdk-minimal/README.md)；[持久化与服务接缝](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/capability-seams.md)。不能由可替换接缝推断我方PG适配已存在。
[^da]: Deep Agents `74e258dd4564546b1e47815d0b11cd1bfebf72ea`，[实际中间件装配](https://github.com/langchain-ai/deepagents/blob/74e258dd4564546b1e47815d0b11cd1bfebf72ea/libs/deepagents/deepagents/graph.py#L906-L1015)。本轮没有评审其全部后台/部署功能，不作总体优劣排名。
