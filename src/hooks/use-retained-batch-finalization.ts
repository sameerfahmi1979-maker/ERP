'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {aiApprovalInputSchema,type AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
type Result={success:boolean;data?:{documentId:number;documentNo:string};error?:string};
type Recovery={success:boolean;data?:AiApprovalInput|null;error?:string};
type Options={enabled:boolean;sessionId:number;recover:(id:number)=>Promise<Recovery>;submit:(input:AiApprovalInput)=>Promise<Result>};
/** Server-retained original request, never localStorage or an unowned cache.
 * A failed discovery is not an empty ledger; retired owners publish nothing. */
export function useRetainedBatchFinalization({enabled,sessionId,recover,submit}:Options){
 const owner=useReadCacheOwner();
 const epoch=useMemo(()=>({enabled,sessionId,owner}),[enabled,sessionId,owner]);
 type Lease={epoch:typeof epoch;retired:boolean;request:AiApprovalInput|null;loading:boolean;blocked:boolean;flight:boolean};
 const active=useRef<Lease|null>(null);
 const [view,setView]=useState<{epoch:typeof epoch;request:AiApprovalInput|null;loading:boolean;blocked:boolean;busy:boolean}>({epoch,request:null,loading:enabled,blocked:false,busy:false});
 const current=(lease:Lease)=>active.current===lease&&!lease.retired&&lease.epoch===epoch&&enabled&&!!owner?.identity&&owner.isLive()&&owner.admits(owner.identity);
 const publish=(lease:Lease)=>{if(current(lease))setView({epoch,request:lease.request,loading:lease.loading,blocked:lease.blocked,busy:lease.flight});};
 useEffect(()=>{
  const lease:Lease={epoch,retired:false,request:null,loading:enabled,blocked:false,flight:false};active.current=lease;
  if(enabled)void (async()=>{
   try{
    if(!current(lease))return;
    const response=await recover(sessionId);if(!current(lease))return;
    if(!response.success)throw Error('Recovery unavailable');
    if(response.data!==null){const p=aiApprovalInputSchema.safeParse(response.data);if(!p.success||p.data.prepared||p.data.uploadSessionId!==sessionId)throw Error('Wrong retained request');lease.request=p.data;}
    lease.loading=false;publish(lease);
   }catch{lease.loading=false;lease.blocked=true;publish(lease);}
  })();
  return()=>{lease.retired=true;lease.request=null;};
  // Each owner activation has its own non-revivable lease. Functions are stable
  // server actions; changing them is not a fresh account/authority grant.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[epoch]);
 const live=!!owner?.identity&&owner.isLive()&&owner.admits(owner.identity);
 const state=view.epoch===epoch&&live?view:{epoch,request:null,loading:enabled,blocked:enabled&&!live,busy:false};
 async function run(input:unknown):Promise<Result|null>{
  const lease=active.current;
  if(!lease||!current(lease)||lease.loading||lease.blocked||lease.flight)return null;
  const p=aiApprovalInputSchema.safeParse(lease.request??input);
  if(!p.success||p.data.uploadSessionId!==sessionId||p.data.prepared)return null;
  lease.request=p.data;lease.flight=true;publish(lease);
  let result:Result;
  try{result=await submit(p.data);}catch{result={success:false,error:'Finalization is unconfirmed. Retry the retained original request.'};}
  if(!current(lease))return null;
  lease.flight=false;publish(lease);
  return result;
 }
 return {run,pending:!!state.request,loading:state.loading,blocked:state.blocked,busy:state.busy,
  isCurrent:()=>!!active.current&&current(active.current)};
}
