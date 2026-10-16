'use client';
import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';

import {useRef,useState,useLayoutEffect} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Eye,Pencil,Power,Lock,Unlock,Trash2,MoreHorizontal} from 'lucide-react';
import {hasGlobalPermission} from '@/lib/rbac/scope';
import type {AuthContext} from '@/lib/rbac/check';
import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {financeCenterSaveReceiptSchema,type FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';
import {invalidateCostCenters,invalidateProfitCenters} from '@/lib/query/invalidation';
import * as actions from '../actions';
type Row={id:number;is_active:boolean;is_locked:boolean;workspace_revision?:number};
type Action='active'|'lock'|'retire';
const mutations={cost_centers:{active:actions.toggleCostCenterStatus,lock:actions.toggleCostCenterLock,retire:actions.deleteCostCenter},
 profit_centers:{active:actions.toggleProfitCenterStatus,lock:actions.toggleProfitCenterLock,retire:actions.deleteProfitCenter}};
const invalidations={cost_centers:invalidateCostCenters,profit_centers:invalidateProfitCenters};
export function useFinanceCenterLifecycle(entity:FinanceCenterEntity,confirmed:()=>void){
 const client=useQueryClient();
 const [scope]=useState(()=>({entity,client}));
 const retired=useRef(false),activation=useRef<{active:boolean}|null>(null);
 type Pending={row:Row;entity:FinanceCenterEntity;action:Action;desired:boolean;contract:ReturnType<ReturnType<typeof createWorkspaceSaveAttempt>['begin']>;hadUnknown:boolean};
 const pending=useRef<Pending|null>(null);
 const flight=useRef<{lease:{active:boolean};target:Pending}|null>(null);
 const [busy,setBusy]=useState(false),[unconfirmed,setUnconfirmed]=useState(false),[error,setError]=useState<string|null>(null),[refreshError,setRefreshError]=useState(false);
 useLayoutEffect(()=>{
  if(entity!==scope.entity||client!==scope.client)retired.current=true;
  const lease={active:!retired.current};activation.current=lease;
  return ()=>{
   lease.active=false;
   if(flight.current?.lease===lease){
    // A dispatched request outlives its view; a later live retry cannot assume rollback.
    flight.current.target.hadUnknown=true;flight.current=null;
   }
  };
 },[entity,client,scope]);
 const change=async(row:Row,action:Action):Promise<boolean>=>{
  const lease=activation.current;
  if(!lease?.active||retired.current||flight.current)return false;
  const desired=action==='lock'?!row.is_locked:action==='retire'?false:!row.is_active;
  if(pending.current&&(pending.current.row.id!==row.id||pending.current.entity!==entity||pending.current.action!==action||pending.current.desired!==desired))return false;
  if(!pending.current){
   const snapshot={id:row.id,is_active:row.is_active,is_locked:row.is_locked,workspace_revision:row.workspace_revision};
   const data=action==='lock'?{is_locked:desired}:{is_active:desired};
   try{
    const contract={...createWorkspaceSaveAttempt().begin(data,row.workspace_revision==null?null:String(row.workspace_revision))};
    pending.current={row:snapshot,entity,action,desired,contract,hadUnknown:false};
   }catch{setError('The change could not be prepared. Reopen this list before continuing.');return false;}
  }
  const target=pending.current,dispatch={lease,target};flight.current=dispatch;
  const current=()=>lease.active&&!retired.current&&activation.current===lease&&flight.current===dispatch;
  setBusy(true);setError(null);
  try{
   const handlers=mutations[target.entity],contract={...target.contract};
   const result=target.action==='lock'?await handlers.lock(target.row.id,target.desired,contract):target.action==='retire'?await handlers.retire(target.row.id,contract):await handlers.active({id:target.row.id,is_active:target.desired},contract);
   if(!current())return false;
   const receipt=financeCenterSaveReceiptSchema.safeParse(result.data);
   if(result.success&&(!receipt.success||receipt.data.id!==target.row.id)){
    target.hadUnknown=true;setUnconfirmed(true);setError('Change unconfirmed. Retry the same action to recover its complete result.');return false;
   }
   if(!result.success){
    target.hadUnknown ||= result.uncertain===true;
    if(!target.hadUnknown)pending.current=null;
    setUnconfirmed(target.hadUnknown);setError(target.hadUnknown?'Change unconfirmed. Retry the same action to recover its result.':result.error??'The change was not saved.');return false;
   }
   // A matching receipt is terminal before any independently fallible local effect.
   pending.current=null;setUnconfirmed(false);
   let refreshFailed=false;
   try{toast.success(result.data?.changed===false?'No changes to save':target.action==='retire'?'Record retired; history retained':target.action==='lock'?(target.desired?'Record locked':'Record unlocked'):(target.desired?'Record activated':'Record deactivated'));}catch{refreshFailed=true;}
   if(!current())return true;
   try{invalidations[target.entity](client);}catch{refreshFailed=true;}
   if(!current())return true;
   try{confirmed();}catch{refreshFailed=true;}
   if(current())setRefreshError(refreshFailed);
   return true;
  }catch{
   if(current()){target.hadUnknown=true;setUnconfirmed(true);setError('Change unconfirmed. Retry the same action to recover its result.');}return false;
  }finally{
   if(current()){flight.current=null;setBusy(false);}
  }
 };
 return {change,busy,unconfirmed,error,refreshError,retry:()=>pending.current?change(pending.current.row,pending.current.action):Promise.resolve(false)};
}
export function FinanceCenterLifecycleNotice({state}:{state:ReturnType<typeof useFinanceCenterLifecycle>}){
 return <>{state.error&&<div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm"><p>{state.error}</p>{state.unconfirmed&&<Button size="sm" variant="outline" disabled={state.busy} onClick={()=>void state.retry()}>Retry same change</Button>}</div>}
  {state.refreshError&&<p role="status" className="mb-3 text-sm text-muted-foreground">The change was saved, but the display could not refresh. Reopen this list before continuing.</p>}</>;
}
export function FinanceCenterActionsCell({row,authContext,disabled,onView,onEdit,onToggleActive,onToggleLock,onDelete}:{
 row:Row;authContext:AuthContext;disabled?:boolean;onView:()=>void;onEdit:()=>void;onToggleActive:()=>void;onToggleLock:()=>void;onDelete:()=>void;
}){
 const manage=hasGlobalPermission(authContext,'master_data.finance_basics.manage'),lock=hasGlobalPermission(authContext,'master_data.lookups.lock'),admin=isFinanceSystemAdmin(authContext);
 return <DropdownMenu><DropdownMenuTrigger render={<Button aria-label="Record actions" disabled={disabled} variant="ghost" size="icon" className="h-8 w-8"/>}><MoreHorizontal className="h-4 w-4"/></DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-48"><DropdownMenuGroup><DropdownMenuItem onClick={onView}><Eye className="mr-2 h-4 w-4"/>View details</DropdownMenuItem>
   {manage&&<DropdownMenuItem onClick={onEdit} disabled={row.is_locked&&!admin}><Pencil className="mr-2 h-4 w-4"/>Edit</DropdownMenuItem>}</DropdownMenuGroup>
   {(manage||lock)&&<><DropdownMenuSeparator/><DropdownMenuGroup>{manage&&<DropdownMenuItem onClick={onToggleActive} disabled={row.is_locked&&!admin}><Power className="mr-2 h-4 w-4"/>{row.is_active?'Deactivate':'Activate'}</DropdownMenuItem>}
    {lock&&<DropdownMenuItem onClick={onToggleLock}>{row.is_locked?<Unlock className="mr-2 h-4 w-4"/>:<Lock className="mr-2 h-4 w-4"/>}{row.is_locked?'Unlock':'Lock'}</DropdownMenuItem>}</DropdownMenuGroup></>}
   {admin&&<><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuItem onClick={onDelete}><Trash2 className="mr-2 h-4 w-4"/>Retire; keep history</DropdownMenuItem></DropdownMenuGroup></>}
  </DropdownMenuContent></DropdownMenu>;
}
