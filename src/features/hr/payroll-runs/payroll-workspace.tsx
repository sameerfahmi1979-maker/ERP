import Link from "next/link";
import type { ReactNode } from "react";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate, formatBusinessDate, formatDubaiPunch } from "@/lib/dubai-calendar";
import {
  payrollQuery, payrollRunsPath, type PayrollLine, type PayrollScope, type PayrollWorkspaceData,
} from "@/lib/hr/payroll/run-contract";
import { listPayrollRunScopes, readPayrollRun } from "@/server/actions/hr/payroll-runs";
import {
  PayrollAdjustmentFields, PayrollCommandForm, PayrollRuleFields, payrollSelectClass,
} from "./payroll-command-form";

type Params = Record<string, string | string[] | undefined>;
type Draft = NonNullable<PayrollWorkspaceData["version"]>;
type Detail = NonNullable<PayrollWorkspaceData["detail"]>;
const payrollMonthFormat = new Intl.DateTimeFormat("en-AE", { timeZone: "UTC", month: "long", year: "numeric" });
const cutoffFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const groupedDigits = new Intl.NumberFormat("en-AE");
const lineLabels: Record<string, string> = {
  basic: "Basic salary",
  "salary-component": "Salary component",
  "salary-deduction": "Salary deduction",
  absence: "Verified absence",
  "unpaid-leave": "Unpaid leave",
  "paid-leave": "Paid leave",
  "sick-leave": "Sick leave",
  "fleet-overtime": "Fleet overtime",
  "trip-allowance": "Loaded trip allowance",
  "trip-allowance-adjustment": "Trip allowance correction",
  "workshop-overtime": "Workshop overtime",
  "workshop-correction": "Workshop overtime correction",
  recovery: "Employee recovery",
  "recovery-deduction": "Employee recovery",
  "recovery-refund": "Recovery refund",
  adjustment: "Documented adjustment",
};
const amountFacts = [
  ["monthly_rate", "Monthly wage basis"],
  ["proposal_amount", "Proposed recovery"],
  ["wage_cap", "Wage limit"],
  ["group_headroom", "Available deduction headroom"],
] as const;

