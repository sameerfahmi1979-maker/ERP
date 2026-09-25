"use server";

import "server-only";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, assertAccountActive, hasGlobalPermission, hasPermissionInScope, isGlobalAdmin } from "@/lib/rbac/check";
import { authEmailSchema, passwordPolicySchema } from "@/lib/validation/auth";
import { performPasswordChange, type PasswordChangeResult } from "@/lib/auth/password-change";
import { buildPasswordEmailLink } from "@/lib/auth/password-flow";
import { issueAccountInvitation } from "@/lib/auth/invitations";
import { allowSecurityRequest, sendSecurityTemplate } from "@/lib/auth/security-email";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";

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


const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
const variablesFor = (name: string) => ({
  display_name: name,
  company_name: process.env.NEXT_PUBLIC_ERP_COMPANY_NAME ?? "ALGT ERP",
  support_email: process.env.NEXT_PUBLIC_ERP_SUPPORT_EMAIL ?? "support@algt.net",
  login_url: new URL("/login", SITE_URL).href,
  expiry_note: "This one-time link expires. If it no longer works, request a new link.",
});

async function securityTarget(userProfileId: number) {
  if (!Number.isSafeInteger(userProfileId) || userProfileId <= 0) throw new Error("Invalid target");
  const ctx = await getAuthContext();
  assertAccountActive(ctx);
  const admin = createAdminClient();
  const { data: target, error } = await admin.from("user_profiles").select("*").eq("id", userProfileId).maybeSingle();
  if (error || !target) throw new Error("Target is not available");
  const allowed = target.owner_company_id == null
    ? hasGlobalPermission(ctx, "users.security.manage")
    : hasPermissionInScope(ctx, "users.security.manage", target.owner_company_id, target.branch_id);
  if (!allowed) throw new Error("Not authorized for this account");
  // A company administrator cannot take over a globally privileged identity.
  if (!isGlobalAdmin(ctx)) {
    const { data: roles, error: roleError } = await admin.from("user_roles")
      .select("roles!inner(role_code)").eq("user_profile_id", userProfileId).eq("is_active", true).is("owner_company_id", null).is("branch_id", null);
    if (roleError || (roles ?? []).some(r => ["system_admin","group_admin"].includes((r.roles as unknown as { role_code: string })?.role_code))) throw new Error("Privileged account requires a global administrator");
  }
  const { data: identity, error: identityError } = await admin.auth.admin.getUserById(target.auth_user_id);
  if (identityError || !identity.user) throw new Error("Target identity could not be verified");
  return { ctx, target, user: identity.user, admin };
}

async function updateSecurityFields(userProfileId: number, fields: Record<string, unknown>) {
  const { data, error } = await createAdminClient().from("user_profiles").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", userProfileId).select("id").maybeSingle();
  if (error || !data) throw new Error("Security state could not be saved");
}

async function securityAudit(profileId: number, action: string, details: Record<string, unknown>) {
  const receipt = await logAudit({ module_code: "users", entity_name: "user_profiles", entity_id: profileId, entity_reference: String(profileId), action, new_values: details });
  if (!receipt.success) logger.warn("Security audit receipt unavailable", { profileId, action });
  return receipt.success;
}

export async function getUserSecurityStatus(userProfileId: number): Promise<ActionResult<UserSecurityStatus>> {
  try {
    const { target: p, user } = await securityTarget(userProfileId);
    return { success: true, data: {
      user_profile_id: p.id, must_change_password: p.must_change_password === true,
      must_change_password_reason: p.must_change_password_reason, password_changed_at: p.password_changed_at,
      password_reset_sent_at: p.password_reset_sent_at, password_set_by_admin_at: p.password_set_by_admin_at,
      email_confirmed_by_admin_at: p.email_confirmed_by_admin_at,
      last_password_security_action_at: p.last_password_security_action_at,
      last_password_security_action: p.last_password_security_action,
      auth_email: user.email ?? null, email_confirmed_at: user.email_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null, auth_created_at: user.created_at ?? null,
    } };
  } catch { return { success: false, error: "Security details are unavailable or access is denied." }; }
}

