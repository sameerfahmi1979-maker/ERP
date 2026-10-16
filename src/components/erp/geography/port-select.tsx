"use client";

/**
 * PortSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + usePortsQuery cached hook
 */

import type { PortSelectProps } from "@/features/master-data/geography/types";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
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
  const choiceRead = usePortsQuery({
    emirateId: emirateId ?? null,
    portTypeCode: portTypeCode ?? null,
    includeInactive, selectedId: value ?? null });
  const { options, isLoading, error: fetchError } = choiceRead;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange || disabled || !!fetchError) return;
    if (newValue === null) {
      onValueChange(null);
      return;
    }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  return (
    <QueryReadBoundary queries={[{isError: !!fetchError, refetch: choiceRead.refetch}]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={(options).map(option => ({...option, disabled: option.disabled || disabled || !!fetchError}))}
      placeholder={placeholder}
      searchPlaceholder="Search ports..."
      showCode={showCode}
      language={language}
      disabled={disabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={(isLoading) && value == null}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No ports available"
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
