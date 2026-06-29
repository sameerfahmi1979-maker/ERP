import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { DmsExpiryDashboardPageClient } from "@/features/dms/expiry/dms-expiry-dashboard-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsExpiringPage() {
  const ctx = await getAuthContext();
  const canView =
    hasPermission(ctx, "dms.expiry.view") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.admin");

  if (!canView) redirect("/access-denied");

  const isAdmin = hasPermission(ctx, "dms.admin") || hasPermission(ctx, "dms.expiry.manage");
  const canBridge =
    hasPermission(ctx, "dms.admin") ||
    (hasPermission(ctx, "dms.notifications.manage") &&
      hasPermission(ctx, "notifications.email_queue.manage"));

  return <DmsExpiryDashboardPageClient isAdmin={isAdmin} canBridge={canBridge} />;
}
