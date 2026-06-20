"use client";

import { useState, useCallback } from "react";
import { History, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import type { AuditExplainerScope, AuditTimelineItem, AuditExplanationSummary } from "@/lib/ai/common/audit-explainer/types";
import {
  getAuditExplainerOverview,
  explainEntityAuditTimeline,
  explainAiEventGroup,
} from "@/server/actions/ai/common/audit-explainer";
import { AuditExplainerScopeSelector } from "./audit-explainer-scope-selector";
import { AuditEntityFilter } from "./audit-entity-filter";
import { AuditTimelineCard } from "./audit-timeline-card";
import { AuditExplanationPanel } from "./audit-explanation-panel";
import { AuditExplainerLoadingSkeleton } from "./audit-explainer-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  initialTimeline: AuditTimelineItem[];
  canUseAi: boolean;
  isEnabled: boolean;
}

export function AuditExplainerPageClient({ initialTimeline, canUseAi, isEnabled }: Props) {
  const [scope, setScope] = useState<AuditExplainerScope>("today");
  const [entityType, setEntityType] = useState<string | undefined>();
  const [entityId, setEntityId] = useState<number | undefined>();
  const [timeline, setTimeline] = useState<AuditTimelineItem[]>(initialTimeline);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [groupExplanation, setGroupExplanation] = useState<AuditExplanationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (s: AuditExplainerScope, et?: string, eid?: number) => {
    setLoading(true);
    setError(null);
    setGroupExplanation(null);
    try {
      const result = await getAuditExplainerOverview({ scope: s, entityType: et, entityId: eid });
      if (result.success && result.data) {
        setTimeline(result.data.timeline);
      } else {
        setError(result.error ?? "Failed to load.");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScopeChange = (s: AuditExplainerScope) => {
    setScope(s);
    void loadOverview(s, entityType, entityId);
  };

  const handleFilterChange = (et?: string, eid?: number) => {
    setEntityType(et);
    setEntityId(eid);
    void loadOverview(scope, et, eid);
  };

  const handleRefresh = () => void loadOverview(scope, entityType, entityId);

  const handleExplainGroup = async () => {
    if (!canUseAi || !isEnabled) return;
    setExplaining(true);
    setGroupExplanation(null);
    try {
      const result = entityType
        ? await explainEntityAuditTimeline({ entityType, entityId: entityId ?? 0, scope })
        : await explainAiEventGroup({ scope, entityType, entityId });

      if (result.success && result.data) {
        setGroupExplanation(result.data);
      }
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900">
            <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              AI Audit Trail Explainer
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Read-only audit explanation • No rollback • No undo • Existing ERP scope only
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs text-slate-500 border-slate-300">
            <ShieldAlert className="h-3 w-3 mr-1" />
            Read-only
          </Badge>
          {!isEnabled && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              AI Disabled
            </Badge>
          )}
          <AuditExplainerScopeSelector scope={scope} onChange={handleScopeChange} disabled={loading} />
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="h-8 text-xs gap-1">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <AuditEntityFilter
        entityType={entityType}
        entityId={entityId}
        onFilterChange={handleFilterChange}
        disabled={loading}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Explain Group button */}
      {timeline.length > 0 && canUseAi && isEnabled && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExplainGroup}
            disabled={explaining}
            className="h-8 text-xs gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400"
          >
            <Sparkles className="h-3 w-3" />
            {explaining ? "Explaining group…" : "Explain All Events"}
          </Button>
          <span className="text-xs text-slate-400">Generate AI summary for this group</span>
        </div>
      )}

      {/* Group explanation */}
      {groupExplanation && (
        <AuditExplanationPanel
          summary={groupExplanation}
          onClose={() => setGroupExplanation(null)}
        />
      )}

      {/* Timeline */}
      {loading ? (
        <AuditExplainerLoadingSkeleton />
      ) : (
        <AuditTimelineCard
          items={timeline}
          title="Audit Events"
          canUseAi={canUseAi && isEnabled}
        />
      )}
    </div>
  );
}
