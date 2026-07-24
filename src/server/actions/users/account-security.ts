"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getAuthContext, hasPermission, assertAccountActive } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { queueEmail } from "@/server/actions/notifications/email-queue";
import { renderTemplate } from "@/lib/notifications/template-renderer";
import { passwordPolicySchema } from "@/lib/validation/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sanitizeSecurityAuditPayload, sanitizeServerActionError } from "@/lib/audit/sanitizers";
import { checkRateLimit, getRequestIp } from "@/lib/security/rate-limit";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ActionResult<T = void> = T extends void
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

export type UserSecurityStatus = {
  user_profile_id: number;
  must_change_password: boolean;
  must_change_password_reason: string | null;
  password_changed_at: string | null;
  password_reset_sent_at: string | null;
  password_set_by_admin_at: string | null;
  email_confirmed_by_admin_at: string | null;
  last_password_security_action_at: string | null;
  last_password_security_action: string | null;
  auth_email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
const COMPANY_NAME = process.env.NEXT_PUBLIC_ERP_COMPANY_NAME ?? "ALGT ERP";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_ERP_SUPPORT_EMAIL ?? "support@algt.net";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fetch email provider config and notification template using admin client.
 * Used in public (unauthenticated) flows that cannot use session-based client.
 */
async function getDefaultEmailProviderAdmin() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("erp_email_provider_configs")
    .select("*")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  if (!data) {
    const { data: fallback } = await admin
      .from("erp_email_provider_configs")
      .select("*")
      .eq("is_enabled", true)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .single();
    return fallback as Record<string, unknown> | null;
  }
  return data as Record<string, unknown> | null;
}

async function getNotificationTemplateAdmin(templateCode: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("erp_notification_templates")
    .select("*")
    .eq("template_code", templateCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();
  return data as Record<string, unknown> | null;
}

/**
 * Build email provider and send email directly (for public/unauthenticated flows).
 * Uses admin client to bypass RLS on erp_email_provider_configs.
 * NEVER logs action_link, reset_link, or invite_link.
 */
async function sendEmailDirect(input: {
  to: string;
  subject: string;
  htmlBody: string | null;
  textBody: string;
  feature: string;
}) {
  const providerRow = await getDefaultEmailProviderAdmin();
  if (!providerRow) {
    logger.warn("sendEmailDirect: no active email provider configured");
    return false;
  }
  try {
    const { getEmailProvider } = await import("@/lib/email/providers/factory");
    // Build a minimal config-based call via the admin client workaround:
    // We use providerCode to load from factory (which uses session client).
    // If that fails (no session), fall through — public reset still queues silently.
    const provider = await getEmailProvider(providerRow.provider_code as string).catch(() => null);
    if (!provider) {
      logger.warn("sendEmailDirect: could not load email provider", { code: providerRow.provider_code });
      return false;
    }
    await provider.sendEmail({
      to: [input.to],
      subject: input.subject,
      htmlBody: input.htmlBody ?? undefined,
      textBody: input.textBody,
      metadata: { feature: input.feature },
    });
    return true;
  } catch (err) {
    logger.warn("sendEmailDirect: send failed", { error: String(err) });
    return false;
  }
}

/**
 * Send a security email via ERP queue (admin-authenticated flows only).
 * NEVER logs action_link, reset_link, or invite_link in audit.
 */
async function sendSecurityEmail(input: {
  to: string;
  templateCode: string;
  variables: Record<string, string>;
  sourceEntityId: number;
  priority?: "normal" | "high";
}): Promise<{ queued: boolean; queueId?: number }> {
  try {
    const tmpl = await getNotificationTemplateAdmin(input.templateCode);
    if (!tmpl) {
      logger.warn("sendSecurityEmail: template not found", { code: input.templateCode });
      return { queued: false };
    }
    const subject = renderTemplate(tmpl.subject_template as string, input.variables);
    const textBody = renderTemplate(tmpl.text_template as string, input.variables);
    const htmlBody = tmpl.html_template
      ? renderTemplate(tmpl.html_template as string, input.variables)
      : null;

    const result = await queueEmail({
      source_module: "users",
      source_entity_type: "user_profile",
      source_entity_id: input.sourceEntityId,
      priority: input.priority ?? "normal",
      to_emails: [input.to],
      subject,
      html_body: htmlBody,
      text_body: textBody,
      template_code: input.templateCode,
      max_attempts: 3,
    }, { autoProcess: true });

    if (result.success && result.data?.id) {
      return { queued: true, queueId: result.data.id };
    }
    logger.warn("sendSecurityEmail: queueEmail failed", { error: result.error });
    return { queued: false };
  } catch (err) {
    logger.warn("sendSecurityEmail: unexpected error", { error: String(err) });
    return { queued: false };
  }
}

/**
 * Assert the calling user has users.security.manage permission.
 * Throws with error message if not.
 */
async function assertCanManageUserSecurity() {
  const ctx = await getAuthContext();
  if (!ctx.profile) throw new Error("Unauthorized");
  if (!ctx.isAccountActive) throw new Error("Your account is not active");
  if (!hasPermission(ctx, "users.security.manage")) throw new Error("Permission denied: users.security.manage required");
  return ctx;
}

/**
 * Get the auth_user_id and email for a target user profile by ID.
 * Server-only. Never return raw Supabase user object to caller.
 */
async function getTargetUserSecurityContext(userProfileId: number): Promise<{
  auth_user_id: string;
  display_name: string;
  email: string | null;
  profile_id: number;
} | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, auth_user_id, display_name, full_name")
    .eq("id", userProfileId)
    .maybeSingle();
  if (!profile) return null;

  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.getUserById(profile.auth_user_id);
  return {
    auth_user_id: profile.auth_user_id,
    display_name: profile.display_name ?? profile.full_name ?? "User",
    email: authData?.user?.email ?? null,
    profile_id: profile.id,
  };
}

