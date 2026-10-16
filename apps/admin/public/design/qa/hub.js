import {createAmbientBackground} from '../background/background.js';
import {createGlassSurface} from '../components/ui.js';
import {createButton, createDialog, createFormField} from '../admin/ui.js';
import {createVisualProbe} from './probe.js';

const $ = selector => document.querySelector(selector);
const root = $('#qa-practice');
const foreground = $('#qa-foreground');
const background = createAmbientBackground({element: $('#qa-background'), preset: 'curtain', motion: true, intensity: 1});
const sidebar = createGlassSurface({element: $('#qa-sidebar')});
const events = new AbortController();
const on = (node, event, callback) => node.addEventListener(event, callback, {signal: events.signal});
const instances = [];
const keep = instance => { instances.push(instance); return instance; };
let motion = true;
let disposed = false;
let lastReport = null;
let inspecting = false;
let mainDraft = '阶段交付检查';
let mainStatus = 'review';
let dialogDraft = '';

const mainField = keep(createFormField({label: '任务名称', value: mainDraft, description: '演示字段 · 可使用中文输入法', onInput(value) { mainDraft = value; mainField.update({value}); }}));
mainField.element.classList.add('qa-main-field');
$('#qa-main-field-slot').append(mainField.element);
const mainSelect = keep(createFormField({label: '任务状态', type: 'select', value: mainStatus, options: [{value: 'draft', label: '待开始'}, {value: 'review', label: '待审核'}, {value: 'done', label: '已完成'}], onInput(value) { mainStatus = value; mainSelect.update({value}); }}));
mainSelect.element.classList.add('qa-main-field');
$('#qa-main-select-slot').append(mainSelect.element);
on($('#qa-main-form'), 'submit', event => { event.preventDefault(); $('#qa-draft-status').textContent = '草稿已更新到本页内存；刷新后清空。'; });

const dialogForm = document.createElement('form');
dialogForm.className = 'qa-dialog-form';
const dialogField = keep(createFormField({label: '补充说明', type: 'textarea', value: dialogDraft, description: '取消保留本次练习文字，关闭后可重新打开。', onInput(value) { dialogDraft = value; dialogField.update({value}); }}));
dialogField.element.classList.add('qa-dialog-field');
const dialogStatus = document.createElement('p');
dialogStatus.className = 'qa-dialog-status';
dialogStatus.setAttribute('role', 'status');
dialogStatus.textContent = '仅本页模拟；输入内容不会进入诊断。';
const dialogReport = document.createElement('pre');
dialogReport.className = 'qa-report qa-dialog-report';
dialogReport.setAttribute('aria-label', '弹窗打开时的机器诊断');
dialogReport.tabIndex = 0;
dialogReport.hidden = true;
dialogForm.append(dialogField.element, dialogStatus, dialogReport);
const closeDialog = () => dialog.update({open: false});
const cancel = keep(createButton({label: '关闭', onClick: closeDialog}));
const inspectInDialog = keep(createButton({label: '采集诊断', onClick: () => inspect(true)}));
const save = keep(createButton({label: '更新本页草稿', variant: 'primary', onClick() { dialogStatus.textContent = '草稿已更新到本页内存；未提交任何服务。'; }}));
const dialog = keep(createDialog({open: false, title: '表单小弹窗', description: '复用包内弹窗推荐材质；用真实字段检查阅读与焦点。', size: 'sm', children: [dialogForm], footer: [inspectInDialog.element, cancel.element, save.element], onClose: closeDialog}));
foreground.append(dialog.element);
on(dialogForm, 'submit', event => { event.preventDefault(); dialogStatus.textContent = '草稿已更新到本页内存；未提交任何服务。'; });
on($('#qa-open-dialog'), 'click', () => { dialogReport.hidden = true; dialog.update({open: true}); invalidateReport(); });

const probe = createVisualProbe({
  root,
  background,
  roles: [
    {name: 'main-field-label', selector: '.qa-main-field .gw-admin-field-label', required: true, expected: {fontSize: '14px', lineHeight: '22px'}},
    {name: 'dialog-field-label', selector: '.qa-dialog-field .gw-admin-field-label', expected: {fontSize: '14px', lineHeight: '22px'}},
  ],
  foregroundSelectors: ['#qa-foreground'],
  backgroundHost: '#qa-background',
});

// Test-page hook: exposes observation only, without business actions.
window.uiEvidence = probe;

