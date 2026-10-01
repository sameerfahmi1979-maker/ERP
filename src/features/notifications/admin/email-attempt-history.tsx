"use client";
import { useQuery } from "@tanstack/react-query";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { Button } from "@/components/ui/button";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { getEmailAttemptHistory, type EmailAttemptEvent } from "@/server/actions/notifications/email-attempts";
import type { ColumnDef } from "@tanstack/react-table";
const labels: Record<string,string> = {claimed:"Worker claimed",dispatching:"Dispatch started",accepted:"Provider accepted",retry:"Retry scheduled",permanent:"Terminal failure",unknown:"Delivery uncertain",cancelled:"Cancelled",lease_expired:"Worker lease expired",quota_deferred:"Provider capacity wait"};
const columns: ColumnDef<EmailAttemptEvent>[] = [
  {accessorKey:"attempt_number",header:"Attempt",size:100},
  {id:"event",accessorFn:r=>labels[r.event]??"Unrecognized event",header:"Event",size:230},
  {accessorKey:"created_at",header:"Recorded at",size:220,cell:({row})=>new Date(row.original.created_at).toLocaleString()},
];
export function EmailAttemptHistory({id,onClose}:{id:number;onClose:()=>void}) {
  const {data=[],isLoading,isError,refetch}=useQuery({queryKey:["email-attempt-history",id],queryFn:async()=>{const r=await getEmailAttemptHistory(id);if(!r.success)throw Error("History unavailable");return r.data??[];},retry:false,gcTime:0});
  return <AlgtDialog open onOpenChange={open=>{if(!open)onClose();}} title={`Queue ${id} attempt history`} actions={<Button onClick={onClose}>Close history</Button>}>
    <p className="text-sm">Latest 100 recorded events, in browser timezone. Provider acceptance is not inbox receipt. Legacy items may have no events.</p>
    {isLoading?<p role="status">Loading history…</p>:isError?<div role="alert">History could not be loaded. <Button onClick={()=>void refetch()}>Retry history</Button></div>:<ERPDataTable tableId="email.attempt-history" columns={columns} data={data} enableRowSelection={false} />}
  </AlgtDialog>;
}
