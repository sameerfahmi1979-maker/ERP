'use client';

import { Button } from '@/components/ui/button';
import type {
  DataQualityFindingsFilter,
  DataQualityRuleCategory,
  DataQualitySeverity,
  DataQualityStatus,
} from '@/lib/ai/common/data-quality/types';

interface Props {
  filter: DataQualityFindingsFilter;
  onChange: (filter: DataQualityFindingsFilter) => void;
}

const SEVERITY_OPTIONS: DataQualitySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_OPTIONS: DataQualityStatus[] = ['open', 'reviewed', 'dismissed', 'resolved', 'false_positive'];
const CATEGORY_OPTIONS: DataQualityRuleCategory[] = [
  'completeness', 'format', 'consistency', 'staleness',
  'relationship', 'dms_health', 'ai_health', 'permission_health',
];

const CATEGORY_LABELS: Record<DataQualityRuleCategory, string> = {
  completeness: 'Completeness',
  format: 'Format',
  consistency: 'Consistency',
  staleness: 'Staleness',
  relationship: 'Relationship',
  dms_health: 'DMS Health',
  ai_health: 'AI Health',
  permission_health: 'Permission Health',
};

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-muted text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );
}

function toggleArray<T>(arr: T[] | undefined, val: T): T[] {
  const current = arr ?? [];
  return current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
}

export function DataQualityFilters({ filter, onChange }: Props) {
  const reset = () => onChange({ statuses: ['open', 'reviewed'] });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Filters</span>
        <Button variant="ghost" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Severity</p>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_OPTIONS.map((s) => (
            <ToggleChip
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={(filter.severities ?? []).includes(s)}
              onClick={() => onChange({ ...filter, severities: toggleArray(filter.severities, s) })}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <ToggleChip
              key={s}
              label={s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              active={(filter.statuses ?? []).includes(s)}
              onClick={() => onChange({ ...filter, statuses: toggleArray(filter.statuses, s) })}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((c) => (
            <ToggleChip
              key={c}
              label={CATEGORY_LABELS[c]}
              active={(filter.ruleCategories ?? []).includes(c)}
              onClick={() => onChange({ ...filter, ruleCategories: toggleArray(filter.ruleCategories, c) })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
