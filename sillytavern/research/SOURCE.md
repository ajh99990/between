# 来源与许可证

研究修改日期：2026-10-08。最新范围包含角色、多模态和语音；旧纯文本候选已否决。

本研究从官方仓库 https://github.com/SillyTavern/SillyTavern.git 取得源码，固定 commit `06bde939fb1e9c4c8d8641d810f0a916b5bce127`。该提交的 package.json 版本为 `1.19.0`；不声称它就是某个发布 tag。

原始 LICENSE 保留于项目根目录，package.json 的声明仍为 `AGPL-3.0`。原作者的版权、源文件注释、第三方许可证和 webpack 生成的 lib.js.LICENSE.txt 必须继续保留。研究代码没有重新许可为闭源、MIT 或其他许可。改动清单见本地 Git 提交和 REPORT.zh-CN.md。

直接复制或修改受 AGPL 覆盖的代码会带来对应的源代码、许可及修改说明义务；传播副本/修改版需遵守 LICENSE 第 4–6 节。第 13 节要求修改版在支持网络交互时，向通过网络与它交互的用户显著提供免费取得该版本 Corresponding Source 的机会。对应源码包括重建/安装/运行所需的受覆盖源码与脚本，不能仅提供上游未修改仓库链接。参见 [GNU AGPLv3 官方正文](https://www.gnu.org/licenses/agpl-3.0.en.html)，以及本地 LICENSE:540。

未来将代码并入 Between 时，应针对实际组合、链接、分发与网络服务边界决定对应源码范围；不能假设放在独立进程或仅云端运行就自动免除义务。本次仅独立研究，未并入 Between、未推送、未发布或部署。

本仓库保留了上游 tests，未靠删除测试掩盖行为差异；新增研究回归在 research/。上游全功能测试不代表在删减版全部通过，已删除功能对应的上游测试未运行。
