import {enhanceSelects} from '../components/select.js';
const $ = selector => document.querySelector(selector);
import {DIALOG_PRESET} from '../material-presets.js';
const initial = Object.freeze({...DIALOG_PRESET.glass,opacity:DIALOG_PRESET.glass.opacity*100,contentWash:DIALOG_PRESET.contentWash*100,scrimOpacity:DIALOG_PRESET.scrimOpacity*100,grid:false,moving:false});
// Previous navigation material remains an explicit comparison, never the dialog default.
const navigationComparison = Object.freeze({mode:'zoned',blur:2,strength:14,edge:20,tint:'#667585',opacity:24,contentWash:28,scrimOpacity:48,grid:false,moving:false});
const names = {zoned:'分区融合',frosted:'纯磨砂',clear:'纯折射',upstream:'社区融合'};
const descriptions = {zoned:'中心磨砂与窄边缘折射独立合成。先调中心可读性，再看边缘。',frosted:'仅柔化实时背景，用于检查磨砂和染色。',clear:'保持原实验的清透折射算法，只有 0.3px 的轻柔化。',upstream:'公开社区实现：折射后对整层模糊，保留原算法作为对照。'};
let state = {...initial}, comparing = false, frame = 0, sequence = 0, latest = 0;
const active = $('#active-preview'), baseline = $('#baseline-preview');
const ready = new Set();
for(const iframe of [active,baseline])iframe.addEventListener('load',()=>iframe.contentWindow.postMessage({type:'gw-admin-glass-lab',version:1,action:'hello'},location.origin));
function send(iframe, action, settings) {
  if (ready.has(iframe)) iframe.contentWindow.postMessage({type:'gw-admin-glass-lab',version:1,action,settings,sequence:++sequence},location.origin);
}
function queueApply() {
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;send(active,'apply',state);send(baseline,'apply',{...navigationComparison,grid:state.grid,moving:state.moving});});
}
function sync() {
  $('#edge').min=state.mode==='upstream'?'16':'1';
  if(state.mode==='upstream')state.edge=Math.max(16,state.edge);
  for(const key of ['blur','strength','edge','opacity','contentWash','scrimOpacity']){
    $('#'+key).value=state[key];$('#'+key+'-value').textContent=state[key]+(['blur','strength','edge'].includes(key)?' px':'%');
  }
  document.querySelectorAll('[name=algorithm]').forEach(input=>input.checked=input.value===state.mode);
  $('#blur').disabled=state.mode==='clear';$('#strength').disabled=$('#edge').disabled=state.mode==='frosted';
  $('#algorithm-help').textContent=descriptions[state.mode];
  $('#tint-picker').value=state.tint;$('#tint-hex').value=state.tint.toUpperCase();
  $('#tint-preset').value=[...$('#tint-preset').options].some(option=>option.value===state.tint)?state.tint:'custom';
  $('#active-summary').textContent=`${names[state.mode]} · ${state.blur} / ${state.strength} / ${state.edge} · ${state.opacity}% · 衬底${state.contentWash}%`;
  $('#background').setAttribute('aria-pressed',String(state.grid));$('#background').textContent=state.grid?'返回后台背景':'切换光栅背景';
  $('#animate').setAttribute('aria-pressed',String(state.moving));$('#animate').textContent=state.moving?'停止背景移动':'移动背景';
  $('#compare').setAttribute('aria-pressed',String(comparing));$('#compare').textContent=comparing?'结束并排对比':'并排对比导航材质';
  $('#parameters').value=JSON.stringify({scope:'dialog-only',algorithm:state.mode,glass:{blur:state.blur,strength:state.strength,edge:state.edge,tint:state.tint,opacity:state.opacity/100},contentWash:state.contentWash/100,scrimOpacity:state.scrimOpacity/100},null,2);
  queueApply();
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.data?.type!=='gw-admin-glass-preview'||event.data.version!==1)return;
  const iframe=[active,baseline].find(item=>item.contentWindow===event.source);if(!iframe)return;
  if(event.data.action==='ready'){ready.add(iframe);if(iframe===baseline&&document.activeElement===baseline)$('#compare').focus();send(iframe,'apply',iframe===active?state:{...navigationComparison,grid:state.grid,moving:state.moving});}
  if(event.data.action==='applied'&&iframe===active&&event.data.sequence>=latest){latest=event.data.sequence;$('#status').textContent='已应用到弹窗。可直接输入、滚动或保存；拖动参数不会重建表单。';}
  if(event.data.action==='return'){document.querySelector('[name=algorithm]:checked').focus();}
});
for(const key of ['blur','strength','edge','opacity','contentWash','scrimOpacity'])$('#'+key).addEventListener('input',event=>{state[key]=Number(event.target.value);sync();});
document.querySelectorAll('[name=algorithm]').forEach(input=>input.addEventListener('change',()=>{state.mode=input.value;sync();}));
function tint(value){
  const valid=/^#[0-9a-f]{6}$/i.test(value);$('#tint-hex').setAttribute('aria-invalid',String(!valid));$('#tint-error').hidden=valid;
  if(valid){state.tint=value.toLowerCase();sync();}return valid;
}
$('#tint-preset').addEventListener('change',event=>{if(event.target.value==='custom'){$('#tint-hex').focus();$('#tint-hex').select();}else tint(event.target.value);});
$('#tint-picker').addEventListener('input',event=>tint(event.target.value));$('#tint-hex').addEventListener('input',event=>tint(event.target.value));
$('#background').onclick=()=>{state.grid=!state.grid;sync();};$('#animate').onclick=()=>{state.moving=!state.moving;sync();};
$('#reset').onclick=()=>{state={...initial};$('#tint-hex').setAttribute('aria-invalid','false');$('#tint-error').hidden=true;sync();};
$('#reopen').onclick=()=>{send(active,'open',state);if(comparing)send(baseline,'open',{...navigationComparison,grid:state.grid,moving:state.moving});};
$('#compare').onclick=()=>{comparing=!comparing;$('#baseline-card').hidden=!comparing;$('#previews').classList.toggle('is-comparing',comparing);if(comparing&&!baseline.hasAttribute('src'))baseline.src=baseline.dataset.src;sync();};
$('#export').onclick=()=>{const output=$('#parameters');output.hidden=!output.hidden;$('#export').setAttribute('aria-expanded',String(!output.hidden));if(!output.hidden){output.focus();output.select();}};
window.addEventListener('pagehide',()=>{if(frame)cancelAnimationFrame(frame);frame=0;});
window.addEventListener('pageshow',event=>{if(event.persisted)queueApply();});
const selectScope=enhanceSelects(document.body);
sync();
active.contentWindow.postMessage({type:'gw-admin-glass-lab',version:1,action:'hello'},location.origin);
