import {z} from 'zod';
import {hrSpecializedSchemas,hrSpecializedTables} from './specialized-settings-contract';

export const hrLookupTables = ['hr_employee_categories','hr_employment_types','hr_grades','hr_identity_document_types',
 'hr_access_card_types','hr_training_categories','hr_training_types','hr_medical_record_types','hr_leave_types',
 'hr_relationship_types','hr_salary_component_types','hr_payroll_groups','hr_pro_process_types'] as const;
export type HrLookupTable = typeof hrLookupTables[number];
export function isHrLookupTable(table:string):table is HrLookupTable {return (hrLookupTables as readonly string[]).includes(table);}
const optionalText=(max:number)=>z.string().trim().max(max).transform(v=>v||null).nullable().optional();
const duration=z.number().int().min(1).max(2147483647).nullable().optional();
const days=z.number().int().min(1).max(365).optional();
const flag=z.boolean().optional();
export const hrLookupCommonSchema=z.object({code:z.string().trim().regex(/^[A-Z0-9_-]{1,50}$/, 'Use up to 50 uppercase letters, numbers, underscores or hyphens.'),
 name_en:z.string().trim().min(1,'Name (English) is required.').max(200),name_ar:optionalText(200),description:optionalText(1000),
 is_active:z.boolean().optional(),sort_order:z.number().int().min(0).max(9999).optional()}).strict();
export const hrLookupSchemas={
 hr_employee_categories:hrLookupCommonSchema,hr_employment_types:hrLookupCommonSchema,hr_training_categories:hrLookupCommonSchema,hr_relationship_types:hrLookupCommonSchema,
 hr_grades:hrLookupCommonSchema.extend({grade_level:duration}),
 hr_identity_document_types:hrLookupCommonSchema.extend({requires_issue_date:flag,requires_expiry_date:flag,requires_document_number:flag,default_expiry_alert_days:days,is_government_document:flag,is_sensitive:flag}),
 hr_access_card_types:hrLookupCommonSchema.extend({default_expiry_alert_days:days,scope_type:z.enum(['global','site','client','configurable']).optional(),requires_work_site:flag,requires_client_authority:flag}),
 hr_training_types:hrLookupCommonSchema.extend({training_category_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),default_validity_months:duration,default_expiry_alert_days:days,requires_certificate_number:flag,requires_provider:flag,is_site_required:flag,is_designation_required:flag}),
 hr_medical_record_types:hrLookupCommonSchema.extend({default_validity_months:duration,default_expiry_alert_days:days,is_confidential:flag,requires_dms_document:flag}),
 hr_leave_types:hrLookupCommonSchema.extend({is_paid:flag,requires_document:flag,requires_approval:flag,default_entitlement_days:z.number().min(0).max(365).multipleOf(0.1,'Use at most one decimal place for entitlement days.').nullable().optional(),reset_basis:z.enum(['joining_anniversary','calendar_year','manual']).optional(),allow_half_day:flag}),
 hr_salary_component_types:hrLookupCommonSchema.extend({component_kind:z.enum(['earning','deduction','info']).optional(),is_basic:flag,is_wps_component:flag,is_taxable:flag}),
 hr_payroll_groups:hrLookupCommonSchema.extend({pay_frequency:z.enum(['monthly','weekly','biweekly','manual']).optional(),wps_applicable_default:flag}),
 hr_pro_process_types:hrLookupCommonSchema.extend({default_due_days:duration,default_expiry_alert_days:days,requires_dms_document:flag}),
} satisfies Record<HrLookupTable,z.ZodObject>;
export const hrSettingsTables=[...hrLookupTables,...hrSpecializedTables] as const;
export type HrSettingsTable=typeof hrSettingsTables[number];
export const hrSettingsSchemas={...hrLookupSchemas,...hrSpecializedSchemas};
export const hrLookupSaveReceipt=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),entity:z.enum(hrSettingsTables)}).strict();
export type HrLookupSaveReceipt=z.infer<typeof hrLookupSaveReceipt>;

/** Known options only; the entity-specific runtime schema rejects cross-catalogue fields. */
export type HrLookupFormInput = z.input<typeof hrLookupCommonSchema> & {
 is_active:boolean; sort_order:number;
} & Partial<
 z.input<typeof hrLookupSchemas.hr_grades> &
 z.input<typeof hrLookupSchemas.hr_identity_document_types> &
 z.input<typeof hrLookupSchemas.hr_access_card_types> &
 z.input<typeof hrLookupSchemas.hr_training_types> &
 z.input<typeof hrLookupSchemas.hr_medical_record_types> &
 z.input<typeof hrLookupSchemas.hr_leave_types> &
 z.input<typeof hrLookupSchemas.hr_salary_component_types> &
 z.input<typeof hrLookupSchemas.hr_payroll_groups> &
 z.input<typeof hrLookupSchemas.hr_pro_process_types>
>;
