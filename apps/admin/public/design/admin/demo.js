import {
  createButton, createBadge, createFormField, createNotice, createFeedback,
  createStatCard, createTabs, createDialog, createDrawer,
  createFilterBar, createDataTable, createPagination,
} from './ui.js';
import { createGlassSurface } from '../components/ui.js';

// All records and async results are fictional and live only in this page's memory.
// This controller owns data, drafts, filtering, sorting, paging and operation results.
const root = document.querySelector('#app');
const main = document.querySelector('#main');
const sidebar = document.querySelector('#navigation');
const topbar = document.querySelector('#topbar');
const scrim = document.querySelector('.admin-nav-scrim');
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
};
const instances = [];
const keep = component => { instances.push(component); return component; };
const timers = new Set();
let disposed = false;
function wait(ms) { return new Promise(resolve => { const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms); timers.add(timer); }); }
const owners = [{ value: 'a', label: '小组甲' }, { value: 'b', label: '小组乙' }, { value: 'c', label: '小组丙' }];
const statuses = [{ value: 'todo', label: '待开始' }, { value: 'doing', label: '进行中' }, { value: 'review', label: '待审核' }, { value: 'done', label: '已完成' }];
const priorities = [{ value: 'high', label: '高优先级' }, { value: 'normal', label: '普通' }, { value: 'low', label: '低优先级' }];
const labelOf = (items, value) => items.find(item => item.value === value)?.label || value;
const toneOf = status => ({ todo: 'neutral', doing: 'info', review: 'warning', done: 'success' })[status] || 'neutral';
const titles = [
  '梳理项目启动清单', '整理访谈问题与记录模板', '完善任务状态说明', '制作交付检查表',
  '核对本周待办与依赖', '整理资料目录结构', '补充新成员入门说明', '确认第一阶段里程碑',
  '归纳试用反馈', '更新任务分工表', '校对展示内容', '编写验收操作步骤',
  '完善异常恢复说明', '整理历史决策记录', '复查表单提示文案', '准备阶段回顾材料',
  '核对边界场景', '汇总公开演示问题', '检查窄窗阅读顺序', '补充键盘操作说明',
  '整理已完成事项',
];
const originalRows = titles.map((title, i) => ({
  id: `TASK-${String(i + 1).padStart(3, '0')}`,
  title, owner: owners[i % 3].value, status: statuses[i % 4].value,
  priority: priorities[i % 3].value, due: `2026-10-${String(17 + i % 12).padStart(2, '0')}`,
  summary: `这是一条虚构的项目任务。请由${owners[i % 3].label}整理相关内容，并在截止日期前完成核对。所有修改仅在当前页面内存中保留。`,
  archived: i >= 19,
}));
const state = {
  rows: originalRows.map(row => ({ ...row })), tab: 'active',
  filters: { query: '', status: '', owner: '' }, page: 1, pageSize: 5,
  sort: null, selectedKeys: [], preview: 'ready', refreshing: false,
  refreshError: '', failRefresh: false, failSave: false,
  editor: { open: false, mode: 'create', id: null, draft: {}, errors: {}, busy: false, error: '' },
  detailId: null, archive: { open: false, keys: [], busy: false, error: '' },
  notification: null,
};
let nextId = originalRows.length + 1;

