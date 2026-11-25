"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Form from "next/form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupplyActionQueue, SupplyRequest, SupplyWorkspace } from "@/lib/supply/contracts";
import { SupplyForm, selectStyle, type Choice, type Field } from "./action-form";

type Operation = { title: string; family: SupplyRequest["family"]; action: string; fields: Field[]; constants?: Record<string, string> };
const select = (key: string, label: string, options: Choice[], optional = false, fallback = ""): Field =>
  ({ key, label, type: "id", options, optional, initial: fallback });
const text = (key: string, label: string, optional = false): Field => ({ key, label, optional });
const qty = (key: string, label: string, initial?: string): Field => ({ key, label, type: "quantity", initial });
const choice = (key: string, label: string, entries: Record<string, string>): Field =>
  ({ key, label, options: Object.entries(entries).map(([id, name]) => ({ id, label: name })) });
const actorId = (key: string, label: string, optional = false): Field => ({ key, label, type: "id", optional });
const stockKinds = { available: "Available stock", quarantine: "Quarantine" };

function inventoryOperations(data: SupplyWorkspace, queue: SupplyActionQueue | null): Operation[] {
  const list: Operation[] = [];
  const rights = new Set(data.rights);
  const add = (family: Operation["family"], action: string, title: string, fields: Field[]) => list.push({ family, action, title, fields });
  const branchBins = data.bins.filter(bin => bin.branch === data.branch);
  const available = branchBins.filter(bin => bin.kind === "available");
  const layers = (data.layers ?? []).map(row => ({ ...row, label: `#${row.id} · ${row.label} · ${row.owner} · ${row.on_hand - row.reserved} available` }));
  const reservations = (data.reservations ?? []).map(row => ({ ...row, label: `#${row.id} · ${row.label}` }));
  const unit = select("uom", "Item unit", data.units);
  if (rights.has("supply.setup")) {
    if (data.company_setup) {
      add("setup", "unit", "Create a unit of measure", [text("code", "Unit code"), { key: "decimals", label: "Decimal places (0 to 3)", type: "integer", initial: "0" }]);
      add("setup", "item", "Create an item", [text("code", "Item code"), text("name", "Item name"), select("unit", "Unit", data.units),
        choice("kind", "Item kind", { part: "Part", fuel: "Fuel" }), choice("trace", "Trace", { none: "None", lot: "Lot", serial: "Serial" })]);
    }
    add("setup", "owner", "Create a stock owner group", [text("code", "Group code"), select("party", "Third-party owner (blank for company stock)", data.parties ?? [], true)]);
    add("setup", "bin", "Create a bin", [select("site", "Work site", data.sites ?? []), text("store", "Store"), text("code", "Bin code"), choice("kind", "Bin kind", stockKinds)]);
    add("setup", "propose", "Propose an approval route", [choice("domain", "Domain", { stock: "Stock", purchasing: "Purchasing" }),
      select("owner", "Independent business owner", data.approvers ?? [])]);
  }
  if (rights.has("supply.approve")) {
    const pendingReviews = queue?.queue === "stock-review"
      ? queue.rows.map(row => ({ id: row.id, label: `#${row.id} · ${row.item} · ${row.label}` })) : [];
    add("setup", "decide", "Decide proposed approval route", [select("policy", "Pending proposal", data.policies.filter(p => p.can_decide)
      .map(p => ({ id: p.id, label: p.domain + " · " + p.reason }))), choice("decision", "Decision", { accepted: "Accept pilot scope", suspended: "Suspend booking" })]);
    add("stock", "decide", "Decide stock review", [select("review", "Pending review", pendingReviews),
      choice("outcome", "Decision", { approved: "Approve", rejected: "Reject" })]);
  }
  if (rights.has("supply.request")) add("stock", "demand", "Request material or verified internal fuel", [
    select("job", "Workshop job (parts only)", data.jobs ?? [], true), select("fuel", "Internal voucher (fuel only)",
      (data.fuel ?? []).map(row => ({ ...row, label: `${row.label} · ${row.litres} L` })), true),
    text("source_line", "Source line reference"), select("item", "Item", data.items), select("owner", "Stock owner", data.owners), unit, qty("quantity", "Requested quantity")]);
  if (rights.has("supply.stock")) {
    add("stock", "opening", "Propose opening stock", [select("item", "Item", data.items), select("owner", "Stock owner", data.owners),
      select("bin", "Receiving bin", available), unit, qty("quantity", "Quantity"), text("lot", "Lot (if required)", true), text("serial", "Serial (if required)", true)]);
    add("stock", "count", "Propose a stock count", [select("layer", "Count group", layers.filter(r => r.count_root === null && r.kind === "available")
      .map(r => ({ ...r, label: `${r.label} · Counted balance ${r.count_total}` }))), qty("quantity", "Physical count")]);
    add("stock", "reserve", "Reserve stock or plan a transfer", [select("layer", "Exact available layer", layers.filter(r => r.kind === "available" && r.on_hand > r.reserved)),
      select("demand", "Demand (material issue)", data.demands.filter(d => d.active), true),
      select("destination", "Receiving bin (transfer only)", data.bins.filter(b => b.kind === "available"), true),
      text("reference", "Reservation reference"), qty("quantity", "Quantity")]);
    add("stock", "send", "Mark reserved transfer in transit", [select("reservation", "Reserved transfer", reservations.filter(r => r.state === "reserved" && r.destination_bin))]);
    add("stock", "complete", "Book an issue or receive a transfer", [select("reservation", "Issue or in-transit transfer", reservations.filter(r =>
      (r.state === "reserved" && r.demand_id) || r.state === "in-transit"))]);
    add("stock", "cancel", "Cancel and release a reservation", [select("reservation", "Active reservation", reservations.filter(r => ["reserved", "in-transit"].includes(r.state)))]);
    add("stock", "correction", "Request a linked return or reversal", [
      select("movement", "Original issue or transfer", (data.movements ?? []).filter(m => ["issue", "transfer"].includes(m.kind))
        .map(m => ({ id: m.id, label: `#${m.id} · ${m.kind} · ${m.item} · ${m.quantity} ${m.uom}` }))),
      choice("mode", "Correction", { "unused-return": "Unused part or fuel return", reverse: "Reverse original movement" }), unit, qty("quantity", "Affected quantity")]);
  }
  if (rights.has("supply.value")) add("stock", "value", "Verify an origin valuation", [select("layer", "Origin layer", layers.filter(r => !r.valued)),
    text("currency", "Currency code"), { ...qty("unit_cost", "Unit cost"), step: "0.0001" }, text("finance_ref", "Finance reference")]);
  return list;
}

