import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {HR_OPERATIONS_KINDS, hrOperationsReadIdentity, type HrOperationsKind} from "@/lib/reads/hr-operations-schema";
import {LoadError} from "@/components/erp/load-error";
import AssignmentsPage from "@/app/(protected)/admin/hr/operations/assignments/page";
import BlocksPage from "@/app/(protected)/admin/hr/operations/blocks/page";
import ReadinessPage from "@/app/(protected)/admin/hr/operations/readiness/page";
const state=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),redirect:vi.fn((url:string)=>{throw Error("REDIRECT:"+url);})}));
vi.mock("@/lib/rbac/check",async original=>({...await original<typeof import("@/lib/rbac/check")>(),getAuthContext:state.auth}));
vi.mock("@/server/reads/hr-operations",()=>({readHrOperations:state.read}));
vi.mock("next/navigation",()=>({redirect:state.redirect}));
const context={profile:{id:6,auth_user_id:"owned-synthetic",must_change_password:false},accountStatus:"active",isAccountActive:true,permissionCodes:[],roleCodes:["system_admin"],roleAssignments:[{roleId:880101,roleCode:"system_admin",ownerCompanyId:null,branchId:null,permissionCodes:[]}]} as unknown as AuthContext;
const pages:Record<HrOperationsKind,()=>Promise<React.ReactElement<Record<string,unknown>>>>={assignments:AssignmentsPage,blocks:BlocksPage,readiness:ReadinessPage};
const payload=(kind:HrOperationsKind)=>({success:true,data:{kind,rows:[],totalCount:0,page:1,pageSize:25},updatedAt:1791090000000});
afterEach(()=>{state.auth.mockReset();state.read.mockReset();state.redirect.mockClear();});
it.each(HR_OPERATIONS_KINDS)("%s server page passes the same validated context and exact seed identity",async kind=>{
 state.auth.mockResolvedValue(context);state.read.mockResolvedValue(payload(kind));const element=await pages[kind]();
 expect(state.auth).toHaveBeenCalledTimes(1);expect(state.read).toHaveBeenCalledTimes(1);expect(state.read).toHaveBeenCalledWith(kind==="readiness"?{kind}:{kind,status:"active"},context);
 expect(element.props).toMatchObject({authContext:context,initialPage:payload(kind).data,initialReadIdentity:hrOperationsReadIdentity(context),initialUpdatedAt:1791090000000});expect(element.type).not.toBe(LoadError);expect(state.redirect).not.toHaveBeenCalled();
 if(kind==="blocks")expect(element.props.canManage).toBe(true);
});
it.each(HR_OPERATIONS_KINDS)("%s failed initial read returns the existing honest retry view, not a valid empty seed",async kind=>{
 state.auth.mockResolvedValue(context);state.read.mockResolvedValue({success:false,error:"Synthetic initial read failure"});const element=await pages[kind]();
 expect(element.type).toBe(LoadError);expect(element.props).toMatchObject({title:"Operational records",retryHref:"/admin/hr/operations/"+kind});expect(element.props.initialPage).toBeUndefined();expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(HR_OPERATIONS_KINDS)("%s mismatched response kind is refused before client seeding",async kind=>{
 state.auth.mockResolvedValue(context);state.read.mockResolvedValue(payload(kind==="blocks"?"assignments":"blocks"));const element=await pages[kind]();expect(element.type).toBe(LoadError);expect(element.props.initialPage).toBeUndefined();
});
for(const mode of["no-role","signed-out","suspended","forced-password"]as const)it.each(HR_OPERATIONS_KINDS)("%s server page refuses "+mode+" before any business read",async kind=>{
 const invalid=mode==="signed-out"?null:mode==="no-role"?{...context,permissionCodes:[],roleCodes:[],roleAssignments:[]}:mode==="suspended"?{...context,isAccountActive:false,accountStatus:"suspended"}:{...context,profile:{...context.profile!,must_change_password:true}};
 state.auth.mockResolvedValue(invalid);await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied");expect(state.read).not.toHaveBeenCalled();expect(state.redirect).toHaveBeenCalledOnce();
});
it("a read-only scoped block viewer receives no manage capability",async()=>{
 const scoped={...context,roleCodes:["perf_company"],permissionCodes:["hr.assignments.view"],roleAssignments:[{roleId:880106,roleCode:"perf_company",ownerCompanyId:880101,branchId:null,permissionCodes:["hr.assignments.view"]}]} as AuthContext;
 state.auth.mockResolvedValue(scoped);state.read.mockResolvedValue(payload("blocks"));const element=await BlocksPage();expect(element.props.canManage).toBe(false);expect(state.read).toHaveBeenCalledWith({kind:"blocks",status:"active"},scoped);
});
