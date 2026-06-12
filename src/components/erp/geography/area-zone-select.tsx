"use client";

/**
 * AreaZoneSelect Component
 * Phase 002F.3E.3B.2B — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6D — Migrated to useAreasQuery (TanStack Query cached hook)
 */

import type { AreaZoneSelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { useAreasQuery } from "@/hooks/lookups";

export function AreaZoneSelect({
  value,
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
  const { options, isLoading, error: fetchError } = useAreasQuery({
    cityId: cityId ?? null,
    areaTypeCode: areaTypeCode ?? null,
    includeInactive,
  });

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange) return;
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
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={effectivePlaceholder}
      searchPlaceholder="Search areas/zones..."
      showCode={showCode}
      language={language}
      disabled={isDisabled}
      readOnly={false}
      required={required}
      loading={isLoading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText={effectiveEmptyText}
      noResultsText="No results found"
      className={className}
      name={name}
    />
  );
}
