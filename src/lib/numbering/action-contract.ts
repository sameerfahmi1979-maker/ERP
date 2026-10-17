import {z} from 'zod';

const positiveInteger=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const selectors={ruleId:positiveInteger.optional(),ruleCode:z.string().trim().min(1).max(100).optional(),documentTypeCode:z.string().trim().min(1).max(100).optional()};
const hasSelector=(value:{ruleId?:number;ruleCode?:string;documentTypeCode?:string})=>value.ruleId!==undefined||value.ruleCode!==undefined||value.documentTypeCode!==undefined;
export const numberingPreviewInput=z.object({...selectors,nextSequenceNumber:positiveInteger.optional()}).refine(hasSelector,'Choose a numbering rule.');
export const numberingAllocationInput=z.object({...selectors,operationId:z.string().uuid().optional(),targetTableName:z.string().trim().min(1).max(100).optional(),targetRecordId:positiveInteger.optional(),generationReason:z.string().max(1000).optional()})
 .refine(hasSelector,'Choose a numbering rule.')
 .refine(value=>value.targetRecordId===undefined||value.targetTableName!==undefined,'A record requires its table.')
 .refine(value=>value.ruleId===undefined||value.operationId!==undefined,'An ID-selected allocation requires its retained operation ID.');

export const numberingPreviewReceipt=z.object({preview_reference_number:z.string().min(1),document_prefix:z.string().min(1),sequence_number:positiveInteger,format_template:z.string().min(1),rule_id:positiveInteger});
export const numberingLegacyReceipt=z.object({generated_reference_number:z.string().min(1),generated_sequence_number:positiveInteger,numbering_rule_id:positiveInteger,sequence_state_id:positiveInteger,generation_status:z.literal('consumed')});
export const numberingAllocationReceipt=numberingLegacyReceipt.extend({id:positiveInteger,replayed:z.boolean()});
export function singleNumberingReceipt(data:unknown):unknown{return Array.isArray(data)?data.length===1?data[0]:null:data;}
export function numberingRollback(code:unknown):boolean{return typeof code==='string'&&/^(22|23|42|P0|PT|40)/.test(code);}
export function numberingUnconfirmed(retained:boolean):string{
 return retained?'Allocation unconfirmed. Retry the same unchanged request to recover its result.':'Allocation unconfirmed. Reconcile the numbering history before trying again; another attempt could allocate a second number.';
}
export function numberingRejection(code:unknown):string{
 if(code==='42501')return 'You no longer have permission to use this numbering rule.';
 if(code==='P0002')return 'No active, effective numbering rule matches this selection.';
 if(code==='23505')return 'This number conflicts with existing history. Ask an administrator to review the rule; existing numbers must not be reused.';
 if(code==='PT409')return 'This operation was already completed differently. Reconcile its result before continuing.';
 return 'The request was rejected. Check the selected rule, its format, dates and allocation details.';
}
