import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {FinanceReferenceEntity,FinanceReferenceRequest} from '@/lib/master-data/finance-reference-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import * as actions from './actions';
/** The original data object is not rebuilt or resolved against current choices. */
export function saveFinanceReference(entity:FinanceReferenceEntity,id:number|null,request:FinanceReferenceRequest,contract:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const {action,data}=request;
 if(action==='lock'){const locked=data.is_locked as boolean;return entity==='banks'?actions.toggleBankLock(id!,locked,contract):entity==='payment_terms'?actions.togglePaymentTermLock(id!,locked,contract):actions.toggleTaxTypeLock(id!,locked,contract);}
 if(action==='retire')return entity==='banks'?actions.deleteBank(id!,contract):entity==='payment_terms'?actions.deletePaymentTerm(id!,contract):actions.deleteTaxType(id!,contract);
 if(action==='active'){const payload={id:id!,is_active:data.is_active as boolean,...(Object.hasOwn(data,'deactivation_reason')?{deactivation_reason:data.deactivation_reason as string|null}:{})};return entity==='banks'?actions.toggleBankStatus(payload,contract):entity==='payment_terms'?actions.togglePaymentTermStatus(payload,contract):actions.toggleTaxTypeStatus(payload,contract);}
 // Runtime schemas in each action's adapter validate the complete fixed payload.
 // These overload boundaries keep existing exported action signatures compatible.
 if(entity==='banks')return id===null?actions.createBank(data as Parameters<typeof actions.createBank>[0],contract):actions.updateBank({id,...data},contract);
 if(entity==='payment_terms')return id===null?actions.createPaymentTerm(data as Parameters<typeof actions.createPaymentTerm>[0],contract):actions.updatePaymentTerm({id,...data},contract);
 return id===null?actions.createTaxType(data as Parameters<typeof actions.createTaxType>[0],contract):actions.updateTaxType({id,...data},contract);
}
