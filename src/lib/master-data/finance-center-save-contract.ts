import {z} from 'zod';
export type FinanceCenterEntity='cost_centers'|'profit_centers';
export const financeCenterPaths:Record<FinanceCenterEntity,string>={cost_centers:'cost-centers',profit_centers:'profit-centers'};
export const financeCenterSaveReceiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
