'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from './party-types';

/** F06 consumer adapter, not another draft/cache system. The existing F04
 * session retains the exact request across workspace navigation in memory only.
 * An uncertain request is not silently replaced when the user retries. */
export function useNumberedPartyCreation(formId:string){
 const session=useWorkspaceSaveSession('numbered-party:'+formId,null,undefined);
 const store=useWorkspaceDraftStoreContext(),ownerId=useWorkspaceFormOwner()?.id;
 const [scope]=useState(()=>({store,ownerId,formId,key:ownerId?`draft:tab:${ownerId}:numbered-party:${formId}:save`:null}));
 const live=useRef({store,ownerId,formId,mounted:false});
 useLayoutEffect(()=>{live.current={store,ownerId,formId,mounted:true};return()=>{live.current.mounted=false;};},[store,ownerId,formId]);
 const readState=()=>{
  if(!scope.store||!scope.key)throw Error('Retained request unavailable.');
  const raw=scope.store.getViewState(scope.key);
  if(typeof raw!=='string')throw Error('Retained request unavailable.');
  return raw;
 };
 const [attempt]=useState(()=>{
  let expected:string|undefined,pending=false,blocked=!!session.recoveryError||session.id!==null||!scope.store||!scope.key;
  if(!blocked)try{
   // F04 has already validated and normalized this state. Read only its pending
   // presence, not a second envelope schema or an independently stored marker.
   expected=readState();const saved:unknown=JSON.parse(expected);
   if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('Invalid retention.');
   pending=Object.hasOwn(saved,'pending');
  }catch{blocked=true;}
  return {
   get expected(){return expected;},get pending(){return pending;},get blocked(){return blocked;},
   block(){blocked=true;},
   retain(){pending=true;expected=readState();},
   resolve(){pending=false;expected=readState();},
  };
 });
 const current=()=>{
  try{
   if(attempt.blocked||!live.current.mounted||live.current.store!==scope.store||live.current.ownerId!==scope.ownerId||
    live.current.formId!==scope.formId||session.recoveryError||readState()!==attempt.expected)throw Error('Retention changed.');
   return true;
  }catch{attempt.block();return false;}
 };
 const unconfirmed='The original creation is still unconfirmed. Retain its submitted values and retry only in the original workspace; do not create a replacement request.';
 const [admission]=useState(createSaveAdmission);
 return async function create<P,T>(payload:P,action:(input:P,contract:WorkspaceSaveContract)=>Promise<ActionResult<T>>):Promise<ActionResult<T>>{
  if(!admission.enter())return {success:false,error:'A save is already in progress. Please wait for its result.'};
  const recovering=attempt.pending;
  let dispatched=false;
  try{
   if(!current())return {success:false,uncertain:true,error:unconfirmed};
   const submitted=JSON.parse(JSON.stringify(payload)) as P;
   const contract=session.begin(submitted);
   try{attempt.retain();}catch{attempt.block();return {success:false,uncertain:true,error:unconfirmed};}
   dispatched=true;
   const result=await action(submitted,{...contract});
   if(result.success){
    const data=result.data as {id?:unknown}|undefined;
    if(!data||typeof data.id!=='number'||!Number.isSafeInteger(data.id)||data.id<1)return {success:false,uncertain:true,error:'Save response incomplete. Keep the same values and retry to recover its result.'};
    // A confirmed server receipt cannot be undone by local acknowledgement or
    // teardown. Block this old wrapper on failure; never clear a replacement.
    try{
     if(current()){session.rejected();attempt.resolve();}
    }catch{attempt.block();}
    return result;
   }
   if(!current())return {success:false,uncertain:true,error:unconfirmed};
   if(recovering)return {...result,uncertain:true,error:unconfirmed};
   if(!result.uncertain){
    try{session.rejected();attempt.resolve();}
    catch{attempt.block();}
   }
   return result;
  }catch{
   return {success:false,uncertain:dispatched||attempt.pending,error:unconfirmed};
  }finally{admission.leave();}
 };
}
