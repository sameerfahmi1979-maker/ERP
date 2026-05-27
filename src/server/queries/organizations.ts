import { createClient } from "@/lib/supabase/server";
import type { OwnerCompany } from "@/types/database";

/**
 * List all owner companies (organizations)
 * RLS-protected query
 */
export async function listOrganizations(): Promise<OwnerCompany[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("owner_companies")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("listOrganizations error", error.message);
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
    console.error("getOrganizationById error", error.message);
    return null;
  }

  return data as OwnerCompany;
}
