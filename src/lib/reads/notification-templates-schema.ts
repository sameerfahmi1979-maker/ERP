import {z} from "zod";
export {hrReadIdentity as notificationTemplatesIdentity} from "./hr-read-identity";
const id=z.number().int().positive().refine(Number.isSafeInteger);
export const notificationTemplatesCriteriaSchema=z.object({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25),search:z.string().max(200).default(""),
 isActive:z.enum(["","true","false"]).default(""),sourceModule:z.string().max(100).default(""),defaultSeverity:z.enum(["","info","success","warning","urgent","critical"]).default(""),
 sorting:z.array(z.object({id:z.enum(["templateCode","templateName","sourceModule","notificationType","defaultSeverity","isActive"]),desc:z.boolean()}).strict()).max(6).refine(v=>new Set(v.map(s=>s.id)).size===v.length).default([{id:"sourceModule",desc:false},{id:"templateCode",desc:false}]),
}).strict();
export const notificationTemplateListRowSchema=z.object({id,templateCode:z.string(),templateName:z.string(),sourceModule:z.string(),notificationType:z.string(),defaultSeverity:z.string(),defaultChannelInApp:z.boolean(),defaultChannelEmail:z.boolean(),isActive:z.boolean()}).strip();
export const notificationTemplateDetailSchema=notificationTemplateListRowSchema.extend({subjectTemplate:z.string(),htmlTemplate:z.string().nullable(),textTemplate:z.string(),isSystem:z.boolean(),createdAt:z.string(),updatedAt:z.string()}).strip();
export const notificationTemplateDetailCriteriaSchema=z.object({id}).strict();
export const notificationTemplatesPageSchema=z.object({page:z.number().int().positive(),pageSize:z.number().int().min(1).max(100),totalCount:z.number().int().nonnegative().refine(Number.isSafeInteger),rows:z.array(notificationTemplateListRowSchema)}).strict()
 .refine(v=>v.rows.length===Math.min(v.pageSize,Math.max(0,v.totalCount-(v.page-1)*v.pageSize))&&new Set(v.rows.map(r=>r.id)).size===v.rows.length);
export type NotificationTemplateListRow=z.infer<typeof notificationTemplateListRowSchema>;
export type NotificationTemplatesReadPage=z.infer<typeof notificationTemplatesPageSchema>;
