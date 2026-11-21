import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  PAYROLL_FINANCE_REPORT,
  payrollFinanceFilters,
  payrollFinanceScope,
  payrollFinanceSnapshot,
} from "@/lib/report-center/payroll-finance-contract";
import type { ReportFetcher } from "@/lib/report-center/types";

export async function listPayrollFinanceScopes() {
  const { data, error } = await (await createClient()).rpc("t17_payroll_finance_scopes");
  const parsed = z.array(payrollFinanceScope).safeParse(data);
  if (error || !parsed.success) throw Error("Payroll reconciliation scopes could not be verified.");
  return parsed.data;
}

export const payrollFinanceFetcher: ReportFetcher = {
  reportCode: PAYROLL_FINANCE_REPORT,
  async fetch(filters) {
    const request = payrollFinanceFilters.safeParse(filters);
    if (!request.success) throw Error("Select an employer, branch and payroll month.");
    const { owner_company_id: company, branch_id: branch, payroll_month: month } = request.data;
    const monthStart = month + "-01";

    // Salary aggregates come from the caller's authenticated payroll scope.
    // The report runner's service-backed table facade is not an authority here.
    const { data, error } = await (await createClient()).rpc("t17_payroll_finance_report", {
      p_company: company,
      p_branch: branch,
      p_month: monthStart,
    });
    if (error?.code === "42501") throw Error("Payroll reconciliation is unavailable for this employer and branch.");
    const snapshot = payrollFinanceSnapshot.safeParse(data);
    if (error || !snapshot.success
      || snapshot.data.company_id !== company || snapshot.data.branch_id !== branch || snapshot.data.payroll_month !== monthStart) {
      throw Error("Payroll reconciliation could not be verified.");
    }
    const identity = { owner_company_id: company, branch_id: branch, payroll_month: month };
    const rows = [
      ...snapshot.data.totals.map(row => ({ ...identity, section: "total", ...row })),
      ...snapshot.data.components.map(row => ({ ...identity, section: "component", ...row })),
      ...snapshot.data.files.map(row => ({ ...identity, section: "wps", ...row })),
    ];
    return {
      rows,
      columns: [...new Set(rows.flatMap(row => Object.keys(row)))],
      meta: { total: rows.length, ownerCompanyIds: [company] },
    };
  },
};

