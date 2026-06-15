"use client";

import { Badge } from "@/components/ui/badge";
import { CalendarX, AlertTriangle, Clock, CheckCircle2, HelpCircle } from "lucide-react";

type ExpiryView = "expired" | "expiring_7" | "expiring_30" | "expiring_60" | "expiring_90" | "valid" | "no_expiry";

interface DmsExpiryStatusBadgeProps {
  daysRemaining: number | null;
  className?: string;
}

function getExpiryView(days: number | null): ExpiryView {
  if (days === null) return "no_expiry";
  if (days < 0) return "expired";
  if (days <= 7) return "expiring_7";
  if (days <= 30) return "expiring_30";
  if (days <= 60) return "expiring_60";
  if (days <= 90) return "expiring_90";
  return "valid";
}

const CONFIG: Record<ExpiryView, { label: (d: number | null) => string; icon: React.ElementType; classes: string }> = {
  expired: {
    label: (d) => `Expired ${Math.abs(d ?? 0)}d ago`,
    icon: CalendarX,
    classes: "border-red-400 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20",
  },
  expiring_7: {
    label: (d) => `Expires in ${d}d`,
    icon: AlertTriangle,
    classes: "border-orange-400 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20",
  },
  expiring_30: {
    label: (d) => `Expires in ${d}d`,
    icon: AlertTriangle,
    classes: "border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20",
  },
  expiring_60: {
    label: (d) => `Expires in ${d}d`,
    icon: Clock,
    classes: "border-yellow-400 text-yellow-700 dark:text-yellow-400",
  },
  expiring_90: {
    label: (d) => `Expires in ${d}d`,
    icon: Clock,
    classes: "border-slate-300 text-slate-600",
  },
  valid: {
    label: (d) => `${d}d remaining`,
    icon: CheckCircle2,
    classes: "border-green-300 text-green-700 dark:text-green-400",
  },
  no_expiry: {
    label: () => "No expiry",
    icon: HelpCircle,
    classes: "border-slate-200 text-slate-400",
  },
};

export function DmsExpiryStatusBadge({ daysRemaining, className }: DmsExpiryStatusBadgeProps) {
  const view = getExpiryView(daysRemaining);
  const config = CONFIG[view];
  const Icon = config.icon;
  return (
    <Badge
      variant="outline"
      className={`text-xs flex items-center gap-1 ${config.classes} ${className ?? ""}`}
    >
      <Icon className="h-3 w-3" />
      {config.label(daysRemaining)}
    </Badge>
  );
}
