import { z } from "zod";

export const QUEUE_STATUSES = ["pending", "processing", "sent", "failed", "cancelled", "delivery_unknown"] as const;
export const QUEUE_SORT_COLUMNS = {
  id: "id", status: "status", priority: "priority", sourceModule: "source_module",
  to: "to_emails", subject: "subject", attempts: "attempt_count", scheduled: "scheduled_for", error: "last_error",
} as const;
export const queuePageSchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]).default(25),
  status: z.enum(QUEUE_STATUSES).optional(),
  query: z.string().trim().max(100).default(""),
  sortKey: z.enum(Object.keys(QUEUE_SORT_COLUMNS) as [keyof typeof QUEUE_SORT_COLUMNS, ...Array<keyof typeof QUEUE_SORT_COLUMNS>]).default("id"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export type QueuePageOptions = z.input<typeof queuePageSchema>;

/** PostgREST logic values are quoted; SQL LIKE wildcards are literal. Search
 * never interpolates an untrusted column, operator or entire filter expression. */
export function queueSearchFilter(query: string): string | null {
  if (!query) return null;
  const escaped = query.replace(/[\\%_]/g, "\\$&").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const filters = [`subject.ilike."%${escaped}%"`, `queue_code.ilike."%${escaped}%"`];
  if (/^[1-9]\d*$/.test(query) && Number.isSafeInteger(Number(query))) filters.push(`id.eq.${Number(query)}`);
  return filters.join(",");
}

// Do not select bodies, template variables or other unnecessary payloads into a list.
export const QUEUE_LIST_COLUMNS = "id,queue_code,notification_id,provider_config_id,source_module,source_entity_type,source_entity_id,priority,status,delivery_state,paused_at,dispatch_started_at,from_email,to_emails,subject,template_code,scheduled_for,sent_at,cancelled_at,attempt_count,max_attempts,next_retry_at,last_error,external_message_id,created_at,provider:erp_email_provider_configs!provider_config_id(provider_name)";
