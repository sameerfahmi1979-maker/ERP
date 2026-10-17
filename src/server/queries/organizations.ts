import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { OwnerCompany, OwnerCompanyWithGeography } from "@/types/domain";

/**
 * List all owner companies (organizations)
 * RLS-protected query with geography relationships (Phase 002F.3C.1B.1 & 002F.3C.4B)
 */
export async function listOrganizations(): Promise<OwnerCompanyWithGeography[]> {
  try {
    const supabase = await createClient();
    const rows: OwnerCompanyWithGeography[] = [];
    // Existing F06 catalogue compatibility, not a competing shared read/cache
    // adapter. Continue to an empty page, including under a lower Data API cap.
    for (let cursor = 0; ;) {
      const { data, error } = await supabase
        .from("owner_companies")
        .select(`
          *,
          country_rel:countries(id, name_en, name_ar, country_code),
          emirate_rel:emirates!emirate_id(id, name_en, name_ar),
          city_rel:cities!city_id(id, name_en, name_ar),
          area_zone_rel:areas_zones(id, name_en, name_ar)
        `)
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(200);

      if (error || !Array.isArray(data) || data.length > 200) throw new Error("List read failed");
      if (data.length === 0) return rows;
      for (const row of data) {
        if (!row || !Number.isSafeInteger(row.id) || row.id <= cursor) throw new Error("Invalid list order");
        cursor = row.id;
        rows.push(row as OwnerCompanyWithGeography);
      }
    }
  } catch {
    logger.error("listOrganizations failed");
    throw new Error("Organizations could not be loaded. Try again.");
  }
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
