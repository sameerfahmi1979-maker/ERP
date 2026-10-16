'use client';
import {useLayoutEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {useAdministrationSaveSession} from '@/hooks/use-administration-save-session';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {financeReferencePermissions,verifyFinanceReferenceReceipt,validFinanceReferenceRequest,type FinanceReferenceEntity,type FinanceReferenceRequest} from '@/lib/master-data/finance-reference-contract';
import {invalidateBanks,invalidatePaymentTerms,invalidateTaxTypes} from '@/lib/query/invalidation';
import type {AuthContext} from '@/lib/rbac/check';
import {admitFinanceReferenceAction} from '../reference-action-admission';
import {saveFinanceReference} from '../reference-mutations';
import {FinanceBasicsActionsCell} from './currencies-table';
type Row={id:number;workspace_revision?:number;is_system:boolean;is_locked:boolean;is_active:boolean};
type Props={entity:FinanceReferenceEntity;row:Row;authContext:AuthContext;onView:()=>void;onEdit:()=>void;onRefresh?:()=>void;readGeneration?:string};
const invalidations={banks:invalidateBanks,payment_terms:invalidatePaymentTerms,tax_types:invalidateTaxTypes};
export function FinanceReferenceRowActions(props:Props){const owner=useWorkspaceFormOwner();return <RowActionSession key={`${props.authContext.profile?.id??'none'}:${owner?.id??'unowned'}:${props.entity}:${props.row.id}:${props.row.workspace_revision??'missing'}:${props.readGeneration??'initial'}`} {...props}/>;}
function RowActionSession({entity,row,authContext,onView,onEdit,onRefresh}:Props){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner(),formId=`finance-reference-actions:${entity}:${row.id}`;
 const [admission]=useState(()=>admitFinanceReferenceAction(store,owner?.id,formId,entity,row.id,row.workspace_revision));
 const session=useAdministrationSaveSession<FinanceReferenceRequest>(formId,row.id,row.workspace_revision,(p,id)=>validFinanceReferenceRequest(entity,p,id)&&p.action!=='save');
 const permissions=financeReferencePermissions(authContext),allowed=useRef(permissions);
 useLayoutEffect(()=>{allowed.current=permissions;});
 const router=useRouter(),client=useQueryClient(),flight=useRef(false);
 const [busy,setBusy]=useState(false),[retireOpen,setRetireOpen]=useState(false),[message,setMessage]=useState<string|null>(null),[refreshFailed,setRefreshFailed]=useState(false),[terminalBlocked,setTerminalBlocked]=useState(false),[confirmedRevision,setConfirmedRevision]=useState<string|null>(null);
 const refresh=()=>{let failed=false;try{invalidations[entity](client);}catch{failed=true;}try{if(onRefresh)onRefresh();else router.refresh();}catch{failed=true;}if(failed)setRefreshFailed(true);};
 const change=async(action:'active'|'lock'|'retire')=>{
  if(!session.isCurrent()||flight.current||admission.blocked||admission.waiting||session.recoveryError||terminalBlocked)return;
  const p=allowed.current;if(!(action==='lock'?p.lock:action==='retire'?p.retire:p.manage)||(row.is_locked&&action!=='lock'&&!p.overrideLocked))return;
  flight.current=true;setBusy(true);setMessage(null);let hadPending=false,confirmed=false;
  try{
   let pending=session.getPending();hadPending=pending!==null;
   if(!pending){if(confirmedRevision&&String(row.workspace_revision)!==confirmedRevision)return;
    pending=session.prepare({action,data:action==='lock'?{is_locked:!row.is_locked}:{is_active:action==='retire'?false:!row.is_active}});}
   // A remounted recovery uses the original action and desired state, never the
   // inversion of a refreshed row. No competing action can replace it.
   const result=await saveFinanceReference(entity,pending.id,pending.payload,pending.contract);
   if(!session.isCurrent())return;
   if(!result.success){
    if(hadPending||result.uncertain){session.setUncertain(true);setMessage('Change unconfirmed. Retry the same change to recover the original result.');}
    else{session.rejected();setMessage(result.error??'The change was rejected.');}
    return;
   }
   const receipt=verifyFinanceReferenceReceipt(result.data,pending.id,pending.contract);
   if(!receipt)throw Error('Incomplete receipt');
   confirmed=true;session.accept(receipt);setConfirmedRevision(receipt.revision);setRetireOpen(false);
   let feedbackFailed=false;try{toast.success(receipt.changed===false?'No changes to save':pending.payload.action==='retire'?'Record retired; history retained':'Record updated');}catch{feedbackFailed=true;}
   refresh();if(feedbackFailed)setRefreshFailed(true);
  }catch{
   if(!session.isCurrent())return;
   if(confirmed){setTerminalBlocked(true);session.setUncertain(false);setMessage('Change saved, but local recovery could not finish. Reload this list before continuing.');}
   else{session.setUncertain(true);setMessage('Change unconfirmed. Retry the same change to recover the original result.');}
  }finally{flight.current=false;if(session.isCurrent())setBusy(false);}
 };
 const retry=()=>{try{const pending=session.getPending();if(pending&&pending.payload.action!=='save')void change(pending.payload.action);}catch{setTerminalBlocked(true);}};
 const waiting=admission.waiting||!!(confirmedRevision&&String(row.workspace_revision)!==confirmedRevision);
 return <div>
  <FinanceBasicsActionsCell item={row} authContext={authContext} permissions={permissions} deleteLabel="Retire; keep history" disabled={busy||session.uncertain||admission.blocked||waiting||!!session.recoveryError||terminalBlocked||refreshFailed} onView={onView} onEdit={onEdit} onToggleActive={()=>void change('active')} onToggleLock={()=>void change('lock')} onDelete={()=>setRetireOpen(true)}/>
  {(message||session.recoveryError||admission.blocked)&&<p role="alert" className="max-w-xs text-xs">{message??session.recoveryError??'The retained action could not be verified. Reconcile this record before another change.'}</p>}
  {session.uncertain&&!session.recoveryError&&!admission.blocked&&!terminalBlocked&&<Button size="sm" variant="outline" disabled={busy} onClick={retry}>Retry same change</Button>}
  {(waiting||refreshFailed||terminalBlocked)&&<Button size="sm" variant="outline" disabled={busy} onClick={refresh}>Refresh list only</Button>}
  <AlertDialog open={retireOpen} onOpenChange={open=>{if(!busy&&!session.uncertain)setRetireOpen(open);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retire this record?</AlertDialogTitle><AlertDialogDescription>This makes the record inactive. Its identity, history and existing financial/document references remain unchanged. Nothing is permanently deleted.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy||session.uncertain}>Keep record</AlertDialogCancel><AlertDialogAction disabled={busy||session.uncertain} onClick={e=>{e.preventDefault();void change('retire');}}>Retire; keep history</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
