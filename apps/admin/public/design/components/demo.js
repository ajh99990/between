import {createGlassSurface,createLensRail,createVoiceButton,createChatComposer,createQuestionCard,createSettingsPanel,createSettingsRow} from './ui.js';

// This file is the application controller. The components do not own this state.
const $=q=>document.querySelector(q);
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const questions=Object.freeze([
 Object.freeze({id:'goal',label:'关注方向',title:'这次想先得到什么？',type:'single',options:Object.freeze([Object.freeze({value:'clarity',label:'澄清目标',description:'先明确成功标准'}),Object.freeze({value:'plan',label:'行动计划',description:'整理可以执行的下一步'})])}),
 Object.freeze({id:'outputs',label:'输出内容',title:'你希望包含哪些内容？',type:'multiple',options:Object.freeze([Object.freeze({value:'brief',label:'项目简报',description:'对齐问题与目标'}),Object.freeze({value:'actions',label:'行动清单',description:'明确顺序与负责人'}),Object.freeze({value:'risks',label:'待确认问题',description:'保留风险与依赖'})])}),
 Object.freeze({id:'context',label:'补充背景',title:'补充一点背景',type:'text',placeholder:'例如：4人协作，两周内完成第一轮验证…'})
]);
let state={selected:'work',voice:false,value:'',status:'idle',error:'',answers:{goal:'',outputs:[],context:''},active:'goal',questionStatus:'pending',questionError:'',collapsed:false,fail:false,compact:false,location:'local',name:'演示工作台',saveStatus:'idle',saveError:''};
let sendTimer,questionTimer,saveTimer;
const events=[];
function log(name,payload){events.unshift(`${name}${payload===undefined?'':` ${JSON.stringify(payload)}`}`);events.length=Math.min(7,events.length);$('#demo-events').replaceChildren(...events.map(text=>node('li',text)));}
function message(label,text){const item=node('div','');item.className='demo-message';item.append(node('small',label),node('div',text));$('#demo-messages').prepend(item);}
function valid(){return Boolean(state.answers.goal&&state.answers.outputs.length&&state.answers.context.trim());}
function errorFor(id){return id==='goal'&&!state.answers.goal?'请选择一个关注方向。':id==='outputs'&&!state.answers.outputs.length?'请至少选择一项输出内容。':id==='context'&&!state.answers.context.trim()?'请填写背景。':'';}
const glassContent=node('div','');glassContent.append(node('h3','同一份背景，独立的材质层'),node('p','默认融合：2 px 磨砂、14 px 最大单轴折射、20 px 边缘。前景文字不参与滤镜。'),node('small','烟灰蓝 #667585 · 24% 染色'));
const glass=createGlassSurface({className:'demo-glass',children:Object.freeze([glassContent])});$('#glass-slot').append(glass.element);
const rail=createLensRail({items:Object.freeze([Object.freeze({value:'work',label:'工作',icon:'briefcase'}),Object.freeze({value:'code',label:'代码',icon:'code'}),Object.freeze({value:'assistant',label:'助手',icon:'sparkles'})]),selected:state.selected,onSelect(value){state={...state,selected:value};log('onSelect',value);render();}});$('#rail-slot').append(rail.element);
const voice=createVoiceButton({active:false,label:'模拟语音入口',onSelect(active){state={...state,voice:active};log('onSelect(voice)',active);render();}});$('#voice-slot').append(voice.element);
const composer=createChatComposer({
 value:state.value,status:state.status,canSend:false,modelLabel:'演示模型',
 onInput(value){state={...state,value,status:['sending','working'].includes(state.status)?state.status:value.trim()?'typing':'idle',error:''};render();},
 onSend({value}){if(!value.trim()||['sending','working'].includes(state.status))return;log('onSend',{value});state={...state,status:'sending',error:''};render();clearTimeout(sendTimer);sendTimer=setTimeout(()=>{if(state.fail){state={...state,status:'failed',error:'调用方模拟发送失败，文字草稿保留。'};render();return;}state={...state,value:'',status:'working'};message('用户 · 本地模拟',value);render();sendTimer=setTimeout(()=>{state={...state,status:'completed'};message('预设回复 · 未调用模型','先明确预期结果，再选一个可以验证的小步骤。此内容由 demo controller 提供。');render();},1400);},500);},
 onStop(){clearTimeout(sendTimer);state={...state,status:'stopped'};log('onStop');render();},
 onAdd(){log('onAdd');$('#demo-status').textContent='调用方收到添加意图；本例没有读取或上传文件。';},
 onModelSelect(){log('onModelSelect');$('#demo-status').textContent='调用方收到模型菜单意图；模型列表由应用提供。';}
});$('#composer-slot').append(composer.element);
const question=createQuestionCard({
 questions,answers:state.answers,activeQuestion:state.active,status:state.questionStatus,canConfirm:false,
 onAnswer(id,value){state={...state,answers:{...state.answers,[id]:Array.isArray(value)?[...value]:value},questionError:''};log('onAnswer',{id,value});render();},
 onNavigate(id){state={...state,active:id,questionError:''};log('onNavigate',id);render();},
 onCollapse(collapsed){state={...state,collapsed};log('onCollapse',collapsed);render();},
 onCancel(reason){clearTimeout(questionTimer);state={...state,questionStatus:reason,questionError:'',collapsed:true};log('onCancel',reason);render();},
 onConfirm(){const invalid=questions.find(q=>errorFor(q.id));if(invalid){state={...state,active:invalid.id,questionError:errorFor(invalid.id)};render();return;}if(state.questionStatus==='submitting')return;state={...state,questionStatus:'submitting',questionError:''};log('onConfirm');render();questionTimer=setTimeout(()=>{state=state.fail?{...state,questionStatus:'failed',questionError:'调用方模拟提交失败，答案保留，可重试。'}:{...state,questionStatus:'completed',questionError:'',collapsed:false};render();},650);}
});$('#question-slot').append(question.element);
const compact=createSettingsRow({type:'toggle',label:'紧凑记录',description:'即时更新本页内存设置',value:false,onInput(value){state={...state,compact:value};log('onInput(compact)',value);render();}});
const location=createSettingsRow({type:'select',label:'运行位置',description:'这里只保存演示选择',value:'local',options:Object.freeze([Object.freeze({value:'local',label:'本地'}),Object.freeze({value:'cloud',label:'云端'})]),onSelect(value){state={...state,location:value};log('onSelect(location)',value);render();}});
const name=createSettingsRow({type:'text',label:'显示名称',description:'编辑草稿后点击下方按钮',value:state.name,onInput(value){state={...state,name:value,saveStatus:'idle',saveError:''};render();}});
const save=createSettingsRow({type:'button',label:'保存演示配置',description:'仅由调用方模拟确认，不请求服务',actionLabel:'保存到本页内存',onConfirm(){log('onConfirm(settings)');state={...state,saveStatus:'submitting',saveError:''};render();saveTimer=setTimeout(()=>{state=state.fail?{...state,saveStatus:'failed',saveError:'调用方模拟保存失败，名称草稿保留。'}:{...state,saveStatus:'completed',saveError:''};render();},600);}});
const panel=createSettingsPanel({title:'设置行',description:'开关、选择、输入与操作使用同一受控契约。',children:Object.freeze([compact.element,location.element,name.element,save.element])});$('#settings-slot').append(panel.element);
function render(){rail.update({selected:state.selected});voice.update({active:state.voice});$('#entry-status').textContent=`场景：${state.selected||'未选择'} · 语音：${state.voice?'模拟激活，未录音':'未激活'}`;composer.update({value:state.value,status:state.status,statusLabel:`${state.status} · 本地`,canSend:Boolean(state.value.trim()),error:state.error});question.update({answers:state.answers,activeQuestion:state.active,status:state.questionStatus,collapsed:state.collapsed,error:state.questionError,canConfirm:valid()});compact.update({value:state.compact});location.update({value:state.location});name.update({value:state.name});save.update({status:state.saveStatus,error:state.saveError,actionLabel:state.saveStatus==='submitting'?'模拟保存中…':state.saveStatus==='completed'?'已更新本页内存':'保存到本页内存'});$('#demo-status').textContent=`${state.status} · 所有响应来自本地 controller`;$('#demo-messages').style.gap=state.compact?'6px':'12px';}
$('#demo-fail').addEventListener('change',event=>{state={...state,fail:event.target.checked};log('simulateFailure',state.fail);});
$('#demo-reset').addEventListener('click',()=>{clearTimeout(questionTimer);state={...state,answers:{goal:'',outputs:[],context:''},active:'goal',questionStatus:'pending',questionError:'',collapsed:false};log('resetQuestion');render();});
for(const radio of document.querySelectorAll('[name="demo-mode"]'))radio.addEventListener('change',()=>{glass.update({mode:radio.value});log('glassMode',radio.value);});
render();
window.addEventListener('pagehide',()=>{clearTimeout(sendTimer);clearTimeout(questionTimer);clearTimeout(saveTimer);for(const item of [glass,rail,voice,composer,question,panel,compact,location,name,save])item.destroy();},{once:true});
