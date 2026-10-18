import "server-only";
import {z} from "zod";
import {getAuthContext, type AuthContext} from "@/lib/rbac/check";
import {canUseApplication,hasGlobalPermission} from "@/lib/rbac/scope";
import {createClient} from "@/lib/supabase/server";
import {literalContains, literalLike} from "@/lib/reads/search";
import {isInternalActionUrlAllowed} from "@/lib/security/action-url";
import {notificationCriteriaSchema, notificationPageSchema, unreadCountSchema} from "@/lib/reads/notifications-schema";
const fields = ["id", "notification_code", "source_module", "source_entity_type", "source_entity_id", "notification_type", "severity", "title", "message",
  "recipient_user_id", "recipient_role_code", "recipient_email", "channel_in_app", "channel_email", "status", "scheduled_for", "read_at", "dismissed_at", "archived_at", "action_url", "action_label", "created_at", "updated_at"] as const;
const sortColumns = {id: "id", title: "title", severity: "severity", sourceModule: "source_module", status: "status", createdAt: "created_at", recipientEmail: "recipient_email"} as const;
function dto(row: Record<string, unknown>) {
  const value = Object.fromEntries(fields.map(field => [field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), row[field]]));
  return {...value, metadataJson: null, actionUrl: isInternalActionUrlAllowed(row.action_url) ? row.action_url : null};
}
export async function readNotifications(input: unknown, context?: AuthContext, signal?: AbortSignal) {
  const parsed = notificationCriteriaSchema.safeParse(input);
  if (!parsed.success) return {success: false as const, error: "Invalid notification criteria"};
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!canUseApplication(ctx) || !ctx.profile || parsed.data.audience === "admin" && !hasGlobalPermission(ctx, "notifications.admin") && !hasGlobalPermission(ctx, "notifications.manage")) return {success: false as const, error: "Permission denied"};
    const p = parsed.data, db = await createClient(); signal?.throwIfAborted();
    const base = (head = false) => {
      const q = db.from("erp_notifications").select(fields.join(","), {count: "exact", head}).is("deleted_at", null);
      if (signal) q.abortSignal(signal);
      if (p.audience === "my") q.eq("recipient_user_id", ctx.profile!.id).eq("channel_in_app", true).lte("scheduled_for", new Date().toISOString());
      if (p.status) q.eq("status", p.status);
      if (p.severity) q.eq("severity", p.severity);
      if (p.sourceModule) q.ilike("source_module", literalLike(p.sourceModule));
      if (p.search) q.or(["title", "message", "notification_code", "source_module", ...(p.audience === "admin" ? ["recipient_email"] : [])].map(field => `${field}.ilike.${literalContains(p.search)}`).join(","));
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
    if (error || !Array.isArray(rows)) throw Error("Unavailable page");
    const data = notificationPageSchema.parse({page: p.page, pageSize: p.pageSize, rows: z.array(z.record(z.string(), z.unknown())).parse(rows).map(dto), totalCount: count});
    if (p.audience === "my" && data.rows.some(row => row.recipientUserId !== ctx.profile!.id)) throw Error("Recipient mismatch");
    return {success: true as const, data, updatedAt: Date.now()};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Notifications could not be loaded. Please retry."};}
}
export async function readUnreadNotificationCount(context?: AuthContext, signal?: AbortSignal) {
  try {
    signal?.throwIfAborted(); const ctx = context ?? await getAuthContext(); signal?.throwIfAborted();
    if (!canUseApplication(ctx) || !ctx.profile) return {success: false as const, error: "Permission denied"};
    const db = await createClient(); signal?.throwIfAborted();
    const q = db.from("erp_notifications").select("id", {count: "exact", head: true}).eq("recipient_user_id", ctx.profile.id).eq("status", "unread").eq("channel_in_app",true).lte("scheduled_for",new Date().toISOString()).is("deleted_at", null);
    if (signal) q.abortSignal(signal);
    const result = await q; signal?.throwIfAborted();
    if (result.error) throw Error("Unavailable count");
    return {success: true as const, data: unreadCountSchema.parse({count: result.count})};
  } catch {signal?.throwIfAborted(); return {success: false as const, error: "Unread count could not be verified. Please retry."};}
}
