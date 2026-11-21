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

export default async function FleetPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; exitBranch?: string; scope?: string | string[] }> }) {
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
  const [rows, choices, hosted, exitScopes] = await Promise.all([
    listFleetAssets(query, (page - 1) * 25), getFleetChoices(), listHostedAssets(query),
    canViewExitChecks ? getFleetExitScopes() : null,
  ]);
  const exitScope = params.exitBranch === undefined ? exitScopes?.[0] :
    exitScopes?.find(scope => String(scope.branch) === params.exitBranch);
  const [board, exitTasks] = await Promise.all([
    rows?.length ? getFleetBoard(rows.slice(0, 25).map(row => row.id)) : [],
    exitScope ? getFleetExitTasks(exitScope.company, exitScope.branch) : null,
  ]);
  const boardById = new Map(board?.map(row=>[row.asset,row]));
  const href = (n: number) => {
    const search = new URLSearchParams({ q: query, page: String(n) });
    if (exitScope) search.set("exitBranch", String(exitScope.branch));
    return `/modules/fleet?${search}`;
  };
  return <main className="space-y-5">
    <ERPPageHeader title="Fleet assets" breadcrumbs={[{ label: "Operations" }, { label: "Fleet assets" }]} />
    {choices && <NewFleetAsset scopes={choices.scopes} />}
    <form action="/modules/fleet" className="flex max-w-xl items-center gap-2">
      {exitScope && <input type="hidden" name="exitBranch" value={exitScope.branch} />}
      <Input aria-label="Search Fleet assets" name="q" defaultValue={query} maxLength={200}
        placeholder="Asset name, number, VIN, serial or plate" />
      <Button type="submit" variant="outline">Search</Button>
    </form>
    {canViewExitChecks && <FleetExitChecks scopes={exitScopes} branch={exitScope?.branch}
      query={query} page={page} tasks={exitTasks} />}
    {["fleet.custody.manage","fleet.availability.plan"].some(code=>actor.permissionCodes.includes(code))&&<CustodyOccurrenceLookup />}
    {!!hosted?.length&&<section className="space-y-2">
      <h2 className="font-semibold">Assets in your custody from other scopes</h2>
      <ul className="divide-y rounded-md border px-4 text-sm">
        {hosted.map(row=><li key={row.id} className="py-2"><Link href={`/modules/fleet/${row.id}#custody`}
          className="text-primary hover:underline">{row.asset_no} · {row.name}</Link></li>)}
      </ul>
    </section>}
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
            {boardById.get(row.id) ? boardLabels[boardById.get(row.id)!.status] : "Check required"}
            {boardById.get(row.id)?.overdue&&" · Overdue"}
            {boardById.get(row.id)?.held&&boardById.get(row.id)?.status!=="held"&&" · Hold active"}
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
