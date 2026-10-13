# Between Orbit · 本机 V1 设计系统

> 此文件记录已被用户否定的旧 Orbit 方案，仅保留历史来源。本次经典后台布局以 [后台经典布局重写与验收](../../docs/后台经典布局重写与验收.md) 和当前源码为准。

本轮从独立 Mac Git 工作区基线 `4ed481a458e9a7af818d3f898d171afd0b2c286c` 开始，任务按用户指定 GPT-6 astra / ultra 执行。以下是设计判断；真实查询 stdout/stderr、参数、UTC时间、SHA256完整保存在 `runs/`，不将加工内容冒充技能输出。

## 产品范围

产品正在做 V1，尚未上线。此次完全重写管理员 UI，没有旧后台兼容、双版本界面、迁移层或旧视觉回退。功能与数据契约继续成立，与保留旧布局无关。配置版本号仅用于并发编辑的数据覆盖保护。

实际完整读取两项仓库 SKILL.md、SOURCE.md、根AGENTS和两份Git/停止交接文档；Python3 search.py --help成功。父任务对78个技能清单文件进行了字节数/SHA256实核，78/78一致；未覆盖个人技能。另实际读取ProMax pro-rules及quick-reference。

## 本轮查询与采用

| 记录 | 真实输入与命中 | 采用或调整 |
| --- | --- | --- |
| 01-design | `AI operations glassmorphism futuristic`，design-system，variance9/motion4/density7；Brutalism | 偏离明确玻璃偏好，不采用粗粝无过渡；按技能窄化重试一次。 |
| 02-glass | `glassmorphism dark dashboard`，style；Glassmorphism 1条 | 采用10–20px玻璃、光源、细边光和层次；正文增加实体底色。 |
| 03-keyboard | `focus not obscured`，ux | 不遮挡焦点、明确描边、跳转主内容，目录和抽屉键盘验收。 |
| 04-react | `form state controlled inputs`，react | React受控状态、ProForm可见标签、提交锁与稳定编辑快照。 |
| 05-design-refined | `SaaS dashboard glassmorphism`，design-system，motion4/density7；Glassmorphism | 正式主导视觉。营销Hero+Features+CTA改为页面主题+真实指标+核心管理操作。 |

原始结果推荐浅底、橙色CTA及网络字体。按用户大胆科技玻璃偏好，明确调整为深蓝画布、蓝紫轨道球体、冷青边光、淡蓝主动作；危险操作独立红色。字体用系统栈，避免网络字体依赖及中文掉字。这是设计调整，不声称技能原样输出此暗色组合。

## 实现规则

- 旧深绿侧栏+白底表格改为品牌顶栏+六入口玻璃导航+全宽工作区。完整保留Ant Design Pro、React、TypeScript、Umi Max、Tailwind作为功能框架。
- 画布`#080d1b`，内容面`#131c32`，浮层`#19243c`；正文`#eef3ff`、次文`#b0bdd4`、冷青焦点`#9cf5ef`。状态通过文字、图标、颜色共同表达。
- 最大宽1504px，桌面边距48/32px，手机16px。角色卡板、世界书书脊档案、运维控制面板、全文目录+正文采用各自任务结构。
- 圆角17/20/12px。玻璃限页头导航，正文不透底。CSS球体/轨道无外部图片请求，装饰不伪装点击入口。
- 375/768/1024/1440px验收；导航换行、目录折叠、长中文/URL换行、表格仅自身横向滚动。
- 悬停颜色/阴影过渡；尊重reduced-motion，不滚动劫持、不无限旋转、不虚构实时状态。

## 操作规则

保存基于打开编辑器时快照，409保留草稿；取消可放弃或继续；已提交但刷新失败独立提示避免重复提交。保留未知字段与source对象。套餐仅medium/high；授权就绪与实际推理完成分开。恢复额度暂停不等于检查Usage或重新授权。

浏览器验收仅用临时虚构数据、禁止生成的套餐提供器、隔离localhost端口。实际像素、修复与复验见SELF-CHECK.md，不以代码、DOM或截图存在冒充视觉通过。
