"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PayrollRefreshNotice } from "@/features/hr/payroll/payroll-refresh-notice";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { changeExitConfiguration } from "@/server/actions/hr/final-settlement";
import { field, ProofFields, readProof } from "./exit-settlement-command";
import { label, selectClassName, type ExitPolicyFacts } from "./exit-settlement-contract";
import { useExitMutation } from "./use-exit-mutation";

type ConfigAction = "propose" | "approve" | "verify" | "reject";
type Request = {
  operation: string; company: number; branch: number; eos?: number;
  domain: "policy" | "adjustment"; action: ConfigAction; data: Record<string, unknown>;
};
type ConfigFormProps = Pick<Request, "company" | "branch" | "eos" | "domain"> & {
  title: string;
  target?: { id: number; digest: string };
};
type FormInput = { data: Record<string, unknown> } | { error: string };
const labelClassName = "grid gap-1.5 text-sm font-medium";
const grid = "grid gap-3 sm:grid-cols-2";
const wageBasis = ["basic", "gross"] as const;
const prorationModes = ["calendar-days", "fixed-days"] as const;
const absenceModes = ["unpaid-only", "verified-absence"] as const;
const cashoutModes = ["current-and-approved-carry", "none"] as const;
const benefitModes = ["tiered-basic", "none"] as const;
const serviceModes = ["current-period", "continuous-employer"] as const;
const deductionKinds = ["earning", "deduction"] as const;
const channels = ["exit-bank-transfer", "exit-cheque"] as const;
const exitTypes = ["resignation", "termination", "contract_end", "absconding", "death", "other"] as const;

const benefitFields = [
  { name: "minimum_days", title: "Minimum eligible service days", min: 0, max: 36500, scale: 0 },
  { name: "first_band_years", title: "Years in first band", min: 0, max: 100, scale: 2 },
  { name: "first_days_per_year", title: "Benefit days per year in first band", min: 0, max: 366, scale: 4 },
  { name: "later_days_per_year", title: "Benefit days per year after first band", min: 0, max: 366, scale: 4 },
  { name: "day_divisor", title: "Monthly wage divisor", min: 1, max: 31, scale: 0 },
  { name: "year_divisor", title: "Days per service year", min: 1, max: 366, scale: 0 },
  { name: "cap_days", title: "Maximum benefit days", min: 0, max: 36600, scale: 4 },
] as const;

function getChoice<Value extends string>(form: FormData, name: string, values: readonly Value[]) {
  const input = field(form, name);
  return values.find(value => value === input);
}

function getChoices<Value extends string>(form: FormData, name: string, values: readonly Value[]) {
  const input = form.getAll(name);
  return values.filter(value => input.includes(value));
}

function decimal(form: FormData, key: string, min: number, max: number, scale: number) {
  const value = field(form, key);
  const match = /^\d{1,14}(?:\.(\d{1,4}))?$/.exec(value);
  return match && (match[1]?.length ?? 0) <= scale && Number(value) >= min && Number(value) <= max
    ? value : undefined;
}

function dateValue(form: FormData, key: string) {
  const value = field(form, key);
  const date = new Date(value);
  return /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value : undefined;
}

function percentageFraction(percent: string) {
  const [whole, fraction = ""] = percent.split(".");
  const digits = String(Number(whole + fraction.padEnd(2, "0"))).padStart(5, "0");
  return digits.slice(0, -4) + "." + digits.slice(-4);
}

