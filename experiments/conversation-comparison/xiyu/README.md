# 溪语原样提示词试验适配说明

## 已准备的内容

- 上游： https://github.com/xiyuailove/xiyuai
- 固定提交：`06928e2dbccf438109a9eeae80086bb12f729fd3`
- `upstream/` 是该提交的完整原仓库，所有原文件保持字节不变；`provenance.json` 记录 11 个核心参考文件 SHA256。
- `adapter.mjs` 是独立的本地调用/记录适配层，没有人工重写、压缩、删改核心提示词。
- `default-companion.json` 是从原 `src/db.mjs` 的 companions 建表 SQL 自动取出的新行默认值，补入原迁移定义的 `attachment_style=secure`、`first_love=1`、`safe_mode=0`、`locale=zh`、`dislikes=[]`。JSON/布尔转换依照 `parseCompanionRow`。`createCompanion` 显式的新建覆盖 `sticker_reply_enabled=1`、`proactive_daily_target=4` 也予以记录。标识、时间是隔离试验元数据。
- 这些是“新库默认配置的静态夹具”，不是线上真人角色，也不是运行过完整 onboarding、人生背景生成、作息与关系状态机后的配置。

## 首轮测试的精确范围

```js
import { createMessages, verifyOriginals } from './adapter.mjs';
await verifyOriginals();
const request = createMessages({
  history: [{ role: 'user', content: '刚忙完' }, { role: 'assistant', content: '今天忙啥呢' }],
  input: '准备吃点东西，你呢？',
});
// request.messages 是可交给主试验 provider 的 system/history/user 消息。
// request.parameters 是原模型默认参数。可由主试验显式使用共同参数，但须分别记录。
// request.metadata 包含范围、原文件哈希、渲染提示词哈希、默认夹具、extras 与单列 glue。
```

首轮的 `scope=original-buildSystemPrompt-only`：直接 import 原 `src/companion.mjs` 的原函数。传入完整原生默认夹具；history 同时进入原函数支持的 `recentTurns` 参数（原函数自己截取最近 16 条并写进系统上下文），然后以原 role/content 顺序作为 provider 对话。输入不重复放入 history。没有新增胶水（默认 `[]`）；显式胶水按独立 system block 列出；不会悄悄改写或覆盖核心块。

首轮不调用内心 OS、反思、记忆提取等辅助模型；不附加 bot 的首轮破冰、情绪与其他外部 hint；不运行输出守卫、分段、改写、兜底或语句删除。收到模型失败应记录错误，不能把本地兜底句当作真实模型响应。因此首轮是“原构建函数子路径对比”，不能声称已验证完整溪语产品效果。

`buildSystemPrompt` 自带当前上海日期/时间注入，渲染结果会随时间变化。每轮应保存 `messages[0].content` 和其 SHA256；源文件字节哈希与渲染文本哈希是两件事，不能将后者变动误判为原文被改。

## 原生默认配置与已知冲突

- 名字：溪语；年龄：20；角色标题：邻家女孩；长黑发、棕色眼睛、165cm、甜美穿搭。
- 性格：温柔/体贴，内外向 5；自然口语；emoji 5；颜文字 false；原 reply_length 是“适中(3-4句)”，其原生模板规定单条 20 字并以 `||` 分段。
- 关系状态字段是“普通朋友”，但实际 `relationship_stage=暧昧`、`affection_level=35`，并有 `first_love=1`。这是原项目的新建默认，不能为了符合“普通人”目标无声改为陌生人/同事。
- 原模型默认：temperature 0.8、max_tokens 3000、top_p 0.95。
- 原函数中的核心身份包含不承认 AI、俏皮留白的规定；这是原文已有行为，应在独立管理员试验中如实注明，不应宣称已经适合直接上线。
- 原文仍有恋爱叙事、阶段限制、强制短句、追问比例等。此次保留以观察它们的实际作用，不以人工改写来制造好看的测试结果。

## 完整默认产品链路与静态子路径的区别

真实 `src/bot.mjs` 大致链路如下：

