"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {canUseDmsEmailBridge} from '@/lib/email/queue/dms-policy';
import {dmsNotificationIdentity} from "@/lib/reads/dms-notifications-schema";
import {invalidateDmsNotifications,invalidateEmailQueue} from "@/lib/query/invalidation";
import {bridgeDueDmsNotificationsToGlobal,processDmsExpiryEmailQueue} from "@/server/actions/dms/dms-email-bridge";
import {generateDmsExpiryNotifications} from "@/server/actions/dms/notifications";
import {DmsNotificationsTable} from "./dms-notifications-table";
type Props={authContext:AuthContext};
export function DmsNotificationsPageClient(props:Props){return <DmsNotificationView key={dmsNotificationIdentity(props.authContext)} {...props}/>;}
function DmsNotificationView({authContext}:Props){
 const qc=useQueryClient(),[tab,setTab]=useState<"my"|"all"|"unread"|"not_bridged">("my"),[busy,setBusy]=useState(false),owner=useRef(false),flight=useRef(false);
 useLayoutEffect(()=>{owner.current=true;return()=>{owner.current=false;};},[]);
 const isAdmin=hasPermission(authContext,"dms.admin")||hasPermission(authContext,"dms.notifications.manage");
 const canBridge=canUseDmsEmailBridge(authContext);
 const allowed=["dms.notifications.view","dms.notifications.manage","dms.admin"].some(c=>hasPermission(authContext,c));
 async function perform(kind:"generate"|"bridge"|"process"){
  if(!owner.current||flight.current||!allowed||!(kind==="generate"?isAdmin:canBridge))return;
  flight.current=true;setBusy(true);
  try{const r=await(kind==="generate"?generateDmsExpiryNotifications({limit:100}):kind==="bridge"?bridgeDueDmsNotificationsToGlobal({limit:50,dryRun:false}):processDmsExpiryEmailQueue({limit:20,dryRun:false}));
   if(!owner.current)return;if(r.success){toast.success("Operation confirmed. Refreshing notification and delivery status.");invalidateDmsNotifications(qc);invalidateEmailQueue(qc);}else toast.error(r.error??"Operation could not be confirmed.");
  }catch{if(owner.current)toast.error("Operation could not be confirmed. Refresh before retrying.");}
  finally{flight.current=false;if(owner.current)setBusy(false);}
 }
 if(!allowed)return <p role="alert">Document notification access could not be verified.</p>;
 return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-semibold">DMS Notifications</h1><div className="flex gap-2">
 {isAdmin&&<Button variant="outline" disabled={busy} onClick={()=>void perform("generate")}>Generate Due</Button>}
 {canBridge&&<><Button variant="outline" disabled={busy} onClick={()=>void perform("bridge")}>Bridge to Global</Button><Button variant="outline" disabled={busy} onClick={()=>void perform("process")}>Send Emails</Button></>}</div></div>
 <p className="text-sm text-muted-foreground">Search and filters apply to all permitted notifications. Document labels and links remain subject to document access. Delivery status does not confirm inbox receipt.</p>
 <Tabs value={tab} onValueChange={v=>{if(v==="my"||v==="unread"||v==="all"&&isAdmin||v==="not_bridged"&&canBridge)setTab(v as typeof tab);}}><TabsList>
 <TabsTrigger value="my">My Notifications</TabsTrigger>{isAdmin&&<TabsTrigger value="all">All Notifications</TabsTrigger>}<TabsTrigger value="unread">Unread</TabsTrigger>{canBridge&&<TabsTrigger value="not_bridged">Not Bridged</TabsTrigger>}
 </TabsList></Tabs>
 <DmsNotificationsTable authContext={authContext} tab={tab} showBridgeStatus={canBridge}/></div>;
}
