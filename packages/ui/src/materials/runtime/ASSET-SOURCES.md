# 共享设计运行资源

本目录是应用和组件工作台唯一的材质、字体与程序背景来源。资源从通用 `glass-workbench-ui` 包提取，只保留实际运行依赖，不包含演示页面、测试数据、调参入口或另一套交互组件。

- `workbench.css` 及其 `typography.css`、`sidebar.css`、`highlights.css`、`glass.css`：深色表面、字体层级、透明悬停、高光和玻璃配方。CSS 的相对依赖、两份字体和 `flow.png` 一起保留。
- 后台控件、表格、菜单与浮层的几何和交互样式由 `src/components/*.css` 唯一维护；不保留旧原生组件的重复样式。
- `zoned-glass.js`：独立的分区磨砂与 SVG 折射实现。原理参考 [Liquid Glass Effect](https://github.com/childrentime/liquid-glass/blob/main/LIQUID_GLASS_EFFECT_CN.md) 与 [Liquid Glass Studio](https://github.com/iyinchao/liquid-glass-studio)，未复制其着色器或组件代码。
- `material-presets.js`：只读弹窗材质配置。导航及轻量材质保持 2 / 14 / 20、`#667585` 染色 24%；弹窗与抽屉保持 2 / 17 / 22、`#0A121A` 染色 40%、内容衬底 61%、外遮罩 30%。
- `background/`：独立编写的 Canvas 2D 程序色场及八种预设。通过共享 React 适配器控制运行、强度和销毁；不依赖外部图片、着色器或产品图形。
- `flow.png`：程序生成的 1024×640 低对比蓝灰渐变，作为 CSS 静态背景资源。
- `*.d.ts`：本项目为运行模块补充的 TypeScript 接口声明。

原生 DOM 组件、旧 `surface-motion.js`、未挂载的指针事件适配器及社区算法对照模块不在当前运行依赖中。交互由 Base UI 与共享 React 组件管理；浮层生命周期由 `src/motion/overlay-motion.ts` 管理。高光 CSS 与原有稳定材质保持；当前普通控件不使用 `.gw-lens-button`，不声称提供未接入的指针跟随透镜效果。

## 公共字体与归因

`Geist-Variable.woff2` 和 `GeistMono-Variable.woff2` 来自 [Vercel Geist](https://github.com/vercel/geist-font)，采用 SIL Open Font License 1.1。完整官方许可位于 `licenses/Geist-OFL.txt` 与 `licenses/Geist-LICENSE.txt`，不打包系统字体。

通用材质和程序背景按原来源说明复用；没有为这些代码额外指定第三方许可。已移除的社区算法对照模块没有被迁入或替换为未归因代码，其 MIT 正文也不再作为当前使用依赖列出。

包根 `design-assets.json` 记录当前字节 SHA-256、可追溯的原资源 SHA-256 和本地声明身份。`scripts/verify-assets.mjs` 检查完整目录、文件字节及本地引用闭包；它不代替浏览器操作或视觉验收。