/** Generic outward response; durable internal states describe the actual transport outcome. */
export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const generic = { success: true };
  try {
    const parsed = authEmailSchema.safeParse(email);
    if (!parsed.success || !await allowSecurityRequest("recovery", parsed.data)) return generic;
    const admin = createAdminClient();
    const { data: targets, error } = await admin.rpc("f03_recovery_target", { normalized_email: parsed.data });
    const target = targets?.[0];
    if (error || !target) return generic;
    const { data, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email: parsed.data });
    if (linkError || !data.properties?.hashed_token || data.user?.id !== target.auth_user_id) return generic;
    const delivery = await sendSecurityTemplate({ to: parsed.data, profileId: target.profile_id, kind: "recovery",
      variables: { ...variablesFor(target.display_name), action_link: buildPasswordEmailLink(SITE_URL, data.properties.hashed_token, "recovery") } });
    if (delivery.accepted) {
      const { error: stateError } = await admin.from("user_profiles").update({ password_reset_sent_at: new Date().toISOString() }).eq("id", target.profile_id);
      if (stateError) logger.warn("Recovery accepted; timestamp update failed", { attemptId: delivery.attemptId });
    }
  } catch { logger.warn("Recovery request could not be completed"); }
  return generic;
}

export async function changeOwnPassword(input: unknown): Promise<PasswordChangeResult> { return performPasswordChange(input, "self"); }
export async function completeRequiredPasswordChange(input?: unknown): Promise<PasswordChangeResult> { return performPasswordChange(input, "required"); }
export async function recordPasswordResetCompleted(input?: unknown): Promise<PasswordChangeResult> { return performPasswordChange(input, "recovery"); }

async function sendAccountLink(userProfileId: number, requested: "invite" | "recovery"): Promise<ActionResult> {
  try {
    const { target, user, admin } = await securityTarget(userProfileId);
    if (target.status !== "active" || !user.email) return { success: false, error: "Only active accounts with an email can receive a setup link." };
    if (!await allowSecurityRequest("recovery", user.email.toLowerCase())) return { success: false, error: "Too many requests. Please wait before sending another link." };
    // Decide from verified account state; never reinterpret a transient invite error as recovery.
    const flow = requested === "invite" && !user.email_confirmed_at ? "invite" : "recovery";
    let actionLink: string;
    let invitationExpiresAt = "";
    if (flow === "invite") {
      const invitation = await issueAccountInvitation({ profileId: target.id, authUserId: user.id, email: user.email, siteUrl: SITE_URL });
      actionLink = invitation.actionLink;
      invitationExpiresAt = invitation.expiresAt;
    } else {
      const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: user.email });
      if (error || !data.properties?.hashed_token || data.user?.id !== user.id) return { success: false, error: "The setup link could not be generated. No password or account restriction was changed." };
      actionLink = buildPasswordEmailLink(SITE_URL, data.properties.hashed_token, "recovery");
    }
    const result = await sendSecurityTemplate({ to: user.email, profileId: target.id, kind: flow,
      variables: { ...variablesFor(target.display_name ?? target.full_name ?? "User"), action_link: actionLink, invitation_expires_at: invitationExpiresAt } });
    if (!result.accepted) return { success: false, error: "Delivery was not confirmed by the email provider. Check the security-email attempt before retrying; no password or account restriction was changed." };
    const now = new Date().toISOString();
    const { error: stateError } = await admin.from("user_profiles").update({ password_reset_sent_at: now }).eq("id", target.id);
    const audited = await securityAudit(target.id, "USER_SECURITY_EMAIL_PROVIDER_ACCEPTED", { flow, attempt_id: result.attemptId, delivery_state: "provider_accepted", inbox_receipt_verified: false });
    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true, ...(!result.recorded || stateError || !audited ? { error: "Provider accepted the message, but a record update needs review. Do not resend automatically." } : {}) };
  } catch { return { success: false, error: "The security email could not be sent or access was denied." }; }
}

export async function adminSendPasswordResetEmail(userProfileId: number): Promise<ActionResult> { return sendAccountLink(userProfileId, "recovery"); }
export async function adminGenerateAndSendInviteEmail(userProfileId: number): Promise<ActionResult> { return sendAccountLink(userProfileId, "invite"); }
/** Welcome now sends setup instructions. It never changes or emails a user's password. */
export async function adminSendWelcomeEmail(userProfileId: number): Promise<ActionResult> { return sendAccountLink(userProfileId, "invite"); }

