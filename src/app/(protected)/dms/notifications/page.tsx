import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";
import { canViewDmsNotifications } from "@/lib/notifications/access";
import { DmsNotificationsPageClient } from "@/features/dms/notifications/dms-notifications-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DmsNotificationsPage() {
  const ctx = await getAuthContext();
  if (!canViewDmsNotifications(ctx)) redirect("/access-denied");

  return <DmsNotificationsPageClient authContext={ctx} />;
}
