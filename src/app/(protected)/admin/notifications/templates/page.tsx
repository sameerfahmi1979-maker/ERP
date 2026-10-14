import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAuthContext,hasPermission} from "@/lib/rbac/check";
import {readNotificationTemplates} from "@/server/reads/notification-templates";
import {notificationTemplatesIdentity} from "@/lib/reads/notification-templates-schema";
import {NotificationTemplatesPageClient} from "@/features/notifications/admin/notification-templates-page-client";
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Notification Templates | ERP Admin",description:"Manage ERP notification and email templates."};
export default async function NotificationTemplatesPage(){
 const ctx=await getAuthContext();if(!["notifications.templates.view","notifications.admin"].some(c=>hasPermission(ctx,c)))redirect("/access-denied");
 const r=await readNotificationTemplates({},ctx);
 return <div className="p-6 space-y-4"><NotificationTemplatesPageClient authContext={ctx} initialPage={r.success?r.data:undefined} initialIdentity={notificationTemplatesIdentity(ctx)} initialUpdatedAt={r.success ? r.updatedAt : undefined}/></div>;
}
