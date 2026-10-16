import { createGlassSurface } from '../components/ui.js';
import { DIALOG_PRESET } from '../material-presets.js';

const PAGES = [
  ['models', '模型', 'cube', '模型与执行'], ['agents', '智能体', 'bot', '模型与执行'], ['runtime', '运行时', 'layers', '模型与执行'],
  ['assistants', '助手', 'spark', '工具与连接'], ['connectors', '连接器', 'plug', '工具与连接'], ['commands', '命令', 'terminal', '工具与连接'],
  ['memory', '记忆', 'brain', '知识与偏好'], ['knowledge', '知识服务', 'book', '知识与偏好'], ['preferences', '偏好', 'sliders', '知识与偏好'],
];
const TABS = {
  models: ['服务模型', '云端模型', '大语言模型', '图像生成', '视频生成', '能力模型'],
  agents: ['本地智能体', '远端智能体', '上下文', '钩子', '子智能体'],
  memory: ['偏好', '上下文策略', '长期记忆', '本次使用', '候选审核'],
  preferences: ['偏好', '记忆收件箱', '运行追踪', '观察者', '音频'],
};
const PATHS = {
  cube: '<path d="m8 2 6 3.5v7L8 16l-6-3.5v-7L8 2Z"/><path d="m2 5.5 6 3.4 6-3.4M8 9v7"/>',
  bot: '<rect x="2" y="5" width="12" height="10" rx="3"/><path d="M8 2v3M5 9h.01M11 9h.01M5 12h6M0 9h2M14 9h2"/>',
  layers: '<path d="m8 2 7 4-7 4-7-4 7-4ZM1 10l7 4 7-4M1 14l7 4 7-4"/>',
  spark: '<path d="m8 1 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>',
  plug: '<path d="M5 1v4M11 1v4M3 5h10v3a5 5 0 0 1-10 0V5ZM8 13v3"/>',
  terminal: '<rect x="1" y="2" width="14" height="12" rx="2"/><path d="m4 6 3 2-3 2M9 10h3"/>',
  brain: '<path d="M8 3C5-1 1 3 3 6c-4 2-1 7 2 6 0 4 4 4 3 1V3ZM8 3c3-4 7 0 5 3 4 2 1 7-2 6 0 4-4 4-3 1"/>',
  book: '<path d="M8 4C4 1 1 2 1 2v12s3-1 7 1c4-2 7-1 7-1V2s-3-1-7 2ZM8 4v11"/>',
  sliders: '<path d="M2 1v4M2 9v6M8 1v8M8 13v2M14 1v2M14 7v8"/><path d="M0 5h4v4H0zM6 9h4v4H6zM12 3h4v4h-4z"/>',
  arrow: '<path d="m10 3-5 5 5 5M5 8h10"/>', search: '<circle cx="7" cy="7" r="5"/><path d="m11 11 4 4"/>',
  plus: '<path d="M8 2v12M2 8h12"/>', close: '<path d="m4 4 8 8M12 4l-8 8"/>', chevron: '<path d="m6 3 5 5-5 5"/>',
  refresh: '<path d="M14 7A6 6 0 0 0 3 4L1 6M1 2v4h4M2 9a6 6 0 0 0 11 3l2-2M15 14v-4h-4"/>',
  check: '<path d="m3 8 3 3 7-7"/>', more: '<circle cx="3" cy="8" r=".5"/><circle cx="8" cy="8" r=".5"/><circle cx="13" cy="8" r=".5"/>',
  edit: '<path d="m11 2 3 3-8 8-4 1 1-4 8-8ZM9 4l3 3"/>', copy: '<rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V2H2v9h3"/>',
};
const icon = name => `<svg class="gd-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.cube}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const tag = (text, tone = '') => `<span class="gd-tag ${tone ? `gd-tag--${tone}` : ''}">${esc(text)}</span>`;
const button = (text, action, attrs = '', tone = '') => `<button type="button" class="gw-button ${tone ? `gw-button--${tone}` : ''}" data-action="${action}" ${attrs}>${text}</button>`;
const select = (name, values, value, attrs = '') => `<select class="gd-control" name="${name}" ${attrs}>${values.map(x => { const [v, label] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}</select>`;
const toggle = (name, checked, label, attrs = '') => `<button type="button" class="gd-switch" role="switch" aria-checked="${Boolean(checked)}" aria-label="${esc(label)}" data-action="toggle" data-key="${name}" ${attrs}><span></span></button>`;
const input = (name, value = '', attrs = '') => `<input class="gd-control" name="${name}" value="${esc(value)}" ${attrs}>`;
const field = (label, content, help = '', full = false) => `<label class="gd-field ${full ? 'gd-field--full' : ''}"><span>${label}</span>${content}${help ? `<small>${help}</small>` : ''}</label>`;
const row = (title, description, control, attrs = '') => `<div class="gw-setting-row gd-row" ${attrs}><div class="gd-row-copy"><div class="gw-type-label">${title}</div>${description ? `<p class="gw-type-description">${description}</p>` : ''}</div><div class="gd-row-control">${control}</div></div>`;
const heading = (title, description = '', actions = '') => `<div class="gd-section-head"><div><h2 class="gw-type-section-title">${esc(title)}</h2>${description ? `<p class="gw-type-description">${description}</p>` : ''}</div>${actions ? `<div class="gd-actions">${actions}</div>` : ''}</div>`;
const panel = (title, description, body, actions = '') => `<section class="gw-panel">${heading(title, description, actions)}${body}</section>`;
const notice = (message, tone = '') => `<div class="gd-notice ${tone ? `gd-notice--${tone}` : ''}">${icon(tone === 'success' ? 'check' : 'spark')}<span>${message}</span></div>`;
const initialData = () => ({
  flags: { shared: true, persistent: false, multimodal: true, customRuntime: true, runtimeWeb: true, runtimeScript: false, imageEnabled: false, videoEnabled: false, hooks: false, contextPreload: true, longMemory: true, autoIndex: true, archiveMedia: false, knowledgeEnabled: false, knowledgeWrite: false, observer: false, inputNoise: true, outputAuto: false, advancedConnectors: false },
  values: { primaryModel: 'Atlas Chat', memoryModel: 'Atlas Lite', optionalModel: '未设置', contextMode: '均衡', contextStrategy: '自动选择', defaultRuntime: '内置运行时', memoryInterval: '15', memoryLimit: '12', knowledgeName: '示例知识服务', knowledgeTransport: 'HTTP', knowledgeEndpoint: 'https://knowledge.example', providerFilter: '', audioInput: '系统默认输入', audioOutput: '系统默认输出' },
  providers: [{ id: 'atlas', name: 'Atlas', description: '通用文本与推理模型', count: 4, enabled: true }, { id: 'horizon', name: 'Horizon', description: '长上下文与多模态能力', count: 3, enabled: false }, { id: 'local', name: '本地兼容服务', description: '连接已运行的兼容服务', count: 0, enabled: false }],
  agents: [{ id: 'general', name: '通用智能体', description: '处理日常问题与工作任务', enabled: true, builtIn: true }, { id: 'research', name: '研究智能体', description: '整理材料与形成结构化结论', enabled: true, builtIn: true }, { id: 'writer', name: '写作智能体', description: '润色表达与起草内容', enabled: false, builtIn: true }],
  remotes: [{ id: 'remote-1', name: '协作智能体', protocol: 'HTTP', endpoint: 'https://agent.example', description: '示例远端配置', status: '未连接' }],
  subagents: [{ id: 'review', name: '审阅助手', runtime: 'review', description: '检查表达与内容完整性', enabled: true, builtIn: true }, { id: 'outline', name: '提纲助手', runtime: 'outline', description: '把输入整理为清晰提纲', enabled: false, builtIn: false }],
  assistants: [{ id: 'a1', name: '通用助手', description: '一起梳理问题，推进下一步', enabled: true, builtIn: true, rules: '以清晰、可靠的方式回答。必要时先核对信息。' }, { id: 'a2', name: '阅读伙伴', description: '理解长文，提炼关键线索', enabled: true, builtIn: true, rules: '依据输入材料回答，并标记引用。' }, { id: 'a3', name: '写作搭档', description: '让每一次表达更有条理', enabled: false, builtIn: true, rules: '保留原意，使用自然的表达。' }, { id: 'a4', name: '项目助理', description: '整理任务，跟进关键里程碑', enabled: false, builtIn: false, rules: '输出可操作的任务清单。' }],
  connectors: [{ id: 'files', name: '文件连接器', description: '读取你主动选择的示例文件', protocol: '本地', enabled: true, configured: true }, { id: 'web', name: '网页连接器', description: '检索与整理公开网页内容', protocol: 'HTTP', enabled: false, configured: false }],
  commands: [{ id: 'c1', name: 'summarize', description: '提炼材料的核心要点', args: '<内容>', prompt: '请阅读以下内容并提炼关键要点。', scope: '全局', enabled: true }, { id: 'c2', name: 'review-v2', description: '检查结构、表达与遗漏', args: '<文本>', prompt: '请检查文本的结构与表达，给出具体改进建议。', scope: '当前工作区', enabled: true }],
  memories: [{ id: 'm1', title: '优先给出行动步骤', content: '说明复杂任务时，先列出可执行步骤，再补充原因。', category: '表达', scope: '全局', status: '生效', risk: '低', source: '手动添加' }, { id: 'm2', title: '使用简洁的中文', content: '回答以中文为主，专有名词保留原文。', category: '语言', scope: '全局', status: '待审阅', risk: '低', source: '示例候选' }, { id: 'm3', title: '保留资料来源', content: '研究结论附上可核对的来源。', category: '工作方式', scope: '当前工作区', status: '生效', risk: '低', source: '手动添加' }],
  dependency: false,
});

export function mountSettings(root, { onBack = () => {} } = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError('设置根容器不可用');
  const storageKey = 'glass-workbench-demo-settings-v1';
  let data = initialData();
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved) data = { ...data, ...saved, flags: { ...data.flags, ...saved.flags }, values: { ...data.values, ...saved.values } }; } catch { /* The demonstration also works without storage. */ }
  const ui = { page: 'models', tabs: {}, search: '', filters: {}, scope: '全部范围', status: '全部状态', category: '全部类别', assistantFilter: '全部', expandedSearch: false, expandedConnector: '', provider: '', mode: 'normal', overlay: null, busy: new Set(), knowledgeStatus: '尚未测试', pairStatus: '', candidateForm: false, tracePage: 1, saved: {} };
  let returnFocus = null;
  let toastTimer = null;
  let overlayMaterial = null;
  let dead = false;
  const timers = new Set();
  root.classList.add('settings-demo');
  root.innerHTML = `<div class="gw-settings"><aside class="gd-settings-sidebar gw-glass gw-glass--sidebar"><div class="gw-glass-backdrop" aria-hidden="true"></div><div class="gd-nav-top"><button type="button" class="gd-back gw-type-settings-title" data-action="back">${icon('arrow')}<span>设置</span></button><div class="gd-nav-search">${icon('search')}<input placeholder="搜索设置" aria-label="搜索设置" data-search="navigation"><button type="button" data-action="clear-navigation" aria-label="清空设置搜索">${icon('close')}</button></div></div><nav class="gw-settings-nav gd-nav-items" aria-label="设置导航"></nav><div class="gd-nav-bottom"><button type="button" data-action="back">${icon('arrow')}返回工作台</button><span class="gw-type-version">本地演示</span></div></aside><main class="gw-settings-main"><div class="gw-settings-content gd-content"></div></main></div><div class="gd-layer-host"></div><div class="gd-toast" role="status" aria-live="polite" hidden></div>`;
  const content = root.querySelector('.gd-content');
  const nav = root.querySelector('.gd-nav-items');
  const layer = root.querySelector('.gd-layer-host');
  const later = (fn, ms = 480) => { const timer = setTimeout(() => { timers.delete(timer); if (!dead) fn(); }, ms); timers.add(timer); return timer; };
  function toast(message, isError = false) { const el = root.querySelector('.gd-toast'); clearTimeout(toastTimer); el.textContent = message; el.classList.toggle('gd-toast--error', isError); el.hidden = false; toastTimer = setTimeout(() => { el.hidden = true; }, 3800); }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(data)); ui.storageWarning = false; return true; } catch { ui.storageWarning = true; toast('未持久保存：浏览器存储不可用，更改仅在本页保留。', true); return false; } }
  function save(label, fn, key = label) {
    if (ui.busy.has(key)) return;
    ui.busy.add(key); ui.saved[key] = '保存中'; renderContent();
    later(() => { ui.busy.delete(key); if (ui.mode === 'save-error') { ui.saved[key] = '保存失败'; toast('模拟保存失败，输入已保留。请重试。', true); } else { fn?.(); const persisted = persist(); ui.saved[key] = persisted ? '已保存' : '未持久保存 · 仅本页保留'; if (persisted) toast(`${label}已保存到此浏览器`); } renderContent(); });
  }
  const statusLabel = key => `<span class="gd-save-status ${ui.saved[key] === '保存失败' ? 'gd-text-danger' : ''}">${esc(ui.saved[key] || '')}</span>`;
  const activeTab = () => ui.tabs[ui.page] || 0;
  const listSearch = key => `<div class="gd-search">${icon('search')}<input type="search" placeholder="搜索${key === 'assistants' ? '助手' : key === 'providers' ? '供应商' : key === 'commands' ? '命令' : '条目'}" aria-label="搜索${key}" value="${esc(ui.filters[key] || '')}" data-search="${key}"></div>`;
  const filtered = (list, key) => list.filter(x => `${x.name || x.title} ${x.description || x.content || ''}`.toLowerCase().includes((ui.filters[key] || '').toLowerCase()));
  const empty = (title, description, action = '') => `<div class="gd-empty">${icon('search')}<strong>${title}</strong><p>${description}</p>${action}</div>`;
  function renderNav() {
    let group = '';
    const found = PAGES.filter(p => p[1].includes(ui.search) || p[3].includes(ui.search));
    nav.innerHTML = found.map(([id, label, symbol, section]) => `${section !== group ? (group = section, `<div class="gd-nav-group gw-type-settings-group">${section}</div>`) : ''}<button type="button" class="gw-type-nav" data-action="page" data-page="${id}" ${ui.page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></button>`).join('') || '<p class="gd-nav-no-results gw-type-description">没有匹配的设置</p>';
  }
  function tabs() { return TABS[ui.page] ? `<div class="gd-tabs" role="tablist" aria-label="${PAGES.find(x => x[0] === ui.page)[1]}分类">${TABS[ui.page].map((text, index) => `<button type="button" role="tab" id="gd-${ui.page}-tab-${index}" aria-selected="${activeTab() === index}" aria-controls="gd-page-panel" tabindex="${activeTab() === index ? 0 : -1}" class="gw-settings-tab" data-action="tab" data-tab="${index}">${text}</button>`).join('')}</div>` : ''; }
  function renderContent() {
    const focused = root.contains(document.activeElement) ? document.activeElement : null;
    const searchKey = focused?.dataset.search;
    const focusedName = focused?.name;
    const selection = focused?.selectionStart;
    const scrollTop = content.scrollTop;
    const renderers = { models: renderModels, agents: renderAgents, runtime: renderRuntime, assistants: renderAssistants, connectors: renderConnectors, commands: renderCommands, memory: renderMemory, knowledge: renderKnowledge, preferences: renderPreferences };
    const name = PAGES.find(x => x[0] === ui.page)[1];
    root.dataset.currentPage = name;
    content.innerHTML = `<div class="gw-stack">${tabs()}<div id="gd-page-panel" class="gw-stack" ${TABS[ui.page] ? `role="tabpanel" aria-labelledby="gd-${ui.page}-tab-${activeTab()}"` : ''}>${ui.storageWarning ? notice('未持久保存：当前更改仅在本页保留，关闭页面后会丢失。请恢复浏览器存储后重试保存。', 'warning') : ''}${ui.mode === 'read-error' ? notice('模拟读取失败。已有配置仍可查看。 ' + button('重试', 'retry-read'), 'warning') : ''}${renderers[ui.page]()}</div><details class="gd-demo-note"><summary>本地演示 · 更改仅保存在此浏览器</summary><div><span>预览不同状态</span>${select('demoMode', [['normal', '正常'], ['save-error', '模拟保存失败'], ['read-error', '模拟读取失败'], ['empty', '模拟空列表']], ui.mode, 'data-demo-mode')}${button('恢复示例数据', 'reset-demo')}</div><p>连接测试、配对与运行状态均为模拟，不访问网络。</p></details></div>`;
    content.scrollTop = scrollTop;
    if (searchKey && searchKey !== 'navigation') { const next = content.querySelector(`[data-search="${searchKey}"]`); next?.focus(); if (selection != null && next?.setSelectionRange) next.setSelectionRange(selection, selection); }
    else if (focusedName && !layer.contains(focused)) { const next = [...content.querySelectorAll('[name]')].find(x => x.name === focusedName); next?.focus({ preventScroll: true }); }
    root.dispatchEvent(new CustomEvent('settings-page-change', { bubbles: true, detail: { page: ui.page, title: name } }));
  }
  function modelChoice(name, value, attrs = '') { return select(name, ['Atlas Chat', 'Atlas Lite', 'Horizon Reason', '本地模型', '未设置'], value, attrs); }
  function renderModels() {
    const t = activeTab();
    if (t === 0) return `<p class="gw-type-description gd-page-intro">为不同任务选择合适的模型。每项修改单独保存。</p>${[
      ['通用模型', '用于日常对话、工具调用与内容处理。', [['主模型', '默认处理新对话中的请求。', 'primaryModel'], ['快速模型', '用于轻量处理与简短摘要。', 'quickModel']]],
      ['记忆模型', '用于整理对话中的长期信息。', [['记忆处理', '提取候选信息与生成摘要。', 'memoryModel']]],
      ['可选能力', '为需要特定能力的任务选择模型。', [['视觉理解', '处理图片与图文输入。', 'optionalModel']]],
    ].map(([title, description, items]) => panel(title, description, `<div class="gd-panel-rows">${items.map(([label, help, key]) => row(label, help, modelChoice(key, data.values[key] || 'Atlas Lite', `data-instant-value="${key}" aria-label="${label}"`))).join('')}</div>`, statusLabel(title))).join('')}`;
    if (t === 1) return `<p class="gw-type-description gd-page-intro">云端模型按账户授权提供。此处为本地演示账户与示例模型。</p><div class="gd-subtabs" role="group" aria-label="账户类型">${['个人', '组织'].map(x => button(x, 'cloud-scope', `data-value="${x}" aria-pressed="${(ui.cloudScope || '个人') === x}"`, (ui.cloudScope || '个人') === x ? 'selected' : '')).join('')}</div>${panel('示例账户', '此账户仅用于展示，不代表已登录真实服务。', `<div class="gd-account"><div class="gd-avatar">${icon('cube')}</div><div><strong>演示${ui.cloudScope === '组织' ? '组织' : '用户'}</strong><p class="gw-type-description">${ui.cloudScope === '组织' ? '共享模型目录 · 示例空间' : '个人模型目录 · 演示账户'}</p></div>${tag('模拟账户')}</div>`)}${panel('可用模型', '示例目录包含文本与多模态能力。', `<div class="gd-panel-rows">${['Atlas Chat', 'Atlas Lite', 'Horizon Vision'].map((x, i) => row(x, ['文本 · 工具调用', '快速响应 · 摘要', '图像理解 · 文本'][i], button(data.values.primaryModel === x ? '正在使用' : '设为主模型', 'use-model', `data-value="${x}" ${data.values.primaryModel === x ? 'disabled' : ''}`))).join('')}</div>`, button(`${icon('refresh')}刷新`, 'refresh', 'data-label="模型目录"'))}`;
    if (t === 2) {
      const providers = ui.mode === 'empty' ? [] : filtered(data.providers, 'providers');
      if (ui.provider) { const p = data.providers.find(x => x.id === ui.provider); if (!p) { ui.provider = ''; return renderModels(); } return `${button(`${icon('arrow')}全部供应商`, 'provider-back')}<form data-form="provider-config" data-id="${p.id}">${panel(p.name, '凭据仅在此浏览器中保留遮罩状态，不连接真实服务。', `<div class="gd-form-grid">${field('服务地址', input('endpoint', p.endpoint || 'https://api.example', 'type="url" required'), '', true)}${field('访问凭据', input('secret', '', 'type="password" autocomplete="new-password" placeholder="输入以替换已保存凭据"'), '已保存凭据不会回显。', true)}${field('默认模型', input('model', p.model || 'atlas-chat'), '', true)}</div><div class="gd-footer">${button('模拟连接测试', 'test-provider', `data-id="${p.id}"`)}<button type="submit" class="gw-button gw-button--primary">保存</button></div>`)} </form>`; }
      return `<div class="gd-provider-layout"><aside class="gd-provider-index">${listSearch('providers')}${button(`${icon('plus')}添加供应商`, 'new-provider')}<div>${data.providers.map(p => `<button type="button" data-action="provider-detail" data-id="${p.id}">${icon('cube')}<span>${esc(p.name)}</span>${icon('chevron')}</button>`).join('')}</div></aside><div class="gw-stack">${heading('模型供应商', '启用所需供应商后，为各个任务选择模型。')}<div class="gd-provider-grid">${providers.map(p => `<article class="gw-panel gd-provider-card"><div class="gd-card-head"><div class="gd-avatar">${icon('cube')}</div>${toggle(`provider:${p.id}`, p.enabled, `启用 ${p.name}`)}</div><h3>${esc(p.name)}</h3><p class="gw-type-description">${esc(p.description)}</p><div class="gd-card-bottom"><span class="gw-type-description">${p.count} 个模型</span>${button('设置', 'provider-detail', `data-id="${p.id}"`)}</div></article>`).join('') || empty(ui.filters.providers ? '没有匹配的供应商' : '尚未添加供应商', '调整搜索，或添加一个自定义供应商。')}</div></div></div>`;
    }
    if (t === 3 || t === 4) { const isImage = t === 3, key = isImage ? 'imageEnabled' : 'videoEnabled'; return `${panel(isImage ? '图像生成' : '视频生成', `为${isImage ? '图像' : '视频'}任务设置兼容接口。配置保存与服务连通状态分别确认。`, `<form data-form="media-config" data-kind="${isImage ? 'image' : 'video'}"><div class="gd-form-grid">${field('接口模式', select('mode', ['兼容接口', '本地服务'], data.values[`${key}Mode`] || '兼容接口'))}${field('模型名称', input('model', data.values[`${key}Model`] || (isImage ? 'image-standard' : 'video-standard')))}${field('服务地址', input('endpoint', data.values[`${key}Endpoint`] || 'https://media.example', 'type="url" required'), '', true)}${field('访问凭据', input('secret', '', 'type="password" placeholder="未设置" autocomplete="new-password"'), '演示不发送凭据或请求。', true)}</div><div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存配置</button></div></form>`, `${button('配置说明', 'help', `data-label="填写兼容服务的地址、凭据与模型名。此演示不会连接服务。"`)}${toggle(key, data.flags[key], `启用${isImage ? '图像' : '视频'}生成`)}`)}${!data.flags[key] ? notice(`开启后可在任务中选择${isImage ? '图像' : '视频'}生成能力。当前仍可编辑配置。`) : notice('已启用示例配置，尚未连接或测试真实服务。', 'warning')}`; }
    return `<div class="gd-capability-layout"><nav aria-label="能力模型目录" class="gd-capability-nav">${['上下文处理', '摘要生成', '语音识别', '语音合成', '离线语音'].map((x, i) => `<button type="button" data-action="section" data-target="cap-${i}">${x}</button>`).join('')}</nav><div class="gw-stack">${['上下文处理', '摘要生成', '语音识别', '语音合成', '离线语音'].map((x, i) => `<section id="cap-${i}" class="gw-panel">${heading(x, ['优化较长对话中的上下文选择。', '为阶段性内容生成简明摘要。', '将音频输入转换为文字。', '将文字响应转换为语音。', '使用已安装的本地语音能力。'][i])}${row('使用模型', '修改后即时保存到此浏览器。', modelChoice(`cap${i}`, data.values[`cap${i}`] || (i > 1 ? '未设置' : 'Atlas Lite'), `data-instant-value="cap${i}" aria-label="${x}模型"`))}${i === 4 ? notice('本地语音资源未安装。选择并安装资源后才能用于真实任务。') : ''}</section>`).join('')}</div></div>`;
  }
  function renderAgents() {
    const t = activeTab();
    if (t === 0) return `<div class="gd-intro-actions"><p class="gw-type-description">在本地运行与管理智能体。运行状态为本地演示数据。</p><div class="gd-actions">${button('识别运行环境', 'simulate', 'data-label="环境识别完成：当前为浏览器演示环境"')}${button('自检', 'simulate', 'data-label="模拟自检完成：配置结构有效，未启动进程"')}</div></div>${panel('内置运行时', '无需额外配置即可开始使用。', `<div class="gd-inline-line"><span class="gw-type-description">当前运行环境</span>${tag('浏览器演示')}${tag('模拟就绪', 'success')}</div>`)}${panel('运行状态', '控制本地智能体的共享与驻留策略。', `<div class="gd-status-layout"><div><div class="gd-status-title"><span class="gd-dot gd-dot--success"></span>示例运行状态</div><p class="gw-type-description">未启动真实进程；操作只更新演示状态。</p></div><div class="gw-inset">${row('允许共享', '', toggle('shared', data.flags.shared, '允许共享'))}${row('保持常驻', '', toggle('persistent', data.flags.persistent, '保持常驻'))}${button('模拟重启', 'simulate', 'data-label="模拟重启完成，未操作真实运行时"')}</div></div>`)}<form data-form="agent-model">${panel('主模型配置', '显式保存本组草稿。密码留空会保留已保存状态。', `<div class="gd-form-grid">${field('模型', modelChoice('model', data.values.agentModel || data.values.primaryModel))}${field('访问凭据', input('secret', '', 'type="password" placeholder="输入以替换" autocomplete="new-password"'))}${field('服务地址', input('endpoint', data.values.agentEndpoint || 'https://api.example', 'type="url" required'))}${field('模型名称', input('modelName', data.values.agentModelName || 'atlas-chat', 'required'))}</div><div class="gd-divider"></div>${row('多模态输入', '允许智能体接收图片等复合输入，开关即时保存。', toggle('multimodal', data.flags.multimodal, '多模态输入'))}<div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存配置</button></div>`, statusLabel('主模型配置'))}</form>${panel('本地智能体', '按任务选择需要启用的智能体。', `<div class="gd-agent-grid">${data.agents.map(a => `<article class="gw-inset gd-agent-item"><div class="gd-avatar">${icon('bot')}</div><div><h3>${a.name}</h3><p class="gw-type-description">${a.description}</p></div>${toggle(`agent:${a.id}`, a.enabled, `启用 ${a.name}`)}</article>`).join('')}</div>`)}`;
    if (t === 1) return `${heading('远端智能体', '连接其他运行位置的智能体。示例配置尚未连接。', button(`${icon('plus')}新增`, 'new-remote'))}<div class="gw-group">${data.remotes.map(a => `<div class="gw-setting-row gd-list-row"><div class="gd-avatar">${icon('bot')}</div><div class="gd-list-copy"><h3>${esc(a.name)}</h3><p class="gw-type-description">${esc(a.protocol)} · ${esc(a.description || a.endpoint)}</p></div>${tag(a.status)}${button('编辑', 'edit-remote', `data-id="${a.id}"`)}</div>`).join('') || empty('还没有远端智能体', '新增一个远端配置。', button('新增智能体', 'new-remote'))}</div>`;
    if (t === 2) return `<p class="gw-type-description gd-page-intro">控制智能体怎样组织上下文。此页选项修改后即时保存在本地。</p>${panel('上下文策略', '根据任务在响应速度与信息完整性之间选择。', `<div class="gd-panel-rows">${row('策略档位', '均衡适合大多数任务；完整保留更多历史信息。', select('contextMode', ['精简', '均衡', '完整'], data.values.contextMode, 'data-instant-value="contextMode" aria-label="策略档位"'))}${row('工具预加载', '开始对话时预载常用工具的描述。', toggle('contextPreload', data.flags.contextPreload, '工具预加载'))}</div>`)}${panel('能力目录', '为当前智能体选择可用能力。', `<div class="gd-check-grid">${['文件读取', '内容整理', '网页检索', '图像理解'].map((x, i) => `<label class="gd-check"><input type="checkbox" ${i < 2 ? 'checked' : ''} data-instant-check="capability${i}">${x}</label>`).join('')}</div>`)}${panel('附加提示', '提示会在新任务中生效。', `<form data-form="context-prompt">${field('提示内容', `<textarea class="gd-control" name="prompt" rows="5" placeholder="添加面向所有任务的补充说明">${esc(data.values.contextPrompt || '')}</textarea>`, '', true)}<div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存提示</button></div></form>`)}<details class="gd-info-details"><summary>这些设置在何时生效？</summary><p>本地保存后用于后续演示任务；已打开的内容不会自动重写。</p></details>`;
    if (t === 3) return `${notice('此处仅管理示例规则，尚未接入真实事件。')}${panel('事件钩子', '在任务的不同阶段执行规则。总开关即时保存。', row('启用钩子', '关闭时保留规则，但不触发。', toggle('hooks', data.flags.hooks, '启用钩子')))}<div class="gd-toolbar">${select('hookScope', ['全部作用域', '当前工作区'], '全部作用域', 'aria-label="钩子作用域"')}${select('hookAgent', ['全部智能体', '通用智能体', '研究智能体'], '全部智能体', 'aria-label="钩子智能体"')}</div>${['任务开始前', '工具调用后', '任务完成后'].map((x, i) => panel(x, '规则仅保存在本地演示中。', row(['输入检查', '结果记录', '生成摘要'][i], data.flags.hooks ? '已启用示例规则' : '总开关已关闭', toggle(`hook${i}`, Boolean(data.flags[`hook${i}`]), `启用${x}规则`, data.flags.hooks ? '' : 'disabled')))).join('')}`;
    return `${notice('子智能体负责独立的小任务。配置将在后续新任务中生效，不会触发重启。')}${heading('子智能体', '为明确的任务定义专用执行规则。', button(`${icon('plus')}新增子智能体`, 'new-subagent'))}${['自定义', '内置'].map(group => panel(group, '', `<div class="gd-panel-rows">${data.subagents.filter(a => a.builtIn === (group === '内置')).map(a => `<div class="gw-setting-row gd-list-row"><div class="gd-list-copy"><h3>${esc(a.name)} <code>${esc(a.runtime)}</code></h3><p class="gw-type-description">${esc(a.description)}</p></div>${toggle(`subagent:${a.id}`, a.enabled, `启用 ${a.name}`)}${button(a.builtIn ? '预览' : '编辑', 'edit-subagent', `data-id="${a.id}"`)}${button(a.builtIn ? '复制' : '删除', a.builtIn ? 'copy-subagent' : 'delete-item', `data-collection="subagents" data-id="${a.id}"`, a.builtIn ? '' : 'danger')}</div>`).join('') || '<p class="gw-type-description">暂无自定义子智能体。</p>'}`)).join('')}`;
  }
  function renderRuntime() { return `<p class="gw-type-description gd-page-intro">选择任务可以使用的运行时。勾选与开关修改后即时保存在此浏览器。</p><div class="gw-group">${row('默认运行时', '内置运行时始终可用。', tag('内置运行时 · 默认'))}${row('自定义运行时', '启用后，可选择额外的执行环境。', toggle('customRuntime', data.flags.customRuntime, '自定义运行时'))}</div>${data.flags.customRuntime ? panel('可用运行时', '仅使用已准备好的环境。扫描为本地状态演示。', `<div class="gd-panel-rows">${[['内置运行时', true, true, '默认'], ['网页运行时', data.flags.runtimeWeb, true, '可用'], ['脚本运行时', data.flags.runtimeScript, true, '可用'], ['容器运行时', false, false, '不可用']].map(([name, checked, available, label], i) => `<div class="gw-setting-row gd-list-row"><label class="gd-check gd-list-copy"><input type="checkbox" data-instant-check="${i === 1 ? 'runtimeWeb' : 'runtimeScript'}" ${checked ? 'checked' : ''} ${i === 0 || !available ? 'disabled' : ''}>${name}</label>${tag(label, available && i > 0 ? 'success' : '')}</div>`).join('')}</div>`, button(`${icon('refresh')}刷新`, 'refresh', 'data-label="运行时列表"')) : ''}`; }
  function renderAssistants() {
    const all = ui.mode === 'empty' ? [] : filtered(data.assistants, 'assistants').filter(a => ui.assistantFilter === '全部' || a.builtIn === (ui.assistantFilter === '内置'));
    const card = a => `<article class="gd-assistant-card" tabindex="0" role="button" aria-label="查看 ${esc(a.name)}" data-action="edit-assistant" data-id="${a.id}"><div class="gd-avatar">${icon(a.id === 'a2' ? 'book' : 'spark')}</div><div class="gd-assistant-copy"><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p></div><button type="button" class="gd-icon-button gd-assistant-settings" data-action="edit-assistant" data-id="${a.id}" aria-label="设置 ${esc(a.name)}">${icon('sliders')}</button><div class="gd-assistant-toggle">${toggle(`assistant:${a.id}`, a.enabled, `启用 ${a.name}`)}</div><button type="button" class="gd-icon-button gd-assistant-copy-action" data-action="copy-assistant" data-id="${a.id}" aria-label="复制 ${esc(a.name)}">${icon('copy')}</button></article>`;
    return `<div class="gd-toolbar gd-toolbar--end">${button('导入', 'import-assistant')}${button(`${icon('plus')}创建助手`, 'new-assistant', '', 'primary')}<input type="file" accept="application/json,.json" data-import-file hidden></div><div class="gd-intro-actions"><p class="gw-type-description">助手将规则与能力组合为面向任务的入口。</p>${button(`${icon('search')}搜索`, 'toggle-assistant-search', `aria-expanded="${ui.expandedSearch}"`)}</div>${ui.expandedSearch ? listSearch('assistants') : ''}<div class="gd-filter-pills" role="group" aria-label="助手类型">${['全部', '内置', '自定义'].map(x => button(x, 'assistant-filter', `data-value="${x}" aria-pressed="${ui.assistantFilter === x}"`)).join('')}</div>${all.length ? [true, false].map(enabled => { const items = all.filter(a => a.enabled === enabled); return items.length ? `<section>${heading(enabled ? '已启用' : '未启用', `${items.length} 个助手`)}<div class="gd-assistant-grid">${items.map(card).join('')}</div></section>` : ''; }).join('') : empty(ui.filters.assistants ? '没有匹配的助手' : '暂无助手', '调整筛选，或创建你的第一个助手。', !ui.filters.assistants ? button('创建助手', 'new-assistant') : '')}`;
  }
  function renderConnectors() {
    const list = ui.mode === 'empty' ? [] : filtered(data.connectors, 'connectors');
    return `${heading('协议连接管理', '管理工具协议与外部能力。保存配置不会自动代表连接成功。', `${button(`${icon('refresh')}刷新`, 'refresh', 'data-label="连接器列表"')}${button(`${icon('plus')}新增`, 'new-connector')}`)}<div class="gw-group">${list.map(c => `<div class="gw-setting-row gd-list-row"><div class="gd-avatar">${icon('plug')}</div><div class="gd-list-copy"><h3>${esc(c.name)}</h3><p class="gw-type-description">${esc(c.description)}</p></div><span class="gd-status"><span class="gd-dot ${c.enabled ? 'gd-dot--success' : ''}"></span>${c.enabled ? '示例就绪' : '未连接'}</span>${button('详情', 'expand-connector', `data-id="${c.id}" aria-expanded="${ui.expandedConnector === c.id}"`)}<div class="gd-more-wrap">${button(icon('more'), 'connector-more', `data-id="${c.id}" aria-label="${esc(c.name)}更多操作" aria-expanded="${ui.connectorMenu === c.id}"`)}${ui.connectorMenu === c.id ? `<div class="gd-more-menu" role="menu"><button type="button" role="menuitem" data-action="edit-connector" data-id="${c.id}">编辑配置</button><button type="button" role="menuitem" data-action="test-connector" data-id="${c.id}">模拟连接测试</button><button type="button" role="menuitem" class="gd-text-danger" data-action="delete-item" data-collection="connectors" data-id="${c.id}">删除 ${esc(c.name)}</button></div>` : ''}</div></div>${ui.expandedConnector === c.id ? `<div class="gd-connector-detail"><div class="gd-inline-line">${tag(c.protocol)}${tag(c.configured ? '配置已保存' : '待配置')}</div><p class="gw-type-description">此为本地模拟连接器，没有访问任何服务或文件。</p>${row('启用连接器', '启用状态仅用于此演示。', toggle(`connector:${c.id}`, c.enabled, `启用 ${c.name}`))}</div>` : ''}`).join('') || empty('没有连接器', '新增连接器来配置需要的能力。', button('新增连接器', 'new-connector'))}</div>${panel('本地依赖', '部分本地连接器需要附加运行环境。', row('工具运行环境', data.dependency ? '示例依赖已经准备就绪。' : '未安装 · 此演示仅模拟准备流程。', `${tag(data.dependency ? '就绪' : '未安装', data.dependency ? 'success' : '')}${button(data.dependency ? '重新检查' : '准备示例依赖', 'dependency', ui.busy.has('dependency') ? 'disabled' : '')}`))}<details class="gd-advanced"><summary>高级设置</summary><div class="gw-panel">${row('实验性工具发现', data.dependency ? '允许展示更多可用工具。' : '需要先准备工具运行环境。', toggle('advancedConnectors', data.flags.advancedConnectors, '实验性工具发现', data.dependency ? '' : 'disabled'))}</div></details>${panel('连接器目录', '按需要添加新的能力。', `${listSearch('connectors')}<div class="gd-catalog-grid">${[['日历', '读取与整理日程信息', 'book'], ['笔记', '搜索并整理个人笔记', 'edit'], ['数据查询', '查询结构化示例数据', 'layers']].filter(x => x[0].includes(ui.filters.connectors || '') || x[1].includes(ui.filters.connectors || '')).map(([name, desc, symbol]) => `<article class="gw-inset"><div class="gd-avatar">${icon(symbol)}</div><h3>${name}</h3><p class="gw-type-description">${desc}</p>${button('添加', 'catalog-connector', `data-name="${name}"`)}</article>`).join('') || '<p class="gw-type-description">没有匹配的目录条目。</p>'}</div>`)}`;
  }
  function renderCommands() {
    const list = (ui.mode === 'empty' ? [] : filtered(data.commands, 'commands')).filter(x => ui.scope === '全部范围' || x.scope === ui.scope);
    return `<div class="gd-toolbar"><div class="gd-actions">${select('commandScope', ['全部范围', '全局', '当前工作区'], ui.scope, 'data-command-scope aria-label="命令作用域"')}<span class="gw-type-description">${list.length} 个命令</span></div><div class="gd-actions">${listSearch('commands')}${button(`${icon('plus')}新建命令`, 'new-command', '', 'primary')}</div></div><p class="gw-type-description gd-page-intro">命令会将预设提示插入任务。全局命令可用于所有示例工作区。</p>${list.length ? `<div class="gw-group">${list.map(c => `<div class="gw-setting-row gd-list-row"><div class="gd-command-symbol">${icon('terminal')}</div><div class="gd-list-copy"><h3 class="gd-command-name">/${esc(c.name)} <span>${esc(c.args)}</span></h3><p class="gw-type-command-description">${esc(c.description)}</p></div>${toggle(`command:${c.id}`, c.enabled, `启用 /${c.name}`)}${button('编辑', 'edit-command', `data-id="${c.id}"`)}${button('删除', 'delete-item', `data-collection="commands" data-id="${c.id}"`, 'danger')}</div>`).join('')}</div>` : empty(ui.filters.commands ? '没有匹配的命令' : '还没有命令', ui.filters.commands ? '尝试其他关键词，或调整作用域。' : '把常用的提示保存为命令，方便随时使用。', ui.filters.commands ? '' : button('新建命令', 'new-command', '', 'primary'))}`;
  }
  function memoryCards(list, editable = false) { return list.map(m => `<article class="gw-panel gd-memory-card"><div class="gd-tags">${tag(m.status, m.status === '生效' ? 'success' : m.status === '待审阅' ? 'warning' : '')}${tag(m.category)}${tag(m.scope)}${tag(m.source)}${m.risk ? tag(`${m.risk}风险`) : ''}</div><h3>${esc(m.title)}</h3><p class="gd-memory-copy">${esc(m.content)}</p><div class="gd-card-bottom"><span class="gw-type-description">示例证据 · 今天 09:30</span><div class="gd-actions">${editable ? button('编辑', 'edit-memory', `data-id="${m.id}"`) : ''}${m.status !== '生效' ? button('接受', 'memory-status', `data-id="${m.id}" data-status="生效"`) : ''}${m.status !== '忽略' ? button('忽略', 'memory-status', `data-id="${m.id}" data-status="忽略"`) : ''}</div></div></article>`).join(''); }
  function renderMemory() {
    const t = activeTab();
    if (t === 0) return `${heading('记忆偏好', '查看从示例对话中整理的偏好与来源。', button(`${icon('refresh')}刷新`, 'refresh', 'data-label="记忆偏好"'))}${ui.mode === 'empty' ? empty('还没有记忆偏好', '新的偏好条目会显示在这里。') : memoryCards(data.memories)}`;
    if (t === 1) return `${panel('上下文诊断', '示例诊断用于解释当前策略，不连接真实运行时。', `<div class="gd-diagnostic-grid">${[['状态', '示例健康'], ['上下文占用', '24%'], ['最近压缩', '暂无'], ['策略版本', '本地配置']].map(([label, value]) => `<div class="gw-inset"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>`, tag('模拟健康', 'success'))}<form data-form="memory-policy">${panel('上下文策略', '此组开关与选择项为草稿，保存后生效。', `<div class="gd-panel-rows">${row('运行模式', '选择历史信息的保留方式。', select('mode', ['均衡', '完整', '精简'], data.values.memoryMode || '均衡'))}${row('候选策略', '决定哪些信息可以参与任务。', select('policy', ['仅生效记忆', '生效与待审阅', '全部可用'], data.values.memoryPolicy || '仅生效记忆'))}${row('允许自动压缩', '上下文较长时生成摘要。', `<label class="gd-check"><input type="checkbox" name="compress" ${data.values.memoryCompress !== false ? 'checked' : ''}>开启</label>`)}</div>${notice('选择待审阅内容可能引入尚未确认的信息，请按任务需要使用。', 'warning')}<div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存策略</button></div>`)}</form>`;
    if (t === 2) return `${panel('长期记忆', '保留可复用的信息，并在后续任务中检索。', row('启用长期记忆', '开关即时保存；其余字段显式保存。', toggle('longMemory', data.flags.longMemory, '启用长期记忆')))}${notice(`关联模型：${esc(data.values.memoryModel)}。当前为本地示例索引，不包含真实对话资料。`)}<form data-form="long-memory">${panel('索引与归档', '', `<div class="gd-panel-rows">${row('自动索引', '定期整理新加入的示例条目。', `<label class="gd-check"><input type="checkbox" name="autoIndex" ${data.flags.autoIndex ? 'checked' : ''}>开启</label>`)}</div><div class="gd-form-grid">${field('索引间隔（分钟）', input('interval', data.values.memoryInterval, 'type="number" min="1" max="1440" required'))}${field('检索条目上限', input('limit', data.values.memoryLimit, 'type="number" min="1" max="100" required'))}</div>${row('多模态归档', '允许示例图片描述进入归档。', `<label class="gd-check"><input type="checkbox" name="archiveMedia" ${data.flags.archiveMedia ? 'checked' : ''}>开启</label>`)}<div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存设置</button></div>`)}</form>${panel('索引状态', '刷新查看状态；重建会重新整理本地示例索引。', `<div class="gd-inline-line">${tag('示例索引')}${tag(`${data.memories.length} 个条目`)}</div><div class="gd-footer">${button('刷新状态', 'refresh', 'data-label="索引状态"')}${button('模拟检索测试', 'simulate', 'data-label="模拟检索完成：找到 2 条示例记忆，未调用真实模型"')}${button('重建示例索引', 'rebuild-memory')}</div>`)}`;
    if (t === 3) return `${heading('本次使用', '查看本地示例任务选择或抑制记忆的原因。', button(`${icon('refresh')}刷新`, 'refresh', 'data-label="使用记录"'))}<div class="gd-stat-grid">${[['选中', '2'], ['抑制', '1'], ['错误', '0'], ['使用轮次', '1']].map(([label, value]) => `<div class="gw-inset"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>${ui.tracePage === 1 && ui.mode !== 'empty' ? panel('示例任务 · 内容整理', '这是预置的使用追踪，不代表真实模型调用。', `<div class="gd-panel-rows">${row('优先给出行动步骤', '与当前任务相关，作为生效偏好选中。', tag('选中', 'success'))}${row('使用简洁的中文', '尚待审阅，本次不参与上下文。', tag('抑制'))}</div>`) : empty('此页没有使用记录', '使用记录为空不代表调用失败。')}<div class="gd-pagination">${button('上一页', 'trace-page', `data-value="-1" ${ui.tracePage === 1 ? 'disabled' : ''}`)}<span>第 ${ui.tracePage} / 2 页</span>${button('下一页', 'trace-page', `data-value="1" ${ui.tracePage === 2 ? 'disabled' : ''}`)}</div>`;
    const candidates = data.memories.filter(m => m.status === '待审阅');
    return `${heading('候选审核', `${candidates.length} 条待审阅。接受后才会作为生效记忆。`, `${button(`${icon('plus')}手动添加`, 'add-candidate')}${button(`${icon('refresh')}刷新`, 'refresh', 'data-label="候选记录"')}`)}${ui.candidateForm ? `<form class="gw-panel" data-form="candidate">${heading('添加记忆候选')}<div class="gd-form-grid">${field('标题', input('title', '', 'required'), '', true)}${field('内容', '<textarea class="gd-control" name="content" rows="4" required></textarea>', '', true)}</div><div class="gd-footer">${button('取消', 'cancel-candidate')}<button type="submit" class="gw-button gw-button--primary">提交候选</button></div></form>` : ''}${candidates.length && ui.mode !== 'empty' ? memoryCards(candidates) : empty('没有待审核候选', '新的候选记忆会出现在这里。')}`;
  }
  function renderKnowledge() { return `<p class="gw-type-description gd-page-intro">连接用于检索与写入知识的服务。此演示保存本地配置，连接诊断只模拟结果。</p><form data-form="knowledge">${panel('服务配置', '保存不会自动确认连接；可单独保存或保存并模拟测试。', `<div class="gd-form-grid">${field('服务名称', input('name', data.values.knowledgeName, 'required'))}${field('传输协议', select('transport', ['HTTP', '本地进程'], data.values.knowledgeTransport))}${field('服务地址', input('endpoint', data.values.knowledgeEndpoint, 'type="url" required'), '使用示例地址，不会向地址发送请求。', true)}${field('访问凭据', input('secret', '', 'type="password" autocomplete="new-password" placeholder="输入以替换凭据"'), '已保存的凭据不回显。', true)}</div><div class="gd-knowledge-footer"><div class="gd-inline-line">${toggle('knowledgeEnabled', data.flags.knowledgeEnabled, '启用知识服务')}<span>启用服务</span></div><div class="gd-actions">${button('删除配置', 'delete-knowledge', '', 'danger')}<button type="submit" name="intent" value="test" class="gw-button" ${ui.busy.has('knowledge') ? 'disabled' : ''}>保存并模拟测试</button><button type="submit" name="intent" value="save" class="gw-button gw-button--primary" ${ui.busy.has('knowledge') ? 'disabled' : ''}>${ui.busy.has('knowledge') ? '保存中…' : '保存'}</button></div></div>`, statusLabel('knowledge'))}</form>${panel('写入模式', '', row('允许写入', '关闭后，仅允许从服务检索信息。开关即时保存。', toggle('knowledgeWrite', data.flags.knowledgeWrite, '允许知识写入')))}${panel('连接诊断', '模拟检查配置，不访问真实服务。', `<div class="gd-diagnostic-grid"><div class="gw-inset"><span>运行时</span><strong>浏览器演示</strong></div><div class="gw-inset"><span>知识状态</span><strong>${esc(ui.knowledgeStatus)}</strong></div></div><div class="gd-panel-rows">${row(esc(data.values.knowledgeName || '未配置服务'), '示例配置 · 无真实网络连接', tag(data.flags.knowledgeEnabled ? '已启用配置' : '未连接'))}</div>`, button(`${icon('refresh')}刷新`, 'knowledge-refresh'))}`; }
  function preferenceList(inbox = false) {
    const search = ui.filters.preferences || '';
    let list = data.memories.filter(m => (inbox ? m.status === '待审阅' : true) && (ui.status === '全部状态' || ui.status === m.status) && (ui.category === '全部类别' || ui.category === m.category) && `${m.title} ${m.content}`.includes(search));
    if (ui.mode === 'empty') list = [];
    return `<div class="gd-preference-filters">${listSearch('preferences')}${select('prefStatus', ['全部状态', '生效', '待审阅', '忽略'], ui.status, 'data-pref-status aria-label="状态筛选"')}${select('prefCategory', ['全部类别', '表达', '语言', '工作方式'], ui.category, 'data-pref-category aria-label="类别筛选"')}</div>${list.length ? memoryCards(list, true) : empty(search || ui.status !== '全部状态' ? '没有匹配的条目' : inbox ? '记忆收件箱为空' : '还没有偏好', '调整筛选，或添加一条偏好。')}`;
  }
  function renderPreferences() {
    const t = activeTab();
    if (t === 4) return `<p class="gw-type-description gd-page-intro">选择音频输入与输出设备。设置即时保存到此浏览器；设备列表为示例。</p>${panel('输入设备', '用于语音输入与音频转写。', `<div class="gd-panel-rows">${row('麦克风', '选择希望使用的输入设备。', select('audioInput', ['系统默认输入', '内置麦克风', '外部音频输入'], data.values.audioInput, 'data-instant-value="audioInput" aria-label="麦克风设备"'))}${row('背景降噪', '降低稳定的环境噪声。', toggle('inputNoise', data.flags.inputNoise, '背景降噪'))}</div>`)}${panel('输出设备', '用于朗读助手的文字响应。', `<div class="gd-panel-rows">${row('扬声器', '选择希望使用的输出设备。', select('audioOutput', ['系统默认输出', '内置扬声器', '外部音频输出'], data.values.audioOutput, 'data-instant-value="audioOutput" aria-label="扬声器设备"'))}${row('自动朗读', '新的示例响应完成后自动朗读。', toggle('outputAuto', data.flags.outputAuto, '自动朗读'))}${row('音频目录', '目录名称仅用于演示，不访问本地文件系统。', input('audioDirectory', data.values.audioDirectory || '音频资料', 'data-instant-value="audioDirectory" aria-label="音频目录"'))}</div>`)}`;
    const total = data.memories.length;
    const top = `<div class="gd-intro-actions"><p class="gw-type-description">管理长期偏好、候选记忆与观察者策略。</p><div class="gd-actions">${button(`${icon('refresh')}刷新`, 'refresh', 'data-label="偏好"')}${button(`${icon('plus')}新增偏好`, 'new-memory', '', 'primary')}</div></div><div class="gd-stat-grid">${[['生效', data.memories.filter(m => m.status === '生效').length], ['待审阅', data.memories.filter(m => m.status === '待审阅').length], ['忽略', data.memories.filter(m => m.status === '忽略').length], ['总数', total]].map(([label, value]) => `<div class="gw-inset"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>${notice('偏好用于引导后续任务。请确认候选内容后再接受。')}`;
    if (t < 2) return top + preferenceList(t === 1);
    if (t === 2) return `${top}${panel('运行追踪', '观察者尚未运行。运行记录与偏好条目分别管理。', empty('暂无运行记录', '开启观察者并产生新任务后，记录会显示在这里。', button('刷新记录', 'refresh', 'data-label="运行记录"')))}`;
    return `${top}<form data-form="observer">${panel('观察者配置', '从新任务中识别可复用的偏好与记忆候选。', `${row('启用观察者', '本地开关即时保存；下方参数显式保存。', toggle('observer', data.flags.observer, '启用观察者'))}<div class="gd-form-grid">${field('模型模式', select('modelMode', ['跟随主模型', '指定模型'], data.values.observerModelMode || '跟随主模型', 'data-observer-mode'))}${field('候选策略', select('policy', ['提交审核', '仅低风险自动生效'], data.values.observerPolicy || '提交审核'))}<div class="gd-field ${data.values.observerModelMode !== '指定模型' ? 'gd-hidden' : ''}" data-observer-model><span>观察者模型</span>${modelChoice('model', data.values.observerModel || 'Atlas Lite')}</div>${field('超时（秒）', input('timeout', data.values.observerTimeout || '30', 'type="number" min="5" max="300" required'))}${field('观察延迟（秒）', input('delay', data.values.observerDelay || '10', 'type="number" min="0" max="600" required'))}${field('每轮消息上限', input('limit', data.values.observerLimit || '20', 'type="number" min="1" max="100" required'))}</div>${notice('自动生效可能影响后续任务。建议先使用提交审核。', 'warning')}<div class="gd-footer"><button type="submit" class="gw-button gw-button--primary">保存配置</button></div>`)}</form>${panel('观察任务', '任务列表独立于配置保存。', empty('当前没有观察任务', '此演示未接入真实消息流。'), button(`${icon('refresh')}刷新`, 'refresh', 'data-label="观察任务"'))}`;
  }
  function openOverlay(type, item = null, extra = {}) {
    returnFocus = { el: document.activeElement, action: document.activeElement?.dataset.action, id: document.activeElement?.dataset.id };
    ui.overlay = { type, item, ...extra };
    ui.pairStatus = '';
    renderOverlay();
    later(() => layer.querySelector('input:not([disabled]):not([readonly]), textarea:not([readonly]), select:not([disabled]), button')?.focus(), 0);
  }
  function closeOverlay() {
    if (ui.overlay?.saving) return;
    ui.overlay = null; overlayMaterial?.destroy(); overlayMaterial = null; layer.innerHTML = '';
    const target = returnFocus?.el?.isConnected ? returnFocus.el : [...root.querySelectorAll('[data-action]')].find(el => el.dataset.action === returnFocus?.action && el.dataset.id === returnFocus?.id);
    (target || root.querySelector('.gw-settings-nav [aria-current]'))?.focus({ preventScroll: true });
  }
  function renderOverlay() {
    overlayMaterial?.destroy(); overlayMaterial = null;
    const o = ui.overlay;
    if (!o) { layer.innerHTML = ''; return; }
    const item = o.item || {};
    const isAssistant = o.type === 'assistant', isMemory = o.type === 'memory';
    const drawer = isAssistant || isMemory;
    const readOnly = (isAssistant || o.type === 'subagent') && item.builtIn;
    const readonly = readOnly ? 'readonly' : '';
    const disabled = readOnly ? 'disabled' : '';
    const title = ({ command: item.id ? '编辑命令' : '新建命令', provider: '添加模型供应商', remote: item.id ? '编辑远端智能体' : '新增远端智能体', subagent: item.builtIn ? '预览子智能体' : item.id ? '编辑子智能体' : '新增子智能体', assistant: item.id ? '助手设置' : '创建助手', connector: item.id ? '连接器配置' : '新增连接器', memory: item.id ? '编辑偏好' : '新增偏好', confirm: o.title || '确认操作', help: '配置说明' })[o.type];
    let body = '';
    if (o.type === 'confirm') body = `<p class="gd-confirm-copy">${o.message}</p>${o.description ? `<p class="gw-type-description">${o.description}</p>` : ''}`;
    if (o.type === 'help') body = `<p class="gd-confirm-copy">${esc(o.message)}</p>`;
    if (o.type === 'command') body = `<div class="gd-form-grid">${field('命令名称', `<div class="gd-prefixed-input"><span>/</span>${input('name', item.name, `${item.id ? 'readonly' : ''} autocomplete="off" maxlength="80" required`)}</div>`, '以小写字母或数字开头，可用短横线、下划线与冒号分组。', true)}${field('描述', input('description', item.description, 'maxlength="160"'), '', true)}${field('参数提示', input('args', item.args, 'placeholder="例如 <内容>"'), '', true)}${field('提示内容', `<textarea class="gd-control gd-code-text" name="prompt" rows="8" required placeholder="写下这条命令需要执行的指令">${esc(item.prompt)}</textarea>`, '命令名称与提示内容不能为空。', true)}${field('作用域', select('scope', ['全局', '当前工作区'], item.scope || '全局'), '', true)}</div>`;
    if (o.type === 'provider') body = `<div class="gd-form-grid">${field('供应商名称', input('name', '', 'required placeholder="例如 自定义服务"'), '', true)}${field('接口类型', select('protocol', ['兼容接口', '本地服务'], '兼容接口'), '', true)}${field('服务地址', input('endpoint', 'https://api.example', 'type="url" required'), '', true)}${field('访问凭据', input('secret', '', 'type="password" autocomplete="new-password"'), '此演示只保留已配置状态，不保存凭据明文。', true)}</div>`;
    if (o.type === 'remote') body = `<div class="gd-form-grid">${field('名称', input('name', item.name, 'required'))}${field('连接协议', select('protocol', ['HTTP', '配对码'], item.protocol || 'HTTP', 'data-remote-protocol'))}${field('描述', input('description', item.description), '', true)}<div class="gd-field gd-field--full ${item.protocol === '配对码' ? 'gd-hidden' : ''}" data-remote-http><span>服务地址</span>${input('endpoint', item.endpoint || 'https://agent.example', 'type="url"')}<small>配置保存与连接状态分别确认。</small></div><div class="gd-field gd-field--full ${item.protocol !== '配对码' ? 'gd-hidden' : ''}" data-remote-pair><span>配对码</span>${input('pairCode', '', 'placeholder="输入示例配对码"')}<div class="gd-inline-line">${button('发起模拟配对', 'pair-start')}<span class="gw-type-description" data-pair-status>未发起</span></div><div class="gd-actions">${button('取消配对', 'pair-cancel')}${button('重新检查', 'pair-retry')}</div><small>模拟配对会停在待批准状态，可取消或重新检查。</small></div></div>`;
    if (o.type === 'subagent') body = `${readOnly ? notice('此为内置子智能体，只读预览。复制后可编辑。') : ''}<div class="gd-form-grid">${field('显示名称', input('name', item.name, `required ${readonly}`))}${field('运行名称', input('runtime', item.runtime, `required ${readonly}`))}${field('描述', input('description', item.description, readonly), '', true)}${field('规则', `<textarea class="gd-control gd-code-text" name="rules" rows="6" ${readonly}>${esc(item.rules || '依据任务输入完成指定工作，输出清晰结果。')}</textarea>`, '', true)}${field('允许工具', input('allowTools', item.allowTools || '读取、检索', readonly))}${field('禁止工具', input('denyTools', item.denyTools || '', readonly))}${field('模型', modelChoice('model', item.model || 'Atlas Lite', disabled))}${field('最大轮数', input('rounds', item.rounds || '8', `type="number" min="1" max="100" ${readonly}`))}<label class="gd-check gd-field--full"><input type="checkbox" name="background" ${item.background ? 'checked' : ''} ${disabled}>允许后台运行</label></div>`;
    if (isAssistant) body = `${readOnly ? notice('内置助手的规则只读。可以复制为自定义助手后编辑。') : notice('保存后更新本地助手配置；取消会丢弃本次编辑。')}<div class="gd-avatar gd-avatar--large">${icon('spark')}</div><div class="gd-form-grid">${field('名称', input('name', item.name, `required ${readonly}`), '', true)}${field('描述', input('description', item.description, readonly), '', true)}${field('主智能体', select('agent', ['通用智能体', '研究智能体', '写作智能体'], item.agent || '通用智能体', disabled))}${field('工作区策略', select('workspace', ['跟随当前工作区', '每次询问', '固定工作区'], item.workspace || '跟随当前工作区', disabled))}${field('摘要', '<textarea class="gd-control" name="summary" rows="3" ' + readonly + '>' + esc(item.summary || '') + '</textarea>', '', true)}<div class="gd-field gd-field--full"><div class="gd-inline-line"><span>规则</span>${button('预览', 'preview-rules')}</div><textarea class="gd-control gd-code-text" name="rules" rows="9" ${readonly}>${esc(item.rules || '')}</textarea><div class="gw-inset gd-rule-preview" hidden></div></div><fieldset class="gd-capability-fieldset gd-field--full"><legend>能力</legend><div class="gd-check-grid">${['文件读取', '网页检索', '内容整理', '图像理解'].map((x, i) => `<label class="gd-check"><input type="checkbox" name="cap${i}" ${i === 0 || item[`cap${i}`] ? 'checked' : ''} ${disabled}>${x}</label>`).join('')}</div></fieldset></div>`;
    if (o.type === 'connector') body = `${notice('保存仅更新本地配置，不代表连接成功。')}<div class="gd-form-grid">${field('添加方式', select('method', ['HTTP 服务', '本地进程'], item.protocol === '本地' ? '本地进程' : 'HTTP 服务', 'data-connector-method'), '', true)}${field('名称', input('name', item.name || o.name, 'required'), '', true)}${field('描述', input('description', item.description), '', true)}<div class="gd-field gd-field--full ${item.protocol === '本地' ? 'gd-hidden' : ''}" data-connector-http><span>服务地址</span>${input('endpoint', item.endpoint || 'https://connector.example', 'type="url"')}</div><div class="gd-field gd-field--full ${item.protocol !== '本地' ? 'gd-hidden' : ''}" data-connector-local><span>启动命令</span>${input('command', item.command || '', 'placeholder="填写命令，不会实际执行"')}<small>仅保存文本，此演示不会启动进程。</small></div>${field('访问凭据', input('secret', '', 'type="password" autocomplete="new-password" placeholder="输入以替换"'), '已保存凭据不会回显。', true)}${field('请求超时（秒）', input('timeout', item.timeout || '30', 'type="number" min="1" max="300"'))}${field('认证方式', select('auth', ['无认证', 'Bearer'], item.auth || '无认证'))}<label class="gd-check gd-field--full"><input type="checkbox" name="enabled" ${item.enabled ? 'checked' : ''}>保存后启用示例配置</label></div>`;
    if (isMemory) body = `${notice('仅记录稳定、可复用的偏好，避免写入敏感资料。')}<div class="gd-form-grid">${field('标题', input('title', item.title), '用一句话说明这条偏好。', true)}${field('正文', `<textarea class="gd-control" name="content" rows="5">${esc(item.content)}</textarea>`, '说明何时适用，保留必要边界。', true)}${field('分类', select('category', ['表达', '语言', '工作方式'], item.category || '表达'))}${field('作用域', select('scope', ['全局', '当前工作区'], item.scope || '全局'))}${field('强度', select('strength', ['建议', '偏好', '强偏好'], item.strength || '偏好'))}${field('状态', select('status', ['生效', '待审阅', '忽略'], item.status || '待审阅'))}${field('风险', select('risk', ['低', '中', '高'], item.risk || '低'))}${field('优先级', input('priority', item.priority || '50', 'type="number" min="0" max="100"'))}${field('置信度', input('confidence', item.confidence || '0.8', 'type="number" min="0" max="1" step="0.05"'))}</div>`;
    const formType = !['confirm', 'help'].includes(o.type);
    const footer = o.type === 'confirm' ? `${button('取消', 'close-overlay')}${button(o.confirmLabel || '确认', 'confirm-action', '', o.danger ? 'danger' : 'primary')}` : o.type === 'help' ? button('关闭', 'close-overlay') : readOnly ? `${isAssistant ? button('复制为自定义助手', 'copy-assistant', `data-id="${item.id}"`) : button('复制为自定义', 'copy-subagent', `data-id="${item.id}"`)}${button('关闭', 'close-overlay')}` : `${item.id && isAssistant ? button('导出', 'export-assistant', `data-id="${item.id}"`) + button('删除', 'delete-item', `data-collection="assistants" data-id="${item.id}"`, 'danger') : ''}${button('取消', 'close-overlay')}<button type="submit" class="gw-button gw-button--primary" data-overlay-save>${item.id ? '保存' : o.type === 'assistant' ? '创建助手' : '保存'}</button>`;
    layer.innerHTML = `<div class="gd-overlay ${drawer ? 'gd-overlay--drawer' : ''}"><section role="dialog" aria-modal="true" aria-labelledby="gd-dialog-title" class="gd-dialog ${drawer ? `gd-drawer ${isAssistant ? 'gd-drawer--assistant' : 'gd-drawer--memory'}` : ''} ${o.type === 'remote' ? 'gd-dialog--remote' : ''}"><${formType ? 'form data-overlay-form novalidate' : 'div class="gd-dialog-wrap"'}><header class="gd-dialog-header"><h2 id="gd-dialog-title">${title}</h2><button type="button" class="gd-icon-button" data-action="close-overlay" aria-label="关闭${title}">${icon('close')}</button></header><div class="gd-dialog-body">${body}<p class="gd-form-error" role="alert" hidden></p></div><footer class="gd-dialog-footer">${footer}</footer></${formType ? 'form' : 'div'}></section></div>`;
    const dialog = layer.querySelector('.gd-dialog');
    dialog.setAttribute('data-dialog-material', '');
    dialog.style.setProperty('--gw-dialog-content-wash', `${DIALOG_PRESET.contentWash * 100}%`);
    layer.querySelector('.gd-overlay').style.setProperty('--gw-dialog-scrim-opacity', `${DIALOG_PRESET.scrimOpacity * 100}%`);
    overlayMaterial = createGlassSurface({ element: dialog, ...DIALOG_PRESET.glass });
    validateCommand();
  }
  function validateCommand() {
    if (ui.overlay?.type !== 'command') return;
    const form = layer.querySelector('form');
    if (!form) return;
    const name = form.elements.name.value;
    const valid = /^[a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*)*$/.test(name) && name.length <= 80 && Boolean(form.elements.prompt.value.trim());
    form.querySelector('[data-overlay-save]').disabled = !valid;
  }
  function formObject(form) { const result = Object.fromEntries(new FormData(form)); form.querySelectorAll('input[type="checkbox"]').forEach(x => { result[x.name] = x.checked; }); return result; }
  function overlayError(message) { const error = layer.querySelector('.gd-form-error'); error.textContent = message; error.hidden = false; error.scrollIntoView({ block: 'nearest' }); }
  function submitOverlay(form) {
    const o = ui.overlay;
    if (!o || o.saving) return;
    const draft = formObject(form);
    const trimmed = (name) => String(draft[name] || '').trim();
    if (['memory'].includes(o.type) && (!trimmed('title') || !trimmed('content'))) { overlayError('请填写标题与正文。你的输入已保留。'); form.elements[trimmed('title') ? 'content' : 'title'].focus(); return; }
    if (!form.checkValidity()) { overlayError('请检查必填字段和输入格式。'); form.reportValidity(); return; }
    const collection = ({ command: 'commands', provider: 'providers', remote: 'remotes', subagent: 'subagents', assistant: 'assistants', connector: 'connectors', memory: 'memories' })[o.type];
    if (collection && ['commands', 'providers', 'assistants'].includes(collection) && data[collection].some(x => x.name === trimmed('name') && x.id !== o.item?.id)) { overlayError('此名称已经存在，请使用其他名称。'); return; }
    if (o.type === 'connector' && draft.method === 'HTTP 服务' && !/^https?:\/\//.test(trimmed('endpoint'))) { overlayError('请填写有效的 HTTP 或 HTTPS 服务地址。'); return; }
    if (o.type === 'connector' && draft.method === '本地进程' && !trimmed('command')) { overlayError('请填写启动命令。该命令仅作为文本保存。'); return; }
    o.saving = true;
    form.querySelectorAll('button').forEach(x => { x.disabled = true; });
    form.querySelector('[data-overlay-save]').textContent = '保存中…';
    later(() => {
      o.saving = false;
      if (ui.mode === 'save-error') { form.querySelectorAll('button').forEach(x => { x.disabled = false; }); form.querySelector('[data-overlay-save]').textContent = '重试保存'; overlayError('模拟保存失败。草稿已保留，可以重试或取消。'); validateCommand(); return; }
      const id = o.item?.id || `local-${Date.now()}`;
      delete draft.secret;
      const value = { ...o.item, ...draft, id };
      if (o.type === 'provider') Object.assign(value, { description: '自定义兼容模型服务', count: 0, enabled: true });
      if (o.type === 'remote') Object.assign(value, { status: '未连接' });
      if (o.type === 'assistant' || o.type === 'subagent') Object.assign(value, { builtIn: false, enabled: o.item?.enabled ?? true });
      if (o.type === 'command') Object.assign(value, { enabled: o.item?.enabled ?? true });
      if (o.type === 'connector') Object.assign(value, { protocol: draft.method === '本地进程' ? '本地' : 'HTTP', configured: true });
      if (o.type === 'memory') Object.assign(value, { source: o.item?.source || '手动添加' });
      const index = data[collection].findIndex(x => x.id === id);
      if (index >= 0) data[collection][index] = value; else data[collection].push(value);
      const persisted = persist(); closeOverlay(); renderContent(); if (persisted) toast('已保存到此浏览器');
    });
  }
  function confirm(title, message, fn, danger = false, description = '') { openOverlay('confirm', null, { title, message, description, fn, danger, confirmLabel: danger ? '确认删除' : '确认' }); }
  function updateToggle(key) {
    const [collection, id] = key.split(':');
    const collections = { provider: 'providers', agent: 'agents', assistant: 'assistants', connector: 'connectors', command: 'commands', subagent: 'subagents' };
    if (ui.mode === 'save-error') { toast('模拟保存失败，开关保持原状态。', true); return; }
    if (id && collections[collection]) { const item = data[collections[collection]].find(x => x.id === id); if (item) item.enabled = !item.enabled; }
    else data.flags[key] = !data.flags[key];
    const persisted = persist(); renderContent(); if (persisted) toast('已保存到此浏览器');
  }
  function copyItem(collection, id) {
    const item = data[collection].find(x => x.id === id); if (!item) return;
    const copy = { ...item, id: `local-${Date.now()}`, name: `${item.name} 副本`, builtIn: false };
    if (collection === 'subagents') copy.runtime = `${item.runtime}-copy`;
    data[collection].push(copy); const persisted = persist(); closeOverlay(); renderContent(); if (persisted) toast('已创建自定义副本');
  }
  function click(event) {
    const el = event.target.closest('[data-action]');
    if (!el || !root.contains(el) || el.disabled) return;
    event.stopPropagation();
    const action = el.dataset.action, id = el.dataset.id;
    switch (action) {
      case 'back': onBack(); break;
      case 'page': ui.page = el.dataset.page; ui.provider = ''; renderNav(); content.scrollTop = 0; renderContent(); break;
      case 'tab': ui.tabs[ui.page] = Number(el.dataset.tab); ui.provider = ''; content.scrollTop = 0; renderContent(); content.querySelector('[aria-selected="true"]')?.focus(); break;
      case 'clear-navigation': ui.search = ''; root.querySelector('[data-search="navigation"]').value = ''; renderNav(); root.querySelector('[data-search="navigation"]').focus(); break;
      case 'toggle': updateToggle(el.dataset.key); break;
      case 'refresh': { const label = el.dataset.label; el.disabled = true; el.innerHTML = `${icon('refresh')}刷新中…`; later(() => { renderContent(); toast(`${label}已刷新（本地示例）`); }); break; }
      case 'retry-read': ui.mode = 'normal'; renderContent(); toast('已重新读取本地示例'); break;
      case 'cloud-scope': ui.cloudScope = el.dataset.value; renderContent(); break;
      case 'use-model': save('主模型', () => { data.values.primaryModel = el.dataset.value; }); break;
      case 'new-provider': openOverlay('provider'); break;
      case 'provider-detail': ui.provider = id; renderContent(); break;
      case 'provider-back': ui.provider = ''; renderContent(); break;
      case 'test-provider': el.disabled = true; el.textContent = '模拟检查中…'; later(() => { el.disabled = false; el.textContent = '模拟连接测试'; toast('模拟配置检查通过，未连接真实服务'); }, 700); break;
      case 'help': openOverlay('help', null, { message: el.dataset.label }); break;
      case 'section': content.querySelector(`#${el.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'simulate': el.disabled = true; later(() => { el.disabled = false; toast(el.dataset.label); }, 650); break;
      case 'new-remote': openOverlay('remote'); break;
      case 'edit-remote': openOverlay('remote', data.remotes.find(x => x.id === id)); break;
      case 'pair-start': { const text = layer.querySelector('[data-pair-status]'); text.textContent = '模拟发起中…'; ui.pairStatus = 'starting'; later(() => { if (ui.overlay?.type === 'remote' && ui.pairStatus === 'starting') { ui.pairStatus = 'pending'; text.textContent = '模拟待批准 · 可取消或重新检查'; } }, 800); break; }
      case 'pair-cancel': ui.pairStatus = 'cancelled'; layer.querySelector('[data-pair-status]').textContent = '已取消模拟配对'; break;
      case 'pair-retry': ui.pairStatus = 'timeout'; layer.querySelector('[data-pair-status]').textContent = '模拟检查超时 · 请重新发起'; break;
      case 'new-subagent': openOverlay('subagent'); break;
      case 'edit-subagent': openOverlay('subagent', data.subagents.find(x => x.id === id)); break;
      case 'copy-subagent': copyItem('subagents', id); break;
      case 'new-assistant': openOverlay('assistant'); break;
      case 'edit-assistant': openOverlay('assistant', data.assistants.find(x => x.id === id)); break;
      case 'copy-assistant': copyItem('assistants', id); break;
      case 'assistant-filter': ui.assistantFilter = el.dataset.value; renderContent(); break;
      case 'toggle-assistant-search': ui.expandedSearch = !ui.expandedSearch; renderContent(); if (ui.expandedSearch) content.querySelector('[data-search="assistants"]')?.focus(); break;
      case 'preview-rules': { const preview = layer.querySelector('.gd-rule-preview'); preview.textContent = layer.querySelector('[name="rules"]').value || '尚未填写规则'; preview.hidden = !preview.hidden; el.textContent = preview.hidden ? '预览' : '收起预览'; break; }
      case 'import-assistant': content.querySelector('[data-import-file]').click(); break;
      case 'export-assistant': { const item = data.assistants.find(x => x.id === id); const url = URL.createObjectURL(new Blob([JSON.stringify({ name: item.name, description: item.description, rules: item.rules }, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'assistant.json'; anchor.click(); later(() => URL.revokeObjectURL(url), 0); toast('已导出助手配置'); break; }
      case 'new-connector': openOverlay('connector'); break;
      case 'edit-connector': ui.connectorMenu = ''; openOverlay('connector', data.connectors.find(x => x.id === id)); renderContent(); break;
      case 'catalog-connector': openOverlay('connector', null, { name: el.dataset.name }); break;
      case 'expand-connector': ui.expandedConnector = ui.expandedConnector === id ? '' : id; renderContent(); break;
      case 'connector-more': ui.connectorMenu = ui.connectorMenu === id ? '' : id; renderContent(); break;
      case 'test-connector': ui.connectorMenu = ''; renderContent(); toast('模拟配置检查完成，未连接真实服务'); break;
      case 'dependency': ui.busy.add('dependency'); el.disabled = true; el.textContent = '准备中…'; later(() => { ui.busy.delete('dependency'); data.dependency = true; const persisted = persist(); renderContent(); if (persisted) toast('示例依赖已就绪，未下载或安装软件'); }, 1100); break;
      case 'new-command': openOverlay('command'); break;
      case 'edit-command': openOverlay('command', data.commands.find(x => x.id === id)); break;
      case 'delete-item': { const collection = el.dataset.collection; const item = data[collection].find(x => x.id === id); confirm('删除配置', `确定删除“${esc(item.name || item.title)}”吗？`, () => { data[collection] = data[collection].filter(x => x.id !== id); const persisted = persist(); closeOverlay(); renderContent(); if (persisted) toast('已从本地演示中删除'); }, true, '此操作只影响当前浏览器中的演示数据。'); break; }
      case 'close-overlay': closeOverlay(); break;
      case 'confirm-action': ui.overlay?.fn?.(); break;
      case 'memory-status': save('记忆状态', () => { data.memories.find(x => x.id === id).status = el.dataset.status; }, `memory-${id}`); break;
      case 'add-candidate': ui.candidateForm = true; renderContent(); content.querySelector('[name="title"]')?.focus(); break;
      case 'cancel-candidate': ui.candidateForm = false; renderContent(); break;
      case 'new-memory': openOverlay('memory'); break;
      case 'edit-memory': openOverlay('memory', data.memories.find(x => x.id === id)); break;
      case 'trace-page': ui.tracePage += Number(el.dataset.value); renderContent(); break;
      case 'rebuild-memory': confirm('重建示例索引', '重新整理当前浏览器中的示例记忆索引？', () => { closeOverlay(); toast('示例索引已重建，未调用真实索引服务'); }); break;
      case 'delete-knowledge': confirm('删除知识服务配置', `确定删除“${esc(data.values.knowledgeName || '知识服务')}”的本地配置吗？`, () => { data.values.knowledgeName = ''; data.values.knowledgeEndpoint = ''; data.flags.knowledgeEnabled = false; ui.knowledgeStatus = '未配置'; delete drafts['knowledge:']; content.innerHTML = ''; const persisted = persist(); closeOverlay(); renderContent(); if (persisted) toast('已删除本地配置'); }, true); break;
      case 'knowledge-refresh': el.disabled = true; el.textContent = '刷新中…'; later(() => { ui.knowledgeStatus = data.flags.knowledgeEnabled ? '示例配置待测试' : '未连接'; renderContent(); toast('本地诊断已刷新'); }); break;
      case 'reset-demo': confirm('恢复示例数据', '将替换当前浏览器保存的设置与自定义条目。', () => { data = initialData(); ui.mode = 'normal'; ui.filters = {}; Object.keys(drafts).forEach(key => delete drafts[key]); content.innerHTML = ''; const persisted = persist(); closeOverlay(); renderContent(); if (persisted) toast('已恢复示例数据'); }); break;
    }
  }
  function inputEvent(event) {
    const el = event.target;
    if (el.dataset.search) { if (el.dataset.search === 'navigation') { ui.search = el.value.trim(); renderNav(); } else { ui.filters[el.dataset.search] = el.value; renderContent(); } }
    if (layer.contains(el)) validateCommand();
  }
  function change(event) {
    const el = event.target;
    if (el.hasAttribute('data-demo-mode')) { ui.mode = el.value; renderContent(); }
    if (el.hasAttribute('data-command-scope')) { ui.scope = el.value; renderContent(); }
    if (el.hasAttribute('data-pref-status')) { ui.status = el.value; renderContent(); }
    if (el.hasAttribute('data-pref-category')) { ui.category = el.value; renderContent(); }
    if (el.dataset.instantValue) { const key = el.dataset.instantValue, value = el.value; save('配置', () => { data.values[key] = value; }, key); }
    if (el.dataset.instantCheck) { const key = el.dataset.instantCheck; if (ui.mode === 'save-error') { el.checked = !el.checked; toast('模拟保存失败，选项保持原状态。', true); } else { data.flags[key] = el.checked; const persisted = persist(); renderContent(); if (persisted) toast('已保存到此浏览器'); } }
    if (el.hasAttribute('data-observer-mode')) { content.querySelector('[data-observer-model]').classList.toggle('gd-hidden', el.value !== '指定模型'); }
    if (el.hasAttribute('data-remote-protocol')) { layer.querySelector('[data-remote-http]').classList.toggle('gd-hidden', el.value === '配对码'); layer.querySelector('[data-remote-pair]').classList.toggle('gd-hidden', el.value !== '配对码'); }
    if (el.hasAttribute('data-connector-method')) { layer.querySelector('[data-connector-http]').classList.toggle('gd-hidden', el.value === '本地进程'); layer.querySelector('[data-connector-local]').classList.toggle('gd-hidden', el.value !== '本地进程'); }
    if (el.hasAttribute('data-import-file') && el.files?.[0]) { const file = el.files[0]; if (file.size > 1024 * 1024) { toast('文件过大，请使用小于 1 MB 的配置。', true); return; } file.text().then(text => { try { const imported = JSON.parse(text); if (typeof imported.name !== 'string' || typeof imported.rules !== 'string') throw new Error('invalid'); openOverlay('assistant', { name: imported.name.slice(0, 100), description: String(imported.description || '').slice(0, 300), rules: imported.rules.slice(0, 30000), builtIn: false }); } catch { toast('无法读取配置，需要包含名称与规则的 JSON 文件。', true); } }); }
  }
  function submit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !root.contains(form)) return;
    event.preventDefault();
    if (form.hasAttribute('data-overlay-form')) { submitOverlay(form); return; }
    const draft = formObject(form);
    switch (form.dataset.form) {
      case 'provider-config': save('供应商配置', () => { const p = data.providers.find(x => x.id === form.dataset.id); Object.assign(p, { endpoint: draft.endpoint, model: draft.model, hasSecret: Boolean(draft.secret) || p.hasSecret }); }); break;
      case 'media-config': { const prefix = form.dataset.kind === 'image' ? 'imageEnabled' : 'videoEnabled'; save('生成配置', () => { data.values[`${prefix}Mode`] = draft.mode; data.values[`${prefix}Model`] = draft.model; data.values[`${prefix}Endpoint`] = draft.endpoint; }); break; }
      case 'agent-model': save('主模型配置', () => { Object.assign(data.values, { agentModel: draft.model, agentEndpoint: draft.endpoint, agentModelName: draft.modelName }); }); break;
      case 'context-prompt': save('附加提示', () => { data.values.contextPrompt = draft.prompt; }); break;
      case 'memory-policy': save('上下文策略', () => { Object.assign(data.values, { memoryMode: draft.mode, memoryPolicy: draft.policy, memoryCompress: draft.compress }); }); break;
      case 'long-memory': save('长期记忆设置', () => { Object.assign(data.values, { memoryInterval: draft.interval, memoryLimit: draft.limit }); data.flags.autoIndex = draft.autoIndex; data.flags.archiveMedia = draft.archiveMedia; }); break;
      case 'candidate': save('记忆候选', () => { data.memories.push({ id: `local-${Date.now()}`, title: draft.title.trim(), content: draft.content.trim(), category: '工作方式', scope: '全局', status: '待审阅', risk: '低', source: '手动添加' }); ui.candidateForm = false; }); break;
      case 'knowledge': { const test = event.submitter?.value === 'test'; save('知识服务配置', () => { Object.assign(data.values, { knowledgeName: draft.name, knowledgeTransport: draft.transport, knowledgeEndpoint: draft.endpoint }); if (test) { ui.knowledgeStatus = '模拟测试通过 · 未连接真实服务'; } }, 'knowledge'); break; }
      case 'observer': save('观察者配置', () => { Object.assign(data.values, { observerModelMode: draft.modelMode, observerPolicy: draft.policy, observerModel: draft.model, observerTimeout: draft.timeout, observerDelay: draft.delay, observerLimit: draft.limit }); }); break;
    }
  }
  function keydown(event) {
    if (ui.overlay) {
      if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); }
      if (event.key === 'Tab') { const focusable = [...layer.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.offsetParent !== null); if (!focusable.length) return; const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
      return;
    }
    const tab = event.target.closest('[role="tab"]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const n = TABS[ui.page].length; const current = activeTab(); ui.tabs[ui.page] = event.key === 'Home' ? 0 : event.key === 'End' ? n - 1 : (current + (event.key === 'ArrowRight' ? 1 : n - 1)) % n; renderContent(); content.querySelector('[aria-selected="true"]')?.focus(); }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.gd-assistant-card')) { event.preventDefault(); event.target.click(); }
    if (event.key === 'Escape' && ui.connectorMenu) { ui.connectorMenu = ''; renderContent(); }
  }
  // Keep inline form drafts across loading feedback, failed saves, tabs and page changes.
  const drafts = {};
  const originalRender = renderContent;
  renderContent = function () {
    content.querySelectorAll('form[data-form]').forEach(form => {
      const key = `${form.dataset.form}:${form.dataset.id || form.dataset.kind || ''}`;
      drafts[key] = [...form.elements].filter(el => el.name && !['submit', 'button'].includes(el.type)).map(el => ({ name: el.name, value: el.value, checked: el.checked, type: el.type }));
    });
    originalRender();
    content.querySelectorAll('form[data-form]').forEach(form => {
      const key = `${form.dataset.form}:${form.dataset.id || form.dataset.kind || ''}`;
      for (const saved of drafts[key] || []) { const el = form.elements[saved.name]; if (!el || el instanceof RadioNodeList) continue; if (saved.type === 'checkbox') el.checked = saved.checked; else el.value = saved.value; }
    });
  };
  root.addEventListener('click', click);
  root.addEventListener('input', inputEvent);
  root.addEventListener('change', change);
  root.addEventListener('submit', submit);
  root.addEventListener('keydown', keydown);
  renderNav(); renderContent();
  return {
    showPage(page) { if (!PAGES.some(x => x[0] === page)) return; ui.page = page; renderNav(); renderContent(); },
    destroy() { if (dead) return; dead = true; timers.forEach(clearTimeout); clearTimeout(toastTimer); overlayMaterial?.destroy(); overlayMaterial = null; root.removeEventListener('click', click); root.removeEventListener('input', inputEvent); root.removeEventListener('change', change); root.removeEventListener('submit', submit); root.removeEventListener('keydown', keydown); root.replaceChildren(); root.classList.remove('settings-demo'); },
  };
}
