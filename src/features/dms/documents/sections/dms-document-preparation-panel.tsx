"use client";
import {useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {FormErrorSummary,useInlineFieldFeedback} from '@/components/workspace/form-feedback';
import {collectWorkspaceFieldIssues,type WorkspaceFieldIssue} from '@/lib/workspace/form-validation';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {useReadCacheOwner,type ReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {DmsAiIntakeView} from '@/features/dms/intake/dms-ai-intake-view';
import {savedIntakeModel} from '@/features/dms/intake/saved-intake-model';
import type {ReviewFormValues} from '@/features/dms/intake/dms-ai-intake-review-form';
import type {IntakeLinkChip} from '@/features/dms/intake/dms-intake-link-panel';
import {savedIntakePayloadSchema,missingSavedIntakeFields,savedIntakeFilenameError,savedIntakeEditFingerprint,type SavedIntakePayload,type SavedIntakeOpen} from '@/lib/dms/saved-intake';
import {preparationCandidatesSchema,type PreparationCandidates} from '@/lib/dms/preparation/candidates';
import {preparationProgressMessage,preparationIsRunning,type PreparationProgress} from '@/lib/dms/preparation/progress';
import {openDocumentPreparationReview,startDocumentPreparation,getDocumentPreparationStatus,cancelDocumentPreparation} from '@/server/actions/dms/document-preparation';
import {openSavedIntake,readSavedIntakeSchema,saveSavedIntake} from '@/server/actions/dms/saved-intake';
import {getDmsDocumentLinks} from '@/server/actions/dms/document-links';
type Props={documentId:number;canRun:boolean;onApplied?:()=>void;selectedFileId?:number;initiallyOpen?:boolean;compact?:boolean;blockedReason?:string};
export function DmsDocumentPreparationPanel(props:Props){
 const owner=useReadCacheOwner();if(!props.canRun||!owner?.identity||!owner.isLive())return null;
 return <SavedIntakeSession key={`${props.documentId}:${props.selectedFileId??'all'}:${owner.identity.authUserId}:${owner.identity.scopeVersion}:${owner.generation}`} {...props} owner={owner}/>;
}
function SavedIntakeSession({documentId,selectedFileId,initiallyOpen,compact,blockedReason,onApplied,owner}:Props&{owner:ReadCacheOwner}){
 const [open,setOpen]=useState(initiallyOpen??false),[busy,setBusy]=useState(false),[opened,setOpened]=useState<SavedIntakeOpen|null>(null);
 const [fileId,setFileId]=useState(selectedFileId??0),[job,setJob]=useState<number|null>(null),[candidate,setCandidate]=useState<PreparationCandidates|null>(null);
 const [values,setValues]=useState<ReviewFormValues|null>(null),[links,setLinks]=useState<IntakeLinkChip[]>([]),[revision,setRevision]=useState(0);
 const [message,setMessage]=useState(''),[progress,setProgress]=useState<PreparationProgress|null>(null),[current,setCurrent]=useState(false),[preview,setPreview]=useState(false);
 const [stale,setStale]=useState(false),[statusAvailable,setStatusAvailable]=useState(false);
 const [reloadConfirm,setReloadConfirm]=useState(false);
 const [rerunBlocked,setRerunBlocked]=useState<string|null>(null);
 const [schema,setSchema]=useState<{type:number;hash:string;fields:SavedIntakeOpen['review']['source']['fields']}|null>(null),[rerunConfirm,setRerunConfirm]=useState(false);
 const [uncertain,setUncertain]=useState(false),[retained,setRetained]=useState(false),[draftUncertain,setDraftUncertain]=useState(false),[saved,setSaved]=useState('');
 const [issues,setIssues]=useState<WorkspaceFieldIssue[]>([]);
 const intakeBody=useRef<HTMLDivElement>(null),errorSummary=useRef<HTMLDivElement>(null);
 useInlineFieldFeedback(issues);
 const validateUpdate=()=>{
  const found=intakeBody.current?collectWorkspaceFieldIssues(intakeBody.current):[];
  if(values&&schema)for(const field of missingSavedIntakeFields(values,schema.fields)){
   const control=intakeBody.current?.querySelector<HTMLElement>(`[id="intake-metadata-${field.id}"]`)??null;
   const existing=control?found.find(issue=>issue.control===control):null;
   if(existing)existing.label=field.label;else found.push({label:field.label,message:'This field is required.',control,section:null});
  }
  const original=opened?.review.source.files.find(file=>file.id===fileId);
  const filenameError=values&&original?savedIntakeFilenameError(values.standardFileName,original.name):null;
  if(filenameError)found.push({label:'Standard File Name',message:filenameError,control:intakeBody.current?.querySelector<HTMLElement>('#intake-standard-file-name')??null,section:null});
  setIssues(found);
  if(found.length){setMessage('Document not updated. Complete the highlighted fields, then choose Update & Save again.');queueMicrotask(()=>{errorSummary.current?.scrollIntoView?.({block:'nearest'});errorSummary.current?.focus();});return false;}
  return true;
 };
 const mounted=useRef(true),pending=useRef(false),sequence=useRef(0),completed=useRef<number|null>(null),seeded=useRef<number|null>(null);
 const startRequest=useRef<Parameters<typeof startDocumentPreparation>[0]|null>(null),saveRequest=useRef<{payload:SavedIntakePayload;draft:boolean}|null>(null);
 const live=()=>mounted.current&&owner.isLive()&&owner.admits(owner.identity);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const finish=(id:number)=>{
  if(!live()||completed.current===id)return;completed.current=id;sequence.current++;saveRequest.current=null;startRequest.current=null;
  setRetained(false);setDraftUncertain(false);setUncertain(false);setIssues([]);setOpen(false);setOpened(null);setCandidate(null);setJob(null);setValues(null);setSaved('');
  toast.success('Document updated successfully.');
  void(async()=>{try{await onApplied?.();}catch{if(live())toast.warning('Document saved. Refresh the document to see the latest changes.');}})();
 };
 const guard=async(action:()=>Promise<void>)=>{if(pending.current||!live())return;pending.current=true;sequence.current++;setBusy(true);try{await action();}catch{if(live()){setUncertain(true);setMessage('The result is unconfirmed. Recover the saved request before starting another operation.');}}finally{pending.current=false;if(live())setBusy(false);}};
 const readStatus=async(id:number,context=opened,selected=fileId,resume=false)=>{
  const seq=++sequence.current,r=await getDocumentPreparationStatus(documentId,id,resume);if(!live()||seq!==sequence.current)return;
  if(!r.success||!r.data){setStatusAvailable(false);setCurrent(false);setStale(false);setMessage(r.error??'Processing status is unavailable. Your request is retained.');return;}
  if(r.data.state==='applied'){finish(id);return;}
  if(r.data.state==='cancelled')setRerunBlocked(null);
  setStatusAvailable(true);setProgress(r.data.progress??null);setCurrent(r.data.sourceCurrent);setStale(!r.data.sourceCurrent);if(!saveRequest.current)setUncertain(false);
  const parsed=preparationCandidatesSchema.safeParse(r.data.candidate);
  if(r.data.state==='review_required'&&parsed.success&&context){
   setCandidate(parsed.data);
   if(seeded.current!==id){
    const draft=context.draft?.current?context.draft:null;
    const type=draft?.payload.values.documentTypeId??(parsed.data.proposedType?.canApply?parsed.data.proposedType.documentTypeId:context.values.documentTypeId);
    const definitions=await readSavedIntakeSchema(documentId,type);if(!live()||seq!==sequence.current)return;
    if(!definitions.success||!definitions.data){setCurrent(false);setMessage(definitions.error??'Document fields are unavailable. Recover the review.');return;}
    setSchema({type,hash:draft?.payload.schemaHash??definitions.data.schemaHash,fields:definitions.data.fields});
    const model=savedIntakeModel(context,selected,id,parsed.data,definitions.data.fields);
    setValues(draft?.payload.values??model.values);setLinks(draft?.payload.links??context.links);setRevision(draft?.revision??0);
    setSaved(savedIntakeEditFingerprint(draft?.payload.values??context.values,draft?.payload.links??context.links));seeded.current=id;
   }
   setMessage(r.data.sourceCurrent?'Review the AI-filled fields and original file, then update this document.':'This saved AI review uses older document details or field rules. Choose Re-run AI to analyse the current saved file; the existing document stays unchanged.');
  }else {if(!saveRequest.current){setCandidate(null);setValues(null);setSchema(null);seeded.current=null;}setMessage(!r.data.sourceCurrent?'This saved AI request uses older document details or field rules. Choose Re-run AI to analyse the current saved file.':r.data.progress?preparationProgressMessage(r.data.progress):'AI processing is saved. Waiting for an available processing slot.');}
 };
 const launch=async(context:SavedIntakeOpen,selected:number)=>{
  const old=context.review.recovery;
  if(old&&!['applied','cancelled'].includes(old.state)){
   if(old.fileIds.length!==1||old.fileIds[0]!==selected){setMessage('Another file review is unfinished. Finish or cancel that saved review first.');setCurrent(false);return;}
   startRequest.current={documentId,requestId:old.requestId,snapshot:old.snapshot,fileIds:old.fileIds,mode:old.mode};setJob(old.jobId);await readStatus(old.jobId,context,selected);return;
  }
  // A positively reconciled terminal request must never be replayed as a new run.
  if(old&&['applied','cancelled'].includes(old.state)&&(startRequest.current as {requestId?:string}|null)?.requestId===old.requestId)startRequest.current=null;
  startRequest.current??={documentId,requestId:crypto.randomUUID(),snapshot:context.review.source.snapshot,fileIds:[selected],mode:'reread_files'};
  const r=await startDocumentPreparation(startRequest.current);if(!live())return;
  if(!r.success||!r.data){setUncertain(r.uncertain===true);setMessage(r.error??'The AI request could not be started.');return;}
  setJob(r.data.jobId);setUncertain(false);await readStatus(r.data.jobId,context,selected);
 };
 const load=(reloadOnly=false)=>guard(async()=>{
  setStatusAvailable(false);setStale(false);
  let selected=selectedFileId??fileId;
  if(!selected){const r=await openDocumentPreparationReview(documentId);if(!live())return;if(!r.success||!r.data){setMessage(r.error??'Document access could not be verified.');return;}selected=r.data.source.files[0]?.id??0;}
  if(!selected){setMessage('This document has no current stored original to analyse.');return;}
  const r=await openSavedIntake(documentId,selected);if(!live())return;
  if(!r.success||!r.data){setCurrent(false);setMessage(r.error??'The saved document could not be opened.');return;}
  const context=r.data,names=await getDmsDocumentLinks(documentId);if(!live())return;
  if(names.success&&names.data)context.links=context.links.map(l=>({...l,entityName:names.data!.find(n=>n.entity_type===l.entityType&&n.entity_id===l.entityId)?.entity_display_name??l.entityName}));
  setFileId(selected);setOpened(context);setCurrent(true);setUncertain(false);setMessage('Reading the original file saved in DMS…');
  if(reloadOnly){const recovered=context.review.recovery;if(recovered){setJob(recovered.jobId);await readStatus(recovered.jobId,context,selected);}else{setJob(null);setMessage('No saved AI review is available. Choose Recover saved request to start preparation from the current original.');}return;}
  await launch(context,selected);
 });
 useEffect(()=>{let cancelled=false;if(initiallyOpen&&!blockedReason)queueMicrotask(()=>{if(!cancelled)void load();});return()=>{cancelled=true;};
 // Once per account/file mount; recover explicitly after a failure.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const poll=useRef(readStatus);useEffect(()=>{poll.current=readStatus;});
 useEffect(()=>{if(!open||job===null||candidate||stale||['held','cancelled','applied'].includes(progress?.stage??''))return;let reading=false;const timer=setInterval(()=>{if(reading||pending.current||!owner.isLive()||document.visibilityState==='hidden')return;reading=true;void poll.current(job).catch(()=>{if(mounted.current&&owner.isLive())setMessage('Progress is temporarily unavailable; the request is retained.');}).finally(()=>{reading=false;});},5000);return()=>clearInterval(timer);},[open,job,candidate,stale,progress?.stage,owner]);
 const changeType=async(type:number)=>{
  setSchema(null);const token=++sequence.current;
  const r=await readSavedIntakeSchema(documentId,type);if(!live()||token!==sequence.current)return;
  if(r.success&&r.data)setSchema({type,hash:r.data.schemaHash,fields:r.data.fields});
  else setMessage(r.error??'Selected type fields unavailable. Select the type again to retry.');
 };
 const rerun=()=>guard(async()=>{
  if(rerunBlocked){setRerunConfirm(false);setMessage(rerunBlocked);return;}
  if(saveRequest.current||!job||!opened||!statusAvailable){setRerunConfirm(false);setMessage('Check the saved request status before running AI again.');return;}
  if(progress?.stage!=='cancelled'){
   const r=await cancelDocumentPreparation(documentId,job);if(!live())return;
   if(!r.success){const reason=r.error??'The earlier request could not be cancelled. Check its saved status before retrying.';setUncertain(r.uncertain===true);setRerunBlocked(reason);setRerunConfirm(false);setMessage(reason);toast.warning('AI was not restarted. The earlier request needs attention.');return;}
  }
  startRequest.current=null;seeded.current=null;setUncertain(false);setCurrent(false);setStale(false);setStatusAvailable(false);setProgress(null);setIssues([]);setRerunConfirm(false);setSchema(null);setCandidate(null);setJob(null);setValues(null);setSaved('');
  const fresh=await openSavedIntake(documentId,fileId);if(!live())return;if(!fresh.success||!fresh.data){setCurrent(false);setMessage(fresh.error??'Current document unavailable.');return;}
  setOpened(fresh.data);await launch(fresh.data,fileId);
 });
 const save=(draft:boolean)=>{
  if(pending.current||!live())return;
  if(!saveRequest.current&&!draft&&!validateUpdate())return;
  return guard(async()=>{
  if(!job||!opened||!values||!candidate)return;
  if(!saveRequest.current&&!current){setMessage('Refresh the saved review before saving. If its source changed, choose Re-run AI.');return;}
  if(!saveRequest.current){
   if(!schema||schema.type!==values.documentTypeId){setMessage('Wait for the selected document fields to load before saving.');return;}
   const p=savedIntakePayloadSchema.safeParse({documentId,fileId,jobId:job,requestId:crypto.randomUUID(),snapshot:candidate.sourceSnapshot,schemaHash:schema.hash,expectedRevision:revision,confirmed:true,values:{...values,tagIds:values.tagIds??[]},links});
   if(!p.success){setMessage(p.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(' '));return;}
   saveRequest.current={payload:p.data,draft};
  }
  const request=saveRequest.current;setRetained(!request.draft);setDraftUncertain(request.draft);setMessage(request.draft?'Saving review draft…':'Saving your reviewed changes…');
  const r=await saveSavedIntake(request.payload,request.draft);if(!live())return;
  if(r.success&&r.data){if(!request.draft){finish(job);return;}setRevision(r.data.revision);setSaved(savedIntakeEditFingerprint(request.payload.values,request.payload.links));saveRequest.current=null;setDraftUncertain(false);setUncertain(false);setMessage('Draft saved. The existing document has not been updated.');toast.success('Review draft saved.');}
  else{setUncertain(r.uncertain===true);if(!r.uncertain){saveRequest.current=null;setRetained(false);setDraftUncertain(false);}if(r.errorCode==='conflict_detected')setCurrent(false);setMessage(r.error??'The update was not saved. Check the fields and try again.');}
  });
 };
 const model=opened?savedIntakeModel(opened,fileId,job??1,candidate,schema?.fields):null;
 if(model&&!candidate&&progress?.stage==='held')model.session.intake_status='failed';
 const dirty=!!values&&savedIntakeEditFingerprint(values,links)!==saved;
 return <div className={compact?'inline-block':'space-y-3'}>
  <Button type="button" variant="outline" size="sm" disabled={busy||!!blockedReason} title={blockedReason} onClick={()=>{setOpen(true);if(!opened)void load();}}>Run AI Pipeline</Button>
  {blockedReason&&<p className="text-xs text-muted-foreground">{blockedReason}</p>}
  <ERPChildDialogForm open={open&&!blockedReason} onOpenChange={setOpen} title="AI-Assisted Document Intake" subtitle={opened?`Update ${opened.review.source.documentNo} from its saved original file.`:'Loading the saved document…'} mode="edit" size="workbench"
   isSubmitting={busy} closeDisabled={busy||retained||draftUncertain||uncertain} isDirty={dirty} retentionNotice="AI processing is saved. Use Save Draft to keep your review edits. Update & Save saves your reviewed changes to the same DMS record and closes this form." cancelLabel="Close intake" onCancel={()=>{setIssues([]);sequence.current++;seeded.current=null;startRequest.current=null;setCurrent(false);setStale(false);setStatusAvailable(false);setOpened(null);setCandidate(null);setValues(null);setSchema(null);setJob(null);setProgress(null);setRerunConfirm(false);setReloadConfirm(false);setSaved('');}}>
   <div ref={intakeBody}>
   <div ref={errorSummary} tabIndex={-1}><FormErrorSummary issues={issues} onReveal={issue=>{issue.control?.scrollIntoView?.({block:'center'});issue.control?.focus();}} /></div>
   {model&&opened?<DmsAiIntakeView session={model.session} displaySession={model.session} aiResult={model.ai} documentTypes={[]} formValues={values??model.values}
    handleFormChange={p=>{if(!busy&&!saveRequest.current){setIssues([]);setValues(v=>({...v??model.values,...p}));if(p.documentTypeId!==undefined&&p.documentTypeId!==values?.documentTypeId)void changeType(p.documentTypeId??0);}}} entityLinks={links} setEntityLinks={l=>{if(!busy&&!saveRequest.current){setLinks(l);}}}
    isReady={!!candidate} isFailed={false} isProcessing={false} isPending={busy} retainedApproval={retained} approvalBlocked={!retained&&(!current||uncertain||!schema||schema.type!==values?.documentTypeId)} draftUncertain={draftUncertain}
    approvalLoading={false} retentionError={null} batchLoading={false} batchBlocked={false}
    handleRetry={()=>{setIssues([]);setReloadConfirm(false);setRerunConfirm(true);}} handleSaveDraft={()=>void save(true)} handleApprove={()=>void save(false)} handleDiscard={()=>{}} handlePreview={()=>setPreview(v=>!v)} isLoadingPreview={false}
    discardAnchor={null} setDiscardAnchor={()=>{}} discardReason="" setDiscardReason={()=>{}} setFileReview={()=>{}} navigate={()=>{}} onAiResultPatch={()=>{}}
    savedDocument={{form:{documentId,jobId:job??1},canRerun:!!job&&statusAvailable&&!uncertain&&!rerunBlocked&&(!!candidate||stale||['held','cancelled'].includes(progress?.stage??'')),canSaveDraft:current,
     progress:<div className="my-4 rounded border p-3"><h2 className="font-semibold">AI Pipeline</h2><p role="status" aria-live="polite" aria-busy={!candidate&&preparationIsRunning(progress)} className="flex items-center gap-2">{!candidate&&preparationIsRunning(progress)&&<Loader2 aria-hidden="true" data-testid="saved-intake-processing-spinner" className="size-4 shrink-0 animate-spin motion-reduce:animate-none text-primary"/>}{rerunBlocked??message}</p>{busy&&<p role="status">Checking your saved request…</p>}
      {job&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void guard(async()=>{await readStatus(job,opened,fileId,!rerunBlocked&&current&&!!progress&&!progress.admitted&&['waiting','retry_wait'].includes(progress.stage));if(live())toast.warning('Saved status checked. Review the AI Pipeline message for the result.');})}>Refresh / recover processing</Button>}
      {!job&&<Button type="button" disabled={busy} onClick={()=>void load()}>Recover saved request</Button>}
      <Button type="button" size="sm" variant="outline" disabled={busy||retained||draftUncertain||uncertain} onClick={()=>{setRerunConfirm(false);setReloadConfirm(true);}}>Reload saved review</Button><ol className="mt-2 flex flex-wrap gap-4 text-sm" aria-label="AI processing progress">{['Stored original','OCR & AI extraction','Review','Update document'].map((stage,i)=><li key={stage} aria-current={(candidate?2:progress?.stage==='reading'||progress?.stage==='analysing'?1:0)===i?'step':undefined}>{i+1}. {stage}</li>)}</ol>
      <p className="mt-2 text-xs text-muted-foreground">Accepted summaries, tags and search data refresh after saving. Original files and history are retained.</p>
     </div>,notice:<>{preview&&<iframe title="Stored original preview" src={`/api/dms/file?fileId=${fileId}&disposition=inline`} className="h-[60vh] w-full border"/>}{stale&&!rerunBlocked&&<p role="alert">This review is out of date. Re-run AI to review the current saved document. No document changes have been saved.</p>}</>,
     confirmation:reloadConfirm?<section role="alertdialog" aria-modal="false" aria-label="Confirm reload" className="rounded border p-4"><p>Reload the saved review? Unsaved edits will be replaced by the latest saved review. Your document and original file will not change.</p><Button disabled={busy||retained||draftUncertain||uncertain} onClick={()=>{seeded.current=null;setCandidate(null);setValues(null);setSchema(null);setIssues([]);setReloadConfirm(false);void load(true);}}>Confirm reload</Button><Button variant="outline" disabled={busy} onClick={()=>setReloadConfirm(false)}>Keep editing</Button></section>:rerunConfirm?<section role="alertdialog" aria-modal="false" aria-label="Confirm rerun" className="rounded border p-4"><p>Run AI again using the stored original? This replaces this review and any saved review draft. The document stays unchanged until you choose Update & Save.</p><Button disabled={busy||retained||draftUncertain} onClick={()=>void rerun()}>Confirm rerun</Button><Button variant="outline" disabled={busy} onClick={()=>setRerunConfirm(false)}>Keep reviewing</Button></section>:null}}/>
   :<div role="status" className="space-y-3"><p>{message||'Checking current document access…'}</p><Button type="button" disabled={busy} onClick={()=>void load()}>Recover saved request</Button></div>}
   </div>
  </ERPChildDialogForm>
 </div>;
}
