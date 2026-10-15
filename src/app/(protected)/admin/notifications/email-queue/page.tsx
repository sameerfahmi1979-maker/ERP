import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAuthContext, hasPermission} from "@/lib/rbac/check";
import {readEmailQueue} from "@/server/reads/email-queue";
import {emailQueueIdentity} from "@/lib/reads/email-queue-schema";
import {EmailQueuePageClient} from "@/features/notifications/admin/email-queue-page-client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {title: "Email Queue | ERP Admin", description: "Global ERP outbound email queue."};
export default async function EmailQueuePage() {
  const ctx = await getAuthContext();
  if (!["notifications.email_queue.view", "notifications.email_queue.manage", "notifications.admin"].some(code => hasPermission(ctx, code))) redirect("/access-denied");
  const result = await readEmailQueue({}, ctx);
  return <div className="p-6 space-y-4"><EmailQueuePageClient authContext={ctx} initialIdentity={emailQueueIdentity(ctx)}
    initialUpdatedAt={result.success ? result.updatedAt : undefined} initialPage={result.success ? result.data : undefined}/></div>;
}
