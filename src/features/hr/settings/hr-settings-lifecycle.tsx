"use client";
import {useEffect,useRef,useState} from 'react';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {MasterArchivePanel} from '@/features/common-master-data/master-archive-panel';
import {archiveHrSettingsRow} from '@/server/actions/hr/settings';
import {hrLookupSaveReceipt,type HrSettingsTable} from '@/lib/hr/settings-save-contract';
import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {toast} from 'sonner';

export type HrArchiveTarget={id:number;code:string;name:string;revision:string};
/** Mounted inside the principal-keyed settings page. No private draft survives an account change. */
export function HrSettingsLifecycle({entity,target,onTargetChange,onChanged,onBusyChange,disabled=false}:{entity:HrSettingsTable;target:HrArchiveTarget|null;onTargetChange:(target:HrArchiveTarget|null)=>void;onChanged:()=>void|Promise<void>;onBusyChange:(busy:boolean)=>void;disabled?:boolean}){
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[version,setVersion]=useState(0),[restoring,setRestoring]=useState(false);
 const attempt=useRef(createWorkspaceSaveAttempt()),flight=useRef(false);
 const pending=useRef<{entity:HrSettingsTable;target:HrArchiveTarget;contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null),activation=useRef({retired:false}),confirmedTarget=useRef<number|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 if(target===null&&confirmed)setConfirmed(false);
 useEffect(()=>{const current={retired:false};activation.current=current;return()=>{current.retired=true;};},[]);
 useEffect(()=>{if(target===null)confirmedTarget.current=null;},[target]);
 useEffect(()=>{onBusyChange(target!==null||restoring);return()=>onBusyChange(false);},[target,restoring,onBusyChange]);
 const changeTarget=(next:HrArchiveTarget|null)=>{if(saving||uncertain)return;attempt.current.resolved();pending.current=null;setError(null);try{onTargetChange(next);}catch{setError(confirmed?'Archived. Close and reopen this view to refresh the display.':'The dialog could not close. Try again.');}};
 const changed=async()=>{setVersion(value=>value+1);await onChanged();};
 const archive=async()=>{
  if(!target||disabled||flight.current||activation.current.retired||confirmedTarget.current===target.id)return;
  const active=activation.current;let committed=false;
  if(!pending.current&&!/^[1-9]\d*$/.test(target.revision)){setError('Reopen this record before archiving. Its current revision is unavailable.');return;}
  flight.current=true;setSaving(true);setError(null);
  try{
   pending.current??={entity,target:{...target},contract:attempt.current.begin({entity,id:target.id,action:'archive'},target.revision),hadUnknown:false};const request=pending.current;
   const result=await archiveHrSettingsRow(request.entity,request.target.id,request.target.code,request.contract);
   if(active.retired||pending.current!==request)return;
   if(!result.success){
    request.hadUnknown ||= result.uncertain===true;setUncertain(request.hadUnknown);if(!request.hadUnknown){attempt.current.resolved();pending.current=null;}
    const safe=result.error&&/^(This HR record|This record changed|You no longer have permission|A selected record|The change was rejected|Reopen this record|Global HR configuration)/.test(result.error);
    setError(request.hadUnknown?'Archive unconfirmed. Retry the same action to recover its result.':safe?result.error!:'The record was not archived. Check your permissions and its dependencies, then try again.');return;
   }
   const receipt=hrLookupSaveReceipt.safeParse(result.data);
   if(!receipt.success||receipt.data.entity!==request.entity||receipt.data.id!==request.target.id){request.hadUnknown=true;setUncertain(true);setError('Archive response incomplete. Retry the same action to recover its result.');return;}
   committed=true;confirmedTarget.current=request.target.id;setConfirmed(true);attempt.current.resolved();pending.current=null;setUncertain(false);
   try{onTargetChange(null);}catch{setError('Archived. Close and reopen this view to refresh the display.');}
   if(active.retired)return;
   try{toast.success(receipt.data.changed?'Record archived; history retained':'Record already archived');}catch{setError('Archived. The confirmation message could not be displayed.');}
   if(active.retired)return;
   try{await changed();}catch{setError('Archived. The related list could not refresh; reopen it before making another change.');}
  }catch{if(active.retired)return;if(committed){setError('Archived. Reopen the list to refresh the display.');return;}if(pending.current)pending.current.hadUnknown=true;setUncertain(true);setError('Archive unconfirmed. Retry the same action to recover its result.');}
  finally{if(!active.retired&&activation.current===active){flight.current=false;setSaving(false);}}
 };
 return <>
  {!target&&error&&<p role="alert">{error}</p>}
  <MasterArchivePanel entity={entity} title="Archived HR settings" disabled={disabled||target!==null||saving} refreshVersion={version} onRestored={changed} onTaskOpenChange={setRestoring}/>
  <AlertDialog open={target!==null} onOpenChange={open=>{if(!open)changeTarget(null);}}><AlertDialogContent>
   <AlertDialogHeader><AlertDialogTitle>Archive HR setting</AlertDialogTitle><AlertDialogDescription>Archive {target?.name}{target?.code?` (${target.code})`:''}? It will become inactive and unavailable for new use. Existing history is retained. Current dependencies may prevent this action.</AlertDialogDescription></AlertDialogHeader>
   {error&&<p role="alert">{error}</p>}
   <AlertDialogFooter><AlertDialogCancel disabled={saving||uncertain}>{confirmed?'Dismiss':'Cancel'}</AlertDialogCancel><AlertDialogAction disabled={saving||disabled||confirmed} onClick={event=>{event.preventDefault();void archive();}}>{saving?'Archiving…':uncertain?'Retry same archive':'Archive record'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </>;
}
