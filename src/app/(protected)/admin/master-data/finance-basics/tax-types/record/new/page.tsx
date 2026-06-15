import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { TaxTypeWorkspaceForm } from "@/features/master-data/finance-basics/components/tax-type-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TaxTypeNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/tax-types");
  return (
    <div className="h-full">
      <TaxTypeWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
