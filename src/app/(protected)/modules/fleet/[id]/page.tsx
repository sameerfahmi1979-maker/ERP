import Link from "next/link";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents/dms-entity-documents-tab";
import { FleetAssetEditor, FleetEvidenceForm } from "@/features/fleet/asset-editor";
import { FleetCustodyPanel } from "@/features/fleet/custody-panel";
import { NotificationArrival } from "@/features/notifications/notification-open";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import { fleetCategories, fleetId, type FleetAsset } from "@/lib/fleet/asset-contract";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { getFleetAsset, getFleetChoices } from "@/server/actions/fleet/assets";
import { getCustodyChoices, getFleetCustody } from "@/server/actions/fleet/custody";
import { workshopPermissions } from "@/lib/workshop/workspace";
import { z } from "zod";

const axleGeometry = z.array(z.object({
  key: z.string(), label: z.string(), role: z.string(), left: z.number().int().min(0).max(2),
  right: z.number().int().min(0).max(2), steering: z.boolean(), driven: z.boolean(), liftable: z.boolean(),
}));

function AxleLayout({ facts }: { facts?: FleetAsset["history"][number]["facts"] }) {
  const geometry = axleGeometry.safeParse(facts?.axles);
  if (!geometry.success || !geometry.data.length) return null;
  function tyres(count: number, align: "left" | "right") {
    return <span aria-hidden="true" className={`flex gap-1 ${align === "left" ? "justify-end" : "justify-start"}`}>
      {Array.from({ length: count }, (_, index) => <span key={index} className="h-7 w-2 rounded-sm bg-foreground/75" />)}
    </span>;
  }
  return <section className="space-y-2">
    <h2 className="text-lg font-semibold">Current axle layout</h2>
    <div className="max-w-xl rounded-lg border bg-card p-4 text-sm">
      <p className="mb-3 text-center text-muted-foreground">Front of asset</p>
      <ol className="space-y-3">
        {geometry.data.map(axle => <li key={axle.key} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2">
          {tyres(axle.left, "left")}
          <span className="rounded border px-2 py-1 text-center">
            <strong>{axle.label}</strong>
            <span className="block text-xs text-muted-foreground">
              {axle.role} Â· left {axle.left} Â· right {axle.right}
              {axle.driven && " Â· driven"}{axle.steering && " Â· steering"}{axle.liftable && " Â· liftable"}
            </span>
          </span>
          {tyres(axle.right, "right")}
        </li>)}
      </ol>
      <p className="mt-4 text-center text-muted-foreground">
        {String(facts?.wheel_ends)} wheel ends Â· {String(facts?.driven_ends)} driven Â· {String(facts?.tyre_positions)} tyre positions
      </p>
    </div>
  </section>;
}

function AssetHistory({ item }: { item: FleetAsset["history"][number] }) {
  const reference = [
    item.company_id && `Company #${item.company_id}`, item.branch_id && `Branch #${item.branch_id}`,
    item.site_id && `Site #${item.site_id}`, item.role_id && `Role #${item.role_id}`, item.party_id && `Party #${item.party_id}`,
  ].filter(Boolean).join(" Â· ");
  const slots = Array.isArray(item.facts.slots) ? item.facts.slots.filter((slot): slot is string => typeof slot === "string") : [];
  const facts = Object.entries(item.facts).filter(([, value]) => typeof value === "string" || typeof value === "number");
  return <li className="space-y-1 border-b py-3 last:border-0">
    <div className="font-medium"><span className="capitalize">{item.kind}</span> Â· {item.effective_on}</div>
    {reference && <p className="text-muted-foreground">{reference}</p>}
    <p>{item.reason}</p>
    {facts.length > 0 && <dl className="grid gap-x-4 gap-y-1 text-muted-foreground sm:grid-cols-2">
      {facts.map(([key, value]) => <div key={key}>
        <dt className="inline capitalize">{key.replaceAll("_", " ")} </dt><dd className="inline font-medium">{String(value)}</dd>
      </div>)}
    </dl>}
    {slots.length > 0 && <details className="pt-1">
      <summary className="cursor-pointer">Tyre positions</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">{slots.map(slot => <li key={slot}>{slot.replaceAll(":", " Â· ")}</li>)}</ul>
    </details>}
  </li>;
}

