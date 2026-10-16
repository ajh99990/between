import {paintField,PRESETS} from './field.js';
export {PRESETS};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const valid=id=>PRESETS.some(item=>item.id===id);
const definition=id=>PRESETS.find(item=>item.id===id);
const owners=new WeakMap();
/** Controlled decorative scene. The caller owns preset, motion, intensity and persistence. */
export function createAmbientBackground(initial={}){
  let props={preset:'ribbon',motion:false,intensity:1,...initial};
  if(!valid(props.preset))props.preset='ribbon';
  const ownsHost=!props.element,element=props.element||document.createElement('div');
  if(owners.has(element))throw new Error('This background host already has an owner. Update or destroy that instance first.');
  const oldHidden=element.getAttribute('aria-hidden'),oldClass=element.classList.contains('gw-ambient');
  element.classList.add('gw-ambient');element.dataset.ambientOwner='true';element.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='gw-ambient-canvas';element.append(canvas);
  const context=canvas.getContext('2d');
  const cache=new Map();
  const wave=document.createElement('canvas');
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced=media.matches,visible=true,disposed=false,frame=0,last=0,elapsed=0,lastPaint=-1,frames=0;
  let width=1,height=1,dpr=1,fade=1,previous=null;
  const running=()=>props.motion&&!reduced&&!document.hidden&&visible&&!disposed;
  const mayFade=()=>props.motion&&fade<1&&!reduced&&!document.hidden&&visible&&!disposed;
  function texture(id){
    if(definition(id).dynamic)return paintField(wave,id,elapsed);
    if(!cache.has(id))cache.set(id,paintField(document.createElement('canvas'),id));
    return cache.get(id);
  }
  function drawTexture(id,alpha){
    const amount=definition(id).dynamic?0:.5*Math.sin(elapsed*Math.PI*2/definition(id).loopSeconds),scale=1.02+.055*amount;
    const ox=id==='mist'?.62:id==='ember'?.28:.18,oy=id==='ember'?.46:.72;
    const w=width*1.08*scale,h=height*1.08*scale;
    const x=-width*.04-(w-width*1.08)*ox+width*(-.005+.035*amount);
    const y=-height*.04-(h-height*1.08)*oy-height*.022*amount;
    context.globalAlpha=alpha;context.save();
    const softness=definition(id).softness||0;context.filter=softness?`blur(${softness*dpr}px)`:'none';
    context.drawImage(texture(id),x,y,w,h);context.restore();
  }
  function draw(){
    if(disposed||!context)return;
    context.setTransform(dpr,0,0,dpr,0,0);context.globalAlpha=1;
    context.fillStyle='#15181d';context.fillRect(0,0,width,height);
    if(previous&&fade<1)drawTexture(previous,1);
    drawTexture(props.preset,previous?fade:1);
    context.globalAlpha=1-clamp(Number(props.intensity)||0,0,1);
    context.fillStyle='#15181d';context.fillRect(0,0,width,height);context.globalAlpha=1;
    // Readability masks stay in window coordinates while artwork drifts beneath them.
    const top=context.createLinearGradient(0,0,0,height*.33);
    top.addColorStop(0,'#15181d');top.addColorStop(1,'rgb(21 24 29 / 0%)');
    context.fillStyle=top;context.fillRect(0,0,width,height);
    context.save();context.translate(width*.53,height*.38);context.scale(width*.57,height*.53);
    const center=context.createRadialGradient(0,0,0,0,0,1);
    center.addColorStop(0,'rgb(21 24 29 / 52%)');center.addColorStop(1,'rgb(21 24 29 / 0%)');
    context.fillStyle=center;context.fillRect(-2,-2,4,4);context.restore();
    frames++;element.dataset.preset=props.preset;element.dataset.running=String(running());
  }
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
  function tick(now){
    frame=0;if(disposed)return;
    const delta=last?Math.min(.1,(now-last)/1000):0;last=now;
    if(running())elapsed+=delta;
    if(mayFade()){fade=Math.min(1,fade+delta/.6);if(fade===1)previous=null;}
    if(now-lastPaint>=1000/24||(!running()&&!mayFade())){draw();lastPaint=now;}
    if(running()||mayFade())frame=requestAnimationFrame(tick);else last=0;
  }
  function sync(){stop();draw();if(running()||mayFade())frame=requestAnimationFrame(tick);}
  function resize(){
    if(disposed)return;
    const bounds=element.getBoundingClientRect();width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);
    dpr=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.ceil(width*dpr);canvas.height=Math.ceil(height*dpr);draw();
  }
  function mediaChange(event){reduced=event.matches;if(reduced){fade=1;previous=null;}sync();}
  media.addEventListener('change',mediaChange);document.addEventListener('visibilitychange',sync);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(element);
  const intersectionObserver=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});intersectionObserver.observe(element);
  const pageHide=event=>{if(event.persisted)stop();else api.destroy();};
  const pageShow=event=>{if(event.persisted&&!disposed)sync();};
  window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);
  const api={element,canvas,update(next={}){
    if(disposed)return;
    const id=next.preset===undefined?props.preset:valid(next.preset)?next.preset:'ribbon';
    if(id!==props.preset){const moving=next.motion===undefined?props.motion:next.motion;fade=moving&&!reduced?0:1;previous=fade===0?props.preset:null;}
    props={...props,...next,preset:id};sync();
  },seek(seconds){if(disposed)return;elapsed=Math.max(0,Number(seconds)||0);fade=1;previous=null;sync();},
  getState(){return {preset:props.preset,elapsed,playing:running(),reducedMotion:reduced,frames,width,height,dpr,disposed,pendingFrame:Boolean(frame)};},
  destroy(){if(disposed)return;disposed=true;stop();resizeObserver.disconnect();intersectionObserver.disconnect();media.removeEventListener('change',mediaChange);document.removeEventListener('visibilitychange',sync);window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);cache.clear();canvas.remove();owners.delete(element);if(ownsHost)element.remove();else{if(!oldClass)element.classList.remove('gw-ambient');if(oldHidden===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',oldHidden);delete element.dataset.ambientOwner;delete element.dataset.running;delete element.dataset.preset;}}};
  owners.set(element,api);resize();sync();return api;
}
