import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MicrosoftGraphEmailProvider } from "@/lib/email/providers/microsoft-graph-provider";
import type { EmailProviderConfig } from "@/lib/email/providers/types";
import { logger } from "@/lib/logger";

/**
 * Internal API route — Process pending email queue items.
 *
 * Called by the Supabase Edge Function (dms-expiry-scheduler) after it queues
 * DMS expiry notification emails. Protected by INTERNAL_API_SECRET so only
 * trusted callers (Edge Function / pg_cron) can trigger it.
 *
 * Railway env var required: INTERNAL_API_SECRET=<shared secret>
 * Supabase secret required:  supabase secrets set INTERNAL_API_SECRET=<same secret>
 *
 * POST /api/internal/process-email-queue
 * Body: { module?: string; limit?: number }   (both optional)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

function rowToEmailProviderConfig(row: Record<string, unknown>): EmailProviderConfig {
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

function calcNextRetry(attemptCount: number): string {
  const delaysMinutes = [5, 15, 60, 240, 1440];
  const delay = delaysMinutes[Math.min(attemptCount - 1, delaysMinutes.length - 1)] ?? 1440;
  return new Date(Date.now() + delay * 60 * 1000).toISOString();
}

async function processItem(id: number): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();

  const { data: row, error: fetchErr } = await admin
    .from("erp_email_queue")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !row) return { ok: false, error: "Not found" };
  const item = row as Record<string, unknown>;

  if (!["pending", "failed"].includes(item.status as string)) return { ok: true }; // skip
  if ((item.attempt_count as number) >= (item.max_attempts as number)) return { ok: false, error: "Max attempts" };

  const now = new Date().toISOString();
  await admin.from("erp_email_queue")
    .update({ status: "processing", processing_started_at: now, updated_at: now })
    .eq("id", id);

  let sendResult: { ok: boolean; status: string; message: string; externalMessageId?: string | null; durationMs?: number };
  try {
    // Resolve provider using admin client (no user session in this route)
    const providerConfigId = item.provider_config_id as number | null;
    const { data: provRow } = await admin
      .from("erp_email_provider_configs")
      .select("*")
      .eq(providerConfigId ? "id" : "is_default", providerConfigId ?? true)
      .eq("is_enabled", true)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .single();

    if (!provRow) {
      return { ok: false, error: "No enabled email provider found" };
    }

    const config = rowToEmailProviderConfig(provRow as Record<string, unknown>);
    const provider = new MicrosoftGraphEmailProvider(config);

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
      external_message_id: sendResult.externalMessageId ?? null,
      last_error: null, updated_at: sentAt,
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
  }

  // Delivery log
  try {
    await admin.from("erp_notification_delivery_logs").insert({
      email_queue_id: id,
      notification_id: item.notification_id as number | null,
      delivery_channel: "email",
      status: sendResult.ok ? "sent" : "failed",
      message: sendResult.message.slice(0, 500),
      external_message_id: sendResult.externalMessageId ?? null,
      duration_ms: sendResult.durationMs ?? durationMs,
      created_at: sentAt,
    });
  } catch { /* delivery log is best-effort */ }

  return sendResult.ok ? { ok: true } : { ok: false, error: sendResult.message };
}

export async function POST(req: NextRequest) {
  // ── Auth gate ────────────────────────────────────────────────────────────
  if (!INTERNAL_SECRET) {
    return NextResponse.json({ error: "INTERNAL_API_SECRET not configured on server" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: { module?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const module = body.module ?? "DMS";
  const limit = Math.min(body.limit ?? 200, 500);

  // ── Fetch pending items ───────────────────────────────────────────────────
  const admin = createAdminClient();
  const { data: pending } = await admin
    .from("erp_email_queue")
    .select("id")
    .in("status", ["pending", "failed"])
    .eq("source_module", module)
    .lte("scheduled_for", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(limit);

  const ids = (pending ?? []).map((r) => (r as Record<string, unknown>).id as number);
  if (ids.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0, message: "No pending items" });
  }

  // ── Process each item sequentially ───────────────────────────────────────
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const result = await processItem(id);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (result.error) errors.push(`#${id}: ${result.error}`);
    }
  }

  logger.info("process-email-queue API", { module, processed: ids.length, sent, failed });

  return NextResponse.json({ success: true, sent, failed, total: ids.length, errors });
}
