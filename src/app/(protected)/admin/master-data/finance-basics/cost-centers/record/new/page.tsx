import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, hasGlobalPermission } from "@/lib/rbac/check";
import { CostCenterWorkspaceForm } from "@/features/master-data/finance-basics/components/cost-center-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CostCenterNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")&&!hasGlobalPermission(authContext,"master_data.finance_basics.manage")&&!hasGlobalPermission(authContext,"master_data.lookups.lock")) redirect("/access-denied");
  if (!hasGlobalPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/cost-centers");
  return (
    <div className="h-full">
      <CostCenterWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
