import { z } from "zod";

export const payrollSettlementPath = "/admin/hr/payroll/settlement";
export const settlementFileId = z.uuid();
const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const month = z.iso.date().refine(value => value.endsWith("-01"));
const currency = z.string().regex(/^[A-Z]{3}$/);
const filename = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,179}$/i);
const text = z.string().trim().min(1).max(1000);
export const payrollPaymentReasonLimit = 500;
export function payrollPaymentReasonIsWithinLimit(value: string) {
  return Array.from(value.trim()).length <= payrollPaymentReasonLimit;
}
const paymentReason = z.string().trim().min(1).refine(payrollPaymentReasonIsWithinLimit);
const reference = z.string().trim().min(1).max(120).regex(/^[^\p{Cc}]+$/u);
const handoffReference = z.string().trim().regex(/^[a-z0-9][a-z0-9 ./_-]{0,99}$/i);
const money = z.union([z.string().regex(/^-?\d+(?:\.\d+)?$/), z.number().finite()]).transform(String);
const inputMoney = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/);
const positiveMoney = inputMoney.refine(value => /[1-9]/.test(value));
const channel = z.enum(["wps", "cheque", "zero"]);
export const payrollPaymentOutcome = z.enum(["paid", "partial", "rejected", "pending"]);
const wpsEvidenceAction = z.enum(["record-submission", "acknowledge", "accept", "reject", "cancel", "correct-file"]);
const wpsAction = z.union([z.literal("start-handoff"), wpsEvidenceAction]);
const alternateAction = z.enum(["authorize-cheque", "authorize-zero", "cancel-cheque", "cancel-zero"]);

const evidence = { document: id, version: id, file: id };

export const payrollSettlementQuery = z.object({ company: id, branch: id, month, after: id.optional(), review: uuid.optional() });
export const payrollSettlementScopes = z.array(z.object({ company_id: id, branch_id: id, company: text, branch: text }));
export const payrollEvidenceQuery = payrollSettlementQuery.pick({ company: true, branch: true }).extend({
  search: z.string().trim().max(120),
});
export const payrollEvidenceOption = z.object({ ...evidence, label: text });
export const payrollEvidenceOptions = z.array(payrollEvidenceOption);

const settlementPayment = z.object({
  id: uuid,
  amount: money,
  outcome: payrollPaymentOutcome,
  allocation_revision: count,
  reversed: z.boolean(),
  paid_on: z.iso.date().optional(),
  recorded_at: z.iso.datetime({ offset: true }).optional(),
  reference_suffix: z.string().refine(value => Array.from(value).length <= 4).nullish(),
  can_allocate: z.boolean().optional(),
  can_reverse: z.boolean().optional(),
});
const settlementLine = z.object({
  id: uuid,
  category: text,
  kind: z.enum(["earning", "deduction"]),
  amount: money,
});
const settlementResult = z.object({
  employee: id, name: text, currency, net: money, channel, state: text,
  verified_cash: money, applied_wages: money, applied_deductions: money, unallocated: money,
  remaining: money.optional(), can_record: z.boolean().optional(),
  lines: z.array(settlementLine), payments: z.array(settlementPayment),
});
const bankEvent = z.object({
  kind: text, at: z.iso.datetime({ offset: true }), wps_file: uuid.nullish(), channel: channel.nullish(),
});
export const payrollBankHistoryQuery = payrollSettlementQuery.extend({ review: uuid });
export const payrollBankHistoryPage = z.object({
  rows: z.array(bankEvent.extend({ sequence: id })).max(50), count, next_after: id.nullable(),
});

const batch = z.object({
  id: uuid,
  state: text,
  files: z.array(z.object({
    id: uuid, establishment: z.union([id, text]), filename, sha256: digest, count, total: money, currency,
    state: text, actions: z.array(wpsAction),
    reference: handoffReference.nullish(), downloadable: z.boolean(),
    replaces: uuid.nullish(), superseded: z.boolean().optional(),
  })),
  alternate: z.array(z.object({
    channel: z.enum(["cheque", "zero"]), state: text, actions: z.array(alternateAction), reference: handoffReference.nullish(),
  })),
  results: z.array(settlementResult),
  history: z.array(bankEvent), history_count: count.optional(),
});
const settlementReview = z.object({
  review: uuid, version: uuid, digest, number: id, month, batch: batch.nullable(),
  can_issue: z.boolean().optional(), issue_blocker: text.nullish(),
});
export const payrollSettlementWorkspace = z.object({
  access: z.object({ issue: z.boolean(), reconcile: z.boolean() }),
  reviews: z.array(settlementReview),
  selected_review: uuid.nullable(),
  next_after: id.nullable(),
});

