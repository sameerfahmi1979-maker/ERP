"use client";
import {Button} from "@/components/ui/button";
import {useCountedTableRead} from "@/hooks/use-counted-table-read";
import {notificationTemplatesCriteriaSchema,notificationTemplatesPageSchema,notificationTemplatesIdentity,type NotificationTemplatesReadPage} from "@/lib/reads/notification-templates-schema";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {NotificationTemplatesTable} from "./notification-templates-table";
type Props={authContext:AuthContext;initialPage?:NotificationTemplatesReadPage;initialIdentity?:string;initialUpdatedAt?:number};
export function NotificationTemplatesPageClient(props:Props){const identity=notificationTemplatesIdentity(props.authContext);return <TemplatesView key={identity} {...props} identity={identity}/>;}
function TemplatesView(props:Props&{identity:string}){
 const allowed=["notifications.templates.view","notifications.admin"].some(c=>hasPermission(props.authContext,c));
 const canManage=["notifications.templates.manage","notifications.admin"].some(c=>hasPermission(props.authContext,c));
 const read=useCountedTableRead({resource:"notification-templates",prefix:["notifications","templates"],identity:props.identity,allowed,seed:props.initialPage,seedIdentity:props.initialIdentity,seedUpdatedAt:props.initialUpdatedAt,
 defaultSort:[{id:"sourceModule",desc:false},{id:"templateCode",desc:false}],parseCriteria:i=>{const p=notificationTemplatesCriteriaSchema.safeParse(i);return p.success?p.data:null;},parsePage:i=>notificationTemplatesPageSchema.parse(i),
 filters:[{id:"isActive",label:"Status",type:"select",options:[{value:"true",label:"Active"},{value:"false",label:"Inactive"}]},{id:"sourceModule",label:"Module",type:"text"},{id:"defaultSeverity",label:"Severity",type:"select",options:["info","success","warning","urgent","critical"].map(value=>({value,label:value}))}]});
 if(read.denied)return <p role="alert">Notification template access could not be verified.</p>;
 return <div className="space-y-4"><div className="flex justify-between gap-3"><h1 className="text-xl font-semibold">Notification Templates</h1><Button variant="outline" onClick={read.refresh}>Refresh templates</Button></div>
 <p className="text-sm text-muted-foreground">Search and filters cover all permitted template metadata. Wording is loaded only when you edit a selected template.</p>
 {read.failed&&<p role="alert">Templates could not be verified. Refresh to retry.</p>}
 <NotificationTemplatesTable templates={read.rows} identity={props.identity} onRefresh={read.refresh} serverRead={read.serverRead} disabled={read.busy||read.failed} canManage={canManage} canAct={read.canAct}/></div>;
}