function purchaseOperations(data: SupplyWorkspace, queue: SupplyActionQueue | null): Operation[] {
  const list: Operation[] = [];
  const rights = new Set(data.rights);
  const add = (action: string, title: string, fields: Field[]) => list.push({ family: "purchase", action, title, fields });
  const unit = select("uom", "Item unit", data.units);
  const open = data.purchases ?? [];
  const receipts = data.receipt_choices ?? (data.receipts ?? []).map(row => ({
    id: row.id, label: row.label,
    needs_inspection: row.quarantined > row.inspections.reduce((sum, inspection) => sum + inspection.quantity, 0),
  }));
  const bin = select("bin", "Available bin", data.bins.filter(r => r.kind === "available"), true);
  if (rights.has("supply.purchase")) {
    const receivableLines = queue?.queue === "receiving" ? queue.rows.map(row => ({
      id: row.id, label: `${row.label} · ${row.item} · ${row.remaining} open${row.supplier ? ` · ${row.supplier}` : ""}`,
    })) : [];
    add("prepare", "Prepare purchase line", [
      text("reference", "Purchase order reference"), { key: "line", label: "Line number", type: "integer", initial: "1" },
      select("supplier", "Approved Party Master supplier", data.suppliers ?? []), text("comparison", "Supplier comparison reference", true),
      select("item", "Item", data.items), select("owner", "Stock owner", data.owners),
      select("demand", "Linked demand", data.demands.filter(row => row.active), true), unit, qty("quantity", "Ordered quantity")]);
    add("receive", "Record delivered and inspected quantities", [select("purchase", "Approved purchase line", receivableLines),
      text("delivery_note", "Delivery note"), qty("quantity", "Delivered quantity"), qty("accepted", "Accepted", "0"), qty("rejected", "Rejected", "0"),
      qty("quarantined", "Quarantined", "0"), unit, bin, select("quarantine_bin", "Quarantine bin", data.bins.filter(b => b.kind === "quarantine"), true),
      text("lot", "Lot (if required)", true), text("serial", "Serial (if required)", true)]);
    add("supplier-return", "Record physical supplier return", [select("receipt", "Original goods receipt", receipts),
      actorId("movement", "Exact receipt movement number"), unit, qty("quantity", "Returned quantity"), text("reference", "Supplier return reference")]);
  }
  if (rights.has("supply.purchase.approve")) {
    add("approve", "Approve an independent purchase line", [select("purchase", "Pending purchase line", open.filter(r => !r.approved_at))]);
    add("quarantine", "Inspect quarantined goods", [select("receipt", "Receipt awaiting disposition", receipts.filter(row => row.needs_inspection)),
      choice("outcome", "Inspection outcome", { accepted: "Accept into stock", rejected: "Reject and retain for supplier return" }),
      bin, unit, qty("quantity", "Inspected quantity")]);
  }
  return list;
}

type QueueView = { search: string; page: number; open: boolean; scope?: string; receiptPage?: number; result: SupplyActionQueue | null };