const command = { company: id, branch: id, operation: uuid };
const targetBatch = { batch: uuid };
const targetPayment = { ...targetBatch, payment: uuid, revision: count };
const wpsTarget = { ...targetBatch, wps_file: uuid, reference: handoffReference };
const alternateProof = z.strictObject({ ...targetBatch, reference: handoffReference, ...evidence });
const allocation = z.strictObject({
  ...targetPayment,
  lines: z.array(z.strictObject({ line: uuid, amount: positiveMoney })).max(250),
  close_recoveries: z.array(z.strictObject({ line: uuid, amount: inputMoney })).min(1).max(250).optional(),
  document: id.optional(),
  version: id.optional(),
  file: id.optional(),
  reason: paymentReason.optional(),
}).refine(({ lines, close_recoveries }) =>
  (lines.length > 0 || close_recoveries !== undefined) &&
  new Set(lines.map(item => item.line)).size === lines.length &&
  (!close_recoveries || new Set(close_recoveries.map(item => item.line)).size === close_recoveries.length))
  .refine(({ document, version, file, reason, close_recoveries }) => {
    const provided = [document, version, file, reason];
    return provided.every(value => value !== undefined) || (!close_recoveries && provided.every(value => value === undefined));
  });

const employeeReceipt = z.strictObject({
  ...targetBatch, employee: id, channel, reference, amount: inputMoney, currency,
  paid_on: z.iso.date(), outcome: payrollPaymentOutcome, ...evidence,
}).refine(({ amount, channel, outcome }) => {
  const hasCash = /[1-9]/.test(amount);
  if (outcome === "paid") return channel === "zero" ? !hasCash : hasCash;
  return outcome === "partial" ? channel !== "zero" && hasCash : !hasCash;
});

export const payrollSettlementRequest = z.discriminatedUnion("action", [
  z.strictObject({ ...command, action: z.literal("issue"), data: z.strictObject({ review: uuid, version: uuid, digest }) }),
  z.strictObject({ ...command, action: z.literal("start-handoff"), data: z.strictObject(wpsTarget) }),
  z.strictObject({ ...command, action: wpsEvidenceAction, data: z.strictObject({ ...wpsTarget, ...evidence }) }),
  z.strictObject({ ...command, action: alternateAction, data: alternateProof }),
  z.strictObject({ ...command, action: z.literal("receipt"), data: employeeReceipt }),
  z.strictObject({ ...command, action: z.literal("allocate"), data: allocation }),
  z.strictObject({ ...command, action: z.literal("reverse"), data: z.strictObject({ ...targetPayment, reason: paymentReason, ...evidence }) }),
]);

export const payrollSettlementReceipt = z.object({ batch: uuid, payment: uuid.optional(), state: text });
export const payrollWpsDownload = z.object({
  filename, sha256: digest, base64: z.string().min(4).regex(/^[a-zA-Z0-9+/\r\n]+={0,2}$/),
});

export type PayrollSettlementScope = z.infer<typeof payrollSettlementScopes>[number];
export type PayrollSettlementWorkspaceData = z.infer<typeof payrollSettlementWorkspace>;
export type PayrollSettlementReview = z.infer<typeof settlementReview>;
export type PayrollSettlementResult = z.infer<typeof settlementResult>;
export type PayrollSettlementPayment = z.infer<typeof settlementPayment>;
export type PayrollHandoffAction = z.infer<typeof wpsAction> | z.infer<typeof alternateAction>;
export type PayrollSettlementAction = z.infer<typeof payrollSettlementRequest>["action"];
export type PayrollEvidenceOption = z.infer<typeof payrollEvidenceOption>;
export type PayrollSettlementRequest = z.infer<typeof payrollSettlementRequest>;
export type PayrollSettlementCommandResult = {
  ok: true; receipt: z.infer<typeof payrollSettlementReceipt>; refreshRequired?: true;
} | { ok: false; error: string; uncertain: boolean };
