'use client';
import {useLayoutEffect,useMemo,useRef} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {singleUploadRequestSchema,sameSingleUploadRequest,type SingleUploadRequest,type UploadOwningScope} from '@/lib/dms/single-upload-admission';
import type {CreateUploadSessionInput} from '@/server/actions/dms/upload-sessions';

/** Retain only strict metadata and the F04 operation identity. Never retain File
 * bytes, signed capabilities, passwords or Auth session tokens in draft JSON. */
export function useDmsSingleUploadAdmission(context?:{entityType:string;entityId:number}|null,scope?:UploadOwningScope|null){
 const store=useWorkspaceDraftStoreContext(),ownerId=useWorkspaceFormOwner()?.id??null,readOwner=useReadCacheOwner();
 const contextKey=JSON.stringify(context??null);
 const scopeKey=JSON.stringify(scope??null);
 const key=`draft:tab:${ownerId}:f07-single-upload:${contextKey}`;
 const epoch=useMemo(()=>({store,ownerId,readOwner,key,scopeKey}),[store,ownerId,readOwner,key,scopeKey]);
 const live=useRef<{epoch:typeof epoch;retired:boolean;flight:object|null}|null>(null);
 useLayoutEffect(()=>{const lease={epoch,retired:false,flight:null};live.current=lease;return()=>{lease.retired=true;};},[epoch]);
 const current=(lease:NonNullable<typeof live.current>)=>live.current===lease&&!lease.retired&&lease.epoch===epoch&&!!store&&!!ownerId&&
  !!readOwner?.identity&&readOwner.isLive()&&readOwner.admits(readOwner.identity);
 const retainedScope=()=>{try{const raw=store?.getDraft(key)?.request;return raw===undefined?null:singleUploadRequestSchema.parse(JSON.parse(raw)).scope??null;}catch{return null;}};
 return {
  get pending(){return store?.getDraft(key)?.request!==undefined;},
  get retainedScope(){return retainedScope();},
  begin(input:CreateUploadSessionInput){
   const lease=live.current;
   if(!lease||!current(lease)||lease.flight)throw Error('Upload ownership is unavailable or an upload is still in progress.');
   const retained=store!.getDraft(key)?.request;
   const previous=retained===undefined?null:singleUploadRequestSchema.parse(JSON.parse(retained));
   let request=singleUploadRequestSchema.parse({version:1,operationId:previous?.operationId??crypto.randomUUID(),authUserId:readOwner!.identity!.authUserId,
    metadata:input,context:context??null,...((scope??previous?.scope)?{scope:scope??previous!.scope}:{})});
   if(previous&&!sameSingleUploadRequest(previous,request))throw Error('An earlier upload is unconfirmed. Reselect its exact original file in this workspace before starting a different upload.');
   let raw=JSON.stringify(request);
   store!.setDraft(key,{request:raw});
   if(store!.getDraft(key)?.request!==raw)throw Error('The upload request could not be retained. Nothing was sent.');
   const token={};lease.flight=token;
   const valid=()=>current(lease)&&lease.flight===token&&store!.getDraft(key)?.request===raw;
   return {get request(){return request;},isCurrent:valid,
    recover(value:SingleUploadRequest){
      if(!valid())return false;
      const recovered=singleUploadRequestSchema.parse(value);
      if(!sameSingleUploadRequest({...recovered,operationId:request.operationId},request))throw Error('Recovered upload identity differs from the selected file or owner.');
      const next=JSON.stringify(recovered);store!.setDraft(key,{request:next});
      if(store!.getDraft(key)?.request!==next)throw Error('Recovered identity could not be retained.');
      request=recovered;raw=next;return true;
    },
    confirmed(){if(!valid())return false;store!.clearDraft(key);return true;},
    settled(){if(current(lease)&&lease.flight===token)lease.flight=null;},
   };
  },
 };
}
