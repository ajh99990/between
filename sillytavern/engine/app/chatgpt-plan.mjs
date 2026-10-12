import {adaptRequest,ResponsesFrames} from './lingguang/compat.mjs';
import {EventSourceStream} from '../vendor/stream.mjs';
import {validReasoningEffort} from './plan-config.mjs';

export const PLAN_ENDPOINT = 'https://api.openai.com/v1/responses';
const keyOf = p => JSON.stringify([p.tenant, p.user]);
const configurationKey = (model, effort) => JSON.stringify([model, effort ?? null]);
const capabilities = Object.freeze({imageInput:false,audioInput:false,voice:false,tts:false,image:false,caption:false});
const messages = {
  authorization_required:'ChatGPT 套餐：尚未授权；请由管理员运行本机 Between 授权助手。',
  scope_missing:'ChatGPT 套餐：未授予套餐推理权限。',
  expired:'ChatGPT 套餐：授权已过期，需由授权组件刷新或重新登录。',
  ready:'ChatGPT 套餐：授权材料已绑定，尚未完成真实推理验证。',
  completed:'ChatGPT 套餐：本账户已完成一次 Responses 推理。',
  usage_limit:'ChatGPT 套餐：本应用或套餐使用上限已触发；请查看 ChatGPT Usage，再手动恢复。',
  rate_limited:'ChatGPT 套餐：请求频率受限，请稍后手动重试。',
  unavailable:'ChatGPT 套餐：暂时不可用，请稍后重试；不会切换计费方式。',
  forbidden:'ChatGPT 套餐：账户、工作区或策略不允许此次请求。',
  auth_rejected:'ChatGPT 套餐：授权未被接受，请核对账户与权限；不能据此断言已撤销。',
  disconnected:'ChatGPT 套餐：已断开本地连接，需重新授权。',
  unsupported:'ChatGPT 套餐：请求能力不受支持。',
  incomplete:'ChatGPT 套餐：回复未完整完成，本轮未保存。',
  cancelled:'ChatGPT 套餐：已停止，本轮未保存。',
  failed:'ChatGPT 套餐：推理失败，本轮未保存。',
};
export class PlanError extends Error {
  constructor(code, diagnostic) {super(messages[code]||messages.failed);this.code=code;this.diagnostic=diagnostic;}
}

