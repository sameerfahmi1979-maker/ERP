/**
 * Resolve issuing authority party ID from OCR / AI text.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { ISSUING_AUTHORITY_PARTY_TYPE_CODES } from "@/lib/hr/compliance/identity-document-form";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function resolveIssuingAuthorityPartyId(
  db: AdminClient,
  authorityName: string | null | undefined
): Promise<number | null> {
  const name = authorityName?.trim();
  if (!name || name.length < 3) return null;

  const pattern = name.replace(/[%_]/g, "").slice(0, 80);
  const { data: typeRows } = await db
    .from("party_types")
    .select("id")
    .in("type_code", [...ISSUING_AUTHORITY_PARTY_TYPE_CODES]);

  const typeIds = (typeRows ?? []).map((t) => t.id as number);
  if (typeIds.length === 0) return null;

  const { data: parties } = await db
    .from("parties")
    .select("id, display_name, legal_name_en")
    .in("party_type_id", typeIds)
    .is("deleted_at", null)
    .or(`display_name.ilike.%${pattern}%,legal_name_en.ilike.%${pattern}%,trade_name_en.ilike.%${pattern}%`)
    .limit(5);

  if (!parties?.length) return null;

  const exact = parties.find(
    (p) =>
      (p.display_name as string)?.toLowerCase() === name.toLowerCase()
      || (p.legal_name_en as string)?.toLowerCase() === name.toLowerCase()
  );
  return (exact ?? parties[0]).id as number;
}
