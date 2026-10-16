import {z} from 'zod';
import {zNullableDateString} from './date-validators';

export const dmsDocumentCreateSchema=z.object({
 title:z.string().min(1,'Title is required').max(500),
 description:z.string().nullable().optional(),
 document_type_id:z.number().int().positive('Document type is required'),
 category_id:z.number().int().positive('Category is required'),
 status:z.enum(['draft','pending_review','approved','rejected','active','expired','archived','superseded']).default('draft'),
 confidentiality_level:z.enum(['internal','company','hr','finance','legal','executive']).default('internal'),
 owner_user_id:z.number().int().positive().nullable().optional(),
 owning_company_id:z.number().int().positive().nullable().optional(),
 owning_branch_id:z.number().int().positive().nullable().optional(),
 party_id:z.number().int().positive().nullable().optional(),
 issue_date:zNullableDateString,expiry_date:zNullableDateString,
 reminder_policy_id:z.number().int().positive().nullable().optional(),
 legacy_document_code:z.string().nullable().optional(),
});
export const dmsCreationContractSchema=z.object({operationId:z.string().uuid(),revision:z.null()}).strict();
export const dmsCreationReceiptSchema=z.object({
 id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),document_no:z.string().min(1),
 operation_id:z.string().uuid(),replayed:z.boolean(),
}).strict();
export const dmsCreationRpcReceiptSchema=dmsCreationReceiptSchema.extend({reference_id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)});
export type DmsCreationReceipt=z.infer<typeof dmsCreationReceiptSchema>;
