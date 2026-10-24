import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
export {hrReadIdentity as complianceReadIdentity} from "./hr-read-identity";

export const COMPLIANCE_KINDS = ["identity", "insurance", "dependents", "cards", "training", "medical"] as const;
export type ComplianceKind = typeof COMPLIANCE_KINDS[number];
const field = (id: string, label: string) => ({id, label, type: "text" as const});
/** These were text accessors, including ISO dates. Preserve substring matching. */
export const COMPLIANCE_CONFIG = {
  identity: {table: "employee_identity_documents", sort: "created_at", ascending: false, fields: [field("document_number", "Document Number"), field("expiry_date", "Expiry Date")]},
  insurance: {table: "employee_medical_insurances", sort: "expiry_date", ascending: true, fields: [field("policy_number", "Policy Number"), field("expiry_date", "Expiry Date")]},
  dependents: {table: "employee_dependents", sort: "dependent_name_en", ascending: true, fields: [field("dependent_name_en", "Dependent Name En")]},
  cards: {table: "employee_access_cards", sort: "created_at", ascending: false, fields: [field("card_number", "Card Number"), field("expiry_date", "Expiry Date")]},
  training: {table: "employee_training_certificates", sort: "expiry_date", ascending: true, fields: [field("certificate_number", "Certificate Number"), field("expiry_date", "Expiry Date")]},
  medical: {table: "employee_medical_records", sort: "examination_date", ascending: false, fields: [field("examination_date", "Examination Date")]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable();
const date = z.iso.date().nullable(), timestamp = z.iso.datetime({offset: true});
const label = z.object({id, name_en: z.string()}).strip().nullable();
const base = {id, employee_id: id, workspace_revision:id, dms_document_id: id.nullable(), notes: text, created_at: timestamp, updated_at: timestamp};
export const complianceDetailSchemas = {
  identity: z.object({...base, document_type_id: id, document_number: z.string(), issue_date: date, expiry_date: date, issuing_authority: text,
    issuing_authority_party_id: id.nullable(), issue_country_id: id.nullable(), issuing_emirate_id: id.nullable(), issue_city_id: id.nullable(), status: z.string(), verification_status: z.string(), verified_by: id.nullable(), verified_at: timestamp.nullable(), renewal_status: z.string(),
    emirates_id_application_no: text, visa_file_number: text, uid_number: text, labour_card_number: text, work_permit_number: text, mohre_person_code: text, profession_on_document: text, sponsor_company_id: id.nullable(), place_of_issue: text,
    document_type: label, issue_country: label, issuing_emirate: label, issue_city: label,
    issuing_authority_party: z.object({id, display_name: z.string(), party_code: z.string()}).strip().nullable(), sponsor_company: z.object({id, legal_name_en: z.string()}).strip().nullable()}).strip(),
  insurance: z.object({...base, insurance_provider: z.string(), tpa: text, policy_number: z.string(), insurance_card_number: text, network_class: text, issue_date: date, expiry_date: z.iso.date(), employee_covered: z.boolean(), dependent_coverage_included: z.boolean(), dependent_count_covered: z.number().int().nullable(), status: z.string(), verification_status: z.string(), renewal_status: z.string()}).strip(),
  dependents: z.object({...base, photo_dms_document_id:id.nullable().optional(),workspace_revision:id,dependent_name_en: z.string(), dependent_name_ar: text, relationship_type_id: id, date_of_birth: date, nationality_id: id.nullable(), passport_number: text, passport_expiry: date, emirates_id_number: text, emirates_id_expiry: date, residence_visa_number: text, residence_visa_expiry: date,
    medical_insurance_provider: text, medical_insurance_policy: text, medical_insurance_card: text, medical_insurance_expiry: date, sponsored_by: text, is_active: z.boolean(), relationship_type: label, nationality: label}).strip(),
  cards: z.object({...base, access_type_id: id, client_authority: text, work_site_id: id.nullable(), card_number: text, application_reference: text, issue_date: date, expiry_date: date, status: z.string(), renewal_status: z.string(), access_type: label, work_site: z.object({id, site_name: z.string()}).strip().nullable()}).strip(),
  training: z.object({...base, training_category_id: id.nullable(), training_type_id: id, provider: text, approval_body: text, certificate_number: text, completion_date: date, expiry_date: date, required_for_designation: z.boolean(), required_for_site: z.boolean(), status: z.string(), verification_status: z.string(), training_category: label, training_type: label}).strip(),
  medical: z.object({...base, medical_record_type_id: id, medical_center: text, report_number: text, examination_date: z.iso.date(), result: z.string(), fit_for_work: z.boolean(), work_restrictions: z.boolean(), restriction_details: text, next_examination_date: date, required_for_visa: z.boolean(), required_for_site: z.boolean(), required_for_noc: z.boolean(), medical_record_type: label}).strip(),
};
/** Only list-visible fields. Confidential notes and complete editor fields are on-demand. */
export const complianceRowSchemas = {
  identity: complianceDetailSchemas.identity.pick({id: true, employee_id: true, document_type_id: true, document_number: true, expiry_date: true, status: true, verification_status: true, issuing_authority: true, place_of_issue: true, document_type: true, issue_country: true, issue_city: true, issuing_authority_party: true, created_at: true}),
  insurance: complianceDetailSchemas.insurance.pick({id: true, employee_id: true, insurance_provider: true, policy_number: true, network_class: true, tpa: true, expiry_date: true, status: true, verification_status: true}),
  dependents: complianceDetailSchemas.dependents.pick({id: true, employee_id: true, dependent_name_en: true, date_of_birth: true, passport_expiry: true, emirates_id_expiry: true, residence_visa_expiry: true, is_active: true, relationship_type: true, nationality: true}),
  cards: complianceDetailSchemas.cards.pick({id: true, employee_id: true, access_type_id: true, client_authority: true, card_number: true, expiry_date: true, status: true, access_type: true, work_site: true, created_at: true}),
  training: complianceDetailSchemas.training.pick({id: true, employee_id: true, training_type_id: true, provider: true, certificate_number: true, expiry_date: true, status: true, verification_status: true, training_category: true, training_type: true}),
  medical: complianceDetailSchemas.medical.pick({id: true, employee_id: true, medical_record_type_id: true, medical_center: true, report_number: true, examination_date: true, result: true, next_examination_date: true, medical_record_type: true}),
};
const search = z.string().max(200); // Do not trim: the old text filter matched spaces literally.
export const compliancePageCriteriaSchema = z.object({operation: z.literal("page"), kind: z.enum(COMPLIANCE_KINDS), employeeId: id,
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""),
  sorting: readSortingSchema.optional(), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), columnFilters: z.record(z.string(), search).default({}),
}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: [...COMPLIANCE_CONFIG[p.kind].fields.map(f => f.id), COMPLIANCE_CONFIG[p.kind].sort], defaultKey: COMPLIANCE_CONFIG[p.kind].sort, defaultDir: COMPLIANCE_CONFIG[p.kind].ascending ? "asc" : "desc"})).superRefine((p, ctx) => {
  for (const key of Object.keys(p.columnFilters)) if (!COMPLIANCE_CONFIG[p.kind].fields.some(f => f.id === key)) ctx.addIssue({code: "custom", path: ["columnFilters", key], message: "Unsupported compliance filter"});
});
export const complianceDetailCriteriaSchema = z.object({operation: z.literal("detail"), kind: z.enum(COMPLIANCE_KINDS), employeeId: id, recordId: id}).strict();
export const complianceCriteriaSchema = z.union([compliancePageCriteriaSchema, complianceDetailCriteriaSchema]);
export const complianceAccessSchema = z.object({canManage: z.boolean(), medicalView: z.boolean(), medicalManage: z.boolean()}).strict().refine(a => !a.medicalManage || a.medicalView);
const owner = {kind: z.enum(COMPLIANCE_KINDS), employeeId: id};
export const complianceRestrictedSchema = z.object({...owner, operation: z.enum(["page", "detail"]), availability: z.literal("restricted")}).strict();
export const complianceUnavailableSchema = complianceDetailCriteriaSchema.extend({availability: z.literal("unavailable")}).strict();
export const compliancePageSchema = z.object({...owner, operation: z.literal("page"), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown()), access: complianceAccessSchema}).strict().transform((p, ctx) => {
  const result = z.array(complianceRowSchemas[p.kind]).safeParse(p.rows);
  if (!result.success || result.data.some(r => r.employee_id !== p.employeeId) || new Set(result.data.map(r => r.id)).size !== result.data.length || result.data.length !== Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize))) {
    ctx.addIssue({code: "custom", message: "Incomplete compliance page"}); return z.NEVER;
  }
  return {...p, rows: result.data};
});
export const DEPENDENT_MEDICAL_FIELDS = ["medical_insurance_provider", "medical_insurance_policy", "medical_insurance_card", "medical_insurance_expiry"] as const;
export const complianceDetailSchema = complianceDetailCriteriaSchema.extend({row: z.unknown(), access: complianceAccessSchema}).strict().transform((p, ctx) => {
  const result = complianceDetailSchemas[p.kind].safeParse(p.row);
  if (!result.success || result.data.id !== p.recordId || result.data.employee_id !== p.employeeId || p.kind === "dependents" && !p.access.medicalView && DEPENDENT_MEDICAL_FIELDS.some(k => (result.data as Record<string, unknown>)[k] !== null)) {
    ctx.addIssue({code: "custom", message: "Incomplete or unprotected compliance detail"}); return z.NEVER;
  }
  return {...p, row: result.data};
});
export const compliancePageResultSchema = z.union([compliancePageSchema, complianceRestrictedSchema]);
export const complianceDetailResultSchema = z.union([complianceDetailSchema, complianceUnavailableSchema, complianceRestrictedSchema]);
export type ComplianceRowMap = {[K in ComplianceKind]: z.infer<(typeof complianceRowSchemas)[K]>};
export type ComplianceDetailMap = {[K in ComplianceKind]: z.infer<(typeof complianceDetailSchemas)[K]>};
export type ComplianceAccess = z.infer<typeof complianceAccessSchema>;
