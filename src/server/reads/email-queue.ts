import "server-only";
import {z} from "zod";
import {getAuthContext, hasGlobalPermission, type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {emailQueueCriteriaSchema, emailQueuePageSchema} from "@/lib/reads/email-queue-schema";
import {unreadCountSchema} from "@/lib/reads/notifications-schema";
const fields = ["id", "queue_code", "notification_id", "provider_config_id", "source_module", "source_entity_type", "source_entity_id", "priority", "status", "from_email", "to_emails", "subject", "template_code", "scheduled_for", "sent_at", "cancelled_at", "attempt_count", "max_attempts", "next_retry_at", "last_error", "external_message_id", "created_at", "delivery_state", "paused_at", "dispatch_started_at"];
const sortColumns = {id: "id", status: "status", priority: "priority", sourceModule: "source_module", toEmails: "recipients_search", subject: "subject", attemptCount: "attempt_count", scheduledFor: "scheduled_for", lastError: "last_error"};
const permitted = (ctx: AuthContext) => ["notifications.email_queue.view", "notifications.email_queue.manage", "notifications.admin"].some(code => hasGlobalPermission(ctx, code));
export async function readEmailQueue(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = emailQueueCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid email queue criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!permitted(ctx)) return {success: false as const, error: "Permission denied"};
    const p = parsed.data, db = await createClient(); signal?.throwIfAborted();
    const base = (head = false) => {
      const q = db.from("perf_email_queue_read").select(fields.join(","), {count: "exact", head}).is("deleted_at", null); if (signal) q.abortSignal(signal);
      if (p.status === 'provider_accepted') {q.eq('status','sent');q.eq('delivery_state','provider_accepted');}
      else if (p.status) q.eq("status", p.status);
      if (p.priority) q.eq("priority", p.priority); if (p.sourceModule) q.ilike("source_module", literalLike(p.sourceModule));
      if (p.search) q.or(["id_search", "status", "priority", "source_module", "recipients_search", "subject", "last_error"].map(field => `${field}.ilike.${literalContains(p.search)}`).join(","));
      return q;
    };
    const offset = (p.page - 1) * p.pageSize, q = base();
    for (const sort of p.sorting) q.order(sortColumns[sort.id], {ascending: !sort.desc, nullsFirst: false});
    if (!p.sorting.some(sort => sort.id === "id")) q.order("id", {ascending: true});
    const result = await q.range(offset, offset + p.pageSize - 1); signal?.throwIfAborted();
    let rows = result.data, count = result.count, error = result.error;
    if (offset > 0 && result.status === 416 && error?.code === "PGRST103") {
      const recount = await base(true); signal?.throwIfAborted();
      if (recount.error || recount.count === null || !Number.isSafeInteger(recount.count) || recount.count < 0 || recount.count > offset) throw Error("Unverified count");
      rows = []; count = recount.count; error = null;
    }
    if (error || !Array.isArray(rows)) throw Error("Unverified queue");
    const records = z.array(z.record(z.string(), z.unknown())).parse(rows);
    const data = emailQueuePageSchema.parse({page: p.page, pageSize: p.pageSize, totalCount: count, rows: records.map(row => Object.fromEntries(fields.map(field => [field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), row[field]])))});
    return {success: true as const, data, updatedAt: Date.now()};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Email queue could not be loaded. Please retry."};}
}
export async function readPendingEmailCount(context?: AuthContext, signal?: AbortSignal) {
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!permitted(ctx)) return {success: false as const, error: "Permission denied"};
    const db = await createClient(); signal?.throwIfAborted();
    const q = db.from("erp_email_queue").select("id", {count: "exact", head: true}).eq("status", "pending").is("deleted_at", null); if (signal) q.abortSignal(signal);
    const result = await q; signal?.throwIfAborted(); if (result.error) throw Error("Unverified pending count");
    return {success: true as const, data: unreadCountSchema.parse({count: result.count})};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Pending count could not be verified. Please retry."};}
}
