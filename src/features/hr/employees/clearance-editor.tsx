'use client';
import{useId,useLayoutEffect,useRef,useState}from'react';
import{useQuery}from'@tanstack/react-query';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';
import{ERPCombobox}from'@/components/erp/combobox';
import{Button}from'@/components/ui/button';import{Input}from'@/components/ui/input';import{Label}from'@/components/ui/label';import{Textarea}from'@/components/ui/textarea';
import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{useWorkspaceControlledDraft,type WorkspaceDraftCodec}from'@/hooks/use-workspace-controlled-draft';
import type{AuthContext}from'@/lib/rbac/check';import{canUseHrChild}from'@/lib/hr/child-authority';import{hrReadIdentity}from'@/lib/reads/hr-read-identity';
import{clearanceArea,clearanceOpeningValues,childOperationValues,type ChildMutation,type ChildReceipt}from'@/lib/hr/child-save-contract';
import{readClearanceOpening}from'@/server/actions/hr/child-mutation';
import{useHrChildSession}from'./use-hr-child-session';import{useHrChildOwnerLifetime}from'./use-hr-child-owner-lifetime';
type Values={clearance_area:string;item_title:string;notes:string};
const empty:Values={clearance_area:'hr',item_title:'',notes:''};
const codec:WorkspaceDraftCodec<Values>={encode:v=>v,restore:(v,read)=>({clearance_area:read('clearance_area',v.clearance_area),item_title:read('item_title',v.item_title),notes:read('notes',v.notes)})};
export type ClearanceEditorProps={employeeId:number;caseId:number;authContext:AuthContext;target:{id:number;action:'update'|'clear'|'block'|'archive'}|null;canDispatch:()=>boolean;admitted:boolean;retry:()=>void;onClose:()=>void;onSaved:(receipt:ChildReceipt,action:ChildMutation['action'])=>void;onDenied?:()=>void};
export function ClearanceEditor(props:ClearanceEditorProps){return <Opening key={`${hrReadIdentity(props.authContext)}:${props.employeeId}:${props.caseId}:${props.target?.id??'new'}:${props.target?.action??'create'}`} {...props}/>;}
function Opening(props:ClearanceEditorProps){
 const{employeeId,caseId,authContext,target}=props,identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`,key=`${identity}:${employeeId}:${caseId}:${target?.id??'new'}`;
 const lifetime=useReadLifetime(key),session=useHrChildSession(actor,identity,employeeId,'clearance',caseId),permitted=canUseHrChild(authContext,'clearance');
 const[pending]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;}),[token]=useState(()=>crypto.randomUUID());
 const query=useQuery({queryKey:['hr','f11-clearance-opening',identity,employeeId,caseId,target?.id,token],enabled:permitted&&lifetime.enabled&&!!target&&!pending&&!session.retired,staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchOnMount:false,
  queryFn:async()=>{if(!lifetime.active||!target)throw Error('Opening retired.');const r=await readClearanceOpening(employeeId,caseId,target.id);if(!lifetime.active)throw Error('Opening retired.');if(r.denied)props.onDenied?.();const values=clearanceOpeningValues.safeParse(r.values);if(!r.success||!r.revision||!/^[1-9]\d*$/.test(r.revision)||!values.success||values.data.eos_case_id!==caseId)throw Error(r.error??'The original clearance item could not be verified.');if(['clear','block'].includes(target.action)&&values.data.item_status!=='pending')throw Error('This item is no longer pending. Reopen its current history.');return{revision:r.revision,values:values.data};}});
 if(!lifetime.enabled&&(session.retired||!permitted||target&&!pending&&!query.data))return null;
 if(!permitted)return <ERPChildDialogForm open mode="view" title="Clearance unavailable" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}><p role="alert">Current clearance access is unavailable. No private fields are restored or resent.</p></ERPChildDialogForm>;
 if(session.retired)return <ERPChildDialogForm open mode="view" title="Check earlier clearance change" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}><p>Check the earlier saved result, not a replay of private wording.</p>{session.error&&<p role="status">{session.error}</p>}<Button type="button" variant="outline" disabled={session.busy}onClick={()=>void session.reconcile()}>Check earlier saved result</Button></ERPChildDialogForm>;
 if(pending&&pending.values.eos_case_id!==caseId)return <ERPChildDialogForm open mode="view" title="Earlier clearance belongs to another case" onOpenChange={open=>{if(!open&&lifetime.active&&session.retireForLater())props.onClose();}}><p role="alert">An unconfirmed clearance change belongs to a different original case. It cannot be redirected to this checklist. Retire its private wording and check its receipt before another change.</p><Button type="button"variant="outline"onClick={()=>{if(lifetime.active&&session.retireForLater())props.onClose();}}>Close and check earlier case</Button></ERPChildDialogForm>;
 if(target&&!pending&&!query.data)return <ERPChildDialogForm open mode="view" title="Open Clearance Item" onOpenChange={open=>{if(!open&&lifetime.active)props.onClose();}}>{query.isError?<><p role="alert">{query.error.message}</p><Button type="button"variant="outline"disabled={query.isFetching}onClick={()=>void query.refetch()}>Retry clearance opening</Button></>:<p role="status">Loading the original clearance item and revision…</p>}</ERPChildDialogForm>;
 const original:ChildMutation=pending??{kind:'clearance',employeeId,id:target?.id??null,revision:query.data?.revision??null,action:target?.action??'create',values:target?.action==='update'?query.data!.values:target?{eos_case_id:caseId}:{eos_case_id:caseId,clearance_area:'hr',item_title:''}};
 return <Editor {...props}original={original}actor={actor}identity={identity}session={session}/>;
}
function Editor(props:ClearanceEditorProps&{original:ChildMutation;actor:string;identity:string;session:ReturnType<typeof useHrChildSession>}){
 const{employeeId,caseId,identity,actor,session}=props,[opening]=useState(()=>structuredClone(props.original)),confirmation=!['create','update'].includes(opening.action),archive=opening.action==='archive';
 const initial:Values={clearance_area:String(opening.values.clearance_area??'hr'),item_title:String(opening.values.item_title??''),notes:String(opening.values.notes??'')};
 const draft=useWorkspaceControlledDraft<Values>({formId:`f11-clearance:${JSON.stringify([actor,identity,employeeId,caseId,opening.id??'new',opening.action])}`,initialValue:initial,codec,enabled:!archive});
 const key=`${identity}:${employeeId}:${caseId}:${opening.id??'new'}`,lifetime=useReadLifetime(key),owner=useHrChildOwnerLifetime(key),latest=useRef(draft),[error,setError]=useState<string|null>(null),[denied,setDenied]=useState(false),id=useId();
 useLayoutEffect(()=>{latest.current=draft;});useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!owner.active)latest.current.retire(empty);});},[owner]);
 const title=opening.action==='clear'?'Record clearance':opening.action==='block'?'Block clearance':archive?'Archive Clearance Item':opening.id?'Edit Clearance Item':'Add Clearance Item';
 const close=()=>{if(!lifetime.active||session.busy||session.pending)return;draft.retire(empty);props.onClose();};
 const submit=async()=>{
  if(!lifetime.active||!props.canDispatch()||session.blocked||session.receipt||opening.values.eos_case_id!==caseId)return;
  const submitted=draft.getCurrent(),values=session.pending?session.pending.request.values:archive?{eos_case_id:caseId}:confirmation?{eos_case_id:caseId,...(submitted.notes===''?{}:{notes:submitted.notes})}:{eos_case_id:caseId,clearance_area:submitted.clearance_area,item_title:submitted.item_title};
  const checked=childOperationValues('clearance',opening.action).safeParse(values);if(!checked.success){setError(checked.error.issues[0]?.message??'Check clearance fields.');return;}
  const result=await session.submit({...opening,values});if(!lifetime.active)return;
  if(result.accessDenied){session.retireForLater();draft.retire(empty);setDenied(true);try{props.onDenied?.();}catch{/* A parent callback cannot prevent private-field retirement. */}return;}
  if(!result.success||!result.data){setError(result.error??'The clearance outcome remains unconfirmed.');return;}
  const unchanged=draft.acceptSaved(submitted);try{props.onSaved(result.data,opening.action);if(unchanged)props.onClose();else setError('The clearance change was saved; newer wording remains unsaved.');}catch{setError('The clearance change was saved. Reopen its latest permitted checklist before another change.');}
 };
 if(!lifetime.enabled)return null;
 if(denied)return <ERPChildDialogForm open mode="view" title="Clearance access changed"onOpenChange={open=>{if(!open)close();}}><p role="alert">Private wording is retired. Check any earlier uncertain result without resending fields.</p></ERPChildDialogForm>;
 const locked=session.busy||session.pending!==null||session.blocked||session.receipt!==null;
 return <ERPChildDialogForm open title={title}subtitle={props.admitted?undefined:'The original case and its checklist must be available before adding this item. Your draft is retained.'}mode={opening.id?'edit':'add'}size="md"onOpenChange={open=>{if(!open)close();}}isSubmitting={session.busy}isDirty={draft.isDirty}closeDisabled={session.pending!==null||session.busy}submitDisabled={!props.admitted||session.blocked||session.receipt!==null}submitLabel={session.pending?'Retry unchanged change':opening.action==='clear'?'Record clearance':opening.action==='block'?'Block clearance':archive?'Archive item':opening.id?'Save item':'Save'}onSubmit={submit}recoveryActions={session.pending&&<div className="space-y-2 text-sm"><p>Closing does not cancel this change. Private wording will be removed; its original result must be checked.</p><Button type="button"variant="outline"onClick={()=>{if(lifetime.active&&session.retireForLater()){draft.retire(empty);props.onClose();}}}>Close and check later</Button></div>}>
  {(error||session.error)&&<p role="alert"className="text-sm text-destructive">{error??session.error}</p>}
  {!props.admitted&&<Button type="button"variant="outline"disabled={session.busy}onClick={props.retry}>Retry original checklist</Button>}
  <p className="text-xs text-muted-foreground">Original EOS case #{caseId}. These are HR clearance records, not departmental signatures, financial settlement or automatic clearance certification.</p>
  {confirmation?<><p>{title} item #{opening.id} using opening revision {opening.revision}. Its history is retained.</p>{!archive&&<><Label htmlFor={`${id}-notes`}>Notes (optional)</Label><Textarea id={`${id}-notes`}aria-label="Notes (optional)"value={draft.value.notes}maxLength={2000}disabled={locked}onChange={e=>draft.setValue(v=>({...v,notes:e.target.value}))}/><p className="text-xs text-muted-foreground">Leave blank to retain existing notes.</p></>}</>:<div className="grid grid-cols-12 gap-4"><div className="col-span-6"><Label>Clearance Area *</Label><ERPCombobox ariaLabel="Clearance Area"required value={draft.value.clearance_area}options={clearanceArea.options.map(value=>({value,label:value.toUpperCase()}))}disabled={locked}onValueChange={value=>draft.setValue(v=>({...v,clearance_area:String(value??'')}))}/></div><div className="col-span-12"><Label htmlFor={`${id}-title`}>Item Title *</Label><Input id={`${id}-title`}aria-label="Item Title"required value={draft.value.item_title}maxLength={500}disabled={locked}onChange={e=>draft.setValue(v=>({...v,item_title:e.target.value}))}/></div></div>}
 </ERPChildDialogForm>;
}
