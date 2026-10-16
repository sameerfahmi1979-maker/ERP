'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {z} from 'zod';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {uploadCreationContractSchema,uploadCreationInputSchema,uploadCreationPreparationSchema,uploadCreationReceiptSchema,
 type UploadCreationInput,type UploadCreationResult} from '@/lib/dms/numbered-upload-create';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

const draftSchema=z.object({title:z.string(),documentTypeId:z.number().int().positive().nullable(),description:z.string(),issueDate:z.string(),expiryDate:z.string()}).strict();
export type UploadCreationDraft=z.infer<typeof draftSchema>;
const blank:UploadCreationDraft={title:'',documentTypeId:null,description:'',issueDate:'',expiryDate:''};
const envelopeSchema=z.object({owner:z.string(),context:z.string(),upload:z.number().int().positive(),draft:draftSchema,
 pending:z.object({input:uploadCreationInputSchema,contract:uploadCreationContractSchema}).strict().nullable(),
 receipt:uploadCreationReceiptSchema.nullable(),effectsAttempted:z.boolean(),
}).strict();
type Envelope=z.infer<typeof envelopeSchema>;
type Dispatch=(input:UploadCreationInput,contract:WorkspaceSaveContract)=>Promise<UploadCreationResult>;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const corrupt='The retained upload request could not be verified. Check the upload and document list before starting another creation.';
const lost:UploadCreationResult={success:false,uncertain:true,error:'Creation is unconfirmed. Retry the original retained request; do not upload or create it again.'};

/** F04 account/tab-owned memory only. Provider replacement on principal change
 * destroys this store. No file bytes, signed URLs, Auth/session IDs or credentials
 * are retained. Close/unmount does not silently mint a second creation request. */
export function useUploadCreationSession(upload:number,context:string){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const ownerId=owner?.id??null;
 const key=`draft:tab:${ownerId}:f06-upload-create:${upload}:${context}`;
 const [scope]=useState(()=>({store,ownerId,key}));
 const live=useRef({store,ownerId,key,mounted:false}),flight=useRef(false);
 const [,refresh]=useState(0);
 useLayoutEffect(()=>{live.current={store,ownerId,key,mounted:true};return()=>{live.current.mounted=false;};},[store,ownerId,key]);
 const isCurrent=()=>live.current.mounted&&live.current.store===scope.store&&live.current.ownerId===scope.ownerId&&live.current.key===scope.key;
 const [session]=useState(()=>{
  let state:Envelope={owner:ownerId??'',context,upload,draft:blank,pending:null,receipt:null,effectsAttempted:false};
  let blocked=!store||!ownerId;
  try{
   const raw=store?.getDraft(key)?.request;
   if(raw!==undefined){const candidate=envelopeSchema.parse(JSON.parse(raw));
    if(candidate.owner!==ownerId||candidate.context!==context||candidate.upload!==upload||
     (candidate.pending&&candidate.pending.input.uploadSessionId!==upload)||
     (candidate.pending&&candidate.receipt)||
     (candidate.receipt&&candidate.receipt.upload_session_id!==upload)||
     (candidate.effectsAttempted&&!candidate.receipt))throw Error(corrupt);
    if(candidate.pending){const submitted=candidate.pending.input;
     if(candidate.draft.title.trim()!==submitted.title||candidate.draft.documentTypeId!==submitted.document_type_id||
      (candidate.draft.description||undefined)!==submitted.description||(candidate.draft.issueDate||undefined)!==submitted.issue_date||
      (candidate.draft.expiryDate||undefined)!==submitted.expiry_date)throw Error(corrupt);
    }
    state=candidate;
   }
  }catch{blocked=true;}
  return {get state(){return state;},get blocked(){return blocked;},update(patch:Partial<Envelope>){state={...state,...patch};},block(){blocked=true;}};
 });
 const persist=()=>{
  if(!isCurrent()||!store||session.blocked)throw Error(corrupt);
  store.setDraft(key,{request:JSON.stringify(session.state)});refresh(value=>value+1);
 };
 return {
  draft:session.state.draft,pending:session.state.pending,receipt:session.state.receipt,
  recoveryError:session.blocked?corrupt:null,isCurrent,
  edit(next:UploadCreationDraft){if(!isCurrent()||session.blocked||session.state.pending||session.state.receipt)return;session.update({draft:draftSchema.parse(next)});persist();},
  discard(){if(!isCurrent()||session.state.pending)return;store?.clearDraft(key);},
  claimEffects(){if(!isCurrent()||!session.state.receipt||session.state.effectsAttempted)return false;session.update({effectsAttempted:true});persist();return true;},
  async run(input:UploadCreationInput,dispatch:Dispatch):Promise<UploadCreationResult>{
   if(!isCurrent()||session.blocked)return {success:false,error:corrupt};
   if(flight.current)return {success:false,error:'A creation request is already in progress.'};
   if(session.state.receipt)return {success:true,data:session.state.receipt};
   const recovering=!!session.state.pending;
   flight.current=true;
   let dispatched=false;
   try{
    if(!session.state.pending){
     const parsed=uploadCreationInputSchema.parse(input);
     if(parsed.uploadSessionId!==upload||parsed.prepared)throw Error(corrupt);
     session.update({pending:{input:clone(parsed),contract:{operationId:crypto.randomUUID(),revision:null}}});persist();
    }
    let pending=session.state.pending!;
    dispatched=true;
    let result=await dispatch(clone(pending.input),clone(pending.contract));
    if(!isCurrent())return lost;
    if(!pending.input.prepared&&!result.success&&result.prepared){
     const prepared=uploadCreationPreparationSchema.parse(result.prepared);
     if(prepared.operation_id!==pending.contract.operationId||prepared.snapshot.source.id!==upload||
      prepared.snapshot.type.id!==pending.input.document_type_id)throw Error(corrupt);
     pending={...pending,input:uploadCreationInputSchema.parse({...pending.input,prepared:prepared.snapshot})};
     session.update({pending:clone(pending)});persist(); // Exact bytes identity before allocation.
     result=await dispatch(clone(pending.input),clone(pending.contract));
     if(!isCurrent())return lost;
    }
    if(result.success){
     const receipt=uploadCreationReceiptSchema.parse(result.data);
     if(!pending.input.prepared||receipt.operation_id!==pending.contract.operationId||receipt.upload_session_id!==upload)throw Error(corrupt);
     session.update({receipt,pending:null});
     // A local memory-store failure cannot undo a confirmed database receipt.
     // Any old persisted request remains an exact, safe replay on remount.
     try{persist();}catch{session.block();}
     return {success:true,data:receipt};
    }
    if(result.prepared)return lost;
    if(!result.uncertain&&!recovering){session.update({pending:null});persist();}
    if(recovering&&!result.uncertain)return {...result,uncertain:true,error:(result.error??'Request rejected.')+' The prior creation remains unconfirmed; retain this original request.'};
    return result;
   }catch{return dispatched?lost:{success:false,error:corrupt};}
   finally{flight.current=false;if(isCurrent())refresh(value=>value+1);}
  },
 };
}