function policyInput(form: FormData): FormInput {
  const from = dateValue(form, "from");
  const until = dateValue(form, "until");
  const proration = getChoice(form, "proration", prorationModes);
  const fixedDays = decimal(form, "fixed_days", 1, 31, 0);
  const absence = getChoice(form, "absence", absenceModes);
  const leaveWage = getChoice(form, "leave_wage_basis", wageBasis);
  const leaveCashout = getChoice(form, "leave_cashout", cashoutModes);
  const leaveDivisor = decimal(form, "leave_cashout_divisor", 1, 31, 0);
  const recoveryBasis = getChoice(form, "daily_recovery_basis", wageBasis);
  const recoveryPercent = decimal(form, "recovery_percent", 0, 100, 2);
  const netFloor = decimal(form, "net_floor", 0, 999999999999.99, 2);
  const paymentChannels = getChoices(form, "payment_channels", channels);
  const benefitMode = getChoice(form, "benefit", benefitModes);
  if (!from || !until || from >= until || !proration || !absence || !leaveWage || !leaveCashout || !recoveryBasis
      || !recoveryPercent || !netFloor || !paymentChannels.length || !benefitMode
      || (proration === "fixed-days" && !fixedDays) || (leaveCashout === "current-and-approved-carry" && !leaveDivisor)) {
    return { error: "Enter the exact policy dates, salary, leave, recovery and payment rules." };
  }

  let benefit: ExitPolicyFacts["benefit"] = { mode: "none" };
  if (benefitMode === "tiered-basic") {
    const service = getChoice(form, "service", serviceModes);
    const applicableExits = getChoices(form, "exit_types", exitTypes);
    const exclusion = getChoice(form, "exclude_unpaid", ["yes", "no"]);
    const amounts = benefitFields.map(rule => decimal(form, rule.name, rule.min, rule.max, rule.scale));
    if (!service || !applicableExits.length || !exclusion || amounts.some(amount => amount === undefined)) {
      return { error: "Enter the verified service rules and values for the termination benefit." };
    }
    const [minimum_days, first_band_years, first_days_per_year, later_days_per_year, day_divisor, year_divisor, cap_days] =
      amounts as [string, string, string, string, string, string, string];
    benefit = {
      mode: benefitMode, service, exit_types: applicableExits, exclude_unpaid: exclusion === "yes",
      minimum_days, first_band_years, first_days_per_year, later_days_per_year, day_divisor, year_divisor, cap_days,
    };
  }

  const facts: ExitPolicyFacts = {
    proration, absence, benefit, leave_wage_basis: leaveWage, leave_cashout: leaveCashout,
    ...(proration === "fixed-days" ? { fixed_days: fixedDays } : {}),
    ...(leaveCashout === "current-and-approved-carry" ? { leave_cashout_divisor: leaveDivisor } : {}),
    daily_recovery_basis: recoveryBasis, recovery_fraction: percentageFraction(recoveryPercent),
    net_floor: netFloor, payment_channels: paymentChannels,
  };
  return { data: { from, until, facts } };
}

function adjustmentInput(form: FormData): FormInput {
  const kind = getChoice(form, "kind", deductionKinds);
  const amount = decimal(form, "amount", 0.01, 999999999999.99, 2);
  const currency = field(form, "currency").toUpperCase();
  if (!kind || !amount || !/^[A-Z]{3}$/.test(currency)) {
    return { error: "Enter the adjustment type, positive amount and salary currency." };
  }
  const proof = readProof(form, true);
  return "error" in proof ? proof : { data: { kind, amount, currency, ...proof.fields } };
}

function FieldSelect({ name, title, options, onChange }: {
  name: string; title: string; options: readonly string[]; onChange?: (value: string) => void;
}) {
  return <label className={labelClassName}>
    {title}
    <select name={name} defaultValue="" required className={selectClassName}
      onChange={onChange ? event => onChange(event.target.value) : undefined}>
      <option value="" disabled>Select an option</option>
      {options.map(option => <option key={option} value={option}>{label(option)}</option>)}
    </select>
  </label>;
}

function FieldChecks({ name, title, options }: { name: string; title: string; options: readonly string[] }) {
  return <fieldset className="grid gap-2 rounded-md border p-3">
    <legend className="px-1 text-sm font-medium">{title}</legend>
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {options.map(option => <label className="flex items-center gap-2 text-sm" key={option}>
        <input type="checkbox" name={name} value={option} className="size-4 accent-primary" />
        {label(option)}
      </label>)}
    </div>
  </fieldset>;
}

function DecimalField({ name, title, scale }: { name: string; title: string; scale: number }) {
  return <label className={labelClassName}>{title}
    <Input name={name} inputMode={scale ? "decimal" : "numeric"} maxLength={14 + (scale ? scale + 1 : 0)} required />
  </label>;
}

