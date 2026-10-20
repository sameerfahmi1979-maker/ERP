'use client';
import {useQueryClient} from '@tanstack/react-query';
import {useRef} from 'react';
import {readComplianceChildRevision} from '@/server/actions/hr/child-mutation';
import {Button} from '@/components/ui/button';
import {useComplianceOperationSession} from './use-compliance-operation-session';
import {complianceReadIdentity} from '@/lib/reads/hr-compliance-records-schema';
import type {AuthContext} from '@/lib/rbac/check';
import type {ComplianceChildKind} from '@/lib/hr/compliance-child-contract';
import type {ChildSaveResult,ChildReceipt,ChildMutation} from '@/lib/hr/child-save-contract';
import type {ComplianceMutationAdmission} from './compliance-read-admission';

/** Uses the same account-owned original-operation controller as the accepted
 * child forms. A retry never fetches a replacement opening or changes payload. */
export function useComplianceSave(auth:AuthContext,employeeId:number,kind:ComplianceChildKind,admission:ComplianceMutationAdmission,retired:boolean){
 const actionFlight=useRef(false);
 const actor=auth.profile?`${auth.profile.id}:${auth.profile.auth_user_id}`:'unavailable';
 const cache=useQueryClient();
 const variants={'identity-document':['identity','identity-documents'],'medical-insurance':['insurance','medical-insurances'],'access-card':['cards','access-cards'],'training-certificate':['training','training-certificates'],'medical-record':['medical','medical-records']} as const;
 const cacheOnly=(receipt:ChildReceipt)=>{
  if(receipt.kind!==kind||receipt.employee_id!==employeeId)return;
  // Identifiers only; no current editor acknowledgement, fields, replay,
  // notification or query execution is permitted from this retired response.
  for(const key of [['hr','compliance-records',employeeId,variants[kind][0]],['hr','compliance',variants[kind][1],employeeId],['hr','compliance','summary',employeeId],['hr','employees','overview',employeeId],['dms','entity-documents','employee',employeeId]])void cache.invalidateQueries({queryKey:key,refetchType:'none'});
 };
 const session=useComplianceOperationSession(actor,JSON.stringify([complianceReadIdentity(auth),retired]),employeeId,kind,cacheOnly);
 const send=async(id:number|null,action:ChildMutation['action'],values:Record<string,unknown>,revision:string|null):Promise<ChildSaveResult & {data?:ChildReceipt & {dmsLinkCreated?:boolean}}>=>{
  if(!admission.canDispatch()||retired)return{success:false,error:'Required compliance reads or current access are unavailable.'};
  if(session.receipt&&!session.startNew())return{success:false,error:'Reconcile the earlier compliance change first.'};
  return session.submit({kind,employeeId,id,action,revision,values});
 };
 const act=async(id:number,action:'archive'|'verify'|'renewal',values:Record<string,unknown>={})=>{
  if(actionFlight.current||!admission.canDispatch()||session.pending||session.retired)return{success:false,error:'An earlier change or opening needs confirmation.'};
  actionFlight.current=true;
  try{const opening=await readComplianceChildRevision(kind,employeeId,id);if(!opening.success||!opening.revision||!admission.canDispatch())return{success:false,error:opening.error??'Original compliance revision unavailable.'};return await send(id,action,values,opening.revision);}
  finally{actionFlight.current=false;}
 };
 const retryOriginal=()=>session.pending?send(session.pending.request.id,session.pending.request.action,session.pending.request.values,session.pending.request.revision):Promise.resolve({success:false,error:'No original request remains for replay.'});
 return{...session,retryOriginal,canRetry:admission.ready&&!retired,get pending(){return session.pending;},get retired(){return session.retired;},get receipt(){return session.receipt;},send,act};
}
export function ComplianceSaveRecovery({session,onConfirmed}:{session:ReturnType<typeof useComplianceSave>;onConfirmed:()=>void}){
 if(!session.pending&&!session.retired&&!session.error)return null;
 return <div role="status" className="my-2 space-y-2 rounded border border-border p-3 text-sm">
  <p>{session.error??'An earlier compliance change needs confirmation. Do not submit a replacement.'}</p>
  {session.pending&&<Button type="button" variant="outline" disabled={session.busy||!session.canRetry} onClick={()=>void session.retryOriginal().then(r=>{if(r.success)onConfirmed();})}>Retry original change</Button>}
  {session.pending&&<Button type="button" variant="outline" disabled={session.busy} onClick={()=>session.retireForLater()}>Keep recovery for later</Button>}
  {session.retired&&<Button type="button" variant="outline" disabled={session.busy} onClick={()=>void session.reconcile().then(()=>{if(session.receipt?.replayed)onConfirmed();})}>Check earlier result</Button>}
 </div>;
}
