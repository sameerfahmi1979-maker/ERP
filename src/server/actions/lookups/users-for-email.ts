"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, hasGlobalPermission, hasPermissionInScope } from "@/lib/rbac/check";

const RECIPIENT_LOOKUP_CAPABILITIES = [
  "users.view", "dms.expiry.view", "dms.documents.view", "dms.expiry.manage", "dms.admin", "dms.notifications.admin",
  "notifications.email_queue.manage", "notifications.admin", "reports.email",
];

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
    if (!ctx.profile || !RECIPIENT_LOOKUP_CAPABILITIES.some(code => hasPermission(ctx, code))) return [];

    const supabase = createAdminClient();
    const term = search.trim().slice(0, 100);

    const { data, error } = await supabase.rpc("search_users_for_email", {
      p_search: term,
    });

    if (error) {
      console.error("[getUsersForEmailSelect] rpc error:", error.message);
      return [];
    }

    if (!data?.length) return [];
    // The service-only RPC crosses auth.users. Check each recipient's current
    // profile scope before returning any email; a scoped DMS grant is not a
    // global directory grant, and scopes cannot be borrowed from another role.
    const { data: profiles, error: scopeError } = await supabase.from("user_profiles")
      .select("id, owner_company_id, branch_id").in("id", data.map((u: { id: number }) => u.id)).eq("status", "active");
    if (scopeError) return [];
    const allowed = new Set((profiles ?? []).filter(p => RECIPIENT_LOOKUP_CAPABILITIES.some(code =>
      hasGlobalPermission(ctx, code) || (p.owner_company_id !== null && hasPermissionInScope(ctx, code, p.owner_company_id, p.branch_id))
    )).map(p => p.id));
    return data.filter((u: { id: number }) => allowed.has(u.id)).map(
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
