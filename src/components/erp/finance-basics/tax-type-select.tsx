"use client";

/**
 * TaxTypeSelect Component
 * Phase 002F.3E.3B.2C — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useTaxTypesQuery (TanStack Query cache)
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { useTaxTypesQuery } from "@/hooks/lookups";
import type { TaxTypeRow } from "@/lib/lookups/option-mappers";

export function TaxTypeSelect({
  value,
  onValueChange,
  placeholder = "Select tax type...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  ariaLabel = "Tax type",
  error,
}: FinanceBasicsSelectProps) {
  const choiceRead = useTaxTypesQuery({ includeInactive , selectedId: value ?? null});
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

  const renderOption = (option: ERPComboboxOption) => {
    const taxType = option.raw as TaxTypeRow;
    const label = language === "ar" && option.labelAr ? option.labelAr : option.label;
    const rate = ` (${taxType.tax_rate}%)`;
    return (
      <span>
        {showCode ? `${option.code} - ` : ""}
        {label}{rate}
      </span>
    );
  };

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      ariaLabel={ariaLabel}
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search tax types..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No tax types available"
      noResultsText="No results found"
      className={className}
      name={name}
      renderOption={renderOption}
    /></QueryReadBoundary>
  );
}
