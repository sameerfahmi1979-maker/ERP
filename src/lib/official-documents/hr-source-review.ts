import {z} from 'zod';
import type {OfficialDocumentInputField} from './types';
export const REVIEWED_LETTER_CODES=['HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM'] as const;
export const needsLetterReview=(code:string)=>REVIEWED_LETTER_CODES.some(value=>value===code);
const field=(key:string,label:string,type:'text'|'date'='text'):OfficialDocumentInputField=>({key,labelEn:label,type,required:true,maxLength:type==='date'?10:500});
/** Request-specific facts are reviewed against a retained DMS evidence version;
 * they never replace employee master data or establish stock/payment clearance. */
export const LETTER_REVIEW_FIELDS:Record<string,OfficialDocumentInputField[]>={
 HR_EXPERIENCE_LETTER:[field('termination_reason_ar','Verified end-of-service reason — Arabic'),field('designation_en','Verified last job title — English'),field('designation_ar','Verified last job title — Arabic')],
 HR_WARNING_LETTER:[field('warning_subject_ar','Warning subject — Arabic'),field('verified_conduct_description_ar','Reviewed incident — Arabic'),field('policy_reference_en','Applicable policy / clause — English'),field('policy_reference_ar','Applicable policy / clause — Arabic'),field('specific_corrective_action_ar','Recorded corrective action — Arabic'),field('corrective_deadline','Corrective deadline','date'),field('response_channel_en','Response channel — English'),field('response_channel_ar','Response channel — Arabic'),field('response_period','Response period — English'),field('response_period_ar','Response period — Arabic')],
 HR_PPE_ISSUE_FORM:[field('condition','Actual condition at issue — English'),field('condition_ar','Actual condition at issue — Arabic'),field('ppe_item_ar','PPE item — Arabic')],
 HR_HANDOVER_FORM:[field('handover_date','Actual handover date','date'),field('description_en','Item / duty actually handed over — English'),field('description_ar','Item / duty actually handed over — Arabic'),field('reference','Item / duty reference'),field('owner_name','Responsible owner named in signed evidence'),field('status_en','Recorded acceptance / outstanding status — English'),field('status_ar','Recorded acceptance / outstanding status — Arabic')],
};
const id=z.number().int().positive().safe();
const text=z.string().trim().min(1).max(500).regex(/^[^\u0000-\u001F\u007F]*$/);
export const letterReviewRequest=z.object({employeeId:id,code:z.enum(REVIEWED_LETTER_CODES),sourceId:id,receiverId:id.nullable(),documentId:id,versionId:id,facts:z.record(z.string(),text),operationId:z.string().uuid()}).strict().superRefine((v,c)=>{
 const fields=LETTER_REVIEW_FIELDS[v.code],keys=fields.map(f=>f.key);
 if(keys.some(key=>!v.facts[key])||Object.keys(v.facts).some(key=>!keys.includes(key)))c.addIssue({code:'custom',message:'Complete every source-review field; unrelated fields are not accepted.'});
 for(const f of fields.filter(f=>f.type==='date')){const day=v.facts[f.key]??'',d=new Date(day+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)c.addIssue({code:'custom',path:['facts',f.key],message:'Choose a valid date.'});}
 if((v.code==='HR_HANDOVER_FORM')!==(v.receiverId!==null)||v.receiverId===v.employeeId)c.addIssue({code:'custom',message:'Select the different receiving employee for handover only.'});
});
export type LetterReviewRequest=z.infer<typeof letterReviewRequest>;
export const letterReviewRow=z.object({id,employee_id:id,code:z.enum(REVIEWED_LETTER_CODES),source_id:id,receiver_id:id.nullable(),document_id:id,version_id:id,facts:z.record(z.string(),z.string()),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(['pending','approved','rejected']),created_by:id,reviewed_by:id.nullable(),created_at:z.string(),reviewed_at:z.string().nullable()}).passthrough();
export type LetterReviewRow=z.infer<typeof letterReviewRow>;
