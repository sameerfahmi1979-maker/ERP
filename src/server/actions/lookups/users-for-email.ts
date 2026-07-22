"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";

export type UserEmailOption = {
  id: number;
  label: string;
  email: string;
};

/**
 * Search user profiles for email recipient selection.
 * Uses the admin (service-role) client to bypass RLS — user_profiles
 * has row-level security that prevents the normal client from reading
 * other users' rows, which would return an empty list.
 */
export async function getUsersForEmailSelect(
  search: string
): Promise<UserEmailOption[]> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return [];

    // Must use admin client — RLS on user_profiles restricts to own row
    const supabase = createAdminClient();
    const term = search.trim();

    let query = supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .not("email", "is", null);

    if (term) {
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
