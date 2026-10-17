"use client";

import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {useNumberedBatchDraft} from '@/hooks/use-numbered-batch-draft';
import {batchAdmissionResultSchema,batchMemberUploadResultSchema,batchOriginSchema,batchReceiptSchema,batchRequestSchema,batchRetainedAttemptSchema,canonicalBatchManifest,dmsFileMetadataSchema,verifyBatchReceipt,type BatchCapability,type BatchOrigin,type BatchReceipt,type BatchRequest,type BatchRetainedAttempt} from '@/lib/dms/batch-admission';
import {batchDraftPreparationResultSchema,batchDraftRecoveryResultSchema,parseBatchDraftPreparation,parseBatchDraftRecovery,type PrepareEnvelope} from '@/lib/dms/numbered-batch-draft';
import {bootstrapDmsBatchOrigin,createDmsUploadBatch,discoverDmsBatchAdmissions,readDmsUploadBatchDraftRecovery,recoverDmsBatchMemberUpload,verifyDmsBatchUpload,prepareDmsUploadBatchMemberDraft,startAiIntakeAndCreateDraft} from '@/server/actions/dms/batch-intake';
import type {SelectedDmsFile} from '@/features/dms/upload/dms-upload-dropzone';

type Item={position:number;name:string;phase:'pending'|'uploading'|'analysis'|'confirmed'|'unconfirmed'|'rejected'|'needs_file'|'processing'|'historical'|'unavailable';message:string};
type Options={enabled:boolean;context?:{entityType:string;entityId:number}|null;
 upload:(capability:BatchCapability,body:Blob,mime:string)=>Promise<boolean>;
 onResult:(confirmed:number,total:number,batchCode:string)=>void};
type View={origin:BatchOrigin|null;attempt:BatchRetainedAttempt|null;files:SelectedDmsFile[];items:Item[];recent:BatchReceipt[];busy:boolean;blocked:boolean;error:string|null;failureId:number};
const empty=():View=>({origin:null,attempt:null,files:[],items:[],recent:[],busy:false,blocked:false,error:null,failureId:0});
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const sameReceipt=(a:BatchReceipt|undefined,b:BatchReceipt)=>!!a&&JSON.stringify(a)===JSON.stringify(b);
const unavailable='Batch recovery is unavailable. Keep the original request and try the read-only recovery again.';
const unconfirmed='The outcome is unconfirmed. The original request is retained; do not start a replacement batch.';

/** Client orchestration only. The server remains authoritative at every step.
 * Store only strict admission DTOs; Files and capabilities never enter F04 JSON. */
