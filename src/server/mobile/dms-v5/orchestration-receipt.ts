import "server-only";
import {randomUUID} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {AsyncLocalStorage} from "node:async_hooks";
import type {DmsAiOrchestrationStepResult} from "@/lib/dms/orchestration/types";
type ProviderEffect="never_started"|"started";
const effects=new AsyncLocalStorage<{started:boolean}>();
export function withRetryEffects<T>(run:()=>Promise<T>){return effects.getStore()?run():effects.run({started:false},run);}
export function markRetryProviderStarted(){const state=effects.getStore();if(state)state.started=true;}
export function retryProviderEffect():ProviderEffect{
 const state=effects.getStore();
 // Missing positive proof of a pre-provider exit must remain uncertain.
 return state&&!state.started?"never_started":"started";
}
type Save=(step:DmsAiOrchestrationStepResult,status:string)=>Promise<void>;
const scope=new AsyncLocalStorage<{sessionCode:string;step:string;save:Save}>();
export const withMobileStepReceipt=<T>(sessionCode:string,step:string,save:Save,action:()=>Promise<T>)=>scope.run({sessionCode,step,save},action);
// Existing web callers have no operation UUID. Retain one server-side until
// their canonical step write can be verified, including across an unknown outcome.
export async function reserveWebStep(sessionId:number,code:string,step:string) {
 const active=scope.getStore();
 if(active){
  if(active.sessionCode!==code||active.step!==step)throw Error("Orchestration source changed");
  return null;
 }
 const lease=randomUUID();
 const args={p_session:sessionId,p_step:step,p_lease:lease};
 const result=await createAdminClient().rpc("mobile_dms_web_retry",{...args,p_result:null});
 if(result.error?.code==="PGRST202"||result.error?.code==="42883")return null;
 if(result.error)throw Error("The original retry requires reconciliation.");
 if(result.data===false)return null;
 if(result.data!==true)throw Error("The retry could not be admitted.");
 return async (completed:DmsAiOrchestrationStepResult)=>{
  const confirmed=await createAdminClient().rpc("mobile_dms_web_retry",{...args,p_result:{...completed,providerEffect:retryProviderEffect()}});
  if(confirmed.error||confirmed.data!==true)throw Error("The original retry requires reconciliation.");
 };
}
export async function publishMobileStepReceipt(code:string,step:DmsAiOrchestrationStepResult,status:string){
 const current=scope.getStore();if(!current)return false;
 if(current.sessionCode!==code||current.step!==step.step)throw Error("Orchestration source changed");
 await current.save(step,status);return true;
}
