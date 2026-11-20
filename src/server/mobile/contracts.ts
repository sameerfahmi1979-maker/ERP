import {z} from "zod";
export const mobileId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const mobilePage=z.number().int().min(1).max(100_000);
export const mobileDocumentCriteria=z.object({search:z.string().trim().max(200),typeId:mobileId.optional(),page:mobilePage,
 personal:z.boolean().default(false),entityType:z.enum(["employee","site"]).optional(),entityId:mobileId.optional(),
 validity:z.enum(["all","valid","expired","expiring"]).default("all")}).strict()
 .refine(v=>(v.entityType===undefined)===(v.entityId===undefined)&&!(v.personal&&v.entityId!==undefined),"Choose personal documents or one exact record.");
export const offlinePermitCriteria=z.strictObject({documentId:mobileId,fileId:mobileId,days:z.union([z.literal(1),z.literal(3),z.literal(7)])});
export const mobileTaskCriteria=z.strictObject({kind:z.enum(["uploads","approvals","renewals","expiring","notifications"]),page:mobilePage.default(1),beforeId:mobileId.optional()});
export const mobileApprovalCriteria=z.strictObject({documentId:mobileId,approvalId:mobileId,decision:z.enum(["approve","reject"]),comment:z.string().trim().max(2000)})
 .refine(v=>v.decision!=="reject"||v.comment.length>=5,"A rejection reason of at least 5 characters is required.");
export type MobileDocumentsInput=z.infer<typeof mobileDocumentCriteria>;
export type MobileTasksInput=z.infer<typeof mobileTaskCriteria>;
export type MobileApprovalInput=z.infer<typeof mobileApprovalCriteria>;
export type OfflinePermitInput=z.infer<typeof offlinePermitCriteria>;
