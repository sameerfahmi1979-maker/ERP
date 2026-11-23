import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { getAuthContext } from "@/lib/rbac/check";
import { fleetId } from "@/lib/fleet/asset-contract";
import { supplyActionQueuePage, supplyActionQueueSearch, supplyMaxPage, type SupplyReceiptHistory, type SupplyWorkspace } from "@/lib/supply/contracts";
import { getSupplyActionQueue, getSupplyReceiptHistory, getSupplyWorkspace, listSupplyBranches } from "@/server/actions/inventory/stock-movements";
import { SupplyActions } from "./supply-actions";

const status = (value: string) => value.replaceAll("-", " ");
const date = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
const historyLinkClass = "text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline";

function ReceiptHistory({ page, result, filters }: {
  page: number | null; result: SupplyReceiptHistory | null; filters: URLSearchParams;
}) {
  const href = (target: number) => {
    const params = new URLSearchParams(filters);
    params.set("receiptPage", String(target));
    return "/modules/procurement?" + params.toString();
  };
  const lastPage = result ? Math.max(1, Math.ceil(result.totalCount / result.pageSize)) : 1;
  const firstRow = result ? (result.page - 1) * result.pageSize + 1 : 1;
  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <h2 className="font-semibold">Goods receipts</h2>
    {page === null ? <Link prefetch={false} className={historyLinkClass} href={href(1)}>Open receipt history</Link> :
      !result ? <p role="alert" className="text-sm">Goods receipt history could not be loaded. <Link prefetch={false} className={historyLinkClass} href={href(page)}>Retry</Link></p> : <>
        <p role="status" className="text-sm text-muted-foreground">{result.totalCount === 0 ? "No receipts in this branch." :
          result.rows.length === 0 ? `No receipts on this page. ${result.totalCount} receipts in this branch.` :
            `Showing ${firstRow}–${firstRow + result.rows.length - 1} of ${result.totalCount} receipts`}</p>
        <ul className="divide-y">{result.rows.map(row => <li key={row.id} className="space-y-1 py-2 text-sm">
          <p className="font-medium">{row.label} · {date.format(new Date(row.received_at))}</p>
          <p>Delivered {row.delivered} · Accepted {row.accepted} · Quarantined {row.quarantined} · Rejected {row.rejected}</p>
          {(row.lot || row.serial) && <p>{row.lot ? "Lot " + row.lot : "Serial " + row.serial}</p>}
          {row.accepted_movement && <p>Accepted movement #{row.accepted_movement}</p>}
          {row.quarantine_movement && <p>Quarantine movement #{row.quarantine_movement}</p>}
          {row.inspections.map(item => <p key={item.id}>Inspection · {item.quantity} {item.outcome}{item.movement && ` · Movement #${item.movement}`}</p>)}
          {row.returns.map(item => <p key={item.id}>Physical return {item.reference} · {item.quantity} · Movement #{item.movement}</p>)}
        </li>)}</ul>
        {(page > 1 || page < lastPage) && <nav className="flex flex-wrap gap-3 text-sm" aria-label="Goods receipt pages">
          {page > 1 && <Link prefetch={false} className={historyLinkClass} href={href(1)}>First</Link>}
          {page > 2 && <Link prefetch={false} className={historyLinkClass} href={href(Math.min(page - 1, lastPage))}>Previous</Link>}
          {page < lastPage && page < supplyMaxPage && <Link prefetch={false} className={historyLinkClass} href={href(page + 1)}>Next</Link>}
        </nav>}
      </>}
  </section>;
}

function ProcurementHistory({ data, history }: { data: SupplyWorkspace; history: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Recent purchase lines</h2>
      {!data.purchases?.length && <p className="text-sm text-muted-foreground">No purchase lines in this branch.</p>}
      <ul className="divide-y">{data.purchases?.map(row => <li key={row.id} className="py-2 text-sm">
        <p className="font-medium">{row.label} · {row.approved_at ? "Approved" : "Awaiting approval"}</p>
        <p>{data.items.find(item => item.id === row.item_id)?.label} · {row.supplier ?? "Supplier restricted"}</p>
        <p className="text-muted-foreground">Ordered {row.quantity} · Delivered {row.delivered} · Open to receive {row.quantity - row.delivered}</p>
      </li>)}</ul>
    </section>
    {history}
  </div>;
}

function InventoryHistory({ data }: { data: SupplyWorkspace }) {
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

const pageNumber = (value: string | string[] | undefined) => typeof value === "string" && /^[1-9][0-9]*$/.test(value)
  ? supplyActionQueuePage.safeParse(Number(value)).data ?? 1 : 1;

export async function SupplyPage({ kind, branch, scope, queueSearch, queuePage, receiptPage }: {
  kind: "inventory" | "procurement"; branch?: string; scope?: string | string[];
  queueSearch?: string | string[]; queuePage?: string | string[]; receiptPage?: string | string[];
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
  const page = pageNumber(queuePage);
  const queueKind = kind === "inventory" ? "stock-review" : "receiving";
  const capability = kind === "inventory" ? "supply.approve" : "supply.purchase";
  const queueOpen = queueSearch !== undefined || queuePage !== undefined;
  const historyPage = kind === "procurement" && receiptPage !== undefined ? pageNumber(receiptPage) : null;
  const [queue, history] = await Promise.all([
    queueOpen && data?.rights.includes(capability) ? getSupplyActionQueue(data.branch, queueKind, search, page) : null,
    data && historyPage !== null ? getSupplyReceiptHistory(data.branch, historyPage) : null,
  ]);
  const historyFilters = new URLSearchParams({
    branch: String(data?.branch ?? ""), ...(typeof scope === "string" ? { scope } : {}),
    ...(queueOpen ? { queueSearch: search, queuePage: String(page) } : {}),
  });
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
        receiptPage: historyPage ?? undefined,
      }} />
      {kind === "procurement" ? <ProcurementHistory data={data} history={<ReceiptHistory page={historyPage} result={history} filters={historyFilters} />} /> :
        <InventoryHistory data={data} />}
    </>}
  </main>;
}
