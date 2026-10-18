'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {recordEmailDeliveryReview} from '@/server/actions/notifications/email-reviews';
type Disposition='investigating'|'provider_accepted_confirmed'|'provider_not_accepted_confirmed';
export function EmailDeliveryReviewForm({queueId,onClose,onRecorded}:{queueId:number;onClose:()=>void;onRecorded:()=>void}){
 const [disposition,setDisposition]=useState<Disposition>('investigating'),[trace,setTrace]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[unconfirmed,setUnconfirmed]=useState(false);
 const [saved,setSaved]=useState(false);
 const owner=useRef(false),flight=useRef(false),committed=useRef(false),unknown=useRef(false),attempt=useRef(createWorkspaceSaveAttempt());
 useLayoutEffect(()=>{owner.current=true;return()=>{owner.current=false;};},[]);
 async function submit(){
  if(!owner.current||flight.current)return;
  if(committed.current){onRecorded();return;}
  const payload={queueId,disposition,traceReference:trace.trim()};
  flight.current=true;setBusy(true);setError('');
  try{
   const contract=attempt.current.begin(payload,null);
   const r=await recordEmailDeliveryReview({...payload,operationId:contract.operationId});
   if(!owner.current)return;
   if(!r.success||!r.data||!Number.isSafeInteger(r.data.id)||r.data.id<1){unknown.current ||= r.uncertain===true||r.success;if(!unknown.current)attempt.current.resolved();setUnconfirmed(unknown.current);setError(r.error??'Review receipt incomplete. Retry the unchanged review.');return;}
   committed.current=true;setSaved(true);unknown.current=false;setUnconfirmed(false);attempt.current.resolved();onRecorded();
  }catch{if(owner.current){if(!committed.current)unknown.current=true;setUnconfirmed(unknown.current);setError(committed.current?'Review saved. Close and refresh its history; no email was resent.':'Review save unconfirmed. Retry exactly the same entries; no resend is performed.');}}
  finally{flight.current=false;if(owner.current)setBusy(false);}
 }
 return <ERPChildDialogForm open onOpenChange={open=>{if(!open)onClose();}} title="Record delivery review" subtitle={`Queue ${queueId} — operator evidence, not an automatic delivery confirmation`} size="md" onSubmit={submit} isSubmitting={busy} closeDisabled={unconfirmed} submitLabel={saved?'Refresh saved review':'Save review'}>
  <p className="mb-4 text-sm">This records who reviewed the provider trace. The message stays held as uncertain. This cannot resend, recall, reset attempts or mark the message delivered.</p>
  {error&&<p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
  <div className="space-y-4">
   <div><Label htmlFor="f09-review-disposition">Review outcome</Label><select id="f09-review-disposition" aria-label="Review outcome" className="w-full rounded-sm border bg-background p-2 text-foreground" value={disposition} onChange={e=>setDisposition(e.target.value as Disposition)} disabled={busy||saved} required>
    <option value="investigating">Investigation in progress</option><option value="provider_accepted_confirmed">Operator confirmed provider acceptance</option><option value="provider_not_accepted_confirmed">Operator confirmed provider did not accept</option>
   </select></div>
   <div><Label htmlFor="f09-review-trace">Non-sensitive trace reference</Label><Input id="f09-review-trace" aria-label="Non-sensitive trace reference" value={trace} onChange={e=>setTrace(e.target.value)} minLength={3} maxLength={200} required disabled={busy||saved}/><p className="text-xs text-muted-foreground">Enter a ticket or provider trace reference only. Do not paste email addresses, message contents, access links or credentials.</p></div>
  </div>
 </ERPChildDialogForm>;
}
