"use client";

import { Badge } from "@/components/ui/badge";
import { PenLine, Send, Loader2, FileSearch, CheckCircle2, XCircle, ThumbsDown } from "lucide-react";

interface DmsRenewalStatusBadgeProps {
  status: string;
  className?: string;
}

const CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  draft: { label: "Draft", icon: PenLine, classes: "border-slate-300 text-slate-500" },
  requested: { label: "Requested", icon: Send, classes: "border-blue-400 text-blue-700 dark:text-blue-400" },
  in_progress: { label: "In Progress", icon: Loader2, classes: "border-amber-400 text-amber-700 dark:text-amber-400" },
  waiting_for_document: { label: "Waiting for Doc", icon: FileSearch, classes: "border-orange-400 text-orange-700 dark:text-orange-400" },
  renewed: { label: "Renewed", icon: CheckCircle2, classes: "border-green-400 text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, classes: "border-slate-200 text-slate-400" },
  rejected: { label: "Rejected", icon: ThumbsDown, classes: "border-red-300 text-red-600" },
};

export function DmsRenewalStatusBadge({ status, className }: DmsRenewalStatusBadgeProps) {
  const config = CONFIG[status] ?? { label: status, icon: PenLine, classes: "border-slate-300 text-slate-500" };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`text-xs flex items-center gap-1 ${config.classes} ${className ?? ""}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
