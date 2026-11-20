import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { dispatchHr } from "../hr";
import { employeeContext, type Db } from "../hr-reads";
const { createClient,rpc,auth }=vi.hoisted(()=>({createClient:vi.fn(),rpc:vi.fn(),auth:vi.fn()}));
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),getAuthContext:auth}));
vi.mock("@/lib/rbac/employee-access",async original=>({...await original<typeof import("@/lib/rbac/employee-access")>(),getLinkedEmployeeId:async()=>12}));
vi.mock("@/lib/supabase/server",()=>({createClient}));
const uid="7c17cb06-bb2b-4ca8-bd8d-1a38da9e83eb";
const ctx:AuthContext={profile:{id:8,owner_company_id:1,branch_id:1,must_change_password:false} as AuthContext["profile"],email:null,isAccountActive:true,accountStatus:"active",roleCodes:[],permissionCodes:[],roleAssignments:[]};
beforeEach(()=>{vi.resetAllMocks();createClient.mockResolvedValue({rpc});});
function source(row:Record<string,unknown>|null,error:unknown=null):Db {
  const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:row,error})};
  return {from:()=>q} as unknown as Db;
}
describe("exact subject reads",()=>{
  const actor={...ctx,permissionCodes:["hr.employees.view.team"],roleAssignments:[{roleId:1,roleCode:"manager",ownerCompanyId:1,branchId:1,permissionCodes:["hr.employees.view.team"]}]};
  const report={id:10,owner_company_id:1,branch_id:1,reporting_manager_id:5};
  it("requires the actual direct manager and exact assigned branch",async()=>{
    expect((await employeeContext(source(report),actor,10,5)).own).toBe(false);
    for(const other of [{...report,branch_id:2},{...report,owner_company_id:2},{...report,reporting_manager_id:6}])
      await expect(employeeContext(source(other),actor,10,5)).rejects.toMatchObject({status:403});
  });
  it("distinguishes unavailable employee metadata from a restricted employee",async()=>{
    await expect(employeeContext(source(null,{}),ctx,11,null)).rejects.toMatchObject({status:503});
    await expect(employeeContext(source(null),ctx,11,null)).rejects.toMatchObject({status:403});
  });
});
describe("binding native operations to original records",()=>{
  it("confirms an evidence-free renewal as a proposal with a distinct request ID",async()=>{
    rpc.mockResolvedValue({data:{id:600,employeeId:9,operationId:uid,revision:1,replayed:false},error:null});
    const input={op:"renewalSubmit",operationId:uid,employeeId:9,id:2,revision:"8",kind:"identity-document",reason:"Expires shortly",documentId:null,documentVersionId:null} as const;
    expect(await dispatchHr(input,ctx)).toMatchObject({id:600,employeeId:9,revision:"1"});
    expect(rpc).toHaveBeenCalledWith("mobile_hr_command_v1",{p_action:"request.submit",p_data:{employeeId:9,operationId:uid,kind:"compliance-renewal",proposal:{sourceId:2,sourceRevision:"8",sourceKind:"identity-document",reason:"Expires shortly"}}});
  });
  it("omits optional approval reason when blank",async()=>{
    rpc.mockResolvedValue({data:{id:2,employeeId:9,operationId:uid,revision:2,replayed:false},error:null});
    await dispatchHr({op:"decision",kind:"leave",id:2,employeeId:9,revision:"1",operationId:uid,decision:"approve",reason:""},ctx);
    expect(rpc).toHaveBeenCalledWith("mobile_hr_command_v1",{p_action:"leave.decide",p_data:{id:2,employeeId:9,revision:"1",operationId:uid,decision:"approve"}});
  });
  it("does not attach an old opening to a changed proposal or another employee",async()=>{
    rpc.mockResolvedValue({data:{id:2,employeeId:9,kind:"profile-correction",status:"pending",revision:4,canDecide:true,proposal:{changes:{}},createdAt:"2026-11-20"},error:null});
    await expect(dispatchHr({op:"opening",kind:"proposal",id:2,employeeId:9,revision:"3"},ctx)).rejects.toMatchObject({status:409});
    await expect(dispatchHr({op:"opening",kind:"proposal",id:2,employeeId:11,revision:"4"},ctx)).rejects.toMatchObject({status:403});
  });
  it("denies review before reading rows if exact staff capabilities are absent",async()=>{
    rpc.mockResolvedValue({data:{roster:false,approvalsGeneral:false,approvalsProposal:false,approvalsLeave:false,requestsTeam:false},error:null});
    await expect(dispatchHr({op:"inbox",kind:"leave",after:0},ctx)).rejects.toMatchObject({status:403});
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("masks unknown database error details and preserves uncertainty",async()=>{
    rpc.mockResolvedValue({data:null,error:{code:"08006",message:"private value from Postgres"}});
    await expect(dispatchHr({op:"timeCorrection",employeeId:9,operationId:uid,id:null,revision:null,date:"2026-11-20",reason:"Review missing attendance"},ctx))
      .rejects.toMatchObject({status:503,uncertain:true,message:"Outcome unconfirmed. Check the original operation before retrying."});
  });
});
describe("HR entry for independently assigned domains",()=>{
  const minimal={...ctx,permissionCodes:["hr.leave.view.self"],roleAssignments:[{roleId:2,roleCode:"custom",ownerCompanyId:1,branchId:1,permissionCodes:["hr.leave.view.self"]}]};
  it("goes from DMS entry to private home to an actual leave reader with a single leave grant",async()=>{
    const {POST:dms}=await import("@/app/api/mobile/dms/v1/route");
    const {POST:hr}=await import("@/app/api/mobile/hr/v1/route");
    const request=(what:Record<string,unknown>)=>new Request("http://local/api/mobile",{method:"POST",headers:{Authorization:"Bearer test.synthetic.token","Content-Type":"application/json"},body:JSON.stringify(what)});
    auth.mockResolvedValue(minimal);
    createClient.mockResolvedValue({...source(null),rpc});
    const entry=await dms(request({op:"profile"}));
    expect(entry.status).toBe(200);
    expect(await entry.json()).toMatchObject({data:{capabilities:{hr:true,view:false}}});
    rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_own_access"?{employeeId:12,profile:false,leave:true,attendance:false,compliance:false,medical:false,submit:false,actions:false,evidence:false}:name==="mobile_hr_staff_capabilities"?{roster:false,approvalsGeneral:false,approvalsLeave:false,approvalsProposal:false,requestsTeam:false}:[{id:1,label:"Annual",requiresDocument:false}]}));
    const homeResponse=await hr(request({op:"home"}));
    expect(homeResponse.status).toBe(200);
    const home=(await homeResponse.json()).data;
    expect(home).toMatchObject({employeeId:12,name:null,capabilities:{profile:false,leave:true,attendance:false,profileCorrection:false}});
    expect(home).not.toHaveProperty("fields");
    const leave=await hr(request({op:"leaveOptions",employeeId:12,page:1}));
    expect(await leave.json()).toEqual({success:true,data:{rows:[{id:1,label:"Annual",requiresDocument:false}],more:false}});
    expect((await hr(request({op:"time",kind:"punch",employeeId:12,page:1}))).status).toBe(403);
    expect((await hr(request({op:"profile",employeeId:12}))).status).toBe(403);
  });
  it("identifies the exact permitted employee and request in a proposal opening",async()=>{
    rpc.mockResolvedValue({data:{id:17,employeeId:9,kind:"profile-correction",status:"pending",revision:4,canDecide:true,proposal:{changes:{}},createdAt:"2026-11-20"},error:null});
    const q={select:()=>q,in:()=>q,is:()=>q,limit:()=>Promise.resolve({error:null,data:[{id:9,full_name_en:"Synthetic employee",employee_code:"EMP-9"}]})};
    createClient.mockResolvedValue({rpc,from:()=>q});
    const r=await dispatchHr({op:"opening",kind:"proposal",id:17,employeeId:9,revision:"4"},ctx);
    expect(r).toMatchObject({employeeLabel:"EMP-9 — Synthetic employee",reference:"HR proposal #17"});
  });
});
it("keeps distinct references and omits the name of an unreadable employee in a proposal list",async()=>{
  const item={kind:"attendance-correction",status:"pending",revision:1,canDecide:true,proposal:{},createdAt:"2026-11-20"};
  rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_staff_capabilities"?{roster:false,approvalsGeneral:false,approvalsProposal:true,approvalsLeave:false,requestsTeam:false}:{items:[{...item,id:17,employeeId:9},{...item,id:18,employeeId:10}],nextAfterId:null}}));
  const q={select:()=>q,in:()=>q,is:()=>q,limit:()=>Promise.resolve({error:null,data:[{id:9,full_name_en:"Synthetic employee",employee_code:"EMP-9"}]})};
  createClient.mockResolvedValue({rpc,from:()=>q});
  expect(await dispatchHr({op:"inbox",kind:"proposal",after:0},ctx)).toMatchObject({rows:[
    {employeeLabel:"EMP-9 — Synthetic employee",reference:"HR proposal #17"},
    {employeeLabel:null,employeeId:10,reference:"HR proposal #18"}]});
});
it.each([
  [{op:"rosterApprove" as const},"attendance.approve"],
  [{op:"decision" as const,kind:"approval" as const,decision:"reject" as const,reason:"Review required"},"approval.decide"],
])("dispatches the exact staff decision to a single atomic command",async(part,action)=>{
  rpc.mockResolvedValue({data:{id:2,employeeId:9,operationId:uid,revision:2,replayed:false},error:null});
  await dispatchHr({...part,id:2,employeeId:9,revision:"1",operationId:uid},ctx);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("mobile_hr_command_v1",{p_action:action,p_data:{
    employeeId:9,id:2,revision:"1",operationId:uid,...(part.op==="decision"?{decision:"reject",reason:"Review required"}:{})
  }});
});

