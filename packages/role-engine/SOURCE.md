# 来源与许可

上游：https://github.com/SillyTavern/SillyTavern.git
固定commit：06bde939fb1e9c4c8d8641d810f0a916b5bce127；package 1.19.0，并不宣称SHA等于发布tag。
先前研究基点：b357a7bf91d3bb5efda00c7ea633528619051090。

本引擎为 SillyTavern 修改/抽取衍生作品，保留本包 `LICENSE`、AGPL-3.0 及版权注释。分发与网络交互的对应源码义务需按照 AGPL 履行；只提供上游链接不能代替本修改版对应源码。Git 入库与公网部署是不同事项；本仓库不包含自动发布或部署动作。

`scripts/vendor/extract.mjs`：通过 Acorn 从固定上游 checkout 取完整声明，记录原文件、行号和声明 hash。prepareOpenAIMessages 唯一声明内适配是 catch 后直接 throw，使后端事务不继续提交部分 prompt；其余抽取声明不改函数体。UI 方法可能仍保留在类定义中，但不调用构造/init/render；以原 prototype 配显式 settings/activeCharacter/tokenHandler，render 仅作为无副作用边界。

`scripts/vendor/extract-media.mjs`：原 speech recognize/synthesize、caption、custom TTS handler、TTS provider 类及 SD 请求/回复处理。HTTP 路由适配为函数调用，fetch 附加取消和回环/重定向限制；不加载旧用户密钥读取器。

`scripts/vendor/extract-stream.mjs`：直接抽取上游 public/scripts/sse-stream.js 的 EventSourceStream，使用 Node 原生 Web Streams 运行。

新编写适配：`core.mjs` 的状态注入、Generate 子链路协调及 Node 图片/音频/token 计数接口；`index.mjs` 的主体绑定、队列、事务、持久化、幂等、provider 传输及流式回复累积；`media.mjs` 的端点桥接、声音映射和取消。它们不是原 ST 端到端 Generate/播放 UI。

`defaults.json` 仅保留原 default/content/settings.json 中实际读取的 oai_settings、power_user 和 extension_settings.sd，保持这些值不变。原酒馆服务、前端与其余默认资源不再参与当前产品运行。`test/fixtures` 中 baseline 与媒体 oracle 保留原始内容，用于与已记录上游请求进行差分回归。

支持配置用白名单约束，getSortedEntries适配接收显式entries并按order排序；不支持decorators/角色内嵌书、隐藏book选择/标签注册等配置，不能静默声称完整世界书导入等价。媒体data URL、WAV/Jimp尺寸及持续时间检测为Node适配。相同测试输入与原provider请求差分提供所选语义的证据，不证明全部ST功能或模型自然度。

重新抽取：在仓库根执行 `npm ci`，另行准备上述固定 commit 的干净上游 checkout，然后执行 `node scripts/vendor/extract.mjs /absolute/path/to/SillyTavern`、`node scripts/vendor/extract-media.mjs /absolute/path/to/SillyTavern`、`node scripts/vendor/extract-stream.mjs /absolute/path/to/SillyTavern`。工具只读上游 checkout，输出到当前包。不要修改固定 baseline oracle 来消除差异。

`localInference()` 保留可选本地语音/图像模型适配，宿主可显式安装 peer dependency `sillytavern-transformers@2.14.6` 并提供已有本地模型路径；默认安装不会下载模型，运行时关闭远程模型下载。文本聊天及合成媒体测试只需本包直接依赖。
