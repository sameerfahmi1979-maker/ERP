"use client";

import { useState } from "react";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HrSearchCategory, HrSearchInput } from "@/lib/hr/search/types";
import { HR_SEARCH_CATEGORY_LABELS, HR_SEARCH_CATEGORY_ORDER } from "@/lib/hr/search/types";
import { cn } from "@/lib/utils";

type Props = {
  filters: HrSearchInput;
  onChange: (filters: Partial<HrSearchInput>) => void;
  availableCategories: HrSearchCategory[];
};

const CATEGORY_COLORS: Record<HrSearchCategory, string> = {
  employees: "bg-blue-100 text-blue-700 border-blue-200 data-[active=true]:bg-blue-600 data-[active=true]:text-white",
  candidates: "bg-purple-100 text-purple-700 border-purple-200 data-[active=true]:bg-purple-600 data-[active=true]:text-white",
  compliance: "bg-amber-100 text-amber-700 border-amber-200 data-[active=true]:bg-amber-600 data-[active=true]:text-white",
  time: "bg-cyan-100 text-cyan-700 border-cyan-200 data-[active=true]:bg-cyan-600 data-[active=true]:text-white",
  payroll: "bg-green-100 text-green-700 border-green-200 data-[active=true]:bg-green-600 data-[active=true]:text-white",
  operations: "bg-orange-100 text-orange-700 border-orange-200 data-[active=true]:bg-orange-600 data-[active=true]:text-white",
  actions: "bg-red-100 text-red-700 border-red-200 data-[active=true]:bg-red-600 data-[active=true]:text-white",
  onboarding: "bg-teal-100 text-teal-700 border-teal-200 data-[active=true]:bg-teal-600 data-[active=true]:text-white",
};

export function HrSearchFilters({ filters, onChange, availableCategories }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleCategory = (cat: HrSearchCategory) => {
    const current = filters.categories ?? [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    onChange({ categories: next.length === 0 ? undefined : next });
  };

  const isActive = (cat: HrSearchCategory) =>
    !filters.categories || filters.categories.length === 0 || filters.categories.includes(cat);

  const visibleCats = HR_SEARCH_CATEGORY_ORDER.filter((c) => availableCategories.includes(c));

  return (
    <div className="space-y-3">
      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ categories: undefined })}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
            !filters.categories || filters.categories.length === 0
              ? "bg-primary text-primary-foreground border-transparent"
              : "bg-muted text-muted-foreground border-border hover:bg-accent"
          )}
        >
          All
        </button>
        {visibleCats.map((cat) => (
          <button
            key={cat}
            type="button"
            data-active={filters.categories?.includes(cat) ? "true" : "false"}
            onClick={() => toggleCategory(cat)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
              filters.categories?.includes(cat)
                ? CATEGORY_COLORS[cat].replace(/data-\[active=true\]:/g, "")
                : "bg-muted text-muted-foreground border-border hover:bg-accent"
            )}
          >
            {HR_SEARCH_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Advanced filters toggle */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1.5 text-muted-foreground"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        <Filter className="h-3.5 w-3.5" />
        Advanced Filters
        {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {showAdvanced && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg border">
          <div>
            <Label className="text-xs">Status</Label>
            <Input
              value={filters.status ?? ""}
              onChange={(e) => onChange({ status: e.target.value || undefined })}
              placeholder="e.g. active"
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Date From</Label>
            <Input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => onChange({ dateFrom: e.target.value || undefined })}
              className="h-8 text-xs mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Date To</Label>
            <Input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => onChange({ dateTo: e.target.value || undefined })}
              className="h-8 text-xs mt-1"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs w-full"
              onClick={() =>
                onChange({ status: undefined, dateFrom: undefined, dateTo: undefined, categories: undefined })
              }
            >
              Reset Filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
