# @between/ui

私有 React 组件包。Base UI 提供键盘、焦点、无障碍和浮层交互；本包统一外观、玻璃、高光及动画。业务接口、权限、路由、草稿与保存规则仍由应用持有。

初始包结构与后台迁移见 [共享组件库与验收](../../docs/共享组件库与验收.md)；本批组件扩展、七项自查及当前构建证据见 [共享组件扩展与验收](../../docs/共享组件扩展与验收.md)。本文提供当前使用契约，文档更新、历史截图或某次自动化通过都不能替代最终版本的实际视觉复查。

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
| 表单 | `Field`、`Input`、`Textarea`、`Checkbox`、`RadioGroup`、`Switch`、`NumberField`、`Slider` | 值、校验、错误与保存；滑块不代替需要精确输入的数字框 |
| 选择 | `Select`、`Combobox`、`MultiSelect`、`TagInput` | 值、选项与变更；固定选项多选与自由词组输入分别处理 |
| 内容 | `Tabs`、`Accordion`、`Panel`、`PageHeader` | 当前项与内容；身份稳定，不按输入值重挂载编辑器 |
| 阅读与编辑 | `DocumentReader`、`SplitPane`、`CollectionList`、`LongTextEditor` | 文档/章节身份、选择、正文与草稿；组件不判断业务字段含义 |
| 结构化内容 | `JSONViewer`、`JSONEditor`、`DiffViewer` | 原始文本或可序列化值、复制结果、业务 schema 与保存兼容性；差异不自动合并 |
| 浮层 | `Dialog`、`ConfirmDialog`、`Drawer`、`Menu`、`Popover`、`Tooltip` | 打开意图、确认后果、草稿和异步结果 |
| 反馈 | `Badge`、`Toast`、`Spinner`、`Skeleton`、`ErrorNotice`、`Empty` | 真实状态、恢复动作；通知出现不代表请求成功 |
| 数据 | `Toolbar`、`FilterBar`、`DataTable`、`ColumnVisibilityControl`、`Pagination` | 查询、排序、分页、跨页选择、列布局与接口 |
| 材质 | `Glass`、`AmbientBackground`、`BACKGROUND_PRESETS` | 表面角色、单张背景、静动选择 |
| 作用域 | `UiProvider`、`UiInteractionProvider` | 应用级偏好与敏感交互失效 |

通用复杂交互仍属于组件包；角色、世界书、模型配置等带业务语义的编辑器留在 `apps/admin`。不要让组件自行请求业务服务、读写产品存储或生成业务成功状态。

本批新增 13 个主要组件：4 个文档组件、4 个输入/选择组件、3 个结构化内容组件，以及 `FilterBar` / `ColumnVisibilityControl`。`HighlightText`、文本查找、标签编辑意图、JSON 分析/格式化与表格布局等辅助导出用于复用同一实现，不另维护一套页面专用算法。

### 常用受控接口

- `Button`：`variant="primary" | "secondary" | "ghost" | "danger"`，`loading`、`disabled`，以及原生 button 属性和 `ref`。`IconButton` 另需可访问名称 `label`。
- `Field`：`label`、`description`、`error`、一个输入子组件。自动关联标签、辅助说明和错误；不要通过 placeholder 替代标签。
- `Select` / `Combobox`：`label`、`value`、`options: { value, label, disabled? }[]`、`onChange`。选择与展开样式均由同一组件维护；`label` 提供可访问名称，需要可见表单标签时再用 `Field` 包裹，工作台的 `LabeledSelect` / `LabeledCombobox` 展示这一组合。
- `Dialog` / `Drawer`：`open`、`title`、`onClose`、`children`、`footer?`、`size?`、`closeDisabled?`。`onClose` 只是关闭请求；调用方有草稿时先确认，再回传 `open=false`。
- `Menu`：`trigger` 与 `items: { id, label, onSelect, disabled?, danger?, icon? }[]`。不要把触发器另套一个旧菜单，也不要在菜单退出后强行把焦点抢离新弹窗。
- `DataTable`：`rows`、`columns: { key, header, render, sortable?, wrap?, width?, minWidth?, maxWidth?, resizable?, required?, sticky? }[]`、`getRowKey`；可选 `selectedKeys/onSelectionChange`、`sort/onSort`、`loading/error/onRetry`。`width` 为 CSS px；`sticky` 为 `start` / `end`。受控列宽使用 `columnWidths/onColumnWidthsChange`；省略宽度回调只展示指定宽度，不出现可拖动的假手柄。列显隐由 `columnVisibility` 控制，`required` / 固定列不可隐藏，至少保留一列。`stickyHeader/maxHeight` 支持表内滚动；键盘可调整列宽。短标签默认不折行，通过表格横向滚动保持可读；长标题列显式设置 `wrap: true`。表头选择只修改当前页，保留调用方的页外键。
- `ColumnVisibilityControl`：`columns`、`value: Record<string, boolean>`、`onChange`、`label?`、`disabled?`。与同一表格共享列定义和显隐状态，不自行保存用户偏好。
- `FilterBar`：表单 `children`，以及 `activeFilters: { key, label, onRemove? }[]`、`onClear?`、`actions?`、`resultCount?`。删除筛选 chip 只发出回调；查询、分页重置、跨页选择是否保留和 API 请求均由应用处理。
- `Pagination`：`page`、`total`、`pageSize`、`onPageChange`、`onPageSizeChange?`、`pageSizes?`。省略条数回调时为固定每页条数，不显示条数切换；查询变化和选择策略由应用明确处理。
- `UiProvider`：严格 CSP 宿主可通过 `nonce` 将服务端已生成的 nonce 传给 Base UI 的内联样式/脚本；工作台无此策略时可以省略，不因此放宽宿主 CSP。`reducedMotion` 为 `true` 时进一步减少动态；省略或 `false` 均跟随系统。该 API 不提供绕过系统减少动态的强制开关。

