"use client";
import {useRef,useState} from 'react';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {useAdministrationSaveSession} from '@/hooks/use-administration-save-session';
import {serviceAssignmentReceipt,serviceAssignmentRequest,type ServiceAssignmentRequest,type ServiceAssignmentReceipt} from '@/lib/master-data/party-service-assignment-contract';
import {addPartyServiceCategory,removePartyServiceCategory} from '@/server/actions/master-data/party-service-categories';

/** Typed adapter over the existing F04 memory-only owner/save session. */
export function usePartyServiceAssignmentSession(formId:string,opening:Pick<ServiceAssignmentRequest,'action'|'id'|'partyId'|'revision'>){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const [orphaned]=useState(()=>{
  if(!owner)return false;
  try{
   const raw=store?.getViewState(`draft:tab:${owner.id}:${formId}:save`);
   const payload=store?.getViewState(`draft:tab:${owner.id}:${formId}:administration-payload`);
   return !!raw&&!!JSON.parse(raw).pending&&(!payload||payload==='null');
  }catch{return true;}
 });
 const session=useAdministrationSaveSession<ServiceAssignmentRequest>(formId,opening.id,opening.revision===null?undefined:Number(opening.revision),(value,id)=>{
  const parsed=serviceAssignmentRequest.safeParse(value);
  return parsed.success&&parsed.data.partyId===opening.partyId&&parsed.data.id===id&&parsed.data.action===opening.action&&parsed.data.revision===opening.revision;
 });
 const flight=useRef(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState<string|null>(orphaned?'The retained service request could not be verified. Check the saved assignments before reopening.':session.recoveryError);
 const [confirmation,setConfirmation]=useState<ServiceAssignmentReceipt|null>(null),[preparationBlocked,setPreparationBlocked]=useState(false);
 const confirmed=useRef<ServiceAssignmentReceipt|null>(null);
 async function submit(value?:ServiceAssignmentRequest):Promise<ServiceAssignmentReceipt|null>{
  if(flight.current||orphaned||preparationBlocked||session.recoveryError||!session.isCurrent())return null;
  if(confirmed.current)return confirmed.current;
  const wasUncertain=session.uncertain;
  let dispatched=false;
  flight.current=true;setSaving(true);setError(null);
  try{
   const pending=session.getPending()??session.prepare(serviceAssignmentRequest.parse(value));
   const request=pending.payload;dispatched=true;
   const result=request.action==='add'
    ?await addPartyServiceCategory({party_id:request.partyId,...request.fields},pending.contract)
    :await removePartyServiceCategory(request.id,{...pending.contract,revision:request.revision,partyId:request.partyId});
   if(!session.isCurrent())return null;
   if(!result.success){
    if(wasUncertain||result.uncertain){session.setUncertain(true);setError('The earlier service change is still unconfirmed. Retry its original request unchanged when access is available.');}
    else{session.rejected();setError(result.error??'The service change was rejected. Your entries are retained.');}
    return null;
   }
   const receipt=serviceAssignmentReceipt.parse(result.data);
   if(receipt.party_id!==request.partyId||(request.id!==null&&receipt.id!==request.id)||receipt.is_active!==(request.action==='add')||(request.action==='add'&&receipt.service_category_id!==request.fields.service_category_id))throw Error('Mismatched receipt.');
   confirmed.current=receipt;setConfirmation(receipt);
   try{session.accept(receipt);}catch{setError('Saved. Local confirmation could not finish; close this saved assignment before making another change.');}
   return receipt;
  }catch{
   if(session.isCurrent()){
    if(dispatched||wasUncertain){session.setUncertain(true);setError('The service change could not be confirmed. Retry the retained request before making another change.');}
    else{setPreparationBlocked(true);setError('The retained service request could not be verified. Check saved assignments before reopening this record.');}
   }
   return null;
  }finally{flight.current=false;if(session.isCurrent())setSaving(false);}
 }
 return {submit,saving,error,uncertain:!confirmation&&session.uncertain,blocked:orphaned||preparationBlocked||!!session.recoveryError,confirmed:confirmation,isCurrent:session.isCurrent};
}
