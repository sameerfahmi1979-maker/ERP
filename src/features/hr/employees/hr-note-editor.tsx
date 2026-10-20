'use client';
import{useId,useLayoutEffect,useRef,useState}from 'react';
import{useQuery}from '@tanstack/react-query';
import{ERPChildDialogForm}from '@/components/erp/erp-child-dialog-form';
import{ERPCombobox}from '@/components/erp/combobox';
import{Button}from '@/components/ui/button';import{Label}from '@/components/ui/label';import{Textarea}from '@/components/ui/textarea';
import{useWorkspaceControlledDraft,type WorkspaceDraftCodec}from '@/hooks/use-workspace-controlled-draft';
import{useReadLifetime}from '@/hooks/use-read-lifetime';
import type{AuthContext}from '@/lib/rbac/check';import{hasPermission}from '@/lib/rbac/scope';
import{hrReadIdentity}from '@/lib/reads/hr-read-identity';
import{hrNoteValues,type ChildReceipt}from '@/lib/hr/child-save-contract';
import{readHrNoteRevision}from '@/server/actions/hr/child-mutation';
import{useHrChildSession}from './use-hr-child-session';
import{useHrChildOwnerLifetime}from './use-hr-child-owner-lifetime';
type Values={note_type:string;note_text:string;visibility:string};
const empty:Values={note_type:'general',note_text:'',visibility:'hr_only'};
const codec:WorkspaceDraftCodec<Values>={encode:v=>v,restore:(v,read)=>({note_type:read('note_type',v.note_type),note_text:read('note_text',v.note_text),visibility:read('visibility',v.visibility)})};
type Props={employeeId:number;authContext:AuthContext;target:{id:number}|null;canDispatch:()=>boolean;onClose:()=>void;onSaved:(receipt:ChildReceipt,action:'create'|'archive')=>void;onDenied?:()=>void};
export function HrNoteEditor(props:Props){return <NoteEditor key={`${hrReadIdentity(props.authContext)}:${props.employeeId}:${props.target?.id??'new'}`} {...props}/>;}
function NoteEditor({employeeId,authContext,target,canDispatch,onClose,onSaved,onDenied}:Props){
 const fieldId=useId();
 const identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`,lifetime=useReadLifetime(`${identity}:${employeeId}:${target?.id??'new'}`),session=useHrChildSession(actor,identity,employeeId,'hr-note');
 const [opening]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;});
 const restored=opening?.action==='create'?hrNoteValues.parse(opening.values):empty;
 const draft=useWorkspaceControlledDraft({formId:`f11-note:${JSON.stringify([actor,identity,employeeId,opening?.id??target?.id??'new'])}`,initialValue:restored,codec,enabled:!target||opening?.action==='create'});
 const archive=opening?opening.action==='archive':target!==null,id=opening?.id??target?.id??null;
 const [revision,setRevision]=useState<string|null>(opening?.revision??null),[openingToken]=useState(()=>crypto.randomUUID()),[error,setError]=useState<string|null>(null),[denied,setDenied]=useState(false);
 const canManage=!!authContext.profile&&authContext.isAccountActive&&!authContext.profile.must_change_password&&['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'].every(code=>hasPermission(authContext,code));
 const owner=useHrChildOwnerLifetime(`${identity}:${employeeId}:${target?.id??'new'}`),latest=useRef(draft);useLayoutEffect(()=>{latest.current=draft;});
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)latest.current.retire(empty);});},[owner]);
 const revisionRead=useQuery({queryKey:['hr','f11-note-opening',identity,employeeId,id,openingToken],enabled:lifetime.enabled&&canManage&&archive&&id!==null&&revision===null&&!session.retired,staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchOnMount:false,
  queryFn:async()=>{if(!lifetime.active||id===null)throw Error('The opening is no longer available.');const r=await readHrNoteRevision(employeeId,id);if(!lifetime.active)throw Error('The opening is no longer available.');if(!r.success||typeof r.revision!=='string'||!/^[1-9]\d*$/.test(r.revision))throw Error(r.error??'The opening revision could not be verified.');return r.revision;},
 });
 // The first verified revision is the opening baseline. A refresh never rebases it.
 if(revision===null&&revisionRead.data)setRevision(revisionRead.data);
 const readBusy=archive&&revision===null&&revisionRead.isFetching,revisionError=revisionRead.isError?revisionRead.error.message:null;
 const submit=async()=>{
  if(!canManage||!lifetime.active||!canDispatch()||session.blocked||session.receipt||readBusy||archive&&!revision)return;
  const submitted=draft.getCurrent(),values=archive?{}:submitted,parsed=archive?null:hrNoteValues.safeParse(values);
  if(parsed&&!parsed.success){setError(parsed.error.issues[0]?.message??'Check the note fields.');return;}
  const result=await session.submit({kind:'hr-note',employeeId,id:archive?id:null,action:archive?'archive':'create',revision:archive?revision:null,values});
  if(!lifetime.active)return;
  if(result.accessDenied){session.retireForLater();draft.retire(empty);setDenied(true);try{onDenied?.();}catch{/* Local privacy retirement must not depend on a parent callback. */}return;}
  if(!result.success||!result.data){setError(result.error??'The result remains unconfirmed.');return;}
  const unchanged=draft.acceptSaved(submitted);
  try{onSaved(result.data,archive?'archive':'create');if(unchanged)onClose();else setError('Note saved. Newer text remains unsaved; copy it before closing.');}catch{setError('The note change was saved. Reopen the list before another change.');}
 };
 const close=()=>{if(!lifetime.active||session.pending||session.busy)return;draft.retire(empty);onClose();};
 const locked=session.busy||session.pending!==null||session.retired!==null||session.blocked||session.receipt!==null;
 if(!lifetime.enabled)return null;
 if(denied)return <ERPChildDialogForm open mode="view" title="HR Note access changed" onOpenChange={open=>{if(!open)close();}}><p role="alert">Current confidential-note access is unavailable. Private values are retired; an earlier uncertain operation still needs a receipt check.</p></ERPChildDialogForm>;
 return <ERPChildDialogForm open onOpenChange={open=>{if(!open)close();}} title={session.retired?'Check earlier HR note change':archive?'Archive HR Note':'Add HR Note'} mode={archive?'edit':'add'} size="md" isSubmitting={session.busy} closeDisabled={session.pending!==null||session.busy} isDirty={draft.isDirty} submitDisabled={!canManage||!canDispatch()||session.blocked||session.receipt!==null||readBusy||archive&&!revision} submitLabel={session.pending?'Retry unchanged change':archive?'Archive note':'Add note'} onSubmit={submit} recoveryActions={session.pending&&<div className="space-y-2 text-sm"><p>Closing does not cancel this change. Private wording will be removed, and its result can be checked under unconfirmed HR child changes.</p><Button type="button" variant="outline" onClick={()=>{if(session.retireForLater()){draft.retire(empty);onClose();}}}>Close and check later</Button></div>}>
  {(error||session.error)&&<p role="alert" className="text-sm text-destructive">{error??session.error}</p>}

  {!canManage?<p role="alert">Current confidential-note access is unavailable. Earlier private values will not be restored or replayed.</p>:session.retired?<div className="space-y-2 text-sm"><p>An earlier change needs a receipt check. No private note text will be replayed.</p><Button type="button" variant="outline" disabled={session.busy} onClick={()=>void session.reconcile()}>Check earlier saved result</Button></div>:archive?<div className="space-y-2 text-sm"><p>Archive note #{id}. This keeps its audit history and does not delete employee files.</p>{readBusy&&<p role="status">Checking current note revision…</p>}{revisionError&&<><p role="alert">{revisionError}</p><Button type="button" variant="outline" onClick={()=>{if(lifetime.active)void revisionRead.refetch();}}>Retry revision check</Button></>}</div>:<div className="grid grid-cols-12 gap-4">
   <div className="col-span-6"><Label>Note Type</Label><ERPCombobox name="note_type" ariaLabel="Note Type" value={draft.value.note_type} onValueChange={value=>draft.setValue(v=>({...v,note_type:String(value??'')}))} options={['general','confidential','management','legal','other'].map(value=>({value,label:value.replaceAll('_',' ')}))} disabled={locked}/></div>
   <div className="col-span-6"><Label>Visibility</Label><ERPCombobox name="visibility" ariaLabel="Visibility" value={draft.value.visibility} onValueChange={value=>draft.setValue(v=>({...v,visibility:String(value??'')}))} options={[{value:'hr_only',label:'HR Only'},{value:'management',label:'Management'},{value:'restricted',label:'Restricted'}]} disabled={locked}/></div>
   <div className="col-span-12"><Label htmlFor={`${fieldId}-note`}>Note *</Label><Textarea id={`${fieldId}-note`} name="note_text" aria-label="Note" required maxLength={10000} value={draft.value.note_text} disabled={locked} onChange={e=>draft.setValue(v=>({...v,note_text:e.target.value}))} rows={5}/></div>
  </div>}
 </ERPChildDialogForm>;
}
