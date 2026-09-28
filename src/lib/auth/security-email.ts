import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultEmailProviderSystem } from "@/lib/email/providers/factory";
import { renderTemplate } from "@/lib/notifications/template-renderer";
import { logger } from "@/lib/logger";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { escapeEmailHtml, renderInvitationEmail, renderRecoveryEmail } from "./invitation-email";

export { escapeEmailHtml } from "./invitation-email";

/** Durable quotas fail closed. No untrusted forwarded-IP header is accepted by default. */
export async function allowSecurityRequest(kind: "login" | "recovery", email: string): Promise<boolean> {
  const admin = createAdminClient();
  const consume = async (key: string, quota: number) => {
    const { data, error } = await admin.rpc("f03_consume_auth_quota", {
      bucket_key: createHash("sha256").update(`f03:${kind}:${key}`).digest("hex"), quota, window_seconds: 900,
    });
    return !error && data === true;
  };
  if (!await consume("global", kind === "recovery" ? 200 : 1000)) return false;
  const trustedHeader = process.env.AUTH_TRUSTED_IP_HEADER;
  if (trustedHeader) {
    const ip = (await headers()).get(trustedHeader)?.trim() ?? "";
    if (!isIP(ip) || !await consume("ip:" + ip, kind === "recovery" ? 8 : 30)) return false;
  }
  return consume("target:" + email, kind === "recovery" ? 3 : 20);
}

export type SecurityEmailResult = { accepted: boolean; attemptId: string; recorded: boolean };
/** Narrow server-owned transport. Tokens/passwords are never persisted to the generic mail queue. */
export async function sendSecurityTemplate(input: {
  to: string; profileId: number; kind: "invite" | "recovery" | "notice";
  variables: Record<string, string>;
}): Promise<SecurityEmailResult> {
  const admin = createAdminClient();
  const attemptId = randomUUID();
  const { error: journalError } = await admin.from("erp_security_email_attempts").insert({ id: attemptId, profile_id: input.profileId, kind: input.kind, state: "requested" });
  if (journalError) return { accepted: false, attemptId, recorded: false };
  let accepted = false;
  let state: "provider_accepted" | "failed" | "unknown" = "failed";
  let transportStarted = false;
  try {
    const templateCode = input.kind === "invite" ? "USER_INVITE_LINK" : input.kind === "recovery" ? "USER_PASSWORD_RESET" : "USER_FORCE_PASSWORD_CHANGE_NOTICE";
    // Authentication links share the F03-owned brand contract. Editable generic
    // templates must not silently downgrade recovery/resend to plain text.
    const { data: template, error } = input.kind !== "notice" ? { data: null, error: null } : await admin.from("erp_notification_templates").select("subject_template,text_template,html_template")
      .eq("template_code", templateCode).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (error) throw new Error("Template lookup failed");
    let subject = renderTemplate(template?.subject_template ?? (input.kind === "invite" ? "Set up your ERP account" : input.kind === "recovery" ? "Reset your ERP password" : "ERP account security notice"), input.variables).replace(/[\r\n]/g, " ");
    const fallback = input.kind === "notice" ? "Hello {{display_name}},\nYour administrator requires a password change.\n{{login_url}}" : "Hello {{display_name}},\nContinue securely to choose your password:\n{{action_link}}\nIf you did not request this, contact your administrator.";
    let textBody = renderTemplate(template?.text_template ?? fallback, input.variables);
    let htmlBody = template?.html_template ? renderTemplate(template.html_template, Object.fromEntries(Object.entries(input.variables).map(([key,value]) => [key, escapeEmailHtml(value)]))) : undefined;
    if (input.kind === "invite" || input.kind === "recovery") {
      const branding = await loadRuntimeAppBranding();
      const presentation = {
        displayName: input.variables.display_name, appName: branding.appName,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net",
        logoPath: branding.assets.app_logo?.publicUrl ?? "/api/branding/public/app_logo",
        actionLink: input.variables.action_link,
        supportEmail: branding.supportEmail ?? process.env.NEXT_PUBLIC_ERP_SUPPORT_EMAIL,
      };
      ({ subject, textBody, htmlBody } = input.kind === "invite"
        ? renderInvitationEmail({ ...presentation, expiresAt: input.variables.invitation_expires_at })
        : renderRecoveryEmail(presentation));
    }
    const provider = await getDefaultEmailProviderSystem();
    transportStarted = true;
    const result = await provider.sendEmail({ to: [input.to], subject, textBody, htmlBody, metadata: { feature: templateCode, attempt_id: attemptId } });
    accepted = result.ok === true && result.status === "sent";
    // Adapters may turn an interrupted request into { ok:false }; that is not
    // proof of non-delivery. Only a skipped send is a definite non-send here.
    state = accepted ? "provider_accepted" : result.status === "skipped" ? "failed" : "unknown";
  } catch {
    // A transport exception may occur after acceptance; no automatic resend.
    state = transportStarted ? "unknown" : "failed";
    logger.warn("Security-email attempt needs review", { attemptId, kind: input.kind });
  }
  const { error } = await admin.from("erp_security_email_attempts").update({ state, completed_at: new Date().toISOString() }).eq("id", attemptId);
  if (error) logger.warn("Security-email receipt could not be recorded", { attemptId, accepted });
  return { accepted, attemptId, recorded: !error };
}
