# 独立 ST 角色引擎研究原型

运行不需要浏览器、DOM、完整ST服务或真实key。Node 24，工程根目录执行：

```sh
npm ci --prefix engine --omit=dev --cache /tmp/st-engine-npm-cache
npm test --prefix engine
npm run demo --prefix engine
```

测试使用回环HTTP和合成推理，结束自动停服；demo输出独立/tmp目录，包含合成reply.mp3、scene.png及会话快照。声音是测试音调，不是实际人声。依赖安装使用官方npm源。不要执行旧prune-stage脚本。

模块入口 `engine/index.mjs`：

```js
import {RoleEngine} from './engine/index.mjs';
const engine = await RoleEngine.open({
  root: '/tmp/my-private-role-data',
  endpoint: 'http://127.0.0.1:8000/v1',
});
// principal 必须来自宿主已验证身份，不得直接信任客户端输入。
const client = engine.forPrincipal({tenant:'team-a', user:'alice'});
await client.create('conversation-1', {
  character: {name:'Mira', description:'{{char}} is a lighthouse keeper.',
    data:{system_prompt:'Play {{char}}.', extensions:{}}},
  persona:{name:'Lin',description:'A visiting mapmaker.'},
  entries:[], chat:[],
  preset:{custom_model:'gpt-4o-mini',openai_max_context:4096,openai_max_tokens:256},
});
const abort = new AbortController();
const result = await client.turn('conversation-1', {id:'unique-message-id',input:'Hello'}, {
  signal:abort.signal,
  onDelta:text=>process.stdout.write(text),
});
console.log(result.reply);
await engine.close();
```

没有默认HTTP公网服务；以上是可信宿主调用的模块API，demo是可直接运行的CLI。任意会话标识不会成为文件路径，磁盘键由tenant/user/conversation三元组哈希得到。不同principal只拿到绑定作用域的API。Node VM用于隔离原ST模块状态，不作为恶意JS的安全沙箱；输入仅为结构化数据，字符串代码生成禁用。源代码与宿主插件本身是可信代码。一个数据根只允许一个引擎实例/进程；同会话串行、不同会话可并发。

## API 与事务

- `create(id,snapshot)`：显式角色、persona、entries、chat、preset。角色书须事先转换为entries，嵌入character_book会拒绝。原JSON角色卡的任意字段不等于全部支持。
- `turn(id,{id,input,mode,media,speak,audio,image,language},{signal,onDelta})`：mode支持normal/regenerate/voice/image/caption。normal媒体必须为inline PNG/JPEG/WebP或WAV；拒绝远程URL/file URL/video。voice使用audio；caption使用image。图片生成执行同角色quiet请求后调用原SD WebUI代码。
- `snapshot(id)`：取本作用域完整会话、副本、WI计时状态、摘要和操作记录。
- `memory(id,{summary,coveredThrough,expectedRevision})`：写入带覆盖范围及版本的摘要，全部原始历史仍保留。regenerate改到已覆盖消息时摘要失效。
- `media(id,mediaId)` / `delete(id)`：本作用域媒体读取/删除整个会话，包含历史、摘要、WI、媒体和幂等记录。
- `RoleEngine.recover(root)`：仅由单一可信主管在异常退出后调用。检测原PID仍活着就拒绝；PID不存在才移除失效owner。恢复后open清理本引擎严格命名的未提交.tmp；不恢复半完成回复。不要并行运行多个恢复主管。PID复用会导致保守拒绝，需人工检查。

输入在排队时复制。操作id重复且参数相同返回原提交结果；不同参数拒绝。失败/取消/不完整SSE不会提交用户输入、WI变化、回复或媒体。外部provider已经生成的内容无法回滚；故不是分布式exactly-once，崩溃在远端完成/本地提交之间可能在重试时再请求provider。原ST错误时保留输入/部分状态的行为没有照搬，这是明确的事务适配。

保存使用同目录临时文件、文件fsync、rename、目录fsync。SIGKILL恢复测试通过不等于模拟了硬盘损坏或所有断电场景。磁盘目录属于可信宿主，不提供同操作系统用户恶意改目录/符号链接的防御，也不承诺安全擦除磁盘块或备份。

## 长期记忆

