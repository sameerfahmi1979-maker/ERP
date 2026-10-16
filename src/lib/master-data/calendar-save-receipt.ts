import {z} from 'zod';

// Calendar/shift saves always return this complete, value-free transaction
// receipt. Do not acknowledge a draft using only a truthy revision string.
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const calendarSaveReceiptSchema=z.object({
 id,revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),
 owner_company_id:id.nullable(),calendar_id:id.nullable(),
});
