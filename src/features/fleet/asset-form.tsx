"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fleetCategories, type FleetChoices, type FleetCommand } from "@/lib/fleet/asset-contract";
import { saveFleetAsset } from "@/server/actions/fleet/assets";

export const fleetSelectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function FleetField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
}

export function FleetForm({
  action, asset, fields, label, children,
}: {
  action: FleetCommand["action"];
  asset: FleetCommand["asset"];
  fields: (form: FormData) => FleetCommand["data"];
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const working = useRef(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<FleetCommand | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current) return;
    const command = retry ?? {
      operation: crypto.randomUUID(), asset, action, data: fields(new FormData(event.currentTarget)),
    };
    working.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await saveFleetAsset(command);
      if ("error" in result) {
        setRetry(result.uncertain ? command : null);
        setMessage(result.error);
        return;
      }
      setRetry(null);
      setMessage("Saved.");
      if (asset === null) router.push(`/modules/fleet/${result.data.id}`);
      else router.refresh();
    } catch {
      setRetry(command);
      setMessage("The save result is unconfirmed. Retry the original request.");
    } finally {
      working.current = false;
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
    <fieldset disabled={pending || retry !== null} className="grid gap-4 sm:grid-cols-2">{children}</fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : retry ? "Retry original request" : label}</Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </form>;
}

export function readFleetText(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export function readFleetOptional(form: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.flatMap(key => {
    const value = readFleetText(form, key);
    return value ? [[key, value]] : [];
  }));
}

export function NewFleetAsset({ scopes }: { scopes: FleetChoices["scopes"] }) {
  if (!scopes.length) return null;
  return <details className="space-y-3">
    <summary className="cursor-pointer text-sm font-semibold">Add asset</summary>
    <FleetForm asset={null} action="create" label="Create draft" fields={form => {
      const scope = scopes.find(item => item.branch === Number(form.get("branch")));
      return { branch: scope?.branch, company: scope?.company, ...readFleetOptional(form, ["name", "category", "vin", "serial"]) };
    }}>
      <FleetField label="Company and home branch">
        <select name="branch" required className={fleetSelectClass}>
          <option value="">Select a branch</option>
          {scopes.map(scope => <option key={scope.branch} value={scope.branch}>{scope.label}</option>)}
        </select>
      </FleetField>
      <FleetField label="Category">
        <select name="category" required className={fleetSelectClass}>
          <option value="">Select a category</option>
          {Object.entries(fleetCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </FleetField>
      <FleetField label="Asset name"><Input name="name" required maxLength={160} /></FleetField>
      <FleetField label="VIN, if known"><Input name="vin" maxLength={35} /></FleetField>
      <FleetField label="Serial number, if known"><Input name="serial" maxLength={80} /></FleetField>
    </FleetForm>
  </details>;
}
