/**
 * Resolve country / emirate / city IDs from OCR or AI text hints.
 */

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ResolvedGeography = {
  issue_country_id: number | null;
  issuing_emirate_id: number | null;
  issue_city_id: number | null;
};

const UAE_ALIASES = ["uae", "u.a.e", "united arab emirates", "emirates"];

function normalizePlace(val: string | null | undefined): string | null {
  const t = val?.trim();
  return t || null;
}

function isUaeHint(val: string): boolean {
  return UAE_ALIASES.some((a) => val.toLowerCase().includes(a));
}

export async function resolveGeographyFromPlaceNames(
  db: AdminClient,
  params: {
    countryName?: string | null;
    emirateName?: string | null;
    cityName?: string | null;
    placeOfIssue?: string | null;
  }
): Promise<ResolvedGeography> {
  const result: ResolvedGeography = {
    issue_country_id: null,
    issuing_emirate_id: null,
    issue_city_id: null,
  };

  const countryHint = normalizePlace(params.countryName);
  const emirateHint = normalizePlace(params.emirateName);
  const cityHint = normalizePlace(params.cityName);
  const placeHint = normalizePlace(params.placeOfIssue);

  if (countryHint) {
    if (isUaeHint(countryHint)) {
      const { data: uae } = await db
        .from("countries")
        .select("id")
        .ilike("name_en", "%United Arab Emirates%")
        .limit(1)
        .maybeSingle();
      if (uae) result.issue_country_id = uae.id as number;
    } else {
      const { data: country } = await db
        .from("countries")
        .select("id")
        .or(`name_en.ilike.%${countryHint}%,iso2.ilike.${countryHint.slice(0, 3)}%`)
        .limit(1)
        .maybeSingle();
      if (country) result.issue_country_id = country.id as number;
    }
  }

  const emirateSearch = emirateHint ?? placeHint;
  if (emirateSearch) {
    let emirateQuery = db
      .from("emirates")
      .select("id, country_id, name_en")
      .ilike("name_en", `%${emirateSearch}%`)
      .limit(5);

    if (result.issue_country_id) {
      emirateQuery = emirateQuery.eq("country_id", result.issue_country_id);
    }

    const { data: emirates } = await emirateQuery;
    const exact = (emirates ?? []).find(
      (e) => (e.name_en as string).toLowerCase() === emirateSearch.toLowerCase()
    );
    const emirate = exact ?? emirates?.[0];
    if (emirate) {
      result.issuing_emirate_id = emirate.id as number;
      if (!result.issue_country_id) result.issue_country_id = emirate.country_id as number;
    }
  }

  const citySearch = cityHint ?? (placeHint && !result.issuing_emirate_id ? placeHint : null);
  if (citySearch) {
    let cityQuery = db
      .from("cities")
      .select("id, name_en, emirate_id, emirates(country_id)")
      .ilike("name_en", `%${citySearch}%`)
      .limit(5);

    if (result.issuing_emirate_id) {
      cityQuery = cityQuery.eq("emirate_id", result.issuing_emirate_id);
    }

    const { data: cities } = await cityQuery;
    type CityRow = { id: number; name_en: string; emirate_id: number; emirates: { country_id: number } | { country_id: number }[] | null };
    const exactCity = (cities as CityRow[] | null ?? []).find(
      (c) => c.name_en.toLowerCase() === citySearch.toLowerCase()
    );
    const city = exactCity ?? (cities as CityRow[] | null)?.[0];
    if (city) {
      result.issue_city_id = city.id;
      if (!result.issuing_emirate_id) result.issuing_emirate_id = city.emirate_id;
      const emirateRel = city.emirates;
      const emirateCountry = Array.isArray(emirateRel) ? emirateRel[0]?.country_id : emirateRel?.country_id;
      if (!result.issue_country_id && emirateCountry) {
        result.issue_country_id = emirateCountry;
      }
    }
  }

  return result;
}

/** Resolve countries.id from nationality text (for dependent prefill). */
export async function resolveNationalityIdFromName(
  db: AdminClient,
  nationalityName?: string | null
): Promise<number | null> {
  const hint = normalizePlace(nationalityName);
  if (!hint) return null;

  if (isUaeHint(hint)) {
    const { data: uae } = await db
      .from("countries")
      .select("id")
      .ilike("name_en", "%United Arab Emirates%")
      .limit(1)
      .maybeSingle();
    return uae ? (uae.id as number) : null;
  }

  const { data: country } = await db
    .from("countries")
    .select("id")
    .or(`name_en.ilike.%${hint}%,name_ar.ilike.%${hint}%,iso2.ilike.${hint.slice(0, 2)}%`)
    .limit(1)
    .maybeSingle();

  return country ? (country.id as number) : null;
}
