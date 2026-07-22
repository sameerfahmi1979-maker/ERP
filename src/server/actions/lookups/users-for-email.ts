"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";

export type UserEmailOption = {
  id: number;
  label: string;
  email: string;
};

/**
 * Search user profiles for email recipient selection.
 * Returns up to 20 matches ordered by full_name.
 * Intentionally includes all users with a valid email address (no status filter)
 * so that admins can still reach inactive accounts if needed.
 */
export async function getUsersForEmailSelect(
  search: string
): Promise<UserEmailOption[]> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return [];

    const term = search.trim();

    let query = supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .not("email", "is", null);

    if (term) {
      // Supabase .or() filter: match name OR email
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    const { data, error } = await query
      .order("full_name", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[getUsersForEmailSelect]", error.message);
      return [];
    }

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
  } catch (err) {
    console.error("[getUsersForEmailSelect] unexpected error:", err);
    return [];
  }
}
