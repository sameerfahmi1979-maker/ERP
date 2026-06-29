import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { DmsRenewalRequestsPageClient } from "@/features/dms/renewals/dms-renewal-requests-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsRenewalsPage() {
  const ctx = await getAuthContext();
  const canView =
    hasPermission(ctx, "dms.renewals.view") ||
    hasPermission(ctx, "dms.renewals.manage") ||
    hasPermission(ctx, "dms.admin");

  if (!canView) redirect("/access-denied");

  return <DmsRenewalRequestsPageClient />;
}
