'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, X, CheckCheck, XCircle, Flag, RotateCcw } from 'lucide-react';
import type { DataQualityFinding, DataQualityFindingEvent } from '@/lib/ai/common/data-quality/types';
import { DataQualitySeverityBadge } from './data-quality-severity-badge';
import { DataQualityStatusBadge } from './data-quality-status-badge';
import {
  reviewDataQualityFinding,
  dismissDataQualityFinding,
  markDataQualityFindingFalsePositive,
  reopenDataQualityFinding,
} from '@/server/actions/ai/common/data-quality';

interface Props {
  finding: DataQualityFinding;
  events?: DataQualityFindingEvent[];
  canReview: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  completeness: 'Completeness',
  format: 'Format',
  consistency: 'Consistency',
  staleness: 'Staleness',
  relationship: 'Relationship',
  dms_health: 'DMS Health',
  ai_health: 'AI Health',
  permission_health: 'Permission Health',
};

export function DataQualityFindingDetailPanel({ finding, events, canReview, onClose, onStatusChange }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleAction(
    action: (id: number, note?: string) => Promise<{ success: boolean; error: string | null }>
  ) {
    setLoading(true);
    await action(finding.id);
    setLoading(false);
    onStatusChange?.();
  }

  const isOpen = finding.status === 'open';
  const isReviewed = finding.status === 'reviewed';
  const canActOn = isOpen || isReviewed;
  const isDismissed = finding.status === 'dismissed' || finding.status === 'false_positive';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DataQualitySeverityBadge severity={finding.severity} />
            <DataQualityStatusBadge status={finding.status} />
          </div>
          <h3 className="mt-2 text-sm font-semibold">{finding.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground font-mono">{finding.rule_code}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Description</p>
          <p className="text-sm">{finding.description}</p>
        </div>

        {finding.recommendation && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Recommendation</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{finding.recommendation}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Entity Type</p>
            <p className="text-sm capitalize">{finding.entity_type.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Category</p>
            <p className="text-sm">{CATEGORY_LABELS[finding.rule_category] ?? finding.rule_category}</p>
          </div>
          {finding.source_table && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Source Table</p>
              <p className="text-sm font-mono text-xs">{finding.source_table}</p>
            </div>
          )}
          {finding.source_field && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Source Field</p>
              <p className="text-sm font-mono text-xs">{finding.source_field}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-muted-foreground">First Detected</p>
            <p className="text-sm">{new Date(finding.detected_at).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Last Seen</p>
            <p className="text-sm">{new Date(finding.last_seen_at).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Safe Evidence */}
        {Object.keys(finding.safe_evidence_json ?? {}).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Evidence</p>
            <div className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
              {Object.entries(finding.safe_evidence_json).map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground">{k}: </span>
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Link */}
        {finding.source_link && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Source Record</p>
            <Link
              href={finding.source_link}
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Open Source Record <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Events */}
        {events && events.length > 0 && (
          <div>
            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">History</p>
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono capitalize">
                    {ev.event_type}
                  </span>
                  <span className="text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
                  {ev.event_note && <span className="text-muted-foreground">— {ev.event_note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {canReview && (
        <div className="border-t p-3 flex flex-wrap gap-2">
          {canActOn && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => handleAction(reviewDataQualityFinding)}
                className="gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Review
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => handleAction(dismissDataQualityFinding)}
                className="gap-1"
              >
                <XCircle className="h-3.5 w-3.5" /> Dismiss
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => handleAction(markDataQualityFindingFalsePositive)}
                className="gap-1"
              >
                <Flag className="h-3.5 w-3.5" /> False Positive
              </Button>
            </>
          )}
          {isDismissed && (
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => handleAction(reopenDataQualityFinding)}
              className="gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
