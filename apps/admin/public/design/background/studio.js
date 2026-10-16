import {createAmbientBackground,PRESETS} from './background.js';
import {paintField} from './field.js';
import {createGlassSurface} from '../components/ui.js';
import {mountLensReflections} from '../highlights.js';
const $=selector=>document.querySelector(selector);
const query=new URLSearchParams(location.search);
const byId=new Map(PRESETS.map(p=>[p.id,p]));
const order=['curtain','orbit','caustic','terrace','ribbon','mist','ember','tide'];
let preset=byId.has(query.get('preset'))?query.get('preset'):'curtain';
let motion=query.get('motion')!=='0',intensity=1;
const scene=createAmbientBackground({element:$('#studio-background'),preset,motion,intensity});
if(query.has('t'))scene.seek(Number(query.get('t')));
const media=matchMedia('(prefers-reduced-motion: reduce)');
const optics=createGlassSurface({element:$('#sample-sidebar')});
const removeReflections=mountLensReflections(document.body);
for(const id of order){
  const definition=byId.get(id);if(!definition)continue;
  const button=document.createElement('button');button.type='button';button.className='preset-card';
  button.dataset.preset=id;button.setAttribute('aria-label',definition.label);button.setAttribute('aria-pressed',String(id===preset));
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');paintField(canvas,id,7);canvas.style.filter=`blur(${Math.max(1.5,(definition.softness||0)*.22)}px)`;
  const copy=document.createElement('span');copy.className='preset-card-copy';
  const label=document.createElement('span');label.textContent=definition.label;
  const badge=document.createElement('small');badge.textContent=definition.original?'原创':'基础';copy.append(label,badge);
  const check=document.createElement('span');check.className='selection-mark';check.textContent='✓';check.setAttribute('aria-hidden','true');
  button.append(canvas,copy,check);$('#preset-gallery').append(button);
  button.addEventListener('click',()=>{preset=id;scene.update({preset});reflectSelection();reflectState();});
}
function reflectSelection(){
  const definition=byId.get(preset);
  $('#current-name').textContent=definition.label;$('#current-description').textContent=definition.description;
  for(const node of document.querySelectorAll('.preset-card[data-preset]'))node.setAttribute('aria-pressed',String(node.dataset.preset===preset));
}
function reflectState(){
  const state=scene.getState();
  const label=state.playing?'暂停动画':'继续动画';if($('#play-toggle').textContent!==label)$('#play-toggle').textContent=label;
  $('#play-toggle').disabled=state.reducedMotion;
  const text=state.reducedMotion?'系统减少动态 · 已静止':document.hidden?'页面隐藏 · 已静止':state.playing?'实时动画':'已暂停';
  if($('#motion-state').textContent!==text)$('#motion-state').textContent=text;
  $('#motion-clock').textContent=state.elapsed.toFixed(1)+' 秒';$('#motion-clock-footer').textContent=state.elapsed.toFixed(1)+' 秒';$('#motion-dot').dataset.paused=String(!state.playing);
}
$('#play-toggle').addEventListener('click',()=>{motion=!motion;scene.update({motion});reflectState();});
$('#restart-motion').addEventListener('click',()=>{motion=true;scene.update({motion});scene.seek(0);reflectState();});
$('#overlay-toggle').addEventListener('click',()=>{const hidden=!$('#workspace-overlay').hidden;$('#workspace-overlay').hidden=hidden;$('#overlay-toggle').textContent=hidden?'显示界面':'隐藏界面';$('#overlay-toggle').setAttribute('aria-pressed',String(!hidden));});
$('#studio-intensity').addEventListener('input',event=>{intensity=Number(event.target.value)/100;scene.update({intensity});$('#intensity-value').textContent=Math.round(intensity*100)+'%';});
for(const button of document.querySelectorAll('[data-at]'))button.addEventListener('click',()=>{motion=false;scene.update({motion});scene.seek(Number(button.dataset.at));reflectState();});
for(const button of document.querySelectorAll('.sample-sidebar>button'))button.addEventListener('click',()=>{for(const sibling of document.querySelectorAll('.sample-sidebar>button'))sibling.classList.toggle('active',sibling===button);$('.sample-titlebar>span:nth-child(2)').textContent=button.textContent.trim()+' / 本地演示';});
$('#sample-lens').addEventListener('click',()=>{$('#studio-draft').focus();$('.sample-footer>span').textContent=$('#studio-draft').value.trim()?'草稿已保留在当前页面。':'在输入框记下一点想法。';});
let inspector=0,disposed=false;
function stopInspector(){clearInterval(inspector);inspector=0;}
function startInspector(){stopInspector();if(!document.hidden&&!disposed)inspector=setInterval(reflectState,250);}
function visibilityChange(){reflectState();if(document.hidden)stopInspector();else startInspector();}
media.addEventListener('change',reflectState);document.addEventListener('visibilitychange',visibilityChange);
window.addEventListener('pagehide',event=>{stopInspector();if(!event.persisted){disposed=true;scene.destroy();optics.destroy();removeReflections();media.removeEventListener('change',reflectState);document.removeEventListener('visibilitychange',visibilityChange);}});
window.addEventListener('pageshow',event=>{if(event.persisted)startInspector();});
window.backgroundStudio={state:()=>({...scene.getState(),definition:byId.get(preset)})};
reflectSelection();reflectState();startInspector();
