import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getNotificationTemplates } from "@/server/actions/notifications/templates";
import { NotificationTemplatesPageClient } from "@/features/notifications/admin/notification-templates-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Notification Templates | ERP Admin",
  description: "Manage ERP notification and email templates.",
};

export default async function NotificationTemplatesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "notifications.templates.view") && !hasPermission(ctx, "notifications.admin")) {
    redirect("/access-denied");
  }

  const result = await getNotificationTemplates();
  const templates = result.success ? (result.data ?? []) : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <NotificationTemplatesPageClient
        initialTemplates={templates}
        canManage={hasPermission(ctx, "notifications.templates.manage") || hasPermission(ctx, "notifications.admin")}
      />
    </div>
  );
}
