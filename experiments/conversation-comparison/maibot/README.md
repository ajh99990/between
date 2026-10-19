# MaiBot 原样 Replyer 对比适配包

本包固定 `Mai-with-u/MaiBot@f01f2c22df5e0ba3cb1c5bc3b6ced5d5ec39c1cb`，仅覆盖默认中文私聊、纯文本、明确要求每轮发言的 Replyer 子路径。**不能将本包结果写成完整 MaiBot 产品效果。** 没有发起任何模型调用。

## 用法

```js
import { createRequest, createMessages } from './adapter.mjs';
const { messages, provenance, glue } = createRequest({
  history: [
    { role: 'user', content: '刚下班' },
    { role: 'assistant', content: '今天忙到现在啊' },
  ],
  input: '嗯，今天忙死了',
  userName: '用户',
  now: '2026-10-19T16:00:00',
  replyStyle: '正常回复',
  replyReference: '',
});
// 将 messages 原样发送给统一的模型连接；把 provenance/glue 和完整请求一起保存。
```

Node 需要能调用 `python3`。Python 仅使用标准库。`createMessages(options)` 仅返回消息数组；`createRequest(options)` 同时返回归因边界，推荐后者。`history` 不含此次 `input`，只接受 user/assistant 文本。`now` 可不传，取本机当前时间。

## 保真做法

- `original/` 保留上游完整源文件字节，没有复制后改写核心提示词。
- `manifest.json` 给出每个原文文件的 SHA256、固定提交及源码链接。渲染前逐文件校验，失败即停止。
- `defaults.json` 使用 Python AST 从上游配置 `Field(default=...)` / `default_factory` 精确提取，不靠手抄。
- `render.py` 在运行时加载上游 Python AST，选取原方法体直接编译执行；没有将中文规则重写成 JavaScript 字符串。
- 原始 `.prompt` 由 Python `.format(**kwargs)` 渲染，和上游同样保留换行。
- 身份保持原默认“大二女大学生”，风格保留贴吧表达原文。没有额外制作新角色。
- `replyer_retro_prompt=false`；备用风格概率为 0；注意力漂移关闭；默认关键词规则空。
- 用户消息使用上游 `format_speaker_content` 及消息 ID 格式，已发送助理文本按 `guided_reply` 进入上游 `_build_history_messages`，所以真实回复角色为 assistant。

## 输入变量与胶水边界

实际默认链为：Planner 决定 `reply` 工具 → 工具提供 `msg_id`、非空 `reply_reference`、可选 `reply_style` → 选择表达习惯 → Replyer 生成 → 插件 Hook → 后处理/分段/错别字 → IM 发送。[^reply]

本包直接调用公开的 `_build_request_messages` 子路径，不运行 Planner。这个方法的原 API 允许空 `reply_reason`/`reply_reference`；因此最少胶水设置为空时，没有自己编写或概括任何“回复参考”。这与完整工具链要求非空参考有区别，必须记录。

若比较方希望用当前用户消息原文填写 `replyReference`，可以传入，但必须另传 `replyReferenceOrigin: 'comparison glue: exact current user utterance; not Planner output'`，并在报告中公开。不得伪称是上游 Planner 的输出。当前默认保持空，不自动套用这种替代。

`replyStyle` 默认为“正常回复”，原方法对此不追加新指令；“简短表达”“长回复”对应原文分支也保留，但本轮对比应固定正常回复，避免额外混杂。

纯文本适配层负责创建 IM 风格的消息对象、顺序短 ID 和说话人标签。为可重放，默认把输入历史的时间设为当前调用的 `now`；这是记录格式适配，不代表真实各条入站时间。没有注入额外中文提示词。

## 不可声称已覆盖的能力

- Planner 的参与/沉默/等待、`reply_reference` 规划、记忆和工具使用没有运行。
- 表达方式选择依赖学习数据库及子代理，本包没有学习数据库，原公开 API 允许不提供 `sub_agent_runner`，因此不追加 expression habits。
- 插件 before/after Hook、输出校验重试和输出重写没有运行。
- 表情、图片、语音、附件、引用及多用户群聊没有支持；只接受纯文本。
- 后处理默认在完整项目中开启，包括移除带中文括号内容、错别字生成和分段。本包保留原始模型文本用于比较和审计，不假装完整终端输出。保留相关源文件供下一阶段核查。
- 原始方法会将目标可见文本规范化到最多 300 字符、guided assistant 历史最多 500 字符；这来自上游，未私自修改。对话归档必须另外保存完整用户和模型文本，不能拿渲染后的 prompt 当完整聊天记录。
- 部分异常路径上游自身有兜底提示，本包不主动触发；实际请求应保存消息全文，检查没有出现占位符或兜底助手提示。

## 参考文献

[^reply]: Mai-with-u，《MaiBot reply 工具实际调用链》，固定版本源码：https://github.com/Mai-with-u/MaiBot/blob/f01f2c22df5e0ba3cb1c5bc3b6ced5d5ec39c1cb/src/maisaka/builtin_tool/reply.py
