import {z} from 'zod';

export const templateConfigurationReceipt=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),owner_company_id:z.number().int().positive().nullable()});
