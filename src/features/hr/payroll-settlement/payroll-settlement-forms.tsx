"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  payrollPaymentReasonIsWithinLimit, payrollPaymentReasonLimit, payrollSettlementRequest,
  type PayrollEvidenceOption, type PayrollHandoffAction, type PayrollSettlementAction, type PayrollSettlementPayment,
  type PayrollSettlementRequest, type PayrollSettlementResult, type PayrollSettlementReview,
} from "@/lib/hr/payroll/settlement-contract";
import { listPayrollEvidenceOptions, savePayrollSettlementCommand } from "@/server/actions/hr/payroll-settlement";

type Scope = { company: number; branch: number };
type ExactReceipt = Pick<PayrollSettlementPayment, "id" | "allocation_revision">;
type ReceiptSubject = Pick<PayrollSettlementResult, "employee" | "channel" | "currency">;
type AllocationSubject = Pick<PayrollSettlementResult, "lines" | "currency">;
const formLabels: Record<PayrollSettlementAction, string> = {
  issue: "Prepare WPS files",
  "start-handoff": "Start handoff",
  "record-submission": "Record bank submission",
  acknowledge: "Record bank acknowledgment",
  accept: "Record bank acceptance",
  reject: "Record bank rejection",
  cancel: "Record confirmed cancellation",
  "correct-file": "Prepare linked correction",
  "authorize-cheque": "Authorize cheque settlement",
  "authorize-zero": "Authorize zero net settlement",
  "cancel-cheque": "Record confirmed cheque cancellation",
  "cancel-zero": "Record confirmed zero net cancellation",
  receipt: "Record employee payment",
  allocate: "Allocate verified payment",
  reverse: "Reverse recorded payment",
};
const confirmation: Record<PayrollSettlementAction, string> = {
  issue: "Payroll files prepared.",
  "start-handoff": "Handoff recorded. Download the retained WPS file.",
  "record-submission": "Bank submission recorded.",
  acknowledge: "Bank acknowledgment recorded.",
  accept: "Bank acceptance recorded.",
  reject: "Bank rejection recorded.",
  cancel: "Confirmed cancellation recorded.",
  "correct-file": "Corrected file prepared.",
  "authorize-cheque": "Cheque settlement authorized.",
  "authorize-zero": "Zero net settlement authorized.",
  "cancel-cheque": "Cheque settlement cancellation recorded.",
  "cancel-zero": "Zero net settlement cancellation recorded.",
  receipt: "Employee payment result recorded.",
  allocate: "Allocation recorded.",
  reverse: "Payment reversal recorded.",
};
const selectClass = "min-h-9 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldContainerClass = "grid gap-3 sm:grid-cols-2";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
}

function PaymentReasonField({ label }: { label: string }) {
  const hintId = useId();
  return <div className="grid gap-1.5">
    <Field label={label}>
      <Textarea name="reason" rows={2} required aria-describedby={hintId} onInput={event => {
        const input = event.currentTarget;
        input.setCustomValidity(payrollPaymentReasonIsWithinLimit(input.value) ? ""
          : `Use ${payrollPaymentReasonLimit} characters or fewer.`);
      }} />
    </Field>
    <p id={hintId} className="text-xs text-muted-foreground">{payrollPaymentReasonLimit} characters maximum</p>
  </div>;
}

function value(form: FormData, name: string) {
  const input = form.get(name);
  return typeof input === "string" ? input : "";
}

function evidence(form: FormData) {
  return { document: Number(value(form, "document")), version: Number(value(form, "version")), file: Number(value(form, "file")) };
}

function CommandForm({ scope, label, build, children }: {
  scope: Scope;
  label: string;
  build: (data: FormData) => { action: PayrollSettlementAction; data: unknown } | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const original = useRef<PayrollSettlementRequest | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!original.current) {
      const request = build(new FormData(event.currentTarget));
      const parsed = payrollSettlementRequest.safeParse(request && { ...scope, ...request, operation: crypto.randomUUID() });
      if (!parsed.success) {
        setMessage({ text: "Check the required evidence and exact amounts.", error: true });
        return;
      }
      original.current = parsed.data;
    }

    const request = original.current;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await savePayrollSettlementCommand(request);
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        setRetry(result.uncertain);
        if (!result.uncertain) original.current = null;
        return;
      }
      original.current = null;
      setRetry(false);
      setResetKey(key => key + 1);
      setMessage({ text: confirmation[request.action], error: false });
      router.refresh();
    } catch {
      setRetry(true);
      setMessage({ text: "The outcome could not be confirmed. Retry the same request.", error: true });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <form onSubmit={submit} aria-label={label} className="space-y-3">
    <fieldset key={resetKey} disabled={busy || retry} className="min-w-0 space-y-3">{children}</fieldset>
    <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : retry ? "Retry same request" : label}</Button>
    {message && <p role={message.error ? "alert" : "status"}
      className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>}
  </form>;
}

