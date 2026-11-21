import Link from "next/link";
import { SupplyForm } from "@/features/supply/action-form";
import { readWorkshopMaterial } from "@/server/actions/workshop/material";

type MaterialWorkspace = NonNullable<Awaited<ReturnType<typeof readWorkshopMaterial>>>;
type Demand = MaterialWorkspace["demands"][number];
type Purchase = Demand["purchases"][number];

const date = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
const at = (value: string) => date.format(new Date(value));
const movementLabels = { issue: "Issue", "unused-return": "Unused return", reverse: "Reversal" };

function PurchaseHistory({ purchase, uom }: { purchase: Purchase; uom: string }) {
  return <li className="space-y-2">
    <p className="font-medium">{purchase.reference ?? "Purchase #" + purchase.id}{purchase.supplier && " · " + purchase.supplier}</p>
    <p>{purchase.quantity} {uom} · {purchase.approved_at ? "Approved " + at(purchase.approved_at) : "Awaiting approval"}</p>
    {purchase.receipts.length > 0 && <ul className="space-y-2 pl-3">
      {purchase.receipts.map(receipt => <li key={receipt.id} className="border-l pl-3">
        <p className="font-medium">{receipt.label ?? "Receipt #" + receipt.id} · {at(receipt.received_at)}</p>
        <p>Delivered {receipt.delivered} {uom} · Accepted {receipt.accepted} · Rejected {receipt.rejected} · Quarantined {receipt.quarantined}</p>
        {receipt.accepted_movement && <p>Accepted movement #{receipt.accepted_movement}</p>}
        {receipt.quarantine_movement && <p>Quarantine movement #{receipt.quarantine_movement}</p>}
        {receipt.inspections.map(inspection => <p key={inspection.id}>
          Inspection #{inspection.id} · {inspection.quantity} {uom} {inspection.outcome} · {at(inspection.at)}
          {inspection.movement && " · Movement #" + inspection.movement}
        </p>)}
        {receipt.returns.map(returned => <p key={returned.id}>
          Supplier return {returned.reference ?? "#" + returned.id} · {returned.quantity} {uom} · Movement #{returned.movement}
          {" · Original #"}{returned.original} · {at(returned.at)}
        </p>)}
      </li>)}
    </ul>}
  </li>;
}

function MaterialDemand({ demand }: { demand: Demand }) {
  const history = demand.reservations.length + demand.movements.length + demand.corrections.length + demand.purchases.length;
  const totals = [
    ["Requested", demand.requested], ["Reserved", demand.reserved], ["Issued", demand.issued],
    ["Returned unused", demand.returned], ["Reversed", demand.reversed], ["Still needed", demand.remaining],
  ] as const;

  return <section className="space-y-2 border-t py-3 text-sm">
    <h5 className="font-medium">{demand.source_line} · {demand.label}</h5>
    <p className="text-muted-foreground">
      Demand #{demand.id} · {demand.owner} · {at(demand.created_at)}
      {demand.source_revision && " · Recorded on revision " + demand.source_revision}
    </p>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {totals.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium tabular-nums">{value} {demand.uom}</dd></div>)}
    </dl>
    {history > 0 && <details>
      <summary className="cursor-pointer font-medium">Material transactions</summary>
      <div className="mt-2 grid gap-3 pl-3 lg:grid-cols-2">
        {demand.purchases.length > 0 && <div className="space-y-1">
          <h6 className="font-medium">Purchases and goods receipts</h6>
          <ul className="space-y-3">{demand.purchases.map(purchase => <PurchaseHistory key={purchase.id} purchase={purchase} uom={demand.uom} />)}</ul>
        </div>}
        <div className="space-y-2">
          {demand.reservations.length > 0 && <ul className="space-y-1">
            {demand.reservations.map(reservation => <li key={reservation.id}>
              Reservation #{reservation.id} · {reservation.reference} · {reservation.quantity} {demand.uom}
              {" · "}{reservation.state.replaceAll("-", " ")} · {at(reservation.at)}
            </li>)}
          </ul>}
          {demand.movements.length > 0 && <ul className="space-y-1">
            {demand.movements.map(movement => <li key={movement.id}>
              {movementLabels[movement.kind]} #{movement.id} · {movement.quantity} {demand.uom} · {at(movement.at)}
              {movement.reference && " · Original issue #" + movement.reference}
              {" · "}{movement.amount !== null && movement.currency ? movement.currency + " " + movement.amount
                : movement.valuation === "verified" ? "Finance value verified" : "Finance value pending"}
            </li>)}
          </ul>}
          {demand.corrections.length > 0 && <ul className="space-y-1">
            {demand.corrections.map(correction => <li key={correction.id}>
              {movementLabels[correction.kind]} review #{correction.id} · {correction.quantity} {demand.uom}
              {" · "}{correction.state === "pending" ? "Awaiting independent review" : correction.state}
              {" · Original issue #"}{correction.original} · {at(correction.at)}
              {correction.movement && " · Movement #" + correction.movement}
            </li>)}
          </ul>}
        </div>
      </div>
    </details>}
  </section>;
}

export async function WorkshopMaterial({ job }: { job: number }) {
  const workspace = await readWorkshopMaterial(job);
  if (!workspace) return null;
  const { branch, can_request, demands, items, owners, units } = workspace;
  const unitLabels = new Map(units.map(unit => [unit.id, unit.label]));
  const parts = items.map(item => ({ id: item.id, label: item.label + " · " + unitLabels.get(item.unit_id) }));
  const links = [
    { label: "Open Inventory", href: "/modules/inventory?branch=" + branch, visible: workspace.inventory },
    { label: "Open Procurement", href: "/modules/procurement?branch=" + branch, visible: workspace.procurement },
  ];

  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">Material</h4>
      <div className="flex flex-wrap gap-3">
        {links.filter(link => link.visible).map(link => <Link key={link.href} href={link.href}
          className="text-sm text-primary underline-offset-4 hover:underline">{link.label}</Link>)}
      </div>
    </div>
    {workspace.active && (!workspace.stock_route || !workspace.purchasing_route) && <p className="text-sm text-muted-foreground">
      Awaiting owner acceptance for {!workspace.stock_route && !workspace.purchasing_route ? "stock and purchasing"
        : !workspace.stock_route ? "stock" : "purchasing"}.
    </p>}
    {demands.length ? demands.map(demand => <MaterialDemand key={demand.id} demand={demand} />)
      : <p className="text-sm text-muted-foreground">No material requests for this job cycle.</p>}
    {can_request && <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">Request material</summary>
      <div className="mt-3">
        {items.length && owners.length ? <SupplyForm
          parent={branch} family="stock" action="demand" title="Submit material request" constants={{ job }}
          fields={[
            { key: "source_line", label: "Job line reference" },
            { key: "item", label: "Part", type: "id", options: parts },
            { key: "owner", label: "Stock owner", type: "id", options: owners, initial: owners.length === 1 ? String(owners[0].id) : undefined },
            { key: "uom", label: "Unit of measure", type: "id", options: units, initial: units.length === 1 ? String(units[0].id) : undefined },
            { key: "quantity", label: "Requested quantity", type: "quantity" },
          ]}
        /> : <p className="text-sm text-muted-foreground">Inventory must configure a part and a stock owner for this branch.</p>}
      </div>
    </details>}
  </section>;
}
