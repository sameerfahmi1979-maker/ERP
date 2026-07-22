"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ERPCombobox } from "@/components/erp/combobox";
import { SlidersHorizontal, X, ChevronDown, ChevronUp, Search } from "lucide-react";
import { getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { getDmsCategories } from "@/server/actions/dms/categories";
import { cn } from "@/lib/utils";
import type { ExpiringDocumentsFilter } from "@/server/actions/dms/expiry-reminders";

export type ExpiryAdvancedFilter = Omit<ExpiringDocumentsFilter, "view" | "limit">;

interface DmsExpiryFilterBarProps {
  /** Called whenever filters change */
  onChange: (filter: ExpiryAdvancedFilter) => void;
  className?: string;
}

type DocTypeOption = { value: string | number; label: string };

const DAYS_PRESETS = [
  { label: "Overdue", min: undefined, max: -1 },
  { label: "0–7 days", min: 0, max: 7 },
  { label: "8–30 days", min: 8, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
] as const;

const STATUS_OPTIONS: DocTypeOption[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under Review" },
  { value: "archived", label: "Archived" },
];

const ENTITY_TYPE_OPTIONS: DocTypeOption[] = [
  { value: "employee", label: "Employee" },
  { value: "party", label: "Party / Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "contract", label: "Contract" },
  { value: "vehicle", label: "Vehicle" },
  { value: "asset", label: "Asset" },
];

function countActiveFilters(f: ExpiryAdvancedFilter): number {
  let n = 0;
  if (f.documentTypeId) n++;
  if (f.categoryId) n++;
  if (f.status) n++;
  if (f.searchText?.trim()) n++;
  if (f.expiryDateFrom || f.expiryDateTo) n++;
  if (f.daysRemainingMin !== undefined || f.daysRemainingMax !== undefined) n++;
  if (f.entityType || f.entityId) n++;
  return n;
}

export function DmsExpiryFilterBar({ onChange, className }: DmsExpiryFilterBarProps) {
  const [expanded, setExpanded] = useState(false);

  // Lookup data loaded once on mount
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([]);
  const [categories, setCategories] = useState<DocTypeOption[]>([]);

  // Filter state
  const [searchText, setSearchText] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [expiryDateFrom, setExpiryDateFrom] = useState("");
  const [expiryDateTo, setExpiryDateTo] = useState("");
  const [daysPreset, setDaysPreset] = useState<typeof DAYS_PRESETS[number] | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [entityIdText, setEntityIdText] = useState("");

  // Load lookup data on mount
  useEffect(() => {
    getDmsDocumentTypes().then((r) => {
      if (r.success && r.data) {
        setDocTypes(r.data.map((t) => ({ value: t.id, label: t.name_en })));
      }
    });
    getDmsCategories().then((r) => {
      if (r.success && r.data) {
        setCategories(r.data.map((c) => ({ value: c.id, label: c.name_en })));
      }
    });
  }, []);

  const buildFilter = useCallback((): ExpiryAdvancedFilter => {
    const entityId = entityIdText.trim() ? parseInt(entityIdText, 10) : undefined;
    return {
      searchText: searchText.trim() || undefined,
      documentTypeId: documentTypeId ?? undefined,
      categoryId: categoryId ?? undefined,
      status: status ?? undefined,
      expiryDateFrom: expiryDateFrom || undefined,
      expiryDateTo: expiryDateTo || undefined,
      daysRemainingMin: daysPreset?.min,
      daysRemainingMax: daysPreset?.max,
      entityType: entityType ?? undefined,
      entityId: entityId && !isNaN(entityId) ? entityId : undefined,
    };
  }, [searchText, documentTypeId, categoryId, status, expiryDateFrom, expiryDateTo, daysPreset, entityType, entityIdText]);

  // Emit upward whenever anything changes (parent debounces)
  useEffect(() => {
    onChange(buildFilter());
  }, [onChange, buildFilter]);

  const handleClearAll = () => {
    setSearchText("");
    setDocumentTypeId(null);
    setCategoryId(null);
    setStatus(null);
    setExpiryDateFrom("");
    setExpiryDateTo("");
    setDaysPreset(null);
    setEntityType(null);
    setEntityIdText("");
  };

  const activeCount = countActiveFilters(buildFilter());

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search text */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by title or doc no…"
            className="h-8 text-sm pl-8 pr-3"
          />
        </div>

        {/* Filters toggle */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] leading-none">
              {activeCount}
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleClearAll}
          >
            <X className="h-3.5 w-3.5" />
            Clear All
          </Button>
        )}
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-4">
          {/* Row 1: Type / Category / Status */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Document Type</label>
              <ERPCombobox
                value={documentTypeId ?? null}
                onValueChange={(v) => setDocumentTypeId(v ? Number(v) : null)}
                options={docTypes}
                placeholder="Any type…"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
              <ERPCombobox
                value={categoryId ?? null}
                onValueChange={(v) => setCategoryId(v ? Number(v) : null)}
                options={categories}
                placeholder="Any category…"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
              <ERPCombobox
                value={status ?? null}
                onValueChange={(v) => setStatus((v as string) || null)}
                options={STATUS_OPTIONS}
                placeholder="Any status…"
              />
            </div>
          </div>

          {/* Row 2: Date range */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Expiry Date From</label>
              <Input
                type="date"
                value={expiryDateFrom}
                onChange={(e) => setExpiryDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Expiry Date To</label>
              <Input
                type="date"
                value={expiryDateTo}
                onChange={(e) => setExpiryDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Days Remaining</label>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {DAYS_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setDaysPreset((prev) => (prev?.label === p.label ? null : p))}
                    className={cn(
                      "h-6 px-2 text-[10px] rounded border transition-colors",
                      daysPreset?.label === p.label
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-input hover:bg-muted"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3: Linked entity */}
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Linked Entity Type</label>
              <ERPCombobox
                value={entityType ?? null}
                onValueChange={(v) => setEntityType((v as string) || null)}
                options={ENTITY_TYPE_OPTIONS}
                placeholder="Any entity…"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1">Entity ID</label>
              <Input
                type="number"
                value={entityIdText}
                onChange={(e) => setEntityIdText(e.target.value)}
                placeholder="e.g. 42"
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