### 文档工作区

- `DocumentReader` 接收 `sections: { id, title, content, description?, meta?, actions?, footer?, searchText? }[]`，支持受控 `query/onQueryChange`、`activeSectionId/onActiveSectionChange` 及目录开关。字符串以纯文本呈现和查找，不解释 HTML。自定义 React 正文通过 `searchText` 提供定位线索；查找不能被误写为业务触发命中。
- `SplitPane` 接收 `sidebar/children`，可控 `sidebarWidth/onSidebarWidthChange` 与 `collapsed/onCollapsedChange`，提供最小/最大侧栏宽度、正文最小宽度和窄屏列表开关。拖拽或键盘调整只改变布局，不重新挂载正文，不把用户输入作为组件 `key`。
- `CollectionList` 接收 `items: { id, title, description?, meta?, icon?, disabled? }[]`、`selectedId/onSelect`，可插入 header/footer/empty。目录选择发出意图；切换前的草稿确认与权限由业务页面负责。
- `LongTextEditor` 接收 `label/value/onChange(string)`、`query/onQueryChange?`、`expanded/onExpandedChange?`，以及原生 textarea 的 `ref`、`name`、`required`、`maxLength` 等属性。查找、计数和展开保持同一 textarea，保留原始换行与纯文本；它不自动保存、不转富文本、不替换角色模板字符。自身含可见标签与说明，不再机械地套第二个同名 `Field`。

### 多选、词组与精确数值

- `MultiSelect` 使用 `value: readonly string[]`、`options: { value, label, disabled? }[]`、`onChange(string[])`。已选项以 chip 展示，可搜索并连续多选；不存在于最新选项列表的已选 ID 仍保留，不静默删除。支持 `required/readOnly/disabled/name`、可访问提示及指向输入框的 `ref`，可与 `Field` 组合。
- `TagInput` 使用 `value: readonly string[]` / `onChange(string[])` 表达完整词组。默认 Enter 添加；`separator` 指定提交按键，`trim` 仅控制首尾空白，`allowDuplicates` 明确重复策略。空格、逗号等不会被擅自当成业务分隔符，粘贴不会隐式拆词。Enter 添加/更新、Esc 取消编辑、空输入 Backspace 聚焦上一项、词组编辑按钮上的 Delete/Backspace 删除。`commitOnBlur` 默认开启，焦点离开整个控件时提交合法待输入内容；不会抢回焦点或在 IME 组合中提交。
- `TagInput.onDraftChange` 同步报告尚未提交的自由文本。调用方必须把它计入 dirty/离开保护，并在切换文档、字段或条目前阻止尚未通过校验的词组被卸载；不能只追踪已提交 `value`。重复等无效输入保留在控件内并显示错误，不能靠卸载“清除错误”。业务请求期间禁用相关输入及切换，失败保留草稿。
- `NumberField` 使用 `value: number | null` / `onChange(value, details)`，支持 `min/max/step`、`required/readOnly/disabled/name`、`onValueCommitted`、`inputProps`；`ref` 指向可见输入框，`rootRef` 指向包装层。Base UI 管理未完成的负号、小数与原始编辑字符串；空值保持 `null`，不能默认改成 0。`allowWheelScrub` 默认关闭；`allowOutOfRange` 由宿主按业务校验决定，禁止用即时强制格式化打断输入。
- `Slider` 当前为单值水平滑块，使用 `value/onChange`、`min/max/step`、`formatValue`、`onValueCommitted`；不宣称支持范围双滑块。默认显示当前精确值；需要精确录入时与 `NumberField` 共享同一受控值。`ref` 指向原生 range 输入，`rootRef` 指向包装层。不要用滑块拖动来代替高精度或大跨度数值录入。

