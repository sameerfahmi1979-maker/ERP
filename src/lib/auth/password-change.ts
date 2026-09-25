import "server-only";
import { z } from "zod";
import { passwordPolicySchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearPasswordFlow, getPasswordFlow } from "./password-flow";
import { logger } from "@/lib/logger";

const inputSchema = z.object({ newPassword: passwordPolicySchema, operationId: z.string().uuid() });
type Mode = "self" | "required" | "recovery";
export type PasswordChangeResult = { success: boolean; error?: string; passwordChanged?: boolean; canStartNewAttempt?: boolean; requiresFreshSignIn?: boolean };

/** The only application path that acknowledges a password change. Never trusts a client receipt. */
export async function performPasswordChange(input: unknown, mode: Mode): Promise<PasswordChangeResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid password request" };
  let passwordChanged = false;
  try {
    const client = await createClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return { success: false, error: "Please sign in again." };
    const { data: claims, error: claimsError } = await client.auth.getClaims();
    const sessionId = claims?.claims.session_id;
    const { data: validSession, error: sessionError } = await client.rpc("f03_current_session_valid");
    if (claimsError || typeof sessionId !== "string" || sessionError || validSession !== true) return { success: false, error: "Please sign in again." };
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from("user_profiles")
      .select("id,status,must_change_password,last_password_security_action_at").eq("auth_user_id", user.id).maybeSingle();
    if (profileError || !profile || profile.status !== "active") return { success: false, error: "Account is not active. Contact your administrator." };
    // A completed recovery consumes its grant. A duplicate acknowledgement must
    // still be idempotent, but only for this same authenticated principal/session.
    const operationId = parsed.data.operationId;
    const { data: completedPrior, error: priorError } = await admin.from("erp_auth_password_operations")
      .select("stage,mode").eq("id", operationId).eq("auth_user_id", user.id).eq("session_id", sessionId).maybeSingle();
    if (priorError) return { success: false, error: "Password operation status is unavailable. Try again later." };
    if (completedPrior?.stage === "completed" && completedPrior.mode === mode) return { success: true, passwordChanged: true };
    if (mode === "self" && profile.must_change_password) return { success: false, error: "Use the required password change screen." };
    const flowHash = mode === "recovery" ? await getPasswordFlow(user.id, sessionId) : null;
    if (mode === "recovery" && !flowHash) return { success: false, error: "This password setup session is invalid or expired. Request a new link." };

    const { error: insertError } = await admin.from("erp_auth_password_operations").insert({
      id: operationId, auth_user_id: user.id, session_id: sessionId, profile_id: profile.id,
      mode, stage: "started", security_version: profile.last_password_security_action_at,
    });
    if (insertError && insertError.code !== "23505") return { success: false, error: "Password change could not start. Try again later." };
    if (insertError) {
      const { data: prior, error } = await admin.from("erp_auth_password_operations").select("stage,mode")
        .eq("id", operationId).eq("auth_user_id", user.id).eq("session_id", sessionId).maybeSingle();
      if (error || !prior || prior.mode !== mode) return { success: false, error: "Another password operation is pending. Contact your administrator if it does not complete." };
      if (prior.stage === "completed") return { success: true, passwordChanged: true };
      if (prior.stage === "failed") return { success: false, canStartNewAttempt: true, error: "The earlier password attempt was rejected. Choose a new password and submit again." };
      if (prior.stage !== "provider_completed") return { success: false, error: "This attempt cannot be repeated safely. Sign in with your current password or contact your administrator." };
      passwordChanged = true;
    } else {
      let changed;
      try {
        changed = await client.auth.updateUser({ password: parsed.data.newPassword });
      } catch {
        await admin.from("erp_auth_password_operations").update({ stage: "needs_reconciliation" }).eq("id", operationId);
        return { success: false, error: "The password service response was interrupted. Do not repeat this attempt; sign in again or contact your administrator." };
      }
      if (changed.error || changed.data.user?.id !== user.id) {
        const rejected = !!changed.error && [400,401,403,422,429].includes(changed.error.status ?? 0);
        const receipt = await admin.from("erp_auth_password_operations").update({ stage: rejected ? "failed" : "needs_reconciliation" }).eq("id", operationId);
        if (rejected && changed.error?.code === "reauthentication_needed") {
          return { success: false, canStartNewAttempt: !receipt.error, requiresFreshSignIn: !receipt.error,
            error: receipt.error ? "Your password was not changed, but this attempt needs administrator review."
              : "For your security, sign in again before choosing a new password. Your password has not changed." };
        }
        return rejected
          ? { success: false, canStartNewAttempt: !receipt.error, error: "The password was not changed. Choose a different password that meets the policy, or sign in again." }
          : { success: false, error: "The password service outcome is uncertain. Sign in again or contact your administrator before another change." };
      }
      passwordChanged = true;
      const { error } = await admin.from("erp_auth_password_operations").update({ stage: "provider_completed", provider_completed_at: new Date().toISOString() }).eq("id", operationId).eq("stage", "started");
      if (error) return { success: false, passwordChanged, error: "Your password changed, but account synchronization needs administrator help. Do not resubmit a new password." };
    }
    // Profile, flow consumption, journal and safe audit are committed in one transaction.
    const { data: completed, error } = await admin.rpc("f03_complete_password_operation", { operation_id: operationId, flow_hash: flowHash });
    if (error || completed !== true) return { success: false, passwordChanged, error: "Your password changed, but account synchronization is pending. Retry this same attempt; if account restrictions changed, contact your administrator." };
    if (mode === "recovery") await clearPasswordFlow();
    return { success: true, passwordChanged };
  } catch {
    logger.warn("password change failed", { mode, passwordChanged });
    return { success: false, passwordChanged, error: passwordChanged ? "Password changed; account synchronization is pending. Contact your administrator." : "Password service unavailable. Please try again later." };
  }
}
