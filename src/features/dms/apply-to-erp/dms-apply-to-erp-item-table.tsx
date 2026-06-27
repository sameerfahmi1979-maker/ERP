"use client";

import { AlertTriangle } from "lucide-react";
import type { ApplyItemProposal } from "@/lib/dms/apply-to-erp/types";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  items:              ApplyItemProposal[];
  selectedIndices:    Set<number>;
  onToggle:           (index: number) => void;
  disabled?:          boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsApplyToErpItemTable({ items, selectedIndices, onToggle, disabled }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        No apply items available.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="w-8 px-3 py-2 text-left" />
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Field</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Current Value</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Proposed Value</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Confidence</th>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item, index) => {
            const isSelected = selectedIndices.has(index);
            const hasConflict = item.conflictRisk;
            return (
              <tr
                key={index}
                className={cn(
                  "hover:bg-muted/30 cursor-pointer transition-colors",
                  isSelected && "bg-blue-50/60",
                  disabled && "opacity-60 cursor-not-allowed"
                )}
                onClick={() => !disabled && onToggle(index)}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => !disabled && onToggle(index)}
                    disabled={disabled}
                    className="h-4 w-4 rounded border-gray-300 text-primary"
                    aria-label={`Select ${item.targetDisplayLabel}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{item.targetDisplayLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.targetTable}.{item.targetField}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {item.currentValueSummary ? (
                    <span className="text-muted-foreground">{item.currentValueSummary}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">empty</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {item.proposedValueSummary ? (
                    <span className="font-medium text-foreground">{item.proposedValueSummary}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {item.confidence !== null && item.confidence !== undefined ? (
                    <span className={cn(
                      "text-xs font-medium",
                      item.confidence >= 0.85 ? "text-green-700" :
                      item.confidence >= 0.65 ? "text-amber-700" :
                      "text-red-700"
                    )}>
                      {Math.round(item.confidence * 100)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {hasConflict ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Overwrites
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
