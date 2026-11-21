import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAuthContext} from "@/lib/rbac/check";
import {canViewNotificationTemplates} from "@/lib/notifications/access";
import {readNotificationTemplates} from "@/server/reads/notification-templates";
import {notificationTemplatesIdentity} from "@/lib/reads/notification-templates-schema";
import {NotificationTemplatesPageClient} from "@/features/notifications/admin/notification-templates-page-client";
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Notification Templates | ERP Admin",description:"Manage ERP notification and email templates."};
export default async function NotificationTemplatesPage(){
 const ctx=await getAuthContext();if(!canViewNotificationTemplates(ctx))redirect("/access-denied");
 const r=await readNotificationTemplates({},ctx);
 return <div className="p-6 space-y-4"><NotificationTemplatesPageClient authContext={ctx} initialPage={r.success?r.data:undefined} initialIdentity={notificationTemplatesIdentity(ctx)} initialUpdatedAt={r.success ? r.updatedAt : undefined}/></div>;
}
