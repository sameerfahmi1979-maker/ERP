import{z}from'zod';
import type{WorkspaceDraftStoreApi}from'@/lib/workspace/workspace-draft-types';
import{recruitmentLifecycleKind,recruitmentLifecycleRequest,recruitmentLifecycleReceipt,type RecruitmentLifecycleKind,type RecruitmentLifecycleRequest,type RecruitmentLifecycleReceipt}from'./recruitment-lifecycle-contract';
const marker=z.object({operation:z.string().uuid(),kind:recruitmentLifecycleKind,candidate:z.number().nullable(),employee:z.number().nullable(),id:z.number().nullable()}).strict();
const retained=z.object({authority:z.string(),pending:z.object({operation:z.string().uuid(),request:recruitmentLifecycleRequest}).strict().nullable(),retired:marker.nullable(),receipt:recruitmentLifecycleReceipt.nullable()}).strict();
/** F04 memory only. Identifiers survive retirement, never private payloads.
 * The database's actor-owned immutable receipt is the durable authority. */
export function createRecruitmentOperationState(store:WorkspaceDraftStoreApi|null,actor:string,authority:string,candidate:number|null,employee:number|null,kind:RecruitmentLifecycleKind){
 const key=`f12-hiring:v1:${actor}:${candidate??'-'}:${employee??'-'}:${kind}`;
 let state:z.infer<typeof retained>={authority,pending:null,retired:null,receipt:null},blocked=!store;
 const persist=()=>{if(!store)throw Error('Recovery memory unavailable');store.setViewState(key,JSON.stringify(state));};
 const verify=()=>{try{if(!store||JSON.stringify(retained.parse(JSON.parse(store.getViewState(key)??'null')))!==JSON.stringify(retained.parse(state)))throw Error('Recovery memory changed');}catch{blocked=true;throw Error('Recovery memory changed');}};
 const matches=(r:RecruitmentLifecycleRequest)=>r.kind===kind&&r.candidateId===candidate&&(r.employeeId??null)===employee;
 const receiptMatches=(r:RecruitmentLifecycleReceipt,op:string,id:number|null)=>r.kind===kind&&r.candidate_id===candidate&&r.employee_id===employee&&r.operation_id===op&&(id===null||r.id===id);
 const retire=()=>{if(!state.pending)return;verify();const p=state.pending;state={authority,pending:null,receipt:null,retired:{operation:p.operation,kind,candidate,employee,id:p.request.id}};persist();blocked=true;};
 try{
  const raw=store?.getViewState(key);if(raw!==undefined)state=retained.parse(JSON.parse(raw));
  if(state.pending&&!matches(state.pending.request)||state.retired&&(state.retired.kind!==kind||state.retired.candidate!==candidate||state.retired.employee!==employee)||state.receipt&&(state.receipt.kind!==kind||state.receipt.candidate_id!==candidate||state.receipt.employee_id!==employee))throw Error('Wrong recovery subject');
  if(state.authority!==authority){if(state.pending)retire();else if(!state.retired)state={authority,pending:null,retired:null,receipt:null};}
  if(!blocked)persist();
 }catch{blocked=true;}
 return{key,get blocked(){return blocked||!!state.retired;},get pending(){return state.pending;},get retired(){return state.retired;},get receipt(){return state.receipt;},
  prepare(raw:RecruitmentLifecycleRequest){if(blocked||state.retired)throw Error('Earlier recovery is unresolved');verify();const r=recruitmentLifecycleRequest.parse(raw);if(!matches(r))throw Error('Wrong command subject');if(state.receipt)throw Error('Begin a newly reviewed opening');if(state.pending){if(JSON.stringify(state.pending.request)!==JSON.stringify(r))throw Error('Unknown original outcome: altered retry refused');return structuredClone(state.pending);}state.pending={operation:crypto.randomUUID(),request:r};persist();return structuredClone(state.pending);},
  reject(){verify();state.pending=null;persist();},
  accept(raw:RecruitmentLifecycleReceipt){verify();const r=recruitmentLifecycleReceipt.parse(raw),p=state.pending;if(!p||!receiptMatches(r,p.operation,p.request.id))throw Error('Receipt mismatch');state={authority,pending:null,retired:null,receipt:r};persist();},
  retire,
  reconcile(raw:RecruitmentLifecycleReceipt){verify();const r=recruitmentLifecycleReceipt.parse(raw),p=state.retired;if(!p||!r.replayed||!receiptMatches(r,p.operation,p.id))throw Error('Retired receipt mismatch');state={authority,pending:null,retired:null,receipt:r};blocked=false;persist();},
  startNew(){if(blocked||state.retired||state.pending)return false;verify();state={authority,pending:null,retired:null,receipt:null};persist();return true;},
 };
}
