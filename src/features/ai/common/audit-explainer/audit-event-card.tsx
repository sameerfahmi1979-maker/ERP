"use client";

import type { AuditTimelineItem } from "@/lib/ai/common/audit-explainer/types";
import { cn } from "@/lib/utils";
import { Clock, FileText, Bot, Database, Activity } from "lucide-react";

interface Props {
  item: AuditTimelineItem;
  onExplain?: (item: AuditTimelineItem) => void;
  isExplaining?: boolean;
}

const SOURCE_ICONS = {
  audit_log: Database,
  audit_group: Database,
  entity_timeline: Activity,
  ai_event_group: Bot,
  dms_event_group: FileText,
} as const;

const MODULE_COLORS: Record<string, string> = {
  DMS: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  AI: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  PARTY: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  ORG: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export function AuditEventCard({ item, onExplain, isExplaining }: Props) {
  const Icon = SOURCE_ICONS[item.source] ?? Database;
  const moduleColor = item.moduleCode ? (MODULE_COLORS[item.moduleCode] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400") : "";

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-md bg-slate-100 dark:bg-slate-800">
        <Icon className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
          {item.safeLabel}
        </p>
        {item.safeDetail && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{item.safeDetail}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <Clock className="h-3 w-3 text-slate-400" />
          <span className="text-xs text-slate-400">{new Date(item.occurredAt).toLocaleString()}</span>
          {item.moduleCode && (
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", moduleColor)}>
              {item.moduleCode}
            </span>
          )}
        </div>
      </div>
      {onExplain && (
        <button
          type="button"
          onClick={() => onExplain(item)}
          disabled={isExplaining}
          className="flex-shrink-0 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {isExplaining ? "Explaining…" : "Explain"}
        </button>
      )}
    </div>
  );
}
