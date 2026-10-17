"use client";

/**
 * AreaZoneSelect Component
 * Phase 002F.3E.3B.2B — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6D — Migrated to useAreasQuery (TanStack Query cached hook)
 */

import type { AreaZoneSelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useAreasQuery } from "@/hooks/lookups";
import { withSavedSelection } from "@/lib/master-data/saved-selection";

export function AreaZoneSelect({
  value,
  savedSelection,
  onValueChange,
  cityId,
  areaTypeCode,
  placeholder = "Select area/zone...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: AreaZoneSelectProps) {
  const choiceRead = useAreasQuery({
    cityId: cityId ?? null,
    areaTypeCode: areaTypeCode ?? null,
    includeInactive, selectedId: value ?? null });
  const { options, isLoading, error: fetchError } = choiceRead;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange || disabled || !cityId || !!fetchError) return;
    if (newValue === null) {
      onValueChange(null);
      return;
    }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  const isDisabled = disabled || !cityId;
  const effectivePlaceholder = cityId ? placeholder : "Select city first...";
  const effectiveEmptyText = cityId ? "No areas/zones available" : "Select a city first";

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={(withSavedSelection(fetchError ? [] : options, value, savedSelection)).map(option => ({...option, disabled: option.disabled || disabled || !cityId || !!fetchError}))}
      placeholder={effectivePlaceholder}
      searchPlaceholder="Search areas/zones..."
      showCode={showCode}
      language={language}
      disabled={isDisabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={(isLoading) && value == null}
      error={fetchError ? "Areas could not be loaded. Your saved selection is retained." : error}
      allowClear={allowClear}
      emptyText={effectiveEmptyText}
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
