import {z} from 'zod';
import {photoFramingInput} from './photo-framing';
export function isDefiniteEmployeeRejection(code:unknown):boolean{return typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code));}

export const employeeId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const employeeDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Use a complete date.').refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Enter a valid calendar date.');
const optionalDate=employeeDate.nullish();
const text=z.string().nullish();
const required=(label:string)=>z.string().trim().min(1,`${label} is required`);
export const employeeCreateShape={
 photo_framing:photoFramingInput.optional(),
 full_name_en:required('Full name (English)'),full_name_ar:text,known_name:text,gender:z.enum(['male','female']),nationality_id:employeeId.nullish(),date_of_birth:employeeDate,
 marital_status:z.enum(['single','married','divorced','widowed']).nullish(),mobile_number:required('Mobile number'),personal_email:z.string().email('Invalid email').nullish().or(z.literal('').transform(()=>null)),
 uae_address:text,home_country_address:text,blood_group:z.enum(['A+','A-','B+','B-','O+','O-','AB+','AB-']).nullish(),photo_dms_document_id:employeeId.nullish(),
 owner_company_id:employeeId,branch_id:employeeId.nullish(),department_id:employeeId.nullish(),designation_id:employeeId.nullish(),employee_category_id:employeeId,employment_type_id:employeeId.nullish(),
 joining_date:employeeDate,actual_joining_date:optionalDate,employee_status:z.enum(['active','inactive','on_leave','probation','suspended','terminated','archived']).default('active'),
 reporting_manager_id:employeeId.nullish(),supervisor_id:employeeId.nullish(),primary_work_site_id:employeeId.nullish(),sponsor_company_id:employeeId.nullish(),mohre_establishment_id:employeeId.nullish(),
 probation_start_date:optionalDate,probation_end_date:optionalDate,contract_type:z.enum(['limited','unlimited']).nullish(),contract_start_date:optionalDate,contract_end_date:optionalDate,notice_period_days:z.number().int().min(0).nullish(),
 emergency_contact_name:required('Emergency contact name'),emergency_contact_mobile:required('Emergency contact mobile'),emergency_contact_relationship_type_id:employeeId.nullish(),
};
/** Shared field/date policy; current native subject/lookup authority remains mandatory. */
export function employeeChronology(value:{date_of_birth?:string;joining_date?:string;probation_start_date?:string|null;probation_end_date?:string|null;contract_start_date?:string|null;contract_end_date?:string|null},ctx:z.RefinementCtx){
 for(const [start,end]of [['probation_start_date','probation_end_date'],['contract_start_date','contract_end_date']]as const){if(value[start]&&value[end]&&value[end]!<value[start]!)ctx.addIssue({code:'custom',path:[end],message:'End date cannot be before start date.'});}
 if(value.date_of_birth&&value.joining_date&&value.date_of_birth>value.joining_date)ctx.addIssue({code:'custom',path:['joining_date'],message:'Joining date cannot be before date of birth.'});
}
export const employeeCreateSchema=z.object(employeeCreateShape).superRefine(employeeChronology);
// Missing/null category is retained only for legacy updates; native validation
// prohibits clearing a category already assigned to an existing employee.
export const employeeUpdateSchema=z.object(employeeCreateShape).partial().extend({employee_category_id:employeeId.nullish(),inactive_date:optionalDate,inactive_reason:text,employment_change_reason:z.string().trim().max(2000).optional(),employment_effective_date:employeeDate.optional()}).superRefine(employeeChronology);
export const EMPLOYMENT_FIELDS=['owner_company_id','branch_id','department_id','designation_id','employee_category_id','employment_type_id','employee_status','joining_date','actual_joining_date','reporting_manager_id','supervisor_id','primary_work_site_id','sponsor_company_id','mohre_establishment_id','contract_type','contract_start_date','contract_end_date','probation_start_date','probation_end_date','notice_period_days'] as const;
