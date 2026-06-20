'use client';

import type { DataQualityFinding } from '@/lib/ai/common/data-quality/types';
import { DataQualitySeverityBadge } from './data-quality-severity-badge';
import { DataQualityStatusBadge } from './data-quality-status-badge';
import { cn } from '@/lib/utils';

interface Props {
  findings: DataQualityFinding[];
  selectedId?: number | null;
  onSelect: (finding: DataQualityFinding) => void;
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

export function DataQualityFindingsTable({ findings, selectedId, onSelect }: Props) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
        No findings match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Severity</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Title</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Entity Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Detected</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {findings.map((finding) => (
              <tr
                key={finding.id}
                onClick={() => onSelect(finding)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/50',
                  selectedId === finding.id && 'bg-primary/5 border-l-2 border-l-primary'
                )}
              >
                <td className="px-4 py-2.5">
                  <DataQualitySeverityBadge severity={finding.severity} />
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium text-foreground line-clamp-1">{finding.title}</span>
                  <span className="block text-xs text-muted-foreground font-mono">{finding.rule_code}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {CATEGORY_LABELS[finding.rule_category] ?? finding.rule_category}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">
                  {finding.entity_type.replace('_', ' ')}
                </td>
                <td className="px-4 py-2.5">
                  <DataQualityStatusBadge status={finding.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(finding.detected_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