完整历史与WI metadata持久保存，不以窗口预算丢弃。summary经原1_memory插入路径进prompt。可传 `retrieve: async ({principal,conversation,memory,chat,input,signal}) => string`，结果经原3_vectors注入路径进入预算；voice传实际转写文本。回调必须自行按已认证principal隔离索引和删除；引擎不提供自动摘要模型、向量数据库或跨重启外部检索索引管理。检索文本不被写为永久记忆。当前summary不会自动裁掉已覆盖历史，可能有重复信息；这是可控接口，不是已完成自动长期记忆产品。

## 媒体与语音

`RoleEngine.open` 的media配置支持 `ttsEndpoint`、`voiceMap`（角色名或[Default Voice]）、`tts`的model/speed，以及`sdEndpoint`、`sd`设置。仅允许显式回环HTTP提供方，拒绝重定向。服务端不播放音频，返回数据供调用端播放；同会话队列替代浏览器播放队列。不同会话无共享voiceMap/队列状态，配置为可信宿主配置。

传入 `pipeline(task,model)` 和 `rawImage(dataURL)` 可复用原ST本地ASR/caption/synthesis处理函数。`engine/media.mjs`还提供可选`localInference()`，使用原sillytavern-transformers且禁远程模型下载，需要宿主另装原包并提供现有本地模型路径。基本依赖不包含模型运行时与权重；测试和demo注入合成推理，实际模型未装载。可通过media.models按task给本地路径；ASR使用顶层asrModel。测试实际解码WAV及图片，并通过原代码生成RIFF。

取消能停止HTTP/等待中的操作并阻止提交；正在执行的第三方本地推理需其自身支持协作取消，引擎在返回后检查signal，不能抢占任意推理CPU任务。

原SD请求保留save_images:true以保持oracle，请信任并配置本机provider自己的存储策略。引擎delete不删除provider图像目录、日志或外部检索索引。这些系统的租户隔离不在当前验证结论中。

没有麦克风采集、WebRTC、VAD、回声消除、插话检测、全双工网络协议或通话延迟验证。流式文本与消息式语音可运行，不是完整电话产品。

## 支持子集与直接复用

固定官方SHA、许可证和抽取清单见SOURCE.md及vendor/*provenance.json。角色字段、旧宏替换、PromptManager、history/example预算、WI扫描/递归/计时、图像/音频消息构造，以及media转换直接抽取原声明。Generate未整体移植；新适配层显式执行其中单角色chat-completion链路，I/O、事务、状态绑定由新代码实现。没有启动浏览器或伪造DOM。

模型/tokenizer仅接受当前验证的gpt-4o-mini配置，不证明真实该模型支持所有输入音频格式。只保留custom OpenAI-compatible传输。拒绝群聊/swipe/continue/impersonate、工具调用/推理metadata、实验宏/变量宏/随机宏/时间宏、非in-prompt persona、WI作者注记位置和outlet/decorators、未接入角色扩展。已允许的常用宏见index.mjs白名单；不支持配置显式报错。复杂WI组合保留原算法，但未穷举全部配置。

原浏览器页面、DOM渲染、UI管理、任意扩展interceptor和自动发图触发器不在独立引擎入口；媒体通过显式mode触发。原作者注记完整编辑/计数行为未抽取，不能宣称全部Generate等价。原21组请求oracle保持不变，在独立服务同输入下对照通过；浏览器音频播放不是Node测试的验收对象。

## 复现证据与原版

`test/core-regression.mjs`、`media-core.mjs`保留15+6核心对照；`integration.mjs`包含原21组完整provider JSON/聊天对照和隔离等新增检查；`lifecycle.mjs`进一步验证检索、错误、取消、删除。evidence记录最终运行结果。research下原baseline.json、media-baseline.json及旧浏览器验证脚本保留；重建原版浏览器oracle按research/REPRODUCE.md执行，那一套需要完整ST安装，不是独立引擎的运行依赖。

源码包保留原ST研究切片作为来源及回退参考，所以归档包含public UI源码，但独立入口不导入/初始化它们。运行只读engine/vendor及官方default/content/settings.json。运行依赖数与归档源码体积单独报告，不把可追溯源码文件称为运行依赖。
