"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { employeeDate, employeeId, isDefiniteEmployeeRejection } from "@/lib/hr/employee-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { canUseApplication } from "@/lib/rbac/scope";
import { createClient } from "@/lib/supabase/server";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const category = z.enum(["annual", "unpaid", "sick"]);
const status = z.enum(["pending", "reviewed", "approved", "rejected", "withdrawn", "cancelled"]);
const operation = z.string().uuid();
const revision = employeeId;
const day = z.object({ day: employeeDate, rate: z.number().min(0).max(1) });
const unavailable = { status: "review-required", reason: "Verified leave is unavailable with your current access." } as const;
const needsReview = z.object({ status: z.literal("review-required"), reason: z.string() });
const quote = z.discriminatedUnion("status", [needsReview, z.object({
  status: z.literal("ready"), category, from: employeeDate, to: employeeDate,
  days: z.array(day).min(1).max(366), fingerprint: hash, paid_days: z.number().int(),
  partial_days: z.number().int(), unpaid_days: z.number().int(), as_of_date: employeeDate,
})]);
const balance = z.discriminatedUnion("status", [needsReview, z.object({
  status: z.literal("ready"), id: employeeId, period_start: employeeDate, period_end: employeeDate,
  opening_cutoff: employeeDate, as_of_date: employeeDate, full_entitlement: z.number(),
  earned: z.number(), available: z.number(), reserved: z.number(),
  approved_usage: z.number(), carry_available: z.number(),
})]);
const row = z.object({ id: employeeId, category, status, from: employeeDate, to: employeeDate }).strict();
const request = row.extend({
  revision, days: z.array(day.strict()).max(366), cutoff_due: employeeDate.nullable(),
  evidence_status: z.enum(["pending", "verified", "exception"]).nullable(),
  employee_reason: z.string().nullish(),
});
const receipt = z.object({
  id: employeeId, revision: revision.optional(), status: z.union([status, z.literal("proposed")]),
  digest: hash.optional(), period_id: employeeId.optional(), evidence_status: z.literal("verified").optional(), replayed: z.boolean(),
}).strict();
type LeaveMutation =
  | { data: z.infer<typeof receipt>; error?: undefined; uncertain?: undefined }
  | { error: string; uncertain: boolean; data?: undefined };

