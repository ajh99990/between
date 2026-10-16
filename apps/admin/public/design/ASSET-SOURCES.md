# 素材与实现说明

本目录提供独立于业务仓库的通用实现。复制目录即可使用，不需要访问外部产品的代码、路径、服务或品牌资源。

- `workbench.css`、`typography.css`、`sidebar.css`、`highlights.css`：围绕本包视觉规范重新编排的通用 CSS 基元，覆盖深色表面、文字层级、半透明悬停与银色镜面控件。
- `highlights.js`：本包的指针反光事件适配器，含减少动态效果设置和卸载清理。
- `glass.css`、`glass.js`、`zoned-glass.js`：本包浏览器实验的独立实现。SVG 位移与空间分区的原理参考下列公开资料，未复制其着色器或组件代码：
  - [Liquid Glass Effect](https://github.com/childrentime/liquid-glass/blob/main/LIQUID_GLASS_EFFECT_CN.md)
  - [Liquid Glass Studio](https://github.com/iyinchao/liquid-glass-studio)
- `mascot/mountMascot.js`：全新 Canvas 2D 三点光球插画。仅使用圆形、径向渐变和浮动动效，不包含品牌形象或外部插画；`mountMascot.d.ts` 提供类型声明。
- `beam/`：本包的 React 装饰性彩色边缘组件及 CSS，使用渐变、遮罩与旋转属性。
- `components/`：通用原生 ES module 展示组件与独立演示，统一 `element/update/destroy` 接口；只读取 props、发出用户意图，业务状态、请求、持久化与路由由调用方管理。
- `example/`：从本包规范独立装配的完整首页、聊天和九类设置示例；包含中性假数据和明确标注的本地交互，不连接业务服务。
- `flow.png`：程序生成的通用低对比蓝灰渐变，1024×640 RGB，文件不包含文本元数据。

- `admin/`：在本包视觉基元上新建的通用后台受控组件和完整列表编辑示例；只呈现props与用户意图，示例controller管理虚构数据，不连接业务服务。

## 公共字体

`Geist-Variable.woff2` 与 `GeistMono-Variable.woff2` 为 Vercel 的 Geist / Geist Mono 公共字体，采用 SIL Open Font License 1.1。随包保留官方完整许可文本，不打包系统字体。

- [Geist 官方仓库](https://github.com/vercel/geist-font)
- `licenses/Geist-OFL.txt`：[官方 OFL 文本](https://github.com/vercel/geist-font/blob/main/OFL.txt)
- `licenses/Geist-LICENSE.txt`：[官方 LICENSE 文本](https://github.com/vercel/geist-font/blob/main/LICENSE.txt)

## 导航与轻量控件推荐配方

分区融合：磨砂 `2px`，最大单轴折射 `14px`，边缘宽度 `20px`。染色为烟灰蓝 `#667585`，底色不透明度 `24%`。染色与光学滤镜分别设置。

- `admin/glass-lab*`：独立的后台弹窗调参页，预览复用同包实际表单与列表。`admin/vendor/` 保留 jbbixler/liquid-glass 公开模块及完整 MIT 许可，仅用于社区算法对照。

- `material-presets.js`：按角色拆分的只读弹窗推荐配置，供后台浮层、设置编辑层及调参页复用；普通玻璃、导航与按钮的原参数保持。

弹窗与抽屉另采用 `material-presets.js` 中的 `DIALOG_PRESET`：2 / 17 / 22、#0A121A染色40%、内容衬底61%、外遮罩30%。

- `components/select*`：本包新增的深色单选与原生表单桥接；支持受控值、键盘、视口定位、必填与重置，演示覆盖程序赋值、延迟回传与销毁恢复。展开菜单复用深色94%背景、22px模糊阅读配方；不改导航/按钮或弹窗参数。

- `background/`：独立编写的Canvas 2D程序色场，包含三种低频柔光、一种基础波面及四种原创形态、受控运行适配器和可操作演示。无外部图片、着色器或产品代码依赖；`references/background-prompt.md`为当前背景制作提示词；历史盲测输入另行冻结保留。帧率节流在包内组件中约24次/秒，提示词盲测输出另行记录，不宣称所有生成结果都已优化性能。

- `background/creative-a.js`：本包独立设计的折叠虹纱与偏轴轨道，使用Canvas路径和渐变。`creative-b.js`：本包独立设计的水下焦散与层叠纸境，使用程序色场、Bezier轮廓及局部光影。没有图片、外部库或产品图形依赖。`background/studio.*`为八风格选择、真实1×动态及玻璃前景比较入口。

- `qa/`：本包独立编写的通用测试入口、可撤销故障练习及只读探针。复用本包现有背景、单选、表单与弹窗组件；探针只导出白名单样式/状态，背景截图与最终页面截图有明确边界。
- `../scripts/inspect-project.mjs`、`audit-distribution.py`、`compare-images.py`、`encode-recording.py`、`record-cdp.mjs`：从本包验证工作中重新整理的通用本地工具，不含原始会话、私有排除词、本机目录或业务启动脚本。静态工具只检查不执行目标代码；图片工具需要 Pillow，编码需要 FFmpeg/FFprobe；录帧适配器需要调用方已有、受支持的浏览器 CDP 能力，不打包浏览器或插件。

## 本项目的局部动效适配

`surface-motion.js` 与 Dialog/Select 生命周期适配由本项目实现。它们只管理显隐、中断、减少动态、焦点与退出阶段；稳定态玻璃配方和字体参数保持。菜单淡出自身面板，弹窗独立绘制层与边框/阴影颜色同步退出，祖先不透明度不参与动画。说明与像素验收见项目 `docs/后台过渡动画与视觉验收.md`。
