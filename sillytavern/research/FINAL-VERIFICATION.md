# 最终独立复核（已完成）

2026-10-08，运行代码/测试提交 `2f6ac3a32967b17b171def4f5f9c332f44384785`（分支 research/multimodal-voice-core）。将其用git archive导出到 `/workspace/st-research/verify-media-copy`，该目录不含Git元数据、不共享baseline或minimal的node_modules。独立 `npm ci --omit=dev` 实际安装595包，研究测试另装2包。

执行 `node research/verify.mjs /workspace/st-research/verify-media-final`，Chromium sandbox保持开启，仅回环mock，无真实凭据/模型/模型下载。结果：

- **DIFFERENTIAL PASS 15**：原版角色/预算/WI/再生成/显式重试请求及聊天语义一致。
- **DIFFERENTIAL PASS 6**：原TTS角色队列、图片输入、音频输入、STT→角色→TTS、本地合成、情境发图/保存、caption路径验证与原版一致。
- **7项明确拒绝检查**通过：其他chat provider、流式chat、无效messages、非OpenAI tokenizer、向量、外部扩展安装、未支持生成类型。图像/音频messages已允许并在上述媒体用例中通过。
- RawImage真实解码出2×2；原语音处理交给mock模型的Float64Array为3200样本；本地合成返回RIFF/WAV；custom TTS mock是1088字节有效MP3，浏览器解码0.2秒音调。
- 服务关闭记录：PID10571，exitCode=0，signalCode=null。复核全部研究端口8131/8132/8133/8135/8136/8154及mock端口8231/8232/8233/8235/8236/8254均无监听。

最终复核server RSS=412808KiB，VmHWM=1002240KiB（含启动webpack峰值），VmSize不是实际驻留内存。浏览器记录的JS heap范围25.20–28.80MB、DOM6612–7626节点。没有真实模型权重或声学推理，不能拿这个RSS预测真实Whisper/SpeechT5或通话总资源。

实际webpack输出lib.js 1947206字节+LICENSE 1283字节，共1948489字节。产物/缓存位于独立dataRoot，未放入源码交付包。最终运行源代码与导出复核版本相同，之后提交只补充报告/metrics/证据。

清理：没有活着的研究Chromium或研究服务。环境中可见56个Chromium僵尸进程（Z，非运行服务、无监听，已退出）；它们由容器PID1负责回收，当前进程不能wait回收它们，未操作PID1/系统设置。详见evidence/cleanup.json。研究依赖与合成运行数据仍留在研究目录，未打包node_modules、模型缓存、运行数据或.git；此目录可整体丢弃。

原Between HEAD仍为 `e00c2876ab30b14566bc3748676fa8201e777e4b`，工作树干净；固定原版baseline工作树干净。未推送、未发布、未部署，未碰用户Mac/Seed。

完整日志和JSON证据在research/evidence；原始server.log和中间诊断在父研究目录。旧纯文本15组通过只是已否决候选，不是最新完成结论。模型自然度、真实ASR/TTS质量和双向低延迟通话仍未完成验证。
