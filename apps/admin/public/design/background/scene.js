import {createAmbientBackground,PRESETS} from './background.js';
import {enhanceSelects} from '../components/select.js';
const $=query=>document.querySelector(query),query=new URLSearchParams(location.search);
let preset=PRESETS.some(item=>item.id===query.get('preset'))?query.get('preset'):'curtain';
$('#preset').replaceChildren(...PRESETS.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.label;return option;}));
let motion=query.get('motion')==='1',intensity=query.has('intensity')?Math.max(0,Math.min(1,Number(query.get('intensity'))||0)):1;
let lastSeconds=0;
let component=createAmbientBackground({element:$('#background'),preset,motion,intensity});
$('#preset').value=preset;$('#intensity').value=String(intensity*100);$('#amount').textContent=`${Math.round(intensity*100)}%`;
if(query.has('embed'))document.body.classList.add('embed');
if(query.has('t'))component.seek(Number(query.get('t')));
const media=matchMedia('(prefers-reduced-motion: reduce)');
function reflect(){
  const state=component?.getState();
  $('#motion').disabled=!component||media.matches;
  $('#motion').textContent=state?.playing?'暂停移动':'继续移动';
  $('#status').textContent=!component?'已销毁 · 无画布':state.reducedMotion?'系统减少动态 · 已静止':document.hidden?'页面隐藏 · 已静止':state.playing?'缓慢移动中':'已静止';
}
$('#preset').addEventListener('change',event=>{preset=event.target.value;component?.update({preset});reflect();});
$('#motion').addEventListener('click',()=>{motion=!motion;component?.update({motion});reflect();});
$('#intensity').addEventListener('input',event=>{intensity=Number(event.target.value)/100;component?.update({intensity});$('#amount').textContent=`${Math.round(intensity*100)}%`;});
$('#overlay').addEventListener('click',()=>{$('#content').hidden=!$('#content').hidden;$('#overlay').textContent=$('#content').hidden?'显示界面':'隐藏界面';});
for(const seconds of [0,8,20])$(`#at${seconds}`).addEventListener('click',()=>{motion=false;component?.update({motion});component?.seek(seconds);reflect();$('#status').textContent=`静止采样 · ${seconds} 秒`;});
$('#lifecycle').addEventListener('click',()=>{if(component){lastSeconds=component.getState().elapsed;component.destroy();component=null;$('#lifecycle').textContent='重建背景';}else{component=createAmbientBackground({element:$('#background'),preset,motion,intensity});component.seek(lastSeconds);$('#lifecycle').textContent='销毁背景';}reflect();});
$('#save-note').addEventListener('click',()=>{$('#note-status').textContent=$('#notes').value.trim()?'草稿已暂存本页；刷新后清空。':'请先填写任务说明。';});
$('#clean').addEventListener('click',()=>{$('#controls').hidden=true;$('#controls').style.display='none';});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#controls').hidden=false;$('#controls').style.display='';}});
media.addEventListener('change',reflect);document.addEventListener('visibilitychange',reflect);
window.backgroundExperiment={state:()=>component?.getState()||{disposed:true,playing:false}};
reflect();

const selectScope=enhanceSelects(document.querySelector('#controls'));
window.addEventListener('pagehide',event=>{if(event.persisted)return;selectScope.destroy();media.removeEventListener('change',reflect);document.removeEventListener('visibilitychange',reflect);});
