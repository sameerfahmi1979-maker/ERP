import {z}from 'zod';
import {employeeDate,employeeId,isDefiniteEmployeeRejection}from './employee-contract';
export const recruitmentLifecycleKind=z.enum(['interview','offer','task','joining','requisition','pipeline']);
export type RecruitmentLifecycleKind=z.infer<typeof recruitmentLifecycleKind>;
export const recruitmentRevision=z.string().regex(/^[1-9]\d*$/).refine(value=>BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER));
const text=z.string().trim().max(5000).nullish(),id=employeeId.nullish(),date=employeeDate.nullish();
const money=z.number().finite().min(0).max(9999999999.99).nullish();
export const interviewValues=z.object({
 interview_round:z.enum(['screening','first','second','technical','final','other']).default('first'),
 interview_datetime:z.string().datetime({offset:true}).nullish(),interview_location:text,interviewer_id:id,
 interview_status:z.enum(['scheduled','completed','cancelled','no_show','rescheduled']).default('scheduled'),
 requisition_id:id,result:z.enum(['pass','hold','fail','pending']).nullish(),score:z.number().finite().min(0).max(100).nullish(),feedback:text,next_step:text,
}).strict();
export const offerValues=z.object({
 requisition_id:id,offer_date:date,valid_until:date,proposed_joining_date:date,owner_company_id:id,branch_id:id,department_id:id,designation_id:id,employment_type_id:id,
 basic_salary:money,gross_salary:money,housing_allowance:money,transport_allowance:money,other_allowances:money,
 currency:z.string().regex(/^[A-Z]{3}$/).default('AED'),offer_document_id:id,notes:text,
 // State selection on create is limited to draft. Decisions use versioned actions.
 offer_status:z.literal('draft').optional(),
}).strict().superRefine((value,ctx)=>{
 if(value.offer_date&&value.valid_until&&value.valid_until<value.offer_date)ctx.addIssue({code:'custom',path:['valid_until'],message:'Valid until must not precede offer date.'});
 if(value.basic_salary!=null&&value.gross_salary!=null&&value.gross_salary<value.basic_salary)ctx.addIssue({code:'custom',path:['gross_salary'],message:'Gross salary must not be below basic salary.'});
});
export const taskValues=z.object({
 candidate_id:id,employee_id:id,task_title:z.string().trim().min(1).max(255),
 task_category:z.enum(['document','medical','visa','training','site_access','payroll','it','operations','hr','other']).nullish(),
 assigned_to:id,due_date:date,dms_document_id:id,notes:text,
 is_required:z.boolean().default(true),completion_criteria:z.string().trim().min(1).max(2000),
 evidence_required:z.boolean().default(false),prerequisite_task_id:id,
 task_status:z.enum(['pending','in_progress','blocked']).default('pending'),
}).strict().refine(value=>value.candidate_id!=null||value.employee_id!=null,'Choose an actual candidate or employee.');
export const recruitmentLifecycleActions=['create','update','archive','submit','approve','send','accept','reject','withdraw','cancel','expire','complete','reopen','reschedule','no-show','not-applicable','block','start','finish']as const;
export const recruitmentLifecycleRequest=z.object({
 kind:recruitmentLifecycleKind,candidateId:employeeId.nullable(),employeeId:employeeId.nullable().optional(),
 id:employeeId.nullable(),revision:recruitmentRevision.nullable(),action:z.enum(recruitmentLifecycleActions),
 values:z.record(z.string(),z.unknown()).default({}),reason:z.string().trim().min(1).max(2000),
}).strict().superRefine((r,ctx)=>{
 if(['joining','requisition','pipeline'].includes(r.kind)?(r.action==='create'||r.id==null||r.revision==null):(r.action==='create'?(r.id!==null||r.revision!==null):(r.id===null||r.revision===null)))ctx.addIssue({code:'custom',message:'Original record opening/revision is required.'});
 const actions={interview:['create','update','archive','complete','cancel','reschedule','no-show'],offer:['create','update','archive','submit','approve','send','accept','reject','withdraw','cancel','expire'],task:['create','update','archive','complete','reopen','not-applicable','cancel','block','start'],joining:['start','finish','cancel','reopen','no-show'],requisition:['update','archive'],pipeline:['update']};
 if(!actions[r.kind].includes(r.action))ctx.addIssue({code:'custom',message:'Unsupported lifecycle action.'});
 const schema=r.kind==='interview'?interviewValues:r.kind==='offer'?offerValues:r.kind==='requisition'?requisitionEditValues:r.kind==='pipeline'?pipelineValues:taskValues;
 if(['create','update'].includes(r.action)){
  const parsed=(r.action==='create'?schema:z.object(schema.shape).partial().strict()).safeParse(r.values);
  if(!parsed.success)ctx.addIssue({code:'custom',path:['values'],message:'Check the supported fields, dates, score and required facts.'});
 }else if(r.kind==='interview'&&['complete','reschedule'].includes(r.action)){
  if(!interviewValues.partial().safeParse(r.values).success)ctx.addIssue({code:'custom',path:['values'],message:'Invalid interview action values.'});
 }else if(Object.keys(r.values).length)ctx.addIssue({code:'custom',path:['values'],message:'This decision does not edit material fields.'});
});
export type RecruitmentLifecycleRequest=z.infer<typeof recruitmentLifecycleRequest>;
export const recruitmentLifecycleReceipt=z.object({kind:recruitmentLifecycleKind,id:employeeId,candidate_id:employeeId.nullable(),employee_id:employeeId.nullable(),operation_id:z.string().uuid(),revision:recruitmentRevision,replayed:z.boolean()}).strict();
export type RecruitmentLifecycleReceipt=z.infer<typeof recruitmentLifecycleReceipt>;
export type RecruitmentLifecycleResult={success:boolean;data?:RecruitmentLifecycleReceipt;error?:string;uncertain?:boolean};
export function isDefiniteRecruitmentRejection(code:unknown){return code==='PT409'||isDefiniteEmployeeRejection(code);}
export const requisitionEditValues=z.object({requisition_title:z.string().trim().min(1).max(255),vacancies_count:z.number().int().min(1).max(2147483647),requisition_status:z.enum(['draft','open','on_hold','filled','cancelled','closed']),priority:z.enum(['low','normal','high','urgent']),target_start_date:date,job_description:text,requirements:text,notes:text}).strict();
export const candidateProgressStates=['new','screening','shortlisted','interview','selected','offered','accepted','rejected','withdrawn','blacklisted']as const;
export const candidateProgressStages=['new','screening','shortlisted','interview','offer','onboarding','closed']as const;
export const pipelineValues=z.object({candidate_status:z.enum(candidateProgressStates),pipeline_stage:z.enum(candidateProgressStages)}).strict();
