import type {Metadata} from "next";
import {getAuthContext} from "@/lib/rbac/check";
import {canUseApplication} from "@/lib/rbac/scope";
import {readNotifications} from "@/server/reads/notifications";
import {notificationReadIdentity} from "@/lib/reads/notifications-schema";
import {NotificationsPageClient} from "@/features/notifications/notifications-page-client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {title: "Notifications | ERP", description: "Your ERP in-app notifications."};
export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  if (!canUseApplication(ctx)) return null;
  const result = await readNotifications({}, ctx);
  return <div className="p-6 space-y-4"><NotificationsPageClient authContext={ctx}
    initialIdentity={notificationReadIdentity(ctx)} initialUpdatedAt={result.success ? result.updatedAt : undefined} initialPage={result.success ? result.data : undefined}/></div>;
}
