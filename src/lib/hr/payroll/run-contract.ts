import { z } from "zod";

export const payrollRunsPath = "/admin/hr/payroll/runs";
const id = z.number().int().positive().safe();
const inputId = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id);
const count = z.number().int().nonnegative().safe();
const currency = z.string().regex(/^[A-Z]{3}$/);
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(2000);
const versionId = z.uuid();
const sourceKey = z.string().trim().min(1).max(500);
const decimalAmount = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/);
const positiveAmount = decimalAmount.refine(value => /[1-9]/.test(value));
const fraction = z.string().regex(/^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/);
const money = z.union([
  z.string().regex(/^-?\d+(?:\.\d+)?$/),
  z.number().finite(),
]).transform(String);
const direction = z.enum(["earning", "deduction"]);
const wholeMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/).transform(value => value + "-01");
const monthDate = date.refine(value => value.endsWith("-01"));

export const payrollQuery = z.object({
  company: id,
  branch: id,
  month: monthDate,
  version: versionId.optional(),
  employee: id.optional(),
  before: id.optional(),
});

export const payrollScopes = z.array(z.object({
  company_id: id,
  branch_id: id,
  company: z.string(),
  branch: z.string(),
  can_calculate: z.boolean(),
  can_policy: z.boolean(),
}));

const versionSummary = z.object({
  id: versionId, number: id, cutoff: timestamp, created_at: timestamp,
});
const currencyTotals = z.object({
  currency, gross: money, deductions: money, net: money, employees: count,
});
const version = versionSummary.omit({ created_at: true }).extend({
  month: monthDate,
  digest: z.string().regex(/^[a-f0-9]{64}$/i),
  totals: z.array(currencyTotals),
  exception_count: count,
});

const employee = z.object({
  id, name: z.string(), employment_ids: z.array(id),
  currency: currency.nullable(),
  gross: money.nullable(), deductions: money.nullable(), net: money.nullable(),
  state: z.string(), exception_count: count,
});
const source = z.record(z.string(), z.unknown());
const line = z.object({
  key: sourceKey,
  category: z.string(),
  kind: direction,
  amount: money,
  currency,
  quantity: money.nullable(),
  unit: z.string().nullable(),
  rate: money.nullable(),
  original_on: date,
  available_at: timestamp.nullable(),
  source,
  reason: z.string(),
});
const exception = z.object({
  code: z.string(), reason: z.string(), source: source.nullish(), blocking: z.boolean(),
});
const employeeDetail = z.object({
  id, name: z.string(), lines: z.array(line), exceptions: z.array(exception),
});
const ruleFacts = z.object({
  proration: z.enum(["calendar-days", "fixed-days"]),
  fixed_days: id.nullish(),
  absence: z.enum(["unpaid-only", "verified-absence"]),
  leave_wage_basis: z.enum(["basic", "gross"]),
  daily_recovery_basis: z.enum(["basic", "gross"]),
  recovery_fraction: money,
  net_floor: money,
});
const rule = z.object({
  id, group_id: id.nullable(), validity: z.string(), facts: ruleFacts, approved_at: timestamp.nullable(),
});
const group = z.object({ id, name: z.string() });
const adjustment = z.object({
  id, employee_id: id, kind: direction, amount: money, currency,
  month: monthDate, reason: z.string(), status: z.string(), source_key: sourceKey,
});
const evidence = z.object({ document: id, version: id, file: id, label: z.string() });
export const payrollWorkspace = z.object({
  can_calculate: z.boolean(),
  can_policy: z.boolean(),
  run: versionId.nullable(),
  version: version.nullable(),
  versions: z.array(versionSummary),
  employees: z.array(employee),
  detail: employeeDetail.nullable(),
  rules: z.array(rule),
  groups: z.array(group),
  adjustments: z.array(adjustment),
  evidence: z.array(evidence),
  next_before: id.nullable(),
});

export type PayrollScope = z.infer<typeof payrollScopes>[number];
export type PayrollWorkspaceData = z.infer<typeof payrollWorkspace>;
export type PayrollQuery = z.infer<typeof payrollQuery>;
export type PayrollLine = z.infer<typeof line>;
export type PayrollEvidence = z.infer<typeof evidence>;

const rules = {
  calculate: z.object({ month: wholeMonth, cutoff: timestamp, expected_version: versionId.nullable(), reason }),
  "prepare-rule": z.object({
    from: wholeMonth, until: wholeMonth, group_id: inputId.optional(),
    proration: z.enum(["calendar-days", "fixed-days"]),
    fixed_days: inputId.pipe(z.number().min(1).max(31)).optional(),
    absence: z.enum(["unpaid-only", "verified-absence"]),
    leave_wage_basis: z.enum(["basic", "gross"]),
    daily_recovery_basis: z.enum(["basic", "gross"]),
    recovery_fraction: fraction,
    net_floor: decimalAmount,
    reason,
  }).superRefine((input, ctx) => {
    if (input.from >= input.until) ctx.addIssue({ code: "custom", path: ["until"], message: "Choose a later end date." });
    if ((input.proration === "fixed-days") !== (input.fixed_days !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["fixed_days"], message: "Enter the approved fixed day count." });
    }
  }),
  "approve-rule": z.object({ rule: inputId, reason }),
  "prepare-adjustment": z.object({
    month: wholeMonth, employee: inputId, version: versionId, source_key: sourceKey, kind: direction,
    amount: positiveAmount, currency, evidence: z.object({ document: inputId, version: inputId, file: inputId }), reason,
  }),
  "verify-adjustment": z.object({ adjustment: inputId, reason }),
  "reject-adjustment": z.object({ adjustment: inputId, reason }),
} as const;

export type PayrollAction = keyof typeof rules;
export const payrollCommandHeader = z.object({
  company: id, branch: id, operation: z.uuid(),
});

const dubaiDateTime = /^(\d{4}-\d\d-\d\dT\d\d:\d\d)(:\d\d)?$/;

export function parsePayrollCommand(action: PayrollAction, form: FormData) {
  if (!Object.hasOwn(rules, action)) return null;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of form) {
    if (typeof value === "string" && value.trim() !== "") fields[key] = value.trim();
  }
  if (action === "calculate") {
    if (typeof fields.cutoff !== "string") return null;
    const dateTime = dubaiDateTime.exec(fields.cutoff);
    if (dateTime) fields.cutoff = dateTime[1] + (dateTime[2] ?? ":00") + "+04:00";
    fields.expected_version ??= null;
  }
  if (action === "prepare-adjustment") {
    const proof = typeof fields.evidence === "string" ? fields.evidence.split("/") : [];
    if (proof.length !== 3) return null;
    const [document, version, file] = proof;
    fields.evidence = { document, version, file };
  }
  const result = rules[action].safeParse(fields);
  return result.success ? result.data : null;
}