async function fetchLeave<T>(rpc: string, params: Record<string, unknown>, schema: z.ZodType<T>): Promise<T | null> {
  try {
    if (!canUseApplication(await getAuthContext())) return null;
    const db = await createClient();
    const result = await db.rpc(rpc, params);
    const parsed = schema.safeParse(result.data);
    return !result.error && parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function previewAssistedLeave(employee: number, type: string, from: string, to: string, caseId?: number) {
  if (!employeeId.safeParse(employee).success || !category.safeParse(type).success ||
      ![from, to].every(date => employeeDate.safeParse(date).success) || to < from ||
      (caseId !== undefined && !employeeId.safeParse(caseId).success)) {
    return { status: "review-required", reason: "Choose a valid leave start and end date." } as const;
  }
  const params = { p_employee: employee, p_from: from, p_to: to };
  const result = caseId === undefined
    ? await fetchLeave("t04_leave_preview", { ...params, p_category: type }, quote)
    : await fetchLeave("t04_preview_leave_revision", { ...params, p_case: caseId }, quote);
  if (result?.status === "ready" && (result.category !== type || result.from !== from || result.to !== to)) return unavailable;
  return result ?? unavailable;
}

export async function readAssistedLeaveBalance(employee: number, date: string) {
  if (!employeeId.safeParse(employee).success || !employeeDate.safeParse(date).success) return unavailable;
  return await fetchLeave("t04_leave_balance", { p_employee: employee, p_day: date }, balance) ?? unavailable;
}

export async function listAssistedLeave(employee: number) {
  if (!employeeId.safeParse(employee).success) return null;
  return fetchLeave("t04_list_leave_requests", { p_employee: employee }, z.array(row).max(25));
}

export async function readAssistedLeave(employee: number, caseId: number) {
  if (![employee, caseId].every(id => employeeId.safeParse(id).success)) return null;
  const result = await fetchLeave("t04_read_leave_request", { p_employee: employee, p_case: caseId }, request);
  return result?.id === caseId ? result : null;
}

export async function readAssistedSickCertificates(employee: number, caseId: number) {
  if (![employee, caseId].every(id => employeeId.safeParse(id).success)) return null;
  return fetchLeave("t04_leave_certificate_choices", { p_employee: employee, p_case: caseId },
    z.array(z.object({ medical_id: employeeId, version_id: employeeId, label: z.string() }).strict()).max(100));
}

async function runLeaveWrite(rpc: string, params: Record<string, unknown>, expectedId?: number): Promise<LeaveMutation> {
  try {
    if (!canUseApplication(await getAuthContext())) return { error: "Current leave authority is required.", uncertain: false };
    const db = await createClient();
    const result = await db.rpc(rpc, params);
    if (result.error?.code === "42501") return { error: "This action is outside your current leave authority.", uncertain: false };
    if (["PT409", "P0409"].includes(result.error?.code ?? "")) return { error: "The reviewed record or available balance changed. Refresh it and review the dates again.", uncertain: false };
    if (isDefiniteEmployeeRejection(result.error?.code)) {
      return { error: "The request was held. Check the approved policy, evidence and required decision.", uncertain: false };
    }
    const parsed = receipt.safeParse(result.data);
    if (!parsed.success || result.error || (expectedId !== undefined && parsed.data.id !== expectedId)) {
      return { error: "The result is unconfirmed. Retry the original request.", uncertain: true };
    }
    try { revalidatePath("/admin/hr/time/leave"); } catch { /* The committed receipt is authoritative. */ }
    return { data: parsed.data };
  } catch {
    return { error: "The result is unconfirmed. Retry the original request.", uncertain: true };
  }
}

const caseWrite = z.object({
  employee: employeeId, id: employeeId.nullable(), operation,
  action: z.enum(["submit", "review", "revise", "approve", "approve-exception", "reject", "withdraw", "return", "cancel"]),
  data: z.object({ category: category.optional(), from: employeeDate.optional(), to: employeeDate.optional(),
    fingerprint: hash.optional(), revision: revision.optional(), reason: z.string().trim().min(1).max(1000).optional() }).strict(),
}).strict();
export async function changeAssistedLeave(input: unknown): Promise<LeaveMutation> {
  const parsed = caseWrite.safeParse(input);
  if (!parsed.success) return { error: "Fill in the required leave dates and decision facts.", uncertain: false };
  const p = parsed.data;
  return runLeaveWrite("t04_leave_command",
    { p_employee: p.employee, p_case: p.id, p_action: p.action, p_data: p.data, p_operation: p.operation }, p.id ?? undefined);
}

const certificateWrite = z.object({
  employee: employeeId, id: employeeId, revision, medicalId: employeeId, version: employeeId, operation,
}).strict();
export async function verifyAssistedSickCertificate(input: unknown): Promise<LeaveMutation> {
  const parsed = certificateWrite.safeParse(input);
  if (!parsed.success) return { error: "Choose the current verified certificate.", uncertain: false };
  const p = parsed.data;
  return runLeaveWrite("t04_verify_sick_evidence", {
    p_employee: p.employee, p_case: p.id, p_revision: p.revision, p_medical: p.medicalId, p_version: p.version, p_operation: p.operation,
  }, p.id);
}

const setupKind = z.enum(["opening", "carry", "adjustment"]);
export async function readLeaveBalanceSetup(id: number) {
  if (!employeeId.safeParse(id).success) return null;
  const result = await fetchLeave("t04_read_leave_setup", { p_id: id }, z.object({
    id: employeeId, kind: setupKind, employee_id: employeeId, company_id: employeeId,
    facts: z.record(z.string(), z.union([z.string(), z.number()])), digest: hash, approved: z.boolean(),
  }).strict());
  return result?.id === id ? result : null;
}

const setupWrite = z.object({ employee: employeeId, kind: setupKind, operation,
  facts: z.object({ evidence_reference: z.string().trim().min(1).max(1000), cutoff: employeeDate.optional(),
    earned: z.number().nonnegative().optional(), annual_used: z.number().nonnegative().optional(), sick_used: z.number().int().nonnegative().optional(),
    source: employeeId.optional(), destination: employeeId.optional(), days: z.number().optional(),
  }).strict(),
}).strict();
export async function proposeLeaveBalanceSetup(input: unknown): Promise<LeaveMutation> {
  const parsed = setupWrite.safeParse(input);
  if (!parsed.success) return { error: "Enter the reviewed balance figures and evidence reference.", uncertain: false };
  try {
    if (!canUseApplication(await getAuthContext())) return { error: "Current leave authority is required.", uncertain: false };
    const p = parsed.data;
    const db = await createClient();
    const employee = await db.from("employees").select("owner_company_id").eq("id", p.employee).is("deleted_at", null).maybeSingle();
    if (employee.error || !employeeId.safeParse(employee.data?.owner_company_id).success) {
      return { error: "The employee's current employer is unavailable.", uncertain: false };
    }
    return runLeaveWrite("t04_prepare_leave_setup", {
      p_kind: p.kind, p_company: employee.data!.owner_company_id, p_employee: p.employee, p_facts: p.facts, p_operation: p.operation,
    });
  } catch {
    return { error: "The result is unconfirmed. Retry the original request.", uncertain: true };
  }
}

export async function approveLeaveBalanceSetup(input: unknown): Promise<LeaveMutation> {
  const parsed = z.object({ id: employeeId, digest: hash, operation }).strict().safeParse(input);
  if (!parsed.success) return { error: "Open the exact balance proposal before approving.", uncertain: false };
  const p = parsed.data;
  return runLeaveWrite("t04_approve_leave_setup", { p_id: p.id, p_digest: p.digest, p_operation: p.operation }, p.id);
}
