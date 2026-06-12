"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import {
  adminUpdateUserProfileSchema,
  userRoleAssignmentSchema,
  userRoleRemovalSchema,
  createUserSchema,
  type AdminUpdateUserProfileInput,
  type UserRoleAssignmentInput,
  type UserRoleRemovalInput,
  type CreateUserInput,
} from "@/features/users/user-schema";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Create new user (Admin only)
 * Creates Auth user and user profile with optional initial role assignment
 * Uses service-role Supabase Admin API (server-only)
 * Phase 002D
 */
export async function createUser(
  input: CreateUserInput,
): Promise<ActionResult<{ user_profile_id: number }>> {
  try {
    // 1. Validate input
    const validated = createUserSchema.parse(input);

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "users.manage")) {
      return { success: false, error: "You do not have permission to create users" };
    }

    // 3. Create Auth user using Admin API (service-role)
    const adminClient = createAdminClient();
    
    let authUser;
    if (validated.send_invite_email) {
      // Use invite email method (requires SMTP configured)
      const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        validated.email,
        {
          data: {
            full_name: validated.full_name,
          },
        }
      );
      if (inviteError) {
        console.error("inviteUserByEmail error", inviteError);
        return { success: false, error: `Failed to send invite: ${inviteError.message}` };
      }
      authUser = data.user;
    } else {
      // Use createUser with temporary password
      if (!validated.temporary_password) {
        return { success: false, error: "Temporary password is required when not sending invite email" };
      }
      
      const { data, error: createError } = await adminClient.auth.admin.createUser({
        email: validated.email,
        password: validated.temporary_password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: validated.full_name,
        },
      });
      
      if (createError) {
        console.error("createUser error", createError);
        return { success: false, error: `Failed to create user: ${createError.message}` };
      }
      authUser = data.user;
    }

    if (!authUser) {
      return { success: false, error: "Failed to create Auth user" };
    }

    // 4. Create user profile
    const supabase = await createClient();
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        auth_user_id: authUser.id,
        full_name: validated.full_name,
        display_name: validated.display_name,
        phone: validated.phone,
        job_title: validated.job_title,
        department: validated.department,
        owner_company_id: validated.owner_company_id,
        branch_id: validated.branch_id,
        status: validated.status,
      })
      .select("id")
      .single();

    if (profileError || !profile) {
      console.error("user_profiles insert error", profileError);
      // Cleanup: delete Auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authUser.id);
      return { success: false, error: `Failed to create user profile: ${profileError?.message}` };
    }

    // 5. Assign initial role if specified
    if (validated.initial_role_id) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_profile_id: profile.id,
          role_id: validated.initial_role_id,
          owner_company_id: validated.initial_role_scope_company_id,
          branch_id: validated.initial_role_scope_branch_id,
          is_active: true,
        });

      if (roleError) {
        console.error("user_roles insert error", roleError);
        // Don't fail the entire operation, just log warning
        console.warn(`User created but role assignment failed: ${roleError.message}`);
      }
    }

    // 6. Log audit
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: profile.id,
      entity_reference: validated.email,
      action: "create",
      old_values: null,
      new_values: {
        email: validated.email,
        full_name: validated.full_name,
        status: validated.status,
        auth_method: validated.send_invite_email ? "invite_email" : "temporary_password",
      },
      owner_company_id: validated.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? undefined,
    });

    // 7. Revalidate
    revalidatePath("/admin/users");

    return { success: true, data: { user_profile_id: profile.id } };
  } catch (error) {
    console.error("createUser exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Admin update user profile
 * Server action with RLS and audit logging
 */
export async function adminUpdateUserProfile(
  input: AdminUpdateUserProfileInput,
): Promise<ActionResult> {
  try {
    // 1. Validate input
    const validated = adminUpdateUserProfileSchema.parse(input);
    const { id, ...updates } = validated;

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "users.manage")) {
      return { success: false, error: "You do not have permission to update user profiles" };
    }

    // 3. Get old values for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (!oldData) {
      return { success: false, error: "User profile not found" };
    }

    // 4. Update profile
    const { error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("adminUpdateUserProfile error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...updates });
    
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: id,
      entity_reference: oldData.user_code || `user-${id}`,
      action: "update",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    // 6. Revalidate
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("adminUpdateUserProfile exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Assign role to user
 * Server action with RLS and audit logging
 */
export async function assignRoleToUser(
  input: UserRoleAssignmentInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const validated = userRoleAssignmentSchema.parse(input);

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "users.manage")) {
      return { success: false, error: "You do not have permission to assign roles" };
    }

    // 3. Get user and role info for audit
    const supabase = await createClient();
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("user_code, owner_company_id, branch_id")
      .eq("id", validated.user_profile_id)
      .single();

    const { data: role } = await supabase
      .from("roles")
      .select("role_code, role_name")
      .eq("id", validated.role_id)
      .single();

    if (!userProfile || !role) {
      return { success: false, error: "User or role not found" };
    }

    // 4. Assign role
    const dataToInsert = {
      user_profile_id: validated.user_profile_id,
      role_id: validated.role_id,
      owner_company_id: validated.owner_company_id ?? null,
      branch_id: validated.branch_id ?? null,
      is_active: validated.is_active,
      assigned_by: ctx.profile?.id ?? null,
    };

    const { data, error } = await supabase
      .from("user_roles")
      .insert(dataToInsert)
      .select("id")
      .single();

    if (error) {
      console.error("assignRoleToUser error", error);
      // Check for unique constraint violation
      if (error.message.includes("user_roles_scope_unique")) {
        return { success: false, error: "This role assignment already exists for this user with the same scope" };
      }
      return { success: false, error: error.message };
    }

    // 5. Log audit
    await logAudit({
      module_code: "users",
      entity_name: "user_roles",
      entity_id: data.id,
      entity_reference: `${userProfile.user_code || `user-${validated.user_profile_id}`} → ${role.role_code}`,
      action: "assign_role",
      new_values: {
        user_profile_id: validated.user_profile_id,
        role: role.role_name,
        scope: validated.owner_company_id ? "company" : validated.branch_id ? "branch" : "global",
      },
      owner_company_id: validated.owner_company_id ?? userProfile.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? userProfile.branch_id ?? undefined,
    });

    // 6. Revalidate
    revalidatePath("/admin/users");

    return { success: true, data: { id: data.id } };
  } catch (error) {
    console.error("assignRoleToUser exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Remove role from user
 * Server action with RLS and audit logging
 */
export async function removeRoleFromUser(
  input: UserRoleRemovalInput,
): Promise<ActionResult> {
  try {
    // 1. Validate input
    const validated = userRoleRemovalSchema.parse(input);

    // 2. Check permissions
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "users.manage")) {
      return { success: false, error: "You do not have permission to remove roles" };
    }

    // 3. Get role assignment info for audit
    const supabase = await createClient();
    const { data: oldData } = await supabase
      .from("user_roles")
      .select(`
        *,
        user_profiles!user_profile_id ( user_code, owner_company_id, branch_id ),
        roles ( role_code, role_name )
      `)
      .eq("id", validated.user_role_id)
      .single();

    if (!oldData) {
      return { success: false, error: "Role assignment not found" };
    }

    // 4. Remove role assignment
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", validated.user_role_id);

    if (error) {
      console.error("removeRoleFromUser error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const userProfile = oldData.user_profiles as { user_code: string | null; owner_company_id: number | null; branch_id: number | null } | null;
    const role = oldData.roles as { role_code: string; role_name: string } | null;

    await logAudit({
      module_code: "users",
      entity_name: "user_roles",
      entity_id: validated.user_role_id,
      entity_reference: `${userProfile?.user_code || `user-${oldData.user_profile_id}`} → ${role?.role_code || "unknown"}`,
      action: "remove_role",
      old_values: {
        user_profile_id: oldData.user_profile_id,
        role: role?.role_name,
        scope: oldData.owner_company_id ? "company" : oldData.branch_id ? "branch" : "global",
      },
      owner_company_id: oldData.owner_company_id ?? userProfile?.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? userProfile?.branch_id ?? undefined,
    });

    // 6. Revalidate
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    console.error("removeRoleFromUser exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
