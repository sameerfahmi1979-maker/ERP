'use client';
import{useLayoutEffect,useMemo,useRef,useState}from'react';
import type{AuthContext}from'@/lib/rbac/check';
import{candidateRecordIdentity}from'@/lib/reads/hr-candidate-record-schema';
import{useWorkspaceDraftStoreContext}from'@/components/workspace/workspace-draft-provider';
import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{useHrChildOwnerLifetime}from'../employees/use-hr-child-owner-lifetime';
import{createRecruitmentOperationState}from'@/lib/hr/recruitment-operation-state';
import type{RecruitmentLifecycleKind,RecruitmentLifecycleRequest,RecruitmentLifecycleResult}from'@/lib/hr/recruitment-lifecycle-contract';
import{mutateRecruitmentLifecycle,reconcileRecruitmentLifecycle}from'@/server/actions/hr/recruitment-lifecycle';
export function useRecruitmentLifecycle(ctx:AuthContext,candidate:number|null,employee:number|null,kind:RecruitmentLifecycleKind){
 const store=useWorkspaceDraftStoreContext(),actor=String(ctx.profile?.id??''),authority=candidateRecordIdentity(ctx),identity=`${actor}:${authority}:${candidate}:${employee}:${kind}`;
 const controller=useMemo(()=>createRecruitmentOperationState(store,actor,authority,candidate,employee,kind),[store,actor,authority,candidate,employee,kind]),life=useReadLifetime(identity),owner=useHrChildOwnerLifetime(identity);
 const flight=useRef(false),mounted=useRef(false),[busy,setBusy]=useState(false),[,redraw]=useState(0),[error,setError]=useState<string|null>(null);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)try{controller.retire();}catch{/* Keep an unresolved marker blocked, never replay it. */}});},[controller,owner]);
 const submit=async(request:RecruitmentLifecycleRequest):Promise<RecruitmentLifecycleResult>=>{
  if(flight.current||!life.active||controller.blocked)return{success:false,error:'Current access or original recovery must be verified.'};
  const wasPending=!!controller.pending;let dispatched=false;flight.current=true;setBusy(true);
  try{const p=controller.prepare(request);dispatched=true;const r=await mutateRecruitmentLifecycle(p.request,p.operation);if(!life.active)return{success:false,uncertain:true,error:'Earlier opening retired. Check its receipt without replaying private fields.'};if(!r.success){if(!wasPending&&!r.uncertain)controller.reject();setError(r.error??'Original outcome unconfirmed.');return{...r,uncertain:wasPending||r.uncertain};}if(!r.data)throw Error('Missing receipt');controller.accept(r.data);setError(null);return r;}
  catch{const message=dispatched||wasPending?'Original outcome unconfirmed. Retry only unchanged values or check its receipt.':'Opening or recovery invalid. No request was sent.';if(life.active)setError(message);return{success:false,uncertain:dispatched||wasPending,error:message};}
  finally{flight.current=false;if(mounted.current)setBusy(false);if(life.active)redraw(v=>v+1);}
 };
 const reconcile=async()=>{if(flight.current||!life.active||!controller.retired)return;flight.current=true;setBusy(true);try{const r=await reconcileRecruitmentLifecycle(controller.retired.operation);if(!life.active)return;if(r.success&&r.data){controller.reconcile(r.data);setError('Original save confirmed. Reopen the latest record.');}else setError(r.error??'Outcome unresolved.');}catch{if(life.active)setError('Receipt unavailable. No fields replayed.');}finally{flight.current=false;if(life.active){setBusy(false);redraw(v=>v+1);}}};
 return{submit,reconcile,busy,error,pending:controller.pending,retired:controller.retired,blocked:controller.blocked,isCurrent:()=>life.active,startNew:()=>controller.startNew(),retire:()=>{try{controller.retire();redraw(v=>v+1);return true;}catch{setError('Recovery is unresolved.');return false;}}};
}
