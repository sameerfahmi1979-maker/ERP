"use client";
import {useRef,useState} from 'react';
import {toast} from 'sonner';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';

/** Keeps one non-secret configuration operation until its outcome is confirmed. */
export function useProviderFlagChange<P extends object>(save:(code:string,payload:P,contract:WorkspaceSaveContract)=>Promise<WorkspaceSaveResult>,refresh:()=>void){
 const flight=useRef(false);
 const pending=useRef<{code:string;payload:P;contract:WorkspaceSaveContract;hadUnknown:boolean}|null>(null);
 const [busy,setBusy]=useState(false);
 const [uncertain,setUncertain]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [refreshError,setRefreshError]=useState<string|null>(null);
 // Refresh is presentation-only: it must never alter an unresolved mutation.
 const refreshSettings=()=>{
  try{refresh();setRefreshError(null);}
  catch{setRefreshError('Setting saved, but settings could not be refreshed. Refresh settings to load the latest values.');}
 };
 const run=async()=>{
  if(flight.current||!pending.current)return;
  flight.current=true;setBusy(true);setError(null);
  try{
   const request=pending.current;
   let result:WorkspaceSaveResult;
   try{result=await save(request.code,request.payload,request.contract);}
   catch{request.hadUnknown=true;setUncertain(true);setError('Setting save unconfirmed. Retry the same operation to check its result; other changes are paused.');return;}
   if(!result.success&&(result.uncertain||request.hadUnknown)){request.hadUnknown=true;setUncertain(true);setError('Setting save unconfirmed. Retry the same operation to check its result; other changes are paused.');return;}
   pending.current=null;setUncertain(false);
   if(result.success){
    try{toast.success('Setting saved.');}catch{/* A notification cannot change a confirmed outcome. */}
    refreshSettings();
   }else setError(result.error??'The setting change was not accepted. Refresh the record before trying again.');
  }
  finally{flight.current=false;setBusy(false);}
 };
 return {busy,uncertain,error,refreshError,retryRefresh:()=>{if(!flight.current)refreshSettings();},retry:run,change:async(code:string,revision:string|undefined,payload:P)=>{
  if(flight.current||pending.current)return;
  if(!revision){setError('The setting revision is unavailable. Refresh settings before changing it.');return;}
  pending.current={code,payload:structuredClone(payload),contract:{operationId:crypto.randomUUID(),revision},hadUnknown:false};await run();
 }};
}
