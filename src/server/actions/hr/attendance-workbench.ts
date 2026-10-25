'use server';
export async function readTimesheetSites(raw:unknown){
 const parsed=z.object({company:z.number().int().positive().safe(),date:z.string().date(),search:z.string().max(100),after:z.number().int().nonnegative().safe()}).strict().safeParse(raw);
 if(!parsed.success)return{success:false as const,error:'Choose a valid company and date.'};
 try{
  if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,error:'Current attendance authority required.'};
  const q=parsed.data,r=await(await createClient()).rpc('timesheet_site_choices',{p_company:q.company,p_date:q.date,p_search:q.search,p_after:q.after});
  const rows=z.array(z.object({id:z.number().int().positive().safe(),label:z.string()}).strict()).max(26).safeParse(r.data);
  if(r.error||!rows.success)return{success:false as const,error:'Permitted sites are unavailable.'};
  return{success:true as const,rows:rows.data.slice(0,25),hasMore:rows.data.length>25};
 }catch{return{success:false as const,error:'Permitted sites are unavailable.'};}
}
export async function readAttendanceEntryOpening(employee:unknown,id:unknown=null){
 const p=z.object({employee:z.number().int().positive().safe(),id:z.number().int().positive().safe().nullable()}).strict().safeParse({employee,id});
 if(!p.success)return{success:false as const,error:'Invalid attendance opening.'};
 try{
  if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,denied:true,error:'Current attendance authority required.'};
  const r=await(await createClient()).rpc('f12_attendance_entry_opening',{p_employee:p.data.employee,p_id:p.data.id});
  const parsed=z.object({date:z.string().date(),company:z.number().int().positive().safe(),row:attendanceRosterRow}).strict().safeParse(r.data);
  if(r.error||!parsed.success||parsed.data.row.employee_id!==p.data.employee||p.data.id!==null&&parsed.data.row.id!==p.data.id)return{success:false as const,error:'Original employee/date context unavailable.'};
  return{success:true as const,data:parsed.data};
 }catch{return{success:false as const,error:'Attendance context unavailable. No entry was saved.'};}
}
export async function readAttendanceChoices(raw: unknown) {
 const p = z.object({kind:z.enum(['site','team','shift']), company:z.number().int().positive().safe(),date:z.string().date(),branch:z.number().int().positive().safe().nullable(),search:z.string().max(100),after:z.number().int().nonnegative().safe()}).strict().safeParse(raw);
 if (!p.success) return {success:false as const,error:'Choose a valid roster context.'};
 try {
  if (!canUseHrChild(await getAuthContext(),'attendance-summary')) return {success:false as const,denied:true,error:'Current attendance access required.'};
  const q=p.data,r=await(await createClient()).rpc('f12_attendance_choices',{p_kind:q.kind,p_company:q.company,p_date:q.date,p_branch:q.branch,p_search:q.search,p_after:q.after});
  const parsed=z.array(z.object({id:z.number().int().positive().safe(),label:z.string()}).strict()).max(26).safeParse(r.data);
  if(r.error||!parsed.success)return{success:false as const,denied:r.error?.code==='42501',error:'Permitted choices unavailable.'};
  return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};
 } catch {return{success:false as const,error:'Permitted choices unavailable.'};}
}
export async function readRecentAttendance(raw:unknown=null) {
 const p=z.object({before:z.string().datetime({offset:true}),operation:z.string().uuid()}).strict().nullable().safeParse(raw);
 if(!p.success)return{success:false as const,error:'Invalid receipt page.'};
 try {
  if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,denied:true,error:'Current attendance access required.'};
  const r=await(await createClient()).rpc('f12_recent_attendance',p.data?{p_before:p.data.before,p_cursor:p.data.operation}:{});
  const parsed=z.array(z.object({receipt:attendanceReceipt,created_at:z.string().datetime({offset:true})}).strict()).max(26).safeParse(r.data);
  if(r.error||!parsed.success)return{success:false as const,error:'Recent confirmations unavailable; absence is not proof of failure.'};
  return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};
 }catch{return{success:false as const,error:'Recent confirmations unavailable.'};}
}
import{z}from'zod';import{revalidatePath}from'next/cache';import{getAuthContext}from'@/lib/rbac/check';import{canUseHrChild}from'@/lib/hr/child-authority';import{createClient}from'@/lib/supabase/server';import{attendanceRosterQuery,attendanceRosterRow,attendanceRosterPage,attendanceRowRequest,attendanceReceipt}from'@/lib/hr/attendance-workbench-contract';import{isDefiniteEmployeeRejection}from'@/lib/hr/employee-contract';
export async function readLeavePeriodBalances(employee:unknown,after=0){const id=z.number().int().positive().safe();if(!id.safeParse(employee).success||!Number.isSafeInteger(after)||after<0)return{success:false as const,error:'Invalid period request.'};try{const ctx=await getAuthContext();if(!ctx.isAccountActive||!ctx.profile||ctx.profile.must_change_password)return{success:false as const,error:'Current account required.'};const r=await(await createClient()).rpc('f12_leave_period_balances',{p_employee:employee,p_after:after}),parsed=z.array(z.object({id,leave_type_id:id,leave_year:z.number().int(),period_start:z.string().nullable(),period_end:z.string().nullable(),period_basis:z.string().nullable(),entitled_days:z.number(),used_days:z.number(),reserved_days:z.number().nullable(),known:z.boolean()}).strict()).max(26).safeParse(r.data);if(r.error||!parsed.success)return{success:false as const,error:'Complete period facts unavailable.'};return{success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};}catch{return{success:false as const,error:'Period availability unknown.'};}}
export async function readAttendanceRoster(raw:unknown){const p=attendanceRosterQuery.safeParse(raw);if(!p.success)return{success:false as const,error:'Choose a valid date, company, status and page.'};try{if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,error:'Current attendance read and manage access required.',denied:true};const q=p.data,r=await(await createClient()).rpc('f12_attendance_roster',{p_date:q.date,p_company:q.company,p_branch:q.branch,p_site:q.site,p_team:q.team,p_shift:q.shift,p_search:q.search,p_page:q.page,p_history:q.history,p_state:q.state}),parsed=attendanceRosterPage.safeParse(r.data);if(r.error||!parsed.success||parsed.data.page!==q.page)return{success:false as const,denied:r.error?.code==='42501',error:'The complete permitted roster could not be verified.'};return{success:true as const,data:parsed.data};}catch{return{success:false as const,error:'Roster unavailable. Existing drafts were not saved or cleared.'};}}
export async function saveAttendanceRow(raw:unknown){let dispatched=false;try{const p=attendanceRowRequest.safeParse(raw);if(!p.success)return{success:false as const,uncertain:false,error:'Check the work site, dates, times and breaks.'};if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,uncertain:false,denied:true,error:'Current attendance access unavailable.'};const db=await createClient();dispatched=true;const r=await db.rpc('f12_save_attendance',{p_request:p.data});if(r.error)return{success:false as const,uncertain:!isDefiniteEmployeeRejection(r.error.code)&&r.error.code!=='PT409',denied:r.error.code==='42501',conflict:r.error.code==='PT409',error:r.error.code==='PT409'?'Employee, attendance or shift/leave context changed. Review the current opening.':'Attendance not confirmed. Check the current eligibility, approval and original receipt.'};const receipt=attendanceReceipt.safeParse(r.data);if(!receipt.success||receipt.data.operation_id!==p.data.operation||receipt.data.employee_id!==p.data.employeeId||p.data.id!==null&&receipt.data.id!==p.data.id)return{success:false as const,uncertain:true,error:'Receipt mismatch. Keep the original operation.'};try{revalidatePath('/admin/hr/time/attendance');revalidatePath(`/admin/hr/employees/record/${p.data.employeeId}`);}catch{/* Commit receipt is authoritative. */}return{success:true as const,data:receipt.data};}catch{return{success:false as const,uncertain:dispatched,error:dispatched?'Outcome unconfirmed; check the original receipt before another save.':'Attendance unavailable. No request was sent.'};}}
export async function reconcileAttendanceRow(operation:unknown){const p=z.string().uuid().safeParse(operation);if(!p.success)return{success:false as const,error:'Invalid original operation.'};try{if(!canUseHrChild(await getAuthContext(),'attendance-summary'))return{success:false as const,denied:true,error:'Current attendance access unavailable.'};const r=await(await createClient()).rpc('f12_reconcile_attendance',{p_operation:p.data}),receipt=attendanceReceipt.safeParse(r.data);if(r.error||!receipt.success||receipt.data.operation_id!==p.data)return{success:false as const,denied:r.error?.code==='42501',error:'Original outcome remains unresolved; absence is not proof of failure.'};return{success:true as const,data:receipt.data};}catch{return{success:false as const,error:'Receipt unavailable; no private fields replayed.'};}}
