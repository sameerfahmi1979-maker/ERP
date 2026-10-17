"use client";

/**
 * CountrySelect Component
 * Phase 002F.3E.3B.2B — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useCountriesQuery (TanStack Query cache)
 *
 * 250-row list now cached for the session — opening Customer + Branch + Org
 * forms in the same session fetches countries only ONCE.
 */

import type { CountrySelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useCountriesQuery } from "@/hooks/lookups";
import { withSavedSelection } from "@/lib/master-data/saved-selection";

export function CountrySelect({
  value,
  savedSelection,
  onValueChange,
  placeholder = "Select country...",
  disabled = false,
  required = false,
  gccOnly = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: CountrySelectProps) {
  const choiceRead = useCountriesQuery({ gccOnly, includeInactive, selectedId: value ?? null });
  const {
    options,
    isLoading: loading,
    error: fetchError,
  } = choiceRead;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange || disabled || !!fetchError) return;
    if (newValue === null) { onValueChange(null); return; }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={(withSavedSelection(fetchError ? [] : options, value, savedSelection)).map(option => ({...option, disabled: option.disabled || disabled || !!fetchError}))}
      placeholder={placeholder}
      searchPlaceholder="Search countries..."
      showCode={showCode}
      language={language}
      disabled={disabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={(loading) && value == null}
      error={fetchError ? "Countries could not be loaded. Your saved selection is retained." : error}
      allowClear={allowClear}
      emptyText="No countries available"
      noResultsText="No results found"
      className={className}
      name={name}
      ariaLabel={name === "nationality_id" ? "Nationality" : "Country"}
    /></QueryReadBoundary>
  );
}
