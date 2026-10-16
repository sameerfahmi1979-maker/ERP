import { z } from 'zod';
import type { WorkspaceSaveContract } from '@/lib/workspace/save-contract';

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const lookupRevision = z.string().regex(/^[1-9]\d*$/).refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER));
export const lookupCommandSchema = z.object({
  kind: z.enum(['category', 'value']), action: z.enum(['save', 'active', 'lock', 'default']),
  categoryId: id.nullable(), categoryRevision: lookupRevision.nullable(), data: z.record(z.string(), z.unknown()),
}).strict().superRefine((v, ctx) => {
  if (v.kind === 'category' ? v.categoryId !== null || v.categoryRevision !== null || v.action === 'default' : v.categoryId === null || v.categoryRevision === null)
    ctx.addIssue({code:'custom',message:'Lookup category identity is incomplete.'});
});
export type LookupCommand = z.infer<typeof lookupCommandSchema>;
export type LookupMutationContract = WorkspaceSaveContract & { categoryId: number | null; categoryRevision: string | null };
export const lookupContractSchema = z.object({operationId:z.string().uuid(), revision:lookupRevision.nullable(), categoryId:id.nullable(), categoryRevision:lookupRevision.nullable()}).strict();
export const lookupReceiptSchema = z.object({
  id, revision:lookupRevision, category_id:id, category_revision:lookupRevision,
  kind:z.enum(['category','value']), action:z.enum(['save','active','lock','default']), operation_id:z.string().uuid(),
  changed:z.boolean(), replayed:z.boolean(),
}).strict();
export type LookupMutationReceipt = z.infer<typeof lookupReceiptSchema>;
export type LookupMutationResult = {success:boolean;data?:LookupMutationReceipt;error?:string;uncertain?:boolean;refreshWarning?:boolean};

/** Validate the original submitted identity, not whatever props a refresh returned. */
export function verifyLookupReceipt(raw:unknown, recordId:number|null, command:LookupCommand, contract:WorkspaceSaveContract):LookupMutationReceipt {
  const r=lookupReceiptSchema.parse(raw);
  if(recordId===null&&(!r.changed||command.action!=='save'))throw new Error('Lookup creation receipt is incomplete.');
  if(r.kind!==command.kind||r.action!==command.action||r.operation_id!==contract.operationId||(recordId!==null&&r.id!==recordId))throw new Error('Lookup receipt does not match this request.');
  const expected=recordId===null?'1':String(BigInt(contract.revision!)+BigInt(r.changed?1:0));
  if(r.revision!==expected)throw new Error('Lookup receipt revision does not match this request.');
  if(command.kind==='category'){
    if(r.category_id!==r.id||r.category_revision!==r.revision)throw new Error('Lookup category receipt does not match.');
  }else if(r.category_id!==command.categoryId||r.category_revision!==String(BigInt(command.categoryRevision!)+BigInt(r.changed?1:0)))throw new Error('Lookup parent receipt does not match.');
  return r;
}

export function lookupWriteError(code:unknown):Pick<LookupMutationResult,'error'|'uncertain'> {
  if(code==='PT404')return {error:'This lookup record or category no longer exists. Reopen the list and check it.',uncertain:false};
  if(code==='PT409'||code==='40001')return {error:'This lookup or its category changed after you opened it. Your entries are retained; reopen and compare before saving.',uncertain:false};
  if(code==='42501')return {error:'Global lookup permission is required. Protected records also require global lock permission.',uncertain:false};
  if(code==='23505')return {error:'This lookup code already exists. No existing record or default was replaced.',uncertain:false};
  const known=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40002','40P01'].includes(code));
  return {error:known?'The change was rejected and rolled back. Check the fields, active dates and locks. Choose a replacement before retiring a default; existing default ambiguity needs review.':'Save unconfirmed. Retry the original unchanged request to recover its result.',uncertain:!known};
}