### JSON 与差异

- `JSONEditor` 使用受控原文 `value: string` / `onChange(string)`，支持语法错误行列定位、重复键提示、格式化、复制、`readOnly/disabled` 和 `onValidationChange`。格式化只增删非字符串内的空白，不通过 `JSON.parse → stringify` 重写数字字面量、转义或负零；重复键先处理，不以格式化悄悄吞掉。
- `JSONViewer` 的来源二选一：`text: string` 用于保留原始 JSON，或 `value: JSONValue` 用于已有 JS 值的展示序列化。后者不是无损原文契约；不能让 `undefined`、非有限数或不支持的值静默消失。两者均仅以文本/树呈现，不执行 HTML 或外部代码。
- `DiffViewer` 接收 `before/after` 两份原文及可选标题、`contextLines/maxHeight`。差异是逐行文本对照，不是业务合并器；保留换行差异，极长内容的降级与边界见实际实现。应用决定比较哪个版本、是否接受修改，以及 409 后如何继续。
- 复制的 `onCopy` 以 Promise 成功或失败反馈，拒绝时提供恢复提示；不能先显示成功再忽略剪贴板失败。语法合法、格式化无损与业务可保存是三件事：宿主如使用 JS 数值/对象契约，仍须拦截超安全整数、非有限数、重复键、schema 不符等不能无损写回的内容。

## 材质与动效

| 用途 | 默认参数 |
| --- | --- |
| 导航与轻量玻璃 | 磨砂 2px、最大单轴折射 14px、边缘 20px、`#667585` 染色 24% |
| 弹窗与抽屉 | 磨砂 2px、折射 17px、边缘 22px、`#0A121A` 染色 40%、内容衬底 61%、外遮罩 30% |

玻璃的光学层、内容衬底、前景文字和外遮罩各有职责。不要给整个玻璃宿主或带后代玻璃的祖先降低透明度，也不要对正文做缩放、位移滤镜或模糊。长文输入、筛选词和保存版本不能作为内容入场的重新挂载键。

沿用本包的浮层生命周期，避免业务关闭时先清空正文而播放空框退出。嵌套关闭只影响顶层；中途重开取消旧退出；权限失效及时停用。每项交互只有一个管理者，迁移完成后删除被替代的旧焦点/滚动锁/Esc 控制器。

## 工作台场景

工作台直接引用正式组件、同一份字体与材质。桌面左侧切换 11 组，700px 及以下通过品牌区右侧的分类菜单切换，避免横向导航隐藏入口。顶栏“预览环境”调整背景、跟随系统/进一步减少动态、布局密度和长中文。顶部测试状态针对适用的单组件示例；阅读、JSON 和高级表格使用各自明确的内容与状态入口，不能把一个全局开关当成全部状态都已覆盖。

| 分组 | 实际可操作内容 |
| --- | --- |
| 基础操作 | 按钮层级、忙碌、通知、危险确认、图标提示和两种玻璃表面 |
| 表单输入 | 受控文本、校验提示、复选、部分选择、开关与单选 |
| 选择与切换 | 深色 Select、可搜索长列表 Combobox、键盘标签与展开组 |
| 弹窗与菜单 | 长表单 Dialog、Drawer、危险确认、菜单打开编辑器、Popover 内开弹窗 |
| 状态与反馈 | 成功/失败通知、错误恢复、加载指示、骨架与搜索无结果 |
| 数据与筛选 | 23 条内存任务、关键词/状态筛选、排序、跨页选择、分页、批量归档 |
| 多选与参数 | 连续多选、不可用已选值、空选项、词组新增/编辑、可空数字、滑块与精确值、保存失败保留 |
| 阅读与编辑 | 全文搜索/目录、长中文与多章节、可调分栏、窄屏集合选择、稳定 textarea 查找与展开 |
| JSON 与差异 | 原始 JSON、错误定位、重复键、无损格式化、复制失败及多版本文本差异 |
| 高级表格 | 指针/键盘列宽、列显隐、固定列/表头、表内滚动、复合筛选 chips 与清空 |
| 组合场景 | 长表单内 Combobox、草稿失败重试、未保存确认、玻璃后的长文与动态背景 |

