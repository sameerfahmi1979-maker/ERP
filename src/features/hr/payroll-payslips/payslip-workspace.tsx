import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import { listPayslipScopes, readPayslipDeliveryHistory, readPayslipWorkspace } from "@/server/actions/hr/payslips";
import { PayslipCommand, type PayslipDeliveryOption } from "./payslip-command";

type Params = Record<string, string | string[] | undefined>;
type Scope = { company_id: number; branch_id: number; company: string; branch: string };
type Search = { company: number; branch: number; month: string; employee?: string; after?: number };
type Delivery = {
  id: number;
  kind: string;
  channel: "email" | "print";
  state: string;
  at: string;
  completed_at?: string | null;
  can_handover?: boolean;
  can_bounce?: boolean;
  can_reconcile?: boolean;
};
type Row = {
  employee: number;
  name: string;
  code: string;
  month: string;
  batch: string;
  state: string;
  can_issue: boolean;
  slip: null | {
    id: number;
    issued_at: string | null;
    checksum: string | null;
    filename: string;
    delivery?: { history: Delivery[]; history_count?: number; actions?: readonly string[] } | null;
  };
};
type Access = { view: boolean; issue: boolean; deliver: boolean };
type SelectedHistory = { slip: number; page: Awaited<ReturnType<typeof readPayslipDeliveryHistory>> };

const path = "/admin/hr/payroll/payslips";
const displayDate = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" });
const paymentLabels: Record<string, string> = {
  unpaid: "Awaiting payment",
  pending: "Payment pending",
  partial: "Partially paid",
  "paid-unallocated": "Allocation pending",
  rejected: "Payment rejected",
  reversed: "Payment reversed",
  reconciled: "Payment reconciled",
};
const deliveryLabels: Record<string, string> = {
  queued: "Email queued",
  processing: "Email processing",
  retry_scheduled: "Email retry scheduled",
  paused: "Email paused",
  provider_accepted: "Accepted by email provider",
  provider_accepted_confirmed: "Provider acceptance confirmed",
  provider_not_accepted_confirmed: "Provider non-acceptance confirmed",
  delivery_unknown: "Email outcome unconfirmed",
  failed: "Email failed",
  cancelled: "Delivery cancelled",
  bounced: "Email bounced",
  print_ready: "Awaiting print and handover",
  handed_over: "Handed over",
};

function scopeKey(scope: Scope) {
  return scope.company_id + "." + scope.branch_id;
}

function linkTo(search: Search, after?: number, history?: { slip: number; before?: number }) {
  const query = new URLSearchParams({
    company: String(search.company), branch: String(search.branch), month: search.month.slice(0, 7),
  });
  if (search.employee) query.set("employee", search.employee);
  if (after) query.set("after", String(after));
  if (history) {
    query.set("delivery_history", String(history.slip));
    if (history.before) query.set("before_delivery", String(history.before));
  }
  return path + "?" + query.toString();
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? displayDate.format(date) : "";
}

function ScopeForm({ scopes, scope, month, staffCode }: {
  scopes: Scope[]; scope?: Scope; month: string; staffCode: string;
}) {
  return <form action={path} method="get" className="grid items-end gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[2fr_1fr_1fr_auto]">
    <label className="grid gap-1.5 text-sm font-medium">
      Employer and branch
      <select name="scope" required defaultValue={scope ? scopeKey(scope) : ""}
        className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="" disabled>Select a branch</option>
        {scopes.map(item => <option key={scopeKey(item)} value={scopeKey(item)}>{item.company} · {item.branch}</option>)}
      </select>
    </label>
    <label className="grid gap-1.5 text-sm font-medium">
      Payroll month
      <Input name="month" type="month" required defaultValue={month} />
    </label>
    <label className="grid gap-1.5 text-sm font-medium">
      Employee code or ID
      <Input name="employee" type="search" maxLength={100} defaultValue={staffCode} />
    </label>
    <Button type="submit" variant="outline" className="justify-self-start">Find payslips</Button>
  </form>;
}

