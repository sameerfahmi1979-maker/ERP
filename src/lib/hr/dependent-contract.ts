import {z} from 'zod';
import {photoFramingInput} from './photo-framing';
import {employeeDate,employeeId} from './employee-contract';
export const dependentSchema=z.object({
 photo_framing:photoFramingInput.optional(),
 dependent_name_en:z.string().trim().min(1,'Dependent name is required'),dependent_name_ar:z.string().nullish(),relationship_type_id:employeeId,
 date_of_birth:employeeDate.nullish(),nationality_id:employeeId.nullish(),passport_number:z.string().nullish(),passport_expiry:employeeDate.nullish(),emirates_id_number:z.string().nullish(),emirates_id_expiry:employeeDate.nullish(),residence_visa_number:z.string().nullish(),residence_visa_expiry:employeeDate.nullish(),
 medical_insurance_provider:z.string().nullish(),medical_insurance_policy:z.string().nullish(),medical_insurance_card:z.string().nullish(),medical_insurance_expiry:employeeDate.nullish(),sponsored_by:z.enum(['employee','company']).nullish(),is_active:z.boolean().default(true),dms_document_id:employeeId.nullish(),photo_dms_document_id:employeeId.nullish(),notes:z.string().nullish(),
});
export const dependentSaveContract=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable(),addDocumentIds:z.array(employeeId).max(100).default([]),removeDocumentIds:z.array(employeeId).max(100).default([])}).strict().superRefine((v,ctx)=>{
 if(new Set(v.addDocumentIds).size!==v.addDocumentIds.length||new Set(v.removeDocumentIds).size!==v.removeDocumentIds.length||v.addDocumentIds.some(id=>v.removeDocumentIds.includes(id)))ctx.addIssue({code:'custom',message:'Document changes contain duplicate or conflicting identities.'});
});
export type DependentSaveContract=z.input<typeof dependentSaveContract>;
export type DependentSaveReceipt={id:number;employee_id:number;operation_id:string;revision:string;replayed:boolean;dmsLinkCreated?:boolean};
export const dependentMutationSchema=z.object({employeeId:employeeId,id:employeeId.nullable(),kind:z.enum(['save','archive']),entry:z.enum(['manual','document']).optional(),revision:z.string().regex(/^[1-9]\d*$/).nullable(),values:z.record(z.string(),z.unknown()),addDocumentIds:z.array(employeeId).max(100),removeDocumentIds:z.array(employeeId).max(100)}).strict().superRefine((v,ctx)=>{
 if(v.id===null&&(v.revision!==null||v.kind==='archive')||v.id!==null&&v.revision===null)ctx.addIssue({code:'custom',message:'Dependent opening revision is missing.'});
});
export type DependentMutation=z.infer<typeof dependentMutationSchema>;
