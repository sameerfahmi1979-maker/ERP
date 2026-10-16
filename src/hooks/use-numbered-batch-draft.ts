"use client";

import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {batchDraftContractSchema,batchDraftInputSchema,batchDraftPreparationSchema,batchDraftReceiptSchema,parseBatchDraftPreparation,type PrepareEnvelope,type BatchDraftInput,type BatchDraftReceipt,type BatchDraftResult} from '@/lib/dms/numbered-batch-draft';
import type {BatchOrigin,BatchReceipt} from '@/lib/dms/batch-admission';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

type Attempt={input:BatchDraftInput;contract:WorkspaceSaveContract;receipt?:BatchDraftReceipt;uncertain?:boolean};
type Dispatch=(input:BatchDraftInput,contract:WorkspaceSaveContract)=>Promise<BatchDraftResult>;
type Governed={preparation:PrepareEnvelope;receipt:BatchReceipt;origin:BatchOrigin;isCurrent:()=>boolean};
const lost:BatchDraftResult={success:false,uncertain:true,error:'Draft save is unconfirmed. Retry the retained request; do not upload the file again.'};
const changed:BatchDraftResult={success:false,uncertain:true,error:'The inbox owner changed. Reopen the original inbox to recover its retained request.'};
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Tab memory contains validated request/receipt DTOs only, never Files or capabilities.
 * Legacy callers keep their two-phase API. Governed callers MUST supply the
 * independently bound durable seal; a missing seal never mints a new operation. */