export async function adminSetTemporaryPassword(userProfileId: number, password?: string): Promise<ActionResult<{ generatedPassword?: string }>> {
  let passwordChanged = false;
  try {
    const { ctx, target, admin } = await securityTarget(userProfileId);
    const finalPassword = password ?? (randomBytes(24).toString("base64url") + "aA9!");
    if (!passwordPolicySchema.safeParse(finalPassword).success) return { success: false, error: "Password must be 10–128 characters and include uppercase, lowercase and a digit." };
    // Gate first: if Auth succeeds and subsequent metadata fails, access cannot remain unlocked.
    const now = new Date().toISOString();
    await updateSecurityFields(target.id, { must_change_password: true, last_password_security_action: "temp_password_requested", last_password_security_action_at: now, last_password_security_action_by: ctx.profile!.id });
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: finalPassword });
    if (error) return { success: false, error: "Password was not changed. The account remains restricted until an administrator reviews it." };
    passwordChanged = true;
    await updateSecurityFields(target.id, { password_set_by_admin_at: now, last_password_security_action: "temp_password_set_by_admin" });
    const audited = await securityAudit(target.id, "USER_SECURITY_TEMP_PASSWORD_SET", { generated: password === undefined, must_change_password: true });
    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true, data: password === undefined ? { generatedPassword: finalPassword } : {}, ...(!audited ? { error: "Password changed; audit persistence needs review." } : {}) };
  } catch { return { success: false, error: passwordChanged ? "Password changed, but account synchronization needs review. Do not reset it again automatically." : "Password operation failed or access was denied." }; }
}

export async function adminForcePasswordChange(userProfileId: number, reason?: string | null, sendNotice?: boolean): Promise<ActionResult> {
  try {
    const parsed = z.string().max(500).nullable().optional().safeParse(reason);
    if (!parsed.success) return { success: false, error: "Reason must not exceed 500 characters." };
    const { ctx, target, user } = await securityTarget(userProfileId);
    await updateSecurityFields(target.id, { must_change_password: true, must_change_password_reason: parsed.data ?? null,
      last_password_security_action: "force_change_set_by_admin", last_password_security_action_at: new Date().toISOString(), last_password_security_action_by: ctx.profile!.id });
    let delivered = !sendNotice;
    if (sendNotice && user.email) delivered = (await sendSecurityTemplate({ to: user.email, profileId: target.id, kind: "notice",
      variables: { ...variablesFor(target.display_name ?? target.full_name ?? "User"), reason: parsed.data ?? "Security policy update" } })).accepted;
    const audited = await securityAudit(target.id, "USER_SECURITY_FORCE_CHANGE_SET", { notice_requested: !!sendNotice, provider_accepted: !!sendNotice && delivered });
    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true, ...(!delivered || !audited ? { error: "Password change is required, but the notice or audit record needs review." } : {}) };
  } catch { return { success: false, error: "Could not require a password change or access was denied." }; }
}

export async function adminClearForcePasswordChange(userProfileId: number): Promise<ActionResult> {
  try {
    const { ctx, target } = await securityTarget(userProfileId);
    await updateSecurityFields(target.id, { must_change_password: false, must_change_password_reason: null, last_password_security_action: "force_change_cleared_by_admin",
      last_password_security_action_at: new Date().toISOString(), last_password_security_action_by: ctx.profile!.id });
    const audited = await securityAudit(target.id, "USER_SECURITY_FORCE_CHANGE_CLEARED", { explicit_admin_override: true });
    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true, ...(!audited ? { error: "Restriction cleared; audit record needs review." } : {}) };
  } catch { return { success: false, error: "Could not clear the restriction or access was denied." }; }
}

export async function adminConfirmUserEmail(userProfileId: number): Promise<ActionResult> {
  let confirmed = false;
  try {
    const { ctx, target, admin } = await securityTarget(userProfileId);
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { email_confirm: true });
    if (error) return { success: false, error: "Email confirmation failed." };
    confirmed = true;
    const now = new Date().toISOString();
    await updateSecurityFields(target.id, { email_confirmed_by_admin_at: now, email_confirmed_by_admin_id: ctx.profile!.id,
      last_password_security_action: "email_confirmed_by_admin", last_password_security_action_at: now, last_password_security_action_by: ctx.profile!.id });
    const audited = await securityAudit(target.id, "USER_SECURITY_EMAIL_CONFIRMED_BY_ADMIN", { success: true });
    revalidatePath(`/admin/users/record/${userProfileId}`);
    return { success: true, ...(!audited ? { error: "Email confirmed; audit record needs review." } : {}) };
  } catch { return { success: false, error: confirmed ? "Email was confirmed, but metadata needs administrator review." : "Email confirmation failed or access was denied." }; }
}
