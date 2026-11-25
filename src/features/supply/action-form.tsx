"use client";

import type { FormEvent } from "react";
import { OperationsCommandStatus, useOperationsCommand } from "@/features/operations/use-operations-command";
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
  const command = useOperationsCommand(saveSupplyAction);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.blocked) return;
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
    void command.submit({ parent, family, action, nonce: crypto.randomUUID(), data: transform ? transform(data) : data }, form);
  }

  return <form onSubmit={submit} className="space-y-3">
    <fieldset disabled={command.blocked} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <Button type="submit" disabled={fields.some(field => !field.optional && field.options?.length === 0)}>
          {command.busy ? "Saving…" : title}
        </Button>
      </div>
    </fieldset>
    <OperationsCommandStatus command={command} saved={command.receipt ? `Saved reference #${command.receipt.id}` : undefined} />
  </form>;
}
