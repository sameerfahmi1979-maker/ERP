"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-blue-100 text-blue-700 border-blue-200" },
  success: { label: "Success", className: "bg-green-100 text-green-700 border-green-200" },
  warning: { label: "Warning", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  urgent: { label: "Urgent", className: "bg-orange-100 text-orange-700 border-orange-200" },
  critical: { label: "Critical", className: "bg-red-100 text-red-700 border-red-200" },
};

export function NotificationSeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] ?? { label: severity, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium capitalize", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
