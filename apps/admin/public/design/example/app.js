import { createAmbientBackground } from '../background/background.js';
import { enhanceSelects } from '../components/select.js';
import { createGlassSurface, createLensRail } from '../components/ui.js';
import { DIALOG_PRESET } from '../material-presets.js';
import { mountMascot } from '../mascot/mountMascot.js';
import { mountSettings } from './settings.js';

const $ = (q, scope=document) => scope.querySelector(q);
const $$ = (q, scope=document) => [...scope.querySelectorAll(q)];
const root = $('#workbench');
const icons = {
  panel:'M3 4h18v16H3zM8 4v16M12 8h5M12 12h5',
  layers:'m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  plus:'M12 5v14M5 12h14', search:'m20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  settings:'m9 3-.5 3-2 1-2.8-1L2 9l2.3 2v2L2 15l1.7 3 2.8-1 2 1L9 21h6l.5-3 2-1 2.8 1 1.7-3-2.3-2v-2L22 9l-1.7-3-2.8 1-2-1L15 3H9Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  message:'M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z',
  folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3V7Z',
  'chevron-down':'m7 10 5 5 5-5', 'chevron-up':'m7 14 5-5 5 5',
  pin:'m9 3 7 1-1 5 4 4-6 1-6 7 2-8-4-4 5-1-1-5Z',
  code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  sparkles:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3ZM20 2v4M18 4h4',
  'arrow-up':'M12 19V5m-6 6 6-6 6 6', 'arrow-down':'M12 5v14m-6-6 6 6 6-6',
  'arrow-right':'M5 12h14m-6-6 6 6-6 6',
  'corner-down':'M5 5v9a3 3 0 0 0 3 3h11m-5-5 5 5-5 5',
  monitor:'M3 4h18v13H3zM8 21h8M12 17v4',
  cloud:'M6 18a4 4 0 0 1-.2-8A6 6 0 0 1 17 7a5.5 5.5 0 0 1 1 11H6Z',
  briefcase:'M3 7h18v13H3zM8 7V4h8v3M3 12h18M10 12v3h4v-3',
  mic:'M8 5a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0V5Zm-3 6v1a7 7 0 0 0 14 0v-1M12 19v3M9 22h6',
  pause:'M8 5v14M16 5v14', play:'m8 4 12 8-12 8V4Z',
  more:'M5 12h.01M12 12h.01M19 12h.01',
  shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z',
  check:'m5 12 4 4L19 6', x:'m6 6 12 12M18 6 6 18',
  copy:'M9 9h12v12H9zM15 9V3H3v12h6',
  file:'M5 3h9l5 5v13H5V3Zm9 0v5h5M8 12h8M8 16h6',
  globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  book:'M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3V4ZM12 6v15',
  refresh:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2',
  warning:'m12 3 10 18H2L12 3ZM12 9v5M12 17v.01',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.sparkles}"/></svg>`; }