export default async function FleetAssetPage({ params,searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ custodyBefore?:string; f10_open?:string }>;
}) {
  const actor = await getAuthContext();
  if (!actor.permissionCodes.includes("fleet.assets.view")) notFound();
  const id = fleetId.safeParse(Number((await params).id));
  if (!id.success) notFound();
  const query=await searchParams;
  const before=fleetId.safeParse(Number(query.custodyBefore));
  const [asset,custody]=await Promise.all([getFleetAsset(id.data),getFleetCustody(id.data,before.success?before.data:undefined)]);
  if (!asset&&!custody) notFound();
  const custodyChoices=custody&&(custody.can_manage||custody.can_plan)?await getCustodyChoices(id.data,""):null;
  const workshopLink = workshopPermissions.some(code => actor.permissionCodes.includes(code)) &&
    <Link href={`/modules/workshop?asset=${id.data}`} className="text-sm font-medium text-primary hover:underline">Workshop and maintenance</Link>;
  const fuelLink = ROUTE_ACCESS_REGISTRY["/modules/fleet/fuel"].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code)) &&
    <Link href={`/modules/fleet/fuel?asset=${id.data}`} className="text-sm font-medium text-primary hover:underline">Manual fuel vouchers</Link>;
  const custodyPanel=custody&&<FleetCustodyPanel workspace={custody} choices={custodyChoices??{workers:[],sites:[]}} />;
  if (!asset&&custody) return <main className="space-y-6">
    <ERPPageHeader title={custody.asset_name} description={custody.asset_no}
      breadcrumbs={[{label:"Fleet assets",href:"/modules/fleet"},{label:custody.asset_no}]} />
    {workshopLink}
    {fuelLink}
    {custodyPanel}
  </main>;
  if (!asset) notFound();
  const choices = asset.can_manage ? await getFleetChoices() : null;
  const today = dubaiBusinessDate();
  const canReadDms = asset.can_see_documents && (hasPermission(actor, "dms.documents.view") || hasPermission(actor, "dms.admin"));
  const canEditLinks = asset.can_link && asset.status !== "retired" && hasPermission(actor, "dms.documents.edit");
  const currentPlate = asset.plates.find(plate => plate.valid_until === null);
  return <main className="space-y-6">
    <NotificationArrival token={query.f10_open} path={`/modules/fleet/${id.data}`}/>
    <ERPPageHeader title={asset.name} description={asset.asset_no}
      breadcrumbs={[{ label: "Fleet assets", href: "/modules/fleet" }, { label: asset.asset_no }]} />
    <dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      {[
        ["Category", fleetCategories[asset.category]], ["Register status", asset.status], ["Current plate", currentPlate?.plate_number],
        ["VIN", asset.vin], ["Serial number", asset.serial], ["Home scope", choices?.scopes.find(scope => scope.branch === asset.branch)?.label
          ?? `Company #${asset.company} Â· Branch #${asset.branch}`],
      ].map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value ?? "Unknown"}</dd>
      </div>)}
    </dl>
    <FleetAssetEditor asset={asset} scopes={choices?.scopes ?? []} today={today} />
    {workshopLink}
    {fuelLink}
    {custodyPanel}
    <AxleLayout facts={asset.history.find(item => item.kind === "configuration")?.facts} />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Asset history</h2>
      {asset.history.length === 0 ? <p className="text-sm text-muted-foreground">No dated asset history has been verified.</p> :
        <ul className="rounded-lg border px-4 text-sm">{asset.history.map(item => <AssetHistory key={item.id} item={item} />)}</ul>}
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Plate history</h2>
        {asset.plates.length === 0 ? <p className="text-sm text-muted-foreground">No verified plate is recorded.</p> : <ul className="divide-y rounded-lg border px-4 text-sm">
          {asset.plates.map(plate => <li key={plate.id} className="py-2">
            <strong>{plate.jurisdiction} {plate.plate_class} {plate.plate_number}</strong> Â· {plate.valid_from} to {plate.valid_until ?? "current"}
          </li>)}
        </ul>}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Opening meters</h2>
        {asset.meters.length === 0 ? <p className="text-sm text-muted-foreground">No verified opening reading is recorded.</p> : <ul className="divide-y rounded-lg border px-4 text-sm">
          {asset.meters.map(meter => <li key={meter.id} className="py-2">
            <strong>{meter.value} {meter.unit}</strong> Â· {meter.observed_on} Â· {meter.kind}<br />
            <span className="text-muted-foreground">{meter.source_reference}</span>
          </li>)}
        </ul>}
      </section>
    </div>
    {canReadDms && <section className="space-y-4">
      <h2 className="text-lg font-semibold">Documents and verification</h2>
      {canEditLinks && <Link href="/dms/inbox" className="text-sm font-medium text-primary hover:underline">Upload a document in DMS</Link>}
      <DmsEntityDocumentsTab authContext={actor} entityType="fleet_asset" entityId={asset.id}
        entityLabel="asset" canLinkExisting={canEditLinks} canUnlink={canEditLinks} showComplianceCards={false} />
      <FleetEvidenceForm asset={asset} />
      {asset.evidence.length > 0 && <ul className="divide-y rounded-lg border px-4 text-sm">
        {asset.evidence.map(proof => <li key={proof.id} className="py-2">
          <span className="font-medium capitalize">{proof.kind}</span> Â· {proof.effective_on} to {proof.expires_on}
          {proof.expires_on < today && " Â· Expired"} Â· DMS version {proof.version_id}
          {!proof.source_current && " Â· Source changed, verification needed"}
          <div className="text-muted-foreground">{Object.entries(proof.facts).map(([key, value]) =>
            `${key.replaceAll("_", " ")} ${String(value)}`).join(" Â· ")}</div>
        </li>)}
      </ul>}
    </section>}
  </main>;
}
