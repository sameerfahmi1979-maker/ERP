import Link from "next/link";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import {
  operationsOverviewRoutes, operationsOverviewScope, operationsOverviewScopeValue,
  type OperationsOverviewRoute,
} from "@/lib/operations/admin-overview";
import { readOperationsAdminSummary } from "@/server/reads/operations-admin-overview";
import { readWorkQueueScopes } from "@/server/reads/work-queues";

export async function OperationsAdminOverview({ route, requestedScope, canOperate }: {
  route: OperationsOverviewRoute;
  requestedScope: string | string[] | undefined;
  canOperate: boolean;
}) {
  const overview = operationsOverviewRoutes[route];
  const loaded = await readWorkQueueScopes();
  const choices = loaded.status === "ok"
    ? loaded.data.filter(scope => (scope.branch === null) === overview.companyOnly)
    : [];
  const selected = operationsOverviewScope(choices, requestedScope, overview.companyOnly);
  const result = selected
    ? await readOperationsAdminSummary(overview.area, selected.company, selected.branch)
    : null;

  return <main className="space-y-5">
    <ERPPageHeader title={overview.title} description="Read-only administration overview."
      breadcrumbs={[{ label: "Administration overview" }, { label: overview.title }]} />
    {canOperate && <Link className="text-sm text-primary underline" href={route}>Open your assigned workflow</Link>}
    {loaded.status !== "ok" ? <p role="alert">Scope choices could not be loaded.</p> :
      choices.length === 0 ? <p>No active {overview.companyOnly ? "companies" : "operating branches"} are available.</p> :
      <form action={route} className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-medium">
          {overview.companyOnly ? "Company" : "Company and branch"}
          <select name="scope" defaultValue={selected ? operationsOverviewScopeValue(selected) : ""} required
            className="h-9 w-full rounded-md border bg-background px-3 font-normal sm:min-w-72">
            <option value="" disabled>Choose scope</option>
            {choices.map(scope => <option key={operationsOverviewScopeValue(scope)} value={operationsOverviewScopeValue(scope)}>
              {scope.branch_name ? scope.company_name + " · " + scope.branch_name : scope.company_name}
            </option>)}
          </select>
        </label>
        <Button type="submit" variant="outline">Open scope</Button>
      </form>}
    {loaded.status === "ok" && requestedScope !== undefined && !selected &&
      <p role="alert">Choose an active scope from the list.</p>}
    {result?.status === "restricted" && <p role="alert">This scope is unavailable. Select an active company or branch.</p>}
    {result?.status === "failed" && <p role="alert">The overview could not be loaded. Try opening the scope again.</p>}
    {result?.status === "ok" && <dl aria-label="Scope summary" className="flex flex-wrap gap-3">
      <div className="min-w-40 rounded-lg border bg-card p-4">
        <dt className="text-sm text-muted-foreground">{overview.totalLabel}</dt>
        <dd className="text-xl font-semibold tabular-nums">{result.data.total.toLocaleString("en-AE")}</dd>
      </div>
      {overview.pendingLabel && result.data.pending !== null && <div className="min-w-40 rounded-lg border bg-card p-4">
        <dt className="text-sm text-muted-foreground">{overview.pendingLabel}</dt>
        <dd className="text-xl font-semibold tabular-nums">{result.data.pending.toLocaleString("en-AE")}</dd>
      </div>}
    </dl>}
  </main>;
}