function queueHref(workspace: "inventory" | "procurement", branch: number, view: QueueView, page: number) {
  const params = new URLSearchParams({
    branch: String(branch), ...(view.scope ? { scope: view.scope } : {}),
    queueSearch: view.search, queuePage: String(page),
    ...(view.receiptPage ? { receiptPage: String(view.receiptPage) } : {}),
  });
  return `/modules/${workspace}?${params}`;
}

function SupplyQueueControls({ view, workspace, branch }: {
  view: QueueView;
  workspace: "inventory" | "procurement";
  branch: number;
}) {
  const root = "/modules/" + workspace;
  const result = view.result;
  const target = (page: number) => queueHref(workspace, branch, view, page);
  const label = workspace === "inventory" ? "Pending stock reviews" : "Purchase lines open for receiving";
  const lastPage = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1;
  const firstRow = result && result.rows.length ? (result.page - 1) * result.pageSize + 1 : 0;
  return <div className="space-y-2 rounded-md border p-3">
    <h3 className="text-sm font-medium">{label}</h3>
    <Form action={root} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="branch" value={branch} />
      {view.scope && <input type="hidden" name="scope" value={view.scope} />}
      {view.receiptPage && <input type="hidden" name="receiptPage" value={view.receiptPage} />}
      <label className="grid max-w-sm gap-1 text-sm">
        Search {workspace === "inventory" ? "stock reviews" : "purchase lines"}
        <Input key={view.search} name="queueSearch" defaultValue={view.search} maxLength={120} />
      </label>
      <Button type="submit" size="sm" variant="outline">Search</Button>
    </Form>
    {!result ? <p role="alert" className="text-sm">Actionable records could not be loaded.</p> :
      <p role="status" className="text-sm">
        {result.totalCount === 0 ? "No matching actionable records." : firstRow === 0
          ? `No records on this page. ${result.totalCount} matching records.`
          : `Showing ${firstRow}–${firstRow + result.rows.length - 1} of ${result.totalCount} matching records`}
      </p>}
    {result && (view.page > 1 || view.page < lastPage) &&
      <nav className="flex gap-3 text-sm" aria-label={label + " pages"}>
        {view.page > 1 && <Link className="underline" href={target(Math.min(view.page - 1, lastPage))}>Previous</Link>}
        {view.page < lastPage && <Link className="underline" href={target(view.page + 1)}>Next</Link>}
      </nav>}
  </div>;
}

export function SupplyActions({ data, workspace, queueView }: {
  data: SupplyWorkspace; workspace: "inventory" | "procurement"; queueView?: QueueView;
}) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  const queueAction = workspace === "inventory" ? "stock:decide" : "purchase:receive";
  const [selection, setSelection] = useState(queueView?.open ? queueAction : "");
  const result = queueView?.result ?? null;
  const operations = workspace === "inventory" ? inventoryOperations(data, result) : purchaseOperations(data, result);
  const selected = operations.find(op => op.family + ":" + op.action === selection);
  if (!operations.length) return null;
  const queueNeedsOpening = queueView && !queueView.open && !result;
  function openQueue() {
    if (!queueView) return;
    const destination = queueHref(workspace, data.branch, queueView, queueView.page);
    startOpening(() => router.push(destination));
  }
  function chooseAction(next: string) {
    setSelection(next);
    if (next === queueAction && queueNeedsOpening) openQueue();
  }
  function transform(form: SupplyRequest["data"]) {
    if (selected?.family === "stock" && ["count", "reserve"].includes(selected.action)) {
      const layer = data.layers?.find(row => row.id === form.layer);
      if (layer) {
        form.uom = layer.uom;
        if (selected.action === "count") form.revision = layer.revision;
      }
    }
    return form;
  }
  return <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="supply-actions">
    <h2 id="supply-actions" className="font-semibold">Actions</h2>
    <select className={selectStyle + " max-w-md"} aria-label="Choose an action" value={selection} disabled={opening}
      onChange={event => chooseAction(event.target.value)}>
      <option value="">Choose an action</option>
      {operations.map(op => <option key={op.family + ":" + op.action} value={op.family + ":" + op.action}>{op.title}</option>)}
    </select>
    {selected && selection === queueAction && queueNeedsOpening && (opening
      ? <p role="status" className="text-sm">Loading actionable records…</p>
      : <p role="alert" className="text-sm">Actionable records could not be loaded.{" "}
        <Button type="button" variant="outline" size="sm" onClick={openQueue}>Retry queue</Button></p>)}
    {selected && selection === queueAction && queueView && !queueNeedsOpening &&
      <SupplyQueueControls view={queueView} workspace={workspace} branch={data.branch} />}
    {selected && (selection !== queueAction || !queueNeedsOpening) && <SupplyForm key={selection} parent={data.branch} family={selected.family} action={selected.action} title={selected.title}
      fields={selected.fields} transform={transform} />}
  </section>;
}
