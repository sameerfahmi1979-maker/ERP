import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssessmentCards, FindingIntake } from "@/features/workshop/assessments";
import { MaintenanceClocks } from "@/features/workshop/maintenance";
import { fleetId } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { workshopPermissions } from "@/lib/workshop/workspace";
import { listWorkshopAssets, readWorkshopAsset } from "@/server/actions/workshop/workshop";

const root = "/modules/workshop";
const parseId = (value?: string) => fleetId.safeParse(Number(value)).data;

export default async function WorkshopPage({ searchParams }: {
  searchParams: Promise<{ asset?: string; q?: string; before?: string; scope?: string | string[] }>;
}) {
  const actor = await getAuthContext();
  const search = await searchParams;
  const canOperate = workshopPermissions.some(code => actor.permissionCodes.includes(code));
  const admission = operationsOverviewAdmission(actor, canOperate, search.scope);
  if (admission === "overview") return <OperationsAdminOverview route={root} requestedScope={search.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const asset = parseId(search.asset);
  const before = parseId(search.before);

  if (asset) {
    const detail = await readWorkshopAsset(asset, before);
    return <main className="space-y-5">
      <ERPPageHeader title={detail ? detail.number + " · " + detail.name : "Workshop asset"}
        breadcrumbs={[{ label: "Workshop", href: root }, { label: "Asset" }]} />
      {!detail ? <div className="rounded-lg border p-4 text-sm" role="alert">The asset could not be loaded in your current scope.
        <Link href={root} className="ml-2 text-primary underline">Return to asset list</Link></div> :
        <>
          {detail.report && <FindingIntake data={detail} />}
          <AssessmentCards data={detail} />
          {detail.cases.length === 25 && <Link className={buttonVariants({ variant: "outline" })}
            href={`${root}?asset=${asset}&before=${detail.cases[24].id}`}>Older findings</Link>}
          {(detail.maintenance || detail.clocks.length > 0) && <MaintenanceClocks data={detail} />}
        </>}
    </main>;
  }

  const query = search.q?.slice(0, 100) ?? "";
  const rows = await listWorkshopAssets(query, before);
  return <main className="space-y-5">
    <ERPPageHeader title="Workshop" description="Review asset findings, service clocks and technical releases."
      breadcrumbs={[{ label: "Operations" }, { label: "Workshop" }]} />
    <form action={root} className="flex flex-wrap gap-2">
      <Input className="max-w-sm" name="q" placeholder="Search by asset number or name" aria-label="Search by asset number or name"
        maxLength={100} defaultValue={query} />
      <Button type="submit" variant="outline">Search</Button>
    </form>
    {!rows ? <p className="rounded-lg border p-4 text-sm" role="alert">The Workshop asset list could not be loaded.</p> :
      rows.length === 0 ? <p className="text-sm text-muted-foreground">No assets match in your scope.</p> :
      <ul className="divide-y rounded-lg border bg-card px-4 text-sm">{rows.map(row =>
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link className="font-medium text-primary hover:underline" href={`${root}?asset=${row.id}`}>{row.asset_no} · {row.name}</Link>
          {row.needs_assessment && <span className="rounded border border-amber-600/50 px-2 py-1">Assessment needed</span>}
        </li>)}</ul>}
    {rows?.length === 30 && <Link className={buttonVariants({ variant: "outline" })}
      href={`${root}?${new URLSearchParams({ q: query, before: String(rows[29].id) })}`}>Older assets</Link>}
  </main>;
}
