'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {documentEmployeeContractSchema,documentEmployeeInputSchema,documentEmployeeReceiptSchema,type DocumentEmployeeInput,type DocumentEmployeeContract,type DocumentEmployeeReceipt} from '@/lib/hr/numbered-document-employee-contract';
import {createEmployeeFromDmsDocuments} from '@/server/actions/hr/document-to-employee';

const pendingSchema=z.object({payload:documentEmployeeInputSchema,contract:documentEmployeeContractSchema}).strict();
const stateSchema=z.object({pending:pendingSchema.nullable(),receipt:documentEmployeeReceiptSchema.nullable()}).strict();
const blockedMessage='This retained request could not be verified. Check its saved result before starting another request.';

/** F04 account/tab-owned memory only. An uncertain request survives denial,
 * close, and remount; a new operation is never invented to recover it. */
export function useDocumentEmployeeSession(actorId:number|undefined){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner(),ownerId=owner?.id;
 const [scope]=useState(()=>({store,ownerId,actorId}));
 const mounted=useRef(false),live=useRef(scope),flight=useRef(false);
 useLayoutEffect(()=>{mounted.current=true;live.current={store,ownerId,actorId};return()=>{mounted.current=false;};},[store,ownerId,actorId]);
 const isCurrent=()=>mounted.current&&live.current.store===scope.store&&live.current.ownerId===scope.ownerId&&live.current.actorId===scope.actorId;
 const [,redraw]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
 const [session]=useState(()=>{
  const key=ownerId&&actorId?`draft:tab:${ownerId}:document-employee:${actorId}`:null;
  let state:z.infer<typeof stateSchema>={pending:null,receipt:null},blocked=!store||!key;
  try{const saved=key?store?.getViewState(key):undefined;if(saved!==undefined)state=stateSchema.parse(JSON.parse(saved));if(state.pending&&state.receipt)throw Error(blockedMessage);}catch{blocked=true;}
  const persist=()=>{try{if(!key||!store||blocked)throw Error(blockedMessage);store.setViewState(key,JSON.stringify(state));}catch(error){blocked=true;throw error;}};
  return {get state(){return state;},get blocked(){return blocked;},
   prepare(payload:DocumentEmployeeInput,reviewedSources:DocumentEmployeeContract['reviewedSources']){
    if(blocked)throw Error(blockedMessage);
    if(state.pending){const saved=key?store?.getViewState(key):undefined;if(saved===undefined||JSON.stringify(stateSchema.parse(JSON.parse(saved)).pending)!==JSON.stringify(state.pending)){blocked=true;throw Error(blockedMessage);}}
    if(!state.pending){state.pending=pendingSchema.parse({payload,contract:{operationId:crypto.randomUUID(),reviewedSources}});persist();}
    return structuredClone(state.pending);
   },
   accept(receipt:DocumentEmployeeReceipt,operation:string){
    try{
     if(!state.pending||state.pending.contract.operationId!==operation||receipt.operationId!==operation)throw Error('Receipt mismatch');
     const saved=key?store?.getViewState(key):undefined;
     if(saved===undefined||JSON.stringify(stateSchema.parse(JSON.parse(saved)).pending)!==JSON.stringify(state.pending))throw Error('Retained request changed before acknowledgement');
     state={pending:null,receipt};persist();
    }catch(error){blocked=true;throw error;}
   },
   reject(){state.pending=null;persist();},
   newRequest(){if(state.pending||blocked)return false;try{state={pending:null,receipt:null};persist();return true;}catch{blocked=true;return false;}},
  };
 });
 async function submit(payload:DocumentEmployeeInput,reviewedSources:DocumentEmployeeContract['reviewedSources']):Promise<DocumentEmployeeReceipt|null>{
  if(flight.current||!isCurrent()||session.blocked)return null;
  if(session.state.receipt)return session.state.receipt;
  const recovering=session.state.pending!==null;let dispatched=false;
  flight.current=true;setSaving(true);setError(null);
  try{
   const pending=session.prepare(payload,reviewedSources);redraw(value=>value+1);dispatched=true;
   const result=await createEmployeeFromDmsDocuments(pending.payload,pending.contract);
   if(!isCurrent())return null;
   if(!result.success){if(!recovering&&!result.uncertain)session.reject();setError(recovering||result.uncertain?'The original request is still unconfirmed. Retry it unchanged when access is available.':result.error??'The request was rejected. Review its values.');return null;}
   const receipt=documentEmployeeReceiptSchema.parse(result.data);
   if(receipt.operationId!==pending.contract.operationId||JSON.stringify([...receipt.sourceDocumentIds].sort((a,b)=>a-b))!==JSON.stringify([...pending.payload.selectedDocumentIds].sort((a,b)=>a-b)))throw Error('Receipt identity mismatch');
   try{session.accept(receipt,pending.contract.operationId);}catch{setError('Saved. Local confirmation could not finish. Check the saved result before creating another employee.');}
   return receipt;
  }catch{if(isCurrent())setError(dispatched||recovering?'Save unconfirmed. Retry the retained original request.':blockedMessage);return null;}
  finally{flight.current=false;if(isCurrent()){setSaving(false);redraw(value=>value+1);}}
 }
 return {submit,isCurrent,saving,pending:session.state.pending,receipt:session.state.receipt,blocked:session.blocked,error:error??(session.blocked?blockedMessage:null),
  startNew(){if(!isCurrent()||flight.current)return false;const ready=session.newRequest();if(ready){setError(null);redraw(value=>value+1);}return ready;}};
}
