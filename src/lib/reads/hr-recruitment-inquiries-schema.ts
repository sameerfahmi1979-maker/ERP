import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
export {hrReadIdentity as recruitmentReadIdentity} from "./hr-read-identity";

export const RECRUITMENT_INQUIRY_KINDS = ["requisitions", "candidates", "interviews", "offers", "onboarding"] as const;
export type RecruitmentInquiryKind = typeof RECRUITMENT_INQUIRY_KINDS[number];
const text = (id: string, label: string): HrOperationsField => ({id, label, type: "text"});
const date = (id: string, label: string): HrOperationsField => ({id, label, type: "date"});
const select = (id: string, label: string, values: string[]): HrOperationsField => ({id, label, type: "select", options: values.map(value => ({value, label: value.replaceAll("_", " ")}))});
const candidateFields = [text("candidate_name", "Candidate"), text("candidate_code", "Candidate code")];
export const RECRUITMENT_INQUIRY_CONFIG = {
  requisitions: {table: "hr_job_requisitions", prefix: "requisitions", sort: "created_at", fields: [text("requisition_code", "Code"), text("requisition_title", "Requisition"), select("requisition_status", "Status", ["draft", "open", "on_hold", "filled", "cancelled", "closed"]), select("priority", "Priority", ["low", "normal", "high", "urgent"]), date("target_start_date", "Target start"), date("created_at", "Created (UTC)")]},
  candidates: {table: "hr_candidates", prefix: "candidates", sort: "created_at", fields: [text("candidate_code", "Code"), text("full_name_en", "Name (English)"), text("full_name_ar", "Name (Arabic)"), text("mobile_number", "Mobile"), text("email", "Email"), text("source", "Source"), select("candidate_status", "Status", ["new", "screening", "shortlisted", "interview", "selected", "offered", "accepted", "rejected", "withdrawn", "hired", "blacklisted"]), select("pipeline_stage", "Pipeline stage", ["new", "screening", "shortlisted", "interview", "offer", "onboarding", "hired", "closed"]), date("created_at", "Created (UTC)")]},
  interviews: {table: "hr_interviews", prefix: "global-interviews", sort: "interview_datetime", fields: [...candidateFields, select("interview_status", "Status", ["scheduled", "completed", "cancelled", "no_show", "rescheduled"]), text("interview_round", "Round"), text("interview_location", "Location"), select("result", "Result", ["pass", "hold", "fail", "pending"]), date("interview_datetime", "Interview (UTC)")]},
  offers: {table: "hr_offers", prefix: "global-offers", sort: "created_at", fields: [...candidateFields, select("offer_status", "Status", ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "withdrawn", "expired", "cancelled"]), date("proposed_joining_date", "Joining date"), date("valid_until", "Valid until"), date("created_at", "Created (UTC)")]},
  onboarding: {table: "hr_onboarding_tasks", prefix: "global-onboarding", sort: "due_date", fields: [...candidateFields, text("task_title", "Task"), select("task_status", "Status", ["pending", "in_progress", "completed", "blocked", "not_applicable", "cancelled"]), select("task_category", "Category", ["document", "medical", "visa", "training", "site_access", "payroll", "it", "operations", "hr", "other"]), date("due_date", "Due date")]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger), search = z.string().trim().max(200);
export const recruitmentInquiryCriteriaSchema = z.object({kind: z.enum(RECRUITMENT_INQUIRY_KINDS), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(), columnFilters: z.record(z.string(), search).default({})}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: RECRUITMENT_INQUIRY_CONFIG[p.kind].fields.map(field => field.id), defaultKey: RECRUITMENT_INQUIRY_CONFIG[p.kind].sort, defaultDir: p.kind === "onboarding" ? "asc" : "desc"})).superRefine((p, ctx) => {
  const fields: readonly HrOperationsField[] = RECRUITMENT_INQUIRY_CONFIG[p.kind].fields;
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported recruitment sort", path: ["sortKey"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const field = fields.find(f => f.id === key);
    if (!field || value && (field.type === "date" ? !operationsRealDate(value) : field.type === "select" ? !field.options?.some(o => o.value === value) : false)) ctx.addIssue({code: "custom", message: "Invalid recruitment filter", path: ["columnFilters", key]});
  }
});
const nullableText = z.string().nullable(), nativeDate = z.string().refine(operationsRealDate).nullable(), timestamp = z.iso.datetime({offset: true});
const candidateLabel = z.object({id, candidate_code: nullableText, full_name_en: z.string(), full_name_ar: nullableText}).strip().nullable();
const requisitionLabel = z.object({id, requisition_code: nullableText, requisition_title: z.string()}).strip().nullable();
const person = z.object({id, full_name_en: nullableText}).strip().nullable();
const department = z.object({id, department_name_en: z.string()}).strip().nullable();
const designation = z.object({id, designation_name_en: z.string()}).strip().nullable();
export const recruitmentInquiryRowSchemas = {
  requisitions: z.object({id, requisition_code: nullableText, requisition_title: z.string(), vacancies_count: z.number().int(), requisition_status: z.string(), priority: z.string(), target_start_date: nativeDate, created_at: timestamp, department, designation}).strip(),
  candidates: z.object({id, candidate_code: nullableText, full_name_en: z.string(), full_name_ar: nullableText, candidate_status: z.string(), pipeline_stage: z.string(), mobile_number: nullableText, email: nullableText, source: nullableText, created_at: timestamp, requisition: requisitionLabel}).strip(),
  interviews: z.object({id, candidate_id: id, interview_round: z.string(), interview_status: z.string(), interview_datetime: timestamp.nullable(), interview_location: nullableText, result: nullableText, candidate: candidateLabel, interviewer: person}).strip(),
  offers: z.object({id, candidate_id: id, offer_status: z.string(), proposed_joining_date: nativeDate, valid_until: nativeDate, created_at: timestamp, basic_salary: z.number().nullable(), currency: z.string(), candidate: candidateLabel, designation}).strip(),
  onboarding: z.object({id, candidate_id: id.nullable(), task_title: z.string(), task_category: nullableText, task_status: z.string(), due_date: nativeDate, candidate: candidateLabel, assigned_user: person}).strip(),
};
export const recruitmentInquiryPageSchema = z.object({kind: z.enum(RECRUITMENT_INQUIRY_KINDS), page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown())}).strict().transform((p, ctx) => {
  const rows = z.array(recruitmentInquiryRowSchemas[p.kind]).safeParse(p.rows);
  if (!rows.success || rows.data.length !== Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) || new Set(rows.success ? rows.data.map(r => r.id) : []).size !== p.rows.length) {ctx.addIssue({code: "custom", message: "Incomplete recruitment page"}); return z.NEVER;}
  return {...p, rows: rows.data};
});
export const recruitmentRequisitionDetailCriteriaSchema = z.object({recordId: id}).strict();
export const recruitmentRequisitionDetailSchema = recruitmentInquiryRowSchemas.requisitions.extend({job_description: nullableText, requirements: nullableText, notes: nullableText}).strip();
export type RecruitmentInquiryCriteria = z.infer<typeof recruitmentInquiryCriteriaSchema>;
export type RecruitmentInquiryPage = z.infer<typeof recruitmentInquiryPageSchema>;
export type RecruitmentInquiryRowMap = {[K in RecruitmentInquiryKind]: z.infer<(typeof recruitmentInquiryRowSchemas)[K]>};
export type RecruitmentRequisitionDetail = z.infer<typeof recruitmentRequisitionDetailSchema>;
