'use client';
import{useId,useLayoutEffect,useRef,useState}from'react';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';
import{Button}from'@/components/ui/button';
import{Input}from'@/components/ui/input';
import{Label}from'@/components/ui/label';
import{useReadLifetime}from'@/hooks/use-read-lifetime';
import{hrReadIdentity}from'@/lib/reads/hr-read-identity';
import{canUseHrChild}from'@/lib/hr/child-authority';
import{siteReadinessValues}from'@/lib/hr/site-readiness-contract';
import{readSiteReadinessOpening}from'@/server/actions/hr/child-mutation';
import type{AuthContext}from'@/lib/rbac/check';
import type{ChildMutation,ChildReceipt}from'@/lib/hr/child-save-contract';
import{useHrChildSession}from'./use-hr-child-session';
import{useHrChildOwnerLifetime}from'./use-hr-child-owner-lifetime';
import{useWorkspaceControlledDraft,type WorkspaceDraftCodec}from'@/hooks/use-workspace-controlled-draft';

type Props={employeeId:number;authContext:AuthContext;canDispatch:()=>boolean;blocked:boolean;retry:()=>void;onClose:()=>void;onSaved:(receipt:ChildReceipt)=>void;onDenied?:()=>void};
const siteCodec:WorkspaceDraftCodec<{site:string}>={encode:value=>({site:value.site}),restore:(initial,read)=>({site:read('site',initial.site)})};
export function SiteReadinessDialog(props:Props){return <Dialog key={`${props.employeeId}:${hrReadIdentity(props.authContext)}`} {...props}/>;}
function Dialog(props:Props){
 const{employeeId,authContext}=props,identity=hrReadIdentity(authContext),actor=`${authContext.profile?.id??'none'}:${authContext.profile?.auth_user_id??'none'}`;
 const owner=useReadLifetime(`${identity}:${employeeId}:site-readiness`),session=useHrChildSession(actor,identity,employeeId,'site-readiness');
 const[pendingAtOpen]=useState(()=>{if(!session.pending&&!session.retired)session.startNew();return session.pending?.request??null;}),[opening,setOpening]=useState<ChildMutation|null>(pendingAtOpen),[reading,setReading]=useState(false),[message,setMessage]=useState<string|null>(null);
 const draft=useWorkspaceControlledDraft({formId:`f11-site-readiness:${JSON.stringify([actor,identity,employeeId])}`,initialValue:{site:String(pendingAtOpen?.values.work_site_id??'')},codec:siteCodec,enabled:true}),site=draft.value.site,siteId=useId(),draftOwner=useHrChildOwnerLifetime(`${identity}:${employeeId}:site-draft`),latest=useRef(draft);
 useLayoutEffect(()=>{latest.current=draft;});
 useLayoutEffect(()=>()=>{queueMicrotask(()=>{if(!draftOwner.active)latest.current.retire({site:''});});},[draftOwner]);
 const permitted=canUseHrChild(authContext,'site-readiness'),blocked=props.blocked||!props.canDispatch(),flight=useRef(false);
 const open=async()=>{
  const workSite=Number(site);if(!Number.isSafeInteger(workSite)||workSite<1){setMessage('Choose a valid work site ID.');return;}
  if(!owner.active||blocked||flight.current||session.pending)return;flight.current=true;setReading(true);setMessage(null);
  try{const result=await readSiteReadinessOpening(employeeId,workSite);if(!owner.active)return;const parsed=siteReadinessValues.safeParse(result.values);if(result.denied){props.onDenied?.();return;}if(!result.success||!parsed.success||parsed.data.work_site_id!==workSite){setMessage(result.error??'The complete current sources are unavailable. Nothing was saved.');return;}setOpening({kind:'site-readiness',employeeId,id:null,revision:null,action:'create',values:parsed.data});}
  catch{if(owner.active)setMessage('The readiness opening is unavailable. Nothing was saved.');}
  finally{flight.current=false;if(owner.active)setReading(false);}
 };
 const save=async()=>{
  if(!owner.active||!opening||blocked||session.blocked||session.receipt)return;
  const result=await session.submit(session.pending?.request??opening);if(!owner.active)return;
  if(result.accessDenied){session.retireForLater();props.onDenied?.();return;}
  if(!result.success||!result.data){setMessage(result.error??'The readiness outcome remains unconfirmed.');return;}
  draft.acceptSaved(draft.getCurrent());try{props.onSaved(result.data);props.onClose();}catch{setMessage('Readiness committed. Reopen the permitted list before another change.');}
 };
 const close=()=>{if(owner.active&&!session.pending&&!session.busy&&!reading){draft.retire({site:''});props.onClose();}};
 if(!owner.enabled)return null;
 if(!permitted||session.retired)return <ERPChildDialogForm open title="Readiness access changed"mode="view"onOpenChange={value=>{if(!value)close();}}><p role="alert">Current operations, compliance and medical read access is required. Earlier outcomes need a receipt check; no private data is replayed.</p></ERPChildDialogForm>;
 return <ERPChildDialogForm open title="Recalculate Site Readiness"mode="add"isDirty={draft.isDirty}submitLabel={opening?session.pending?'Retry unchanged readiness check':'Calculate':'Review readiness sources'}onSubmit={opening?save:open}submitDisabled={blocked||session.blocked||session.receipt!==null}isSubmitting={reading||session.busy}closeDisabled={reading||session.busy||session.pending!==null}onOpenChange={value=>{if(!value)close();}}recoveryActions={session.pending&&<Button type="button"variant="outline"onClick={()=>{if(session.retireForLater()){draft.retire({site:''});props.onClose();}}}>Close and check later</Button>}>
  <Label htmlFor={siteId}>Work Site ID</Label><Input id={siteId}required type="number"min="1"value={site}disabled={opening!==null||reading}onChange={event=>draft.setValue({site:event.target.value})}/>
  {opening&&<><p>The complete recorded sources and selected site are pinned. Calculate explicitly to save the result. If the sources change, reopen rather than silently replacing this opening.</p><p className="text-sm text-muted-foreground">This uses recorded assignment, document, restriction and requirement facts. It is not a new site-clearance policy or a guarantee of future readiness.</p>{!session.pending&&<Button type="button"variant="outline"onClick={()=>{setOpening(null);setMessage(null);}}>Choose another site</Button>}</>}
  {(message||session.error)&&<p role="alert">{message??session.error}</p>}
  {blocked&&<div><p role="alert">The current readiness list is unavailable. Your opening is retained; retry before continuing.</p><Button type="button"variant="outline"onClick={props.retry}>Retry current list</Button></div>}
 </ERPChildDialogForm>;
}
