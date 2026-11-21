import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {getAuthContext} from "@/lib/rbac/check";
import {canViewNotificationDeliveryLogs} from "@/lib/notifications/access";
import {readNotificationDeliveries} from "@/server/reads/notification-deliveries";
import {notificationDeliveryIdentity} from "@/lib/reads/notification-delivery-schema";
import {DeliveryLogsPageClient} from "@/features/notifications/admin/delivery-logs-page-client";
export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata:Metadata={title:"Delivery Logs | ERP Admin",description:"ERP notification and email delivery logs."};
export default async function DeliveryLogsPage(){
 const ctx=await getAuthContext();if(!canViewNotificationDeliveryLogs(ctx))redirect("/access-denied");
 const result=await readNotificationDeliveries({},ctx);
 return <div className="p-6 space-y-4"><DeliveryLogsPageClient authContext={ctx} initialPage={result.success?result.data:undefined} initialIdentity={notificationDeliveryIdentity(ctx)} initialUpdatedAt={result.success ? result.updatedAt : undefined}/></div>;
}
