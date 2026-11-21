
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, createAdminClient, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
import {
  payrollFinanceFetcher,
  listPayrollFinanceScopes,
} from "@/server/actions/reports/hr/payroll-finance-reconciliation";
import type { AuthContext } from "@/lib/rbac/check";
import type { ReportReadClient } from "@/lib/report-center/scoped-read-client";

const db = Object.freeze({ from: vi.fn() }) as unknown as ReportReadClient;
const filters = { owner_company_id: 17, branch_id: 4, payroll_month: "2026-11" };

beforeEach(() => {
  rpc.mockReset();
  createAdminClient.mockReset();
  createClient.mockReset().mockResolvedValue({ rpc });
});

describe("T17 Finance payroll reconciliation fetcher", () => {
  it("binds an authenticated report to one exact employer branch and calendar month", async () => {
    rpc.mockResolvedValue({ error: null, data: { company_id: 17, branch_id: 4, payroll_month: "2026-11-01", totals: [], components: [], files: [] } });
    const report = await payrollFinanceFetcher.fetch(filters, [], db);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("t17_payroll_finance_report", { p_company: 17, p_branch: 4, p_month: "2026-11-01" });
    expect(report.rows).toEqual([]);
    expect(report.meta?.ownerCompanyIds).toEqual([17]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it.each([
    { owner_company_id: 17, payroll_month: "2026-11" },
    { ...filters, payroll_month: "2026-11-29" },
    { ...filters, branch_id: "4e0" },
    { ...filters, employee_id: 980001 },
  ])("rejects missing scope, invalid date, widened or subject filters before fetching", async (invalid) => {
    await expect(payrollFinanceFetcher.fetch(invalid, [], db)).rejects.toThrow("Select an employer, branch and payroll month.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requests a company roll-up only when the caller explicitly selects it", async () => {
    rpc.mockResolvedValue({ error: null, data: { company_id: 17, branch_id: null, payroll_month: "2026-11-01", totals: [], components: [], files: [] } });
    await payrollFinanceFetcher.fetch({ ...filters, branch_id: null }, [], db);
    expect(rpc).toHaveBeenCalledWith("t17_payroll_finance_report", { p_company: 17, p_branch: null, p_month: "2026-11-01" });
  });

  it("rejects a mismatched response and does not publish privileged data after an RPC denial", async () => {
    rpc.mockResolvedValueOnce({ data: { company_id: 17, branch_id: 99, payroll_month: "2026-11-01", totals: [], components: [], files: [] }, error: null });
    await expect(payrollFinanceFetcher.fetch(filters, [], db)).rejects.toThrow("Payroll reconciliation could not be verified.");
    rpc.mockResolvedValueOnce({ data: { private: "hidden" }, error: { code: "42501" } });
    await expect(payrollFinanceFetcher.fetch(filters, [], db)).rejects.toThrow("Payroll reconciliation is unavailable for this employer and branch.");
  });

  it("keeps exact decimal strings and rejects protected WPS metadata", async () => {
    const file = {
      file_reference: "WPS_SYNTHETIC.sif", currency: "AED", row_count: 2,
      file_total: "123456789012345678.90", approval_version: 1, state: "accepted", scope: "current", branch: "Synthetic branch",
    };
    const response = { company_id: 17, branch_id: 4, payroll_month: "2026-11-01", totals: [], components: [], files: [file] };
    rpc.mockResolvedValueOnce({ error: null, data: response });
    expect((await payrollFinanceFetcher.fetch(filters, [], db)).rows).toEqual([{
      owner_company_id: 17, branch_id: 4, payroll_month: "2026-11", section: "wps", ...file,
    }]);
    rpc.mockResolvedValueOnce({ error: null, data: { ...response, files: [{ ...file, checksum: "private" }] } });
    await expect(payrollFinanceFetcher.fetch(filters, [], db)).rejects.toThrow("Payroll reconciliation could not be verified.");
  });

  it("validates permitted scope labels from the same authenticated database client", async () => {
    rpc.mockResolvedValue({ error: null, data: [{ company_id: 17, branch_id: 4, company: "Synthetic employer", branch: "Synthetic branch" }] });
    expect(await listPayrollFinanceScopes()).toEqual([{ company_id: 17, branch_id: 4, company: "Synthetic employer", branch: "Synthetic branch" }]);
    expect(rpc).toHaveBeenCalledWith("t17_payroll_finance_scopes");
    rpc.mockResolvedValue({ error: null, data: [{ company_id: 17, branch_id: 4, company: "Synthetic employer", branch: "Synthetic branch", iban: "sensitive" }] });
    await expect(listPayrollFinanceScopes()).rejects.toThrow("Payroll reconciliation scopes could not be verified.");
  });
});


describe("T17 Finance report delivery boundary", () => {
  it.each(["email", "csv", "pdf", "print"] as const)("blocks %s before registry service reads or output creation", async (outputFormat) => {
    const { runReport } = await import("@/lib/report-center/report-runner");
    const actor = {
      profile: { id: 41, must_change_password: false },
      isAccountActive: true,
      permissionCodes: ["hr.payroll.finance.reconcile", "reports.run", "reports.view", "reports.export", "reports.email"],
    } as AuthContext;
    const result = await runReport({
      reportCode: "FIN_PAYROLL_RECONCILIATION", requestedByUserId: 41, outputFormat, filters,
    }, actor);
    expect(result).toEqual({ success: false, error: "Payroll reconciliation is available only in Report Center." });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