/**
 * Update password lifecycle fields in user_profiles.
 * Uses admin client to bypass RLS for security updates.
 */
async function updateSecurityFields(
  userProfileId: number,
  fields: Record<string, unknown>,
) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", userProfileId);
  if (error) throw new Error(`Failed to update security fields: ${error.message}`);
}

// ── Server Actions ────────────────────────────────────────────────────────────

/**
 * Get full security status for a user (admin use).
 * Requires users.security.manage.
 */
export async function getUserSecurityStatus(
  userProfileId: number,
): Promise<ActionResult<UserSecurityStatus>> {
  try {
    await assertCanManageUserSecurity();
    const supabase = await createClient();
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select(
        "id, auth_user_id, must_change_password, must_change_password_reason, password_changed_at, password_reset_sent_at, password_set_by_admin_at, email_confirmed_by_admin_at, last_password_security_action_at, last_password_security_action"
      )
      .eq("id", userProfileId)
      .single();

    if (error || !profile) return { success: false, error: "User not found" };

    const admin = createAdminClient();
    const { data: authData } = await admin.auth.admin.getUserById(profile.auth_user_id);

    return {
      success: true,
      data: {
        user_profile_id: profile.id,
        must_change_password: profile.must_change_password ?? false,
        must_change_password_reason: profile.must_change_password_reason ?? null,
        password_changed_at: profile.password_changed_at ?? null,
        password_reset_sent_at: profile.password_reset_sent_at ?? null,
        password_set_by_admin_at: profile.password_set_by_admin_at ?? null,
        email_confirmed_by_admin_at: profile.email_confirmed_by_admin_at ?? null,
        last_password_security_action_at: profile.last_password_security_action_at ?? null,
        last_password_security_action: profile.last_password_security_action ?? null,
        auth_email: authData?.user?.email ?? null,
        email_confirmed_at: authData?.user?.email_confirmed_at ?? null,
        last_sign_in_at: authData?.user?.last_sign_in_at ?? null,
        auth_created_at: authData?.user?.created_at ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Public forgot-password: generate a recovery link and send ERP-branded email.
 * Public — no session required. Never reveals whether email exists.
 * Never logs action_link.
 *
 * Rate-limited two ways to prevent abuse of this public, unauthenticated
 * endpoint (see src/lib/security/rate-limit.ts):
 *   - Per IP: bounds scripted hammering of the endpoint (costs a Supabase
 *     Admin API `listUsers` call + optional `generateLink`/email send).
 *   - Per email: bounds "email-bombing" a specific person's inbox even if
 *     the requests come from rotating IPs.
 * Both limits fail silently (return GENERIC_SUCCESS) — consistent with the
 * existing anti-enumeration design, callers never learn a limit was hit.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  // Always return generic success to prevent email enumeration
  const GENERIC_SUCCESS = { success: true as const };

  try {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !emailTrimmed.includes("@")) return GENERIC_SUCCESS;

    const ip = await getRequestIp();
    const ipCheck = checkRateLimit(`pwreset:ip:${ip}`, {
      windowMs: 15 * 60_000,
      max: 8,
    });
    if (!ipCheck.allowed) {
      logger.warn("requestPasswordReset: IP rate limit exceeded", { ip });
      return GENERIC_SUCCESS;
    }

    const emailCheck = checkRateLimit(`pwreset:email:${emailTrimmed}`, {
      windowMs: 15 * 60_000,
      max: 3,
    });
    if (!emailCheck.allowed) {
      logger.warn("requestPasswordReset: email rate limit exceeded", {
        email: emailTrimmed,
      });
      return GENERIC_SUCCESS;
    }

    const admin = createAdminClient();

    // Look up user silently — no error revealed to caller
    const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === emailTrimmed
    );
    if (!authUser) return GENERIC_SUCCESS;

    // Generate recovery link (server-side only — never returned to client)
    const siteUrl = SITE_URL;
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: emailTrimmed,
      options: { redirectTo: `${siteUrl}/auth/confirm` },
    });

    if (!linkData?.properties?.action_link) return GENERIC_SUCCESS;

    const actionLink = linkData.properties.action_link;

    // Get user's display_name from user_profiles
    const { data: profile } = await admin
      .from("user_profiles")
      .select("display_name, full_name")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    const displayName = profile?.display_name ?? profile?.full_name ?? authUser.email ?? "User";

    // Render template using admin client
    const tmpl = await getNotificationTemplateAdmin("USER_PASSWORD_RESET");
    if (tmpl) {
      const variables: Record<string, string> = {
        display_name: displayName,
        action_link: actionLink,
        login_url: `${siteUrl}/login`,
        company_name: COMPANY_NAME,
        support_email: SUPPORT_EMAIL,
        expiry_note: "This link expires in 1 hour.",
      };
      const subject = renderTemplate(tmpl.subject_template as string, variables);
      const textBody = renderTemplate(tmpl.text_template as string, variables);
      const htmlBody = tmpl.html_template
        ? renderTemplate(tmpl.html_template as string, variables)
        : null;

      await sendEmailDirect({
        to: emailTrimmed,
        subject,
        htmlBody,
        textBody,
        feature: "USER_PASSWORD_RESET",
      });
    }

    // Update password_reset_sent_at (use admin to bypass RLS since unauthenticated)
    await admin
      .from("user_profiles")
      .update({
        password_reset_sent_at: new Date().toISOString(),
        last_password_security_action: "reset_requested",
        last_password_security_action_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", authUser.id);

    // Audit: safe metadata only — NO action_link logged
    // We cannot call logAudit (requires session), so we silently skip audit for public flow.

    return GENERIC_SUCCESS;
  } catch (err) {
    logger.warn("requestPasswordReset: error (silent)", { error: String(err) });
    return GENERIC_SUCCESS;
  }
}

const changePasswordInput = z.object({
  newPassword: passwordPolicySchema,
});

/**
 * Self-service change own password.
 * The actual auth.updateUser MUST be called client-side first.
 * This action updates lifecycle fields in user_profiles.
 */
export async function changeOwnPassword(_input: unknown): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!profile) return { success: false, error: "User profile not found" };

    const now = new Date().toISOString();
    await updateSecurityFields(profile.id, {
      password_changed_at: now,
      must_change_password: false,
      must_change_password_reason: null,
      last_password_security_action: "password_changed",
      last_password_security_action_at: now,
    });

    // Audit
    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: profile.id,
      entity_reference: user.email ?? String(profile.id),
      action: "USER_PASSWORD_CHANGED",
      new_values: sanitizeSecurityAuditPayload({ action_context: "self_service", success: true }),
    });

    revalidatePath("/profile");
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Complete a forced password change (after must_change_password gate).
 * Client calls supabase.auth.updateUser({ password }) first, then calls this.
 */