function hydrate(scope=root) { $$('[data-icon]',scope).forEach(el => { if (!el.firstElementChild) el.innerHTML=icon(el.dataset.icon); }); }
const esc = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function toast(text) { $('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3600); }
let view='home', activePopup=null, motionPaused=false, attachmentTarget='home';
let backgroundPreset='curtain';
$('#background-preset').value=backgroundPreset;
const ambientBackground=createAmbientBackground({element:$('.gw-atmosphere'),preset:backgroundPreset,motion:true,intensity:1});
$('#background-preset').addEventListener('change',event=>{backgroundPreset=event.target.value;ambientBackground.update({preset:backgroundPreset});});
let runLocation='local', workspace='', scenario='work', model='Balanced 3.5', modelSource='recommended';
let scenarioRail=null;
let followBottom=true, initializedChat=false, generationTimer=null, state='idle';
const drafts={home:[],chat:[]};
const spaces=[{name:'个人工作区',count:4},{name:'产品设计',count:8},{name:'探索与灵感',count:3}];
const models=[{name:'Balanced 3.5',note:'均衡 · 推荐',source:'recommended'},{name:'Reasoning Pro',note:'深度思考',source:'all'},{name:'Swift Mini',note:'轻量快速',source:'all'},{name:'Offline Model',note:'本地不可用',source:'all',disabled:true}];
const q={status:'pending',tab:0,goal:'',deliverables:[],context:'',collapsed:false,error:'',simulateFailure:false,details:false,cursor:0};
const questionNames=['关注方向','输出内容','补充背景','确认'];
const goalOptions=[['clarity','先把目标想清楚','澄清问题、边界与成功标准'],['plan','形成一个可执行计划','把目标拆成有顺序的下一步'],['explore','探索更多可能性','并行比较不同思路与机会']];
const deliveryOptions=[['brief','一页项目简报','适合共同对齐目标'],['checklist','行动清单','明确负责人、顺序与结果'],['questions','待确认问题','把尚不确定的事项留出来']];

function closePopup(returnFocus=true) {
  if(!activePopup)return;
  const {node,trigger,material}=activePopup;activePopup=null;material?.destroy();node.remove();
  trigger?.setAttribute('aria-expanded','false');
  if(returnFocus&&trigger?.isConnected)trigger.focus();
}
function makePopup(trigger,content,{width=280,above=false,modal=false}={}) {
  closePopup(false);
  const node=document.createElement('div');
  node.className=modal?'app-modal-backdrop':'gw-popup app-popup';
  node.innerHTML=content;
  if(!modal) {
    node.style.width=`${width}px`;node.setAttribute('role','dialog');node.setAttribute('aria-label',trigger.getAttribute('aria-label')||trigger.textContent.trim()||'选项');
  }
  $('#floating-layer').append(node);
  let material=null;
  if(modal) {
    const dialog=$('.app-modal',node);
    if(dialog) {
      dialog.setAttribute('data-dialog-material','');
      dialog.style.setProperty('--gw-dialog-content-wash',`${DIALOG_PRESET.contentWash*100}%`);
      node.style.setProperty('--gw-dialog-scrim-opacity',`${DIALOG_PRESET.scrimOpacity*100}%`);
      material=createGlassSurface({element:dialog,...DIALOG_PRESET.glass});
    }
  }
  activePopup={node,trigger,modal,material};trigger?.setAttribute('aria-expanded','true');hydrate(node);
  if(!modal) {
    const r=trigger.getBoundingClientRect(), n=node.getBoundingClientRect();
    const left=Math.min(innerWidth-n.width-12,Math.max(12,r.left));
    let top=above?r.top-n.height-8:r.bottom+8;
    if(top<58)top=Math.min(innerHeight-n.height-12,r.bottom+8);
    if(top+n.height>innerHeight-10)top=Math.max(58,r.top-n.height-8);
    node.style.left=`${left}px`;node.style.top=`${top}px`;
  }
  requestAnimationFrame(()=>node.querySelector('input,button,textarea')?.focus());
  return node;
}
function confirmAction(trigger,title,body,action,label='继续') {
  const node=makePopup(trigger,`<div class="app-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><p>${esc(body)}</p><div class="modal-actions"><button class="gw-button" data-cancel>取消</button><button class="gw-button gw-button--primary" data-confirm>${esc(label)}</button></div></div>`,{modal:true});
  $('[data-cancel]',node).onclick=()=>closePopup();$('[data-confirm]',node).onclick=()=>{closePopup(false);action();};
}
function showView(next) {
  closePopup(false);view=next;root.dataset.view=next;
  $('#home-view').hidden=next!=='home';$('#chat-view').hidden=next!=='chat';$('#settings-root').hidden=next!=='settings';$('#main-sidebar').hidden=next==='settings';
  $('#breadcrumb-tail').hidden=next==='home';$('#breadcrumb-tail span').textContent=next==='settings'?'设置':'聊天样例';
  $('#settings-page-title').hidden=next!=='settings';if(next==='settings')$('#settings-page-title').textContent=$('#settings-root').dataset.currentPage||'设置';
  $$('[data-nav]').forEach(btn=>{if(btn.dataset.nav===next)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
  root.classList.remove('sidebar-open');$('#sidebar-scrim').hidden=true;syncSidebarToggle();
  ambientBackground.update({motion:next==='home'&&!motionPaused});
  decoration?.setPaused(next!=='home'||motionPaused);
  if(next==='chat') { if(!initializedChat)initializeChat();requestAnimationFrame(()=>{measureInput();if(followBottom)scrollBottom(false);}); }
  requestAnimationFrame(refreshMaterials);
}
window.workbench={showView};
function renderSpaces() {
  $('#space-list').innerHTML=spaces.map(s=>`<div class="gw-space-row" ${workspace===s.name?'aria-current="true"':''}><button class="gw-space-main" data-space="${esc(s.name)}" title="${esc(s.name)}" aria-label="选择${esc(s.name)}工作区">${icon('folder')}<span class="gw-space-name">${esc(s.name)}</span></button><span class="gw-space-count">${s.count}</span><div class="gw-space-actions"><button class="gw-space-action" data-space-code="${esc(s.name)}" aria-label="在${esc(s.name)}中使用代码模式" title="使用代码模式">${icon('code')}</button><button class="gw-space-action" data-space-new="${esc(s.name)}" aria-label="在${esc(s.name)}中新建任务" title="新建任务">${icon('plus')}</button></div></div>`).join('');
  $$('[data-space]').forEach(b=>b.onclick=()=>selectWorkspace(b.dataset.space));
  $$('[data-space-code]').forEach(b=>b.onclick=()=>{selectWorkspace(b.dataset.spaceCode);selectScenario('code');showView('home');toast('已为演示工作区选择代码场景；未运行真实任务。');});
  $$('[data-space-new]').forEach(b=>b.onclick=()=>{selectWorkspace(b.dataset.spaceNew);showView('home');$('#home-prompt').focus();toast('已选择工作区，可以继续描述任务。');});
}
function selectWorkspace(name) { workspace=name;$('#workspace-label').textContent=name||'选择工作区';renderSpaces();closePopup();toast(`已选择${name}（本地演示）`); }
function selectScenario(name) {scenario=name||'';scenarioRail?.update({selected:scenario});$('#home-prompt').placeholder=({work:'描述你的想法，或提出一个问题…',code:'描述你想构建、调试或理解的内容…',assistant:'告诉助手，你希望先从哪件事开始…'})[scenario]||'描述你的想法，或提出一个问题…';}
function setLocation(value) {
  if(value===runLocation)return;
  runLocation=value;
  $$('[data-location]').forEach(b=>{b.setAttribute('aria-checked',String(b.dataset.location===value));b.tabIndex=b.dataset.location===value?0:-1;});
  if(workspace) {workspace='';$('#workspace-label').textContent='选择工作区';renderSpaces();toast('已切换运行位置并清除工作区；文字草稿保留。');} else toast(`已选择${value==='local'?'本地':'云端'}模拟位置；未连接运行服务。`);
  const removed=drafts.home.filter(p=>p.type==='attachment').length;drafts.home=drafts.home.filter(p=>p.type!=='attachment');renderPills('home');if(removed)toast('运行位置变化，已移除本地附件；文字草稿保留。');
}
function renderPills(target) {
  $(`#${target}-pills`).innerHTML=drafts[target].map(p=>`<span class="composer-pill" data-state="${p.status||'ready'}">${p.type==='attachment'?icon('file'):icon('sparkles')}<span title="${esc(p.name)}">${esc(p.name)}${p.status==='uploading'?' · 模拟上传中':p.status==='failed'?' · 失败':''}</span><button type="button" data-remove-pill="${p.id}" aria-label="移除${esc(p.name)}">${icon('x')}</button></span>`).join('');
  $$('[data-remove-pill]',$(`#${target}-pills`)).forEach(b=>b.onclick=()=>{drafts[target]=drafts[target].filter(p=>p.id!==b.dataset.removePill);renderPills(target);});updateSend(target);
}
function updateSend(target) {
  const hasText=$(`#${target}-prompt`).value.trim().length>0;
  const ready=drafts[target].some(p=>p.status!=='uploading'&&p.status!=='failed');
  const uploading=drafts[target].some(p=>p.status==='uploading');
  $(`#${target}-send`).disabled=(!hasText&&!ready)||uploading||(target==='chat'&&['sending','working'].includes(state));
}
function openAdd(trigger,target) {
  if(activePopup?.trigger===trigger){closePopup();return;}
  const node=makePopup(trigger,`<div class="popup-heading">添加到任务<span class="popup-subtitle">本地模拟</span></div><button class="gw-popup-item" data-add="file">${icon('file')}添加附件<small>文件名预览</small></button><div class="popup-divider"></div><button class="gw-popup-item" data-add="网络检索">${icon('globe')}网络检索<small>演示能力</small></button><button class="gw-popup-item" data-add="深度思考">${icon('sparkles')}深度思考<small>演示能力</small></button><button class="gw-popup-item" data-add="知识问答">${icon('book')}知识问答<small>演示能力</small></button><div class="popup-footnote">不会上传文件或调用外部服务。</div>`,{above:true,width:270});
  $$('[data-add]',node).forEach(b=>b.onclick=()=>{const name=b.dataset.add;closePopup();if(name==='file'){attachmentTarget=target;$('#attachment-input').click();return;}if(!drafts[target].some(p=>p.name===name))drafts[target].push({id:crypto.randomUUID(),type:'capability',name,status:'ready'});renderPills(target);$(`#${target}-prompt`).focus();});
}
function openModel(trigger) {
  if(activePopup?.trigger===trigger){closePopup();return;}
  const node=makePopup(trigger,`<div class="popup-heading">选择模型<span class="popup-subtitle">演示列表</span></div><div class="popup-search">${icon('search')}<input aria-label="搜索模型" placeholder="搜索模型名称"></div><div class="popup-tabs" role="tablist" aria-label="模型来源"><button role="tab" data-source="recommended" aria-selected="${modelSource==='recommended'}">推荐</button><button role="tab" data-source="all" aria-selected="${modelSource==='all'}">全部模型</button></div><div class="model-results"><div class="popup-empty"><span class="gw-status-spinner"></span>加载演示模型…</div></div><div class="popup-footnote">模型选择仅改变演示名称，不发起推理。</div>`,{above:view==='chat'||trigger.id==='home-model',width:310});
  const render=()=>{const term=$('input',node).value.toLowerCase();const found=models.filter(m=>(modelSource==='all'||m.source==='recommended')&&m.name.toLowerCase().includes(term));$('.model-results',node).innerHTML=found.length?found.map(m=>`<button class="gw-popup-item" data-model="${m.name}" aria-selected="${model===m.name}" ${m.disabled?'disabled':''}>${icon('sparkles')}<span>${m.name}</span><small>${m.note}</small>${model===m.name?icon('check'):''}</button>`).join(''):'<div class="popup-empty">没有匹配的模型，试试其他名称。</div>';$$('[data-model]',node).forEach(b=>b.onclick=()=>{model=b.dataset.model;$$('.selected-model').forEach(el=>el.textContent=model);closePopup();});};
  $$('[data-source]',node).forEach(b=>b.onclick=()=>{modelSource=b.dataset.source;$$('[data-source]',node).forEach(t=>t.setAttribute('aria-selected',String(t===b)));render();});$('input',node).oninput=render;setTimeout(()=>{if(node.isConnected)render();},380);
}
function openWorkspace() {
  const trigger=$('#workspace-menu');if(activePopup?.trigger===trigger){closePopup();return;}
  const node=makePopup(trigger,`<div class="popup-heading">工作区<span class="popup-subtitle">${runLocation==='local'?'本地':'云端'} · 演示</span></div><div class="popup-search">${icon('search')}<input aria-label="搜索工作区" placeholder="搜索工作区"></div><div class="workspace-results"></div><div class="popup-footnote">演示工作区没有关联真实文件目录。</div>`,{width:310});
  const render=()=>{const term=$('input',node).value.toLowerCase();const found=spaces.filter(s=>s.name.toLowerCase().includes(term));$('.workspace-results',node).innerHTML=found.length?found.map(s=>`<button class="gw-popup-item" data-workspace="${esc(s.name)}" aria-selected="${workspace===s.name}">${icon('folder')}<span>${esc(s.name)}</span><small>${workspace===s.name?'已选择':`${s.count} 个演示会话`}</small></button>`).join(''):'<div class="popup-empty">没有匹配的工作区。</div>';$$('[data-workspace]',node).forEach(b=>b.onclick=()=>selectWorkspace(b.dataset.workspace));};$('input',node).oninput=render;render();
}
function openSearch(trigger,chatOnly=false) {
  const titles=chatOnly?['项目启动前的思考','目标与成功标准','交付节奏与风险']:['项目启动前的思考','梳理产品迭代的优先级','一份清晰的会议纪要','探索新的工作方式','从想法到可执行清单'];
  const node=makePopup(trigger,`<div class="app-modal" role="dialog" aria-modal="true" aria-label="${chatOnly?'查找聊天内容':'搜索会话'}"><div class="popup-heading">${chatOnly?'查找聊天内容':'搜索演示会话'}<button class="icon-button" data-close aria-label="关闭">${icon('x')}</button></div><div class="popup-search">${icon('search')}<input aria-label="搜索关键词" placeholder="输入关键词…"></div><div class="search-results"></div><div class="popup-footnote">仅搜索本样例预设内容。</div></div>`,{modal:true});
  const render=()=>{const found=titles.filter(t=>t.includes($('input',node).value.trim()));$('.search-results',node).innerHTML=found.length?found.map(t=>`<button class="gw-popup-item" data-result="${esc(t)}">${icon('message')}${esc(t)}<small>演示</small></button>`).join(''):'<div class="popup-empty">没有匹配结果；清空关键词可恢复。</div>';$$('[data-result]',node).forEach(b=>b.onclick=()=>{closePopup(false);openChat(b.dataset.result);});};$('input',node).oninput=render;$('[data-close]',node).onclick=()=>closePopup();render();
}
function appendMessage(type,html) {const el=document.createElement('article');el.className=`message message-${type}`;el.innerHTML=html;$('#message-list').append(el);hydrate(el);$$('[data-copy]',el).forEach(b=>b.onclick=()=>copyText(b.dataset.copy==='message'?el.innerText:b.dataset.copy));if(followBottom)scrollBottom(false);return el;}
async function copyText(text) {try{await navigator.clipboard.writeText(text);toast('已复制到剪贴板。');}catch{toast('浏览器未提供剪贴板权限，可直接选择文字复制。');}}
function assistant(html,time='10:26') {return `<div class="message-body gw-type-chat-body">${html}</div><div class="message-meta"><time class="gw-type-chat-time">${time}</time><span>·</span><span class="gw-type-chat-time">模拟响应</span><button class="icon-button" data-copy="message" aria-label="复制回答" title="复制回答">${icon('copy')}</button></div>`;}
function initializeChat() {
  initializedChat=true;
  appendMessage('user',`<div class="gw-message-user gw-type-chat-body">我想为一个跨团队项目整理启动计划。先帮我看清目标、协作节奏和潜在风险，再一起确定下一步。</div>`);
  appendMessage('assistant',assistant(`<p>可以。一个好的启动计划，要让参与者在同一份信息上做决定。我们先把模糊的想法整理成三个可讨论的部分。</p><div class="tool-group"><div class="tool-row">${icon('check')}<span>整理需求</span><span class="tool-detail-label">提取目标、参与者和已知约束</span><span class="tool-success">完成</span><button data-tool="requirements" aria-expanded="false">展开</button></div><div class="tool-detail" id="tool-requirements" hidden><button class="gw-button" data-copy="演示分析：目标=启动跨团队项目；约束=时间与协作边界待确认。">复制</button>演示分析记录\n目标：启动跨团队项目\n输入：当前会话中的用户描述\n待确认：时间范围、参与者、预期交付物\n此过程没有读取文件或执行真实工具。</div><div class="tool-row">${icon('warning')}<span>读取项目资料</span><span class="tool-detail-label">未连接知识服务</span><span class="tool-error">未执行</span><button data-tool="knowledge" aria-expanded="false">原因</button></div><div class="tool-detail" id="tool-knowledge" hidden>演示环境没有知识服务连接。没有发起检索请求，也没有把预设文本当作真实工具结果。可在设置中查看知识服务表单。</div></div><h3>1. 目标：用一个可观察的变化描述成功</h3><p>先写清楚项目结束时，谁的工作会发生什么变化。例如，“让协作更高效”还不足以推动决策；“让参与团队能在同一份清单上确认本周交付与阻塞”更容易被验证。</p><p>建议将<strong>必须达到的结果</strong>、希望达到的结果与暂时不做的事情分别列出来。范围边界越清楚，后面讨论排期时就越容易保留余地。</p><h3>2. 节奏：每一轮都留下可以共同检查的结果</h3><ul><li><strong>启动对齐：</strong>确认问题、参与者、约束与待定事项。</li><li><strong>小步推进：</strong>把工作拆成一周内可以展示的成果。</li><li><strong>集中复盘：</strong>用同一套标准检查结果，并更新下一轮计划。</li></ul><div class="code-caption">${icon('code')}一个轻量的项目结构 · 示例</div><pre><code>project-brief/\n├── 01-goals.md           # 目标与成功标准\n├── 02-deliverables.md    # 交付物与负责人\n├── 03-decisions.md       # 决策记录与依据\n└── 04-open-questions.md  # 阻塞、风险和待确认事项</code></pre><h3>3. 风险：让不确定性在早期出现</h3><p>跨团队项目常见的阻塞，来自依赖关系和决策权没有对齐。每个关键交付物都需要一个明确的负责人；有争议的事项，也需要约定由谁、在什么时候做决定。</p><p>你可以先把风险写成“如果发生什么，会影响哪个结果，我们怎样尽早发现”。这样它就能进入每周检查，而不会只停留在启动文档里。</p><div class="inline-note">${icon('sparkles')}在生成完整计划前，我想先确认三个信息。下面的选择会保留为草稿，你可以随时切换标签补充。</div>`));
  renderQuestion();hydrate();bindTools();setChatState('awaiting_input');
}
function bindTools() {$$('[data-tool]').forEach(b=>b.onclick=()=>{const detail=$(`#tool-${b.dataset.tool}`);detail.hidden=!detail.hidden;b.setAttribute('aria-expanded',String(!detail.hidden));b.textContent=detail.hidden?(b.dataset.tool==='knowledge'?'原因':'展开'):'收起';});}
function openChat(title='项目启动前的思考') {$('#chat-title').textContent=title;showView('chat');}
function setChatState(next) {
  state=next;const labels={idle:'准备就绪',typing:'编辑中',sending:'发送中',working:'工作中',awaiting_input:'等待回答',completed:'已完成',failed:'发送失败',stopped:'已停止'};
  $('#chat-state').textContent=`${labels[next]} · 模拟`;$('#composer-status').textContent=['sending','working'].includes(next)?'模拟生成中':next==='failed'?'草稿已保留':'模拟响应';
  const busy=['sending','working'].includes(next);$('#chat-stop').hidden=!busy;$('#chat-send').hidden=busy;$('#chat-editor .beam').dataset.borderBeam=busy?'working':'idle';updateSend('chat');
}
function scrollBottom(smooth=true) {const timeline=$('#timeline');timeline.scrollTo({top:timeline.scrollHeight,behavior:smooth?'smooth':'instant'});$('#jump-bottom').hidden=true;}
function measureInput() {const height=$('#chat-input-stack').getBoundingClientRect().height;$('#timeline').style.paddingBottom=`${height+64}px`;$('.conversation-viewport').style.setProperty('--input-height',`${height+18}px`);}
function questionReview() {const goal=goalOptions.find(o=>o[0]===q.goal)?.[1]||'尚未选择';const deliveries=q.deliverables.map(d=>deliveryOptions.find(o=>o[0]===d)?.[1]).join('、')||'尚未选择';return `<div class="question-review"><div><span>关注方向</span><strong>${esc(goal)}</strong></div><div><span>输出内容</span><div>${esc(deliveries)}</div></div><div><span>补充背景</span><div>${esc(q.context||'尚未填写')}</div></div></div>`;}
function validateQuestion(tab=q.tab) {if(tab===0&&!q.goal)return '请选择一个关注方向。';if(tab===1&&!q.deliverables.length)return '请至少选择一种输出内容。';if(tab===2&&!q.context.trim())return '请补充项目背景，便于明确计划范围。';return '';}
function renderQuestion() {
  const card=$('#question-card');card.hidden=false;
  if(q.status!=='pending'&&q.status!=='submitting') {
    const labels={completed:'已确认 · 答案已记录（模拟）',cancelled:'已取消 · 未提交答案',refused:'已拒绝回答 · 未提交答案',skipped:'已跳过 · 继续新消息'};
    card.innerHTML=`<div class="question-readonly"><span>${icon(q.status==='completed'?'check':'x')} ${labels[q.status]}</span><button data-q-details>${q.details?'收起摘要':'查看草稿'}</button></div>${q.details?`<div class="question-fields">${questionReview()}</div>`:''}`;
    $('[data-q-details]',card).onclick=()=>{q.details=!q.details;renderQuestion();};measureInput();return;
  }
  if(q.collapsed) {card.innerHTML=`<div class="question-readonly"><span>等待补充 3 个信息 · 草稿已保留</span><button data-q-expand>展开回答</button></div>`;$('[data-q-expand]',card).onclick=()=>{q.collapsed=false;renderQuestion();};measureInput();return;}
  let field='';
  if(q.tab<2) {const options=q.tab===0?goalOptions:deliveryOptions;field=`<h3 class="gw-type-question-label">${q.tab===0?'这次讨论，你更想先得到什么？':'你希望计划包含哪些内容？（可多选）'}</h3><div class="question-options" role="${q.tab===0?'radiogroup':'group'}" aria-label="${questionNames[q.tab]}">${options.map((o,i)=>{const selected=q.tab===0?q.goal===o[0]:q.deliverables.includes(o[0]);return `<button type="button" class="question-option" role="${q.tab===0?'radio':'checkbox'}" aria-checked="${selected}" data-option="${o[0]}" data-index="${i}" data-cursor="${q.cursor===i}"><span class="question-key gw-type-question-shortcut">⌥ ${i+1}</span><span class="question-marker ${q.tab===1?'square':''}">${selected&&q.tab===1?icon('check'):''}</span><span class="question-option-copy"><span class="gw-type-question-option">${o[1]}</span><span class="gw-type-question-option-description">${o[2]}</span></span></button>`;}).join('')}</div>`;}
  else if(q.tab===2)field=`<h3 class="gw-type-question-label">补充一点项目背景 <span class="popup-subtitle">必填</span></h3><textarea class="question-text" aria-label="项目背景" placeholder="例如：4 人协作，计划用两周完成第一轮验证…">${esc(q.context)}</textarea>`;
  else field=`<h3 class="gw-type-question-title">确认这些信息后，继续整理计划</h3>${questionReview()}`;
  card.innerHTML=`<div class="question-topline"><span>${icon('message')}需要你的补充<span class="mini-tag">模拟提问</span></span><div class="question-actions"><button data-q-refuse>拒绝</button><button data-q-cancel>取消</button><button data-q-collapse aria-label="收起问题">${icon('chevron-down')}</button></div></div><div class="question-tabs" role="tablist" aria-label="补充信息标签">${questionNames.map((name,i)=>`<button type="button" role="tab" class="gw-type-question-tab" aria-selected="${q.tab===i}" tabindex="${q.tab===i?0:-1}" data-q-tab="${i}">${i<3?`${i+1}. `:''}${name}</button>`).join('')}</div>${q.error?`<div class="question-error" role="alert">${esc(q.error)}</div>`:''}<div class="question-fields">${field}</div><div class="question-footer"><span>↑ ↓ 移动 · Space 选择 · Enter 下一步</span>${q.tab===3?`<label class="fail-switch"><input type="checkbox" data-q-fail ${q.simulateFailure?'checked':''}>模拟提交失败</label>`:''}<button class="gw-button gw-button--primary" data-q-next ${q.status==='submitting'?'disabled':''}>${q.status==='submitting'?'正在模拟提交…':q.tab===3?'确认并继续':'下一步'}</button></div>`;
  $$('[data-q-tab]',card).forEach(b=>{b.onclick=()=>{if(q.status==='submitting')return;q.tab=+b.dataset.qTab;q.error='';q.cursor=0;renderQuestion();$(`[data-q-tab="${q.tab}"]`,card).focus();};b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();q.tab=(q.tab+(e.key==='ArrowRight'?1:3))%4;q.error='';renderQuestion();$(`[data-q-tab="${q.tab}"]`,card).focus();}};});
  $$('[data-option]',card).forEach(b=>{b.onclick=()=>chooseOption(b.dataset.option,+b.dataset.index);b.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();q.cursor=(+b.dataset.index+(e.key==='ArrowDown'?1:2))%3;renderQuestion();$(`[data-index="${q.cursor}"]`,card).focus();}else if(e.key==='Enter'){e.preventDefault();nextQuestion();}};});
  const text=$('.question-text',card);if(text)text.oninput=()=>{q.context=text.value;q.error='';};
  $('[data-q-next]',card).onclick=nextQuestion;
  $('[data-q-collapse]',card).onclick=()=>{q.collapsed=true;renderQuestion();};
  $('[data-q-cancel]',card).onclick=()=>finishQuestion('cancelled');$('[data-q-refuse]',card).onclick=()=>finishQuestion('refused');
  const fail=$('[data-q-fail]',card);if(fail)fail.onchange=()=>q.simulateFailure=fail.checked;
  measureInput();
}
function chooseOption(value,index) {if(q.status!=='pending')return;q.cursor=index;q.error='';if(q.tab===0)q.goal=value;else q.deliverables=q.deliverables.includes(value)?q.deliverables.filter(v=>v!==value):[...q.deliverables,value];renderQuestion();$(`[data-index="${index}"]`,$('#question-card'))?.focus();}
function nextQuestion() {
  if(q.status!=='pending')return;
  if(q.tab<3) {q.error=validateQuestion();if(!q.error){q.tab++;q.cursor=0;}renderQuestion();return;}
  for(let tab=0;tab<3;tab++){const error=validateQuestion(tab);if(error){q.tab=tab;q.error=error;renderQuestion();return;}}
  q.status='submitting';q.error='';renderQuestion();
  setTimeout(()=>{if(q.simulateFailure){q.status='pending';q.error='模拟提交失败。答案与草稿已保留，关闭失败开关后可重试。';renderQuestion();return;}q.status='completed';q.details=false;renderQuestion();setChatState('completed');appendMessage('assistant',assistant(`<p>收到。你的关注方向是<strong>${esc(goalOptions.find(o=>o[0]===q.goal)[1])}</strong>，预期输出包括${q.deliverables.map(d=>deliveryOptions.find(o=>o[0]===d)[1]).join('、')}。</p><p>建议先约定一个小范围的验证节点：把目标与负责人整理成一页简报，邀请参与者共同补齐依赖和阻塞，再确定第一轮行动清单。</p><p class="gw-type-description">以上是基于预设模板的本地模拟结果。</p>`,'刚刚'));},700);
}
function finishQuestion(result) {if(q.status==='submitting')return;q.status=result;q.details=false;renderQuestion();setChatState('completed');toast(result==='cancelled'?'已取消提问；草稿保留，可查看。':'已记录拒绝回答；草稿保留。');}
function requestSend(target) {
  if($(`#${target}-send`).disabled)return;
  if(target==='chat'&&q.status==='pending') {confirmAction($('#chat-send'),'发送新消息？','继续发送会跳过当前问题。若模拟发送失败，当前问题和消息草稿都会保留。',()=>sendPrompt(target),'跳过问题并发送');return;}
  sendPrompt(target);
}
function sendPrompt(target) {
  const input=$(`#${target}-prompt`),text=input.value.trim(),pills=drafts[target].map(p=>p.name).join('、');
  if(!text&&!pills)return;
  if(target==='home') {if(!initializedChat) {initializedChat=true;$('#message-list').innerHTML='';q.status='skipped';q.collapsed=false;renderQuestion();}$('#chat-title').textContent=(text||pills).slice(0,30);showView('chat');}
  followBottom=true;setChatState('sending');
  const pendingText=text,pendingPills=[...drafts[target]];
  generationTimer=setTimeout(()=>{
    if(pendingText.includes('失败')) {setChatState('failed');if(target==='home'){$('#chat-prompt').value=input.value;drafts.chat=[...pendingPills];renderPills('chat');}toast('模拟发送失败：草稿已保留。移除“失败”二字可重试。');return;}
    appendMessage('user',`<div class="gw-message-user gw-type-chat-body">${esc(pendingText||'使用所选附件与能力继续').replace(/\n/g,'<br>')}${pills?`<div class="gw-type-description" style="margin-top:8px">已附加：${esc(pills)}（模拟）</div>`:''}</div>`);
    input.value='';drafts[target]=[];renderPills(target);updateSend(target);if(target==='home'){$('#chat-prompt').value='';updateSend('chat');}
    if(q.status==='pending'){q.status='skipped';renderQuestion();}
    setChatState('working');const processing=appendMessage('assistant',`<div class="tool-row"><span class="gw-status-spinner"></span><span>正在整理下一步</span><span class="tool-detail-label">模拟工作中，可停止</span></div>`);
    generationTimer=setTimeout(()=>{processing.innerHTML=assistant(`<p>我们可以先从一个清晰的小步骤开始：<strong>${esc(pendingText.slice(0,80)||'检查当前任务的目标与输入')}</strong>。</p><p>先确认预期结果，再列出必要的信息与依赖，最后选一个可以马上验证的动作。如果条件还不完整，可以把不确定事项保留在清单中，等获得新信息后更新。</p><ul><li>写下这一步结束时需要看到的具体结果。</li><li>确认谁参与、需要什么输入，以及什么时候检查。</li><li>保留决策依据，让下一轮讨论能沿着已有信息继续。</li></ul><p class="gw-type-description">这是本地预设回复；未调用模型或真实工具。输入包含“失败”可检查发送失败与草稿保留。</p>`,'刚刚');hydrate(processing);$('[data-copy]',processing).onclick=()=>copyText(processing.innerText);setChatState('completed');if(followBottom)scrollBottom(false);},1800);
  },600);
}
function stopGeneration() {clearTimeout(generationTimer);generationTimer=null;setChatState('stopped');const processing=$('#message-list .message:last-child');if(processing?.querySelector('.gw-status-spinner'))processing.innerHTML='<div class="gw-type-description">模拟生成已停止，可以继续发送消息。</div>';toast('已停止模拟生成；未发送成功的草稿仍保留。');}

