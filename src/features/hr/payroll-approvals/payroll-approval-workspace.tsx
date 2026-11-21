import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate, formatBusinessDate } from "@/lib/dubai-calendar";
import {
  payrollApprovalsPath, payrollReviewQuery, type PayrollReviewLine, type PayrollReviewScope, type PayrollReviewWorkspaceData,
} from "@/lib/hr/payroll/approval-contract";
import { payrollRunsPath } from "@/lib/hr/payroll/run-contract";
import { getAuthContext, hasPermissionInScope } from "@/lib/rbac/check";
import { listPayrollReviewScopes, readPayrollReview } from "@/server/actions/hr/payroll-approvals";
import { listPayrollRunScopes } from "@/server/actions/hr/payroll-runs";
import { PayrollApprovalForm } from "./payroll-approval-form";

type Params = Record<string, string | string[] | undefined>;
type Workspace = PayrollReviewWorkspaceData;
type Review = NonNullable<Workspace["review"]>;
type Snapshot = Review | NonNullable<Workspace["draft"]>;
type Selection = { scope: PayrollReviewScope; month: string; review?: string; employee?: number; before?: number };

const moment = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const monthName = new Intl.DateTimeFormat("en-AE", { timeZone: "UTC", month: "long", year: "numeric" });
const numberGroups = new Intl.NumberFormat("en-AE");
const linkClass = "text-primary underline underline-offset-2";
const stateColors: Record<string, string> = {
  submitted: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  approved: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "border-destructive/30 bg-destructive/5 text-destructive",
};
const lineNames: Record<string, string> = {
  basic: "Basic salary", "salary-component": "Salary component", "salary-deduction": "Salary deduction",
  absence: "Verified absence", "unpaid-leave": "Unpaid leave", "paid-leave": "Paid leave", "sick-leave": "Sick leave",
  "fleet-overtime": "Fleet overtime", "trip-allowance": "Loaded trip allowance", "trip-allowance-adjustment": "Trip allowance correction",
  "workshop-overtime": "Workshop overtime", "workshop-correction": "Workshop overtime correction", recovery: "Employee recovery",
  "recovery-deduction": "Employee recovery", "recovery-refund": "Recovery refund", adjustment: "Documented adjustment",
};

function title(value: string) {
  const words = value.replaceAll("-", " ").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function amount(value: string | null, currency?: string | null) {
  if (value === null) return "—";
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!parts) return value;
  const [, sign, whole, fraction = ""] = parts;
  return (currency ? currency + " " : "") + sign + numberGroups.format(BigInt(whole)) + "." + fraction.padEnd(2, "0");
}

function one(input: Params[string]) {
  return typeof input === "string" ? input : undefined;
}

function optionalId(input: Params[string]) {
  if (input === undefined) return undefined;
  return typeof input === "string" && /^[1-9]\d*$/.test(input) ? Number(input) : NaN;
}

function scopeKey(scope: PayrollReviewScope) {
  return scope.company_id + "." + scope.branch_id;
}

function reviewHref({ scope, month, review, employee, before }: Selection, section?: string) {
  const params = new URLSearchParams({ company: String(scope.company_id), branch: String(scope.branch_id), month });
  if (review !== undefined) params.set("review", review);
  if (employee !== undefined) params.set("employee", String(employee));
  if (before !== undefined) params.set("before", String(before));
  return payrollApprovalsPath + "?" + params + (section ? "#" + section : "");
}

function State({ state }: { state: string }) {
  return <span className={"inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium " +
    (stateColors[state] ?? "bg-muted text-muted-foreground")}>{title(state)}</span>;
}

function When({ value }: { value: string }) {
  return <time dateTime={value}>{moment.format(new Date(value))}</time>;
}