// A shared material layer covers the application; only shell surfaces refract it.
const identity = make('div', 'admin-identity');
const identityCopy = make('div');
identityCopy.append(make('strong', '', '项目工作台'), make('small', '', '任务空间 · 本地演示'));
identity.append(make('span', 'admin-mark', '项'), identityCopy);
const navSection = make('div');
navSection.append(make('p', 'admin-nav-label', '工作视图'));
const nav = make('nav', 'admin-navigation');
const navButtons = new Map();
for (const [value, label, symbol] of [['active', '全部任务', '▤'], ['completed', '已完成', '✓'], ['archived', '归档记录', '▣']]) {
  const b = make('button', 'admin-nav-link'); b.type = 'button';
  const count = make('span', 'admin-nav-count');
  b.append(make('span', 'admin-nav-symbol', symbol), make('span', '', label), count);
  b.addEventListener('click', () => { selectTab(value); closeNavigation(); });
  nav.append(b); navButtons.set(value, { button: b, count });
}
navSection.append(nav);
const sideFoot = make('div', 'admin-sidebar-foot');
sideFoot.append(make('strong', '', '可操作的内存样例'), make('p', '', '筛选、勾选、编辑与归档均作用于本页虚构数据。刷新浏览器会恢复初始内容。'));
let navOpen = false;
let navTrigger = null;
const closeNavButton = keep(createButton({ label: '关闭', variant: 'ghost', size: 'sm', onClick: closeNavigation }));
closeNavButton.element.classList.add('admin-nav-close');
keep(createGlassSurface({ element: sidebar, children: [identity, closeNavButton.element, navSection, sideFoot] }));
const breadcrumb = make('div', 'admin-topbar-path');
const menuButton = keep(createButton({ label: '导航', variant: 'ghost', size: 'sm', onClick: openNavigation }));
menuButton.element.classList.add('admin-nav-toggle');
menuButton.element.setAttribute('aria-controls', 'navigation');
menuButton.element.setAttribute('aria-expanded', 'false');
breadcrumb.append(menuButton.element, make('span', '', '工作台'), make('span', '', '/'), make('span', '', '项目任务'));
const topMeta = make('div', 'admin-topbar-meta');
topMeta.append(make('span', 'admin-local-indicator', '仅当前页面'), keep(createBadge({ label: '内存模拟', tone: 'neutral' })).element);
keep(createGlassSurface({ element: topbar, children: [breadcrumb, topMeta] }));
function openNavigation() {
  if (!matchMedia('(max-width: 850px)').matches) return;
  navTrigger = document.activeElement; navOpen = true; root.dataset.navOpen = 'true'; scrim.hidden = false;
  menuButton.element.setAttribute('aria-expanded', 'true'); closeNavButton.element.focus();
}
function closeNavigation() {
  if (!navOpen) return;
  navOpen = false; delete root.dataset.navOpen; scrim.hidden = true;
  menuButton.element.setAttribute('aria-expanded', 'false');
  if (navTrigger?.isConnected) navTrigger.focus();
}
scrim.addEventListener('click', closeNavigation);
function navigationKeys(event) {
  if (!navOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); return; }
  if (event.key === 'Tab') {
    const nodes = [...sidebar.querySelectorAll('button:not(:disabled), a[href]')];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }
}
root.addEventListener('keydown', navigationKeys);
const viewport = matchMedia('(max-width: 850px)');
const onViewportChange = () => { if (!viewport.matches) closeNavigation(); };
viewport.addEventListener('change', onViewportChange);

