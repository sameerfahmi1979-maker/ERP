import {z} from "zod";
export {hrReadIdentity as dmsNotificationIdentity} from "./hr-read-identity";
const id=z.number().int().positive().refine(Number.isSafeInteger);
export const dmsNotificationsCriteriaSchema=z.object({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25),search:z.string().max(200).default(""),
 audience:z.enum(["my","all"]).default("my"),unreadOnly:z.boolean().default(false),status:z.string().max(50).default(""),channel:z.enum(["","in_app","email_ready"]).default(""),bridgeStatus:z.string().max(50).default(""),
 sorting:z.array(z.object({id:z.enum(["subject","document_no","channel","status","bridge_status","scheduled_for"]),desc:z.boolean()}).strict()).max(6).refine(v=>new Set(v.map(s=>s.id)).size===v.length).default([{id:"scheduled_for",desc:true}]),
}).strict();
export const dmsNotificationRowSchema=z.object({id,document_id:id.nullable(),recipient_user_id:id.nullable(),subject:z.string(),message:z.string(),channel:z.string(),status:z.string(),scheduled_for:z.string(),read_at:z.string().nullable(),
 bridge_status:z.string(),global_notification_id:id.nullable(),global_email_queue_id:id.nullable(),visible_document_id:id.nullable(),document_no:z.string().nullable()}).strip();
export const dmsNotificationPageSchema=z.object({page:z.number().int().positive(),pageSize:z.number().int().min(1).max(100),totalCount:z.number().int().nonnegative().refine(Number.isSafeInteger),rows:z.array(dmsNotificationRowSchema)}).strict()
 .refine(v=>v.rows.length===Math.min(v.pageSize,Math.max(0,v.totalCount-(v.page-1)*v.pageSize))&&new Set(v.rows.map(r=>r.id)).size===v.rows.length);
export type DmsNotificationReadRow=z.infer<typeof dmsNotificationRowSchema>;
