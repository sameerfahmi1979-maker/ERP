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

import { createClient } from "@/lib/supabase/client";
import type {
  CountryRow,
  CurrencyRow,
  PaymentTermRow,
  TaxTypeRow,
} from "@/lib/lookups/option-mappers";

export async function fetchCountries(
  gccOnly = false,
  includeInactive = false
): Promise<CountryRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("countries")
    .select("id, country_code, name_en, name_ar, is_gcc")
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);
  if (gccOnly) query = query.eq("is_gcc", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CountryRow[];
}

export async function fetchCurrencies(
  includeInactive = false
): Promise<CurrencyRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("currencies")
    .select("id, currency_code, currency_name_en, currency_name_ar, symbol, is_base_currency")
    .order("sort_order", { ascending: true })
    .order("currency_name_en", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CurrencyRow[];
}

export async function fetchPaymentTerms(
  includeInactive = false
): Promise<PaymentTermRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("payment_terms")
    .select("id, term_code, term_name_en, term_name_ar, due_days")
    .order("sort_order", { ascending: true })
    .order("term_name_en", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentTermRow[];
}

export async function fetchTaxTypes(
  includeInactive = false
): Promise<TaxTypeRow[]> {
  const supabase = createClient();
  let query = supabase
    .from("tax_types")
    .select("id, tax_code, tax_name_en, tax_name_ar, tax_rate")
    .order("sort_order", { ascending: true })
    .order("tax_name_en", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as TaxTypeRow[];
}
