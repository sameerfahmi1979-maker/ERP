"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { Button } from "@/components/ui/button";
import { NotificationSeverityBadge } from "@/features/notifications/notification-severity-badge";
import { NotificationStatusBadge } from "@/features/notifications/notification-status-badge";
import type { NotificationRow } from "@/server/actions/notifications/notifications";
import { getAllNotifications } from "@/server/actions/notifications/notifications";
import { Bell, RefreshCw } from "lucide-react";
import { useRefreshableRows } from "@/hooks/use-refreshable-rows";

interface AdminNotificationsPageClientProps {
  initialNotifications: NotificationRow[];
  initialError?: boolean;
}
const loadNotifications = () => getAllNotifications({limit:300});

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "id",
    "label": "ID",
    "path": "id",
    "type": "number",
    "width": 180,
    "required": true
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 180
  },
  {
    "id": "severity",
    "label": "Severity",
    "path": "severity",
    "type": "text",
    "width": 180
  },
  {
    "id": "sourceModule",
    "label": "Module",
    "path": "sourceModule",
    "type": "text",
    "width": 180
  },
  {
    "id": "title",
    "label": "Title",
    "path": "title",
    "type": "text",
    "width": 180
  },
  {
    "id": "recipientEmail",
    "label": "Recipient email",
    "path": "recipientEmail",
    "type": "text",
    "width": 180
  },
  {
    "id": "channels",
    "label": "Channels",
    "type": "text",
    "width": 180
  },
  {
    "id": "createdAt",
    "label": "Created",
    "path": "createdAt",
    "type": "date",
    "width": 180
  }
];
export function AdminNotificationsPageClient({ initialNotifications, initialError = false }: AdminNotificationsPageClientProps) {
  const {rows:notifications,loading,failed,refresh}=useRefreshableRows(initialNotifications,initialError,loadNotifications);

  const listView = useLoadedListView("AdminNotificationsPageClient", notifications, LIST_FIELDS);
  const pagination = useSortPaginate(listView.rows,{memoryKey:"AdminNotificationsPageClient"});

  const unread = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Notification Center</h1>
            <p className="text-sm text-muted-foreground">
              Up to 300 recent authorized notifications — {notifications.length} loaded, {unread} unread in this list
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading} title="Refresh" aria-label="Refresh notifications">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {failed && <p role="alert" className="border border-destructive p-3 text-sm">Notifications could not be loaded. Previously displayed items may be outdated. Use Refresh to retry.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: notifications.length, cls: "text-foreground" },
          { label: "Unread", value: unread, cls: "text-blue-600 font-semibold" },
          { label: "Dismissed", value: notifications.filter((n) => n.status === "dismissed").length, cls: "text-muted-foreground" },
          { label: "Archived", value: notifications.filter((n) => n.status === "archived").length, cls: "text-muted-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.cls}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto"><LoadedListTools view={listView} search />
        <div role="region" aria-label="AdminNotificationsPageClient results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead className="border-b bg-muted/40">
            <ConfiguredRow columns={listView.columns}>
              <th data-column="id" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">ID</th>
              <th data-column="status" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
              <th data-column="severity" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Severity</th>
              <th data-column="sourceModule" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Module</th>
              <th data-column="title" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Title</th>
              <th data-column="recipientEmail" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Recipient</th>
              <th data-column="channels" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Channels</th>
              <th data-column="createdAt" className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Created</th>
            </ConfiguredRow>
          </thead>
          <tbody className="divide-y divide-border">
            {pagination.rows.map((n) => (
              <ConfiguredRow columns={listView.columns} key={n.id} className="hover:bg-muted/20">
                <td data-column="id" className="px-3 py-2 text-xs text-muted-foreground">{n.id}</td>
                <td data-column="status" className="px-3 py-2"><NotificationStatusBadge status={n.status} /></td>
                <td data-column="severity" className="px-3 py-2"><NotificationSeverityBadge severity={n.severity} /></td>
                <td data-column="sourceModule" className="px-3 py-2 text-xs font-medium">{n.sourceModule}</td>
                <td data-column="title" className="px-3 py-2 text-xs max-w-[240px] truncate">{n.title}</td>
                <td data-column="recipientEmail" className="px-3 py-2 text-xs text-muted-foreground">
                  {n.recipientEmail ?? (n.recipientUserId ? `user:${n.recipientUserId}` : n.recipientRoleCode ?? "—")}
                </td>
                <td data-column="channels" className="px-3 py-2 text-xs">
                  {[n.channelInApp && "In-App", n.channelEmail && "Email"].filter(Boolean).join(", ")}
                </td>
                <td data-column="createdAt" className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(n.createdAt).toLocaleString()}
                </td>
              </ConfiguredRow>
            ))}
            {notifications.length === 0 && (
              <tr>
                <td colSpan={listView.visible.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No notifications found
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
      <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
    </div>
  );
}
