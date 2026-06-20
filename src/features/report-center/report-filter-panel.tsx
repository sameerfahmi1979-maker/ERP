"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw } from "lucide-react";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";

export interface FilterLookupOption {
  value: number;
  label: string;
  code?: string;
}

/** Lookup data map keyed by filter field key */
export type FilterLookupMap = Partial<
  Record<
    | "employee_id"
    | "owner_company_id"
    | "department_id"
    | "branch_id"
    | "designation_id"
    | "work_site_id",
    FilterLookupOption[]
  >
>;

interface FilterField {
  key: string;
  label: string;
  type: "text" | "date" | "select";
  options?: { value: string; label: string }[];
}

interface ReportFilterPanelProps {
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  onRun: () => void;
  onReset: () => void;
  isLoading: boolean;
  fields?: FilterField[];
  /** Lookup options for entity ID fields (employee_id, owner_company_id, etc.) */
  lookups?: FilterLookupMap;
  lookupsLoading?: boolean;
}

/** Entity filter keys that support combobox lookup */
const ENTITY_KEYS = new Set<string>([
  "employee_id",
  "owner_company_id",
  "department_id",
  "branch_id",
  "designation_id",
  "work_site_id",
]);

const LOOKUP_KEY_MAP: Record<string, keyof FilterLookupMap> = {
  employee_id: "employee_id",
  owner_company_id: "owner_company_id",
  department_id: "department_id",
  branch_id: "branch_id",
  designation_id: "designation_id",
  work_site_id: "work_site_id",
};

const DEFAULT_FIELDS: FilterField[] = [
  { key: "date_from", label: "Date From", type: "date" },
  { key: "date_to", label: "Date To", type: "date" },
  { key: "search", label: "Search", type: "text" },
];

export function ReportFilterPanel({
  filters,
  onFilterChange,
  onRun,
  onReset,
  isLoading,
  fields = DEFAULT_FIELDS,
  lookups,
  lookupsLoading = false,
}: ReportFilterPanelProps) {
  return (
    <div className="border rounded-lg bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Filters</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-7 text-xs gap-1 text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {fields.map((field) => {
          const lookupKey = LOOKUP_KEY_MAP[field.key];
          const lookupOptions = lookupKey ? (lookups?.[lookupKey] ?? null) : null;
          const isEntityField = ENTITY_KEYS.has(field.key);

          // Entity field with lookup data → ERPCombobox
          if (isEntityField && lookupOptions !== null) {
            const comboOptions: ERPComboboxOption[] = lookupOptions.map((o) => ({
              value: o.value,
              label: o.label,
              code: o.code ?? null,
            }));

            return (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                </Label>
                <ERPCombobox
                  value={filters[field.key] ? Number(filters[field.key]) : null}
                  onValueChange={(v) =>
                    onFilterChange(field.key, v !== null ? String(v) : "")
                  }
                  options={comboOptions}
                  placeholder={`Select ${field.label.toLowerCase()}...`}
                  allowClear
                  loading={lookupsLoading}
                  showCode
                  maxVisibleOptions={50}
                />
              </div>
            );
          }

          // Entity field without lookup data yet → text input as fallback
          if (isEntityField) {
            return (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                  {lookupsLoading && (
                    <span className="ml-1 text-[9px] text-muted-foreground">
                      (loading…)
                    </span>
                  )}
                </Label>
                <Input
                  type="text"
                  value={filters[field.key] ?? ""}
                  onChange={(e) => onFilterChange(field.key, e.target.value)}
                  placeholder="ID…"
                  className="h-8 text-xs"
                  disabled={lookupsLoading}
                />
              </div>
            );
          }

          // Standard select field
          if (field.type === "select") {
            return (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                </Label>
                <select
                  value={filters[field.key] ?? ""}
                  onChange={(e) => onFilterChange(field.key, e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background text-foreground px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All</option>
                  {(field.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          // Date or text field
          return (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {field.label}
              </Label>
              <Input
                type={field.type === "date" ? "date" : "text"}
                value={filters[field.key] ?? ""}
                onChange={(e) => onFilterChange(field.key, e.target.value)}
                placeholder={
                  field.type === "text"
                    ? `Search ${field.label.toLowerCase()}…`
                    : undefined
                }
                className="h-8 text-xs"
              />
            </div>
          );
        })}
      </div>

      <Button size="sm" onClick={onRun} disabled={isLoading} className="gap-1.5">
        <Search className="h-3.5 w-3.5" />
        {isLoading ? "Running…" : "Run Report"}
      </Button>
    </div>
  );
}
