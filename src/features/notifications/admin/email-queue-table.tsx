"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw, XCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationStatusBadge } from "@/features/notifications/notification-status-badge";
import type { EmailQueueRow } from "@/server/actions/notifications/email-queue";
import {
  retryEmailQueueItem,
  cancelEmailQueueItem,
  processEmailQueueItem,
} from "@/server/actions/notifications/email-queue";

interface EmailQueueTableProps {
  items: EmailQueueRow[];
  onRefresh: () => void;
}

export function EmailQueueTable({ items, onRefresh }: EmailQueueTableProps) {
  const [actingId, setActingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const handleAction = async (
    id: number,
    fn: () => Promise<{ success: boolean; error?: string }>,
    successMsg: string
  ) => {
    setActingId(id);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        toast.success(successMsg);
        onRefresh();
      } else {
        toast.error(result.error ?? "Action failed");
      }
      setActingId(null);
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground border rounded-lg">
        <p className="text-sm">No items in the email queue</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground w-12">ID</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Status</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Priority</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Module</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">To</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Subject</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Attempts</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Scheduled</th>
            <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground">Last Error</th>
            <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 text-xs text-muted-foreground">{item.id}</td>
              <td className="px-3 py-2">
                <NotificationStatusBadge status={item.status} />
              </td>
              <td className="px-3 py-2 capitalize text-xs">{item.priority}</td>
              <td className="px-3 py-2 text-xs font-medium">{item.sourceModule}</td>
              <td className="px-3 py-2 text-xs max-w-[180px] truncate">{item.toEmails.join(", ")}</td>
              <td className="px-3 py-2 text-xs max-w-[240px] truncate">{item.subject}</td>
              <td className="px-3 py-2 text-xs">{item.attemptCount}/{item.maxAttempts}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {new Date(item.scheduledFor).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs text-red-600 max-w-[200px] truncate">
                {item.lastError ?? "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1 justify-end">
                  {["pending", "failed"].includes(item.status) && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title="Send now"
                      disabled={actingId === item.id}
                      onClick={() =>
                        handleAction(item.id, () => processEmailQueueItem(item.id, false), "Email sent")
                      }
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                  )}
                  {item.status === "failed" && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      title="Reset to pending"
                      disabled={actingId === item.id}
                      onClick={() =>
                        handleAction(item.id, () => retryEmailQueueItem(item.id), "Reset to pending")
                      }
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                  {["pending", "failed"].includes(item.status) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title="Cancel"
                      disabled={actingId === item.id}
                      onClick={() =>
                        handleAction(item.id, () => cancelEmailQueueItem(item.id, "Cancelled by admin"), "Cancelled")
                      }
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
