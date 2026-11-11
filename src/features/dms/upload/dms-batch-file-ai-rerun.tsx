"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {useReadCacheOwner,type ReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {getBatchDraftFileForAiRerun} from '@/server/actions/dms/batch-intake';
import {DmsDocumentPreparationPanel} from '@/features/dms/documents/sections/dms-document-preparation-panel';
export function DmsBatchFileAiRerun({sessionId}:{sessionId:number}){
 const owner=useReadCacheOwner();
 if(!owner?.identity||!owner.isLive()||!owner.admits(owner.identity))return null;
 return <RerunSession key={JSON.stringify([sessionId,owner.identity,owner.generation])} sessionId={sessionId} owner={owner}/>;
}
function RerunSession({sessionId,owner}:{sessionId:number;owner:ReadCacheOwner}){
 const mounted=useRef(true),flight=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[source,setSource]=useState<{documentId:number;fileId:number}|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;}},[]);
 if(!owner?.identity||!owner.isLive()||!owner.admits(owner.identity))return null;
 if(source)return <DmsDocumentPreparationPanel documentId={source.documentId} selectedFileId={source.fileId} canRun initiallyOpen compact/>;
 return <span className="inline-flex flex-col gap-1"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={async()=>{
  if(flight.current)return;flight.current=true;setBusy(true);setError(null);
  try{const result=await getBatchDraftFileForAiRerun(sessionId);if(!mounted.current||!owner.isLive()||!owner.admits(owner.identity))return;
   if(result.success&&result.data)setSource(result.data);else setError(result.error??'The original file is unavailable.');
  }catch{if(mounted.current&&owner.isLive())setError('File verification is unavailable. No new AI request was started.');}
  finally{flight.current=false;if(mounted.current)setBusy(false);}
 }}> {busy?'Checking file…':'Run AI Pipeline'}</Button>{error&&<span role="alert" className="text-xs text-destructive max-w-64">{error}</span>}</span>;
}
