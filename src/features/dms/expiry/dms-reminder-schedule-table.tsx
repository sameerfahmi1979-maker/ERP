"use client";
import { useRef, useState } from "react";
import { LoadedListTools, useLoadedListView, type LoadedListField } from "@/components/erp/table/loaded-list-view";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { useSortPaginate } from "@/hooks/use-sort-paginate";
import { TablePagination } from "@/components/erp/table/table-pagination";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { queryKeys } from "@/lib/query/query-keys";
import {
  getDmsExpiryReminders,
  dismissDmsExpiryReminder,
  markDmsExpiryReminderHandled,
  type DmsExpiryReminderRow,
} from "@/server/actions/dms/expiry-reminders";
import { DmsReminderStatusBadge } from "./dms-reminder-status-badge";
import { invalidateDmsExpiry, invalidateDmsDocumentExpiry } from "@/lib/query/invalidation";

interface DmsReminderScheduleTableProps {
  documentId: number;
  canManage?: boolean;
}

const LIST_FIELDS: LoadedListField[] = [
  {
    "id": "reminder_days_before",
    "label": "Days before",
    "path": "reminder_days_before",
    "type": "number",
    "width": 180,
    "required": true
  },
  {
    "id": "reminder_date",
    "label": "Reminder date",
    "path": "reminder_date",
    "type": "date",
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
    "id": "actions",
    "label": "Actions",
    "type": "text",
    "width": 160
  }
];
export function DmsReminderScheduleTable({ documentId, canManage = false }: DmsReminderScheduleTableProps) {
  const queryClient = useQueryClient();
  const flight = useRef(false);
  const [busy, setBusy] = useState(false);

  const { data: reminders = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dms.documentExpiryReminders(documentId),
    queryFn: async () => {
      const result = await getDmsExpiryReminders({ documentId });
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const listView = useLoadedListView("DmsReminderScheduleTable", reminders, LIST_FIELDS.filter(f => f.id !== "actions" || canManage));
  const pagination = useSortPaginate(listView.rows,{memoryKey:"DmsReminderScheduleTable"});
  const act = async (id: number, action: "dismiss" | "handle") => {
    if (!canManage || isError || flight.current) return;
    flight.current = true; setBusy(true);
    try {
      const result = action === "dismiss" ? await dismissDmsExpiryReminder(id, "Manually dismissed") : await markDmsExpiryReminderHandled(id);
      if (!result.success) { toast.error("Reminder was not updated. Refresh and try again."); return; }
      toast.success(action === "dismiss" ? "Reminder dismissed" : "Reminder marked as handled");
      invalidateDmsDocumentExpiry(queryClient, documentId); invalidateDmsExpiry(queryClient);
    } catch { toast.error("Update unconfirmed. Refresh before retrying."); }
    finally { flight.current = false; setBusy(false); }
  };

  if (isError) return <div role="alert">Reminder history could not be loaded. <Button onClick={() => void refetch()}>Retry reminders</Button></div>;

  if (isLoading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">Loading reminders…</div>;
  }

  if (reminders.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No reminders generated yet.{canManage && ' Use Generate Reminders to create the schedule.'}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden"><LoadedListTools view={listView} search />
      <div role="region" aria-label="DmsReminderScheduleTable results" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full table-fixed text-sm" style={{minWidth:listView.visible.reduce((sum,c)=>sum+c.width,0)}}><colgroup>{listView.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
        <thead>
          <ConfiguredRow columns={listView.columns} className="bg-muted/20 border-b border-border">
            <th data-column="reminder_days_before" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Days Before</th>
            <th data-column="reminder_date" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Reminder Date</th>
            <th data-column="status" className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
            <th data-column="actions" className="px-3 py-2 w-24" />
          </ConfiguredRow>
        </thead>
        <tbody className="divide-y divide-border/50">
          {pagination.rows.map((r: DmsExpiryReminderRow) => (
            <ConfiguredRow columns={listView.columns} key={r.id} className={`hover:bg-muted/10 transition-colors ${r.status === "dismissed" ? "opacity-50" : ""}`}>
              <td data-column="reminder_days_before" className="px-3 py-1.5 font-mono">
                {r.reminder_days_before === 0 ? "Expiry Day" : `-${r.reminder_days_before}d`}
              </td>
              <td data-column="reminder_date" className="px-3 py-1.5">{format(parseISO(r.reminder_date), "dd MMM yyyy")}</td>
              <td data-column="status" className="px-3 py-1.5">
                <DmsReminderStatusBadge status={r.status} />
              </td>
              <td data-column="actions" className="px-3 py-1.5">
                {canManage && r.status === "pending" && (
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Mark handled"
                      aria-label={`Mark reminder ${r.id} handled`} disabled={busy}
                      onClick={() => void act(r.id, "handle")}
                    >
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Dismiss"
                      aria-label={`Dismiss reminder ${r.id}`} disabled={busy}
                      onClick={() => void act(r.id, "dismiss")}
                    >
                      <XCircle className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </td>
            </ConfiguredRow>
          ))}
        </tbody>
      </table></div>
    <TablePagination page={pagination.page} totalPages={pagination.totalPages} onPage={pagination.setPage} pageSize={pagination.pageSize} onPageSize={pagination.setPageSize} total={pagination.totalFiltered}/></div>
  );
}
