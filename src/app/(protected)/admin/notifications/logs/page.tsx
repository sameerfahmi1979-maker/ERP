import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getNotificationDeliveryLogs } from "@/server/actions/notifications/delivery-logs";
import { DeliveryLogsPageClient } from "@/features/notifications/admin/delivery-logs-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Delivery Logs | ERP Admin",
  description: "ERP notification and email delivery logs.",
};

export default async function DeliveryLogsPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "notifications.logs.view") && !hasPermission(ctx, "notifications.admin")) {
    redirect("/access-denied");
  }

  const result = await getNotificationDeliveryLogs({ limit: 200 });
  const logs = result.success ? (result.data ?? []) : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <DeliveryLogsPageClient initialLogs={logs} />
    </div>
  );
}
