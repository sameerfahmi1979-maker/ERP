import'server-only';import{z}from'zod';import type{createClient}from'@/lib/supabase/server';import{payrollToday,salaryDate}from'@/lib/hr/payroll/salary-as-of';
const id=z.number().int().positive().refine(Number.isSafeInteger);
const row=z.object({employee_id:id,readiness_status:z.enum(['ready','incomplete','not_enrolled','exempt','on_hold']),has_wps_profile:z.boolean(),missing_iban:z.boolean()}).strict();
/** One bounded set query per batch, never salary/account values or N+1 reads. */
export async function readPayrollReadinessFacts(db:Pick<Awaited<ReturnType<typeof createClient>>,'rpc'>,subjects:number[],asOf=payrollToday()){
 const ids=z.array(id).max(200).parse(subjects);salaryDate(asOf);if(new Set(ids).size!==ids.length)throw Error('Duplicate payroll review subjects');if(!ids.length)return[];
 const result=await db.rpc('f12_payroll_readiness_facts',{p_employees:ids,p_as_of:asOf});const rows=z.array(row).safeParse(result.data);
 if(result.error||!rows.success||rows.data.length!==ids.length||new Set(rows.data.map(r=>r.employee_id)).size!==ids.length||rows.data.some(r=>!ids.includes(r.employee_id)))throw Error('Complete authorized payroll readiness facts unavailable');
 return rows.data;
}
