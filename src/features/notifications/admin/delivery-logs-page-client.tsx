"use client";
import {Button} from "@/components/ui/button";
import {useCountedTableRead} from "@/hooks/use-counted-table-read";
import {notificationDeliveryCriteriaSchema,notificationDeliveryPageSchema,notificationDeliveryIdentity,type NotificationDeliveryReadPage} from "@/lib/reads/notification-delivery-schema";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {DeliveryLogsTable} from "./delivery-logs-table";
type Props={authContext:AuthContext;initialPage?:NotificationDeliveryReadPage;initialIdentity?:string;initialUpdatedAt?:number};
export function DeliveryLogsPageClient(props:Props){const identity=notificationDeliveryIdentity(props.authContext);return <DeliveryView key={identity} {...props} identity={identity}/>;}
function DeliveryView(props:Props&{identity:string}){
 const allowed=["notifications.logs.view","notifications.admin"].some(c=>hasPermission(props.authContext,c));
 const read=useCountedTableRead({resource:"notification-deliveries",prefix:["notifications","delivery-logs"],identity:props.identity,allowed,seed:props.initialPage,seedIdentity:props.initialIdentity,seedUpdatedAt:props.initialUpdatedAt,defaultSort:[{id:"createdAt",desc:true}],
 parseCriteria:i=>{const p=notificationDeliveryCriteriaSchema.safeParse(i);return p.success?p.data:null;},parsePage:i=>notificationDeliveryPageSchema.parse(i),
 filters:[{id:"status",label:"Status",type:"text"},{id:"deliveryChannel",label:"Channel",type:"select",options:[{value:"email",label:"Email"},{value:"in_app",label:"In-App"}]}]});
 if(read.denied)return <p role="alert">Delivery log access could not be verified.</p>;
 return <div className="space-y-4"><div className="flex justify-between gap-3"><h1 className="text-xl font-semibold">Delivery Logs</h1><Button variant="outline" onClick={read.refresh}>Refresh delivery logs</Button></div>
 <p className="text-sm text-muted-foreground">Search and filters cover all permitted delivery metadata. Recorded sent is not inbox confirmation. Raw provider messages and errors are excluded from this list.</p>
 {read.failed&&<p role="alert">Delivery logs could not be verified. Refresh to retry.</p>}
 <DeliveryLogsTable logs={read.rows} serverRead={read.serverRead} loading={read.busy||read.failed}/></div>;
}
