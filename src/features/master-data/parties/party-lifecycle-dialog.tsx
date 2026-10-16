'use client';
import {useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {partySaveReceipt} from '@/lib/master-data/party-save-contract';
import {useWorkspaceTabDirty} from '@/hooks/use-workspace-tab-dirty';
import {deactivateParty,reactivateParty} from '@/server/actions/master-data/parties';
import type {Party} from './party-types';

export function PartyLifecycleDialog({party,onClose,onSaved}:{party:Party;onClose:()=>void;onSaved:()=>void}){
 const [opening]=useState(()=>({...party})),[attempt]=useState(createWorkspaceSaveAttempt),flight=useRef(false);
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null);
 const [closing,setClosing]=useState(false);
 useWorkspaceTabDirty({isDirty:!closing&&(busy||uncertain||reason.length>0),enabled:true});
 // Let the existing dirty hook publish the explicit save/discard first. It
 // intentionally retains dirty state on unmount to protect interrupted work.
 useEffect(()=>{if(closing)onClose();},[closing,onClose]);
 const requestClose=()=>{if(!busy&&!uncertain)setClosing(true);};
 const change=async()=>{
  if(flight.current)return;
  flight.current=true;setBusy(true);setError(null);
  try{
   const contract=attempt.begin({is_active:!opening.is_active,reason},opening.workspace_revision==null?null:String(opening.workspace_revision));
   const result=opening.is_active?await deactivateParty(opening.id,reason,contract):await reactivateParty(opening.id,contract);
   const receipt=partySaveReceipt.safeParse(result.data);
   if(result.success&&(!receipt.success||receipt.data.id!==opening.id)){setUncertain(true);setError('Change unconfirmed. Retry this same action to recover its result.');return;}
   if(!result.success){setUncertain(result.uncertain===true);if(!result.uncertain)attempt.resolved();setError(result.error??'The status was not changed.');return;}
   attempt.resolved();setUncertain(false);setReason('');
   toast.success(result.data?.changed===false?'No changes to save':opening.is_active?'Party deactivated; history retained':'Party reactivated');
   try{onSaved();}catch{toast.warning('The change was saved. Reopen the list to refresh its display.');}
   setClosing(true);
  }catch{setUncertain(true);setError('Change unconfirmed. Retry the same action to recover its result.');}
  finally{flight.current=false;setBusy(false);}
 };
 return <Dialog open={!closing} onOpenChange={open=>{if(!open)requestClose();}}>
  <DialogContent showCloseButton={!busy&&!uncertain}><DialogHeader><DialogTitle>{opening.is_active?'Deactivate party':'Reactivate party'}</DialogTitle>
   <DialogDescription>{opening.display_name} — {opening.party_code}. Records and audit history will be retained. Active child parties must be resolved before deactivation; reactivation checks the selected references.</DialogDescription></DialogHeader>
   {opening.is_active&&<div className="space-y-2"><Label htmlFor="party-deactivation-reason">Reason (optional)</Label><Textarea id="party-deactivation-reason" value={reason} maxLength={1000} disabled={busy||uncertain} onChange={e=>setReason(e.target.value)}/></div>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <DialogFooter><Button type="button" variant="outline" disabled={busy||uncertain} onClick={requestClose}>Cancel</Button><Button type="button" disabled={busy} onClick={()=>void change()}>{busy?'Saving…':uncertain?'Retry same change':opening.is_active?'Deactivate':'Reactivate'}</Button></DialogFooter>
  </DialogContent>
 </Dialog>;
}
