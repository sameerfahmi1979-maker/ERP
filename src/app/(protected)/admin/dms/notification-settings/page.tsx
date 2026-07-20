import { redirect } from "next/navigation";
import { getAuthContext, hasPermission, isGlobalAdmin } from "@/lib/rbac/check";
import { getDmsNotificationSettings } from "@/server/actions/dms/notification-settings";
import { ERPPageHeader } from "@/components/erp/page-header";
import { DmsNotificationSettingsClient } from "@/features/dms/notifications/dms-notification-settings-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "DMS Notification Settings | ERP",
  description: "Configure global DMS expiry notification recipients and reminder windows.",
};

export default async function DmsNotificationSettingsPage() {
  const ctx = await getAuthContext();
  if (
    !isGlobalAdmin(ctx) &&
    !hasPermission(ctx, "dms.admin") &&
    !hasPermission(ctx, "dms.notifications.manage") &&
    !hasPermission(ctx, "dms.notifications.settings.manage")
  ) {
    redirect("/access-denied");
  }

  const result = await getDmsNotificationSettings();
  const settings = result.success ? result.data ?? null : null;

  return (
    <div className="p-6 space-y-4">
      <ERPPageHeader
        title="DMS Notification Settings"
        description="Configure who receives automatic DMS document expiry reminders and alerts."
        breadcrumbs={[
          { label: "Admin", href: "/dashboard" },
          { label: "DMS Admin", href: "/admin/dms" },
          { label: "Notification Settings" },
        ]}
      />
      <DmsNotificationSettingsClient initialSettings={settings} />
    </div>
  );
}