function EvidenceFields({ scope }: { scope: Scope }) {
  const search = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [options, setOptions] = useState<PayrollEvidenceOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const option = options?.find(row => String(row.file) === selected);

  async function find() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    setSelected("");
    setOptions(null);
    try {
      const matches = await listPayrollEvidenceOptions({ ...scope, search: search.current?.value ?? "" });
      setOptions(matches);
      setError(matches === null);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="space-y-2 rounded-md border bg-muted/20 p-3">
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44 flex-1"><Field label="Find private bank evidence by title or document number">
        <Input ref={search} type="search" maxLength={120} autoComplete="off" onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            void find();
          }
        }} />
      </Field></div>
      <Button type="button" variant="outline" size="sm" onClick={find} disabled={busy}>{busy ? "Finding…" : "Find in DMS"}</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">Bank evidence could not be loaded. Check your access or retry.</p>}
    <Field label="Verified DMS original">
      <select className={selectClass} value={selected} required onChange={event => setSelected(event.target.value)}>
        <option value="">{options?.length === 0 ? "No permitted originals match" : "Choose an original"}</option>
        {options?.map(row => <option key={row.file} value={row.file}>{row.label}</option>)}
      </select>
    </Field>
    {option && <>
      <input type="hidden" name="document" value={option.document} />
      <input type="hidden" name="version" value={option.version} />
      <input type="hidden" name="file" value={option.file} />
      <a href={"/api/dms/file?fileId=" + option.file} target="_blank" rel="noreferrer"
        className="text-sm text-primary underline underline-offset-2">Open selected original</a>
    </>}
  </div>;
}

export function PrepareFiles({ scope, sealed }: { scope: Scope; sealed: Pick<PayrollSettlementReview, "review" | "version" | "digest"> }) {
  return <CommandForm scope={scope} label={formLabels.issue} build={() => ({ action: "issue", data: sealed })} />;
}

function HandoffFields({ scope, actions, retainedReference }: {
  scope: Scope; actions: PayrollHandoffAction[]; retainedReference?: string | null;
}) {
  const [choice, setChoice] = useState("");
  const selected = actions.length === 1 ? actions[0] : actions.find(action => action === choice) ?? "";
  return <>
    {actions.length > 1 && <Field label="Bank event">
      <select name="action" className={selectClass} value={selected} required onChange={event => {
        setChoice(event.target.value);
      }}>
        <option value="">Choose a bank event</option>
        {actions.map(action => <option key={action} value={action}>{formLabels[action]}</option>)}
      </select>
    </Field>}
    <Field label={selected === "start-handoff" ? "Handoff reference"
      : selected?.startsWith("authorize-") ? "Settlement authorization reference" : "Bank event reference"}>
      {retainedReference ? <Input name="reference" readOnly value={retainedReference} />
        : <Input name="reference" maxLength={100} autoComplete="off" required />}
    </Field>
    {selected === "start-handoff" && <p className="text-sm text-muted-foreground">
      Starting handoff makes the retained file available for download and blocks replacement while the outcome is pending.
    </p>}
    {selected && selected !== "start-handoff" && <EvidenceFields key={selected} scope={scope} />}
  </>;
}

export function HandoffForm({ scope, batch, wpsFile, actions, retainedReference }: {
  scope: Scope; batch: string; wpsFile?: string; actions: PayrollHandoffAction[]; retainedReference?: string | null;
}) {
  if (!actions.length) return null;
  const single = actions.length === 1 ? actions[0] : undefined;
  return <CommandForm scope={scope} label={single ? formLabels[single] : "Record bank event"} build={form => {
    const action = single ?? actions.find(item => item === value(form, "action"));
    if (!action) return null;
    const target = { batch, reference: value(form, "reference"), ...(wpsFile && { wps_file: wpsFile }) };
    return { action, data: action === "start-handoff" ? target : { ...target, ...evidence(form) } };
  }}>
    <HandoffFields scope={scope} actions={actions} retainedReference={retainedReference} />
  </CommandForm>;
}

function ReceiptFields({ scope, result }: { scope: Scope; result: ReceiptSubject }) {
  const [outcome, setOutcome] = useState("");
  const amountRequired = result.channel !== "zero" && (outcome === "paid" || outcome === "partial");
  return <>
    <div className={fieldContainerClass}>
      <Field label="Payment reference"><Input name="reference" maxLength={120} autoComplete="off" required /></Field>
      <Field label="Date on payment evidence"><Input name="paid_on" type="date" required /></Field>
      <Field label="Employee payment outcome">
        <select name="outcome" className={selectClass} required value={outcome} onChange={event => setOutcome(event.target.value)}>
          <option value="">Choose an outcome</option>
          <option value="paid">{result.channel === "zero" ? "Verified zero payment" : "Paid in full"}</option>
          {result.channel !== "zero" && <option value="partial">Partially paid</option>}
          <option value="rejected">Rejected</option>
          <option value="pending">Pending</option>
        </select>
      </Field>
      {amountRequired ? <Field label={"Confirmed payment amount (" + result.currency + ")"}>
        <Input name="amount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={21} autoComplete="off" required />
      </Field> : <input name="amount" type="hidden" value="0.00" />}
    </div>
    <EvidenceFields scope={scope} />
  </>;
}

