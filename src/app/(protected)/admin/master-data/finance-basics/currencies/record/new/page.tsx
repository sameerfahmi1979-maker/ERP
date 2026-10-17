import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import { CurrencyWorkspaceForm } from "@/features/master-data/finance-basics/components/currency-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CurrencyNewPage() {
  const authContext = await getAuthContext();
  if (!hasGlobalPermission(authContext, "master_data.finance_basics.manage")) redirect("/access-denied");
  return (
    <div className="h-full">
      <CurrencyWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
