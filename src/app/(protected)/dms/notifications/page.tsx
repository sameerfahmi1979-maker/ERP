import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { DmsNotificationsPageClient } from "@/features/dms/notifications/dms-notifications-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsNotificationsPage() {
  const ctx = await getAuthContext();
  const canView =
    hasPermission(ctx, "dms.notifications.view") ||
    hasPermission(ctx, "dms.notifications.manage") ||
    hasPermission(ctx, "dms.admin");

  if (!canView) redirect("/dashboard");

  const isAdmin = hasPermission(ctx, "dms.admin") || hasPermission(ctx, "dms.notifications.manage");
  const canBridge =
    hasPermission(ctx, "dms.admin") ||
    (hasPermission(ctx, "dms.notifications.manage") &&
      hasPermission(ctx, "notifications.email_queue.manage"));

  return <DmsNotificationsPageClient isAdmin={isAdmin} canBridge={canBridge} />;
}
