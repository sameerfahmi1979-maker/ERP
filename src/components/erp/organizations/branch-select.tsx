"use client";

/**
 * BranchSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useBranchesQuery cached hook
 */

import { ERPCombobox, type ERPComboboxOption } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
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
  /** Optional already-authorized domain catalogue; existing shared lookup remains the default. */
  authorizedOptions?: ERPComboboxOption[];
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
  authorizedOptions,
}: BranchSelectProps) {
  const choiceRead = useBranchesQuery({
    ownerCompanyId: ownerCompanyId ?? null,
    includeInactive,
    enabled: authorizedOptions === undefined, selectedId: value ?? null });
  const { options, isLoading } = choiceRead;
  const fetchError = authorizedOptions === undefined ? choiceRead.error : null;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange || disabled || !!fetchError) return;
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
    <QueryReadBoundary queries={authorizedOptions === undefined ? [{isError: !!fetchError, refetch: choiceRead.refetch}] : []}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={(authorizedOptions ?? options).map(option => ({...option, disabled: option.disabled || disabled || !!fetchError}))}
      placeholder={effectivePlaceholder}
      searchPlaceholder="Search branches..."
      showCode={showCode}
      language={language}
      disabled={disabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={(authorizedOptions === undefined && isLoading) && value == null}
      error={authorizedOptions === undefined ? fetchError ?? error : error}
      allowClear={allowClear}
      emptyText={effectiveEmptyText}
      noResultsText="No results found"
      className={className}
      name={name}
      ariaLabel="Branch"
    /></QueryReadBoundary>
  );
}
