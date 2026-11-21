import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { listExitScopes, readExitWorkspace } from "@/server/actions/hr/final-settlement";
import { ExitSettlementCommand } from "./exit-settlement-command";
import { ExitAdjustments, ExitPolicies } from "./exit-configuration";
import {
  caseUrl, commandOptions, dateLabel, exitPath, label, maskedReference, money, positiveInteger, scopeKey, selectClassName,
  type CaseSummary, type ExitAccess, type ExitCase, type ExitScope, type ExitSearchParams,
} from "./exit-settlement-contract";

function ScopeSelector({ scopes, scope }: { scopes: readonly ExitScope[]; scope?: ExitScope }) {
  return <form action={exitPath} method="get" className="grid items-end gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_auto]">
    <label className="grid gap-1.5 text-sm font-medium">
      Employer and branch
      <select name="scope" required className={selectClassName} defaultValue={scope ? scopeKey(scope) : ""}>
        <option value="" disabled>Select an employer and branch</option>
        {scopes.map(item => <option key={scopeKey(item)} value={scopeKey(item)}>{item.company_name} · {item.branch_name}</option>)}
      </select>
    </label>
    <Button type="submit" variant="outline" className="justify-self-start">Find exit cases</Button>
  </form>;
}

const cell = "px-4 py-2.5";
const tableHeader = "bg-muted/50 text-left text-muted-foreground";
const section = "space-y-3 rounded-lg border bg-card p-4";
const subhead = "font-semibold";
const quiet = "text-sm text-muted-foreground";
const textLink = "text-primary underline underline-offset-2";

function CaseList({ cases, scope, selected, after, next }: {
  cases: readonly CaseSummary[]; scope: ExitScope; selected?: number; after?: number; next?: number | null;
}) {
  return <>{cases.length ? <div className="overflow-x-auto rounded-lg border bg-card">
    <table className="w-full divide-y text-sm" aria-label="Exit cases">
      <thead className={tableHeader}><tr>
        {["Employee", "Case", "Last working day", "Status"].map(title =>
          <th key={title} scope="col" className={cell}>{title}</th>)}
      </tr></thead>
      <tbody className="divide-y">
        {cases.map(item => <tr key={item.id} className={selected === item.id ? "bg-muted/40" : undefined}>
          <th scope="row" className={cell + " text-left font-medium"}>
            <Link className={textLink} aria-current={selected === item.id ? "true" : undefined}
              href={caseUrl(scope, item.id, after)}>{item.name}</Link>
          </th>
          <td className={cell}>#{item.id}</td>
          <td className={cell}>{dateLabel(item.last_day)}</td>
          <td className={cell}>{label(item.state)}</td>
        </tr>)}
      </tbody>
    </table>
  </div> : <p className={section + " text-sm"}>{after ? "There are no older exit cases on this page." : "There are no exit cases for this employer and branch."}</p>}
    {(after || next) && <nav aria-label="Exit case pages" className="flex flex-wrap gap-4 text-sm">
      {!!after && <Link className={textLink} href={caseUrl(scope, selected)}>Newest exit cases</Link>}
      {!!next && <Link className={textLink} href={caseUrl(scope, selected, next)}>Older exit cases</Link>}
    </nav>}
  </>;
}

function Clearance({ caseDetails }: { caseDetails: ExitCase }) {
  const { blocking_count: pending, items } = caseDetails.clearance;
  return <section aria-labelledby="clearance-heading" className={section}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="clearance-heading" className={subhead}>Clearance checklist</h2>
      {pending > 0 && <p className="text-sm font-medium text-destructive">{pending} outstanding</p>}
    </div>
    {items.length ? <ul className="divide-y">
      {items.map(item => <li key={item.origin + ":" + item.source_id} className="grid gap-1 py-2.5 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm font-medium">{item.title}</p>
          <p className={quiet}>Assigned to {label(item.owner)}{item.evidence_attached ? " · Evidence retained" : ""}</p>
        </div>
        <p className="text-sm">{label(item.status)}</p>
      </li>)}
    </ul> : <p className={quiet}>{caseDetails.activated ? "No clearance items recorded." : "Open exit clearance to collect the items assigned to Fleet and other teams."}</p>}
  </section>;
}

