'use client';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {z} from 'zod';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {createClient} from '@/lib/supabase/client';
import {createDmsUploadSession,acknowledgeDmsSingleUpload,completeDmsTempUpload} from '@/server/actions/dms/upload-sessions';
import {createDocumentFromUpload} from '@/server/actions/dms/document-upload-attach';
import {readPhotoFramingSource,readPhotoRequiredDetails,completePhotoRequiredDetails} from '@/server/actions/hr/photo-controls';
import {photoMetadataValues,type PhotoDetails} from '@/lib/hr/photo-metadata';
import {photoUploadStateSchema,runPhotoUpload,type PhotoUploadState} from '@/lib/hr/photo-upload-workflow';
import {photoMime,PHOTO_MAX_BYTES,PHOTO_MAX_PIXELS,defaultPhotoCrop,parsePhotoFraming,type PhotoSource} from '@/lib/hr/photo-framing';
import {readPhotoRecovery,retainPhotoRecovery,saveWithPhotoRecovery,resumePhotoSave,finishPhotoRecovery} from '@/server/actions/hr/photo-recovery';
import type {PhotoRecoveryRecord,PhotoSaveRequest} from '@/lib/hr/photo-recovery';
import {dependentMutationSchema,dependentSaveContract} from '@/lib/hr/dependent-contract';
import type {DependentSaveResult} from '@/server/dependent-save';
import type {WorkspaceSaveResult} from '@/server/workspace-save';

