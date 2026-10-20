import{z}from 'zod';
import type{WorkspaceDraftStoreApi}from '@/lib/workspace/workspace-draft-types';
import{childKind,childMutationSchema,childSaveContract,childReceiptSchema,type ChildKind,type ChildMutation,type ChildReceipt}from './child-save-contract';
const opaque=z.object({operationId:z.string().uuid(),kind:childKind,employeeId:z.number().int().positive(),caseId:z.number().int().positive().safe().optional(),id:z.number().int().positive().nullable()}).strict().refine(value=>value.kind==='clearance'?value.caseId!==undefined:value.caseId===undefined);
const retained=z.object({version:z.literal(1),authority:z.string(),pending:z.object({request:childMutationSchema,contract:childSaveContract}).strict().nullable(),retired:opaque.nullable(),receipt:childReceiptSchema.nullable()}).strict();
export const childOperationKey=(actor:string,employeeId:number,kind:string,caseId?:number)=>`f11-child:v1:${actor}:${employeeId}:${kind}${kind==='clearance'?`:case:${caseId}`:''}`;
const requestCase=(request:ChildMutation)=>request.kind==='clearance'?(request.values as {eos_case_id?:number}).eos_case_id:undefined;
export const childOperationIndex=(actor:string)=>`f11-child-index:v1:${actor}`;
export function childOperationKeys(store:WorkspaceDraftStoreApi,actor:string):string[]|null{
 const raw=store.getViewState(childOperationIndex(actor));if(raw===undefined)return[];
 try{const keys=z.array(z.string()).max(1000).parse(JSON.parse(raw));return keys.every(key=>key.startsWith(`f11-child:v1:${actor}:`))&&new Set(keys).size===keys.length?keys:null;}catch{return null;}
}
export function childRecoveryMarkers(store:WorkspaceDraftStoreApi,actor:string){
 const keys=childOperationKeys(store,actor);if(keys===null)return null;
 try{return keys.flatMap(key=>{
  const raw=store.getViewState(key);if(raw===undefined)return[];const state=retained.parse(JSON.parse(raw));
  const subject=state.retired?{employee:state.retired.employeeId,kind:state.retired.kind,caseId:state.retired.caseId}:state.pending?{employee:state.pending.request.employeeId,kind:state.pending.request.kind,caseId:requestCase(state.pending.request)}:state.receipt?{employee:state.receipt.employee_id,kind:state.receipt.kind,caseId:state.receipt.eos_case_id}:null;
  if(subject&&(subject.kind==='clearance'&&!z.number().int().positive().safe().safeParse(subject.caseId).success||key!==childOperationKey(actor,subject.employee,subject.kind,subject.caseId)))throw Error('Recovery subject mismatch');
  return state.retired?[{key,...state.retired}]:[];
 });}catch{return null;}
}
/** Typed account-owned memory only. No disk, files or cross-authority replay.
 * The native transaction owns the durable receipt and mandatory audit. */
export function createChildOperationState(store:WorkspaceDraftStoreApi|null,actor:string,authority:string,employeeId:number,kind:ChildKind,caseId?:number){
 const key=childOperationKey(actor,employeeId,kind,caseId);let state:z.infer<typeof retained>={version:1,authority,pending:null,retired:null,receipt:null},blocked=!store,error:string|null=store?null:'Recovery memory is unavailable. Reopen this workspace before changing the record.';
 const sameCase=(value:number|undefined)=>kind==='clearance'?value===caseId:value===undefined;
 const verify=()=>{if(!store||JSON.stringify(retained.parse(JSON.parse(store.getViewState(key)??'null')))!==JSON.stringify(state)||childOperationKeys(store,actor)===null){blocked=true;throw Error('Retained recovery state changed or is unverified.');}};
 const persist=()=>{if(!store)throw Error('Recovery memory is unavailable.');const keys=childOperationKeys(store,actor);if(keys===null)throw Error('Recovery index is unverified.');store.setViewState(key,JSON.stringify(state));if(!keys.includes(key))store.setViewState(childOperationIndex(actor),JSON.stringify([...keys,key]));};
 const retire=()=>{if(!state.pending)return;verify();const p=state.pending;state={...state,pending:null,receipt:null,retired:{operationId:p.contract.operationId,kind,employeeId,...(kind==='clearance'?{caseId}:{}),id:p.request.id}};persist();blocked=true;};
 try{
  const raw=store?.getViewState(key);if(raw!==undefined)state=retained.parse(JSON.parse(raw));
  if(kind==='clearance'?!z.number().int().positive().safe().safeParse(caseId).success:caseId!==undefined)throw Error('Original case binding is missing or invalid');
  if(state.pending&&(state.pending.request.employeeId!==employeeId||state.pending.request.kind!==kind||state.pending.request.revision!==state.pending.contract.revision||!sameCase(requestCase(state.pending.request)))||state.retired&&(state.retired.employeeId!==employeeId||state.retired.kind!==kind||!sameCase(state.retired.caseId))||state.receipt&&(state.receipt.employee_id!==employeeId||state.receipt.kind!==kind||!sameCase(state.receipt.eos_case_id)))throw Error('Recovery subject mismatch');
  if(store&&childOperationKeys(store,actor)===null)throw Error('Recovery index mismatch');
  if(state.authority!==authority){if(state.pending)retire();else if(!state.retired)state={version:1,authority,pending:null,retired:null,receipt:null};}
  if(store&&!blocked)persist();
 }catch{blocked=true;error='Retained child operation could not be verified. No request will be sent.';}
 return{key,get pending(){return state.pending;},get retired(){return state.retired;},get receipt(){return state.receipt;},get error(){return error;},get blocked(){return blocked||state.retired!==null;},
  prepare(request:ChildMutation){if(blocked||state.retired)throw Error('Reconcile the earlier operation before another change.');verify();const r=childMutationSchema.parse(request);if(r.employeeId!==employeeId||r.kind!==kind||!sameCase(requestCase(r)))throw Error('Child subject mismatch');if(state.receipt)throw Error('Begin a new reviewed operation before saving again.');if(state.pending){if(JSON.stringify(state.pending.request)!==JSON.stringify(r))throw Error('The earlier outcome is unknown. Keep its original values.');return structuredClone(state.pending);}state.pending={request:r,contract:{operationId:crypto.randomUUID(),revision:r.revision}};persist();return structuredClone(state.pending);},
  reject(){verify();state.pending=null;persist();},
  accept(raw:ChildReceipt){verify();const r=childReceiptSchema.parse(raw),p=state.pending;if(!p||r.employee_id!==employeeId||r.kind!==kind||!sameCase(r.eos_case_id)||r.operation_id!==p.contract.operationId||(p.request.id!==null&&r.id!==p.request.id))throw Error('Receipt does not identify this operation.');state={version:1,authority,pending:null,retired:null,receipt:r};persist();},
  retire,
  reconcile(raw:ChildReceipt){verify();const r=childReceiptSchema.parse(raw),p=state.retired;if(!p||!r.replayed||r.employee_id!==p.employeeId||r.kind!==p.kind||r.eos_case_id!==p.caseId||r.operation_id!==p.operationId||(p.id!==null&&r.id!==p.id))throw Error('Retired receipt mismatch');state={version:1,authority,pending:null,retired:null,receipt:r};blocked=false;persist();},
  startNew(){if(blocked||state.pending||state.retired)return false;verify();state={version:1,authority,pending:null,retired:null,receipt:null};persist();return true;},
 };
}
