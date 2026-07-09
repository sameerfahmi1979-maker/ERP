"use client";

import type { HrDocumentConflict } from "@/lib/hr/document-to-record/types";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  conflict: HrDocumentConflict;
  onResolve: (value: string, sourceDocumentId: number) => void;
};

export function HrDocumentConflictCard({ conflict, onResolve }: Props) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
        <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
          Conflict: {conflict.fieldLabel}
        </span>
      </div>
      <p className="text-[11px] text-yellow-700 dark:text-yellow-400">
        Multiple documents have different values. Choose the correct one.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {conflict.values.map((v) => {
          const isResolved = conflict.resolvedValue === v.value && conflict.resolvedSourceDocumentId === v.sourceDocumentId;
          return (
            <button
              key={`${v.sourceDocumentId}-${v.value}`}
              type="button"
              onClick={() => onResolve(v.value, v.sourceDocumentId)}
              className={cn(
                "rounded border px-2 py-1 text-[11px] transition-colors",
                isResolved
                  ? "border-yellow-600 bg-yellow-200 dark:bg-yellow-800 font-semibold text-yellow-900 dark:text-yellow-100"
                  : "border-yellow-300 bg-white dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
              )}
            >
              <span className="block font-medium">{v.value}</span>
              <span className="block text-[10px] text-yellow-600 dark:text-yellow-500 mt-0.5">
                {v.sourceDocumentTitle} · {Math.round(v.confidence * 100)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