const heading = make('section', 'admin-heading');
const headingCopy = make('div');
headingCopy.append(make('p', 'admin-overline', 'PROJECT OVERVIEW'), make('h1', '', '项目任务管理'), make('p', '', '让任务、负责人和下一步，保持在同一处。'));
const headingActions = make('div', 'admin-heading-actions');
const refreshButton = keep(createButton({ label: '刷新列表', variant: 'secondary', onClick: () => refreshRows() }));
const newButton = keep(createButton({ label: '＋ 新建任务', variant: 'primary', onClick: () => openEditor() }));
headingActions.append(refreshButton.element, newButton.element); heading.append(headingCopy, headingActions); main.append(heading);
const stats = make('section', 'admin-stats'); stats.setAttribute('aria-label', '任务概况');
const statCards = [
  keep(createStatCard({ label: '当前任务', value: '0', hint: '尚未归档的全部任务' })),
  keep(createStatCard({ label: '已完成', value: '0', hint: '当前项目的完成事项' })),
  keep(createStatCard({ label: '待审核', value: '0', hint: '需要进一步核对' })),
  keep(createStatCard({ label: '高优先级', value: '0', hint: '优先关注的未完成任务' })),
];
statCards.forEach(card => stats.append(card.element)); main.append(stats);
const noticeRegion = make('div', 'admin-notice-region');
const notification = keep(createNotice({ title: '', message: '', tone: 'info', dismissible: true, onDismiss: () => { state.notification = null; renderNotices(); } }));
const refreshNotice = keep(createNotice({ title: '刷新失败', message: '', tone: 'danger', actionLabel: '重试刷新', onAction: () => refreshRows(true) }));
noticeRegion.append(notification.element, refreshNotice.element); main.append(noticeRegion);
const panel = make('section', 'admin-list-panel'); panel.setAttribute('aria-labelledby', 'task-list-heading');
const panelHeading = make('div', 'admin-list-heading');
const panelTitle = make('div');
const listTitle = make('h2', '', '任务列表'); listTitle.id = 'task-list-heading';
panelTitle.append(listTitle, make('p', '', '按状态整理进度，也可以跨页选择后统一归档。'));
panelHeading.append(panelTitle); panel.append(panelHeading);
const tabHost = make('div', 'admin-list-tabs');
const tabs = keep(createTabs({ label: '任务视图', selected: state.tab, items: [], onSelect: selectTab }));
tabHost.append(tabs.element); panel.append(tabHost);
const filterHost = make('div', 'admin-filter-wrap');
const filterBar = keep(createFilterBar({ filters: [], resultLabel: '', onFilterChange(key, value) {
  state.filters = { ...state.filters, [key]: value }; state.page = 1; renderList();
}, onReset: resetFilters }));
filterHost.append(filterBar.element); panel.append(filterHost);
const batch = make('div', 'admin-batch');
const batchCopy = make('div', 'admin-batch-copy'); batchCopy.setAttribute('aria-live', 'polite');
const batchActions = make('div', 'admin-action-row');
const clearSelection = keep(createButton({ label: '清除选择', variant: 'ghost', size: 'sm', onClick: () => { state.selectedKeys = []; renderList(); } }));
const archiveSelected = keep(createButton({ label: '归档所选', variant: 'secondary', size: 'sm', onClick: () => openArchive(state.selectedKeys) }));
batchActions.append(clearSelection.element, archiveSelected.element); batch.append(batchCopy, batchActions); panel.append(batch);
const tableHost = make('div', 'admin-table-wrap');
const badgeCache = new Map();
function statusBadge(row) {
  if (!badgeCache.has(row.id)) badgeCache.set(row.id, keep(createBadge({})));
  const badge = badgeCache.get(row.id); badge.update({ label: row.archived ? '已归档' : labelOf(statuses, row.status), tone: row.archived ? 'neutral' : toneOf(row.status) });
  return badge.element;
}
const table = keep(createDataTable({
  label: '项目任务', rowKey: 'id', rowLabel: row => row.title, selectable: true,
  columns: [
    { key: 'title', label: '任务名称', sortable: true, width: '290px', render(value, row) {
      const node = make('div', 'admin-table-title'); node.append(make('span', 'admin-task-title', value), make('span', 'admin-task-id', row.id)); return node;
    } },
    { key: 'status', label: '状态', sortable: true, width: '114px', render: (_, row) => statusBadge(row) },
    { key: 'owner', label: '负责人', sortable: true, width: '118px', render(value) {
      const node = make('span', 'admin-owner'); node.append(make('span', 'admin-owner-dot', labelOf(owners, value).slice(-1)), document.createTextNode(labelOf(owners, value))); return node;
    } },
    { key: 'priority', label: '优先级', sortable: true, width: '116px', render(value) {
      const node = make('span', 'admin-priority', labelOf(priorities, value)); node.style.setProperty('--priority-color', ({ high: '#c7a27b', normal: '#a0acba', low: '#728376' })[value]); return node;
    } },
    { key: 'due', label: '截止日期', sortable: true, width: '124px' },
  ],
  actions: [
    { id: 'details', label: '详情' },
    { id: 'edit', label: '编辑', disabled: row => row.archived },
    { id: 'archive', label: '归档', danger: true, disabled: row => row.archived },
  ],
  isRowSelectable: row => !row.archived,
  onSort(nextSort) { state.sort = nextSort; state.page = 1; renderList(); },
  onSelectionChange(nextKeys) { state.selectedKeys = [...nextKeys]; renderList(); },
  onRowAction(action, row) {
    if (action === 'details') openDetails(row.id);
    if (action === 'edit') openEditor(row.id);
    if (action === 'archive') openArchive([row.id]);
  },
  onRetry: () => refreshRows(true),
}));
tableHost.append(table.element); panel.append(tableHost);
const feedbackHost = make('div', 'admin-feedback');
const feedback = keep(createFeedback({ kind: 'empty', title: '没有符合条件的任务', description: '换一组条件，或创建第一条任务。', actionLabel: '清除筛选', onAction: () => { state.preview = 'ready'; resetFilters(); } }));
feedbackHost.append(feedback.element); panel.append(feedbackHost);
const pagerHost = make('div', 'admin-pager');
const pagination = keep(createPagination({ page: 1, pageSize: state.pageSize, total: 0, pageSizeOptions: [5, 10, 20], onChange({ page, pageSize }) {
  state.pageSize = pageSize; state.page = page; renderList();
} }));
pagerHost.append(pagination.element); panel.append(pagerHost); main.append(panel);

