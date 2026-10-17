"use client";

/**
 * PartySelect — Reusable database-backed party combobox.
 * Phase ERP BASE 002F.5A.3
 *
 * Loads parties from the parties table, with optional filtering by:
 * - typeCode (single party type code, e.g. "CUSTOMER")
 * - typeCodes (multiple party type codes, e.g. ["GOVERNMENT_AUTHORITY", "LICENSE_ISSUER"])
 * - excludePartyId (exclude the current party, e.g. for parent_party_id)
 * - includeInactive (default false)
 */

import { useQuery } from "@tanstack/react-query";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { withSavedSelection, type SavedSelection } from "@/lib/master-data/saved-selection";
import { getPartySelectOptions } from "@/server/actions/master-data/parties";

export type PartySelectProps = {
  savedSelection?: SavedSelection;
  value: number | null;
  onValueChange: (value: number | null) => void;
  typeCode?: string | null;
  typeCodes?: string[] | null;
  excludePartyId?: number | null;
  includeInactive?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  showCode?: boolean;
  className?: string;
  error?: string;
};

export function PartySelect({
  value,
  savedSelection,
  onValueChange,
  typeCode,
  typeCodes,
  excludePartyId,
  includeInactive = false,
  placeholder = "Select party...",
  disabled = false,
  required = false,
  allowClear = false,
  showCode = false,
  className,
  error,
}: PartySelectProps) {
  const queryKey = ["party_select_options", typeCode ?? null, typeCodes ?? null, excludePartyId ?? null, includeInactive];

  const { data: options, isLoading, error: readError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getPartySelectOptions({
        typeCode: typeCode ?? null,
        typeCodes: typeCodes ?? null,
        excludePartyId: excludePartyId ?? null,
        includeInactive,
      });
      if (!result.success || !result.data) throw new Error("Party choices could not be loaded.");
      return (result.data ?? []).map((p): ERPComboboxOption => ({
        value: p.id,
        label: `${p.display_name}`,
        code: p.party_code,
        badge: p.primary_type_name ?? undefined,
        description: p.party_code,
      }));
    },
    staleTime: 2 * 60 * 1000,
    enabled: !disabled,
  });

  const handleChange = (val: string | number | null) => {
    onValueChange(val !== null ? Number(val) : null);
  };

  return (
    <ERPCombobox
      value={value}
      onValueChange={handleChange}
      options={withSavedSelection(readError ? [] : options ?? [], value, savedSelection)}
      placeholder={placeholder}
      searchPlaceholder="Search parties..."
      loading={isLoading}
      disabled={disabled || !!readError}
      required={required}
      allowClear={allowClear}
      showCode={showCode}
      className={className}
      error={readError ? "Party choices could not be loaded. Your saved selection is retained." : error}
      maxVisibleOptions={50}
    />
  );
}
