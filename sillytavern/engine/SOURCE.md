# 来源与许可

上游：https://github.com/SillyTavern/SillyTavern.git
固定commit：06bde939fb1e9c4c8d8641d810f0a916b5bce127；package 1.19.0，并不宣称SHA等于发布tag。
先前研究基点：b357a7bf91d3bb5efda00c7ea633528619051090。

本引擎为SillyTavern修改/抽取衍生研究作品，保留AGPL-3.0及原根LICENSE、版权注释。不可将其擅自发布为其他许可。分发与网络交互的对应源码义务需按照AGPL履行；只提供上游链接不能代替本修改版对应源码。当前未发布/部署。

engine/extract.mjs：通过Acorn从原文件取完整声明，记录原文件、行号和声明hash。prepareOpenAIMessages唯一声明内适配是catch后直接throw，使后端事务不继续提交部分prompt；其余抽取声明不改函数体。UI方法可能仍保留在类定义中，但不调用构造/init/render；以原prototype配显式settings/activeCharacter/tokenHandler，render仅作为无副作用边界。

engine/extract-media.mjs：原speech recognize/synthesize、caption、custom TTS handler、TTS provider类及SD请求/回复处理。HTTP路由适配为函数调用，fetch附加取消和回环/重定向限制；不加载旧用户密钥读取器。

engine/extract-stream.mjs：直接抽取public/scripts/sse-stream.js的EventSourceStream，Node原生Web Streams运行。

新编写适配：engine/core.mjs的状态注入、Generate子链路协调及Node图片/音频/token计数接口；engine/index.mjs的主体绑定、队列、事务、持久化、幂等、provider传输及流式回复累积；engine/media.mjs的端点桥接、声音映射和取消。它们不是原ST端到端Generate/播放UI，也不是零成本解耦。

支持配置用白名单约束，getSortedEntries适配接收显式entries并按order排序；不支持decorators/角色内嵌书、隐藏book选择/标签注册等配置，不能静默声称完整世界书导入等价。媒体data URL、WAV/Jimp尺寸及持续时间检测为Node适配。相同测试输入与原provider请求差分提供所选语义的证据，不证明全部ST功能或模型自然度。

重新抽取：工程根执行 npm ci --prefix engine（包含dev依赖）；node engine/extract.mjs；node engine/extract-media.mjs；node engine/extract-stream.mjs。Acorn若仅安装在engine/node_modules，脚本按所属目录正常解析。不要修改固定baseline oracle来消除差异。
