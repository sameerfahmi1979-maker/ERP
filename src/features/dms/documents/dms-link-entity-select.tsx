"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { searchDmsLinkEntityOptions } from "@/server/actions/dms/document-links";
import { getDmsLinkEntitySearchPlaceholder } from "@/lib/dms/search-link-entity-options";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";

type DmsLinkEntitySelectProps = {
  entityType: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Keeps the current selection visible when it is not in the loaded search results (edit mode). */
  pinnedOption?: { id: number; label: string; code?: string | null };
  /** Fires alongside onValueChange with the full option (HR.DOCLINK.1A: chips need the label). */
  onOptionSelected?: (option: { id: number; label: string } | null) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function DmsLinkEntitySelect({
  entityType,
  value,
  onValueChange,
  pinnedOption,
  onOptionSelected,
  disabled = false,
  required = false,
  className,
}: DmsLinkEntitySelectProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset the search when the entity type changes (state-during-render pattern,
  // avoids the setState-in-effect cascading render lint error)
  const [prevEntityType, setPrevEntityType] = useState(entityType);
  if (prevEntityType !== entityType) {
    setPrevEntityType(entityType);
    setSearchQuery("");
    setDebouncedSearch("");
  }

  const { data: options = [], isLoading, isError, error } = useQuery({
    queryKey: ["dms", "link-entity-options", entityType, debouncedSearch],
    queryFn: async () => {
      const result = await searchDmsLinkEntityOptions(entityType, debouncedSearch || undefined);
      if (!result.success) throw new Error(result.error ?? "Failed to load entities");
      return result.data ?? [];
    },
    enabled: !!entityType && !disabled,
    staleTime: 30_000,
  });

  const comboboxOptions: ERPComboboxOption[] = useMemo(() => {
    const mapped = options.map((opt) => ({
      value: opt.id,
      label: opt.label,
      code: opt.code,
      description: opt.description,
    }));

    if (
      pinnedOption &&
      value === pinnedOption.id &&
      !mapped.some((opt) => opt.value === pinnedOption.id)
    ) {
      return [
        {
          value: pinnedOption.id,
          label: pinnedOption.label,
          code: pinnedOption.code ?? null,
        },
        ...mapped,
      ];
    }

    return mapped;
  }, [options, pinnedOption, value]);

  const typeLabel = getDmsEntityTypeLabel(entityType);
  const showInitialLoading = isLoading && comboboxOptions.length === 0;

  return (
    <ERPCombobox
      value={value}
      onValueChange={(v) => {
        const id = v !== null ? Number(v) : null;
        onValueChange(id);
        if (onOptionSelected) {
          if (id === null) {
            onOptionSelected(null);
          } else {
            const opt = comboboxOptions.find((o) => Number(o.value) === id);
            onOptionSelected(opt ? { id, label: opt.label } : null);
          }
        }
      }}
      options={comboboxOptions}
      placeholder={`Select ${typeLabel.toLowerCase()}...`}
      searchPlaceholder={getDmsLinkEntitySearchPlaceholder(entityType)}
      showCode
      disabled={disabled}
      required={required}
      loading={showInitialLoading}
      error={isError ? (error instanceof Error ? error.message : "Failed to load entities") : undefined}
      allowClear
      className={className}
      triggerClassName="h-8 text-xs"
      emptyText={`No ${typeLabel.toLowerCase()} records found`}
      noResultsText={`No ${typeLabel.toLowerCase()} matches your search`}
      filterFn={() => true}
      onSearchQueryChange={setSearchQuery}
      maxVisibleOptions={50}
    />
  );
}