function DeliveryHistory({ history, count, slip, search, selected }: {
  history: Delivery[]; count?: number; slip: number; search: Search; selected?: SelectedHistory;
}) {
  const linkClass = "text-primary underline underline-offset-2";
  if (!history.length && !selected) return <span className="text-sm text-muted-foreground">Delivery pending</span>;
  const page = selected?.page.ok ? selected.page.data : undefined;
  const events = page?.rows ?? history;
  return <div className="space-y-1">
    {history[0] && <p className="text-sm">{deliveryLabels[history[0].state] ?? "Delivery recorded"}</p>}
    {count !== undefined && !selected ? <Link prefetch={false} className={"text-xs " + linkClass}
      href={linkTo(search, search.after, { slip }) + "#delivery-" + slip}>Delivery history ({count})</Link>
    : <details id={"delivery-" + slip} open={selected ? true : undefined} className="text-xs">
      <summary className={"cursor-pointer " + linkClass}>Delivery history ({page?.count ?? count ?? history.length})</summary>
      {selected && !page && <p role="alert" className="mt-1">Delivery history could not be loaded. Reload the page to retry.</p>}
      {page && !events.length && <p className="mt-1">No deliveries on this page.</p>}
      <ul className="mt-1 space-y-1 text-muted-foreground">
        {events.map(event => <li key={event.id} className="rounded-md border px-2 py-1">
          <span>{event.channel === "email" ? "Email" : "Print"} · {deliveryLabels[event.state] ?? "Delivery recorded"}</span>
          <span className="ml-2">{dateLabel(event.completed_at ?? event.at)}</span>
        </li>)}
      </ul>
      {page && <nav aria-label="Delivery history pages" className="mt-2 flex gap-2">
        <Link prefetch={false} className={linkClass}
          href={linkTo(search, search.after, { slip }) + "#delivery-" + slip}>First deliveries</Link>
        {page.next_before && <Link prefetch={false} className={linkClass}
          href={linkTo(search, search.after, { slip, before: page.next_before }) + "#delivery-" + slip}>Next deliveries</Link>}
      </nav>}
    </details>}
  </div>;
}

function deliveryChoices(delivery: NonNullable<NonNullable<Row["slip"]>["delivery"]>, canDistribute: boolean): PayslipDeliveryOption[] {
  const choices: PayslipDeliveryOption[] = [];
  for (const kind of canDistribute ? delivery.actions ?? [] : []) {
    if (kind === "initial" || kind === "resend" || kind === "print") choices.push({ kind });
  }
  for (const entry of delivery.history) {
    if (canDistribute && entry.channel === "print" && entry.state === "print_ready" && entry.can_handover !== false) {
      choices.push({ kind: "handover", delivery: entry.id, label: "Confirm handover · " + dateLabel(entry.at) + " · " + entry.id });
    }
    if (entry.channel === "email" && (entry.state === "provider_accepted" || entry.state === "provider_accepted_confirmed") && entry.can_bounce === true) {
      choices.push({ kind: "bounce", delivery: entry.id, label: "Record bounce · " + dateLabel(entry.at) + " · " + entry.id });
    }
    if (entry.channel === "email" && entry.state === "delivery_unknown" && entry.can_reconcile === true) {
      choices.push({ kind: "reconcile-email", delivery: entry.id, label: "Record confirmed email outcome · " + dateLabel(entry.at) + " · " + entry.id });
    }
  }
  return choices;
}

function PayslipRow({ row, access, search, selected }: {
  row: Row; access: Access; search: Search; selected?: SelectedHistory;
}) {
  const slip = row.slip;
  const original = slip?.issued_at && slip.checksum && /^[0-9a-f]{64}$/i.test(slip.checksum)
    && Number.isSafeInteger(slip.id) && slip.id > 0 ? slip : null;
  const history = original?.delivery?.history ?? [];
  const canIssue = access.issue && row.state === "reconciled" && row.can_issue && !original;
  const visibleHistory = selected?.page.ok ? selected.page.data.rows : history;
  const delivery = access.deliver && original?.delivery
    ? { slip: original.id, actions: deliveryChoices({ ...original.delivery, history: visibleHistory }, row.state === "reconciled") }
    : undefined;
  const issuedDescription = slip ? "Issue pending" : row.state === "reconciled" ? "Ready to issue" : "Awaiting eligible payment";
  return <tr className="align-top">
    <th scope="row" className="min-w-48 px-4 py-3 text-left">
      <p className="font-medium">{row.name}</p>
      <p className="mt-0.5 text-sm font-normal text-muted-foreground">{row.code}</p>
    </th>
    <td className="min-w-36 px-4 py-3 text-sm">{paymentLabels[row.state] ?? "Payment review required"}</td>
    <td className="min-w-48 px-4 py-3">
      {original ? <div className="space-y-1">
        <a href={"/api/hr/payroll/payslips/" + original.id}
          className="text-sm font-medium text-primary underline underline-offset-2">
          Download original PDF
        </a>
        <p className="text-xs text-muted-foreground">Issued {dateLabel(original.issued_at ?? "")}</p>
      </div> : <span className="text-sm text-muted-foreground">{issuedDescription}</span>}
    </td>
    <td className="min-w-44 px-4 py-3">
      {original?.delivery ? <DeliveryHistory history={history} count={original.delivery.history_count}
        slip={original.id} search={search} selected={selected} />
        : <span aria-hidden="true" className="text-muted-foreground">—</span>}
    </td>
    <td className="min-w-40 px-4 py-3">
      <PayslipCommand employee={row.employee} batch={row.batch} canIssue={canIssue} delivery={delivery} compact />
    </td>
  </tr>;
}

