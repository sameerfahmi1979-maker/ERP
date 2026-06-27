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
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function DmsLinkEntitySelect({
  entityType,
  value,
  onValueChange,
  pinnedOption,
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

  useEffect(() => {
    setSearchQuery("");
    setDebouncedSearch("");
  }, [entityType]);

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
      onValueChange={(v) => onValueChange(v !== null ? Number(v) : null)}
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
