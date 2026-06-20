"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit, createAuditDiff } from "@/server/actions/audit";
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
        console.error("generateLink invite error", linkError);
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
        console.error("createUser error", createError);
        return { success: false, error: `Failed to create user: ${createError.message}` };
      }
      authUser = data.user;
    }

    if (!authUser) {
      return { success: false, error: "Failed to create Auth user" };
    }

    // 4. Create user profile (upsert — the auth trigger may have already inserted a minimal row)
    const supabase = await createClient();
    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .upsert(
        {
          auth_user_id: authUser.id,
          full_name: validated.full_name,
          display_name: validated.display_name,
          phone: validated.phone,
          job_title: validated.job_title,
          department: validated.department,
          owner_company_id: validated.owner_company_id,
          branch_id: validated.branch_id,
          status: validated.status,
        },
        { onConflict: "auth_user_id" }
      )
      .select("id")
      .single();

    if (profileError || !profile) {
      console.error("user_profiles upsert error", profileError);
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

    // 6. Send invite email via ERP email provider (Microsoft Graph)
    let inviteEmailWarning: string | undefined;
    if (validated.send_invite_email && inviteLink) {
      try {
        const emailProvider = await getDefaultEmailProvider();
        const displayName = validated.full_name || validated.email;
        await emailProvider.sendEmail({
          to: [validated.email],
          subject: "You have been invited to ALGT ERP",
          htmlBody: buildInviteEmailHtml({ displayName, inviteLink }),
          textBody: buildInviteEmailText({ displayName, inviteLink }),
          metadata: { feature: "USER_INVITE", user_profile_id: profile.id },
        });
      } catch (emailErr) {
        // Don't fail the user creation — the admin can resend manually
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        console.warn("Invite email send failed:", msg);
        inviteEmailWarning = `User created but invite email could not be sent: ${msg}`;
      }
    }

    // 7. Log audit
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
        invite_email_sent: validated.send_invite_email && !inviteEmailWarning,
      },
      owner_company_id: validated.owner_company_id ?? undefined,
      branch_id: validated.branch_id ?? undefined,
    });

    // 8. Revalidate
    revalidatePath("/admin/users");

    return {
      success: true,
      data: { user_profile_id: profile.id },
      ...(inviteEmailWarning ? { error: inviteEmailWarning } : {}),
    };
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
    if (!hasPermission(ctx, "users.manage")) {
      return { success: false, error: "You do not have permission to delete users" };
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

    // 4. Log audit before deletion (so we have a record)
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: profile.user_code || `user-${userProfileId}`,
      action: "delete",
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
        console.error("deleteUser auth error", deleteAuthError);
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
    console.error("deleteUser exception", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
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
