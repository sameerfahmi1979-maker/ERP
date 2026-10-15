"use client";

/**
 * EmirateSelect Component
 * Phase 002F.3E.3B.2B — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useEmiratesQuery (TanStack Query cache)
 *
 * NOTE: This component reads from the emirates table, which now represents
 * administrative regions globally (Emirates, Governorates, States, Provinces, Regions).
 * The table name remains "emirates" for backward compatibility.
 */

import type { EmirateSelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useEmiratesQuery } from "@/hooks/lookups";

export function EmirateSelect({
  value,
  onValueChange,
  countryId,
  placeholder = "Select region / emirate / governorate...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: EmirateSelectProps) {
  const choiceRead = useEmiratesQuery({ countryId, includeInactive, selectedId: value ?? null });
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
      searchPlaceholder="Search regions..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText={countryId ? "No regions found for selected country" : "No regions available"}
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
