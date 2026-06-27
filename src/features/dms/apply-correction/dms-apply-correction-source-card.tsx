"use client";

/**
 * DMS Apply Correction — Source Card
 *
 * Displays the before/applied/current value context for a correction proposal.
 * Read-only display — no writes.
 *
 * Shows:
 *   - Original target coordinates (table, field, record)
 *   - Before summary (what the field was before the original apply)
 *   - Applied summary (what the AI wrote)
 *   - Current live value (loaded fresh at source-load time)
 *   - Conflict indicators
 */

import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CorrectionSourceData } from "@/lib/dms/apply-correction/types";

interface Props {
  source:    CorrectionSourceData;
  className?: string;
}

export function DmsApplyCorrectionSourceCard({ source, className }: Props) {
  const currentMatchesApplied =
    normalizeForDisplay(source.currentValueSummary) ===
    normalizeForDisplay(source.originalAppliedSummary);

  const fieldValueChanged = !currentMatchesApplied &&
    source.currentValueSummary !== source.originalAppliedSummary;

  return (
    <div className={cn("rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4", className)}>
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Correction Target
        </p>
        <div className="flex flex-wrap gap-2 text-sm text-slate-700">
          <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
            {source.targetTable}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
            {source.targetField}
          </span>
          {source.targetRecordId && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                Record #{source.targetRecordId}
              </span>
            </>
          )}
          {source.targetDisplayLabel && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-xs text-slate-500">{source.targetDisplayLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Value grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ValueRow
          label="Before Apply"
          value={source.originalBeforeSummary}
          emptyLabel="(empty)"
          variant="neutral"
        />
        <ValueRow
          label="AI Applied"
          value={source.originalAppliedSummary}
          emptyLabel="(empty)"
          variant="info"
        />
        <ValueRow
          label="Current Live Value"
          value={source.currentValueSummary}
          emptyLabel="(empty)"
          variant={fieldValueChanged ? "warning" : "success"}
        />
      </div>

      {/* Changed warning */}
      {fieldValueChanged && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            The current live value differs from what was applied. The field may have been
            updated since the original apply. Review carefully before correcting.
          </span>
        </div>
      )}

      {/* Value type info */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Info className="h-3 w-3" />
        <span>Value type: <span className="font-mono">{source.valueType}</span></span>
      </div>
    </div>
  );
}

// ── Value row ─────────────────────────────────────────────────────────────────

function ValueRow({
  label,
  value,
  emptyLabel,
  variant,
}: {
  label:      string;
  value:      string | null;
  emptyLabel: string;
  variant:    "neutral" | "info" | "success" | "warning";
}) {
  const variantClass: Record<typeof variant, string> = {
    neutral: "bg-white border-slate-200 text-slate-600",
    info:    "bg-blue-50 border-blue-200 text-blue-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className={cn(
        "rounded border px-2.5 py-1.5 text-sm min-h-[2rem] break-words",
        variantClass[variant]
      )}>
        {value != null && value !== "" ? value : (
          <span className="text-slate-400 italic">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

function normalizeForDisplay(v: string | null | undefined): string {
  return v?.trim() ?? "";
}
