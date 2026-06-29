"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission, canManageUsers, assertAccountActive } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
import { sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { getDefaultEmailProvider } from "@/lib/email/providers/factory";
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
  const supabase = await createClient();

  // Check if target user has an active system_admin assignment
  const { data: targetRoles } = await supabase
    .from("user_roles")
    .select("role_id, roles!inner(role_code)")
    .eq("user_profile_id", userProfileId)
    .eq("is_active", true);

  const isSystemAdmin = (targetRoles ?? []).some((row) => {
    const r = row.roles as { role_code?: string } | null;
    return r?.role_code === "system_admin";
  });

  if (!isSystemAdmin) return null; // Not a system admin — no restriction

  // Count total active system_admin users (active role + active profile)
  const { data: adminAssignments } = await supabase
    .from("user_roles")
    .select("user_profile_id, roles!inner(role_code), user_profiles!inner(status)")
    .eq("is_active", true);

  const activeAdminCount = (adminAssignments ?? []).filter((row) => {
    const role = row.roles as { role_code?: string } | null;
    const profile = row.user_profiles as { status?: string } | null;
    return role?.role_code === "system_admin" && profile?.status === "active";
  }).length;

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
export async function createUser(
  input: CreateUserInput,
): Promise<ActionResult<{ user_profile_id: number }>> {
  try {
    // 1. Validate input
    const validated = createUserSchema.parse(input);

    // 2. Check permissions
    const ctx = await getAuthContext();
    assertAccountActive(ctx);
    if (!hasPermission(ctx, "users.create")) {
      await logAudit({
        module_code: "users", entity_name: "user_profiles", entity_id: 0,
        entity_reference: "new_user", action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "createUser", required_permission: "users.create" },
      }).catch(() => {});
      return { success: false, error: "You do not have permission to perform this action." };
    }

    // 3. Create Auth user using Admin API (service-role)
    const adminClient = createAdminClient();
    
    let authUser;
    let inviteLink: string | null = null;

    if (validated.send_invite_email) {
      // Generate invite link WITHOUT Supabase sending the email (avoids SMTP rate limits).
      // We send the invite ourselves via the ERP email provider (Microsoft Graph).
      // redirectTo must match one of the allowed redirect URLs in Supabase Auth settings.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
      const { data, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "invite",
        email: validated.email,
        options: {
          data: { full_name: validated.full_name },
          redirectTo: `${siteUrl}/auth/confirm`,
        },
      });
      if (linkError || !data) {
        logger.error("generateLink invite error", linkError);
        return { success: false, error: `Failed to generate invite link: ${linkError?.message}` };
      }
      authUser = data.user;
      inviteLink = data.properties?.action_link ?? null;
    } else {
      // Use createUser with temporary password
      if (!validated.temporary_password) {
        return { success: false, error: "Temporary password is required when not sending invite email" };
      }
      
      const { data, error: createError } = await adminClient.auth.admin.createUser({
        email: validated.email,
        password: validated.temporary_password,
        email_confirm: true,
        user_metadata: {
          full_name: validated.full_name,
        },
      });
      
      if (createError) {
        logger.error("createUser error", createError);
        return { success: false, error: `Failed to create user: ${createError.message}` };
      }
      authUser = data.user;
    }

    if (!authUser) {
      return { success: false, error: "Failed to create Auth user" };
    }

    const now = new Date().toISOString();

    // 4. Create user profile (upsert — the auth trigger may have already inserted a minimal row)
    // USERS.2A — Set must_change_password + email/password admin confirmation fields
    const supabase = await createClient();
    const profileFields: Record<string, unknown> = {
      auth_user_id: authUser.id,
      full_name: validated.full_name,
      display_name: validated.display_name,
      phone: validated.phone,
      job_title: validated.job_title,
      department: validated.department,
      owner_company_id: validated.owner_company_id,
      branch_id: validated.branch_id,
      status: validated.status,
      must_change_password: true,
    };

    if (!validated.send_invite_email) {
      // Temp password mode — admin confirmed email and set password
      profileFields.password_set_by_admin_at = now;
      profileFields.email_confirmed_by_admin_at = now;
      profileFields.email_confirmed_by_admin_id = ctx.profile?.id ?? null;
    }

    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .upsert(profileFields, { onConflict: "auth_user_id" })
      .select("id")
      .single();

    if (profileError || !profile) {
      logger.error("user_profiles upsert error", profileError);
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
        logger.error("user_roles insert error", roleError);
        logger.warn(`User created but role assignment failed: ${roleError.message}`);
      }
    }

    // 6. Send email via ERP notification templates (USERS.2A)
    let emailWarning: string | undefined;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
    const companyName = process.env.NEXT_PUBLIC_ERP_COMPANY_NAME ?? "ALGT ERP";
    const supportEmail = process.env.NEXT_PUBLIC_ERP_SUPPORT_EMAIL ?? "support@algt.net";
    const displayName = validated.full_name || validated.email;

    if (validated.send_invite_email && inviteLink) {
      // Invite flow: use USER_INVITE_LINK ERP template, fallback to inline HTML
      try {
        const emailProvider = await getDefaultEmailProvider();
        let subject = `You have been invited to ${companyName}`;
        let htmlBody: string | undefined;
        let textBody: string;

        try {
          const { renderNotificationTemplate } = await import("@/server/actions/notifications/templates");
          const rendered = await renderNotificationTemplate("USER_INVITE_LINK", {
            display_name: displayName,
            action_link: inviteLink,
            company_name: companyName,
            support_email: supportEmail,
            expiry_note: "This link expires in 24 hours.",
          });
          if (rendered.success && rendered.data) {
            subject = rendered.data.subject;
            htmlBody = rendered.data.htmlBody ?? undefined;
            textBody = rendered.data.textBody;
          } else {
            // Fallback to inline template
            htmlBody = buildInviteEmailHtml({ displayName, inviteLink });
            textBody = buildInviteEmailText({ displayName, inviteLink });
          }
        } catch {
          htmlBody = buildInviteEmailHtml({ displayName, inviteLink });
          textBody = buildInviteEmailText({ displayName, inviteLink });
        }

        await emailProvider.sendEmail({
          to: [validated.email],
          subject,
          htmlBody,
          textBody,
          metadata: { feature: "USER_INVITE_LINK", user_profile_id: profile.id },
        });

        await logAudit({
          module_code: "users",
          entity_name: "user_profiles",
          entity_id: profile.id,
          entity_reference: validated.email,
          action: "USER_INVITE_EMAIL_SENT",
          new_values: { template_code: "USER_INVITE_LINK", success: true },
        });
      } catch (emailErr) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        logger.warn("Invite email send failed:", msg);
        emailWarning = `User created but invite email could not be sent: ${msg}`;
      }
    } else if (!validated.send_invite_email) {
      // Temp password mode — queue welcome email via ERP email queue
      try {
        const { queueEmail } = await import("@/server/actions/notifications/email-queue");
        const { renderNotificationTemplate } = await import("@/server/actions/notifications/templates");
        const rendered = await renderNotificationTemplate("USER_WELCOME_INTERNAL", {
          display_name: displayName,
          login_url: `${siteUrl}/login`,
          company_name: companyName,
          support_email: supportEmail,
        });
        if (rendered.success && rendered.data) {
          await queueEmail({
            source_module: "users",
            source_entity_type: "user_profile",
            source_entity_id: profile.id,
            priority: "normal",
            to_emails: [validated.email],
            subject: rendered.data.subject,
            html_body: rendered.data.htmlBody,
            text_body: rendered.data.textBody,
            template_code: "USER_WELCOME_INTERNAL",
            max_attempts: 3,
          }, { autoProcess: true });
          await logAudit({
            module_code: "users",
            entity_name: "user_profiles",
            entity_id: profile.id,
            entity_reference: validated.email,
            action: "USER_WELCOME_EMAIL_SENT",
            new_values: { template_code: "USER_WELCOME_INTERNAL", success: true },
          });
        }
      } catch (emailErr) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        logger.warn("Welcome email queue failed (non-fatal):", msg);
        emailWarning = `User created but welcome email could not be queued: ${msg}`;
      }
    }

    // 7. Log audit
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: profile.id,
      entity_reference: validated.email,
      action: "USER_CREATED",
      old_values: null,
      new_values: {
        email: validated.email,
        full_name: validated.full_name,
        status: validated.status,
        auth_method: validated.send_invite_email ? "invite_email" : "temporary_password",
        must_change_password: true,
      },
      owner_company_id: validated.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? undefined,
    });

    // 8. Revalidate
    revalidatePath("/admin/users");

    return {
      success: true,
      data: { user_profile_id: profile.id },
      ...(emailWarning ? { error: emailWarning } : {}),
    };
  } catch (error) {
    logger.error("createUser exception", error);
    return { success: false, error: sanitizeServerActionError(error) };
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
    if (!canManageUsers(ctx)) {
      await logAudit({
        module_code: "users", entity_name: "user_roles", entity_id: 0,
        entity_reference: `role-assign`, action: "UNAUTHORIZED_ACCESS_ATTEMPT",
        new_values: { attempted_action: "assignRoleToUser", required_permission: "users.update" },
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
    if (!canManageUsers(ctx)) {
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

// ---------------------------------------------------------------------------
// Email template helpers (invite only — plain, no external assets)
// ---------------------------------------------------------------------------

function buildInviteEmailHtml({
  displayName,
  inviteLink,
}: {
  displayName: string;
  inviteLink: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#0f172a;padding:24px 32px;">
          <span style="color:#f8fafc;font-size:20px;font-weight:700;letter-spacing:.5px;">ALGT ERP</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 12px;font-size:16px;color:#1e293b;font-weight:600;">Hello, ${displayName}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
            You have been invited to access the <strong>ALGT ERP</strong> system. Click the button below to accept your invitation and set your password.
          </p>
          <p style="margin:0 0 28px;text-align:center;">
            <a href="${inviteLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">
              Accept Invitation
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 24px;font-size:11px;color:#94a3b8;word-break:break-all;">${inviteLink}</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            This link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildInviteEmailText({
  displayName,
  inviteLink,
}: {
  displayName: string;
  inviteLink: string;
}): string {
  return `Hello, ${displayName}

You have been invited to access the ALGT ERP system.

Accept your invitation here:
${inviteLink}

This link expires in 24 hours.

If you did not expect this invitation, you can safely ignore this email.`;
}
