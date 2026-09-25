"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, hasGlobalPermission, hasPermissionInScope, isGlobalAdmin, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { issueAccountInvitation } from "@/lib/auth/invitations";
import { sendSecurityTemplate } from "@/lib/auth/security-email";
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

// ── USERS.1 — Last system-admin protection ────────────────────────────────────

/**
 * Blocks deactivation / deletion of the last active system_admin.
 * Throws a typed ActionResult-compatible error string if the guard triggers.
 */
async function assertNotLastSystemAdmin(userProfileId: number, actorCtx?: import("@/lib/rbac/check").AuthContext, attemptedAction?: string): Promise<string | null> {
  // Internal preflight after actor authorization. The database trigger is the concurrent guard.
  const supabase = createAdminClient();

  // Only active, global assignments confer administrator authority.
  const { data: targetRoles, error: targetError } = await supabase
    .from("user_roles")
    .select("role_id, roles!inner(role_code, is_active)")
    .eq("user_profile_id", userProfileId)
    .eq("is_active", true).is("owner_company_id", null).is("branch_id", null);

  if (targetError) return "Cannot verify administrator safety. No change was made.";
  const isSystemAdmin = (targetRoles ?? []).some((row) => {
    const r = row.roles as { role_code?: string; is_active?: boolean } | null;
    return r?.role_code === "system_admin" && r.is_active === true;
  });

  if (!isSystemAdmin) return null; // Not a system admin — no restriction

  // Count total active system_admin users (active role + active profile)
  const { data: adminAssignments, error: adminError } = await supabase
    .from("user_roles")
    .select("user_profile_id, roles!inner(role_code, is_active), user_profiles!inner(status)")
    .eq("is_active", true).is("owner_company_id", null).is("branch_id", null);

  if (adminError) return "Cannot verify administrator safety. No change was made.";
  const activeAdminCount = new Set((adminAssignments ?? []).filter((row) => {
    const role = row.roles as { role_code?: string; is_active?: boolean } | null;
    const profile = row.user_profiles as { status?: string } | null;
    return role?.role_code === "system_admin" && role.is_active === true && profile?.status === "active";
  }).map(row => row.user_profile_id)).size;

  if (activeAdminCount <= 1) {
    // Log LAST_ADMIN_GUARD_TRIGGERED
    if (actorCtx?.profile) {
      await logAudit({
        module_code: "users",
        entity_name: "user_profiles",
        entity_id: userProfileId,
        entity_reference: `user-${userProfileId}`,
        action: "LAST_ADMIN_GUARD_TRIGGERED",
        new_values: {
          target_user_profile_id: userProfileId,
          target_role_code: "system_admin",
          attempted_action: attemptedAction ?? "unknown",
          reason: "last_active_system_admin",
          active_system_admin_count: activeAdminCount,
        },
      }).catch(() => {});
    }
    return "Cannot deactivate or delete the last active system administrator.";
  }
  return null;
}

/**
 * Create new user (Admin only)
 * Creates Auth user and user profile with optional initial role assignment
 * Uses service-role Supabase Admin API (server-only)
 * Phase 002D
 */
