"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";

export type UserEmailOption = {
  id: number;
  label: string;
  email: string;
};

/**
 * Search users for email recipient selection.
 *
 * `user_profiles` does NOT store email — it lives in `auth.users`.
 * This calls the `search_users_for_email` Postgres RPC (SECURITY DEFINER)
 * which crosses the auth/public schema boundary via the service-role key.
 */
export async function getUsersForEmailSelect(
  search: string
): Promise<UserEmailOption[]> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return [];

    const supabase = createAdminClient();
    const term = search.trim();

    const { data, error } = await supabase.rpc("search_users_for_email", {
      p_search: term,
    });

    if (error) {
      console.error("[getUsersForEmailSelect] rpc error:", error.message);
      return [];
    }

    return (data ?? []).map(
      (u: { id: number; full_name: string | null; email: string }) => ({
        id: u.id,
        label: u.full_name || u.email,
        email: u.email,
      })
    );
  } catch (err) {
    console.error("[getUsersForEmailSelect] unexpected error:", err);
    return [];
  }
}
