"use client";

import { useState } from "react";
import type { FuelWorkspace, SupplyRequest } from "@/lib/supply/contracts";
import { SupplyForm, type Field } from "./action-form";

const sourceOptions = [
  { id: "station", label: "External station" }, { id: "card", label: "Fuel card" },
  { id: "tank", label: "Company tank" }, { id: "tanker", label: "Tanker or bowser" },
];

export function FuelForm({ data }: { data: FuelWorkspace }) {
  const [source, setSource] = useState("station");
  const internal = source === "tank" || source === "tanker";
  const fields: Field[] = [
    { key: "source", label: "Source type", options: sourceOptions, initial: "station" },
    { key: "source_ref", label: internal ? "Tank or bowser reference" : "Station or card reference" },
    { key: "reference", label: "Voucher reference" },
    { key: "occurred", label: "Dispensed at (Dubai)", type: "datetime" },
    { key: "litres", label: "Litres", type: "quantity" },
    { key: "meter_unit", label: "Asset meter", options: [{ id: "km", label: "Kilometres" }, { id: "hours", label: "Engine hours" }] },
    { key: "meter_value", label: "Meter reading", type: "quantity" },
    { key: "file", label: "Verified DMS original", type: "id", options: data.evidence.map(item => ({ id: item.file, label: item.label })) },
  ];
  if (internal) fields.push(
    { key: "source_bin", label: "Exact dispensing bin", type: "id", options: data.bins },
    { key: "source_item", label: "Fuel item", type: "id", options: data.items },
    { key: "source_owner", label: "Stock owner", type: "id", options: data.owners },
  );
  else fields.push({ key: "supplier", label: "Party Master supplier", type: "id", options: data.suppliers });

  function transform(values: SupplyRequest["data"]) {
    const choice = data.evidence.find(item => item.file === values.file);
    const { file, ...rest } = values;
    return choice && file ? { ...rest, evidence: { document: choice.document, version: choice.version, file: choice.file } } : rest;
  }

  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <h2 className="font-semibold">Record voucher and meter reading</h2>
    {!data.evidence.length && <p className="text-sm text-muted-foreground">Link a verified Fuel Voucher original to this asset in DMS.</p>}
    <SupplyForm parent={data.asset} family="fuel" action="record" title="Record fuel evidence" fields={fields} transform={transform}
      onField={(key, value) => { if (key === "source") setSource(value); }} />
  </section>;
}

export function VerifyVoucher({ asset, voucher }: { asset: number; voucher: number }) {
  return <SupplyForm parent={asset} family="fuel" action="verify" title="Verify voucher" constants={{ voucher }} fields={[]} />;
}
