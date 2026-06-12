"use client";

/**
 * ProfitCenterSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useProfitCentersQuery cached hook
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { useProfitCentersQuery } from "@/hooks/lookups";

export interface ProfitCenterSelectProps extends FinanceBasicsSelectProps {
  ownerCompanyId?: number | null;
  excludeId?: number | null;
}

export function ProfitCenterSelect({
  value,
  onValueChange,
  placeholder = "Select profit center...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  ownerCompanyId,
  excludeId,
  className,
  name,
  error,
}: ProfitCenterSelectProps) {
  const { options: allOptions, isLoading, error: fetchError } = useProfitCentersQuery({
    ownerCompanyId: ownerCompanyId ?? null,
    includeInactive,
  });

  const options = excludeId
    ? allOptions.filter((o) => o.value !== excludeId)
    : allOptions;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange) return;
    if (newValue === null) {
      onValueChange(null);
      return;
    }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  return (
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search profit centers..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={isLoading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No profit centers available"
      noResultsText="No results found"
      className={className}
      name={name}
    />
  );
}
