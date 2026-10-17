import {z} from 'zod';
import {batchUuid,dmsFileMetadataSchema} from '@/lib/dms/batch-admission';

export const singleUploadContextSchema=z.object({
  entityType:z.enum(['employee','employee_dependent','company','branch','party','site']),
  entityId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
/** Same F04 caller-operation convention as batch admission; no numbering allocator. */
export const singleUploadRequestSchema=z.object({
  version:z.literal(1),operationId:batchUuid,authUserId:batchUuid,
  metadata:dmsFileMetadataSchema,context:singleUploadContextSchema.nullable(),
}).strict();
export type SingleUploadRequest=z.infer<typeof singleUploadRequestSchema>;
export function sameSingleUploadRequest(a:SingleUploadRequest,b:SingleUploadRequest):boolean{
  return JSON.stringify(singleUploadRequestSchema.parse(a))===JSON.stringify(singleUploadRequestSchema.parse(b));
}
