'use client';
import {Component,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {useWorkspaceSaveSession} from '@/hooks/use-workspace-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {createSaveAdmission} from '@/lib/workspace/save-admission';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {resolvePartyRevisionOpening,assertPartyRevisionSnapshot,withPartyRevisionWrite,partyRecoveryMessage,type PartyRevisionOpening} from './party-revision-recovery';
import {ERPChildDialogForm,type ERPChildDialogFormProps} from '@/components/erp/erp-child-dialog-form';
import type {ActionResult} from './party-types';
export type SavePartyChild<P extends object>=(payload:P)=>Promise<ActionResult<PartySaveReceipt>>;
type RecordIdentity={id:number;workspace_revision?:number};
type Actions<P extends object>={
 createAction:(payload:P,contract:WorkspaceSaveContract)=>Promise<ActionResult<{id:number;revision:string;replayed:boolean}>>;
 updateAction:(payload:P&{id:number},contract?:WorkspaceSaveContract)=>Promise<ActionResult<PartySaveReceipt>>;
};
const unknownMessage='The save result is not confirmed. Keep or restore the submitted values and retry to recover the result before closing.';
type Props<P extends object>=Omit<ERPChildDialogFormProps,'onSubmit'|'closeDisabled'>&Actions<P>&{
 formId:string;record?:RecordIdentity|null;onSubmit:(save:SavePartyChild<P>)=>Promise<void>;
};
class ChildRecoveryBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function ChildRecoveryBlock<P extends object>({children,...props}:Props<P>){
 return <ERPChildDialogForm {...props} closeDisabled submitDisabled onSubmit={()=>{}}>
  <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">{partyRecoveryMessage}</p>{children}
 </ERPChildDialogForm>;
}
/** Discover before mounting F04. Invalid namespaces never initialize a guessed key. */
export function PartyChildSaveDialog<P extends object>(props:Props<P>){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const [admission]=useState(()=>resolvePartyRevisionOpening({store,ownerId:owner?.id,family:'party-child',formId:props.formId,id:props.record?.id??null,revision:props.record?.workspace_revision}));
 const fallback=<ChildRecoveryBlock {...props}/>;
 if(!admission.ok)return fallback;
 return <ChildRecoveryBoundary fallback={fallback}><ChildReady {...props} opening={admission.opening}/></ChildRecoveryBoundary>;
}
function ChildReady<P extends object>({opening,formId,record,createAction,updateAction,onSubmit,children,...props}:Props<P>&{opening:PartyRevisionOpening}){
 const save=usePartyChildSave(formId,record,{createAction,updateAction},opening);
 const [presentation,setPresentation]=useState(()=>({uncertain:!!opening.initial.pending,blocked:false,confirmed:false}));
 const submit=async()=>{
  if(!save.isCurrent()||save.status().blocked)return;
  let confirmed=false;
  const interrupted={};
  try{
   await onSubmit(async payload=>{
    const owns=save.captureLease();
    const result=await save(payload);
    if(result.success)confirmed=true;
    const state=save.status();
    if(owns()){
     setPresentation({uncertain:state.terminal===null&&(result.uncertain===true||state.pending),blocked:state.blocked,confirmed:state.terminal==='confirmed'});
    }
    // Delegates branch immediately on this result. Abort a stale or blocked
    // continuation while preserving the hook's authoritative receipt.
    if(!owns()||state.blocked)throw interrupted;
    return result;
   });
  }catch(error){
   if(error===interrupted)return;
   if(!confirmed)throw error;
   save.stopConfirmed();
   if(save.isCurrent())setPresentation({uncertain:false,blocked:true,confirmed:true});
  }
 };
 const blocked=presentation.blocked||save.status().blocked;
 const message=presentation.confirmed?'The save was confirmed, but local recovery or display could not finish. Reconcile the saved record before another change.':
  blocked?partyRecoveryMessage:unknownMessage;
 // A delegate without finally may retain its busy flag after interruption.
 // Once this wrapper has stopped, keep its recovery explanation accessible.
 return <ERPChildDialogForm {...props} isSubmitting={blocked?false:props.isSubmitting} closeDisabled={presentation.uncertain||blocked} submitDisabled={props.submitDisabled||blocked} onSubmit={submit}>
  {(presentation.uncertain||blocked)&&<p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">{message}</p>}
  {children}
 </ERPChildDialogForm>;
}

/** The admitted original key remains owned by F04. This local wrapper witnesses
 * its complete revision namespace and contains local recovery failures. */
export function usePartyChildSave<P extends object>(formId:string,record:RecordIdentity|null|undefined,actions:Actions<P>,admitted?:PartyRevisionOpening){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const recordId=record?.id??null;
 const [opening]=useState(()=>{
  const resolved=admitted?{ok:true as const,opening:admitted}:resolvePartyRevisionOpening({store,ownerId:owner?.id,family:'party-child',formId,id:recordId,revision:record?.workspace_revision});
  if(!resolved.ok)throw Error(partyRecoveryMessage);
  assertPartyRevisionSnapshot(resolved.opening,resolved.opening.snapshot);
  return resolved.opening;
 });
 const session=useWorkspaceSaveSession(opening.formKey,opening.id,opening.initial.revision===null?undefined:Number(opening.initial.revision));
 const [admission]=useState(createSaveAdmission);
 const [local]=useState(()=>{
  let state=opening.initial;
  let expected=withPartyRevisionWrite(opening,opening.snapshot,JSON.stringify(state));
  // F04 may normalize only its selected entry; initialization must not silently
  // consume competing/replaced namespace bytes, including on StrictMode mounts.
  assertPartyRevisionSnapshot(opening,expected);
  if(session.recoveryError||session.id!==opening.id)throw Error(partyRecoveryMessage);
  let stopped=false,terminal:'confirmed'|'rejected'|null=null;
  const capture=(next:typeof state)=>{
   const written=withPartyRevisionWrite(opening,expected,JSON.stringify(next));
   assertPartyRevisionSnapshot(opening,written);expected=written;state=next;
  };
  return {
   get pending(){return !!state.pending;},
   get stopped(){return stopped;},
   get terminal(){return terminal;},
   matches(payload:unknown){return state.pending?.fingerprint===JSON.stringify(payload);},
   stop(outcome:'confirmed'|'rejected'|null=null){stopped=true;if(outcome)terminal=outcome;},
   witness(){if(stopped)throw Error(partyRecoveryMessage);assertPartyRevisionSnapshot(opening,expected);},
   begun(payload:unknown,contract:WorkspaceSaveContract){capture({...state,pending:{fingerprint:JSON.stringify(payload),contract}});},
   accepted(receipt:PartySaveReceipt){capture({id:receipt.id,revision:receipt.revision});},
   rejected(){const settled={...state};delete settled.pending;capture(settled);},
  };
 });
 const activation=useRef<{active:boolean}|null>(null),retired=useRef(false),flight=useRef<object|null>(null);
 useLayoutEffect(()=>{
  if(formId!==opening.formId||recordId!==opening.id||store!==opening.store||owner?.id!==opening.ownerId)retired.current=true;
  const lease={active:!retired.current};activation.current=lease;
  return ()=>{lease.active=false;if(activation.current===lease){flight.current=null;admission.leave();}};
 },[formId,recordId,store,owner?.id,opening,admission]);
 const current=()=>!!activation.current?.active&&!retired.current;
 const status=()=>({pending:local.pending,blocked:local.stopped||retired.current||formId!==opening.formId||recordId!==opening.id||store!==opening.store||owner?.id!==opening.ownerId,terminal:local.terminal});
 const blocked=():ActionResult<PartySaveReceipt>=>({success:false,uncertain:local.terminal===null,error:
  local.terminal==='confirmed'?'The save was confirmed, but local recovery could not finish. Reconcile the saved record before another change.':
  local.terminal==='rejected'?'The request was rejected, but local recovery could not finish. Reopen the record before another change.':partyRecoveryMessage});
 const save=async (payload:P):Promise<ActionResult<PartySaveReceipt>>=>{
  const lease=activation.current;
  const live=()=>current()&&lease===activation.current&&!!lease?.active;
  // StrictMode's fresh setup owns a new activation. A disposed setup's response
  // must not stop or acknowledge that newer activation's retained request.
  const stop=(outcome:'confirmed'|'rejected'|null=null)=>{if(activation.current===lease||retired.current)local.stop(outcome);};
  if(!live()||local.stopped)return blocked();
  try{local.witness();}catch{local.stop();return blocked();}
  if(!admission.enter())return {success:false,error:'A save is already in progress. Please wait for its result.'};
  const dispatch={};flight.current=dispatch;
  const recovering=local.pending;
  let dispatched=false;
  try{
   const id=opening.id;
   const submitted:P=JSON.parse(JSON.stringify(payload));
   const exactRetry=local.matches(submitted);
   let contract:WorkspaceSaveContract;
   try{contract={...session.begin(submitted)};}
   catch{
    try{local.witness();if(!recovering||exactRetry)local.stop();}catch{local.stop();}
    return local.stopped?blocked():{success:false,uncertain:true,error:unknownMessage};
   }
   try{local.begun(submitted,contract);}catch{local.stop();return blocked();}
   if(!live()){local.stop();return blocked();}
   dispatched=true;
   const result=id===null?await actions.createAction(submitted,contract):await actions.updateAction({...submitted,id},contract);
   if(!result.success){
    if(result.uncertain||recovering){
     try{if(!live())throw Error(partyRecoveryMessage);local.witness();}catch{stop();}
     return {success:false,uncertain:true,error:unknownMessage};
    }
    try{if(!live())throw Error(partyRecoveryMessage);local.witness();session.rejected();local.rejected();}
    catch{stop('rejected');}
    return {success:false,error:result.error,uncertain:false};
   }
   const receipt=partySaveReceipt.safeParse(id===null?{id:result.data?.id,revision:result.data?.revision,replayed:result.data?.replayed,changed:true}:result.data);
   if(!receipt.success||(id!==null&&receipt.data.id!==id)){
    try{if(!live())throw Error(partyRecoveryMessage);local.witness();}catch{stop();}
    return {success:false,uncertain:true,error:'Save response incomplete. Keep the same values and retry.'};
   }
   try{
    if(!live())throw Error(partyRecoveryMessage);local.witness();
    // Add remains an independent new row; only edits adopt receipt revision.
    if(id===null){session.rejected();local.rejected();}
    else{session.accept(receipt.data);local.accepted(receipt.data);}
   }catch{stop('confirmed');}
   return {success:true,data:receipt.data};
  }catch{
   try{if(!live())throw Error(partyRecoveryMessage);local.witness();}catch{stop();}
   return {success:false,uncertain:dispatched||recovering,error:dispatched||recovering?unknownMessage:partyRecoveryMessage};
  }finally{if(flight.current===dispatch){flight.current=null;admission.leave();}}
 };
 save.status=status;
 save.isCurrent=current;
 save.captureLease=()=>{const lease=activation.current;return ()=>current()&&lease===activation.current&&!!lease?.active;};
 save.stopConfirmed=()=>local.stop('confirmed');
 return save;
}
