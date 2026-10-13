# 来源与可移植适配

- 官方源：https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- 固定提交：7246805992a42b7bba37d4cac83b01416f0c6c44
- 子目录：.claude/skills/ui-ux-pro-max，完整复制该目录的73个Git跟踪文件（含数据、脚本、参考、测试及测试fixtures）。不含运行后产生的Python缓存。
- 原MIT许可证和Next Level Builder版权声明完整保留于本目录 LICENSE；不以Between其他模块许可替换。
- 唯一上游内容适配：SKILL.md 中 `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max` 改为 `${UI_UX_PRO_MAX_SKILL_ROOT}`，并明确由当前SKILL.md实际目录解析。脚本原本根据 `__file__` 找数据，不需Claude环境变量，不改算法或数据。
- Python 3，搜索脚本无外部依赖。完整本地文件哈希见仓库 docs/技能交付清单-20261013.json。
- 本目录是本机新任务可用的技能资料，不包含废弃云端界面代码、设计结果、模型凭据或聊天数据。
