import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { fleetId } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { listWorkshopWork } from "@/server/actions/workshop/labour";

const path = "/modules/workshop/job-work";
export default async function WorkshopJobIndex({ searchParams }: { searchParams: Promise<{ before?: string; scope?: string | string[] }> }) {
  const actor = await getAuthContext();
  const params = await searchParams;
  const canOperate = ROUTE_ACCESS_REGISTRY[path].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code)) ?? false;
  const admission = operationsOverviewAdmission(actor, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={path} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();
  const before = fleetId.safeParse(Number(params.before)).data;
  const rows = await listWorkshopWork(before);
  return <main className="space-y-4">
    <ERPPageHeader title="Workshop job work" breadcrumbs={[{ label: "Workshop" }, { label: "Job work" }]} />
    {!rows ? <p role="alert">Job cards could not be loaded.</p> :
      rows.length === 0 ? <p className="text-muted-foreground">No job cards in your assigned scope.</p> :
      <ul className="divide-y rounded-lg border bg-card px-4">
        {rows.map(row => <li key={row.id} className="py-3 text-sm">
          <Link className="font-medium text-primary hover:underline" href={`${path}/${row.id}`}>
            WO-{row.assessment_id}/{row.cycle} · {row.asset_no} · {row.asset_name}
          </Link>
          <p>{row.title} · {row.state.replaceAll("-", " ")}</p>
        </li>)}
      </ul>}
    {rows?.length === 40 && <Link className="text-primary hover:underline" href={`${path}?before=${rows[39].id}`}>Older job cards</Link>}
  </main>;
}
