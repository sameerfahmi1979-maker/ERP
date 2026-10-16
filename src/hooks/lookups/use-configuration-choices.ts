"use client";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { fetchConfigurationChoices, type ConfigurationParams, type ConfigurationResource } from "@/lib/lookups/configuration-fetchers";
import { ReadError, retryAuthorizedRead } from "@/lib/reads/client";

/** One cache owner for active choices; a permitted legacy selection is scoped separately. */
export function useConfigurationChoices<T extends { id: number }>(resource: ConfigurationResource, queryKey: QueryKey, params: ConfigurationParams, mapOption: (row: T) => ERPComboboxOption, enabled = true) {
  const active = useQuery({ queryKey, enabled, retry: retryAuthorizedRead,
    queryFn: ({ signal }) => fetchConfigurationChoices<T>(resource, { ...params, selectedId: undefined }, signal),
  });
  const selectedId = params.selectedId;
  const missing = selectedId != null && !(active.data ?? []).some(row => row.id === selectedId);
  const selected = useQuery({ queryKey: [...queryKey, "selected", selectedId ?? null], enabled: enabled && active.isSuccess && missing, retry: retryAuthorizedRead,
    queryFn: ({ signal }) => fetchConfigurationChoices<T>(resource, { ...params, selectedId }, signal),
  });
  const denied = (active.error instanceof ReadError && [401, 403].includes(active.error.status)) || (missing && selected.error instanceof ReadError && [401, 403].includes(selected.error.status));
  const activeRows = denied ? [] : active.data ?? [];
  const historicalRows = denied || !missing ? [] : selected.data ?? [];
  const data = [...activeRows, ...historicalRows];
  // Reading an exact retained row establishes display context, never eligibility.
  // Only membership in the ordinary catalogue can make it a selectable choice.
  const options = [...activeRows.map(mapOption), ...historicalRows.map(row => ({...mapOption(row), disabled: true}))];
  const error = active.error ?? (missing ? selected.error : null);
  return { data, options, isLoading: active.isLoading || (missing && selected.isLoading), isFetching: active.isFetching || (missing && selected.isFetching), isError: active.isError || (missing && selected.isError), error: error ? "Choices could not be completely loaded. Please retry." : null,
    refetch: async () => {
      if (!enabled) return;
      // A canceled refetch may resolve: register both reads before yielding so
      // no post-await continuation can dispatch into a retired query cache.
      const pending = [active.refetch()];
      if (missing) pending.push(selected.refetch());
      await Promise.all(pending);
    },
  };
}
