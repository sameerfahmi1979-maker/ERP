import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import type { DeliveryClaim } from "@/lib/email/queue/source";
import { requireQueuePermission, requireReportDelivery } from "@/lib/email/queue/policy";
import { prepareScheduleMessage } from "@/lib/report-center/schedule-execution";
const mocks=vi.hoisted(()=>({db:vi.fn(),actor:vi.fn(),run:vi.fn(),render:vi.fn(),brand:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.db}));
vi.mock("@/lib/rbac/check",async()=>({...await import("@/lib/rbac/scope"),getAuthContextForProfileId:mocks.actor}));
vi.mock("@/lib/report-center/report-runner",()=>({runReport:mocks.run}));
vi.mock("@/lib/export/generate-attachment",()=>({generateAttachmentByType:mocks.render}));
vi.mock("@/lib/report-center/template-export",()=>({resolveTemplateForExport:mocks.brand}));
function actor(codes=["reports.run","reports.export","reports.email","hr.employees.view"],company:number|null=1):AuthContext{
 return {profile:{id:7,must_change_password:false},isAccountActive:true,accountStatus:"active",email:null,
 roleCodes:["test"],permissionCodes:codes,globalPermissionCodes:company===null?codes:[],
 roleAssignments:[{roleId:2,roleCode:"test",ownerCompanyId:company,branchId:null,permissionCodes:codes}]} as AuthContext;
}
let schedule:Record<string,unknown>,rpc:ReturnType<typeof vi.fn>,ctx:AuthContext;
const q={id:11,lease_owner:"worker",lease_token:"token",attempt_count:1,max_attempts:3,
 source_entity_id:5,report_schedule_run_id:13,source_revision:"revision",created_by:7} as DeliveryClaim;
const signal=()=>new AbortController().signal;
beforeEach(()=>{
 vi.clearAllMocks();ctx=actor();
 schedule={id:5,created_by:7,owner_company_id:1,filters_json:{},selected_template_id:2,output_format:"csv",
 recipient_to:["recipient@example.invalid"],recipient_cc:[],email_subject_template:null,email_body_template:null,
 is_active:true,deleted_at:null,report:{id:1,report_code:"TEST",report_name_en:"Synthetic",required_permissions:["hr.employees.view"],
 sensitive_profile:"normal",is_active:true,supports_scheduling:true,document_class:"E"}};
 const chain:Record<string,unknown>={};for(const key of ["select","eq"])chain[key]=()=>chain;
 chain.maybeSingle=vi.fn(async()=>({data:schedule,error:null}));
 rpc=vi.fn(async()=>({data:true,error:null}));mocks.db.mockReturnValue({from:()=>chain,rpc});
 mocks.actor.mockImplementation(async()=>ctx);
 mocks.run.mockResolvedValue({success:true,data:{columns:["id"],rows:[{id:1}]},runId:77,resolvedTemplateId:2});
 mocks.brand.mockResolvedValue({logoUrl:"synthetic-only"});
 mocks.render.mockResolvedValue({filename:"synthetic.csv",contentType:"text/csv",base64Content:"eA==",sizeBytes:1});
});
describe("fresh queue and report permissions",()=>{
 it("manage alone is never send authority",()=>{expect(()=>requireQueuePermission(actor(["notifications.email_queue.manage"],null),"process")).toThrow();});
 it("scoped capability cannot administer the global queue",()=>{expect(()=>requireQueuePermission(actor(["notifications.email_queue.process"]),"process")).toThrow();});
 it("inactive and password-change-required accounts are denied",()=>{
  for(const patch of [{isAccountActive:false},{profile:{id:7,must_change_password:true}}]){
   expect(()=>requireReportDelivery({...ctx,...patch} as AuthContext,1)).toThrow();
  }
 });
 it("company-1 email permission does not authorize company-2 or all-company export",()=>{
  expect(()=>requireReportDelivery(ctx,2)).toThrow();expect(()=>requireReportDelivery(ctx,null)).toThrow();
 });
 it("branch assignment does not become a company-wide delivery grant",()=>{
  ctx.roleAssignments![0].branchId=9;expect(()=>requireReportDelivery(ctx,1)).toThrow();
 });
 it("uses email-scoped report reads and records prepared output under the claim fence",async()=>{
  const message=await prepareScheduleMessage(q,signal());
  expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({outputFormat:"email",requestedByUserId:7,ownerCompanyIds:[1]}),ctx);
  expect(message.attachments).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith("f09_record_report_preparation",expect.objectContaining({p_token:"token",p_report_run_id:77}));
 });
 it.each(["A","B","C","D","unexpected"])("refuses official/unknown class %s before rendering",async code=>{
  (schedule.report as Record<string,unknown>).document_class=code;
  await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();expect(mocks.render).not.toHaveBeenCalled();
 });
 it.each(["is_active","supports_scheduling"])("refuses report with %s disabled",async key=>{
  (schedule.report as Record<string,unknown>)[key]=false;await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
 });
 it("refuses a paused/deleted schedule",async()=>{
  schedule.is_active=false;await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  schedule.is_active=true;schedule.deleted_at="synthetic";await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
 });
 it("refuses changed recipient/config snapshot",async()=>{
  rpc.mockResolvedValue({data:false,error:null});await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it("rechecks revoked creator email permission on every attempt",async()=>{
  await prepareScheduleMessage(q,signal());ctx=actor(["reports.run","reports.export","hr.employees.view"]);
  await expect(prepareScheduleMessage({...q,attempt_count:2},signal())).rejects.toThrow();
  expect(mocks.render).toHaveBeenCalledTimes(1);
 });
 it("refuses required source permission and creator substitution",async()=>{
  ctx=actor();ctx.permissionCodes=["reports.run","reports.email","reports.export"];
  await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  await expect(prepareScheduleMessage({...q,created_by:999},signal())).rejects.toThrow();
 });
 it("cancels if grants change during rendering",async()=>{
  mocks.render.mockImplementation(async()=>{ctx=actor();ctx.roleAssignments![0].branchId=2;return {filename:"x.csv",sizeBytes:1};});
  await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
 });
 it("never falls back to unbranded output",async()=>{
  mocks.brand.mockRejectedValue(Error("synthetic unavailable"));await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  expect(mocks.render).not.toHaveBeenCalled();
 });
 it("rejects malformed recipients before expensive report work",async()=>{
  schedule.recipient_to=["not-email"];await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  expect(mocks.run).not.toHaveBeenCalled();
 });
 it("rejects oversized output and missing report provenance",async()=>{
  mocks.render.mockResolvedValue({sizeBytes:3_000_001});await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
  mocks.render.mockResolvedValue({sizeBytes:1});mocks.run.mockResolvedValue({success:true,data:{columns:[],rows:[]}});
  await expect(prepareScheduleMessage(q,signal())).rejects.toThrow();
 });
 it("honors an expired preparation deadline without recording/sending late output",async()=>{
  const controller=new AbortController();
  mocks.render.mockImplementation(async()=>{controller.abort();return {filename:"x.csv",sizeBytes:1};});
  await expect(prepareScheduleMessage(q,controller.signal)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalledWith("f09_record_report_preparation",expect.anything());
 });
});
