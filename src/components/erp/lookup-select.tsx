"use client";

/**
 * LookupSelect Component
 * Phase 002F.3E.3B.2A — Refactored to use ERPCombobox base
 * Phase 002F.3E.3B.6B — Migrated to useLookupValuesQuery (TanStack Query cache)
 *
 * Reusable dropdown component for selecting lookup values.
 * Multiple instances with the same categoryCode now share ONE cached fetch.
 */

import { useLookupValuesQuery } from "@/hooks/lookups";
import type { LookupSelectProps } from "@/features/master-data/lookups/types";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { Badge } from "@/components/ui/badge";
import type { LookupValue } from "@/features/master-data/lookups/types";

export function LookupSelect({
  categoryCode,
  value,
  onValueChange,
  placeholder = "Select...",
  disabled = false,
  required = false,
  includeInactive = false,
  parentValueCode,
  language = "en",
  showCode = false,
  showColor = true,
  allowClear = false,
  valueField = "id",
  className,
  name,
  error,
}: LookupSelectProps) {
  const {
    data: values,
    isLoading: loading,
    error: fetchError,
  } = useLookupValuesQuery(categoryCode, {
    parentValueCode,
    includeInactive,
    enabled: !!categoryCode,
  });

  // Map lookup values to ERPComboboxOption[]
  const options: ERPComboboxOption[] = values.map((item) => ({
    value: valueField === "code" ? item.value_code : item.id,
    label: item.value_label_en,
    labelAr: item.value_label_ar,
    code: item.value_code,
    colorHex: item.color_hex,
    badge: item.badge_variant,
    raw: item,
  }));

  const handleValueChange = (newValue: string | number | null) => {
    if (newValue === null) {
      onValueChange?.(null);
      return;
    }
    if (onValueChange) {
      if (valueField === "id") {
        const numValue = typeof newValue === "number" ? newValue : Number(newValue);
        onValueChange(!isNaN(numValue) ? numValue : newValue);
      } else {
        onValueChange(String(newValue));
      }
    }
  };

  const renderOption = (option: ERPComboboxOption) => {
    const val = option.raw as LookupValue;
    const label =
      language === "ar" && option.labelAr ? option.labelAr : option.label;
    const displayLabel =
      showCode && option.code ? `${option.code} - ${label}` : label;

    return (
      <div className="flex items-center gap-2 flex-1">
        {showColor && option.colorHex && (
          <span
            className="inline-block w-3 h-3 rounded-full border shrink-0"
            style={{ backgroundColor: option.colorHex }}
          />
        )}
        {option.badge ? (
          <Badge
            variant={
              (option.badge as
                | "default"
                | "secondary"
                | "outline"
                | "destructive"
                | "ghost"
                | "link") || "default"
            }
            className="text-xs"
          >
            {displayLabel}
          </Badge>
        ) : (
          <span className="truncate">{displayLabel}</span>
        )}
        {val?.is_default && (
          <Badge variant="outline" className="text-xs ml-auto shrink-0">
            Default
          </Badge>
        )}
      </div>
    );
  };

  if (fetchError) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-10 px-3 border border-destructive rounded-md bg-destructive/10">
          <span className="text-sm text-destructive">{fetchError}</span>
        </div>
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <ERPCombobox
      value={value ?? null}
      onValueChange={handleValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search..."
      showCode={showCode}
      language={language}
      disabled={disabled}
      readOnly={false}
      required={required}
      loading={loading}
      error={error}
      allowClear={allowClear}
      emptyText="No options available"
      noResultsText="No results found"
      className={className}
      name={name}
      renderOption={renderOption}
    />
  );
}
