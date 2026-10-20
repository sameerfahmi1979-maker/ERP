import{z}from 'zod';
import{complianceChildKind,complianceValueSchemas,complianceOperationValues,COMPLIANCE_CHILD_ACTIONS,type ComplianceChildKind}from'./compliance-child-contract';
import{timeChildKind,timeChildValues,timeOperationValues,type TimeChildKind}from'./time-child-contract';
import{siteReadinessValues,siteReadinessNotes}from'./site-readiness-contract';
import{payrollChildKind,payrollChildValues,type PayrollChildKind}from'./payroll-child-contract';
import{roleRequirementValues,roleRequirementCreateValues,requirementWaiverValues,requirementRefreshValues}from'./role-requirement-contract';
import{operationalBlockValues,blockReleaseValues}from'./operational-block-contract';
import{operationItemKind,operationItemValues,operationItemActionValues}from './operation-item-contract';
import{employeeId,employeeDate}from './employee-contract';
export const childKind=z.enum([...complianceChildKind.options,'hr-note','pro-process','hr-action','performance','disciplinary','approval','eos-case','clearance','assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh','site-readiness','payroll-profile','salary-component','salary-revision','wps-profile','payroll-hold','attendance-summary','attendance-punch','shift-assignment','leave-request','leave-balance','overtime']);
export type ChildKind=z.infer<typeof childKind>;
export const proProcessValues=z.object({
 process_title:z.string().trim().min(1,'Process title is required.').max(500),
 process_status:z.enum(['draft','requested','in_progress','waiting_for_document','submitted','approved','rejected','cancelled','completed']).default('draft'),
 priority:z.enum(['low','normal','high','urgent']).default('normal'),request_date:employeeDate,
 target_date:employeeDate.nullable().default(null),notes:z.string().max(5000).nullable().default(null),
}).strict();
/** Existing full wording must remain readable, even when it needs correction
 * before a future write. Do not truncate or apply new-write length limits on read. */
