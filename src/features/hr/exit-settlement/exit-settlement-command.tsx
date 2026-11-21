"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { changeExitSettlement } from "@/server/actions/hr/final-settlement";
import { label, money, positiveInteger, selectClassName, type Action, type CommandOption, type SettlementLine } from "./exit-settlement-contract";
import { useExitMutation } from "./use-exit-mutation";

type Request = {
  operation: string; company: number; branch: number; eos: number; action: Action; data: Record<string, unknown>;
};
type Issue = { error: string } | { fields: Record<string, unknown> };
const paymentOutcomes = ["pending", "rejected", "partial", "paid"];
const channels = ["exit-bank-transfer", "exit-cheque"];
const amountPattern = /^(0|[1-9]\d{0,17})(\.\d{1,2})?$/;
const datePattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const labelClassName = "grid gap-1.5 text-sm font-medium";

export function field(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function readProof(form: FormData, required: boolean): Issue {
  const raw = ["document", "version", "file"].map(key => field(form, key));
  if (!required && raw.every(value => !value)) return { fields: {} };
  const [document, version, file] = raw.map(positiveInteger);
  return document && version && file
    ? { fields: { document, version, file } }
    : { error: "Enter the document, version, and file IDs for the verified DMS original." };
}

function readAmount(value: string) {
  return amountPattern.test(value) ? value : null;
}

function reasonFor(form: FormData, max = 1000) {
  const reason = field(form, "reason");
  return reason.length > 0 && reason.length <= max ? reason : null;
}

function readFields(
  choice: CommandOption, form: FormData, currency: string, paymentChannels: readonly string[], lines: readonly SettlementLine[],
): Issue {
  switch (choice.action) {
    case "payment-start": {
      const channel = field(form, "channel");
      return channels.includes(channel) && paymentChannels.includes(channel)
        ? { fields: { channel } } : { error: "Select an approved exit payment channel." };
    }
    case "payment-receipt": {
      const reference = field(form, "reference");
      const outcome = field(form, "outcome");
      const amount = readAmount(field(form, "amount"));
      const paidOn = field(form, "paid_on");
      if (!paymentOutcomes.includes(outcome)) return { error: "Select the verified payment outcome." };
      const positive = amount && /[1-9]/.test(amount);
      if (!amount || (["pending", "rejected"].includes(outcome) && positive) || (outcome === "partial" && !positive)) {
        return { error: "Enter the verified amount. Pending and rejected outcomes record zero cash. Partial outcomes require a positive amount." };
      }
      if (!datePattern.test(paidOn) || !reference || reference.length > 120 || !/^[A-Z]{3}$/.test(currency)) {
        return { error: "Enter the verified payment date and payment reference." };
      }
      const proof = readProof(form, true);
      return "error" in proof ? proof : { fields: { ...proof.fields, reference, outcome, amount, currency, paid_on: paidOn } };
    }
    case "payment-allocate": {
      const reason = reasonFor(form, 500);
      if (!reason) return { error: "Enter a reason for the payment allocation." };
      const allocations: Array<{ line: string; amount: string }> = [];
      let proofRequired = false;
      for (const line of lines) {
        const raw = field(form, "amount-" + line.id);
        if (!raw) continue;
        const amount = readAmount(raw);
        if (!amount || !/[1-9]/.test(amount)) return { error: "Use a positive amount with up to two decimal places for each allocated line." };
        proofRequired ||= line.kind === "deduction" || line.category === "recovery-refund";
        allocations.push({ line: line.id, amount });
      }
      if (allocations.length === 0) return { error: "Enter an amount for at least one approved settlement line." };
      const proof = readProof(form, proofRequired);
      return "error" in proof ? proof : { fields: { ...proof.fields, reason, lines: allocations } };
    }
    case "payment-reverse": {
      const reason = reasonFor(form, 500);
      if (!reason) return { error: "Enter the reason for the linked payment reversal." };
      const proof = readProof(form, true);
      return "error" in proof ? proof : { fields: { ...proof.fields, reason } };
    }
    default: {
      const reason = reasonFor(form);
      if (!reason) return { error: "Enter a reason for this action." };
      if (choice.action === "recommend-case") {
        const disposition = field(form, "disposition");
        return disposition === "separate" || (disposition === "include" && choice.canInclude !== false)
          ? { fields: { reason, disposition } } : { error: "Choose the recovery case disposition." };
      }
      return { fields: { reason } };
    }
  }
}

export function ProofFields({ required }: { required: boolean }) {
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">{required
      ? "Use the identifiers of the verified original in DMS."
      : "Use separate verified DMS evidence for deductions or recovery refunds."}</p>
    <div className="grid gap-2 sm:grid-cols-3">
      {["document", "version", "file"].map(key => <label className={labelClassName} key={key}>
        {"DMS " + key + " ID"}
        <Input name={key} inputMode="numeric" pattern="[1-9][0-9]*" maxLength={16} required={required} />
      </label>)}
    </div>
  </div>;
}

