"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JobWorkRequest, LabourPreview } from "@/lib/workshop/labour-contract";
import { readLabourPreview, saveJobWork } from "@/server/actions/workshop/labour";

type Value = JobWorkRequest["data"][string];
export type JobField = { key: string; label: string; kind?: "number" | "id" | "time" | "day" | "checkbox";
  options?: { id: number | string; label: string }[]; optional?: boolean; step?: string };
export const text = (key: string, label: string, optional = false): JobField => ({ key, label, optional });
export const dateTime = (key: string, label: string): JobField => ({ key, label: label + " (Dubai)", kind: "time" });
export const option = (key: string, label: string, options: JobField["options"], optional = false): JobField => ({ key, label, options, optional });
export const number = (key: string, label: string, step = "0.01"): JobField => ({ key, label, kind: "number", step });
export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(value));

export function JobWorkForm({ family, parent, action, label, fields = [], constants, map, needsPreview = false, children }: {
  family: JobWorkRequest["family"]; parent: number; action: string; label: string; fields?: JobField[];
  constants?: Record<string, Value>; map?: (raw: Record<string, Value>) => Record<string, Value>; needsPreview?: boolean; children?: ReactNode;
}) {
  const router = useRouter();
  const last = useRef<{ key: string; nonce: string } | null>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error: boolean; label: string }>();
  const [preview, setPreview] = useState<{ key: string; view: LabourPreview }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const input = new FormData(form);
    const fieldsData: Record<string, Value> = { ...constants, reason: String(input.get("reason") ?? "").trim() };
    for (const field of fields) {
      const raw = String(input.get(field.key) ?? "").trim();
      if (field.kind === "checkbox") fieldsData[field.key] = input.has(field.key);
      else if (!raw) continue;
      else if (field.kind === "number" || field.kind === "id" || field.options?.some(value => typeof value.id === "number")) fieldsData[field.key] = Number(raw);
      else if (field.kind === "time") fieldsData[field.key] = (raw.length === 16 ? raw + ":00" : raw) + "+04:00";
      else fieldsData[field.key] = raw;
    }
    const data = map ? map(fieldsData) : fieldsData;
    inFlight.current = true;
    setBusy(true);
    setResult(undefined);
    try {
      const key = JSON.stringify(data);
      if (needsPreview && preview?.key !== key) {
        const view = await readLabourPreview(Number(data.assignment), String(data.from), String(data.until));
        setPreview(view ? { key, view } : undefined);
        if (!view) setResult({ error: true, label: "Check the actual times and the selected allocation." });
        return;
      }
      if (needsPreview && preview) data.preview = preview.view.digest;
      const savedKey = JSON.stringify(data);
      if (last.current?.key !== savedKey) last.current = { key: savedKey, nonce: crypto.randomUUID() };
      const reply = await saveJobWork({ nonce: last.current.nonce, parent, family, action, data });
      if (reply.ok) {
        last.current = null;
        setPreview(undefined);
        setResult({ error: false, label: "Saved." });
        form.reset();
        router.refresh();
      } else setResult({ error: true, label: reply.error });
    } catch {
      setResult({ error: true, label: "The save could not be confirmed. Retry with the same details." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
    {fields.map(field => <label key={field.key} className="grid content-start gap-1 text-sm font-medium">
      {field.label}
      {field.options ? <select name={field.key} required={!field.optional} defaultValue="" className="h-9 rounded-md border bg-background px-2">
        <option value="">{field.optional ? "None" : "Choose one"}</option>
        {field.options.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select> : <Input name={field.key} required={!field.optional && field.kind !== "checkbox"} maxLength={200}
        type={field.kind === "time" ? "datetime-local" : field.kind === "day" ? "date" : field.kind === "checkbox" ? "checkbox" :
          field.kind === "number" || field.kind === "id" ? "number" : "text"}
        min={field.kind === "number" ? 0 : field.kind === "id" ? 1 : undefined}
        step={field.kind === "time" ? 60 : field.step ?? 1} className={field.kind === "checkbox" ? "size-4" : undefined} />}
    </label>)}
    <label className="grid gap-1 text-sm font-medium">Reason<Input name="reason" required maxLength={500} /></label>
    {children}
    {preview && <p role="status" className="text-sm sm:col-span-2 lg:col-span-3">
      {preview.view.minutes} minutes · {preview.view.cost_status === "rate-required" ? "Approved Workshop cost rate required" :
        preview.view.amount !== null ? `Workshop cost ${preview.view.currency} ${preview.view.amount.toFixed(2)}` : "Workshop cost basis verified"}
    </p>}
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
      <Button type="submit" disabled={busy || fields.some(field => !field.optional && field.options?.length === 0)}>
        {busy ? "Working…" : needsPreview && !preview ? "Preview duration and cost" : label}
      </Button>
      {result && <p role={result.error ? "alert" : "status"} className={result.error ? "text-sm text-destructive" : "text-sm"}>{result.label}</p>}
    </div>
  </form>;
}
