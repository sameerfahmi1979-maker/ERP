"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unread: { label: "Unread", className: "bg-blue-100 text-blue-700 border-blue-200" },
  read: { label: "Read", className: "bg-muted text-muted-foreground" },
  dismissed: { label: "Dismissed", className: "bg-gray-100 text-gray-500" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-500" },
  // email queue statuses
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  sent: { label: "Sent", className: "bg-green-100 text-green-700 border-green-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
  skipped: { label: "Skipped", className: "bg-slate-100 text-slate-500" },
};

export function NotificationStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium capitalize", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
