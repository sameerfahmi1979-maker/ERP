import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsEntityDocumentsTab } from "@/features/dms/entity-documents/dms-entity-documents-tab";
import { FleetAssetEditor, FleetEvidenceForm } from "@/features/fleet/asset-editor";
import { FleetCustodyPanel } from "@/features/fleet/custody-panel";
import { NotificationArrival } from "@/features/notifications/notification-open";
import { dubaiBusinessDate } from "@/lib/dubai-calendar";
import {
  fleetAssetPageNumber, fleetAssetSection, fleetCategories, fleetId,
  type FleetAsset, type FleetAssetSection, type FleetAssetSummary,
} from "@/lib/fleet/asset-contract";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { getFleetAsset, getFleetAssetPage, getFleetChoices } from "@/server/actions/fleet/assets";
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

type FleetChoicesRead = ReturnType<typeof getFleetChoices>;

async function FleetHomeScope({ branch, fallback, choices }: { branch: number; fallback: string; choices: FleetChoicesRead }) {
  return (await choices)?.scopes.find(scope => scope.branch === branch)?.label ?? fallback;
}

async function FleetEditor({ asset, choices, today }: { asset: FleetAssetSummary; choices: FleetChoicesRead; today: string }) {
  return <FleetAssetEditor asset={asset} scopes={(await choices)?.scopes ?? []} today={today} />;
}

async function FleetCustody({ asset, read }: { asset: number; read: ReturnType<typeof getFleetCustody> }) {
  const custody = await read;
  if (!custody) return null;
  const choices = custody.can_manage || custody.can_plan ? await getCustodyChoices(asset, "").catch(() => null) : null;
  return <FleetCustodyPanel workspace={custody} choices={choices ?? { workers: [], sites: [] }} />;
}

const fleetPanels = {
  history: "Asset history",
  plates: "Plate history",
  meters: "Opening meters",
  documents: "Documents and verification",
  evidence: "Verified evidence",
  proof: "Verify registration or insurance",
} as const;

type FleetPanel = keyof typeof fleetPanels;

async function AssetHistoryPage({ asset, section, page, today, href }: {
  asset: FleetAssetSummary; section: FleetAssetSection; page: number; today: string;
  href: (panel: FleetPanel, page?: number) => string;
}) {
  const result = await getFleetAssetPage(asset.id, section, page).catch(() => null);
  if (!result) return <p id="asset-panel" role="alert">This history page could not be loaded.</p>;

  const { id, revision, can_link, status } = asset;
  return <section id="asset-panel" className="space-y-2">
    <h2 className="text-lg font-semibold">{fleetPanels[result.section]}</h2>
    {result.section === "proof" ? <FleetEvidenceForm
      key={page} asset={{ id, revision, can_link, status }} choices={result.rows} /> :
      result.rows.length === 0 && <p className="text-sm text-muted-foreground">No matching records.</p>}
    {result.section === "history" && result.rows.length > 0 &&
      <ul className="rounded-lg border px-4 text-sm">
        {result.rows.map(item => <AssetHistory key={item.id} item={item} />)}
      </ul>}
    {result.section === "plates" && result.rows.length > 0 &&
      <ul className="divide-y rounded-lg border px-4 text-sm">
        {result.rows.map(plate => <li key={plate.id} className="py-2">
          <strong>{plate.jurisdiction} {plate.plate_class} {plate.plate_number}</strong> · {plate.valid_from} to {plate.valid_until ?? "current"}
        </li>)}
      </ul>}
    {result.section === "meters" && result.rows.length > 0 &&
      <ul className="divide-y rounded-lg border px-4 text-sm">
        {result.rows.map(meter => <li key={meter.id} className="py-2">
          <strong>{meter.value} {meter.unit}</strong> · {meter.observed_on} · {meter.kind}<br />
          <span className="text-muted-foreground">{meter.source_reference}</span>
        </li>)}
      </ul>}
    {result.section === "evidence" && result.rows.length > 0 &&
      <ul className="divide-y rounded-lg border px-4 text-sm">
        {result.rows.map(proof => <li key={proof.id} className="py-2">
          <span className="font-medium capitalize">{proof.kind}</span> · {proof.effective_on} to {proof.expires_on}
          {proof.expires_on < today && " · Expired"} · DMS version {proof.version_id}
          {!proof.source_current && " · Source changed, verification needed"}
          <div className="text-muted-foreground">{Object.entries(proof.facts).map(([key, value]) =>
            `${key.replaceAll("_", " ")} ${String(value)}`).join(" · ")}</div>
        </li>)}
      </ul>}
    {(page > 1 || result.has_more) && <nav aria-label={`${fleetPanels[result.section]} pages`} className="flex gap-3">
      {page > 1 && <Link prefetch={false} href={href(result.section, page - 1)}>Previous</Link>}
      {result.has_more && <Link prefetch={false} href={href(result.section, page + 1)}>Next</Link>}
    </nav>}
  </section>;
}

