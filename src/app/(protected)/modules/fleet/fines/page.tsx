
import Link from "next/link";
import { OperationsAdminOverview } from "@/features/operations/admin-overview";
import { operationsOverviewAdmission } from "@/lib/operations/admin-overview";
import { notFound } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { FleetField, fleetSelectClass } from "@/features/fleet/asset-form";
import { FleetFineWorkspace } from "@/features/fleet/fine-workspace";
import { fleetId } from "@/lib/fleet/asset-contract";
import { fineAssignments, fleetFinePath } from "@/lib/fleet/fine-contract";
import { getAuthContext } from "@/lib/rbac/check";
import { readFleetFineBranches, readFleetFines } from "@/server/actions/fleet/fines";

export default async function FleetFinesPage({
  searchParams,
}: { searchParams: Promise<{ branch?: string | string[]; before?: string | string[]; scope?: string | string[] }> }) {
  const actor = await getAuthContext();
  const params = await searchParams;
  const canOperate = fineAssignments(actor.roleAssignments).length > 0;
  const admission = operationsOverviewAdmission(actor, canOperate, params.scope);
  if (admission === "overview") return <OperationsAdminOverview route={fleetFinePath} requestedScope={params.scope} canOperate={canOperate} />;
  if (admission === "denied") notFound();

  const branches = await readFleetFineBranches();
  const chosen = params.branch === undefined ? branches?.[0] :
    typeof params.branch === "string" ? branches?.find(branch => String(branch.id) === params.branch) : undefined;
  const cursor = fleetId.nullable().safeParse(params.before === undefined ? null :
    typeof params.before === "string" && /^\d+$/.test(params.before) ? Number(params.before) : NaN);
  const workspace = chosen && cursor.success ? await readFleetFines(chosen.id, cursor.data) : null;
  const newest = fleetFinePath + "?branch=" + chosen?.id;

  return <main className="space-y-5">
    <ERPPageHeader title="Fines and incidents" breadcrumbs={[{ label: "Fleet" }, { label: "Fines and incidents" }]} />
    {!branches ? <p role="alert">Operating branches could not be loaded. Reload to try again.</p> :
      branches.length === 0 ? <p>No active operating branch is assigned to you.</p> :
        <form action={fleetFinePath} className="flex flex-wrap items-end gap-3">
          <FleetField label="Operating branch">
            <select className={fleetSelectClass} name="branch" defaultValue={chosen?.id ?? ""} required>
              <option value="" disabled>Choose a branch</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>
                {branch.branch_name_en} · {branch.branch_code}
              </option>)}
            </select>
          </FleetField>
          <Button type="submit">Load branch</Button>
        </form>}
    {branches && branches.length > 0 && (!chosen ? <p role="alert">Choose one of your assigned branches.</p> :
      !workspace ? <p role="alert">The branch records could not be loaded. Reload this branch to try again.</p> :
        <FleetFineWorkspace key={chosen.id + ":" + cursor.data} workspace={workspace}>
          {cursor.data && <Link className="text-sm text-primary hover:underline" href={newest}>Latest cases</Link>}
          {workspace.next_before && <Link className="text-sm text-primary hover:underline"
            href={newest + "&before=" + workspace.next_before}>Older cases</Link>}
        </FleetFineWorkspace>)}
  </main>;
}
