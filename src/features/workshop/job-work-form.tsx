"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { OperationsCommandStatus, useOperationsCommand } from "@/features/operations/use-operations-command";
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
  const previewInFlight = useRef(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [preview, setPreview] = useState<{ key: string; view: LabourPreview }>();
  const command = useOperationsCommand(saveJobWork, form => {
    setPreview(undefined);
    form.reset();
  });
  const busy = command.busy || previewBusy;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.blocked || previewInFlight.current) return;
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
    const key = JSON.stringify(data);
    setPreviewError(undefined);
    if (needsPreview && preview?.key !== key) {
      previewInFlight.current = true;
      setPreviewBusy(true);
      try {
        const view = await readLabourPreview(Number(data.assignment), String(data.from), String(data.until));
        setPreview(view ? { key, view } : undefined);
        if (!view) setPreviewError("Check the actual times and the selected allocation.");
      } catch {
        setPreview(undefined);
        setPreviewError("The duration and cost preview could not be loaded.");
      } finally {
        previewInFlight.current = false;
        setPreviewBusy(false);
      }
      return;
    }
    if (needsPreview && preview) data.preview = preview.view.digest;
    await command.submit({ nonce: crypto.randomUUID(), parent, family, action, data }, form);
  }

  return <form onSubmit={submit} className="space-y-3 rounded-md border p-3">
    <fieldset disabled={command.blocked || previewBusy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <Button type="submit" disabled={fields.some(field => !field.optional && field.options?.length === 0)}>
          {busy ? "Working…" : needsPreview && !preview ? "Preview duration and cost" : label}
        </Button>
        {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
      </div>
    </fieldset>
    <OperationsCommandStatus command={command} saved={command.receipt ? "Saved." : undefined} />
  </form>;
}
