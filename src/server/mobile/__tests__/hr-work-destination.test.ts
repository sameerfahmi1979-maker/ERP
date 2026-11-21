import {expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {home,type Db} from "../hr-reads";
import {workRead} from "../hr-work";

const codes=["directory","employeeRecord","work","teamReadiness","services","serviceReview","issuedDocuments","ppeAssets","onboarding","pro","teamCalendar","dependents","accommodation","offboarding"];
const actor={permissions:new Set(["hr.assignments.view.self"]),roleCodes:[],profile:{id:7}} as unknown as AuthContext;
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),hasPermission:()=>false,hasPermissionInScope:()=>false}));
it("joins assignments-self-only home eligibility to actual My work commands and refuses a sibling before reading rows",async()=>{
 const calls:string[]=[];
 const db={rpc:vi.fn(async(name,args)=>{
  if(name==="mobile_hr_own_access")return {data:{employeeId:12,profile:false,leave:false,attendance:false,compliance:false,medical:false,submit:false,mine:false,actions:false,evidence:false}};
  if(name==="mobile_hr_staff_capabilities")return {data:{roster:false,approvalsGeneral:false,approvalsLeave:false,approvalsProposal:false,requestsTeam:false,expanded:Object.fromEntries(codes.map(k=>[k,k==="work"]))}};
  if(name==="f03_has_employee_permission")return {data:args.employee_id===12&&args.permission_code==="hr.assignments.view"};
  expect(name).toBe("mobile_hr_v5_work_rows");expect(args.p_employee).toBe(12);calls.push(args.p_kind);
  return {data:args.p_kind==="assignments"?[{id:4,workspace_revision:"1",assignment_type:"project",assignment_status:"active",effective_from:"2026-11-01",effective_to:null}]:[]};
 })} as unknown as Db;
 expect(await home(db,actor)).toMatchObject({employeeId:12,entryAvailable:true,personalCapabilities:{work:true},capabilities:{directory:false,employees:false}});
 expect(await workRead(db,{op:"work",employeeId:12,date:"2026-11-21"})).toMatchObject({employeeId:12,assignments:[{id:4,title:"project",status:"active"}],readiness:[],blocks:[]});
 await expect(workRead(db,{op:"work",employeeId:13,date:"2026-11-21"})).rejects.toMatchObject({status:403});
 expect(calls.sort()).toEqual(["assignments","blocks","readiness"]);
});
