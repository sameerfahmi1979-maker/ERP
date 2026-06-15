"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import type {
  EmailProviderConfig,
  EmailFeatureFlag,
  EmailSendLogRow,
} from "@/lib/email/providers/types";
import { MicrosoftGraphEmailProvider } from "@/lib/email/providers/microsoft-graph-provider";
import { storeEmailProviderSecretInVault } from "@/lib/email/vault";

const REVALIDATE_PATH = "/admin/settings/email";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "settings.email.view") || hasPermission(ctx, "settings.email.manage");
}

function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "settings.email.manage");
}

function canTest(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "settings.email.test") || hasPermission(ctx, "settings.email.manage");
}

function canManageSecrets(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "settings.email.secrets.manage") || hasPermission(ctx, "settings.email.manage");
}

function maskSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return "****" + secret.slice(-4);
}

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

// ── Schemas ───────────────────────────────────────────────────────────────────

const providerTypeValues = [
  "microsoft_graph", "smtp", "sendgrid", "mailgun",
  "aws_ses", "local_dev", "custom",
] as const;

const authModeValues = ["client_credentials", "certificate", "delegated_future"] as const;
const sendModeValues = ["graph_send_mail", "smtp_future"] as const;

const createProviderSchema = z.object({
  provider_code: z.string().min(1).max(100).regex(/^[A-Z0-9_]+$/, "Use uppercase letters, numbers, underscores"),
  provider_type: z.enum(providerTypeValues),
  provider_name: z.string().min(1).max(200),
  is_default: z.boolean().default(false),
  is_enabled: z.boolean().default(false),
  tenant_id: z.string().max(200).nullable().optional(),
  client_id: z.string().max(200).nullable().optional(),
  authority_url: z.string().max(500).nullable().optional(),
  graph_base_url: z.string().max(500).nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
  sender_display_name: z.string().max(200).nullable().optional(),
  reply_to_email: z.string().email().nullable().optional(),
  auth_mode: z.enum(authModeValues).default("client_credentials"),
  send_mode: z.enum(sendModeValues).default("graph_send_mail"),
  default_recipient_for_tests: z.string().email().nullable().optional(),
  throttle_per_minute: z.number().int().positive().nullable().optional(),
  daily_send_limit: z.number().int().positive().nullable().optional(),
  config_json: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateProviderSchema = createProviderSchema.partial().omit({ provider_code: true });

const saveSecretSchema = z.object({
  id: z.number().int().positive(),
  /** The actual secret value — stored encrypted in Supabase Vault, never in plain DB column */
  secret_value: z.string().min(1).max(500),
  /** Optional env var fallback name — used only if Vault is unavailable */
  secret_ref: z.string().max(200).optional(),
});

const testSendSchema = z.object({
  to_email: z.string().email(),
  subject: z.string().min(1).max(500).default("ALGT ERP Email Test"),
  message: z.string().min(1).max(4000).default("This is a test email from ALGT ERP Email Settings."),
});

// ── getEmailProviderConfigs ───────────────────────────────────────────────────

export async function getEmailProviderConfigs(): Promise<ActionResult<EmailProviderConfig[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("erp_email_provider_configs")
      .select("*")
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("provider_name", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToConfig(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getEmailProviderConfig ────────────────────────────────────────────────────

export async function getEmailProviderConfig(id: number): Promise<ActionResult<EmailProviderConfig>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("erp_email_provider_configs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error || !data) return { success: false, error: "Provider not found" };
    return { success: true, data: rowToConfig(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── createEmailProviderConfig ─────────────────────────────────────────────────

export type CreateEmailProviderInput = z.infer<typeof createProviderSchema>;

export async function createEmailProviderConfig(
  input: CreateEmailProviderInput
): Promise<ActionResult<{ id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };

    const parsed = createProviderSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("erp_email_provider_configs")
      .insert({ ...parsed.data, created_by: ctx.profile.id, updated_by: ctx.profile.id, created_at: now, updated_at: now })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    const row = data as Record<string, unknown>;
    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: row.id as number,
      entity_reference: parsed.data.provider_code,
      action: "create",
      new_values: { provider_type: parsed.data.provider_type, is_enabled: parsed.data.is_enabled },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { id: row.id as number } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── updateEmailProviderConfig ─────────────────────────────────────────────────

export type UpdateEmailProviderInput = z.infer<typeof updateProviderSchema>;

export async function updateEmailProviderConfig(
  id: number,
  input: UpdateEmailProviderInput
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };

    const parsed = updateProviderSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_provider_configs")
      .update({ ...parsed.data, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      new_values: parsed.data,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── deleteEmailProviderConfig (soft delete) ───────────────────────────────────

export async function deleteEmailProviderConfig(id: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_provider_configs")
      .update({ deleted_at: now, is_enabled: false, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: id,
      entity_reference: String(id),
      action: "delete",
      new_values: { deleted_at: now },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── setDefaultEmailProviderConfig ─────────────────────────────────────────────

export async function setDefaultEmailProviderConfig(id: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManage(ctx)) return { success: false, error: "Permission denied" };

    const now = new Date().toISOString();
    // Remove default from all
    await supabase
      .from("erp_email_provider_configs")
      .update({ is_default: false, updated_by: ctx.profile.id, updated_at: now })
      .neq("id", id)
      .is("deleted_at", null);

    // Set new default
    await supabase
      .from("erp_email_provider_configs")
      .update({ is_default: true, updated_by: ctx.profile.id, updated_at: now })
      .eq("id", id);

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── saveEmailProviderSecret ───────────────────────────────────────────────────

export async function saveEmailProviderSecret(
  input: z.infer<typeof saveSecretSchema>
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canManageSecrets(ctx)) return { success: false, error: "Permission denied" };

    const parsed = saveSecretSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { id, secret_value } = parsed.data;

    // Fetch current provider to get existing secret_ref for vault update-in-place
    const { data: currentRow, error: fetchErr } = await supabase
      .from("erp_email_provider_configs")
      .select("secret_ref")
      .eq("id", id)
      .single();

    if (fetchErr) return { success: false, error: fetchErr.message };

    const currentSecretRef = (currentRow as Record<string, unknown>)?.secret_ref as string | null;
    const maskedPreview = maskSecret(secret_value);

    // Store encrypted in Supabase Vault — returns "vault:<uuid>"
    // The actual secret value is NEVER written to any DB column.
    const newSecretRef = await storeEmailProviderSecretInVault(id, currentSecretRef, secret_value);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_provider_configs")
      .update({
        secret_ref: newSecretRef,
        masked_secret_preview: maskedPreview,
        updated_by: ctx.profile.id,
        updated_at: now,
      })
      .eq("id", id);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: id,
      entity_reference: String(id),
      action: "update",
      // Log only masked preview — never log the actual secret or vault UUID
      new_values: { vault_stored: true, masked_secret_preview: maskedPreview },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── testEmailProviderConnection ───────────────────────────────────────────────

export async function testEmailProviderConnection(
  id: number
): Promise<ActionResult<{ status: string; message: string; durationMs?: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canTest(ctx)) return { success: false, error: "Permission denied" };

    const { data: row, error: fetchErr } = await supabase
      .from("erp_email_provider_configs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !row) return { success: false, error: "Provider not found" };

    const config = rowToConfig(row as Record<string, unknown>);

    // Build provider and test
    let testResult;
    if (config.providerType === "microsoft_graph") {
      const provider = new MicrosoftGraphEmailProvider(config);
      testResult = await provider.testConnection();
    } else {
      testResult = { ok: false, status: "failed" as const, message: `Provider type "${config.providerType}" test not yet implemented.` };
    }

    const now = new Date().toISOString();
    // Update last test result
    await supabase
      .from("erp_email_provider_configs")
      .update({
        last_test_status: testResult.status,
        last_test_at: now,
        last_test_message: testResult.message,
        updated_at: now,
      })
      .eq("id", id);

    // Log to send logs
    await supabase.from("erp_email_send_logs").insert({
      provider_config_id: id,
      feature_area: "settings_test",
      operation_type: "test_connection",
      status: testResult.status === "success" ? "sent" : "failed",
      duration_ms: testResult.durationMs ?? null,
      last_error: testResult.ok ? null : testResult.message,
      metadata_json: { provider_code: config.providerCode },
      created_by: ctx.profile.id,
      created_at: now,
    });

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: id,
      entity_reference: config.providerCode,
      action: testResult.ok ? "test_success" : "test_failed",
      new_values: { status: testResult.status, message: testResult.message.slice(0, 500) },
    });

    revalidatePath(REVALIDATE_PATH);
    return {
      success: testResult.ok,
      data: { status: testResult.status, message: testResult.message, durationMs: testResult.durationMs },
      error: testResult.ok ? undefined : testResult.message,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── sendTestEmail ─────────────────────────────────────────────────────────────

export type SendTestEmailInput = z.infer<typeof testSendSchema>;

export async function sendTestEmail(
  id: number,
  input: SendTestEmailInput
): Promise<ActionResult<{ status: string; message: string; durationMs?: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canTest(ctx)) return { success: false, error: "Permission denied" };

    const parsed = testSendSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { data: row, error: fetchErr } = await supabase
      .from("erp_email_provider_configs")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !row) return { success: false, error: "Provider not found" };

    const config = rowToConfig(row as Record<string, unknown>);

    if (!config.isEnabled) {
      return { success: false, error: "Provider is disabled. Enable it before sending a test email." };
    }

    let sendResult;
    if (config.providerType === "microsoft_graph") {
      const provider = new MicrosoftGraphEmailProvider(config);
      sendResult = await provider.sendEmail({
        to: [parsed.data.to_email],
        subject: parsed.data.subject,
        htmlBody: `<p>${parsed.data.message}</p><hr/><p style="font-size:11px;color:#888;">Sent from ALGT ERP Settings.2 Email Test</p>`,
        saveToSentItems: true,
      });
    } else {
      sendResult = { ok: false, status: "failed" as const, message: `Provider type "${config.providerType}" send not yet implemented.` };
    }

    const now = new Date().toISOString();

    // Log to send logs (no full body stored)
    await supabase.from("erp_email_send_logs").insert({
      provider_config_id: id,
      feature_area: "settings_test",
      operation_type: "test_send",
      status: sendResult.ok ? "sent" : "failed",
      from_email: config.senderEmail ?? null,
      to_emails: [parsed.data.to_email],
      subject: parsed.data.subject,
      message_preview: parsed.data.message.slice(0, 300),
      external_message_id: sendResult.externalMessageId ?? null,
      duration_ms: sendResult.durationMs ?? null,
      last_error: sendResult.ok ? null : sendResult.message,
      metadata_json: { provider_code: config.providerCode },
      created_by: ctx.profile.id,
      created_at: now,
    });

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_provider_configs",
      entity_id: id,
      entity_reference: config.providerCode,
      action: sendResult.ok ? "test_email_sent" : "test_email_failed",
      new_values: { to: parsed.data.to_email, status: sendResult.status, message: sendResult.message.slice(0, 300) },
    });

    revalidatePath(REVALIDATE_PATH);
    return {
      success: sendResult.ok,
      data: { status: sendResult.status, message: sendResult.message, durationMs: sendResult.durationMs },
      error: sendResult.ok ? undefined : sendResult.message,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getEmailSendLogs ──────────────────────────────────────────────────────────

export async function getEmailSendLogs(limit = 100): Promise<ActionResult<EmailSendLogRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "settings.email.logs.view") && !canManage(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const { data, error } = await supabase
      .from("erp_email_send_logs")
      .select(`
        id, provider_config_id, feature_area, operation_type, status,
        from_email, to_emails, subject, message_preview, external_message_id,
        duration_ms, attempt_count, last_error, created_at,
        provider:erp_email_provider_configs!provider_config_id(provider_name)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const rows: EmailSendLogRow[] = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const prov = row.provider as Record<string, unknown> | null;
      return {
        id: row.id as number,
        providerConfigId: row.provider_config_id as number | null,
        featureArea: row.feature_area as string,
        operationType: row.operation_type as string,
        status: row.status as string,
        fromEmail: row.from_email as string | null,
        toEmails: row.to_emails as string[] | null,
        subject: row.subject as string | null,
        messagePreview: row.message_preview as string | null,
        externalMessageId: row.external_message_id as string | null,
        durationMs: row.duration_ms as number | null,
        attemptCount: row.attempt_count as number,
        lastError: row.last_error as string | null,
        createdAt: row.created_at as string,
        providerName: prov?.provider_name as string | null,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getEmailFeatureFlags ──────────────────────────────────────────────────────

export async function getEmailFeatureFlags(): Promise<ActionResult<EmailFeatureFlag[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("erp_email_feature_flags")
      .select("id, feature_code, feature_name, is_enabled, requires_approval, notes, updated_at")
      .order("feature_code", { ascending: true });

    if (error) return { success: false, error: error.message };

    const flags: EmailFeatureFlag[] = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as number,
        featureCode: row.feature_code as string,
        featureName: row.feature_name as string,
        isEnabled: row.is_enabled as boolean,
        requiresApproval: row.requires_approval as boolean,
        notes: row.notes as string | null,
        updatedAt: row.updated_at as string,
      };
    });

    return { success: true, data: flags };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── updateEmailFeatureFlag ────────────────────────────────────────────────────

export async function updateEmailFeatureFlag(
  featureCode: string,
  updates: { is_enabled?: boolean; notes?: string }
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "settings.email.feature_flags.manage") && !canManage(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_feature_flags")
      .update({ ...updates, updated_at: now })
      .eq("feature_code", featureCode);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "SETTINGS",
      entity_name: "erp_email_feature_flags",
      entity_id: 0,
      entity_reference: featureCode,
      action: "update",
      new_values: updates,
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
