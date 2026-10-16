'use client';
import {useRef,useState} from 'react';
import {useAdministrationSaveSession} from '@/hooks/use-administration-save-session';
import {lookupCommandSchema,verifyLookupReceipt,type LookupCommand,type LookupMutationContract,type LookupMutationResult} from './mutation-contract';
import {createLookupCategory,updateLookupCategory,toggleLookupCategoryStatus,toggleLookupCategoryLock,createLookupValue,updateLookupValue,toggleLookupValueStatus,toggleLookupValueLock,setDefaultLookupValue} from '@/server/actions/master-data/lookups';
import type {CreateLookupCategoryInput,UpdateLookupCategoryInput,CreateLookupValueInput,UpdateLookupValueInput} from './validation';
import {categoryFormPayload,valueFormPayload} from './form-data';

/** Compare only rendered mutable fields with the acknowledged original. This
 * read-only snapshot includes controls disabled by the pending fieldset, without
 * enabling them or changing the payload submitted to the server. A newer draft
 * must survive recovery of an earlier request.
 */
export function lookupDraftMatches(form:HTMLFormElement,command:LookupCommand):boolean{
 try{
  const snapshot=new FormData();
  for(const control of Array.from(form.elements)){
   if(!(control instanceof HTMLInputElement||control instanceof HTMLTextAreaElement||control instanceof HTMLSelectElement)||!control.name||control.disabled)continue;
   if(control instanceof HTMLInputElement){
    if(['password','file','submit','button','reset','image'].includes(control.type))continue;
    if(['checkbox','radio'].includes(control.type)&&!control.checked)continue;
   }
   if(control instanceof HTMLSelectElement&&control.multiple){for(const option of Array.from(control.selectedOptions))snapshot.append(control.name,option.value);}
   else snapshot.append(control.name,control.value);
  }
  const current=command.kind==='category'?categoryFormPayload(snapshot,false):valueFormPayload(snapshot,false);
  const original=Object.fromEntries(Object.entries(command.data).filter(([key])=>key!=='category_code'&&key!=='value_code'));
  const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,normalize(item)])):value;
  return JSON.stringify(normalize(current))===JSON.stringify(normalize(original));
 }catch{return false;}
}

async function dispatch(id:number|null,command:LookupCommand,contract:LookupMutationContract):Promise<LookupMutationResult>{
 const d=command.data;
 if(command.kind==='category'){
  if(command.action==='save')return id===null?createLookupCategory(d as CreateLookupCategoryInput,contract):updateLookupCategory({...d,id} as UpdateLookupCategoryInput,contract);
  if(command.action==='active')return toggleLookupCategoryStatus(id!,d.is_active as boolean,d.deactivation_reason as string|null|undefined,contract);
  return toggleLookupCategoryLock(id!,d.is_locked as boolean,contract);
 }
 if(command.action==='save')return id===null?createLookupValue({...d,category_id:command.categoryId} as CreateLookupValueInput,contract):updateLookupValue({...d,id} as UpdateLookupValueInput,contract);
 if(command.action==='active')return toggleLookupValueStatus(id!,d.is_active as boolean,d.deactivation_reason as string|null|undefined,contract);
 if(command.action==='lock')return toggleLookupValueLock(id!,d.is_locked as boolean,contract);
 return setDefaultLookupValue(id!,command.categoryId!,contract);
}

/** Lookup-local adapter; the shared account/tab-owned session stays unchanged.
 * Retry uses the retained payload, including its original category revision.
 */
