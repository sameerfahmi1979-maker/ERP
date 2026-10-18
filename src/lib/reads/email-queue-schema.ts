import {z} from "zod";
export {hrReadIdentity as emailQueueIdentity} from "./hr-read-identity";
const id = z.number().int().positive().refine(Number.isSafeInteger), integer = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const EMAIL_QUEUE_STATUSES = ["pending", "processing", "sent", "failed", "cancelled", "provider_accepted", "delivery_unknown"] as const;
export const emailQueueCriteriaSchema = z.object({page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().max(200).default(""),
  status: z.enum(["", ...EMAIL_QUEUE_STATUSES]).default(""), priority: z.enum(["", "low", "normal", "high", "urgent"]).default(""), sourceModule: z.string().max(100).default(""),
  sorting: z.array(z.object({id: z.enum(["id", "status", "priority", "sourceModule", "toEmails", "subject", "attemptCount", "scheduledFor", "lastError"]), desc: z.boolean()}).strict()).max(9).refine(value => new Set(value.map(s => s.id)).size === value.length).default([{id: "id", desc: true}]),
}).strict();
export const emailQueueRowSchema = z.object({id, queueCode: z.string().nullable(), notificationId: id.nullable(), providerConfigId: id.nullable(), sourceModule: z.string(), sourceEntityType: z.string().nullable(), sourceEntityId: id.nullable(),
  priority: z.string(), status: z.string(), fromEmail: z.string().nullable(), toEmails: z.array(z.string()), subject: z.string(), templateCode: z.string().nullable(),
  scheduledFor: z.string(), sentAt: z.string().nullable(), cancelledAt: z.string().nullable(), attemptCount: integer, maxAttempts: integer, nextRetryAt: z.string().nullable(),
  lastError: z.string().nullable(), externalMessageId: z.string().nullable(), createdAt: z.string(),
  deliveryState: z.string().nullable().default(null), pausedAt: z.string().nullable().default(null), dispatchStartedAt: z.string().nullable().default(null),
}).strip();
export const emailQueuePageSchema = z.object({page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100), totalCount: integer, rows: z.array(emailQueueRowSchema)})
  .strict().refine(v => v.rows.length === Math.min(v.pageSize, Math.max(0, v.totalCount - (v.page - 1) * v.pageSize)) && new Set(v.rows.map(r => r.id)).size === v.rows.length);
export type EmailQueueReadRow = z.infer<typeof emailQueueRowSchema>;
export type EmailQueueReadPage = z.infer<typeof emailQueuePageSchema>;
