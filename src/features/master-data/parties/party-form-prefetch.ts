/**
 * Party Master form runtime prefetch declaration.
 * Phase ERP BASE 002F.5A.3
 *
 * Prefetches all lookup data needed before the Party form drawer opens,
 * seeding TanStack Query cache for faster first-render.
 *
 * Usage:
 *   const qc = useQueryClient();
 *   // On "Add Party" or "Edit Party" click, before opening the drawer:
 *   await prefetchPartyFormData(qc);
 */

import type { QueryClient } from "@tanstack/react-query";
import { prefetchMasterDataQueries, type PrefetchMasterDataResult } from "@/lib/query/prefetch-lookups";
import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchCountries,
  fetchCurrencies,
  fetchPaymentTerms,
  fetchTaxTypes,
} from "@/lib/lookups/master-data-fetchers";
import {
  getPartyNatures,
  getPartyStatuses,
  getPartyTypes,
  getPartyLicenseTypes,
  getPartyLicenseStatuses,
  getPartyTaxStatuses,
  getPartyContactRoles,
  getPartyContactDepartments,
  getPartyAddressTypes,
  getPartyDocumentTypes,
  getPartyDocumentStatuses,
  getPaymentMethods,
} from "@/server/actions/master-data/parties";
import { getPartyNoteTypes } from "@/server/actions/master-data/party-notes";
import { getServiceCategoriesForSelect } from "@/server/actions/master-data/party-service-categories";

/** Never turn a denied/failed legacy action into a successful empty cache entry. */
async function actionChoices<T>(action: () => Promise<{success: boolean; data?: T[]; error?: string}>, signal?: AbortSignal): Promise<T[]> {
  signal?.throwIfAborted();
  const result = await action();
  signal?.throwIfAborted();
  if (!result.success || !Array.isArray(result.data)) throw new Error("Party choices could not be loaded. Please retry.");
  return result.data;
}
export async function prefetchPartyFormData(queryClient: QueryClient): Promise<PrefetchMasterDataResult> {
  const staleTime = 5 * 60 * 1000;

  return prefetchMasterDataQueries(queryClient, [
    { queryKey: queryKeys.countries(false, false), queryFn: (signal) => fetchCountries(false, false, signal), staleTime },
    { queryKey: queryKeys.currencies(false), queryFn: (signal) => fetchCurrencies(false, signal), staleTime },
    { queryKey: queryKeys.paymentTerms(false), queryFn: (signal) => fetchPaymentTerms(false, signal), staleTime },
    { queryKey: queryKeys.taxTypes(false), queryFn: (signal) => fetchTaxTypes(false, signal), staleTime },

    // Each queryFn must unwrap the ActionResult to match how the consuming component's queryFn reads the cache.
    { queryKey: ["party_natures"], queryFn: (signal) => actionChoices(getPartyNatures, signal), staleTime },
    { queryKey: ["party_statuses"], queryFn: (signal) => actionChoices(getPartyStatuses, signal), staleTime },
    { queryKey: ["party_types"], queryFn: (signal) => actionChoices(getPartyTypes, signal), staleTime },
    { queryKey: ["party_license_types"], queryFn: (signal) => actionChoices(getPartyLicenseTypes, signal), staleTime },
    { queryKey: ["party_license_statuses"], queryFn: (signal) => actionChoices(getPartyLicenseStatuses, signal), staleTime },
    { queryKey: ["party_tax_statuses"], queryFn: (signal) => actionChoices(getPartyTaxStatuses, signal), staleTime },
    { queryKey: ["party_contact_roles"], queryFn: (signal) => actionChoices(getPartyContactRoles, signal), staleTime },
    { queryKey: ["party_contact_departments"], queryFn: (signal) => actionChoices(getPartyContactDepartments, signal), staleTime },
    { queryKey: ["party_address_types"], queryFn: (signal) => actionChoices(getPartyAddressTypes, signal), staleTime },
    { queryKey: ["party_document_types"], queryFn: (signal) => actionChoices(getPartyDocumentTypes, signal), staleTime },
    { queryKey: ["party_document_statuses"], queryFn: (signal) => actionChoices(getPartyDocumentStatuses, signal), staleTime },
    { queryKey: ["party_payment_methods"], queryFn: (signal) => actionChoices(getPaymentMethods, signal), staleTime },
    { queryKey: ["party_note_types"], queryFn: (signal) => actionChoices(getPartyNoteTypes, signal), staleTime },
    { queryKey: ["service_categories_for_select"], queryFn: (signal) => actionChoices(getServiceCategoriesForSelect, signal), staleTime },
  ]);
}
