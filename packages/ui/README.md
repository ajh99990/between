# @between/ui

私有 React 组件包。Base UI 提供键盘、焦点、无障碍和浮层交互；本包统一外观、玻璃、高光及动画。业务接口、权限、路由、草稿与保存规则仍由应用持有。

本轮包结构、后台迁移、七项自查、修正记录与实际证据见 [共享组件库与验收](../../docs/共享组件库与验收.md)；本文提供当前使用契约，历史验收不能替代改动后的复查。

## 开发与使用

在仓库根目录使用 Node 24 / npm 11：

```sh
npm ci
npm run dev -w @between/ui
npm run typecheck -w @between/ui
npm run lint -w @between/ui
npm run test -w @between/ui
npm run build:playground -w @between/ui
# 根快捷入口：开发、独立构建与 UI 浏览器回归
npm run dev:ui
npm run build:ui-playground
npm run preview:ui
npm run test:ui:browser
```

开发服务仅监听 `127.0.0.1`；使用终端输出的实际端口。`playground/` 是独立 Vite 入口，构建到 `dist-playground/`，不进入后台生产构建。不要将整个工作台目录复制到业务页面或业务静态资源目录。

应用只需一次样式入口与 Provider。所有浮层继承本包主题，React 由使用方共享：

```tsx
import { Button, Dialog, Field, Input, UiProvider } from "@between/ui";
import "@between/ui/styles.css";

function App() {
  return (
    <UiProvider>
      <div className="glass-workbench">
        {/* 路由与业务页面 */}
      </div>
    </UiProvider>
  );
}
```

组件直接从 TypeScript 源码导出，由应用 Vite 编译，不需要另行发布或预构建 JS。运行资源清单在 `design-assets.json`，`scripts/verify-assets.mjs` 校验实际字节 SHA-256、完整目录和本地引用闭包；后台 setup 指向此清单并拒绝第二份设计目录。来源与公共字体许可见 [运行资源说明](src/materials/runtime/ASSET-SOURCES.md)。React / React DOM 是 peer dependency，不要在子包另装第二份运行时。

## 组件范围

| 类别 | 导出 | 调用方职责 |
| --- | --- | --- |
| 操作 | `Button`、`IconButton`、`Icon` | 操作意图、忙碌、禁用；图标按钮提供 `label` |
| 表单 | `Field`、`Input`、`Textarea`、`Checkbox`、`RadioGroup`、`Switch` | 值、校验、错误与保存 |
| 选择 | `Select`、`Combobox` | `value`、`options`、`onChange`；不能复套旧下拉控制器 |
| 内容 | `Tabs`、`Accordion`、`Panel`、`PageHeader` | 当前项与内容；身份稳定，不按输入值重挂载编辑器 |
| 浮层 | `Dialog`、`ConfirmDialog`、`Drawer`、`Menu`、`Popover`、`Tooltip` | 打开意图、确认后果、草稿和异步结果 |
| 反馈 | `Badge`、`Toast`、`Spinner`、`Skeleton`、`ErrorNotice`、`Empty` | 真实状态、恢复动作；通知出现不代表请求成功 |
| 数据 | `Toolbar`、`DataTable`、`Pagination` | 查询、排序、分页、跨页选择与接口 |
| 材质 | `Glass`、`AmbientBackground`、`BACKGROUND_PRESETS` | 表面角色、单张背景、静动选择 |
| 作用域 | `UiProvider`、`UiInteractionProvider` | 应用级偏好与敏感交互失效 |

通用复杂交互仍属于组件包；角色、世界书、模型配置等带业务语义的编辑器留在 `apps/admin`。不要让组件自行请求业务服务、读写产品存储或生成业务成功状态。

### 常用受控接口

- `Button`：`variant="primary" | "secondary" | "ghost" | "danger"`，`loading`、`disabled`，以及原生 button 属性和 `ref`。`IconButton` 另需可访问名称 `label`。
- `Field`：`label`、`description`、`error`、一个输入子组件。自动关联标签、辅助说明和错误；不要通过 placeholder 替代标签。
- `Select` / `Combobox`：`label`、`value`、`options: { value, label, disabled? }[]`、`onChange`。选择与展开样式均由同一组件维护；`label` 提供可访问名称，需要可见表单标签时再用 `Field` 包裹，工作台的 `LabeledSelect` / `LabeledCombobox` 展示这一组合。
- `Dialog` / `Drawer`：`open`、`title`、`onClose`、`children`、`footer?`、`size?`、`closeDisabled?`。`onClose` 只是关闭请求；调用方有草稿时先确认，再回传 `open=false`。
- `Menu`：`trigger` 与 `items: { id, label, onSelect, disabled?, danger?, icon? }[]`。不要把触发器另套一个旧菜单，也不要在菜单退出后强行把焦点抢离新弹窗。
- `DataTable`：`rows`、`columns: { key, header, render, sortable?, wrap? }[]`、`getRowKey`；可选 `selectedKeys/onSelectionChange`、`sort/onSort`、`loading/error/onRetry`。短标签默认不折行，通过表格横向滚动保持可读；长标题列显式设置 `wrap: true`。表头选择只修改当前页，保留调用方的页外键。
- `Pagination`：`page`、`total`、`pageSize`、`onPageChange`、`onPageSizeChange?`、`pageSizes?`。省略条数回调时为固定每页条数，不显示条数切换；查询变化和选择策略由应用明确处理。
- `UiProvider`：严格 CSP 宿主可通过 `nonce` 将服务端已生成的 nonce 传给 Base UI 的内联样式/脚本；工作台无此策略时可以省略，不因此放宽宿主 CSP。`reducedMotion` 为 `true` 时进一步减少动态；省略或 `false` 均跟随系统。该 API 不提供绕过系统减少动态的强制开关。

