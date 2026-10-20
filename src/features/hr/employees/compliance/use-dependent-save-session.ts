'use client';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {z} from 'zod';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {dependentMutationSchema,dependentSaveContract,type DependentMutation,type DependentSaveReceipt} from '@/lib/hr/dependent-contract';
import {mutateEmployeeDependent,reconcileDependentMutation} from '@/server/actions/hr/dependent-mutation';
import type {DependentSaveResult} from '@/server/dependent-save';
const receiptSchema=z.object({id:z.number().int().positive(),employee_id:z.number().int().positive(),operation_id:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).strict();
const pendingSchema=z.object({request:dependentMutationSchema,contract:dependentSaveContract}).strict();
const retiredSchema=z.object({operationId:z.string().uuid(),employeeId:z.number().int().positive(),id:z.number().int().positive().nullable()}).strict();
const stateSchema=z.object({authority:z.string(),pending:pendingSchema.nullable(),receipt:receiptSchema.nullable(),retired:retiredSchema.nullable()}).strict();
type ControllerScope={store:ReturnType<typeof useWorkspaceDraftStoreContext>;ownerId:string|undefined;actorId:number|undefined;authority:string;employeeId:number;consumer:string};
function createDependentController({store,ownerId,actorId,authority,employeeId,consumer}:ControllerScope){

  const key=actorId&&ownerId?`draft:tab:${ownerId}:f11-dependent:${actorId}:${employeeId}:${consumer}`:null;
  let state:z.infer<typeof stateSchema>={authority,pending:null,receipt:null,retired:null},blocked=!store||!key,error:string|null=null;
  const persist=()=>{if(blocked||!store||!key)throw Error('Recovery storage unavailable');store.setViewState(key,JSON.stringify(state));};
  const verify=()=>{const raw=key?store?.getViewState(key):undefined;if(raw===undefined||JSON.stringify(stateSchema.parse(JSON.parse(raw)))!==JSON.stringify(state)){blocked=true;throw Error('Retained request changed; reconcile before another save.');}};
  const retire=()=>{if(state.pending){const p=state.pending;state={authority:state.authority,pending:null,receipt:null,retired:{operationId:p.contract.operationId,employeeId:p.request.employeeId,id:p.request.id}};try{persist();}catch{blocked=true;}}blocked=true;};
  try{const raw=key?store?.getViewState(key):undefined;if(raw!==undefined)state=stateSchema.parse(JSON.parse(raw));if(state.authority!==authority){if(state.pending)retire();else if(!state.retired)state={authority,pending:null,receipt:null,retired:null};}if(!blocked)persist();}catch{blocked=true;error='Retained dependent request cannot be verified.';}
  return {get state(){return state;},get blocked(){return blocked||!!state.retired;},get error(){return error;},retire,
   prepare(request:DependentMutation){if(blocked||state.retired||request.employeeId!==employeeId)throw Error('An earlier dependent request needs reconciliation.');verify();if(state.receipt)throw Error('Start a new reviewed operation before another save.');if(state.pending){if(JSON.stringify(state.pending.request)!==JSON.stringify(request))throw Error('The original request is unconfirmed. Retry it before changing fields or documents.');return structuredClone(state.pending);}
    state.pending=pendingSchema.parse({request,contract:{operationId:crypto.randomUUID(),revision:request.revision,addDocumentIds:request.addDocumentIds,removeDocumentIds:request.removeDocumentIds}});persist();return structuredClone(state.pending);
   },
   reject(){verify();state.pending=null;persist();},
   accept(receipt:DependentSaveReceipt){verify();if(!state.pending||receipt.operation_id!==state.pending.contract.operationId||receipt.employee_id!==employeeId||(state.pending.request.id!==null&&receipt.id!==state.pending.request.id))throw Error('Receipt mismatch');state={authority,pending:null,receipt:receiptSchema.parse(receipt),retired:null};persist();},
   acceptRetired(receipt:DependentSaveReceipt){verify();if(!state.retired||receipt.operation_id!==state.retired.operationId||receipt.employee_id!==state.retired.employeeId||(state.retired.id!==null&&receipt.id!==state.retired.id))throw Error('Recovery mismatch');state={authority,pending:null,receipt:receiptSchema.parse(receipt),retired:null};blocked=false;persist();},
   startNew(){if(blocked||state.pending||state.retired)return false;try{verify();state={authority,pending:null,receipt:null,retired:null};persist();return true;}catch{blocked=true;return false;}},
   fail(message:string){error=message;},
  };

}
/** Account/tab-owned memory. Unknown outcomes never acquire a fresh operation.
 * A verified authority change removes raw payloads and leaves only an opaque
 * recovery marker; no automatic replay across a privacy boundary. */
export function useDependentSaveSession(employeeId:number,actorId:number|undefined,authority:string,generation:object,consumer:string){
 const store=useWorkspaceDraftStoreContext(),ownerId=useWorkspaceFormOwner()?.id;
 const scope=useMemo(()=>({store,ownerId,actorId,authority,generation}),[store,ownerId,actorId,authority,generation]);
 const live=useRef(scope),mounted=useRef(false),flight=useRef(false),[,redraw]=useState(0),[saving,setSaving]=useState(false);
 const session=useMemo(()=>createDependentController({store,ownerId,actorId,authority,employeeId,consumer}),[store,ownerId,actorId,authority,employeeId,consumer]);
 useLayoutEffect(()=>{mounted.current=true;live.current={store,ownerId,actorId,authority,generation};if(store!==scope.store||ownerId!==scope.ownerId||actorId!==scope.actorId||authority!==scope.authority||generation!==scope.generation)session.retire();return()=>{mounted.current=false;};},[store,ownerId,actorId,authority,generation,scope,session]);
 const isCurrent=()=>mounted.current&&live.current.store===scope.store&&live.current.ownerId===scope.ownerId&&live.current.actorId===scope.actorId&&live.current.authority===scope.authority&&live.current.generation===scope.generation;
 const submit=async(request:DependentMutation):Promise<DependentSaveResult>=>{
  if(flight.current||!isCurrent()||session.blocked)return {success:false,error:'Dependent save paused; reconcile the retained operation first.'};
  const recovering=!!session.state.pending;let dispatched=false;flight.current=true;setSaving(true);
  try{const p=session.prepare(request);dispatched=true;const result=await mutateEmployeeDependent(p.request,p.contract);
   if(!result.success){if(!isCurrent())return {success:false,uncertain:true,error:'Save result belongs to an earlier access context.'};if(!recovering&&!result.uncertain)session.reject();session.fail(result.error??'Save unconfirmed. Retry the original request.');return {...result,uncertain:recovering||result.uncertain};}
   const receipt=receiptSchema.parse(result.data);
   if(receipt.operation_id!==p.contract.operationId||receipt.employee_id!==employeeId||(p.request.id!==null&&receipt.id!==p.request.id))throw Error('Receipt identity mismatch');
   // A verified committed fact can invalidate the old subject's read family,
   // but must never acknowledge, restore private fields, close or update the
   // replacement editor. Retain its opaque reconciliation boundary.
   if(!isCurrent())return {success:true,data:receipt,retired:true};
   try{session.accept(receipt);}catch{session.fail('Saved, but local acknowledgement failed. Check the saved dependent before another save.');}
   return {...result,data:receipt};
  }catch{session.fail(dispatched||recovering?'Save unconfirmed. Retry the original request before another change.':'Retained request or recovery storage could not be verified.');return {success:false,uncertain:dispatched||recovering,error:session.error??'Dependent save paused'};}
  finally{flight.current=false;if(isCurrent()){setSaving(false);redraw(n=>n+1);}}
 };
 const renderCurrent=store===scope.store&&ownerId===scope.ownerId&&actorId===scope.actorId&&authority===scope.authority&&generation===scope.generation;
 return {submit,saving,isCurrent,pending:renderCurrent?session.state.pending:null,get receipt(){return isCurrent()?session.state.receipt:null;},blocked:session.blocked||!renderCurrent,error:session.error,
  retired:renderCurrent?session.state.retired:null,
  get hasPending(){return !!session.state.pending;},
  startNew(){const ready=isCurrent()&&session.startNew();if(ready)redraw(n=>n+1);return ready;},
  retry(){return session.state.pending?submit(structuredClone(session.state.pending.request)):Promise.resolve({success:false,error:'No replayable request remains. Review the opaque recovery marker.'} as DependentSaveResult);},
  async reconcileRetired():Promise<DependentSaveResult>{
   if(flight.current||!isCurrent()||!session.state.retired)return {success:false,error:'No recoverable operation is available.'};
   flight.current=true;setSaving(true);
   try{const result=await reconcileDependentMutation(session.state.retired.operationId);if(!isCurrent())return {success:false,uncertain:true,error:'Recovery belongs to an earlier access context.'};if(result.success&&result.data)session.acceptRetired(result.data);else session.fail(result.error??'Earlier request remains unresolved');return result;}
   catch{return {success:false,uncertain:true,error:'Recovery could not be confirmed. No payload was replayed.'};}
   finally{flight.current=false;if(isCurrent()){setSaving(false);redraw(n=>n+1);}}
  },
 };
}
