import{z}from'zod';import type{WorkspaceDraftStoreApi}from'@/lib/workspace/workspace-draft-types';import{attendanceRosterRow,enteredAttendance,attendanceRowRequest,attendanceReceipt,type AttendanceRosterRow,type EnteredAttendance,type AttendanceRowRequest}from'./attendance-workbench-contract';
const draft=z.object({row:attendanceRosterRow,date:z.string(),values:enteredAttendance,reason:z.string(),request:attendanceRowRequest.nullable(),status:z.enum(['draft','uncertain','failed','conflict','saved']),error:z.string().nullable()}).strict();
const marker=z.object({operation:z.string().uuid(),employee:z.number(),id:z.number().nullable()}).strict();
const stored=z.object({authority:z.string(),drafts:z.record(z.string(),draft),retired:z.array(marker)}).strict();
type Stored = z.infer<typeof stored>;
type DraftEdit = { row: AttendanceRosterRow; value: EnteredAttendance; reason: string };

function editDraft(drafts: Stored['drafts'], retired: Stored['retired'], count: number, date: string, edit: DraftEdit) {
 const {row,value,reason}=edit;
 const id=`${row.employee_id}:${date}`,old=drafts[id];
 if(!old&&count>=500)throw Error('Save or review retained rows before adding more; none were evicted');
 if(old?.request||retired.some(r=>r.employee===row.employee_id))throw Error('Resolve original receipt before changing this row');
 if(old?.status==='conflict')throw Error('Review the current saved row explicitly before changing this conflicted draft');
 drafts[id]={row,date,values:enteredAttendance.parse(value),reason,request:null,status:'draft',error:null};
 return old ? count : count+1;
}
/** F04 memory only. A row keeps its original immutable request until confirmed;
 * scope retirement keeps opaque receipt identifiers, not employee/time fields. */
export function createAttendanceBatchState(store:WorkspaceDraftStoreApi|null,actor:string,owner:string,authority:string){
 const key=`draft:tab:${owner}:f12-time:v1:${actor}`;let state:Stored={authority,drafts:{},retired:[]},blocked=!store||!actor.trim()||!owner.trim();
 const persist=(next=state)=>{if(!store)throw Error('Private draft memory unavailable');store.setViewState(key,JSON.stringify(next));};
 const verify=()=>{try{if(!store||JSON.stringify(stored.parse(JSON.parse(store.getViewState(key)??'null')))!==JSON.stringify(state))throw Error('Original draft memory changed');}catch{blocked=true;throw Error('Original draft memory changed');}};
 try{const raw=store?.getViewState(key);if(raw!==undefined)state=stored.parse(JSON.parse(raw));if(state.authority!==authority){state={authority,drafts:{},retired:[...state.retired,...Object.values(state.drafts).flatMap(d=>d.request?[{operation:d.request.operation,employee:d.request.employeeId,id:d.request.id}]:[])]};}persist();}catch{blocked=true;}
 return{key,get blocked(){return blocked;},get drafts(){return structuredClone(state.drafts);},get retired(){return structuredClone(state.retired);},
  edit(row:AttendanceRosterRow,date:string,value:EnteredAttendance,reason:string){
   if(blocked)throw Error('Draft memory unavailable');
   verify();
   editDraft(state.drafts,state.retired,Object.keys(state.drafts).length,date,{row,value,reason});
   persist();
  },
  editMany(date: string, edits: readonly DraftEdit[]) {
   if(blocked)throw Error('Draft memory unavailable');
   if(!edits.length)return {applied:0,failed:false};
   verify();
   const drafts={...state.drafts};
   let count=Object.keys(drafts).length,applied=0;
   // Preserve the ordered prefix when a row cannot be prepared.
   for(const edit of edits){
    try{count=editDraft(drafts,state.retired,count,date,edit);applied++;}
    catch{break;}
   }
   if(applied){
    const next={...state,drafts};
    persist(next);
    state=next;
   }
   return {applied,failed:applied!==edits.length};
  },
  prepare(id:string):AttendanceRowRequest{if(blocked)throw Error('Draft memory unavailable');verify();const d=state.drafts[id];if(!d||d.status==='saved')throw Error('No changed row');if(d.status==='conflict')throw Error('Review the current saved row explicitly before another save');if(!d.request)d.request=attendanceRowRequest.parse({employeeId:d.row.employee_id,date:d.date,id:d.row.id,revision:d.row.revision,fingerprint:d.row.fingerprint,operation:crypto.randomUUID(),reason:d.reason,values:d.values});persist();return structuredClone(d.request);},
  accept(id:string,raw:unknown){verify();const r=attendanceReceipt.parse(raw),d=state.drafts[id];if(!d?.request||r.operation_id!==d.request.operation||r.employee_id!==d.row.employee_id||d.row.id!==null&&r.id!==d.row.id)throw Error('Unmatched original receipt');delete state.drafts[id];persist();},
  fail(id:string,error:string,uncertain:boolean,conflict=false){verify();const d=state.drafts[id];if(!d)throw Error('Missing row');const hold=uncertain||d.status==='uncertain';d.error=error;d.status=hold?'uncertain':conflict||d.status==='conflict'?'conflict':'failed';if(!hold)d.request=null;persist();},
  reviewConflict(id:string,raw:AttendanceRosterRow,date:string){if(blocked)throw Error('Draft memory unavailable');verify();const d=state.drafts[id],row=attendanceRosterRow.parse(raw);if(!d||d.request||d.status!=='conflict'||date!==d.date||row.employee_id!==d.row.employee_id||d.row.id!==null&&row.id!==d.row.id||!row.eligible||row.approved_leave||['approved','locked'].includes(row.approval_status??''))throw Error('Current permitted editable original row must be reviewed; unresolved or locked rows cannot be replaced');d.row=row;d.status='draft';d.error=null;persist();},
  discard(id:string){verify();if(state.drafts[id]?.request)throw Error('Unknown outcome cannot be discarded');delete state.drafts[id];persist();},
  retireRow(id:string){verify();const d=state.drafts[id];if(d?.request)state.retired.push({operation:d.request.operation,employee:d.request.employeeId,id:d.request.id});delete state.drafts[id];persist();},
  retire(){verify();state={authority,drafts:{},retired:[...state.retired,...Object.values(state.drafts).flatMap(d=>d.request?[{operation:d.request.operation,employee:d.request.employeeId,id:d.request.id}]:[])]};persist();},
  reconcile(raw:unknown){verify();const r=attendanceReceipt.parse(raw),index=state.retired.findIndex(p=>p.operation===r.operation_id&&p.employee===r.employee_id&&(p.id===null||p.id===r.id));if(index<0)throw Error('Original receipt mismatch');state.retired.splice(index,1);persist();},
 };
}
