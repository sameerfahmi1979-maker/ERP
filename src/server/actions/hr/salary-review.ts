"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getAuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {employeeId, isDefiniteEmployeeRejection} from "@/lib/hr/employee-contract";
import {salaryReviewSubject, salaryReviewOpening, salaryReviewRequest, salaryReviewReceipt, salaryReviewHistoryRow, matchesSalaryReviewReceipt} from "@/lib/hr/payroll/salary-review-contract";
async function active() {const context = await getAuthContext(); return !!context.profile && context.isAccountActive && !context.profile.must_change_password;}
export async function openSalaryReview(raw: unknown) {
  const parsed = salaryReviewSubject.safeParse(raw);
  if (!parsed.success) return {success: false as const, error: "Original salary revision required."};
  try {
    if (!await active()) return {success: false as const, denied: true, error: "Current account required."};
    const request = parsed.data, result = await (await createClient()).rpc("f12_salary_review_opening", {p_employee: request.employee_id, p_revision: request.revision_id});
    const value = salaryReviewOpening.safeParse(result.data);
    if (result.error || !value.success || value.data.employee_id !== request.employee_id || value.data.revision_id !== request.revision_id) return {success: false as const, denied: result.error?.code === "42501", error: "The current permitted salary review could not be verified. Legacy history is not a new approved proposal."};
    return {success: true as const, data: value.data};
  } catch {return {success: false as const, error: "Salary review unavailable; no decision sent."};}
}
export async function saveSalaryReview(raw: unknown) {
  const parsed = salaryReviewRequest.safeParse(raw);
  if (!parsed.success) return {success: false as const, uncertain: false, error: "Check the original revision, decision and reason."};
  let dispatched = false;
  try {
    if (!await active()) return {success: false as const, uncertain: false, denied: true, error: "Current account required."};
    const db = await createClient(); dispatched = true;
    const result = await db.rpc("f12_salary_review", {p_request: parsed.data});
    if (result.error) return {success: false as const, uncertain: !isDefiniteEmployeeRejection(result.error.code), denied: result.error.code === "42501", error: result.error.code === "P0409" ? "Salary sources or review changed. Reopen the current state; do not replace an uncertain operation." : "Decision not confirmed. Check current scope, independent approval, effective date and original receipt."};
    const receipt = salaryReviewReceipt.safeParse(result.data);
    if (!receipt.success || !matchesSalaryReviewReceipt(receipt.data, parsed.data)) return {success: false as const, uncertain: true, error: "Receipt mismatch; keep the original salary operation."};
    try {revalidatePath(`/admin/hr/employees/record/${parsed.data.employee_id}`); revalidatePath("/admin/hr/payroll");} catch {/* A cache failure cannot undo a confirmed transaction. */}
    return {success: true as const, data: receipt.data};
  } catch {return {success: false as const, uncertain: dispatched, error: dispatched ? "Outcome unknown. Check or retry only the unchanged original salary operation." : "Salary service unavailable; no decision sent."};}
}
export async function reconcileSalaryReview(raw: unknown) {
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) return {success: false as const, error: "Original operation identity required."};
  try {
    if (!await active()) return {success: false as const, denied: true, error: "Current account required."};
    const result = await (await createClient()).rpc("f12_salary_reconcile", {p_operation: parsed.data}), receipt = salaryReviewReceipt.safeParse(result.data);
    if (result.error || !receipt.success || receipt.data.operation_id !== parsed.data) return {success: false as const, denied: result.error?.code === "42501", error: "Original result remains unresolved. A missing receipt does not prove failure."};
    return {success: true as const, data: receipt.data};
  } catch {return {success: false as const, error: "Original salary receipt unavailable; no replacement sent."};}
}
export async function readRecentSalaryReviews(raw: unknown) {
  const parsed = z.object({employee_id: employeeId, before: z.string().datetime({offset: true}).nullable().default(null), cursor: z.string().uuid().nullable().default(null)}).strict().refine(value => (value.before === null) === (value.cursor === null)).safeParse(raw);
  if (!parsed.success) return {success: false as const, error: "Complete original receipt cursor required."};
  try {
    if (!await active()) return {success: false as const, denied: true, error: "Current account required."};
    const request = parsed.data, result = await (await createClient()).rpc("f12_salary_recent", {p_employee: request.employee_id, p_before: request.before, p_cursor: request.cursor});
    const value = z.array(z.object({receipt: salaryReviewReceipt, created_at: z.string().datetime({offset: true}), operation_id: z.string().uuid()}).strict()).max(26).safeParse(result.data);
    if (result.error || !value.success || new Set(value.data.map(row => row.operation_id)).size !== value.data.length || value.data.some(row => row.receipt.employee_id !== request.employee_id || row.receipt.operation_id !== row.operation_id)) return {success: false as const, denied: result.error?.code === "42501", error: "Original confirmations unavailable; no empty success assumed."};
    return {success: true as const, rows: value.data.slice(0, 25), hasMore: value.data.length > 25};
  } catch {return {success: false as const, error: "Original confirmations unavailable; no request replayed."};}
}
export async function readSalaryReviewHistory(raw: unknown) {
  const parsed = salaryReviewSubject.extend({after: z.number().int().safe().nonnegative().default(0)}).strict().safeParse(raw);
  if (!parsed.success) return {success: false as const, error: "Original salary history identity required."};
  try {
    if (!await active()) return {success: false as const, denied: true, error: "Current account required."};
    const request = parsed.data, result = await (await createClient()).rpc("f12_salary_history", {p_employee: request.employee_id, p_revision: request.revision_id, p_after: request.after});
    const value = z.array(salaryReviewHistoryRow).max(26).safeParse(result.data);
    if (result.error || !value.success || value.data.some((row,index,rows) => row.employee_id !== request.employee_id || row.revision_id !== request.revision_id || row.id <= request.after || index > 0 && row.id <= rows[index - 1].id)) return {success: false as const, denied: result.error?.code === "42501", error: "Permitted salary history unavailable."};
    return {success: true as const, rows: value.data.slice(0, 25), hasMore: value.data.length > 25};
  } catch {return {success: false as const, error: "Salary history unavailable; no decision inferred."};}
}