export const proProcessOpeningValues=proProcessValues.extend({process_title:z.string(),notes:z.string().nullable()});
export const hrActionValues=z.object({
 action_title:z.string().trim().min(1,'Action title is required.').max(500),
 action_type:z.enum(['general','probation_review','transfer','promotion','increment_recommendation','status_change','warning','memo','other']).default('general'),
 action_status:z.enum(['open','in_progress','closed','cancelled']).default('open'),action_date:employeeDate,
 due_date:employeeDate.nullable().default(null),notes:z.string().max(5000).nullable().default(null),
}).strict();
export const hrActionOpeningValues=hrActionValues.extend({action_title:z.string(),notes:z.string().nullable()});
export const performanceValues=z.object({review_type:z.enum(['probation','annual','project','incident_followup','other']),review_date:employeeDate,rating:z.enum(['excellent','good','satisfactory','needs_improvement','unsatisfactory']).nullable().default(null),summary:z.string().max(5000).nullable().default(null),status:z.enum(['draft','submitted','cancelled']).default('draft')}).strict();
export const performanceOpeningValues=performanceValues.extend({summary:z.string().nullable(),status:z.enum(['draft','submitted','approved','closed','cancelled'])});
export const disciplinaryValues=z.object({subject:z.string().trim().min(1,'Subject is required.').max(500),disciplinary_type:z.enum(['verbal_warning','written_warning','final_warning','suspension_notice','incident','other']),record_date:employeeDate,incident_date:employeeDate.nullable().default(null),severity:z.enum(['low','medium','high','critical']).default('medium'),status:z.enum(['open','under_review','closed','cancelled']).default('open'),description:z.string().max(5000).nullable().default(null),action_taken:z.string().max(5000).nullable().default(null),creates_operational_block:z.boolean().default(false)}).strict();
export const disciplinaryOpeningValues=disciplinaryValues.extend({subject:z.string(),description:z.string().nullable(),action_taken:z.string().nullable()});
export const approvalValues=z.object({approval_type:z.enum(['hr_action','pro_process','performance','disciplinary','eos','clearance','other']),request_title:z.string().trim().min(1,'Request title is required.').max(500)}).strict();
export const approvalOpeningValues=approvalValues.extend({request_title:z.string()});
export const eosCaseValues=z.object({eos_type:z.enum(['resignation','termination','contract_end','absconding','death','other']),case_status:z.enum(['draft','notice_served','clearance_in_progress','pending_final_settlement','closed','cancelled']).default('draft'),notice_date:employeeDate.nullable().default(null),last_working_date:employeeDate.nullable().default(null),reason:z.string().max(5000).nullable().default(null)}).strict();
export const eosCaseOpeningValues=eosCaseValues.extend({reason:z.string().nullable()});
export const eosCaseStatusValues=z.object({case_status:eosCaseValues.shape.case_status.unwrap(),notes:z.string().max(5000).optional()}).strict();
const assignmentFields={assignment_type:z.enum(['primary','temporary','project','site','department','relief']).default('primary'),assignment_status:z.enum(['active','planned','completed','cancelled']).default('active'),effective_from:employeeDate,effective_to:employeeDate.nullable().default(null),notes:z.string().max(2000).nullable().default(null)};
export const assignmentOpeningValues=z.object({assignment_type:assignmentFields.assignment_type.unwrap(),assignment_status:assignmentFields.assignment_status.unwrap(),effective_from:employeeDate,effective_to:employeeDate.nullable(),notes:z.string().nullable()}).strict();
export const assignmentValues=z.object(assignmentFields).strict().refine(value=>!value.effective_to||value.effective_to>=value.effective_from,{path:['effective_to'],message:'Effective to must not precede effective from.'});
export const assignmentEditValues=assignmentOpeningValues.extend({notes:z.string().max(2000).nullable()}).refine(value=>!value.effective_to||value.effective_to>=value.effective_from,{path:['effective_to'],message:'Effective to must not precede effective from.'});
export const clearanceArea=z.enum(['hr','operations','it','finance','camp','workshop','store','hse','other']);
export const clearanceStatus=z.enum(['pending','cleared','not_applicable','blocked']);
export const clearanceValues=z.object({eos_case_id:employeeId,clearance_area:clearanceArea,item_title:z.string().trim().min(1,'Item title is required.').max(500),item_status:z.literal('pending').optional(),notes:z.string().max(2000).nullable().optional(),responsible_user_id:z.null().optional()}).strict();
export const clearanceEditValues=z.object({eos_case_id:employeeId,clearance_area:clearanceArea.optional(),item_title:z.string().trim().min(1).max(500).optional(),item_status:clearanceStatus.optional(),notes:z.string().max(2000).nullable().optional()}).strict().refine(v=>Object.keys(v).some(k=>k!=='eos_case_id'),'At least one clearance change is required.');
export const clearanceOpeningValues=z.object({eos_case_id:employeeId,clearance_area:clearanceArea,item_title:z.string(),item_status:clearanceStatus,notes:z.string().nullable()}).strict();
export const clearanceOperationValues=(action:string)=>action==='archive'?z.object({eos_case_id:employeeId}).strict():['clear','block'].includes(action)?z.object({eos_case_id:employeeId,notes:z.string().max(2000).optional()}).strict():action==='update'?clearanceEditValues:clearanceValues;
export const approvalDecisionValues=(action:string)=>z.object({reason:action==='approve'?z.string().trim().max(5000).default(''):z.string().trim().min(1,'Reason is required.').max(5000)}).strict();
export const childValuesSchema=(kind:ChildKind)=>complianceChildKind.safeParse(kind).success?complianceValueSchemas[kind as ComplianceChildKind]:timeChildKind.safeParse(kind).success?timeChildValues(kind as TimeChildKind):payrollChildKind.safeParse(kind).success?payrollChildValues(kind as PayrollChildKind):kind==='site-readiness'?siteReadinessValues:kind==='requirements-refresh'?requirementRefreshValues:kind==='role-requirement'?roleRequirementValues:kind==='operational-block'?operationalBlockValues:operationItemKind.safeParse(kind).success?operationItemValues(kind as import('./operation-item-contract').OperationItemKind):kind==='assignment'?assignmentValues:kind==='clearance'?clearanceValues:kind==='eos-case'?eosCaseValues:kind==='hr-note'?hrNoteValues:kind==='pro-process'?proProcessValues:kind==='performance'?performanceValues:kind==='disciplinary'?disciplinaryValues:kind==='approval'?approvalValues:hrActionValues;
export const childOperationValues=(kind:ChildKind,action:string)=>complianceChildKind.safeParse(kind).success?complianceOperationValues(kind as ComplianceChildKind,action):timeChildKind.safeParse(kind).success?timeOperationValues(kind as TimeChildKind,action):payrollChildKind.safeParse(kind).success&&action==='release'?z.object({}).strict():kind==='site-readiness'&&action==='update'?siteReadinessNotes:kind==='role-requirement'&&action==='waive'?requirementWaiverValues:kind==='role-requirement'&&action==='create'?roleRequirementCreateValues:kind==='operational-block'&&action==='release'?blockReleaseValues:operationItemKind.safeParse(kind).success?operationItemActionValues(kind as import('./operation-item-contract').OperationItemKind,action):kind==='assignment'&&action==='update'?assignmentEditValues:kind==='clearance'?clearanceOperationValues(action):kind==='eos-case'&&action==='set-status'?eosCaseStatusValues:kind==='approval'&&['approve','reject','cancel'].includes(action)?approvalDecisionValues(action):['archive','submit','approve','acknowledge','correct-acknowledgement'].includes(action)||kind==='performance'&&action==='close'?z.object({}).strict():action==='close'?z.object({notes:z.string().max(5000).optional()}).strict():action==='cancel'?z.object({reason:z.string().trim().min(1).max(5000)}).strict():childValuesSchema(kind);
export const hrNoteValues=z.object({
 note_type:z.enum(['general','confidential','management','legal','other']).default('general'),
 note_text:z.string().trim().min(1,'Note is required.').max(10000),
 visibility:z.enum(['hr_only','management','restricted']).default('hr_only'),
 related_record_type:z.string().max(100).nullish(),related_record_id:employeeId.nullish(),
}).strict();
export const childSaveContract=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export type ChildSaveContract=z.infer<typeof childSaveContract>;
export const childMutationSchema=z.object({kind:childKind,employeeId,id:employeeId.nullable(),action:z.enum(['create','update','archive','close','cancel','submit','approve','reject','acknowledge','correct-acknowledgement','set-status','clear','block','return','end','release','waive','query','correct','recalculate','verify','renewal']),revision:z.string().regex(/^[1-9]\d*$/).nullable(),values:z.record(z.string(),z.unknown())}).strict().superRefine((r,ctx)=>{
 if(r.action==='create'?(r.id!==null||r.revision!==null):(r.id===null||r.revision===null))ctx.addIssue({code:'custom',message:'Child opening identity, revision or operation is invalid.'});
 if(!childOperationValues(r.kind,r.action).safeParse(r.values).success)ctx.addIssue({code:'custom',path:['values'],message:'Invalid or unrecognized child fields.'});
 const actions:Record<ChildKind,readonly string[]>={...COMPLIANCE_CHILD_ACTIONS,'hr-note':['create','archive'],'pro-process':['create','update','archive'],'hr-action':['create','update','archive','close','cancel'],performance:['create','update','archive','submit','approve','close'],disciplinary:['create','update','archive','acknowledge','correct-acknowledgement','close'],approval:['create','archive','approve','reject','cancel'],'eos-case':['create','update','archive','set-status'],clearance:['create','update','archive','clear','block'],assignment:['create','update','archive'],asset:['create','update','archive','return'],ppe:['create','update','archive','return'],accommodation:['create','update','archive','end'],'operational-block':['create','release','archive'],'role-requirement':['create','update','archive','waive'],'requirements-refresh':['create'],'site-readiness':['create','update'],'payroll-profile':['create','update','archive'],'salary-component':['create','update','archive'],'salary-revision':['create'],'wps-profile':['create','update','archive'],'payroll-hold':['create','release','archive'],'attendance-summary':['create','update','approve','query','correct'],'attendance-punch':['create'],'shift-assignment':['create','update','archive'],'leave-request':['create','approve','reject','cancel','archive'],'leave-balance':['create','update','recalculate'],overtime:['create','update','approve','reject','archive']};
 if(!actions[r.kind].includes(r.action))ctx.addIssue({code:'custom',message:'This operation is not supported for this child kind.'});
});
export type ChildMutation=z.infer<typeof childMutationSchema>;
const childReceiptFields=z.object({kind:childKind,id:employeeId,employee_id:employeeId,eos_case_id:employeeId.optional(),operation_id:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).strict();
const receiptHasOriginalCase=(value:{kind:string;eos_case_id?:number})=>value.kind==='clearance'?value.eos_case_id!==undefined:value.eos_case_id===undefined;
export const childReceiptSchema=childReceiptFields.refine(receiptHasOriginalCase,'The clearance receipt must identify its original case.');
export type ChildReceipt=z.infer<typeof childReceiptSchema>;
export type ChildSaveResult={success:boolean;data?:ChildReceipt;error?:string;fieldErrors?:Record<string,string>;uncertain?:boolean;retired?:true;accessDenied?:true};
export const childReceiptCursor=z.object({createdAt:z.string().datetime({offset:true}),operationId:z.string().uuid()}).strict();
export type ChildReceiptCursor=z.infer<typeof childReceiptCursor>;
export const recentChildReceiptSchema=childReceiptFields.extend({action:z.enum(['create','update','archive','close','cancel','submit','approve','reject','acknowledge','correct-acknowledgement','set-status','clear','block','return','end','release','waive','query','correct','recalculate','verify','renewal']),replayed:z.literal(true),created_at:z.string().datetime({offset:true})}).strict().refine(receiptHasOriginalCase,'The clearance receipt must identify its original case.');
export type RecentChildReceipt=z.infer<typeof recentChildReceiptSchema>;
