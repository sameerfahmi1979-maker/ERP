"use client";
import {useLayoutEffect,useRef,useState} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {buildDmsSelectedZip,type DmsZipFile} from '@/lib/dms/selected-download';
export function useDmsSelectedDownload(){
 const owner=useReadCacheOwner(),flight=useRef<AbortController|null>(null);
 const key=JSON.stringify([owner?.generation,owner?.identity]),epoch=useRef(key);
 const [state,setState]=useState({key,busy:false,progress:'',error:null as string|null});
 const view=state.key===key?state:{key,busy:false,progress:'',error:null};
 const setBusy=(busy:boolean)=>setState(old=>({...old,key,busy}));
 const setProgress=(progress:string)=>setState(old=>({...old,key,progress}));
 const setError=(error:string|null)=>setState(old=>({...old,key,error}));
 useLayoutEffect(()=>{epoch.current=key;return()=>{epoch.current='retired';flight.current?.abort();flight.current=null;};},[key]);
 const download=async(load:()=>Promise<DmsZipFile[]>)=>{
  if(flight.current||!owner?.identity||!owner.isLive()||!owner.admits(owner.identity))return;
  const controller=new AbortController();flight.current=controller;setBusy(true);setError(null);setProgress('Checking selected files…');
  const current=()=>epoch.current===key&&flight.current===controller&&!controller.signal.aborted&&owner.isLive()&&owner.admits(owner.identity);
  try{
   const files=await load();if(!current())return;
   const blob=await buildDmsSelectedZip(files,{signal:controller.signal,isCurrent:current,onProgress:(done,total)=>{if(current())setProgress(`Downloaded ${done} of ${total} files; preparing ZIP…`);}});
   if(!current())return;const url=URL.createObjectURL(blob),link=document.createElement('a');
   try{link.href=url;link.download='DMS-selected-files.zip';document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   setProgress(`ZIP ready: ${files.length} files.`);
  }catch(e){if(current())setError(e instanceof Error?e.message:'Selected files could not be downloaded.');}
  finally{if(flight.current===controller){flight.current=null;setBusy(false);}}
 };
 return {download,...view,cancel:()=>{flight.current?.abort();setProgress('Download cancelled.');}};
}
