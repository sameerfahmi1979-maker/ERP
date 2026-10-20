'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {createChildOperationState} from '@/lib/hr/child-operation-state';
import {childReceiptSchema,type ChildMutation,type ChildReceipt,type ChildSaveResult} from '@/lib/hr/child-save-contract';
import type {ComplianceChildKind} from '@/lib/hr/compliance-child-contract';
import {mutateHrChild,reconcileHrChild} from '@/server/actions/hr/child-mutation';
import {useHrChildOwnerLifetime} from '../use-hr-child-owner-lifetime';

/** Compliance-only adapter: the accepted shared child session is unchanged.
 * Pending/retired requests cannot become new operations. Late results never
 * acknowledge, restore fields, close a form or replay across an owner boundary.
 * A verified committed identifier can only dirty its captured old cache. */
export function useComplianceOperationSession(actor:string,authority:string,employeeId:number,kind:ComplianceChildKind,cacheOnly:(r:ChildReceipt)=>void){
 const store=useWorkspaceDraftStoreContext(),identity=`${actor}:${authority}:${employeeId}:${kind}`;
 const controller=useMemo(()=>createChildOperationState(store,actor,authority,employeeId,kind),[store,actor,authority,employeeId,kind]);
 const lifetime=useReadLifetime(identity),owner=useHrChildOwnerLifetime(identity),flight=useRef(false),mounted=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(controller.error),[,redraw]=useState(0);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)try{controller.retire();}catch{/* Never overwrite unverified recovery state. */}});},[controller,owner]);
 const verifyReceipt=(raw:unknown,request:ChildMutation,operationId:string)=>{
  const r=childReceiptSchema.parse(raw);if(r.kind!==kind||r.employee_id!==employeeId||r.operation_id!==operationId||request.id!==null&&r.id!==request.id)throw Error('Receipt does not identify this original compliance operation.');return r;
 };
 const dirtyOldCache=(r:ChildReceipt)=>{try{cacheOnly(r);}catch{/* Not an acknowledgement and never a reason to replay. */}};
 const submit=async(request:ChildMutation):Promise<ChildSaveResult>=>{
  if(flight.current||!lifetime.active||controller.blocked||request.kind!==kind)return{success:false,error:'Reconcile the earlier compliance operation before another change.'};
  const wasPending=controller.pending!==null;let dispatched=false;flight.current=true;setBusy(true);
  try{
   const p=controller.prepare(request);dispatched=true;const result=await mutateHrChild(p.request,p.contract);
   const receipt=result.success?verifyReceipt(result.data,p.request,p.contract.operationId):null;
   if(!lifetime.active){if(receipt)dirtyOldCache(receipt);return{success:false,uncertain:true,retired:true,error:'The result belongs to an earlier access context. Check its identifier-only receipt.'};}
   if(!result.success){if(!wasPending&&!result.uncertain)controller.reject();setError(result.error??'The original compliance result remains unconfirmed.');return{...result,uncertain:wasPending||result.uncertain};}
   if(!receipt)throw Error('Missing receipt');
   try{controller.accept(receipt);}catch{dirtyOldCache(receipt);throw Error('The original memory changed. No current editor was acknowledged.');}
   setError(null);return{success:true,data:receipt};
  }catch{const message=dispatched||wasPending?'The result is unconfirmed. Retry only the original request or check its receipt.':'The retained operation could not be verified. No request was sent.';if(lifetime.active)setError(message);return{success:false,uncertain:dispatched||wasPending,...(!lifetime.active?{retired:true as const}:{}),error:message};}
  finally{flight.current=false;if(mounted.current)setBusy(false);if(lifetime.active)redraw(v=>v+1);}
 };
 const reconcile=async()=>{
  if(flight.current||!lifetime.active||!controller.retired)return;flight.current=true;setBusy(true);
  try{const result=await reconcileHrChild(controller.retired.operationId);if(!lifetime.active)return;if(result.success&&result.data){controller.reconcile(result.data);setError('Earlier save confirmed. Reopen the latest record before another change.');}else setError(result.error??'Earlier outcome remains unresolved.');}
  catch{if(lifetime.active)setError('Recovery remains unconfirmed. No private fields were replayed.');}
  finally{flight.current=false;if(lifetime.active){setBusy(false);redraw(v=>v+1);}}
 };
 const retireForLater=()=>{if(!lifetime.active)return false;try{controller.retire();redraw(v=>v+1);return true;}catch{setError('The original recovery marker could not be verified. Nothing was cleared or replayed.');return false;}};
 return{submit,reconcile,retireForLater,busy,error,get pending(){return controller.pending;},get retired(){return controller.retired;},get receipt(){return controller.receipt;},get blocked(){return controller.blocked;},startNew:()=>controller.startNew(),isCurrent:()=>lifetime.active};
}
