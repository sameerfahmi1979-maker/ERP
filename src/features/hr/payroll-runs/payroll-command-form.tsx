"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PayrollRefreshNotice } from "@/features/hr/payroll/payroll-refresh-notice";
import { usePayrollCommand } from "@/hooks/use-payroll-command";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PayrollAction, PayrollEvidence, PayrollLine } from "@/lib/hr/payroll/run-contract";
import { savePayrollCommand } from "@/server/actions/hr/payroll-runs";

export const payrollSelectClass = "min-h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type FormProps = {
  action: PayrollAction;
  company: number;
  branch: number;
  label: string;
  children?: ReactNode;
  returnTo?: string;
  variant?: "default" | "outline";
};

export function PayrollCommandForm({ action, company, branch, label, children, returnTo, variant = "default" }: FormProps) {
  const router = useRouter();
  const mutation = usePayrollCommand(
    (request: { action: PayrollAction; company: number; branch: number; operation: string; data: FormData; form: HTMLFormElement }) =>
      savePayrollCommand(request.action, request.company, request.branch, request.operation, request.data),
    {
      target: "runs",
      onSuccess(request) {
        request.form.reset();
        return request.action === "calculate" ? "Payroll draft saved." : "Saved.";
      },
      updateView: returnTo ? () => {
        const { pathname, search, hash } = window.location;
        if (returnTo !== pathname + search + hash) router.push(returnTo);
      } : undefined,
      unconfirmed: "The save could not be confirmed. Retry the same request.",
    },
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    return mutation.submit(() => ({ action, company, branch, operation: crypto.randomUUID(), data: new FormData(form), form }));
  }

  const { busy, locked, retry, refreshError, message } = mutation;
  return <form onSubmit={submit} className="space-y-3">
    <fieldset disabled={locked} className="min-w-0 space-y-3">
      {children}
      <label className="grid gap-1.5 text-sm font-medium">Reason
        <Textarea name="reason" required maxLength={2000} rows={2} />
      </label>
      <Button type="submit" variant={variant} size="sm">{busy ? "Saving…" : label}</Button>
    </fieldset>
    {retry && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void mutation.submit()}>
      Retry same request
    </Button>}
    {refreshError && <PayrollRefreshNotice busy={busy} retry={() => void mutation.retryRefresh()} />}
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {message.text}
    </p>}
  </form>;
}

export function PayrollChoice({ name, label, options, defaultValue = "", required = true }: {
  name: string; label: string; options: [value: string, label: string][];
  defaultValue?: string; required?: boolean;
}) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}
    <select name={name} className={payrollSelectClass} defaultValue={defaultValue} required={required}>
      <option value="">{required ? "Select" : "All payroll groups"}</option>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </label>;
}

export function PayrollRuleFields({ groups }: { groups: { id: number; name: string }[] }) {
  const [proration, setProration] = useState("calendar-days");
  const wages: [string, string][] = [["basic", "Basic salary"], ["gross", "Gross salary"]];
  return <div className="grid gap-3 sm:grid-cols-2">
    <PayrollChoice name="group_id" label="Payroll group" options={groups.map(group => [String(group.id), group.name])} required={false} />
    <label className="grid gap-1.5 text-sm font-medium">Proration
      <select name="proration" className={payrollSelectClass} value={proration} onChange={event => setProration(event.target.value)}>
        <option value="calendar-days">Calendar days in the month</option>
        <option value="fixed-days">Approved fixed day count</option>
      </select>
    </label>
    {proration === "fixed-days" && <label className="grid gap-1.5 text-sm font-medium">Fixed day count
      <Input name="fixed_days" type="number" min="1" max="31" step="1" required />
    </label>}
    <label className="grid gap-1.5 text-sm font-medium">First payroll month
      <Input name="from" type="month" required />
    </label>
    <label className="grid gap-1.5 text-sm font-medium">End month (exclusive)
      <Input name="until" type="month" required />
    </label>
    <PayrollChoice name="absence" label="Attendance deductions" options={[
      ["unpaid-only", "Deduct unpaid leave only"], ["verified-absence", "Also deduct verified absences"],
    ]} />
    <PayrollChoice name="leave_wage_basis" label="Wage basis for leave deductions" options={wages} />
    <PayrollChoice name="daily_recovery_basis" label="Wage basis for daily recovery limits" options={wages} />
    <label className="grid gap-1.5 text-sm font-medium">Maximum share for recoveries
      <Input name="recovery_fraction" inputMode="decimal" placeholder="0 to 1" pattern="(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)" required />
    </label>
    <label className="grid gap-1.5 text-sm font-medium">Minimum net pay
      <Input name="net_floor" inputMode="decimal" placeholder="0.00" required />
    </label>
  </div>;
}

export function PayrollAdjustmentFields({ choices, evidence }: {
  choices: { key: PayrollLine["key"]; currency: PayrollLine["currency"]; label: string }[];
  evidence: PayrollEvidence[];
}) {
  const [key, setKey] = useState("");
  const source = choices.find(line => line.key === key);
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Original payroll line
        <select name="source_key" className={payrollSelectClass} required onChange={event => setKey(event.target.value)}>
          <option value="">Select the line to adjust</option>
          {choices.map(line => <option key={line.key} value={line.key}>{line.label}</option>)}
        </select>
      </label>
      <PayrollChoice name="kind" label="Adjustment type" options={[["earning", "Add an earning"], ["deduction", "Add a deduction"]]} />
      <label className="grid gap-1.5 text-sm font-medium">Amount{source && " (" + source.currency + ")"}
        <Input name="amount" inputMode="decimal" required />
      </label>
      <input type="hidden" name="currency" value={source?.currency ?? ""} />
      <div className="sm:col-span-2">
        <PayrollChoice name="evidence" label="Verified evidence" options={evidence.map(row => [
          row.document + "/" + row.version + "/" + row.file, row.label,
        ])} />
      </div>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer text-primary">Preview available evidence</summary>
      <ul className="mt-2 space-y-1 pl-4">
        {evidence.map(row => <li key={row.file}><a className="underline" href={"/api/dms/file?fileId=" + row.file}
          target="_blank" rel="noreferrer">{row.label}</a></li>)}
      </ul>
    </details>
  </>;
}
