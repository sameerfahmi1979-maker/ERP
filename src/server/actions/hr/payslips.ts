
"use server";

import { z } from "zod";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadGeneratedPdf } from "@/lib/pdf/storage";
import { issueRetainedPayslip, PayslipRoutingRetry } from "@/lib/official-documents/payslip-issuance";
import { readPayslipOriginal } from "@/lib/official-documents/payslip-storage";
import { PAYSLIP_RENDERER_VERSION, renderPayslipPdf } from "@/lib/official-documents/payslip-pdf";
import { logger } from "@/lib/logger";

const positive = z.number().int().positive().safe();
const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const month = z.iso.date().refine(value => value.endsWith("-01"));
const money = z.string().regex(/^-?\d+\.\d{2}$/);
const date = z.iso.date();
const text = z.string().trim().min(1).max(500);
const reviewInput = z.strictObject({
  company: positive, branch: positive, month, employee: z.string().trim().min(1).max(100).optional(),
  after: positive.optional(),
});
const scopeSchema = z.array(z.object({ company_id: positive, branch_id: positive, company: text, branch: text }));
const deliveryHistory = z.array(z.object({
  id: positive, kind: text, channel: z.enum(["email", "print"]), state: text, at: z.iso.datetime({ offset: true }),
  completed_at: z.iso.datetime({ offset: true }).nullish(),
  can_handover: z.boolean().optional(), can_bounce: z.boolean().optional(), can_reconcile: z.boolean().optional(),
}));
const workSchema = z.object({
  access: z.object({ view: z.boolean(), issue: z.boolean(), deliver: z.boolean() }),
  rows: z.array(z.object({
    employee: positive, name: text, code: text, month, batch: uuid, version: uuid, state: text, can_issue: z.boolean(),
    slip: z.object({
      id: positive, issued_at: z.iso.datetime({ offset: true }).nullable(), checksum: digest.nullable(),
      filename: z.string().regex(/^Payslip-\d{4}-\d{2}-\d+\.pdf$/),
      delivery: z.object({ history: deliveryHistory, actions: z.array(z.enum(["initial", "resend", "print"])) }),
    }).nullable(),
  })),
  next_after: positive.nullable(),
});
const snapshotSchema = z.object({
  sequence: positive, report_on: date, company: text, branch: text, employee: text, employee_code: text, month,
  currency: z.string().regex(/^[A-Z]{3}$/), gross: money, deductions: money, net: money, trip_total: money,
  components: z.array(z.object({ category: text, kind: z.enum(["earning", "deduction"]), amount: money, label: text.optional() })),
  late_overtime: z.array(z.object({ month, hours: z.string().regex(/^-?\d+(?:\.\d+)?$/), amount: money })),
  trips: z.array(z.object({ day: date, reference: text, direction: text, truck_type: text, amount: money })),
});
const prepareSchema = z.object({
  id: positive, finalized: z.boolean(), can_deliver: z.boolean(), snapshot: snapshotSchema.nullable(),
  renderer: z.string().min(1), proof: z.object({
    checksum: digest, size: positive, object_id: uuid, version: z.string().min(1),
  }).nullable(),
  path: z.string().regex(/^hr\/payslips\/\d+\/\d+\/[a-f0-9-]{36}\.pdf$/).nullable(),
});
const issueSchema = z.strictObject({ operation: uuid, batch: uuid, employee: positive });
const reason = z.string().trim().min(3).max(250);
const traceReference = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$/);
const deliverySchema = z.discriminatedUnion("action", [
  z.strictObject({ operation: uuid, slip: positive, action: z.literal("initial"), data: z.strictObject({}) }),
  z.strictObject({ operation: uuid, slip: positive, action: z.enum(["resend", "print"]), data: z.strictObject({ reason }) }),
  z.strictObject({ operation: uuid, slip: positive, action: z.literal("handover"), data: z.strictObject({ delivery: positive, reason }) }),
  z.strictObject({
    operation: uuid, slip: positive, action: z.literal("bounce"),
    data: z.strictObject({ delivery: positive, reason, reference: traceReference }),
  }),
  z.strictObject({
    operation: uuid, slip: positive, action: z.literal("reconcile-email"),
    data: z.strictObject({ delivery: positive, reason, reference: traceReference, disposition: z.enum(["accepted", "not-accepted"]) }),
  }),
]);

