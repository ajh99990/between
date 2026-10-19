import {
  Accordion,
  AmbientBackground,
  BACKGROUND_PRESETS,
  Badge,
  Button,
  Checkbox,
  Combobox,
  ConfirmDialog,
  DataTable,
  Dialog,
  Drawer,
  Empty,
  ErrorNotice,
  Field,
  Glass,
  Icon,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Pagination,
  Panel,
  Popover,
  RadioGroup,
  Select,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  Toast,
  Toolbar,
  Tooltip,
  UiProvider,
} from "@between/ui";
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from "react";
import { AdvancedControlsDemo } from "./advanced-controls-demo";
import { DataTableExtendedDemo } from "./data-table-extended-demo";
import { DocumentsDemo } from "./documents-demo";
import { StructuredDataDemo } from "./structured-data-demo";

type Group =
  | "basics"
  | "forms"
  | "selection"
  | "overlays"
  | "feedback"
  | "data"
  | "scenarios"
  | "advanced-controls"
  | "documents"
  | "structured-data"
  | "data-extended";
type TestState = "normal" | "disabled" | "loading" | "error";
type Feedback = { message: string; tone: "success" | "error" | "neutral" } | null;
type Task = { id: string; title: string; owner: string; status: string; priority: string; due: string };

const groups: {
  id: Group;
  label: string;
  icon: "appearance" | "edit" | "check" | "menu" | "alert" | "sessions" | "roles";
  description: string;
}[] = [
  { id: "basics", label: "基础操作", icon: "appearance", description: "按钮、图标、标签与表面层级" },
  { id: "forms", label: "表单输入", icon: "edit", description: "输入、校验与表单选项" },
  { id: "selection", label: "选择与切换", icon: "check", description: "搜索选择、标签与展开" },
  { id: "overlays", label: "弹窗与菜单", icon: "menu", description: "浮层开合、嵌套与焦点" },
  { id: "feedback", label: "状态与反馈", icon: "alert", description: "等待、失败、恢复与结果" },
  { id: "data", label: "数据与筛选", icon: "sessions", description: "排序、跨页选择与分页" },
  {
    id: "advanced-controls",
    label: "多选与参数",
    icon: "check",
    description: "多选、完整词组与精确数字输入",
  },
  { id: "documents", label: "阅读与编辑", icon: "edit", description: "全文查找、可调分栏与稳定的长文编辑" },
  { id: "structured-data", label: "JSON 与差异", icon: "sessions", description: "原文、语法定位与版本差异" },
  { id: "data-extended", label: "高级表格", icon: "sessions", description: "列宽、显隐、固定操作与复合筛选" },
  { id: "scenarios", label: "组合场景", icon: "roles", description: "长表单、编辑与玻璃阅读" },
];
const stateOptions = [
  { value: "normal", label: "正常" },
  { value: "disabled", label: "禁用" },
  { value: "loading", label: "加载" },
  { value: "error", label: "错误" },
];
const ownerOptions = [
  { value: "lin", label: "林知夏 · 内容维护" },
  { value: "zhou", label: "周序 · 产品协作" },
  { value: "chen", label: "陈予安 · 长文本审核与发布协调" },
  { value: "pending", label: "暂不可分配的成员", disabled: true },
  ...Array.from({ length: 24 }, (_, index) => ({
    value: `member-${index + 1}`,
    label: `协作成员 ${String(index + 1).padStart(2, "0")} · 专题资料整理`,
  })),
];
const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "todo", label: "待开始" },
  { value: "active", label: "进行中" },
  { value: "review", label: "待审核" },
  { value: "done", label: "已完成" },
];
const statusNames: Record<string, string> = {
  todo: "待开始",
  active: "进行中",
  review: "待审核",
  done: "已完成",
};
const statusTones: Record<string, string> = {
  todo: "neutral",
  active: "info",
  review: "warning",
  done: "success",
};
const initialTasks: Task[] = Array.from({ length: 23 }, (_, index) => ({
  id: `TASK-${String(index + 1).padStart(3, "0")}`,
  title:
    [
      "整理阶段交付清单",
      "核对访谈记录与后续依赖",
      "完善跨团队内容审核流程",
      "汇总本周待办与长期参考资料",
      "制作交付前的检查表",
      "归档已确认的项目说明",
    ][index % 6] + (index > 5 ? `（第 ${Math.floor(index / 6) + 1} 组）` : ""),
  owner: ["林知夏", "周序", "陈予安"][index % 3],
  status: ["todo", "active", "review", "done"][index % 4],
  priority: index % 3 === 0 ? "高" : "普通",
  due: `2026-10-${String(19 + (index % 12)).padStart(2, "0")}`,
}));
const reading = `傍晚的资料室里，窗外的光线慢慢收拢。桌上的交接记录按时间排好，每一处修订都保留了必要的上下文。读者可以先理解背景，再沿着目录寻找具体决定。\n\n一份清楚的说明不需要把所有内容同时推到眼前。标题帮助定位，正文承载细节，辅助文字只在需要时解释限制。长段落应有稳定的行距与行宽，不能让背后的光影压过正在阅读的内容。\n\n切换条目时保留可预期的位置，编辑时让光标、选区与草稿保持稳定。可恢复的错误应给出下一步，而不是清空已经完成的输入。`;

