import { enhanceSelect } from './select.js';
import { mountZonedGlass } from '../zoned-glass.js';
import { mountGlassRefraction } from '../glass.js';
import { mountLensReflections } from '../highlights.js';

// These are presentation components. Values are read from props; events are intents.
// update() merges a new snapshot. It never writes into supplied objects or arrays.
const SVG='http://www.w3.org/2000/svg';
const paths={
  briefcase:'M3 7h18v13H3zM8 7V4h8v3M3 12h18M10 12v3h4v-3',
  code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  sparkles:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z',
  mic:'M8 5a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0V5Zm-3 6v1a7 7 0 0 0 14 0v-1M12 19v3M9 22h6',
  plus:'M12 5v14M5 12h14',send:'M12 19V5m-6 6 6-6 6 6',
  down:'m7 10 5 5 5-5',up:'m7 14 5-5 5 5',check:'m5 12 4 4L19 6',
  question:'M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z',
};
const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
const button=(className,label)=>{const n=el('button',className,label);n.type='button';return n;};
const icon=name=>{const n=document.createElementNS(SVG,'svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.55');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');const path=document.createElementNS(SVG,'path');path.setAttribute('d',paths[name]||paths.sparkles);n.append(path);return n;};
const emit=(p,name,...args)=>{if(typeof p[name]==='function')p[name](...args);};
const appendNodes=(host,nodes)=>{for(const node of nodes||[])if(node instanceof Node&&node.parentNode!==host)host.append(node);};
let sequence=0;
function focusedWithin(host) {
  const node=document.activeElement;if(!host.contains(node))return null;
  return {key:node.dataset.focusKey,start:typeof node.selectionStart==='number'?node.selectionStart:null,end:typeof node.selectionEnd==='number'?node.selectionEnd:null};
}
function restoreFocus(host,focus) {
  if(!focus?.key)return;
  const node=[...host.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===focus.key);
  if(!node||node.disabled)return;
  node.focus({preventScroll:true});
  if(focus.start!==null&&typeof node.setSelectionRange==='function')node.setSelectionRange(focus.start,focus.end);
}
function component(element,initial,render,{cleanup=()=>{},removeOnDestroy=true}={}) {
  let props={...initial},disposed=false,events;
  function update(next={}) {
    if(disposed)return;
    const focus=focusedWithin(element);props={...props,...next};events?.abort();events=new AbortController();
    render(props,(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal}));restoreFocus(element,focus);
  }
  const api={element,update,destroy(){if(disposed)return;disposed=true;events?.abort();cleanup();if(removeOnDestroy)element.remove();}};
  update();return api;
}

/** Optional element/materialElement adopt an existing surface; otherwise create a div.
 * mode/blur/strength/edge/tint/opacity only affect optics. children accepts DOM Nodes. */
