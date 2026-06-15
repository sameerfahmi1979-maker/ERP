import { createClient } from "@/lib/supabase/server";
import type { UserWithRoles, OwnerCompany, Branch } from "@/types/database";

export async function getUserById(id: number): Promise<UserWithRoles | null> {
  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select(
      `*, owner_companies:owner_company_id ( id, legal_name_en, company_code, status ), branches:branch_id ( id, branch_code, branch_name_en, status )`
    )
    .eq("id", id)
    .single();

  if (error || !profile) return null;

  const { data: userRoles } = await supabase
    .from("user_roles")
    .select(`role_id, is_active, roles ( role_code, role_name )`)
    .eq("user_profile_id", id)
    .eq("is_active", true);

  const roles = (userRoles ?? []).flatMap((ur) => {
    const r = ur.roles;
    if (r && typeof r === "object" && "role_code" in r && "role_name" in r) {
      return [{ role_code: String(r.role_code), role_name: String(r.role_name) }];
    }
    return [];
  });

  const { owner_companies, branches, ...rest } = profile as Record<string, unknown>;
  return {
    ...(rest as UserWithRoles),
    roles,
    owner_company: (owner_companies as OwnerCompany | null) ?? null,
    branch: (branches as Branch | null) ?? null,
  };
}

export async function listUsers(): Promise<UserWithRoles[]> {
  const supabase = await createClient();

  // Step 1: Fetch user profiles with company and branch info
  // Avoid ambiguous PostgREST embed for user_roles (which has two FKs to user_profiles)
  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select(
      `
      *,
      owner_companies:owner_company_id ( id, legal_name_en, company_code, status ),
      branches:branch_id ( id, branch_code, branch_name_en, status )
    `,
    )
    .order("id", { ascending: true });

  if (profilesError) {
    console.error("listUsers profiles error", profilesError.message);
    return [];
  }

  if (!profiles || profiles.length === 0) {
    return [];
  }

  // Step 2: Fetch user_roles for all users explicitly
  const profileIds = profiles.map((p) => p.id);
  const { data: userRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select(
      `
      user_profile_id,
      is_active,
      role_id,
      roles ( role_code, role_name )
    `,
    )
    .in("user_profile_id", profileIds)
    .eq("is_active", true);

  if (rolesError) {
    console.error("listUsers user_roles error", rolesError.message);
    // Continue without roles rather than failing completely
  }

  // Step 3: Get current user for email display
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  // Step 4: Build a map of profile_id -> roles[]
  const rolesByProfile = new Map<number, { role_code: string; role_name: string }[]>();
  
  if (userRoles) {
    for (const ur of userRoles) {
      const profileId = ur.user_profile_id;
      const roleData = ur.roles;
      
      // Handle the role data - it should be a single object since role_id is a FK to roles(id)
      if (roleData && typeof roleData === "object" && "role_code" in roleData && "role_name" in roleData) {
        if (!rolesByProfile.has(profileId)) {
          rolesByProfile.set(profileId, []);
        }
        rolesByProfile.get(profileId)!.push({
          role_code: String(roleData.role_code),
          role_name: String(roleData.role_name),
        });
      }
    }
  }

  // Step 5: Merge everything together
  return profiles.map((profile) => {
    const roles = rolesByProfile.get(profile.id) ?? [];
    const { owner_companies, branches, ...rest } = profile as Record<string, unknown>;

    return {
      ...(rest as UserWithRoles),
      roles,
      owner_company: owner_companies as OwnerCompany | null,
      branch: branches as Branch | null,
      email: profile.auth_user_id === currentUser?.id ? currentUser?.email ?? null : null,
    };
  });
}
