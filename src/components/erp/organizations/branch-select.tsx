"use client";

/**
 * BranchSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useBranchesQuery cached hook
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { useBranchesQuery } from "@/hooks/lookups";

interface BranchSelectProps {
  value: number | null;
  onValueChange?: (value: number | null) => void;
  ownerCompanyId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: "en" | "ar";
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export function BranchSelect({
  value,
  onValueChange,
  ownerCompanyId = null,
  placeholder = "Select branch...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: BranchSelectProps) {
  const { options, isLoading, error: fetchError } = useBranchesQuery({
    ownerCompanyId: ownerCompanyId ?? null,
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

  const effectivePlaceholder = ownerCompanyId ? placeholder : "Select company first";
  const effectiveEmptyText = ownerCompanyId ? "No branches available" : "Select a company first";

  return (
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={effectivePlaceholder}
      searchPlaceholder="Search branches..."
      showCode={showCode}
      language={language}
      disabled={disabled}
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
