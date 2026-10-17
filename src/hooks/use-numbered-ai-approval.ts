"use client";

import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {aiApprovalContractSchema,aiApprovalInputSchema,aiApprovalPreparationSchema,aiApprovalPreparationRejectionSchema,aiApprovalReceiptSchema,type AiApprovalInput,type AiApprovalReceipt,type AiApprovalResult} from '@/lib/dms/numbered-ai-approval';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

type Attempt={input:AiApprovalInput;contract:WorkspaceSaveContract;receipt?:AiApprovalReceipt;preparationEditable?:true};
type Dispatch=(input:AiApprovalInput,contract:WorkspaceSaveContract)=>Promise<AiApprovalResult>;
const lost:AiApprovalResult={success:false,uncertain:true,error:'Approval is unconfirmed. Retry the retained request; do not upload the file again.'};
const changed:AiApprovalResult={success:false,uncertain:true,error:'The intake owner changed. Reopen the original intake to recover its retained request.'};
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;

/** Single-file approval only, memory-only request recovery. No file bytes or storage credentials.
 * The shell replaces the draft provider on principal change; tab closure clears
 * its prefix. Each context/session retains a single operation. Only an explicit
 * first read-only rejection permits input correction, never identity reset. */
export function useNumberedAiApproval(contextKey:string,dispatch:Dispatch){
 const store=useWorkspaceDraftStoreContext();
 const owner=useWorkspaceFormOwner();
 const ownerId=owner?.id??null;
 const key=`draft:tab:${ownerId}:f06-ai-approvals:${contextKey}`;
 const epoch=useMemo(()=>({store,key,ownerId}),[store,key,ownerId]);
 const [,refresh]=useState(0);
 const live=useRef({epoch,mounted:false});
 const flight=useRef(false);
 const committed=useRef<{epoch:typeof epoch;receipt:AiApprovalReceipt}|null>(null);
 useLayoutEffect(()=>{
  live.current={epoch,mounted:true};
  return()=>{live.current.mounted=false;};
 },[epoch]);
 const isCurrent=useCallback(()=>live.current.mounted&&live.current.epoch===epoch,[epoch]);
 const read=useCallback(():Record<string,Attempt>=>{
  const raw=store?.getDraft(key)?.attempts;
  if(!raw)return {};
  // Corrupt retention must block, never silently mint a replacement operation.
  const parsed=JSON.parse(raw) as Record<string,Attempt>;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid retained requests');
  for(const [id,value] of Object.entries(parsed)){
   if(id!==contextKey||!aiApprovalInputSchema.safeParse(value.input).success||!aiApprovalContractSchema.safeParse(value.contract).success||String(value.input.uploadSessionId)!==id)throw Error('Invalid retained request');
    if(value.receipt&&(!aiApprovalReceiptSchema.safeParse(value.receipt).success||value.receipt.operation_id!==value.contract.operationId||value.receipt.upload_session_id!==value.input.uploadSessionId))throw Error('Invalid retained receipt');
    if(value.preparationEditable!==undefined&&(value.preparationEditable!==true||value.input.prepared||value.receipt))throw Error('Invalid preparation recovery');
  }
  return parsed;
 },[store,key,contextKey]);
 const save=useCallback((attempts:Record<string,Attempt>)=>{
  if(!isCurrent()||!store)throw Error('Owner changed');
  store.setDraft(key,{attempts:JSON.stringify(attempts)});refresh(value=>value+1);
 },[isCurrent,key,store]);
 const run=useCallback(async(input:unknown):Promise<AiApprovalResult>=>{
  if(!isCurrent()||!store||!ownerId)return changed;
  if(committed.current?.epoch===epoch)return {success:true,data:committed.current.receipt};
  if(flight.current)return {success:false,error:'An approval request is already running.'};
  flight.current=true;
  try{
   const attempts=read();const id=contextKey;
   let attempt=attempts[id];
   // An older/in-flight/uncertain attempt is locked by default. A later safe
   // rejection cannot erase that uncertainty or replace its original payload.
   const mayEditPreparation=!attempt||attempt.preparationEditable===true;
   if(mayEditPreparation){
    const valid=aiApprovalInputSchema.safeParse(input);
    if(!valid.success||String(valid.data.uploadSessionId)!==contextKey)return {success:false,error:'Invalid approval request.'};
    // Callers cannot inject a prepared snapshot. Only our verified prepare reply
    // is retained before any atomic creation dispatch.
    if(valid.data.prepared)return {success:false,error:'No retained preparation exists.'};
    attempt={input:valid.data,contract:attempt?.contract??{operationId:crypto.randomUUID(),revision:null}};
    // Clear editable status BEFORE dispatch, so transport loss or interruption
    // keeps this exact corrected payload and operation locked across remount.
    attempts[id]=clone(attempt);save(attempts);
   }
   if(attempt.receipt)return {success:true,data:attempt.receipt};
   let result=await dispatch(clone(attempt.input),clone(attempt.contract));
   if(!isCurrent())return changed;
   if(!attempt.input.prepared&&!result.success&&result.prepared){
    const preparation=aiApprovalPreparationSchema.safeParse(result.prepared);
    if(!preparation.success||preparation.data.operation_id!==attempt.contract.operationId||preparation.data.snapshot.source.id!==attempt.input.uploadSessionId)return lost;
    attempt={...attempt,input:{...attempt.input,prepared:preparation.data.snapshot}};
    attempts[id]=clone(attempt);save(attempts); // Durably in owner memory BEFORE send.
    result=await dispatch(clone(attempt.input),clone(attempt.contract));
    if(!isCurrent())return changed;
   }
   if(result.success){
    const receipt=aiApprovalReceiptSchema.safeParse(result.data);
    if(!attempt.input.prepared||!receipt.success||receipt.data.operation_id!==attempt.contract.operationId||receipt.data.upload_session_id!==attempt.input.uploadSessionId)return lost;
    committed.current={epoch,receipt:receipt.data};
    attempts[id]={...attempt,receipt:receipt.data};
    try{save(attempts);}catch{/* A verified commit must not become a failed save. */}
    return {success:true,data:receipt.data};
   }
   if(mayEditPreparation&&!attempt.input.prepared&&!result.uncertain&&!result.prepared&&!result.retained){
    const rejected=aiApprovalPreparationRejectionSchema.safeParse(result.preparationRejected);
    if(rejected.success&&rejected.data.operation_id===attempt.contract.operationId&&rejected.data.upload_session_id===attempt.input.uploadSessionId){
     attempts[id]={...attempt,preparationEditable:true};save(attempts);
    }
   }
   // Other rejections keep the exact payload. No hidden reset after a prior
   // uncertain send, successful preparation, reservation or malformed reply.
   return result.prepared?lost:result;
  }catch{return lost;}finally{flight.current=false;}
 },[contextKey,dispatch,epoch,isCurrent,ownerId,read,save,store]);
 let pendingSessionIds:number[]=[];
 let retentionError=false;
 try{pendingSessionIds=Object.values(read()).filter(value=>!value.receipt&&!value.preparationEditable).map(value=>value.input.uploadSessionId);}catch{retentionError=true;}
 return {run,isCurrent,pendingSessionIds,retentionError};
}