export async function createUser(input: CreateUserInput): Promise<ActionResult<{ user_profile_id: number; stages: Record<string, string> }>> {
  let createdProfileId: number | null = null;
  let createdAuthId: string | null = null;
  let operationId: string | null = null;
  let journalStarted = false;
  const stages: Record<string, string> = { identity: "not_started", profile: "not_started", role: "not_requested", email: "not_requested", audit: "not_started" };
  const receipt = async (state: string): Promise<boolean> => {
    if (!journalStarted || !operationId) return false;
    try {
      const r = await createAdminClient().from("erp_account_provisioning_operations").update({ state, auth_user_id: createdAuthId, profile_id: createdProfileId, stages, updated_at: new Date().toISOString() }).eq("id",operationId).select("id");
      return !r.error && r.data?.length === 1;
    } catch { return false; }
  };
  try {
    const validated = createUserSchema.parse(input);
    const ctx = await getAuthContext();
    assertAccountActive(ctx);
    const scopeAllows = (permission: string, company: number | null | undefined, branch: number | null | undefined) =>
      company == null ? hasGlobalPermission(ctx, permission) : hasPermissionInScope(ctx, permission, company, branch ?? null);
    if (!scopeAllows("users.create", validated.owner_company_id, validated.branch_id)) return { success: false, error: "You cannot create an account in this scope." };
    if (validated.branch_id && !validated.owner_company_id) return { success: false, error: "A branch requires its company." };
    if (validated.initial_role_id && !scopeAllows("users.roles.assign", validated.initial_role_scope_company_id, validated.initial_role_scope_branch_id)) {
      return { success: false, error: "Initial role assignment requires users.roles.assign in that scope." };
    }
    const admin = createAdminClient();
    if (validated.branch_id) {
      const { data: branch, error } = await admin.from("branches").select("owner_company_id").eq("id",validated.branch_id).single();
      if (error || branch.owner_company_id !== validated.owner_company_id) return { success: false, error: "The selected branch does not belong to the selected company." };
    }
    operationId = validated.creation_operation_id ?? randomUUID();
    const emailHash = createHash("sha256").update(validated.email).digest("hex");
    const journal = await admin.from("erp_account_provisioning_operations").insert({ id: operationId, actor_profile_id: ctx.profile!.id, target_email_hash: emailHash, stages });
    if (journal.error) {
      // A repeated request may acknowledge its completed account, never create it twice.
      const prior = await admin.from("erp_account_provisioning_operations").select("state,profile_id,stages").eq("id",operationId).eq("actor_profile_id",ctx.profile!.id).eq("target_email_hash",emailHash).maybeSingle();
      if (!prior.error && prior.data?.profile_id && ["completed","partial"].includes(prior.data.state)) return { success: true, data: {user_profile_id:prior.data.profile_id,stages:prior.data.stages}, error: "This account already exists from this request. Review its setup status; no duplicate was created." };
      return { success: false, error: `Creation is pending or could not be journaled. Review operation ${operationId}; do not repeat account creation.` };
    }
    journalStarted = true;
    // Create first, rather than generateLink(invite) which can address an existing identity.
    // This guarantees compensation never deletes someone else's pre-existing account.
    const temporaryPassword = validated.send_invite_email ? randomBytes(24).toString("base64url") + "aA9!" : validated.temporary_password;
    if (!temporaryPassword) { await receipt("failed"); return { success: false, error: "A temporary password is required." }; }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: validated.email, password: temporaryPassword, email_confirm: !validated.send_invite_email,
      user_metadata: { full_name: validated.full_name },
    });
    if (createError || !created.user) { await receipt("needs_reconciliation"); return { success: false, error: `Identity creation was not confirmed. Review operation ${operationId} and any existing account before retrying.` }; }
    const authUser = created.user;
    createdAuthId = authUser.id;
    stages.identity = "created";
    if (!await receipt("identity_created")) throw new Error("Identity receipt not persisted");
    const now = new Date().toISOString();
    const { data: profile, error: profileError } = await admin.from("user_profiles").upsert({
      auth_user_id: authUser.id, full_name: validated.full_name, display_name: validated.display_name,
      phone: validated.phone, job_title: validated.job_title, department: validated.department,
      owner_company_id: validated.owner_company_id, branch_id: validated.branch_id, status: validated.status,
      must_change_password: true, last_password_security_action: "account_created", last_password_security_action_at: now,
      ...(!validated.send_invite_email ? { password_set_by_admin_at: now, email_confirmed_by_admin_at: now, email_confirmed_by_admin_id: ctx.profile!.id } : {}),
    }, { onConflict: "auth_user_id" }).select("id").single();
    if (profileError || !profile) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(authUser.id);
      await receipt(cleanupError ? "needs_reconciliation" : "compensated");
      return { success: false, error: cleanupError
        ? `Profile setup and identity cleanup failed. Administrator reconciliation is required for Auth identity ${authUser.id}; do not retry creation.`
        : "Profile setup failed. The newly created identity was removed; no invitation was sent." };
    }
    createdProfileId = profile.id;
    stages.profile = "created";
    if (!await receipt("profile_created")) throw new Error("Profile receipt not persisted");
    const warnings: string[] = [];
    if (validated.initial_role_id) {
      const assigned = await assignRoleToUser({ user_profile_id: profile.id, role_id: validated.initial_role_id,
        owner_company_id: validated.initial_role_scope_company_id, branch_id: validated.initial_role_scope_branch_id, is_active: true });
      stages.role = assigned.success ? "assigned" : "failed";
      if (!assigned.success) warnings.push("Initial role was not assigned. Review the account and assign only the permitted scope.");
    }
    if (validated.send_invite_email) {
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
      const link = await issueAccountInvitation({ profileId: profile.id, authUserId: authUser.id, email: validated.email, siteUrl: site }).catch(() => null);
      if (!link) {
        stages.email = "link_failed"; warnings.push("Account created, but setup-link generation failed. Use resend from this account.");
      } else {
        const delivery = await sendSecurityTemplate({ to: validated.email, profileId: profile.id, kind: "invite", variables: {
          display_name: validated.full_name, action_link: link.actionLink, invitation_expires_at: link.expiresAt,
          login_url: new URL("/login",site).href, company_name: process.env.NEXT_PUBLIC_ERP_COMPANY_NAME ?? "ALGT ERP",
          support_email: process.env.NEXT_PUBLIC_ERP_SUPPORT_EMAIL ?? "support@algt.net",
          expiry_note: "This is a one-time link. Request a new invitation if it expires.",
        } });
        stages.email = delivery.accepted ? "provider_accepted" : "not_confirmed";
        if (!delivery.accepted || !delivery.recorded) warnings.push("Setup-email delivery or its receipt needs review. Do not recreate the account.");
      }
    }
    const audit = await logAudit({ module_code: "users", entity_name: "user_profiles", entity_id: profile.id, entity_reference: String(profile.id),
      action: "USER_CREATED", new_values: { stages, must_change_password: true }, owner_company_id: validated.owner_company_id, branch_id: validated.branch_id });
    stages.audit = audit.success ? "recorded" : "failed";
    if (!audit.success) warnings.push("Account exists, but the audit receipt needs review.");
    if (!await receipt(warnings.length ? "partial" : "completed")) warnings.push(`Provisioning receipt needs reconciliation: ${operationId}.`);
    revalidatePath("/admin/users");
    return { success: true, data: { user_profile_id: profile.id, stages }, ...(warnings.length ? { error: warnings.join(" ") } : {}) };
  } catch {
    if (journalStarted) await receipt(createdProfileId ? "partial" : "needs_reconciliation");
    if (createdProfileId) return { success: true, data: { user_profile_id: createdProfileId, stages }, error: "The account was created, but a follow-up step failed. Review this account; do not create it again." };
    if (journalStarted) return { success: false, error: `Creation was interrupted and needs reconciliation (operation ${operationId}${createdAuthId ? `, identity ${createdAuthId}` : ""}). Do not recreate this account until its state is verified.` };
    return { success: false, error: "User creation failed validation or could not start." };
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
    assertAccountActive(ctx);
    if (!hasPermission(ctx, "users.update")) {
      await logAudit({
        module_code: "users", entity_name: "user_profiles", entity_id: id,
        entity_reference: `user-${id}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "adminUpdateUserProfile", required_permission: "users.update", target_entity_id: id },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
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

    // USERS.1 — Last-admin guard: block deactivation of sole system_admin
    if (updates.status && updates.status !== "active" && oldData.status === "active") {
      const adminGuard = await assertNotLastSystemAdmin(id, ctx, "deactivate_user");
      if (adminGuard) return { success: false, error: adminGuard };
    }

    // USERS.2 — Auto-set last admin update timestamp
    const updatePayload = {
      ...updates,
      last_admin_updated_at: new Date().toISOString(),
    };

    // 4. Update profile
    const { error } = await supabase
      .from("user_profiles")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      logger.error("adminUpdateUserProfile error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const { old_values, new_values } = createAuditDiff(oldData, { ...oldData, ...updatePayload });
    
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: id,
      entity_reference: oldData.user_code || `user-${id}`,
      action: updates.status && updates.status !== oldData.status ? "USER_STATUS_CHANGED" : "USER_UPDATED",
      old_values,
      new_values,
      owner_company_id: oldData.owner_company_id ?? undefined,
      branch_id: oldData.branch_id ?? undefined,
    });

    // 6. Revalidate
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    logger.error("adminUpdateUserProfile exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
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
    assertAccountActive(ctx);
    if (!hasPermission(ctx, "users.roles.assign")) {
      await logAudit({
        module_code: "users", entity_name: "user_roles", entity_id: 0,
        entity_reference: `role-assign`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "assignRoleToUser", required_permission: "users.roles.assign" },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
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
      .select("role_code, role_name, is_active, is_assignable")
      .eq("id", validated.role_id)
      .single();

    if (!userProfile || !role) {
      return { success: false, error: "User or role not found" };
    }

    // USERS.3 — server-side enforcement: only active + assignable roles may be assigned
    if (!role.is_active) {
      return { success: false, error: `Role "${role.role_name}" is inactive and cannot be assigned` };
    }
    if (role.is_assignable === false) {
      return { success: false, error: `Role "${role.role_name}" is not assignable` };
    }

    const { data: mayAssign, error: scopeError } = await supabase.rpc("current_user_can_manage_user_role_assignment", {
      target_user_profile_id: validated.user_profile_id,
      target_role_id: validated.role_id,
      target_owner_company_id: validated.owner_company_id ?? null,
      target_branch_id: validated.branch_id ?? null,
    });
    if (scopeError || mayAssign !== true) return { success: false, error: "You cannot grant this role in the requested scope." };

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
      logger.error("assignRoleToUser error", error);
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
      action: "USER_ROLE_ASSIGNED",
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
    logger.error("assignRoleToUser exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
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
    assertAccountActive(ctx);
    if (!hasPermission(ctx, "users.roles.assign")) {
      await logAudit({
        module_code: "users", entity_name: "user_roles", entity_id: 0,
        entity_reference: "role-remove", action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "removeRoleFromUser", required_permission: "users.update" },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
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

    const role = oldData.roles as { role_code: string; role_name: string } | null;

    // USERS.2 — Last-admin guard: block removal of sole system_admin role assignment
    if (role?.role_code === "system_admin") {
      const adminGuard = await assertNotLastSystemAdmin(oldData.user_profile_id as number, ctx, "remove_role");
      if (adminGuard) return { success: false, error: adminGuard };
    }

    // 4. Remove role assignment
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("id", validated.user_role_id);

    if (error) {
      logger.error("removeRoleFromUser error", error);
      return { success: false, error: error.message };
    }

    // 5. Log audit
    const userProfile = oldData.user_profiles as { user_code: string | null; owner_company_id: number | null; branch_id: number | null } | null;

    await logAudit({
      module_code: "users",
      entity_name: "user_roles",
      entity_id: validated.user_role_id,
      entity_reference: `${userProfile?.user_code || `user-${oldData.user_profile_id}`} → ${role?.role_code || "unknown"}`,
      action: "USER_ROLE_REMOVED",
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
    logger.error("removeRoleFromUser exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}

/**
 * Delete user (Admin only — irreversible)
 * Deletes the Supabase Auth user (cascades to user_profiles via FK trigger).
 * Cannot delete your own account.
 */
export async function deleteUser(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    // 1. Check permissions
    const ctx = await getAuthContext();
    assertAccountActive(ctx);
    if (!hasPermission(ctx, "users.delete")) {
      await logAudit({
        module_code: "users", entity_name: "user_profiles", entity_id: userProfileId,
        entity_reference: `user-${userProfileId}`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "deleteUser", required_permission: "users.delete", target_entity_id: userProfileId },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    // 2. Fetch the target user profile — use adminClient to bypass RLS
    const adminClient = createAdminClient();
    const { data: profile, error: fetchError } = await adminClient
      .from("user_profiles")
      .select("id, user_code, auth_user_id, full_name, display_name, owner_company_id, branch_id")
      .eq("id", userProfileId)
      .single();

    if (fetchError || !profile) {
      return { success: false, error: `User not found (id: ${userProfileId}${fetchError ? ` — ${fetchError.message}` : ""})` };
    }

    if (!(profile.owner_company_id == null ? hasGlobalPermission(ctx, "users.delete") : hasPermissionInScope(ctx, "users.delete", profile.owner_company_id, profile.branch_id))) return { success: false, error: "You cannot delete this account in its company/branch scope." };
    if (!isGlobalAdmin(ctx)) {
      const targetRoles = await adminClient.from("user_roles").select("roles!inner(role_code, is_active)")
        .eq("user_profile_id", userProfileId).eq("is_active", true).is("owner_company_id", null).is("branch_id", null);
      if (targetRoles.error) return { success: false, error: "Cannot verify target account privileges. No change was made." };
      if (targetRoles.data.some(row => {
        const role = (Array.isArray(row.roles) ? row.roles[0] : row.roles) as { role_code: string; is_active: boolean } | null;
        return role?.is_active && ["system_admin", "group_admin"].includes(role.role_code);
      })) return { success: false, error: "Only a global administrator can delete a privileged account." };
    }

    // 3. Prevent self-deletion
    if (ctx.profile?.id === userProfileId) {
      return { success: false, error: "You cannot delete your own account" };
    }

    // USERS.1 — Last-admin guard
    const adminGuard = await assertNotLastSystemAdmin(userProfileId, ctx, "delete_user");
    if (adminGuard) return { success: false, error: adminGuard };

    // 4. Log audit before deletion (so we have a record)
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: profile.user_code || `user-${userProfileId}`,
      action: "USER_DELETED",
      old_values: {
        user_code: profile.user_code,
        full_name: profile.full_name,
        display_name: profile.display_name,
        auth_user_id: profile.auth_user_id,
      },
      new_values: null,
      owner_company_id: profile.owner_company_id ?? undefined,
      branch_id: profile.branch_id ?? undefined,
    });

    // 5. Delete the Auth user — cascades to user_profiles via FK

    if (profile.auth_user_id) {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(
        profile.auth_user_id,
      );
      if (deleteAuthError) {
        logger.error("deleteUser auth error", deleteAuthError);
        return { success: false, error: `Failed to delete auth user: ${deleteAuthError.message}` };
      }
    } else {
      // No auth user linked — delete the profile row directly
      const { error: deleteProfileError } = await adminClient
        .from("user_profiles")
        .delete()
        .eq("id", userProfileId);
      if (deleteProfileError) {
        return { success: false, error: `Failed to delete user profile: ${deleteProfileError.message}` };
      }
    }

    // 6. Revalidate
    revalidatePath("/admin/users");

    return { success: true };
  } catch (error) {
    logger.error("deleteUser exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
  }
}
