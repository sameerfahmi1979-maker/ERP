"use client";

/**
 * CitySelect Component
 * Phase 002F.3E.3B.2B — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useCitiesQuery (TanStack Query cache)
 */

import type { CitySelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useCitiesQuery } from "@/hooks/lookups";

export function CitySelect({
  value,
  onValueChange,
  emirateId,
  placeholder = "Select city...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: CitySelectProps) {
  const choiceRead = useCitiesQuery({ emirateId, includeInactive, selectedId: value ?? null });
  const {
    options,
    isLoading: loading,
    error: fetchError,
  } = choiceRead;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange) return;
    if (newValue === null) { onValueChange(null); return; }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search cities..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No cities available"
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
