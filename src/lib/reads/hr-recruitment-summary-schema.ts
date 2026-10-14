import {z} from "zod";
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const recruitmentSummaryCriteriaSchema = z.object({}).strict();
export const recruitmentSummarySchema = z.object({total_requisitions: count, open_requisitions: count, total_candidates: count, active_candidates: count, interviews_this_week: count, pending_offers: count, pending_onboarding_tasks: count, conversions_this_month: count}).strict().refine(p => p.open_requisitions <= p.total_requisitions && p.active_candidates <= p.total_candidates);
export const candidateSummaryCriteriaSchema = z.object({candidateId: z.number().int().positive().refine(Number.isSafeInteger)}).strict();
export const candidateSummarySchema = z.object({candidateId: z.number().int().positive().refine(Number.isSafeInteger), interview_count: count, offer_count: count, document_count: count, onboarding_task_count: count, pending_task_count: count}).strict().refine(p => p.pending_task_count <= p.onboarding_task_count);
export type RecruitmentSummary = z.infer<typeof recruitmentSummarySchema>;
export type CandidateReadSummary = z.infer<typeof candidateSummarySchema>;
