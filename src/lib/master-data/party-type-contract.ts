import {z} from 'zod';
export const partyTypeSchema=z.object({
 type_code:z.string().regex(/^[A-Z0-9_]{1,100}$/,'Use uppercase letters, digits and underscores (maximum 100).'),
 type_name:z.string().trim().min(1,'Name is required.').max(200),
 type_name_ar:z.string().trim().max(200).nullable().optional(),
 description:z.string().trim().max(2000).nullable().optional(),
 icon_name:z.string().trim().max(100).nullable().optional(),
 color_token:z.string().trim().max(100).nullable().optional(),
 is_active:z.boolean().default(true),sort_order:z.number().int().min(0).max(2147483647).default(0),
}).strict();
// Zod 4 partial() retains inner defaults; patches must not invent state/order.
export const partyTypeUpdateSchema=partyTypeSchema.partial().extend({
 is_active:z.boolean().optional(),sort_order:z.number().int().min(0).max(2147483647).optional(),
}).refine(value=>Object.values(value).some(field=>field!==undefined),'No changes were provided.');
export const partyTypeSaveReceipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
