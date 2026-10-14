"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw } from "lucide-react";
import { ValidatedTaskForm } from "@/components/workspace/validated-task-form";
import type {ReportCriteriaControl} from "@/hooks/use-report-criteria";
import {ReportCriterionPicker} from "./report-criterion-picker";
import {reportCriterionKeySchema} from "@/lib/reads/report-criteria-schema";

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
  criteria?: ReportCriteriaControl;
}

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
  criteria,
}: ReportFilterPanelProps) {
  const missingCriteria = fields.some(field => {const key = reportCriterionKeySchema.safeParse(field.key); return key.success && !criteria?.fields[key.data];});
  return (
    <ValidatedTaskForm className="border rounded-sm bg-card p-4" onSubmit={async()=>{ if(!isLoading&&!missingCriteria&&(!criteria||criteria.canRunNow())) onRun(); }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Filters</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          type="button"
          disabled={isLoading}
          className="h-7 text-xs gap-1 text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {fields.map((field) => {
          const lookupKey = reportCriterionKeySchema.safeParse(field.key);
          const control = lookupKey.success && criteria?.fields[lookupKey.data];
          if (control) return <ReportCriterionPicker key={field.key} label={field.label} control={control} hasValue={!!filters[field.key]} disabled={isLoading} />;
          if (lookupKey.success) return <div key={field.key}><Label>{field.label}</Label><p role="alert">Choices are unavailable. Reload this report.</p></div>;

          // Standard select field
          if (field.type === "select") {
            return (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                </Label>
                <select
                  aria-label={field.label}
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
                aria-label={field.label}
                min={field.key === "date_to" ? filters.date_from || undefined : undefined}
                max={field.key === "date_from" ? filters.date_to || undefined : undefined}
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

      <Button type="submit" size="sm" disabled={isLoading || missingCriteria || !!criteria && !criteria.canRun} className="gap-1.5">
        <Search className="h-3.5 w-3.5" />
        {isLoading ? "Running…" : "Run Report"}
      </Button>
    </ValidatedTaskForm>
  );
}
