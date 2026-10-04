import test from 'node:test';import assert from 'node:assert/strict';
import {runtimeConfigSchema,selectedProviderEnvironment} from '@between/host-qwen/config';
test('runtime provider config transmits only explicitly selected allowlisted names',()=>{
 const fixture={OPENAI_API_KEY:'SYNTHETIC_PROVIDER_CANARY',UNRELATED_SECRET:'SYNTHETIC_DO_NOT_COPY'};
 assert.deepEqual(selectedProviderEnvironment(undefined,fixture),{});
 assert.deepEqual(selectedProviderEnvironment(['OPENAI_API_KEY'],fixture),{OPENAI_API_KEY:'SYNTHETIC_PROVIDER_CANARY'});
 assert.throws(()=>selectedProviderEnvironment(['UNRELATED_SECRET'],fixture),/HOST_ENV_REJECTED/);
 const config={provider:'openai',runtimeRootPath:'/verified',runtimeManifestPath:'/verified-manifest.json',runtimeManifestSha256:'c'.repeat(64),sdkModulePath:'/verified/sdk.js',cliPath:'/verified/cli.js',sdkSha256:'a'.repeat(64),cliSha256:'b'.repeat(64)};
 assert.equal(runtimeConfigSchema.safeParse({...config,apiKey:'SYNTHETIC_NOT_ALLOWED'}).success,false);
 assert.equal(runtimeConfigSchema.safeParse({...config,providerEnvironment:['UNRELATED_SECRET']}).success,false);
 assert.equal(runtimeConfigSchema.safeParse({...config,providerEnvironment:['OPENAI_API_KEY']}).success,true);
});
