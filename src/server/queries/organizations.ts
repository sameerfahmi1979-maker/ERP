import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { OwnerCompany } from "@/types/database";

/**
 * List all owner companies (organizations)
 * RLS-protected query with geography relationships (Phase 002F.3C.1B.1 & 002F.3C.4B)
 */
export async function listOrganizations(): Promise<OwnerCompany[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("owner_companies")
    .select(`
      *,
      country_rel:countries(id, name_en, name_ar, country_code),
      emirate_rel:emirates!emirate_id(id, name_en, name_ar),
      city_rel:cities!city_id(id, name_en, name_ar),
      area_zone_rel:areas_zones(id, name_en, name_ar)
    `)
    .order("id", { ascending: true });

  if (error) {
    logger.error("listOrganizations error", error.message);
    return [];
  }

  return (data ?? []) as OwnerCompany[];
}

/**
 * Get a single organization by ID
 * RLS-protected query
 */
export async function getOrganizationById(id: number): Promise<OwnerCompany | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("owner_companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    logger.error("getOrganizationById error", error.message);
    return null;
  }

  return data as OwnerCompany;
}
