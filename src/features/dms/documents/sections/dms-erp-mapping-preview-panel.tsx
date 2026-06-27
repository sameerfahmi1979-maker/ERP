"use client";

/**
 * ERP DMS AI Phase 8 — ERP Mapping Preview Panel
 *
 * Read-only diff panel showing DMS approved metadata values vs current ERP field values.
 * Placed inside the AI Analysis tab, below the Apply History panel.
 *
 * Phase 8 rules:
 *  - Read-only only. No Apply button, no ERP writes.
 *  - No checkbox selection.
 *  - Uses existing card/table/badge patterns.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Network,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Link2Off,
  CheckCircle2,
  PlusCircle,
  ArrowRightLeft,
  HelpCircle,
  MinusCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDmsErpMappingPreview, type DmsErpMappingPreviewRow } from "@/server/actions/dms/erp-mappings";
import { queryKeys } from "@/lib/query/query-keys";

// ── Diff status display config ─────────────────────────────────────────────────

type DiffStatus = DmsErpMappingPreviewRow["diffStatus"];

const DIFF_STATUS_CONFIG: Record<
  DiffStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badgeClass: string;
  }
> = {
  same: {
    label: "In Sync",
    icon: CheckCircle2,
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200",
  },
  new: {
    label: "New Value",
    icon: PlusCircle,
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200",
  },
  changed: {
    label: "Changed",
    icon: ArrowRightLeft,
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200",
  },
  no_dms_value: {
    label: "No DMS Value",
    icon: MinusCircle,
    badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200",
  },
  no_target: {
    label: "No Target",
    icon: HelpCircle,
    badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200",
  },
  no_link: {
    label: "No Link",
    icon: Link2Off,
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200",
  },
  ambiguous: {
    label: "Ambiguous",
    icon: HelpCircle,
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200",
  },
};

// ── Module badge color ─────────────────────────────────────────────────────────

function ModuleBadge({ module }: { module: string }) {
  const colors: Record<string, string> = {
    hr:    "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
    party: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 uppercase font-semibold ${colors[module] ?? ""}`}
    >
      {module}
    </Badge>
  );
}

// ── Diff status badge ──────────────────────────────────────────────────────────

function DiffStatusBadge({ status }: { status: DiffStatus }) {
  const cfg = DIFF_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ErpMappingPreviewPanelProps {
  documentId: number;
}

export function ErpMappingPreviewPanel({ documentId }: ErpMappingPreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: queryKeys.dms.erpMappingPreview(documentId),
    queryFn: async () => {
      const r = await getDmsErpMappingPreview(documentId);
      if (!r.success) throw new Error(r.error);
      return r.data ?? [];
    },
    staleTime: 60_000,
    enabled: expanded,
  });

  const previewRows = rows ?? [];

  // Summary counts for collapsed header
  const totalCount  = previewRows.length;
  const syncCount   = previewRows.filter((r) => r.diffStatus === "same").length;
  const newCount    = previewRows.filter((r) => r.diffStatus === "new").length;
  const changeCount = previewRows.filter((r) => r.diffStatus === "changed").length;

  return (
    <div className="border-t border-border/50 pt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        <Network className="h-3.5 w-3.5 shrink-0 text-blue-500" />
        <span className="font-semibold uppercase tracking-wide">ERP Mapping Preview</span>
        {!expanded && totalCount > 0 && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            ({totalCount} mapping{totalCount !== 1 ? "s" : ""}{changeCount > 0 ? ` · ${changeCount} changed` : ""}{newCount > 0 ? ` · ${newCount} new` : ""})
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 ml-auto" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading ERP mapping preview…
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 py-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {(error as Error).message ?? "Failed to load ERP mapping preview"}
            </div>
          )}

          {/* No mappings configured */}
          {!isLoading && !error && previewRows.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Network className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p>No ERP mappings configured for this document type.</p>
              <p className="mt-1 text-[10px]">
                Ask a DMS admin to configure mappings in DMS Admin → Metadata Definitions.
              </p>
            </div>
          )}

          {/* Preview table */}
          {!isLoading && !error && previewRows.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">DMS Field</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">DMS Value</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Module</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">ERP Target Field</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Current ERP Value</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Permission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {previewRows.map((row) => (
                    <tr key={row.mappingId} className="hover:bg-muted/10">
                      {/* DMS Field */}
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-foreground">{row.fieldLabelEn}</div>
                        <div className="text-[9px] text-muted-foreground font-mono">{row.fieldCode}</div>
                      </td>

                      {/* DMS Value */}
                      <td className="px-2 py-1.5">
                        {row.dmsValue ? (
                          <span className="text-foreground">{row.dmsValue}</span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">not set</span>
                        )}
                      </td>

                      {/* Module */}
                      <td className="px-2 py-1.5">
                        <ModuleBadge module={row.targetModule} />
                        <div className="text-[9px] text-muted-foreground mt-0.5">{row.targetTable}</div>
                      </td>

                      {/* ERP Target Field */}
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-foreground">{row.targetFieldLabel}</div>
                        {row.targetRecordLabel && (
                          <div className="text-[9px] text-muted-foreground">
                            Record: {row.targetRecordLabel}
                          </div>
                        )}
                      </td>

                      {/* Current ERP Value */}
                      <td className="px-2 py-1.5">
                        {row.diffStatus === "no_link" || row.diffStatus === "no_target" || row.diffStatus === "ambiguous" ? (
                          <span className="text-xs text-muted-foreground italic">
                            {row.warning ?? "—"}
                          </span>
                        ) : row.targetValue ? (
                          <span className="text-foreground">{row.targetValue}</span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">empty</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-2 py-1.5">
                        <DiffStatusBadge status={row.diffStatus} />
                      </td>

                      {/* Required Permission */}
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">
                            {row.requiredPermission}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary badges */}
          {!isLoading && !error && previewRows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
              <span>
                {syncCount} in sync
              </span>
              {newCount > 0 && <span className="text-blue-600 font-medium">{newCount} new</span>}
              {changeCount > 0 && <span className="text-amber-600 font-medium">{changeCount} changed</span>}
              <span className="ml-auto italic">Phase 8 · Read-only · No ERP writes</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
