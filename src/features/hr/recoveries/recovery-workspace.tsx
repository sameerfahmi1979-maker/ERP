
import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import { fleetId } from "@/lib/fleet/asset-contract";
import { exitPath } from "@/features/hr/exit-settlement/exit-settlement-contract";
import { payrollSettlementPath } from "@/lib/hr/payroll/settlement-contract";
import { moneyKinds, recoveryMonth, type RecoveryCase, type RecoveryEvidence, type RecoveryHistoryOwner } from "@/lib/hr/recovery-contract";
import { outputPath } from "@/lib/official-documents/operational-output";
import { listRecoveryScopes, readRecoveryWorkspace } from "@/server/actions/hr/recoveries";
import {
  RecoveryField, RecoveryForm, RecoveryProof, RecoverySelect, ScheduleFields,
} from "./recovery-form";
import type { ReactNode } from "react";

const route = "/admin/hr/operations/recoveries";
const notice = "T13_RECOVERY_EMPLOYEE_NOTICE";
const reply = "T13_RECOVERY_EMPLOYEE_RESPONSE";
const financial = "T13_RECOVERY_FINANCIAL_PROOF";
const cash = "T13_RECOVERY_CASH_RECEIPT";
const correction = "T13_RECOVERY_FINANCIAL_CORRECTION";
const formatDate = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
const options = (values: readonly string[]) => values.map(value => [value, display(value)] as const);
const disputeRoutes = [["defer", "Hold the disputed amount"], ["deduct-correct", "Deduct and correct if approved by policy"]] as const;
const grid = "grid gap-3 sm:grid-cols-2";

function display(value: string) {
  return value.replaceAll("-", " ").replace(/^./, initial => initial.toUpperCase());
}
function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(amount);
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rounded-lg border bg-card px-4 py-3">
    <summary className="cursor-pointer font-medium">{title}</summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>;
}
function ProofLinks({ files }: { files: RecoveryEvidence[] }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">No accessible verified evidence is available in this scope.</p>;
  return <Panel title="Preview available DMS evidence">{files.map(file => <p key={file.file}>
    <a className="text-sm text-primary underline" href={`/api/dms/file?fileId=${file.file}`}>{file.label}</a>
  </p>)}</Panel>;
}

