import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
  fetcher: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error("REDIRECT:" + url); }),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 7 }, permissionCodes: state.permissions }),
  hasPermission: (_ctx: unknown, key: string) => state.permissions.includes(key),
  assertAccountActive: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: state.from }) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect, notFound: state.notFound }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/report-center/report-run-page", () => ({ ReportRunPage: () => <p>READY_SYNTHETIC_REPORT</p> }));
vi.mock("@/features/report-center/payroll-finance-report", () => ({ PayrollFinanceReport: () => <p>READY_FINANCE_REPORT</p> }));
vi.mock("@/lib/report-center/report-fetchers", () => ({ REPORT_FETCHERS: { QA_REPORT: state.fetcher } }));
vi.mock("@/lib/report-center/branding-resolver", () => ({ resolveReportBranding: vi.fn() }));
vi.mock("@/lib/report-center/scoped-read-client", () => ({}));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/server/actions/reports/templates", () => ({ listReportTemplates: vi.fn(), listBrandingProfiles: vi.fn() }));

import ReportRunRoutePage from "@/app/(protected)/admin/reports/run/[reportCode]/page";
import { getAuthContext } from "@/lib/rbac/check";
import { runReport } from "@/lib/report-center/report-runner";
import { runReportFetcherPreview } from "@/lib/report-center/preview-runner";
import { getReportRegistryDetail } from "@/server/actions/reports/registry";

const config = { report_code: "QA_REPORT", required_permissions: ["qa.report.view"] };
const route = (reportCode = "qa_report") => ReportRunRoutePage({
  params: Promise.resolve({ reportCode }),
  searchParams: Promise.resolve({ employee_id: "19", label: "A&B" }),
});

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: state.select, eq: state.eq, is: state.is, maybeSingle: state.maybeSingle };
  for (const method of [state.from, state.select, state.eq, state.is]) method.mockReturnValue(query);
  state.maybeSingle.mockResolvedValue({ data: config, error: null });
  state.permissions = ["reports.view", "reports.run", "qa.report.view"];
});

it.each(["returned", "rejected"])("a %s registry failure renders a safe retry on the same report with its filters", async (kind) => {
  if (kind === "returned") state.maybeSingle.mockResolvedValue({ data: null, error: { message: "PRIVATE_BACKEND_DETAIL" } });
  else state.maybeSingle.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DETAIL"));
  const html = renderToStaticMarkup(await route());
  expect(html).toContain('role="alert"');
  expect(html).toContain("Report configuration could not be loaded");
  expect(html).toContain('href="/admin/reports/run/qa_report?employee_id=19&amp;label=A%26B"');
  expect(html).not.toContain("PRIVATE_");
  expect(state.notFound).not.toHaveBeenCalled();
  expect(state.eq).toHaveBeenNthCalledWith(1, "report_code", "QA_REPORT");
  expect(state.eq).toHaveBeenNthCalledWith(2, "is_active", true);
  expect(state.is).toHaveBeenCalledWith("deleted_at", null);
});

it("a successful absence still returns not-found and the admitted registry row loads the report", async () => {
  state.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(route()).rejects.toThrow("NOT_FOUND");
  expect(renderToStaticMarkup(await route())).toContain("READY_SYNTHETIC_REPORT");
});

it("keeps general and per-report denial, and the existing finance admission", async () => {
  state.permissions = [];
  await expect(route()).rejects.toThrow("REDIRECT:/admin/reports");
  expect(state.from).not.toHaveBeenCalled();
  state.permissions = ["reports.run"];
  await expect(route()).rejects.toThrow("REDIRECT:/admin/reports");
  state.maybeSingle.mockResolvedValue({ data: { ...config, report_code: "FIN_PAYROLL_RECONCILIATION" }, error: null });
  state.permissions = ["reports.view", "reports.run"];
  await expect(route("FIN_PAYROLL_RECONCILIATION")).rejects.toThrow("REDIRECT:/admin/reports");
  state.permissions.push("hr.payroll.finance.reconcile");
  expect(renderToStaticMarkup(await route("FIN_PAYROLL_RECONCILIATION"))).toContain("READY_FINANCE_REPORT");
});

it.each(["returned", "rejected"])("screen run and preview report a %s lookup failure safely before a fetcher", async (kind) => {
  if (kind === "returned") state.maybeSingle.mockResolvedValue({ data: null, error: { message: "PRIVATE_BACKEND_DETAIL" } });
  else state.maybeSingle.mockRejectedValue(new Error("PRIVATE_TRANSPORT_DETAIL"));
  const actor = await getAuthContext();
  const run = await runReport({ reportCode: "QA_REPORT", requestedByUserId: 7, outputFormat: "screen" }, actor);
  const preview = await runReportFetcherPreview({ reportCode: "QA_REPORT", permissionCodes: [] });
  const detail = await getReportRegistryDetail("QA_REPORT");
  for (const result of [run, preview, detail]) {
    expect(result).toMatchObject({ success: false, error: "Report configuration could not be loaded. Retry the request." });
  }
  expect(state.fetcher).not.toHaveBeenCalled();
});

it("screen run and preview identify an admitted but missing active configuration", async () => {
  state.maybeSingle.mockResolvedValue({ data: null, error: null });
  const actor = await getAuthContext();
  expect((await runReport({ reportCode: "QA_REPORT", requestedByUserId: 7, outputFormat: "screen" }, actor)).error).toMatch(/not found/);
  expect((await runReportFetcherPreview({ reportCode: "QA_REPORT", permissionCodes: [] })).error).toMatch(/not found/);
  expect(state.fetcher).not.toHaveBeenCalled();
});
