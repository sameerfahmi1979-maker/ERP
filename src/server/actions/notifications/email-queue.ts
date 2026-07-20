"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { getDefaultEmailProvider, getEmailProvider } from "@/lib/email/providers/factory";
import { MicrosoftGraphEmailProvider } from "@/lib/email/providers/microsoft-graph-provider";
import type { EmailProviderConfig } from "@/lib/email/providers/types";

// Resolves the email provider using admin client — bypasses RLS on erp_email_provider_configs.
// Used by processEmailQueueItemAdmin which runs without a user session.
async function resolveEmailProviderAdmin(providerConfigId?: number | null) {
  const admin = createAdminClient();
  const query = admin
    .from("erp_email_provider_configs")
    .select("*")
    .eq("is_enabled", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(1);

  if (providerConfigId) query.eq("id", providerConfigId);
  else query.eq("is_default", true);

  let { data } = await query.single();

  // Fallback: any enabled provider
  if (!data) {
    const fb = await admin
      .from("erp_email_provider_configs")
      .select("*")
      .eq("is_enabled", true)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .single();
    data = fb.data;
  }

  if (!data) {
    throw new Error("No email provider is enabled. Configure one in Admin → Settings → Email Settings.");
  }

  const row = data as Record<string, unknown>;
  const config: EmailProviderConfig = {
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
    lastTestStatus: null,
    lastTestAt: null,
    lastTestMessage: null,
    configJson: row.config_json as Record<string, unknown> | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  return new MicrosoftGraphEmailProvider(config);
}
import { logger } from "@/lib/logger";

const REVALIDATE_PATH = "/admin/notifications/email-queue";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailQueueRow = {
  id: number;
  queueCode: string | null;
  notificationId: number | null;
  providerConfigId: number | null;
  sourceModule: string;
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  priority: string;
  status: string;
  fromEmail: string | null;
  toEmails: string[];
  subject: string;
  templateCode: string | null;
  scheduledFor: string;
  sentAt: string | null;
  cancelledAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  externalMessageId: string | null;
  createdAt: string;
  providerName?: string | null;
};

function rowToQueue(r: Record<string, unknown>): EmailQueueRow {
  const prov = r.provider as Record<string, unknown> | null;
  return {
    id: r.id as number,
    queueCode: r.queue_code as string | null,
    notificationId: r.notification_id as number | null,
    providerConfigId: r.provider_config_id as number | null,
    sourceModule: r.source_module as string,
    sourceEntityType: r.source_entity_type as string | null,
    sourceEntityId: r.source_entity_id as number | null,
    priority: r.priority as string,
    status: r.status as string,
    fromEmail: r.from_email as string | null,
    toEmails: r.to_emails as string[],
    subject: r.subject as string,
    templateCode: r.template_code as string | null,
    scheduledFor: r.scheduled_for as string,
    sentAt: r.sent_at as string | null,
    cancelledAt: r.cancelled_at as string | null,
    attemptCount: r.attempt_count as number,
    maxAttempts: r.max_attempts as number,
    nextRetryAt: r.next_retry_at as string | null,
    lastError: r.last_error as string | null,
    externalMessageId: r.external_message_id as string | null,
    createdAt: r.created_at as string,
    providerName: prov?.provider_name as string | null ?? null,
  };
}

// ── Backoff helper ────────────────────────────────────────────────────────────

function calcNextRetry(attemptCount: number): string {
  const mins = attemptCount === 1 ? 5 : attemptCount === 2 ? 30 : 120;
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const queueEmailSchema = z.object({
  source_module: z.string().min(1).max(50),
  source_entity_type: z.string().max(100).nullable().optional(),
  source_entity_id: z.number().int().positive().nullable().optional(),
  notification_id: z.number().int().positive().nullable().optional(),
  provider_config_id: z.number().int().positive().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  to_emails: z.array(z.string().email()).min(1),
  cc_emails: z.array(z.string().email()).nullable().optional(),
  bcc_emails: z.array(z.string().email()).nullable().optional(),
  reply_to_email: z.string().email().nullable().optional(),
  subject: z.string().min(1).max(998),
  html_body: z.string().nullable().optional(),
  text_body: z.string().nullable().optional(),
  template_code: z.string().max(100).nullable().optional(),
  template_variables_json: z.record(z.string(), z.unknown()).nullable().optional(),
  scheduled_for: z.string().nullable().optional(),
  max_attempts: z.number().int().min(1).max(10).default(3),
});

// ── queueEmail ────────────────────────────────────────────────────────────────

export type QueueEmailInput = z.infer<typeof queueEmailSchema>;

export async function queueEmail(
  input: QueueEmailInput,
  options?: { autoProcess?: boolean },
): Promise<ActionResult<{ id: number; sent?: boolean }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.manage") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const parsed = queueEmailSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("erp_email_queue")
      .insert({
        ...parsed.data,
        scheduled_for: parsed.data.scheduled_for ?? now,
        created_by: ctx.profile.id,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };
    const row = data as Record<string, unknown>;
    const queueId = row.id as number;

    await logAudit({
      module_code: "NOTIFICATIONS",
      entity_name: "erp_email_queue",
      entity_id: queueId,
      entity_reference: String(queueId),
      action: "create",
      new_values: { source_module: parsed.data.source_module, subject: parsed.data.subject, to: parsed.data.to_emails },
    });

    revalidatePath(REVALIDATE_PATH);

    // Auto-process: immediately send the queued item without requiring manual queue run.
    // Uses admin client so no notifications.email_queue.process permission is needed.
    let sent = false;
    if (options?.autoProcess) {
      try {
        sent = await processEmailQueueItemAdmin(queueId);
      } catch (e) {
        // Non-fatal: item remains pending in queue; admin can retry manually.
        logger.warn("queueEmail autoProcess failed — item queued for manual retry", { queueId, error: String(e) });
      }
    }

    return { success: true, data: { id: queueId, sent } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getEmailQueue ─────────────────────────────────────────────────────────────

export async function getEmailQueue(
  filters?: { status?: string; source_module?: string; limit?: number }
): Promise<ActionResult<EmailQueueRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.view") &&
        !hasPermission(ctx, "notifications.email_queue.manage") &&
        !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    let q = supabase
      .from("erp_email_queue")
      .select(`*, provider:erp_email_provider_configs!provider_config_id(provider_name)`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(filters?.limit ?? 200);

    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.source_module) q = q.eq("source_module", filters.source_module);

    const { data, error } = await q;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((r) => rowToQueue(r as Record<string, unknown>)) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── processEmailQueueItemAdmin (internal) ─────────────────────────────────────
// No auth/permission check — caller is responsible for authorization.
// Uses admin client so it works in server actions that lack email_queue.process permission.
// Returns true if sent successfully, false otherwise.

async function processEmailQueueItemAdmin(id: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row, error: fetchErr } = await admin
    .from("erp_email_queue")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !row) {
    logger.warn("processEmailQueueItemAdmin: item not found", { id });
    return false;
  }
  const item = row as Record<string, unknown>;

  if (!["pending", "failed"].includes(item.status as string)) return false;
  if ((item.attempt_count as number) >= (item.max_attempts as number)) return false;

  const now = new Date().toISOString();
  await admin.from("erp_email_queue").update({ status: "processing", processing_started_at: now, updated_at: now }).eq("id", id);

  let sendResult: { ok: boolean; status: string; message: string; externalMessageId?: string | null; durationMs?: number };
  try {
    const provider = await resolveEmailProviderAdmin(item.provider_config_id as number | null);

    sendResult = await provider.sendEmail({
      to: item.to_emails as string[],
      cc: item.cc_emails as string[] | undefined,
      bcc: item.bcc_emails as string[] | undefined,
      subject: item.subject as string,
      htmlBody: item.html_body as string | undefined,
      textBody: item.text_body as string | undefined,
      replyTo: item.reply_to_email as string | undefined,
      saveToSentItems: true,
    });
  } catch (e) {
    sendResult = { ok: false, status: "failed", message: String(e) };
  }

  const sentAt = new Date().toISOString();
  const newAttemptCount = (item.attempt_count as number) + 1;
  const durationMs = Date.now() - new Date(now).getTime();

  if (sendResult.ok) {
    await admin.from("erp_email_queue").update({
      status: "sent", sent_at: sentAt, attempt_count: newAttemptCount,
      external_message_id: sendResult.externalMessageId ?? null, last_error: null, updated_at: sentAt,
    }).eq("id", id);
  } else {
    const isExhausted = newAttemptCount >= (item.max_attempts as number);
    await admin.from("erp_email_queue").update({
      status: isExhausted ? "failed" : "pending",
      attempt_count: newAttemptCount,
      last_error: sendResult.message.slice(0, 1000),
      next_retry_at: isExhausted ? null : calcNextRetry(newAttemptCount),
      updated_at: sentAt,
    }).eq("id", id);
    logger.warn("processEmailQueueItemAdmin: send failed", { id, error: sendResult.message });
  }

  // Log delivery
  await admin.from("erp_notification_delivery_logs").insert({
    email_queue_id: id,
    notification_id: item.notification_id as number | null,
    delivery_channel: "email",
    status: sendResult.ok ? "sent" : "failed",
    message: sendResult.message.slice(0, 500),
    external_message_id: sendResult.externalMessageId ?? null,
    duration_ms: sendResult.durationMs ?? durationMs,
    attempt_number: newAttemptCount,
    error_message: sendResult.ok ? null : sendResult.message.slice(0, 1000),
    created_at: sentAt,
  });

  revalidatePath(REVALIDATE_PATH);
  return sendResult.ok;
}

// ── processEmailQueueItem ─────────────────────────────────────────────────────

export async function processEmailQueueItem(
  id: number,
  dryRun = false
): Promise<ActionResult<{ status: string; message: string; durationMs?: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.process") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const { data: row, error: fetchErr } = await supabase
      .from("erp_email_queue")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchErr || !row) return { success: false, error: "Queue item not found" };
    const item = row as Record<string, unknown>;

    if (!["pending", "failed"].includes(item.status as string)) {
      return { success: false, error: `Cannot process item with status "${item.status}"` };
    }

    if ((item.attempt_count as number) >= (item.max_attempts as number)) {
      return { success: false, error: `Max attempts (${item.max_attempts}) reached` };
    }

    if (dryRun) {
      return { success: true, data: { status: "dry_run", message: `Dry run: would send to ${(item.to_emails as string[]).join(", ")}` } };
    }

    const now = new Date().toISOString();
    // Mark as processing
    await supabase.from("erp_email_queue").update({ status: "processing", processing_started_at: now, updated_at: now }).eq("id", id);

    let sendResult;
    try {
      // Resolve provider: if a specific provider_config_id is set, look up its code
      let provider;
      if (item.provider_config_id) {
        const { data: provRow } = await supabase
          .from("erp_email_provider_configs")
          .select("provider_code")
          .eq("id", item.provider_config_id)
          .single();
        const provCode = (provRow as Record<string, unknown> | null)?.provider_code as string | undefined;
        provider = provCode
          ? await getEmailProvider(provCode).catch(() => getDefaultEmailProvider())
          : await getDefaultEmailProvider();
      } else {
        provider = await getDefaultEmailProvider();
      }

      sendResult = await provider.sendEmail({
        to: item.to_emails as string[],
        cc: item.cc_emails as string[] | undefined,
        bcc: item.bcc_emails as string[] | undefined,
        subject: item.subject as string,
        htmlBody: item.html_body as string | undefined,
        textBody: item.text_body as string | undefined,
        replyTo: item.reply_to_email as string | undefined,
        saveToSentItems: true,
      });
    } catch (e) {
      sendResult = { ok: false, status: "failed" as const, message: String(e) };
    }

    const sentAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(now).getTime();
    const newAttemptCount = (item.attempt_count as number) + 1;

    if (sendResult.ok) {
      await supabase.from("erp_email_queue").update({
        status: "sent", sent_at: sentAt, attempt_count: newAttemptCount,
        external_message_id: sendResult.externalMessageId ?? null, last_error: null, updated_at: sentAt,
      }).eq("id", id);
    } else {
      const isExhausted = newAttemptCount >= (item.max_attempts as number);
      await supabase.from("erp_email_queue").update({
        status: isExhausted ? "failed" : "pending",
        attempt_count: newAttemptCount,
        last_error: sendResult.message.slice(0, 1000),
        next_retry_at: isExhausted ? null : calcNextRetry(newAttemptCount),
        updated_at: sentAt,
      }).eq("id", id);
    }

    // Insert delivery log
    await supabase.from("erp_notification_delivery_logs").insert({
      email_queue_id: id,
      notification_id: item.notification_id as number | null,
      delivery_channel: "email",
      status: sendResult.ok ? "sent" : "failed",
      message: sendResult.message.slice(0, 500),
      external_message_id: sendResult.externalMessageId ?? null,
      duration_ms: sendResult.durationMs ?? durationMs,
      attempt_number: newAttemptCount,
      error_message: sendResult.ok ? null : sendResult.message.slice(0, 1000),
      created_by: ctx.profile.id,
      created_at: sentAt,
    });

    await logAudit({
      module_code: "NOTIFICATIONS",
      entity_name: "erp_email_queue",
      entity_id: id,
      entity_reference: String(id),
      action: sendResult.ok ? "email_sent" : "email_failed",
      new_values: { status: sendResult.ok ? "sent" : "failed", attempt: newAttemptCount },
    });

    revalidatePath(REVALIDATE_PATH);
    return {
      success: sendResult.ok,
      data: { status: sendResult.ok ? "sent" : "failed", message: sendResult.message, durationMs: sendResult.durationMs },
      error: sendResult.ok ? undefined : sendResult.message,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── processEmailQueue (batch) ─────────────────────────────────────────────────

export async function processEmailQueue(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<ActionResult<{ processed: number; sent: number; failed: number; skipped: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.process") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const limit = Math.min(options?.limit ?? 20, 100);
    const dryRun = options?.dryRun ?? false;
    const now = new Date().toISOString();

    const { data: items, error } = await supabase
      .from("erp_email_queue")
      .select("id")
      .in("status", ["pending"])
      .lte("scheduled_for", now)
      .is("deleted_at", null)
      .order("priority", { ascending: false })
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const ids = (items ?? []).map((r) => (r as Record<string, unknown>).id as number);
    let sent = 0; let failed = 0; let skipped = 0;

    for (const id of ids) {
      const result = await processEmailQueueItem(id, dryRun);
      if (dryRun) { skipped++; continue; }
      if (result.success) sent++;
      else failed++;
    }

    revalidatePath(REVALIDATE_PATH);
    return { success: true, data: { processed: ids.length, sent, failed, skipped } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryEmailQueueItem ───────────────────────────────────────────────────────

export async function retryEmailQueueItem(id: number): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.process") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_queue")
      .update({ status: "pending", next_retry_at: null, last_error: null, updated_at: now })
      .eq("id", id)
      .in("status", ["failed", "cancelled"]);

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "NOTIFICATIONS", entity_name: "erp_email_queue", entity_id: id,
      entity_reference: String(id), action: "update", new_values: { status: "pending", retry: true },
    });

    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── cancelEmailQueueItem ──────────────────────────────────────────────────────

export async function cancelEmailQueueItem(id: number, reason?: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "notifications.email_queue.manage") && !hasPermission(ctx, "notifications.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("erp_email_queue")
      .update({ status: "cancelled", cancelled_at: now, last_error: reason ?? null, updated_at: now })
      .eq("id", id)
      .in("status", ["pending", "failed"]);

    if (error) return { success: false, error: error.message };
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
