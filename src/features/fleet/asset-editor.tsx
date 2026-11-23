"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FleetField, FleetForm, fleetSelectClass, readFleetOptional, readFleetText } from "./asset-form";
import type { FleetAsset, FleetAssetSummary, FleetChoices, FleetCommand } from "@/lib/fleet/asset-contract";
import { getFleetChoices, searchFleetParties } from "@/server/actions/fleet/assets";

const operations = {
  identity: "Correct VIN or serial",
  ownership: "Record legal ownership",
  operation: "Set operating responsibility",
  location: "Record physical location",
  configuration: "Record configuration",
  plate: "Assign or release plate",
  meter: "Verify or correct opening meter",
  lifecycle: "Change asset status",
} as const;
type EditAction = keyof typeof operations;
const textSpecs = ["make", "model", "colour", "body", "fuel", "engine_number", "capacity_unit"] as const;
const numericSpecs = ["year", "gross_kg", "tare_kg", "payload_kg", "length_mm", "width_mm", "height_mm", "capacity"] as const;
const registrationFields = ["jurisdiction", "plate_class", "plate", "traffic_code", "registered_owner", "owner_nationality",
  "authority", "issued_at", "authority_reference", "barcode", "vehicle_category"] as const;
const insuranceFields = ["insurer", "policy_number", "coverage", "insured_party"] as const;
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, initial => initial.toUpperCase());
const int = (form: FormData, name: string) => Number(form.get(name)) || undefined;
const dateFields = (form: FormData, asset: FleetAssetSummary) => ({
  date: readFleetText(form, "date"), reason: readFleetText(form, "reason"), revision: asset.revision,
});
type Axle = { key: string; label: string; role: string; steering: boolean; driven: boolean; liftable: boolean; left: number; right: number };
const axleRoles = ["steer", "drive", "tag", "lift", "trailer", "other"];

function OwnershipFields({ asset, scopes }: { asset: FleetAssetSummary; scopes: FleetChoices["scopes"] }) {
  const [mode, setMode] = useState("owned");
  const [query, setQuery] = useState("");
  const [parties, setParties] = useState<{ id: number; label: string }[]>([]);
  const [searched, setSearched] = useState(false);
  const companies = [...new Map(scopes.map(scope => [scope.company, scope])).values()];
  async function lookUpParties() {
    const results = await searchFleetParties(asset.company, asset.branch, query);
    setParties(results ?? []);
    setSearched(true);
  }
  return <>
    <FleetField label="Ownership arrangement"><select name="mode" className={fleetSelectClass} value={mode}
      onChange={event => setMode(event.target.value)}>
      <option value="owned">Company-owned</option><option value="rental">Rental</option>
      <option value="third_party">Third-party</option>{asset.status === "draft" && <option value="unknown">Unknown</option>}
    </select></FleetField>
    {mode === "owned" && <FleetField label="Legal owner company"><select name="company" required className={fleetSelectClass}>
      <option value="">Select a company</option>
      {companies.map(scope => <option key={scope.company} value={scope.company}>{scope.label.split(" / ")[0]}</option>)}
    </select></FleetField>}
    {(mode === "rental" || mode === "third_party") && <>
      <FleetField label="Find the asset owner in Party Master"><Input value={query} maxLength={100}
        onChange={event => { setQuery(event.target.value); setParties([]); setSearched(false); }} /></FleetField>
      <div className="self-end">
        <Button type="button" variant="outline" disabled={query.trim().length < 2} onClick={lookUpParties}>Find owner</Button>
        {searched && !parties.length && <p className="mt-1 text-sm text-muted-foreground">No permitted owners match this search.</p>}
      </div>
      <FleetField label="Verified legal owner"><select name="party" required className={fleetSelectClass}>
        <option value="">Select the owner</option>
        {parties.map(party => <option key={party.id} value={party.id}>{party.label}</option>)}
      </select></FleetField>
    </>}
  </>;
}

