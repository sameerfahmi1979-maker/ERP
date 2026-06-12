import { createClient } from "@/lib/supabase/server";
import type { UserWithRoles } from "@/types/database";

export async function listUsers(): Promise<UserWithRoles[]> {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select(
      `
      *,
      owner_companies:owner_company_id ( id, legal_name_en, company_code, status ),
      branches:branch_id ( id, branch_code, branch_name_en, status ),
      user_roles (
        is_active,
        roles ( role_code, role_name )
      )
    `,
    )
    .order("id", { ascending: true });

  if (error) {
    console.error("listUsers error", error.message);
    return [];
  }

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  return (profiles ?? []).map((profile) => {
    const roleRows =
      (profile.user_roles as { roles: { role_code: string; role_name: string } | null }[] | null) ??
      [];
    const roles = roleRows
      .map((ur) => ur.roles)
      .filter((role): role is { role_code: string; role_name: string } => Boolean(role));

    const { user_roles: _ignoredRoles, owner_companies, branches, ...rest } = profile as Record<
      string,
      unknown
    >;
    void _ignoredRoles;

    return {
      ...(rest as UserWithRoles),
      roles,
      owner_company: owner_companies as UserWithRoles["owner_company"],
      branch: branches as UserWithRoles["branch"],
      email: profile.auth_user_id === currentUser?.id ? currentUser?.email ?? null : null,
    };
  });
}
