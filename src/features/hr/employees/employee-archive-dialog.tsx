'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {Input} from '@/components/ui/input';import {Label} from '@/components/ui/label';import {Textarea} from '@/components/ui/textarea';
import {useEmployeeSaveSession} from './use-employee-save-session';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceControlledDraft,type WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import {archiveEmployee,type EmployeeListRow} from '@/server/actions/hr/employees';
import type {AuthContext}from '@/lib/rbac/check';
import {hrReadIdentity}from '@/lib/reads/hr-read-identity';
import {hasPermission}from '@/lib/rbac/scope';
import {EmployeeSaveRecovery}from './employee-save-recovery';
type Values={reason:string;effective:string};
const codec:WorkspaceDraftCodec<Values>={encode:v=>v,restore:(v,read)=>({reason:read('reason',v.reason),effective:read('effective',v.effective)})};
type Props={employee:EmployeeListRow;authContext:AuthContext;onClose:()=>void;onArchived:()=>void};
export function EmployeeArchiveDialog(props:Props){return <EmployeeArchiveDialogInstance key={`${props.authContext.profile?.id??'none'}:${props.authContext.profile?.auth_user_id??'none'}:${props.employee.id}`} {...props}/>;}
function EmployeeArchiveDialogInstance({employee,authContext,onClose,onArchived}:Props){
 const actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`;
 const id=`f11-employee-archive-${employee.id}:actor:${actor}`,owner=useWorkspaceFormOwner(),store=useWorkspaceDraftStoreContext();
 const scope=`f11-employee:${actor}:archive:${employee.id}`;
 const session=useEmployeeSaveSession(id,employee.id,employee.workspace_revision,actor,{retirementScope:scope});
 const draft=useWorkspaceControlledDraft({formId:id,initialValue:{reason:'',effective:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())},codec,enabled:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),flight=useRef(false),current=useRef(true);
 const identity=hrReadIdentity(authContext),[opening,setOpening]=useState({identity,retired:false});
 if(!opening.retired&&opening.identity!==identity)setOpening({...opening,retired:true});
 const retired=opening.retired,retireDraft=draft.retire;
 useLayoutEffect(()=>{if(retired){session.retireForAccessLoss();retireDraft({reason:'',effective:''});}},[retired,session,retireDraft]);
 useEffect(()=>{current.current=true;return()=>{current.current=false;if(session.hasPending){session.retireForAccessLoss();retireDraft({reason:'',effective:''});}};},[session,retireDraft]);
 const submit=async()=>{
  if(flight.current||!owner||!store||retired||session.isRetired||!hasPermission(authContext,'hr.employees.archive'))return;
  flight.current=true;setBusy(true);const values=draft.getCurrent(),wasPending=session.hasPending;
  try{
   const result=await archiveEmployee(employee.id,values.reason,session.begin(values),values.effective);
   if(!current.current||session.isRetired)return;
   if(!result.success||!result.data){if(!wasPending&&!result.uncertain)session.rejected();setError(result.error??'Archive unconfirmed. Retry the unchanged request.');return;}
   session.accept(result.data);draft.acceptSaved(values);
   try{onArchived();}catch{if(current.current)setError('Employee archived. The list could not refresh; reopen it before another change.');}
  }catch{if(current.current)setError('Archive unconfirmed. Keep the same reason and date and retry safely.');}
  finally{flight.current=false;if(current.current)setBusy(false);}
 };
 return <ERPChildDialogForm open onOpenChange={open=>{if(!open&&!session.hasPending)onClose();}} title="Archive employee" subtitle={retired?'Access changed — reopen with current authorization':`${employee.employee_code} — ${employee.full_name_en}`} mode="edit" size="sm" submitLabel={session.hasPending?'Reconcile archive':'Archive employee'} isSubmitting={busy} submitDisabled={!owner||!store||retired||session.isRetired||!hasPermission(authContext,'hr.employees.archive')} closeDisabled={session.hasPending} isDirty={draft.isDirty} onSubmit={submit}>
  <p className="text-sm">This archives the employee and records the reason, effective date and history together. It does not delete files or financial history.</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <EmployeeSaveRecovery key={identity} session={session} scope={scope}/>
  <Label htmlFor={`${id}-reason`}>Reason *</Label><Textarea id={`${id}-reason`} name="reason" required maxLength={2000} value={draft.value.reason} disabled={retired||busy||session.hasPending} onChange={e=>draft.setValue(v=>({...v,reason:e.target.value}))}/>
  <Label htmlFor={`${id}-date`}>Effective date *</Label><Input id={`${id}-date`} name="effective_date" type="date" required value={draft.value.effective} disabled={retired||busy||session.hasPending} onChange={e=>draft.setValue(v=>({...v,effective:e.target.value}))}/>
 </ERPChildDialogForm>;
}