function label(value: string) {
  return value.replaceAll("-", " ").replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

function lineLabel(line: PayrollLine) {
  return lineLabels[line.category] ?? label(line.category);
}

function displayMoney(value: string | null, currency?: string | null) {
  if (value === null) return "—";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return (currency ? currency + " " : "") + value;
  const [, sign, integer, decimal = ""] = match;
  return (currency ? currency + " " : "") + sign + groupedDigits.format(BigInt(integer)) + "." + decimal.padEnd(2, "0");
}

function scopeValue(scope: PayrollScope) {
  return scope.company_id + "." + scope.branch_id;
}

function routeHref(scope: PayrollScope, month: string, options: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams({ company: String(scope.company_id), branch: String(scope.branch_id), month });
  for (const [key, value] of Object.entries(options)) {
    if (value != null) params.set(key, String(value));
  }
  return payrollRunsPath + "?" + params;
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function requestedId(value: string | string[] | undefined) {
  if (value === undefined) return undefined;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rounded-lg border bg-card px-4 py-3">
    <summary className="cursor-pointer text-sm font-medium">{title}</summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>;
}

function ScopeSelector({ choices, scope, month }: { choices: PayrollScope[]; scope?: PayrollScope; month: string }) {
  return <form method="get" action={payrollRunsPath} className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(13rem,2fr)_minmax(10rem,1fr)_auto]">
    <label className="grid gap-1.5 text-sm font-medium">Employer and branch
      <select name="scope" className={payrollSelectClass} defaultValue={scope ? scopeValue(scope) : ""} required>
        <option value="" disabled>Select a branch</option>
        {choices.map(item => <option key={scopeValue(item)} value={scopeValue(item)}>{item.company} · {item.branch}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Payroll month
      <Input name="month" type="month" defaultValue={month} required />
    </label>
    <Button type="submit" variant="outline">Load payroll</Button>
  </form>;
}

function DraftOverview({ scope, month, workspace, latest }: {
  scope: PayrollScope; month: string; workspace: PayrollWorkspaceData; latest: boolean;
}) {
  const version = workspace.version;
  const monthLabel = payrollMonthFormat.format(new Date(month + "-01T00:00:00Z"));
  return <section aria-label="Draft payroll" className="space-y-4">
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{monthLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{scope.company} · {scope.branch}</p>
        </div>
        {version && <span className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary">Draft version {version.number}</span>}
      </header>
      {version ? <>
        <p className="my-4 text-sm text-muted-foreground">
          Cutoff <time dateTime={version.cutoff}>{cutoffFormat.format(new Date(version.cutoff))} Dubai time</time>
          {" · "}{version.exception_count} {version.exception_count === 1 ? "exception" : "exceptions"}
        </p>
        {version.totals.length > 0 && <div className="space-y-3">
          {version.totals.map(total => <section key={total.currency} aria-label={total.currency + " payroll totals"} className="overflow-hidden rounded-md border">
            <div className="flex justify-between border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>{total.currency}</span><span>{total.employees} {total.employees === 1 ? "employee" : "employees"}</span>
            </div>
            <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-3 sm:p-4"><dt className="text-sm text-muted-foreground">Gross pay</dt><dd className="text-lg font-semibold tabular-nums">{displayMoney(total.gross)}</dd></div>
              <div className="p-3 sm:p-4"><dt className="text-sm text-muted-foreground">Deductions</dt><dd className="text-lg font-semibold tabular-nums">{displayMoney(total.deductions)}</dd></div>
              <div className="border-l-2 border-l-primary bg-primary/5 p-3 sm:p-4"><dt className="text-sm font-medium text-primary">Net pay</dt><dd className="text-lg font-semibold tabular-nums">{displayMoney(total.net)}</dd></div>
            </dl>
          </section>)}
        </div>}
        {version.exception_count > 0 && <p className="mt-3 text-sm text-muted-foreground">Totals include employee results ready for review. Held results appear with their exceptions below.</p>}
      </> : <p className="mt-4 text-sm text-muted-foreground">This month has no saved payroll draft.</p>}
    </div>
    {!latest && <p className="rounded-md border px-4 py-3 text-sm">
      You are reviewing an earlier version. <Link className="font-medium text-primary underline" href={routeHref(scope, month)}>Open the latest draft</Link>.
    </p>}
    {workspace.can_calculate && latest && <InfoPanel title={version ? "Calculate a new draft version" : "Calculate payroll draft"}>
      <PayrollCommandForm key={version?.id ?? "new"} action="calculate" company={scope.company_id} branch={scope.branch_id}
        label={version ? "Save new draft version" : "Calculate draft"} returnTo={routeHref(scope, month)}>
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="expected_version" value={version?.id ?? ""} />
        {version ? <>
          <input type="hidden" name="cutoff" value={version.cutoff} />
          <p className="text-sm text-muted-foreground">
            This draft keeps the saved cutoff of {cutoffFormat.format(new Date(version.cutoff))} Dubai time. It can include separately verified adjustments.
          </p>
        </> : <>
          <label className="grid gap-1.5 text-sm font-medium sm:max-w-80">Evidence cutoff (Dubai time)
            <Input name="cutoff" type="datetime-local" required />
          </label>
          <p className="text-sm text-muted-foreground">The first draft saves this cutoff for the payroll month. Verified earnings received later carry forward for review.</p>
        </>}
      </PayrollCommandForm>
    </InfoPanel>}
    {workspace.versions.length > 0 && <InfoPanel title="Draft history">
      <ul className="divide-y">
        {workspace.versions.map(item => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <Link href={routeHref(scope, month, { version: item.id })} className="font-medium text-primary underline"
            aria-current={item.id === version?.id ? "page" : undefined}>Version {item.number}</Link>
          <span className="text-muted-foreground">Cutoff {cutoffFormat.format(new Date(item.cutoff))} Dubai time</span>
        </li>)}
      </ul>
      {version && <p className="break-all text-xs text-muted-foreground">Input fingerprint {version.digest}</p>}
    </InfoPanel>}
  </section>;
}

function EmployeeRegister({ scope, month, workspace, before }: {
  scope: PayrollScope; month: string; workspace: PayrollWorkspaceData; before?: number;
}) {
  const version = workspace.version;
  if (!version) return null;
  return <section aria-labelledby="payroll-employees" className="space-y-3">
    <h2 id="payroll-employees" className="text-lg font-semibold">Employee results</h2>
    {workspace.employees.length === 0 ? <p className="text-sm text-muted-foreground">There are no employee results on this page.</p> :
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[43rem] text-sm">
          <caption className="sr-only">Employee results for draft version {version.number}</caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Employee</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Gross</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Deductions</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Net</th>
              <th scope="col" className="px-4 py-2.5 text-left font-medium">Review</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {workspace.employees.map(employee => <tr key={employee.id} className={workspace.detail?.id === employee.id ? "bg-primary/5" : undefined}>
              <th scope="row" className="px-4 py-3 text-left font-medium">
                <Link className="text-primary underline underline-offset-2" href={routeHref(scope, month, { version: version.id, employee: employee.id, before }) + "#employee-explanation"}
                  aria-current={workspace.detail?.id === employee.id ? "page" : undefined}>{employee.name}</Link>
              </th>
              <td className="px-3 py-3 text-right tabular-nums">{displayMoney(employee.currency ? employee.gross : null, employee.currency)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{displayMoney(employee.currency ? employee.deductions : null, employee.currency)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">{displayMoney(employee.currency ? employee.net : null, employee.currency)}</td>
              <td className="px-4 py-3">
                <span>{label(employee.state)}</span>
                {employee.exception_count > 0 && <span className="ml-1 text-muted-foreground">· {employee.exception_count} {employee.exception_count === 1 ? "exception" : "exceptions"}</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>}
    {(before !== undefined || workspace.next_before !== null) && <nav aria-label="Employee results pages" className="flex flex-wrap gap-4 text-sm">
      {before !== undefined && <Link className="text-primary underline" href={routeHref(scope, month, { version: version.id })}>First page</Link>}
      {workspace.next_before !== null && <Link className="text-primary underline" href={routeHref(scope, month, {
        version: version.id, before: workspace.next_before,
      })}>Next employees</Link>}
    </nav>}
  </section>;
}

function sourceLink(line: PayrollLine, scope: PayrollScope, month: string) {
  const company = String(scope.company_id);
  const branch = String(scope.branch_id);
  if (line.category === "basic" || line.category.startsWith("salary-")) return { label: "Open salaries", href: "/admin/hr/payroll/salaries" };
  if (line.category === "absence") return { label: "Open attendance", href: "/admin/hr/time/attendance" };
  if (line.category.endsWith("-leave")) return { label: "Open leave requests", href: "/admin/hr/time/leave" };
  if (line.category === "fleet-overtime") return {
    label: "Open Fleet overtime", href: "/admin/hr/payroll/fleet-time?" + new URLSearchParams({ company, day: line.original_on }),
  };
  if (line.category.startsWith("trip-allowance")) return {
    label: "Open trip allowances", href: "/admin/hr/payroll/trip-allowances?" + new URLSearchParams({ company }),
  };
  if (line.category.startsWith("workshop-")) return {
    label: "Open Workshop overtime", href: "/admin/hr/payroll/workshop?" + new URLSearchParams({ branch, through: line.original_on }),
  };
  if (line.category.startsWith("recovery")) {
    const reference = line.source.case;
    const caseId = typeof reference === "number" && Number.isSafeInteger(reference) && reference > 0 ? String(reference) : null;
    return {
      label: caseId ? "Open recovery case" : "Open recoveries",
      href: "/admin/hr/operations/recoveries?" + new URLSearchParams({ branch, month, ...(caseId ? { case: caseId } : {}) }),
    };
  }
  return null;
}

function PayrollBasis({ line }: { line: PayrollLine }) {
  const details: [name: string, value: string][] = [];
  for (const [key, name] of amountFacts) {
    const value = line.source[key];
    if (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) {
      details.push([name, displayMoney(String(value), line.currency)]);
    }
  }
  const divisor = line.source.proration_divisor;
  if (typeof divisor === "number" && Number.isFinite(divisor) && divisor > 0) {
    details.push(["Proration days", String(divisor)]);
  }
  return details.length > 0 && <details className="text-sm">
    <summary className="cursor-pointer text-primary">View calculation basis</summary>
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
      {details.map(([name, value]) => <div key={name}>
        <dt className="text-xs text-muted-foreground">{name}</dt><dd className="tabular-nums">{value}</dd>
      </div>)}
    </dl>
  </details>;
}

function PayrollLineDetails({ line, scope, month }: { line: PayrollLine; scope: PayrollScope; month: string }) {
  const link = sourceLink(line, scope, month);
  const late = line.available_at && formatDubaiPunch(line.available_at).slice(0, 7) > line.original_on.slice(0, 7) &&
    line.original_on.slice(0, 7) < month;
  return <li className="space-y-2 p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-1.5">
      <div>
        <h4 className="font-medium">{lineLabel(line)}</h4>
        <p className="text-sm text-muted-foreground">{line.reason}</p>
      </div>
      <span className="whitespace-nowrap font-semibold tabular-nums">
        {line.kind === "deduction" ? "−" : "+"}{displayMoney(line.amount, line.currency)}
      </span>
    </div>
    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <div><dt className="text-xs text-muted-foreground">Original date</dt><dd>{formatBusinessDate(line.original_on)}</dd></div>
      {line.quantity !== null && <div><dt className="text-xs text-muted-foreground">Quantity</dt><dd className="tabular-nums">{line.quantity}{line.unit ? " " + line.unit : ""}</dd></div>}
      {line.rate !== null && <div><dt className="text-xs text-muted-foreground">Rate</dt><dd className="tabular-nums">{displayMoney(line.rate, line.currency)}</dd></div>}
      {line.available_at && <div>
        <dt className="text-xs text-muted-foreground">{late ? "Late input available from" : "Available from"}</dt>
        <dd>{cutoffFormat.format(new Date(line.available_at))} Dubai time</dd>
      </div>}
    </dl>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="break-all">Source {line.key}</span>
      {link && <Link className="text-primary underline" href={link.href}>{link.label}</Link>}
    </div>
    <PayrollBasis line={line} />
  </li>;
}

function AdjustmentReview({ workspace, scope, month, detail, version, latest }: {
  workspace: PayrollWorkspaceData; scope: PayrollScope; month: string; detail: Detail; version: Draft; latest: boolean;
}) {
  const formScope = { company: scope.company_id, branch: scope.branch_id };
  const adjustments = workspace.adjustments.filter(item => item.employee_id === detail.id);
  const sourceChoices = detail.lines.filter(line => line.category !== "adjustment").map(line => ({
    key: line.key, currency: line.currency, label: lineLabel(line) + " · " + formatBusinessDate(line.original_on) + " · " + displayMoney(line.amount, line.currency),
  }));
  return <div className="space-y-3">
    {adjustments.map(item => <InfoPanel key={item.id} title={label(item.kind) + " adjustment · " + displayMoney(item.amount, item.currency) + " · " + label(item.status)}>
      <p className="text-sm">{item.reason}</p>
      <p className="break-all text-sm text-muted-foreground">Source {item.source_key}</p>
      {workspace.can_calculate && latest && item.status === "pending" && <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
        <PayrollCommandForm {...formScope} action="verify-adjustment" label="Verify adjustment">
          <input type="hidden" name="adjustment" value={item.id} />
        </PayrollCommandForm>
        <PayrollCommandForm {...formScope} action="reject-adjustment" label="Reject adjustment" variant="outline">
          <input type="hidden" name="adjustment" value={item.id} />
        </PayrollCommandForm>
      </div>}
    </InfoPanel>)}
    {workspace.can_calculate && latest && sourceChoices.length > 0 && <InfoPanel title="Propose a documented adjustment">
      {workspace.evidence.length === 0 ? <p className="text-sm text-muted-foreground">Save and verify the adjustment evidence in Documents first.</p> :
      <PayrollCommandForm {...formScope} action="prepare-adjustment" label="Save adjustment for review">
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="employee" value={detail.id} />
        <input type="hidden" name="version" value={version.id} />
        <PayrollAdjustmentFields choices={sourceChoices} evidence={workspace.evidence} />
      </PayrollCommandForm>}
    </InfoPanel>}
  </div>;
}

function EmployeeExplanation({ scope, month, workspace, latest }: {
  scope: PayrollScope; month: string; workspace: PayrollWorkspaceData; latest: boolean;
}) {
  const { detail, version } = workspace;
  if (!detail || !version) return null;
  return <section id="employee-explanation" aria-labelledby="employee-explanation-title" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
    <header>
      <h2 id="employee-explanation-title" className="text-lg font-semibold">{detail.name}</h2>
      <p className="text-sm text-muted-foreground">Draft version {version.number} · Payroll lines and exceptions</p>
    </header>
    {detail.exceptions.length > 0 && <section aria-label="Payroll exceptions" className="space-y-2">
      <h3 className="text-sm font-semibold">Exceptions</h3>
      <ul className="space-y-2">
        {detail.exceptions.map((item, index) => <li key={item.code + index} className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className={item.blocking ? "font-medium text-destructive" : "font-medium"}>{item.blocking ? "Requires review" : "For review"} · {label(item.code)}</p>
          <p>{item.reason}</p>
        </li>)}
      </ul>
    </section>}
    {detail.lines.length > 0 ? <ul aria-label="Payroll lines" className="divide-y overflow-hidden rounded-md border">
      {detail.lines.map(line => <PayrollLineDetails key={line.key} line={line} scope={scope} month={month} />)}
    </ul> : <p className="text-sm text-muted-foreground">There are no calculated lines for this employee in this version.</p>}
    <AdjustmentReview workspace={workspace} scope={scope} month={month} detail={detail} version={version} latest={latest} />
  </section>;
}

function PayrollRules({ scope, workspace }: { scope: PayrollScope; workspace: PayrollWorkspaceData }) {
  if (!workspace.can_policy) return null;
  const formScope = { company: scope.company_id, branch: scope.branch_id };
  return <section aria-labelledby="payroll-rules" className="space-y-3">
    <h2 id="payroll-rules" className="text-lg font-semibold">Payroll rules</h2>
    {workspace.rules.map(rule => <InfoPanel key={rule.id}
      title={(workspace.groups.find(group => group.id === rule.group_id)?.name ?? "Branch default") + " · " + (rule.approved_at ? "Approved" : "Pending approval")}>
      <p className="text-sm text-muted-foreground">Effective interval {rule.validity}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Proration</dt><dd>{rule.facts.fixed_days ? rule.facts.fixed_days + " fixed days" : "Calendar days"}</dd></div>
        <div><dt className="text-muted-foreground">Attendance deductions</dt><dd>{rule.facts.absence === "unpaid-only" ? "Unpaid leave only" : "Verified absence and unpaid leave"}</dd></div>
        <div><dt className="text-muted-foreground">Leave wage basis</dt><dd>{label(rule.facts.leave_wage_basis)} salary</dd></div>
        <div><dt className="text-muted-foreground">Daily recovery wage basis</dt><dd>{label(rule.facts.daily_recovery_basis)} salary</dd></div>
        <div><dt className="text-muted-foreground">Maximum recovery share</dt><dd>{rule.facts.recovery_fraction}</dd></div>
        <div><dt className="text-muted-foreground">Minimum net pay</dt><dd>{displayMoney(rule.facts.net_floor)}</dd></div>
      </dl>
      {!rule.approved_at && <PayrollCommandForm {...formScope} action="approve-rule" label="Approve rule">
        <input type="hidden" name="rule" value={rule.id} />
      </PayrollCommandForm>}
    </InfoPanel>)}
    <InfoPanel title="Prepare a dated payroll rule">
      <PayrollCommandForm {...formScope} action="prepare-rule" label="Save rule for approval">
        <PayrollRuleFields groups={workspace.groups} />
      </PayrollCommandForm>
    </InfoPanel>
  </section>;
}

export async function PayrollRunWorkspace({ params }: { params: Params }) {
  const scopes = await listPayrollRunScopes();
  const selectionRequested = params.scope !== undefined || params.company !== undefined || params.branch !== undefined;
  const matchingScope = params.scope === undefined ? single(params.company) + "." + single(params.branch) : single(params.scope);
  const scope = selectionRequested
    ? scopes?.find(item => scopeValue(item) === matchingScope)
    : scopes?.length === 1 ? scopes[0] : undefined;
  const submittedMonth = single(params.month)?.replace(/-01$/, "");
  const currentMonth = dubaiBusinessDate().slice(0, 7);
  const validMonth = submittedMonth !== undefined && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(submittedMonth);
  const invalidMonth = params.month !== undefined && !validMonth;
  const month = validMonth ? submittedMonth : currentMonth;
  const query = payrollQuery.safeParse({
    company: scope?.company_id,
    branch: scope?.branch_id,
    month: invalidMonth ? undefined : month + "-01",
    version: params.version,
    employee: requestedId(params.employee),
    before: requestedId(params.before),
  });
  const workspace = query.success ? await readPayrollRun(query.data) : null;
  const version = workspace?.version;
  const latest = !version || !workspace?.versions.some(item => item.number > version.number);

  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-8">
    <ERPPageHeader title="Payroll runs" breadcrumbs={[
      { label: "Payroll & WPS", href: "/admin/hr/payroll" }, { label: "Payroll runs" },
    ]} />
    {scopes === null && <p role="alert" className="rounded-lg border p-4 text-sm">Payroll access could not be loaded. Refresh the page or sign in again.</p>}
    {scopes?.length === 0 && <p className="rounded-lg border p-4 text-sm">Payroll runs require an assigned employer and branch.</p>}
    {scopes && scopes.length > 0 && <ScopeSelector choices={scopes} scope={scope} month={month} />}
    {scopes && scopes.length > 0 && selectionRequested && !scope && <p role="alert" className="rounded-lg border p-4 text-sm">
      Choose an employer and branch from the available list.
    </p>}
    {scope && invalidMonth && <p role="alert" className="rounded-lg border p-4 text-sm">Choose a valid payroll month.</p>}
    {scope && !workspace && !invalidMonth && <p role="alert" className="rounded-lg border p-4 text-sm">
      The selected payroll could not be loaded. <Link href={routeHref(scope, month)} className="text-primary underline">Reload this month</Link>.
    </p>}
    {scope && workspace && <>
      {(workspace.can_calculate || workspace.version || !workspace.can_policy) && <DraftOverview scope={scope} month={month} workspace={workspace} latest={latest} />}
      <EmployeeRegister scope={scope} month={month} workspace={workspace} before={query.success ? query.data.before : undefined} />
      <EmployeeExplanation scope={scope} month={month} workspace={workspace} latest={latest} />
      <PayrollRules scope={scope} workspace={workspace} />
    </>}
  </main>;
}
