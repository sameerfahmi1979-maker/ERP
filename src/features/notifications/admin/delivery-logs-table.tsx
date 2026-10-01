"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { NotificationStatusBadge } from "@/features/notifications/notification-status-badge";
import type { DeliveryLogRow } from "@/server/actions/notifications/delivery-logs";

interface DeliveryLogsTableProps {
  logs: DeliveryLogRow[];
}

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
    "id": "deliveryChannel",
    "label": "Channel",
    "path": "deliveryChannel",
    "type": "text",
    "width": 180
  },
  {
    "id": "status",
    "label": "Status",
    "path": "status",
    "type": "text",
    "width": 180
  },
  {
    "id": "emailQueueId",
    "label": "Queue ID",
    "path": "emailQueueId",
    "type": "number",
    "width": 180
  },
  {
    "id": "notificationId",
    "label": "Notification ID",
    "path": "notificationId",
    "type": "number",
    "width": 180
  },
  {
    "id": "attemptNumber",
    "label": "Attempt",
    "path": "attemptNumber",
    "type": "number",
    "width": 180
  },
  {
    "id": "durationMs",
    "label": "Duration (ms)",
    "path": "durationMs",
    "type": "number",
    "width": 180
  },
  {
    "id": "message",
    "label": "Message",
    "path": "message",
    "type": "text",
    "width": 180
  },
  {
    "id": "errorMessage",
    "label": "Error",
    "path": "errorMessage",
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
export function DeliveryLogsTable({ logs }: DeliveryLogsTableProps) {
  const listView = useLoadedListView("DeliveryLogsTable", logs, LIST_FIELDS);
  const pagination = useSortPaginate(listView.rows,{memoryKey:"DeliveryLogsTable"});
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground border rounded-lg">
        <p className="text-sm">No delivery logs</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto"><LoadedListTools view={listView} search />
      <div role="region" aria-label="DeliveryLogsTable results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
        <thead className="border-b bg-muted/40">
          <ConfiguredRow columns={listView.columns}>
            <th data-column="id" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">ID</th>
            <th data-column="deliveryChannel" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Channel</th>
            <th data-column="status" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
            <th data-column="emailQueueId" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Queue ID</th>
            <th data-column="notificationId" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Notif ID</th>
            <th data-column="attemptNumber" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Attempt</th>
            <th data-column="durationMs" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Duration</th>
            <th data-column="message" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Message</th>
            <th data-column="errorMessage" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Error</th>
            <th data-column="createdAt" className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Created</th>
          </ConfiguredRow>
        </thead>
        <tbody className="divide-y divide-border">
          {pagination.rows.map((log) => (
            <ConfiguredRow columns={listView.columns} key={log.id} className="hover:bg-muted/20 transition-colors">
              <td data-column="id" className="px-3 py-2 text-xs text-muted-foreground">{log.id}</td>
              <td data-column="deliveryChannel" className="px-3 py-2 text-xs capitalize">{log.deliveryChannel}</td>
              <td data-column="status" className="px-3 py-2"><NotificationStatusBadge status={log.status} /></td>
              <td data-column="emailQueueId" className="px-3 py-2 text-xs text-muted-foreground">{log.emailQueueId ?? "—"}</td>
              <td data-column="notificationId" className="px-3 py-2 text-xs text-muted-foreground">{log.notificationId ?? "—"}</td>
              <td data-column="attemptNumber" className="px-3 py-2 text-xs">{log.attemptNumber ?? "—"}</td>
              <td data-column="durationMs" className="px-3 py-2 text-xs text-muted-foreground">
                {log.durationMs != null ? `${log.durationMs}ms` : "—"}
              </td>
              <td data-column="message" className="px-3 py-2 text-xs max-w-[200px] truncate">{log.message ?? "—"}</td>
              <td data-column="errorMessage" className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">{log.errorMessage ?? "—"}</td>
              <td data-column="createdAt" className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </td>
            </ConfiguredRow>
          ))}
        </tbody>
      </table></div>
    <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
  );
}