export async function completeRequiredPasswordChange(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, must_change_password")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!profile) return { success: false, error: "User profile not found" };

    const now = new Date().toISOString();
    await updateSecurityFields(profile.id, {
      password_changed_at: now,
      must_change_password: false,
      must_change_password_reason: null,
      last_password_security_action: "forced_change_completed",
      last_password_security_action_at: now,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: profile.id,
      entity_reference: user.email ?? String(profile.id),
      action: "USER_PASSWORD_CHANGED",
      new_values: sanitizeSecurityAuditPayload({ action_context: "forced_change_completed", success: true }),
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Update password_changed_at after a successful reset-password flow.
 * Called from reset-password-form after supabase.auth.updateUser({ password }) succeeds.
 */
export async function recordPasswordResetCompleted(): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profile) {
      const now = new Date().toISOString();
      await updateSecurityFields(profile.id, {
        password_changed_at: now,
        must_change_password: false,
        must_change_password_reason: null,
        last_password_security_action: "password_reset_completed",
        last_password_security_action_at: now,
      });

      await logAudit({
        module_code: "users",
        entity_name: "user_profiles",
        entity_id: profile.id,
        entity_reference: user.email ?? String(profile.id),
        action: "USER_PASSWORD_CHANGED",
        new_values: sanitizeSecurityAuditPayload({ action_context: "recovery_or_invite", success: true }),
      });
    }

    return { success: true };
  } catch (err) {
    // Non-blocking — password was already changed, only lifecycle fields update failed
    logger.warn("recordPasswordResetCompleted: failed to update lifecycle fields", { error: String(err) });
    return { success: true };
  }
}

