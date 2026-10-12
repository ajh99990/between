// Test-only inference seam; server/runtime source is not modified.
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='sillytavern-transformers')return {url:new URL('./mock-transformers.mjs',import.meta.url).href,shortCircuit:true};return nextResolve(specifier,context);}});
