import {z} from 'zod';
import {dmsCreationContractSchema} from './numbered-document-create';
import {zOptionalDateString} from './date-validators';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const uploadCreationSnapshotSchema=z.object({
 source:z.object({id,session_code:z.string().min(1),uploaded_by:id,
  owning_company_id:id,owning_branch_id:id.nullable(),temp_storage_path:z.string().min(1).max(2048),
  original_filename:z.string().min(1).max(1024),mime_type:z.string().min(1).max(255),
  file_size_bytes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),sha256_hash:z.string().regex(/^[a-fA-F0-9]{64}$/).nullable(),
 }).strict(),
 type:z.object({id,category_id:id,type_code:z.string().min(1).max(100),
  default_confidentiality:z.enum(['internal','company','hr','finance','legal','executive']),requires_expiry_tracking:z.boolean(),
 }).strict(),
 storage_year:z.number().int().min(2000).max(9999),
}).strict();
export const preparedUploadCreationSchema=uploadCreationSnapshotSchema.extend({content_sha256:digest});
export const uploadCreationInputSchema=z.object({
 uploadSessionId:id,title:z.string().trim().min(1,'Title is required').max(500),document_type_id:id,
 description:z.string().max(2000).optional(),issue_date:zOptionalDateString,expiry_date:zOptionalDateString,
 owning_company_id:id.optional(),allowDuplicate:z.boolean().default(false),prepared:preparedUploadCreationSchema.optional(),
}).strict().refine(value=>!value.issue_date||!value.expiry_date||value.expiry_date>=value.issue_date,'Expiry date must be on or after issue date')
 .refine(value=>!value.prepared||(value.prepared.source.id===value.uploadSessionId&&value.prepared.type.id===value.document_type_id&&
  (value.owning_company_id===undefined||value.owning_company_id===value.prepared.source.owning_company_id)),'The prepared source does not match this upload.');
export const uploadCreationContractSchema=dmsCreationContractSchema;
export const uploadCreationReceiptSchema=z.object({documentId:id,documentNo:z.string().min(1),upload_session_id:id,
 operation_id:z.string().uuid(),replayed:z.boolean(),completed:z.literal(true),
}).strict();
export const uploadCreationPlanSchema=uploadCreationReceiptSchema.omit({completed:true}).extend({
 completed:z.boolean(),reference_id:id,storage_path:z.string().min(1).max(2048),
 actor_id:id,auth_session_id:z.string().uuid(),
});
export const uploadCreationPreparationSchema=z.object({operation_id:z.string().uuid(),snapshot:preparedUploadCreationSchema}).strict();
export type UploadCreationInput=z.input<typeof uploadCreationInputSchema>;
export type PreparedUploadCreation=z.infer<typeof preparedUploadCreationSchema>;
export type UploadCreationReceipt=z.infer<typeof uploadCreationReceiptSchema>;
export type UploadCreationResult={success:true;data:UploadCreationReceipt}|{success:false;error?:string;uncertain?:boolean;
 prepared?:z.infer<typeof uploadCreationPreparationSchema>;retained?:{documentId:number;documentNo:string}};