1. 入站解析、合并连续消息、去掉重复的本轮 history、危机/安全/照片等意图路由；部分路径可能直接返回，不进入文字模型。
2. 读取/更新角色、记忆、用户画像、长期摘要、事实、作息、近期生活、喜好、关系与场景。动态人生内容并不是一个静态提示词块。
3. `generateInnerMonologue` 在主回复之前生成不对外发送的内心独白和末行结构化 JSON。默认 `INNER_OS_MODE=always`；这不是每一句都调用：长消息默认进入，短消息须命中关系张力词。`INNER_OS_MODE=off` 或兼容旧关闭变量可以关闭，但这属于配置改变，首轮不运行完整链路。
4. `buildSystemPrompt` 加上贴纸、情绪、久别重逢、塑造确认、升级/冲突、复读抑制、事实、场景、真实世界日历、首轮破冰、部分亲密/告白/深夜/连问专项片段，最后追加内心 OS 提示。
5. `generateReply` 把传入 history 转换成 provider messages，可能按用户内容检索网络；安全风险可收紧 temperature；非角色扮演会删除动作旁白；请求失败有原生兜底句。
6. 回复再经审核、人设泄露、冲突/愧疚、事实确认/数字漂移、场景跳变、照片冒充、疾病与经期等守卫，随后 Persona Guard 可能要求重新生成。之后还有情绪更新、连发重合并、消息分段、相似度去重与 ack 冷却等。
7. 最终才按分段发送到微信并落库。发送节奏、贴纸、照片、主动消息均不包含在静态子路径里。

因此，用 `buildSystemPrompt` 原文得到的回复，与运行完整默认产品得到的最终送达消息，不能当作同一个试验。若未来需要完整体验，应单独部署原仓库隔离运行，并保留所有开关、状态和原始输出/处理后输出记录；不应在当前 adapter 里仿写这整条链路。

## 额外保留的原函数加载工具（首轮不启用）

`loadOriginalInnerOs` 和 `loadOriginalPersonaGuard` 通过 Node `vm.SourceTextModule` 对整个原文件原字节执行，只将依赖链接到显式提供的 transport / logger。需要 `node --experimental-vm-modules`。原 inner OS 会调用所提供的 generateReply callback，它不自行读取任何密钥，也不会自动启动原 bot。所有 VM 环境变量默认空，只有调用者显式传入的 env 生效。

`loadOriginalSegmentation` 从完整原 `src/bot.mjs` 自动截取连续的 316 行开始的分段代码原文，追加的只有命名导出语句；返回截取区域 SHA256。未手工重写函数，也没有执行 bot 初始化。

原分段逻辑值得注意：MAX_SEGMENTS=4、MAX_SEG_LEN=25 并不是严格不丢失/不超过 25 字的保证。无 `||` 的长文本自动按句尾拆时可能使用 `parts.slice(0,4)` 丢掉后续句；没有句末标点的长片段会整段保留以避免腰斩。该机制首轮不启用，模型原输出必须保存。

## 离线验证与依赖

原 buildSystemPrompt 模块零依赖，只需要 Node（原项目声明 >=20，本机已用 Node 24 跑通）。首轮不用 npm install，不启动任何外部服务，不读取密钥，不调用模型。

```sh
node --experimental-vm-modules /tmp/between-xiyu-original-20261019/smoke.mjs
```

本次 smoke 检查了 11 个原文件 SHA256、原构建函数实际可调用、原分段代码和内心 OS 的本地假 transport 能运行；模型调用数为 0。假 transport 只为离线接口 smoke，生成的固定内心样例没有进入任何正式聊天记录，不能当作真实模型行为。

## 参考源

- 原构建函数： https://github.com/xiyuailove/xiyuai/blob/06928e2dbccf438109a9eeae80086bb12f729fd3/src/companion.mjs
- 真实装配与发送： https://github.com/xiyuailove/xiyuai/blob/06928e2dbccf438109a9eeae80086bb12f729fd3/src/bot.mjs
- 默认值与解析： https://github.com/xiyuailove/xiyuai/blob/06928e2dbccf438109a9eeae80086bb12f729fd3/src/db.mjs
- 内心 OS： https://github.com/xiyuailove/xiyuai/blob/06928e2dbccf438109a9eeae80086bb12f729fd3/src/inner_os.mjs
