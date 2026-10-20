'use client';
import{useLayoutEffect,useMemo,useRef,useState}from 'react';
import{useWorkspaceDraftStoreContext}from '@/components/workspace/workspace-draft-provider';
import{useReadLifetime}from '@/hooks/use-read-lifetime';
import{createChildOperationState}from '@/lib/hr/child-operation-state';
import{childReceiptSchema,type ChildKind,type ChildMutation,type ChildSaveResult}from '@/lib/hr/child-save-contract';
import{mutateHrChild,reconcileHrChild}from '@/server/actions/hr/child-mutation';
import{useHrChildOwnerLifetime}from './use-hr-child-owner-lifetime';
export function useHrChildSession(actor:string,authority:string,employeeId:number,kind:ChildKind,caseId?:number){
 const store=useWorkspaceDraftStoreContext(),controller=useMemo(()=>createChildOperationState(store,actor,authority,employeeId,kind,caseId),[store,actor,authority,employeeId,kind,caseId]),lifetime=useReadLifetime(`${actor}:${authority}:${employeeId}:${kind}:${caseId??''}`),owner=useHrChildOwnerLifetime(`${actor}:${authority}:${employeeId}:${kind}:${caseId??''}`);
 const flight=useRef(false),mounted=useRef(false),[busy,setBusy]=useState(false),[,redraw]=useState(0),[error,setError]=useState<string|null>(controller.error);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)try{controller.retire();}catch{/* Never overwrite unverified recovery memory. */}});},[controller,owner]);
 const submit=async(request:ChildMutation):Promise<ChildSaveResult>=>{
  if(flight.current||!lifetime.active||controller.blocked)return{success:false,error:'Changes are paused until current access and recovery are verified.'};
  const wasPending=controller.pending!==null;let dispatched=false;flight.current=true;setBusy(true);
  try{
   const p=controller.prepare(request);dispatched=true;const result=await mutateHrChild(p.request,p.contract);
   if(!lifetime.active)return{success:false,uncertain:true,retired:true,error:'The result belongs to an earlier opening. Check its receipt without replaying private fields.'};
   if(!result.success){if(!wasPending&&!result.uncertain)controller.reject();setError(result.error??'The earlier result is unconfirmed.');return{...result,uncertain:wasPending||result.uncertain};}
   const receipt=childReceiptSchema.parse(result.data);controller.accept(receipt);setError(null);return{success:true,data:receipt};
  }catch{const message=dispatched||wasPending?'The result is unconfirmed. Retry only the original request or check its receipt.':'Opening or recovery information could not be verified. No request was sent.';if(lifetime.active)setError(message);return{success:false,uncertain:dispatched||wasPending,error:message};}
  finally{flight.current=false;if(mounted.current)setBusy(false);if(lifetime.active)redraw(v=>v+1);}
 };
 const reconcile=async()=>{
  if(flight.current||!lifetime.active||!controller.retired)return;flight.current=true;setBusy(true);
  try{const r=await reconcileHrChild(controller.retired.operationId);if(!lifetime.active)return;if(r.success&&r.data){controller.reconcile(r.data);setError('Earlier save confirmed. Reopen the latest record before further changes.');}else setError(r.error??'Earlier outcome remains unresolved.');}
  catch{if(lifetime.active)setError('Recovery remains unconfirmed. No private fields were replayed.');}
  finally{flight.current=false;if(lifetime.active){setBusy(false);redraw(v=>v+1);}}
 };
 const retireForLater=()=>{if(!lifetime.active)return false;try{controller.retire();redraw(v=>v+1);return true;}catch{setError('The recovery marker could not be verified. No request was resent or forgotten.');return false;}};
 return{submit,reconcile,retireForLater,busy,error,pending:controller.pending,retired:controller.retired,receipt:controller.receipt,blocked:controller.blocked,isCurrent:()=>lifetime.active,startNew:()=>controller.startNew()};
}