type Local={file:File;source:PhotoSource;url:string};
export type PhotoValues={photo_dms_document_id:number|null;photo_framing:string;photo_pending:string};
export function useSubjectPhotoDraft(identity:string,scope:string) {
  const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner()?.id,readOwner=useReadCacheOwner();
  const key=`draft:tab:${owner}:hr-photo:${scope}:${readOwner?.identity?.authUserId??'none'}`,epoch=useMemo(()=>({store,owner,identity,key,readOwner}),[store,owner,identity,key,readOwner]);
  const live=useRef<typeof epoch|null>(null),file=useRef<Local|null>(null),flight=useRef(false),selection=useRef(0);
  const [local,setLocal]=useState<(Local&{epoch:typeof epoch})|null>(null),[busy,setBusy]=useState<typeof epoch|null>(null),[,redraw]=useState(0);
  const [typeId,setTypeId]=useState<number|null>(null),[expiry,setExpiry]=useState('');
  const [details,setDetails]=useState<{epoch:typeof epoch;value:PhotoDetails}|null>(null);
  const journal=useRef<{epoch:typeof epoch;value:PhotoRecoveryRecord}|null>(null);
  const journalOperation=useRef<{epoch:typeof epoch;id:string}|null>(null);
  const [recovery,setRecovery]=useState<{epoch:typeof epoch;ready:boolean;failed:boolean;restored:boolean;value:PhotoRecoveryRecord|null}|null>(null);
  const detailsKey=key+':details';
  const readDetailsDraft=()=>{const raw=store?.getDraft(detailsKey)?.values;return raw?z.record(z.string(),z.string()).parse(JSON.parse(raw)):{};};
  useLayoutEffect(()=>{
    live.current=epoch;
    selection.current++;
    const authority=store?.getViewState(key+':authority');
    if(authority!==undefined&&authority!==identity){
      const raw=store?.getDraft(key)?.request;
      if(raw){
        // A permission change must not retain filenames or replay a private
        // payload. Keep an opaque hold so reopening cannot duplicate it.
        let operationId:string|undefined;
        try{operationId=photoUploadStateSchema.parse(JSON.parse(raw)).request.operationId;}catch{/* Corrupt recovery remains held. */}
        store?.setViewState(key+':retired',JSON.stringify({held:true,operationId}));store?.clearDraft(key);store?.clearDraft(key+':details');
      }
    }
    store?.setViewState(key+':authority',identity);
    return()=>{live.current=null;if(file.current)URL.revokeObjectURL(file.current.url);file.current=null;};
  },[epoch,store,key,identity]);
  const current=()=>live.current===epoch&&!!store&&!!owner&&!!readOwner?.identity&&readOwner.isLive()&&readOwner.admits(readOwner.identity);
  const read=()=>{const raw=store?.getDraft(key)?.request;return raw?photoUploadStateSchema.parse(JSON.parse(raw)):null;};
  const personSchema=z.object({id:z.number().int().positive().safe(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
  const person=()=>{const raw=store?.getViewState(key+':person');return raw?personSchema.parse(JSON.parse(raw)):null;};
  const localPersist=(state:PhotoUploadState)=>{if(!current())throw Error('Photo ownership changed.');const raw=JSON.stringify(photoUploadStateSchema.parse(state));store!.setDraft(key,{request:raw});if(store!.getDraft(key)?.request!==raw)throw Error('Photo recovery could not be retained.');redraw(n=>n+1);};
  const adopt=(r:PhotoRecoveryRecord|null,restored=false)=>{
    if(!current())throw Error('Photo ownership changed.');
    journal.current=r?{epoch,value:r}:null;
    if(r?.complete){store!.clearDraft(key);store!.clearDraft(detailsKey);store!.setViewState(key+':person','');}
    if(r&&!r.complete){localPersist(r.state);if(r.scope.endsWith(':new')){const id=r.scope.startsWith('employee:')?r.employee:r.dependent;if(id&&r.personRevision)store!.setViewState(key+':person',JSON.stringify({id,revision:r.personRevision}));}}
    setRecovery({epoch,ready:true,failed:false,restored,value:r});
  };
  // A full page/process restart has an empty F04 memory store. Only the
  // actor-scoped server journal can restore original operation identities.
  useEffect(()=>{let retired=false;void readPhotoRecovery(scope).then(result=>{
    if(retired||!current())return;
    if(!result.success){setRecovery({epoch,ready:true,failed:true,restored:false,value:null});return;}
    adopt(result.record,!!result.record);
  }).catch(()=>{if(!retired&&current())setRecovery({epoch,ready:true,failed:true,restored:false,value:null});});return()=>{retired=true;};
  // Scope/authority changes retire the old result; callbacks deliberately use
  // this opening's lifetime rather than resubscribing after every draft edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[epoch,scope]);
  const args=()=>{if(journalOperation.current?.epoch!==epoch)journalOperation.current={epoch,id:crypto.randomUUID()};return {scope,operation:journal.current?.epoch===epoch?journal.current.value.operation:journalOperation.current.id,revision:journal.current?.epoch===epoch?journal.current.value.revision:null};};
  const persist=async(state:PhotoUploadState)=>{if(!current())throw Error('Photo ownership changed.');localPersist(state);const result=await retainPhotoRecovery(args(),{state,save:null});if(!current())throw Error('Photo ownership changed.');if(!result.success)throw Error(result.error);adopt(result.record);};
  const seed=(values:Pick<PhotoValues,'photo_framing'>)=>{
    const prior=read();if(prior)return prior;
    if(!typeId||!file.current)throw Error('Choose the photo and document type before saving.');
    const {file:f,source}=file.current;
    return photoUploadStateSchema.parse({request:{version:1,operationId:crypto.randomUUID(),authUserId:readOwner!.identity!.authUserId,metadata:{original_filename:f.name,mime_type:f.type,file_size_bytes:f.size,sha256_hash:source.sha256},context:null},typeId,title:f.name,expiry:expiry||null,creation:null,receipt:null,framing:parsePhotoFraming(values.photo_framing)??{version:1,source,rotation:0,crop:defaultPhotoCrop(source)}});
  };
  const priorAuthority=store?.getViewState(key+':authority');
  const remote=recovery?.epoch===epoch?recovery:null;
  let retained:PhotoUploadState|null=null,createdPerson:{id:number;revision:string}|null=null,blocked=!!store?.getViewState(key+':retired')||priorAuthority!==undefined&&priorAuthority!==identity||!!remote?.failed;
  try{if(!blocked){retained=read();createdPerson=person();}}catch{blocked=true;}
  const save=async(request:PhotoSaveRequest,values:Pick<PhotoValues,'photo_framing'>):Promise<WorkspaceSaveResult>=>{
    if(!current()||blocked||!remote?.ready)throw Error('Check photo recovery before saving.');
    const state=seed(values);localPersist(state);
    const result=await saveWithPhotoRecovery({...args(),...(request.kind==='employee-create'?{company:request.input.owner_company_id,branch:request.input.branch_id??null}:{})},{state,save:request});
    if(!current())throw Error('Photo ownership changed.');if(result.record)adopt(result.record);
    return result.result;
  };
  return {local:local?.epoch===epoch?local:null,busy:busy===epoch,retained,blocked,recoveryReady:!!remote?.ready,recovered:remote?.restored?remote.value:null,typeId:retained?.typeId??typeId,expiry:retained?.expiry??expiry,setTypeId,setExpiry,
    details:!blocked&&details?.epoch===epoch?details.value:null,detailsDraft:blocked?{}:readDetailsDraft(),
    setDetail(id:number,value:string){if(!current()||flight.current||blocked||read()?.metadata)throw Error('Reconcile the retained details before editing.');store!.setDraft(detailsKey,{values:JSON.stringify({...readDetailsDraft(),[id]:value})});redraw(n=>n+1);},
    createdPerson,
    async resume(){if(!current()||flight.current)throw Error('Photo recovery unavailable.');const result=await resumePhotoSave(scope);if(!current())throw Error('Photo ownership changed.');if(!result.success){const refreshed=await readPhotoRecovery(scope);if(!current())throw Error('Photo ownership changed.');if(refreshed.success)adopt(refreshed.record,true);throw Error(result.error);}adopt(result.record,true);return result.record;},
    save,
    async saveDependent(request:unknown,contract:unknown,values:PhotoValues):Promise<DependentSaveResult>{
      const result=await save({kind:'dependent',input:dependentMutationSchema.parse(request),contract:dependentSaveContract.parse(contract)},values);
      if(!result.success)return {success:false,error:result.error,uncertain:result.uncertain};
      const data=z.object({id:z.number().int().positive(),employee_id:z.number().int().positive(),operation_id:z.string().uuid(),revision:z.string(),replayed:z.boolean()}).safeParse(result.data);
      return data.success?{success:true,data:data.data}:{success:false,uncertain:true,error:'Dependent photo save needs reconciliation.'};
    },
    validate(values:PhotoValues){if(!current()||blocked)throw Error('Photo save is unavailable.');if(!remote?.ready)throw Error('Checking photo recovery. Try Save when it is ready.');if(remote.restored&&remote.value?.savePending)throw Error('Resume the original saved request before editing its fields.');if(file.current&&!read()&&!typeId)throw Error('Choose the photo document type before saving.');if(values.photo_pending&&!file.current&&!read())throw Error('Reselect the staged photo before saving.');},
    rememberPerson(value:{id:number;revision:string}){if(!current())throw Error('Photo ownership changed.');const raw=JSON.stringify(personSchema.parse(value));store!.setViewState(key+':person',raw);if(store!.getViewState(key+':person')!==raw)throw Error('Created person recovery could not be retained.');redraw(n=>n+1);},
    get pending(){return !!file.current||blocked||!!read();},
    async choose(next:File){
      if(!current()||flight.current||blocked)throw Error('Photo controls are unavailable.');
      const choosing=++selection.current;
      if(!photoMime.safeParse(next.type).success||next.size<1||next.size>PHOTO_MAX_BYTES)throw Error('Choose one JPEG, PNG or WebP photo up to 10 MB.');
      const bitmap=await createImageBitmap(next,{imageOrientation:'from-image'});
      const width=bitmap.width,height=bitmap.height;bitmap.close();
      if(width<24||height<28||width>20000||height>20000||width*height>PHOTO_MAX_PIXELS)throw Error('Choose a photo within the supported dimensions.');
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await next.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
      if(!current()||choosing!==selection.current)throw Error('Photo selection changed.');
      const previous=read();if(previous&&(previous.request.metadata.sha256_hash!==sha256||previous.request.metadata.original_filename!==next.name||previous.request.metadata.mime_type!==next.type||previous.request.metadata.file_size_bytes!==next.size))throw Error('Reselect the original photo to finish its retained upload before choosing another.');
      if(file.current)URL.revokeObjectURL(file.current.url);
      const value={file:next,url:URL.createObjectURL(next),source:{documentId:1,versionId:1,fileId:1,sha256,width,height},epoch};
      file.current=value;setLocal(value);return value.source;
    },
    discard(){
      // Closing an ordinary form does not require a photo session. A retired
      // callback must leave the current owner's bytes and recovery untouched.
      if(!current())return;
      if(flight.current||read())throw Error('Finish or reconcile the retained upload before replacing it.');
      selection.current++;if(file.current)URL.revokeObjectURL(file.current.url);file.current=null;setLocal(null);
    },
    async resolve(employee:number,dependent:number|null,values:PhotoValues){
      if(!current()||flight.current||blocked)throw Error('Photo save is unavailable.');
        let state=read();if(!file.current&&!state){if(values.photo_pending)throw Error('Reselect the staged photo before saving. Files are not stored in workspace drafts.');return values;}
      flight.current=true;setBusy(epoch);
      try{
        // Reconfirm a prior uncertain journal write before dispatching the next
        // upload/allocation stage. Its operation and payload remain identical.
        if(state)await persist(state);
        const context={entityType:dependent===null?'employee' as const:'employee_dependent' as const,entityId:dependent??employee};
        if(state?.request.context&&JSON.stringify(state.request.context)!==JSON.stringify(context))throw Error('Retained photo belongs to another person.');
        if(!state){
          if(!typeId||!file.current)throw Error('Choose the photo document type before saving.');
          const {file:f,source}=file.current;
          state=photoUploadStateSchema.parse({request:{version:1,operationId:crypto.randomUUID(),authUserId:readOwner!.identity!.authUserId,metadata:{original_filename:f.name,mime_type:f.type,file_size_bytes:f.size,sha256_hash:source.sha256},context},typeId,title:f.name,expiry:expiry||null,creation:null,receipt:null,framing:parsePhotoFraming(values.photo_framing)??{version:1,source,rotation:0,crop:defaultPhotoCrop(source)}});await persist(state);
        }
        if(!state.request.context){state={...state,request:{...state.request,context}};await persist(state);}
        const receipt=await runPhotoUpload(state,{current,persist,
          admit:r=>createDmsUploadSession({...r.metadata,context:r.context??undefined},{operationId:r.operationId,authUserId:r.authUserId}),
          verify:completeDmsTempUpload,acknowledge:acknowledgeDmsSingleUpload,create:createDocumentFromUpload,
          upload:async(path,token,mime)=>{const f=file.current?.file;if(!f)throw Error('Reselect the original photo to finish its upload.');let timer:ReturnType<typeof setTimeout>|undefined;try{const result=await Promise.race([createClient().storage.from('dms-temp').uploadToSignedUrl(path,token,f,{contentType:mime,upsert:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Photo transfer is unconfirmed. Retry Save to check the original upload.')),45000);})]);if(result.error)throw Error('Photo transfer was not confirmed. Retry the same file.');}finally{clearTimeout(timer);}},
        });
        state=read()!;
        if(!state.metadataDone){
          const target={employee,dependent,document:receipt.documentId,type:state.typeId};
          if(!state.metadata){
            const required=await readPhotoRequiredDetails(target);if(!current())throw Error('Photo ownership changed.');
            if(!required.success)throw Error(required.error);
            setDetails({epoch,value:required.details});
            const values=photoMetadataValues(required.details,readDetailsDraft());
            state={...state,metadata:{requestId:crypto.randomUUID(),snapshot:required.details.snapshot,values}};await persist(state);
          }
          const completed=await completePhotoRequiredDetails(target,state.metadata);if(!current())throw Error('Photo ownership changed.');
          if(!completed.success){if(!completed.uncertain)await persist({...state,metadata:null});throw Error(completed.error??'Photo details remain pending.');}
          state={...state,metadataDone:true};await persist(state);
        }
        const source=await readPhotoFramingSource({employee,dependent,document:receipt.documentId});if(!current())throw Error('Photo ownership changed.');if(!source.success)throw Error(source.error);
        const original=read()!.framing;
        const frame=original?{...original,source:source.source}:{version:1,source:source.source,rotation:0,crop:defaultPhotoCrop(source.source)};
        return {photo_dms_document_id:receipt.documentId,photo_framing:JSON.stringify(frame),photo_pending:''};
      }finally{flight.current=false;if(current())setBusy(null);}
    },
    async confirmed(){if(!current())return;if(journal.current?.epoch===epoch){const result=await finishPhotoRecovery(args());if(!current())return;if(!result.success)throw Error(result.error);journal.current=null;setRecovery({epoch,ready:true,failed:false,restored:false,value:null});}store!.clearDraft(key);store!.clearDraft(detailsKey);store!.setViewState(key+':person','');if(file.current)URL.revokeObjectURL(file.current.url);file.current=null;setLocal(null);setDetails(null);redraw(n=>n+1);},
  };
}
export type SubjectPhotoDraft=ReturnType<typeof useSubjectPhotoDraft>;