// The diagnostic layer is behind all foreground content and every glass surface.
root.insertAdjacentHTML('afterbegin',`<div class="optics-test" id="optics-test" aria-hidden="true" hidden>${Array.from({length:12},(_,i)=>`<span style="top:${i*72+20}px">玻璃光路检查 · 中文导航保持清晰 · 0123456789 ──────────────────────────────────────────────────────────────────────────────</span>`).join('')}</div>`);
root.insertAdjacentHTML('beforeend',`<details class="material-inspector"><summary>材质检查</summary><div><fieldset><legend>同染色光学对照</legend><label><input type="radio" name="glass-mode" value="zoned" checked>融合</label><label><input type="radio" name="glass-mode" value="frosted">磨砂</label><label><input type="radio" name="glass-mode" value="refractive">清透折射</label><label><input type="radio" name="glass-mode" value="off">关闭光学</label></fieldset><p>2 px 磨砂 · 14 px 最大单轴折射 · 20 px 边缘<br>烟灰蓝 #667585 · 24% 染色</p><label><input type="checkbox" id="optics-toggle">光栅与文字检查层（默认关闭）</label><p>此层仅用于光路对照；关闭后检查中文导航。</p></div></details>`);
const materialControllers=new Map();
function refreshMaterials() {
  const surfaces=$$('.gw-glass-backdrop',root).filter(surface=>!surface.closest('[data-dialog-material]')),mode=root.dataset.glassStyle;
  for(const [surface,controller] of materialControllers)if(!surfaces.includes(surface)){controller.destroy();materialControllers.delete(surface);}
  for(const surface of surfaces){
    const controller=materialControllers.get(surface);
    if(controller)controller.update({mode});
    else materialControllers.set(surface,createGlassSurface({element:surface.parentElement,materialElement:surface,mode,blur:2,strength:14,edge:20,tint:'#667585',opacity:.24}));
  }
}
$$('[name="glass-mode"]').forEach(input=>input.onchange=()=>{root.dataset.glassStyle=input.value;refreshMaterials();});
$('#optics-toggle').onchange=e=>$('#optics-test').hidden=!e.target.checked;
const decoration=mountMascot($('#mascot'),{color:'#9ed1b2',ink:'#173324'});
scenarioRail=createLensRail({label:'任务场景',itemDataAttribute:'data-scenario',items:[{value:'work',label:'工作',icon:'briefcase'},{value:'code',label:'代码',icon:'code'},{value:'assistant',label:'助手',icon:'sparkles'}],selected:scenario,onSelect:selectScenario});
$('.stage-bottom .gw-lens-rail').replaceWith(scenarioRail.element);
$('#settings-root').addEventListener('settings-page-change',event=>{$('#settings-page-title').textContent=event.detail.title;});
const settingsController=mountSettings($('#settings-root'),{onBack:()=>showView('home')});
renderSpaces();hydrate();refreshMaterials();
const selectScope=enhanceSelects(root);
new ResizeObserver(()=>{if(view==='chat'){measureInput();if(followBottom)scrollBottom(false);}}).observe($('#chat-input-stack'));
$('#timeline').addEventListener('scroll',()=>{const t=$('#timeline');followBottom=t.scrollHeight-t.scrollTop-t.clientHeight<90;$('#jump-bottom').hidden=followBottom;});
$('#jump-bottom').onclick=()=>{followBottom=true;scrollBottom();};
$$('[data-nav]').forEach(b=>b.onclick=()=>b.dataset.nav==='chat'?openChat():showView('home'));
$$('[data-open-chat]').forEach(b=>b.onclick=()=>openChat(b.dataset.openChat));
$('#open-sample').onclick=()=>openChat();$('#breadcrumb-home').onclick=()=>showView('home');
$('#top-settings').onclick=$('#sidebar-settings').onclick=()=>showView('settings');
$('#search-tasks').onclick=()=>openSearch($('#search-tasks'));$('#chat-search').onclick=()=>openSearch($('#chat-search'),true);
$('#home-add').onclick=()=>openAdd($('#home-add'),'home');$('#chat-add').onclick=()=>openAdd($('#chat-add'),'chat');
$('#home-model').onclick=()=>openModel($('#home-model'));$('#chat-model').onclick=()=>openModel($('#chat-model'));$('#workspace-menu').onclick=openWorkspace;
$('#home-send').onclick=()=>requestSend('home');$('#chat-send').onclick=()=>requestSend('chat');$('#chat-stop').onclick=stopGeneration;
$$('[data-location]').forEach(b=>{b.onclick=()=>setLocation(b.dataset.location);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const value=runLocation==='local'?'cloud':'local';setLocation(value);$(`[data-location="${value}"]`).focus();}};});
['home','chat'].forEach(target=>{const input=$(`#${target}-prompt`);input.oninput=()=>{input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,target==='home'?440:220)}px`;updateSend(target);if(target==='chat'&&!['sending','working'].includes(state))setChatState(input.value.trim()?'typing':q.status==='pending'?'awaiting_input':'idle');};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();requestSend(target);}};});
$('#attachment-input').onchange=e=>{const target=attachmentTarget;for(const file of e.target.files){const pill={id:crypto.randomUUID(),name:file.name,type:'attachment',status:'uploading'};drafts[target].push(pill);setTimeout(()=>{pill.status=file.size>20*1024*1024?'failed':'ready';renderPills(target);if(pill.status==='failed')toast('演示附件大于 20 MB：模拟上传失败，可移除后重选。');},900);}renderPills(target);e.target.value='';toast('附件仅在当前页面显示文件名，不会上传。');};
$('#permission-mode').onclick=()=>{const el=$('#permission-mode span:not([data-icon])');const asking=el.textContent==='先询问';el.textContent=asking?'仅查看':'先询问';toast(`已切换为${el.textContent}（演示设置，不授予系统权限）。`);};
$('#agent-menu').onclick=()=>{const trigger=$('#agent-menu');const node=makePopup(trigger,`<div class="popup-heading">选择演示助手</div>${['通用助手','写作伙伴','代码伙伴'].map(name=>`<button class="gw-popup-item" data-agent="${name}">${icon('sparkles')}${name}</button>`).join('')}<div class="popup-footnote">只改变当前助手名称。</div>`,{width:230});$$('[data-agent]',node).forEach(b=>b.onclick=()=>{trigger.innerHTML=`${b.dataset.agent}<span data-icon="chevron-down"></span>`;hydrate(trigger);closePopup();});};
$('#voice-input').onclick=()=>{const trigger=$('#voice-input');trigger.dataset.active='true';const node=makePopup(trigger,`<div class="popup-heading">语音输入演示</div><div class="popup-empty">${icon('mic')}未请求麦克风权限</div><button class="gw-popup-item" data-voice>${icon('plus')}插入一段示例转写</button><div class="popup-footnote">这是本地模拟，不录音。</div>`,{above:true,width:280});$('[data-voice]',node).onclick=()=>{$('#home-prompt').value='帮我把今天的想法整理成一个清晰的行动计划。';$('#home-prompt').dispatchEvent(new Event('input'));trigger.dataset.active='false';closePopup();$('#home-prompt').focus();};};
$('#motion-toggle').onclick=()=>{motionPaused=!motionPaused;ambientBackground.update({motion:!motionPaused&&view==='home'});decoration.setPaused(motionPaused||view!=='home');$('#motion-toggle').innerHTML=icon(motionPaused?'play':'pause');$('#motion-toggle').setAttribute('aria-label',motionPaused?'恢复背景动效':'暂停背景动效');$('#motion-toggle').title=motionPaused?'恢复背景动效':'暂停背景动效';};
$('#notifications').onclick=()=>{const node=makePopup($('#notifications'),'<div class="popup-heading">通知</div><div class="popup-empty">目前没有新的演示通知。</div>',{width:260});};
$('#profile-button').onclick=()=>{const node=makePopup($('#profile-button'),`<div class="popup-heading">演示用户<span class="mini-tag">本地</span></div><button class="gw-popup-item" data-profile-settings>${icon('settings')}偏好设置</button><div class="popup-footnote">未关联真实账户或个人数据。</div>`,{above:true,width:250});$('[data-profile-settings]',node).onclick=()=>showView('settings');};
$('#chat-more').onclick=()=>{const trigger=$('#chat-more');const node=makePopup(trigger,`<button class="gw-popup-item" data-copy-chat>${icon('copy')}复制演示对话</button><button class="gw-popup-item" data-reset-question>${icon('refresh')}重新体验提问</button><button class="gw-popup-item" data-send-fail>${icon('warning')}填入发送失败样例</button>`,{width:240});$('[data-copy-chat]',node).onclick=()=>{copyText($('#message-list').innerText);closePopup();};$('[data-reset-question]',node).onclick=()=>{Object.assign(q,{status:'pending',tab:0,goal:'',deliverables:[],context:'',collapsed:false,error:'',simulateFailure:false,details:false,cursor:0});renderQuestion();setChatState('awaiting_input');closePopup();};$('[data-send-fail]',node).onclick=()=>{$('#chat-prompt').value='演示发送失败';$('#chat-prompt').dispatchEvent(new Event('input'));closePopup(false);$('#chat-prompt').focus();};};
$('#add-workspace').onclick=()=>{if(spaces.length>=5){toast('最多展示 5 个演示工作区。');return;}spaces.push({name:`新工作区 ${spaces.length-2}`,count:0});renderSpaces();toast('已添加演示工作区；仅保留于本页。');};
function syncSidebarToggle() {
  const expanded=innerWidth<1024?root.classList.contains('sidebar-open'):!root.classList.contains('sidebar-collapsed');
  const toggle=$('#toggle-sidebar'),label=expanded?'收起侧栏':'展开侧栏';
  toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-label',label);toggle.title=label;
}
function toggleSidebar() {if(innerWidth<1024){const open=root.classList.toggle('sidebar-open');$('#sidebar-scrim').hidden=!open;}else root.classList.toggle('sidebar-collapsed');syncSidebarToggle();requestAnimationFrame(refreshMaterials);}
$('#toggle-sidebar').onclick=toggleSidebar;$('#sidebar-scrim').onclick=()=>{root.classList.remove('sidebar-open');$('#sidebar-scrim').hidden=true;syncSidebarToggle();$('#toggle-sidebar').focus();};
let resizing=false;
$('#sidebar-resizer').onpointerdown=e=>{if(innerWidth<1024)return;resizing=true;$('#sidebar-resizer').setPointerCapture(e.pointerId);};
$('#sidebar-resizer').onpointermove=e=>{if(!resizing)return;const width=e.clientX;if(width<298)root.classList.add('sidebar-collapsed');else if(width>310){root.classList.remove('sidebar-collapsed');root.style.setProperty('--sidebar-width',`${Math.min(400,Math.max(304,width))}px`);}syncSidebarToggle();};
$('#sidebar-resizer').onpointerup=()=>{resizing=false;syncSidebarToggle();refreshMaterials();};
$('#sidebar-resizer').onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(e.key==='ArrowLeft')root.classList.add('sidebar-collapsed');else root.classList.remove('sidebar-collapsed');syncSidebarToggle();refreshMaterials();}};
document.addEventListener('pointerdown',e=>{if(activePopup&&!activePopup.modal&&!activePopup.node.contains(e.target)&&!activePopup.trigger?.contains(e.target)){closePopup(false);$('#voice-input').dataset.active='false';}});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(activePopup){e.preventDefault();closePopup();$('#voice-input').dataset.active='false';}else if(root.classList.contains('sidebar-open')){$('#sidebar-scrim').click();}return;}
 if(activePopup?.modal&&e.key==='Tab'){const nodes=$$('button,input,textarea,[tabindex="0"]',activePopup.node).filter(el=>!el.disabled&&!el.hidden);if(nodes.length){const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch($('#search-tasks'));}
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();showView('home');$('#home-prompt').focus();}
 if(view==='chat'&&q.status==='pending'&&!q.collapsed&&q.tab<2&&e.altKey&&/^[1-3]$/.test(e.key)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();const i=Number(e.key)-1;chooseOption((q.tab===0?goalOptions:deliveryOptions)[i][0],i);}
});
window.addEventListener('resize',()=>{if(innerWidth>=1024){root.classList.remove('sidebar-open');$('#sidebar-scrim').hidden=true;}syncSidebarToggle();measureInput();});
syncSidebarToggle();
window.addEventListener('pagehide',event=>{if(event.persisted)return;selectScope.destroy();closePopup(false);settingsController.destroy();scenarioRail.destroy();decoration.dispose();materialControllers.forEach(c=>c.destroy());clearTimeout(generationTimer);});
