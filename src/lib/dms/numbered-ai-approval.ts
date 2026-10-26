import {z} from 'zod';
import {dmsCreationContractSchema} from './numbered-document-create';
import {DMS_CONFIDENTIALITY_LEVELS} from '@/features/dms/documents/dms-document-constants';
import {DMS_ENTITY_TYPE_CODES} from './dms-entity-types';
import {ALLOWED_FIELD_TYPES} from '@/features/dms/admin/dms-constants';
import {zOptionalDateString} from './date-validators';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const date=zOptionalDateString.nullable();
export const aiApprovalSnapshotSchema=z.object({
 source:z.object({id,session_code:z.string().min(1),uploaded_by:id,owning_company_id:id.nullable(),owning_branch_id:id.nullable(),
  temp_storage_path:z.string().min(1).max(2048),original_filename:z.string().min(1).max(1024),mime_type:z.string().min(1).max(255),
  file_size_bytes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),sha256_hash:z.string().regex(/^[a-fA-F0-9]{64}$/).nullable(),ai_result_id:id.nullable(),
 }).strict(),
 type:z.object({id,category_id:id,type_code:z.string().min(1).max(100),default_confidentiality:z.enum(DMS_CONFIDENTIALITY_LEVELS),requires_expiry_tracking:z.boolean()}).strict(),
 source_fingerprint:digest,context_fingerprint:digest,analysis_result_id:id.nullable(),analysis_fingerprint:digest.nullable(),storage_year:z.number().int().min(2000).max(9999),
}).strict();
export const aiApprovalPreparedSchema=aiApprovalSnapshotSchema.extend({content_sha256:digest});
export const aiApprovalInputSchema=z.object({
 uploadSessionId:id,title:z.string().trim().min(1,'Title is required').max(500),documentTypeId:id,
 description:z.string().max(2000).nullable().optional(),issueDate:date,expiryDate:date,
 confidentialityLevel:z.enum(DMS_CONFIDENTIALITY_LEVELS).optional(),owningCompanyId:id.nullable().optional(),owningBranchId:id.nullable().optional(),partyId:id.nullable().optional(),
 metadataValues:z.array(z.object({definitionId:id,fieldType:z.enum(ALLOWED_FIELD_TYPES),rawValue:z.string().max(16384)}).strict()).max(200).default([]),
 tagIds:z.array(id).max(100).default([]),links:z.array(z.object({entityType:z.enum(DMS_ENTITY_TYPE_CODES),entityId:id,linkRole:z.string().max(100).optional(),isPrimary:z.boolean().optional()}).strict()).max(100).default([]),
 aiResultId:id.nullable().optional(),allowDuplicate:z.boolean().default(false),standardFileName:z.string().trim().min(1).max(200).nullable().optional(),prepared:aiApprovalPreparedSchema.optional(),
}).strict().superRefine((value,ctx)=>{
 const issue=(message:string)=>ctx.addIssue({code:'custom',message});
 if(value.issueDate&&value.expiryDate&&value.expiryDate<value.issueDate)issue('Expiry date must be on or after issue date');
 if(value.owningBranchId&&!value.owningCompanyId)issue('Choose a company for the selected branch');
 if(new Set(value.metadataValues.map(v=>v.definitionId)).size!==value.metadataValues.length)issue('Duplicate metadata field');
 if(new Set(value.tagIds).size!==value.tagIds.length)issue('Duplicate tag');
 if(new Set(value.links.map(v=>`${v.entityType}:${v.entityId}`)).size!==value.links.length)issue('Duplicate record link');
 if(value.prepared&&(value.prepared.source.id!==value.uploadSessionId||value.prepared.type.id!==value.documentTypeId||
  (value.aiResultId!=null&&value.aiResultId!==value.prepared.analysis_result_id)))issue('Prepared approval does not match this intake');
});
export const aiApprovalContractSchema=dmsCreationContractSchema;
export const aiApprovalReceiptSchema=z.object({documentId:id,documentNo:z.string().min(1),upload_session_id:id,operation_id:z.string().uuid(),
 approve_run_id:id,file_id:id,completed:z.literal(true),replayed:z.boolean()}).strict();
export const aiApprovalPlanSchema=aiApprovalReceiptSchema.omit({completed:true,file_id:true}).extend({completed:z.boolean(),file_id:id.nullable(),
 reference_id:id,storage_path:z.string().min(1).max(2048),actor_id:id,auth_session_id:z.string().uuid()});
export const aiApprovalPreparationSchema=z.object({operation_id:z.string().uuid(),snapshot:aiApprovalPreparedSchema}).strict();
// Explicit acknowledgement from the read-only preparation branch, not a
// generic save failure. Never usable to abandon a prepared/reserved attempt.
export const aiApprovalPreparationRejectionSchema=z.object({operation_id:z.string().uuid(),upload_session_id:id}).strict();
export const aiApprovalRecoverySchema=z.object({input:aiApprovalInputSchema,contract:aiApprovalContractSchema,receipt:aiApprovalReceiptSchema.nullable()}).strict().superRefine((value,ctx)=>{
 if(!value.input.prepared||value.receipt&&(value.receipt.operation_id!==value.contract.operationId||value.receipt.upload_session_id!==value.input.uploadSessionId))ctx.addIssue({code:'custom',message:'Invalid retained approval identity'});
});
export type AiApprovalRecoveryResult={success:true;data:z.infer<typeof aiApprovalRecoverySchema>|null}|{success:false;error:string};
export type AiApprovalInput=z.input<typeof aiApprovalInputSchema>;
export type AiApprovalReceipt=z.infer<typeof aiApprovalReceiptSchema>;
export type AiApprovalResult={success:true;data:AiApprovalReceipt}|{success:false;error?:string;uncertain?:boolean;
 recoveryRequired?:boolean;prepared?:z.infer<typeof aiApprovalPreparationSchema>;preparationRejected?:z.infer<typeof aiApprovalPreparationRejectionSchema>;retained?:{documentId:number;documentNo:string}};