export async function PayslipWorkspace({ params }: { params: Params }) {
  const scopeResult = await listPayslipScopes();
  const scopes = scopeResult.ok ? scopeResult.data : undefined;
  const hasExplicitScope = params.scope !== undefined || params.company !== undefined || params.branch !== undefined;
  const scopeParam = typeof params.scope === "string" ? params.scope
    : params.scope === undefined && typeof params.company === "string" && typeof params.branch === "string"
      ? params.company + "." + params.branch : undefined;
  const scope = hasExplicitScope ? scopes?.find(candidate => scopeKey(candidate) === scopeParam) : scopes?.[0];
  const rawMonth = typeof params.month === "string" ? params.month.replace(/-01$/, "") : undefined;
  const explicitMonth = rawMonth && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : undefined;
  const month = explicitMonth ?? dubaiBusinessDate().slice(0, 7);
  const invalidMonth = params.month !== undefined && explicitMonth === undefined;
  const staffCode = typeof params.employee === "string" ? params.employee.trim() : "";
  const invalidEmployee = Array.isArray(params.employee) || staffCode.length > 100 || /[\u0000-\u001f\u007f]/.test(staffCode);
  const cursor = typeof params.after === "string" && /^[1-9]\d*$/.test(params.after) ? Number(params.after) : undefined;
  const after = Number.isSafeInteger(cursor) ? cursor : undefined;
  const search: Search | undefined = scope && !invalidMonth && !invalidEmployee
    ? { company: scope.company_id, branch: scope.branch_id, month: month + "-01",
        ...(staffCode ? { employee: staffCode } : {}), ...(after ? { after } : {}) }
    : undefined;
  const result = search ? await readPayslipWorkspace(search) : undefined;
  const data = result?.ok && result.data.access.view ? result.data : undefined;
  const requestedSlip = typeof params.delivery_history === "string" && /^[1-9]\d*$/.test(params.delivery_history)
    ? Number(params.delivery_history) : undefined;
  const selectedSlip = data?.rows.find(row => row.slip?.id === requestedSlip && row.slip?.issued_at && row.slip.checksum)?.slip;
  const rawHistoryCursor = params.before_delivery;
  const historyBefore = rawHistoryCursor === undefined ? undefined :
    typeof rawHistoryCursor === "string" && /^[1-9]\d*$/.test(rawHistoryCursor) ? Number(rawHistoryCursor) : NaN;
  const selected = search && selectedSlip ? {
    slip: selectedSlip.id,
    page: await readPayslipDeliveryHistory({
      company: search.company, branch: search.branch, month: search.month, slip: selectedSlip.id, before: historyBefore,
    }),
  } : undefined;

  return <div className="space-y-5">
    <ERPPageHeader title="Payslips" description="Find an employee’s original payslip by employer and payroll month." />
    {scopes && scopes.length > 0 && <ScopeForm scopes={scopes} scope={scope} month={month} staffCode={staffCode.slice(0, 100)} />}
    {!scopeResult.ok && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">Payslip scopes could not be loaded. Reload the page to try again.</p>}
    {scopes?.length === 0 && <p className="rounded-md border bg-card p-3 text-sm">You have no payslip access for any employer and branch.</p>}
    {scopes && scopes.length > 0 && !scope && <p className="text-sm text-muted-foreground">Choose an employer and branch from your available scopes.</p>}
    {invalidMonth && <p role="alert" className="text-sm text-destructive">Enter a valid payroll month.</p>}
    {invalidEmployee && <p role="alert" className="text-sm text-destructive">Enter one employee code or ID.</p>}
    {result && !data && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">Payslips could not be loaded for this scope. Check your access or reload the page.</p>}
    {data && search && <section aria-label="Payslip results" className="space-y-3">
      {data.rows.length === 0 ? <p className="rounded-md border bg-card p-3 text-sm">
        {search.employee ? "No payroll result matches this employee and month." : "There are no approved payroll results for this month."}
      </p> : <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full divide-y text-sm" aria-label="Employee payslips">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>{["Employee", "Payment", "Payslip", "Delivery", "Actions"].map(label =>
              <th key={label} scope="col" className="px-4 py-2.5 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.map(row => <PayslipRow key={row.batch + ":" + row.employee} row={row} access={data.access}
              search={search} selected={selected && row.slip?.id === selected.slip ? selected : undefined} />)}
          </tbody>
        </table>
      </div>}
      {(search.after || data.next_after) && <nav aria-label="Payslip pages" className="flex gap-4 text-sm">
        {search.after && <Link href={linkTo(search)} className="text-primary underline underline-offset-2">First employees</Link>}
        {data.next_after && <Link href={linkTo(search, data.next_after)} className="text-primary underline underline-offset-2">Next employees</Link>}
      </nav>}
    </section>}
  </div>;
}
