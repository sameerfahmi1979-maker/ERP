import {z} from 'zod';
import type {WorkspaceDraftStoreApi} from '@/lib/workspace/workspace-draft-types';
import {saveStateSchema} from '@/hooks/use-workspace-save-session';
import {validFinanceReferenceRequest,type FinanceReferenceEntity} from '@/lib/master-data/finance-reference-contract';
const pendingSchema=z.object({id:z.number().int().positive(),payload:z.unknown(),contract:z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict()}).strict();
/** List actions own no editable draft. Reconcile only an idle, verified paired
 * witness to a newer authoritative row. Pending or corrupt bytes are never reset. */
export function admitFinanceReferenceAction(store:WorkspaceDraftStoreApi|null,ownerId:string|undefined,formId:string,entity:FinanceReferenceEntity,id:number,revision:number|undefined){
 const incoming=revision!==undefined&&Number.isSafeInteger(revision)&&revision>0?String(revision):null;
 if(!incoming)return {blocked:true,waiting:false};
 if(!ownerId||!store)return {blocked:true,waiting:false};
 const prefix=`draft:tab:${ownerId}:${formId}`,saveKey=prefix+':save',payloadKey=prefix+':administration-payload';
 try{
  const raw=store.getViewState(saveKey),payloadRaw=store.getViewState(payloadKey);
  if(raw===undefined){if(payloadRaw!==undefined&&payloadRaw!=='null')throw Error('Orphan request');return {blocked:false,waiting:false};}
  const saved=saveStateSchema.parse(JSON.parse(raw));
  if(saved.id!==id||!saved.revision||!/^[1-9]\d*$/.test(saved.revision))throw Error('Unverified record');
  const hasPayload=payloadRaw!==undefined&&payloadRaw!=='null';
  if(Boolean(saved.pending)!==hasPayload)throw Error('Incomplete request');
  if(saved.pending){
   const pending=pendingSchema.parse(JSON.parse(payloadRaw!));
   if(pending.id!==id||!validFinanceReferenceRequest(entity,pending.payload,id)||pending.payload.action==='save'
    ||pending.contract.revision!==saved.revision||pending.contract.operationId!==saved.pending.contract.operationId
    ||pending.contract.revision!==saved.pending.contract.revision||saved.pending.fingerprint!==JSON.stringify([pending.id,pending.payload]))throw Error('Unverified request');
   return {blocked:false,waiting:false};
  }
  if(BigInt(saved.revision)>BigInt(incoming))return {blocked:false,waiting:true};
  if(saved.revision!==incoming){const next=JSON.stringify({id,revision:incoming});store.setViewState(saveKey,next);if(store.getViewState(saveKey)!==next||store.getViewState(payloadKey)!==payloadRaw)throw Error('Failed acknowledgement');}
  return {blocked:false,waiting:false};
 }catch{return {blocked:true,waiting:false};}
}
