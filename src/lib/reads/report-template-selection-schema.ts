import {z} from "zod";
export {hrReadIdentity as reportTemplateSelectionIdentity} from "./hr-read-identity";
const id = z.number().int().positive().refine(Number.isSafeInteger);
export const reportTemplateSelectionCriteriaSchema = z.object({
  search: z.string().max(200).default(""), page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25), ownerCompanyIds: z.array(id).max(1000).default([])
    .transform(value => [...new Set(value)].sort((a, b) => a - b)),
  issuableOnly: z.boolean().default(false), selectedId: id.optional(),
}).strict();
/** Selection metadata only. Bodies, layouts, signing assets and governance
 * mutation revisions belong to F06/F08 and are deliberately not in this DTO. */
export const reportTemplateSelectionRowSchema = z.object({
  id, template_code: z.string(), template_name: z.string(), template_type: z.string(), is_default: z.boolean(),
  governance_status: z.string(), visual_editor_engine: z.string().nullable(), branding_profile_id: id.nullable(),
  branding_profile_name: z.string().nullable(), branding_profile_type: z.string().nullable(), company_name: z.string().nullable(),
  logo_url: z.string().nullable(), owner_company_id: id.nullable(), selectable: z.boolean(),
}).strip();
export const reportTemplateSelectionPageSchema = z.object({
  criteria: reportTemplateSelectionCriteriaSchema, rows: z.array(reportTemplateSelectionRowSchema),
  selected: reportTemplateSelectionRowSchema.nullable(), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger),
}).strict().superRefine((value, ctx) => {
  if (value.rows.length !== Math.min(value.criteria.pageSize, Math.max(0, value.totalCount - (value.criteria.page - 1) * value.criteria.pageSize)) || new Set(value.rows.map(row => row.id)).size !== value.rows.length)
    ctx.addIssue({code: "custom", path: ["rows"], message: "Incomplete template choice page"});
  if (value.rows.some(row => !row.selectable)) ctx.addIssue({code: "custom", path: ["rows"], message: "Unavailable template offered as a new choice"});
  if (value.selected && value.selected.id !== value.criteria.selectedId) ctx.addIssue({code: "custom", path: ["selected"], message: "Mismatched template selection"});
  const matched = value.selected && value.rows.find(row => row.id === value.selected!.id);
  if (matched && JSON.stringify(matched) !== JSON.stringify(value.selected)) ctx.addIssue({code: "custom", path: ["selected"], message: "Template changed during selection read"});
});
export type ReportTemplateSelectionCriteria = z.infer<typeof reportTemplateSelectionCriteriaSchema>;
export type ReportTemplateSelectionRow = z.infer<typeof reportTemplateSelectionRowSchema>;
