"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { recordProviderHealth } from "@/server/provider-health";
import { saveProviderMutation, saveProviderFlagMutation } from "@/server/provider-save";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { WorkspaceSaveResult } from "@/server/workspace-save";
import { workspaceValidationFailure } from "@/lib/workspace/field-errors";
import { emailProviderCreateSchema as createProviderSchema, emailProviderUpdateSchema as updateProviderSchema } from "@/lib/settings/provider-configuration";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import type {
  EmailProviderConfig,
  EmailFeatureFlag,
  EmailSendLogRow,
} from "@/lib/email/providers/types";
import { MicrosoftGraphEmailProvider } from "@/lib/email/providers/microsoft-graph-provider";
import { saveOrCheckEmailCredential } from "@/server/provider-secret";

const REVALIDATE_PATH = "/admin/settings/email";

function refreshProviderSettings() {
  try { revalidatePath(REVALIDATE_PATH); }
  catch { /* Cache invalidation cannot undo an already confirmed result. */ }
}

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return ["settings.email.view","settings.email.manage","settings.email.test","settings.email.secrets.manage"].some(code=>hasGlobalPermission(ctx,code));
}

function canManage(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasGlobalPermission(ctx, "settings.email.manage");
}

function canTest(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasGlobalPermission(ctx, "settings.email.test") || hasGlobalPermission(ctx, "settings.email.manage");
}

function rowToConfig(row: Record<string, unknown>): EmailProviderConfig {
  return {
    id: row.id as number,
    workspaceRevision: String(row.workspace_revision),
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

const saveSecretSchema = z.object({
  id: z.number().int().positive(),
  /** The actual secret value — stored encrypted in Supabase Vault, never in plain DB column */
  secret_value: z.string().min(1).max(500),
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

    if (error) return { success: false, error: "Email provider configurations could not be loaded. Try loading settings again." };
    return { success: true, data: (data ?? []).map((r) => rowToConfig(r as Record<string, unknown>)) };
  } catch {
    return { success: false, error: "Email provider configurations could not be loaded. Try loading settings again." };
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
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
  }
}

// ── createEmailProviderConfig ─────────────────────────────────────────────────

export type CreateEmailProviderInput = z.infer<typeof createProviderSchema>;

export async function createEmailProviderConfig(input: z.input<typeof createProviderSchema>, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.email.manage")) return {success:false,error:"Global provider management permission is required."};
  const parsed = createProviderSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const result = await saveProviderMutation("email", null, "save", parsed.data, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
// ── updateEmailProviderConfig ─────────────────────────────────────────────────

export type UpdateEmailProviderInput = z.infer<typeof updateProviderSchema>;

export async function updateEmailProviderConfig(id: number, input: z.input<typeof updateProviderSchema>, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.email.manage")) return {success:false,error:"Global provider management permission is required."};
  const parsed = updateProviderSchema.safeParse(input);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const fields = parsed.data;
  const result = await saveProviderMutation("email", id, "save", fields, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
// ── deleteEmailProviderConfig (soft delete) ───────────────────────────────────

export async function deleteEmailProviderConfig(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.email.manage")) return {success:false,error:"Global provider management permission is required."};
  const result = await saveProviderMutation("email", id, "archive", {}, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
// ── setDefaultEmailProviderConfig ─────────────────────────────────────────────

export async function setDefaultEmailProviderConfig(id: number, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.email.manage")) return {success:false,error:"Global provider management permission is required."};
  const result = await saveProviderMutation("email", id, "default", {}, contract);
  if (result.success) refreshProviderSettings();
  return result;
}
// ── saveEmailProviderSecret ───────────────────────────────────────────────────

export async function saveEmailProviderSecret(input: z.infer<typeof saveSecretSchema>, contract?: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=saveSecretSchema.strict().safeParse(input);
  if (!parsed.success) return {success:false,error:"Enter a valid provider and client secret."};
  const result=await saveOrCheckEmailCredential(parsed.data.id,parsed.data.secret_value,contract);
  if(result.success)refreshProviderSettings();
  return result;
}

export async function checkEmailProviderSecretSave(id: number, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const result=await saveOrCheckEmailCredential(id,null,contract);
  if(result.success)refreshProviderSettings();
  return result;
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

    const recorded = await recordProviderHealth("email",id,row.workspace_revision,ctx.profile.id,testResult.ok,testResult.durationMs);
    if (!recorded.success) return recorded;
    refreshProviderSettings();
    return {
      success: recorded.data.ok,
      data: {status:recorded.data.ok?"success":"failed",message:recorded.data.message,durationMs:recorded.data.durationMs ?? undefined},
      error: recorded.data.ok?undefined:recorded.data.message,
    };
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
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

    refreshProviderSettings();
    return {
      success: sendResult.ok,
      data: { status: sendResult.status, message: sendResult.message, durationMs: sendResult.durationMs },
      error: sendResult.ok ? undefined : sendResult.message,
    };
  } catch {
    return { success: false, error: "Provider operation could not be confirmed. Review the current settings before retrying." };
  }
}

// ── getEmailSendLogs ──────────────────────────────────────────────────────────

export async function getEmailSendLogs(limit = 100): Promise<ActionResult<EmailSendLogRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasGlobalPermission(ctx, "settings.email.logs.view") && !canManage(ctx)) {
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

    if (error) return { success: false, error: "Email send logs could not be loaded. Try loading settings again." };

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
  } catch {
    return { success: false, error: "Email send logs could not be loaded. Try loading settings again." };
  }
}

// ── getEmailFeatureFlags ──────────────────────────────────────────────────────

export async function getEmailFeatureFlags(): Promise<ActionResult<EmailFeatureFlag[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!["settings.email.view","settings.email.manage","settings.email.feature_flags.manage"].some(code=>hasGlobalPermission(ctx,code))) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("erp_email_feature_flags")
      .select("id, feature_code, feature_name, is_enabled, requires_approval, notes, updated_at, workspace_revision")
      .order("feature_code", { ascending: true });

    if (error) return { success: false, error: "Email feature flags could not be loaded. Try loading settings again." };

    const flags: EmailFeatureFlag[] = (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as number,
        workspaceRevision: String(row.workspace_revision),
        featureCode: row.feature_code as string,
        featureName: row.feature_name as string,
        isEnabled: row.is_enabled as boolean,
        requiresApproval: row.requires_approval as boolean,
        notes: row.notes as string | null,
        updatedAt: row.updated_at as string,
      };
    });

    return { success: true, data: flags };
  } catch {
    return { success: false, error: "Email feature flags could not be loaded. Try loading settings again." };
  }
}

// ── updateEmailFeatureFlag ────────────────────────────────────────────────────

export async function updateEmailFeatureFlag(
  featureCode: string,
  updates: { is_enabled?: boolean; notes?: string },
  contract?: WorkspaceSaveContract
): Promise<WorkspaceSaveResult> {
  const ctx = await getAuthContext();
  if (!hasGlobalPermission(ctx, "settings.email.manage") && !hasGlobalPermission(ctx, "settings.email.feature_flags.manage"))
    return {success:false,error:"Global feature administration permission is required."};
  const schema = z.object({is_enabled:z.boolean().optional(),notes:z.string().max(2000).optional()}).strict();
  const parsed = schema.safeParse(updates);
  if (!parsed.success) return workspaceValidationFailure(parsed.error.issues);
  const result = await saveProviderFlagMutation("email",featureCode,parsed.data,contract);
  if (result.success) refreshProviderSettings();
  return result;
}
