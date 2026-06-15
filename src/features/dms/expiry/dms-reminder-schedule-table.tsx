"use client";

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
}

export function DmsReminderScheduleTable({ documentId }: DmsReminderScheduleTableProps) {
  const queryClient = useQueryClient();

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: queryKeys.dms.documentExpiryReminders(documentId),
    queryFn: async () => {
      const result = await getDmsExpiryReminders({ documentId });
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  const handleDismiss = async (reminderId: number) => {
    const result = await dismissDmsExpiryReminder(reminderId, "Manually dismissed");
    if (result.success) {
      toast.success("Reminder dismissed");
      invalidateDmsDocumentExpiry(queryClient, documentId);
      invalidateDmsExpiry(queryClient);
    } else {
      toast.error(result.error ?? "Failed to dismiss");
    }
  };

  const handleMarkHandled = async (reminderId: number) => {
    const result = await markDmsExpiryReminderHandled(reminderId);
    if (result.success) {
      toast.success("Reminder marked as handled");
      invalidateDmsDocumentExpiry(queryClient, documentId);
    } else {
      toast.error(result.error ?? "Failed to update");
    }
  };

  if (isLoading) {
    return <div className="py-4 text-center text-xs text-muted-foreground">Loading reminders…</div>;
  }

  if (reminders.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No reminders generated yet. Click "Generate Reminders" to create the schedule.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/20 border-b border-border">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Days Before</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Reminder Date</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
            <th className="px-3 py-2 w-24" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {reminders.map((r: DmsExpiryReminderRow) => (
            <tr key={r.id} className={`hover:bg-muted/10 transition-colors ${r.status === "dismissed" ? "opacity-50" : ""}`}>
              <td className="px-3 py-1.5 font-mono">
                {r.reminder_days_before === 0 ? "Expiry Day" : `-${r.reminder_days_before}d`}
              </td>
              <td className="px-3 py-1.5">{format(parseISO(r.reminder_date), "dd MMM yyyy")}</td>
              <td className="px-3 py-1.5">
                <DmsReminderStatusBadge status={r.status} />
              </td>
              <td className="px-3 py-1.5">
                {r.status === "pending" && (
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Mark handled"
                      onClick={() => handleMarkHandled(r.id)}
                    >
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Dismiss"
                      onClick={() => handleDismiss(r.id)}
                    >
                      <XCircle className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
