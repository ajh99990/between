import {pathToFileURL} from 'node:url';
/** The one exact file URL loaded for this process. No arbitrary query/hash origin allowance. */
export function trustedPageUrl(filePath:string,visual:boolean){const url=pathToFileURL(filePath);if(visual)url.searchParams.set('visual','1');return url.href;}
