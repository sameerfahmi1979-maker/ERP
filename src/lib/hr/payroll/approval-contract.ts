import { z } from "zod";
import { payrollQuery, payrollScopes, payrollWorkspace } from "./run-contract";

export const payrollApprovalsPath = "/admin/hr/payroll/approvals";
const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const receiptId = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(2000);
const reviewState = z.enum(["submitted", "approved", "rejected", "withdrawn", "superseded"]);
const reviewDecision = z.enum(["withdraw", "approve", "reject", "request-release", "release", "decline-release"]);

export const payrollReviewQuery = payrollQuery.omit({ version: true }).extend({ review: receiptId.optional() });
export const payrollReviewScopes = z.array(payrollScopes.element.omit({
  can_calculate: true, can_policy: true,
}).extend({ can_submit: z.boolean(), can_approve: z.boolean() }));

const currentVersion = payrollWorkspace.shape.version.unwrap();
const versionFacts = currentVersion.omit({ id: true, exception_count: true, totals: true }).extend({
  run: receiptId,
  version: receiptId,
});
const reviewedVersion = versionFacts.extend({
  id: receiptId,
  state: reviewState,
  submitted_at: timestamp,
  decision_at: timestamp.nullable(),
  bank_state: z.string().min(1).nullable(),
});
const reviewTotals = {
  totals: currentVersion.shape.totals,
  exception_count: count,
  blocking_count: count,
};
const draft = versionFacts.extend({
  ...reviewTotals,
  source_digest: digest,
  rule_digest: digest,
  can_submit: z.boolean(),
});
const retainedId = z.string().regex(/^[1-9]\d{0,18}$/);
const retainedAmount = z.string().regex(/^\d+\.\d{2}$/);
const recoveryScheduleSnapshot = z.object({
  digest,
  schedules: z.array(z.object({
    case: retainedId,
    schedule: retainedId,
    employee: retainedId,
    line: receiptId,
    mode: z.enum(["one-time", "instalments"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    principal: retainedAmount,
    period_deduction: retainedAmount,
    instalments: z.array(z.object({ month: z.iso.date(), amount: retainedAmount })).min(1),
  })).min(1),
});
const review = reviewedVersion.extend({
  ...reviewTotals,
  source_digest: digest.optional(),
  rule_digest: digest.optional(),
  submitter_label: z.string().nullable(),
  approver_label: z.string().nullable(),
  recovery_schedule_required: z.boolean().optional(),
  recovery_schedule_snapshot: recoveryScheduleSnapshot.nullish(),
  actions: z.array(reviewDecision),
  claims_count: count,
  events: z.array(z.object({
    kind: z.string().min(1),
    date: timestamp,
    reason: z.string().nullable(),
  })),
});
const retainedDetail = payrollWorkspace.shape.detail.unwrap();
const sourceId = z.union([id, z.string().regex(/^[1-9]\d{0,18}$/)]).transform(String).optional().catch(undefined);
const reviewLine = retainedDetail.shape.lines.element.extend({
  source: z.object({
    calculation_rule_id: sourceId,
    rule: sourceId,
    case: sourceId,
    schedule: sourceId,
    adjustment: sourceId,
  }),
});
export const payrollReviewWorkspace = payrollWorkspace.pick({
  employees: true, next_before: true,
}).extend({
  can_submit: z.boolean(),
  can_approve: z.boolean(),
  draft: draft.nullable(),
  reviews: z.array(reviewedVersion),
  review: review.nullable(),
  detail: retainedDetail.extend({
    lines: z.array(reviewLine),
    exceptions: z.array(retainedDetail.shape.exceptions.element.omit({ source: true })),
  }).nullable(),
});

const decisionPayload = z.object({ review: receiptId, version: receiptId, digest, reason });
const approvePayload = decisionPayload.extend({ recovery_schedule_digest: digest.optional() });
const submitPayload = decisionPayload.omit({ review: true }).extend({
  run: receiptId,
  acknowledge_exceptions: z.boolean(),
});
const commandAction = z.union([z.literal("submit"), reviewDecision]);

export const payrollReviewCommandHeader = z.object({ company: id, branch: id, operation: receiptId });
export const payrollReviewReceipt = z.object({ review: receiptId, state: reviewState });

export type PayrollReviewAction = z.infer<typeof commandAction>;
export type PayrollReviewScope = z.infer<typeof payrollReviewScopes>[number];
export type PayrollReviewQuery = z.infer<typeof payrollReviewQuery>;
export type PayrollReviewWorkspaceData = z.infer<typeof payrollReviewWorkspace>;
export type PayrollReviewLine = z.infer<typeof reviewLine>;

export function parsePayrollReviewCommand(action: string, form: FormData) {
  const parsedAction = commandAction.safeParse(action);
  if (!parsedAction.success) return null;

  // An action carries one exact version and receipt. Reject repeated fields even
  // when a browser or caller supplies the same value twice.
  const submitting = parsedAction.data === "submit";
  const fields: Record<string, unknown> = {};
  for (const key of [submitting ? "run" : "review", "version", "digest", "reason"]) {
    const values = form.getAll(key);
    if (values.length !== 1 || typeof values[0] !== "string") return null;
    fields[key] = values[0];
  }
  if (submitting) {
    const values = form.getAll("acknowledge_exceptions");
    if (values.length > 1 || (values.length === 1 && values[0] !== "true")) return null;
    fields.acknowledge_exceptions = values.length === 1;
  }
  const scheduleDigests = form.getAll("recovery_schedule_digest");
  const approving = parsedAction.data === "approve";
  if (scheduleDigests.length) {
    if (!approving || scheduleDigests.length !== 1 || typeof scheduleDigests[0] !== "string") return null;
    fields.recovery_schedule_digest = scheduleDigests[0];
  }
  const parsed = (submitting ? submitPayload : approving ? approvePayload : decisionPayload).safeParse(fields);
  return parsed.success ? parsed.data : null;
}
