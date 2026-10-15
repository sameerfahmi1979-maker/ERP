import "server-only";
import {getAuthContext, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {canReadPayrollInquiry, payrollInquiryCriteriaSchema, payrollInquiryPageSchema, type PayrollInquiryPage} from "@/lib/reads/hr-payroll-inquiries-schema";

/** Requires the matching invoker read-model migration. Missing RPC fails closed;
 * never fall back to first-50 employees, embedded child caps or privileged reads.
 * Context is internal SSR composition, never HTTP-supplied authorization. */
export async function readPayrollInquiry(input: unknown, context?: AuthContext, signal?: AbortSignal): Promise<{success: boolean; data?: PayrollInquiryPage; error?: string; updatedAt?: number}> {
  const parsed = payrollInquiryCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false, error: "Invalid payroll inquiry criteria"};
  try {
    const p = parsed.data, ctx = context ?? await getAuthContext();
    if (!canReadPayrollInquiry(ctx, p.kind)) return {success: false, error: "Permission denied"};
    const db = await createClient(), bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
    const result = await db.rpc("perf_hr_payroll_inquiry", {p_kind: p.kind, p_page: p.page, p_page_size: p.pageSize, p_search: p.search, p_employee_search: p.employeeSearch, p_owner_company_id: p.ownerCompanyId, p_branch_id: p.branchId, p_status: p.status, p_active_hold_only: p.activeHoldOnly, p_column_filters: p.columnFilters, p_sorting: p.sorting}).abortSignal(bounded);
    if (result.error?.code === "42501") return {success: false, error: "Permission denied"};
    const safe = payrollInquiryPageSchema.safeParse(result.data);
    if (result.error || !safe.success || safe.data.kind !== p.kind || safe.data.page !== p.page || safe.data.pageSize !== p.pageSize) throw Error("Unverified payroll result");
    return {success: true, data: safe.data, updatedAt: Date.now()};
  } catch {return {success: false, error: "Payroll records and matching total could not be completely loaded. Please retry."};}
}
