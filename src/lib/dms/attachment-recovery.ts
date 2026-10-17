import {z} from 'zod';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const footprint=z.object({unavailable:z.literal(true),uploadSessionId:id,operationId:z.string().uuid(),completed:z.boolean(),closed:z.boolean().optional()}).strict();
const owned=footprint.extend({unavailable:z.literal(false),documentId:id,changeNotes:z.string().max(2000).nullable(),versionLabel:z.string().max(100).nullable(),originalFilename:z.string().min(1)}).strict();
export const attachmentRecoverySchema=z.object({rows:z.array(z.discriminatedUnion('unavailable',[footprint,owned])).max(25),totalCount:z.number().int().nonnegative(),
 pendingCount:z.number().int().nonnegative(),page:z.number().int().min(1).max(10000),pageSize:z.literal(25)}).strict().superRefine((v,ctx)=>{
 if(v.pendingCount>v.totalCount||new Set(v.rows.map(r=>r.uploadSessionId)).size!==v.rows.length||v.rows.length>v.totalCount||v.rows.some(r=>!r.completed&&!r.closed)&&v.pendingCount===0||v.rows.some(r=>r.completed&&r.closed))
  ctx.addIssue({code:'custom',message:'Invalid original attachment recovery count or identity'});
});
export type AttachmentRecovery=z.infer<typeof attachmentRecoverySchema>;
