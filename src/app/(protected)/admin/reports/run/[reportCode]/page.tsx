import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { LoadError } from "@/components/erp/load-error";
import { ReportRunPage } from "@/features/report-center/report-run-page";
import { PayrollFinanceReport } from "@/features/report-center/payroll-finance-report";
import { PAYROLL_FINANCE_REPORT } from "@/lib/report-center/payroll-finance-contract";
import { readActiveReportRegistryEntry } from "@/server/reads/report-registry-entry";

type Props = {
  params: Promise<{ reportCode: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ReportRunRoutePage({ params, searchParams }: Props) {
  const { reportCode } = await params;
  const sp = await searchParams;

  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.run")) {
    redirect("/admin/reports");
  }

  const registry = await readActiveReportRegistryEntry(reportCode.toUpperCase());
  if (registry.state === "failed") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === "string") query.append(key, value);
    }
    const params = query.toString();
    const retryHref = `/admin/reports/run/${encodeURIComponent(reportCode)}${params ? `?${params}` : ""}`;
    return <LoadError title="Report configuration" retryHref={retryHref} />;
  }
  if (registry.state === "missing") notFound();
  const registryEntry = registry.entry;

  if (registryEntry.report_code === PAYROLL_FINANCE_REPORT) {
    if (!["reports.view", "reports.run", "hr.payroll.finance.reconcile"].every(code => hasPermission(ctx, code))) {
      redirect("/admin/reports");
    }
    return <PayrollFinanceReport actor={ctx} params={sp} />;
  }

  // Check that the user has at least one required permission
  const hasReportPermission = registryEntry.required_permissions.length === 0
    || registryEntry.required_permissions.some((p) => hasPermission(ctx, p));

  if (!hasReportPermission) {
    redirect("/admin/reports");
  }

  // Extract initial filters from search params (e.g. ?employee_id=123)
  const initialFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (value && value !== "") {
      initialFilters[key] = value;
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-0">
      <ReportRunPage
        authContext={ctx}
        registryEntry={registryEntry}
        initialFilters={initialFilters}
      />
    </div>
  );
}