function LabeledSelect(props: ComponentProps<typeof Select>) {
  return (
    <Field label={props.label}>
      <Select {...props} />
    </Field>
  );
}

function LabeledCombobox(props: ComponentProps<typeof Combobox>) {
  return (
    <Field label={props.label}>
      <Combobox {...props} />
    </Field>
  );
}

function Example({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={`pg-example ${className}`}>
      <header className="pg-example-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </Panel>
  );
}

export function Playground() {
  const [group, setGroup] = useState<Group>("basics");
  const [testState, setTestState] = useState<TestState>("normal");
  const [preset, setPreset] = useState(BACKGROUND_PRESETS[0]?.id || "aurora");
  const [motion, setMotion] = useState(false);
  const [reduced, setReduced] = useState("system");
  const [dense, setDense] = useState(false);
  const [longContent, setLongContent] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [failNextSave, setFailNextSave] = useState(false);
  const [saved, setSaved] = useState({
    title: "整理阶段交付清单",
    owner: "lin",
    status: "todo",
    notes: reading,
  });
  const [draft, setDraft] = useState(saved);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nestedOpen, setNestedOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [text, setText] = useState("周五前核对完整的项目资料");
  const [checked, setChecked] = useState(true);
  const [partial, setPartial] = useState<boolean | "indeterminate">("indeterminate");
  const [confirmation, setConfirmation] = useState<"archive" | "clear">("clear");
  const [switchOn, setSwitchOn] = useState(true);
  const [radio, setRadio] = useState("team");
  const [owner, setOwner] = useState("lin");
  const [tab, setTab] = useState("overview");
  const [expanded, setExpanded] = useState<string[]>(["scope"]);
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [dataState, setDataState] = useState("normal");
  const [refreshing, setRefreshing] = useState(false);
  const [retryFail, setRetryFail] = useState(false);
  const main = useRef<HTMLElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    timers.current.push(timer);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [group]);
  const current = groups.find((item) => item.id === group) || groups[0];
  const disabled = testState === "disabled";
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const effectiveReduced = reduced === "system" ? undefined : reduced === "reduce";
  const notify = (message: string, tone: "success" | "error" | "neutral" = "success") =>
    setFeedback({ message, tone });
  const startEditor = (target: "dialog" | "drawer") => {
    setEditingTaskId(null);
    setDraft(saved);
    setSaveError("");
    if (target === "dialog") setDialogOpen(true);
    else setDrawerOpen(true);
  };
  const requestClose = (target: "dialog" | "drawer") => {
    if (busy) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    if (target === "dialog") setDialogOpen(false);
    else setDrawerOpen(false);
  };
  const saveDraft = () => {
    if (!draft.title.trim()) {
      setSaveError("请输入任务名称后再保存。");
      return;
    }
    setBusy(true);
    setSaveError("");
    later(() => {
      setBusy(false);
      if (failNextSave) {
        setFailNextSave(false);
        setSaveError("本次模拟保存失败。输入已保留，可以直接重试。");
        notify("未能保存，草稿仍然保留。", "error");
        return;
      }
      setSaved({ ...draft });
      if (editingTaskId)
        setTasks((items) =>
          items.map((item) =>
            item.id === editingTaskId
              ? {
                  ...item,
                  title: draft.title,
                  status: draft.status,
                  owner:
                    ownerOptions.find((option) => option.value === draft.owner)?.label.split(" · ")[0] ||
                    item.owner,
                }
              : item,
          ),
        );
      setDialogOpen(false);
      setDrawerOpen(false);
      notify("已保存到本页内存。");
    }, 750);
  };
  const refresh = () => {
    setRefreshing(true);
    later(() => {
      setRefreshing(false);
      if (retryFail) {
        setDataState("error");
        setRetryFail(false);
      } else {
        setDataState("normal");
        notify("列表已恢复。所选条目仍然保留。");
      }
    }, 650);
  };
  const filtered = tasks.filter(
    (item) =>
      (!query || `${item.title} ${item.id} ${item.owner}`.toLowerCase().includes(query.toLowerCase())) &&
      (status === "all" || item.status === status),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (!sort) return 0;
    const compare = String(a[sort.key as keyof Task]).localeCompare(
      String(b[sort.key as keyof Task]),
      "zh-CN",
    );
    return sort.direction === "asc" ? compare : -compare;
  });
  const effectiveRows = dataState === "empty" ? [] : sorted;
  const maxPage = Math.max(1, Math.ceil(effectiveRows.length / pageSize));
  const actualPage = Math.min(page, maxPage);
  const visibleRows = effectiveRows.slice((actualPage - 1) * pageSize, actualPage * pageSize);
  const columns = [
    {
      key: "title",
      wrap: true,
      header: "任务名称",
      sortable: true,
      render: (item: Task) => (
        <span className="pg-task-title">
          <strong>
            {longContent ? `${item.title}：需要跨多团队核对的完整内容与资料归档说明` : item.title}
          </strong>
          <small>{item.id}</small>
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      sortable: true,
      render: (item: Task) => <Badge tone={statusTones[item.status]}>{statusNames[item.status]}</Badge>,
    },
    { key: "owner", header: "负责人", sortable: true, render: (item: Task) => item.owner },
    { key: "due", header: "截止日期", sortable: true, render: (item: Task) => item.due },
    {
      key: "actions",
      header: "操作",
      render: (item: Task) => (
        <Button
          variant="ghost"
          disabled={refreshing || dataState === "loading"}
          onClick={() => {
            setEditingTaskId(item.id);
            const rowDraft = {
              title: item.title,
              owner:
                ownerOptions.find((option) => option.label.startsWith(`${item.owner} ·`))?.value || "lin",
              status: item.status,
              notes: reading,
            };
            setSaved(rowDraft);
            setDraft(rowDraft);
            setSaveError("");
            setDrawerOpen(true);
          }}
        >
          编辑
        </Button>
      ),
    },
  ];
  const fields = (
    <div className="pg-form-stack">
      {saveError && <ErrorNotice>{saveError}</ErrorNotice>}
      <Field
        label="任务名称"
        error={saveError && !draft.title.trim() ? "名称不能为空。" : undefined}
        description="2–60 个字符，便于在列表中辨认。"
      >
        <Input
          required
          maxLength={60}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          disabled={busy}
          placeholder="例如：整理阶段交付清单"
        />
      </Field>
      <div className="pg-two-column">
        <LabeledCombobox
          label="负责人"
          value={draft.owner}
          options={ownerOptions}
          onChange={(value) => setDraft({ ...draft, owner: value })}
          disabled={busy}
        />
        <LabeledSelect
          label="状态"
          value={draft.status}
          options={statusOptions.slice(1)}
          onChange={(value) => setDraft({ ...draft, status: value })}
          disabled={busy}
        />
      </div>
      <Field label="任务说明" description="草稿由调用方持有。关闭时会检查未保存内容。">
        <Textarea
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          disabled={busy}
          rows={longContent ? 16 : 7}
        />
      </Field>
      <Popover
        label="编辑帮助"
        trigger={
          <Button variant="ghost">
            <Icon name="alert" />
            编辑帮助
          </Button>
        }
      >
        <div className="pg-popover-copy">
          <h3>安排下一步</h3>
          <p>把目标、负责人和关键背景放在一起。完成修改后保存，或取消并放弃当前草稿。</p>
          <Button onClick={() => setNestedOpen(true)}>打开补充说明</Button>
        </div>
      </Popover>
    </div>
  );
  const editorFooter = (
    <>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => requestClose(dialogOpen ? "dialog" : "drawer")}
      >
        取消
      </Button>
      <Button variant="primary" loading={busy} onClick={saveDraft}>
        保存任务
      </Button>
    </>
  );
  const tableScene = (
    <div className="pg-scene-stack">
      <Toolbar>
        <div className="pg-filter-search">
          <Field label="搜索任务">
            <Input
              type="search"
              value={query}
              placeholder="名称、负责人或编号"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </Field>
        </div>
        <LabeledSelect
          label="任务状态"
          value={status}
          options={statusOptions}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <div className="pg-toolbar-actions">
          <Button
            onClick={() => {
              setQuery("");
              setStatus("all");
              setPage(1);
            }}
          >
            重置筛选
          </Button>
          <Button loading={refreshing} onClick={refresh}>
            <Icon name="refresh" />
            刷新
          </Button>
        </div>
      </Toolbar>
      <div className="pg-bulk-bar">
        <span>{selected.length ? `已选择 ${selected.length} 项（含其他页）` : "可跨页选择任务"}</span>
        <div className="pg-inline">
          <Button variant="ghost" disabled={!selected.length} onClick={() => setSelected([])}>
            清除选择
          </Button>
          <Button
            variant="danger"
            disabled={!selected.length}
            onClick={() => {
              setConfirmation("archive");
              setConfirmOpen(true);
            }}
          >
            归档所选
          </Button>
        </div>
      </div>
      <DataTable
        label="项目任务"
        rows={dataState === "loading" || dataState === "initialerror" ? [] : visibleRows}
        columns={columns}
        getRowKey={(item: Task) => item.id}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        sort={sort}
        onSort={setSort}
        loading={dataState === "loading" || refreshing}
        error={
          dataState === "error" || dataState === "initialerror"
            ? "暂时无法读取列表，请重试。当前选择仍然保留。"
            : undefined
        }
        onRetry={refresh}
        emptyTitle={query ? "没有匹配的任务" : "暂时没有任务"}
        emptyDescription={query ? "尝试其他关键词，或重置筛选。" : "切回正常列表，继续检查排序与分页。"}
      />
      <Pagination
        page={actualPage}
        total={effectiveRows.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
        pageSizes={[5, 10, 20]}
      />
      <div className="pg-state-tools">
        <LabeledSelect
          label="列表测试状态"
          value={dataState}
          options={[
            { value: "normal", label: "正常列表" },
            { value: "empty", label: "空数据" },
            { value: "loading", label: "首次加载" },
            { value: "error", label: "刷新失败（保留内容）" },
            { value: "initialerror", label: "首次加载失败" },
          ]}
          onChange={setDataState}
        />
        <Checkbox checked={retryFail} onChange={setRetryFail} label="下次刷新失败" />
        <span>筛选不会清除页外选择。</span>
      </div>
    </div>
  );

  return (
    <UiProvider reducedMotion={effectiveReduced}>
      <div
        className="glass-workbench pg-app"
        data-density={dense ? "dense" : "comfortable"}
        data-reduced-motion={effectiveReduced === undefined ? undefined : String(effectiveReduced)}
      >
        <AmbientBackground preset={preset} motion={motion && !effectiveReduced} className="pg-background" />
        <div className="pg-layout">
          <Glass as="aside" className="pg-sidebar" preset="navigation">
            <div className="pg-brand">
              <span className="pg-brand-mark">b.</span>
              <span>
                <strong>Between UI</strong>
                <small>组件工作台</small>
              </span>
              <div className="pg-mobile-navigation">
                <Menu
                  label="切换组件类别"
                  trigger={
                    <Button variant="secondary">
                      <Icon name="menu" size={16} />
                      {current.label}
                    </Button>
                  }
                  items={groups.map((item) => ({
                    id: item.id,
                    label: item.label,
                    icon: <Icon name={item.icon} size={16} />,
                    onSelect: () => setGroup(item.id),
                  }))}
                />
              </div>
            </div>
            <nav aria-label="组件类别">
              {groups.map((item) => (
                <Button
                  key={item.id}
                  className="pg-nav-item"
                  variant="ghost"
                  aria-current={item.id === group ? "page" : undefined}
                  onClick={() => setGroup(item.id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  <Icon name="arrow" size={14} />
                </Button>
              ))}
            </nav>
            <div className="pg-sidebar-note">
              <Icon name="lock" size={15} />
              <span>
                独立开发入口
                <br />
                演示数据只保留于本页内存
              </span>
            </div>
          </Glass>
          <div className="pg-workspace">
            <Glass as="header" className="pg-topbar" preset="navigation">
              <div className="pg-breadcrumb">
                <span>组件工作台</span>
                <span>/</span>
                <strong>{current.label}</strong>
              </div>
              <Popover
                label="预览环境"
                trigger={
                  <Button variant="ghost">
                    <Icon name="appearance" />
                    预览环境
                  </Button>
                }
              >
                <div className="pg-environment">
                  <h2>预览环境</h2>
                  <LabeledSelect
                    label="背景预设"
                    value={preset}
                    options={BACKGROUND_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
                    onChange={setPreset}
                  />
                  <Switch label="背景动效" checked={motion} onChange={setMotion} />
                  <LabeledSelect
                    label="界面动效"
                    value={reduced}
                    options={[
                      { value: "system", label: "跟随系统" },
                      { value: "reduce", label: "进一步减少动态" },
                    ]}
                    onChange={setReduced}
                  />
                  <Switch label="紧凑布局" checked={dense} onChange={setDense} />
                  <Switch label="长中文内容" checked={longContent} onChange={setLongContent} />
                  <p>这些选项只影响本页，不改变系统偏好。正常动效在系统未启用减少动态时检查。</p>
                </div>
              </Popover>
            </Glass>
            <main ref={main} className="pg-main" id="playground-main">
              <PageHeader
                title={current.label}
                description={current.description}
                actions={
                  ["data", "scenarios", "documents", "structured-data", "data-extended"].includes(
                    group,
                  ) ? undefined : (
                    <div className="pg-header-state">
                      <LabeledSelect
                        label="组件测试状态"
                        value={testState}
                        options={stateOptions}
                        onChange={(value) => setTestState(value as TestState)}
                      />
                    </div>
                  )
                }
              />
              {group === "advanced-controls" && (
                <AdvancedControlsDemo disabled={disabled} error={testState === "error"} long={longContent} />
              )}
              {group === "documents" && <DocumentsDemo />}
              {group === "structured-data" && <StructuredDataDemo />}
              {group === "data-extended" && <DataTableExtendedDemo />}
              {group === "basics" && (
                <div className="pg-example-grid">
                  <Example title="按钮" description="主要动作保持克制，忙碌与禁用不改变按钮宽度。">
                    <div className="pg-button-grid">
                      <Button
                        variant="primary"
                        disabled={disabled}
                        loading={testState === "loading" || busy}
                        onClick={() => {
                          setBusy(true);
                          later(() => {
                            setBusy(false);
                            notify("操作已完成。");
                          }, 700);
                        }}
                      >
                        <Icon name="plus" />
                        {longContent ? "创建需要进一步核对的项目任务" : "新建任务"}
                      </Button>
                      <Button disabled={disabled} onClick={() => startEditor("drawer")}>
                        <Icon name="edit" />
                        编辑内容
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => notify("已取消当前操作。", "neutral")}
                      >
                        取消
                      </Button>
                      <Button
                        variant="danger"
                        disabled={disabled}
                        onClick={() => {
                          setConfirmation("clear");
                          setConfirmOpen(true);
                        }}
                      >
                        <Icon name="trash" />
                        清空示例
                      </Button>
                      <Tooltip content="刷新本页演示结果">
                        <IconButton
                          label="刷新演示结果"
                          disabled={disabled}
                          onClick={() => notify("演示结果已刷新。")}
                        >
                          <Icon name="refresh" />
                        </IconButton>
                      </Tooltip>
                    </div>
                    {testState === "error" && <ErrorNotice>操作失败，请重试。此前输入仍然保留。</ErrorNotice>}
                  </Example>
                  <Example title="状态标签" description="文字与语义同时表达状态，不依赖颜色。">
                    <div className="pg-inline pg-wrap">
                      <Badge>待开始</Badge>
                      <Badge tone="info">进行中</Badge>
                      <Badge tone="success">已完成</Badge>
                      <Badge tone="warning">待审核</Badge>
                      <Badge tone="error">未能保存</Badge>
                    </div>
                    <p className="pg-example-note">标签用于说明结果，交互操作仍由按钮承担。</p>
                  </Example>
                  <Example title="玻璃与阅读表面" className="pg-span-two">
                    <div className="pg-surface-comparison">
                      <Glass className="pg-material-sample" preset="navigation">
                        <h3>导航与轻量控件</h3>
                        <p>透射背景，保留高亮与定向边缘。</p>
                        <div className="pg-inline">
                          <Button onClick={() => notify("已切换到内容视图。")}>内容视图</Button>
                          <Button variant="ghost" onClick={() => setGroup("scenarios")}>
                            检查阅读效果
                          </Button>
                        </div>
                      </Glass>
                      <Glass className="pg-material-sample" preset="dialog">
                        <h3>密集内容表面</h3>
                        <p>正文前景保持清晰，内容衬底抑制背景穿透。</p>
                        <p className="pg-sample-prose">
                          标题、正文与辅助信息各有强弱，阅读不需要追着光线走。
                        </p>
                      </Glass>
                    </div>
                  </Example>
                </div>
              )}
              {group === "forms" && (
                <div className="pg-example-grid">
                  <Example title="文本输入">
                    <div className="pg-form-stack">
                      <Field
                        label="任务名称"
                        error={testState === "error" ? "名称至少需要 2 个字符。" : undefined}
                        description="使用清楚、可辨认的名称。"
                      >
                        <Input
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                          disabled={disabled || testState === "loading"}
                          placeholder="请输入任务名称"
                        />
                      </Field>
                      <Field label="任务说明" description="保留换行与草稿，输入时不重播正文动画。">
                        <Textarea
                          value={text}
                          onChange={(event) => setText(event.target.value)}
                          rows={longContent ? 12 : 5}
                          disabled={disabled || testState === "loading"}
                        />
                      </Field>
                    </div>
                  </Example>
                  <Example title="选项与偏好">
                    <div className="pg-form-stack">
                      <Checkbox
                        label="加入本周交付清单"
                        checked={checked}
                        onChange={setChecked}
                        disabled={disabled}
                      />
                      <Checkbox
                        label="包含部分子任务"
                        checked={partial}
                        onChange={setPartial}
                        disabled={disabled}
                      />
                      <Switch
                        label="接收任务状态通知"
                        checked={switchOn}
                        onChange={setSwitchOn}
                        disabled={disabled}
                      />
                      <RadioGroup
                        label="可见范围"
                        value={radio}
                        onChange={setRadio}
                        disabled={disabled}
                        options={[
                          { value: "private", label: "仅自己" },
                          { value: "team", label: "项目成员" },
                          { value: "all", label: "全部协作成员" },
                        ]}
                      />
                    </div>
                    <p className="pg-example-note">
                      当前范围：
                      {radio === "private" ? "仅自己" : radio === "team" ? "项目成员" : "全部协作成员"}
                    </p>
                  </Example>
                </div>
              )}
              {group === "selection" && (
                <div className="pg-example-grid">
                  <Example title="选择与搜索">
                    <div className="pg-form-stack">
                      <LabeledSelect
                        label="任务状态"
                        value={status === "all" ? "todo" : status}
                        options={statusOptions.slice(1)}
                        onChange={setStatus}
                        disabled={disabled}
                      />
                      <LabeledCombobox
                        label="查找负责人"
                        value={owner}
                        options={ownerOptions}
                        onChange={setOwner}
                        disabled={disabled}
                        placeholder="搜索成员姓名或职责"
                      />
                      <p className="pg-example-note">
                        已选：{ownerOptions.find((item) => item.value === owner)?.label || "无"}
                      </p>
                      <Button variant="ghost" disabled={disabled} onClick={() => setOwner("lin")}>
                        恢复默认负责人
                      </Button>
                    </div>
                  </Example>
                  <Example title="标签与展开">
                    <Tabs
                      label="任务详情"
                      value={tab}
                      onChange={setTab}
                      items={[
                        {
                          value: "overview",
                          label: "概览",
                          content: (
                            <p className="pg-sample-prose">在同一视图中切换内容，保留页面与控件的位置。</p>
                          ),
                        },
                        {
                          value: "activity",
                          label: "动态",
                          content: (
                            <ul className="pg-activity">
                              <li>今天 14:20 · 补充阶段交付说明</li>
                              <li>今天 10:40 · 更新资料清单</li>
                            </ul>
                          ),
                        },
                        {
                          value: "permission",
                          label: "权限",
                          disabled,
                          content: <p className="pg-sample-prose">当前可见范围：项目成员。</p>,
                        },
                      ]}
                    />
                    <Accordion
                      value={expanded}
                      onChange={setExpanded}
                      items={[
                        {
                          value: "scope",
                          title: "工作范围",
                          content: <p>核对当前说明、安排负责人，并补充必要的背景。</p>,
                        },
                        {
                          value: "history",
                          title: longContent ? "较长的标题：交接历史、边界条件与后续安排" : "交接与后续安排",
                          content: <p>{longContent ? reading : "说明归档前保留修改记录，便于后续协作。"}</p>,
                        },
                        {
                          value: "unavailable",
                          title: "暂不可用的分组",
                          content: <p>此项不可展开。</p>,
                          disabled: true,
                        },
                      ]}
                    />
                  </Example>
                </div>
              )}
              {group === "overlays" && (
                <div className="pg-example-grid">
                  <Example title="弹窗与抽屉" description="测试关闭、中断重开、嵌套 Escape 与触发器回焦。">
                    <div className="pg-button-grid">
                      <Button variant="primary" disabled={disabled} onClick={() => startEditor("dialog")}>
                        打开长表单弹窗
                      </Button>
                      <Button disabled={disabled} onClick={() => startEditor("drawer")}>
                        打开编辑抽屉
                      </Button>
                      <Button
                        variant="danger"
                        disabled={disabled}
                        onClick={() => {
                          setConfirmation("clear");
                          setConfirmOpen(true);
                        }}
                      >
                        打开确认弹窗
                      </Button>
                    </div>
                  </Example>
                  <Example title="菜单、提示与气泡">
                    <div className="pg-button-grid">
                      <Menu
                        label="项目操作"
                        trigger={
                          <Button disabled={disabled}>
                            <Icon name="menu" />
                            项目操作
                          </Button>
                        }
                        items={[
                          {
                            id: "edit",
                            label: "编辑任务",
                            icon: <Icon name="edit" />,
                            onSelect: () => startEditor("dialog"),
                          },
                          {
                            id: "copy",
                            label: "复制名称到输入框",
                            onSelect: () => {
                              setText(saved.title);
                              notify("名称已放入表单输入示例。");
                            },
                          },
                          { id: "locked", label: "发布（暂不可用）", disabled: true, onSelect: () => {} },
                          {
                            id: "delete",
                            label: "清空示例任务",
                            danger: true,
                            icon: <Icon name="trash" />,
                            onSelect: () => {
                              setConfirmation("clear");
                              setConfirmOpen(true);
                            },
                          },
                        ]}
                      />
                      <Popover label="任务说明气泡" trigger={<Button disabled={disabled}>任务说明</Button>}>
                        <div className="pg-popover-copy">
                          <h3>阶段交付</h3>
                          <p>先核对资料，再安排负责人。需要更多空间时可以打开详情弹窗。</p>
                          <Button onClick={() => setNestedOpen(true)}>打开详情弹窗</Button>
                        </div>
                      </Popover>
                      <Tooltip content="提示只补充含义，不承载必须点击的操作。">
                        <IconButton label="了解提示说明" disabled={disabled}>
                          <Icon name="alert" />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </Example>
                  <Example title="当前草稿" className="pg-span-two">
                    <div className="pg-saved-summary">
                      <div>
                        <h3>{saved.title || "尚未创建任务"}</h3>
                        <p>{ownerOptions.find((item) => item.value === saved.owner)?.label}</p>
                      </div>
                      <Badge tone={statusTones[saved.status]}>{statusNames[saved.status]}</Badge>
                    </div>
                    <p className="pg-sample-prose">{saved.notes.slice(0, 170)}</p>
                    <Checkbox
                      checked={failNextSave}
                      onChange={setFailNextSave}
                      label="下一次保存失败，检查草稿与重试"
                    />
                  </Example>
                </div>
              )}
              {group === "feedback" && (
                <div className="pg-example-grid">
                  <Example title="结果反馈">
                    <div className="pg-button-grid">
                      <Button disabled={disabled} onClick={() => notify("任务已保存到本页内存。")}>
                        成功通知
                      </Button>
                      <Button
                        disabled={disabled}
                        onClick={() => notify("未能保存，草稿已保留。请重试。", "error")}
                      >
                        失败通知
                      </Button>
                      <Button disabled={disabled} onClick={() => notify("当前修改尚未保存。", "neutral")}>
                        一般提示
                      </Button>
                    </div>
                    <div className="pg-feedback-preview">
                      <ErrorNotice>读取失败。已有内容仍然保留，可以重新加载。</ErrorNotice>
                      <Button loading={refreshing} disabled={disabled} onClick={refresh}>
                        重新加载
                      </Button>
                    </div>
                  </Example>
                  <Example title="等待状态">
                    <div className="pg-loading-preview">
                      <Spinner />
                      <span>正在读取任务列表</span>
                    </div>
                    <div className="pg-skeleton-stack">
                      <Skeleton />
                      <Skeleton />
                      <Skeleton />
                    </div>
                    <p className="pg-example-note">等待状态不会展示虚构的业务进度。</p>
                  </Example>
                  <Example title="无内容与无结果" className="pg-span-two">
                    <Empty
                      icon="search"
                      title="没有匹配的任务"
                      description="尝试缩短关键词，或恢复初始筛选。"
                      action={
                        <Button
                          disabled={disabled}
                          onClick={() => {
                            setQuery("");
                            setStatus("all");
                            setDataState("normal");
                            setGroup("data");
                          }}
                        >
                          查看任务列表
                        </Button>
                      }
                    />
                  </Example>
                </div>
              )}
              {group === "data" && (
                <Example title="项目任务" description="构造数据用于检查长中文、排序、跨页选择与失败恢复。">
                  {tableScene}
                </Example>
              )}
              {group === "scenarios" && (
                <div className="pg-example-grid">
                  <Example
                    title="编辑与保存"
                    description="修改、取消、失败重试和未保存确认走同一套正式组件。"
                  >
                    <div className="pg-form-stack">
                      <div className="pg-saved-summary">
                        <h3>{saved.title || "尚未创建任务"}</h3>
                        <Badge tone={statusTones[saved.status]}>{statusNames[saved.status]}</Badge>
                      </div>
                      <div className="pg-button-grid">
                        <Button variant="primary" onClick={() => startEditor("dialog")}>
                          编辑长表单
                        </Button>
                        <Button onClick={() => startEditor("drawer")}>抽屉编辑</Button>
                      </div>
                      <Checkbox label="下一次保存失败" checked={failNextSave} onChange={setFailNextSave} />
                    </div>
                  </Example>
                  <Example title="阅读环境">
                    <div className="pg-form-stack">
                      <Switch label="背景动效" checked={motion} onChange={setMotion} />
                      <Switch label="长中文内容" checked={longContent} onChange={setLongContent} />
                      <LabeledSelect
                        label="背景预设"
                        value={preset}
                        options={BACKGROUND_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
                        onChange={setPreset}
                      />
                      <Button
                        variant="ghost"
                        onClick={() => setReduced(reduced === "reduce" ? "system" : "reduce")}
                      >
                        {reduced === "reduce" ? "跟随系统设置" : "进一步减少动态"}
                      </Button>
                    </div>
                  </Example>
                  <Example title="玻璃后的长文" className="pg-span-two pg-reading-example">
                    <Glass className="pg-reading-glass" preset="dialog">
                      <article className="pg-reading">
                        <header>
                          <span>项目交接说明</span>
                          <h3>让阅读稳定，让变化可被理解</h3>
                          <p>林知夏 · 2026 年 10 月 18 日</p>
                        </header>
                        <p>{longContent ? `${reading}\n\n${reading}` : reading}</p>
                      </article>
                    </Glass>
                  </Example>
                </div>
              )}
              <footer className="pg-footer">
                <span>组件与正式后台共用源码、字体、材质及动画。</span>
                <span>仅本页内存模拟 · 刷新恢复</span>
              </footer>
            </main>
          </div>
        </div>
        <Dialog
          open={dialogOpen}
          title="编辑任务"
          onClose={() => requestClose("dialog")}
          closeDisabled={busy}
          size="lg"
          footer={editorFooter}
        >
          {fields}
        </Dialog>
        <Drawer
          open={drawerOpen}
          title="编辑交接说明"
          onClose={() => requestClose("drawer")}
          closeDisabled={busy}
          size="lg"
          footer={editorFooter}
        >
          {fields}
        </Drawer>
        <ConfirmDialog
          open={discardOpen}
          title="放弃未保存的修改？"
          description="当前输入尚未保存。继续编辑可保留草稿，放弃后恢复上一次保存的内容。"
          confirmLabel="放弃修改"
          danger
          onClose={() => setDiscardOpen(false)}
          onConfirm={() => {
            setDiscardOpen(false);
            setDialogOpen(false);
            setDrawerOpen(false);
            setDraft(saved);
            setSaveError("");
          }}
        />
        <ConfirmDialog
          open={confirmOpen}
          title={confirmation === "archive" ? `归档所选的 ${selected.length} 个任务？` : "清空当前示例任务？"}
          description={
            confirmation === "archive"
              ? "归档仅作用于本页演示数据，其他页中已选择的条目也会一并归档。刷新后恢复。"
              : "当前样例的名称和说明将被清空，可以重新编辑。只影响本页内存，刷新后恢复。"
          }
          confirmLabel={confirmation === "archive" ? "确认归档" : "确认清空"}
          danger
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            if (confirmation === "archive") {
              setTasks((items) => items.filter((item) => !selected.includes(item.id)));
              setSelected([]);
            } else {
              setSaved({ title: "", owner: "lin", status: "todo", notes: "" });
              setDraft({ title: "", owner: "lin", status: "todo", notes: "" });
            }
            setConfirmOpen(false);
            notify(
              confirmation === "archive" ? "所选任务已从本页列表移除。" : "示例任务已清空，可以重新编辑。",
            );
          }}
        />
        <Dialog
          open={nestedOpen}
          title="补充说明"
          size="sm"
          onClose={() => setNestedOpen(false)}
          footer={
            <Button variant="primary" onClick={() => setNestedOpen(false)}>
              知道了
            </Button>
          }
        >
          <p className="pg-sample-prose">
            这是内层说明。按 Escape 只关闭当前层，再回到原来的编辑位置；主表单中的输入应保持。
          </p>
        </Dialog>
        <Toast feedback={feedback} onClose={() => setFeedback(null)} />
      </div>
    </UiProvider>
  );
}
