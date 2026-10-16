import {z} from 'zod';
export const partySaveReceipt=z.object({
 id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 revision:z.string().regex(/^[1-9]\d*$/),
 changed:z.boolean(),
 replayed:z.boolean(),
}).strict();
export type PartySaveReceipt=z.infer<typeof partySaveReceipt>;
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const partyTypeState=z.object({
 id,revision:z.string().regex(/^[1-9]\d*$/).refine(v=>Number.isSafeInteger(Number(v))),primary:id.nullable(),
 assignments:z.array(z.object({id,typeId:id,primary:z.boolean(),name:z.string().nullable(),code:z.string().nullable(),active:z.boolean().nullable()}).strict()),
}).strict();
export type PartyTypeState=z.infer<typeof partyTypeState>;
