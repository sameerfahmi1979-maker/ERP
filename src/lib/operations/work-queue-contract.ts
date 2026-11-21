import { z } from "zod";

export const workQueuePath = "/admin/operations/work-queues";
export const workQueuePageSize = 25;
export const workQueueMaxPage = 2000;

export const workQueuePermissions = [
  "hr.actions.view", "fleet.custody.manage", "fleet.availability.plan", "fleet.holds.workshop",
  "fleet.holds.hse", "fleet.operations.view", "fleet.allowance.submit", "fleet.allowance.approve",
  "fleet.time.verify", "workshop.assess", "workshop.jobs.manage", "workshop.jobs.release",
  "fleet.maintenance.manage", "hr.recovery.review", "hr.recovery.accounts", "hr.payroll.run.manage",
  "hr.payroll.run.approve", "hr.payroll.wps.issue", "hr.payroll.payment.reconcile", "hr.exit.settlement.view",
] as const;

const kinds = ["pro", "custody", "readiness", "proof", "discrepancy", "workshop", "recovery", "payroll", "payment", "exit"] as const;
const workQueueKind = z.enum(kinds);
export const workQueueFilter = z.enum(["all", ...kinds]);
export const workQueueLabels: Record<z.infer<typeof workQueueFilter>, string> = {
  all: "All open work",
  pro: "PRO processes",
  custody: "Overdue custody",
  readiness: "Fleet readiness",
  proof: "Delivery proof",
  discrepancy: "Fleet time",
  workshop: "Workshop and maintenance",
  recovery: "Recoveries",
  payroll: "Payroll review",
  payment: "Payment follow-up",
  exit: "Exit settlement",
};

const id = z.number().int().positive().refine(Number.isSafeInteger);
const pageNumber = z.number().int().min(1).max(workQueueMaxPage);
const scope = z.object({
  company: id,
  branch: id.nullable(),
  company_name: z.string(),
  branch_name: z.string().nullable(),
  kinds: z.array(workQueueKind).min(1),
}).strict();
export const workQueueScopes = z.array(scope);
export const workQueueQuery = z.object({
  company: id, branch: id.nullable(), kind: workQueueFilter, query: z.string().trim().max(100), page: pageNumber,
}).strict();

const workQueueSource = z.enum([
  "pro-process", "fleet-commitment", "fleet-hold", "fleet-asset", "trip-leg", "fleet-work",
  "workshop-finding", "workshop-job", "maintenance-clock", "recovery-case", "payroll-version",
  "payroll-review", "payroll-dispatch", "payroll-payment", "exit-case",
]);
const integer = "[1-9][0-9]*";
const uuid = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
const month = "[0-9]{4}-(?:0[1-9]|1[0-2])";
const scopedMonth = "scope=" + integer + "[.]" + integer + "&month=" + month;
const route = (value: string) => new RegExp("^" + value + "$");
const actionRoutes: Record<z.infer<typeof workQueueSource>, readonly RegExp[]> = {
  "pro-process": [route("/admin/hr/actions/pro[?]record=" + integer)],
  "fleet-commitment": [route("/modules/fleet/" + integer + "[?]custodyBefore=" + integer)],
  "fleet-hold": [route("/modules/fleet/" + integer)],
  "fleet-asset": [route("/modules/fleet/" + integer)],
  "trip-leg": [route("/modules/fleet/operations/" + integer), route("/modules/fleet/allowances[?]order=" + integer)],
  "fleet-work": [route("/modules/fleet/time[?]order=" + integer + "&before=" + integer)],
  "workshop-finding": [route("/modules/workshop[?]asset=" + integer + "&before=" + integer)],
  "workshop-job": [route("/modules/workshop[?]asset=" + integer + "&before=" + integer)],
  "maintenance-clock": [route("/modules/workshop[?]asset=" + integer)],
  "recovery-case": [route("/admin/hr/operations/recoveries[?]branch=" + integer + "&month=" + month + "&case=" + integer)],
  "payroll-version": [route("/admin/hr/payroll/runs[?]" + scopedMonth + "&version=" + uuid)],
  "payroll-review": [route("/admin/hr/payroll/approvals[?]" + scopedMonth + "&review=" + uuid)],
  "payroll-dispatch": [route("/admin/hr/payroll/settlement[?]" + scopedMonth + "&review=" + uuid)],
  "payroll-payment": [route("/admin/hr/payroll/settlement[?]" + scopedMonth + "&review=" + uuid + "&employee=" + integer + "(?:&after=" + integer + ")?")],
  "exit-case": [route("/admin/hr/actions/final-settlement[?]scope=" + integer + "[.]" + integer + "&eos=" + integer)],
};

const row = z.object({
  kind: workQueueKind,
  source_type: workQueueSource,
  source_id: z.string().min(1),
  reference: z.string(),
  title: z.string(),
  responsible: z.string(),
  assignee: z.string().nullable(),
  action: z.string(),
  state: z.string(),
  opened_on: z.iso.date(),
  due_on: z.iso.date().nullable(),
  evidence: z.enum(["available", "restricted", "missing", "in-workflow"]),
  href: z.string(),
  age_days: z.number().int().nonnegative(),
  overdue_days: z.number().int().nonnegative().nullable(),
}).strict().refine(item => actionRoutes[item.source_type].some(pattern => pattern.test(item.href)), {
  message: "Invalid owning workflow target", path: ["href"],
});

export const workQueuePage = z.object({
  as_of: z.iso.date(),
  total: z.number().int().nonnegative().refine(Number.isSafeInteger),
  page: pageNumber,
  page_size: z.number().int().min(1).max(50),
  rows: z.array(row),
}).strict().refine(p => p.rows.length === Math.min(p.page_size, Math.max(0, p.total - (p.page - 1) * p.page_size))
  && new Set(p.rows.map(item => item.source_type + "/" + item.source_id)).size === p.rows.length);

export type WorkQueueQuery = z.infer<typeof workQueueQuery>;
export type WorkQueuePage = z.infer<typeof workQueuePage>;
export type WorkQueueScope = z.infer<typeof scope>;
export type WorkQueueRead<T> = { status: "ok"; data: T } | { status: "restricted" | "failed" };