function PolicyFields() {
  const [proration, setProration] = useState("");
  const [cashout, setCashout] = useState("");
  const [benefit, setBenefit] = useState("");
  return <>
    <div className={grid}>
      <label className={labelClassName}>Effective from<Input name="from" type="date" required /></label>
      <label className={labelClassName}>Effective until (excluded)<Input name="until" type="date" required /></label>
      <FieldSelect name="proration" title="Salary proration" options={prorationModes} onChange={setProration} />
      {proration === "fixed-days" && <DecimalField name="fixed_days" title="Fixed salary divisor" scale={0} />}
      <FieldSelect name="absence" title="Absences to deduct" options={absenceModes} />
      <FieldSelect name="leave_cashout" title="Unused leave payout" options={cashoutModes} onChange={setCashout} />
      {cashout === "current-and-approved-carry" && <DecimalField name="leave_cashout_divisor" title="Unused leave payout divisor" scale={0} />}
      <FieldSelect name="leave_wage_basis" title="Annual-leave wage basis" options={wageBasis} />
      <FieldSelect name="daily_recovery_basis" title="Daily recovery wage basis" options={wageBasis} />
      <DecimalField name="recovery_percent" title="Maximum recovery percentage" scale={2} />
      <DecimalField name="net_floor" title="Minimum pay after recovery" scale={2} />
    </div>
    <FieldChecks name="payment_channels" title="Approved payment channels" options={channels} />
    <FieldSelect name="benefit" title="Termination benefit" options={benefitModes} onChange={setBenefit} />
    {benefit === "tiered-basic" && <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Termination benefit rules</legend>
      <div className={grid}>
        <FieldSelect name="service" title="Service basis" options={serviceModes} />
        <FieldSelect name="exclude_unpaid" title="Exclude unpaid service days" options={["yes", "no"]} />
        {benefitFields.map(rule => <DecimalField key={rule.name} {...rule} />)}
      </div>
      <FieldChecks name="exit_types" title="Eligible exit types" options={exitTypes} />
    </fieldset>}
  </>;
}

function AdjustmentFields() {
  return <>
    <div className={grid}>
      <FieldSelect name="kind" title="Adjustment type" options={deductionKinds} />
      <DecimalField name="amount" title="Adjustment amount" scale={2} />
      <label className={labelClassName}>Salary currency<Input name="currency" maxLength={3} required /></label>
    </div>
    <ProofFields required />
  </>;
}

export function ExitConfigurationForm({ company, branch, eos, domain, title, target }: ConfigFormProps) {
  const [formVersion, setFormVersion] = useState(0);
  const { submit: record, retry, busy: working, locked, refreshError, retryRefresh, message, setMessage } =
    useExitMutation<Request>(changeExitConfiguration, () => setFormVersion(version => version + 1));
  const decisions = domain === "policy" ? ["approve", "reject"] as const : ["verify", "reject"] as const;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    const form = new FormData(event.currentTarget);
    const reason = field(form, "reason");
    const action = target ? getChoice(form, "decision", decisions) : "propose";
    if (!action || reason.length < 4 || reason.length > 2000) {
      setMessage({ error: true, text: "Enter a decision where required and a reason of at least four characters." });
      return;
    }
    const result: FormInput = target ? { data: { [domain]: target.id, digest: target.digest } }
      : domain === "policy" ? policyInput(form) : adjustmentInput(form);
    if ("error" in result) {
      setMessage({ error: true, text: result.error });
      return;
    }
    void record(() => ({ operation: crypto.randomUUID(), company, branch, ...(eos ? { eos } : {}), domain, action,
      data: { ...result.data, reason } }));
  }

  return <form aria-label={title} onSubmit={submit} className="space-y-3">
    <fieldset key={formVersion} disabled={locked} className="grid gap-3">
      {target ? <FieldSelect name="decision" title="Decision" options={decisions} />
        : domain === "policy" ? <PolicyFields /> : <AdjustmentFields />}
      <label className={labelClassName}>Reason<Textarea name="reason" minLength={4} maxLength={2000} required rows={2} /></label>
      <Button type="submit" size="sm" className="justify-self-start">{title}</Button>
    </fieldset>
    {working && <p role="status" className="text-sm text-muted-foreground">Recording settlement action…</p>}
    {message && <p role={!message.error ? "status" : "alert"} className={!message.error ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{message.text}</p>}
    {retry && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void record()}>Retry same request</Button>}
    {refreshError && <PayrollRefreshNotice busy={working} retry={() => void retryRefresh()} />}
  </form>;
}
