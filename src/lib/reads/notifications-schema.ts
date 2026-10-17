import {z} from "zod";
export {hrReadIdentity as notificationReadIdentity} from "./hr-read-identity";
const id = z.number().int().positive().refine(Number.isSafeInteger);
const text = z.string().max(200);
export const NOTIFICATION_STATUSES = ["unread", "read", "dismissed", "archived"] as const;
export const NOTIFICATION_SEVERITIES = ["critical", "urgent", "warning", "info", "success"] as const;
export const notificationCriteriaSchema = z.object({
  audience: z.enum(["my", "admin"]).default("my"),
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  search: text.default(""), status: z.enum(["", ...NOTIFICATION_STATUSES]).default(""),
  severity: z.enum(["", ...NOTIFICATION_SEVERITIES]).default(""), sourceModule: text.default(""),
  sorting: z.array(z.object({id: z.enum(["id", "title", "severity", "sourceModule", "status", "createdAt", "recipientEmail"]), desc: z.boolean()}).strict()).max(7)
    .refine(v => new Set(v.map(s => s.id)).size === v.length).default([{id: "createdAt", desc: true}]),
}).strict();
// Lists never need routing metadata, provider details or hidden payloads.
export const notificationRowSchema = z.object({
  id, notificationCode: z.string().nullable(), sourceModule: z.string(), sourceEntityType: z.string().nullable(), sourceEntityId: id.nullable(),
  notificationType: z.string(), severity: z.string(), title: z.string(), message: z.string(),
  recipientUserId: id.nullable(), recipientRoleCode: z.string().nullable(), recipientEmail: z.string().nullable(),
  channelInApp: z.boolean(), channelEmail: z.boolean(), status: z.string(), scheduledFor: z.string(),
  readAt: z.string().nullable(), dismissedAt: z.string().nullable(), archivedAt: z.string().nullable(),
  actionUrl: z.string().nullable(), actionLabel: z.string().nullable(), metadataJson: z.null(), createdAt: z.string(), updatedAt: z.string(),
}).strip();
export const notificationPageSchema = z.object({
  rows: z.array(notificationRowSchema), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger),
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
}).strict().refine(v => v.rows.length === Math.min(v.pageSize, Math.max(0, v.totalCount - (v.page - 1) * v.pageSize))
  && new Set(v.rows.map(row => row.id)).size === v.rows.length, "Incomplete notification page");
export type NotificationCriteria = z.infer<typeof notificationCriteriaSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;
export type NotificationReadRow = z.infer<typeof notificationRowSchema>;
export const unreadCountSchema = z.object({count: z.number().int().nonnegative().refine(Number.isSafeInteger)}).strict();
