import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { CurrencyWorkspaceForm } from "@/features/master-data/finance-basics/components/currency-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CurrencyNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")) redirect("/access-denied");
  if (!hasPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/currencies");
  return (
    <div className="h-full">
      <CurrencyWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
