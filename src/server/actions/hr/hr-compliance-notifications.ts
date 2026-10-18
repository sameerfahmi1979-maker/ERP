"use server";
import {getAuthContext} from "@/lib/rbac/check";
import {canUseApplication,hasGlobalPermission} from "@/lib/rbac/scope";
import {createAdminClient} from "@/lib/supabase/admin";
import {boundedQuery} from "@/lib/email/queue/runtime-limits";

export type ActionResult<T=unknown>={success:boolean;data?:T;error?:string};
export type HrComplianceExpiryResult={events_recorded:number;message:string};

/** Compatibility entry point: capture the SAME approved cycle identities as the
 * backend worker. Never send directly, use creator-as-recipient or broaden the
 * cadence through a client-supplied window. Delivery remains a separate receipt. */
export async function generateHrComplianceExpiryNotifications(options:{withinDays?:number;limit?:number}={}):Promise<ActionResult<HrComplianceExpiryResult>>{
 try{
  const ctx=await getAuthContext();
  if(!canUseApplication(ctx)||!['hr.admin','hr.compliance.manage','notifications.admin'].some(code=>hasGlobalPermission(ctx,code)))
   return {success:false,error:'Global compliance authority is required for this collection operation.'};
  const limit=options.limit??200;
  if(!Number.isSafeInteger(limit)||limit<1||limit>500||options.withinDays!==undefined&&options.withinDays!==90)
   return {success:false,error:'Use the approved reminder cadence and a batch between 1 and 500.'};
  const result=await boundedQuery(createAdminClient().rpc('f10_collect_hr_expiry_events',{batch_limit:limit}));
  if(result.error||!Number.isSafeInteger(result.data)||result.data<0)
   return {success:false,error:'Collection outcome could not be confirmed. Retry the same collection; cycle identities prevent duplicates.'};
  return {success:true,data:{events_recorded:result.data,message:'Expiry events recorded for verified recipient processing. This is not a notification or email-delivery confirmation.'}};
 }catch{return {success:false,error:'Collection could not be confirmed. No delivery is claimed; reconcile the original cycle before retrying.'};}
}
