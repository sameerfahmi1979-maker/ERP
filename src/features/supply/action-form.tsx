"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSupplyAction } from "@/server/actions/inventory/stock-movements";
import type { SupplyRequest } from "@/lib/supply/contracts";

export const selectStyle = "h-9 w-full rounded-md border bg-background px-2 text-sm";
export type Choice = { id: number | string; label: string };
type Value = SupplyRequest["data"][string];
export type Field = {
  key: string; label: string; type?: "id" | "quantity" | "integer" | "datetime" | "text";
  options?: Choice[]; optional?: boolean; step?: string; initial?: string;
};

export function SupplyForm({ parent, family, action, title, fields, constants, transform, onField }: {
  parent: number;
  family: SupplyRequest["family"];
  action: string;
  title: string;
  fields: Field[];
  constants?: Record<string, Value>;
  transform?: (data: Record<string, Value>) => Record<string, Value>;
  onField?: (key: string, value: string) => void;
}) {
  const router = useRouter();
  const lastRequest = useRef<{ key: string; nonce: string } | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const data: Record<string, Value> = { ...constants, reason: String(input.get("reason") ?? "").trim() };
    for (const field of fields) {
      const raw = String(input.get(field.key) ?? "").trim();
      if (!raw) continue;
      if (["id", "quantity", "integer"].includes(field.type ?? "")) data[field.key] = Number(raw);
      else if (field.type === "datetime") data[field.key] = (raw.length === 16 ? raw + ":00" : raw) + "+04:00";
      else data[field.key] = raw;
    }
    const requestData = transform ? transform(data) : data;
    const key = JSON.stringify(requestData);
    if (lastRequest.current?.key !== key) lastRequest.current = { key, nonce: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await saveSupplyAction({ parent, family, action, nonce: lastRequest.current.nonce, data: requestData });
      if (result.ok) {
        lastRequest.current = null;
        setMessage({ error: false, text: `Saved reference #${result.receipt.id}` });
        router.refresh();
      } else setMessage({ error: true, text: result.error });
    } catch {
      setMessage({ error: true, text: "The save could not be confirmed. Retry with the same details." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {fields.map(field => <label key={field.key} className="grid content-start gap-1.5 text-sm font-medium">
      {field.label}
      {field.options ? <select className={selectStyle} name={field.key} required={!field.optional}
        defaultValue={field.initial ?? ""} onChange={event => onField?.(field.key, event.target.value)}>
        <option value="">{field.optional ? "None" : "Select"}</option>
        {field.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select> : <Input name={field.key} required={!field.optional} maxLength={150} defaultValue={field.initial}
        type={field.type === "datetime" ? "datetime-local" : field.type && field.type !== "text" ? "number" : "text"}
        step={field.step ?? (field.type === "quantity" ? "0.001" : 1)}
        min={field.type === "quantity" || field.type === "integer" ? 0 : field.type === "id" ? 1 : undefined} />}
    </label>)}
    <label className="grid gap-1.5 text-sm font-medium">Reason or evidence reference<Input required name="reason" maxLength={1000} /></label>
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
      <Button type="submit" disabled={busy || fields.some(field => !field.optional && field.options?.length === 0)}>{busy ? "Saving…" : title}</Button>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm"}>{message.text}</p>}
    </div>
  </form>;
}