function ActionFields({ choice, channels: approvedChannels, currency, lines }: {
  choice: CommandOption; channels: readonly string[]; currency: string; lines: readonly SettlementLine[];
}) {
  const { action } = choice;
  if (action === "payment-start") return <label className={labelClassName}>
    Payment channel
    <select className={selectClassName} name="channel" defaultValue="" required>
      <option value="" disabled>Select an approved channel</option>
      {channels.filter(item => approvedChannels.includes(item)).map(item => <option key={item} value={item}>{label(item)}</option>)}
    </select>
  </label>;
  if (action === "payment-receipt") return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={labelClassName}>
        Payment outcome
        <select className={selectClassName} name="outcome" defaultValue="" required>
          <option value="" disabled>Select the verified outcome</option>
          {paymentOutcomes.map(outcome => <option value={outcome} key={outcome}>{label(outcome)}</option>)}
        </select>
      </label>
      <label className={labelClassName}>
        <span>Verified amount <span className="text-muted-foreground">({currency})</span></span>
        <Input name="amount" inputMode="decimal" maxLength={21} required />
      </label>
      <label className={labelClassName}>Payment date<Input name="paid_on" type="date" required /></label>
      <label className={labelClassName}>Payment reference<Input name="reference" maxLength={120} required /></label>
    </div>
    <ProofFields required />
  </>;
  return <>
    {action === "recommend-case" && <label className={labelClassName}>
      Case disposition
      <select className={selectClassName} name="disposition" defaultValue="" required>
        <option value="" disabled>Select a disposition</option>
        <option value="separate">Continue review separately</option>
        {choice.canInclude !== false && <option value="include">Include approved recovery</option>}
      </select>
    </label>}
    {action === "payment-allocate" && <div className="space-y-2">
      {lines.map(line => <label key={line.id} className="grid items-center gap-2 rounded-md border p-3 text-sm sm:grid-cols-[1fr_9rem]">
        <span>
          <span className="font-medium">{label(line.category)}</span>
          <span className="block text-xs text-muted-foreground">{label(line.kind)} · {money(line.amount, currency)}</span>
        </span>
        <Input name={"amount-" + line.id} aria-label={"Allocation for " + label(line.category)}
          maxLength={21} inputMode="decimal" />
      </label>)}
      <ProofFields required={false} />
    </div>}
    {action === "payment-reverse" && <ProofFields required />}
    <label className={labelClassName}>
      Reason
      <Textarea name="reason" maxLength={action.startsWith("payment-") ? 500 : 1000} rows={2} required />
    </label>
  </>;
}

export function ExitSettlementCommand({ company, branch, eos, options, currency, paymentChannels, lines }: {
  company: number; branch: number; eos: number; options: readonly CommandOption[];
  currency: string; paymentChannels: readonly string[]; lines: readonly SettlementLine[];
}) {
  const [selection, setSelection] = useState("");
  const { record, pending, working, locked, message, setMessage } =
    useExitMutation<Request>(changeExitSettlement, () => setSelection(""));
  const choice = options.find(option => option.key === selection);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !choice) return;
    const extra = readFields(choice, new FormData(event.currentTarget), currency, paymentChannels, lines);
    if ("error" in extra) {
      setMessage({ ok: false, text: extra.error });
      return;
    }
    void record({
      operation: crypto.randomUUID(), company, branch, eos, action: choice.action,
      data: { ...choice.data, ...extra.fields },
    });
  }

  if (!options.length && !pending && !message) return null;
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="exit-actions-heading">
    <h2 id="exit-actions-heading" className="font-semibold">Settlement actions</h2>
    {options.length > 0 && <form onSubmit={submit}>
      <fieldset disabled={locked} className="grid gap-3">
        <label className={labelClassName}>
          Settlement action
          <select className={selectClassName} value={choice?.key ?? ""} required onChange={event => {
            setSelection(event.target.value);
            setMessage(undefined);
          }}>
            <option value="" disabled>Select an action</option>
            {options.map(option => <option key={option.key} value={option.key}>{option.title}</option>)}
          </select>
        </label>
        {choice && <>
          <ActionFields key={choice.key} choice={choice} channels={paymentChannels} currency={currency} lines={lines} />
          <Button type="submit" size="sm" className="justify-self-start">{choice.caption}</Button>
        </>}
      </fieldset>
    </form>}
    {working && <p role="status" className="text-sm text-muted-foreground">Recording settlement action…</p>}
    {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{message.text}</p>}
    {pending && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void record(pending)}>
      Retry same request
    </Button>}
  </section>;
}