export function useNumberedBatchDraft(contextKey:string,dispatch:Dispatch){
 const store=useWorkspaceDraftStoreContext();
 const ownerId=useWorkspaceFormOwner()?.id??null;
 const key=`draft:tab:${ownerId}:f06-batch-drafts:${contextKey}`;
 const epoch=useMemo(()=>({store,key,ownerId}),[store,key,ownerId]);
 type Lease={epoch:typeof epoch;retired:boolean;confirmed:Record<string,Attempt>};
 const live=useRef<Lease|null>(null);
 const flight=useRef<object|null>(null);
 const [,refresh]=useState(0);
 useLayoutEffect(()=>{
  const lease:Lease={epoch,retired:false,confirmed:{}};live.current=lease;
  return()=>{lease.retired=true;};
 },[epoch]);
 const isCurrent=useCallback(()=>!!live.current&&!live.current.retired&&live.current.epoch===epoch,[epoch]);
 const read=useCallback(():Record<string,Attempt>=>{
  const raw=store?.getDraft(key)?.attempts;
  if(raw===undefined)return {};
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid retained requests');
  const result:Record<string,Attempt>={};
  for(const [id,value] of Object.entries(parsed)){
   if(!value||typeof value!=='object')throw Error('Invalid retained request');
   const input=batchDraftInputSchema.parse(value.input);
   const contract=batchDraftContractSchema.parse(value.contract);
   if(String(input.uploadSessionId)!==id)throw Error('Invalid retained request');
   const receipt=value.receipt===undefined?undefined:batchDraftReceiptSchema.parse(value.receipt);
   if(receipt&&(receipt.operation_id!==contract.operationId||receipt.upload_session_id!==input.uploadSessionId))throw Error('Invalid retained receipt');
   if(value.uncertain!==undefined&&typeof value.uncertain!=='boolean')throw Error('Invalid uncertainty marker');
   // Project nested DTOs. Workspace's primitive filter cannot sanitize JSON.
   // Old-format pending entries may have survived a lost commit response.
   // Missing marker is not evidence that the original request never ran.
   result[id]={input,contract,uncertain:value.uncertain??!receipt,...(receipt?{receipt}:{})};
  }
  return result;
 },[store,key]);
 const execute=useCallback(async(input:BatchDraftInput,governed?:Governed,retainedGuard?:()=>boolean):Promise<BatchDraftResult>=>{
  const lease=live.current;
  const current=()=>!!lease&&!lease.retired&&live.current===lease&&lease.epoch===epoch&&(!governed||governed.isCurrent())&&(!retainedGuard||retainedGuard());
  if(!current()||!store||!ownerId)return changed;
  if(flight.current)return {success:false,error:'A draft request is already running.'};
  const valid=batchDraftInputSchema.safeParse(input);
  if(!valid.success)return {success:false,error:'Invalid draft request.'};
  const token={};flight.current=token;
  try{
   let witness=store.getDraft(key)?.attempts;
   const attempts=read();const id=String(valid.data.uploadSessionId);
   const save=()=>{
    if(!current()||store.getDraft(key)?.attempts!==witness)throw Error('Retained request changed');
    const next=JSON.stringify(attempts);store.setDraft(key,{attempts:next});
    if(store.getDraft(key)?.attempts!==next)throw Error('Retention failed');
    witness=next;refresh(value=>value+1);
   };
   let attempt=attempts[id]??lease!.confirmed[id];
   if(governed){
    const envelope=parseBatchDraftPreparation(governed.preparation,governed.receipt,governed.origin,governed.preparation.member.position);
    if(!envelope||envelope.member.kind!=='prepared')return lost;
    const proposed:Attempt={input:envelope.member.request,contract:{operationId:envelope.member.draft_operation_id,revision:null},uncertain:false};
    if(attempt&&(!same(attempt.input,proposed.input)||!same(attempt.contract,proposed.contract)))return lost;
    if(!attempt){attempt=clone(proposed);attempts[id]=attempt;save();}
   }
   if(!attempt){
    if(retainedGuard)return lost;
    if(valid.data.prepared)return {success:false,error:'No retained preparation exists.'};
    attempt={input:valid.data,contract:{operationId:crypto.randomUUID(),revision:null},uncertain:false};
    attempts[id]=clone(attempt);save();
   }
   // A local acknowledgement failure must not turn an observed receipt unknown.
   const confirmed=lease!.confirmed[id];
   if(confirmed&&same(confirmed.input,attempt.input)&&same(confirmed.contract,attempt.contract))return {success:true,data:clone(confirmed.receipt!)};
   if(attempt.receipt)return {success:true,data:clone(attempt.receipt)};
   const priorUnknown=attempt.uncertain!==false;
   attempt={...attempt,uncertain:true};attempts[id]=clone(attempt);save();
   // Persist the in-flight uncertainty before crossing the mutation boundary.
   // A remount cannot infer non-dispatch from a missing response.
   if(!current())return changed;
   let result=await dispatch(clone(attempt.input),clone(attempt.contract));
   if(!current())return changed;
   if(!governed&&!attempt.input.prepared&&!result.success&&result.prepared){
    const preparation=batchDraftPreparationSchema.safeParse(result.prepared);
    if(!preparation.success||preparation.data.operation_id!==attempt.contract.operationId||preparation.data.snapshot.upload_session_id!==attempt.input.uploadSessionId)return lost;
    attempt={...attempt,input:{...attempt.input,prepared:preparation.data.snapshot}};
    attempts[id]=clone(attempt);save();
    result=await dispatch(clone(attempt.input),clone(attempt.contract));
    if(!current())return changed;
   }
   if(result.success){
    const receipt=batchDraftReceiptSchema.safeParse(result.data);
    if(!attempt.input.prepared||!receipt.success||receipt.data.operation_id!==attempt.contract.operationId||receipt.data.upload_session_id!==attempt.input.uploadSessionId)return lost;
    const acknowledged={...attempt,uncertain:false,receipt:receipt.data};
    lease!.confirmed[id]=clone(acknowledged);
    attempts[id]=acknowledged;
    try{save();}catch{/* Exact receipt remains confirmed in this activation; replay remains the same pair. */}
    refresh(value=>value+1);
    return {success:true,data:clone(receipt.data)};
   }
   if(result.prepared)return lost;
   const uncertain=priorUnknown||result.uncertain===true;
   attempts[id]={...attempt,uncertain};save();
   return {...result,uncertain};
  }catch{return lost;}finally{if(flight.current===token)flight.current=null;}
 },[dispatch,epoch,key,ownerId,read,store]);
 // A retired flight must not block a fresh activation, nor clear its newer flight.
 useLayoutEffect(()=>{flight.current=null;},[epoch]);
 const run=useCallback((input:BatchDraftInput)=>execute(input),[execute]);
 const continuePrepared=useCallback((governed:Governed)=>execute(governed.preparation.member.request,governed),[execute]);
 const retryRetained=useCallback((uploadSessionId:number,guard:()=>boolean)=>execute({uploadSessionId},undefined,guard),[execute]);
 let pendingSessionIds:number[]=[];let retentionError=false;
 try{pendingSessionIds=Object.values(read()).filter(value=>!value.receipt).map(value=>value.input.uploadSessionId);}catch{retentionError=true;}
 const hasRetained=useCallback((id:number)=>{try{return !!read()[String(id)];}catch{return false;}},[read]);
 return {run,continuePrepared,retryRetained,hasRetained,isCurrent,pendingSessionIds,retentionError};
}
