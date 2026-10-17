import {createWorkspaceSaveAttempt} from '@/lib/workspace/save-contract';
import {partyTypeSaveReceipt,partyTypeSchema} from './party-type-contract';
import {createPartyType,updatePartyType,getPartyTypeAdminById,type PartyTypeAdminRow} from '@/server/actions/master-data/party-admin-masters';
type Payload=Parameters<typeof createPartyType>[0];
/** Mounted catalogue recovery only; no additional cache or persistence framework. */
export function createPartyTypeAttempt(){
 const save=createWorkspaceSaveAttempt();
 let request:{key:string;id:number|null;revision:string|null;payload:Payload;uncertain:boolean}|undefined;
 let committed:ReturnType<typeof partyTypeSaveReceipt.parse>|undefined;
 let confirmed:{row:PartyTypeAdminRow;receipt:ReturnType<typeof partyTypeSaveReceipt.parse>}|undefined;
 let running:{isCurrent:()=>boolean}|undefined;
 const retiredMessage='This catalogue view is no longer current. Reopen it before continuing.';
 const reloadMessage='Saved. The latest type could not be loaded. Retry loading it before another change.';
 return {
  pending:()=>request!==undefined,
  saved:()=>committed!==undefined,
  async run(row:Pick<PartyTypeAdminRow,'id'|'workspace_revision'>|null,payload:Payload,isCurrent:()=>boolean=()=>true){
   if(!isCurrent())throw Error(retiredMessage);
   if(running?.isCurrent())throw Error('The catalogue save is already running. Wait for its result.');
   // Cleanup cannot disprove a dispatched write. A fresh activation may retry
   // that same immutable operation, but must not trust a later known rollback.
   if(running&&request)request.uncertain=true;
   const key=JSON.stringify([row?.id??null,payload]);
   if(request&&request.key!==key)throw Error('A previous save is unconfirmed. Retry its unchanged entries first.');
   if(confirmed)return structuredClone(confirmed);
   if(!request){
    if(row&&(!Number.isSafeInteger(row.id)||row.id<1||!Number.isSafeInteger(row.workspace_revision)||(row.workspace_revision??0)<1))throw Error('Reopen this record: its revision is unavailable.');
    const validated=partyTypeSchema.parse(payload);
    request={key,id:row?.id??null,revision:row?String(row.workspace_revision):null,payload:structuredClone(validated),uncertain:false};
   }
   const target=request,dispatch={isCurrent};running=dispatch;
   const ensureCurrent=(afterDispatch=false)=>{
    if(running!==dispatch||!isCurrent()){
     // A discarded action result cannot prove rollback. Record that fact before
     // releasing this owner, but never touch a replacement or confirmed request.
     if(afterDispatch&&running===dispatch&&request===target&&!committed)target.uncertain=true;
     throw Error(retiredMessage);
    }
   };
   try{
    if(!committed){
     const contract={...save.begin([target.id,target.payload],target.revision)};
     let result;
     try{
      result=target.id===null?await createPartyType(structuredClone(target.payload),contract):await updatePartyType(target.id,structuredClone(target.payload),contract);
     }catch{
      ensureCurrent(true);target.uncertain=true;throw Error('Save unconfirmed. Retry the same unchanged entries.');
     }
     ensureCurrent(true);
     if(!result.success){
      target.uncertain ||= result.uncertain===true;
      if(!target.uncertain){request=undefined;save.resolved();}
      throw Error(target.uncertain&&!result.uncertain?'An earlier save remains unconfirmed. Retry the same unchanged entries to recover its result.':result.error??'The catalogue change could not be saved.');
     }
     const receipt=partyTypeSaveReceipt.safeParse(result.data);
     if(!receipt.success||(target.id!==null&&receipt.data.id!==target.id)){target.uncertain=true;throw Error('Save response incomplete. Retry the same unchanged entries.');}
     committed=receipt.data;
    }
    ensureCurrent();
    let loaded;
    try{loaded=await getPartyTypeAdminById(committed.id);}
    catch{ensureCurrent();throw Error(reloadMessage);}
    ensureCurrent();
    if(!loaded.success||!loaded.data||loaded.data.id!==committed.id||!Number.isSafeInteger(loaded.data.workspace_revision)||(loaded.data.workspace_revision??0)<1||BigInt(loaded.data.workspace_revision!)<BigInt(committed.revision))throw Error(reloadMessage);
    confirmed=structuredClone({row:loaded.data,receipt:committed});
    return structuredClone(confirmed);
   }finally{if(running===dispatch)running=undefined;}
  },
  acknowledged(){
   if(running||!confirmed)throw Error('Load the confirmed catalogue record before acknowledging its save.');
   request=undefined;committed=undefined;confirmed=undefined;save.resolved();
  },
 };
}
