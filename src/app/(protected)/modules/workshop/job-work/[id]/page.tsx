import Link from "next/link";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { JobLabour } from "@/features/workshop/job-labour";
import { JobOutside } from "@/features/workshop/job-outside";
import { WorkshopMaterial } from "@/features/workshop/material";
import { fleetId } from "@/lib/fleet/asset-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { ROUTE_ACCESS_REGISTRY } from "@/lib/rbac/route-access-registry";
import { readWorkshopLabour, readWorkshopOutside } from "@/server/actions/workshop/labour";
import { readWorkshopMaterial } from "@/server/actions/workshop/material";

const root = "/modules/workshop/job-work";
export default async function JobWorkDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthContext();
  if (!ROUTE_ACCESS_REGISTRY[root].requiredAnyPermissions?.some(code => actor.permissionCodes.includes(code))) notFound();
  const id = fleetId.safeParse(Number((await params).id)).data;
  if (!id) notFound();
  const [labour, outside, material] = await Promise.all([readWorkshopLabour(id), readWorkshopOutside(id), readWorkshopMaterial(id)]);
  if (!labour && !outside && !material) notFound();
  return <main className="space-y-4">
    <ERPPageHeader title={labour ? `WO-${labour.assessment}/${labour.cycle}` : `Job card #${id}`}
      description={labour ? labour.asset_number + " · " + labour.asset_name : undefined}
      breadcrumbs={[{ label: "Workshop job work", href: root }, { label: "Job card" }]} />
    {labour && <Link className="font-medium text-primary hover:underline" href={`/modules/workshop?asset=${labour.asset}`}>
      Assessment, job history and technical QC
    </Link>}
    {labour && <JobLabour data={labour} />}
    {material && <WorkshopMaterial workspace={material} />}
    {outside && <JobOutside data={outside} />}
  </main>;
}