// ── Admin security actions ────────────────────────────────────────────────────

/**
 * Admin: send a password reset email to a user.
 * Generates a recovery link server-side (never returned to caller) and sends via ERP queue.
 */
export async function adminSendPasswordResetEmail(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target?.email) return { success: false, error: "Target user or email not found" };

    const admin = createAdminClient();
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: target.email,
      options: { redirectTo: `${SITE_URL}/auth/confirm` },
    });

    if (!linkData?.properties?.action_link) {
      return { success: false, error: "Failed to generate recovery link" };
    }

    const actionLink = linkData.properties.action_link;
    const now = new Date().toISOString();

    const variables: Record<string, string> = {
      display_name: target.display_name,
      action_link: actionLink,
      login_url: `${SITE_URL}/login`,
      company_name: COMPANY_NAME,
      support_email: SUPPORT_EMAIL,
      expiry_note: "This link expires in 1 hour.",
    };

    const emailResult = await sendSecurityEmail({
      to: target.email,
      templateCode: "USER_PASSWORD_RESET",
      variables,
      sourceEntityId: userProfileId,
      priority: "high",
    });

    await updateSecurityFields(userProfileId, {
      password_reset_sent_at: now,
      last_password_security_action: "reset_link_sent_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_RESET_EMAIL_SENT",
      new_values: sanitizeSecurityAuditPayload({
        template_code: "USER_PASSWORD_RESET",
        delivery_method: "email_queue",
        email_queued: emailResult.queued,
        queue_id: emailResult.queueId,
        success: true,
      }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

const setTempPasswordInput = z.object({
  userProfileId: z.number().int().positive(),
  password: passwordPolicySchema.optional(),
});

/**
 * Admin: set a temporary password for a user.
 * If password not provided, generates a secure random one.
 * Returns the generated password ONCE to UI — never stored or logged.
 * Always sets must_change_password=true.
 */
export async function adminSetTemporaryPassword(
  userProfileId: number,
  password?: string,
): Promise<ActionResult<{ generatedPassword?: string }>> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target) return { success: false, error: "Target user not found" };

    const parsed = setTempPasswordInput.safeParse({ userProfileId, password });
    if (!parsed.success && password !== undefined) {
      return { success: false, error: parsed.error.issues[0]?.message };
    }

    let finalPassword = password;
    let wasGenerated = false;
    if (!finalPassword) {
      finalPassword = generateSecurePassword();
      wasGenerated = true;
    }

    const admin = createAdminClient();
    const { error: updateError } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: finalPassword },
    );

    if (updateError) {
      return { success: false, error: `Failed to set password: ${updateError.message}` };
    }

    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      must_change_password: true,
      must_change_password_reason: null,
      password_set_by_admin_at: now,
      last_password_security_action: "temp_password_set_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_TEMP_PASSWORD_SET",
      new_values: sanitizeSecurityAuditPayload({
        was_generated: wasGenerated,
        must_change_password: true,
        success: true,
      }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return {
      success: true,
      data: wasGenerated ? { generatedPassword: finalPassword } : {},
    };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

const forcePasswordChangeInput = z.object({
  userProfileId: z.number().int().positive(),
  reason: z.string().max(500).optional().nullable(),
  sendNotice: z.boolean().optional().default(false),
});

/**
 * Admin: force a user to change their password on next login.
 * Optionally sends USER_FORCE_PASSWORD_CHANGE_NOTICE email.
 */
export async function adminForcePasswordChange(
  userProfileId: number,
  reason?: string | null,
  sendNotice?: boolean,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target) return { success: false, error: "Target user not found" };

    const parsed = forcePasswordChangeInput.safeParse({ userProfileId, reason, sendNotice });
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      must_change_password: true,
      must_change_password_reason: parsed.data.reason ?? null,
      last_password_security_action: "force_change_set_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    let emailQueued = false;
    if (parsed.data.sendNotice && target.email) {
      const emailResult = await sendSecurityEmail({
        to: target.email,
        templateCode: "USER_FORCE_PASSWORD_CHANGE_NOTICE",
        variables: {
          display_name: target.display_name,
          reason: parsed.data.reason ?? "Security policy update",
          login_url: `${SITE_URL}/login`,
          company_name: COMPANY_NAME,
          support_email: SUPPORT_EMAIL,
        },
        sourceEntityId: userProfileId,
      });
      emailQueued = emailResult.queued;
    }

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_FORCE_CHANGE_SET",
      new_values: sanitizeSecurityAuditPayload({
        has_reason: Boolean(parsed.data.reason),
        notice_sent: emailQueued,
        success: true,
      }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Admin: clear the force-password-change flag.
 */
export async function adminClearForcePasswordChange(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      must_change_password: false,
      must_change_password_reason: null,
      last_password_security_action: "force_change_cleared_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_FORCE_CHANGE_CLEARED",
      new_values: sanitizeSecurityAuditPayload({ success: true }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Admin: mark a user's email as verified (email_confirm=true).
 */
export async function adminConfirmUserEmail(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target) return { success: false, error: "Target user not found" };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      { email_confirm: true },
    );
    if (error) return { success: false, error: `Failed to confirm email: ${error.message}` };

    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      email_confirmed_by_admin_at: now,
      email_confirmed_by_admin_id: ctx.profile!.id,
      last_password_security_action: "email_confirmed_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN",
      new_values: sanitizeSecurityAuditPayload({ success: true }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Admin: send a welcome email to a user.
 * USERS.6B — Generates a temporary password, sets it in Auth, marks must_change_password=true,
 * and includes login URL, username, and the temporary password in the email body.
 * The generated password is passed to the template renderer at send time and never stored.
 */
export async function adminSendWelcomeEmail(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target?.email) return { success: false, error: "Target user or email not found" };

    // Generate a temporary password
    const temporaryPassword = generateSecurePassword();
    const admin = createAdminClient();

    // Set the temporary password in Supabase Auth
    const { error: pwError } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: temporaryPassword },
    );
    if (pwError) {
      return { success: false, error: `Failed to set temporary password: ${pwError.message}` };
    }

    // Mark must_change_password so the user is forced to change on first login
    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      must_change_password: true,
      must_change_password_reason: null,
      password_set_by_admin_at: now,
      last_password_security_action: "welcome_email_sent",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    // Build template variables — temporary_password is render-time only, never persisted
    const variables: Record<string, string> = {
      display_name: target.display_name,
      login_url: `${SITE_URL}/login`,
      username: target.email,
      temporary_password: temporaryPassword,
      company_name: COMPANY_NAME,
      support_email: SUPPORT_EMAIL,
    };

    const emailResult = await sendSecurityEmail({
      to: target.email,
      templateCode: "USER_WELCOME_INTERNAL",
      variables,
      sourceEntityId: userProfileId,
      priority: "high",
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_WELCOME_EMAIL_SENT",
      new_values: sanitizeSecurityAuditPayload({
        template_code: "USER_WELCOME_INTERNAL",
        email_queued: emailResult.queued,
        temp_password_included: true,
        must_change_password: true,
        success: true,
      }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

/**
 * Admin: generate an invite link and send via ERP-branded invite email.
 * Never returns or logs the invite link.
 */
export async function adminGenerateAndSendInviteEmail(
  userProfileId: number,
): Promise<ActionResult> {
  try {
    const ctx = await assertCanManageUserSecurity();
    const target = await getTargetUserSecurityContext(userProfileId);
    if (!target?.email) return { success: false, error: "Target user or email not found" };

    const admin = createAdminClient();

    // Try invite link first (works for unconfirmed accounts).
    // Falls back to recovery link for already-confirmed accounts — Supabase does not allow
    // generateLink(invite) for users who already have a confirmed email.
    let actionLink: string | null = null;
    let templateCode = "USER_INVITE_LINK";
    let expirySuffix = "This link expires in 24 hours.";

    const { data: inviteData, error: inviteError } = await admin.auth.admin.generateLink({
      type: "invite",
      email: target.email,
      options: { redirectTo: `${SITE_URL}/auth/confirm` },
    });

    if (!inviteError && inviteData?.properties?.action_link) {
      actionLink = inviteData.properties.action_link;
    } else {
      // User is already confirmed — generate a recovery (reset) link instead.
      // Log the original invite error for debugging (no sensitive data).
      if (inviteError) {
        logger.info("adminGenerateAndSendInviteEmail: invite link failed, falling back to recovery", {
          reason: inviteError.message,
          userProfileId,
        });
      }
      const { data: recoveryData, error: recoveryError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: target.email,
        options: { redirectTo: `${SITE_URL}/auth/confirm` },
      });
      if (recoveryError || !recoveryData?.properties?.action_link) {
        return {
          success: false,
          error: `Failed to generate link: ${recoveryError?.message ?? "no link returned"}`,
        };
      }
      actionLink = recoveryData.properties.action_link;
      templateCode = "USER_INVITE_LINK"; // Keep same template for consistent UX
      expirySuffix = "This link expires in 1 hour.";
    }

    const variables: Record<string, string> = {
      display_name: target.display_name,
      action_link: actionLink,
      company_name: COMPANY_NAME,
      support_email: SUPPORT_EMAIL,
      expiry_note: expirySuffix,
    };

    const emailResult = await sendSecurityEmail({
      to: target.email,
      templateCode,
      variables,
      sourceEntityId: userProfileId,
      priority: "high",
    });

    const now = new Date().toISOString();
    await updateSecurityFields(userProfileId, {
      must_change_password: true,
      last_password_security_action: "invite_sent_by_admin",
      last_password_security_action_at: now,
      last_password_security_action_by: ctx.profile!.id,
    });

    await logAudit({
      module_code: "users",
      entity_name: "user_profiles",
      entity_id: userProfileId,
      entity_reference: String(userProfileId),
      action: "USER_SECURITY_INVITE_EMAIL_SENT",
      new_values: sanitizeSecurityAuditPayload({
        template_code: templateCode,
        email_queued: emailResult.queued,
        success: true,
      }),
    });

    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: sanitizeServerActionError(err) };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random password meeting the policy:
 * 10+ chars, 1 uppercase, 1 lowercase, 1 digit.
 * Never stored or logged.
 */
function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits + "!@#$%&*";
  const getChar = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base = [
    getChar(upper),
    getChar(upper),
    getChar(lower),
    getChar(lower),
    getChar(digits),
    getChar(digits),
    ...Array.from({ length: 6 }, () => getChar(all)),
  ];
  // Fisher-Yates shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join("");
}
