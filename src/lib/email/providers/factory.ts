// ============================================================================
// ERP Email Provider Factory
// Phase: ERP SETTINGS.2
//
// Usage (future modules):
//   import { getEmailProvider, sendEmailViaProvider } from "@/lib/email/providers/factory";
//   const provider = await getEmailProvider("M365_DEFAULT");
//   const result = await provider.sendEmail({ to: [...], subject: "...", textBody: "..." });
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { IEmailProvider, EmailProviderConfig, EmailMessageInput, EmailSendResult } from "./types";
import { MicrosoftGraphEmailProvider } from "./microsoft-graph-provider";

function rowToConfig(row: Record<string, unknown>): EmailProviderConfig {
  return {
    id: row.id as number,
    providerCode: row.provider_code as string,
    providerType: row.provider_type as EmailProviderConfig["providerType"],
    providerName: row.provider_name as string,
    isDefault: row.is_default as boolean,
    isEnabled: row.is_enabled as boolean,
    isActive: row.is_active as boolean,
    tenantId: row.tenant_id as string | null,
    clientId: row.client_id as string | null,
    authorityUrl: row.authority_url as string | null,
    graphBaseUrl: row.graph_base_url as string | null,
    senderEmail: row.sender_email as string | null,
    senderDisplayName: row.sender_display_name as string | null,
    replyToEmail: row.reply_to_email as string | null,
    secretRef: row.secret_ref as string | null,
    maskedSecretPreview: row.masked_secret_preview as string | null,
    authMode: (row.auth_mode as EmailProviderConfig["authMode"]) ?? "client_credentials",
    sendMode: (row.send_mode as EmailProviderConfig["sendMode"]) ?? "graph_send_mail",
    defaultRecipientForTests: row.default_recipient_for_tests as string | null,
    throttlePerMinute: row.throttle_per_minute as number | null,
    dailySendLimit: row.daily_send_limit as number | null,
    lastTestStatus: row.last_test_status as string | null,
    lastTestAt: row.last_test_at as string | null,
    lastTestMessage: row.last_test_message as string | null,
    configJson: row.config_json as Record<string, unknown> | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function buildProvider(config: EmailProviderConfig): IEmailProvider {
  switch (config.providerType) {
    case "microsoft_graph":
      return new MicrosoftGraphEmailProvider(config);
    // Future providers: smtp, sendgrid, etc.
    default:
      throw new Error(
        `Email provider type "${config.providerType}" is not yet implemented.`
      );
  }
}

/**
 * Get an email provider by provider_code.
 * Used by server-side ERP modules that need to send email.
 *
 * @throws Error if provider not found, disabled, or provider type unsupported.
 */
export async function getEmailProvider(providerCode: string): Promise<IEmailProvider> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_email_provider_configs")
    .select("*")
    .eq("provider_code", providerCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`Email provider "${providerCode}" not found or inactive.`);
  }

  const config = rowToConfig(data as Record<string, unknown>);

  if (!config.isEnabled) {
    throw new Error(
      `Email provider "${providerCode}" is disabled. Enable it in Admin → Settings → Email Settings.`
    );
  }

  return buildProvider(config);
}

/**
 * Get the default enabled email provider.
 * Falls back to any enabled provider if no default is set.
 */
export async function getDefaultEmailProvider(): Promise<IEmailProvider> {
  const supabase = await createClient();

  // Try default first
  const { data: defaultProvider } = await supabase
    .from("erp_email_provider_configs")
    .select("*")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  if (defaultProvider) {
    return buildProvider(rowToConfig(defaultProvider as Record<string, unknown>));
  }

  // Fallback to any enabled provider
  const { data: anyProvider } = await supabase
    .from("erp_email_provider_configs")
    .select("*")
    .eq("is_enabled", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1)
    .single();

  if (!anyProvider) {
    throw new Error(
      "No email provider is enabled. Configure one in Admin → Settings → Email Settings."
    );
  }

  return buildProvider(rowToConfig(anyProvider as Record<string, unknown>));
}

/**
 * Check if a feature flag gate is enabled before sending email.
 * Future modules should call this before any email send.
 */
export async function isEmailFeatureEnabled(featureCode: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("erp_email_feature_flags")
    .select("is_enabled")
    .eq("feature_code", featureCode)
    .single();

  return (data as { is_enabled: boolean } | null)?.is_enabled ?? false;
}

/**
 * Convenience wrapper: send email via a named provider code.
 * Modules should use this rather than calling the provider directly.
 */
export async function sendEmailViaProvider(
  providerCode: string,
  input: EmailMessageInput
): Promise<EmailSendResult> {
  const provider = await getEmailProvider(providerCode);
  return provider.sendEmail(input);
}
