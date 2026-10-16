import {parse,readSource,writeOutput} from './source.mjs';import crypto from 'node:crypto';
let out='// SillyTavern fixed SHA 06bde939f, AGPL-3.0. Extracted original media functions.\n';const provenance=[];
function add(file,filter,rename){const src=readSource(file),ast=parse(src,{ecmaVersion:'latest',sourceType:'module',locations:true});let count=0;for(let n of ast.body){if(n.type==='ExportNamedDeclaration')n=n.declaration;if(!n)continue;let selected=filter(n);if(!selected)continue;count++;let text=src.slice(selected.start,selected.end);if(rename)text=`const ${rename} = ${text};`;out+=text+'\n';provenance.push({file,line:selected.loc.start.line,bytes:Buffer.byteLength(text),sha256:crypto.createHash('sha256').update(text).digest('hex')});}if(!count)throw Error('No matching upstream declaration: '+file);}
const declarations=(names)=>n=>names.includes(n.id?.name)||n.declarations?.some(x=>names.includes(x.id?.name))?n:null;
add('src/endpoints/speech.js',declarations(['getWaveFile']));
const route=(path,object='router')=>n=>n.expression?.callee?.object?.name===object&&n.expression.arguments[0]?.value===path?n.expression.arguments.at(-1):null;
add('src/endpoints/speech.js',route('/recognize'),'recognizeHandler');add('src/endpoints/speech.js',route('/synthesize'),'synthesizeHandler');add('src/endpoints/caption.js',route('/'),'captionHandler');add('src/endpoints/openai.js',route('/generate-voice','custom'),'ttsHandler');
add('public/scripts/extensions/tts/openai-compatible.js',declarations(['OpenAICompatibleTtsProvider']));
add('public/scripts/extensions/stable-diffusion/index.js',declarations(['sources','comfyTypes','generationMode','promptTemplates','defaultPrefix','defaultNegative','defaultStyles','placeholderVae','defaultSettings','getSdRequestBody','generateAutoImage','generatePrompt','processReply']));
writeOutput('packages/role-engine/vendor/media.js',out);writeOutput('packages/role-engine/vendor/media-provenance.json',JSON.stringify(provenance,null,2));
