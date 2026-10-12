import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from 'acorn';
const lists={
'public/scripts/PromptManager.js':['Prompt','PromptCollection','PromptManager','INJECTION_POSITION','chatCompletionDefaultPrompts','promptManagerDefaultPromptOrder'],
'public/scripts/openai.js':['TokenHandler','Message','MessageCollection','ChatCompletion','TokenBudgetExceededError','InvalidCharacterNameError','IdentifierNotFoundError','populateChatHistory','populateDialogueExamples','populateChatCompletion','populationInjectionPrompts','preparePromptsForChatCompletion','prepareOpenAIMessages','getPromptPosition','getPromptRole','formatWorldInfo','setOpenAIMessages','setOpenAIMessageExamples','parseExampleIntoIndividual','character_names_behavior'],
'public/script.js':['MAX_INJECTION_DEPTH','createLazyFields','getCharacterCardFieldsLazy','getCharacterCardFields','baseChatReplace','substituteParams','substituteParamsLegacy','substituteParamsExtended','parseMesExamples','getExtensionPromptByName','getExtensionPromptMaxDepth','getExtensionPrompt','setExtensionPrompt','extension_prompt_types','extension_prompt_roles'],
'public/scripts/world-info.js':['WorldInfoBuffer','WorldInfoTimedEffects','checkWorldInfo','getWorldInfoPrompt','parseRegexFromString','filterByInclusionGroups','filterGroupsByScoring','filterGroupsByTimedEffects','world_info_position','world_info_logic','scan_state','defaultGlobalScanData','wi_anchor_position','MAX_SCAN_DEPTH','DEFAULT_WEIGHT','KNOWN_DECORATORS','sortFn'],
'public/scripts/macros.js':['MacrosParser','evaluateMacros','getChatIdHash','getLastMessageId','getLastMessage','getLastUserMessage','getLastCharMessage','getFirstIncludedMessageId','getFirstDisplayedMessageId','getLastSwipeId','getCurrentSwipeId','getBannedWordsMacro','getTimeSinceLastMessage','getRandomReplaceMacro','getPickReplaceMacro','getDiceRollMacro','getTimeDiffMacro','getOutletPrompt'],
'public/scripts/utils.js':['escapeRegex','getStringHash','isTrueBoolean','isFalseBoolean','onlyUnique','stringFormat'],
'src/prompt-converters.js':['embedOpenRouterMedia'],
'public/scripts/constants.js':['MEDIA_TYPE','MEDIA_DISPLAY','inject_ids'],
};
const manifest=[];let code='// Extracted from SillyTavern 06bde939fb1e9c4c8d8641d810f0a916b5bce127; AGPL-3.0. See LICENSE.\n';const seen=new Set();
for(const[file,names]of Object.entries(lists)){const source=fs.readFileSync(file,'utf8');const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});for(const name of names){let found;
for(let n of ast.body){if(n.type==='ExportNamedDeclaration')n=n.declaration;if(!n)continue;if(n.id?.name===name)found=n;if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.name===name)found={...d,start:d.start,kind:n.kind,type:'pickedVariable'};}
if(!found){console.error('MISSING',file,name);continue;}if(seen.has(name))continue;seen.add(name);const raw=source.slice(found.start,found.end);let text=found.type==='pickedVariable'?`${found.kind} ${raw};`:raw;if(name==='prepareOpenAIMessages')text=text.replace('} catch (error) {','} catch (error) { throw error;');code+='\n'+text+'\n';manifest.push({file,name,line:found.loc.start.line,sha256:crypto.createHash('sha256').update(raw).digest('hex'),bytes:Buffer.byteLength(raw),lines:raw.split('\n').length});}}
fs.writeFileSync('engine/vendor/core.js',code);fs.writeFileSync('engine/vendor/provenance.json',JSON.stringify(manifest,null,2));console.log('extracted',manifest.length,Buffer.byteLength(code));
