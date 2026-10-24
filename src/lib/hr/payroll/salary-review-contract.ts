import {z} from "zod";
import {employeeDate, employeeId} from "@/lib/hr/employee-contract";

const revision = z.string().regex(/^[1-9]\d{0,17}$/);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
export const salaryReviewStatus = z.enum(["recorded", "pending", "approved", "rejected", "withdrawn", "applied"]);
export const salaryReviewAction = z.enum(["approve", "reject", "withdraw", "apply"]);
export const salaryReviewSubject = z.object({employee_id: employeeId, revision_id: employeeId}).strict();
export const salaryReviewRequest = salaryReviewSubject.extend({
  operation_id: z.string().uuid(), action: salaryReviewAction, review_revision: revision,
  fingerprint, reason: z.string().trim().min(1).max(1000),
}).strict();
export type SalaryReviewRequest = z.infer<typeof salaryReviewRequest>;
export const salaryReviewReceipt = salaryReviewSubject.extend({
  review_revision: revision, operation_id: z.string().uuid(), action: salaryReviewAction,
  status: salaryReviewStatus, replayed: z.boolean(),
}).strict();
export type SalaryReviewReceipt = z.infer<typeof salaryReviewReceipt>;
export const salaryReviewOpening = salaryReviewSubject.extend({
  review_revision: revision, status: salaryReviewStatus, requested_by: employeeId,
  approved_by: employeeId.nullable(), effective_date: employeeDate,
  new_basic: z.string().regex(/^\d{1,10}\.\d{2}$/), currency: z.string().regex(/^[A-Z]{3}$/),
  fingerprint, source_current: z.boolean(), today: employeeDate,
}).strict();
export type SalaryReviewOpening = z.infer<typeof salaryReviewOpening>;
export const salaryReviewMarker = salaryReviewRequest.omit({reason: true, fingerprint: true}).strict();
export function matchesSalaryReviewReceipt(receipt: SalaryReviewReceipt, request: z.infer<typeof salaryReviewMarker>) {
  const status = {approve: "approved", reject: "rejected", withdraw: "withdrawn", apply: "applied"} as const;
  return receipt.employee_id === request.employee_id && receipt.revision_id === request.revision_id &&
    receipt.operation_id === request.operation_id && receipt.action === request.action &&
    receipt.status === status[request.action] && receipt.review_revision === String(BigInt(request.review_revision) + BigInt(1));
}
export function salaryReviewActions(opening: SalaryReviewOpening, actorId: number) {
  const actions: SalaryReviewRequest["action"][] = [];
  if (opening.status === "pending" && opening.requested_by !== actorId) {
    if (opening.source_current) actions.push("approve");
    actions.push("reject");
  }
  if (["pending", "approved"].includes(opening.status) && opening.requested_by === actorId) actions.push("withdraw");
  if (opening.status === "approved" && opening.source_current && opening.effective_date <= opening.today) actions.push("apply");
  return actions;
}
export const salaryReviewHistoryRow = z.object({
  id: employeeId, revision_id: employeeId, employee_id: employeeId, actor_id: employeeId,
  action: z.enum(["propose", ...salaryReviewAction.options]), reason: z.string().max(1000), review_revision: revision,
  operation_id: z.string().uuid(), created_at: z.string().datetime({offset: true}),
}).strict();
