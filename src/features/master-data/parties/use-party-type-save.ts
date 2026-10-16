'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import type {WorkspaceSaveContract,WorkspaceSaveReceipt} from '@/lib/workspace/save-contract';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import {savePartyTypeAssignments} from '@/server/actions/master-data/parties';
import type {ActionResult} from './party-types';
export type PartyTypeSelection={selected:number[];primary:number|null};

const recoveryMessage='The retained save request could not be verified. Reconcile the record before starting another change.';
const unknownMessage='The earlier save is still unconfirmed. Restore its submitted values and retry.';
type Activation={active:boolean};

/** F04 owns the operation, revision and fingerprint. This wrapper only witnesses
 * its normalized bytes and protects the original request across local failures. */
export function usePartyTypeSave(partyId:number,revision:string){
 const recordId=partyId;
 const sessionForm='party-types:'+partyId;
 const session=useWorkspaceSaveSession(sessionForm,recordId,Number(revision));
 const store=useWorkspaceDraftStoreContext();
 const owner=useWorkspaceFormOwner();
 const [admission]=useState(createSaveAdmission);
 const [local]=useState(()=>{
  const scope={form:sessionForm,id:recordId,store,ownerId:owner?.id};
  const key=owner?.id?`draft:tab:${owner.id}:${sessionForm}:save`:null;
  let expected:string|undefined;
  let pending=false;
  let fingerprint:string|undefined;
  let stopped=!!session.recoveryError||!store||!key||session.id!==recordId;
  let terminal:'confirmed'|'rejected'|null=null;
  let acknowledgedId=session.id;
  const capture=(ownWrite?:string)=>{
   if(!key||!store)throw Error(recoveryMessage);
   const raw=store.getViewState(key);
   if(typeof raw!=='string')throw Error(recoveryMessage);
   if(ownWrite!==undefined&&raw!==ownWrite)throw Error(recoveryMessage);
   // The shared initializer validated this envelope. Do not copy its schema.
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=='object'||Array.isArray(value))throw Error(recoveryMessage);
   expected=raw;
   pending=Object.hasOwn(value,'pending');
   // Read only the fingerprint already validated by F04. Equality distinguishes
   // a changed-input refusal from a failing write of the unchanged pending request.
   fingerprint=pending?(value as {pending:{fingerprint:string}}).pending.fingerprint:undefined;
  };
  try{if(!stopped)capture();}catch{stopped=true;}
  return {
   scope,
   get pending(){return pending;},
   matches(payload:unknown){return pending&&JSON.stringify(payload)===fingerprint;},
   get stopped(){return stopped;},
   get terminal(){return terminal;},
   get acknowledgedId(){return acknowledgedId;},
   stop(outcome:'confirmed'|'rejected'|null=null){stopped=true;if(outcome)terminal=outcome;},
   witness(){
    if(stopped||!key||!store||store.getViewState(key)!==expected)throw Error(recoveryMessage);
   },
   begun(payload:unknown,contract:WorkspaceSaveContract){
    capture(JSON.stringify({...JSON.parse(expected!),pending:{fingerprint:JSON.stringify(payload),contract}}));
   },
   accepted(receipt:WorkspaceSaveReceipt){capture(JSON.stringify({id:receipt.id,revision:receipt.revision}));},
   rejected(){const settled=JSON.parse(expected!);delete settled.pending;capture(JSON.stringify(settled));},
   acknowledge(id:number){acknowledgedId=id;},
  };
 });
 const activation=useRef<Activation|null>(null);
 const retired=useRef(false);
 const flight=useRef<object|null>(null);
 useLayoutEffect(()=>{
  const sameRecord=recordId===local.scope.id;
  if(sessionForm!==local.scope.form||!sameRecord||owner?.id!==local.scope.ownerId||store!==local.scope.store)retired.current=true;
  const lease={active:!retired.current};
  activation.current=lease;
  return ()=>{lease.active=false;};
 },[sessionForm,recordId,owner?.id,store,local]);
 const blocked=():ActionResult<PartySaveReceipt>=>({
  success:false,uncertain:local.terminal===null,
  error:local.terminal==='confirmed'?'The save was confirmed, but local recovery could not finish. Reconcile the saved record before another change.':
   local.terminal==='rejected'?'The request was rejected, but local recovery could not finish. Reopen the record before another change.':recoveryMessage,
 });
 return async(payload:PartyTypeSelection):Promise<ActionResult<PartySaveReceipt>>=>{
  const lease=activation.current;
  const current=()=>!!lease?.active&&!retired.current&&activation.current===lease;
  if(!current()||local.stopped)return blocked();
  try{local.witness();}catch{local.stop();return blocked();}
  if(!admission.enter())return {success:false,error:'A save is already in progress. Please wait for its result.'};
  const dispatch={};flight.current=dispatch;
  const recovering=local.pending;
  let dispatched=false;
  try{

   const submitted:PartyTypeSelection=JSON.parse(JSON.stringify(payload));
   let contract;
   const exactRetry=local.matches(submitted);
   try{
    contract={...session.begin(submitted)};
   }catch{
    // Changed input must leave exact-value retry available. A fresh begin may
    // already have changed F04's closure before persistence failed.
    try{local.witness();if(!recovering||exactRetry)local.stop();}catch{local.stop();}
    return local.stopped?blocked():{success:false,uncertain:true,error:unknownMessage};
   }
   try{local.begun(submitted,contract);}catch{local.stop();return blocked();}
   if(!current()){local.stop();return blocked();}
   dispatched=true;
   const result=await savePartyTypeAssignments(recordId,submitted.selected,submitted.primary,contract);
   if(!result.success){
    if(result.uncertain||recovering){
     try{if(!current())throw Error(recoveryMessage);local.witness();}catch{local.stop();}
     return {success:false,uncertain:true,error:unknownMessage};
    }
    // First known rejection remains authoritative if local clearing fails.
    try{
     if(!current())throw Error(recoveryMessage);
     local.witness();session.rejected();local.rejected();
    }catch{local.stop('rejected');}
    return {success:false,error:result.error,uncertain:false};
   }
   const receipt=partySaveReceipt.safeParse(result.data);
   if(!receipt.success||(receipt.data.id!==recordId)){
    try{if(!current())throw Error(recoveryMessage);local.witness();}catch{local.stop();}
    return {success:false,uncertain:true,error:'Save response incomplete. Keep the same values and retry.'};
   }
   // Confirmation precedes acknowledgement. Stale completion can return its
   // receipt but must never settle replacement workspace state.
   try{
    if(!current())throw Error(recoveryMessage);
    local.witness();session.accept(receipt.data);local.accepted(receipt.data);
    local.acknowledge(receipt.data.id);
   }catch{local.stop('confirmed');}
   return {success:true,data:receipt.data};
  }catch{
   try{if(!current())throw Error(recoveryMessage);local.witness();}catch{local.stop();}
   return {success:false,uncertain:dispatched||recovering,error:dispatched||recovering?unknownMessage:recoveryMessage};
  }finally{if(flight.current===dispatch){flight.current=null;admission.leave();}}
 };
}
