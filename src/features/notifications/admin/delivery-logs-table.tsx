"use client";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import type {ColumnDef} from "@tanstack/react-table";
import type {NotificationDeliveryReadRow} from "@/lib/reads/notification-delivery-schema";
const columns:ColumnDef<NotificationDeliveryReadRow>[]=[
 {accessorKey:"id",header:"ID",size:100},{accessorKey:"deliveryChannel",header:"Channel",size:120},{accessorKey:"status",header:"Status",size:150},
 {accessorKey:"emailQueueId",header:"Queue",size:110},{accessorKey:"notificationId",header:"Notification",size:110},
 {accessorKey:"attemptNumber",header:"Attempt",size:90},{accessorKey:"durationMs",header:"Duration (ms)",size:130},
 {accessorKey:"message",header:"Diagnostic",size:230},{accessorKey:"errorMessage",header:"Error",size:300},
 {accessorKey:"createdAt",header:"Created",size:190,cell:({row})=>new Date(row.original.createdAt).toLocaleString()},
];
export function DeliveryLogsTable({logs,serverRead,loading}:{logs:NotificationDeliveryReadRow[];serverRead:ERPTableServerRead<NotificationDeliveryReadRow>;loading:boolean}){
 return <ERPDataTable tableId="notifications.delivery-logs" data={logs} columns={columns} serverRead={serverRead} isLoading={loading} enableRowSelection={false} searchPlaceholder="Search delivery metadata…" emptyMessage="No delivery logs match this view."/>;
}