const demoTools = make('section', 'admin-demo-tools'); demoTools.setAttribute('aria-label', '演示状态设置');
const demoHeading = make('div', 'admin-demo-tools-heading');
demoHeading.append(make('strong', '', '体验状态与恢复'), make('span', '', '纯内存模拟，不连接外部服务。'));
const demoOptions = make('div', 'admin-demo-options');
const statePreview = keep(createFormField({ label: '列表状态', type: 'select', value: 'ready', options: [
  { value: 'ready', label: '正常列表' }, { value: 'empty', label: '空状态' },
  { value: 'loading', label: '首次加载中' }, { value: 'error', label: '首次加载失败' },
], onInput(value) { state.preview = value; state.page = 1; renderAll(); } }));
statePreview.element.classList.add('admin-demo-state');
function failureOption(label, key) {
  const node = make('label', 'admin-demo-check');
  const input = make('input'); input.type = 'checkbox'; input.addEventListener('change', () => { state[key] = input.checked; });
  node.append(input, document.createTextNode(label)); return { node, input };
}
const refreshFailure = failureOption('下次刷新失败', 'failRefresh');
const saveFailure = failureOption('下次保存失败', 'failSave');
demoOptions.append(statePreview.element, refreshFailure.node, saveFailure.node); demoTools.append(demoHeading, demoOptions); main.append(demoTools);
const bottom = make('footer', 'admin-bottom-note');
bottom.append(make('span', '', '演示数据为虚构内容。新建、保存和归档仅保留于当前页面。'), make('span', '', '键盘可操作 · 表格可横向滚动')); main.append(bottom);

// Form nodes are created once. Updating a draft never recreates the controls.
const editorNotice = keep(createNotice({ title: '模拟保存失败', message: '', tone: 'danger' }));
editorNotice.element.classList.add('admin-editor-error');
const form = make('form', 'admin-form'); form.noValidate = true;
form.addEventListener('submit', event => { event.preventDefault(); saveDraft(); });
const fieldDefs = {
  title: { label: '任务名称', type: 'text', required: true, placeholder: '例如：整理阶段交付清单', description: '2–60 个字符，便于在列表中辨认。' },
  owner: { label: '负责人', type: 'select', required: true, options: owners },
  status: { label: '状态', type: 'select', required: true, options: statuses },
  due: { label: '截止日期', type: 'text', required: true, placeholder: 'YYYY-MM-DD', description: '使用年-月-日格式。' },
  priority: { label: '优先级', type: 'select', options: priorities },
  summary: { label: '任务说明', type: 'textarea', placeholder: '补充目标、范围和需要核对的内容…', description: '可选；最多 500 个字符。' },
};
const fields = Object.fromEntries(Object.entries(fieldDefs).map(([key, definition]) => [key, keep(createFormField({ ...definition, value: '', onInput(value) {
  if (state.editor.busy) return;
  state.editor.draft = { ...state.editor.draft, [key]: value };
  if (state.editor.errors[key]) {
    state.editor.errors = { ...state.editor.errors, [key]: '' };
  }
  renderEditor();
} }))]));
const formPair = (...keys) => { const pair = make('div', 'admin-form-pair'); keys.forEach(key => pair.append(fields[key].element)); return pair; };
form.append(fields.title.element, formPair('owner', 'status'), formPair('due', 'priority'), fields.summary.element, make('p', 'admin-form-note', '保存模拟需要片刻。失败会保留输入内容；取消会丢弃此次草稿。'));
const editorCancel = keep(createButton({ label: '取消', variant: 'secondary', onClick: dismissEditor }));
const editorSave = keep(createButton({ label: '保存任务', variant: 'primary', onClick: saveDraft }));
const editor = keep(createDialog({ open: false, title: '新建任务', description: '填写基本信息后保存到本页内存。', size: 'md', children: [editorNotice.element, form], footer: [editorCancel.element, editorSave.element], onClose: dismissEditor }));
root.append(editor.element);

