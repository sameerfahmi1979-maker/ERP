"use client";
import {useLayoutEffect,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Badge} from "@/components/ui/badge";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import type {ColumnDef} from "@tanstack/react-table";
import {readJson,retryAuthorizedRead} from "@/lib/reads/client";
import {notificationTemplateDetailSchema,type NotificationTemplateListRow} from "@/lib/reads/notification-templates-schema";
import {deactivateNotificationTemplate,activateNotificationTemplate} from "@/server/actions/notifications/templates";
import {NotificationTemplateFormDialog} from "./notification-template-form-dialog";
type Props={templates:NotificationTemplateListRow[];identity:string;onRefresh:()=>void;serverRead:ERPTableServerRead<NotificationTemplateListRow>;disabled:boolean;canManage:boolean;canAct:()=>boolean};
export function NotificationTemplatesTable({templates,identity,onRefresh,serverRead,disabled,canManage,canAct}:Props){
 const [acting,setActing]=useState(false),[editing,setEditing]=useState<number|"new"|null>(null);
 const owner=useRef(false),flight=useRef(false),current=useRef(canAct);
 useLayoutEffect(()=>{owner.current=true;return()=>{owner.current=false;};},[]);
 useLayoutEffect(()=>{current.current=canAct;});
 async function toggle(row:NotificationTemplateListRow){
  if(flight.current||!owner.current||!canManage||!current.current()||disabled)return;
  flight.current=true;setActing(true);
  try{const r=await(row.isActive?deactivateNotificationTemplate(row.id):activateNotificationTemplate(row.id));if(!owner.current)return;if(r.success){toast.success("Template change confirmed");onRefresh();}else toast.error(r.error??"Template change could not be confirmed.");}
  catch{if(owner.current)toast.error("Template change could not be confirmed. Refresh before retrying.");}
  finally{flight.current=false;if(owner.current)setActing(false);}
 }
 const columns:ColumnDef<NotificationTemplateListRow>[]=[
  {accessorKey:"templateCode",header:"Code",size:200},{accessorKey:"templateName",header:"Name",size:230},{accessorKey:"sourceModule",header:"Module",size:100},{accessorKey:"notificationType",header:"Type",size:150},{accessorKey:"defaultSeverity",header:"Severity",size:100},
  {id:"channels",header:"Channels",enableSorting:false,size:150,cell:({row})=><span>{row.original.defaultChannelInApp?"In-App ":""}{row.original.defaultChannelEmail?"Email":""}</span>},
  {accessorKey:"isActive",header:"Status",size:100,cell:({row})=><Badge variant={row.original.isActive?"default":"secondary"}>{row.original.isActive?"Active":"Inactive"}</Badge>},
  ...(canManage?[{id:"actions",header:"Actions",size:210,enableSorting:false,meta:{exportable:false},cell:({row})=><div className="flex gap-1"><Button variant="outline" size="sm" disabled={disabled||acting} onClick={()=>{if(current.current())setEditing(row.original.id);}}>Edit</Button><Button variant="outline" size="sm" disabled={disabled||acting} onClick={()=>void toggle(row.original)}>{row.original.isActive?"Deactivate":"Activate"}</Button></div>} satisfies ColumnDef<NotificationTemplateListRow>]:[]),
 ];
 const close=()=>setEditing(null);
 const success=()=>{if(owner.current){setEditing(null);onRefresh();}};
 return <div className="space-y-3">{canManage&&<Button variant="outline" disabled={disabled||acting} onClick={()=>{if(current.current())setEditing("new");}}>New Template</Button>}
 <ERPDataTable presentation="worklist" tableId="notifications.templates" data={templates} columns={columns} serverRead={serverRead} isLoading={disabled} enableRowSelection={false} searchPlaceholder="Search template metadata…" emptyMessage="No templates match this view."/>
 {canManage&&editing!==null&&(editing==="new"?<NotificationTemplateFormDialog open onClose={close} onSuccess={success} template={null}/>:<TemplateDetail key={identity+":"+editing} id={editing} identity={identity} onClose={close} onSuccess={success}/>)}</div>;
}
function TemplateDetail({id,identity,onClose,onSuccess}:{id:number;identity:string;onClose:()=>void;onSuccess:()=>void}){
 const q=useQuery({queryKey:["notifications","templates",identity,"detail",id],gcTime:0,staleTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false,retry:retryAuthorizedRead,
  queryFn:async({signal})=>{const r=await readJson<{success:true;data:unknown}>("notification-template-detail",{id},signal);signal.throwIfAborted();const data=notificationTemplateDetailSchema.parse(r.data);if(data.id!==id)throw Error("Wrong template");return data;}});
 if(q.isError)return <div role="alert">Template wording could not be loaded. <Button onClick={()=>void q.refetch()}>Retry template</Button><Button onClick={onClose}>Cancel editing</Button></div>;
 if(q.isFetching||!q.data)return <div role="status">Loading selected template… <Button onClick={onClose}>Cancel editing</Button></div>;
 return <NotificationTemplateFormDialog open onClose={onClose} onSuccess={onSuccess} template={q.data}/>;
}
