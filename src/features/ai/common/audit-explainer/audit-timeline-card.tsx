"use client";

import type { AuditTimelineItem, AuditExplanationSummary } from "@/lib/ai/common/audit-explainer/types";
import { AuditEventCard } from "./audit-event-card";
import { AuditExplanationPanel } from "./audit-explanation-panel";
import { explainAuditLogEntry, explainAiEventGroup } from "@/server/actions/ai/common/audit-explainer";
import { useState } from "react";

interface Props {
  items: AuditTimelineItem[];
  title?: string;
  canUseAi?: boolean;
  onExplainGroup?: () => void;
}

export function AuditTimelineCard({ items, title = "Audit Timeline", canUseAi = false, onExplainGroup }: Props) {
  const [explaining, setExplaining] = useState<number | null>(null);
  const [explanations, setExplanations] = useState<Record<number, AuditExplanationSummary>>({});

  const handleExplain = async (item: AuditTimelineItem) => {
    if (!canUseAi) return;
    setExplaining(item.id);
    try {
      const result = item.source === "audit_log"
        ? await explainAuditLogEntry({ auditLogId: item.id })
        : await explainAiEventGroup({ entityType: item.entityType, entityId: item.entityId });

      if (result.success && result.data) {
        setExplanations((prev) => ({ ...prev, [item.id]: result.data! }));
      }
    } finally {
      setExplaining(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {items.length > 0 && (
          <span className="text-xs text-slate-400">{items.length} event{items.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="p-5 text-sm text-slate-500 dark:text-slate-400 italic">No events in this period.</div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <div key={`${item.source}-${item.id}`}>
              <AuditEventCard
                item={item}
                onExplain={canUseAi ? handleExplain : undefined}
                isExplaining={explaining === item.id}
              />
              {explanations[item.id] && (
                <div className="px-4 pb-3">
                  <AuditExplanationPanel
                    summary={explanations[item.id]}
                    onClose={() => setExplanations((prev) => { const n = { ...prev }; delete n[item.id]; return n; })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
