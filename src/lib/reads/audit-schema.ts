import {z} from "zod";
const id=z.number().int().positive().refine(Number.isSafeInteger),text=z.string().trim().max(200).default("");
export const auditCriteriaSchema=z.object({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(200).default(50),
  search:text,module:text,action:text,entity_name:text,actor:id.optional(),entity_id:id.optional(),
  date_from:z.iso.date().optional(),date_to:z.iso.date().optional(),
  sort:z.enum(["created_at","module_code","action","entity_reference","entity_name","actor_user_profile_id"]).default("created_at"),direction:z.enum(["asc","desc"]).default("desc")}).strict()
  .refine(c=>!c.date_from||!c.date_to||c.date_from<=c.date_to);
export type AuditCriteria=z.infer<typeof auditCriteriaSchema>;
export const auditMetadataSchema=z.object({id,created_at:z.string(),action:z.string(),module_code:z.string().nullable(),entity_name:z.string().nullable(),entity_id:id.nullable(),entity_reference:z.string().nullable(),actor_user_profile_id:id.nullable()}).strip();
export const auditPageSchema=z.object({criteria:auditCriteriaSchema,rows:z.array(auditMetadataSchema),totalCount:z.number().int().nonnegative().refine(Number.isSafeInteger)}).strict()
  .refine(p=>p.rows.length===Math.min(p.criteria.pageSize,Math.max(0,p.totalCount-(p.criteria.page-1)*p.criteria.pageSize))&&new Set(p.rows.map(r=>r.id)).size===p.rows.length);
export type AuditPage=z.infer<typeof auditPageSchema>;
export const auditDetailSchema=auditMetadataSchema.extend({old_values:z.unknown(),new_values:z.unknown()});
export const auditRequestSchema=z.union([auditCriteriaSchema,z.object({mode:z.literal("detail"),id}).strict()]);
