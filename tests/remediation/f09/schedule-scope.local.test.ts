import {beforeAll,expect,it,vi} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
const state=vi.hoisted(()=>({admin:null as unknown as ReturnType<typeof createClient>,client:null as unknown as ReturnType<typeof createClient>}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>state.admin}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
vi.mock("next/cache",()=>({revalidatePath:()=>{}}));
import {createReportSchedule,listReportSchedules,getReportSchedule,updateReportSchedule,deleteReportSchedule} from "@/server/actions/reports/schedules";
const runtime=path.resolve("CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F09/local");
const keys=JSON.parse(fs.readFileSync(path.join(runtime,"keys-private.json"),"utf8"));
const ledger=JSON.parse(fs.readFileSync(path.join(runtime,"fixtures-private.json"),"utf8"));
const clients:Record<string,ReturnType<typeof createClient>>={};
const save=()=>fs.writeFileSync(path.join(runtime,"fixtures-private.json"),JSON.stringify(ledger,null,2));
let reportCode:string,reportId:number,otherCompany:number,branchId:number,ownId:number,foreignId:number,globalId:number;
const input=()=>({reportCode,scheduleName:"F09 local CRUD "+randomUUID(),ownerCompanyId:ledger.companyId,
 outputFormat:"csv" as const,recipientTo:["f09@example.invalid"],frequency:"daily" as const,timeOfDay:"07:00",timezone:"Asia/Dubai",
 isActive:true,filtersJson:{},recipientCc:[]});
beforeAll(async()=>{
 expect(keys.API_URL).toBe("http://127.0.0.1:16521");
 state.admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const [name,value] of Object.entries(ledger.actors)){
  const actor=value as {email:string;password:string};const c=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await c.auth.signInWithPassword(actor)).error).toBeNull();clients[name]=c;
 }
 // Correct actual schedule codes in the synthetic operator/scoped roles only.
 for(const code of ["reports.schedule.view","reports.schedule.manage"]){
  expect((await state.admin.from("permissions").upsert({permission_code:code,permission_name:code,module_code:"REPORTS",action_code:code.split(".").at(-1),is_active:true},{onConflict:"permission_code"})).error).toBeNull();
 }
 const ids=await state.admin.from("permissions").select("id").in("permission_code",["reports.schedule.view","reports.schedule.manage"]);expect(ids.error).toBeNull();expect(ids.data).toHaveLength(2);
 for(const name of ["operator","scoped"]){
  const r=await state.admin.from("role_permissions").upsert(ids.data!.map(p=>({role_id:ledger.actors[name].roleId,permission_id:p.id})),{onConflict:"role_id,permission_id"});expect(r.error).toBeNull();
 }
 const company=await state.admin.from("owner_companies").insert({company_code:"F09_"+randomUUID(),legal_name_en:"F09 other synthetic company"}).select("id").single();expect(company.error).toBeNull();otherCompany=company.data.id;
 const branch=await state.admin.from("branches").insert({owner_company_id:ledger.companyId,branch_code:"F09_"+randomUUID(),branch_name_en:"F09 synthetic branch"}).select("id").single();expect(branch.error).toBeNull();branchId=branch.data.id;
 reportCode="F09_CRUD_"+randomUUID();
 const report=await state.admin.from("erp_report_registry").insert({report_code:reportCode,report_name_en:"F09 browser report",module_code:"SYSTEM",report_category:"list",document_class:"E",supports_scheduling:true,required_permissions:[],is_active:true}).select("id").single();expect(report.error).toBeNull();reportId=report.data.id;
 ledger.scheduleScopeFixtures={otherCompany,branchId,reportId,reportCode};save();
 for(const scope of [otherCompany,null]){
  const row=await state.admin.from("erp_report_schedules").insert({report_id:reportId,created_by:ledger.actors.operator.profileId,owner_company_id:scope,schedule_name:scope?"F09 other company":"F09 global",output_format:"csv",recipient_to:["f09@example.invalid"],frequency:"daily",time_of_day:"07:00",next_run_at:"2099-01-01T03:00:00Z"}).select("id").single();
  expect(row.error).toBeNull();ledger.scheduleIds.push(row.data.id);if(scope)foreignId=row.data.id;else globalId=row.data.id;save();
 }
});
it("company-scoped creator can create within its own company through the real action",async()=>{
 state.client=clients.scoped;const result=await createReportSchedule(input());expect(result.error).toBeUndefined();expect(result.success).toBe(true);
 ownId=result.data!.id;ledger.scheduleIds.push(ownId);ledger.browserScheduleId=ownId;save();
});
it("list/detail/actions and direct API hide foreign/global schedules",async()=>{
 state.client=clients.scoped;
 const list=await listReportSchedules();expect(list.success).toBe(true);expect(list.data!.some(s=>s.id===ownId)).toBe(true);
 for(const id of [foreignId,globalId]){
  expect(list.data!.some(s=>s.id===id)).toBe(false);
  expect((await getReportSchedule(id)).success).toBe(false);
  expect((await updateReportSchedule({id,scheduleName:"unauthorized"})).success).toBe(false);
  expect((await deleteReportSchedule(id)).success).toBe(false);
  const r=await clients.scoped.from("erp_report_schedules").select("id").eq("id",id);expect(r.error).toBeNull();expect(r.data).toHaveLength(0);
 }
});
it("cannot create or move a schedule outside the assignment, including null/global",async()=>{
 state.client=clients.scoped;
 for(const company of [otherCompany,null]){
  expect((await createReportSchedule({...input(),ownerCompanyId:company})).success).toBe(false);
  expect((await updateReportSchedule({id:ownId,ownerCompanyId:company})).success).toBe(false);
  expect((await clients.scoped.from("erp_report_schedules").update({owner_company_id:company}).eq("id",ownId)).error).not.toBeNull();
 }
});
it("ownership cannot be forged and worker outcomes cannot be overwritten",async()=>{
 expect((await clients.scoped.from("erp_report_schedules").insert({report_id:reportId,created_by:ledger.actors.operator.profileId,owner_company_id:ledger.companyId,schedule_name:"forged",frequency:"daily",recipient_to:["f09@example.invalid"]})).error).not.toBeNull();
 for(const update of [{created_by:ledger.actors.operator.profileId},{report_id:reportId},{last_status:"success"},{last_run_at:new Date().toISOString()}])
  expect((await clients.scoped.from("erp_report_schedules").update(update).eq("id",ownId)).error).not.toBeNull();
 expect((await clients.scoped.from("erp_report_schedules").delete().eq("id",ownId)).error).not.toBeNull();
});
it("no-role users cannot create or read schedules even with their own creator ID",async()=>{
 state.client=clients.none;expect((await createReportSchedule(input())).success).toBe(false);
 const rows=await clients.none.from("erp_report_schedules").select("id");expect(rows.error).toBeNull();expect(rows.data).toHaveLength(0);
 const forged=await clients.none.from("erp_report_schedules").insert({report_id:reportId,created_by:ledger.actors.none.profileId,owner_company_id:ledger.companyId,schedule_name:"no role",frequency:"daily",recipient_to:["f09@example.invalid"]});expect(forged.error).not.toBeNull();
});
it("non-calendar edits preserve next run and empty/oversized recipients are rejected",async()=>{
 state.client=clients.scoped;const before=await getReportSchedule(ownId);expect(before.success).toBe(true);
 expect((await updateReportSchedule({id:ownId,scheduleName:"F09 browser editable schedule"})).success).toBe(true);
 expect((await getReportSchedule(ownId)).data!.next_run_at).toBe(before.data!.next_run_at);
 expect((await updateReportSchedule({id:ownId,frequency:"daily",dayOfWeek:null,dayOfMonth:null,timeOfDay:"07:00",timezone:"Asia/Dubai"})).success).toBe(true);
 expect((await getReportSchedule(ownId)).data!.next_run_at).toBe(before.data!.next_run_at);
 expect((await updateReportSchedule({id:ownId,recipientTo:[]})).success).toBe(false);
 expect((await updateReportSchedule({id:ownId,recipientCc:Array(100).fill("f09@example.invalid")})).success).toBe(false);
});
it("branch-only grants do not authorize company-wide schedules; revocation is fresh",async()=>{
 state.client=clients.scoped;const assignment=ledger.actors.scoped.assignmentId;
 try{
  expect((await state.admin.from("user_roles").update({branch_id:branchId}).eq("id",assignment)).error).toBeNull();
  expect((await getReportSchedule(ownId)).success).toBe(false);
  expect((await updateReportSchedule({id:ownId,isActive:false})).success).toBe(false);
  expect((await state.admin.from("user_roles").update({branch_id:null,is_active:false}).eq("id",assignment)).error).toBeNull();
  expect((await getReportSchedule(ownId)).success).toBe(false);
 }finally{expect((await state.admin.from("user_roles").update({branch_id:null,is_active:true}).eq("id",assignment)).error).toBeNull();}
 expect((await getReportSchedule(ownId)).success).toBe(true);
});
it("soft deletion changes only the selected synthetic record and cannot report a second success",async()=>{
 state.client=clients.operator;expect((await deleteReportSchedule(foreignId)).success).toBe(true);
 expect((await deleteReportSchedule(foreignId)).success).toBe(false);
 const row=await state.admin.from("erp_report_schedules").select("is_active,deleted_at").eq("id",foreignId).single();
 expect(row.data?.is_active).toBe(false);expect(row.data?.deleted_at).not.toBeNull();
});
