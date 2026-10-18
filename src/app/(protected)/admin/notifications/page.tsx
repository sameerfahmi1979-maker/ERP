import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAuthContext, hasGlobalPermission} from "@/lib/rbac/check";
import {readNotifications} from "@/server/reads/notifications";
import {notificationReadIdentity} from "@/lib/reads/notifications-schema";
import {AdminNotificationsPageClient} from "@/features/notifications/admin/admin-notifications-page-client";
import {NotificationRecoveryPanel} from '@/features/notifications/admin/notification-recovery-panel';
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {title: "Notification Center | ERP Admin", description: "All permitted ERP notifications."};
export default async function AdminNotificationsPage() {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "notifications.admin") && !hasGlobalPermission(ctx, "notifications.manage")) redirect("/access-denied");
  const result = await readNotifications({audience: "admin"}, ctx);
  return <div className="p-6 space-y-4"><AdminNotificationsPageClient authContext={ctx} audience="admin"
    initialIdentity={notificationReadIdentity(ctx)} initialUpdatedAt={result.success ? result.updatedAt : undefined} initialPage={result.success ? result.data : undefined}/>
    <NotificationRecoveryPanel key={notificationReadIdentity(ctx)} identity={notificationReadIdentity(ctx)}/></div>;
}
