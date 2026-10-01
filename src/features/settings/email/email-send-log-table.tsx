"use client";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Send } from "lucide-react";
import type { EmailSendLogRow } from "@/lib/email/providers/types";

interface EmailSendLogTableProps {
  logs: EmailSendLogRow[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  sent: { label: "Sent", icon: Send, classes: "border-green-400 text-green-700 dark:text-green-400" },
  failed: { label: "Failed", icon: XCircle, classes: "border-red-400 text-red-600" },
  pending: { label: "Pending", icon: Clock, classes: "border-amber-400 text-amber-700" },
  skipped: { label: "Skipped", icon: CheckCircle2, classes: "border-slate-300 text-slate-500" },
};

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "createdAt",
    "label": "Time",
    "path": "createdAt",
    "type": "date",
    "width": 180,
    "required": true
  },
  {
    "id": "operationType",
    "label": "Operation",
    "path": "operationType",
    "type": "text",
    "width": 180
  },
  {
    "id": "providerName",
    "label": "Provider",
    "path": "providerName",
    "type": "text",
    "width": 180
  },
  {
    "id": "toEmails",
    "label": "To",
    "path": "toEmails",
    "type": "text",
    "width": 180
  },
  {
    "id": "subject",
    "label": "Subject",
    "path": "subject",
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
    "id": "durationMs",
    "label": "Duration (ms)",
    "path": "durationMs",
    "type": "number",
    "width": 180
  }
];
export function EmailSendLogTable({ logs }: EmailSendLogTableProps) {
  const listView = useLoadedListView("EmailSendLogTable", logs, LIST_FIELDS);
  const pagination = useSortPaginate(listView.rows,{memoryKey:"EmailSendLogTable"});
  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No send logs yet. Logs are created when you test connections or send test emails.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-auto"><LoadedListTools view={listView} search />
      <div role="region" aria-label="EmailSendLogTable results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
        <thead>
          <ConfiguredRow columns={listView.columns} className="bg-muted/20 border-b border-border">
            <th data-column="createdAt" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Time</th>
            <th data-column="operationType" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Operation</th>
            <th data-column="providerName" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Provider</th>
            <th data-column="toEmails" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">To</th>
            <th data-column="subject" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Subject</th>
            <th data-column="status" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
            <th data-column="durationMs" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Duration</th>
          </ConfiguredRow>
        </thead>
        <tbody className="divide-y divide-border/50">
          {pagination.rows.map((log) => {
            const statusCfg = STATUS_CONFIG[log.status] ?? { label: log.status, icon: Clock, classes: "border-slate-300 text-slate-500" };
            const Icon = statusCfg.icon;
            return (
              <ConfiguredRow columns={listView.columns} key={log.id} className="hover:bg-muted/10 transition-colors">
                <td data-column="createdAt" className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                  {format(parseISO(log.createdAt), "dd MMM, HH:mm")}
                </td>
                <td data-column="operationType" className="px-3 py-1.5">
                  <span className="font-mono">{log.operationType}</span>
                  <span className="ml-1 text-muted-foreground opacity-60">/ {log.featureArea}</span>
                </td>
                <td data-column="providerName" className="px-3 py-1.5 text-muted-foreground">{log.providerName ?? "—"}</td>
                <td data-column="toEmails" className="px-3 py-1.5">
                  {log.toEmails?.slice(0, 2).join(", ") ?? "—"}
                  {(log.toEmails?.length ?? 0) > 2 && ` +${(log.toEmails?.length ?? 0) - 2}`}
                </td>
                <td data-column="subject" className="px-3 py-1.5 max-w-[200px] truncate">{log.subject ?? "—"}</td>
                <td data-column="status" className="px-3 py-1.5">
                  <Badge variant="outline" className={`text-[10px] gap-1 ${statusCfg.classes}`}>
                    <Icon className="h-2.5 w-2.5" />{statusCfg.label}
                  </Badge>
                  {log.lastError && (
                    <p className="text-red-500 mt-0.5 max-w-[180px] truncate" title={log.lastError}>{log.lastError}</p>
                  )}
                </td>
                <td data-column="durationMs" className="px-3 py-1.5 text-muted-foreground">{log.durationMs != null ? `${log.durationMs}ms` : "—"}</td>
              </ConfiguredRow>
            );
          })}
        </tbody>
      </table></div>
    <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
  );
}