## 材质与动效

| 用途 | 默认参数 |
| --- | --- |
| 导航与轻量玻璃 | 磨砂 2px、最大单轴折射 14px、边缘 20px、`#667585` 染色 24% |
| 弹窗与抽屉 | 磨砂 2px、折射 17px、边缘 22px、`#0A121A` 染色 40%、内容衬底 61%、外遮罩 30% |

玻璃的光学层、内容衬底、前景文字和外遮罩各有职责。不要给整个玻璃宿主或带后代玻璃的祖先降低透明度，也不要对正文做缩放、位移滤镜或模糊。长文输入、筛选词和保存版本不能作为内容入场的重新挂载键。

沿用本包的浮层生命周期，避免业务关闭时先清空正文而播放空框退出。嵌套关闭只影响顶层；中途重开取消旧退出；权限失效及时停用。每项交互只有一个管理者，迁移完成后删除被替代的旧焦点/滚动锁/Esc 控制器。

## 工作台场景

工作台直接引用正式组件、同一份字体与材质。桌面左侧切换七组，700px 及以下通过品牌区右侧的分类菜单切换，避免横向导航隐藏入口。顶栏“预览环境”调整背景、跟随系统/进一步减少动态、布局密度和长中文。顶部测试状态针对单组件示例；数据场景使用列表状态与刷新故障开关，组合场景使用保存失败、背景和阅读选项。

| 分组 | 实际可操作内容 |
| --- | --- |
| 基础操作 | 按钮层级、忙碌、通知、危险确认、图标提示和两种玻璃表面 |
| 表单输入 | 受控文本、校验提示、复选、部分选择、开关与单选 |
| 选择与切换 | 深色 Select、可搜索长列表 Combobox、键盘标签与展开组 |
| 弹窗与菜单 | 长表单 Dialog、Drawer、危险确认、菜单打开编辑器、Popover 内开弹窗 |
| 状态与反馈 | 成功/失败通知、错误恢复、加载指示、骨架与搜索无结果 |
| 数据与筛选 | 23 条内存任务、关键词/状态筛选、排序、跨页选择、分页、批量归档 |
| 组合场景 | 长表单内 Combobox、草稿失败重试、未保存确认、玻璃后的长文与动态背景 |

所有样例数据、故障开关、延迟和预览偏好只存在页面内存。刷新恢复初始状态，不请求业务服务、不写用户存储。模拟延迟是为检查忙碌状态设置的工作台工具，不可复制进业务请求路径。原生 IME、真实权限/409 与后端保存仍要在实际后台验收。

## 验收与交付边界

1. 类型/测试/构建只是基础证据；实际启动后以正常速度操作，并目视截图与录屏。
2. 覆盖桌面与窄屏、长中文、加载/空/失败/禁用、键盘导航、减少动态及真实玻璃后的阅读。正常动画验收使用 `prefers-reduced-motion: no-preference` 环境；再单独检查系统 `reduce` 与工作台“进一步减少动态”，不能用本地覆盖声称已忽略系统偏好。
3. 操作 Dialog/Menu/Popover 的进入、退出、连续开关和中途重开；检查嵌套 Escape、回焦、滚动锁释放、草稿与保存失败恢复。
4. 工作台通过之后仍要回到真实后台，检查长文编辑、路由、权限、接口保存和 409；不能把模拟保存当作真实成功。
5. 发布后台时不包含 `playground/`、工作台构造数据或故障开关；保持此处测试集供后续回归。清理本次临时测试接线和自有数据，保护原有用户记录与草稿。

使用 `glass-workbench-ui` 与 `ui-ux-self-check` 的当前规范记录问题及修正。截图生成、DOM 断言或录屏文件存在均不等于已经完成视觉验收。
