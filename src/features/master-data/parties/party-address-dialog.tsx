'use client';
import {Component,useState,type ReactNode} from 'react';
import {ERPChildDialogForm,type ERPChildDialogFormProps} from '@/components/erp/erp-child-dialog-form';
import {useWorkspaceDraftStoreContext} from '@/components/workspace/workspace-draft-provider';
import {useWorkspaceFormOwner} from '@/hooks/use-workspace-form-owner';
import {usePartyAddressSave,type SavePartyAddress} from './use-party-address-save';
import {resolvePartyRevisionOpening,partyRecoveryMessage,type PartyRevisionOpening} from './party-revision-recovery';
import type {PartyAddress} from './party-types';

type Props=Omit<ERPChildDialogFormProps,'onSubmit'|'closeDisabled'>&{
 formId:string;address?:PartyAddress|null;onSubmit:(save:SavePartyAddress)=>Promise<void>;
};
class AddressRecoveryBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?this.props.fallback:this.props.children;}
}
function AddressRecoveryBlock({children,...props}:Props){
 return <ERPChildDialogForm {...props} closeDisabled submitDisabled onSubmit={()=>{}}>
  <p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">{partyRecoveryMessage}</p>{children}
 </ERPChildDialogForm>;
}
/** Discover before mounting F04. Invalid namespaces never initialize a guessed key. */
export function PartyAddressDialog(props:Props){
 const store=useWorkspaceDraftStoreContext(),owner=useWorkspaceFormOwner();
 const [admission]=useState(()=>resolvePartyRevisionOpening({store,ownerId:owner?.id,family:'party-address',formId:props.formId,id:props.address?.id??null,revision:props.address?.workspace_revision}));
 const fallback=<AddressRecoveryBlock {...props}/>;
 if(!admission.ok)return fallback;
 return <AddressRecoveryBoundary fallback={fallback}><AddressReady {...props} opening={admission.opening}/></AddressRecoveryBoundary>;
}
function AddressReady({opening,formId,address,onSubmit,children,...props}:Props&{opening:PartyRevisionOpening}){
 const save=usePartyAddressSave(formId,address,opening);
 const [presentation,setPresentation]=useState(()=>({uncertain:!!opening.initial.pending,blocked:false,confirmed:false}));
 const submit=async()=>{
  if(!save.isCurrent()||save.status().blocked)return;
  let confirmed=false;
  const interrupted={};
  try{
   await onSubmit(async payload=>{
    const owns=save.captureLease();
    const result=await save(payload);
    if(result.success)confirmed=true;
    const state=save.status();
    if(owns()){
     setPresentation({uncertain:state.terminal===null&&(result.uncertain===true||state.pending),blocked:state.blocked,confirmed:state.terminal==='confirmed'});
    }
    // Delegates branch immediately on this result. Abort a stale or blocked
    // continuation while preserving the hook's authoritative receipt.
    if(!owns()||state.blocked)throw interrupted;
    return result;
   });
  }catch(error){
   if(error===interrupted)return;
   if(!confirmed)throw error;
   save.stopConfirmed();
   if(save.isCurrent())setPresentation({uncertain:false,blocked:true,confirmed:true});
  }
 };
 const blocked=presentation.blocked||save.status().blocked;
 const message=presentation.confirmed?'The save was confirmed, but local recovery or display could not finish. Reconcile the saved record before another change.':
  blocked?partyRecoveryMessage:'The save result is not confirmed. Keep or restore the submitted values and retry to recover the result before closing.';
 // A delegate without finally may retain its busy flag after interruption.
 // Once this wrapper has stopped, keep its recovery explanation accessible.
 return <ERPChildDialogForm {...props} isSubmitting={blocked?false:props.isSubmitting} closeDisabled={presentation.uncertain||blocked} submitDisabled={props.submitDisabled||blocked} onSubmit={submit}>
  {(presentation.uncertain||blocked)&&<p role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">{message}</p>}
  {children}
 </ERPChildDialogForm>;
}
