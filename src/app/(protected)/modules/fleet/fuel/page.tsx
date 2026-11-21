import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { FuelForm, VerifyVoucher } from "@/features/supply/fuel-form";
import { fleetId } from "@/lib/fleet/asset-contract";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { getAuthContext } from "@/lib/rbac/check";
import { listFuelAssets, readFuelAsset } from "@/server/actions/inventory/stock-movements";

const root = "/modules/fleet/fuel";
const date = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });

export default async function FuelPage({ searchParams }: { searchParams: Promise<{ asset?: string; scope?: string | string[] }> }) {
  const actor = await getAuthContext();
  const params = await searchParams;
  const canOperate = ROUTE_ACCESS_REGISTRY[root].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code)) ?? false;
  const admission = operationsOverviewAdmission(actor, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={root} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const asset = fleetId.safeParse(Number(params.asset)).data;
  const detail = asset ? await readFuelAsset(asset) : null;
  const list = !asset ? await listFuelAssets() : null;
  return <main className="space-y-4">
    <ERPPageHeader title="Manual fuel vouchers" description={detail?.label}
      breadcrumbs={[{ label: "Fleet operations" }, { label: "Manual fuel", href: root }]} />
    {!asset && <>
      {!list ? <p role="alert" className="text-sm">Fuel assets could not be loaded.</p> :
        list.assets.length === 0 ? <p className="text-sm text-muted-foreground">No fuel assets in your scope.</p> :
        <ul className="divide-y rounded-lg border bg-card px-4">{list.assets.map(row => <li key={row.id} className="py-2">
          <Link className="text-sm font-medium text-primary hover:underline" href={root + "?asset=" + row.id}>{row.label}</Link>
        </li>)}</ul>}
    </>}
    {asset && !detail && <p role="alert" className="text-sm">The asset is unavailable in this scope.</p>}
    {detail && <>
      {detail.report && <FuelForm data={detail} />}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Voucher history</h2>
        {!detail.vouchers.length && <p className="text-sm text-muted-foreground">No vouchers recorded for this asset.</p>}
        <ul className="divide-y">{detail.vouchers.map(row => <li key={row.id} className="space-y-2 py-3 text-sm">
          <p className="font-medium">{row.reference} · {row.source_kind} · {row.source_ref}</p>
          <p>{row.litres} L · {row.meter_value} {row.meter_unit} · {date.format(new Date(row.occurred_at))}</p>
          <p>{row.accepted_at ? "Verified voucher" : "Awaiting independent verification"} · {row.booked_litres} L booked through Inventory</p>
          {row.issues.map(issue => <p className="text-muted-foreground" key={issue.id}>Issue #{issue.id} · {issue.issued} L issued · {issue.returned} L returned</p>)}
          <p className="text-muted-foreground">{row.reason}</p>
          {row.file && <a className="text-primary hover:underline" href={`/api/dms/file?fileId=${row.file}`}>Voucher original</a>}
          {row.can_verify && <VerifyVoucher asset={detail.asset} voucher={row.id} />}
        </li>)}</ul>
      </section>
    </>}
  </main>;
}
