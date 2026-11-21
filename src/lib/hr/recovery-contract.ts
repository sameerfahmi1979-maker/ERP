
import { z } from "zod";
import { fleetId } from "@/lib/fleet/asset-contract";

const id = fleetId;
const inputId = z.string().regex(/^\d+$/).transform(Number).pipe(id);
const nullableId = id.nullable();
const proof = z.object({ document: inputId, version: inputId, file: inputId });
const amount = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);
const detail = z.string().trim().min(1).max(2000);
const route = z.enum(["defer", "deduct-correct"]);

export const recoveryMonth = month;
export const moneyKinds = ["authority-paid", "employee-direct", "insurer-offset", "third-party-offset", "employee-cash", "employee-cash-allocated"] as const;
const review = z.object({
  decision: z.enum(["employee", "wear", "employer", "third-party", "insurer", "unresolved"]),
  ceiling: amount, notified_on: z.iso.date().optional(), notice: proof.optional(),
  response: z.enum(["acknowledged", "disputed", "no-response"]).optional(),
  response_note: detail.optional(), response_evidence: proof.optional(), route: route.optional(), disputed_amount: amount.optional(),
});
export const recoveryInputs = {
  "prepare-policy": z.object({
    kind: z.enum(["fine", "damage"]), from: z.iso.date(), until: z.iso.date(), legal_basis: detail,
    currency: z.string().regex(/^[A-Z]{3}$/), case_limit: amount, period_limit: amount,
    wage_basis: z.enum(["fixed-amount", "gross-wage", "basic-wage", "daily-wage"]),
    wage_factor: z.string().regex(/^\d{1,2}(\.\d{1,6})?$/).optional(),
    priority: z.coerce.number().int().min(1).max(999), allow_deduct_correct: z.boolean(),
  }),
  "approve-policy": z.object({ policy: inputId }),
  review,
  "open-dispute": z.object({ amount, route, evidence: proof }),
  "resolve-dispute": z.object({ dispute: inputId, upheld: amount, evidence: proof }),
  reconcile: z.object({ actual_cost: amount, evidence: proof }),
  "record-money": z.object({
    kind: z.enum(moneyKinds), cash: inputId.optional(), reference: z.string().trim().min(1).max(160),
    amount, date: z.iso.date(), evidence: proof,
  }),
  "reverse-money": z.object({ event: inputId, reference: z.string().trim().min(1).max(160), amount, date: z.iso.date(), evidence: proof }),
  "propose-schedule": z.object({
    mode: z.enum(["one-time", "instalments"]),
    instalments: z.array(z.object({ month, amount })).min(1).max(120),
  }),
  "propose-refund": z.object({ allocation: inputId, month, amount }),
  "withdraw-refund": z.object({ refund: inputId }),
  allocate: z.object({ receipt: inputId, pin: inputId, schedule: inputId, month, line: z.uuid(), amount }),
  reverse: z.object({ allocation: inputId, amount }),
};
export type RecoveryAction = keyof typeof recoveryInputs;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const recoveryRequest = z.object({ nonce: z.uuid(), target: id, reason: detail, basis: digest.nullable() });

export const recoveryScopes = z.array(z.object({ id, branch: z.string(), company: z.string() }));
const row = z.object({
  id, source_kind: z.enum(["fine", "damage"]), source_status: z.string(), subject_status: z.string(),
  occurred_at: z.string(), currency: z.string(), employee_id: nullableId, incident_id: nullableId
});
const reviewRow = z.object({
  id, decision: z.string(), ceiling: z.number(), notified_on: z.string().nullable(), reason: z.string().nullable(),
  response: z.string().nullable(), response_note: z.string().nullable(),
});
const dispute = z.object({ id, resolves_id: nullableId, amount: z.number(), upheld: z.number().nullable(), route: z.string(), reason: z.string().nullable() });
const totals = z.object({
  authority_payable: z.number(), principal: z.number(), collected: z.number(), outstanding: z.number(),
  remaining: z.number(), disputed: z.number(), refund_due: z.number(), reconciled_cost: z.number().nullable(),
  employee_cash_received: z.number(), employee_cash_allocated: z.number(), unallocated: z.boolean(),
  current_review: z.boolean(), current_cost: z.boolean(), current_finance: z.boolean(),
  unallocated_deduction: z.number(), unallocated_refund: z.number(),
});
const proposal = z.object({
  status: z.string(), amount: z.number().optional(), open_due: z.number().optional(), month: z.string().optional(),
});
const schedule = z.object({
  id, mode: z.string(), principal: z.number(), instalments: z.array(z.object({ month: z.string(), amount: z.number() })),
});
const money = z.object({
  id, kind: z.string(), amount: z.number(), date: z.string(), reference: z.string(),
  parent_id: nullableId, reverses_id: nullableId,
});
const historyOwner = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recovery"), can_reconcile: z.boolean() }),
  z.object({ kind: z.literal("payroll"), destination: z.object({ company: id, branch: id, month, review: z.uuid(), employee: id, payment: z.uuid() }).nullable() }),
  z.object({ kind: z.literal("exit"), destination: z.object({ company: id, branch: id, eos: id, payment: z.uuid() }).nullable() }),
  z.object({ kind: z.literal("settlement") }),
]);
export type RecoveryHistoryOwner = z.infer<typeof historyOwner>;
const receipt = z.object({
  id, pin: id, amount: z.number(), final: z.boolean(), schedule: id, month: z.string(), line: z.uuid(), approved: z.number(),
  owner: historyOwner.optional(),
});
const allocation = z.object({ id, pin: id, receipt: id, amount: z.number(), reverses: nullableId, owner: historyOwner.optional() });
const refund = z.object({ id, amount: z.number(), month: z.string(), allocation: id, withdrawn: z.boolean(), open_attempt: z.boolean() });
const evidenceRow = z.object({ document: id, version: id, file: id, type: z.string(), label: z.string(), branch: id });
export type RecoveryEvidence = z.infer<typeof evidenceRow>;

export const recoveryWorkspace = z.object({
  cases: z.array(row),
  case: row.extend({
    source_amount: z.number(), empl_company_id: nullableId, operating_branch: id, reviews: z.array(reviewRow),
    hr_basis: digest.nullable(), accounts_basis: digest.nullable(),
    disputes: z.array(dispute), evidence: z.array(evidenceRow),
    totals: totals.optional(), deduction: proposal.optional(), refund: proposal.optional(), schedules: z.array(schedule).optional(),
    money: z.array(money).optional(), receipts: z.array(receipt).optional(), allocations: z.array(allocation).optional(),
    refunds: z.array(refund).optional(),
  }).nullable(),
  policies: z.array(z.object({
    id, kind: z.string(), legal_basis: z.string(), validity: z.string(), currency: z.string(),
    case_limit: z.number(), period_limit: z.number(), wage_basis: z.string(), wage_factor: z.number().nullable(),
    priority: z.number(), allow_deduct_correct: z.boolean(), approved_at: z.string().nullable(),
  })),
  can_review: z.boolean(), can_reconcile: z.boolean(), can_manage_policy: z.boolean(), can_print: z.boolean().optional(),
});
export type RecoveryCase = NonNullable<z.infer<typeof recoveryWorkspace>["case"]>;
