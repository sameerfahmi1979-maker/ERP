import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import {canReadFinanceReferences} from '@/lib/master-data/finance-reference-contract';
import { PaymentTermWorkspaceForm } from "@/features/master-data/finance-basics/components/payment-term-workspace-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PaymentTermNewPage() {
  const authContext = await getAuthContext();
  if (!canReadFinanceReferences(authContext)) redirect("/access-denied");
  if (!hasGlobalPermission(authContext, "master_data.finance_basics.manage")) redirect("/admin/master-data/finance-basics/payment-terms");
  return (
    <div className="h-full">
      <PaymentTermWorkspaceForm mode="add" authContext={authContext} />
    </div>
  );
}
