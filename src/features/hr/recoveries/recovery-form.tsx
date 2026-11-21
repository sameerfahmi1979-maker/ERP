
"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecoveryAction, RecoveryEvidence } from "@/lib/hr/recovery-contract";
import { saveRecovery } from "@/server/actions/hr/recoveries";

export const selectClass = "min-h-9 rounded-md border border-input bg-background px-3 text-sm";

export function RecoveryForm({ action, target, basis, label, children }: {
  action: RecoveryAction; target: number; basis?: string | null; label: string; children?: ReactNode;
}) {
  const router = useRouter();
  const nonce = useRef<string | null>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const form = event.currentTarget;
    nonce.current ??= crypto.randomUUID();
    const payload = new FormData(form);
    if (basis) payload.set("basis", basis);
    try {
      const result = await saveRecovery(action, target, nonce.current, payload);
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        return;
      }
      nonce.current = null;
      form.reset();
      setMessage({ text: "Saved." });
      router.refresh();
    } catch {
      setMessage({ text: "The save could not be confirmed. Retry with the same details.", error: true });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <form onSubmit={submit} onChange={() => { if (!pending.current) nonce.current = null; }} className="space-y-3">
    <fieldset disabled={busy} className="space-y-3">
      {children}
      <label className="grid gap-1 text-sm">Reason<Input name="reason" required maxLength={2000} /></label>
      <Button size="sm" type="submit">{busy ? "Saving…" : label}</Button>
    </fieldset>
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
  </form>;
}

export function RecoveryField({ name, label, type = "text", defaultValue, required = true }: {
  name: string; label: string; type?: string; defaultValue?: string; required?: boolean;
}) {
  return <label className="grid content-start gap-1 text-sm">{label}
    <Input name={name} type={type} defaultValue={defaultValue} required={required}
      inputMode={type === "text" && (name.includes("amount") || name.includes("limit")) ? "decimal" : undefined} />
  </label>;
}

export function RecoverySelect({ name, label, options, required = true, initial }: {
  name: string; label: string; options: readonly (readonly [string, string])[]; required?: boolean; initial?: string;
}) {
  return <label className="grid content-start gap-1 text-sm">{label}
    <select className={selectClass} name={name} required={required} defaultValue={initial ?? ""}>
      <option value="">Select</option>
      {options.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
    </select>
  </label>;
}

export function RecoveryProof({ name = "evidence", label, files, types, branch, required = true }: {
  name?: string; label: string; files: RecoveryEvidence[]; types: string[]; branch?: number; required?: boolean;
}) {
  const available = files.filter(file => types.includes(file.type) && (!branch || file.branch === branch));
  return <RecoverySelect name={name} label={label} required={required}
    options={available.map(file => [file.document + "/" + file.version + "/" + file.file, file.label] as const)} />;
}

export function ScheduleFields({ month }: { month: string }) {
  const [installments, setInstallments] = useState(false);
  const [months, setMonths] = useState(2);
  return <>
    <label className="grid gap-1 text-sm">Repayment
      <select className={selectClass} name="mode" value={installments ? "instalments" : "one-time"}
        onChange={event => setInstallments(event.target.value === "instalments")}>
        <option value="one-time">One payment</option><option value="instalments">Instalments</option>
      </select>
    </label>
    {Array.from({ length: installments ? months : 1 }, (_, index) => <div key={index} className="grid gap-2 sm:grid-cols-2">
      <RecoveryField name="month" label={installments ? "Instalment " + (index + 1) + " month" : "Payment month"}
        type="month" defaultValue={index === 0 ? month : undefined} />
      <RecoveryField name="amount" label="Amount" />
    </div>)}
    {installments && <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" disabled={months >= 120} onClick={() => setMonths(value => value + 1)}>Add month</Button>
      <Button type="button" size="sm" variant="outline" disabled={months <= 2} onClick={() => setMonths(value => value - 1)}>Remove last month</Button>
    </div>}
  </>;
}
