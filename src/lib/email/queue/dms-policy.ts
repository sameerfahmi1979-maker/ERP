import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission,hasPermission,hasPermissionInScope} from '@/lib/rbac/scope';
import {DeliveryPolicyError} from './policy';
export const DMS_NOTICE={subject:'ALGT ERP notification',textBody:'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.'};
/** Auth metadata is not mailbox authority. Reject malformed/unknown bans too. */
export function confirmedDeliveryMailbox(user:unknown,now=Date.now()):string|null{
 if(!user||typeof user!=='object')return null;
 const u=user as Record<string,unknown>;
 if(typeof u.email!=='string'||!u.email.trim()||typeof u.email_confirmed_at!=='string'||!Number.isFinite(Date.parse(u.email_confirmed_at))||u.deleted_at)return null;
 if(u.banned_until!=null&&u.banned_until!==''){
  if(typeof u.banned_until!=='string')return null;
  const until=Date.parse(u.banned_until);if(!Number.isFinite(until)||until>now)return null;
 }
 return u.email.trim();
}
export const DMS_BRIDGE_STATES=['not_bridged','bridged','email_queued','email_sent','provider_accepted','email_uncertain','email_cancelled','legacy_sent_unverified','failed','skipped'] as const;
export type DmsEmailBridgeState=typeof DMS_BRIDGE_STATES[number];
export function dmsEmailBridgeState(value:unknown):DmsEmailBridgeState{return DMS_BRIDGE_STATES.find(s=>s===value)??'failed';}
export function dmsEmailQueueOutcome(q:{status:string;delivery_state?:string|null;paused_at?:string|null;last_error?:string|null;sent_at?:string|null}):{bridge_status:DmsEmailBridgeState;email_delivery_status:string;email_sent_at:string|null}{
 if(q.status==='sent')return {bridge_status:q.delivery_state==='provider_accepted'?'provider_accepted':'legacy_sent_unverified',email_delivery_status:q.delivery_state==='provider_accepted'?'provider_accepted':'legacy_sent_unverified',email_sent_at:q.sent_at??null};
 if(q.status==='delivery_unknown')return {bridge_status:'email_uncertain',email_delivery_status:'delivery_unknown',email_sent_at:null};
 if(q.status==='cancelled')return {bridge_status:'email_cancelled',email_delivery_status:'cancelled',email_sent_at:null};
 if(q.status==='failed')return {bridge_status:'failed',email_delivery_status:'failed',email_sent_at:null};
 return {bridge_status:'email_queued',email_delivery_status:q.paused_at?'paused':q.status==='processing'?'processing':q.last_error==='F09:retry'?'retry_scheduled':q.last_error==='F09:provider_quota'?'provider_capacity':'queued',email_sent_at:null};
}
/** The legacy bridge can enqueue into an unpartitioned global queue. DMS scope
 * alone is not global delivery authority. The source read still uses caller RLS. */
export function canUseDmsEmailBridge(ctx:AuthContext):boolean{
 return (hasPermission(ctx,'dms.admin')||hasPermission(ctx,'dms.notifications.manage'))
  &&(hasPermission(ctx,'notifications.manage')||hasPermission(ctx,'notifications.admin'))
  &&(hasGlobalPermission(ctx,'notifications.admin')||hasGlobalPermission(ctx,'notifications.email_queue.manage')&&hasGlobalPermission(ctx,'notifications.email_queue.process'));
}
export function requireDmsNoticeAccess(recipient:AuthContext,doc:{owning_company_id:number;owning_branch_id:number|null;confidentiality_level:string}){
 if(!hasPermission(recipient,'notifications.view')||!['internal','company','hr','finance','legal','executive'].includes(doc.confidentiality_level))throw new DeliveryPolicyError();
 const permits=(code:string)=>hasPermissionInScope(recipient,code,doc.owning_company_id,doc.owning_branch_id);
 if(!(permits('dms.documents.view')||permits('dms.admin'))||(!['internal','company'].includes(doc.confidentiality_level)&&!permits('dms.documents.view.'+doc.confidentiality_level)))throw new DeliveryPolicyError();
}
