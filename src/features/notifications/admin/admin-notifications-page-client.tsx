"use client";
import {Button} from "@/components/ui/button";
import {ERPDataTable} from "@/components/erp/table/erp-data-table";
import type {ColumnDef} from "@tanstack/react-table";
import {NotificationSeverityBadge} from "@/features/notifications/notification-severity-badge";
import {NotificationStatusBadge} from "@/features/notifications/notification-status-badge";
import {useNotificationPage, type NotificationPageProps} from "@/hooks/use-notification-page";
import {notificationReadIdentity, type NotificationReadRow} from "@/lib/reads/notifications-schema";

export function AdminNotificationsPageClient(props: NotificationPageProps) {
  const identity = notificationReadIdentity(props.authContext);
  return <AdminNotificationView key={identity} {...props} identity={identity}/>;
}
function AdminNotificationView(props: NotificationPageProps & {identity: string}) {
  const read = useNotificationPage({...props, audience: "admin"}, props.identity);
  const columns: ColumnDef<NotificationReadRow>[] = [
    {accessorKey: "id", header: "ID", size: 90},
    {accessorKey: "status", header: "Status", size: 130, cell: ({row}) => <NotificationStatusBadge status={row.original.status}/>},
    {accessorKey: "severity", header: "Severity", size: 110, cell: ({row}) => <NotificationSeverityBadge severity={row.original.severity}/>},
    {accessorKey: "sourceModule", header: "Module", size: 130},
    {accessorKey: "title", header: "Title", size: 300},
    {accessorKey: "recipientEmail", header: "Recipient email", size: 240},
    {id: "channels", header: "Channels", enableSorting: false, accessorFn: row => [row.channelInApp && "In-app", row.channelEmail && "Email"].filter(Boolean).join(", ")},
    {accessorKey: "createdAt", header: "Created", size: 180, cell: ({row}) => new Date(row.original.createdAt).toLocaleString()},
  ];
  if (read.denied) return <p role="alert">Your notification administration access could not be verified.</p>;
  return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-2"><h1 className="text-xl font-semibold">Notification Center</h1><Button variant="outline" onClick={read.refresh}>Refresh</Button></div>
    <p className="text-sm text-muted-foreground">Search and filters apply to all notifications permitted by your current access. Channel flags describe the requested delivery methods, not proof of delivery.</p>
    {read.failed && <p role="alert">Notifications could not be verified. Use Refresh to retry.</p>}
    <ERPDataTable tableId="notifications.admin" data={read.rows} columns={columns} serverRead={read.serverRead}
      isLoading={read.busy} enableRowSelection={false} searchPlaceholder="Search notifications or recipient email…" emptyMessage="No notifications match this view."/>
  </div>;
}
