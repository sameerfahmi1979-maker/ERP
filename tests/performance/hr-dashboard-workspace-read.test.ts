import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
type Call = {table: string; methods: unknown[][]};
const state = vi.hoisted(() => ({authorizations: 0, clients: 0, context: {} as AuthContext, calls: [] as Call[], rows: {} as Record<string, Record<string, unknown>[]>, fault: "", malformed: "", countOverride: undefined as number | null | undefined, cap: false, duplicate: false}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authorizations++; return state.context;}}));
vi.mock('@/server/reads/payroll-readiness-facts',()=>({readPayrollReadinessFacts:async(_db:unknown,ids:number[])=>{void _db;state.calls.push({table:'f12_payroll_readiness_facts',methods:[['subjects',ids]]});if(state.fault==='employee_wps_profiles')throw Error('Synthetic readiness unavailable');return ids.map(employee_id=>state.rows.f12_readiness_facts?.find(row=>row.employee_id===employee_id)??{employee_id,readiness_status:'not_enrolled',has_wps_profile:false,missing_iban:false});}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {from: (table: string) => {
    const call: Call = {table, methods: []}; state.calls.push(call);
    const builder: Record<string, unknown> = {then: (resolve: (data: unknown) => unknown) => {
      if (state.fault === table) return Promise.resolve({data: null, count: null, error: {message: "SYNTHETIC_PRIVATE_FAILURE"}}).then(resolve);
      let rows = [...(state.rows[table] ?? [])];
      for (const [method, key, value] of call.methods) {
        const k = String(key);
        if (method === "eq") rows = rows.filter(r => r[k] === value);
        if (method === "is") rows = rows.filter(r => (r[k] ?? null) === value);
        if (method === "neq") rows = rows.filter(r => r[k] != null && r[k] !== value);
        if (method === "in") rows = rows.filter(r => (value as unknown[]).includes(r[k]));
        if (["lt", "lte", "gte"].includes(String(method))) rows = rows.filter(r => {
          if (r[k] == null) return false;
          const timestamp = k === 'interview_datetime' || k === 'created_at';
          const left = timestamp ? Date.parse(String(r[k])) : String(r[k]);
          const right = timestamp ? Date.parse(String(value)) : String(value);
          return method === 'lt' ? left < right : method === 'lte' ? left <= right : left >= right;
        });
        if (method === "not" && value === "is") rows = rows.filter(r => r[k] != null);
        if (method === "or" && String(key).startsWith("effective_to")) rows = rows.filter(r => r.effective_to == null || String(r.effective_to) >= "2026-10-04");
        if (method === "or" && String(key).startsWith("iban")) rows = rows.filter(r => r.iban == null || r.iban === "");
        if (method === 'or' && String(key).startsWith('due_date.lt.')) rows=rows.filter(r=>r.assigned_to==null||r.due_date!=null&&String(r.due_date)<String(key).split(',')[0].slice('due_date.lt.'.length));
      }
      const orders = call.methods.filter(m => m[0] === "order").map(m => String(m[1]));
      rows.sort((a, b) => {for (const key of orders) {const compare = typeof a[key] === "number" ? Number(a[key]) - Number(b[key]) : String(a[key] ?? "").localeCompare(String(b[key] ?? "")); if (compare) return compare;} return 0;});
      const count = state.countOverride !== undefined && table === "employees" ? state.countOverride : rows.length;
      const range = call.methods.find(m => m[0] === "range");
      if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
      if (state.cap && table === "employees") rows = rows.slice(0, 20);
      if (state.duplicate && table === "employees" && Number(range?.[1]) > 0) rows[0] = {...state.rows.employees[0]};
      if (state.malformed === table) rows = [{id: "bad"}];
      if (String(call.methods.find(m=>m[0]==='select')?.[1]).includes('id:revision_id')) rows=rows.map(r=>({...r,id:r.revision_id}));
      const head = (call.methods.find(m => m[0] === "select")?.[2] as {head?: boolean})?.head;
      return Promise.resolve({data: head ? null : rows, count, error: null}).then(resolve);
    }};
    for (const method of ["select", "eq", "is", "neq", "in", "not", "or", "lt", "lte", "gte", "order", "range", "abortSignal"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
    return builder;
  }};
}}));

import {readHrDashboardWorkspace as read} from '@/server/reads/hr-dashboard-workspace';
import {DASHBOARD_DEFINITIONS,dashboardResponseSchema} from '@/lib/hr/dashboard-workspace';
const allCodes = ["dashboard", "employees", "compliance", "medical", "attendance", "leave", "payroll", "banking", "assignments", "actions", "confidential", "eos", "recruitment"].map(c => `hr.${c}.view`);
function employee(id: number, more: Record<string, unknown> = {}) {return {id, employee_status: "active", joining_date: "2026-10-01", employee_category_id: 1, department_id: 1, primary_work_site_id: 1, owner_company_id: 1, branch_id: 1, employee_code: `SYN-${id}`, full_name_en: `Synthetic ${id}`, deleted_at: null, ...more};}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  state.context = {profile: {id: 1, auth_user_id: "synthetic", must_change_password: false} as AuthContext["profile"], email: null, roleCodes: [], permissionCodes: allCodes,
    globalPermissionCodes: allCodes, roleAssignments: [{roleId: 1, roleCode: "synthetic", ownerCompanyId: null, branchId: null, permissionCodes: allCodes}], accountStatus: "active", isAccountActive: true};
  state.rows = {employees: [employee(1)], hr_employee_categories: [{id: 1, name_en: "Synthetic category"}]};
});
afterEach(() => {vi.useRealTimers(); Object.assign(state, {authorizations: 0, clients: 0, calls: [], rows: {}, fault: "", malformed: "", countOverride: undefined, cap: false, duplicate: false});});
it('returns current validated metrics from one authenticated client and no private raw rows',async()=>{
 const result=await read({mode:'overview'});expect(result.success,result.error).toBe(true);
 expect(dashboardResponseSchema.safeParse(result.data).success).toBe(true);
 expect(Object.keys(result.data!.metrics)).toHaveLength(DASHBOARD_DEFINITIONS.length);
 expect(result.data?.metrics.workforce).toMatchObject({status:'ready',value:1});
 expect(state.clients).toBe(1);expect(state.authorizations).toBe(1);
 expect(JSON.stringify(result)).not.toContain('basic_salary');expect(JSON.stringify(result)).not.toContain('account_number');
});
it('headlines and matching records use identical scope and include employees currently on leave',async()=>{
 state.rows.employees=[employee(1),employee(2,{employee_status:'on_leave'}),employee(3,{owner_company_id:2}),employee(4,{branch_id:2})];
 const scope={companyId:1,branchId:1,date:'2026-10-04'};
 const overview=await read({mode:'overview',scope}),records=await read({mode:'records',scope,metric:'workforce'});
 expect(overview.data?.metrics.workforce.value).toBe(2);expect(records.data?.metrics.workforce).toEqual(overview.data?.metrics.workforce);
 expect(records.data?.metrics.workforce.items.map(r=>r.reference)).toEqual(['SYN-1','SYN-2']);
 expect(records.data?.metrics.workforce.items[0].href).toBe('/admin/hr/employees/record/1?section=profile');
});
it('counts people distinctly, does not label missing attendance absent, and counts approved leave for on-leave employees',async()=>{
 state.rows.employees=[employee(1),employee(2,{employee_status:'on_leave'})];
 state.rows.employee_attendance_daily_summary=[{id:1,employee_id:1,attendance_date:'2026-10-04'},{id:2,employee_id:1,attendance_date:'2026-10-04'}];
 state.rows.employee_leave_requests=[{id:1,employee_id:2,approval_status:'approved',start_date:'2026-10-03',end_date:'2026-10-05'}];
 const result=await read({mode:'overview'});
 expect(result.data?.metrics.attendance_entered.value).toBe(1);expect(result.data?.metrics.attendance_missing.value).toBe(1);
 expect(result.data?.metrics.leave_today).toMatchObject({value:1,items:[{reference:'SYN-2'}]});
 expect(result.data?.metrics.attendance_missing.items[0].detail).toBe('Attendance not entered');
});
it('uses selected Dubai calendar date and nonoverlapping expired / expiring windows',async()=>{
 state.rows.employee_identity_documents=['2026-10-03','2026-10-04','2026-10-11','2026-10-12'].map((expiry_date,i)=>({id:i+1,employee_id:1,expiry_date}));
 const result=await read({mode:'overview',scope:{date:'2026-10-04',expiryDays:'7'}});
 expect(result.data?.metrics.expired.value).toBe(1);expect(result.data?.metrics.expiring.value).toBe(2);
 expect(result.data?.metrics.expired.items[0].href).toContain('section=compliance');
});
it('pages details across employee-ID batches without dropping, repeating, or requesting out-of-range pages',async()=>{
 state.rows.employees=Array.from({length:201},(_,i)=>employee(i+1));
 state.rows.employee_approval_requests=Array.from({length:36},(_,i)=>({id:i+1,employee_id:i<26?1:201,request_status:'pending',approval_type:'Synthetic'}));
 const result=await read({mode:'records',metric:'approvals',page:2});
 expect(result.data?.metrics.approvals).toMatchObject({status:'ready',value:36});
 expect(result.data?.metrics.approvals.items.map(r=>r.key)).toEqual(Array.from({length:11},(_,i)=>`approvals-${i+26}`));
 const empty=await read({mode:'records',metric:'approvals',page:3});expect(empty.data?.metrics.approvals).toMatchObject({value:36,items:[]});
});
it('keeps failed module counts unavailable while unrelated metrics remain confirmed',async()=>{
 state.fault='employee_identity_documents';const result=await read({mode:'overview'});
 expect(result.data?.metrics.expired).toEqual({status:'failed',items:[]});expect(result.data?.metrics.workforce.value).toBe(1);
 expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it.each(['cap','duplicate','malformed','fault'])('rejects %s subject collections instead of returning partial totals',async mode=>{
 state.rows.employees=Array.from({length:601},(_,i)=>employee(i+1));
 if(mode==='cap')state.cap=true;if(mode==='duplicate')state.duplicate=true;if(mode==='malformed')state.malformed='employees';if(mode==='fault')state.fault='employees';
 expect((await read({mode:'overview'})).success).toBe(false);
});
it('does not query protected payroll data when banking permission is absent',async()=>{
 state.context.permissionCodes=allCodes.filter(c=>c!=='hr.banking.view');
 const result=await read({mode:'overview'});expect(result.data?.metrics.wps_ready.status).toBe('restricted');
 expect(state.calls.some(c=>c.table==='f12_payroll_readiness_facts')).toBe(false);
});
it('cannot infer missing records through combined disjoint payroll/banking or attendance scope',async()=>{
 state.context.globalPermissionCodes=[];
 state.context.roleAssignments=[{roleId:1,roleCode:'one',ownerCompanyId:1,branchId:null,permissionCodes:['hr.payroll.view']},{roleId:2,roleCode:'two',ownerCompanyId:2,branchId:null,permissionCodes:['hr.banking.view','hr.attendance.view']}];
 const result=await read({mode:'overview'});expect(result.data?.metrics.wps_ready.status).toBe('unavailable');expect(result.data?.metrics.attendance_missing.status).toBe('unavailable');
 expect(state.calls.some(c=>c.table==='f12_payroll_readiness_facts')).toBe(false);
});
it('filters recruitment through verified requisitions and clearance through scoped employees',async()=>{
 state.rows.employees=[employee(1),employee(2,{owner_company_id:2})];
 state.rows.hr_job_requisitions=[{id:11,owner_company_id:1,department_id:1,branch_id:1,work_site_id:1,requisition_status:'open',requisition_title:'One'},{id:22,owner_company_id:2,requisition_status:'open'}];
 state.rows.hr_candidates=[{id:31,requisition_id:11,candidate_status:'new',full_name_en:'Candidate One',candidate_code:'CAND-31'},{id:32,requisition_id:22,candidate_status:'new',full_name_en:'Candidate Two'},{id:33,requisition_id:null,candidate_status:'new',full_name_en:'Unassigned'}];
 state.rows.employee_clearance_items=[{id:1,employee_id:1,item_status:'pending'},{id:2,employee_id:2,item_status:'pending'}];
 const result=await read({mode:'overview',scope:{companyId:1}});
 expect(result.data?.metrics.candidates).toMatchObject({value:1,items:[{reference:'CAND-31'}]});expect(result.data?.metrics.clearance.value).toBe(1);
});
it('deduplicates dual-linked joining tasks in company scope and retains employee-only tasks',async()=>{
 state.rows.hr_job_requisitions=[{id:11,owner_company_id:1}];state.rows.hr_candidates=[{id:31,requisition_id:11}];
 state.rows.hr_onboarding_tasks=[{id:1,candidate_id:31,employee_id:1,task_title:'Dual',task_status:'pending'},{id:2,candidate_id:null,employee_id:1,task_title:'Employee',task_status:'blocked'},{id:3,candidate_id:99,employee_id:99,task_title:'Outside',task_status:'pending'}];
 const result=await read({mode:'records',metric:'onboarding',scope:{companyId:1}});
 expect(result.data?.metrics.onboarding).toMatchObject({value:2,items:[{label:'Dual'},{label:'Employee'}]});
});
it('never treats saved readiness as current clearance and uses current restriction dates',async()=>{
 state.rows.employee_operational_blocks=[{id:1,employee_id:1,block_status:'active',effective_from:'2026-10-03',effective_to:null},{id:2,employee_id:1,block_status:'active',effective_from:'2026-10-05',effective_to:null}];
 state.rows.employee_site_readiness=[{id:1,employee_id:1,readiness_status:'ready'},{id:2,employee_id:1,readiness_status:'not_ready'}];
 const result=await read({mode:'overview'});expect(result.data?.metrics.blocks.value).toBe(1);expect(result.data?.metrics.readiness.value).toBe(1);
 expect(DASHBOARD_DEFINITIONS.find(d=>d.key==='readiness')?.hint).toContain('not a live deployment clearance');
});
it('loads valid lookup columns and does not invent deleted_at on company/branch tables',async()=>{
 state.rows.owner_companies=[{id:1,company_code:'TEST'}];state.rows.branches=[{id:1,branch_name_en:'Branch',owner_company_id:1}];
 const result=await read({mode:'options'});expect(result.success).toBe(true);expect(result.data?.options?.companies).toEqual([{id:1,label:'TEST'}]);
 for(const call of state.calls.filter(c=>['owner_companies','branches'].includes(c.table)))expect(call.methods.some(m=>m[1]==='deleted_at')).toBe(false);
});
it('uses date-aware payroll facts without exporting salaries or bank accounts',async()=>{
 state.rows.f12_readiness_facts=[{employee_id:1,readiness_status:'ready',has_wps_profile:true,missing_iban:false}];
 const result=await read({mode:'records',metric:'wps_ready',scope:{date:'2026-10-04'}});
 expect(result.data?.metrics.wps_ready).toMatchObject({value:1,items:[{href:'/admin/hr/employees/record/1?section=payroll'}]});
});
it.each([{mode:'overview',scope:{companyId:0}},{mode:'records',metric:'unknown'},{mode:'overview',scope:{date:'2026-02-30'}},{mode:'records',metric:'approvals',page:0},{mode:'overview',scope:{sql:'true'}}])('rejects invalid request %j before DB access',async input=>{
 expect((await read(input)).success).toBe(false);expect(state.clients).toBe(0);
});
it.each(['inactive','password','permission'])('%s access fails before data reads',async mode=>{
 if(mode==='inactive')state.context.isAccountActive=false;if(mode==='password')state.context.profile!.must_change_password=true;if(mode==='permission')state.context.permissionCodes=[];
 expect((await read({mode:'overview'})).error).toBe('Permission denied');expect(state.clients).toBe(0);
});

it('reads salary review identity and pending state without salary values',async()=>{
 state.rows.employee_salary_revision_reviews=[{revision_id:8,employee_id:1,status:'pending',created_at:'2026-10-01',basic_salary:12345},{revision_id:9,employee_id:1,status:'approved'}];
 const result=await read({mode:'records',metric:'salary_pending'});
 expect(result.data?.metrics.salary_pending).toMatchObject({status:'ready',value:1,items:[{key:'salary_pending-8',href:'/admin/hr/employees/record/1?section=payroll'}]});
 expect(JSON.stringify(result)).not.toContain('12345');
 const calls=state.calls.filter(c=>c.table==='employee_salary_revision_reviews');
 expect(calls[0].methods).toContainEqual(['order','revision_id']);
 expect(calls[0].methods.some(m=>m[0]==='is'&&m[1]==='deleted_at')).toBe(false);
});