function RecoveryCases({ caseDetails }: { caseDetails: ExitCase }) {
  return <section aria-labelledby="recovery-heading" className={section}>
    <h2 id="recovery-heading" className={subhead}>Fine and damage cases</h2>
    {caseDetails.cases.length ? <ul className="divide-y">
      {caseDetails.cases.map(item => <li key={item.id} className="space-y-1 py-2.5">
        <p className="text-sm font-medium">{label(item.kind)} · Case {item.id}</p>
        <p className={quiet}>{label(item.state)} · {item.decision
          ? label(item.decision.disposition) + " · " + label(item.decision.state)
          : "Decision required"}</p>
        {item.decision?.reason && <p className="text-sm">{item.decision.reason}</p>}
      </li>)}
    </ul> : <p className={quiet}>There are no fine or damage cases to review for this exit.</p>}
    {!!caseDetails.reviewed_cases?.length && <details className={quiet}>
      <summary className={"cursor-pointer " + textLink}>Cases recorded in this settlement version</summary>
      <ul className="divide-y pt-2">
        {caseDetails.reviewed_cases.map(item => <li className="space-y-1 py-2" key={item.id}>
          <p className="font-medium text-foreground">{label(item.kind)} · Case {item.id} · {label(item.disposition)}</p>
          <p>{item.reason}</p>
        </li>)}
      </ul>
    </details>}
  </section>;
}

