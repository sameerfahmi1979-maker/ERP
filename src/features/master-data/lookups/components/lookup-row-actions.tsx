'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {MoreHorizontal} from 'lucide-react';
import {toast} from 'sonner';
import {useLookupMutation} from '../use-lookup-mutation';
import type {LookupCommand} from '../mutation-contract';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {resolveLookupActionOpening,type LookupActionOpening} from '../action-revision-recovery';

type Props={kind:'category'|'value';id:number;revision:number;active:boolean;locked:boolean;isDefault?:boolean;
 categoryId?:number;categoryRevision?:number;categoryLocked?:boolean;categoryActive?:boolean;
 canManage:boolean;canLock:boolean;onView:()=>void;onEdit:()=>void;onRefresh:()=>void;readGeneration?:string};
export function LookupRowActions(p:Props){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const [scope]=useState(()=>({store,owner:owner?.id}));
 const [,settled]=useState(0);
 const [reloadState,setReloadState]=useState<{requested:{generation:string|undefined}|null;settled:string}>({requested:null,settled:''});
 const reload=()=>{setReloadState(old=>({...old,requested:{generation:p.readGeneration}}));p.onRefresh();};
 const admission=resolveLookupActionOpening({store,ownerId:owner?.id,kind:p.kind,id:p.id,revision:p.revision,categoryId:p.categoryId,categoryRevision:p.categoryRevision});
 if(scope.store!==store||scope.owner!==owner?.id||!admission.ok)return <div role="alert">{admission.ok?'The account or workspace changed. Reopen this list.':admission.error}<Button variant="outline" size="sm" onClick={reload}>Reload latest lookup list</Button></div>;
 // A click/rerender/failed read is not authority. Only a fresh successful server
 // read may remount an explicitly reloaded, settled and strictly verified action.
 // Pending originals, corrupt witnesses and changed-account scopes never reset.
 let settledGeneration=reloadState.settled;
 if(reloadState.requested&&p.readGeneration&&reloadState.requested.generation!==p.readGeneration&&!admission.opening.pending){
  settledGeneration=p.readGeneration;setReloadState({requested:null,settled:p.readGeneration});
 }
 const admitAction=()=>{const latest=resolveLookupActionOpening({store,ownerId:owner?.id,kind:p.kind,id:p.id,revision:p.revision,categoryId:p.categoryId,categoryRevision:p.categoryRevision});return latest.ok&&latest.opening.formKey===admission.opening.formKey;};
 return <LookupActionSession key={`${admission.opening.formKey}:${settledGeneration}`} {...p} opening={admission.opening} admitAction={admitAction} onReload={reload} onSettled={()=>settled(v=>v+1)}/>;
}
function LookupActionSession(p:Props&{opening:LookupActionOpening;admitAction:()=>boolean;onReload:()=>void;onSettled:()=>void}){
 const session=useLookupMutation(p.opening.formKey,p.id,p.opening.revision,p.admitAction);
 const [known,setKnown]=useState<{revision:number;active:boolean;locked:boolean;isDefault:boolean}|null>(null);
 const [waiting,setWaiting]=useState<{revision:number;categoryRevision:number}|null>(null);
 const [rejected,setRejected]=useState(false);
 const row=known&&known.revision>=p.revision?known:{active:p.active,locked:p.locked,isDefault:p.isDefault??false};
 const protectedRow=row.locked||!!p.categoryLocked;
 const canEdit=p.canManage&&(!protectedRow||p.canLock);
 const namespaceCategory=p.kind==='value'?p.opening.formKey.match(/:(\d+)$/)?.[1]:undefined;
 const awaitingSnapshot=p.revision<p.opening.revision||(namespaceCategory!==undefined&&(p.categoryRevision??0)<Number(namespaceCategory))
  ||!!waiting&&(p.revision<waiting.revision||(p.kind==='value'&&(p.categoryRevision??0)<waiting.categoryRevision));
 const disabled=session.working||session.uncertain||session.blocked||awaitingSnapshot||rejected;
 const perform=async(action:LookupCommand['action'],data:Record<string,unknown>)=>{
  const result=await session.run({kind:p.kind,action,categoryId:p.kind==='value'?p.categoryId??null:null,categoryRevision:p.kind==='value'?String(p.categoryRevision??''):null,data});
  if(result.success&&result.acknowledged){
   setWaiting({revision:Number(result.data!.revision),categoryRevision:Number(result.data!.category_revision)});
   setKnown({revision:Number(result.data!.revision),active:action==='active'?Boolean(data.is_active):row.active,locked:action==='lock'?Boolean(data.is_locked):row.locked,isDefault:action==='default'?true:row.isDefault});
   try{toast.success('Lookup change saved.');p.onRefresh();}catch{toast.warning('Saved. Reopen this list to refresh it.');}
   p.onSettled();
  }else if(result.success)toast.warning('Saved. Reopen this list before another change.');
  else{if(!result.uncertain){setRejected(true);p.onSettled();}toast.error(result.error??'Lookup change rejected.');}
 };
 const recover=async()=>{
  const result=await session.run();
  if(result.success&&result.acknowledged){
   setWaiting({revision:Number(result.data!.revision),categoryRevision:Number(result.data!.category_revision)});
   const original=result.retainedCommand!;
   setKnown({revision:Number(result.data!.revision),active:original.action==='active'?Boolean(original.data.is_active):row.active,
    locked:original.action==='lock'?Boolean(original.data.is_locked):row.locked,isDefault:original.action==='default'?true:row.isDefault});
   try{toast.success('Original lookup result recovered.');p.onRefresh();}catch{toast.warning('Saved. Reopen this list to refresh it.');}
   p.onSettled();
  }
  else toast.error(result.error??'Reopen this list to reconcile the original request.');
 };
 return <div className="space-y-1">
  <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" disabled={session.working}/>}><MoreHorizontal className="h-4 w-4"/><span className="sr-only">Open lookup actions</span></DropdownMenuTrigger>
   <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={p.onView}>View details</DropdownMenuItem>
    {p.canManage&&<DropdownMenuItem onClick={p.onEdit} disabled={disabled||!canEdit}>Edit</DropdownMenuItem>}
    {p.kind==='value'&&p.canManage&&<DropdownMenuItem disabled={disabled||!canEdit||row.isDefault||!row.active||p.categoryActive===false} onClick={()=>void perform('default',{})}>Set as Default</DropdownMenuItem>}
    {p.canManage&&<DropdownMenuItem disabled={disabled||!canEdit||(p.kind==='value'&&row.isDefault&&row.active)} onClick={()=>void perform('active',{is_active:!row.active})}>{row.active?'Deactivate':'Activate'}</DropdownMenuItem>}
    {p.canLock&&<DropdownMenuItem disabled={disabled} onClick={()=>void perform('lock',{is_locked:!row.locked})}>{row.locked?'Unlock':'Lock'}</DropdownMenuItem>}
   </DropdownMenuContent>
  </DropdownMenu>
  {(session.message||session.recoveryError)&&<p role="status" className="max-w-xs text-xs">{session.message??session.recoveryError}</p>}
  {(awaitingSnapshot||rejected)&&<div role="status" className="max-w-xs text-xs">{awaitingSnapshot?'Saved. Waiting for the latest lookup snapshot before another change.':'The action was rejected. Reload and compare the latest lookup before a new action.'}<Button size="sm" variant="outline" onClick={p.onReload}>Reload latest lookup list</Button></div>}
  {session.uncertain&&!session.blocked&&<Button size="sm" variant="outline" disabled={session.working} onClick={()=>void recover()}>Recover original request</Button>}
 </div>;
}