const detailHost = make('div');
const detailBadge = keep(createBadge({}));
const detailClose = keep(createButton({ label: '关闭', variant: 'secondary', onClick: closeDetails }));
const detailEdit = keep(createButton({ label: '编辑任务', variant: 'primary', onClick: () => { const id = state.detailId; closeDetails(); openEditor(id); } }));
const detailRestore = keep(createButton({ label: '恢复此任务', variant: 'primary', onClick: restoreTask }));
const drawer = keep(createDrawer({ open: false, title: '任务详情', description: '查看任务信息与当前进度。', size: 'md', children: [detailHost], footer: [detailClose.element, detailEdit.element, detailRestore.element], onClose: closeDetails }));
root.append(drawer.element);
const archiveHost = make('div');
const archiveNotice = keep(createNotice({ title: '模拟归档失败', message: '', tone: 'danger' }));
const archiveCancel = keep(createButton({ label: '取消', variant: 'secondary', onClick: closeArchive }));
const archiveConfirm = keep(createButton({ label: '确认归档', variant: 'danger', onClick: confirmArchive }));
const archiveDialog = keep(createDialog({ open: false, title: '归档任务', description: '归档后可以在归档记录中查看，并从详情恢复。', size: 'sm', children: [archiveNotice.element, archiveHost], footer: [archiveCancel.element, archiveConfirm.element], onClose: closeArchive }));
root.append(archiveDialog.element);

