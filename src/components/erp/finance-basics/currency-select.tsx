"use client";

/**
 * CurrencySelect Component
 * Phase 002F.3E.3B.2C — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useCurrenciesQuery (TanStack Query cache)
 *
 * 162-row list now cached for the session.
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { useCurrenciesQuery } from "@/hooks/lookups";
import type { CurrencyRow } from "@/lib/lookups/option-mappers";

export function CurrencySelect({
  value,
  onValueChange,
  placeholder = "Select currency...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  ariaLabel = "Currency",
  error,
}: FinanceBasicsSelectProps) {
  const choiceRead = useCurrenciesQuery({ includeInactive , selectedId: value ?? null});
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
    const currency = option.raw as CurrencyRow;
    const label = language === "ar" && option.labelAr ? option.labelAr : option.label;
    const code = showCode ? `${option.code} - ` : "";
    const symbol = currency.symbol ? ` (${currency.symbol})` : "";
    return <span>{code}{label}{symbol}</span>;
  };

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      ariaLabel={ariaLabel}
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search currencies..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No currencies available"
      noResultsText="No results found"
      className={className}
      name={name}
      renderOption={renderOption}
    /></QueryReadBoundary>
  );
}
