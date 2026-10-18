"use client";
import {useLayoutEffect,useRef,useState} from "react";
import Link from "next/link";
import {toast} from "sonner";
import {useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ColumnDef} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {canUseDmsEmailBridge} from '@/lib/email/queue/dms-policy';
import {useCountedTableRead} from "@/hooks/use-counted-table-read";
import {dmsNotificationsCriteriaSchema,dmsNotificationPageSchema,dmsNotificationIdentity,type DmsNotificationReadRow} from "@/lib/reads/dms-notifications-schema";
import {markDmsNotificationRead,dismissDmsNotification} from "@/server/actions/dms/notifications";
import {bridgeDmsNotificationToGlobal} from "@/server/actions/dms/dms-email-bridge";
import {invalidateDmsNotifications,invalidateEmailQueue} from "@/lib/query/invalidation";
import {DmsBridgeStatusBadge} from "./dms-bridge-status-badge";
import {NotificationOpenButton} from '@/features/notifications/notification-open';
type Props={authContext:AuthContext;tab:"my"|"all"|"unread"|"not_bridged";showBridgeStatus:boolean};
export function DmsNotificationsTable(props:Props){const identity=dmsNotificationIdentity(props.authContext);return <DmsReadTable key={identity+props.tab} {...props} identity={identity}/>;}
function DmsReadTable({authContext,tab,showBridgeStatus,identity}:Props&{identity:string}){
 const qc=useQueryClient(),[acting,setActing]=useState(false),owner=useRef(false),flight=useRef(false);
 useLayoutEffect(()=>{owner.current=true;return()=>{owner.current=false;};},[]);
 const allowed=["dms.notifications.view","dms.notifications.manage","dms.admin"].some(c=>hasPermission(authContext,c))&&(!["all","not_bridged"].includes(tab)||["dms.notifications.manage","dms.admin"].some(c=>hasPermission(authContext,c)));
 const read=useCountedTableRead({resource:"dms-notifications",prefix:["dms","notifications",tab],identity,allowed,defaultSort:[{id:"scheduled_for",desc:true}],
 parseCriteria:input=>{const p=dmsNotificationsCriteriaSchema.safeParse({...input as Record<string,unknown>,audience:["all","not_bridged"].includes(tab)?"all":"my",unreadOnly:tab==="unread",...(tab==="not_bridged"?{bridgeStatus:"not_bridged"}:{})});return p.success?p.data:null;},
 parsePage:i=>dmsNotificationPageSchema.parse(i),filters:[{id:"status",label:"Status",type:"text"},{id:"channel",label:"Channel",type:"select",options:[{value:"in_app",label:"In-App"},{value:"email_ready",label:"Email Ready"}]},...(showBridgeStatus&&tab!=="not_bridged"?[{id:"bridgeStatus",label:"Bridge status",type:"text" as const}]:[])]});
 const canBridge=showBridgeStatus&&canUseDmsEmailBridge(authContext);
 async function action(row:DmsNotificationReadRow,kind:"read"|"dismiss"|"bridge"){
  if(!owner.current||flight.current||!read.canAct()||kind==="bridge"&&!canBridge||!read.rows.some(r=>r.id===row.id))return;
  flight.current=true;setActing(true);
  try{const result=await(kind==="read"?markDmsNotificationRead(row.id):kind==="dismiss"?dismissDmsNotification(row.id):bridgeDmsNotificationToGlobal(row.id));
   if(!owner.current)return;if(result.success){toast.success("Notification operation confirmed");invalidateDmsNotifications(qc);if(kind==="bridge")invalidateEmailQueue(qc);}else toast.error(result.error??"The operation could not be confirmed.");
  }catch{if(owner.current)toast.error("The operation could not be confirmed. Refresh before retrying.");}
  finally{flight.current=false;if(owner.current)setActing(false);}
 }
 const columns:ColumnDef<DmsNotificationReadRow>[]=[
 {accessorKey:"subject",header:"Notification",size:300,cell:({row})=><div><p>{row.original.subject}</p><p className="text-xs text-muted-foreground line-clamp-2">{row.original.message}</p></div>},
 {accessorKey:"document_no",header:"Document",size:150},{accessorKey:"channel",header:"Channel",size:110},{accessorKey:"status",header:"Status",size:110},
 ...(showBridgeStatus?[{accessorKey:"bridge_status",header:"Bridge",size:130,cell:({row})=><DmsBridgeStatusBadge status={row.original.bridge_status}/>} satisfies ColumnDef<DmsNotificationReadRow>]:[]),
 {accessorKey:"scheduled_for",header:"Scheduled",size:190,cell:({row})=>new Date(row.original.scheduled_for).toLocaleString()},
 {id:"actions",header:"Actions",enableSorting:false,meta:{exportable:false},size:270,cell:({row})=><div className="flex flex-wrap gap-1">
  {row.original.visible_document_id!==null&&(row.original.global_notification_id
   ?<NotificationOpenButton id={row.original.global_notification_id} label="Open document" disabled={acting||!read.canAct()}/>
   :<Link href={`/dms/documents/record/${row.original.visible_document_id}`}>Open document</Link>)}
  {canBridge&&!row.original.global_notification_id&&<Button size="sm" variant="outline" disabled={acting||!read.canAct()} onClick={()=>void action(row.original,"bridge")}>Bridge</Button>}
  {row.original.status==="pending"&&<><Button size="sm" variant="outline" disabled={acting||!read.canAct()} onClick={()=>void action(row.original,"read")}>Mark read</Button><Button size="sm" variant="outline" disabled={acting||!read.canAct()} onClick={()=>void action(row.original,"dismiss")}>Dismiss</Button></>}
 </div>}];
 if(read.denied)return <p role="alert">Document notification access could not be verified.</p>;
 return <div className="space-y-3"><Button variant="outline" onClick={read.refresh}>Refresh document notifications</Button>
 {read.failed&&<p role="alert">Document notifications could not be verified. Refresh to retry.</p>}
 <ERPDataTable presentation="worklist" tableId="dms.notifications" data={read.rows} columns={columns} serverRead={read.serverRead} isLoading={read.busy||read.failed} enableRowSelection={false} searchPlaceholder="Search document notifications…" emptyMessage="No document notifications match this view."/></div>;
}
