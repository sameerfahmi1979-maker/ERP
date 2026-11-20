import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { dispatchHr } from "../hr";
import { employeeContext, timeRead, type Db } from "../hr-reads";
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
  it("shows Dubai dates for midnight punches and overnight daily in/out without changing daily dates",async()=>{
    const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({error:null,data:[{id:3,workspace_revision:"1",attendance_date:"2026-11-20",attendance_type:"office",approval_status:"pending",first_in_at:"2026-11-19T20:30:00+00:00",last_out_at:"2026-11-20T21:15:00+00:00",total_hours:24.75}]})};
    const r=await timeRead({from:()=>q} as unknown as Db,{allows:()=>true} as never,{op:"time",kind:"attendance",employeeId:12,page:1});
    expect(r.rows[0]).toMatchObject({date:"2026-11-20",detail:"In 2026-11-20 00:30 +04:00 · Out 2026-11-21 01:15 +04:00 · 24.75 h"});
  });
  it.each([["Annual",2,null,null],["Sick",5,"Original integrity verified","DMS #71 / version #3"]])("opens the authoritative %s leave context",async(leaveType,totalDays,certificateStatus,certificateReference)=>{
    rpc.mockResolvedValue({error:null,data:[{id:31,employeeId:12,kind:"leave",employeeLabel:"EMP12",revision:"4",label:"Leave",status:"pending",canDecide:true,startDate:"2026-11-20",endDate:"2026-11-24",leaveType,totalDays,certificateStatus,certificateReference}]});
    const r=await dispatchHr({op:"opening",kind:"leave",id:31,employeeId:12,revision:"4"},ctx);
    expect(r).toHaveProperty("fields",expect.arrayContaining([{label:"Leave type",value:leaveType},{label:"Charged days",value:String(totalDays)}]));
    const text=JSON.stringify(r);
    if(certificateStatus){expect(text).toContain(certificateStatus);expect(text).toContain(certificateReference);}
    else {expect(text).not.toContain('"label":"Certificate');expect(text).not.toContain("reviewed");}
  });
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
    rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_profile"?null:name==="mobile_hr_own_access"?{employeeId:12,profile:false,leave:true,attendance:false,compliance:false,medical:false,submit:false,mine:false,actions:false,evidence:false}:name==="mobile_hr_staff_capabilities"?{roster:false,approvalsGeneral:false,approvalsLeave:false,approvalsProposal:false,requestsTeam:false}:[{id:1,label:"Annual",requiresDocument:false}]}));
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
  it("keeps two training certificates unambiguous in their authorized proposal openings",async()=>{
    const q={select:()=>q,in:()=>q,is:()=>q,limit:()=>Promise.resolve({error:null,data:[{id:9,full_name_en:"Synthetic employee",employee_code:"EMP-9"}]})};
    createClient.mockResolvedValue({rpc,from:()=>q});
    for(const [id,sourceId,sourceRevision] of [[17,71,"3"],[18,72,"8"]] as const){
      rpc.mockResolvedValue({data:{id,employeeId:9,kind:"compliance-renewal",status:"pending",revision:"1",canDecide:true,
        proposal:{sourceKind:"training-certificate",sourceId,sourceRevision,reason:"Renew"},createdAt:"2026-11-20"},error:null});
      const r=await dispatchHr({op:"opening",kind:"proposal",id,employeeId:9,revision:"1"},ctx);
      expect(r).toHaveProperty("fields",expect.arrayContaining([{label:"Source record",value:`Training certificate #${sourceId}`},{label:"Source revision",value:sourceRevision}]));
    }
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
describe("current HR wire admissions",()=>{
  const staff={roster:true,approvalsGeneral:false,approvalsProposal:false,approvalsLeave:false,requestsTeam:true};
  const own={employeeId:12,profile:false,leave:false,attendance:false,compliance:false,medical:false,submit:false,mine:false,actions:true,evidence:false};
  it("allows team history separately and refuses own history after submit revocation",async()=>{
    rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_staff_capabilities"?staff:name==="mobile_hr_own_access"?own:{items:[],nextAfterId:null}}));
    expect(await dispatchHr({op:"home"},ctx)).toMatchObject({capabilities:{requests:false,requestsTeam:true}});
    await expect(dispatchHr({op:"requests",scope:"own",after:0},ctx)).rejects.toMatchObject({status:403});
    expect(await dispatchHr({op:"requests",scope:"team",after:0},ctx)).toMatchObject({rows:[],more:false});
  });
  it("returns a verified empty own history for a currently eligible submitter",async()=>{
    rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_own_access"?{...own,mine:true,submit:true,attendance:true}:{items:[],nextAfterId:null}}));
    expect(await dispatchHr({op:"requests",scope:"own",after:0},ctx)).toEqual({rows:[],more:false,nextAfterId:null});
  });
  it("passes a team-only roster opening to the request-bound F12 subject check",async()=>{
    rpc.mockResolvedValue({data:null,error:{code:"42501"}});
    await expect(dispatchHr({op:"rosterOpening",employeeId:19,id:null},ctx)).rejects.toMatchObject({status:403});
    expect(rpc).toHaveBeenCalledWith("f12_attendance_entry_opening",{p_employee:19,p_id:null});
  });
});
it.each(["punch","overtime"] as const)("reports the 26th %s record without a count",async(kind)=>{
  const grant=["hr.employees.view","hr.attendance.view"];
  const reader={...ctx,permissionCodes:grant,roleAssignments:[{roleId:1,roleCode:"scope",ownerCompanyId:1,branchId:1,permissionCodes:grant}]};
  const q=source({id:19,owner_company_id:1,branch_id:1,reporting_manager_id:null});
  createClient.mockResolvedValue({...q,rpc});
  const facts=Array.from({length:26},(_,n)=>({id:26-n,label:"Synthetic time",date:"2026-11-20",detail:null,status:null,revision:null}));
  rpc.mockImplementation(async(name:string,args:{p_page?:number})=>({error:null,count:null,data:name==="mobile_hr_own_access"?null:args.p_page===1?facts:facts.slice(25)}));
  const page=await dispatchHr({op:"time",kind,employeeId:19,page:1},reader);
  expect(page).toMatchObject({more:true,rows:facts.slice(0,25)});
  expect(await dispatchHr({op:"time",kind,employeeId:19,page:2},reader)).toMatchObject({more:false,rows:facts.slice(25)});
});
it("honors a single current profile projection after contact management changes",async()=>{
  const staff={roster:false,approvalsGeneral:false,approvalsProposal:false,approvalsLeave:false,requestsTeam:false};
  const p={id:19,full_name_en:"Synthetic report",employee_code:"19",employee_status:"active",joining_date:null,workspace_revision:"2",
    contacts:null,owner_company:null,branch:null,designation:null,department:null,manager:null,site:null,owner_company_id:1,branch_id:2,reporting_manager_id:null,own:false};
  rpc.mockImplementation(async(name:string)=>({error:null,data:name==="mobile_hr_profile"?p:name==="mobile_hr_staff_capabilities"?staff:null}));
  const actual=await dispatchHr({op:"profile",employeeId:19},ctx);
  expect(actual).toMatchObject({employeeId:19,name:"Synthetic report",revision:"2"});
  expect(actual).not.toHaveProperty("contacts");
  expect("fields" in actual && actual.fields.some(f=>/mobile|email|emergency/i.test(f.label))).toBe(false);
  expect(rpc).toHaveBeenCalledWith("mobile_hr_profile",{p_employee:19});
});
