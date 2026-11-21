import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import {
  payrollSettlementPath, payrollSettlementQuery, type PayrollSettlementResult,
  type PayrollSettlementReview, type PayrollSettlementScope, type PayrollSettlementWorkspaceData,
} from "@/lib/hr/payroll/settlement-contract";
import { listPayrollSettlementScopes, readPayrollSettlement } from "@/server/actions/hr/payroll-settlement";
import { AllocationForm, HandoffForm, PrepareFiles, RecordPaymentForm, ReversePaymentForm } from "./payroll-settlement-forms";

type Params = Record<string, string | string[] | undefined>;
type Selection = { scope: PayrollSettlementScope; month: string; review?: string; employee?: number; after?: number };
type Batch = NonNullable<PayrollSettlementReview["batch"]>;
type Access = PayrollSettlementWorkspaceData["access"];

const monthFormat = new Intl.DateTimeFormat("en-AE", { timeZone: "UTC", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const wholeNumber = new Intl.NumberFormat("en-AE");
const moneyLabels = {
  unpaid: "Awaiting payment",
  "paid-unallocated": "Payment recorded · allocation pending",
  reconciled: "Reconciled",
  partial: "Partially paid",
  rejected: "Rejected",
  reversed: "Reversed",
  pending: "Pending",
  paid: "Paid",
};
const bankLabels: Record<string, string> = {
  prepared: "Files prepared",
  "start-handoff": "Handoff started",
  "handoff-pending": "Bank outcome pending",
  "record-submission": "Submission recorded",
  unknown: "Bank outcome pending",
  acknowledged: "Bank acknowledged",
  acknowledge: "Bank acknowledged",
  accepted: "Bank accepted",
  accept: "Bank accepted",
  reject: "Bank rejected",
  cancel: "Cancellation confirmed",
  cancelled: "Cancellation confirmed",
  submitted: "Submission recorded",
  "partially-settled": "Partially reconciled",
  settled: "Reconciled",
  superseded: "Superseded",
  mixed: "Multiple payment stages",
  "authorize-cheque": "Cheque settlement authorized",
  "authorize-zero": "Zero net settlement authorized",
  "cancel-cheque": "Cheque settlement cancelled",
  "cancel-zero": "Zero net settlement cancelled",
  "correct-file": "Corrected file prepared",
  corrected: "Corrected file prepared",
};
const channels = { wps: "WPS", cheque: "Approved cheque", zero: "Zero net pay" };
const linkClass = "text-primary underline underline-offset-2";
const panelClass = "space-y-4 rounded-lg border bg-card p-4 sm:p-5";

function title(value: string) {
  const words = value.replaceAll("-", " ").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function amount(value: string, currency?: string) {
  const pieces = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!pieces) return value;
  const [, sign, integer, fraction = ""] = pieces;
  return (currency ? currency + " " : "") + sign + wholeNumber.format(BigInt(integer)) + "." + fraction.padEnd(2, "0");
}

function one(value: Params[string]) {
  return typeof value === "string" ? value : undefined;
}

function scopeKey(scope: PayrollSettlementScope) {
  return scope.company_id + "." + scope.branch_id;
}

function href({ scope, month, review, employee, after }: Selection, section = "") {
  const parameters = new URLSearchParams({ company: String(scope.company_id), branch: String(scope.branch_id), month });
  if (review) parameters.set("review", review);
  if (employee !== undefined) parameters.set("employee", String(employee));
  if (after !== undefined) parameters.set("after", String(after));
  return payrollSettlementPath + "?" + parameters + section;
}

function PaymentState({ state }: { state: string }) {
  const labels: Record<string, string> = moneyLabels;
  const tone = state === "reconciled" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
    : state === "rejected" || state === "reversed" ? "border-destructive/30 bg-destructive/5 text-destructive"
    : state === "partial" || state === "paid-unallocated" ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    : "bg-muted/60 text-muted-foreground";
  return <span className={"inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium " + tone}>{labels[state] ?? title(state)}</span>;
}

function ScopeSelector({ scopes, scope, month }: { scopes: PayrollSettlementScope[]; scope?: PayrollSettlementScope; month: string }) {
  return <form method="get" action={payrollSettlementPath}
    className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(13rem,2fr)_minmax(10rem,1fr)_auto]">
    <label className="grid gap-1.5 text-sm font-medium">Employer and branch
      <select name="scope" required defaultValue={scope ? scopeKey(scope) : ""}
        className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="" disabled>Select a branch</option>
        {scopes.map(item => <option key={scopeKey(item)} value={scopeKey(item)}>{item.company} · {item.branch}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Payroll month
      <Input name="month" type="month" defaultValue={month} required />
    </label>
    <Button type="submit" variant="outline">Load payroll settlement</Button>
  </form>;
}

function BankFiles({ batch, issue, scope }: { batch: Batch; issue: boolean; scope: { company: number; branch: number } }) {
  return batch.files.length > 0 ? <ul className="divide-y rounded-md border" aria-label="Retained WPS files">
    {batch.files.map(file => <li key={file.id} className="space-y-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="break-all text-sm font-medium">{file.filename}</p>
          <p className="text-sm text-muted-foreground">
            {typeof file.establishment === "number" ? "Establishment " + file.establishment : file.establishment}
            {" · "}{file.count} {file.count === 1 ? "employee" : "employees"}
          </p>
          <p className="text-xs text-muted-foreground">{bankLabels[file.state] ?? title(file.state)}</p>
          {file.replaces && <p className="text-xs text-muted-foreground">
            Replaces {batch.files.find(original => original.id === file.replaces)?.filename ?? "the rejected original"}
          </p>}
        </div>
        <div className="text-right">
          <p className="text-sm font-medium tabular-nums">{amount(file.total, file.currency)}</p>
          {issue && !file.superseded && file.downloadable && <a href={"/api/hr/payroll/wps/" + file.id}
            className={linkClass + " text-sm"}>Download WPS file<span className="sr-only"> {file.filename}</span></a>}
        </div>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">File checksum</summary>
        <code className="mt-1 block break-all">{file.sha256}</code>
      </details>
      {issue && !file.superseded && <HandoffForm scope={scope} batch={batch.id} wpsFile={file.id} actions={file.actions}
        retainedReference={file.reference} />}
    </li>)}
  </ul> : <p className="text-sm text-muted-foreground">This payroll has no WPS file.</p>;
}

function AlternateChannels({ batch, issue, scope }: { batch: Batch; issue: boolean; scope: { company: number; branch: number } }) {
  if (!batch.alternate.length) return null;
  return <ul aria-label="Alternate payment channels" className="divide-y rounded-md border">
    {batch.alternate.map(lane => <li key={lane.channel} className="space-y-2 p-3">
      <p className="text-sm font-medium">{channels[lane.channel]}</p>
      <p className="text-xs text-muted-foreground">{bankLabels[lane.state] ?? title(lane.state)}</p>
      {issue && <HandoffForm scope={scope} batch={batch.id} actions={lane.actions} retainedReference={lane.reference} />}
    </li>)}
  </ul>;
}

function BankHistory({ batch }: { batch: Batch }) {
  if (!batch.history.length) return null;
  return <details className="rounded-md border px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">Bank file history</summary>
    <ol className="mt-2 divide-y">
      {batch.history.map((item, index) => <li key={item.kind + item.at + index} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <div>
          <p>{bankLabels[item.kind] ?? title(item.kind)}</p>
          {(item.wps_file || item.channel) && <p className="text-xs text-muted-foreground">
            {item.wps_file ? batch.files.find(file => file.id === item.wps_file)?.filename ?? "WPS file"
              : item.channel ? channels[item.channel] : null}
          </p>}
        </div>
        <time dateTime={item.at} className="text-xs text-muted-foreground">{timeFormat.format(new Date(item.at))}</time>
      </li>)}
    </ol>
  </details>;
}

function ApprovedVersion({ selection, review, access }: { selection: Selection; review: PayrollSettlementReview; access: Access }) {
  const batch = review.batch;
  const scope = { company: selection.scope.company_id, branch: selection.scope.branch_id };
  return <section className={panelClass} aria-labelledby="wps-files-heading">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="wps-files-heading" className="text-lg font-semibold">WPS files · Version {review.number}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{selection.scope.company} · {selection.scope.branch}</p>
      </div>
      <span className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium">
        {batch ? bankLabels[batch.state] ?? title(batch.state) : "Approved · files pending"}
      </span>
    </header>
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Approved version fingerprint</summary>
      <code className="mt-1 block break-all">{review.digest}</code>
    </details>
    {batch ? <>
      <BankFiles batch={batch} issue={access.issue} scope={scope} />
      <AlternateChannels batch={batch} issue={access.issue} scope={scope} />
      <BankHistory batch={batch} />
    </> : <>
      {review.issue_blocker && <p className="text-sm text-muted-foreground">{review.issue_blocker}</p>}
      {access.issue && review.can_issue === true && <PrepareFiles key={review.review} scope={scope} sealed={{ review: review.review, version: review.version, digest: review.digest }} />}
    </>}
  </section>;
}

function Employees({ selection, batch, nextAfter }: { selection: Selection; batch: Batch; nextAfter: number | null }) {
  if (!batch.results.length && selection.after === undefined) return null;
  const first = { ...selection, employee: undefined, after: undefined };
  return <section id="settlement-worklist" className="space-y-2" aria-labelledby="settlement-worklist-heading">
    <h2 id="settlement-worklist-heading" className="text-lg font-semibold">Employee payments</h2>
    {batch.results.length === 0 ? <p className="text-sm text-muted-foreground">There are no results on this page.</p>
      : <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[45rem] text-sm">
        <caption className="sr-only">Approved payroll and verified payment totals</caption>
        <thead className="border-b bg-muted/40 text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Employee</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">Channel</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Approved net</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Verified cash</th>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {batch.results.map(row => <tr key={row.employee} className={row.employee === selection.employee ? "bg-primary/5" : undefined}>
            <th scope="row" className="px-4 py-3 text-left font-medium">
              <Link href={href({ ...selection, employee: row.employee }, "#employee-payment-detail")}
                className={linkClass} aria-current={row.employee === selection.employee ? "page" : undefined}>{row.name}</Link>
            </th>
            <td className="px-3 py-3">{channels[row.channel]}</td>
            <td className="px-3 py-3 text-right tabular-nums">{amount(row.net, row.currency)}</td>
            <td className="px-3 py-3 text-right tabular-nums">{amount(row.verified_cash, row.currency)}</td>
            <td className="px-4 py-3"><PaymentState state={row.state} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {(selection.after !== undefined || nextAfter !== null) && <nav aria-label="Employees pages" className="flex flex-wrap gap-3 text-sm">
      {selection.after !== undefined && <Link className={linkClass} href={href(first, "#settlement-worklist")}>First employees</Link>}
      {nextAfter !== null && <Link className={linkClass} href={href({ ...first, after: nextAfter }, "#settlement-worklist")}>Next employees</Link>}
    </nav>}
  </section>;
}

function EmployeeDetail({ selection, batch, result, reconcile }: {
  selection: Selection; batch: Batch; result: PayrollSettlementResult; reconcile: boolean;
}) {
  const scope = { company: selection.scope.company_id, branch: selection.scope.branch_id };
  const totals = [
    ["Approved net", result.net], ["Verified cash", result.verified_cash], ["Unallocated cash", result.unallocated],
    ["Applied to wages", result.applied_wages], ["Applied to deductions", result.applied_deductions],
  ];
  if (result.remaining !== undefined) totals.push(["Outstanding net", result.remaining]);
  return <section id="employee-payment-detail" className={panelClass} aria-labelledby="employee-payment-name">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 id="employee-payment-name" className="text-lg font-semibold">{result.name}</h2>
        <p className="text-sm text-muted-foreground">{channels[result.channel]}</p>
      </div>
      <PaymentState state={result.state} />
    </header>
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border md:grid-cols-3">
      {totals.map(([label, value]) => <div key={label} className={"p-3 " + (label === "Unallocated cash" ? "border-l-2 border-l-primary bg-card" : "bg-card")}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-sm font-semibold tabular-nums">{amount(value, result.currency)}</dd>
      </div>)}
    </dl>
    {reconcile && result.can_record === true && <details className="space-y-3 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Record employee payment</summary>
      <RecordPaymentForm scope={scope} batch={batch.id} result={{ employee: result.employee, channel: result.channel, currency: result.currency }} />
    </details>}
    {result.payments.length > 0 && <section aria-label="Recorded employee payments" className="space-y-2">
      <h3 className="text-sm font-semibold">Recorded payments</h3>
      <ul className="space-y-2">
        {result.payments.map(payment => <li key={payment.id} id={`payment-${payment.id}`} className="scroll-mt-20 space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-medium tabular-nums">{amount(payment.amount, result.currency)}</p>
              <p className="text-xs text-muted-foreground">
                {payment.paid_on && <time dateTime={payment.paid_on}>{payment.paid_on}</time>}
                {payment.reference_suffix && <span>{payment.paid_on ? " · " : ""}Ref ending {payment.reference_suffix}</span>}
                {payment.recorded_at && <span className="block">Recorded <time dateTime={payment.recorded_at}>
                  {timeFormat.format(new Date(payment.recorded_at))}
                </time></span>}
              </p>
            </div>
            <PaymentState state={payment.reversed ? "reversed" : payment.outcome} />
          </div>
          {reconcile && !payment.reversed && payment.can_allocate === true && <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-medium">Allocate verified payment</summary>
            <AllocationForm scope={scope} batch={batch.id} result={{ currency: result.currency, lines: result.lines }}
              payment={{ id: payment.id, allocation_revision: payment.allocation_revision }} />
          </details>}
          {reconcile && !payment.reversed && payment.can_reverse === true && <details className="space-y-3">
            <summary className="cursor-pointer text-sm font-medium">Reverse recorded payment</summary>
            <ReversePaymentForm scope={scope} batch={batch.id} payment={{ id: payment.id, allocation_revision: payment.allocation_revision }} />
          </details>}
        </li>)}
      </ul>
    </section>}
  </section>;
}

export async function PayrollSettlementWorkspace({ params }: { params: Params }) {
  const scopes = await listPayrollSettlementScopes();
  const requestedScope = params.scope !== undefined ? one(params.scope)
    : params.company !== undefined || params.branch !== undefined ? one(params.company) + "." + one(params.branch) : undefined;
  const explicitScope = params.scope !== undefined || params.company !== undefined || params.branch !== undefined;
  const scope = explicitScope ? scopes?.find(item => scopeKey(item) === requestedScope)
    : scopes?.length === 1 ? scopes[0] : undefined;
  const requestedMonth = one(params.month)?.replace(/-01$/, "");
  const parsedMonth = requestedMonth && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : undefined;
  const month = parsedMonth ?? dubaiBusinessDate().slice(0, 7);
  const invalidMonth = params.month !== undefined && parsedMonth === undefined;
  const cursor = one(params.after);
  const after = params.after === undefined ? undefined : cursor && /^[1-9]\d*$/.test(cursor) ? Number(cursor) : NaN;
  const query = payrollSettlementQuery.safeParse({
    company: scope?.company_id, branch: scope?.branch_id, month: month + "-01", after,
    review: params.review === undefined ? undefined : one(params.review) ?? "",
  });
  const loaded = query.success && !invalidMonth ? await readPayrollSettlement(query.data) : null;
  const workspace = query.success && loaded && (query.data.review === undefined || loaded.selected_review === query.data.review) ? loaded : null;
  const reviews = workspace?.reviews ?? [];
  const review = reviews.find(item => item.review === workspace?.selected_review);
  const batch = review?.batch;
  const requestedEmployee = one(params.employee);
  const result = requestedEmployee ? batch?.results.find(item => String(item.employee) === requestedEmployee)
    : batch?.results.length === 1 && params.employee === undefined ? batch.results[0] : undefined;
  const selection: Selection | null = scope ? { scope, month, review: review?.review, employee: result?.employee, after } : null;
  const access = workspace?.access;
  const hasAccess = access && (access.issue || access.reconcile);
  const loadIssue = scopes === null || (scope && !invalidMonth && !hasAccess);

  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-8">
    <ERPPageHeader title="WPS and payment reconciliation" breadcrumbs={[
      { label: "Payroll & WPS", href: "/admin/hr/payroll" }, { label: "WPS and payment reconciliation" },
    ]} />
    {scopes && scopes.length > 0 && <ScopeSelector scopes={scopes} scope={scope} month={month} />}
    {scopes?.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm">You do not have payroll settlement access for any employer and branch.</p>}
    {loadIssue && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
      Payroll settlement could not be loaded. Check your access or reload the workspace.
    </p>}
    {!scope && scopes && scopes.length > 0 && <p className="text-sm text-muted-foreground">Choose an employer and branch from the available list.</p>}
    {invalidMonth && <p role="alert" className="text-sm text-destructive">Choose a valid payroll month.</p>}
    {hasAccess && reviews.length === 0 && <p className="rounded-lg border bg-card p-4 text-sm">
      No GM-approved payroll is available for {monthFormat.format(new Date(month + "-01T00:00:00Z"))}.
    </p>}
    {hasAccess && scope && reviews.length > 1 && <nav aria-label="Approved payroll versions" className="flex flex-wrap gap-2">
      {reviews.map(item => <Link key={item.review} href={href({ scope, month, review: item.review })}
        aria-current={item.review === review?.review ? "page" : undefined}
        className={"rounded-md border px-3 py-2 text-sm " + (item.review === review?.review ? "border-primary bg-primary/5" : "bg-card hover:border-primary")}>
        Version {item.number}
      </Link>)}
    </nav>}
    {hasAccess && reviews.length > 0 && !review && <p role="alert" className="text-sm text-destructive">Choose a version from this payroll month.</p>}
    {hasAccess && selection && review && <ApprovedVersion selection={selection} review={review} access={access} />}
    {workspace && access?.reconcile && selection && batch && <Employees selection={selection} batch={batch} nextAfter={workspace.next_after} />}
    {access?.reconcile && selection && batch && result && <EmployeeDetail key={batch.id + "." + result.employee}
      selection={selection} batch={batch} result={result} reconcile={access.reconcile} />}
  </main>;
}