const unavailable = "Payslip access is unavailable in this scope.";
type Failure = { ok: false; error: string; uncertain: boolean };
class ScopedPayslipError extends Error {
  constructor(readonly code: string) {
    super("Scoped payslip operation failed.");
  }
}
function errorResult(error: unknown): Failure {
  if (error instanceof PayslipRoutingRetry) return { ok: false, error: error.message, uncertain: true };
  if (error instanceof ScopedPayslipError) {
    if (error.code === "42501") return { ok: false, error: unavailable, uncertain: false };
    if (error.code === "22023" || error.code === "P0409")
      return { ok: false, error: "Check the payslip action and the original request.", uncertain: false };
    if (error.code === "PT409")
      return { ok: false, error: "Review payment eligibility, the retained PDF, or the delivery status. Then retry this action.", uncertain: false };
    logger.warn("Payslip operation could not be confirmed", { code: error.code });
  }
  return { ok: false, error: "The payslip operation could not be confirmed. Retry the same request.", uncertain: true };
}
async function read<S extends z.ZodType>(name: string, input: object, schema: S): Promise<
  { ok: true; data: z.output<S> } | { ok: false; error: string }
> {
  if (!canUseApplication(await getAuthContext())) return { ok: false, error: unavailable };
  const { data, error } = await (await createClient()).rpc(name, input);
  if (error) return { ok: false, error: unavailable };
  const parsed = schema.safeParse(data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "The payslip workspace could not be loaded." };
}

export async function listPayslipScopes() {
  return read("t17_payslip_scopes", {}, scopeSchema);
}
export async function readPayslipWorkspace(input: unknown) {
  const parsed = reviewInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter an employer, branch, and payroll month." };
  const { company, branch, month, employee, after } = parsed.data;
  return read("t17_payslip_workspace", {
    p_company: company, p_branch: branch, p_month: month, p_employee: employee ?? null, p_after: after ?? null,
  }, workSchema);
}

export async function issuePayslip(input: unknown): Promise<{ ok: true } | Failure> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose the employee's exact approved payroll result.", uncertain: false };
  if (!canUseApplication(await getAuthContext())) return { ok: false, error: unavailable, uncertain: false };

  const db = await createClient();
  const actorRpc = async (name: string, args: object) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new ScopedPayslipError(error.code);
    return data;
  };
  try {
    await issueRetainedPayslip(parsed.data, {
      begin: async ({ operation, batch, employee }) => prepareSchema.parse(await actorRpc("t17_issue_prepare", {
        p_operation: operation, p_batch: batch, p_employee: employee,
      })),
      render: (snapshot, renderer) => {
        if (renderer !== PAYSLIP_RENDERER_VERSION) throw new Error("The pinned payslip renderer is unavailable.");
        return renderPayslipPdf(snapshot);
      },
      put: async (path, bytes) => { await uploadGeneratedPdf(bytes, path); },
      get: readPayslipOriginal,
      attest: async (id, checksum, size, identity, renderer) => {
        const { error } = await createAdminClient().rpc("t17_attest_original", {
          p_slip: id, p_object: identity.id, p_version: identity.version, p_updated: identity.lastModified,
          p_checksum: checksum, p_size: size, p_renderer: renderer,
        });
        if (error) throw new ScopedPayslipError(error.code);
      },
      finalize: async (id) => z.object({ can_deliver: z.boolean() }).parse(await actorRpc("t17_issue_finalize", { p_slip: id })),
      routeInitial: async (id, operation) => {
        await actorRpc("t17_delivery_command", { p_operation: operation, p_slip: id, p_action: "initial", p_data: {} });
      },
    });
    return { ok: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function changePayslipDelivery(input: unknown): Promise<{ ok: true } | Failure> {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the selected payslip and delivery details.", uncertain: false };
  if (!canUseApplication(await getAuthContext())) return { ok: false, error: unavailable, uncertain: false };
  const { operation, slip, action, data } = parsed.data;
  try {
    const { error } = await (await createClient()).rpc("t17_delivery_command", {
      p_operation: operation, p_slip: slip, p_action: action, p_data: data,
    });
    if (error) throw new ScopedPayslipError(error.code);
    return { ok: true };
  } catch (error) {
    return errorResult(error);
  }
}
