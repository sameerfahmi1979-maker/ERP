import {z} from 'zod';
export const scheduleSaveReceiptSchema=z.object({id:z.number().int().positive().refine(Number.isSafeInteger),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).strict();
export type ScheduleSaveReceipt=z.infer<typeof scheduleSaveReceiptSchema>;
