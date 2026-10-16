import {createSelect} from './select-core.js';

// Preserve form value/validation and existing controllers while owning only presentation.
const owners=new WeakMap();
const warned=new WeakSet();
const unsupportedSelect=select=>Boolean(select.multiple||select.size>1||select.querySelector('optgroup'));
let serial=0;
const cleanLabel=label=>{const copy=label.cloneNode(true);copy.querySelectorAll('select,.gw-select,[aria-hidden="true"]').forEach(node=>node.remove());return copy.textContent.trim();};
export function enhanceSelect(select){
  if(owners.has(select))return owners.get(select);
  const doc=select.ownerDocument,win=doc.defaultView;
  if(select.tagName!=='SELECT'||!select.parentNode)throw new TypeError('enhanceSelect requires a mounted select element.');
  if(unsupportedSelect(select))throw new TypeError('enhanceSelect supports only single selects with size <= 1 and no optgroups.');
  const old={tabindex:select.getAttribute('tabindex'),ariaHidden:select.getAttribute('aria-hidden'),hiddenClass:select.classList.contains('gw-select-native')};
  const labels=new Map();
  const originalProperties=new Map();
  let disposed=false,queued=false,ui,validationAttempted=false,resetTimer=0;
  let fieldsetObserver=null,fieldsets=[];
  const syncFieldsets=()=>{
    if(!fieldsetObserver)return;
    const next=[];
    for(let node=select.parentElement;node;node=node.parentElement)if(node.tagName==='FIELDSET')next.push(node);
    if(next.length===fieldsets.length&&next.every((node,index)=>node===fieldsets[index]))return;
    fieldsets=next;fieldsetObserver.disconnect();
    for(const fieldset of fieldsets)fieldsetObserver.observe(fieldset,{attributes:true,attributeFilter:['disabled']});
  };
  const nativeClass=()=>select.className.split(/\s+/).filter(name=>name!=='gw-select-native').join(' ');
  const triggerId=(select.id||`gw-native-select-${++serial}`)+'-trigger';
  const refresh=()=>{
    if(disposed||!ui)return;
    syncFieldsets();
    for(const label of select.labels||[])if(!labels.has(label))labels.set(label,label.getAttribute('for'));
    for(const label of labels.keys())label.htmlFor=triggerId;
    const label=select.getAttribute('aria-label')||[...labels.keys()].map(cleanLabel).filter(Boolean).join(' ')||select.name||'选择选项';
    ui.update({id:triggerId,className:nativeClass(),value:select.value,options:[...select.options].map(option=>({value:option.value,label:option.label,disabled:option.disabled||option.parentElement?.disabled,hidden:option.hidden})),disabled:select.matches(':disabled'),required:select.required,label,describedBy:select.getAttribute('aria-describedby')||'',invalid:select.getAttribute('aria-invalid')==='true'||(validationAttempted&&select.willValidate&&!select.validity.valid)});
    const error=select.getAttribute('aria-errormessage');if(error)ui.trigger.setAttribute('aria-errormessage',error);else ui.trigger.removeAttribute('aria-errormessage');
  };
  const queue=()=>{if(queued||disposed)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
  ui=createSelect({onSelect(value){
    if(disposed||select.matches(':disabled'))return;
    if(String(value)===select.value){refresh();return;}
    select.value=String(value);
    if(disposed)return;
    select.dispatchEvent(new win.Event('input',{bubbles:true}));
    if(disposed)return;
    select.dispatchEvent(new win.Event('change',{bubbles:true}));
    refresh();
  }});
  select.before(ui.element);ui.element.prepend(select);
  select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.classList.add('gw-select-native');
  // Property assignment does not emit DOM mutations; bridge it explicitly and restore on destroy.
  for(const name of ['value','selectedIndex']){
    const own=Object.getOwnPropertyDescriptor(select,name);
    const descriptor=own||Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype,name);
    if((own&&!own.configurable)||!descriptor?.get||!descriptor?.set)continue;
    const installed={configurable:true,enumerable:descriptor.enumerable,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);refresh();}};
    originalProperties.set(name,{original:own,installed});
    Object.defineProperty(select,name,installed);
  }
  const focus=()=>{if(!disposed&&!select.matches(':disabled'))ui.trigger.focus();};
  const onInvalid=()=>{validationAttempted=true;refresh();};
  const onReset=event=>{
    if(event.target!==select.form)return;
    win.clearTimeout(resetTimer);
    resetTimer=win.setTimeout(()=>{
      resetTimer=0;
      if(disposed||event.defaultPrevented||event.target!==select.form)return;
      validationAttempted=false;refresh();
    },0);
  };
  const observer=new win.MutationObserver(queue);observer.observe(select,{attributes:true,childList:true,subtree:true});
  fieldsetObserver=new win.MutationObserver(queue);
  select.addEventListener('focus',focus);select.addEventListener('input',queue);select.addEventListener('change',queue);select.addEventListener('invalid',onInvalid);
  // A real reset-button click can run microtasks before the native reset default action.
  // Read the resulting form value in the next task, after cancellation/default action settles.
  doc.addEventListener('reset',onReset,true);
  const api={element:ui.element,trigger:ui.trigger,refresh,destroy(){
    if(disposed)return;disposed=true;win.clearTimeout(resetTimer);resetTimer=0;observer.disconnect();fieldsetObserver?.disconnect();fieldsets=[];select.removeEventListener('focus',focus);select.removeEventListener('input',queue);select.removeEventListener('change',queue);select.removeEventListener('invalid',onInvalid);doc.removeEventListener('reset',onReset,true);
    for(const [name,{original,installed}]of originalProperties){
      const current=Object.getOwnPropertyDescriptor(select,name);
      if(current?.get!==installed.get||current?.set!==installed.set)continue;
      if(original)Object.defineProperty(select,name,original);else delete select[name];
    }
    for(const [label,original]of labels)if(label.htmlFor===triggerId){if(original===null)label.removeAttribute('for');else label.setAttribute('for',original);}
    if(old.tabindex===null)select.removeAttribute('tabindex');else select.setAttribute('tabindex',old.tabindex);
    if(old.ariaHidden===null)select.removeAttribute('aria-hidden');else select.setAttribute('aria-hidden',old.ariaHidden);
    if(!old.hiddenClass)select.classList.remove('gw-select-native');
    if(select.parentNode===ui.element){if(ui.element.parentNode)ui.element.before(select);else select.remove();}
    ui.destroy();owners.delete(select);
  }};
  owners.set(select,api);refresh();return api;
}

