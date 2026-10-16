// ============================================================================
// Microsoft Graph Email Provider
// Phase: ERP SETTINGS.2 / SETTINGS.2B (Vault upgrade)
//
// Uses client credentials flow (application permission, Mail.Send) to send
// email server-side via Microsoft Graph API.
//
// Secret resolution order:
//   1. Supabase Vault  (secret_ref = "vault:<uuid>")  ← preferred, set via UI
//   2. Environment variable  (secret_ref = "ENV_VAR_NAME")  ← dev fallback
//
// No SDK dependency: uses native fetch for portability and minimal bundle.
// ============================================================================

import { resolveEmailProviderSecret } from "../vault";
import { graphEndpoints, ProviderConfigurationError, safeProviderFailure } from "@/lib/settings/provider-endpoints";
import type {
  EmailMessageInput,
  EmailProviderConfig,
  EmailSendResult,
  EmailTestConnectionResult,
  IEmailProvider,
} from "./types";

export class MicrosoftGraphEmailProvider implements IEmailProvider {
  readonly config: EmailProviderConfig;

  constructor(config: EmailProviderConfig) {
    this.config = config;
  }

  private async getAccessToken(signal: AbortSignal): Promise<string> {
    const endpoints = graphEndpoints(this.config);
    const { secret } = await resolveEmailProviderSecret(this.config.secretRef, this.config.id);
    if (!secret) throw new ProviderConfigurationError("Provider credentials are not available. Ask an authorized administrator to review the protected credential configuration.");
    const res = await fetch(endpoints.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId!, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString(),
      redirect: "error", signal,
    });
    if (res.status !== 200) throw new ProviderConfigurationError(`Microsoft authentication failed (HTTP ${res.status}). Review the protected credentials and tenant/application settings.`);
    const json: unknown = await res.json();
    if (!json || typeof json !== "object" || !("access_token" in json) || typeof json.access_token !== "string" || !json.access_token.trim())
      throw new ProviderConfigurationError("Microsoft returned an unexpected authentication response. No email operation was performed.");
    return json.access_token;
  }

  async testConnection(): Promise<EmailTestConnectionResult> {
    const start = Date.now();
    const result = (ok: boolean, message: string): EmailTestConnectionResult => ({ok, status: ok ? "success" : "failed", message, durationMs: Date.now() - start});
    try {
      const endpoints = graphEndpoints(this.config);
      const signal = AbortSignal.timeout(15000);
      const token = await this.getAccessToken(signal);
      const res = await fetch(`${endpoints.graph}/users/${encodeURIComponent(this.config.senderEmail!)}?$select=id`, {
        headers: {Authorization: `Bearer ${token}`}, redirect: "error", signal,
      });
      if (res.status === 403) return result(false, "Credentials were accepted, but the optional sender-directory lookup was not authorized. This does not establish whether Mail.Send is permitted; do not grant broad directory access just to pass this check.");
      if (res.status !== 200) return result(false, `Sender-directory check failed (HTTP ${res.status}). Mail.Send permission and email delivery are not verified.`);
      const user: unknown = await res.json();
      if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string" || !user.id) return result(false, "Microsoft returned unexpected sender information. Readiness was not verified.");
      return result(true, "Credentials and sender-directory entry verified. Mail.Send permission and email delivery have not been tested.");
    } catch (error) { return result(false, safeProviderFailure(error)); }
  }

  async sendEmail(input: EmailMessageInput): Promise<EmailSendResult> {
    const start = Date.now();
    try {
      if (!this.config.isEnabled) throw new ProviderConfigurationError("This email provider is disabled.");
      const endpoints = graphEndpoints(this.config);
      const signal = AbortSignal.timeout(30000);
      const token = await this.getAccessToken(signal);

      const senderEmail = this.config.senderEmail;
      if (!senderEmail) throw new ProviderConfigurationError("The sender address is not configured.");

      const graphBase = endpoints.graph;
      const sendUrl = `${graphBase}/users/${encodeURIComponent(senderEmail)}/sendMail`;

      const body = JSON.stringify({
        message: {
          subject: input.subject,
          body: {
            contentType: input.htmlBody ? "HTML" : "Text",
            content: input.htmlBody ?? input.textBody ?? "",
          },
          toRecipients: input.to.map((addr) => ({
            emailAddress: { address: addr },
          })),
          ...(input.cc?.length
            ? { ccRecipients: input.cc.map((a) => ({ emailAddress: { address: a } })) }
            : {}),
          ...(input.bcc?.length
            ? { bccRecipients: input.bcc.map((a) => ({ emailAddress: { address: a } })) }
            : {}),
          ...(input.replyTo
            ? { replyTo: [{ emailAddress: { address: input.replyTo } }] }
            : {}),
          ...(input.attachments?.length
            ? {
                attachments: input.attachments.map((a) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: a.filename,
                  contentType: a.contentType,
                  contentBytes: a.base64Content,
                })),
              }
            : {}),
        },
        saveToSentItems: input.saveToSentItems ?? true,
      });

      const res = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body, redirect: "error", signal,
      });

      const durationMs = Date.now() - start;

      if (res.status === 202) {
        const externalMessageId =
          res.headers.get("x-ms-message-id") ??
          res.headers.get("client-request-id") ??
          null;
        return {
          ok: true,
          status: "sent",
          message: "Microsoft Graph accepted the email for processing. Inbox delivery is not confirmed.",
          externalMessageId,
          durationMs,
        };
      }

      return {
        ok: false,
        status: "failed",
        message: `Microsoft Graph did not confirm email acceptance (HTTP ${res.status}). Check provider activity before retrying.`,
        durationMs,
      };
    } catch (e) {
      return {
        ok: false,
        status: "failed",
        message: e instanceof ProviderConfigurationError ? e.message : "Email submission was not confirmed. Check provider activity before retrying; an interrupted response does not prove the email was unsent.",
        durationMs: Date.now() - start,
      };
    }
  }
}
