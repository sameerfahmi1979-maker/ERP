'use client';

import { useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type {
  DataQualityFinding,
  DataQualityFindingEvent,
  DataQualityFindingsFilter,
  DataQualityPermissionState,
  DataQualitySummary,
} from '@/lib/ai/common/data-quality/types';
import {
  getDataQualityFindings,
  getDataQualityFindingEvents,
} from '@/server/actions/ai/common/data-quality';
import { queryKeys } from '@/lib/query/query-keys';
import { DataQualitySummaryCards } from './data-quality-summary-cards';
import { DataQualityScanCard } from './data-quality-scan-card';
import { DataQualityFilters } from './data-quality-filters';
import { DataQualityFindingsTable } from './data-quality-findings-table';
import { DataQualityFindingDetailPanel } from './data-quality-finding-detail-panel';
import { DataQualityPermissionEmpty } from './data-quality-permission-empty';

interface Props {
  initialSummary: DataQualitySummary | null;
  permissions: DataQualityPermissionState;
  isEnabled: boolean;
}

export function AiDataQualityPageClient({ initialSummary, permissions, isEnabled }: Props) {
  const [filter, setFilter] = useState<DataQualityFindingsFilter>({
    statuses: ['open', 'reviewed'],
  });
  const [selectedFinding, setSelectedFinding] = useState<DataQualityFinding | null>(null);
  const [_isPending, startTransition] = useTransition();

  const findingsQuery = useQuery({
    queryKey: queryKeys.ai.dataQualityFindings(filter as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await getDataQualityFindings(filter);
      return data ?? [];
    },
    enabled: permissions.canView,
  });

  const eventsQuery = useQuery({
    queryKey: selectedFinding
      ? queryKeys.ai.dataQualityFindingEvents(selectedFinding.id)
      : ['noop'],
    queryFn: async () => {
      if (!selectedFinding) return [];
      const { data } = await getDataQualityFindingEvents(selectedFinding.id);
      return data ?? [];
    },
    enabled: !!selectedFinding && permissions.canView,
  });

  function handleScanComplete() {
    startTransition(() => {
      findingsQuery.refetch();
    });
  }

  function handleStatusChange() {
    findingsQuery.refetch();
    setSelectedFinding(null);
  }

  if (!permissions.canView) {
    return <DataQualityPermissionEmpty />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">AI Data Quality Monitor</h1>
            <span className="rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs text-muted-foreground">
              Read-Only
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic data quality findings for existing ERP scope. No source records are modified.
          </p>
        </div>

        {!isEnabled && (
          <div className="flex items-center gap-1.5 rounded-full border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-1 text-xs text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Feature flag disabled — scan blocked
          </div>
        )}
      </div>

      {/* Summary */}
      {initialSummary && <DataQualitySummaryCards summary={initialSummary} />}

      {/* Scan */}
      {permissions.canScan && (
        <DataQualityScanCard canScan={isEnabled && permissions.canScan} onScanComplete={handleScanComplete} />
      )}

      {/* Filters */}
      <DataQualityFilters
        filter={filter}
        onChange={(f) => {
          setFilter(f);
          setSelectedFinding(null);
        }}
      />

      {/* Content: Table + Detail Panel */}
      <div className={selectedFinding ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : ''}>
        <div>
          <DataQualityFindingsTable
            findings={findingsQuery.data ?? []}
            selectedId={selectedFinding?.id}
            onSelect={(f) => setSelectedFinding(f)}
          />
          {findingsQuery.isLoading && (
            <p className="mt-2 text-xs text-muted-foreground">Loading findings…</p>
          )}
        </div>

        {selectedFinding && (
          <DataQualityFindingDetailPanel
            finding={selectedFinding}
            events={eventsQuery.data as DataQualityFindingEvent[] | undefined}
            canReview={permissions.canReview}
            onClose={() => setSelectedFinding(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>
    </div>
  );
}
