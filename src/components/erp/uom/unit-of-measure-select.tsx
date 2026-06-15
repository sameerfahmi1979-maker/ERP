"use client";

/**
 * UnitOfMeasureSelect Component
 * Phase 002F.3E.3B.6D — Converted to ERPCombobox + useUnitsOfMeasureQuery cached hook
 *
 * showSymbol: when true, appends the symbol in parentheses to each option label
 * (e.g. "Kilogram (kg)").  This is handled by rebuilding options from raw data
 * so the hook cache remains symbol-neutral.
 */

import { useMemo } from "react";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { useUnitsOfMeasureQuery } from "@/hooks/lookups";

interface UnitOfMeasureSelectProps {
  value: number | null;
  onValueChange?: (value: number | null) => void;
  categoryId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: "en" | "ar";
  showCode?: boolean;
  showSymbol?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export function UnitOfMeasureSelect({
  value,
  onValueChange,
  categoryId,
  placeholder = "Select unit...",
  disabled = false,
  required = false,
  includeInactive = false,
  language = "en",
  showCode = false,
  showSymbol = true,
  allowClear = false,
  className,
  name,
  error,
}: UnitOfMeasureSelectProps) {
  const { data, options: baseOptions, isLoading, error: fetchError } = useUnitsOfMeasureQuery({
    categoryId: categoryId ?? null,
    includeInactive,
  });

  // When showSymbol is true, rebuild options with symbol appended to label
  const options = useMemo<ERPComboboxOption[]>(() => {
    if (!showSymbol) return baseOptions;
    return data.map((unit) => {
      const name =
        language === "ar" && unit.unit_name_ar ? unit.unit_name_ar : unit.unit_name_en;
      const label = unit.symbol ? `${name} (${unit.symbol})` : name;
      return {
        value: unit.id,
        label,
        labelAr: unit.unit_name_ar,
        code: unit.unit_code,
        description: unit.symbol,
        raw: unit,
      };
    });
  }, [data, baseOptions, showSymbol, language]);

  const handleValueChange = (newValue: string | number | null) => {
    if (!onValueChange) return;
    if (newValue === null) {
      onValueChange(null);
      return;
    }
    const numValue = typeof newValue === "number" ? newValue : Number(newValue);
    onValueChange(!isNaN(numValue) ? numValue : null);
  };

  const isDisabled = disabled || (!categoryId && options.length === 0);
  const effectivePlaceholder = categoryId !== undefined && categoryId !== null
    ? placeholder
    : "Select category first";
  const effectiveEmptyText = categoryId !== undefined && categoryId !== null
    ? "No units found"
    : "Select a category first";

  return (
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={effectivePlaceholder}
      searchPlaceholder="Search units..."
      showCode={showCode}
      language={language}
      disabled={isDisabled}
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