function diagnosticStatus(message, error = false) {
  $('#qa-diagnostic-status').textContent = message;
  $('#qa-diagnostic-status').dataset.error = String(error);
}
function invalidateReport() {
  lastReport = null;
  $('#qa-copy').disabled = true;
  $('#qa-report').textContent = '练习状态已改变，请重新采集诊断。';
  diagnosticStatus('尚未采集当前状态。机器诊断不包含输入值、页面文案或 URL 路径。');
}
async function inspect(fromDialog = false) {
  if (inspecting || disposed) return;
  inspecting = true;
  $('#qa-inspect').disabled = true;
  inspectInDialog.update({loading: true});
  diagnosticStatus('正在读取当前属性与背景状态…');
  try {
    const report = await probe.inspect();
    if (disposed) return;
    lastReport = report;
    const json = JSON.stringify(report, null, 2);
    $('#qa-report').textContent = json;
    $('#qa-copy').disabled = false;
    if (fromDialog) { dialogReport.hidden = false; dialogReport.textContent = json; dialogStatus.textContent = '已采集弹窗打开时的诊断；仅观察属性，仍需目视检查。'; }
    diagnosticStatus(`当前已配置检查：通过 ${report.counts.pass} 项，差异 ${report.counts.fail} 项，未检查 ${report.counts.notTested} 项。仍需目视与实操验收。`, report.counts.fail > 0);
  } catch {
    lastReport = null;
    $('#qa-copy').disabled = true;
    $('#qa-report').textContent = '采集未完成。请确认诊断模块与本地资源加载成功后重试。';
    if (fromDialog) dialogStatus.textContent = '本次诊断未完成，可重试；输入内容保留。';
    diagnosticStatus('诊断未完成；不能将本次操作记为检查通过。', true);
  } finally {
    inspecting = false;
    if (!disposed) { $('#qa-inspect').disabled = false; inspectInDialog.update({loading: false}); }
  }
}
on($('#qa-inspect'), 'click', () => inspect());
on($('#qa-copy'), 'click', async () => {
  if (lastReport === null) return;
  try { await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2)); diagnosticStatus('已复制最近一次采集的诊断 JSON。背景图片不包含在 JSON 中。'); }
  catch { diagnosticStatus('剪贴板不可用；可在诊断框中选择 JSON 手动复制。', true); }
});
on($('#qa-capture'), 'click', async () => {
  $('#qa-capture').disabled = true;
  try {
    const captured = await probe.captureBackground();
    if (disposed) return;
    const {dataUrl, ...metadata} = captured;
    $('#qa-capture-result').hidden = false;
    $('#qa-capture-result').open = true;
    $('#qa-capture-metadata').textContent = JSON.stringify(metadata, null, 2);
    const image = $('#qa-capture-image');
    const hasImage = typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');
    image.hidden = !hasImage;
    if (hasImage) image.src = dataUrl; else image.removeAttribute('src');
    diagnosticStatus(hasImage ? '已捕获背景 Canvas；此图不包含文字与玻璃的最终合成。' : '未得到背景图；请查看捕获状态与限制。', !hasImage);
  } catch {
    diagnosticStatus('背景捕获未完成；请重试并检查本地资源。', true);
  } finally { if (!disposed) $('#qa-capture').disabled = false; }
});

function reflectSimulation() {
  root.dataset.typeMode = document.querySelector('[name="qa-type-mode"]:checked').value;
  root.dataset.opacityMode = document.querySelector('[name="qa-opacity-mode"]:checked').value;
  const type = root.dataset.typeMode === 'small' ? '模拟错误字阶 11px / 16px' : '正常字阶 14px / 22px';
  const opacity = root.dataset.opacityMode === 'faded' ? '模拟整层 opacity 0.55' : '正常前景 opacity 1';
  $('#qa-simulation-state').textContent = `本页模拟：${type} · ${opacity}`;
  invalidateReport();
}
for (const input of document.querySelectorAll('[name="qa-type-mode"], [name="qa-opacity-mode"]')) on(input, 'change', reflectSimulation);
for (const button of document.querySelectorAll('.qa-nav-item')) on(button, 'click', () => {
  for (const sibling of document.querySelectorAll('.qa-nav-item')) {
    if (button === sibling) sibling.setAttribute('aria-current', 'page'); else sibling.removeAttribute('aria-current');
  }
  $('#qa-view-title').textContent = button.textContent;
});
function reflectBackground() {
  if (disposed) return;
  const state = background.getState();
  $('#qa-motion').disabled = state.reducedMotion;
  $('#qa-motion').textContent = state.playing ? '暂停背景' : '继续背景';
  const label = state.reducedMotion ? '系统减少动态 · 已静止' : document.hidden ? '页面隐藏 · 已暂停' : state.playing ? '正常 1× 播放' : '已手动暂停';
  $('#qa-background-state').textContent = `${label} · ${state.elapsed.toFixed(1)} 秒`;
}
on($('#qa-motion'), 'click', () => { motion = !motion; background.update({motion}); reflectBackground(); invalidateReport(); });
let clock = 0;
function stopClock() { clearInterval(clock); clock = 0; }
function startClock() { stopClock(); if (!document.hidden && !disposed) clock = setInterval(reflectBackground, 250); }
on(document, 'visibilitychange', () => { reflectBackground(); if (document.hidden) stopClock(); else startClock(); });
on(window, 'pagehide', event => {
  stopClock();
  if (event.persisted) return;
  disposed = true;
  events.abort();
  for (const instance of [...instances].reverse()) instance.destroy();
  sidebar.destroy();
  background.destroy();
  if(window.uiEvidence===probe)delete window.uiEvidence;
});
on(window, 'pageshow', event => { if (event.persisted) { reflectBackground(); startClock(); } });
reflectBackground();
startClock();
