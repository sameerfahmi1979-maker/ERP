"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ObservabilityFilters } from "@/server/actions/dms/ai-observability";

const FEATURE_AREAS = [
  "", "DMS_AI_ANALYSIS", "DMS_AI_SEARCH", "DMS_DOCUMENT_QA",
  "DMS_AUTO_TAGS", "DMS_SMART_LINKS", "DMS_AI_SUMMARY",
  "DMS_SEMANTIC_CHUNKING", "DMS_SEMANTIC_SEARCH",
];

const STATUSES = ["", "success", "failed", "skipped"];

interface Props {
  filters: ObservabilityFilters;
  onChange: (filters: ObservabilityFilters) => void;
}

export function AiObservabilityFilters({ filters, onChange }: Props) {
  const update = (patch: Partial<ObservabilityFilters>) =>
    onChange({ ...filters, ...patch });

  const clearAll = () =>
    onChange({ dateFrom: null, dateTo: null, featureArea: null, status: null, modelId: null });

  const hasFilters = !!(filters.dateFrom || filters.dateTo || filters.featureArea || filters.status || filters.modelId);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-col gap-1 min-w-[130px]">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => update({ dateFrom: e.target.value || null })}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[130px]">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => update({ dateTo: e.target.value || null })}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-[180px]">
        <Label className="text-xs">Feature Area</Label>
        <select
          value={filters.featureArea ?? ""}
          onChange={(e) => update({ featureArea: e.target.value || null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {FEATURE_AREAS.map((f) => (
            <option key={f} value={f}>{f || "All Features"}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-[120px]">
        <Label className="text-xs">Status</Label>
        <select
          value={filters.status ?? ""}
          onChange={(e) => update({ status: e.target.value || null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || "All Statuses"}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-[150px]">
        <Label className="text-xs">Model ID</Label>
        <Input
          type="text"
          placeholder="e.g. gpt-4.1"
          value={filters.modelId ?? ""}
          onChange={(e) => update({ modelId: e.target.value || null })}
          className="h-8 text-sm"
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs">
          Clear filters
        </Button>
      )}
    </div>
  );
}
