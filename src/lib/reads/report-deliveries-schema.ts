import {z} from "zod";
const id = z.number().int().positive().refine(Number.isSafeInteger);
export const reportDeliveriesCriteriaSchema = z.object({
  runId: id.optional(), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().max(200).default(""), status: z.enum(["", "queued", "sent", "failed", "cancelled", "provider_accepted", "delivery_unknown"]).default(""),
}).strict();
export const reportDeliveryRowSchema = z.object({id, run_id: id.nullable(), delivery_type: z.string().nullable(), recipient_to: z.array(z.string()).nullable(),
  subject: z.string().nullable(), attachment_format: z.string().nullable(), attachment_filename: z.string().nullable(), provider: z.string().nullable(),
  delivery_status: z.enum(["queued", "sent", "failed", "cancelled", "provider_accepted", "delivery_unknown"]).nullable(), sent_at: z.string().nullable(), created_at: z.string().nullable(), hasError: z.boolean(),
}).strip();
export const reportDeliveriesPageSchema = z.object({rows: z.array(reportDeliveryRowSchema), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger)})
  .strict().refine(v => v.rows.length === Math.min(v.pageSize, Math.max(0, v.totalCount - (v.page - 1) * v.pageSize)) && new Set(v.rows.map(r => r.id)).size === v.rows.length);
export type ReportDeliveryRow = z.infer<typeof reportDeliveryRowSchema>;