// This is NOT an OAuth validator or credential store. Only a trusted host's future
// OIDC-validated account-linking adapter may supply sessions. No HTTP token input,
// environment credential, Codex file discovery, refresh, or persistent token write.
export function createPlanProvider({getSession=async()=>null,fetchImpl=fetch,now=Date.now}={}) {
  const identities=new Map(), completedModels=new Map(), requestedModels=new Map();
  const states=new Map(), blocked=new Set(), controllers=new Map();
  const set=(p,code)=>states.set(keyOf(p),code);
  const session=async p=>{
    if(blocked.has(keyOf(p)))throw new PlanError('disconnected');
    const s=await getSession(Object.freeze({...p}));
    if(!s||!s.principal||keyOf(s.principal)!==keyOf(p)||s.validated!==true||!s.subject||!s.workspace||!s.clientId||s.clientId==='dynamic_agent_client'||typeof s.accessToken!=='string'||!s.accessToken)throw new PlanError('authorization_required');
    if(!Array.isArray(s.scopes)||!s.scopes.includes('chatgpt.tokens.use.direct')||!s.scopes?.includes('resource.invoke'))throw new PlanError('scope_missing');
    if(!Number.isFinite(s.expiresAt)||s.expiresAt<=now())throw new PlanError('expired');
    const identity=JSON.stringify([s.subject,s.workspace,s.clientId]), k=keyOf(p);
    if(identities.get(k)!==identity){identities.set(k,identity);states.delete(k);completedModels.delete(k);}
    if(['authorization_required','scope_missing','expired'].includes(states.get(k)))states.delete(k);
    return s;
  };
  return {
    async status(p,model='',reasoningEffort) {
      let code;
      try{await session(p);code=states.get(keyOf(p))||'ready';if(code==='completed'&&completedModels.get(keyOf(p))!==configurationKey(model,reasoningEffort)||code==='unsupported'&&requestedModels.get(keyOf(p))!==configurationKey(model,reasoningEffort))code='ready';}catch(e){code=e instanceof PlanError?e.code:'authorization_required'}
      return {mode:'chatgpt-plan',model,reasoningEffort,connection:code,authorization:!['authorization_required','scope_missing','expired','disconnected','auth_rejected'].includes(code)?'bound':'required',canGenerate:!!model&&['ready','completed','unavailable','rate_limited','incomplete','cancelled','failed'].includes(code),description:messages[code],capabilities};
    },
    disconnect(p) {blocked.add(keyOf(p));set(p,'disconnected');for(const c of controllers.get(keyOf(p))||[])c.abort();},
    resume(p) {if(states.get(keyOf(p))==='usage_limit')set(p,'ready');},
    async generate({principal,messages:compiled,model,reasoningEffort,signal,onDelta}) {
      const local=new AbortController(),k=keyOf(principal);const active=controllers.get(k)||new Set();controllers.set(k,active);active.add(local);
      const combined=AbortSignal.any([local.signal,AbortSignal.timeout(120000),...(signal?[signal]:[])]);
      try {
        combined.throwIfAborted();const s=await session(principal);
        if(states.get(k)==='unsupported'&&requestedModels.get(k)!==configurationKey(model,reasoningEffort))states.delete(k);
        requestedModels.set(k,configurationKey(model,reasoningEffort));
        if(['usage_limit','forbidden','auth_rejected','unsupported'].includes(states.get(k)))throw new PlanError(states.get(k));
        const body=toResponses(compiled,model,reasoningEffort);
        const response=await fetchImpl(PLAN_ENDPOINT,{method:'POST',headers:{Authorization:'Bearer '+s.accessToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined,redirect:'error'});
        if(!response.ok){let payload;try{payload=await response.json()}catch{}throw mappedError(response.status,payload,response.headers.get('x-request-id'));}
        if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new PlanError('incomplete');
        let text='',bytes=0;const frames=new ResponsesFrames();
        const bounded=new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>8*1024*1024)throw new PlanError('incomplete');try{frames.push(chunk)}catch{throw new PlanError('incomplete')}controller.enqueue(chunk)},flush(){try{frames.push(new Uint8Array(),true)}catch{throw new PlanError('incomplete')}}});
        for await(const event of response.body.pipeThrough(bounded).pipeThrough(new EventSourceStream())) {
          combined.throwIfAborted();if(s.expiresAt<=now())throw new PlanError('expired');
          let e;try{e=JSON.parse(event.data)}catch{throw new PlanError('incomplete')}
          if(e.type==='response.failed'||e.type==='error')throw mappedError(0,{error:e.response?.error||e.error||e},response.headers.get('x-request-id'));
          if(e.type==='response.incomplete')throw new PlanError('incomplete');
          if(e.type==='response.output_item.added'&&!['message','reasoning'].includes(e.item?.type))throw new PlanError('unsupported');
          if(e.type==='response.output_text.delta') {if(typeof e.delta!=='string')throw new PlanError('incomplete');text+=e.delta;if(onDelta)await onDelta(e.delta);}
          if(e.type==='response.completed') {
            if(e.response?.status!=='completed'||!text)throw new PlanError('incomplete');
            combined.throwIfAborted();set(principal,'completed');completedModels.set(k,configurationKey(model,reasoningEffort));return text;
          }
        }
        throw new PlanError('incomplete');
      } catch(e) {
        const failure=blocked.has(k)?new PlanError('disconnected'):signal?.aborted?new PlanError('cancelled'):e instanceof PlanError?e:new PlanError('failed');
        set(principal,failure.code);throw failure;
      } finally {local.abort();active.delete(local);if(!active.size)controllers.delete(k);}
    },
  };
}

export function toResponses(compiled,model,reasoningEffort) {
  if(typeof model!=='string'||!model.trim()||model.length>200||!Array.isArray(compiled)||!compiled.length)throw new PlanError('unsupported');
  if(reasoningEffort!==undefined&&!validReasoningEffort(reasoningEffort))throw new PlanError('unsupported');
  const input=compiled.map(m=>{
    if(!['system','developer','user','assistant'].includes(m.role)||typeof m.content!=='string'||Object.keys(m).some(k=>!['role','content','name'].includes(k)))throw new PlanError('unsupported');
    // Keep original item order (including in-history WI) and exact content.
    // ST names (example_user/example_assistant) have no Responses equivalent:
    // explicitly preserve them as a visible textual speaker label.
    const content=m.name?`[${m.name}]\n${m.content}`:m.content;
    return {role:m.role,content};
  });
  // Allowlist construction intentionally excludes all sampling/output caps,
  // previous_response_id, metadata, tools and caller-supplied URLs.
  return adaptRequest({model,input,store:false,stream:true,...(reasoningEffort===undefined?{}:{reasoning:{effort:reasoningEffort}})}).body;
}

function mappedError(status,payload,requestId) {
  const e=payload?.error,code=e?.code;
  const mapping={subscription_sharing_usage_limit_exceeded:'usage_limit',subscription_sharing_usage_unavailable:'unavailable',subscription_sharing_user_unavailable:'unavailable',subscription_sharing_user_not_eligible:'forbidden',subscription_sharing_unsupported_capability:'unsupported',subscription_sharing_route_not_supported:'unsupported',subscription_sharing_invalid_user:'auth_rejected',chatpass_v2_scope_not_authorized:'forbidden',chatpass_v2_invalid_authorization_context:'forbidden'};
  const mapped=mapping[code]||(status===401?'auth_rejected':status===403?'forbidden':status===429?'rate_limited':status===503?'unavailable':'failed');
  // Retain diagnostics privately for host handling, never put upstream text in UI/logs.
  return new PlanError(mapped,{status,payload,requestId});
}
