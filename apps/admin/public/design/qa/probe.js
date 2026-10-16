/** Read-only diagnostics for a caller-owned test page. Does not read text/input values/storage or export page URLs. */
const number = value => value===null||value===undefined||value==='' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const identifier = (value, fallback) => typeof value === 'string' && /^[a-z0-9_-]{1,48}$/i.test(value) ? value : fallback;
const length = value => /^\d+(?:\.\d+)?px$/.test(value) ? parseFloat(value) : null;
const color = value => /^rgba?\([\d\s.,%/]+\)$/.test(value.trim()) ? value.trim() : null;
const knownFamilies=new Map(['Geist','Geist Mono','PingFang SC','Hiragino Sans GB','Microsoft YaHei','system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','Helvetica Neue','Arial','sans-serif','ui-monospace','monospace','SFMono-Regular','Menlo','Monaco','Consolas','Liberation Mono','Courier New','serif'].map(name=>[name.toLowerCase(),name]));
function fontFamilies(value){
  const families=(value.match(/"[^"]*"|'[^']*'|[^,]+/g)||[]).map(part=>part.trim().replace(/^["']|["']$/g,''));
  return {known:families.map(name=>knownFamilies.get(name.toLowerCase())).filter(Boolean),unlistedCount:families.filter(name=>!knownFamilies.has(name.toLowerCase())).length};
}
const standardTags=new Set(['div','span','label','button','input','textarea','select','option','main','section','article','aside','header','footer','nav','form','p','a','h1','h2','h3','h4','h5','h6','strong','em','small','code','pre','ul','ol','li','table','thead','tbody','tr','td','th','canvas','svg','path','dialog']);
function safeState(background) {
  if (!background || typeof background.getState !== 'function') return null;
  try {
    const state = background.getState(), result = {};
    for (const key of ['elapsed','frames','width','height','dpr']) if (typeof state[key] === 'number' && Number.isFinite(state[key])) result[key] = state[key];
    for (const key of ['playing','reducedMotion','disposed','pendingFrame']) if (typeof state[key] === 'boolean') result[key] = state[key];
    if (typeof state.preset === 'string' && /^[a-z0-9_-]{1,48}$/i.test(state.preset)) result.preset = state.preset;
    return Object.keys(result).length ? result : null;
  } catch { return null; }
}
function query(root, selector) { try { return [...root.querySelectorAll(selector)]; } catch { return null; } }
function opacity(node, win) {
  let value = 1;
  for (let current=node;current;current=current.parentElement) value *= number(win.getComputedStyle(current).opacity) ?? 1;
  return Math.round(value*1000000)/1000000;
}
function visible(node, win) {
  const style=win.getComputedStyle(node), rect=node.getBoundingClientRect();
  return !!node.getClientRects().length && rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.visibility!=='collapse';
}
function onScreen(node, win) {
  let {left,top,right,bottom}=node.getBoundingClientRect();
  left=Math.max(0,left);top=Math.max(0,top);right=Math.min(win.innerWidth,right);bottom=Math.min(win.innerHeight,bottom);
  for(let parent=node.parentElement;parent;parent=parent.parentElement){
    const style=win.getComputedStyle(parent),rect=parent.getBoundingClientRect();
    if(/hidden|clip|auto|scroll/.test(style.overflowX)){left=Math.max(left,rect.left);right=Math.min(right,rect.right);}
    if(/hidden|clip|auto|scroll/.test(style.overflowY)){top=Math.max(top,rect.top);bottom=Math.min(bottom,rect.bottom);}
  }
  return right>left && bottom>top;
}
function optics(host, win) {
  const style=win.getComputedStyle(host),layers=[...host.querySelectorAll(':scope > .gw-glass-backdrop')],material=layers[0];
  let displacementScale=null,gaussianBlur=null;
  if(material){
    const filterText=win.getComputedStyle(material).backdropFilter||win.getComputedStyle(material).webkitBackdropFilter||'';
    const match=filterText.match(/url\(["']?([^"')]+)["']?\)/);
    if(match){
      try{
        const reference=new URL(match[1],host.ownerDocument.URL),current=new URL(host.ownerDocument.URL);
        if(reference.origin===current.origin&&reference.pathname===current.pathname&&reference.search===current.search&&reference.hash){
          const filter=host.ownerDocument.getElementById(decodeURIComponent(reference.hash.slice(1)));
          displacementScale=number(filter?.querySelector('feDisplacementMap')?.getAttribute('scale'));
          gaussianBlur=number(filter?.querySelector('feGaussianBlur')?.getAttribute('stdDeviation'));
        }
      }catch { /* An external or unresolvable filter is not inspected. */ }
    }
  }
  return {materialLayers:layers.length,mode:['zoned','frosted','refractive','off'].includes(host.dataset.glassMode)?host.dataset.glassMode:null,tint:color(style.getPropertyValue('--gw-glass-tint')),cssBlurPx:length(style.getPropertyValue('--gw-glass-blur').trim()),svgDisplacementScale:displacementScale,svgGaussianBlur:gaussianBlur,contentWash:color(style.getPropertyValue('--gw-admin-content-wash')),effectiveOpacity:opacity(host,win),edgeWidth:'not-observable-from-css'};
}
export function createVisualProbe(options={}) {
  const document=options.root?.ownerDocument||globalThis.document;
  const root=typeof options.root==='string'?document.querySelector(options.root):options.root||document.querySelector('.glass-workbench');
  if(!root||root.nodeType!==1)throw new Error('A valid test-page root element is required.');
  const win=document.defaultView;
  const roles=options.roles||[{name:'field-label',selector:'.gw-admin-field-label',expected:{fontSize:14,lineHeight:22}}];
  const foregroundSelectors=options.foregroundSelectors||[];
  const host=()=>typeof options.backgroundHost==='string'?root.querySelector(options.backgroundHost):options.backgroundHost||options.background?.element||root.querySelector('.gw-ambient');
  const canvas=()=>options.background?.canvas||host()?.querySelector('canvas');
  async function inspect(){
    let timeout;
    if(document.fonts?.status==='loading'){
      await Promise.race([document.fonts.ready,new Promise(resolve=>{timeout=win.setTimeout(resolve,2500);})]);
      if(timeout)win.clearTimeout(timeout);
    }
    const checks=[],roleResults=[];
    const add=(id,status,actual,expected)=>checks.push({id,status,actual,expected});
    roles.forEach((role,index)=>{
      const name=identifier(role.name,`role-${index+1}`),nodes=query(root,role.selector),items=[];
      if(nodes===null){add(`${name}.selector`,'not-tested','invalid-selector',null);return;}
      const shown=nodes.filter(node=>visible(node,win));
      if(!shown.length)add(`${name}.presence`,role.required?'fail':'not-tested',0,role.required?'at-least-one-visible-node':null);
      shown.forEach((node,nodeIndex)=>{
        const s=win.getComputedStyle(node),item={nodeIndex,tag:standardTags.has(node.tagName.toLowerCase())?node.tagName.toLowerCase():'custom-element',onScreen:onScreen(node,win),fontFamilies:fontFamilies(s.fontFamily),fontSize:length(s.fontSize),fontWeight:number(s.fontWeight),lineHeight:length(s.lineHeight),color:color(s.color),effectiveOpacity:opacity(node,win)};
        items.push(item);
        for(const key of ['fontSize','fontWeight','lineHeight']){
          if(role.expected?.[key]!==undefined){const value=role.expected[key],expected=(key==='fontSize'||key==='lineHeight')&&typeof value==='string'&&value.trim().endsWith('px')?length(value.trim()):number(value),actual=item[key];add(`${name}.${nodeIndex}.${key}`,expected===null||actual===null?'not-tested':Math.abs(actual-expected)<=.15?'pass':'fail',actual,expected);}
        }
      });
      roleResults.push({name,matched:nodes.length,visible:shown.length,items});
    });
    const foreground=foregroundSelectors.map((selector,index)=>{
      const nodes=query(root,typeof selector==='string'?selector:selector.selector),name=identifier(selector?.name,`foreground-${index+1}`);
      if(nodes===null){add(`${name}.selector`,'not-tested','invalid-selector',null);return {name,matched:0,visible:0};}
      const shown=nodes.filter(node=>visible(node,win)),items=shown.map((node,nodeIndex)=>{
        const value=opacity(node,win);add(`${name}.${nodeIndex}.opacity`,Math.abs(value-1)<.000001?'pass':'fail',value,1);return {nodeIndex,effectiveOpacity:value,onScreen:onScreen(node,win)};
      });
      if(!shown.length)add(`${name}.presence`,'not-tested',0,null);
      return {name,matched:nodes.length,visible:shown.length,items};
    });
    if(!foregroundSelectors.length)add('foreground.mapping','not-tested','no-caller-selectors',null);
    const backgroundHost=host(),ownedCanvas=backgroundHost?[...backgroundHost.querySelectorAll('canvas')]:[];
    add('background.canvas-count',backgroundHost?(ownedCanvas.length===1?'pass':'fail'):'not-tested',backgroundHost?ownedCanvas.length:null,1);
    let legacyLayers=null;
    if(backgroundHost?.classList.contains('gw-atmosphere')){
      const active=pseudo=>{const s=win.getComputedStyle(backgroundHost,pseudo);return !['none','normal'].includes(s.content)&&s.display!=='none'&&s.visibility!=='hidden'&&s.visibility!=='collapse'&&(number(s.opacity)??1)>0;};
      legacyLayers={beforeActive:active('::before'),afterActive:active('::after')};
      add('background.legacy-pseudo-layers',legacyLayers.beforeActive||legacyLayers.afterActive?'fail':'pass',legacyLayers,{beforeActive:false,afterActive:false});
    }
    const glass=[...root.querySelectorAll('.gw-glass')].filter(node=>visible(node,win)).map((node,index)=>{
      const result=optics(node,win);add(`glass.${index}.single-material-layer`,result.materialLayers===1?'pass':'fail',result.materialLayers,1);return {index,...result};
    });
    const counts={pass:checks.filter(x=>x.status==='pass').length,fail:checks.filter(x=>x.status==='fail').length,notTested:checks.filter(x=>x.status==='not-tested').length};
    return {schemaVersion:1,evidenceType:'read-only-dom-style-observation',result:counts.fail?'observed-contract-mismatch':'no-mismatch-in-configured-checks',visualAcceptance:'not-assessed',environment:{viewport:[win.innerWidth,win.innerHeight],dpr:win.devicePixelRatio,fontStatus:document.fonts?.status||'unavailable',documentVisible:!document.hidden,reducedMotion:win.matchMedia('(prefers-reduced-motion: reduce)').matches,reducedTransparency:win.matchMedia('(prefers-reduced-transparency: reduce)').matches,backdropFilterSupported:win.CSS.supports('backdrop-filter','blur(1px)')},counts,checks,roles:roleResults,foreground,background:{state:safeState(options.background),hostInViewport:backgroundHost?onScreen(backgroundHost,win):null,canvasCount:backgroundHost?ownedCanvas.length:null,legacyLayers},glass,notAssessed:['Aesthetic or abstraction quality','Text/background visual readability and contrast','Actual rendered font glyph source','Edge refraction appearance','Occlusion by overlapping elements','Unconfigured roles or hidden dialog content','Other browsers and device performance']};
  }
  function captureBackground(){
    const target=canvas();
    if(!target||target.tagName!=='CANVAS'||!target.width||!target.height)return {status:'unavailable',reason:'no-sized-background-canvas'};
    try{
      const dataUrl=target.toDataURL('image/png');
      if(!dataUrl.startsWith('data:image/png;base64,'))return {status:'unavailable',reason:'canvas-export-not-png'};
      return {status:'captured',sourceType:'actual-background-canvas',pixelDimensions:[target.width,target.height],cssDimensions:[target.getBoundingClientRect().width,target.getBoundingClientRect().height],capturedAt:Date.now(),state:safeState(options.background),dataUrl,limitations:'Background pixels only; no foreground screenshot, perception or readability verdict.'};
    }catch{return {status:'unavailable',reason:'canvas-export-unavailable',limitations:'A tainted or unsupported canvas must not be reported as a successful capture.'};}
  }
  async function observeMotion({durationMs=1500,intervalMs=250}={}){
    if(!Number.isFinite(durationMs)||durationMs<250||durationMs>10000||!Number.isFinite(intervalMs)||intervalMs<100||intervalMs>durationMs)throw new Error('Observation needs 250–10000 ms and a valid sampling interval of at least 100 ms.');
    const started=win.performance.now(),samples=[];
    do{
      samples.push({observedMs:win.performance.now()-started,backgroundHostInViewport:host()?onScreen(host(),win):null,documentVisible:!document.hidden,reducedMotion:win.matchMedia('(prefers-reduced-motion: reduce)').matches,state:safeState(options.background)});
      const remaining=durationMs-(win.performance.now()-started);if(remaining<=0)break;
      await new Promise(resolve=>win.setTimeout(resolve,Math.min(intervalMs,remaining)));
    }while(true);
    return {evidenceType:'live-state-observation',wallDurationMs:win.performance.now()-started,stateAvailability:samples.every(item=>item.state===null)?'unavailable':'observed',samples,pageStateChangedByProbe:false,pixelsSampled:false,visualAcceptance:'not-assessed',limitations:'A moving clock is not evidence of visible animation. Pair with real normal-speed recording and Canvas A/B captures.'};
  }
  return Object.freeze({inspect,captureBackground,observeMotion});
}
