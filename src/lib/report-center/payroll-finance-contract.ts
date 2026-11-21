import { z } from "zod";

export const PAYROLL_FINANCE_REPORT = "FIN_PAYROLL_RECONCILIATION";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const filterId = z.union([id, z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id)]);
const month = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const monthStart = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/);
const currency = z.string().regex(/^[A-Z]{3}$/);
const money = z.string().regex(/^-?\d+\.\d{2}$/);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);

export const payrollFinanceFilters = z.strictObject({
  owner_company_id: filterId,
  branch_id: filterId.nullable(),
  payroll_month: month,
});

export const payrollFinanceScope = z.strictObject({
  company_id: id,
  branch_id: id.nullable(),
  company: z.string(),
  branch: z.string(),
});
export type PayrollFinanceScope = z.infer<typeof payrollFinanceScope>;

const totals = z.strictObject({
  currency,
  employee_count: count,
  reconciled_count: count,
  unsettled_count: count,
  partial_count: count,
  pending_count: count,
  rejected_count: count,
  reversed_count: count,
  paid_unallocated_count: count,
  approved_gross: money,
  approved_deductions: money,
  approved_net: money,
  verified_cash: money,
  applied_wages: money,
  applied_deductions: money,
  unallocated_cash: money,
  outstanding_cash: money,
  outstanding_deductions: money,
  reconciled_cash: money,
  recovery_approved: money,
  recovery_applied: money,
  recovery_outstanding: money,
  recovery_refund_approved: money,
  recovery_refund_applied: money,
  unexplained_difference: money,
  wps_current_total: money,
  wps_accepted_total: money,
});

const component = z.strictObject({
  currency,
  kind: z.enum(["earning", "deduction"]),
  category: z.string().regex(/^[a-z0-9_-]+$/),
  work_month: monthStart.nullable(),
  component_code: z.string().nullable(),
  component_name: z.string().nullable(),
  approved: money,
  applied: money,
});

const wpsFile = z.strictObject({
  file_reference: z.string().regex(/^[A-Za-z0-9_-]+\.(sif|csv)$/).max(100),
  currency,
  row_count: id,
  file_total: money,
  approval_version: id,
  state: z.enum(["prepared", "handoff-pending", "submitted", "acknowledged", "accepted", "rejected", "cancelled"]),
  scope: z.enum(["current", "superseded"]),
  branch: z.string(),
});

export const payrollFinanceSnapshot = z.strictObject({
  company_id: id,
  branch_id: id.nullable(),
  payroll_month: monthStart,
  totals: z.array(totals),
  components: z.array(component),
  files: z.array(wpsFile),
});

