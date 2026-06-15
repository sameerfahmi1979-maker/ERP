"use client";

/**
 * CostCenterSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useCostCentersQuery cached hook
 */

import type { FinanceBasicsSelectProps } from "@/features/master-data/finance-basics/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { useCostCentersQuery } from "@/hooks/lookups";

export interface CostCenterSelectProps extends FinanceBasicsSelectProps {
  ownerCompanyId?: number | null;
  excludeId?: number | null;
}

export function CostCenterSelect({
  value,
  onValueChange,
  placeholder = "Select cost center...",
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
}: CostCenterSelectProps) {
  const { options: allOptions, isLoading, error: fetchError } = useCostCentersQuery({
    ownerCompanyId: ownerCompanyId ?? null,
    includeInactive,
  });

  // Exclude specific entry (e.g. when editing a parent-child relation)
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
      searchPlaceholder="Search cost centers..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={isLoading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No cost centers available"
      noResultsText="No results found"
      className={className}
      name={name}
    />
  );
}
