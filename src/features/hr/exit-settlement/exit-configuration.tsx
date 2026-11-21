import type { ReactNode } from "react";
import { ExitConfigurationForm } from "./exit-configuration-form";
import { dateLabel, label, money, type ExitAccess, type ExitCase, type ExitPolicy, type ExitScope } from "./exit-settlement-contract";

const quiet = "text-sm text-muted-foreground";
const digestPattern = /^[a-f0-9]{64}$/i;
const card = "space-y-3 rounded-md border p-3";

function Facts({ entries }: { entries: Array<[string, ReactNode]> }) {
  return <dl className="grid gap-2 sm:grid-cols-2">
    {entries.map(([title, value]) => <div key={title}>
      <dt className={quiet}>{title}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>)}
  </dl>;
}

function PolicyFacts({ policy }: { policy: ExitPolicy }) {
  const facts = policy.facts;
  const benefit = facts.benefit;
  return <>
    <Facts entries={[
      ["Salary proration", label(facts.proration) + (facts.fixed_days ? " · " + facts.fixed_days : "")],
      ["Absences to deduct", label(facts.absence)],
      ["Annual-leave wage basis", label(facts.leave_wage_basis)],
      ["Unused leave payout", label(facts.leave_cashout) + (facts.leave_cashout_divisor ? " · Divisor " + facts.leave_cashout_divisor : "")],
      ["Daily recovery wage basis", label(facts.daily_recovery_basis)],
      ["Maximum recovery", new Intl.NumberFormat("en-AE", { style: "percent", maximumFractionDigits: 2 }).format(Number(facts.recovery_fraction))],
      ["Minimum pay after recovery", money(facts.net_floor, "")],
      ["Approved payment channels", facts.payment_channels.map(label).join(" · ")],
      ["Termination benefit", label(benefit.mode)],
    ]} />
    {benefit.mode === "tiered-basic" && <div className="border-t pt-3">
      <Facts entries={[
        ["Service basis", label(benefit.service)],
        ["Eligible exit types", benefit.exit_types.map(label).join(" · ")],
        ["Exclude unpaid service days", benefit.exclude_unpaid ? "Yes" : "No"],
        ["Minimum eligible service days", benefit.minimum_days],
        ["Years in first band", benefit.first_band_years],
        ["Benefit days per year in first band", benefit.first_days_per_year],
        ["Benefit days per year after first band", benefit.later_days_per_year],
        ["Monthly wage divisor", benefit.day_divisor],
        ["Days per service year", benefit.year_divisor],
        ["Maximum benefit days", benefit.cap_days],
      ]} />
    </div>}
  </>;
}

export function ExitPolicies({ policies, scope, access }: {
  policies: readonly ExitPolicy[]; scope: ExitScope; access: ExitAccess;
}) {
  const scopeProps = { company: scope.company, branch: scope.branch };
  return <details className="rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Calculation policies</summary>
    <div className="mt-3 space-y-3">
      {policies.length === 0 && <p className={quiet}>There are no calculation policies for this employer and branch.</p>}
      {policies.map(policy => <details className={card} key={policy.id}>
        <summary className="cursor-pointer text-sm font-medium">
          Policy {policy.id} · {label(policy.status)} · {dateLabel(policy.from)} to before {dateLabel(policy.until)}
        </summary>
        <p className="text-sm">{policy.reason}</p>
        <PolicyFacts policy={policy} />
        {access.approve && policy.status === "proposed" && policy.can_decide && digestPattern.test(policy.digest) &&
          <ExitConfigurationForm key={policy.id + ":" + policy.digest} {...scopeProps} domain="policy"
            title={"Decide policy " + policy.id} target={{ id: policy.id, digest: policy.digest }} />}
      </details>)}
      {access.accounts && <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">New calculation policy</summary>
        <ExitConfigurationForm {...scopeProps} domain="policy" title="Propose calculation policy" />
      </details>}
    </div>
  </details>;
}

export function ExitAdjustments({ caseDetails, scope, access }: {
  caseDetails: ExitCase; scope: ExitScope; access: ExitAccess;
}) {
  const { adjustments, can_propose_adjustment: mayPropose } = caseDetails;
  if (!adjustments) return null;
  const scopeProps = { company: scope.company, branch: scope.branch, eos: caseDetails.id };
  return <details className="rounded-lg border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Settlement adjustments</summary>
    <div className="mt-3 space-y-3">
      {adjustments.length === 0 && <p className={quiet}>There are no adjustment proposals for this exit.</p>}
      {adjustments.map(item => <div className={card} key={item.id}>
        <p className="text-sm font-medium">Adjustment {item.id} · {label(item.kind)} · {money(item.amount, item.currency)} · {label(item.status)}</p>
        <p className={quiet}>{item.reason}{item.evidence_attached ? " · Verified evidence retained" : ""}</p>
        {access.hr && item.status === "proposed" && item.can_decide && digestPattern.test(item.digest) &&
          <ExitConfigurationForm key={item.id + ":" + item.digest} {...scopeProps} domain="adjustment"
            title={"Review adjustment " + item.id} target={{ id: item.id, digest: item.digest }} />}
      </div>)}
      {access.accounts && mayPropose && <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">New adjustment</summary>
        <ExitConfigurationForm {...scopeProps} domain="adjustment" title="Propose adjustment" />
      </details>}
    </div>
  </details>;
}
