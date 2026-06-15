"use client";

import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle, Send, AlertTriangle } from "lucide-react";

interface DmsReminderStatusBadgeProps {
  status: string;
  className?: string;
}

const CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  pending: { label: "Pending", icon: Clock, classes: "border-amber-400 text-amber-700 dark:text-amber-400" },
  sent: { label: "Sent", icon: Send, classes: "border-blue-400 text-blue-700 dark:text-blue-400" },
  dismissed: { label: "Dismissed", icon: XCircle, classes: "border-slate-300 text-slate-500" },
  handled: { label: "Handled", icon: CheckCircle2, classes: "border-green-400 text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, classes: "border-slate-200 text-slate-400" },
};

export function DmsReminderStatusBadge({ status, className }: DmsReminderStatusBadgeProps) {
  const config = CONFIG[status] ?? { label: status, icon: AlertTriangle, classes: "border-slate-300 text-slate-500" };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-xs flex items-center gap-1 ${config.classes} ${className ?? ""}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