function selectTab(value) {
  state.tab = value; state.page = 1; state.filters = { query: '', status: '', owner: '' }; renderAll();
}
function resetFilters() { state.filters = { query: '', status: '', owner: '' }; state.page = 1; renderList(); }
function deriveRows() {
  const query = state.filters.query.trim().toLocaleLowerCase();
  const rows = state.rows.filter(row => {
    if (state.tab === 'archived' ? !row.archived : row.archived) return false;
    if (state.tab === 'completed' && row.status !== 'done') return false;
    if (state.filters.status && row.status !== state.filters.status) return false;
    if (state.filters.owner && row.owner !== state.filters.owner) return false;
    if (query && !`${row.title} ${row.id} ${row.summary}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
  if (state.sort) {
    const { key, direction } = state.sort;
    const compareValue = row => key === 'owner' ? labelOf(owners, row.owner) : key === 'status' ? statuses.findIndex(item => item.value === row.status) : key === 'priority' ? priorities.findIndex(item => item.value === row.priority) : row[key];
    rows.sort((a, b) => {
      const av = compareValue(a), bv = compareValue(b);
      const result = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'zh-CN');
      return (direction === 'desc' ? -result : result) || a.id.localeCompare(b.id);
    });
  }
  return rows;
}
function showNotification(title, message, tone = 'success') { state.notification = { title, message, tone }; renderNotices(); }
function renderNotices() {
  notification.element.hidden = !state.notification;
  if (state.notification) notification.update(state.notification);
  refreshNotice.element.hidden = !state.refreshError || deriveRows().length > 0;
  refreshNotice.update({ message: state.refreshError });
  noticeRegion.hidden = !state.notification && refreshNotice.element.hidden;
}
function renderStats() {
  const active = state.rows.filter(row => !row.archived);
  const counts = [active.length, active.filter(row => row.status === 'done').length, active.filter(row => row.status === 'review').length, active.filter(row => row.status !== 'done' && row.priority === 'high').length];
  statCards.forEach((card, i) => card.update({ value: String(counts[i]), loading: state.preview === 'loading', trend: i === 1 ? `完成率 ${Math.round(counts[1] / Math.max(1, counts[0]) * 100)}%` : '' }));
  for (const [value, entry] of navButtons) {
    if (state.tab === value) entry.button.setAttribute('aria-current', 'page'); else entry.button.removeAttribute('aria-current');
    entry.count.textContent = String(value === 'active' ? active.length : value === 'completed' ? counts[1] : state.rows.filter(row => row.archived).length);
  }
}
function renderList() {
  const active = state.rows.filter(row => !row.archived);
  tabs.update({ selected: state.tab, items: [
    { value: 'active', label: '全部任务', count: active.length },
    { value: 'completed', label: '已完成', count: active.filter(row => row.status === 'done').length },
    { value: 'archived', label: '已归档', count: state.rows.filter(row => row.archived).length },
  ] });
  const derived = deriveRows();
  const total = state.preview === 'ready' ? derived.length : 0;
  // Clamp only in the controller, after filtering, saving, archiving or a size change.
  state.page = Math.min(Math.max(1, state.page), Math.max(1, Math.ceil(total / state.pageSize)));
  const pageRows = state.preview === 'ready' ? derived.slice((state.page - 1) * state.pageSize, state.page * state.pageSize) : [];
  const busy = state.refreshing || state.preview === 'loading';
  filterBar.update({
    filters: [
      { key: 'query', label: '搜索任务', type: 'search', value: state.filters.query, placeholder: '搜索名称或编号' },
      { key: 'status', label: '状态', type: 'select', value: state.filters.status, options: [{ value: '', label: '全部状态' }, ...statuses] },
      { key: 'owner', label: '负责人', type: 'select', value: state.filters.owner, options: [{ value: '', label: '全部负责人' }, ...owners] },
    ], resultLabel: state.preview === 'loading' ? '正在加载' : state.preview === 'error' ? '读取失败' : `${total} 条结果`, disabled: state.preview !== 'ready',
  });
  table.update({ rows: pageRows, selectedKeys: state.selectedKeys, sort: state.sort, loading: state.refreshing, error: state.refreshError });
  const showFeedback = !pageRows.length;
  tableHost.hidden = showFeedback;
  feedbackHost.hidden = !showFeedback;
  if (showFeedback) {
    const kind = state.preview === 'loading' ? 'loading' : state.preview === 'error' ? 'error' : 'empty';
    feedback.update({
      kind,
      title: kind === 'loading' ? '正在读取演示任务' : kind === 'error' ? '暂时无法读取任务' : '没有符合条件的任务',
      description: kind === 'loading' ? '这是首次加载状态预览。切回正常列表即可继续操作。' : kind === 'error' ? '这是模拟的首次读取失败。原有内存数据仍然保留。' : state.preview === 'empty' ? '这是空状态预览，原有内存数据仍然保留。' : '试试清除筛选条件，或新建一条任务。',
      actionLabel: kind === 'loading' ? '' : state.preview === 'ready' ? '清除筛选' : '返回正常列表',
      onAction: () => { state.preview = 'ready'; statePreview.update({ value: 'ready' }); resetFilters(); renderStats(); },
    });
  }
  pagination.update({ page: state.page, pageSize: state.pageSize, total, disabled: state.preview !== 'ready' });
  pagerHost.hidden = state.preview === 'loading' || state.preview === 'error';
  batchCopy.replaceChildren();
  if (state.selectedKeys.length) batchCopy.append(make('strong', '', `已选 ${state.selectedKeys.length} 项`), document.createTextNode(' · 含其他页的选择'));
  else batchCopy.textContent = '勾选任务后，可跨页批量归档';
  clearSelection.update({ disabled: !state.selectedKeys.length });
  archiveSelected.update({ disabled: !state.selectedKeys.some(id => state.rows.some(row => row.id === id && !row.archived)) || busy });
  refreshButton.update({ loading: state.refreshing, disabled: state.refreshing });
  newButton.update({ disabled: state.refreshing });
}
function renderAll() {
  renderStats(); renderNotices(); renderList();
  statePreview.update({ value: state.preview }); refreshFailure.input.checked = state.failRefresh; saveFailure.input.checked = state.failSave;
}
async function refreshRows(retry = false) {
  if (state.refreshing) return;
  const fail = !retry && state.failRefresh;
  state.failRefresh = false; state.notification = null; state.preview = 'ready'; state.refreshing = true; state.refreshError = ''; renderAll();
  await wait(650); if (disposed) return;
  state.refreshing = false;
  if (fail) state.refreshError = '模拟刷新失败，列表仍显示上一次内存数据。你的筛选、排序与选择均已保留。';
  else showNotification('演示刷新完成', '已重新读取本页内存数据，没有访问外部服务。', 'info');
  renderAll();
}
function blankDraft() { return { title: '', owner: 'a', status: 'todo', due: '2026-10-30', priority: 'normal', summary: '' }; }
function openEditor(id = null) {
  const row = id ? state.rows.find(item => item.id === id) : null;
  if (id && (!row || row.archived)) return;
  state.editor = { open: true, mode: row ? 'edit' : 'create', id: row?.id || null, draft: row ? { title: row.title, owner: row.owner, status: row.status, due: row.due, priority: row.priority, summary: row.summary } : blankDraft(), errors: {}, busy: false, error: '' };
  renderEditor();
}
function dismissEditor() {
  if (state.editor.busy) return;
  state.editor.open = false; state.editor.draft = {}; state.editor.errors = {}; state.editor.error = ''; renderEditor();
}
function renderEditor() {
  const snapshot = state.editor;
  for (const [key, field] of Object.entries(fields)) field.update({ value: snapshot.draft[key] ?? '', error: snapshot.errors[key] || '', disabled: snapshot.busy });
  editorNotice.element.hidden = !snapshot.error;
  editorNotice.update({ message: snapshot.error });
  editorCancel.update({ disabled: snapshot.busy });
  editorSave.update({ label: snapshot.error ? '重试保存' : '保存任务', loading: snapshot.busy, disabled: snapshot.busy });
  editor.update({ open: snapshot.open, title: snapshot.mode === 'edit' ? '编辑任务' : '新建任务', closeDisabled: snapshot.busy });
}
function validateDraft(draft) {
  const errors = {};
  if (draft.title.trim().length < 2 || draft.title.trim().length > 60) errors.title = '请填写 2–60 个字符的任务名称。';
  if (!owners.some(item => item.value === draft.owner)) errors.owner = '请选择负责人。';
  if (!statuses.some(item => item.value === draft.status)) errors.status = '请选择任务状态。';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.due) ? new Date(`${draft.due}T12:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draft.due) errors.due = '请输入有效日期，例如 2026-10-30。';
  if (draft.summary.length > 500) errors.summary = '任务说明最多 500 个字符。';
  return errors;
}
async function saveDraft() {
  if (!state.editor.open || state.editor.busy) return;
  const errors = validateDraft(state.editor.draft); state.editor.errors = errors;
  if (Object.keys(errors).length) {
    renderEditor(); fields[Object.keys(errors)[0]].element.querySelector('input,select,textarea')?.focus(); return;
  }
  const fail = state.failSave; state.failSave = false; state.notification = null;
  state.editor.busy = true; state.editor.error = ''; renderEditor(); renderAll();
  await wait(650); if (disposed) return;
  state.editor.busy = false;
  if (fail) {
    state.editor.error = '模拟保存失败。草稿仍在此处，请检查内容后重试；列表中的原任务没有改变。'; renderEditor(); return;
  }
  const saved = { ...state.editor.draft, title: state.editor.draft.title.trim(), summary: state.editor.draft.summary.trim() };
  const editing = state.editor.mode === 'edit';
  if (editing) state.rows = state.rows.map(row => row.id === state.editor.id ? { ...row, ...saved } : row);
  else { state.rows = [{ id: `TASK-${String(nextId++).padStart(3, '0')}`, ...saved, archived: false }, ...state.rows]; state.tab = 'active'; state.filters = { query: '', status: '', owner: '' }; state.page = 1; state.sort = null; }
  state.preview = 'ready'; dismissEditor(); renderAll(); renderDetails();
  showNotification(editing ? '任务已在本页保存' : '任务已在本页创建', '结果仅保存在当前页面内存，重新加载页面后恢复初始数据。');
}
function openDetails(id) { state.detailId = id; renderDetails(); }
function closeDetails() { state.detailId = null; drawer.update({ open: false }); }
function renderDetails() {
  const row = state.rows.find(item => item.id === state.detailId);
  if (!row) { drawer.update({ open: false }); return; }
  const badge = make('div');
  detailBadge.update({ label: row.archived ? '已归档' : labelOf(statuses, row.status), tone: row.archived ? 'neutral' : toneOf(row.status) }); badge.append(detailBadge.element);
  const meta = make('dl', 'admin-detail-meta');
  for (const [label, value] of [['任务编号', row.id], ['负责人', labelOf(owners, row.owner)], ['截止日期', row.due], ['优先级', labelOf(priorities, row.priority)], ['归档状态', row.archived ? '已归档 · 可恢复' : '尚未归档']]) meta.append(make('dt', '', label), make('dd', '', value));
  detailHost.replaceChildren(make('h3', 'admin-detail-title', row.title), badge, make('p', 'admin-detail-summary', row.summary || '暂未填写任务说明。'), meta);
  detailEdit.element.hidden = row.archived; detailRestore.element.hidden = !row.archived;
  drawer.update({ open: true, description: `${row.id} · ${labelOf(owners, row.owner)}` });
}
function restoreTask() {
  const row = state.rows.find(item => item.id === state.detailId); if (!row?.archived) return;
  state.rows = state.rows.map(item => item.id === row.id ? { ...item, archived: false } : item);
  renderAll(); renderDetails(); showNotification('任务已在本页恢复', `“${row.title}”已移回全部任务。`);
}
function openArchive(keys) {
  const eligible = keys.filter(key => state.rows.some(row => row.id === key && !row.archived));
  if (!eligible.length) return;
  state.archive = { open: true, keys: eligible, busy: false, error: '' }; renderArchive();
}
function closeArchive() { if (state.archive.busy) return; state.archive.open = false; renderArchive(); }
function renderArchive() {
  const snapshot = state.archive;
  archiveNotice.element.hidden = !snapshot.error; archiveNotice.update({ message: snapshot.error });
  const copy = make('p', 'admin-archive-copy', `确定归档以下 ${snapshot.keys.length} 项任务？此操作仅修改当前页面内存中的虚构数据。`);
  const list = make('ul', 'admin-archive-list');
  snapshot.keys.slice(0, 5).forEach(key => { const row = state.rows.find(item => item.id === key); if (row) list.append(make('li', '', `${row.id} · ${row.title}`)); });
  if (snapshot.keys.length > 5) list.append(make('li', '', `以及另外 ${snapshot.keys.length - 5} 项任务`));
  archiveHost.replaceChildren(copy, list);
  archiveCancel.update({ disabled: snapshot.busy }); archiveConfirm.update({ loading: snapshot.busy, disabled: snapshot.busy, label: snapshot.error ? '重试归档' : `确认归档 ${snapshot.keys.length} 项` });
  archiveDialog.update({ open: snapshot.open, closeDisabled: snapshot.busy });
}
async function confirmArchive() {
  if (!state.archive.open || state.archive.busy) return;
  const fail = state.failSave; state.failSave = false; state.notification = null;
  state.archive.busy = true; state.archive.error = ''; renderArchive(); renderAll();
  await wait(550); if (disposed) return;
  state.archive.busy = false;
  if (fail) { state.archive.error = '模拟归档失败，任务与所选项目均已保留。可以直接重试。'; renderArchive(); return; }
  const keys = [...state.archive.keys];
  state.rows = state.rows.map(row => keys.includes(row.id) ? { ...row, archived: true } : row);
  state.selectedKeys = state.selectedKeys.filter(key => !keys.includes(key));
  closeArchive(); renderAll(); renderDetails(); showNotification('任务已在本页归档', `已归档 ${keys.length} 项虚构任务，可在归档记录中查看或恢复。`);
}

renderAll(); renderEditor(); renderArchive();
// The tuning adapter is loaded only inside the explicit, local experiment iframe.
if (new URLSearchParams(location.search).get('glass-lab') === '1' && window.parent !== window) {
  const { mountAdminGlassPreview } = await import('./glass-lab-preview.js');
  keep(mountAdminGlassPreview({root, editor, footer:[editorCancel.element, editorSave.element], openEditor() {
    newButton.element.focus(); openEditor();
  }}));
}
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  disposed = true; timers.forEach(timer => clearTimeout(timer)); timers.clear();
  viewport.removeEventListener('change', onViewportChange); root.removeEventListener('keydown', navigationKeys);
  instances.reverse().forEach(component => component.destroy()); badgeCache.clear();
});
