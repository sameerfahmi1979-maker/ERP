"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";

export type UserEmailOption = {
  id: number;
  label: string;
  email: string;
};

/**
 * Search active user profiles for email recipient selection.
 * Returns up to 20 matches ordered by full_name.
 */
export async function getUsersForEmailSelect(
  search: string
): Promise<UserEmailOption[]> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return [];

    let query = supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .or("status.is.null,status.eq.active");

    const term = search.trim();
    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    const { data } = await query
      .order("full_name", { ascending: true })
      .limit(20);

    return (data ?? [])
      .filter((u) => {
        const row = u as Record<string, unknown>;
        return !!row.email;
      })
      .map((u) => {
        const row = u as Record<string, unknown>;
        return {
          id: row.id as number,
          label: (row.full_name as string | null) || (row.email as string),
          email: row.email as string,
        };
      });
  } catch {
    return [];
  }
}