所有样例数据、故障开关、延迟和预览偏好只存在页面内存。刷新恢复初始状态，不请求业务服务、不写用户存储。模拟延迟是为检查忙碌状态设置的工作台工具，不可复制进业务请求路径。原生 IME、真实权限/409 与后端保存仍要在实际后台验收。

## 已修正的反例与回归要求

| 触发条件 / 错误做法 | 后果 | 必须保留的修正与检查 |
| --- | --- | --- |
| 用 `<hr>` 作可拖动分隔条，未抵消 Tailwind preflight 的 `height: 0` | DOM 有 separator，指针命中区域却为零，无法调整列宽 | 明确可命中的非零宽高；实际拖动和键盘都要检查，不能仅断言属性存在 |
| 只在 passive effect 中上报 TagInput draft | blur 提交与随后保存/切换的同一事件周期里，业务 guard 读到旧 pending 状态 | draft 改变与合法提交同步通知调用方；实际检查“未按 Enter 直接保存” |
| blur 提交后无条件调用输入框 `focus()` | Tab 和点击其他字段会被抢回，编辑流程无法正常离开 | blur 使用不回焦的提交分支；Enter/添加按钮才按需继续聚焦输入 |
| 将 A 编辑成重复 B，blur 拒绝后仍切换字段/条目并卸载组件 | 内部非法 draft 被清空，用户输入丢失 | 无效 draft 留在控件；应用 pending ref guard 阻止切换或保存，提供改正/取消路径 |
| 角色保存请求期间仍允许编辑表单或切字段 | 新输入不属于发出的快照，响应后可能被清空并误认为已保存 | 请求期间禁用相关输入与切换，失败仍保留原草稿，不能只禁保存按钮 |
| 看到 JSON 格式化保留原文就允许业务直接 `JSON.parse` 保存 | 大整数被舍入、指数溢出为非有限数，重复键被吞，原文无损却业务失真 | 分开格式化与业务安全校验；宿主拒绝不能无损表达的值，保留原文和明确错误 |
| 长文查找只调用原生 `setSelectionRange`，把选区变化当成滚动成功 | 命中位置可能仍在 textarea 可见区域之外，祖先也可能遮住编辑器 | 按当前字体、宽度和换行规则同步测量排版镜像，显式调整输入框内部滚动并保证祖先中的可见位置；临时镜像测完立即移除，保留原 textarea DOM、输入和选区，实际查找远处命中 |
| 桌面应用根容器使用 `overflow: hidden`，以为它永远不会滚动 | `focus()` / `scrollIntoView()` 可隐式改变根滚动位置，侧栏和顶栏移位，底部出现黑区 | 桌面根使用 `overflow: clip`，由 main / reader 等内部区域承担滚动；反复切换、查找和回焦后检查壳的位置，不能靠截图专用 CSS 遮掩 |
| 列宽手柄伸入相邻固定表头的命中区域 | 鼠标点到的是相邻 sticky `th`，拖拽无效或调整错误列；键盘测试仍可能通过 | 手柄限制在所属列的可命中范围；用真实鼠标按已知距离拖动并核对精确列宽增量，同时检查固定列、横向滚动和边界，不能只测 DOM / 键盘 |

这些规则来自具体修正，仍须在后续改动的当前构建中复验；文档存在不是本次视觉验收的证据。

## 验收与交付边界

1. 类型/测试/构建只是基础证据；实际启动后以正常速度操作，并目视截图与录屏。
2. 覆盖桌面与窄屏、长中文、加载/空/失败/禁用、键盘导航、减少动态及真实玻璃后的阅读。正常动画验收使用 `prefers-reduced-motion: no-preference` 环境；再单独检查系统 `reduce` 与工作台“进一步减少动态”，不能用本地覆盖声称已忽略系统偏好。
3. 操作 Dialog/Menu/Popover 的进入、退出、连续开关和中途重开；检查嵌套 Escape、回焦、滚动锁释放、草稿与保存失败恢复。
4. 工作台通过之后仍要回到真实后台，检查长文编辑、路由、权限、接口保存和 409；不能把模拟保存当作真实成功。
5. 发布后台时不包含 `playground/`、工作台构造数据或故障开关；保持此处测试集供后续回归。清理本次临时测试接线和自有数据，保护原有用户记录与草稿。

使用 `glass-workbench-ui` 与 `ui-ux-self-check` 的当前规范记录问题及修正。截图生成、DOM 断言或录屏文件存在均不等于已经完成视觉验收。
