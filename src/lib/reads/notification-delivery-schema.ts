import {z} from "zod";
export {hrReadIdentity as notificationDeliveryIdentity} from "./hr-read-identity";
const id = z.number().int().positive().refine(Number.isSafeInteger);
const integer = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const notificationDeliveryCriteriaSchema = z.object({
 page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().max(200).default(""),
 status: z.string().max(50).default(""), deliveryChannel: z.enum(["", "email", "in_app"]).default(""),
 sorting: z.array(z.object({id: z.enum(["id","deliveryChannel","status","emailQueueId","notificationId","attemptNumber","durationMs","message","errorMessage","createdAt"]), desc: z.boolean()}).strict()).max(10).refine(v => new Set(v.map(s=>s.id)).size===v.length).default([{id:"createdAt",desc:true}]),
}).strict();
export const notificationDeliveryRowSchema = z.object({id,notificationId:id.nullable(),emailQueueId:id.nullable(),deliveryChannel:z.string(),status:z.string(),message:z.string().nullable(),durationMs:integer.nullable(),attemptNumber:integer.nullable(),errorMessage:z.string().nullable(),createdAt:z.string()}).strip();
export const notificationDeliveryPageSchema = z.object({rows:z.array(notificationDeliveryRowSchema),page:z.number().int().positive(),pageSize:z.number().int().min(1).max(100),totalCount:integer}).strict()
 .refine(v=>v.rows.length===Math.min(v.pageSize,Math.max(0,v.totalCount-(v.page-1)*v.pageSize))&&new Set(v.rows.map(r=>r.id)).size===v.rows.length);
export type NotificationDeliveryReadRow=z.infer<typeof notificationDeliveryRowSchema>;
export type NotificationDeliveryReadPage=z.infer<typeof notificationDeliveryPageSchema>;
