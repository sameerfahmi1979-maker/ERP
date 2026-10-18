import {z} from 'zod';
export {hrReadIdentity as reportSchedulesIdentity} from './hr-read-identity';
const id=z.number().int().positive().refine(Number.isSafeInteger),integer=z.number().int().nonnegative().refine(Number.isSafeInteger);
export const reportSchedulesCriteriaSchema=z.object({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25),search:z.string().max(200).default(''),
 frequency:z.enum(['','daily','weekly','monthly']).default(''),isActive:z.enum(['','active','inactive']).default(''),lastStatus:z.enum(['','success','failed','skipped','cancelled']).default(''),
 sorting:z.array(z.object({id:z.enum(['id','schedule_name','frequency','output_format','next_run_at','last_run_at','last_status','is_active']),desc:z.boolean()}).strict()).max(8).refine(s=>new Set(s.map(v=>v.id)).size===s.length).default([{id:'schedule_name',desc:false}]),
}).strict();
export const reportScheduleListRowSchema=z.object({id,report_id:id,created_by:id,owner_company_id:id.nullable(),schedule_code:z.string().nullable(),schedule_name:z.string(),
 frequency:z.enum(['daily','weekly','monthly']),output_format:z.enum(['pdf','excel','csv']),recipient_to:z.array(z.string()),next_run_at:z.string().nullable(),last_run_at:z.string().nullable(),
 last_status:z.enum(['success','failed','skipped','cancelled']).nullable(),is_active:z.boolean(),timezone:z.string(),updated_at:z.string(),
 workspace_revision:z.union([id,z.string().regex(/^[1-9]\d*$/)]),
 report:z.object({report_code:z.string(),report_name_en:z.string(),module_code:z.string(),supports_scheduling:z.boolean().nullable()}).nullable(),
}).strip();
export const reportSchedulesPageSchema=z.object({page:z.number().int().positive(),pageSize:z.number().int().min(1).max(100),totalCount:integer,rows:z.array(reportScheduleListRowSchema)}).strict()
 .refine(v=>v.rows.length===Math.min(v.pageSize,Math.max(0,v.totalCount-(v.page-1)*v.pageSize))&&new Set(v.rows.map(r=>r.id)).size===v.rows.length);
export type ReportScheduleListRow=z.infer<typeof reportScheduleListRowSchema>;
