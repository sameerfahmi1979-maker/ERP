'use client';
import {useState} from 'react';
import {z} from 'zod';
import {Archive,ArchiveRestore} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {PartyChildSaveDialog} from './party-child-save-dialog';
import {setPartyChildArchived} from '@/server/actions/master-data/party-child-lifecycle';
import {partySaveReceipt} from '@/lib/master-data/party-save-contract';

const lifecycleReceipt=partySaveReceipt.extend({archived:z.boolean()});
type Entity=Parameters<typeof setPartyChildArchived>[0];
type RecordIdentity={id:number;party_id:number;workspace_revision?:number;archived_at?:string|null};
type Props={entity:Entity;record:RecordIdentity;label:string;onSaved:()=>void;onOpenChange?:(open:boolean)=>void;disabled?:boolean};
/** Own the dialog above the table. TanStack cell renderers can remount when a
 * parent updates its child-open gate, so a cell cannot own the save session. */
export function usePartyChildLifecycle({entity,onSaved,onOpenChange}:Pick<Props,'entity'|'onSaved'|'onOpenChange'>){
 const [opening,setOpening]=useState<{record:RecordIdentity;label:string}|null>(null);
 return {
  isOpen:opening!==null,
  open:(record:RecordIdentity,label:string)=>{setOpening({record:{...record},label});onOpenChange?.(true);},
  dialog:opening?<PartyChildLifecycleDialog entity={entity} record={opening.record} label={opening.label} onSaved={onSaved}
   onClose={()=>{setOpening(null);onOpenChange?.(false);}}/>:null,
 };
}
export function PartyChildLifecycleControl({record,disabled,onOpen}:Pick<Props,'record'|'disabled'>&{onOpen:()=>void}){
 const restoring=Boolean(record.archived_at);
 return <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={restoring?'Restore record':'Archive record'} title={restoring?'Restore record':'Archive record'} disabled={disabled} onClick={onOpen}>
   {restoring?<ArchiveRestore className="h-3.5 w-3.5"/>:<Archive className="h-3.5 w-3.5"/>}
  </Button>;
}
export function PartyChildLifecycleDialog({entity,record,label,onSaved,onClose}:Omit<Props,'onOpenChange'|'disabled'>&{onClose:()=>void}){
 const [opening]=useState(()=>({...record}));
 const archived=!opening.archived_at,verb=archived?'Archive':'Restore';
 const [error,setError]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
 const valid=Number.isSafeInteger(opening.workspace_revision)&&Number(opening.workspace_revision)>0;
 return <PartyChildSaveDialog<{archived:boolean}>
  formId={`lifecycle:${entity}:${opening.party_id}:${archived}`} record={opening} open title={`${verb} record`} mode="edit" size="sm"
  subtitle={archived?'Keep this record, its number, links and audit history. It will no longer be available for editing until restored.':'Return this record to the current list. Where an active status exists, it remains inactive until separately activated.'}
  isDirty={false} submitLabel={uncertain?'Retry same action':`${verb} record`} submitDisabled={!valid}
  onOpenChange={value=>{if(!value)onClose();}}
  createAction={async()=>({success:false,error:'Reopen the existing record first.'})}
  updateAction={async(input,contract)=>{
   const result=await setPartyChildArchived(entity,input.id,input.archived,contract);
   if(!result.success)return result;
   const receipt=lifecycleReceipt.safeParse(result.data);
   if(!receipt.success||receipt.data.id!==input.id||receipt.data.archived!==input.archived)
    return {success:false,uncertain:true,error:'Archive response incomplete. Retry the same action.'};
   // Validate the lifecycle-specific outcome before adapting it to F04's
   // strict generic save receipt. Do not loosen the common receipt schema.
   const {id,revision,changed,replayed}=receipt.data;
   return {success:true,data:{id,revision,changed,replayed}};
  }}
  onSubmit={async save=>{
   setError(null);const result=await save({archived});setUncertain(result.uncertain===true);
   if(!result.success){setError(result.error??'The archive state could not be confirmed.');return;}
   toast.success(result.data?.changed===false?'Archive state is already unchanged':archived?'Record archived; history retained':'Record restored');
   try{onSaved();}catch{toast.warning('Change saved. Reopen the list to refresh its display.');}
   onClose();
  }}>
  <p className="break-words text-sm font-medium">{label}</p>
  {!valid&&<p role="alert" className="mt-4 text-sm text-destructive">Reopen this record to load its current version before continuing.</p>}
  {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
 </PartyChildSaveDialog>;
}
