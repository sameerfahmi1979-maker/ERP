import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
export {candidateRecordIdentity as candidateChildReadIdentity} from "./hr-candidate-record-schema";

export const CANDIDATE_CHILD_KINDS = ["documents", "interviews", "offers", "onboarding"] as const;
export type CandidateChildKind = typeof CANDIDATE_CHILD_KINDS[number];
const text = (id: string, label: string): HrOperationsField => ({id, label, type: "text"});
const date = (id: string, label: string): HrOperationsField => ({id, label, type: "date"});
const select = (id: string, label: string, values: string[]): HrOperationsField => ({id, label, type: "select", options: values.map(value => ({value, label: value.replaceAll("_", " ")}))});
/** Only these native identifiers may enter a query; request input never selects a table. */
export const CANDIDATE_CHILD_CONFIG = {
  documents: {table: "hr_candidate_documents", prefix: "candidate-documents", sort: "created_at", ascending: false, fields: [text("dms_document_document_title", "Document Title"), select("document_purpose", "Document Purpose", ["cv", "passport", "certificate", "offer", "photo", "other"])]},
  interviews: {table: "hr_interviews", prefix: "candidate-interviews", sort: "interview_datetime", ascending: false, fields: [select("interview_round", "Interview Round", ["screening", "first", "second", "technical", "final", "other"]), select("interview_status", "Interview Status", ["scheduled", "completed", "cancelled", "no_show", "rescheduled"]), date("interview_datetime", "Interview Datetime (UTC)")]},
  offers: {table: "hr_offers", prefix: "candidate-offers", sort: "created_at", ascending: false, fields: [select("offer_status", "Offer Status", ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "withdrawn", "expired", "cancelled"]), date("proposed_joining_date", "Proposed Joining Date"), date("valid_until", "Valid Until")]},
  onboarding: {table: "hr_onboarding_tasks", prefix: "candidate-onboarding", sort: "created_at", ascending: true, fields: [text("task_title", "Task Title"), select("task_status", "Task Status", ["pending", "in_progress", "completed", "blocked", "not_applicable", "cancelled"]), date("due_date", "Due Date")]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger);
