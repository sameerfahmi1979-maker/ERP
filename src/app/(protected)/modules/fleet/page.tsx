import { Suspense } from "react";
import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewFleetAsset } from "@/features/fleet/asset-form";
import { CustodyOccurrenceLookup } from "@/features/fleet/custody-panel";
import { FleetExitChecks } from "@/features/fleet/exit-checks";
import { fleetCategories } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { getFleetChoices, listFleetAssets } from "@/server/actions/fleet/assets";
import { getFleetBoard, getFleetExitScopes, getFleetExitTasks, listHostedAssets } from "@/server/actions/fleet/custody";

const boardLabels = {
  draft:"Draft",retired:"Retired",custody:"Checked out",dispatch:"Assigned",held:"Held",reserved:"Reserved","check-required":"Check required",
} as const;

type BoardRows = NonNullable<Awaited<ReturnType<typeof getFleetBoard>>>;
type ExitReads = Awaited<ReturnType<typeof readExitChecks>>;

async function readExitChecks(requestedBranch: string | string[] | undefined) {
  const scopes = await getFleetExitScopes().catch(() => null);
  const scope = requestedBranch === undefined ? scopes?.[0] : scopes?.find(item => String(item.branch) === requestedBranch);
  const tasks = scope ? await getFleetExitTasks(scope.company, scope.branch).catch(() => null) : null;
  return { scopes, scope, tasks };
}

async function FleetExitPanel({ read, query, page }: { read: Promise<ExitReads>; query: string; page: number }) {
  const { scopes, scope, tasks } = await read;
  return <FleetExitChecks scopes={scopes} branch={scope?.branch} query={query} page={page} tasks={tasks} />;
}

async function FleetNewAsset({ read }: { read: ReturnType<typeof getFleetChoices> }) {
  const choices = await read;
  return choices ? <NewFleetAsset scopes={choices.scopes} /> : null;
}

async function FleetHostedAssets({ read }: { read: ReturnType<typeof listHostedAssets> }) {
  const hosted = await read;
  if (!hosted) return <p role="alert" className="text-sm">Hosted assets could not be loaded.</p>;
  if (!hosted.length) return null;
  return <section className="space-y-2">
    <h2 className="font-semibold">Assets in your custody from other scopes</h2>
    <ul className="divide-y rounded-md border px-4 text-sm">
      {hosted.map(row => <li key={row.id} className="py-2"><Link href={`/modules/fleet/${row.id}#custody`}
        className="text-primary hover:underline">{row.asset_no} · {row.name}</Link></li>)}
    </ul>
  </section>;
}

async function FleetBoardStatus({ asset, read }: { asset: number; read: Promise<Map<number, BoardRows[number]>> }) {
  const row = (await read).get(asset);
  if (!row) return "Check required";
  return <>{boardLabels[row.status]}{row.overdue && " · Overdue"}{row.held && row.status !== "held" && " · Hold active"}</>;
}

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; exitBranch?: string | string[]; scope?: string | string[] }> }) {
  const actor = await getAuthContext();
  const params = await searchParams;
  const canOperate = actor.permissionCodes.includes("fleet.assets.view");
  const admission = operationsOverviewAdmission(actor, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={"/modules/fleet"} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 40000 ? requestedPage : 1;
  const canViewExitChecks = actor.permissionCodes.includes("fleet.custody.manage");
  const exitBranch = canViewExitChecks && typeof params.exitBranch === "string" ? params.exitBranch : undefined;
  const assetRows = listFleetAssets(query, (page - 1) * 25).catch(() => null);
  const choices = getFleetChoices().catch(() => null);
  const hosted = listHostedAssets(query).catch(() => null);
  const exitChecks = canViewExitChecks ? readExitChecks(params.exitBranch) : null;
  const rows = await assetRows;
  const board = (rows?.length ? getFleetBoard(rows.slice(0, 25).map(row => row.id)).catch(() => null) : Promise.resolve([]))
    .then(result => new Map(result?.map(row => [row.asset, row])));
  const href = (n: number) => {
    const search = new URLSearchParams({ q: query, page: String(n) });
    if (exitBranch !== undefined) search.set("exitBranch", exitBranch);
    return `/modules/fleet?${search}`;
  };
  return <main className="space-y-5">
    <ERPPageHeader title="Fleet assets" breadcrumbs={[{ label: "Operations" }, { label: "Fleet assets" }]} />
    <Suspense fallback={null}><FleetNewAsset read={choices} /></Suspense>
    <form action="/modules/fleet" className="flex max-w-xl items-center gap-2">
      {exitBranch !== undefined && <input type="hidden" name="exitBranch" value={exitBranch} />}
      <Input aria-label="Search Fleet assets" name="q" defaultValue={query} maxLength={200}
        placeholder="Asset name, number, VIN, serial or plate" />
      <Button type="submit" variant="outline">Search</Button>
    </form>
    {exitChecks && <Suspense fallback={<p role="status" className="text-sm">Loading exit checks…</p>}>
      <FleetExitPanel read={exitChecks} query={query} page={page} />
    </Suspense>}
    {["fleet.custody.manage","fleet.availability.plan"].some(code=>actor.permissionCodes.includes(code))&&<CustodyOccurrenceLookup />}
    <Suspense fallback={null}><FleetHostedAssets read={hosted} /></Suspense>
    {rows === null ? <p role="alert">The asset register could not be loaded.</p> : rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">No matching assets.</p>
    ) : <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50"><tr>{["Asset", "Category", "Current plate", "Register status", "Availability"].map(heading =>
          <th key={heading} className="px-4 py-3 font-medium">{heading}</th>
        )}</tr></thead>
        <tbody>{rows.slice(0, 25).map(row => <tr key={row.id} className="border-t">
          <td className="px-4 py-3"><Link href={`/modules/fleet/${row.id}`} className="font-medium text-primary hover:underline">
            {row.asset_no} · {row.name}
          </Link></td>
          <td className="px-4 py-3">{fleetCategories[row.category]}</td>
          <td className="px-4 py-3">{row.plate ?? "Unknown"}</td>
          <td className="px-4 py-3 capitalize">{row.status}</td>
          <td className="px-4 py-3">
            <Suspense fallback="Checking…"><FleetBoardStatus asset={row.id} read={board} /></Suspense>
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
    {(page > 1 || (rows?.length ?? 0) > 25) && <nav aria-label="Fleet pages" className="flex gap-3">
      {page > 1 && <Link className={buttonVariants({ variant: "outline" })} href={href(page - 1)}>Previous</Link>}
      {(rows?.length ?? 0) > 25 && <Link className={buttonVariants({ variant: "outline" })} href={href(page + 1)}>Next</Link>}
    </nav>}
  </main>;
}
