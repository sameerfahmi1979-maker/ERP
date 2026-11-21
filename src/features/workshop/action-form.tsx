"use client";

import { useState, useRef, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveWorkshopAction } from "@/server/actions/workshop/workshop";
import type { WorkshopDocument, WorkshopRequest } from "@/lib/workshop/workspace";

export const selectStyle = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export const formGrid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
export const rowLink = "text-sm font-medium text-primary underline-offset-4 hover:underline";
export const timestamp = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
export const labelTime = (value: string) => timestamp.format(new Date(value));
export const localInputTime = (value: string | null) =>
  value ? new Date(Date.parse(value) + 4 * 60 * 60 * 1000).toISOString().slice(0, 19) : undefined;
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export const optionalText = (data: FormData, name: string) => value(data, name) || undefined;
export const number = (data: FormData, name: string) => value(data, name) ? Number(value(data, name)) : undefined;
export function time(data: FormData, name: string) {
  const local = value(data, name);
  return local ? `${local.length === 16 ? local + ":00" : local}+04:00` : undefined;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid content-start gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export function Times({ name, label, initial }: { name: string; label: string; initial?: string | null }) {
  return <Field label={label + " (Dubai)"}><Input name={name} type="datetime-local" step={1} required defaultValue={localInputTime(initial ?? null)} /></Field>;
}

export function selectedEvidence(data: FormData, choices: WorkshopDocument[]) {
  const chosen = choices.find(item => item.file === number(data, "file"));
  return chosen ? { document: chosen.document, version: chosen.version, file: chosen.file } : undefined;
}

export function EvidenceSelect({ choices, required = false }: { choices: WorkshopDocument[]; required?: boolean }) {
  return <Field label={required ? "Signed return original" : "DMS finding original"}>
    <select className={selectStyle} name="file" required={required} defaultValue="">
      <option value="">{required ? "Choose a verified original" : "No original selected"}</option>
      {choices.map(item => <option key={item.file} value={item.file}>{item.number} Ã‚Â· {item.title}</option>)}
    </select>
    {!choices.length && <span className="text-xs font-normal text-muted-foreground">Upload or link the document to this asset in DMS, then reload.</span>}
  </Field>;
}

export function WorkshopForm({ asset, action, button, makeData, children, reasonLabel = "Reason", disabled = false }: {
  asset: number;
  action: WorkshopRequest["action"];
  button: string;
  reasonLabel?: string;
  makeData: (data: FormData) => Record<string, WorkshopRequest["data"][string] | undefined>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const router = useRouter();
  const savedRequest = useRef<{ fingerprint: string; nonce: string } | null>(null);
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const form = event.currentTarget;
    const inputs = new FormData(form);
    const fields = makeData(inputs);
    fields.reason = value(inputs, "reason");
    const data = Object.fromEntries(Object.entries(fields).filter(([, item]) => item !== undefined));
    const fingerprint = JSON.stringify(data);
    if (savedRequest.current?.fingerprint !== fingerprint) savedRequest.current = { fingerprint, nonce: crypto.randomUUID() };
    active.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await saveWorkshopAction({ nonce: savedRequest.current.nonce, asset, action, data });
      if (result.ok) {
        savedRequest.current = null;
        form.reset();
        setMessage({ error: false, text: "Saved." });
        router.refresh();
      } else setMessage({ error: true, text: result.error });
    } catch {
      setMessage({ error: true, text: "The save could not be confirmed. Retry using the same details." });
    } finally {
      setBusy(false);
      active.current = false;
    }
  }

  return <form onSubmit={submit} className={formGrid}>
    {children}
    <Field label={reasonLabel}><Input name="reason" required maxLength={1000} /></Field>
    <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
      <Button disabled={busy || disabled} type="submit">{busy ? "SavingÃ¢â‚¬Â¦" : button}</Button>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
    </div>
  </form>;
}
