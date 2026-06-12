"use client";

/**
 * PortSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + usePortsQuery cached hook
 */

import type { PortSelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { usePortsQuery } from "@/hooks/lookups";

export function PortSelect({
  value,
  onValueChange,
  emirateId,
  portTypeCode,
  placeholder = "Select port...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  error,
}: PortSelectProps) {
  const { options, isLoading, error: fetchError } = usePortsQuery({
    emirateId: emirateId ?? null,
    portTypeCode: portTypeCode ?? null,
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

  return (
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search ports..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={isLoading}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No ports available"
      noResultsText="No results found"
      className={className}
      name={name}
    />
  );
}
