'use client';
import {useId,useLayoutEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ERPChildDialogForm} from '@/components/erp/erp-child-dialog-form';
import {ERPCombobox} from '@/components/erp/combobox';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {useReadLifetime} from '@/hooks/use-read-lifetime';
import {useWorkspaceControlledDraft,type WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import type {AuthContext} from '@/lib/rbac/check';
import {canUseHrChild} from '@/lib/hr/child-authority';
import {hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {childOperationValues,type ChildReceipt,type ChildMutation} from '@/lib/hr/child-save-contract';
import {HR_RECORD_EDITORS,hrRecordActionFields,type HrRecordKind,type HrRecordField} from './hr-record-editor-spec';
import {readProProcessOpening,readHrActionOpening,readPerformanceOpening,readDisciplinaryOpening,readApprovalOpening,readEosCaseOpening,readAssignmentOpening,readOperationItemOpening,readOperationalBlockOpening,readRoleRequirementOpening} from '@/server/actions/hr/child-mutation';
import {useHrChildSession} from './use-hr-child-session';
import {useHrChildOwnerLifetime} from './use-hr-child-owner-lifetime';
import {WorkforceEditorChoice} from './workforce-editor-choice';

type Values=Record<string,string>;
type Target={id:number;action:'update'|'archive'|'close'|'submit'|'approve'|'reject'|'cancel'|'acknowledge'|'correct-acknowledgement'|'return'|'end'|'release'|'waive'};
export type HrRecordEditorProps={kind:HrRecordKind;employeeId:number;authContext:AuthContext;target:Target|null;canDispatch:()=>boolean;onClose:()=>void;onSaved:(receipt:ChildReceipt,action:ChildMutation['action'])=>void;onDenied?:()=>void;admission?:{message:string;retry?:()=>void;blocked?:boolean}};
type Props=HrRecordEditorProps;
const fieldsDefaults=(fields:readonly HrRecordField[]):Values=>Object.fromEntries(fields.map(f=>[f.name,f.defaultValue??(f.type==='date'&&f.required?new Date().toISOString().slice(0,10):'')]));
const defaults=(kind:HrRecordKind)=>fieldsDefaults(HR_RECORD_EDITORS[kind].fields);
const returnCodec:WorkspaceDraftCodec<Values>={encode:v=>({returned_date:v.returned_date}),restore:(v,read)=>({returned_date:read('returned_date',v.returned_date)})};
const waiverCodec:WorkspaceDraftCodec<Values>={encode:v=>({waiver_reason:v.waiver_reason}),restore:(v,read)=>({waiver_reason:read('waiver_reason',v.waiver_reason)})};
const releaseCodec:WorkspaceDraftCodec<Values>={encode:v=>({release_reason:v.release_reason}),restore:(v,read)=>({release_reason:read('release_reason',v.release_reason)})};
const endCodec:WorkspaceDraftCodec<Values>={encode:v=>({assigned_to:v.assigned_to}),restore:(v,read)=>({assigned_to:read('assigned_to',v.assigned_to)})};
const codecs=Object.fromEntries((['pro-process','hr-action','performance','disciplinary','approval','eos-case','assignment','asset','ppe','accommodation','operational-block','role-requirement']as const).map(kind=>[kind,{encode:(v:Values)=>v,restore:(v:Values,read:(field:string,fallback?:string|number|null)=>string)=>Object.fromEntries(HR_RECORD_EDITORS[kind].fields.map(f=>[f.name,read(f.name,v[f.name])]))}]))as Record<HrRecordKind,WorkspaceDraftCodec<Values>>;
const reasonCodec:WorkspaceDraftCodec<Values>={encode:v=>({reason:v.reason}),restore:(v,read)=>({reason:read('reason',v.reason)})};
export function HrRecordEditor(props:Props){
 return <Opening key={`${props.kind}:${hrReadIdentity(props.authContext)}:${props.employeeId}:${props.target?.id??'new'}:${props.target?.action??'create'}`} {...props}/>;
}
function Opening(props:Props){
 const {kind,employeeId,authContext,target}=props,spec=HR_RECORD_EDITORS[kind],identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`;
 const lifetime=useReadLifetime(`${identity}:${employeeId}:${target?.id??'new'}`),session=useHrChildSession(actor,identity,employeeId,kind);
 const [pendingAtOpen]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;}),[openingToken]=useState(()=>crypto.randomUUID());
 const permitted=canUseHrChild(authContext,kind);
 const query=useQuery({queryKey:['hr',spec.key,identity,employeeId,target?.id,openingToken],enabled:lifetime.enabled&&permitted&&!!target&&!pendingAtOpen&&!session.retired,
  staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchOnMount:false,
  queryFn:async()=>{if(!target||!lifetime.active)throw Error('Opening retired.');const r=await(kind==='role-requirement'?readRoleRequirementOpening(employeeId,target.id,target.action):kind==='operational-block'?readOperationalBlockOpening(employeeId,target.id,target.action):['asset','ppe','accommodation'].includes(kind)?readOperationItemOpening(kind as import('@/lib/hr/operation-item-contract').OperationItemKind,employeeId,target.id,target.action):kind==='assignment'?readAssignmentOpening(employeeId,target.id):kind==='approval'?readApprovalOpening(employeeId,target.id,target.action):kind==='eos-case'?readEosCaseOpening(employeeId,target.id,target.action):(kind==='pro-process'?readProProcessOpening:kind==='performance'?readPerformanceOpening:kind==='disciplinary'?readDisciplinaryOpening:readHrActionOpening)(employeeId,target.id));if(!lifetime.active)throw Error('Opening retired.');if(r.denied)props.onDenied?.();if(!r.success||!r.revision||!/^[1-9]\d*$/.test(r.revision)||!spec.openingSchema.safeParse(r.values).success)throw Error(r.error??`The ${spec.noun} opening could not be verified.`);return{revision:r.revision,values:spec.openingSchema.parse(r.values)};},
 });
 if(!lifetime.enabled&&(session.retired||!permitted||target&&!pendingAtOpen&&!query.data))return null;
 if(!permitted)return <ERPChildDialogForm open title={`${spec.title} unavailable`} mode="view" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}><p role="alert">Current {spec.noun} access is unavailable. No private fields will be restored or replayed.</p></ERPChildDialogForm>;
 if(session.retired)return <ERPChildDialogForm open title={`Check earlier ${spec.title} change`} mode="view" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}><p>An earlier change requires a receipt check, not a replay of private wording.</p>{session.error&&<p role="status">{session.error}</p>}<Button type="button" variant="outline" disabled={session.busy} onClick={()=>void session.reconcile()}>Check earlier saved result</Button></ERPChildDialogForm>;
 if(target&&!pendingAtOpen&&!query.data)return <ERPChildDialogForm open title={`Open ${spec.title}`} mode="view" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}>{query.isError?<><p role="alert">{query.error.message}</p><Button type="button" variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}>Retry {spec.noun} opening</Button></>:<p role="status">Loading current {spec.noun} and its revision…</p>}</ERPChildDialogForm>;
 const original=pendingAtOpen??{kind,employeeId,id:target?.id??null,action:target?.action??'create',revision:query.data?.revision??null,values:target&&target.action!=='update'?(hrRecordActionFields(kind,target.action)?fieldsDefaults(hrRecordActionFields(kind,target.action)!):{}):query.data?.values??defaults(kind)};
 return <Editor {...props} actor={actor} identity={identity} original={original} session={session}/>;
}
function Editor({kind,employeeId,actor,identity,original,session,canDispatch,onClose,onSaved,onDenied,admission}:Props&{actor:string;identity:string;original:ChildMutation;session:ReturnType<typeof useHrChildSession>}){
 // Snapshot the first verified read. Cache refreshes never replace its wording or revision.
 const spec=HR_RECORD_EDITORS[kind];
 const [opening]=useState(()=>structuredClone(original)),decision=kind==='approval'&&['approve','reject','cancel'].includes(opening.action),lifecycleFields=hrRecordActionFields(kind,opening.action),confirmation=!decision&&!lifecycleFields&&!['create','update'].includes(opening.action),editing=opening.action==='update';
 const fields:readonly HrRecordField[]=decision?[{name:'reason',label:opening.action==='approve'?'Decision notes (optional)':'Reason',type:'textarea',required:opening.action!=='approve',maxLength:5000}]:lifecycleFields??spec.fields;
 const empty=()=>decision?{reason:''}:lifecycleFields?fieldsDefaults(lifecycleFields):defaults(kind);
 // An empty new form is valid UI state, not yet a valid save payload.
 const initial:Values=confirmation?defaults(kind):Object.fromEntries(fields.map(f=>[f.name,String(opening.values[f.name]??'')]));
 const draft=useWorkspaceControlledDraft<Values>({formId:`${spec.form}:${JSON.stringify([actor,identity,employeeId,opening.id??'new',opening.action])}`,initialValue:initial,codec:decision?reasonCodec:opening.action==='return'?returnCodec:opening.action==='end'?endCodec:opening.action==='release'?releaseCodec:opening.action==='waive'?waiverCodec:codecs[kind],enabled:!confirmation});
 const owner=useHrChildOwnerLifetime(`${identity}:${employeeId}:${opening.id??'new'}`),lifetime=useReadLifetime(`${identity}:${employeeId}:${opening.id??'new'}`),[error,setError]=useState<string|null>(null),[denied,setDenied]=useState(false),fieldId=useId(),latest=useRef(draft);
 useLayoutEffect(()=>{latest.current=draft;});
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)latest.current.retire(decision?{reason:''}:hrRecordActionFields(kind,opening.action)?fieldsDefaults(hrRecordActionFields(kind,opening.action)!):defaults(kind));});},[owner,kind,decision,opening.action]);
 const submit=async()=>{
  if(!lifetime.active||!canDispatch()||session.blocked||session.receipt)return;
  const submitted=draft.getCurrent(),values=session.pending?session.pending.request.values:confirmation?opening.values:Object.fromEntries(fields.map(f=>[f.name,f.type==='checkbox'?submitted[f.name]==='true':f.nullable&&!submitted[f.name]?null:f.type==='number'||f.type==='lookup'?Number(submitted[f.name]):submitted[f.name]]));
  if(kind==='role-requirement'&&opening.action==='update'&&opening.values.status!=='waived'&&values.status==='waived'){setError('Use Review waiver with an independent reviewer and validity dates instead of changing the status to Waived.');return;}
  const parsed=childOperationValues(kind,opening.action).safeParse(values);if(!parsed.success){setError(parsed.error.issues[0]?.message??`Check ${spec.noun} fields.`);return;}
  const result=await session.submit({...opening,values});
  if(!lifetime.active)return;
  if(result.accessDenied){session.retireForLater();draft.retire(empty());setDenied(true);try{onDenied?.();}catch{/* Local privacy retirement must not depend on a parent callback. */}return;}
  if(!result.success||!result.data){setError(result.error??`The ${spec.noun} outcome remains unresolved.`);return;}
  const unchanged=draft.acceptSaved(submitted);
  try{onSaved(result.data,opening.action);if(unchanged)onClose();else setError(`The ${spec.noun} was saved; newer edits remain unsaved. Copy them before closing.`);}catch{setError(`The ${spec.noun} was saved. Reopen the latest permitted list before another change.`);}
 };
 const close=()=>{if(!lifetime.active||session.pending||session.busy)return;draft.retire(empty());onClose();};
 const operationLabel=opening.action==='waive'?'Waive':opening.action==='release'?'Release':opening.action==='return'?'Return':opening.action==='end'?'End':opening.action==='set-status'?'Change status':opening.action==='correct-acknowledgement'?'Correct acknowledgement':opening.action==='acknowledge'?'Record acknowledgement':opening.action==='submit'?'Submit':opening.action==='approve'?'Approve':opening.action==='reject'?'Reject':opening.action==='close'?'Close':opening.action==='archive'?'Archive':opening.action==='cancel'?'Cancel':editing?'Edit':kind==='asset'||kind==='ppe'?'Issue':kind==='accommodation'?'Assign':'Add';
 const locked=session.busy||session.pending!==null||session.blocked||session.receipt!==null,admitted=admission?.blocked===undefined?canDispatch():!admission.blocked;
 if(!lifetime.enabled)return null;
 if(denied)return <ERPChildDialogForm open mode="view" title={`${spec.title} access changed`} onOpenChange={open=>{if(!open)close();}}><p role="alert">Current {spec.noun} access is unavailable. Private values are retired; any earlier uncertain operation still needs a receipt check.</p></ERPChildDialogForm>;
 return <ERPChildDialogForm open title={`${operationLabel} ${spec.title}`} mode={opening.id?'edit':'add'} size="lg" onOpenChange={open=>{if(!open)close();}} isSubmitting={session.busy} closeDisabled={session.pending!==null||session.busy} isDirty={draft.isDirty} submitDisabled={!admitted||session.blocked||session.receipt!==null} submitLabel={session.pending?'Retry unchanged change':opening.action==='correct-acknowledgement'?'Correct acknowledgement':opening.action==='acknowledge'?'Record acknowledgement':`${confirmation||decision||lifecycleFields?operationLabel:'Save'} ${spec.noun}`} onSubmit={submit} recoveryActions={session.pending&&<div className="space-y-2 text-sm"><p>Closing does not cancel this change. Private wording will be removed; check its result in HR child recovery.</p><Button type="button" variant="outline" onClick={()=>{if(session.retireForLater()){draft.retire(empty());onClose();}}}>Close and check later</Button></div>}>
  {(error||session.error)&&<p role="alert" className="text-sm text-destructive">{error??session.error}</p>}
  {!admitted&&<div className="space-y-2"><p role="alert" className="text-sm text-destructive">{admission?.message??'Current list or access checks are unavailable. Your draft is retained; restore the permitted list before saving.'}</p>{admission?.retry&&<Button type="button" variant="outline" disabled={session.busy} onClick={admission.retry}>Retry current list</Button>}</div>}

  {confirmation&&opening.action==='correct-acknowledgement'&&<p className="text-sm text-muted-foreground">Confirm that the earlier HR acknowledgement entry was recorded in error. Its timestamp and history will be retained. This does not revoke an employee signature or agreement.</p>}
  {confirmation&&opening.action==='acknowledge'&&<p className="text-sm text-muted-foreground">This records the HR operator’s acknowledgement entry. It is not an employee digital signature.</p>}
  {kind==='eos-case'&&<p className="text-sm text-muted-foreground">This is an end-of-service process shell only. Financial settlement, clearance certification and employee status are not changed by this form.</p>}
  {kind==='hr-action'&&<p className="text-sm text-muted-foreground">Assign a current authorized HR user and due date in Edit before progressing or closing this task. Task completion does not apply salary, employment or Finance changes. Unresolved approval mappings remain held.</p>}
  {kind==='assignment'&&<p className="text-sm text-muted-foreground">Save site deployment as planned, request independent review from its record, then activate the unchanged approved plan. Current evidence is checked again on activation. This does not change the employee’s organisation or manager.</p>}
  {kind==='pro-process'&&<p className="text-sm text-muted-foreground">A linked renewal retains its original source and expiry cycle. Starting work requires a named authorized person and due date; completion requires a distinct, currently verified replacement. An unlinked process is only a process record, not proof of renewal.</p>}
  {kind==='role-requirement'&&<p className="text-sm text-muted-foreground">Use Review waiver for a configured, source-backed exception with an independent reviewer and validity dates. Editing this label does not approve an exception, replace evidence links or certify site readiness.</p>}
  {kind==='approval'&&<p className="text-sm text-muted-foreground">{opening.id?`Request #${opening.id}, opening revision ${opening.revision}. `:''}Approval records the request decision only; it does not itself change employment, payroll or finance. Approval and rejection require a different authorized HR reviewer. Role-labelled or unverified requests remain on hold for mapping review.</p>}
  {!confirmation&&kind==='disciplinary'&&<p className="text-sm text-muted-foreground">The operational block flag records this record’s classification. It does not create or clear an operational block; manage those separately in Operations.</p>}
  {confirmation?<p>{operationLabel} {spec.noun} #{opening.id} using its verified opening revision. Its audit history will be retained.</p>:<div className="grid grid-cols-12 gap-4">
   {fields.map(field=><div key={field.name} className={field.type==='textarea'||field.name.endsWith('_title')?'col-span-12':'col-span-6'}>
    <Label htmlFor={field.type==='select'?undefined:`${fieldId}-${field.name}`}>{field.label}{field.required?' *':''}</Label>
    {field.type==='lookup'&&(kind==='assignment'||kind==='pro-process'||kind==='hr-action')?<WorkforceEditorChoice employee={employeeId}kind={kind==='hr-action'?'pro-process':kind}field={field.name as 'work_site_id'|'deployment_review_id'|'assigned_to'|'f12_source_id'|'f12_replacement_id'}source={opening.id}sourceKind={draft.value.f12_source_kind||null}identity={identity}label={field.label}value={draft.value[field.name]}disabled={locked||editing&&field.name==='f12_source_id'}onValue={v=>draft.setValue(old=>({...old,[field.name]:v}))}onDenied={()=>{session.retireForLater();draft.retire(empty());setDenied(true);onDenied?.();}}/>:field.type==='checkbox'?<Input id={`${fieldId}-${field.name}`} name={field.name} aria-label={field.label} type="checkbox" className="h-4 w-4" checked={draft.value[field.name]==='true'} disabled={locked} onChange={e=>draft.setValue(v=>({...v,[field.name]:String(e.target.checked)}))}/>:field.type==='select'?<ERPCombobox name={field.name} ariaLabel={field.label} value={draft.value[field.name]} options={(field.options??[]).map(value=>({value,label:value.replaceAll('_',' ')}))} required={field.required} allowClear={field.nullable??false} disabled={locked||editing&&field.name==='f12_source_kind'} onValueChange={v=>draft.setValue(f=>({...f,[field.name]:String(v??''),...(field.name==='f12_source_kind'?{f12_source_id:'',f12_replacement_id:''}:{})}))}/>:
     field.type==='textarea'?<Textarea id={`${fieldId}-${field.name}`} name={field.name} aria-label={field.label} maxLength={field.maxLength} rows={3} value={draft.value[field.name]} disabled={locked} onChange={e=>draft.setValue(v=>({...v,[field.name]:e.target.value}))}/>:
     <Input id={`${fieldId}-${field.name}`} name={field.name} aria-label={field.label} type={field.type==='lookup'?'text':field.type} min={field.min} max={field.max} step={field.step} required={field.required} maxLength={field.maxLength} value={draft.value[field.name]} disabled={locked} onChange={e=>draft.setValue(v=>({...v,[field.name]:e.target.value}))}/>}
   </div>)}
  </div>}
 </ERPChildDialogForm>;
}
