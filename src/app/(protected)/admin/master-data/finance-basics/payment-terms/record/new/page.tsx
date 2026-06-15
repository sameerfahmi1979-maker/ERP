import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { PaymentTermWorkspaceForm } from "@/features/master-data/finance-basics/components/payment-term-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PaymentTermNewPage() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, "master_data.finance_basics.view")) redirect("/dashboard");
  if (!hasPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/payment-terms");
  return (
    <div className="h-full">
      <PaymentTermWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
