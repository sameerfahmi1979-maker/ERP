import { createClient } from "@/lib/supabase/server";
import type { BranchWithCompany } from "@/types/database";

/**
 * List all branches with owner company info
 * RLS-protected query
 */
export async function listBranches(): Promise<BranchWithCompany[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("branches")
    .select(
      `
      *,
      owner_company:owner_company_id ( id, legal_name_en, company_code, status )
    `,
    )
    .order("id", { ascending: true });

  if (error) {
    console.error("listBranches error", error.message);
    return [];
  }

  return (data ?? []) as BranchWithCompany[];
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
    console.error("getBranchById error", error.message);
    return null;
  }

  return data as BranchWithCompany;
}
