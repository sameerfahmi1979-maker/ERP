'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {dmsCreationContractSchema,dmsCreationReceiptSchema,dmsDocumentCreateSchema,type DmsCreationReceipt} from '@/lib/dms/numbered-document-create';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {CreateDmsDocumentInput,ActionResult} from '@/server/actions/dms/documents';

const pendingSchema=z.object({payload:dmsDocumentCreateSchema.strict(),contract:dmsCreationContractSchema}).strict();
const stateSchema=z.object({pending:pendingSchema.nullable(),receipt:dmsCreationReceiptSchema.nullable()}).strict();
const recoveryError='The saved creation request could not be verified. Check the document list before reopening this form.';

/** DMS adapter over the existing F04 account/tab-owned memory store, not durable
 * browser storage. Payload and operation are one envelope, including on remount. */
export function useDmsCreationSession(ownerId:string|undefined,actorId:number|undefined){
 const store=useWorkspaceDraftStoreContext();
 const [scope]=useState(()=>({ownerId,actorId,store}));
 const live=useRef(scope),mounted=useRef(false),flight=useRef(false);
 useLayoutEffect(()=>{mounted.current=true;live.current={ownerId,actorId,store};return()=>{mounted.current=false;};},[ownerId,actorId,store]);
 const isCurrent=()=>mounted.current&&live.current.ownerId===scope.ownerId&&live.current.actorId===scope.actorId&&live.current.store===scope.store;
 const [,redraw]=useState(0);
 const [session]=useState(()=>{
  const key=ownerId?`draft:tab:${ownerId}:dms-doc-workspace-form:dms-create:${actorId??'unknown'}`:null;
  let state:z.infer<typeof stateSchema>={pending:null,receipt:null};
  let blocked=false;
  try{const saved=key?store?.getViewState(key):undefined;if(saved!==undefined)state=stateSchema.parse(JSON.parse(saved));if(state.pending&&state.receipt)throw new Error(recoveryError);}
  catch{blocked=true;}
  const persist=()=>{if(key&&!blocked)store?.setViewState(key,JSON.stringify(state));};
  return {
   get pending(){return state.pending;},get receipt(){return state.receipt;},get blocked(){return blocked;},
   begin(payload:CreateDmsDocumentInput){
    if(blocked)throw new Error(recoveryError);
    state.pending??={payload:dmsDocumentCreateSchema.strict().parse(JSON.parse(JSON.stringify(payload))),contract:{operationId:crypto.randomUUID(),revision:null}};
    persist();return state.pending;
   },
   accept(data:unknown){
    const receipt=dmsCreationReceiptSchema.parse(data);
    if(!state.pending||receipt.operation_id!==state.pending.contract.operationId)throw new Error('Creation receipt does not match.');
    state={pending:null,receipt};persist();return receipt;
   },
   reject(){state.pending=null;persist();},
  };
 });
 return {
  pending:session.pending,receipt:session.receipt,uncertain:session.pending!==null,recoveryError:session.blocked?recoveryError:null,isCurrent,
  async create(payload:CreateDmsDocumentInput,action:(payload:CreateDmsDocumentInput,contract:WorkspaceSaveContract)=>Promise<ActionResult<DmsCreationReceipt>>):Promise<ActionResult<DmsCreationReceipt>>{
   if(!isCurrent())return {success:false,error:'The workspace owner changed. Reopen this document form.'};
   if(session.blocked)return {success:false,error:recoveryError};
   if(flight.current)return {success:false,error:'A save is already in progress.'};
   if(session.receipt)return {success:true,data:session.receipt};
   flight.current=true;
   const recovering=session.pending!==null;
   let dispatched=false;
   try{
    const pending=session.begin(payload);redraw(value=>value+1);dispatched=true;
    // Clone the frozen logical request at transport admission; neither the UI nor
    // a test/transport consumer can mutate the persisted original request.
    const result=await action(JSON.parse(JSON.stringify(pending.payload)),{...pending.contract});
    if(!isCurrent())return {success:false,uncertain:true,error:'The workspace changed while saving. Reopen the original form to recover its result.'};
    if(result.success)return {success:true,data:session.accept(result.data)};
    if(!result.uncertain&&!recovering)session.reject();
    // A rejected retry says nothing about a prior response-lost commit (for
    // example, authority was removed meanwhile). Never mint a replacement ID.
    if(recovering&&!result.uncertain)return {success:false,uncertain:true,error:result.error+' The original creation is still unconfirmed; retain this request and check its result before creating another document.'};
    return result;
   }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Save again to retry the original submitted values.':recoveryError};}
   finally{flight.current=false;if(isCurrent())redraw(value=>value+1);}
  },
 };
}
