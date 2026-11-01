import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
import {AI_TURN_LIMITS} from '@/lib/ai/foundation/budget';
import {logDmsAiUsage} from '@/lib/ai/observability/log-dms-ai-usage';
type Scope={actor:number;calls:number;models:Set<string>;prompts:Set<string>};
const scope=new AsyncLocalStorage<Scope>();
export async function withAiQualityUsage<T>(actor:number,work:()=>Promise<T>){
 const value:Scope={actor,calls:0,models:new Set(),prompts:new Set()};
 const result=await scope.run(value,work);return {result,provenance:{models:[...value.models],prompts:[...value.prompts],calls:value.calls}};
}
export function admitAiQualityModelCall(){const s=scope.getStore();if(s){if(s.calls>=AI_TURN_LIMITS.modelCalls)throw Error('Turn model-call limit reached.');s.calls++;}}
export async function recordAiQualityCall(input:{providerConfigId:number|null;model:string|null;promptVersion?:string;success:boolean;inputTokens:number|null;outputTokens:number|null;durationMs:number}){
 const s=scope.getStore();if(!s)return;
 if(input.model)s.models.add(input.model);if(input.promptVersion)s.prompts.add(input.promptVersion);
 try{await logDmsAiUsage({providerConfigId:input.providerConfigId,featureArea:'assistant',operationType:'structured_completion',modelId:input.model,status:input.success?'success':'failed',inputTokenCount:input.inputTokens,outputTokenCount:input.outputTokens,durationMs:input.durationMs,createdBy:s.actor,metadata:{prompt_version:input.promptVersion??null,contract_version:'erp-ai/1',rules_version:'ai-mod05/1'}});}catch{/* Canonical logger is best-effort; do not repeat a confirmed provider request. */}
}