function Selector({ scopes, scope, month }: { scopes: PayrollReviewScope[]; scope?: PayrollReviewScope; month: string }) {
  return <form method="get" action={payrollApprovalsPath}
    className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(13rem,2fr)_minmax(10rem,1fr)_auto]">
    <label className="grid gap-1.5 text-sm font-medium">Employer and branch
      <select name="scope" className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm"
        required defaultValue={scope ? scopeKey(scope) : ""}>
        <option value="" disabled>Select a branch</option>
        {scopes.map(item => <option key={scopeKey(item)} value={scopeKey(item)}>{item.company} · {item.branch}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Payroll month
      <Input name="month" type="month" defaultValue={month} required />
    </label>
    <Button type="submit" variant="outline">Load approvals</Button>
  </form>;
}

function Versions({ selection, workspace, draft }: { selection: Selection; workspace: Workspace; draft: Workspace["draft"] }) {
  const month = monthName.format(new Date(selection.month + "-01T00:00:00Z"));
  const active = "border-primary bg-primary/5";
  const versionLink = "flex min-w-48 flex-1 items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary";
  return <nav aria-label={month + " payroll versions"} className="flex flex-wrap gap-2">
    {draft && <Link aria-current={!selection.review ? "page" : undefined}
      className={versionLink + (!selection.review ? " " + active : "")}
      href={reviewHref({ scope: selection.scope, month: selection.month }, "payroll-snapshot")}>
      <span className="font-medium">Current draft · Version {draft.number}</span><State state="draft" />
    </Link>}
    {workspace.reviews.map(review => <Link key={review.id}
      aria-current={review.id === selection.review ? "page" : undefined}
      className={versionLink + (review.id === selection.review ? " " + active : "")}
      href={reviewHref({ scope: selection.scope, month: selection.month, review: review.id }, "payroll-snapshot")}>
      <span><span className="block font-medium">Version {review.number}</span>
        <span className="text-xs text-muted-foreground"><When value={review.submitted_at} /></span></span>
      <State state={review.state} />
    </Link>)}
  </nav>;
}

function Totals({ totals }: { totals: Snapshot["totals"] }) {
  if (!totals.length) return <p className="text-sm text-muted-foreground">There are no ready employee totals on this version.</p>;
  return <div className="space-y-3">
    {totals.map(total => <section key={total.currency} aria-label={total.currency + " payroll totals"} className="rounded-lg border">
      <div className="flex justify-between border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>{total.currency}</span><span>{total.employees} {total.employees === 1 ? "employee" : "employees"}</span>
      </div>
      <dl className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-3"><dt className="text-sm text-muted-foreground">Gross pay</dt><dd className="text-lg font-semibold tabular-nums">{amount(total.gross)}</dd></div>
        <div className="p-3"><dt className="text-sm text-muted-foreground">Deductions</dt><dd className="text-lg font-semibold tabular-nums">{amount(total.deductions)}</dd></div>
        <div className="border-l-2 border-l-primary bg-primary/5 p-3"><dt className="text-sm text-primary">Net pay</dt><dd className="text-lg font-semibold tabular-nums">{amount(total.net)}</dd></div>
      </dl>
    </section>)}
  </div>;
}

function History({ review }: { review: Review }) {
  if (!review.events.length) return null;
  return <section className="rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="payroll-review-history">
    <h2 id="payroll-review-history" className="mb-3 text-base font-semibold">Review history</h2>
    <ol className="divide-y">
      {review.events.map((event, index) => <li key={event.kind + event.date + index} className="py-2 text-sm">
        <p className="flex flex-wrap justify-between gap-2">
          <span className="font-medium">{title(event.kind)}</span>
          <span className="text-xs text-muted-foreground"><When value={event.date} /></span>
        </p>
        {event.reason && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{event.reason}</p>}
      </li>)}
    </ol>
  </section>;
}

function RecoverySchedules({ review }: { review: Review }) {
  const snapshot = review.recovery_schedule_snapshot;
  if (!snapshot) {
    if (!review.recovery_schedule_required) return null;
    return <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
      {review.state === "submitted"
        ? "This submission predates recovery schedule snapshots. Accounts must withdraw it, recalculate and submit a new version."
        : "This version predates complete recovery schedule snapshots."}
    </p>;
  }
  return <section aria-labelledby="payroll-recovery-schedules" className="space-y-2 rounded-md border p-3 text-sm">
    <h3 id="payroll-recovery-schedules" className="font-semibold">Recovery schedules submitted for approval</h3>
    {snapshot.schedules.map(schedule => <section key={schedule.line} className="space-y-2 border-t pt-2">
      <h4 className="font-medium">
        {schedule.mode === "instalments" ? "Instalment" : "One-time"} schedule #{schedule.schedule}
      </h4>
      <p className="text-muted-foreground">Recovery case #{schedule.case} · Employee #{schedule.employee}</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <div><dt className="text-muted-foreground">Schedule principal</dt><dd>{amount(schedule.principal, schedule.currency)}</dd></div>
        <div><dt className="text-muted-foreground">Deduction in this payroll</dt><dd>{amount(schedule.period_deduction, schedule.currency)}</dd></div>
      </dl>
      <ul aria-label="Scheduled amounts" className="divide-y">
        {schedule.instalments.map(item => <li key={item.month} className="flex justify-between gap-3 py-1">
          <time dateTime={item.month}>{monthName.format(new Date(item.month + "T00:00:00Z"))}</time>
          <span className="tabular-nums">{amount(item.amount, schedule.currency)}</span>
        </li>)}
      </ul>
    </section>)}
  </section>;
}

function PinnedSnapshot({ selection, workspace, snapshot }: { selection: Selection; workspace: Workspace; snapshot: Snapshot }) {
  const { scope, month } = selection;
  const review = workspace.review;
  const draft = workspace.draft;
  const actions = review?.actions.filter(action => {
    if (action === "approve" && review.recovery_schedule_required && !review.recovery_schedule_snapshot) return false;
    const accountsAction = action === "withdraw" || action === "request-release";
    return accountsAction ? workspace.can_submit : workspace.can_approve;
  }) ?? [];
  const formScope = { company: scope.company_id, branch: scope.branch_id, version: snapshot.version, digest: snapshot.digest };
  const reasons = snapshot.exception_count;
  const blockers = snapshot.blocking_count;
  const canSubmit = !review && workspace.can_submit && draft?.can_submit && blockers === 0;
  const bankStatus = review?.bank_state;

  return <section id="payroll-snapshot" className="space-y-4 rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="selected-payroll-version">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="selected-payroll-version" className="text-xl font-semibold">Version {snapshot.number}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{scope.company} · {scope.branch}</p>
      </div>
      <State state={review?.state ?? "draft"} />
    </header>
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <div><dt className="text-xs text-muted-foreground">Cutoff · Dubai time</dt><dd><When value={snapshot.cutoff} /></dd></div>
      {review && <>
        <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd><When value={review.submitted_at} /></dd></div>
        {review.submitter_label && <div><dt className="text-xs text-muted-foreground">Accounts reviewer</dt><dd>{review.submitter_label}</dd></div>}
        {review.decision_at && <div><dt className="text-xs text-muted-foreground">Decision recorded</dt><dd><When value={review.decision_at} /></dd></div>}
        {review.approver_label && <div><dt className="text-xs text-muted-foreground">Decision reviewer</dt><dd>{review.approver_label}</dd></div>}
        {review.claims_count > 0 && <div><dt className="text-xs text-muted-foreground">Payroll claims</dt><dd>{review.claims_count}</dd></div>}
        {bankStatus && <div><dt className="text-xs text-muted-foreground">Bank status</dt><dd>{title(bankStatus)}</dd></div>}
      </>}
    </dl>
    <Totals totals={snapshot.totals} />
    {(blockers > 0 || reasons > 0) && <p className={blockers ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
      {blockers > 0 ? blockers + " blocking " + (blockers === 1 ? "exception" : "exceptions") : reasons + " " + (reasons === 1 ? "exception" : "exceptions")}
      {" · Open an employee result to review the details."}
    </p>}
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Version fingerprint</summary>
      <dl className="mt-2 space-y-1 text-xs">
        <div><dt className="text-muted-foreground">Version</dt><dd><code className="break-all">{snapshot.digest}</code></dd></div>
        {snapshot.source_digest && <div><dt className="text-muted-foreground">Source snapshot</dt>
          <dd><code className="break-all">{snapshot.source_digest}</code></dd></div>}
        {snapshot.rule_digest && <div><dt className="text-muted-foreground">Policy snapshot</dt>
          <dd><code className="break-all">{snapshot.rule_digest}</code></dd></div>}
      </dl>
    </details>
    {review && <RecoverySchedules review={review} />}
    {canSubmit && draft && <PayrollApprovalForm key={draft.version} {...formScope} target={{
      actions: ["submit"], run: draft.run, acknowledge: reasons > 0, returnTo: reviewHref({ scope, month }),
    }} />}
    {review && actions.length > 0 && <PayrollApprovalForm key={review.id + review.state + actions.join()} {...formScope}
      target={{ actions, review: review.id, recoveryScheduleDigest: review.recovery_schedule_snapshot?.digest }} />}
  </section>;
}

function Employees({ selection, workspace, snapshot }: { selection: Selection; workspace: Workspace; snapshot: Snapshot }) {
  return <section className="space-y-2" aria-labelledby="payroll-employees">
    <h2 id="payroll-employees" className="text-lg font-semibold">Employee results</h2>
    {workspace.employees.length > 0 ? <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[42rem] text-sm">
        <caption className="sr-only">Employee results for version {snapshot.number}</caption>
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
          {workspace.employees.map(employee => <tr key={employee.id} className={employee.id === workspace.detail?.id ? "bg-primary/5" : undefined}>
            <th scope="row" className="px-4 py-3 text-left font-medium">
              <Link className={linkClass} aria-current={employee.id === workspace.detail?.id ? "page" : undefined}
                href={reviewHref({ ...selection, employee: employee.id }, "payroll-employee-detail")}>{employee.name}</Link>
            </th>
            <td className="px-3 py-3 text-right tabular-nums">{amount(employee.gross, employee.currency)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{amount(employee.deductions, employee.currency)}</td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{amount(employee.net, employee.currency)}</td>
            <td className="px-4 py-3">{title(employee.state)}
              {employee.exception_count > 0 && <span className="text-muted-foreground">
                {" · "}{employee.exception_count} {employee.exception_count === 1 ? "exception" : "exceptions"}
              </span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div> : <p className="text-sm text-muted-foreground">There are no employee results on this page.</p>}
    {(selection.before !== undefined || workspace.next_before !== null) && <nav aria-label="Employee results pages" className="flex gap-4 text-sm">
      {selection.before !== undefined && <Link className={linkClass}
        href={reviewHref({ ...selection, employee: undefined, before: undefined }, "payroll-employees")}>First page</Link>}
      {workspace.next_before !== null && <Link className={linkClass}
        href={reviewHref({ ...selection, employee: undefined, before: workspace.next_before }, "payroll-employees")}>Next employees</Link>}
    </nav>}
  </section>;
}

function Line({ line }: { line: PayrollReviewLine }) {
  const references = [
    ["Payroll rule", line.source.calculation_rule_id ?? line.source.rule],
    ["Recovery case", line.source.case],
    ["Schedule", line.source.schedule],
    ["Adjustment", line.source.adjustment],
  ] as const;
  return <li className="space-y-1.5 px-4 py-3 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-medium">{lineNames[line.category] ?? title(line.category)}</p>
      <p className="tabular-nums">{line.kind === "deduction" ? "−" : ""}{amount(line.amount, line.currency)}</p>
    </div>
    <p className="text-xs text-muted-foreground">
      {formatBusinessDate(line.original_on)}
      {line.quantity !== null && " · " + line.quantity + (line.unit ? " " + line.unit : "")}
      {line.rate !== null && " · Rate " + amount(line.rate, line.currency)}
      {line.available_at && <>{" · Available "}<When value={line.available_at} /></>}
    </p>
    <p className="whitespace-pre-wrap break-words">{line.reason}</p>
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer text-primary">Source references</summary>
      <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <div><dt>Payroll line</dt><dd className="break-all font-mono">{line.key}</dd></div>
        {references.map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </details>
  </li>;
}

function EmployeeDetail({ detail }: { detail: NonNullable<Workspace["detail"]> }) {
  return <section id="payroll-employee-detail" className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="payroll-employee-name">
    <h2 id="payroll-employee-name" className="text-lg font-semibold">{detail.name}</h2>
    {detail.exceptions.length > 0 && <ul aria-label="Payroll exceptions" className="divide-y rounded-md border bg-muted/20">
      {detail.exceptions.map((exception, index) => <li key={exception.code + index} className="space-y-1 p-3 text-sm">
        <p className={exception.blocking ? "font-medium text-destructive" : "font-medium"}>{exception.blocking ? "Blocking exception" : title(exception.code)}</p>
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{exception.reason}</p>
      </li>)}
    </ul>}
    {detail.lines.length > 0 ? <ul aria-label="Exact payroll lines" className="divide-y rounded-md border">
      {detail.lines.map(line => <Line key={line.key} line={line} />)}
    </ul> : <p className="text-sm text-muted-foreground">This employee has no calculated lines on the selected version.</p>}
  </section>;
}

export async function PayrollApprovalWorkspace({ params }: { params: Params }) {
  const scopes = await listPayrollReviewScopes();
  const requested = params.scope !== undefined || params.company !== undefined || params.branch !== undefined;
  const requestedScope = params.scope === undefined ? one(params.company) + "." + one(params.branch) : one(params.scope);
  const scope = requested ? scopes?.find(entry => scopeKey(entry) === requestedScope)
    : scopes?.length === 1 ? scopes[0] : undefined;
  const providedMonth = one(params.month)?.replace(/-01$/, "");
  const month = providedMonth && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(providedMonth)
    ? providedMonth : dubaiBusinessDate().slice(0, 7);
  const invalidMonth = params.month !== undefined && month !== providedMonth;
  const query = payrollReviewQuery.safeParse({
    company: scope?.company_id, branch: scope?.branch_id, month: invalidMonth ? undefined : month + "-01",
    review: params.review, employee: optionalId(params.employee), before: optionalId(params.before),
  });
  const workspace = query.success ? await readPayrollReview(query.data) : null;
  const matched = query.success && workspace && (query.data.review === undefined || workspace.review?.id === query.data.review);
  const selection: Selection | null = scope && query.success && matched ? {
    scope, month, review: workspace?.review?.id, employee: query.data.employee, before: query.data.before,
  } : null;
  const latest = workspace?.draft;
  const draft = latest && !workspace?.reviews.some(review => review.version === latest.version) ? latest : null;
  const snapshot = workspace?.review ?? draft;
  let draftLink: string | undefined;
  if (scope && workspace?.can_submit &&
      hasPermissionInScope(await getAuthContext(), "hr.payroll.run.manage", scope.company_id, scope.branch_id)) {
    const runScopes = await listPayrollRunScopes();
    if (runScopes?.some(entry => entry.company_id === scope.company_id && entry.branch_id === scope.branch_id && entry.can_calculate)) {
      draftLink = payrollRunsPath + "?" + new URLSearchParams({
        company: String(scope.company_id), branch: String(scope.branch_id), month,
      });
    }
  }
  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-8">
    <ERPPageHeader title="Payroll approvals" breadcrumbs={[
      { label: "Payroll & WPS", href: "/admin/hr/payroll" }, { label: "Payroll approvals" },
    ]} actions={draftLink ? <Link className={linkClass + " text-sm"} href={draftLink}>Open Payroll Runs</Link> : undefined} />
    {scopes === null && <p role="alert" className="rounded-lg border p-4 text-sm">Payroll approval access could not be loaded. Refresh or sign in again.</p>}
    {scopes?.length === 0 && <p className="rounded-lg border p-4 text-sm">Payroll approvals require an assigned employer and branch.</p>}
    {scopes && scopes.length > 0 && <Selector scopes={scopes} scope={scope} month={month} />}
    {requested && scopes && scopes.length > 0 && !scope && <p role="alert" className="rounded-lg border p-4 text-sm">
      Choose an employer and branch from the available list.
    </p>}
    {scope && invalidMonth && <p role="alert" className="rounded-lg border p-4 text-sm">Choose a valid payroll month.</p>}
    {scope && !invalidMonth && !selection && <p role="alert" className="rounded-lg border p-4 text-sm">
      The selected payroll version could not be loaded. <Link href={reviewHref({ scope, month })} className={linkClass}>Reload this month</Link>.
    </p>}
    {selection && workspace && <>
      <Versions selection={selection} workspace={workspace} draft={draft} />
      {snapshot ? <>
        <PinnedSnapshot selection={selection} workspace={workspace} snapshot={snapshot} />
        <Employees selection={selection} workspace={workspace} snapshot={snapshot} />
        {workspace.detail && (!selection.employee || workspace.detail.id === selection.employee) && <EmployeeDetail detail={workspace.detail} />}
        {workspace.review && <History review={workspace.review} />}
      </> : <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {workspace.reviews.length ? "Select a submitted version to review its totals and history." : "There are no payroll versions for this branch and month."}
      </p>}
    </>}
  </main>;
}
