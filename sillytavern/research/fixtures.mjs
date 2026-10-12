export const entry=(uid,key,content,extra={})=>({uid,key:[key],keysecondary:[],comment:'Synthetic research fixture',content,constant:false,selective:false,selectiveLogic:0,order:100-uid,position:0,disable:false,excludeRecursion:false,preventRecursion:false,delayUntilRecursion:false,probability:100,useProbability:true,depth:1,role:0,scanDepth:null,caseSensitive:false,matchWholeWords:false,group:'',groupOverride:false,groupWeight:100,sticky:0,cooldown:0,delay:0,displayIndex:uid,...extra});
const history=Array.from({length:16},(_,i)=>({name:i%2?'Mira':'Lin',is_user:!(i%2),is_system:false,mes:`HISTORY_${i}: `+'The quiet keeper watches the coastline. '.repeat(i===12?150:3),send_date:'2025-01-01',extra:{}}));
export const cases=[
{id:'basic',input:'INPUT: Tell me about the harbor.',has:['SYSTEM:','PERSONA:','DESCRIPTION:','PERSONALITY:','SCENARIO:','EXAMPLE:','HISTORY:','DEPTH:','INPUT:','POST:']},
{id:'budget-first-overflow',input:'INPUT: Latest question.',context:1024,history,has:['HISTORY_13','HISTORY_14','HISTORY_15'],absent:['HISTORY_12','HISTORY_11','HISTORY_0']},
{id:'budget-unpinned',input:'INPUT: Latest question.',context:260,history,has:['HISTORY_14','HISTORY_15','INPUT:'],absent:['EXAMPLE:','HISTORY_13','HISTORY_12','HISTORY_11']},
{id:'budget-pinned',input:'INPUT: Latest question.',context:260,history,pin:true,has:['EXAMPLE:','HISTORY_15','INPUT:'],absent:['HISTORY_14','HISTORY_12','HISTORY_11']},
{id:'wi-keyword',input:'INPUT: harbor',entries:[entry(1,'harbor','WI_KEY: amberkey.'),entry(2,'amberkey','WI_RECURSIVE: blue lamp.')],recursive:false,has:['WI_KEY:'],absent:['WI_RECURSIVE:']},
{id:'wi-recursive',input:'INPUT: harbor',entries:[entry(1,'harbor','WI_KEY: amberkey.'),entry(2,'amberkey','WI_RECURSIVE: blue lamp.')],recursive:true,has:['WI_KEY:','WI_RECURSIVE:']},
{id:'wi-off',input:'INPUT: mountain',entries:[entry(1,'harbor','WI_KEY: amberkey.')],absent:['WI_KEY:']},
{id:'wi-regex-secondary-probability',input:'INPUT: HARBOR fog',entries:[entry(1,'/harbor/i','WI_REGEX:',{selective:true,keysecondary:['fog']}),entry(2,'harbor','WI_SECONDARY_FAIL:',{selective:true,keysecondary:['sun']}),entry(3,'harbor','WI_RANDOM_PASS:',{probability:50}),entry(4,'harbor','WI_RANDOM_FAIL:',{probability:20})],has:['WI_REGEX:','WI_RANDOM_PASS:'],absent:['WI_SECONDARY_FAIL:','WI_RANDOM_FAIL:']},
{id:'wi-depth',input:'INPUT: harbor',entries:[entry(1,'harbor','WI_DEPTH:',{position:4,depth:1})],has:['WI_DEPTH:']},
{id:'wi-scan-depth',input:'INPUT: mountain',history:[{name:'Lin',is_user:true,mes:'harbor',extra:{}},{name:'Mira',is_user:false,mes:'Nothing new',extra:{}}],entries:[entry(1,'harbor','WI_SCAN_SHALLOW:',{scanDepth:1}),entry(2,'harbor','WI_SCAN_DEEP:',{scanDepth:4})],has:['WI_SCAN_DEEP:'],absent:['WI_SCAN_SHALLOW:']},
{id:'wi-budget',input:'INPUT: harbor',wiBudgetCap:15,entries:[entry(1,'harbor','WI_TOO_LONG: '+'lantern '.repeat(100)),entry(2,'harbor','WI_IGNORES_BUDGET:',{ignoreBudget:true})],has:['WI_IGNORES_BUDGET:'],absent:['WI_TOO_LONG:']},
{id:'wi-delay',input:'INPUT: harbor',entries:[entry(1,'harbor','WI_DELAY:',{delay:10})],absent:['WI_DELAY:']},
{id:'wi-sticky-cooldown',input:'INPUT: harbor',entries:[entry(1,'harbor','WI_STICKY:',{sticky:3,cooldown:4})],turns:['INPUT: mountain','INPUT: harbor'],has:['WI_STICKY:'],turnHas:[['WI_STICKY:'],[]],turnAbsent:[[],['WI_STICKY:']]},
{id:'regenerate',input:'INPUT: harbor',regenerate:true,has:['INPUT:']},
{id:'transport-retry',input:'INPUT: harbor',failFirst:true,has:['INPUT:']},
];
