import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getEmailQueue } from "@/server/actions/notifications/email-queue";
import { EmailQueuePageClient } from "@/features/notifications/admin/email-queue-page-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Email Queue | ERP Admin",
  description: "Global ERP outbound email queue.",
};

export default async function EmailQueuePage() {
  const ctx = await getAuthContext();
  if (
    !hasPermission(ctx, "notifications.email_queue.view") &&
    !hasPermission(ctx, "notifications.email_queue.manage") &&
    !hasPermission(ctx, "notifications.admin")
  ) {
    redirect("/access-denied");
  }

  const result = await getEmailQueue({ limit: 200 });
  const items = result.success ? (result.data ?? []) : [];

  return (
    <div className="p-6 space-y-4">
      <EmailQueuePageClient
        initialItems={items}
        canManage={hasPermission(ctx, "notifications.email_queue.manage") || hasPermission(ctx, "notifications.admin")}
        canProcess={hasPermission(ctx, "notifications.email_queue.process") || hasPermission(ctx, "notifications.admin")}
      />
    </div>
  );
}
