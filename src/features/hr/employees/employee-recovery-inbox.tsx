'use client';
import {useRef,useState}from 'react';
import {Button}from '@/components/ui/button';
import {useWorkspaceDraftStoreContext}from '@/components/workspace/workspace-draft-provider';
import {useReadLifetime}from '@/hooks/use-read-lifetime';
import type {AuthContext}from '@/lib/rbac/check';
import {hrReadIdentity}from '@/lib/reads/hr-read-identity';
import {parseSaveRetirements,saveRetirementKey,validRetiredReceipt,type SaveRetirementMarker}from '@/lib/workspace/save-retirement';
import {reconcileEmployeeOperation}from '@/server/actions/hr/employees';
import {employeeRecoveryIndexKey,readEmployeeRecoveryIndex}from './use-employee-save-session';
import{HrChildRecoveryPanel}from './hr-child-recovery-panel';
type Entry={scope:string;marker:SaveRetirementMarker};
export function EmployeeRecoveryInbox({authContext}:{authContext:AuthContext}){
 return <><RecoveryInbox key={hrReadIdentity(authContext)} authContext={authContext}/><HrChildRecoveryPanel authContext={authContext}/></>;
}
function RecoveryInbox({authContext}:{authContext:AuthContext}){
 const actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`,store=useWorkspaceDraftStoreContext(),lifetime=useReadLifetime(hrReadIdentity(authContext));
 const [entries,setEntries]=useState<Entry[]|null>(null),[message,setMessage]=useState<string|null>(null),[busy,setBusy]=useState(false),flight=useRef(false);
 const load=()=>{
  if(!store||!lifetime.active)return;const scopes=readEmployeeRecoveryIndex(store,actor);
  if(scopes===null){setMessage('Retained recovery information could not be verified. No earlier request was resent.');return;}
  const next:Entry[]=[];
  for(const scope of scopes){const raw=store.getViewState(saveRetirementKey(scope));if(!raw)continue;const markers=parseSaveRetirements(raw,scope);if(!markers){setMessage('An earlier request could not be verified. No fields were resent or cleared.');return;}next.push(...markers.map(marker=>({scope,marker})));}
  setEntries(next);setMessage(next.length?null:'No unconfirmed employee saves are recorded in this signed-in workspace.');
 };
 const check=async(entry:Entry)=>{
  if(!store||flight.current||!lifetime.active)return;flight.current=true;setBusy(true);
  try{
   const result=await reconcileEmployeeOperation(entry.marker.operationId);if(!lifetime.active)return;
   if(!result.success||!result.data||!validRetiredReceipt(entry.marker,result.data)){setMessage(result.error??'Earlier save remains unresolved. No fields were resent.');return;}
   const raw=store.getViewState(saveRetirementKey(entry.scope)),markers=raw?parseSaveRetirements(raw,entry.scope):null,scopes=readEmployeeRecoveryIndex(store,actor);
   if(!markers||scopes===null||!markers.some(marker=>marker.operationId===entry.marker.operationId)){setMessage('Recovery information changed. Refresh the checks before proceeding.');return;}
   const remaining=markers.filter(marker=>marker.operationId!==entry.marker.operationId);
   store.setViewState(saveRetirementKey(entry.scope),remaining.length?JSON.stringify(remaining):'');
   if(!remaining.length)store.setViewState(employeeRecoveryIndexKey(actor),JSON.stringify(scopes.filter(scope=>scope!==entry.scope)));
   setEntries(previous=>previous?.filter(item=>item.marker.operationId!==entry.marker.operationId)??null);
   setMessage(`Earlier save confirmed for employee #${result.data.id}. Reopen the latest permitted record before further changes. No private fields were replayed.`);
  }catch{if(lifetime.active)setMessage('Recovery remains unconfirmed. No fields were resent or cleared.');}
  finally{flight.current=false;if(lifetime.active)setBusy(false);}
 };
 return <div className="space-y-2 text-sm">
  <Button type="button" variant="outline" disabled={busy||!store} onClick={load}>Check unconfirmed employee saves</Button>
  {message&&<p role="status">{message}</p>}
  {entries?.map(entry=><div key={entry.marker.operationId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2">
   <span>{entry.marker.id===null?'Earlier new-employee request':`Earlier employee #${entry.marker.id} request`}</span>
   <Button type="button" variant="outline" disabled={busy} onClick={()=>void check(entry)}>Check saved result</Button>
  </div>)}
 </div>;
}
