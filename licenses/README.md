# 当前依赖的许可证与归因清单

在根目录执行 `npm ci` 后运行 `npm run licenses`。收集脚本只读取根 `package-lock.json` 列出的第三方安装目录、包元数据和法律文本；不扫描运行配置或用户数据，也不执行依赖脚本。工作区自有包和符号链接不作为第三方包重复收集。

- [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) 保留所找到的许可、版权、作者和 NOTICE 文本。原文件字节按 SHA-256 去重，每份文本前列出所有对应安装位置、名称、版本和原文件路径。
- [dependency-manifest.json](dependency-manifest.json) 记录锁文件哈希、当前平台和 Node 版本，以及每个锁定安装位置的版本、归档来源、完整性值、许可证声明、文本哈希和读取状态。`coverage` 列出缺失文本、未安装可选依赖和异常；必需依赖缺失、版本不符或不安全路径使生成命令失败。

当前 `dependency-manifest.json` 记录 macOS ARM64、Node 24.11.0 安装图：锁定 510 个第三方包位置，其中安装 318 个位置（231 个不同的名称与版本组合）；找到 305 个法律文本文件，去重为 136 份文本。23 个已安装位置没有可收集的独立文本，192 个可选位置未安装。准确名单及重新生成后的统计以 JSON 的 `coverage` 为准；同一个包因不同依赖位置出现多次，不能把安装位置数当成不同包数。

收集范围包括顶层 `LICENSE` / `LICENCE` / `COPYING` / `NOTICE` / `COPYRIGHT` / `AUTHORS` 及许可目录内的文本。未安装的平台二进制包只记录锁文件元数据；没有独立文本的包只记录其声明，不虚构作者或许可证原文。嵌在源码、README、归档或可执行文件中的声明、安装脚本另行下载的二进制均不在自动收集范围。清单不表示所有平台的分发义务已经全部核验；实际目标平台安装及发布时需补齐该平台的文本和未覆盖声明。

项目与内容的授权边界在[根 README](../README.md) 说明，不由本清单重新授权：

- SillyTavern 复用代码与应用的 AGPL 文本见[根 LICENSE](../LICENSE)，抽取来源见[角色引擎来源记录](../packages/role-engine/vendor/provenance.json)。
- 新后台已删除原模板 UI，不恢复其旧组件或入口。原模板的历史 MIT 文本可在固定提交 [8495929e… 的 apps/admin/LICENSE](https://github.com/ajh99990/between/blob/8495929e4f7fa345ca0488255e8018b581379f06/apps/admin/LICENSE) 追溯；该历史许可不代表新后台或其全部资源均为 MIT。当前通用设计资源的来源说明见 [ASSET-SOURCES.md](../apps/admin/public/design/ASSET-SOURCES.md)，随包 Geist 字体采用 OFL 1.1，公开算法对照模块保留其原有 MIT 文本。
- 社区角色内容的 CC BY 4.0 许可和原作者说明见[社区归因](../apps/server/community/ATTRIBUTION.md)及[内容许可](../apps/server/community/LICENSE-CONTENT.txt)。
- 用户自有灵光模块沿用[来源及复用边界声明](../apps/server/lingguang/SOURCE.zh-CN.md)，不得由依赖清单或项目总许可证替换其授权声明。