export function createGlassSurface(initial={}) {
  const host=initial.element instanceof HTMLElement?initial.element:el(initial.tagName||'div');
  const adopted=host===initial.element;
  const supplied=initial.materialElement instanceof HTMLElement?initial.materialElement:null;
  const material=supplied||el('div','gw-glass-backdrop');
  const hostStyleNames=['--gw-glass-tint','--gw-glass-blur'];
  const materialStyleNames=['backdrop-filter','-webkit-backdrop-filter','--gw-glass-refraction','--gw-glass-filter-blur'];
  const snapshot=(node,names)=>names.map(name=>[name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]);
  const restore=(node,styles)=>{for(const [name,value,priority] of styles)if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name);};
  const old={mode:host.getAttribute('data-glass-mode'),ariaHidden:material.getAttribute('aria-hidden'),hasBackdropClass:material.classList.contains('gw-glass-backdrop'),hostStyles:snapshot(host,hostStyleNames),materialStyles:snapshot(material,materialStyleNames)};
  const ownedHostClasses=new Set();
  const addHostClass=name=>{if(!host.classList.contains(name)){host.classList.add(name);ownedHostClasses.add(name);}};
  material.classList.add('gw-glass-backdrop');material.setAttribute('aria-hidden','true');
  if(!supplied)host.prepend(material);
  let optics=null,lastKey='',ownedMode='';
  return component(host,initial,p=>{
    addHostClass('gw-glass');addHostClass('gw-component-glass');
    const mode=['zoned','frosted','refractive','off'].includes(p.mode)?p.mode:'zoned';
    const blur=Number.isFinite(p.blur)?Math.max(0,p.blur):2;
    const strength=Number.isFinite(p.strength)?Math.max(0,p.strength):14;
    const edge=Number.isFinite(p.edge)?Math.max(1,p.edge):20;
    const opacity=Number.isFinite(p.opacity)?Math.min(1,Math.max(0,p.opacity)):.24;
    const hex=/^#[0-9a-f]{6}$/i.test(p.tint||'')?p.tint:'#667585';
    const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    host.style.setProperty('--gw-glass-tint',`rgb(${rgb.join(' ')} / ${opacity*100}%)`);
    host.style.setProperty('--gw-glass-blur',`${blur}px`);host.dataset.glassMode=mode;ownedMode=mode;
    if(p.className)for(const c of String(p.className).split(/\s+/).filter(Boolean))addHostClass(c);
    if(Array.isArray(p.children)){
      const nodes=[...new Set(p.children.filter(node=>node instanceof Node&&node!==material&&node!==host))];
      for(const child of [...host.childNodes])if(child!==material&&!nodes.includes(child))child.remove();
      if(material.parentNode!==host||host.firstChild!==material)host.insertBefore(material,host.firstChild);
      nodes.forEach((node,index)=>{const reference=host.childNodes[index+1]||null;if(reference!==node)host.insertBefore(node,reference);});
    }
    const key=JSON.stringify([mode,blur,strength,edge]);
    if(key!==lastKey) {
      optics?.destroy();optics=null;material.style.removeProperty('backdrop-filter');material.style.removeProperty('-webkit-backdrop-filter');
      if(mode==='zoned')optics=mountZonedGlass(material,{blur,strength,edge});
      else if(mode==='refractive')optics=mountGlassRefraction(material,{strength,edge,rimBlur:0,radius:parseFloat(getComputedStyle(material).borderTopLeftRadius)||0});
      else {const filter=mode==='off'?'none':`blur(${blur}px) saturate(1.18)`;material.style.backdropFilter=filter;material.style.webkitBackdropFilter=filter;}
      lastKey=key;
    }else optics?.refresh?.();
  },{removeOnDestroy:!adopted,cleanup(){
    optics?.destroy();
    if(!supplied)material.remove();
    else {restore(material,old.materialStyles);if(!old.hasBackdropClass)material.classList.remove('gw-glass-backdrop');if(material.getAttribute('aria-hidden')==='true'){if(old.ariaHidden===null)material.removeAttribute('aria-hidden');else material.setAttribute('aria-hidden',old.ariaHidden);}}
    for(const name of ownedHostClasses)host.classList.remove(name);restore(host,old.hostStyles);
    if(host.getAttribute('data-glass-mode')===ownedMode){if(old.mode===null)host.removeAttribute('data-glass-mode');else host.setAttribute('data-glass-mode',old.mode);}
  }});
}