function Settlement({ caseDetails }: { caseDetails: ExitCase }) {
  const { draft, approval } = caseDetails;
  return <section aria-labelledby="settlement-heading" className={section}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="settlement-heading" className={subhead}>{draft ? "Settlement version " + draft.number : "Settlement calculation"}</h2>
      <div className={quiet}>{approval ? "GM decision · " + label(approval.state) : draft && label(draft.state)}</div>
    </div>
    {draft ? <>
      <dl className="grid grid-flow-row gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-3">
        {([["Gross", draft.gross], ["Deductions", draft.deductions], ["Net payable", draft.net]] as const).map(([title, amount]) =>
          <div key={title}>
            <dt className={quiet}>{title}</dt>
            <dd className="mt-1 text-base font-semibold tabular-nums">{money(amount, draft.currency)}</dd>
          </div>)}
      </dl>
      {draft.issues.length > 0 && <ul aria-label="Calculation checks" className="grid gap-2">
        {draft.issues.map((issue, index) => <li key={issue.code + ":" + index} className={
          issue.blocking ? "rounded-md border border-destructive/40 p-2 text-sm" : "rounded-md border p-2 text-sm"
        }>{issue.blocking && <span className="mr-2 font-medium text-destructive">Hold</span>}{issue.reason}</li>)}
      </ul>}
      {draft.lines.length > 0 && <div className="overflow-x-auto rounded-md border">
        <table className="w-full divide-y text-sm" aria-label="Exact settlement lines">
          <thead className={tableHeader}><tr>
            {["Component", "Type", "Amount"].map(title => <th key={title} scope="col" className={cell}>{title}</th>)}
          </tr></thead>
          <tbody className="divide-y">{draft.lines.map(line => <tr key={line.id} className="align-top">
            <th scope="row" className={cell + " text-left font-medium"}>
              {label(line.category)}{line.reason && <span className="mt-0.5 block font-normal text-muted-foreground">{line.reason}</span>}
            </th>
            <td className={cell}>{label(line.kind)}</td>
            <td className={cell + " whitespace-nowrap tabular-nums"}>{money(line.amount, draft.currency)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <details className={quiet}>
        <summary className="cursor-pointer text-primary underline underline-offset-2">Exact version fingerprint</summary>
        <p className="mt-1 break-all font-mono text-xs">{draft.digest}</p>
      </details>
    </> : <p className={quiet}>There is no calculated settlement for this case yet.</p>}
    {!!caseDetails.history?.length && <details className={quiet}>
      <summary className={"cursor-pointer " + textLink}>Version history</summary>
      <ul className="divide-y pt-2">
        {caseDetails.history.map(version => <li className="py-2" key={version.version}>
          <p>Version {version.number} · {label(version.state)} · {dateLabel(version.calculated_at)}</p>
          <p className="break-all font-mono text-xs">{version.digest}</p>
        </li>)}
      </ul>
    </details>}
  </section>;
}

function Payment({ caseDetails }: { caseDetails: ExitCase }) {
  const payment = caseDetails.payment;
  const currency = payment?.currency ?? caseDetails.draft?.currency ?? "";
  return <section aria-labelledby="payment-heading" className={section}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="payment-heading" className={subhead}>Payment and allocations</h2>
      {payment && <p className={quiet}>{label(payment.state)}{payment.channel ? " · " + label(payment.channel) : ""}</p>}
    </div>
    {payment ? <>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["Verified cash", payment.verified_cash], ["Wages applied", payment.applied_wages],
          ["Deductions applied", payment.applied_deductions], ["Unallocated", payment.unallocated],
        ] as const).map(([title, amount]) => <div key={title}>
          <dt className={quiet}>{title}</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums">{money(amount, currency)}</dd>
        </div>)}
      </dl>
      {payment.movements.length > 0 && <ul className="divide-y border-t" aria-label="Payment history">
        {payment.movements.map(event => {
          const suffix = maskedReference(event.reference_suffix);
          return <li key={event.id} id={`payment-${event.id}`} className="flex scroll-mt-20 flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <div>
              <p className="font-medium">{event.reversed ? "Reversed" : label(event.outcome)}{suffix ? " · …" + suffix : ""}</p>
              <p className={quiet}>Event {event.id.slice(-8)}{event.paid_on ? " · " + dateLabel(event.paid_on) : ""}</p>
            </div>
            <p className="tabular-nums">{money(event.amount, event.currency)}</p>
          </li>;
        })}
      </ul>}
    </> : <p className={quiet}>There is no recorded settlement payment.</p>}
  </section>;
}

function ExitDetail({ caseDetails, scope, access }: { caseDetails: ExitCase; scope: ExitScope; access: ExitAccess }) {
  const actions = commandOptions(caseDetails, access);
  const currency = caseDetails.payment?.currency ?? caseDetails.draft?.currency ?? "";
  return <article className="space-y-4" aria-labelledby="exit-employee-heading">
    <header className="border-l-4 border-primary pl-3">
      <h2 id="exit-employee-heading" className="text-lg font-semibold">{caseDetails.name}</h2>
      <p className={quiet}>Exit case #{caseDetails.id} · Last working day {dateLabel(caseDetails.last_day)}</p>
      {caseDetails.employment_end_day && caseDetails.employment_end_day !== caseDetails.last_day &&
        <p className={quiet}>Employment end {dateLabel(caseDetails.employment_end_day)}</p>}
    </header>
    {caseDetails.needs_dates && <p role="status" className="rounded-md border border-destructive/40 p-3 text-sm">
      Record the last working day and employment end date in EOS &amp; Clearance before opening the checklist.
    </p>}
    <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Settlement caseDetails={caseDetails} />
        <Payment caseDetails={caseDetails} />
      </div>
      <div className="space-y-4">
        <Clearance caseDetails={caseDetails} />
        <RecoveryCases caseDetails={caseDetails} />
        <ExitAdjustments key={scopeKey(scope) + ":" + caseDetails.id} caseDetails={caseDetails} scope={scope} access={access} />
        <ExitSettlementCommand key={scopeKey(scope) + ":" + caseDetails.id}
          company={scope.company} branch={scope.branch} eos={caseDetails.id} options={actions}
          currency={currency} paymentChannels={caseDetails.payment_channels} lines={caseDetails.draft?.lines ?? []} />
      </div>
    </div>
  </article>;
}

export async function ExitSettlementWorkspace({ params }: { params: ExitSearchParams }) {
  const scopes = await listExitScopes();
  const requested = typeof params.scope === "string" && params.company === undefined && params.branch === undefined
    ? params.scope
    : params.scope === undefined && typeof params.company === "string" && typeof params.branch === "string"
      ? params.company + "." + params.branch : undefined;
  const explicitScope = params.scope !== undefined || params.company !== undefined || params.branch !== undefined;
  const scope = explicitScope ? scopes?.find(item => scopeKey(item) === requested) : scopes?.[0];
  const explicitCase = params.eos !== undefined || params.case !== undefined;
  const eos = params.eos !== undefined && params.case !== undefined ? undefined : positiveInteger(params.eos ?? params.case);
  const after = positiveInteger(params.after);
  const invalidPage = params.after !== undefined && !after;
  const shouldRead = scope && !invalidPage && (!explicitCase || eos);
  const data = shouldRead
    ? await readExitWorkspace({ company: scope.company, branch: scope.branch, ...(eos ? { eos } : {}), ...(after ? { after } : {}) }) : undefined;
  const selected = data?.selected && (!eos || data.selected.id === eos) ? data.selected : undefined;

  return <div className="space-y-5">
    <ERPPageHeader title="Final settlement" />
    {scopes && scopes.length > 0 && <ScopeSelector scopes={scopes} scope={scope} />}
    {!scopes && <p role="alert" className={section + " text-sm"}>Payroll scopes could not be loaded. Reload the page to try again.</p>}
    {scopes?.length === 0 && <p className={quiet}>You have no exit settlement access for any employer and branch.</p>}
    {scopes && scopes.length > 0 && !scope && <p className={quiet}>Choose an employer and branch from your available scopes.</p>}
    {explicitCase && !eos && <p role="alert" className="text-sm text-destructive">Choose a valid exit case.</p>}
    {invalidPage && <p role="alert" className="text-sm text-destructive">Choose a valid page of exit cases.</p>}
    {shouldRead && !data && <p role="alert" className={section + " text-sm"}>Exit cases could not be loaded for this employer and branch.</p>}
    {scope && data && <>
      {data.policies && <ExitPolicies key={scopeKey(scope)} policies={data.policies} scope={scope} access={data.access} />}
      <CaseList cases={data.cases} scope={scope} selected={selected?.id} after={after} next={data.next_after} />
      {selected && <ExitDetail caseDetails={selected} scope={scope} access={data.access} />}
      {eos && !selected && <p className={quiet}>This exit case is unavailable in the selected scope.</p>}
    </>}
  </div>;
}

