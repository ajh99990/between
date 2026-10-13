> **已废弃 / WIP 备份**：2026-10-13 用户中止本轮云端重写。以下仅保存未完成现场，不是已验收交付，不作为本机重写基线。

# Between Prism — 2026-10-13 全面重写

这是用户明确要求推翻旧管理界面后的新设计；旧 `between-admin/MASTER.md` 仅是历史，不约束本版本。恢复基线 ba4bed781083a7cad2748579f9405a0a912ba6bd。范围限管理员 UI，保留数据/API/引擎/用户聊天。

## 技能与完整新运行记录

本轮完整读取云端 UI UX Pro Max 与 UI UX Self Check。云端技能子资源读取失败后，从已固定官方仓库 7246805992a42b7bba37d4cac83b01416f0c6c44 读取 SKILL.md、quick-reference、pro-rules 并运行其 scripts/search.py。云端入口只调整了定位脚本的说明；实际执行版本固定如下，不声称个人包子资源读取成功。

`runs/` 保存每次 argv、UTC、退出码、原始 stdout、stderr、stdout SHA256。用户明确要求保存原始结果，因而不采纳的第一份也作为审计记录保留，不作为规范。不是旧两次结果的重建。

1. `AI creative studio glassmorphism` + variance 8 / motion 6 / density 6：返回 Feature-Rich Showcase、Brutalism、黑白+粉色、Inter。方角、无过渡与用户明确的玻璃/光影方向不符；高 variance 使结果偏向粗野主义。保留“功能卡片展示”、粗细层级与中等密度；不采用整套 brutalism。原始见 01。
2. 仅重试一次 `operations dashboard glassmorphism` + motion 6 / density 6：返回 **Real-Time / Operations Landing + Glassmorphism**。深色背景 #0F172A、卡片 #1B2336、正文 #F8FAFC、次要字 #94A3B8、绿色 CTA #22C55E；Fira Code/Fira Sans；10–20px 背景模糊、1px 透光边缘、光源反射、Z-depth；300–450ms stagger。视觉方向采纳，运营营销组织改成实际管理任务。
3. `glassmorphism dark --domain style` 验证玻璃、鲜明背景与层叠对应匹配。
4. `focus not obscured --domain ux` 用于固定工具栏与目录的焦点偏移。
5. React 表单状态、Tailwind 长内容搜索见 05/06；保留服务端版本契约与现有 React 状态逻辑，不为技能建议替换 API 或强行 useActionState。长文不采用截断；卡片摘要才允许截断。

## 采纳与任务适配

- **采纳视觉**：深靛背景、紫青光源、磨砂透明面板、细高光边缘、分层阴影、局部棱镜与轨道视觉。玻璃用于总览/导航/资源卡；长文底板较不透明，防止背景影响阅读。
- **修改色板**：保留 slate 深底；CTA 从状态绿转为薰衣草紫与冰蓝，配合用户明确拒绝旧深绿导航。成功状态仍使用带文字的绿色标签。正文 #f1f4ff、次要字 #b4c0db。所有页面共用语义 token。
- **采纳字体**：自托管 Fira Sans 400/500/600 与 Fira Code 400（@fontsource，锁文件与包内许可证保留）；中文使用系统黑体后备。不运行时请求 Google Fonts。
- **重新组织**：旧左侧导航彻底移除，改顶部工作室导航；角色表格改成带档案识别图形的角色画廊，视觉主区+实际统计；世界书改设定档案架；阅读页改 dossier 标题+编号章节+独立目录；编辑改宽抽屉/步骤与范围侧板；模型页改连接选择器与预设双工作区；会话改执行队列与档案双栏；用户改策略与身份分层；素材改发现区与诊断工作区。
- **不采纳营销动作**：无假 live 遥测、假增长、假模型可用或注册转化按钮。统计只读现有配置；说明按需刷新。
- **动效**：页面进入420ms、棱镜进入900ms、交互180ms；沿建议使用 transform/opacity，不引入永久运动或额外 GSAP 依赖；reduced-motion 立即最终态。数据表不做弹跳。

## 实现规则

完整 Ant Design Pro / React / TS / Umi Max / Tailwind 保留：ProLayout runtime、PageContainer、ProTable（实际表格任务）、ProForm、model/access/request。自主重写布局与表现层，不被模板默认侧栏约束。原来安全 nonce 适配、版本冲突/保存逻辑保持。

正文16px/1.95，最长76ch；数据/提示12–14px。目录焦点支持跳转；375/768/1024/1440与横屏验证；小屏顶部菜单、可展开目录、单列卡片。按钮44px为主要目标，颜色不独自传递状态，输入标签始终可见。

## 验收闭环

每轮实际启动浏览器→跑主流程→查看截图→按 Self Check 七维记缺陷→修复→复验。记录见 `docs/管理端Prism验收-20261013.md`（完成时补齐）。所有测试使用许可社区资源及隔离虚构数据，禁止外部模型/个人凭据。
