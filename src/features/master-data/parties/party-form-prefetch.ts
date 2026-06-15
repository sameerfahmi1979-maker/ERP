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

export async function prefetchPartyFormData(queryClient: QueryClient): Promise<void> {
  const staleTime = 5 * 60 * 1000;

  const prefetchAll = [
    queryClient.prefetchQuery({ queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false), staleTime }),
    queryClient.prefetchQuery({ queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false), staleTime }),
    queryClient.prefetchQuery({ queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false), staleTime }),
    queryClient.prefetchQuery({ queryKey: queryKeys.taxTypes(false), queryFn: () => fetchTaxTypes(false), staleTime }),

    // Each queryFn must unwrap the ActionResult to match how the consuming component's queryFn reads the cache.
    queryClient.prefetchQuery({ queryKey: ["party_natures"], queryFn: async () => { const r = await getPartyNatures(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_statuses"], queryFn: async () => { const r = await getPartyStatuses(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_types"], queryFn: async () => { const r = await getPartyTypes(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_license_types"], queryFn: async () => { const r = await getPartyLicenseTypes(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_license_statuses"], queryFn: async () => { const r = await getPartyLicenseStatuses(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_tax_statuses"], queryFn: async () => { const r = await getPartyTaxStatuses(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_contact_roles"], queryFn: async () => { const r = await getPartyContactRoles(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_contact_departments"], queryFn: async () => { const r = await getPartyContactDepartments(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_address_types"], queryFn: async () => { const r = await getPartyAddressTypes(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_document_types"], queryFn: async () => { const r = await getPartyDocumentTypes(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_document_statuses"], queryFn: async () => { const r = await getPartyDocumentStatuses(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_payment_methods"], queryFn: async () => { const r = await getPaymentMethods(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["party_note_types"], queryFn: async () => { const r = await getPartyNoteTypes(); return r.data ?? []; }, staleTime }),
    queryClient.prefetchQuery({ queryKey: ["service_categories_for_select"], queryFn: async () => { const r = await getServiceCategoriesForSelect(); return r.data ?? []; }, staleTime }),
  ];

  await Promise.allSettled(prefetchAll);
}
