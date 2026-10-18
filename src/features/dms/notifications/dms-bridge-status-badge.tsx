"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BRIDGE_CONFIG: Record<string, { label: string; className: string }> = {
  not_bridged: { label: "Not Bridged", className: "border-slate-300 text-slate-500" },
  bridged: { label: "Bridged", className: "border-blue-300 text-blue-700" },
  email_queued: { label: "Email Queued", className: "border-amber-300 text-amber-700" },
  email_sent: { label: "Legacy sent (unverified)", className: "border-slate-300 text-slate-600 dark:text-slate-300" },
  legacy_sent_unverified: { label: "Legacy sent (unverified)", className: "border-slate-300 text-slate-600 dark:text-slate-300" },
  provider_accepted: { label: "Provider accepted — not inbox receipt", className: "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300" },
  email_uncertain: { label: "Delivery uncertain — held", className: "border-amber-300 text-amber-700 dark:text-amber-300" },
  email_cancelled: { label: "Email cancelled", className: "border-slate-300 text-slate-600 dark:text-slate-300" },
  failed: { label: "Failed", className: "border-red-400 text-red-600" },
  skipped: { label: "Skipped", className: "border-slate-200 text-slate-400" },
};

export function DmsBridgeStatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "not_bridged";
  const cfg = BRIDGE_CONFIG[s] ?? { label: s, className: "border-slate-300 text-slate-500" };
  return (
    <Badge variant="outline" className={cn("text-xs", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
