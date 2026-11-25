"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { PayrollRefreshNotice } from "@/features/hr/payroll/payroll-refresh-notice";
import { usePayrollCommand } from "@/hooks/use-payroll-command";
import { Input } from "@/components/ui/input";
import { changePayslipDelivery, issuePayslip } from "@/server/actions/hr/payslips";

type DeliveryKind = "initial" | "resend" | "print" | "handover" | "bounce" | "reconcile-email";
type EmailDisposition = "accepted" | "not-accepted";

export type PayslipDeliveryOption = {
  kind: DeliveryKind;
  delivery?: number;
  label?: string;
};

type IssueRequest = { operation: string; batch: string; employee: number };
type DeliveryRequest = {
  operation: string;
  slip: number;
  action: DeliveryKind;
  data: { delivery?: number; reference?: string; reason?: string; disposition?: EmailDisposition };
};
type Request = { kind: "issue"; data: IssueRequest } | { kind: "delivery"; data: DeliveryRequest };

const captions: Record<DeliveryKind, string> = {
  initial: "Start delivery",
  resend: "Resend original",
  print: "Queue print copy",
  handover: "Confirm handover",
  bounce: "Record bounce",
  "reconcile-email": "Record confirmed email outcome",
};

const emptyDraft = { key: "", reason: "", reference: "", disposition: "" as EmailDisposition | "" };

function optionKey(option: PayslipDeliveryOption) {
  return option.kind + (option.delivery === undefined ? "" : "-" + option.delivery);
}

export function PayslipCommand({ employee, batch, canIssue, delivery, compact = false }: {
  employee: number;
  batch: string;
  canIssue: boolean;
  compact?: boolean;
  delivery?: { slip: number; actions: PayslipDeliveryOption[] };
}) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const {
    submit: execute, retry, busy: working, refreshError, retryRefresh, locked, message: result, setMessage: setResult,
  } = usePayrollCommand(
    async (request: Request) => request.kind === "issue" ? issuePayslip(request.data) : changePayslipDelivery(request.data),
    {
      target: "payslips",
      onSuccess(request) {
        setDraft(emptyDraft);
        return request.kind === "issue" ? "Original payslip retained." : "Delivery action recorded.";
      },
      unconfirmed: "The result is unconfirmed. Retry the same request.",
    },
  );
  const choices = delivery?.actions ?? [];
  const action = choices.find(option => optionKey(option) === selected) ?? choices[0];
  const key = action ? optionKey(action) : "";
  const { reason, reference, disposition } = draft.key === key ? draft : emptyDraft;
  const providerReference = action?.kind === "bounce" || action?.kind === "reconcile-email";

  function requestIssue() {
    if (locked || !canIssue) return;
    void execute(() => ({ kind: "issue", data: { operation: crypto.randomUUID(), batch, employee } }));
  }

  function requestDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || !delivery || !action) return;
    const cleanedReason = reason.trim();
    const cleanedReference = reference.trim();
    if (action.kind !== "initial" && cleanedReason.length < 3) {
      setResult({ error: true, text: "Enter a reason of at least three characters." });
      return;
    }
    if (providerReference && !/^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$/.test(cleanedReference)) {
      setResult({ error: true, text: "Enter a valid provider reference for this email." });
      return;
    }
    if (action.kind === "reconcile-email" && !disposition) {
      setResult({ error: true, text: "Choose the outcome confirmed by the provider." });
      return;
    }
    void execute(() => ({
      kind: "delivery", data: {
        operation: crypto.randomUUID(), slip: delivery.slip, action: action.kind,
        data: {
          ...(action.kind === "initial" ? {} : { reason: cleanedReason }),
          ...(action.delivery === undefined ? {} : { delivery: action.delivery }),
          ...(providerReference ? { reference: cleanedReference } : {}),
          ...(action.kind === "reconcile-email" && disposition ? { disposition } : {}),
        },
      },
    }));
  }

  if (!canIssue && !action && !retry && !refreshError && !result) return null;

  const deliveryForm = action && <form onSubmit={requestDelivery}>
      <fieldset className="grid gap-2" disabled={locked}>
        {choices.length > 1 && <label className="grid gap-1 text-xs font-medium">
          Delivery action
          <select value={optionKey(action)} onChange={event => {
            setSelected(event.target.value);
            setResult(null);
            setDraft(emptyDraft);
          }} className="min-h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">
            {choices.map(option => <option key={optionKey(option)} value={optionKey(option)}>
              {option.label ?? captions[option.kind]}
            </option>)}
          </select>
        </label>}
        {action.kind === "handover" && <p className="text-xs text-muted-foreground">
          Download and print the original PDF before confirming handover.
        </p>}
        {action.kind === "reconcile-email" && <label className="grid gap-1 text-xs font-medium">
          Confirmed outcome
          <select value={disposition} required onChange={event => {
            const value = event.target.value;
            setDraft({ key, reason, reference, disposition: value === "accepted" || value === "not-accepted" ? value : "" });
          }} className="min-h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">
            <option value="" disabled>Select the confirmed outcome</option>
            <option value="accepted">Provider accepted the email</option>
            <option value="not-accepted">Provider did not accept the email</option>
          </select>
        </label>}
        {providerReference && <label className="grid gap-1 text-xs font-medium">
          Provider reference
          <Input value={reference} onChange={event => setDraft({ key, reason, reference: event.target.value, disposition })} minLength={3} maxLength={120} required />
        </label>}
        {action.kind !== "initial" && <label className="grid gap-1 text-xs font-medium">
          Reason
          <Input value={reason} onChange={event => setDraft({ key, reason: event.target.value, reference, disposition })} minLength={3} maxLength={250} required />
        </label>}
        <Button type="submit" size="sm" variant="outline" className="justify-self-start">{captions[action.kind]}</Button>
      </fieldset>
    </form>;

  return <div className="max-w-xs space-y-2">
    {canIssue && <Button type="button" size="sm" disabled={locked} onClick={requestIssue}>Issue payslip</Button>}
    {compact && deliveryForm ? <details>
      <summary className="cursor-pointer text-sm font-medium text-primary underline underline-offset-2">Delivery actions</summary>
      <div className="mt-2">{deliveryForm}</div>
    </details> : deliveryForm}
    {working && <p role="status" className="text-xs text-muted-foreground">Working…</p>}
    {result && <p role={!result.error ? "status" : "alert"} className={!result.error ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
      {result.text}
    </p>}
    {retry && <Button type="button" size="sm" variant="outline" disabled={working} onClick={() => void execute()}>
      Retry same request
    </Button>}
    {refreshError && <PayrollRefreshNotice busy={working} retry={() => void retryRefresh()} />}
  </div>;
}
