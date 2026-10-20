'use client';
import {useRef,useState}from 'react';
import {useReadLifetime}from '@/hooks/use-read-lifetime';
import {Button}from '@/components/ui/button';
import {useWorkspaceDraftStoreContext}from '@/components/workspace/workspace-draft-provider';
import type {useWorkspaceSaveSession}from '@/hooks/use-workspace-save-session';
import {parseSaveRetirements,saveRetirementKey}from '@/lib/workspace/save-retirement';
import {reconcileEmployeeOperation}from '@/server/actions/hr/employees';

/** Receipt-only check: no raw saved payload, mutation or automatic replay. */
export function EmployeeSaveRecovery({session,scope}:{session:ReturnType<typeof useWorkspaceSaveSession>;scope:string}){
 const store=useWorkspaceDraftStoreContext(),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
 const flight=useRef(false),lifetime=useReadLifetime(scope);
 if(!session.requiresReconciliation&&!session.isRetired&&!session.recoveryError)return null;
 const raw=store?.getViewState(saveRetirementKey(scope)),markers=raw?parseSaveRetirements(raw,scope):null;
 return <div role="alert" className="rounded border border-border bg-muted/30 p-3 text-sm space-y-2">
  <p>{message??session.recoveryError??'Access changed while this record was open. An earlier save may need checking. Private fields will not be sent again.'}</p>
  {markers&&markers.map(marker=><Button key={marker.operationId} type="button" variant="outline" disabled={busy} onClick={async()=>{
   if(flight.current||!lifetime.active)return;flight.current=true;setBusy(true);
   try{const result=await reconcileEmployeeOperation(marker.operationId);if(!lifetime.active)return;if(result.success&&result.data&&session.settleRetired(marker.operationId,{receipt:result.data}))setMessage('Earlier save confirmed. Reopen the latest record and compare any retained draft before saving again.');else setMessage(result.error??'The earlier result remains unconfirmed. No fields were replayed.');}
   catch{if(lifetime.active)setMessage('The earlier result remains unconfirmed. Retry this check; no fields were replayed.');}finally{flight.current=false;if(lifetime.active)setBusy(false);}
  }}>Check earlier saved result</Button>)}
  {!markers&&session.isRetired&&!session.requiresReconciliation&&<p>Reopen this record to verify current access before another save.</p>}
 </div>;
}
