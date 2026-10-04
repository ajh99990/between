# 可复跑确定性数据集

当前数据集只使用明显的 synthetic fixture，调用真实生产控制解析与观测归一化函数。执行不请求模型，不连接平台、不生成虚构 trace，也不输出模型质量评分。它是 R5.3 第一层的一部分；真实宿主故障层和模型人工质量层仍需各自实测。

```sh
npm run build
node scripts/evaluate.mjs evidence/cloud/continuation-0800/deterministic-eval-UNIQUE.json
```

输出路径必须不存在，避免覆盖历史失败。结果记录每例 requirement、passed/failed 和失败字段名，不抄正文；整体非零失败令进程 exit 1。fixture、实际执行的编译模块、对应源码、Skill/人物与锁文件的 SHA256 一起绑定。缺文件、坏 schema、重复 case ID、非 synthetic 数据均拒绝。

当前18例包括：明确记忆开关、引用/疑问/否定不授权、称呼与朋友方向独立、暂停恢复、称呼撤回；默认禁捕获、敏感键及 canary 脱敏、Unicode精确字节限额、system-only、坏JSON和仅metadata输出。另有runner负测，修改正确预期会真实失败，不从现有输出反推预期。

不能把18例与node:test测试数简单相加宣称端到端覆盖。该数据集没有给所有74项产品要求评分，没有通过权限执行链、真实模型质量、原版Langfuse页面或发布验收。

审查强化：runner会自行先clean build后才import编译模块，避免陈旧dist冒充当前源码。capture/attempt例必须至少有一项断言，空预期不能自动绿；默认disabled和oversize还验证没有value/ref。禁止内容检查涵盖原始字符串和JSON属性内嵌字符串的换行/引号/反斜杠，不只对序列化文本做简单substring。控制例仅检查固定初始状态下的解析增量，不代表持久控制状态机全验收。
