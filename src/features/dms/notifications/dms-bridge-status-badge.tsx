"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BRIDGE_CONFIG: Record<string, { label: string; className: string }> = {
  not_bridged: { label: "Not Bridged", className: "border-slate-300 text-slate-500" },
  bridged: { label: "Bridged", className: "border-blue-300 text-blue-700" },
  email_queued: { label: "Email Queued", className: "border-amber-300 text-amber-700" },
  email_sent: { label: "Email Sent", className: "border-green-300 text-green-700" },
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
