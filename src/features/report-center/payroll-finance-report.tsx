import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthContext } from "@/lib/rbac/check";
import { PAYROLL_FINANCE_REPORT, payrollFinanceFilters } from "@/lib/report-center/payroll-finance-contract";
import { runReport } from "@/lib/report-center/report-runner";
import { listPayrollFinanceScopes } from "@/server/actions/reports/hr/payroll-finance-reconciliation";

const totals = [
  ["currency", "Currency"],
  ["approved_gross", "Approved gross"],
  ["approved_deductions", "Approved deductions"],
  ["approved_net", "Approved net"],
  ["verified_cash", "Verified cash"],
  ["reconciled_cash", "Reconciled cash"],
  ["applied_wages", "Applied wages"],
  ["applied_deductions", "Applied deductions"],
  ["unallocated_cash", "Unallocated cash"],
  ["outstanding_cash", "Outstanding cash"],
  ["outstanding_deductions", "Outstanding deductions"],
  ["unexplained_difference", "Unexplained difference"],
] as const;

const settlement = [
  ["currency", "Currency"],
  ["employee_count", "Employee payroll results"],
  ["reconciled_count", "Reconciled"],
  ["unsettled_count", "Unsettled"],
  ["partial_count", "Partial"],
  ["pending_count", "Pending"],
  ["rejected_count", "Rejected"],
  ["reversed_count", "Reversed"],
  ["paid_unallocated_count", "Paid, awaiting allocation"],
  ["recovery_approved", "Recovery approved"],
  ["recovery_applied", "Recovery applied"],
  ["recovery_outstanding", "Recovery remaining"],
  ["recovery_refund_approved", "Refunds approved"],
  ["recovery_refund_applied", "Refunds applied"],
] as const;

const components = [
  ["currency", "Currency"],
  ["kind", "Entry type"],
  ["category", "Category"],
  ["component_code", "Component code"],
  ["component_name", "Component at approval"],
  ["work_month", "Prior work month"],
  ["approved", "Approved"],
  ["applied", "Applied"],
] as const;

const wpsTotals = [
  ["currency", "Currency"],
  ["wps_current_total", "Current file total"],
  ["wps_accepted_total", "Accepted file total"],
] as const;

const files = [
  ["currency", "Currency"],
  ["branch", "Branch"],
  ["file_reference", "Retained WPS file"],
  ["approval_version", "Payroll version"],
  ["scope", "File scope"],
  ["state", "Bank state"],
  ["row_count", "File rows"],
  ["file_total", "File total"],
] as const;

function formatCell(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  return typeof value === "string" && /^-?\d+\.\d{2}$/.test(value)
    ? value.replace(/\B(?=(\d{3})+\.)/g, ",")
    : value;
}

function ReconciliationTable({ title, columns, rows }: {
  title: string;
  columns: ReadonlyArray<readonly [string, string]>;
  rows: Record<string, unknown>[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="rounded-md border bg-card">
      <h2 className="border-b px-3 py-2 text-sm font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label={title}>
          <thead className="bg-muted/50">
            <tr>{columns.map(([key, heading]) => (
              <th key={key} scope="col" className="px-3 py-2 font-medium">{heading}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t">
                {columns.map(([key]) => (
                  <td key={key} className="whitespace-nowrap px-3 py-2 tabular-nums">{formatCell(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export async function PayrollFinanceReport({ actor, params }: {
  actor: AuthContext;
  params: Record<string, string | undefined>;
}) {
  const requestedScope = typeof params.scope === "string" ? params.scope : (
    typeof params.owner_company_id === "string" && typeof params.branch_id === "string"
      ? params.owner_company_id + ":" + params.branch_id : ""
  );
  const [company, branch] = requestedScope.split(":");
  const requested = payrollFinanceFilters.safeParse({
    owner_company_id: company,
    branch_id: branch === "all" ? null : branch,
    payroll_month: params.month ?? params.payroll_month,
  });

  let scopes: Awaited<ReturnType<typeof listPayrollFinanceScopes>> = [];
  let scopeError = false;
  try {
    scopes = await listPayrollFinanceScopes();
  } catch {
    scopeError = true;
  }
  const selection = scopes.find(scope => scope.company_id + ":" + (scope.branch_id ?? "all") === requestedScope);
  const report = selection && requested.success && actor.profile
    ? await runReport({
      reportCode: PAYROLL_FINANCE_REPORT,
      outputFormat: "screen",
      filters: requested.data,
      ownerCompanyIds: [selection.company_id],
      requestedByUserId: actor.profile.id,
    }, actor).catch(() => null)
    : undefined;
  const ran = report !== undefined;
  const rows = report?.success ? report.data?.rows ?? [] : [];
  const currencyRows = rows.filter(row => row.section === "total");
  const componentRows = rows.filter(row => row.section === "component");
  const wpsRows = rows.filter(row => row.section === "wps");
  const outputMessage = scopeError ? "Permitted payroll scopes could not be loaded. Reload this report."
    : !scopes.length ? "You do not have Finance reconciliation access to an employer and branch."
    : requestedScope && !selection ? "Choose an employer and branch from the permitted list."
    : selection && !requested.success ? "Choose a payroll month."
    : ran && !report?.success ? "The approved payroll and settlement records could not be reconciled. Reload the report to retry."
    : ran && !rows.length ? "There is no GM-approved payroll for this employer, branch and month."
    : null;

  return (
    <div className="space-y-4 p-6">
      <ERPPageHeader
        title="Payroll Reconciliation"
        description="Compare GM-approved payroll with verified cash and applied wages and deductions."
        breadcrumbs={[{ label: "Report Center", href: "/admin/reports" }, { label: "Payroll Reconciliation" }]}
      />
      {scopes.length > 0 && (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Employer and branch
            <select
              name="scope"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              defaultValue={selection ? requestedScope : ""}
              required
            >
              <option value="" disabled>Choose an employer and branch</option>
              {scopes.map(item => (
                <option key={item.company_id + ":" + (item.branch_id ?? "all")} value={item.company_id + ":" + (item.branch_id ?? "all")}>
                  {item.company} · {item.branch}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Payroll month
            <Input name="month" type="month" defaultValue={requested.success ? requested.data.payroll_month : undefined} required />
          </label>
          <Button type="submit">Run report</Button>
        </form>
      )}
      {outputMessage && <p role={scopeError || ran && !report?.success ? "alert" : "status"} className="rounded-md border p-3 text-sm">{outputMessage}</p>}
      {scopeError && <Link className="text-sm font-medium underline" href={"/admin/reports/run/" + PAYROLL_FINANCE_REPORT}>Reload scopes</Link>}
      {report?.success && selection && requested.success && (
        <p className="text-sm font-medium">{selection.company} · {selection.branch} · {requested.data.payroll_month}</p>
      )}
      <ReconciliationTable title="Payroll totals by currency" columns={totals} rows={currencyRows} />
      <ReconciliationTable title="Settlement and recoveries" columns={settlement} rows={currencyRows} />
      <ReconciliationTable title="Payroll components" columns={components} rows={componentRows} />
      <ReconciliationTable title="WPS control totals" columns={wpsTotals} rows={currencyRows} />
      <ReconciliationTable title="Retained WPS file history" columns={files} rows={wpsRows} />
    </div>
  );
}

