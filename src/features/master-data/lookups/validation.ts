import {z} from 'zod';
const code=z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/);
const text=(max:number)=>z.string().max(max).nullable().optional();
const isoDate=z.string().refine(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Use a valid calendar date (YYYY-MM-DD).').nullable().optional();
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const order=z.number().int().min(0).max(2147483647);
export const categoryScopeSchema=z.enum(['GLOBAL','COMPANY','BRANCH','MODULE']);
const categoryFields={category_name_en:z.string().trim().min(2).max(200),category_name_ar:text(200),description:text(1000),module_code:text(50),category_scope:categoryScopeSchema,
 supports_hierarchy:z.boolean(),supports_color:z.boolean(),supports_icon:z.boolean(),supports_effective_dates:z.boolean(),supports_metadata:z.boolean(),is_active:z.boolean(),sort_order:order};
const valueFields={value_label_en:z.string().trim().min(1).max(200),value_label_ar:text(200),description:text(1000),parent_value_id:id.nullable().optional(),
 color_hex:z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),icon_name:text(50),badge_variant:text(50),sort_order:order,is_active:z.boolean(),effective_from:isoDate,effective_to:isoDate,metadata_json:z.record(z.string(),z.unknown()).optional()};
const dates=(v:{effective_from?:string|null;effective_to?:string|null})=>!v.effective_from||!v.effective_to||v.effective_from<=v.effective_to;
export const createLookupCategorySchema=z.object({...categoryFields,category_code:code.min(2),category_scope:categoryScopeSchema.default('GLOBAL'),
 supports_hierarchy:z.boolean().default(false),supports_color:z.boolean().default(false),supports_icon:z.boolean().default(false),supports_effective_dates:z.boolean().default(false),supports_metadata:z.boolean().default(true),is_active:z.boolean().default(true),sort_order:order.default(0)}).strict();
export const updateLookupCategorySchema=z.object(categoryFields).partial().extend({id}).strict();
export const createLookupValueSchema=z.object({...valueFields,category_id:id,value_code:code,sort_order:order.default(0),is_active:z.boolean().default(true),metadata_json:z.record(z.string(),z.unknown()).default({})}).strict().refine(dates,{path:['effective_to'],message:'Effective to must not precede effective from.'});
export const updateLookupValueSchema=z.object(valueFields).partial().extend({id}).strict().refine(dates,{path:['effective_to'],message:'Effective to must not precede effective from.'});
export const toggleLookupStatusSchema=z.object({id,is_active:z.boolean(),deactivation_reason:text(500)}).strict();
export const toggleLookupLockSchema=z.object({id,is_locked:z.boolean()}).strict();
export const setDefaultValueSchema=z.object({id,category_id:id}).strict();
export const reorderValuesSchema=z.object({category_id:id,value_ids:z.array(id).min(1)}).strict();
export type CreateLookupCategoryInput=z.infer<typeof createLookupCategorySchema>;
export type UpdateLookupCategoryInput=z.infer<typeof updateLookupCategorySchema>;
export type CreateLookupValueInput=z.infer<typeof createLookupValueSchema>;
export type UpdateLookupValueInput=z.infer<typeof updateLookupValueSchema>;
