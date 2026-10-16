'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {candidateConversionContractSchema,candidateConversionInputSchema,candidateConversionReceiptSchema,requisitionCreationContractSchema,requisitionCreationSchema,requisitionCreationReceiptSchema,recruitmentId,type CandidateConversionInput,type CandidateConversionReceipt,type RequisitionCreationInput,type RequisitionCreationReceipt,type RecruitmentMutationResult} from '@/lib/hr/numbered-recruitment-contract';
import {createJobRequisition,convertCandidateToEmployee} from '@/server/actions/hr/recruitment';

const requestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('requisition'),candidateId:z.null(),payload:requisitionCreationSchema,contract:requisitionCreationContractSchema}).strict(),
 z.object({kind:z.literal('conversion'),candidateId:recruitmentId,payload:candidateConversionInputSchema,contract:candidateConversionContractSchema}).strict(),
]);
const receiptSchema=z.union([requisitionCreationReceiptSchema,candidateConversionReceiptSchema]);
const stateSchema=z.object({pending:requestSchema.nullable(),receipt:receiptSchema.nullable()}).strict();
type Receipt=RequisitionCreationReceipt|CandidateConversionReceipt;
const blockedMessage='The retained recruitment request could not be verified. Check its saved result before reopening this form.';

/** Existing F04 account/tab-owned memory only; no local/session storage and no
 * new operation after response loss, including loss followed by later denial. */
export function useNumberedRecruitmentSession(kind:'requisition'|'conversion',actorId:number|undefined,candidateId:number|null=null){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const ownerId=owner?.id;
 const [scope]=useState(()=>({store,ownerId,actorId,kind,candidateId}));
 const live=useRef(scope),mounted=useRef(false),flight=useRef(false);
 useLayoutEffect(()=>{mounted.current=true;live.current={store,ownerId,actorId,kind,candidateId};return()=>{mounted.current=false;};},[store,ownerId,actorId,kind,candidateId]);
 const isCurrent=()=>mounted.current&&live.current.store===scope.store&&live.current.ownerId===scope.ownerId&&live.current.actorId===scope.actorId&&live.current.kind===scope.kind&&live.current.candidateId===scope.candidateId;
 const [,redraw]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
 const [session]=useState(()=>{
  const key=ownerId?`draft:tab:${ownerId}:numbered-recruitment:${kind}:${candidateId??'new'}:${actorId??'unknown'}`:null;
  let state:z.infer<typeof stateSchema>={pending:null,receipt:null},blocked=false;
  try{
   const saved=key?store?.getViewState(key):undefined;if(saved!==undefined)state=stateSchema.parse(JSON.parse(saved));
   if(state.pending&&(state.receipt||state.pending.kind!==kind||state.pending.candidateId!==candidateId))throw Error(blockedMessage);
   if(state.receipt&&((kind==='conversion'&&(!('candidate_id' in state.receipt)||state.receipt.candidate_id!==candidateId))||(kind==='requisition'&&!('requisition_code' in state.receipt))))throw Error(blockedMessage);
  }catch{blocked=true;}
  const persist=()=>{if(key&&!blocked)store?.setViewState(key,JSON.stringify(state));};
  return {
   get state(){return state;},get blocked(){return blocked;},
   prepare(payload:RequisitionCreationInput|CandidateConversionInput,revision:string|null){
    if(blocked)throw Error(blockedMessage);
    if(!state.pending){state.pending=requestSchema.parse({kind,candidateId,payload,contract:{operationId:crypto.randomUUID(),revision}});persist();}
    return structuredClone(state.pending);
   },
   accept(receipt:Receipt,operation:string){
    try{
     if(!state.pending||state.pending.contract.operationId!==operation||receipt.operation_id!==operation)throw Error('Receipt mismatch.');
     const saved=key?store?.getViewState(key):undefined;
     if(saved!==undefined&&JSON.stringify(stateSchema.parse(JSON.parse(saved)).pending)!==JSON.stringify(state.pending))throw Error('The retained request changed before acknowledgement.');
     state={pending:null,receipt};persist();
    }catch(error){blocked=true;throw error;}
   },
   reject(){state.pending=null;persist();},
   newRequest(){if(state.pending||blocked)return false;state={pending:null,receipt:null};persist();return true;},
  };
 });
 async function submit(payload:RequisitionCreationInput|CandidateConversionInput,revision:string|null):Promise<Receipt|null>{
  if(flight.current||!isCurrent()||session.blocked)return null;
  if(session.state.receipt)return session.state.receipt;
  const recovering=session.state.pending!==null;let dispatched=false;
  flight.current=true;setSaving(true);setError(null);
  try{
   const pending=session.prepare(payload,revision);redraw(value=>value+1);dispatched=true;
   const result:RecruitmentMutationResult<Receipt>=pending.kind==='requisition'?await createJobRequisition(pending.payload,pending.contract):await convertCandidateToEmployee(pending.candidateId,pending.payload,pending.contract);
   if(!isCurrent())return null;
   if(!result.success){
    if(!recovering&&!result.uncertain)session.reject();
    setError(recovering||result.uncertain?'The original request is still unconfirmed. Retry it unchanged when access is available.':result.error??'The request was rejected. Your values are retained.');return null;
   }
   const receipt=(pending.kind==='requisition'?requisitionCreationReceiptSchema:candidateConversionReceiptSchema).parse(result.data);
   if(receipt.operation_id!==pending.contract.operationId||(pending.kind==='conversion'&&(!('candidate_id' in receipt)||receipt.candidate_id!==pending.candidateId)))throw Error('Receipt mismatch.');
   try{session.accept(receipt,pending.contract.operationId);}catch{setError('Saved. Local confirmation could not finish; check the saved result before starting another request.');}
   return receipt;
  }catch{if(isCurrent())setError(dispatched||recovering?'Save unconfirmed. Retry the retained original request.':blockedMessage);return null;}
  finally{flight.current=false;if(isCurrent()){setSaving(false);redraw(value=>value+1);}}
 }
 return {submit,saving,isCurrent,error:error??(session.blocked?blockedMessage:null),blocked:session.blocked,pending:session.state.pending,receipt:session.state.receipt,
  startNew(){if(!isCurrent()||flight.current)return false;const ready=session.newRequest();if(ready){setError(null);redraw(value=>value+1);}return ready;}};
}
