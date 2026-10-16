/**
 * Shared master-data fetch functions.
 * Phase 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard + Prefetch Utilities
 *
 * These are the SINGLE source of truth for the Supabase queries behind the
 * master-data TanStack hooks AND the prefetch utilities.  Extracting them
 * guarantees a prefetched cache entry has exactly the row shape the matching
 * hook expects — the two paths can never drift.
 *
 * Only the lists needed by parent-form prefetch declarations are extracted
 * here (countries, currencies, payment terms, tax types).  Other hooks keep
 * their inline queryFns until they are needed for prefetch.
 */

import { fetchConfigurationChoices } from "./configuration-fetchers";
import type {
  CountryRow,
  CurrencyRow,
  PaymentTermRow,
  TaxTypeRow,
} from "@/lib/lookups/option-mappers";

export async function fetchCountries(
  gccOnly = false,
  includeInactive = false,
  signal?: AbortSignal
): Promise<CountryRow[]> {
  return fetchConfigurationChoices<CountryRow>("countries", { filter: gccOnly, includeInactive }, signal);
}

export async function fetchCurrencies(includeInactive = false, signal?: AbortSignal): Promise<CurrencyRow[]> {
  return fetchConfigurationChoices<CurrencyRow>("currencies", { includeInactive }, signal);
}

export async function fetchPaymentTerms(includeInactive = false, signal?: AbortSignal): Promise<PaymentTermRow[]> {
  return fetchConfigurationChoices<PaymentTermRow>("paymentTerms", { includeInactive }, signal);
}

export async function fetchTaxTypes(includeInactive = false, signal?: AbortSignal): Promise<TaxTypeRow[]> {
  return fetchConfigurationChoices<TaxTypeRow>("taxTypes", { includeInactive }, signal);
}