function HrCase({ row, branch }: { row: RecoveryCase; branch: number }) {
  const canReviewSubject = ["verified", "no-referral"].includes(row.subject_status);
  const open = row.disputes.filter(dispute => dispute.resolves_id === null && !row.disputes.some(other => other.resolves_id === dispute.id));
  const hr = { target: row.id, basis: row.hr_basis };
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">HR review</h2>
    {row.reviews.length === 0 && <p className="text-sm text-muted-foreground">No responsibility review recorded.</p>}
    {row.reviews.map(review => <article className="rounded-lg border p-3 text-sm" key={review.id}>
      <p className="font-medium">Review #{review.id} · {display(review.decision)} · {money(review.ceiling, row.currency)}</p>
      {review.notified_on && <p>Employee notified {review.notified_on}{review.response && ` · ${display(review.response)}`}</p>}
      {review.response_note && <p>{review.response_note}</p>}
      {review.reason && <p>{review.reason}</p>}
    </article>)}
    {canReviewSubject && <Panel title="Record a responsibility review">
      <RecoveryForm {...hr} action="review" label="Save responsibility review">
        <div className={grid}>
          <RecoverySelect name="decision" label="Responsibility" options={options(row.subject_status === "verified" ?
            ["employee", "wear", "employer", "third-party", "insurer", "unresolved"] : ["wear", "employer", "third-party", "insurer", "unresolved"])} />
          <RecoveryField name="ceiling" label="Eligible ceiling before dispute adjustments" defaultValue="0" />
          <RecoveryField name="notified_on" label="Date employee was notified" type="date" required={false} />
          <RecoveryProof files={row.evidence} name="notice" label="Employee notice in DMS" types={[notice]} branch={branch} required={false} />
          <RecoverySelect name="response" label="Employee response" options={options(["acknowledged", "disputed", "no-response"])} required={false} />
          <RecoveryProof files={row.evidence} name="response_evidence" label="Employee response in DMS" types={[reply]} branch={branch} required={false} />
          <RecoveryField name="response_note" label="Response or documented follow-up" required={false} />
          <RecoveryField name="disputed_amount" label="Disputed amount, if any" required={false} />
          <RecoverySelect name="route" label="Dispute handling" options={disputeRoutes} required={false} />
        </div>
        <p className="text-sm text-muted-foreground">Employee recovery requires a dated policy, notice and employee response or documented follow-up.</p>
      </RecoveryForm>
    </Panel>}
    {row.reviews[0]?.decision === "employee" && <Panel title="Record a dispute">
      <RecoveryForm {...hr} action="open-dispute" label="Save dispute">
        <div className={grid}>
          <RecoveryField name="amount" label="Disputed amount" />
          <RecoverySelect name="route" label="Dispute handling" options={disputeRoutes} initial="defer" />
          <RecoveryProof files={row.evidence} label="Dispute evidence in DMS" types={[reply]} branch={branch} />
        </div>
      </RecoveryForm>
    </Panel>}
    {open.map(dispute => <Panel title={`Decide dispute #${dispute.id} · ${money(dispute.amount, row.currency)}`} key={dispute.id}>
      <RecoveryForm {...hr} action="resolve-dispute" label="Record independent decision">
        <input type="hidden" name="dispute" value={dispute.id} />
        <div className={grid}>
          <RecoveryField name="upheld" label="Amount upheld" />
          <RecoveryProof files={row.evidence} label="Decision evidence in DMS" types={[reply]} branch={branch} />
        </div>
      </RecoveryForm>
    </Panel>)}
    {row.disputes.filter(item => item.resolves_id !== null).map(item =>
      <p key={item.id} className="text-sm">Dispute #{item.resolves_id} · {money(item.upheld ?? 0, row.currency)} upheld · {item.reason}</p>)}
  </section>;
}
function HistoryOwner({ owner }: { owner?: RecoveryHistoryOwner }) {
  const linkClass = "text-sm text-primary underline underline-offset-2";
  if (owner?.kind === "payroll") {
    const target = owner.destination;
    if (target) {
      const query = new URLSearchParams({ scope: `${target.company}.${target.branch}`, month: target.month.slice(0, 7),
        review: target.review, employee: String(target.employee) });
      if (target.employee > 1) query.set("after", String(target.employee - 1));
      return <Link className={linkClass} href={`${payrollSettlementPath}?${query}#payment-${target.payment}`}>Open WPS &amp; Payments</Link>;
    }
    return <p className="text-sm text-muted-foreground">Read-only history · WPS &amp; Payments</p>;
  }
  if (owner?.kind === "exit") {
    const target = owner.destination;
    if (target) {
      const query = new URLSearchParams({ scope: `${target.company}.${target.branch}`, eos: String(target.eos) });
      return <Link className={linkClass} href={`${exitPath}?${query}#payment-${target.payment}`}>Open Final Settlement</Link>;
    }
    return <p className="text-sm text-muted-foreground">Read-only history · Final Settlement</p>;
  }
  return <p className="text-sm text-muted-foreground">Read-only history</p>;
}

function AccountsCase({ row, branch, month }: { row: RecoveryCase; branch: number; month: string }) {
  if (!row.totals) return null;
  const t = row.totals;
  const a = { target: row.id, basis: row.accounts_basis };
  const fmt = (value: number) => money(value, row.currency);
  const metrics: [string, number][] = [
    ["Payable to authority", t.authority_payable], ["Eligible principal", t.principal],
    ["Collected and allocated", t.collected], ["Outstanding principal", t.outstanding],
    ["Held in dispute", t.disputed], ["Proposed this month", row.deduction?.amount ?? 0],
    ["Scheduled due through this month", row.deduction?.open_due ?? 0], ["Verified refund due", t.refund_due],
    ["Employee cash received", t.employee_cash_received], ["Employee cash allocated", t.employee_cash_allocated],
    ["Payroll collection awaiting allocation", t.unallocated_deduction], ["Refund awaiting allocation", t.unallocated_refund],
  ];
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">Accounts review</h2>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(([label, value]) => <div key={label} className="rounded-lg border p-3">
        <dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{fmt(value)}</dd>
      </div>)}
    </dl>
    {(!t.current_cost || t.unallocated) && <p role="status" className="text-sm">
      {!t.current_cost && "The current case requires financial reconciliation. "}
      {t.unallocated && "Review cash awaiting allocation before proposing another deduction."}
    </p>}
    <Panel title="Reconcile the supported cost">
      <RecoveryForm {...a} action="reconcile" label="Save verified cost">
        <div className={grid}><RecoveryField name="actual_cost" label="Actual supported cost" defaultValue={String(t.reconciled_cost ?? "")} />
          <RecoveryProof files={row.evidence} label="Financial proof in DMS" types={[financial]} branch={branch} /></div>
      </RecoveryForm>
    </Panel>
    <Panel title="Record a payment, credit or allocation">
      <RecoveryForm {...a} action="record-money" label="Save financial event">
        <div className={grid}>
          <RecoverySelect name="kind" label="Financial event" options={options(moneyKinds)} />
          <RecoveryField name="reference" label="Verified external reference" />
          <RecoveryField name="amount" label="Amount" />
          <RecoveryField name="date" label="Value date" type="date" />
          <RecoverySelect name="cash" label="Original receipt for a cash allocation" required={false}
            options={(row.money ?? []).filter(item => item.kind === "employee-cash" && item.reverses_id === null)
              .map(item => [String(item.id), item.reference + " · " + fmt(item.amount)] as const)} />
          <RecoveryProof files={row.evidence} label="Original proof in DMS" types={[financial, cash]} />
        </div>
      </RecoveryForm>
      {row.money?.map(item => <p key={item.id} className="text-sm">#{item.id} · {display(item.kind)} · {fmt(item.amount)} · {item.reference}
        {item.reverses_id && ` · Reverses #${item.reverses_id}`}</p>)}
    </Panel>
    {(row.money?.length ?? 0) > 0 && <Panel title="Reverse part or all of a financial event">
      <RecoveryForm {...a} action="reverse-money" label="Record linked reversal">
        <div className={grid}>
          <RecoverySelect name="event" label="Original event" options={(row.money ?? []).filter(item => item.reverses_id === null)
            .map(item => [String(item.id), "#" + item.id + " · " + display(item.kind) + " · " + item.reference] as const)} />
          <RecoveryField name="amount" label="Amount to reverse" />
          <RecoveryField name="date" label="Correction date" type="date" />
          <RecoveryField name="reference" label="Correction reference" />
          <RecoveryProof files={row.evidence} label="Correction proof in DMS" types={[correction]} />
        </div>
      </RecoveryForm>
    </Panel>}
    {row.schedules?.map(schedule => <p key={schedule.id} className="rounded-lg border p-3 text-sm">
      Schedule #{schedule.id} · {display(schedule.mode)} · {fmt(schedule.principal)} · {schedule.instalments.map(item => item.month.slice(0, 7) + " " + fmt(item.amount)).join(", ")}
    </p>)}
    {t.remaining > 0 && !t.unallocated && <Panel title="Propose a repayment schedule">
      <RecoveryForm {...a} action="propose-schedule" label="Save schedule proposal"><ScheduleFields month={month} /></RecoveryForm>
      <p className="text-sm text-muted-foreground">The GM decides the exact repayment amount with the payroll version.</p>
    </Panel>}
    {row.receipts?.map(receipt => <Panel title={`Verified receipt #${receipt.id} · ${fmt(receipt.amount)}`} key={receipt.id}>
      <p className="text-sm">Schedule #{receipt.schedule} · {receipt.month.slice(0, 7)} · {fmt(receipt.approved)} approved</p>
      {receipt.amount > 0 && receipt.owner?.kind === "recovery" && receipt.owner.can_reconcile ? <RecoveryForm {...a} action="allocate" label="Allocate to this approved line">
        <input type="hidden" name="receipt" value={receipt.id} /><input type="hidden" name="pin" value={receipt.pin} />
        <input type="hidden" name="line" value={receipt.line} /><input type="hidden" name="month" value={receipt.month} />
        <input type="hidden" name="schedule" value={receipt.schedule} />
        <RecoveryField name="amount" label="Verified line amount to allocate" />
      </RecoveryForm> : <HistoryOwner owner={receipt.owner} />}
    </Panel>)}
    {row.allocations?.map(item => <Panel key={item.id}
      title={`${item.reverses === null ? "Allocation" : "Reversal"} #${item.id} · ${fmt(item.amount)}`}>
      {item.reverses !== null && <p className="text-sm">Reverses allocation #{item.reverses}</p>}
      {item.reverses === null && item.owner?.kind === "recovery" && item.owner.can_reconcile ? <RecoveryForm {...a} action="reverse" label="Reverse this allocation">
        <input type="hidden" name="allocation" value={item.id} /><RecoveryField name="amount" label="Amount to reverse" />
      </RecoveryForm> : <HistoryOwner owner={item.owner} />}
      {item.reverses === null && t.refund_due > 0 && <RecoveryForm {...a} action="propose-refund" label="Propose linked refund">
        <input type="hidden" name="allocation" value={item.id} />
        <div className={grid}><RecoveryField name="amount" label="Proposed refund amount" />
          <RecoveryField name="month" label="First eligible payroll month" type="month" /></div>
      </RecoveryForm>}
    </Panel>)}
    {row.refunds?.map(refund => <Panel key={refund.id}
      title={`Refund proposal #${refund.id} · ${fmt(refund.amount)}${refund.withdrawn ? " · Withdrawn" : ""}`}>
      <p className="text-sm">Original allocation #{refund.allocation} · First eligible month {refund.month.slice(0, 7)}</p>
      {!refund.withdrawn && !refund.open_attempt && <RecoveryForm {...a} action="withdraw-refund" label="Withdraw remaining proposal">
        <input type="hidden" name="refund" value={refund.id} />
      </RecoveryForm>}
    </Panel>)}
  </section>;
}

export async function RecoveryWorkspace({ query }: {
  query: { branch?: string; month?: string; case?: string; before?: string };
}) {
  const scopes = await listRecoveryScopes();
  const requested = fleetId.safeParse(Number(query.branch)).data;
  const selected = requested ? scopes?.find(scope => scope.id === requested) : scopes?.length === 1 ? scopes[0] : undefined;
  const caseId = fleetId.safeParse(Number(query.case)).data;
  const before = fleetId.safeParse(Number(query.before)).data;
  const month = recoveryMonth.safeParse(query.month + "-01").data ?? dubaiBusinessDate().slice(0, 7) + "-01";
  const currentMonth = month.slice(0, 7);
  const data = selected ? await readRecoveryWorkspace(selected.id, month, caseId, before) : null;
  const row = data?.case;
  function href(branch: number, caseId?: number, cursor?: number) {
    const value = new URLSearchParams({ branch: String(branch), month: currentMonth });
    if (caseId) value.set("case", String(caseId));
    if (cursor) value.set("before", String(cursor));
    return route + "?" + value;
  }
  return <main className="space-y-5">
    <ERPPageHeader title="Fines and recovery" description={selected && selected.company + " · " + selected.branch}
      breadcrumbs={[{ label: "Human Resources" }, { label: "Fines and recovery" }]} />
    {!scopes ? <p role="alert">Recovery branches could not be loaded.</p> :
      scopes.length === 0 ? <p>No recovery branches are assigned.</p> :
      <nav aria-label="Recovery branch" className="flex flex-wrap gap-2">{scopes.map(scope => <Link key={scope.id}
        className="rounded-md border px-3 py-2 text-sm aria-[current=page]:bg-muted"
        aria-current={scope.id === selected?.id ? "page" : undefined} href={href(scope.id)}>{scope.company} · {scope.branch}</Link>)}</nav>}
    {selected && !data && <p role="alert">This recovery case or branch could not be loaded.</p>}
    {selected && data && <>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="branch" value={selected.id} />{caseId && <input type="hidden" name="case" value={caseId} />}
        <label className="grid gap-1 text-sm">Payroll review month<Input name="month" type="month" defaultValue={currentMonth} required /></label>
        <Button type="submit" variant="outline">Apply month</Button>
      </form>
      {(data.can_review || data.can_reconcile) && <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cases</h2>
        {data.cases.length === 0 ? <p className="text-sm text-muted-foreground">No cases in this branch.</p> :
          <ul className="divide-y rounded-lg border">{data.cases.map(item => <li key={item.id}>
            <Link className="block px-3 py-2 text-sm aria-[current=page]:bg-muted" href={href(selected.id, item.id, before)}
              aria-current={item.id === row?.id ? "page" : undefined}>
              #{item.id} · {display(item.source_kind)} · {formatDate.format(new Date(item.occurred_at))} · {display(item.subject_status)}
            </Link>
          </li>)}</ul>}
        {data.cases.length === 100 && <Link className="text-primary underline" href={href(selected.id, undefined, data.cases[99].id)}>Older cases</Link>}
      </section>}
      {row && <section className="space-y-4 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">{display(row.source_kind)} #{row.id} · {money(row.source_amount, row.currency)}</h2>
        <p className="text-sm">{display(row.source_status)} · {display(row.subject_status)}{row.employee_id && ` · Employee #${row.employee_id}`}
          {row.incident_id && ` · Incident #${row.incident_id}`}</p>
        <ProofLinks files={row.evidence} />
        {data.can_print && <a className="text-sm text-primary underline" href={outputPath("recovery", row.id)}>Print restricted recovery review</a>}
        {data.can_review && <HrCase row={row} branch={selected.id} />}
        {data.can_reconcile && <AccountsCase row={row} branch={selected.id} month={currentMonth} />}
      </section>}
      {data.can_manage_policy && <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recovery policies</h2>
        {data.policies.map(policy => <Panel key={policy.id} title={`Policy #${policy.id} · ${display(policy.kind)} · ${policy.approved_at ? "Approved" : "Pending"}`}>
          <p className="text-sm">{policy.validity} · {policy.legal_basis} · {money(policy.case_limit, policy.currency)} case limit · {money(policy.period_limit, policy.currency)} period limit</p>
          {!policy.approved_at && <RecoveryForm action="approve-policy" target={selected.id} label="Approve this exact policy">
            <input type="hidden" name="policy" value={policy.id} />
          </RecoveryForm>}
        </Panel>)}
        <Panel title="Prepare a dated recovery policy">
          <RecoveryForm action="prepare-policy" target={selected.id} label="Save policy for independent approval">
            <div className={grid}>
              <RecoverySelect name="kind" label="Case type" options={options(["fine", "damage"])} />
              <RecoveryField name="currency" label="Currency code" defaultValue="AED" />
              <RecoveryField name="from" label="Effective from" type="date" />
              <RecoveryField name="until" label="Effective until (exclusive)" type="date" />
              <RecoveryField name="legal_basis" label="Approved recovery basis" />
              <RecoveryField name="case_limit" label="Case limit" />
              <RecoveryField name="period_limit" label="Monthly limit" />
              <RecoverySelect name="wage_basis" label="Wage basis" options={options(["fixed-amount", "gross-wage", "basic-wage", "daily-wage"])} />
              <RecoveryField name="wage_factor" label="Wage fraction or day count, if applicable" required={false} />
              <RecoveryField name="priority" label="Payroll priority (1 is first)" type="number" />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allow_deduct_correct" />Allow deduct and correct</label>
          </RecoveryForm>
        </Panel>
      </section>}
    </>}
  </main>;
}
