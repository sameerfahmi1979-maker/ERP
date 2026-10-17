import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { BranchWithCompany } from "@/types/domain";

/**
 * List all branches with owner company info
 * RLS-protected query
 */
export async function listBranches(): Promise<BranchWithCompany[]> {
  try {
    const supabase = await createClient();
    const rows: BranchWithCompany[] = [];
    // Preserve this existing array-returning catalogue, using the bounded F06
    // keyset pattern. Shared read/cache integration remains PERF-owned. An empty
    // final page is required even when the Data API cap is lower than 200.
    for (let cursor = 0; ;) {
      const { data, error } = await supabase
        .from("branches")
        .select(`
          *,
          owner_company:owner_company_id ( id, legal_name_en, company_code, status )
        `)
        .gt("id", cursor)
        .order("id", { ascending: true })
        .limit(200);

      if (error || !Array.isArray(data) || data.length > 200) throw new Error("List read failed");
      if (data.length === 0) return rows;
      for (const row of data) {
        if (!row || !Number.isSafeInteger(row.id) || row.id <= cursor) throw new Error("Invalid list order");
        cursor = row.id;
        rows.push(row as BranchWithCompany);
      }
    }
  } catch {
    logger.error("listBranches failed");
    throw new Error("Branches could not be loaded. Try again.");
  }
}

/**
 * Get a single branch by ID with company info
 * RLS-protected query
 */
export async function getBranchById(id: number): Promise<BranchWithCompany | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("branches")
    .select(
      `
      *,
      owner_company:owner_company_id ( id, legal_name_en, company_code, status )
    `,
    )
    .eq("id", id)
    .single();

  if (error) {
    logger.error("getBranchById error", error.message);
    return null;
  }

  return data as BranchWithCompany;
}
