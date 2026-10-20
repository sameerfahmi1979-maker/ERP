'use client';
import{useState}from'react';
import{useQuery}from'@tanstack/react-query';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';
import{Button}from'@/components/ui/button';
import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{canUseHrChild}from'@/lib/hr/child-authority';
import{requirementRefreshValues}from'@/lib/hr/role-requirement-contract';
import{hrReadIdentity}from'@/lib/reads/hr-read-identity';
import type{AuthContext}from'@/lib/rbac/check';
import type{ChildMutation,ChildReceipt}from'@/lib/hr/child-save-contract';
import{readRequirementRefreshOpening}from'@/server/actions/hr/child-mutation';
import{useHrChildSession}from'./use-hr-child-session';
type Props={employeeId:number;authContext:AuthContext;canDispatch:()=>boolean;blocked:boolean;retry:()=>void;onClose:()=>void;onSaved:(receipt:ChildReceipt)=>void;onDenied?:()=>void};
export function RequirementRefreshDialog(props:Props){return <Opening key={`${props.employeeId}:${hrReadIdentity(props.authContext)}`} {...props}/>;}
function Opening(props:Props){
 const{employeeId,authContext}=props,identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`;
 const lifetime=useReadLifetime(`${identity}:${employeeId}:requirements-refresh`),session=useHrChildSession(actor,identity,employeeId,'requirements-refresh');
 const[pendingAtOpen]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;}),[token]=useState(()=>crypto.randomUUID());
 const permitted=canUseHrChild(authContext,'requirements-refresh');
 const query=useQuery({queryKey:['hr','f11-requirement-refresh-opening',identity,employeeId,token],enabled:lifetime.enabled&&permitted&&!pendingAtOpen&&!session.retired,staleTime:Infinity,gcTime:0,retry:false,refetchOnWindowFocus:false,refetchOnMount:false,refetchOnReconnect:false,queryFn:async()=>{
  if(!lifetime.active)throw Error('Opening retired.');const r=await readRequirementRefreshOpening(employeeId);if(!lifetime.active)throw Error('Opening retired.');if(r.denied)props.onDenied?.();const parsed=requirementRefreshValues.safeParse(r.values);if(!r.success||!parsed.success)throw Error(r.error??'The complete requirement set is unavailable.');return parsed.data;
 }});
 if(!lifetime.enabled)return null;
 const close=()=>{if(lifetime.active&&!session.pending&&!session.busy)props.onClose();};
 if(!permitted||session.retired)return <ERPChildDialogForm open title="Requirements recalculation unavailable" mode="view"onOpenChange={open=>{if(!open)close();}}><p role="alert">Current access changed. Earlier outcomes need a receipt check, not a new recalculation.</p>{session.retired&&<Button type="button"disabled={session.busy}onClick={()=>void session.reconcile()}>Check earlier saved result</Button>}{session.error&&<p role="status">{session.error}</p>}</ERPChildDialogForm>;
 if(!pendingAtOpen&&!query.data)return <ERPChildDialogForm open title="Open Requirements Recalculation" mode="view"onOpenChange={open=>{if(!open)close();}}>{query.isError?<><p role="alert">{query.error.message}</p><Button type="button"disabled={query.isFetching}onClick={()=>void query.refetch()}>Retry requirement-set opening</Button></>:<p role="status">Checking the complete current requirement set…</p>}</ERPChildDialogForm>;
 return <Ready {...props}session={session}original={pendingAtOpen??{kind:'requirements-refresh',employeeId,id:null,revision:null,action:'create',values:query.data!}}/>;
}
function Ready({session,original,...props}:Props&{session:ReturnType<typeof useHrChildSession>;original:ChildMutation}){
 const[opening]=useState(()=>structuredClone(original)),[message,setMessage]=useState<string|null>(null),[denied,setDenied]=useState(false),lifetime=useReadLifetime(`${hrReadIdentity(props.authContext)}:${props.employeeId}:requirements-refresh-ready`);
 const submit=async()=>{
  if(!lifetime.active||!props.canDispatch()||props.blocked||session.blocked||session.receipt)return;
  const result=await session.submit(session.pending?.request??opening);if(!lifetime.active)return;
  if(result.accessDenied){session.retireForLater();setDenied(true);props.onDenied?.();return;}
  if(!result.success||!result.data){setMessage(result.error??'The recalculation outcome remains unconfirmed.');return;}
  try{props.onSaved(result.data);props.onClose();}catch{setMessage('Recalculation committed. Reopen the latest permitted list before another change.');}
 };
 const close=()=>{if(lifetime.active&&!session.pending&&!session.busy)props.onClose();};
 if(!lifetime.enabled)return null;
 if(denied)return <ERPChildDialogForm open title="Requirements access changed"mode="view"onOpenChange={open=>{if(!open)close();}}><p role="alert">Current access is unavailable. Check any earlier unconfirmed result through recovery.</p></ERPChildDialogForm>;
 return <ERPChildDialogForm open title="Recalculate Requirements"mode="add"submitLabel={session.pending?'Retry unchanged recalculation':'Recalculate requirements'}submitDisabled={props.blocked||session.blocked||session.receipt!==null}isSubmitting={session.busy}closeDisabled={session.pending!==null||session.busy}onSubmit={submit}onOpenChange={open=>{if(!open)close();}}recoveryActions={session.pending&&<Button type="button"variant="outline"onClick={()=>{if(session.retireForLater())props.onClose();}}>Close and check later</Button>}>
  <p>Recheck the existing requirement labels using their recorded met flags and expiry dates. Waived requirements stay unchanged. This does not create evidence, alter exceptions or certify site readiness.</p>
  <p className="text-sm text-muted-foreground">The complete opening set is pinned. If another change occurs first, close and reopen this action to review the new set.</p>
  {(message||session.error)&&<p role="alert">{message??session.error}</p>}
  {props.blocked&&<div><p role="alert">The current requirement list is unavailable. The original operation is retained; retry the list before continuing.</p><Button type="button"variant="outline"onClick={props.retry}>Retry current list</Button></div>}
 </ERPChildDialogForm>;
}
