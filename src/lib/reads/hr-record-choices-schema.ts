import {z} from "zod";
export const HR_RECORD_CHOICE_CONFIG={
 "identity-types":{table:"hr_identity_document_types",extra:"requires_issue_date,requires_expiry_date,requires_document_number,default_expiry_alert_days,is_government_document,is_sensitive"},
 relationships:{table:"hr_relationship_types",extra:""},
 "access-card-types":{table:"hr_access_card_types",extra:"default_expiry_alert_days,scope_type,requires_work_site,requires_client_authority"},
 "training-categories":{table:"hr_training_categories",extra:""},
 "training-types":{table:"hr_training_types",extra:"training_category_id,default_validity_months,default_expiry_alert_days,requires_certificate_number,requires_provider,is_site_required,is_designation_required"},
 "medical-types":{table:"hr_medical_record_types",extra:"default_validity_months,default_expiry_alert_days,is_confidential,requires_dms_document"},
} as const;
export const hrRecordChoiceKind=z.enum(["identity-types","relationships","access-card-types","training-categories","training-types","medical-types"]);
export type HrRecordChoiceKind=z.infer<typeof hrRecordChoiceKind>;
export const hrRecordChoiceCriteria=z.object({kind:hrRecordChoiceKind,selectedId:z.number().int().positive().safe().nullable().default(null)}).strict();
export const hrRecordChoiceRow=z.object({id:z.number().int().positive().safe(),code:z.string(),name_en:z.string(),name_ar:z.string().nullable(),description:z.string().nullable(),is_active:z.boolean(),sort_order:z.number().int(),created_at:z.string(),updated_at:z.string(),deleted_at:z.null()}).passthrough();
const integer=z.number().int(),optionalMonths=integer.nullable();
const extraSchemas={
 "identity-types":z.object({requires_issue_date:z.boolean(),requires_expiry_date:z.boolean(),requires_document_number:z.boolean(),default_expiry_alert_days:integer,is_government_document:z.boolean(),is_sensitive:z.boolean()}),
 relationships:z.object({}),"training-categories":z.object({}),
 "access-card-types":z.object({default_expiry_alert_days:integer,scope_type:z.string(),requires_work_site:z.boolean(),requires_client_authority:z.boolean()}),
 "training-types":z.object({training_category_id:z.number().int().positive().safe().nullable(),default_validity_months:optionalMonths,default_expiry_alert_days:integer,requires_certificate_number:z.boolean(),requires_provider:z.boolean(),is_site_required:z.boolean(),is_designation_required:z.boolean()}),
 "medical-types":z.object({default_validity_months:optionalMonths,default_expiry_alert_days:integer,is_confidential:z.boolean(),requires_dms_document:z.boolean()}),
};
export const hrRecordChoiceResult=z.object({kind:hrRecordChoiceKind,rows:z.array(hrRecordChoiceRow).max(2001),totalCount:z.number().int().nonnegative().max(2000),selectedId:z.number().nullable()}).strict()
 .refine(p=>new Set(p.rows.map(r=>r.id)).size===p.rows.length&&p.rows.filter(r=>r.is_active).length===p.totalCount&&p.rows.every(r=>r.is_active||r.id===p.selectedId),"Incomplete choice catalog")
 .refine(p=>p.rows.every(row=>extraSchemas[p.kind].safeParse(row).success),"Invalid choice configuration");
