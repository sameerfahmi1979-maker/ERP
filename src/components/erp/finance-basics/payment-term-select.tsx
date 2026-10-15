"use client";

/**
 * PaymentTermSelect Component
 * Phase 002F.3E.3B.2C — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to usePaymentTermsQuery (TanStack Query cache)
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { usePaymentTermsQuery } from "@/hooks/lookups";

export function PaymentTermSelect({
  value,
  onValueChange,
  placeholder = "Select payment term...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  ariaLabel = "Payment term",
  error,
}: FinanceBasicsSelectProps) {
  const choiceRead = usePaymentTermsQuery({ includeInactive , selectedId: value ?? null});
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
      ariaLabel={ariaLabel}
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search payment terms..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No payment terms available"
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
