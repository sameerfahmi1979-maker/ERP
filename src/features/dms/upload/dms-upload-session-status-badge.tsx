"use client";

import { Badge } from "@/components/ui/badge";
import {
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";

type SessionStatus =
  | "uploading"
  | "uploaded"
  | "duplicate_detected"
  | "ready_to_attach"
  | "completed"
  | "cancelled"
  | "expired"
  | "failed";

interface DmsUploadSessionStatusBadgeProps {
  status: SessionStatus | string;
  tempCleanedAt?: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  classes: string;
}> = {
  uploading: {
    label: "Uploading",
    icon: Loader2,
    classes: "border-blue-400 text-blue-700 dark:text-blue-400",
  },
  uploaded: {
    label: "Uploaded",
    icon: Upload,
    classes: "border-sky-400 text-sky-700 dark:text-sky-400",
  },
  duplicate_detected: {
    label: "Duplicate",
    icon: AlertTriangle,
    classes: "border-amber-400 text-amber-700 dark:text-amber-400",
  },
  ready_to_attach: {
    label: "Ready",
    icon: CheckCircle2,
    classes: "border-emerald-400 text-emerald-700 dark:text-emerald-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    classes: "border-green-400 text-green-700 dark:text-green-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    classes: "border-slate-300 text-slate-500",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    classes: "border-red-300 text-red-600 dark:text-red-400",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    classes: "border-red-400 text-red-700 dark:text-red-400",
  },
};

export function DmsUploadSessionStatusBadge({
  status,
  tempCleanedAt,
  className,
}: DmsUploadSessionStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    icon: Upload,
    classes: "border-slate-300 text-slate-500",
  };

  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5">
      <Badge
        variant="outline"
        className={`text-xs capitalize flex items-center gap-1 ${config.classes} ${className ?? ""}`}
      >
        <Icon className={`h-3 w-3 ${status === "uploading" ? "animate-spin" : ""}`} />
        {config.label}
      </Badge>
      {tempCleanedAt && (
        <Badge
          variant="outline"
          className="text-[10px] border-slate-200 text-slate-400 flex items-center gap-0.5"
        >
          <Trash2 className="h-2.5 w-2.5" />
          Cleaned
        </Badge>
      )}
    </div>
  );
}