function OperatingFields({ scopes, action }: { scopes: FleetChoices["scopes"]; action: "operation" | "location" }) {
  const [branch, setBranch] = useState("");
  const [choices, setChoices] = useState<FleetChoices | null>(null);
  const [loading, setLoading] = useState(false);
  async function chooseScope(value: string) {
    setBranch(value);
    setChoices(null);
    const scope = scopes.find(item => item.branch === Number(value));
    if (!scope) return;
    setLoading(true);
    try {
      setChoices(await getFleetChoices(scope.company, scope.branch));
    } finally {
      setLoading(false);
    }
  }
  return <>
    <FleetField label="Company and branch"><select name="branch" required value={branch} disabled={loading}
      onChange={event => void chooseScope(event.target.value)} className={fleetSelectClass}>
      <option value="">Select a branch</option>
      {scopes.map(scope => <option key={scope.branch} value={scope.branch}>{scope.label}</option>)}
    </select></FleetField>
    {action === "operation" ? <FleetField label="Accountable operating role"><select name="role" required className={fleetSelectClass}>
      <option value="">{loading ? "Loading roles…" : "Select a role"}</option>
      {choices?.roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
    </select></FleetField> : <>
      <FleetField label="Operating site"><select name="site" className={fleetSelectClass}>
        <option value="">{loading ? "Loading sites…" : "Select a site or enter a reported location"}</option>
        {choices?.sites.map(site => <option key={site.id} value={site.id}>{site.label}</option>)}
      </select></FleetField>
      <FleetField label="Reported location"><Input name="label" maxLength={160} /></FleetField>
      <FleetField label="Latitude"><Input type="number" name="latitude" min={-90} max={90} step="any" /></FleetField>
      <FleetField label="Longitude"><Input type="number" name="longitude" min={-180} max={180} step="any" /></FleetField>
    </>}
  </>;
}

function AxleFields({ previous }: { previous: FleetAsset["history"][number]["facts"] | undefined }) {
  const previousAxles = Array.isArray(previous?.axles) ? previous.axles as Axle[] : [];
  const [axles, setAxles] = useState(previousAxles.map((axle, index) => ({ ...axle, pos: index })));
  const [next, setNext] = useState(previousAxles.length);
  function addAxle() {
    setAxles(items => [...items, { pos: next, key: "", label: "", role: "other", steering: false, driven: false, liftable: false, left: 1, right: 1 }]);
    setNext(next + 1);
  }
  return <div className="space-y-4 sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">Axles and tyre positions</h3>
      <Button type="button" variant="outline" disabled={axles.length >= 20} onClick={addAxle}>Add axle</Button>
    </div>
    {axles.map((axle, index) => <fieldset key={axle.pos} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
      <legend className="px-1 text-sm font-medium">Axle {index + 1}</legend>
      <input type="hidden" name="axle-row" value={axle.pos} />
      <FleetField label="Stable axle key"><Input name={`axle-${axle.pos}-key`} defaultValue={axle.key}
        placeholder="front or rear_1" pattern="[a-z][a-z0-9_]{0,31}" required readOnly={!!axle.key} /></FleetField>
      <FleetField label="Label"><Input name={`axle-${axle.pos}-label`} defaultValue={axle.label} maxLength={80} required /></FleetField>
      <FleetField label="Role"><select name={`axle-${axle.pos}-role`} defaultValue={axle.role} className={fleetSelectClass}>
        {axleRoles.map(role => <option key={role} value={role}>{label(role)}</option>)}</select></FleetField>
      {(["left", "right"] as const).map(side => <FleetField key={side} label={`${label(side)} tyres`}>
        <select name={`axle-${axle.pos}-${side}`} defaultValue={axle[side]} className={fleetSelectClass}>
          <option value={0}>No fitment</option><option value={1}>Single</option><option value={2}>Dual</option>
        </select></FleetField>)}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {(["steering", "driven", "liftable"] as const).map(flag => <label key={flag} className="flex items-center gap-1">
          <input type="checkbox" name={`axle-${axle.pos}-${flag}`} defaultChecked={axle[flag]} />{label(flag)}
        </label>)}
      </div>
      <Button type="button" variant="ghost" className="justify-self-start"
        onClick={() => setAxles(items => items.filter(item => item.pos !== axle.pos))}>Remove axle</Button>
    </fieldset>)}
    <FleetField label="Spare tyre positions"><Input name="spares" type="number" min={0} max={8}
      defaultValue={typeof previous?.spares === "number" ? previous.spares : 0} /></FleetField>
  </div>;
}

function configData(form: FormData) {
  const axles = form.getAll("axle-row").map(pos => {
    const prefix = `axle-${pos}-`;
    return {
      key: readFleetText(form, prefix + "key"), label: readFleetText(form, prefix + "label"), role: readFleetText(form, prefix + "role"),
      left: Number(form.get(prefix + "left")), right: Number(form.get(prefix + "right")),
      steering: form.has(prefix + "steering"), driven: form.has(prefix + "driven"), liftable: form.has(prefix + "liftable"),
    };
  });
  const measures = Object.fromEntries(numericSpecs.flatMap(key => {
    const value = readFleetText(form, key);
    return value ? [[key, Number(value)]] : [];
  }));
  return { ...readFleetOptional(form, textSpecs), ...measures, axles, spares: Number(form.get("spares") ?? 0) };
}

export function FleetAssetEditor({ asset, scopes, today }: { asset: FleetAssetSummary; scopes: FleetChoices["scopes"]; today: string }) {
  const [action, setAction] = useState<EditAction>("identity");
  const [meterUnit, setMeterUnit] = useState<"km" | "hours">("km");
  const meter = asset.meters.find(item => item.unit === meterUnit);
  const config = asset.history.find(item => item.kind === "configuration")?.facts;
  if (!asset.can_manage) return null;
  const available = asset.status === "retired" ? ["plate"] as const : Object.keys(operations) as EditAction[];
  const selected = asset.status === "retired" ? "plate" : action;
  function data(form: FormData): FleetCommand["data"] {
    const base = dateFields(form, asset);
    const branch = int(form, "branch");
    const scope = scopes.find(item => item.branch === branch);
    switch (selected) {
      case "identity": return { ...base, ...readFleetOptional(form, ["vin", "serial"]) };
      case "ownership": return { ...base, mode: readFleetText(form, "mode"), company: int(form, "company"), party: int(form, "party") };
      case "operation": return { ...base, company: scope?.company, branch, role: int(form, "role") };
      case "location": return { ...base, company: scope?.company, branch, site: int(form, "site"), facts: {
        ...readFleetOptional(form, ["label"]),
        ...(readFleetText(form, "latitude") ? { latitude: Number(form.get("latitude")) } : {}),
        ...(readFleetText(form, "longitude") ? { longitude: Number(form.get("longitude")) } : {}),
      } };
      case "configuration": return { ...base, facts: configData(form) };
      case "plate": return { ...base, ...(asset.status === "retired" ? {} : readFleetOptional(form, ["plate", "plate_class", "jurisdiction"])) };
      case "meter": return { ...base, unit: meterUnit, value: Number(form.get("value")), source: readFleetText(form, "source"), replaces: meter?.id };
      case "lifecycle": return { ...base, status: readFleetText(form, "status") };
    }
  }
  return <details className="space-y-3">
    <summary className="cursor-pointer font-semibold">Update asset</summary>
    <FleetField label="Choose a change"><select value={selected} className={fleetSelectClass}
      onChange={event => setAction(event.target.value as EditAction)}>
      {available.map(value => <option key={value} value={value}>{operations[value]}</option>)}
    </select></FleetField>
    <FleetForm key={selected} asset={asset.id} action={selected} fields={data} label="Save asset change">
      {selected === "identity" && <>
        <FleetField label="Verified VIN"><Input name="vin" maxLength={35} /></FleetField>
        <FleetField label="Verified serial number"><Input name="serial" maxLength={80} /></FleetField>
      </>}
      {selected === "ownership" && <OwnershipFields asset={asset} scopes={scopes} />}
      {(selected === "operation" || selected === "location") && <OperatingFields scopes={scopes} action={selected} />}
      {selected === "configuration" && <>
        {textSpecs.map(key => <FleetField key={key} label={label(key)}>
          <Input name={key} maxLength={160} defaultValue={typeof config?.[key] === "string" ? config[key] : undefined} />
        </FleetField>)}
        {numericSpecs.map(key => <FleetField key={key} label={label(key)}>
          <Input type="number" name={key} min={key === "year" ? 1900 : 0} step={key === "year" ? "1" : "any"}
            defaultValue={typeof config?.[key] === "number" ? config[key] : undefined} />
        </FleetField>)}
        <AxleFields previous={config} />
      </>}
      {selected === "plate" && asset.status !== "retired" && <>
        <FleetField label="Plate number, blank to release only"><Input name="plate" maxLength={40} /></FleetField>
        <FleetField label="Jurisdiction code"><Input name="jurisdiction" maxLength={30} placeholder="AE-DU" /></FleetField>
        <FleetField label="Plate class"><Input name="plate_class" maxLength={30} /></FleetField>
      </>}
      {selected === "meter" && <>
        <FleetField label="Meter unit"><select value={meterUnit} className={fleetSelectClass}
          onChange={event => setMeterUnit(event.target.value as "km" | "hours")}>
          <option value="km">Kilometres</option><option value="hours">Operating hours</option>
        </select></FleetField>
        <FleetField label={meter ? "Corrected opening reading" : "Verified opening reading"}>
          <Input name="value" type="number" min={0} step={0.001} required />
        </FleetField>
        <FleetField label="Checked source reference"><Input name="source" maxLength={200} required /></FleetField>
      </>}
      {selected === "lifecycle" && <FleetField label="Status"><select name="status" required className={fleetSelectClass}>
        <option value="">Select a status</option>
        {asset.status === "draft" && <option value="active">Active in the register</option>}
        <option value="retired">Retired</option>
      </select></FleetField>}
      <FleetField label={selected === "meter" ? "Original observation date" : "Effective date"}>
        <Input key={selected === "meter" ? meterUnit : selected} name="date" type="date" max={today}
          defaultValue={selected === "meter" ? meter?.observed_on ?? today : today} required />
      </FleetField>
      <FleetField label="Reason or source"><Input name="reason" required maxLength={500} /></FleetField>
    </FleetForm>
  </details>;
}

export function FleetEvidenceForm({ asset, choices }: {
  asset: Pick<FleetAssetSummary, "id" | "revision" | "can_link" | "status">;
  choices: FleetAsset["proof_choices"];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const proof = choices.find(item => String(item.file) === selected);
  if (!asset.can_link || asset.status === "retired") return null;
  return <details open className="space-y-3">
    <summary className="cursor-pointer font-semibold">Verify registration or insurance</summary>
    {choices.length === 0 ? <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">Link a reviewed DMS document with its dated original file, then reload.</p>
      <Button type="button" variant="outline" onClick={() => router.refresh()}>Reload proof choices</Button>
    </div> : <FleetForm asset={asset.id} action="verify-document" label="Verify evidence" fields={form => ({
      revision: asset.revision, kind: proof?.kind, date: proof?.date, expires: proof?.expires,
      document: proof?.document, version: proof?.version, file: proof?.file,
      facts: readFleetOptional(form, proof?.kind === "insurance" ? insuranceFields : registrationFields),
      reason: readFleetText(form, "reason"),
    })}>
      <FleetField label="Reviewed original"><select name="proof" required value={selected}
        onChange={event => setSelected(event.target.value)} className={fleetSelectClass}>
        <option value="">Select the DMS original</option>
        {choices.map(item => <option key={item.file} value={item.file}>
          {item.label} · issued {item.date} · expires {item.expires}
        </option>)}
      </select></FleetField>
      <FleetField label="Verification reason"><Input name="reason" maxLength={500} required /></FleetField>
      {proof && (proof.kind === "insurance" ? insuranceFields : registrationFields).map(key =>
        <FleetField key={`${proof.file}-${key}`} label={label(key)}><Input name={key} maxLength={200} /></FleetField>)}
    </FleetForm>}
  </details>;
}
