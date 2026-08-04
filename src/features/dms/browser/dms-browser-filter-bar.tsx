"use client";

/**
 * DMS.BROWSER.1 — Quick-filter bar below the search input.
 * Chips: Document Type, Status, Date Range, Linked Entity Type, AI Semantic toggle.
 */

import { useState } from "react";
import { X, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DmsBrowserDocType } from "@/server/actions/dms/browser";

export interface DmsBrowserActiveFilters {
  documentTypeIds: number[];
  status: string;
  issueDateFrom: string;
  issueDateTo: string;
  linkedEntityType: string;
  semanticOn: boolean;
}

export const DEFAULT_FILTERS: DmsBrowserActiveFilters = {
  documentTypeIds: [],
  status: "",
  issueDateFrom: "",
  issueDateTo: "",
  linkedEntityType: "",
  semanticOn: false,
};

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under Review" },
];

const ENTITY_TYPE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "employee_dependent", label: "Dependent" },
  { value: "party", label: "Party / Company" },
  { value: "vendor", label: "Vendor" },
];

interface FilterChipProps {
  label: string;
  active: boolean;
  onClear?: () => void;
  children?: React.ReactNode;
  className?: string;
}

function FilterChip({ label, active, onClear, children, className }: FilterChipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-medium transition-colors",
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
          className
        )}
      >
        {label}
        {active && onClear ? (
          <span
            role="button"
            aria-label="Clear filter"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
          >
            <X className="h-2.5 w-2.5" />
          </span>
        ) : (
          <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-180")} />
        )}
      </button>

      {open && !active && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-8 left-0 z-50 min-w-[180px] rounded-md border border-border bg-popover shadow-md p-1">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

interface DmsBrowserFilterBarProps {
  docTypes: DmsBrowserDocType[];
  filters: DmsBrowserActiveFilters;
  onChange: (f: DmsBrowserActiveFilters) => void;
}

export function DmsBrowserFilterBar({ docTypes, filters, onChange }: DmsBrowserFilterBarProps) {
  const hasAnyFilter =
    filters.documentTypeIds.length > 0 ||
    !!filters.status ||
    !!filters.issueDateFrom ||
    !!filters.issueDateTo ||
    !!filters.linkedEntityType;

  const clearAll = () => onChange({ ...DEFAULT_FILTERS, semanticOn: filters.semanticOn });

  const selectedTypeName =
    filters.documentTypeIds.length === 1
      ? docTypes.find((t) => t.id === filters.documentTypeIds[0])?.nameEn ?? "Type"
      : filters.documentTypeIds.length > 1
      ? `${filters.documentTypeIds.length} types`
      : "";

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/40 flex-wrap">
      {/* Document Type */}
      <FilterChip
        label={filters.documentTypeIds.length > 0 ? selectedTypeName : "Type"}
        active={filters.documentTypeIds.length > 0}
        onClear={() => onChange({ ...filters, documentTypeIds: [] })}
      >
        <div className="max-h-52 overflow-y-auto">
          {docTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const already = filters.documentTypeIds.includes(t.id);
                onChange({
                  ...filters,
                  documentTypeIds: already
                    ? filters.documentTypeIds.filter((id) => id !== t.id)
                    : [...filters.documentTypeIds, t.id],
                });
              }}
              className={cn(
                "w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition-colors",
                filters.documentTypeIds.includes(t.id) && "bg-primary/10 text-primary font-medium"
              )}
            >
              {t.nameEn}
            </button>
          ))}
        </div>
      </FilterChip>

      {/* Status */}
      <FilterChip
        label={filters.status ? STATUS_OPTIONS.find((s) => s.value === filters.status)?.label ?? "Status" : "Status"}
        active={!!filters.status}
        onClear={() => onChange({ ...filters, status: "" })}
      >
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange({ ...filters, status: filters.status === s.value ? "" : s.value })}
            className={cn(
              "w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition-colors",
              filters.status === s.value && "bg-primary/10 text-primary font-medium"
            )}
          >
            {s.label}
          </button>
        ))}
      </FilterChip>

      {/* Date Range */}
      <FilterChip
        label={filters.issueDateFrom || filters.issueDateTo ? "Date ✓" : "Date"}
        active={!!(filters.issueDateFrom || filters.issueDateTo)}
        onClear={() => onChange({ ...filters, issueDateFrom: "", issueDateTo: "" })}
      >
        <div className="p-2 space-y-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Issue From</label>
            <input
              type="date"
              value={filters.issueDateFrom}
              onChange={(e) => onChange({ ...filters, issueDateFrom: e.target.value })}
              className="w-full text-xs border border-border rounded px-1.5 py-0.5 bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Issue To</label>
            <input
              type="date"
              value={filters.issueDateTo}
              onChange={(e) => onChange({ ...filters, issueDateTo: e.target.value })}
              className="w-full text-xs border border-border rounded px-1.5 py-0.5 bg-background"
            />
          </div>
        </div>
      </FilterChip>

      {/* Linked to */}
      <FilterChip
        label={filters.linkedEntityType
          ? ENTITY_TYPE_OPTIONS.find((e) => e.value === filters.linkedEntityType)?.label ?? "Linked to"
          : "Linked to"}
        active={!!filters.linkedEntityType}
        onClear={() => onChange({ ...filters, linkedEntityType: "" })}
      >
        {ENTITY_TYPE_OPTIONS.map((e) => (
          <button
            key={e.value}
            type="button"
            onClick={() => onChange({ ...filters, linkedEntityType: filters.linkedEntityType === e.value ? "" : e.value })}
            className={cn(
              "w-full text-left px-2 py-1 text-xs rounded hover:bg-muted transition-colors",
              filters.linkedEntityType === e.value && "bg-primary/10 text-primary font-medium"
            )}
          >
            {e.label}
          </button>
        ))}
      </FilterChip>

      {/* Clear all */}
      {hasAnyFilter && (
        <button
          type="button"
          onClick={clearAll}
          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}

      {/* AI Semantic toggle — always rightmost */}
      <div className="ml-auto">
        <button
          type="button"
          onClick={() => onChange({ ...filters, semanticOn: !filters.semanticOn })}
          className={cn(
            "inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-medium transition-colors",
            filters.semanticOn
              ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400"
              : "border-border text-muted-foreground hover:border-violet-400 hover:text-violet-600"
          )}
        >
          <Sparkles className="h-2.5 w-2.5" />
          AI Semantic
        </button>
      </div>
    </div>
  );
}
