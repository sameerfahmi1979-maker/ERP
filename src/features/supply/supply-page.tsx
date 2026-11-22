import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { getAuthContext } from "@/lib/rbac/check";
import { fleetId } from "@/lib/fleet/asset-contract";
import { supplyActionQueuePage, supplyActionQueueSearch, type SupplyWorkspace } from "@/lib/supply/contracts";
import { getSupplyActionQueue, getSupplyWorkspace, listSupplyBranches } from "@/server/actions/inventory/stock-movements";
import { SupplyActions } from "./supply-actions";

const status = (value: string) => value.replaceAll("-", " ");
const date = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });

function SupplyHistory({ data, kind }: { data: SupplyWorkspace; kind: "inventory" | "procurement" }) {
  if (kind === "procurement") return <div className="grid gap-4 xl:grid-cols-2">
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Recent purchase lines</h2>
      {!data.purchases?.length && <p className="text-sm text-muted-foreground">No purchase lines in this branch.</p>}
      <ul className="divide-y">{data.purchases?.map(row => <li key={row.id} className="py-2 text-sm">
        <p className="font-medium">{row.label} · {row.approved_at ? "Approved" : "Awaiting approval"}</p>
        <p>{data.items.find(item => item.id === row.item_id)?.label} · {row.supplier ?? "Supplier restricted"}</p>
        <p className="text-muted-foreground">Ordered {row.quantity} · Delivered {row.delivered} · Open to receive {row.quantity - row.delivered}</p>
      </li>)}</ul>
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Goods receipts</h2>
      {!data.receipts?.length && <p className="text-sm text-muted-foreground">No receipts in this branch.</p>}
      <ul className="divide-y">{data.receipts?.map(row => <li key={row.id} className="space-y-1 py-2 text-sm">
        <p className="font-medium">{row.label} · {date.format(new Date(row.received_at))}</p>
        <p>Delivered {row.delivered} · Accepted {row.accepted} · Quarantined {row.quarantined} · Rejected {row.rejected}</p>
        {(row.lot || row.serial) && <p>{row.lot ? "Lot " + row.lot : "Serial " + row.serial}</p>}
        {row.accepted_movement && <p>Accepted movement #{row.accepted_movement}</p>}
        {row.quarantine_movement && <p>Quarantine movement #{row.quarantine_movement}</p>}
        {row.inspections.map(item => <p key={item.id}>Inspection · {item.quantity} {item.outcome}{item.movement && ` · Movement #${item.movement}`}</p>)}
        {row.returns.map(item => <p key={item.id}>Physical return {item.reference} · {item.quantity} · Movement #{item.movement}</p>)}
      </li>)}</ul>
    </section>
  </div>;

  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Stock layers</h2>
      {!data.layers?.length && <p className="text-sm text-muted-foreground">No stock layers in this branch.</p>}
      <ul className="divide-y">{data.layers?.map(row => <li key={row.id} className="py-2 text-sm">
        <p className="font-medium">#{row.id} · {row.label} · {row.owner}{row.kind === "quarantine" && " · Quarantine"}</p>
        <p>On hand {row.on_hand} · Reserved {row.reserved} · Available {row.kind === "available" ? row.on_hand - row.reserved : 0} · {row.valued ? "Valued" : "Finance value pending"}</p>
        {(row.lot || row.serial || row.count_root || row.count_total !== null) && <p className="text-muted-foreground">
          {row.lot && `Lot ${row.lot} · `}{row.serial && `Serial ${row.serial} · `}
          {row.count_root ? `Count adjustment for layer #${row.count_root}` : `Count group balance ${row.count_total}`}
        </p>}
      </li>)}</ul>
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Stock movements</h2>
      {!data.movements?.length && <p className="text-sm text-muted-foreground">No booked movements in this branch.</p>}
      <ul className="divide-y">{data.movements?.map(row => <li key={row.id} className="py-2 text-sm">
        <p className="font-medium capitalize">#{row.id} · {status(row.kind)} · {row.item}</p>
        <p>{row.quantity} {row.uom} · {row.owner}{row.reference && ` · Corrects #${row.reference}`}</p>
        <p className="text-muted-foreground">{date.format(new Date(row.recorded_at))} · {row.amount !== null ? `${row.currency} ${row.amount}` :
          row.valuation === "verified" ? "Finance value verified" : "Finance value pending"}</p>
      </li>)}</ul>
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Demands and reservations</h2>
      {!data.demands.length && !data.reservations?.length && <p className="text-sm text-muted-foreground">No requests or reservations in this branch.</p>}
      <ul className="divide-y text-sm">
        {data.demands.map(row => <li key={"d" + row.id} className="py-2">Demand #{row.id} · {row.label} · {row.quantity} · {row.active ? "Open source" : "Source closed"}</li>)}
        {data.reservations?.map(row => <li key={"r" + row.id} className="py-2">
          {row.label} · {row.quantity} · {status(row.state)}
          {row.demand_id && ` · Demand #${row.demand_id}`}
        </li>)}
      </ul>
    </section>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Recent stock reviews</h2>
      {!data.reviews?.length && <p className="text-sm text-muted-foreground">No counts or corrections for review.</p>}
      <ul className="divide-y text-sm">{data.reviews?.map(row => <li key={row.id} className="py-2">
        #{row.id} · {row.label} · {row.quantity} · {row.outcome ?? "Waiting for independent review"}
      </li>)}</ul>
    </section>
  </div>;
}

export async function SupplyPage({ kind, branch, scope, queueSearch, queuePage }: {
  kind: "inventory" | "procurement"; branch?: string; scope?: string | string[];
  queueSearch?: string | string[]; queuePage?: string | string[];
}) {
  const root = kind === "inventory" ? "/modules/inventory" : "/modules/procurement";
  const name = kind === "inventory" ? "Inventory" : "Procurement";
  const actor = await getAuthContext();
  const canOperate = ROUTE_ACCESS_REGISTRY[root].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code)) ?? false;
  const admission = operationsOverviewAdmission(actor, canOperate, scope);
  if (admission === "overview") return <OperationsAdminOverview route={root} requestedScope={scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const branches = await listSupplyBranches(kind);
  if (branches?.length === 0 && operationsOverviewAdmission(actor, false, scope) === "overview") {
    return <OperationsAdminOverview route={root} requestedScope={scope} canOperate={false} />;
  }
  const id = fleetId.safeParse(Number(branch)).data;
  const selected = id ? branches?.find(row => row.id === id) : branches?.length === 1 ? branches[0] : undefined;
  const data = selected ? await getSupplyWorkspace(selected.id, kind) : null;
  const search = supplyActionQueueSearch.safeParse(queueSearch).data ?? "";
  const page = typeof queuePage === "string" && /^[1-9][0-9]*$/.test(queuePage)
    ? supplyActionQueuePage.safeParse(Number(queuePage)).data ?? 1 : 1;
  const queueKind = kind === "inventory" ? "stock-review" : "receiving";
  const capability = kind === "inventory" ? "supply.approve" : "supply.purchase";
  const queueOpen = queueSearch !== undefined || queuePage !== undefined;
  const queue = queueOpen && data?.rights.includes(capability) ? await getSupplyActionQueue(data.branch, queueKind, search, page) : null;
  return <main className="space-y-4">
    <ERPPageHeader title={name} description={selected ? selected.company + " · " + selected.name : undefined}
      breadcrumbs={[{ label: "Finance & Supply" }, { label: name }]} />
    {!branches ? <p role="alert" className="text-sm">Branch choices could not be loaded.</p> :
      branches.length === 0 ? <p className="text-sm text-muted-foreground">No business branch scope assigned.</p> :
      <nav className="flex flex-wrap gap-2" aria-label="Supply branch">
        {branches.map(row => <Link href={root + "?branch=" + row.id} key={row.id}
          aria-current={selected?.id === row.id ? "page" : undefined}
          className="rounded-md border px-3 py-2 text-sm aria-[current=page]:bg-muted">{row.company} · {row.name}</Link>)}
      </nav>}
    {selected && !data && <p role="alert" className="text-sm">Branch records could not be loaded.</p>}
    {data && <>
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Approval routing</h2>
        {["stock", "purchasing"].map(domain => {
          const policy = data.policies.find(row => row.domain === domain && row.decision);
          return <p key={domain} className="text-sm capitalize">{domain} · {policy ? policy.decision + " · " + policy.name : "Awaiting named owner acceptance"}</p>;
        })}
      </section>
      <SupplyActions key={data.branch + ":" + queueOpen} workspace={kind} data={data} queueView={{
        search, page, result: queue, open: queueOpen,
        scope: typeof scope === "string" ? scope : undefined,
      }} />
      <SupplyHistory data={data} kind={kind} />
    </>}
  </main>;
}
