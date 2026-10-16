import {z} from 'zod';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const departmentSaveReceiptSchema=z.object({id,revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),owner_company_id:id,branch_id:id.nullable()});
