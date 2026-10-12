# 最新复现：角色 + 多模态 + 语音

本文件取代先前纯文本候选的复现说明。最终必须通过15组文本/WI加6组媒体/语音，共21组对照。原版固定SHA及AGPL说明见SOURCE.md。

Linux，Node24.19.0/npm11.9.0，系统Chromium151，Playwright1.58.2。需要可用的Chromium sandbox；不能传--no-sandbox。工程根目录：

```sh
npm ci --omit=dev
npm ci --prefix research
node research/verify.mjs /tmp/st-media-check-unique
```

最后目录必须不存在；默认生成/tmp下独立目录。可用ST_TEST_PORT更换默认8154端口，mock provider使用+100；均仅127.0.0.1。工具自动创建独立config/dataRoot、启动并等待服务、执行15+6组测试、记录证据、最终停服。保留CSRF/白名单，关闭自动更新和模型下载，不继承用户生产环境变量，只继承PATH/NODE_ENV。不需要真实key、不访问外部模型、不读取生产.env/凭据。

**mock边界**：聊天/custom TTS/SD WebUI是回环HTTP provider；返回固定文字、合成MP3和2×2PNG。`mock-media-register.mjs`仅在测试启动参数中替换transformers.pipeline模型推理，实际RawImage解码、wavefile音频处理、原ST端点/扩展代码不替换。合成WAV与MP3都是测试音调，没有真实声音素材；音质、语义识别、延迟不在验收范围。

每个用例新浏览器context，固定UTC/locale、Date、Math.random、seed与tokenizer，关闭动画。普通启动不带--import即可使用真实原库/配置（实际模型和provider需要另行配置）：

```sh
node server.js --configPath /path/to/research-config.yaml --dataRoot /path/to/fresh-data --port 8154
```

复现输出：

- evidence/final.json：15组完整provider JSON/聊天语义/字段与固定baseline.json对照。
- evidence/final-media.json：6组媒体JSON、TTS voice/input、媒体响应/图片保存等与media-baseline.json对照。
- evidence/negative-guards.json：不支持的chat provider/stream/无效messages、向量、非tiktoken、外部扩展安装明确拒绝；**不拒绝图像/音频messages**。
- runtime-final/media-inference.jsonl：mock模型边界的task/model/输入长度/采样处理参数。
- server.log、server-memory.txt、shutdown.json。

成功应看到 `DIFFERENTIAL PASS 15`、`DIFFERENTIAL PASS 6`、`FINAL VERIFIED`、`Research server stopped`。生成/回复/保存不是dryRun；media suite启用原媒体扩展。语音转写→输入框桥接仅为测试适配，原版默认麦克风通话UI/全双工实时协议不是已实现产品。

此前prune-stage1/2脚本对应已否决纯文本边界，仅保留为实验记录，不能对新版本重新运行。新版本以最终Git提交和相对官方SHA的patch为准。baseline原样保留，旧纯文本分支保留历史；不要将其494包/128MB数字作为最新指标。
