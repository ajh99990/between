import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
export const providerEnvironmentNames=['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_MODEL','QWEN_MODEL','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','GEMINI_API_KEY','GOOGLE_API_KEY'] as const;
const absolute=z.string().refine(value=>path.isAbsolute(value),'absolute path required');
export const runtimeConfigSchema=z.object({
 provider:z.enum(['openai','openai-responses','anthropic','gemini']),
 runtimeRootPath:absolute,runtimeManifestPath:absolute,runtimeManifestSha256:z.string().regex(/^[a-f0-9]{64}$/),
 sdkModulePath:absolute,cliPath:absolute,sdkSha256:z.string().regex(/^[a-f0-9]{64}$/),cliSha256:z.string().regex(/^[a-f0-9]{64}$/),nodePath:absolute.optional(),
 // Names only. The user configures authorized runtime values externally; no secret file import.
 providerEnvironment:z.array(z.enum(providerEnvironmentNames)).max(providerEnvironmentNames.length).optional()
}).strict();
export function loadRuntimeConfig(root:string){const file=path.join(root,'runtime-config.json');return existsSync(file)?runtimeConfigSchema.parse(JSON.parse(readFileSync(file,'utf8'))):undefined;}
export function selectedProviderEnvironment(names:readonly string[]|undefined,environment:NodeJS.ProcessEnv):Record<string,string>{
 const selected:Record<string,string>={};for(const name of names??[]){if(!(providerEnvironmentNames as readonly string[]).includes(name))throw Error('HOST_ENV_REJECTED');const value=environment[name];if(value!==undefined)selected[name]=value;}return selected;
}