/** Template adapter: enhance inserted selects and release only instances this scope created. */
export function enhanceSelects(scope){
  const owned=new Map();let disposed=false,pending=false;
  function refresh(){
    if(disposed)return;
    for(const [select,api]of owned)if(!scope.contains(select)){api.destroy();owned.delete(select);}
    for(const select of scope.querySelectorAll('select:not([data-native-select])')){
      if(unsupportedSelect(select)){
        const own=owned.get(select);if(own){own.destroy();owned.delete(select);}
        if(!warned.has(select)){warned.add(select);console.warn('Custom select supports only single selects with size <= 1 and no optgroups; this control remains native.',select);}
        continue;
      }
      if(owners.has(select)){owners.get(select).refresh();continue;}
      owned.set(select,enhanceSelect(select));
    }
  }
  const observer=new MutationObserver(records=>{
    const relevant=records.some(record=>record.type==='attributes'?['SELECT','FIELDSET'].includes(record.target.tagName):['SELECT','OPTGROUP'].includes(record.target.tagName)||[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.tagName==='SELECT'||node.querySelector('select'))));
    if(!relevant||pending||disposed)return;pending=true;queueMicrotask(()=>{pending=false;refresh();});
  });
  observer.observe(scope,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','multiple','size']});refresh();
  return {refresh,destroy(){if(disposed)return;disposed=true;observer.disconnect();for(const api of owned.values())api.destroy();owned.clear();}};
}
