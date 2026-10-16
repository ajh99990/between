import {mountZonedGlass} from '../zoned-glass.js';
import {createLiquidGlass} from './vendor/liquid-glass.js';

// Opt-in local preview adapter. No business state, form DOM or global material is replaced.
export function mountAdminGlassPreview({root,editor,openEditor,footer}) {
  const panel=editor.element.querySelector('.gw-admin-modal');
  const material=panel.querySelector('.gw-glass-backdrop');
  let external=null,lastOptics='',disposed=false;
  const observer=new ResizeObserver(()=>external?.rebuild?.());observer.observe(material);
  const style=document.createElement('style');
  style.textContent=`.admin-app[data-lab-grid=true]>.gw-atmosphere{background:repeating-linear-gradient(90deg,transparent 0 29px,#b7d3ea65 29px 31px),repeating-linear-gradient(0deg,transparent 0 29px,#b7d3ea65 29px 31px),linear-gradient(110deg,#182d44,#35505b)}.admin-app[data-lab-grid=true]>.gw-atmosphere::before{display:none}.admin-app[data-lab-moving=true]>.gw-atmosphere{inset:-35px;animation:gw-lab-pan 7s ease-in-out infinite alternate}@keyframes gw-lab-pan{to{transform:translate(30px,20px)}}@media(prefers-reduced-motion:reduce){.admin-app[data-lab-moving=true]>.gw-atmosphere{animation:none}}.gw-lab-return{font:11px/20px var(--gw-font);margin-right:auto;border:0;background:transparent;color:var(--gw-text-secondary);cursor:pointer;text-decoration:underline;text-underline-offset:3px}`;
  document.head.append(style);
  const returnButton=document.createElement('button');returnButton.type='button';returnButton.textContent='返回调参';returnButton.className='gw-lab-return';
  const notify=(action,extra={})=>{if(window.parent!==window)window.parent.postMessage({type:'gw-admin-glass-preview',version:1,action,...extra},location.origin);};
  returnButton.onclick=()=>notify('return');
  editor.update({footer:[returnButton,...footer]});
  function parse(value){
    if(!value||!['zoned','frosted','clear','upstream'].includes(value.mode))return null;
    const ranges={blur:[0,20],strength:[0,60],edge:[1,80],opacity:[0,100],contentWash:[0,100],scrimOpacity:[0,90]};
    const settings={mode:value.mode,tint:value.tint,grid:Boolean(value.grid),moving:Boolean(value.moving)};
    if(!/^#[0-9a-f]{6}$/i.test(settings.tint||''))return null;
    for(const [key,[min,max]]of Object.entries(ranges)){if(!Number.isFinite(value[key]))return null;settings[key]=Math.min(max,Math.max(min,value[key]));}
    if(settings.mode==='upstream')settings.edge=Math.max(16,settings.edge);
    return settings;
  }
  function apply(settings,sequence){
    const key=JSON.stringify([settings.mode,settings.blur,settings.strength,settings.edge]);
    if(key!==lastOptics){external?.destroy();external=null;}
    editor.update({glass:{mode:['clear','upstream'].includes(settings.mode)?'off':settings.mode,blur:settings.blur,strength:settings.strength,edge:settings.edge,tint:settings.tint,opacity:settings.opacity/100},contentWash:settings.contentWash/100,scrimOpacity:settings.scrimOpacity/100});
    if(key!==lastOptics){
      if(settings.mode==='clear')external=mountZonedGlass(material,{blur:settings.blur,strength:settings.strength,edge:settings.edge,clearOnly:true});
      if(settings.mode==='upstream'){
        const radius=parseFloat(getComputedStyle(material).borderTopLeftRadius)||12;
        external=createLiquidGlass(material,{scale:settings.strength*2,band:settings.edge/radius,blur:settings.blur,sat:1.18,aberration:0,lens:1});
      }
      lastOptics=key;
    }
    root.dataset.labGrid=String(settings.grid);root.dataset.labMoving=String(settings.moving);
    notify('applied',{sequence});
  }
  const receive=event=>{
    if(disposed||event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='gw-admin-glass-lab'||event.data.version!==1)return;
    if(event.data.action==='hello'){notify('ready');return;}
    const settings=parse(event.data.settings);if(!settings)return;
    if(event.data.action==='apply')apply(settings,event.data.sequence);
    if(event.data.action==='open'){if(editor.element.hidden)openEditor();apply(settings,event.data.sequence);}
  };
  window.addEventListener('message',receive);
  openEditor();notify('ready');
  return {destroy(){if(disposed)return;disposed=true;window.removeEventListener('message',receive);observer.disconnect();external?.destroy();style.remove();returnButton.remove();delete root.dataset.labGrid;delete root.dataset.labMoving;}};
}