const search = z.string().trim().max(200), nullableText = z.string().nullable();
const timestamp = z.iso.datetime({offset: true}), nativeDate = z.string().refine(operationsRealDate).nullable();
export const candidateChildPageCriteriaSchema = z.object({
  operation: z.literal("page"), kind: z.enum(CANDIDATE_CHILD_KINDS), candidateId: id,
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  search: search.default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(),
  columnFilters: z.record(z.string(), search).default({}),
}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: [...CANDIDATE_CHILD_CONFIG[p.kind].fields.map(field => field.id), CANDIDATE_CHILD_CONFIG[p.kind].sort], defaultKey: CANDIDATE_CHILD_CONFIG[p.kind].sort, defaultDir: CANDIDATE_CHILD_CONFIG[p.kind].ascending ? "asc" : "desc"})).superRefine((p, ctx) => {
  const fields: readonly HrOperationsField[] = CANDIDATE_CHILD_CONFIG[p.kind].fields;
  if (p.sortKey !== CANDIDATE_CHILD_CONFIG[p.kind].sort && !fields.some(field => field.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported candidate child sort", path: ["sortKey"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const field = fields.find(item => item.id === key);
    if (!field || value && (field.type === "date" ? !operationsRealDate(value) : field.type === "select" ? !field.options?.some(option => option.value === value) : false)) ctx.addIssue({code: "custom", message: "Invalid candidate child filter", path: ["columnFilters", key]});
  }
});
export const candidateChildDetailCriteriaSchema = z.object({operation: z.literal("detail"), kind: z.enum(CANDIDATE_CHILD_KINDS), candidateId: id, recordId: id}).strict();
export const candidateChildCriteriaSchema = z.union([candidateChildPageCriteriaSchema, candidateChildDetailCriteriaSchema]);

export const candidateOfferSalaryAccessSchema = z.object({companyId: id.nullable(), branchId: id.nullable(), canView: z.boolean(), canManage: z.boolean()}).strict()
  .refine(value => (!value.canManage || value.canView) && (value.companyId !== null || value.branchId === null));
const document = z.object({id, document_number: nullableText, document_title: nullableText}).strip().nullable();
const documentRow = z.object({id, candidate_id: id, dms_document_id: id, document_purpose: nullableText, verification_status: z.string(), created_at: timestamp, dms_document: document}).strip();
const interviewRow = z.object({id, candidate_id: id, interview_round: z.string(), interview_status: z.string(), interview_datetime: timestamp.nullable(), interview_location: nullableText, result: nullableText, score: z.number().finite().nullable()}).strip();
const offerRow = z.object({id, candidate_id: id, owner_company_id: id.nullable(), branch_id: id.nullable(), offer_status: z.string(), proposed_joining_date: nativeDate,
  valid_until: nativeDate, created_at: timestamp, basic_salary: z.number().finite().nullable(), currency: z.string(), designation: z.object({id, designation_name_en: z.string()}).strip().nullable()}).strip();
const onboardingRow = z.object({id, candidate_id: id, task_title: z.string(), task_category: nullableText, task_status: z.string(), due_date: nativeDate, created_at: timestamp}).strip();
export const candidateChildNativeRowSchemas = {documents: documentRow, interviews: interviewRow, offers: offerRow, onboarding: onboardingRow};
export const candidateChildNativeDetailSchemas = {
  documents: documentRow.extend({notes: nullableText}),
  interviews: interviewRow.extend({feedback: nullableText, next_step: nullableText}),
  offers: offerRow.extend({offer_date: nativeDate, gross_salary: z.number().finite().nullable(), notes: nullableText}),
  onboarding: onboardingRow.extend({notes: nullableText}),
};
const protectedOffer = offerRow.extend({salaryAccess: candidateOfferSalaryAccessSchema}).refine(value =>
  value.salaryAccess.companyId === value.owner_company_id && value.salaryAccess.branchId === value.branch_id && (value.salaryAccess.canView || value.basic_salary === null));
const protectedOfferDetail = candidateChildNativeDetailSchemas.offers.extend({salaryAccess: candidateOfferSalaryAccessSchema}).refine(value =>
  value.salaryAccess.companyId === value.owner_company_id && value.salaryAccess.branchId === value.branch_id && (value.salaryAccess.canView || value.basic_salary === null && value.gross_salary === null));
export const candidateChildRowSchemas = {...candidateChildNativeRowSchemas, offers: protectedOffer};
export const candidateChildDetailSchemas = {...candidateChildNativeDetailSchemas, offers: protectedOfferDetail};

export const candidateChildPageSchema = z.object({operation: z.literal("page"), kind: z.enum(CANDIDATE_CHILD_KINDS), candidateId: id,
  page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown()),
}).strict().transform((page, ctx) => {
  const rows = z.array(candidateChildRowSchemas[page.kind]).safeParse(page.rows);
  if (!rows.success || rows.data.some(row => row.candidate_id !== page.candidateId || "dms_document" in row && row.dms_document && row.dms_document.id !== row.dms_document_id)
    || rows.data.length !== Math.min(page.pageSize, Math.max(0, page.totalCount - (page.page - 1) * page.pageSize)) || new Set(rows.data.map(row => row.id)).size !== rows.data.length) {
    ctx.addIssue({code: "custom", message: "Incomplete candidate child page"}); return z.NEVER;
  }
  return {...page, rows: rows.data};
});
export const candidateChildDetailSchema = z.object({operation: z.literal("detail"), kind: z.enum(CANDIDATE_CHILD_KINDS), candidateId: id, recordId: id, row: z.unknown()}).strict().transform((detail, ctx) => {
  const row = candidateChildDetailSchemas[detail.kind].safeParse(detail.row);
  if (!row.success || row.data.id !== detail.recordId || row.data.candidate_id !== detail.candidateId
    || "dms_document" in row.data && row.data.dms_document && row.data.dms_document.id !== row.data.dms_document_id) {
    ctx.addIssue({code: "custom", message: "Incomplete candidate child detail"}); return z.NEVER;
  }
  return {...detail, row: row.data};
});
/** Only after candidate authorization succeeds: does not reveal whether a child
 * is deleted, absent or outside a narrower native scope. Never includes a row. */
export const candidateChildUnavailableSchema = candidateChildDetailCriteriaSchema.extend({availability: z.literal("unavailable")}).strict();
export const candidateChildDetailResultSchema = z.union([candidateChildDetailSchema, candidateChildUnavailableSchema]);
export type CandidateChildPageCriteria = z.infer<typeof candidateChildPageCriteriaSchema>;
export type CandidateChildPage = z.infer<typeof candidateChildPageSchema>;
export type CandidateChildDetail = z.infer<typeof candidateChildDetailSchema>;
export type CandidateChildRowMap = {[K in CandidateChildKind]: z.infer<(typeof candidateChildRowSchemas)[K]>};
export type CandidateChildDetailMap = {[K in CandidateChildKind]: z.infer<(typeof candidateChildDetailSchemas)[K]>};
