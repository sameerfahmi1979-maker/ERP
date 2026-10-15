import {z} from "zod";
export {hrReadIdentity as reportSavedFiltersIdentity} from "./hr-read-identity";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const reportCode = z.string().trim().min(1).max(100).transform(value => value.toUpperCase());
export const reportSavedFiltersListSchema = z.object({
  mode: z.literal("list").default("list"), reportCode,
  search: z.string().max(200).default(""),
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
}).strict();
export const reportSavedFilterDetailCriteriaSchema = z.object({mode: z.literal("detail"), reportCode, id}).strict();
export const reportSavedFiltersRequestSchema = z.union([reportSavedFiltersListSchema, reportSavedFilterDetailCriteriaSchema]);
export const reportSavedFilterRowSchema = z.object({
  id, report_id: id, user_profile_id: id, filter_name: z.string(), is_default: z.boolean(), is_shared: z.boolean(),
  created_at: z.iso.datetime({offset: true}), updated_at: z.iso.datetime({offset: true}),
}).strip();
export const reportSavedFilterDetailSchema = reportSavedFilterRowSchema.extend({filters_json: z.record(z.string(), z.unknown())});
export const reportSavedFiltersPageSchema = z.object({
  criteria: reportSavedFiltersListSchema, rows: z.array(reportSavedFilterRowSchema), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger),
}).strict().refine(value => value.rows.length === Math.min(value.criteria.pageSize, Math.max(0, value.totalCount - (value.criteria.page - 1) * value.criteria.pageSize))
  && new Set(value.rows.map(row => row.id)).size === value.rows.length, "Incomplete saved-filter page");
export const reportSavedFilterDetailResponseSchema = z.object({criteria: reportSavedFilterDetailCriteriaSchema, record: reportSavedFilterDetailSchema.nullable()}).strict()
  .refine(value => !value.record || value.record.id === value.criteria.id, "Selected saved filter does not match");
export type ReportSavedFilterRow = z.infer<typeof reportSavedFilterRowSchema>;
export type ReportSavedFilterDetail = z.infer<typeof reportSavedFilterDetailSchema>;
export type ReportSavedFiltersPage = z.infer<typeof reportSavedFiltersPageSchema>;
