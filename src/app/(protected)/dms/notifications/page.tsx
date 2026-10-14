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

  if (!canView) redirect("/access-denied");

  return <DmsNotificationsPageClient authContext={ctx} />;
}
