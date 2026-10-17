import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
export {hrReadIdentity as dmsApprovalReadIdentity} from "./hr-read-identity";
const id = z.number().int().positive().refine(Number.isSafeInteger);
const page = z.number().int().min(1).max(100000), pageSize = z.number().int().min(1).max(100);
const nullableText = z.string().nullable(), nullableId = id.nullable();
export const dmsApprovalQueueCriteriaSchema = z.object({mode: z.literal("queue").default("queue"),
  status: z.enum(["pending_approval", "approved", "rejected", "withdrawn", "all"]).default("pending_approval"),
  search: z.string().max(200).default(""), documentTypeId: id.optional(), page: page.default(1), pageSize: pageSize.default(20),
  sortBy: z.enum(["submitted_at", "document_no", "title"]).default("submitted_at"), sortDirection: z.enum(["asc", "desc"]).default("desc")}).strict();
export const dmsApprovalStateCriteriaSchema = z.object({mode: z.literal("state"), documentId: id}).strict();
export const dmsApprovalHistoryCriteriaSchema = z.object({mode: z.literal("history"), documentId: id, page: page.default(1), pageSize: pageSize.default(20)}).strict();
export const dmsApprovalRequestSchema = z.discriminatedUnion("mode", [dmsApprovalQueueCriteriaSchema, dmsApprovalStateCriteriaSchema, dmsApprovalHistoryCriteriaSchema]);
export const dmsApprovalQueueRowSchema = z.object({documentId: id, documentNo: z.string(), title: z.string(), documentTypeName: nullableText,
  ownerName: nullableText, submittedByName: nullableText, submittedAt: nullableText, approvalStatus: nullableText, currentApprovalId: nullableId,
  daysPending: z.number().int().nullable(), canAct: z.boolean(), canWithdraw: z.boolean(), isRedacted: z.boolean()}).strict();
export const dmsApprovalStateRowSchema = z.object({documentId: id, documentNo: z.string(), title: z.string(), documentTypeId: nullableId,
  documentTypeName: nullableText, documentStatus: z.string(), approvalStatus: nullableText, submittedBy: nullableId, submittedByName: nullableText,
  submittedAt: nullableText, currentApprovalId: nullableId, currentApprovalAction: nullableText, currentWorkflowId: nullableId, currentStepId: nullableId,
  canSubmit: z.boolean(), canApprove: z.boolean(), canReject: z.boolean(), canWithdraw: z.boolean(), canViewHistory: z.boolean(),
  selfApprovalBlocked: z.boolean(), selfApprovalBlockReason: nullableText, actionUnavailableReason: nullableText, latestComments: nullableText, latestReason: nullableText}).strict();
export const dmsApprovalHistoryRowSchema = z.object({id, documentId: id, action: z.string(), actionedBy: nullableId, actionedByName: nullableText,
  actionedAt: z.string(), submittedBy: nullableId, submittedByName: nullableText, submittedAt: nullableText, reason: nullableText, comments: nullableText,
  isCurrent: z.boolean(), workflowId: nullableId, stepId: nullableId, createdAt: z.string()}).strict();
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const complete = (v: {criteria: {page: number; pageSize: number}; rows: unknown[]; totalCount: number}) =>
  v.rows.length === Math.min(v.criteria.pageSize, Math.max(0, v.totalCount - (v.criteria.page - 1) * v.criteria.pageSize));
export const dmsApprovalQueuePageSchema = z.object({criteria: dmsApprovalQueueCriteriaSchema, rows: z.array(dmsApprovalQueueRowSchema), totalCount: count}).strict()
  .refine(v => complete(v) && new Set(v.rows.map(r => r.documentId)).size === v.rows.length);
export const dmsApprovalStateResponseSchema = z.object({criteria: dmsApprovalStateCriteriaSchema, record: dmsApprovalStateRowSchema}).strict()
  .refine(v => v.criteria.documentId === v.record.documentId);
export const dmsApprovalHistoryPageSchema = z.object({criteria: dmsApprovalHistoryCriteriaSchema, rows: z.array(dmsApprovalHistoryRowSchema), totalCount: count}).strict()
  .refine(v => complete(v) && new Set(v.rows.map(r => r.id)).size === v.rows.length && v.rows.every(r => r.documentId === v.criteria.documentId));
export function canReadDmsApprovals(ctx: AuthContext) {
  return ["dms.approvals.view", "dms.approvals.admin", "dms.approvals.history.view", "dms.approvals.act", "dms.documents.approve", "dms.admin"].some(code => hasPermission(ctx, code));
}
export type DmsApprovalQueueCriteria = z.infer<typeof dmsApprovalQueueCriteriaSchema>;
export type DmsApprovalQueuePage = z.infer<typeof dmsApprovalQueuePageSchema>;
export type DmsApprovalStateResponse = z.infer<typeof dmsApprovalStateResponseSchema>;
export type DmsApprovalHistoryPage = z.infer<typeof dmsApprovalHistoryPageSchema>;