/** items:[{value,label,icon?}], selected, onSelect(nextValue|null). */
export function createLensRail(initial={}) {
  const host=el('div','gw-lens-rail gw-component-lens');
  const dispose=mountLensReflections(host);
  return component(host,initial,(p,on)=>{
    host.replaceChildren();host.setAttribute('role','group');host.setAttribute('aria-label',p.label||'场景入口');
    const items=Array.isArray(p.items)?p.items:[];
    const attr=/^data-[a-z0-9-]+$/.test(p.itemDataAttribute||'')?p.itemDataAttribute:'data-value';
    items.forEach((item,index)=>{
      const b=button('gw-lens-button gw-type-scenario');if(item.icon)b.append(icon(item.icon));b.append(el('span','',item.label));
      b.setAttribute(attr,String(item.value));b.dataset.focusKey=`lens-${index}`;b.setAttribute('aria-pressed',String(p.selected===item.value));b.disabled=Boolean(p.disabled||item.disabled);
      on(b,'click',()=>emit(p,'onSelect',p.selected===item.value?null:item.value));
      on(b,'keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const enabled=[...host.querySelectorAll('button:not(:disabled)')];const current=enabled.indexOf(b);const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(current+(event.key==='ArrowRight'?1:enabled.length-1))%enabled.length;enabled[next]?.focus();});
      host.append(b);
    });
  },{cleanup:dispose});
}

/** active is controlled; a press emits the requested next active state. */
export function createVoiceButton(initial={}) {
  const host=button('gw-voice-button gw-component-voice');
  return component(host,initial,(p,on)=>{host.replaceChildren(icon('mic'));host.setAttribute('aria-label',p.label||'语音输入');host.title=p.label||'语音输入';host.setAttribute('aria-pressed',String(Boolean(p.active)));host.dataset.active=String(Boolean(p.active));host.disabled=Boolean(p.disabled);on(host,'click',()=>emit(p,'onSelect',!p.active));});
}

/** canSend is an explicit caller decision. Sending never clears value internally. */
export function createChatComposer(initial={}) {
  const host=el('div','gw-editor gw-component-composer');
  const textarea=el('textarea','gw-type-home-editor');textarea.rows=2;textarea.dataset.focusKey='composer-input';
  const beam=el('span','beam');beam.setAttribute('aria-hidden','true');beam.dataset.animated='true';beam.append(el('span','bloom'),el('span','edge'));
  const errors=el('div','gw-component-error');errors.setAttribute('role','alert');
  const band=el('div','gw-component-toolband');const left=el('div','gw-component-tools');const right=el('div','gw-component-tools');band.append(left,right);host.append(beam,textarea,errors,band);
  let composing=false;
  return component(host,initial,(p,on)=>{
    const busy=['sending','working'].includes(p.status);beam.dataset.borderBeam=busy?'working':'idle';beam.dataset.animated=String(p.animated!==false);
    if(!composing&&textarea.value!==String(p.value??''))textarea.value=String(p.value??'');
    textarea.placeholder=p.placeholder||'继续聊聊，或补充你的想法…';textarea.setAttribute('aria-label',p.label||'消息内容');textarea.disabled=Boolean(p.disabled);textarea.style.height='auto';textarea.style.height=`${Math.min(220,Math.max(45,textarea.scrollHeight))}px`;
    errors.textContent=p.error||'';errors.hidden=!p.error;left.replaceChildren();right.replaceChildren();
    const add=button('gw-component-tool');add.setAttribute('aria-label','添加附件或能力');add.title='添加附件或能力';add.append(icon('plus'));add.disabled=Boolean(p.disabled);on(add,'click',()=>emit(p,'onAdd'));left.append(add);
    if(p.modelLabel){const model=button('gw-component-model',p.modelLabel);model.dataset.focusKey='composer-model';model.append(icon('down'));model.disabled=Boolean(p.disabled);on(model,'click',()=>emit(p,'onModelSelect'));left.append(model);}
    appendNodes(left,p.actions);
    const status=el('span','gw-component-composer-status',p.statusLabel||p.status||'idle');right.append(status);
    const send=button(busy?'gw-component-stop':'gw-glass-round gw-glass-round--send');send.dataset.focusKey=busy?'composer-stop':'composer-send';send.setAttribute('aria-label',busy?'停止':'发送');send.title=busy?'停止':'发送';send.disabled=Boolean(p.disabled||(!busy&&!p.canSend));if(busy)send.append(el('span'));else send.append(icon('send'));
    on(send,'click',()=>busy?emit(p,'onStop'):emit(p,'onSend',{value:String(p.value??'')}));right.append(send);
    on(textarea,'compositionstart',()=>{composing=true;});on(textarea,'compositionend',()=>{composing=false;});
    on(textarea,'input',()=>{textarea.style.height='auto';textarea.style.height=`${Math.min(220,Math.max(45,textarea.scrollHeight))}px`;emit(p,'onInput',textarea.value);});
    on(textarea,'keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!composing&&event.keyCode!==229){event.preventDefault();if(!p.disabled&&!busy&&p.canSend)emit(p,'onSend',{value:String(p.value??'')});}});
  });
}

const questionList=p=>(Array.isArray(p.questions)?p.questions:[]).map(q=>({...q,options:Array.isArray(q.options)?q.options.map(o=>({...o})):[]}));
function answerText(question,value) {
  if(Array.isArray(value))return value.map(v=>question.options.find(o=>o.value===v)?.label??String(v)).join('、')||'—';
  return question.options.find(o=>o.value===value)?.label??(String(value??'')||'—');
}
function summary(questions,answers) {
  const node=el('div','gw-component-answer-summary');
  for(const q of questions){const row=el('div');row.append(el('span','',q.label||q.title),el('div','',answerText(q,answers?.[q.id])));node.append(row);}return node;
}
/** Questions/answers/activeQuestion/status/collapsed are all controlled.
 * onNavigate emits an intended tab; onConfirm never validates or submits. */
export function createQuestionCard(initial={}) {
  const host=el('section','gw-dock gw-component-question');
  const instance=`gw-question-${++sequence}`,events=new AbortController(),textNodes=new Map();
  let props={...initial},disposed=false,fieldKey='';
  const head=el('div','gw-component-question-head'),title=el('span','gw-type-question-title'),actions=el('div','gw-component-question-actions');
  const refuse=button('gw-component-text-button','拒绝'),cancel=button('gw-component-text-button','取消'),collapse=button('gw-component-text-button','收起');
  refuse.dataset.action='refused';cancel.dataset.action='cancelled';collapse.dataset.action='collapse';actions.append(refuse,cancel,collapse);head.append(title,actions);
  const collapsedText=el('p','gw-type-description gw-component-question-collapsed');
  const tabs=el('div','gw-component-question-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','问题标签');
  const error=el('div','gw-component-error');error.setAttribute('role','alert');
  const field=el('div','gw-component-question-field');field.id=`${instance}-field`;field.setAttribute('role','tabpanel');
  const footer=el('div','gw-component-question-footer'),hint=el('span'),next=button('gw-button gw-button--primary');next.dataset.action='next';next.dataset.focusKey='question-next';footer.append(hint,next);
  const readonly=el('div','gw-component-question-readonly'),readonlyLabel=el('span'),readonlyCollapse=button('gw-component-text-button');readonlyCollapse.dataset.action='collapse';readonly.append(readonlyLabel,readonlyCollapse);
  const readonlySummary=el('div');host.append(head,collapsedText,tabs,error,field,footer,readonly,readonlySummary);
  const listen=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
  const current=()=>{const questions=questionList(props),active=props.activeQuestion||questions[0]?.id||'__confirm__';return {questions,active,ids:[...questions.map(q=>q.id),'__confirm__'],question:questions.find(q=>q.id===active)};};
  const editable=()=>['pending','failed'].includes(props.status||'pending');
  function selectOption(index) {
    const {question:q}=current();if(!editable()||!q||q.type==='text')return;
    const option=q.options[index];if(!option||q.disabled||option.disabled)return;
    const value=props.answers?.[q.id];
    if(q.type==='multiple'){const values=Array.isArray(value)?[...value]:[];emit(props,'onAnswer',q.id,values.includes(option.value)?values.filter(v=>v!==option.value):[...values,option.value]);}
    else emit(props,'onAnswer',q.id,option.value);
  }
  function goNext() {if(!editable())return;const {active,ids}=current();if(active==='__confirm__'){if(props.canConfirm)emit(props,'onConfirm');}else emit(props,'onNavigate',ids[Math.min(ids.length-1,ids.indexOf(active)+1)]);}
  listen(host,'click',event=>{
    const b=event.target.closest('button');if(!b||!host.contains(b)||b.disabled)return;
    if(b.dataset.tab!==undefined)emit(props,'onNavigate',b.dataset.tab);
    else if(b.dataset.optionIndex!==undefined)selectOption(Number(b.dataset.optionIndex));
    else if(b.dataset.action==='collapse')emit(props,'onCollapse',!props.collapsed);
    else if(['refused','cancelled'].includes(b.dataset.action)){if(editable())emit(props,'onCancel',b.dataset.action);}
    else if(b.dataset.action==='next')goNext();
  });
  listen(host,'keydown',event=>{
    const b=event.target.closest('button');const {ids}=current();
    if(b?.dataset.tab!==undefined&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(editable())emit(props,'onNavigate',ids[(ids.indexOf(b.dataset.tab)+(event.key==='ArrowRight'?1:ids.length-1))%ids.length]);return;}
    if(b?.dataset.optionIndex!==undefined){if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const nodes=[...field.querySelectorAll('button:not(:disabled)')],i=nodes.indexOf(b);nodes[(i+(event.key==='ArrowDown'?1:nodes.length-1))%nodes.length]?.focus();return;}if(event.key==='Enter'&&!event.isComposing){event.preventDefault();goNext();return;}}
    if(event.altKey&&/^[1-9]$/.test(event.key)&&!['INPUT','TEXTAREA'].includes(event.target.tagName)){const target=field.querySelector(`[data-option-index="${Number(event.key)-1}"]`);if(target&&!target.disabled){event.preventDefault();target.focus();selectOption(Number(event.key)-1);}}
  });
  function update(nextProps={}) {
    if(disposed)return;const focus=focusedWithin(host);props={...props,...nextProps};
    const {questions,active,ids,question:q}=current(),answers=props.answers||{},status=props.status||'pending';const pending=editable(),submitting=status==='submitting',readonlyMode=!pending&&!submitting;
    const labelId=`${instance}-label-${Math.max(0,questions.findIndex(item=>item.id===active))}`;
    host.setAttribute('aria-label',props.label||'补充信息');head.hidden=readonlyMode;collapsedText.hidden=readonlyMode||!props.collapsed;tabs.hidden=readonlyMode||Boolean(props.collapsed);field.hidden=readonlyMode||Boolean(props.collapsed);footer.hidden=readonlyMode||Boolean(props.collapsed);readonly.hidden=!readonlyMode;readonlySummary.hidden=!readonlyMode||Boolean(props.collapsed)||props.showSummary===false;
    title.replaceChildren(icon('question'),document.createTextNode(props.title||'需要你的补充'));refuse.disabled=cancel.disabled=collapse.disabled=submitting;collapse.textContent=props.collapsed?'展开':'收起';collapsedText.textContent=props.collapsedLabel||'问题已收起；答案由调用方保留。';error.textContent=props.error||'';error.hidden=!props.error;
    if(readonlyMode){const labels={completed:'答案已确认',cancelled:'已取消回答',refused:'已拒绝回答',expired:'问题已过期'};readonlyLabel.textContent=labels[status]||String(status);readonlyCollapse.textContent=props.collapsed?'查看摘要':'收起摘要';readonlySummary.replaceChildren(summary(questions,answers));return;}
    tabs.replaceChildren();ids.forEach((id,index)=>{const b=button('gw-type-question-tab',id==='__confirm__'?'确认':questions[index].label||`${index+1}`);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active===id));b.tabIndex=active===id?0:-1;b.disabled=submitting;b.dataset.tab=String(id);b.dataset.focusKey=`tab-${id}`;b.id=`${instance}-tab-${index}`;b.setAttribute('aria-controls',field.id);tabs.append(b);});field.setAttribute('aria-labelledby',`${instance}-tab-${Math.max(0,ids.indexOf(active))}`);
    // Only structural changes replace fields. Value/status updates retain live textareas.
    const key=JSON.stringify([active,q?.type,q?.title,q?.label,q?.placeholder,q?.rows,q?.options]);
    if(key!==fieldKey){field.replaceChildren();if(active==='__confirm__')field.append(el('h3','gw-type-question-title',props.confirmTitle||'确认这些信息后继续'));else if(q){const heading=el('h3','gw-type-question-label',q.title||q.label);heading.id=labelId;field.append(heading);
      if(q.type==='text'){let entry=textNodes.get(q.id);if(!entry){const node=el('textarea','gw-component-question-text');node.dataset.focusKey=`answer-${q.id}`;entry={node,composing:false};textNodes.set(q.id,entry);listen(node,'compositionstart',()=>{entry.composing=true;});listen(node,'compositionend',()=>{entry.composing=false;});listen(node,'input',()=>{if(editable())emit(props,'onAnswer',q.id,node.value);});}entry.node.rows=q.rows||3;entry.node.placeholder=q.placeholder||'';entry.node.setAttribute('aria-labelledby',heading.id);field.append(entry.node);}
      else {const options=el('div','gw-component-question-options');options.setAttribute('role',q.type==='single'?'radiogroup':'group');options.setAttribute('aria-labelledby',heading.id);q.options.forEach((option,index)=>{const b=button('gw-component-question-option');b.setAttribute('role',q.type==='multiple'?'checkbox':'radio');b.dataset.focusKey=`option-${q.id}-${index}`;b.dataset.optionIndex=String(index);const marker=el('span',`gw-component-question-marker${q.type==='multiple'?' is-square':''}`);const copy=el('span','gw-component-question-option-copy');copy.append(el('span','gw-type-question-option',option.label));if(option.description)copy.append(el('span','gw-type-question-option-description',option.description));b.append(el('span','gw-component-question-key gw-type-question-shortcut',`⌥ ${index+1}`),marker,copy);options.append(b);});field.append(options);}}
      fieldKey=key;
    }
    if(active==='__confirm__'){let currentSummary=field.querySelector('.gw-component-answer-summary');const nextSummary=summary(questions,answers);if(currentSummary)currentSummary.replaceWith(nextSummary);else field.append(nextSummary);}
    else if(q?.type==='text'){const entry=textNodes.get(q.id);if(entry){entry.node.setAttribute('aria-labelledby',labelId);if(!entry.composing&&entry.node.value!==String(answers[q.id]??''))entry.node.value=String(answers[q.id]??'');entry.node.disabled=submitting||Boolean(q.disabled);}}
    else if(q){for(const b of field.querySelectorAll('[data-option-index]')){const option=q.options[Number(b.dataset.optionIndex)],value=answers[q.id],selected=q.type==='multiple'?Array.isArray(value)&&value.includes(option.value):value===option.value;b.setAttribute('aria-checked',String(selected));b.disabled=submitting||Boolean(q.disabled||option.disabled);const marker=b.querySelector('.gw-component-question-marker');marker.replaceChildren();if(selected&&q.type==='multiple')marker.append(icon('check'));}}
    hint.textContent=props.hint||'↑ ↓ 移动 · Space 选择 · Enter 下一步';next.textContent=submitting?(props.submittingLabel||'提交中…'):active==='__confirm__'?(props.confirmLabel||'确认并继续'):'下一步';next.disabled=submitting||(active==='__confirm__'&&!props.canConfirm);
    if(focus?.key?.startsWith('tab-'))[...tabs.children].find(b=>b.dataset.tab===String(active))?.focus({preventScroll:true});else restoreFocus(host,focus);
  }
  update();return {element:host,update,destroy(){if(disposed)return;disposed=true;events.abort();textNodes.clear();host.remove();}};
}

