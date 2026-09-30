import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
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
    !hasGlobalPermission(ctx, "notifications.email_queue.view") &&
    !hasGlobalPermission(ctx, "notifications.admin")
  ) {
    redirect("/access-denied");
  }

  const result = await getEmailQueue({ limit: 200 });
  const items = result.success ? (result.data ?? []) : [];

  return (
    <div className="p-6 space-y-4">
      <EmailQueuePageClient
        initialItems={items}
        canManage={hasGlobalPermission(ctx, "notifications.email_queue.manage") || hasGlobalPermission(ctx, "notifications.admin")}
        canProcess={hasGlobalPermission(ctx, "notifications.email_queue.process") || hasGlobalPermission(ctx, "notifications.admin")}
      />
    </div>
  );
}
