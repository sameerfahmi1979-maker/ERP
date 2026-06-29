import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { ProfitCenterWorkspaceForm } from "@/features/master-data/finance-basics/components/profit-center-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfitCenterNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")) redirect("/access-denied");
  if (!hasPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/profit-centers");
  return (
    <div className="h-full">
      <ProfitCenterWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
