import { Metadata } from "next";
import { getAuthContext } from "@/lib/rbac/check";
import { getMyNotifications, getUnreadNotificationCount } from "@/server/actions/notifications/notifications";
import { NotificationsPageClient } from "@/features/notifications/notifications-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Notifications | ERP",
  description: "Your ERP in-app notifications.",
};

export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  if (!ctx.profile) return null;

  const [notifsResult, countResult] = await Promise.all([
    getMyNotifications({ limit: 200 }),
    getUnreadNotificationCount(),
  ]);

  const notifications = notifsResult.success ? (notifsResult.data ?? []) : [];
  const unreadCount = countResult.success ? (countResult.data?.count ?? 0) : 0;

  return (
    <div className="p-6 space-y-4">
      <NotificationsPageClient
        initialNotifications={notifications}
        unreadCount={unreadCount}
      />
    </div>
  );
}