export function RecordPaymentForm({ scope, batch, result }: { scope: Scope; batch: string; result: ReceiptSubject }) {
  return <CommandForm scope={scope} label={formLabels.receipt} build={form => ({
    action: "receipt", data: {
      batch, employee: result.employee, channel: result.channel, currency: result.currency,
      reference: value(form, "reference"), paid_on: value(form, "paid_on"), outcome: value(form, "outcome"),
      amount: value(form, "amount"), ...evidence(form),
    },
  })}>
    <ReceiptFields scope={scope} result={result} />
  </CommandForm>;
}

function AllocationFields({ scope, result }: { scope: Scope; result: AllocationSubject }) {
  const [requiringEvidence, setRequiringEvidence] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState<Record<string, string>>({});
  const recoveries = result.lines.filter(line => line.category === "recovery");
  const requiresEvidence = Object.values(requiringEvidence).some(amount => /[1-9]/.test(amount)) ||
    Object.values(closing).some(amount => amount.trim() !== "");
  return <>
    <p className="text-sm text-muted-foreground">Enter only the amounts verified for this payment.</p>
    <div className="grid gap-2">
      {result.lines.map(line => <label className="grid items-center gap-2 rounded-md border px-3 py-2 text-sm sm:grid-cols-[1fr_minmax(7rem,10rem)]" key={line.id}>
        <span className="min-w-0">
          <span className="font-medium">{line.category.replaceAll("-", " ")}</span>
          <span className="block text-xs text-muted-foreground">{line.kind === "deduction" ? "Deduction" : "Earning"} · Approved {result.currency} {line.amount}</span>
        </span>
        <Input name={line.id} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={21} placeholder="0.00" autoComplete="off"
          onChange={line.kind === "deduction" || line.category === "recovery-refund"
            ? event => setRequiringEvidence(previous => ({ ...previous, [line.id]: event.target.value })) : undefined} />
      </label>)}
    </div>
    {recoveries.length > 0 && <details className="space-y-2 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Record an approved recovery shortfall</summary>
      <p className="text-sm text-muted-foreground">Enter the total deduction verified so far. Leave blank to keep the recovery open.</p>
      {recoveries.map(line => <Field key={line.id} label={"Verified amount collected · approved " + result.currency + " " + line.amount}>
        <Input name={"close:" + line.id} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={21} autoComplete="off"
          onChange={event => setClosing(previous => ({ ...previous, [line.id]: event.target.value }))} />
      </Field>)}
    </details>}
    {requiresEvidence && <>
      <p className="text-sm text-muted-foreground">Choose separate proof of the deduction, shortfall or recovery refund. A net payment alone does not confirm it.</p>
      <EvidenceFields scope={scope} />
      <PaymentReasonField label="How the evidence verifies the allocation" />
    </>}
  </>;
}

export function AllocationForm({ scope, batch, result, payment }: {
  scope: Scope; batch: string; result: AllocationSubject; payment: ExactReceipt;
}) {
  return <CommandForm scope={scope} label={formLabels.allocate} build={form => {
    const lines = result.lines.map(line => ({ line: line.id, amount: value(form, line.id) }))
      .filter(entry => /[1-9]/.test(entry.amount));
    const closeRecoveries = result.lines.filter(line => line.category === "recovery")
      .map(line => ({ line: line.id, amount: value(form, "close:" + line.id).trim() }))
      .filter(entry => entry.amount !== "");
    const reason = value(form, "reason");
    return { action: "allocate", data: {
      batch, payment: payment.id, revision: payment.allocation_revision, lines,
      ...(closeRecoveries.length > 0 && { close_recoveries: closeRecoveries }),
      ...(reason ? { ...evidence(form), reason } : {}),
    } };
  }}>
    <AllocationFields scope={scope} result={result} />
  </CommandForm>;
}

export function ReversePaymentForm({ scope, batch, payment }: { scope: Scope; batch: string; payment: ExactReceipt }) {
  return <CommandForm scope={scope} label={formLabels.reverse} build={form => ({
    action: "reverse", data: { batch, payment: payment.id, revision: payment.allocation_revision, reason: value(form, "reason"), ...evidence(form) },
  })}>
    <p className="text-sm text-muted-foreground">Use a reversal when evidence confirms this specific payment was reversed. The original record and allocations remain in history.</p>
    <PaymentReasonField label="Reason for reversal" />
    <EvidenceFields scope={scope} />
  </CommandForm>;
}