export function useDmsBatchAdmission({enabled,context,upload,onResult}:Options){
 const store=useWorkspaceDraftStoreContext();
 const ownerId=useWorkspaceFormOwner()?.id??null;
 const readOwner=useReadCacheOwner();
 const ownerLive=!!readOwner?.isLive()&&readOwner.admits(readOwner.identity);
 const contextKey=`${context?.entityType??'inbox'}:${context?.entityId??'all'}`;
 const contextValue=context?{type:context.entityType,id:context.entityId}:null;
 const validContext=!context||(['party','employee','employee_dependent','company','branch','site'].includes(context.entityType)&&Number.isSafeInteger(context.entityId)&&context.entityId>0);
 const key=`draft:tab:${ownerId}:f06-batch-admission:${contextKey}`;
 const epoch=useMemo(()=>({store,ownerId,readOwner,ownerLive,enabled,key}),[store,ownerId,readOwner,ownerLive,enabled,key]);
 type Lease={epoch:typeof epoch;retired:boolean;origin:BatchOrigin|null;attempt:BatchRetainedAttempt|null;witness:string|undefined;fault:boolean;flight:object|null;failed:boolean;failureSequence:number};
 const active=useRef<Lease|null>(null);
 const [state,setState]=useState<{epoch:typeof epoch;view:View}>(()=>({epoch,view:empty()}));
 const view=state.epoch===epoch?state.view:empty();
 if(state.epoch!==epoch)setState({epoch,view});
 const numbered=useNumberedBatchDraft(contextKey,startAiIntakeAndCreateDraft);
 const current=useCallback((lease:Lease|null):lease is Lease=>!!lease&&!lease.retired&&active.current===lease&&lease.epoch===epoch&&enabled&&!!store&&!!ownerId&&!!readOwner?.identity&&readOwner.isLive()&&readOwner.admits(readOwner.identity),[epoch,enabled,store,ownerId,readOwner]);
 const update=(lease:Lease,patch:Partial<View>)=>{if(current(lease)){if(patch.error&&lease.flight)lease.failed=true;setState(s=>({epoch,view:{...(s.epoch===epoch?s.view:empty()),...patch}}));}};
 const persist=(lease:Lease,attempt:BatchRetainedAttempt)=>{
  if(!current(lease)||lease.fault||store!.getDraft(key)?.admission!==lease.witness)throw Error('Retention changed');
  const safe=batchRetainedAttemptSchema.parse(attempt);
  const raw=JSON.stringify(safe);
  try{store!.setDraft(key,{admission:raw});if(store!.getDraft(key)?.admission!==raw)throw Error('Retention failed');}
  catch{lease.fault=true;update(lease,{blocked:true});throw Error('Retention failed');}
  lease.witness=raw;lease.attempt=safe;update(lease,{attempt:clone(safe)});
 };
 useLayoutEffect(()=>{
  const lease:Lease={epoch,retired:false,origin:null,attempt:null,witness:undefined,fault:false,flight:null,failed:false,failureSequence:0};
  active.current=lease;
  if(enabled&&validContext&&current(lease)){
   void (async()=>{
    try{
     lease.witness=store!.getDraft(key)?.admission;
     const retained=lease.witness!==undefined?batchRetainedAttemptSchema.parse(JSON.parse(lease.witness)):null;
     const result=await bootstrapDmsBatchOrigin();
     if(!current(lease))return;
     const origin=result.success?batchOriginSchema.safeParse(result.origin):null;
     if(!origin?.success||origin.data.authUserId!==readOwner!.identity!.authUserId){update(lease,{error:'Batch identity does not match the active inbox owner.'});return;}
     lease.origin=origin.data;
     if(retained){
      if(retained.origin.authUserId!==origin.data.authUserId||retained.origin.profileId!==origin.data.profileId||
       JSON.stringify(retained.request.manifest.context)!==JSON.stringify(contextValue))throw Error('Invalid retained binding');
      if(retained.receipt){
       const receipt=await verifyBatchReceipt(retained.receipt,retained.request,origin.data);
       if(!current(lease))return;
       if(!receipt)throw Error('Invalid retained receipt');
      }
      lease.attempt=retained;
     }
     update(lease,{origin:origin.data,attempt:retained});
    }catch{if(current(lease)){lease.fault=true;update(lease,{blocked:true,error:'Retained batch metadata could not be verified. Reconcile it before starting another batch.'});}}
   })();
  }
  return()=>{lease.retired=true;lease.origin=null;lease.attempt=null;};
  // Each setup creates a permanently retired activation, including Strict Mode.
  // Context is represented by key; callbacks and files must not renew authority.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[epoch]);
 const begin=()=>{
  const lease=active.current;
  if(!current(lease)||!validContext||!lease.origin||lease.fault||lease.flight)return null;
  const token={};lease.flight=token;lease.failed=false;update(lease,{busy:true,error:null,failureId:0});
  return {lease,token,valid:()=>current(lease)&&lease.flight===token};
 };
 const finish=(run:NonNullable<ReturnType<typeof begin>>)=>{if(run.valid()){run.lease.flight=null;update(run.lease,{busy:false,failureId:run.lease.failed?++run.lease.failureSequence:0});}};
 const boundReceipt=async(raw:unknown,request:BatchRequest,run:NonNullable<ReturnType<typeof begin>>)=>{
  const receipt=await verifyBatchReceipt(raw,request,run.lease.origin!);
  if(!run.valid())return null;
  return receipt;
 };
 const readRecovery=async(run:NonNullable<ReturnType<typeof begin>>,attempt:BatchRetainedAttempt)=>{
  const raw=await readDmsUploadBatchDraftRecovery(clone(attempt.request));
  if(!run.valid())return null;
  const result=batchDraftRecoveryResultSchema.safeParse(raw);
  if(!result.success||!result.data.success){update(run.lease,{error:result.success&&!result.data.success&&result.data.uncertain?unconfirmed:unavailable});return null;}
  const receipt=await boundReceipt(result.data.receipt,attempt.request,run);
  if(!run.valid())return null;
  if(!receipt){update(run.lease,{error:unavailable});return null;}
  if(attempt.receipt&&!sameReceipt(attempt.receipt,receipt)){update(run.lease,{error:'The recovered admission differs from the retained receipt. Reconcile the original batch.'});return null;}
  const recovery=parseBatchDraftRecovery(result.data.recovery,receipt,run.lease.origin!);
  if(!recovery){update(run.lease,{error:unavailable});return null;}
  persist(run.lease,{...attempt,receipt});
  return {receipt,recovery};
 };
 const process=async(run:NonNullable<ReturnType<typeof begin>>,attempt:BatchRetainedAttempt,position?:number)=>{
  const data=await readRecovery(run,attempt);
  if(!run.valid()||!data)return;
  const {receipt,recovery}=data;
  const items:Item[]=receipt.members.map(m=>{
   const previous=position!==undefined&&sameReceipt(view.attempt?.receipt,receipt)?view.items[m.position]:undefined;
   return previous?.phase==='confirmed'&&previous.position===m.position&&previous.name===m.name?{...previous}:{position:m.position,name:m.name,phase:'pending',message:'Not yet confirmed.'};
  });
  const publish=(p:number,phase:Item['phase'],message:string)=>{items[p]={...items[p],phase,message};update(run.lease,{items:[...items]});};
  update(run.lease,{items});
  for(const member of recovery.members){
   if(!run.valid())return;
   if(position!==undefined&&position!==member.position)continue;
   const p=member.position;
   try{
    let prepared:PrepareEnvelope|null=null;
    if(member.kind==='prepared'){
     // Project the envelope; the recovery's members field is not prepare wire.
     const {members: _members,...anchors}=recovery;void _members;
     prepared={...anchors,member};
    }else if(member.kind==='historical'){
     if(!numbered.hasRetained(member.upload_session_id)){publish(p,'historical','Historical draft processing must be reconciled in the batch queue. No retained numbered request is available.');continue;}
     const result=await numbered.retryRetained(member.upload_session_id,run.valid);
     if(!run.valid())return;
     publish(p,result.success?'confirmed':result.uncertain?'unconfirmed':'rejected',result.success?'Draft confirmed; individual approval is still required.':result.uncertain?unconfirmed:'Draft rejected. Its original request is retained.');
     continue;
    }else{
     const raw=await recoverDmsBatchMemberUpload({request:clone(attempt.request),position:p});
     if(!run.valid())return;
     const plan=batchMemberUploadResultSchema.safeParse(raw);
     if(!plan.success||plan.data.state!=='ready'||plan.data.position!==p){publish(p,'unavailable','Upload readiness is unavailable for this member. Other members can still recover.');continue;}
     const bound=await boundReceipt(plan.data.receipt,attempt.request,run);
     if(!run.valid())return;
     if(!bound||JSON.stringify(bound)!==JSON.stringify(receipt)){publish(p,'unavailable',unavailable);continue;}
     if(plan.data.object.state==='upload'){
      const expected=receipt.members[p];
      const selected=view.files.find(f=>f.original_filename===expected.name&&f.mime_type===expected.mime&&f.file_size_bytes===expected.size&&f.sha256_hash===expected.sha256&&f.file.name===expected.name&&f.file.size===expected.size);
      if(!selected){publish(p,'needs_file','Reselect the exact original file to upload this member.');continue;}
      publish(p,'uploading','Uploading the selected file.');
      const ok=await upload(plan.data.object.capability,selected.file.slice(0,selected.file.size,expected.mime),expected.mime);
      if(!run.valid())return;
      if(!ok){publish(p,'unconfirmed','Upload outcome is unconfirmed. Recover this member before trying again.');continue;}
     }
     const verification=await verifyDmsBatchUpload({request:clone(attempt.request),position:p});
     if(!run.valid())return;
     if(verification.state!=='present'){publish(p,'unavailable','The admitted object could not be verified. No analysis was started.');continue;}
     publish(p,'analysis','Preparing the governed draft.');
     const rawPreparation=await prepareDmsUploadBatchMemberDraft({request:clone(attempt.request),position:p});
     if(!run.valid())return;
     const parsed=batchDraftPreparationResultSchema.safeParse(rawPreparation);
     if(!parsed.success||!parsed.data.success){publish(p,parsed.success&&!parsed.data.success&&parsed.data.uncertain?'unconfirmed':'unavailable',parsed.success&&!parsed.data.success&&parsed.data.uncertain?unconfirmed:unavailable);continue;}
     const preparedReceipt=await boundReceipt(parsed.data.receipt,attempt.request,run);
     if(!run.valid())return;
     if(!preparedReceipt||JSON.stringify(preparedReceipt)!==JSON.stringify(receipt)){publish(p,'unavailable',unavailable);continue;}
     prepared=parseBatchDraftPreparation(parsed.data.preparation,receipt,run.lease.origin!,p);
     if(!prepared){publish(p,'unavailable',unavailable);continue;}
     if(prepared.member.draft_operation_id!==member.draft_operation_id){publish(p,'unavailable','The retained draft operation does not match. Reconcile this member.');continue;}
     if(prepared.member.kind==='analysis_required'){publish(p,prepared.member.processing?'processing':'unavailable',prepared.member.processing?'Analysis is already processing. Check recovery later; no automatic retry was started.':'Analysis is not ready. No draft has been confirmed.');continue;}
    }
    const result=await numbered.continuePrepared({preparation:prepared,receipt,origin:run.lease.origin!,isCurrent:run.valid});
    if(!run.valid())return;
    publish(p,result.success?'confirmed':result.uncertain?'unconfirmed':'rejected',result.success?'Draft confirmed; individual approval is still required.':result.uncertain?unconfirmed:'Draft rejected. Its original request is retained.');
   }catch{if(!run.valid())return;publish(p,'unconfirmed',unconfirmed);}
  }
  if(!run.valid())return;
  const count=items.filter(i=>i.phase==='confirmed').length;
  if(count<receipt.members.length)run.lease.failed=true;
  // Presentation failures cannot relabel already confirmed server receipts.
  try{onResult(count,receipt.members.length,receipt.batch_code);}
  catch{update(run.lease,{error:count?'Draft confirmation was received, but the display could not refresh. Open the batch queue to review it.':'The display could not refresh. The original batch request is retained.'});}
 };
 const resume=async(position?:number)=>{
  const run=begin();if(!run)return;
  try{if(run.lease.attempt)await process(run,run.lease.attempt,position);}
  catch{if(run.valid())update(run.lease,{error:run.lease.fault?'Batch retention failed. Reconcile the original operation before continuing.':unconfirmed});}
  finally{finish(run);}
 };
 const start=async()=>{
  const run=begin();if(!run)return;
  try{
   if(run.lease.attempt){update(run.lease,{error:'Recover the retained batch before starting another operation.'});return;}
   const files=view.files.map((f,position)=>({position,...dmsFileMetadataSchema.parse({original_filename:f.original_filename,mime_type:f.mime_type,file_size_bytes:f.file_size_bytes,sha256_hash:f.sha256_hash})}));
   const request=batchRequestSchema.parse({manifest:{version:1,context:contextValue,files},contract:{operationId:crypto.randomUUID(),revision:null}});
   const attempt:BatchRetainedAttempt={request,origin:run.lease.origin!,uncertain:true};
   persist(run.lease,attempt); // Before the first possible admission dispatch.
   const raw=await createDmsUploadBatch(clone(request));
   if(!run.valid())return;
   const result=batchAdmissionResultSchema.safeParse(raw);
   if(!result.success){update(run.lease,{error:unconfirmed});return;}
   if(result.data.state!=='admitted'){
    if(result.data.state==='rejected')persist(run.lease,{...attempt,uncertain:false});
    update(run.lease,{error:result.data.state==='unconfirmed'?unconfirmed:'Batch admission was rejected. Keep this request for reconciliation.'});return;
   }
   const receipt=await boundReceipt(result.data.receipt,request,run);
   if(!run.valid())return;
   if(!receipt){update(run.lease,{error:unconfirmed});return;}
   persist(run.lease,{...attempt,uncertain:false,receipt});
   // Ignore full-plan capabilities: recovery is selected-member readiness, and
   // sealed replay must not depend on the continued existence of temp bytes.
   await process(run,run.lease.attempt!);
  }catch{if(run.valid())update(run.lease,{error:run.lease.fault?'Batch retention failed. Reconcile the original operation before continuing.':unconfirmed});}
  finally{finish(run);}
 };
 const discover=async()=>{
  const run=begin();if(!run)return;
  try{
   const raw=await discoverDmsBatchAdmissions();if(!run.valid())return;
   if(!raw.success||!Array.isArray(raw.receipts)||raw.receipts.length>20){update(run.lease,{error:unavailable});return;}
   const receipts:BatchReceipt[]=[];
   for(const candidate of raw.receipts){
    const parsed=batchReceiptSchema.safeParse(candidate);
    if(!parsed.success){update(run.lease,{error:unavailable});return;}
    const request:BatchRequest={manifest:parsed.data.manifest,contract:{operationId:parsed.data.operation_id,revision:null}};
    const receipt=await boundReceipt(parsed.data,request,run);if(!run.valid())return;
    if(!receipt){update(run.lease,{error:unavailable});return;}
    if(JSON.stringify(receipt.manifest.context)===JSON.stringify(contextValue))receipts.push(receipt);
   }
   update(run.lease,{recent:receipts});
  }catch{if(run.valid())update(run.lease,{error:unavailable});}finally{finish(run);}
 };
 const adopt=async(candidate:BatchReceipt)=>{
  const run=begin();if(!run)return;
  try{
   const parsed=batchReceiptSchema.parse(candidate);
   const request:BatchRequest={manifest:parsed.manifest,contract:{operationId:parsed.operation_id,revision:null}};
   if(JSON.stringify(request.manifest.context)!==JSON.stringify(contextValue))throw Error('Context mismatch');
   const receipt=await boundReceipt(parsed,request,run);if(!run.valid())return;
   if(!receipt)throw Error('Invalid receipt');
   if(run.lease.attempt?.receipt&&!sameReceipt(run.lease.attempt.receipt,receipt))throw Error('Retained receipt differs');
   if(run.lease.attempt&&(run.lease.attempt.request.contract.operationId!==request.contract.operationId||canonicalBatchManifest(run.lease.attempt.request.manifest)!==canonicalBatchManifest(request.manifest)))throw Error('Retained operation exists');
   const attempt={request,origin:run.lease.origin!,uncertain:false,receipt};
   persist(run.lease,attempt);await readRecovery(run,attempt); // Read only; explicit resume starts work.
  }catch{if(run.valid())update(run.lease,{error:'This admission could not be opened. Keep the currently retained operation.'});}finally{finish(run);}
 };
 const hasOwner=enabled&&!!store&&!!ownerId&&!!readOwner?.identity&&readOwner.isLive()&&readOwner.admits(readOwner.identity);
 const ready=!!view.origin&&hasOwner&&validContext&&!view.blocked;
 const canStartAnother=!!view.attempt?.receipt&&!view.busy&&view.items.length===view.attempt.receipt.members.length&&view.items.every((item,p)=>item.position===p&&item.phase==='confirmed');
 const startAnother=()=>{
  const run=begin();if(!run)return;
  try{
   if(!canStartAnother||!run.lease.attempt?.receipt||run.lease.attempt.request.contract.operationId!==view.attempt?.request.contract.operationId)return;
   if(store!.getDraft(key)?.admission!==run.lease.witness)throw Error('Retained operation changed');
   // Retire only this confirmed local pointer. Durable admission history and all
   // numbered request/receipt pairs remain available for authoritative replay.
   store!.clearDraft(key);
   if(store!.getDraft(key)!==undefined)throw Error('Local retirement failed');
   run.lease.witness=undefined;run.lease.attempt=null;
   update(run.lease,{attempt:null,files:[],items:[],error:null});
  }catch{run.lease.fault=true;update(run.lease,{blocked:true,error:'The confirmed batch could not be retired locally. Reopen the inbox before starting another batch.'});}
  finally{finish(run);}
 };
 const setFiles=(files:SelectedDmsFile[])=>{const lease=active.current;if(current(lease)&&!lease.flight)update(lease,{files});};
 const error=enabled&&!validContext?'This entity context is not supported for batch intake.':enabled&&!hasOwner?'The inbox owner is unavailable. Reopen this inbox after signing in.':view.error;
 const isCurrent=useCallback(()=>current(active.current),[current]);
 // Numbered retention survives retirement; labels require the live admission's
 // independently rebound receipt and must not reveal another admission's IDs.
 const boundMembers=ready?view.attempt?.receipt?.members:undefined;
 const pendingSessionIds=numbered.pendingSessionIds.filter(id=>boundMembers?.some(member=>member.id===id));
 return {...view,error,ready,start,resume,discover,adopt,setFiles,startAnother,canStartAnother,isCurrent,ownerGeneration:epoch,
  pendingSessionIds,retentionError:numbered.retentionError};
}
