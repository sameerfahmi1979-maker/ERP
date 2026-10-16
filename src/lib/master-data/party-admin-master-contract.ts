import {z} from 'zod';

export const partyAdminMasterEntities=['party_service_categories_master','party_relationship_types'] as const;
export type PartyAdminMasterEntity=typeof partyAdminMasterEntities[number];
export const partyAdminMasterPermission={party_service_categories_master:'master_data.parties.manage_services',party_relationship_types:'master_data.parties.manage_relationships'} as const;
export const partyAdminMasterPath={party_service_categories_master:'/admin/master-data/parties/service-categories',party_relationship_types:'/admin/master-data/parties/relationship-types'} as const;
const code=z.string().regex(/^[A-Z0-9_]{1,100}$/,'Use uppercase letters, digits and underscores (maximum 100).');
const name=z.string().trim().min(1,'Name is required.').max(200);
const optionalName=z.string().trim().max(200).nullable().optional();
const common={description:z.string().trim().max(2000).nullable().optional(),is_active:z.boolean().default(true),sort_order:z.number().int().min(0).max(2147483647).default(0)};
export const serviceCategorySchema=z.object({category_code:code,category_name_en:name,category_name_ar:optionalName,parent_category_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),...common}).strict();
export const relationshipTypeSchema=z.object({relationship_code:code,name_en:name,name_ar:optionalName,...common}).strict();
// Zod 4 partial() retains inner defaults. Explicitly unwrap them for patches:
// a description-only edit must not activate a retired row or reset its order.
const patchState={is_active:z.boolean().optional(),sort_order:z.number().int().min(0).max(2147483647).optional()};
export const serviceCategoryUpdateSchema=serviceCategorySchema.partial().extend(patchState).refine(v=>Object.values(v).some(x=>x!==undefined),'No changes were provided.');
export const relationshipTypeUpdateSchema=relationshipTypeSchema.partial().extend(patchState).refine(v=>Object.values(v).some(x=>x!==undefined),'No changes were provided.');
export const partyAdminMasterSaveReceipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
export type PartyAdminMasterReceipt=z.infer<typeof partyAdminMasterSaveReceipt>;
