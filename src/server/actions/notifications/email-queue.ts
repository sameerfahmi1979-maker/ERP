"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { requireQueuePermission } from "@/lib/email/queue/policy";
import { processQueuedEmail, processQueuedBatch } from "@/lib/email/queue/service";
const REVALIDATE_PATH = "/admin/notifications/email-queue";
export type ActionResult<T = undefined> = T extends undefined ? {
    success: boolean;
    error?: string;
} : {
    success: boolean;
    data?: T;
    error?: string;
};
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
    deliveryState: string | null;
    pausedAt: string | null;
    dispatchStartedAt: string | null;
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
        deliveryState: r.delivery_state as string | null,
        pausedAt: r.paused_at as string | null,
        dispatchStartedAt: r.dispatch_started_at as string | null,
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
// ── Schemas ───────────────────────────────────────────────────────────────────
const queueEmailSchema = z.object({
    request_id: z.string().uuid().optional(),
    source_module: z.string().min(1).max(50),
    source_entity_type: z.string().max(100).nullable().optional(),
    source_entity_id: z.number().int().positive().nullable().optional(),
    notification_id: z.number().int().positive().nullable().optional(),
    provider_config_id: z.number().int().positive().nullable().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    to_emails: z.array(z.string().email()).min(1).max(100),
    cc_emails: z.array(z.string().email()).nullable().optional(),
    bcc_emails: z.array(z.string().email()).nullable().optional(),
    reply_to_email: z.string().email().nullable().optional(),
    subject: z.string().min(1).max(998),
    html_body: z.string().max(2000000).nullable().optional(),
    text_body: z.string().max(2000000).nullable().optional(),
    template_code: z.string().max(100).nullable().optional(),
    template_variables_json: z.record(z.string(), z.unknown()).nullable().optional(),
    scheduled_for: z.string().datetime({ offset: true }).nullable().optional(),
    max_attempts: z.number().int().min(1).max(10).default(3),
});
// ── queueEmail ────────────────────────────────────────────────────────────────
export type QueueEmailInput = z.infer<typeof queueEmailSchema>;
export async function queueEmail(input: QueueEmailInput, options?: {
    autoProcess?: boolean;
}): Promise<ActionResult<{
    id: number;
    sent?: boolean;
}>> {
    try {
        const ctx = await getAuthContext();
        if (!ctx.profile)
            return { success: false, error: "Not authenticated" };
        requireQueuePermission(ctx, "manage");
        requireQueuePermission(ctx, "process"); // enqueue is authority to send, including autoProcess
        const parsed = queueEmailSchema.safeParse(input);
        if (!parsed.success)
            return { success: false, error: parsed.error.issues[0]?.message };
        const { request_id, ...payload } = parsed.data;
        if (!payload.notification_id && !request_id)
            return { success: false, error: "A stable request ID is required." };
        const intentKey = payload.notification_id ? `notification-${payload.notification_id}` : `manual-${ctx.profile.id}-${request_id}`;
        const now = new Date().toISOString();
        const { data, error } = await createAdminClient()
            .from("erp_email_queue")
            .insert({
            ...payload,
            intent_key: intentKey,
            scheduled_for: parsed.data.scheduled_for ?? now,
            created_by: ctx.profile.id,
            created_at: now,
            updated_at: now,
        })
            .select("id")
            .single();
        // An earlier response may have been lost after committing the same notification.
        if (error?.code === "23505") {
            const existing = await createAdminClient().from("erp_email_queue").select("id")
                .eq("intent_key", intentKey).maybeSingle();
            if (!existing.error && existing.data)
                return { success: true, data: { id: existing.data.id, sent: false } };
        }
        if (error)
            return { success: false, error: "Unable to queue email." };
        const row = data as Record<string, unknown>;
        const queueId = row.id as number;
        await logAudit({
            module_code: "NOTIFICATIONS",
            entity_name: "erp_email_queue",
            entity_id: queueId,
            entity_reference: String(queueId),
            action: "create",
            new_values: { source_module: parsed.data.source_module, event: "f09_enqueued" },
        });
        revalidatePath(REVALIDATE_PATH);
        // Auto-process: immediately send the queued item without requiring manual queue run.
        // The creator's dedicated process permission was checked above and is checked again at dispatch.
        let sent = false;
        if (options?.autoProcess) {
            try {
                sent = await processQueuedEmail({ id: queueId }) === "accepted";
            }
            catch { /* Do not resend on ambiguous processing/persistence failure. */ }
        }
        return { success: true, data: { id: queueId, sent } };
    }
    catch (e) {
        return { success: false, error: String(e) };
    }
}
// ── getEmailQueue ─────────────────────────────────────────────────────────────
export async function getEmailQueue(filters?: {
    status?: string;
    source_module?: string;
    limit?: number;
}): Promise<ActionResult<EmailQueueRow[]>> {
    try {
        const supabase = await createClient();
        const ctx = await getAuthContext();
        if (!ctx.profile)
            return { success: false, error: "Not authenticated" };
        requireQueuePermission(ctx, "view");
        let q = supabase
            .from("erp_email_queue")
            .select(`*, provider:erp_email_provider_configs!provider_config_id(provider_name)`)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(filters?.limit ?? 200);
        if (filters?.status)
            q = q.eq("status", filters.status);
        if (filters?.source_module)
            q = q.eq("source_module", filters.source_module);
        const { data, error } = await q;
        if (error)
            return { success: false, error: error.message };
        return { success: true, data: (data ?? []).map((r) => rowToQueue(r as Record<string, unknown>)) };
    }
    catch (e) {
        return { success: false, error: String(e) };
    }
}
// Shared manual/automatic/machine processing contract. No legacy sender fallback.
export async function processEmailQueueItem(id: number, dryRun = false): Promise<ActionResult<{
    status: string;
    message: string;
    durationMs?: number;
}>> {
    try {
        requireQueuePermission(await getAuthContext(), "process");
        if (!Number.isSafeInteger(id) || id < 1)
            return { success: false, error: "Invalid queue ID" };
        if (dryRun)
            return { success: true, data: { status: "dry_run", message: "No claim or send performed. Source authorization is rechecked at dispatch." } };
        const status = await processQueuedEmail({ id });
        revalidatePath(REVALIDATE_PATH);
        return { success: status === "accepted", data: { status, message: status === "accepted" ? "Provider accepted the message; inbox delivery is not confirmed." : `Queue outcome: ${status}` } };
    }
    catch {
        return { success: false, error: "Email processing failed; inspect the queue before retrying." };
    }
}
export async function processEmailQueue(options?: {
    dryRun?: boolean;
    limit?: number;
}): Promise<ActionResult<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    retry?: number;
    deferred?: number;
    unknown?: number;
    paused?: boolean;
}>> {
    try {
        requireQueuePermission(await getAuthContext(), "process");
        if (options?.dryRun)
            return { success: true, data: { processed: 0, sent: 0, failed: 0, skipped: 0 } };
        const result = await processQueuedBatch({ limit: options?.limit });
        revalidatePath(REVALIDATE_PATH);
        return { success: true, data: result };
    }
    catch {
        return { success: false, error: "Queue processing failed; delivery may be pending reconciliation." };
    }
}
async function queueControl(id: number, action: "cancel" | "retry") {
    requireQueuePermission(await getAuthContext(), action === "cancel" ? "manage" : "process");
    if (!Number.isSafeInteger(id) || id < 1)
        return { success: false, error: "Invalid queue ID" };
    const { data, error } = await createAdminClient().rpc(action === "cancel" ? "f09_cancel_email" : "f09_retry_email", { p_id: id });
    if (error || data !== true)
        return { success: false, error: "No eligible item changed. Dispatched, cancelled, permanent, exhausted or uncertain mail cannot be restarted." };
    await logAudit({ module_code: "NOTIFICATIONS", entity_name: "erp_email_queue", entity_id: id,
        entity_reference: String(id), action: "update", new_values: { event: action === "cancel" ? "f09_cancel" : "f09_retry_eligibility_confirmed" } }).catch(() => { });
    revalidatePath(REVALIDATE_PATH);
    return { success: true };
}
export async function retryEmailQueueItem(id: number): Promise<ActionResult> {
    try {
        return await queueControl(id, "retry");
    }
    catch {
        return { success: false, error: "Retry not authorized or unavailable" };
    }
}
export async function cancelEmailQueueItem(id: number, _reason?: string): Promise<ActionResult> {
    void _reason; // Free-text reasons are not copied into operational delivery errors.
    try {
        return await queueControl(id, "cancel");
    }
    catch {
        return { success: false, error: "Cancellation not authorized or unavailable" };
    }
}
