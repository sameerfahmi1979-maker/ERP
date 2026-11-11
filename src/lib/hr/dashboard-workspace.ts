import {z} from 'zod';

const id=z.number().int().positive().refine(Number.isSafeInteger);
export const dashboardScopeSchema=z.object({companyId:id.optional(),branchId:id.optional(),departmentId:id.optional(),siteId:id.optional(),date:z.iso.date().optional(),expiryDays:z.enum(['7','30','60','90']).default('30')}).strict();
export type DashboardScope=z.input<typeof dashboardScopeSchema>;
export const dashboardRequestSchema=z.object({mode:z.enum(['overview','records','options']),scope:dashboardScopeSchema.default({expiryDays:'30'}),metric:z.string().max(80).optional(),page:z.number().int().min(1).max(2000).default(1)}).strict();
export type DashboardRequest=z.input<typeof dashboardRequestSchema>;
export const dashboardRowSchema=z.object({key:z.string(),label:z.string(),reference:z.string(),detail:z.string(),date:z.string().nullable(),href:z.string().startsWith('/admin/hr/')}).strict();
export type DashboardRow=z.infer<typeof dashboardRowSchema>;
export const dashboardMetricSchema=z.object({status:z.enum(['ready','restricted','failed','unavailable']),value:z.number().int().nonnegative().optional(),items:z.array(dashboardRowSchema).max(25),reason:z.string().optional()}).strict();
export type DashboardMetric=z.infer<typeof dashboardMetricSchema>;
const choice=z.object({id,label:z.string(),companyId:id.nullable().optional()}).strict();
export const dashboardResponseSchema=z.object({mode:z.enum(['overview','records','options']),scope:dashboardScopeSchema,asOf:z.iso.datetime(),page:z.number().int(),metric:z.string().optional(),metrics:z.record(z.string(),dashboardMetricSchema),options:z.object({companies:z.array(choice),branches:z.array(choice),departments:z.array(choice),sites:z.array(choice)}).optional(),charts:z.array(z.object({key:z.string(),label:z.string(),items:z.array(z.object({label:z.string(),value:z.number().int().nonnegative(),scope:dashboardScopeSchema.optional()}))})).optional()}).strict();
export type DashboardResponse=z.infer<typeof dashboardResponseSchema>;

