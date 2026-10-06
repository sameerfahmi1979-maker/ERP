"use client";

/**
 * BankSelect Component
 * Phase 002F.3E.3B.2C — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useBanksQuery (TanStack Query cache)
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { useBanksQuery } from "@/hooks/lookups";
import type { BankRow } from "@/lib/lookups/option-mappers";

interface BankSelectProps extends FinanceBasicsSelectProps {
  countryId?: number | null;
}

export function BankSelect({
  value,
  onValueChange,
  placeholder = "Select bank...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
  countryId,
}: BankSelectProps) {
  const choiceRead = useBanksQuery({ countryId, includeInactive , selectedId: value ?? null});
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

  // Search by bank_code, bank_name_en, bank_name_ar, short_name
  const customFilterFn = (option: ERPComboboxOption, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    const bank = option.raw as BankRow;
    return (
      (option.code?.toLowerCase().includes(q) ?? false) ||
      option.label.toLowerCase().includes(q) ||
      (option.labelAr ? option.labelAr.includes(query) : false) ||
      (bank.short_name ? bank.short_name.toLowerCase().includes(q) : false)
    );
  };

  return (
    <QueryReadBoundary queries={[choiceRead]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search banks..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No banks available"
      noResultsText="No results found"
      className={className}
      name={name}
      filterFn={customFilterFn}
    /></QueryReadBoundary>
  );
}