export default async function FleetAssetPage({ params,searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ custodyBefore?:string; f10_open?:string; assetPanel?: string; assetPage?: string }>;
}) {
  const actor = await getAuthContext();
  if (!actor.permissionCodes.includes("fleet.assets.view")) notFound();
  const id = fleetId.safeParse(Number((await params).id));
  if (!id.success) notFound();
  const query=await searchParams;
  const before=fleetId.safeParse(Number(query.custodyBefore));
  const assetRead = getFleetAsset(id.data);
  const custodyRead = getFleetCustody(id.data, before.success ? before.data : undefined).catch(() => null);
  const asset = await assetRead;
  const workshopLink = workshopPermissions.some(code => actor.permissionCodes.includes(code)) &&
    <Link href={`/modules/workshop?asset=${id.data}`} className="text-sm font-medium text-primary hover:underline">Workshop and maintenance</Link>;
  const fuelLink = ROUTE_ACCESS_REGISTRY["/modules/fleet/fuel"].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code)) &&
    <Link href={`/modules/fleet/fuel?asset=${id.data}`} className="text-sm font-medium text-primary hover:underline">Manual fuel vouchers</Link>;
  const custodyPanel = <Suspense fallback={<p role="status" className="text-sm">Loading custody…</p>}>
    <FleetCustody asset={id.data} read={custodyRead} />
  </Suspense>;
  if (!asset) {
    const custody = await custodyRead;
    if (!custody) notFound();
    return <main className="space-y-6">
      <ERPPageHeader title={custody.asset_name} description={custody.asset_no}
        breadcrumbs={[{ label: "Fleet assets", href: "/modules/fleet" }, { label: custody.asset_no }]} />
      {workshopLink}
      {fuelLink}
      {custodyPanel}
    </main>;
  }
  const choices = asset.can_manage ? getFleetChoices().catch(() => null) : Promise.resolve(null);
  const homeScope = `Company #${asset.company} · Branch #${asset.branch}`;
  const today = dubaiBusinessDate();
  const canReadDms = asset.can_see_documents && (hasPermission(actor, "dms.documents.view") || hasPermission(actor, "dms.admin"));
  const canEditLinks = asset.can_link && asset.status !== "retired" && hasPermission(actor, "dms.documents.edit");
  const currentPlate = asset.plates.find(plate => plate.valid_until === null);
  const panels: FleetPanel[] = ["history", "plates", "meters"];
  if (canReadDms) {
    panels.push("documents", "evidence");
    if (asset.can_link && asset.status !== "retired") panels.push("proof");
  }
  const activePanel = panels.find(panel => panel === query.assetPanel);
  const selectedSection = fleetAssetSection.safeParse(activePanel);
  const selectedPage = fleetAssetPageNumber.safeParse(typeof query.assetPage === "string" ? Number(query.assetPage) : 1);
  const panelHref = (panel: FleetPanel, page = 1) => {
    const search = new URLSearchParams();
    if (before.success) search.set("custodyBefore", String(before.data));
    search.set("assetPanel", panel);
    if (page > 1) search.set("assetPage", String(page));
    return `/modules/fleet/${id.data}?${search}#asset-panel`;
  };
  return <main className="space-y-6">
    <NotificationArrival token={query.f10_open} path={`/modules/fleet/${id.data}`}/>
    <ERPPageHeader title={asset.name} description={asset.asset_no}
      breadcrumbs={[{ label: "Fleet assets", href: "/modules/fleet" }, { label: asset.asset_no }]} />
    <dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
      {([
        ["Category", fleetCategories[asset.category]], ["Register status", asset.status], ["Current plate", currentPlate?.plate_number],
        ["VIN", asset.vin], ["Serial number", asset.serial],
        ["Home scope", <Suspense key="home-scope" fallback={homeScope}>
          <FleetHomeScope branch={asset.branch} fallback={homeScope} choices={choices} />
        </Suspense>],
      ] as const).map(([label, value]) => <div key={label} className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value ?? "Unknown"}</dd>
      </div>)}
    </dl>
    <Suspense fallback={null}><FleetEditor asset={asset} choices={choices} today={today} /></Suspense>
    {workshopLink}
    {fuelLink}
    {custodyPanel}
    <AxleLayout facts={asset.history.find(item => item.kind === "configuration")?.facts} />
    <nav aria-label="Fleet asset records" className="flex flex-wrap gap-3">
      {panels.map(panel => <Link key={panel} href={panelHref(panel)} prefetch={false}
        aria-current={panel === activePanel ? "page" : undefined} className="text-sm font-medium text-primary hover:underline">
        {fleetPanels[panel]}
      </Link>)}
    </nav>
    {selectedSection.success && <Suspense fallback={<p id="asset-panel" role="status" className="text-sm">Loading history…</p>}>
      <AssetHistoryPage asset={asset} section={selectedSection.data} page={selectedPage.success ? selectedPage.data : 1}
        today={today} href={panelHref} />
    </Suspense>}
    {activePanel === "documents" && <section id="asset-panel" className="space-y-4">
      <h2 className="text-lg font-semibold">Documents and verification</h2>
      {canEditLinks && <Link href="/dms/inbox" className="text-sm font-medium text-primary hover:underline">Upload a document in DMS</Link>}
      <DmsEntityDocumentsTab authContext={actor} entityType="fleet_asset" entityId={asset.id}
        entityLabel="asset" canLinkExisting={canEditLinks} canUnlink={canEditLinks} showComplianceCards={false} />
    </section>}
  </main>;
}