export const DASHBOARD_GROUPS=['Workforce','Attendance & leave','Documents & compliance','Recruitment & joining','Payroll readiness','Deployment & HR operations'] as const;
type Group=typeof DASHBOARD_GROUPS[number];
export type DashboardDefinition={key:string;label:string;group:Group;permission:string[];unit:string;section?:string;table?:string;columns?:string;idColumn?:string;scope?:'employees'|'active'|'requisition'|'candidate'|'offer'|'interview'|'onboarding';statusColumn?:string;dateColumn?:string;softDelete?:boolean;hint?:string};
const definition=(key:string,label:string,group:Group,permission:string,extra:Partial<DashboardDefinition>={}):DashboardDefinition=>({key,label,group,permission:permission.split(','),unit:'records',...extra});
export const DASHBOARD_DEFINITIONS:DashboardDefinition[]=[
 definition('workforce','Current workforce','Workforce','employees',{unit:'employees',hint:'Active, probation and on-leave employees; current recorded status.'}),
 definition('joiners','New joiners this month','Workforce','employees',{unit:'employees'}),
 definition('probation','On probation','Workforce','employees',{unit:'employees'}),
 definition('attendance_entered','Attendance entered','Attendance & leave','attendance',{unit:'employees',section:'time'}),
 definition('attendance_missing','Attendance not entered','Attendance & leave','attendance',{unit:'employees',section:'time',hint:'Current employees without an entry on the selected date, including those on leave; this does not mean absent or require an attendance entry.'}),
 definition('attendance_pending','Attendance awaiting approval','Attendance & leave','attendance',{table:'employee_attendance_daily_summary',scope:'active',softDelete:false,statusColumn:'approval_status',dateColumn:'attendance_date',section:'time',hint:'Selected date.'}),
 definition('missing_punches','Incomplete time entries','Attendance & leave','attendance',{table:'employee_attendance_daily_summary',scope:'active',softDelete:false,statusColumn:'approval_status',dateColumn:'attendance_date',section:'time'}),
 definition('leave_today','On approved leave','Attendance & leave','leave',{unit:'employees',section:'time'}),
 definition('leave_pending','Leave awaiting approval','Attendance & leave','leave',{table:'employee_leave_requests',scope:'employees',statusColumn:'approval_status',dateColumn:'start_date',section:'time'}),
 definition('leave_upcoming','Upcoming approved leave','Attendance & leave','leave',{table:'employee_leave_requests',scope:'employees',statusColumn:'approval_status',dateColumn:'start_date',section:'time',hint:'Starts in the next 30 days after the selected date.'}),
 definition('overtime','Overtime awaiting approval','Attendance & leave','attendance',{table:'employee_overtime_records',scope:'active',statusColumn:'approval_status',section:'time'}),
 definition('expired','Expired identity documents','Documents & compliance','compliance',{table:'employee_identity_documents',scope:'employees',dateColumn:'expiry_date',statusColumn:'verification_status',section:'compliance'}),
 definition('expiring','Identity documents expiring soon','Documents & compliance','compliance',{table:'employee_identity_documents',scope:'employees',dateColumn:'expiry_date',statusColumn:'verification_status',section:'compliance'}),
 definition('unverified','Unverified / failed identity evidence','Documents & compliance','compliance',{table:'employee_identity_documents',scope:'employees',statusColumn:'verification_status',section:'compliance'}),
 definition('cards_due','Access cards expired / expiring','Documents & compliance','compliance',{table:'employee_access_cards',scope:'employees',dateColumn:'expiry_date',statusColumn:'status',section:'compliance'}),
 definition('training_due','Training expired / expiring','Documents & compliance','compliance',{table:'employee_training_certificates',scope:'employees',dateColumn:'expiry_date',section:'compliance'}),
 definition('candidates','Active candidates','Recruitment & joining','recruitment',{table:'hr_candidates',scope:'candidate',statusColumn:'candidate_status',columns:'candidate_code,full_name_en,requisition_id',unit:'candidates'}),
 definition('requisitions','Open requisitions','Recruitment & joining','recruitment',{table:'hr_job_requisitions',scope:'requisition',statusColumn:'requisition_status',columns:'requisition_code,requisition_title'}),
 definition('interviews','Interviews this week','Recruitment & joining','recruitment',{table:'hr_interviews',scope:'interview',statusColumn:'interview_status',dateColumn:'interview_datetime',columns:'candidate_id,requisition_id'}),
 definition('offers','Offers awaiting response','Recruitment & joining','recruitment',{table:'hr_offers',scope:'offer',statusColumn:'offer_status',dateColumn:'valid_until',columns:'candidate_id'}),
 definition('offers_accepted','Accepted offers','Recruitment & joining','recruitment',{table:'hr_offers',scope:'offer',statusColumn:'offer_status',dateColumn:'proposed_joining_date',columns:'candidate_id'}),
 definition('onboarding','Unfinished joining tasks','Recruitment & joining','recruitment',{table:'hr_onboarding_tasks',scope:'onboarding',statusColumn:'task_status',dateColumn:'due_date',columns:'candidate_id,employee_id,task_title'}),
 definition('wps_ready','WPS ready','Payroll readiness','payroll,banking',{unit:'employees',section:'payroll',hint:'Readiness only; not payment confirmation.'}),
 definition('wps_incomplete','WPS incomplete / on hold','Payroll readiness','payroll,banking',{unit:'employees',section:'payroll'}),
 definition('missing_iban','Missing IBAN','Payroll readiness','payroll,banking',{unit:'employees',section:'payroll'}),
 definition('payroll_missing','Missing payroll profile','Payroll readiness','payroll',{unit:'employees',section:'payroll'}),
 definition('payroll_holds','Active payroll holds','Payroll readiness','payroll',{table:'employee_payroll_holds',scope:'active',section:'payroll'}),
 definition('salary_pending','Salary changes awaiting approval','Payroll readiness','payroll',{table:'employee_salary_revision_reviews',idColumn:'revision_id',scope:'employees',statusColumn:'status',dateColumn:'created_at',softDelete:false,section:'payroll'}),
 definition('assignments','Current assignments','Deployment & HR operations','assignments',{table:'employee_assignments',scope:'active',statusColumn:'assignment_status',dateColumn:'effective_from',section:'operations'}),
 definition('blocks','Active restrictions','Deployment & HR operations','assignments',{table:'employee_operational_blocks',scope:'active',statusColumn:'block_status',dateColumn:'effective_from',section:'operations'}),
 definition('readiness','Saved checks needing review','Deployment & HR operations','assignments',{table:'employee_site_readiness',scope:'active',statusColumn:'readiness_status',dateColumn:'checked_at',section:'operations',hint:'Saved non-ready checks; not a live deployment clearance.'}),
 definition('pro','Open PRO processes','Deployment & HR operations','actions',{table:'employee_pro_processes',scope:'employees',statusColumn:'process_status',section:'hr-actions'}),
 definition('approvals','HR approvals awaiting action','Deployment & HR operations','actions',{table:'employee_approval_requests',scope:'employees',statusColumn:'request_status',dateColumn:'created_at',columns:'approval_type',section:'hr-actions'}),
 definition('clearance','Pending clearance items','Deployment & HR operations','actions,eos',{table:'employee_clearance_items',scope:'employees',statusColumn:'item_status',columns:'item_title',section:'hr-actions'}),
 definition('actions','Open HR tasks','Deployment & HR operations','actions',{table:'employee_hr_actions',scope:'employees',statusColumn:'action_status',dateColumn:'due_date',columns:'action_title',section:'hr-actions'}),
 definition('eos','Open end-of-service cases','Deployment & HR operations','actions,eos',{table:'employee_eos_cases',scope:'employees',statusColumn:'case_status',section:'hr-actions'}),
 definition('disciplinary','Open disciplinary records','Deployment & HR operations','actions,confidential',{table:'employee_disciplinary_records',scope:'employees',statusColumn:'status',section:'hr-actions'}),
 definition('assets','Issued assets','Deployment & HR operations','assignments',{table:'employee_assets',scope:'active',statusColumn:'status',section:'operations'}),
 definition('ppe','PPE due for replacement','Deployment & HR operations','assignments',{table:'employee_ppe_issues',scope:'active',dateColumn:'expiry_or_replacement_date',section:'operations'}),
 definition('accommodation','Active accommodation records','Deployment & HR operations','assignments',{table:'employee_accommodation_records',scope:'active',statusColumn:'status',section:'operations'}),
];
export const DASHBOARD_HERO=['workforce','attendance_entered','leave_today','expired','expiring','approvals'];
export function dashboardMetricLabel(metric:DashboardMetric|undefined):string {
 if(!metric)return 'Loading…';
 return metric.status==='ready'?String(metric.value??'—'):metric.status==='restricted'?'Restricted':metric.status==='failed'?'Could not load':'Unavailable';
}
