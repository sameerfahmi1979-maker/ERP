"use client";

/**
 * OwnerCompanySelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useOwnerCompaniesQuery cached hook
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { useOwnerCompaniesQuery } from "@/hooks/lookups";

interface OwnerCompanySelectProps {
  value: number | null;
  onValueChange?: (value: number | null) => void;
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

export function OwnerCompanySelect({
  value,
  onValueChange,
  placeholder = "Select company...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: OwnerCompanySelectProps) {
  const { options, isLoading, error: fetchError } = useOwnerCompaniesQuery({ includeInactive });

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
      searchPlaceholder="Search companies..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={isLoading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No companies available"
      noResultsText="No results found"
      className={className}
      name={name}
    />
  );
}
