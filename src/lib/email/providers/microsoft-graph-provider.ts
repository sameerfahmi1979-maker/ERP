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
import type {
  IEmailProvider,
  EmailProviderConfig,
  EmailMessageInput,
  EmailSendResult,
  EmailTestConnectionResult,
} from "./types";

interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class MicrosoftGraphEmailProvider implements IEmailProvider {
  readonly config: EmailProviderConfig;

  constructor(config: EmailProviderConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<{ token: string; durationMs: number }> {
    const { tenantId, clientId, authorityUrl } = this.config;

    // Resolve secret from Vault or env var
    const { secret, error: secretError } = await resolveEmailProviderSecret(this.config.secretRef);
    if (!secret) {
      throw new Error(secretError ?? "Client secret is not configured for this provider.");
    }

    if (!tenantId) throw new Error("tenant_id is not configured for this provider.");
    if (!clientId) throw new Error("client_id is not configured for this provider.");

    const tokenUrl =
      authorityUrl ??
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const start = Date.now();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const durationMs = Date.now() - start;

    if (!res.ok) {
      let errText = "";
      try { errText = await res.text(); } catch { /* ignore */ }
      throw new Error(
        `Microsoft Graph token request failed (${res.status}). ` +
        `Verify tenant_id, client_id, and client_secret. Details: ${errText.slice(0, 300)}`
      );
    }

    const json = (await res.json()) as GraphTokenResponse;
    return { token: json.access_token, durationMs };
  }

  async testConnection(): Promise<EmailTestConnectionResult> {
    const start = Date.now();
    try {
      // Step 1: verify credentials by acquiring an access token
      const { token, durationMs: tokenMs } = await this.getAccessToken();

      const graphBase = this.config.graphBaseUrl ?? "https://graph.microsoft.com/v1.0";
      const senderEmail = this.config.senderEmail;

      // Step 2: verify Mail.Send permission by calling the /me endpoint
      // or /users/{senderEmail} — this only requires the token and User.Read.All
      // We intentionally skip /mailboxSettings (requires MailboxSettings.Read extra permission)
      if (senderEmail) {
        const checkUrl = `${graphBase}/users/${encodeURIComponent(senderEmail)}?$select=id,displayName,mail`;
        const res = await fetch(checkUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          // 403 here means User.Read.All not granted — still report token success
          // Mail.Send can work even without User.Read.All
          return {
            ok: true,
            status: "success",
            message:
              `Token acquired successfully in ${tokenMs}ms. ` +
              `Sender mailbox lookup skipped (requires User.Read.All permission — not required for sending). ` +
              `Use "Send Test Email" to verify full Mail.Send permission.`,
            durationMs: Date.now() - start,
          };
        }

        const userData = await res.json() as Record<string, unknown>;
        const displayName = userData.displayName as string | null;
        return {
          ok: true,
          status: "success",
          message:
            `Connected successfully in ${tokenMs}ms. ` +
            `Sender: ${displayName ?? senderEmail} <${senderEmail}>. ` +
            `Use "Send Test Email" to verify Mail.Send permission end-to-end.`,
          durationMs: Date.now() - start,
        };
      }

      return {
        ok: true,
        status: "success",
        message: `Token acquired successfully in ${tokenMs}ms. Set sender_email then use "Send Test Email" to verify end-to-end delivery.`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        ok: false,
        status: "failed",
        message: String(e),
        durationMs: Date.now() - start,
      };
    }
  }

  async sendEmail(input: EmailMessageInput): Promise<EmailSendResult> {
    const start = Date.now();
    try {
      const { token } = await this.getAccessToken();

      const senderEmail = this.config.senderEmail;
      if (!senderEmail) throw new Error("sender_email is not configured for this provider.");

      const graphBase = this.config.graphBaseUrl ?? "https://graph.microsoft.com/v1.0";
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
        body,
      });

      const durationMs = Date.now() - start;

      if (res.status === 202 || res.ok) {
        const externalMessageId =
          res.headers.get("x-ms-message-id") ??
          res.headers.get("client-request-id") ??
          null;
        return {
          ok: true,
          status: "sent",
          message: "Email sent successfully via Microsoft Graph.",
          externalMessageId,
          durationMs,
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        status: "failed",
        message: `Graph sendMail failed (${res.status}): ${errText.slice(0, 300)}`,
        durationMs,
      };
    } catch (e) {
      return {
        ok: false,
        status: "failed",
        message: String(e),
        durationMs: Date.now() - start,
      };
    }
  }
}
