"use client";

/**
 * ProfitCenterSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useProfitCentersQuery cached hook
 */

import type { ProfitCenterSelectProps } from "@/features/master-data/finance-basics/types";
import { withSavedSelection } from "@/lib/master-data/saved-selection";
import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useProfitCentersQuery } from "@/hooks/lookups";

export type { ProfitCenterSelectProps } from "@/features/master-data/finance-basics/types";

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
  choiceMode,
  parentScope,
  savedSelection,
  className,
  name,
  error,
}: ProfitCenterSelectProps) {
  const choiceRead = useProfitCentersQuery(choiceMode === "finance-parent" ? {
    choiceMode, parentScope, selectedId: value ?? null,
  } : {
    ownerCompanyId: ownerCompanyId ?? null,
    includeInactive, selectedId: value ?? null });
  const { options: allOptions, isLoading, error: fetchError } = choiceRead;

  const excluded = choiceMode === "finance-parent" ? parentScope.excludeId : excludeId;
  const retained = choiceMode === "finance-parent" ? withSavedSelection(allOptions, value, savedSelection) : allOptions;
  const options = choiceMode === "finance-parent"
    ? (excluded ? retained.filter((o) => String(o.value) !== String(excluded)) : retained)
    : (excludeId ? allOptions.filter((o) => o.value !== excludeId) : allOptions);

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
      searchPlaceholder="Search profit centers..."
      showCode={showCode}
      language={language}
      disabled={disabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={(isLoading) && value == null}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No profit centers available"
      noResultsText="No results found"
      className={className}
      name={name}
    /></QueryReadBoundary>
  );
}
