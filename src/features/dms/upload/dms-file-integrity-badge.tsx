"use client";

import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldX, Shield, Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type IntegrityStatus = "pending" | "verified" | "failed" | "skipped";

interface DmsFileIntegrityBadgeProps {
  status: IntegrityStatus | string;
  checkedAt?: string | null;
  errorMessage?: string | null;
  className?: string;
}

const STATUS_CONFIG: Record<IntegrityStatus, {
  label: string;
  icon: React.ElementType;
  classes: string;
}> = {
  verified: {
    label: "Verified",
    icon: ShieldCheck,
    classes: "border-emerald-400 text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "Integrity Failed",
    icon: ShieldX,
    classes: "border-red-400 text-red-700 dark:text-red-400",
  },
  pending: {
    label: "Pending Check",
    icon: Clock,
    classes: "border-amber-400 text-amber-700 dark:text-amber-400",
  },
  skipped: {
    label: "Check Skipped",
    icon: Shield,
    classes: "border-slate-300 text-slate-500",
  },
};

export function DmsFileIntegrityBadge({
  status,
  checkedAt,
  errorMessage,
  className,
}: DmsFileIntegrityBadgeProps) {
  const config = STATUS_CONFIG[status as IntegrityStatus] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 flex items-center gap-0.5 ${config.classes} ${className ?? ""}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );

  if (checkedAt || errorMessage) {
    return (
      <TooltipProvider delay={200}>
        <Tooltip>
          <TooltipTrigger>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[250px]">
            {errorMessage ? (
              <span className="text-red-500">{errorMessage}</span>
            ) : checkedAt ? (
              <span>Last checked: {new Date(checkedAt).toLocaleString()}</span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}
