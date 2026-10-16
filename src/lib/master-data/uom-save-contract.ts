import {z} from 'zod';
export type UomEntity='uom_categories'|'units_of_measure'|'uom_conversions';
export const uomPaths:Record<UomEntity,string>={uom_categories:'categories',units_of_measure:'units',uom_conversions:'conversions'};
export const uomSaveReceiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
