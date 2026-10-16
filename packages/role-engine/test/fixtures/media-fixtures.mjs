import fs from 'node:fs';
export const mediaData=JSON.parse(fs.readFileSync(new URL('./media-data.json',import.meta.url)));
export const mediaCases=[
{id:'tts-character-queue',input:'INPUT: Say hello to Lin.',ttsQueue:true,context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','INPUT:']},
{id:'image-context',input:'INPUT: What is in this picture?',media:'image',context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','INPUT:']},
{id:'audio-context',input:'INPUT: Listen to this synthetic audio.',media:'audio',context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','INPUT:']},
{id:'voice-roundtrip',input:'INPUT: Start voice turn.',voice:true,context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','TRANSCRIPT:']},
{id:'contextual-image-generation',input:'INPUT: Show me the lighthouse in this scene.',imageGeneration:true,context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','INPUT:']},
{id:'caption-context',input:'INPUT: Please describe the image.',caption:true,media:'image',context:4096,has:['SYSTEM:','PERSONA:','DESCRIPTION:','INPUT:']},
];
