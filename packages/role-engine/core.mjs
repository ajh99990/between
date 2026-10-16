import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import tiktoken from 'tiktoken';
import Jimp from 'jimp';
import wavefile from 'wavefile';
const source=fs.readFileSync(new URL('./vendor/core.js',import.meta.url),'utf8');
const defaults=JSON.parse(fs.readFileSync(new URL('./defaults.json',import.meta.url)));
const enc=tiktoken.encoding_for_model('gpt-4o-mini');
const suffix=`
const DEFAULT_DEPTH=4,DEFAULT_ORDER=100;
const tokenHandler=new TokenHandler(countTokensOpenAIAsync);
oai_settings.prompts=oai_settings.prompts||structuredClone(chatCompletionDefaultPrompts.prompts);oai_settings.prompt_order=oai_settings.prompt_order||[{character_id:100000,order:structuredClone(promptManagerDefaultPromptOrder)}];
const promptManager=Object.create(PromptManager.prototype);
promptManager.configuration={promptOrder:{strategy:'global',dummyId:100000}};
promptManager.activeCharacter={id:100000};promptManager.serviceSettings=oai_settings;promptManager.tokenHandler=tokenHandler;
promptManager.render=()=>{};promptManager.log=(x)=>{if(x?.stack)console.error(x.stack)};
globalThis.runCore=async(type='normal',quietPrompt='')=>{
 const fields=getCharacterCardFields();
 const {description,personality,scenario,persona,system,jailbreak,charDepthPrompt,creatorNotes}=fields;
 extension_prompts={};
 const depth=characters[0].data?.extensions?.depth_prompt;
 if(depth?.prompt)setExtensionPrompt('DEPTH_PROMPT',charDepthPrompt,extension_prompt_types.IN_CHAT,depth.depth??4,false,extension_prompt_roles[String(depth.role||'system').toUpperCase()]);
 if(memory?.summary)setExtensionPrompt('1_memory',memory.summary,extension_prompt_types.IN_PROMPT,0,false,0);
 if(memory?.retrieval)setExtensionPrompt('3_vectors',memory.retrieval,extension_prompt_types.IN_PROMPT,0,false,0);
 setExtensionPrompt('QUIET_PROMPT',quietPrompt,extension_prompt_types.IN_PROMPT,0,true);
 const wi=await getWorldInfoPrompt(chat.map(x=>world_info_include_names?x.name+': '+x.mes:x.mes).reverse(),oai_settings.openai_max_context-oai_settings.openai_max_tokens,false,{personaDescription:persona,characterDescription:description,characterPersonality:personality,characterDepthPrompt:charDepthPrompt,scenario,creatorNotes,trigger:type});
 setExtensionPrompt('QUIET_PROMPT','',extension_prompt_types.IN_PROMPT,0,true);
 for(const e of wi.worldInfoDepth)setExtensionPrompt(inject_ids.CUSTOM_WI_DEPTH_ROLE(e.depth,e.role),e.entries.join('\\n'),extension_prompt_types.IN_CHAT,e.depth,false,e.role);
 const examples=parseMesExamples(fields.mesExamples,false);
 for(const e of wi.worldInfoExamples){const v=parseMesExamples(baseChatReplace(e.content),false);e.position===wi_anchor_position.before?examples.unshift(...v):examples.push(...v);}
 const [messages]=await prepareOpenAIMessages({name2,charDescription:description,charPersonality:personality,scenario,worldInfoBefore:wi.worldInfoBefore,worldInfoAfter:wi.worldInfoAfter,bias:'',type,quietPrompt,extensionPrompts:extension_prompts,systemPromptOverride:system,jailbreakPromptOverride:jailbreak,messages:setOpenAIMessages(chat),messageExamples:setOpenAIMessageExamples(examples)},false);
 embedOpenRouterMedia(messages,{audio:true,video:false});return {messages,fields,metadata:chat_metadata};
};`;
export function createCore(snapshot){
 const s=structuredClone(snapshot);
 const settings={...defaults.oai_settings,prompts:undefined,prompt_order:undefined,names_behavior:0,scenario_format:'{{scenario}}',personality_format:'{{personality}}',...s.preset,chat_completion_source:'custom'};
 const power={...defaults.power_user,persona_description:s.persona.description,prefer_character_prompt:true,prefer_character_jailbreak:true,...s.power,experimental_macro_engine:false,context:{example_separator:''},instruct:{enabled:false}};
 const c={isDataURL:x=>/^data:/.test(x),chat_completion_sources:{CUSTOM:'custom'},default_settings:{inline_image_quality:'auto'},getImageSizeFromDataURL:async x=>{const v=await Jimp.read(Buffer.from(x.split(',')[1],'base64'));return {width:v.bitmap.width,height:v.bitmap.height}},getAudioDurationFromDataURL:async x=>{const w=new wavefile.WaveFile();w.fromDataURI(x);return w.getSamples(true).length/w.fmt.numChannels/w.fmt.sampleRate},console:{log(){},debug(){},warn(){},error(...a){console.error(...a)}},structuredClone,TextEncoder,TextDecoder,URL,Buffer,AbortController,Math:Object.create(Math),Date,
 oai_settings:settings,power_user:power,chat:s.chat,characters:[s.character],this_chid:0,name1:s.persona.name,name2:s.character.name,chat_metadata:s.metadata||{},main_api:'openai',selected_group:null,groups:[],extension_prompts:{},memory:s.memory||{},openai_messages_count:0,
 world_info_depth:s.wi?.depth??2,world_info_budget:s.wi?.budget??25,world_info_budget_cap:s.wi?.cap??0,world_info_recursive:s.wi?.recursive??false,world_info_include_names:true,world_info_min_activations:0,world_info_min_activations_depth_max:0,world_info_max_recursion_steps:0,world_info_case_sensitive:false,world_info_match_whole_words:false,world_info_use_group_scoring:false,world_info_overflow_alert:false,shouldWIAddPrompt:false,
 eventSource:{emit:async()=>{}},event_types:{},accountStorage:{getItem:()=> 'true'},uuidv4:()=>crypto.randomUUID(),getCurrentChatId:()=>s.id||'chat',swipe_in_progress:false,getMaxPromptTokens:()=>settings.openai_max_context-settings.openai_max_tokens,getMaxContextTokens:()=>settings.openai_max_context,getMaxResponseTokens:()=>settings.openai_max_tokens,getGeneratingModel:()=>settings.custom_model||'gpt-4o-mini',getChatCompletionModel:()=>settings.custom_model||'gpt-4o-mini',getGroupNames:()=>[],getInstructMacros:()=>[],getVariableMacros:()=>[],textgenerationwebui_banned_in_macros:[],
 getTokenCountAsync:async text=>enc.encode(text||'').length,countTokensOpenAIAsync:async(value,full=false)=>{let n=0;for(const m of Array.isArray(value)?value:[value]){n+=6;for(const[k,v]of Object.entries(m)){n+=enc.encode(v).length;if(k==='name')n++;}}return n-(full?0:2);},
 persona_description_positions:{IN_PROMPT:0},ToolManager:{canPerformToolCalls:()=>false,isToolCallingSupported:()=>false},isImageInliningSupported:()=>true,isVideoInliningSupported:()=>false,isAudioInliningSupported:()=>true,isReasoningSignatureSupported:()=>false,interleaved_reasoning_providers:[],tool_reasoning_modes:{DISABLED:0},IGNORE_SYMBOL:Symbol(),system_message_types:{NARRATOR:'narrator'},getMediaDisplay:m=>m.extra?.media_display||'list',getMediaIndex:m=>m.extra?.media_index||0,
 t:(parts,...xs)=>parts.reduce((a,p,i)=>a+p+(xs[i]??''),''),toastr:{error:(x)=>console.error(x),warning:(x)=>{throw new Error(x)}},getRegexedString:s=>s,regex_placement:{WORLD_INFO:0},debounce:f=>f,debounce_timeout:{relaxed:0},getCharaFilename:()=>s.character.name,
 };
 c.getContext=()=>({extensionPrompts:c.extension_prompts,chat:c.chat,characters:c.characters,characterId:0,name1:c.name1,name2:c.name2,chatMetadata:c.chat_metadata});
 c.getSortedEntries=async()=>s.entries.map(e=>({...e,world:e.world||'research',decorators:[],hash:c.hashEntry(JSON.stringify(e))})).sort((a,b)=>b.order-a.order);
 if(s.random!==undefined)c.Math.random=()=>s.random;
 vm.createContext(c,{codeGeneration:{strings:false,wasm:false}});vm.runInContext(source+suffix+'\nglobalThis.hashEntry=getStringHash;',c);
 return {run:(...a)=>c.runCore(...a),context:c};
}
