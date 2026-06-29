import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getAllNotifications } from "@/server/actions/notifications/notifications";
import { AdminNotificationsPageClient } from "@/features/notifications/admin/admin-notifications-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Notification Center | ERP Admin",
  description: "All ERP in-app and email notifications.",
};

export default async function AdminNotificationsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "notifications.admin") && !hasPermission(ctx, "notifications.manage")) {
    redirect("/access-denied");
  }

  const result = await getAllNotifications({ limit: 300 });
  const notifications = result.success ? (result.data ?? []) : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <AdminNotificationsPageClient initialNotifications={notifications} />
    </div>
  );
}