export function useLookupMutation(formId:string,id:number|null,revision?:number,admitAction?:()=>boolean){
 const session=useAdministrationSaveSession<LookupCommand>(formId,id,revision,p=>lookupCommandSchema.safeParse(p).success);
 const busy=useRef(false),stopped=useRef(false);
 const parent=useRef<{id:number;revision:string}|null>(null);
 const [working,setWorking]=useState(false),[message,setMessage]=useState<string|null>(null),[blocked,setBlocked]=useState(false);
 const [confirmed,setConfirmed]=useState<LookupCommand|null>(null);
 const run=async(command?:LookupCommand):Promise<LookupMutationResult&{acknowledged?:boolean;retainedCommand?:LookupCommand}>=>{
  if(busy.current||stopped.current||session.recoveryError)return {success:false,error:session.recoveryError??'This lookup operation cannot continue. Reopen the record.'};
  // Row-action admission is rechecked immediately before any witness is changed.
  // A sibling mounted opener cannot hide another namespace's pending original.
  if(admitAction){let admitted=false;try{admitted=admitAction();}catch{/* Fail closed without repairing another opener. */}
   if(!admitted){stopped.current=true;setBlocked(true);const error='The earlier lookup action could not be identified safely. Reopen this list and reconcile the original request before another change.';setMessage(error);return{success:false,error};}}
  busy.current=true;setWorking(true);setMessage(null);
  let pending:ReturnType<typeof session.prepare>|null=null,wasUnknown=session.uncertain;
  try{
   const original=session.getPending();wasUnknown=session.uncertain;
   if(original)pending=original;
   else{
    if(!command)throw new Error('There is no original lookup request to recover.');
    const candidate=lookupCommandSchema.parse(command);
    if(candidate.kind==='value'&&parent.current?.id===candidate.categoryId&&BigInt(parent.current.revision)>BigInt(candidate.categoryRevision!))candidate.categoryRevision=parent.current.revision;
    pending=session.prepare(candidate);
   }
  }catch{const error='The original lookup request could not be verified. Reopen the latest record before continuing.';setMessage(error);busy.current=false;setWorking(false);return {success:false,error};}
  let result:LookupMutationResult;
  try{result=await dispatch(pending.id,pending.payload,{...pending.contract,categoryId:pending.payload.categoryId,categoryRevision:pending.payload.categoryRevision});}
  catch{result={success:false,uncertain:true,error:'Save unconfirmed. Retry the original unchanged request.'};}
  if(!session.isCurrent()){busy.current=false;return {success:false,error:'The workspace or account changed. Reopen this record to check the outcome.'};}
  if(result.success){
   try{
    const receipt=verifyLookupReceipt(result.data,pending.id,pending.payload,pending.contract);
    // Validate ALL receipt bindings before acknowledging the shared session.
    session.accept(receipt);parent.current={id:receipt.category_id,revision:receipt.category_revision};
    setConfirmed(pending.payload);setMessage(result.refreshWarning?'Saved. A related view could not refresh; reopen it before another change.':null);
    busy.current=false;setWorking(false);return {...result,acknowledged:true,retainedCommand:pending.payload};
   }catch{
    // A verified committed response must never become another dispatch retry.
    // Malformed responses are still unknown; distinguish them before accept.
    try{verifyLookupReceipt(result.data,pending.id,pending.payload,pending.contract);}catch{
     session.setUncertain(true);setMessage('Save response unverified. Recover the original request.');busy.current=false;setWorking(false);
     return {success:false,uncertain:true,error:'Save response unverified. Recover the original request.'};
    }
    stopped.current=true;setBlocked(true);setMessage('Saved, but this workspace could not acknowledge the result. Reopen the record before saving again.');busy.current=false;setWorking(false);
    return {...result,acknowledged:false};
   }
  }
  try{
   if(result.uncertain||wasUnknown){session.setUncertain(true);if(wasUnknown&&!result.uncertain)result={...result,uncertain:true,error:'The latest attempt was rejected, but the original outcome remains unconfirmed. Keep and recover the original request.'};}
   else session.rejected();
  }catch{stopped.current=true;setBlocked(true);}
  setMessage(result.error??'Lookup change rejected.');busy.current=false;setWorking(false);return result;
 };
 // A true workspace remount retains the original request, not this hook's local feedback.
 const recoveryMessage=session.uncertain&&!blocked&&!session.recoveryError
  ?'An earlier lookup request is unconfirmed. Recover the original request before making another change.'
  :null;
 return {run,working,message:message??recoveryMessage,confirmed,savedId:session.savedId,uncertain:session.uncertain,blocked:blocked||!!session.recoveryError,recoveryError:session.recoveryError,isCurrent:session.isCurrent};
}
