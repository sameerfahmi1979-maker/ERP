"use client";

/**
 * UomCategorySelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useUomCategoriesQuery cached hook
 */

import { ERPCombobox } from "@/components/erp/combobox";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useUomCategoriesQuery } from "@/hooks/lookups";

interface UomCategorySelectProps {
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
  ariaLabel?: string;
  error?: string;
}

export function UomCategorySelect({
  value,
  onValueChange,
  placeholder = "Select category...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  allowClear = false,
  className,
  name,
  ariaLabel = "Category",
  error,
}: UomCategorySelectProps) {
  const choiceRead = useUomCategoriesQuery({ includeInactive, selectedId: value ?? null });
  const { options, isLoading, error: fetchError } = choiceRead;

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange || disabled || !!fetchError) return;
    if (newValue === null) {
      onValueChange(null);
      return;
    }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    // A retained historical label is display context, not permission to select it.
    if (!Number.isFinite(numValue) || !options.some(option => String(option.value) === String(numValue) && !option.disabled)) return;
    onValueChange(numValue);
  };

  return (
    <QueryReadBoundary queries={[{isError: !!fetchError, refetch: choiceRead.refetch}]}><ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options.map(option => ({...option, disabled: option.disabled || disabled || !!fetchError}))}
      placeholder={value != null && !options.some(option => String(option.value) === String(value))
        ? (isLoading ? "Loading saved selection…" : "Saved selection unavailable; value retained") : placeholder}
      searchPlaceholder="Search categories..."
      showCode={showCode}
      language={language}
      disabled={disabled || !!fetchError}
      readOnly={false}
      required={required}
      loading={isLoading && value == null}
      error={fetchError ?? error}
      allowClear={allowClear}
      emptyText="No categories found"
      noResultsText="No results found"
      className={className}
      name={name}
      ariaLabel={ariaLabel}
    /></QueryReadBoundary>
  );
}