/** children is a DOM-node slot; callers own child component lifecycles. */
export function createSettingsPanel(initial={}) {
  const host=el('section','gw-panel gw-component-settings-panel'),title=el('h2','gw-type-section-title'),description=el('p','gw-type-description'),children=el('div','gw-component-settings-rows');host.append(title,description,children);
  return component(host,initial,p=>{title.textContent=p.title||'';title.hidden=!p.title;description.textContent=p.description||'';description.hidden=!p.description;const nodes=(p.children||[]).filter(n=>n instanceof Node);for(const child of [...children.childNodes])if(!nodes.includes(child))child.remove();nodes.forEach((node,index)=>{if(children.childNodes[index]!==node)children.insertBefore(node,children.childNodes[index]||null);});});
}

/** toggle->onInput(boolean), text->onInput(string), select->onSelect(string), button->onConfirm(). */
export function createSettingsRow(initial={}) {
  const host=el('div','gw-setting-row gw-component-settings-row'),id=`gw-setting-${++sequence}`,events=new AbortController();
  const copy=el('div','gw-component-settings-copy'),label=el('label','gw-type-label'),description=el('p','gw-type-description'),error=el('p','gw-component-error');label.htmlFor=id;description.id=`${id}-description`;error.setAttribute('role','alert');copy.append(label,description,error);host.append(copy);
  let props={...initial},control=null,currentType='',composing=false,disposed=false,selectUI=null;
  const listen=(node,type,fn)=>node.addEventListener(type,fn,{signal:events.signal});
  function update(next={}) {
    if(disposed)return;props={...props,...next};label.textContent=props.label||'';description.textContent=props.description||'';description.hidden=!props.description;error.textContent=props.error||'';error.hidden=!props.error;
    const type=['toggle','select','button'].includes(props.type)?props.type:'text';
    if(type!==currentType){selectUI?.destroy();selectUI=null;control?.remove();if(type==='toggle'){control=el('input','gw-component-switch');control.type='checkbox';control.setAttribute('role','switch');listen(control,'change',()=>{const value=control.checked;control.checked=Boolean(props.value);emit(props,'onInput',value);});}
      else if(type==='select'){control=el('select','gw-component-control');listen(control,'change',()=>{const value=control.value;control.value=String(props.value??'');emit(props,'onSelect',value);});}
      else if(type==='button'){control=button('gw-button');listen(control,'click',()=>emit(props,'onConfirm'));}
      else{control=el('input','gw-component-control');control.type='text';listen(control,'compositionstart',()=>{composing=true;});listen(control,'compositionend',()=>{composing=false;});listen(control,'input',()=>emit(props,'onInput',control.value));}
      control.id=id;control.dataset.focusKey='setting-control';host.append(control);currentType=type;composing=false;
    }
    if(type==='toggle')control.checked=Boolean(props.value);
    else if(type==='select'){const options=(props.options||[]).map(option=>{const o=el('option','',option.label);o.value=String(option.value);o.disabled=Boolean(option.disabled);return o;});control.replaceChildren(...options);control.value=String(props.value??'');}
    else if(type==='button')control.textContent=props.actionLabel||'操作';
    else{if(!composing&&control.value!==String(props.value??''))control.value=String(props.value??'');control.placeholder=props.placeholder||'';}
    control.disabled=Boolean(props.disabled||props.status==='submitting');if(props.description)control.setAttribute('aria-describedby',description.id);else control.removeAttribute('aria-describedby');if(props.status)host.dataset.status=String(props.status);else host.removeAttribute('data-status');
    if(type==='select'){selectUI ||= enhanceSelect(control);selectUI.refresh();}
  }
  update();return {element:host,update,destroy(){if(disposed)return;disposed=true;selectUI?.destroy();events.abort();host.remove();}};
}
