
"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FleetField, fleetSelectClass } from "@/features/fleet/asset-form";
import type { FineEvidenceType, FineFleetCommand, FineFleetWorkspace } from "@/lib/fleet/fine-contract";
import { readFleetFineDrivers, saveFleetFine } from "@/server/actions/fleet/fines";

type Choice = { id: string | number; label: string };
type Originals = FineFleetWorkspace["evidence_choices"];

export const textField = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const idField = (form: FormData, key: string) => Number(textField(form, key)) || undefined;
export const dateTimeField = (form: FormData, key: string) => {
  const value = textField(form, key);
  return value.length === 16 ? value + ":00+04:00" : value + "+04:00";
};
export const evidenceField = (form: FormData, sources: Originals) => {
  const chosen = sources.find(source => source.file === idField(form, "original"));
  if (!chosen) return undefined;
  return { document: chosen.document, version: chosen.version, file: chosen.file,
    reference: textField(form, "proof_reference") || undefined };
};

export function FineActionForm({
  target, action, label, values, children, unavailable = false,
}: {
  target: number; action: FineFleetCommand["action"]; label: string; unavailable?: boolean;
  values: (form: FormData) => Record<string, unknown>; children?: ReactNode;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const original = useRef<{ operation: string; target: number; action: string; data: Record<string, unknown> } | null>(null);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    original.current ??= { operation: crypto.randomUUID(), target, action, data: values(new FormData(form)) };
    inFlight.current = true;
    setPending(true);
    setMessage(undefined);
    try {
      const reply = await saveFleetFine(original.current);
      setRetry(!reply.ok && reply.uncertain);
      if (reply.ok || !reply.uncertain) original.current = null;
      setMessage(reply.ok ? {
        error: false, text: reply.replayed ? "The original save was confirmed." : "Saved.",
      } : { error: true, text: reply.error });
      if (reply.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setRetry(true);
      setMessage({ error: true, text: "Save unconfirmed. Retry the original request." });
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return <form onSubmit={save} className="space-y-3 rounded-md border bg-card p-3">
    {children && <fieldset disabled={pending || retry} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </fieldset>}
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={pending || (unavailable && !retry)}>
        {pending ? "Saving…" : retry ? "Retry original request" : label}
      </Button>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>
        {message.text}
      </p>}
    </div>
  </form>;
}

export function FineInput({ name, label, type = "text", optional = false, maxLength = 150, value }: {
  name: string; label: string; type?: string; optional?: boolean; maxLength?: number; value?: string | number;
}) {
  return <FleetField label={label}>
    <Input name={name} type={type} required={!optional} maxLength={maxLength} defaultValue={value}
      min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : type === "datetime-local" ? 1 : undefined} />
  </FleetField>;
}

export function FineSelect({ name, label, choices, optional = false, empty, onChange }: {
  name: string; label: string; choices: Choice[]; optional?: boolean; empty?: string; onChange?: (value: string) => void;
}) {
  return <FleetField label={label}>
    <select className={fleetSelectClass} required={!optional} name={name} defaultValue="" onChange={event => onChange?.(event.target.value)}>
      <option value="">{choices.length === 0 && empty ? empty : optional ? "None" : "Choose one"}</option>
      {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select>
  </FleetField>;
}

export function EvidenceFields({ originals, accepted }: {
  originals: Originals; accepted: readonly FineEvidenceType[];
}) {
  return <>
    <FineSelect name="original" label="Verified DMS original" empty="No eligible original in this branch"
      choices={originals.filter(item => accepted.includes(item.type_code))
        .map(item => ({ id: item.file, label: item.label + " · Version " + item.version }))} />
    <FineInput name="proof_reference" label="Reference on original" optional />
  </>;
}

export function DriverSearch({ caseId }: { caseId: number }) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setChoices([]);
    try {
      const rows = await readFleetFineDrivers(caseId, query);
      setChoices(rows ?? []);
      setMessage(rows === null ? "Employee search is unavailable for this case." :
        rows.length ? "Select the employee confirmed by the evidence." : "No eligible employee matched.");
    } catch {
      setMessage("Employee search is unavailable for this case.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <FleetField label="Find employee by name or number">
      <Input value={query} maxLength={80} disabled={busy} onChange={event => {
        setQuery(event.target.value);
        setChoices([]);
        setMessage("");
      }} onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!busy && query.trim().length >= 2) void search();
        }
      }} />
    </FleetField>
    <div className="self-end">
      <Button type="button" variant="outline" disabled={busy || query.trim().length < 2} onClick={() => void search()}>
        {busy ? "Searching…" : "Find employee"}
      </Button>
    </div>
    <FineSelect key={query + choices.map(choice => choice.id).join(",")} name="employee" label="Confirmed driver"
      choices={choices} empty="Search for an employee first" />
    {message && <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{message}</p>}
  </>;
}

