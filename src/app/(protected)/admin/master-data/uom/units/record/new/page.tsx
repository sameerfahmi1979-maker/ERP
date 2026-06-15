import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { UnitWorkspaceForm } from "@/features/master-data/uom/components/unit-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UomUnitNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.uom.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.uom.manage")) redirect("/admin/master-data/uom/units");
  return (
    <div className="h-full">
      <UnitWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
