// @vitest-environment jsdom
// Actual finance form, F04 save session, query hooks and selectors; shell/navigation
// and external action/browser transports only are controlled. No actual runtime.
import "../remediation/f05/setup";
import React,{type ReactNode} from "react";
import {act,cleanup,fireEvent,render,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {queryKeys} from "@/lib/query/query-keys";
import type {AuthContext} from "@/lib/rbac/check";
import type {CenterRecord} from "@/features/master-data/finance-basics/center-form-state";
const m=vi.hoisted(()=>({failed:false,choiceRevision:1,update:vi.fn(),create:vi.fn(),error:vi.fn(),clear:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/features/master-data/finance-basics/actions",()=>Object.fromEntries(["CostCenter","ProfitCenter"].flatMap(n=>[["create"+n,m.create],["update"+n,m.update]])));
vi.mock("@/lib/query/invalidation",()=>({invalidateCostCenters:m.invalidate,invalidateProfitCenters:m.invalidate}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:m.error}}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>"/synthetic-finance",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/hooks/use-workspace-form-navigation",()=>({useWorkspaceFormNavigation:()=>({activeTab:null,closeTab:vi.fn(),markDirty:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn(),isTabActive:()=>true})}));
vi.mock("@/hooks/use-workspace-form-section",()=>({useWorkspaceFormSection:()=>["basic",vi.fn()]}));
vi.mock("@/hooks/use-workspace-form-draft",()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,clearDraft:m.clear,writeDraftField:vi.fn(),restoredFromDraft:false})}));
vi.mock("@/components/workspace/erp-record-workspace-form",()=>({
 ERPRecordWorkspaceForm:({children,onSave}:{children:ReactNode;onSave?:()=>void})=><div>{children}<button onClick={onSave}>Save synthetic</button></div>,
 ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>,
}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({from:(table:string)=>{
 const b={
  select:()=>b,retry:()=>b,eq:()=>b,order:()=>b,range:()=>b,abortSignal:()=>b,
  then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>{
   const data=table==="owner_companies"?[{id:1,legal_name_en:"Synthetic company",workspace_revision:m.choiceRevision}]:
    table==="branches"?[{id:2,branch_name_en:"Synthetic branch",workspace_revision:m.choiceRevision}]:
    [{id:5,cost_center_name_en:"Synthetic parent",workspace_revision:m.choiceRevision}];
   return Promise.resolve(m.failed?{data:null,count:null,error:{message:"PRIVATE"},status:503}:{data,count:data.length,error:null,status:200}).then(resolve,reject);
  },
 };return b;
}})}));
import {FinanceCenterWorkspaceForm} from "@/features/master-data/finance-basics/components/finance-center-workspace-form";
const auth={profile:{id:1},isAccountActive:true,permissionCodes:["master_data.finance_basics.manage"],globalPermissionCodes:["master_data.finance_basics.manage"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const record={id:81,workspace_revision:7,cost_center_code:"SYNTHETIC",cost_center_name_en:"Opened record",owner_company_id:1,branch_id:2,parent_cost_center_id:5,is_active:false,is_locked:false,sort_order:0,created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z"} as unknown as CenterRecord;
let qc:QueryClient;
beforeEach(()=>{
 vi.clearAllMocks();m.failed=false;m.choiceRevision=1;
 m.update.mockResolvedValue({success:true,data:{id:81,revision:"8",changed:true,replayed:false}});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({success:true,data:[]})));
 qc=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,staleTime:60000,gcTime:60000}}});
});
afterEach(()=>{cleanup();qc.clear();vi.unstubAllGlobals();});
const input=(name:string)=>document.querySelector('[name="'+name+'"]') as HTMLInputElement;
it("choice refresh preserves the opening revision and draft instead of adopting returned choice metadata",async()=>{
 const view=render(<QueryClientProvider client={qc}><FinanceCenterWorkspaceForm entity="cost_centers" mode="edit" record={record} authContext={auth}/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByRole("combobox",{name:"Company"}).textContent).toContain("Synthetic company"));
 fireEvent.change(input("notes"),{target:{value:"Retained local draft"}});
 m.choiceRevision=999;
 await act(async()=>{await qc.invalidateQueries({queryKey:["master"]});});
 fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
 expect(m.update.mock.calls[0][0]).toMatchObject({id:81,notes:"Retained local draft",owner_company_id:1,branch_id:2,parent_cost_center_id:5,is_active:false,sort_order:0});
 expect(m.update.mock.calls[0][1]).toMatchObject({revision:"7"});
});
it("a503 choice refresh cannot clear or replace an uncertain request or its named references",async()=>{
 m.update.mockResolvedValueOnce({success:false,uncertain:true});
 const view=render(<QueryClientProvider client={qc}><FinanceCenterWorkspaceForm entity="cost_centers" mode="edit" record={record} authContext={auth}/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByRole("combobox",{name:"Company"}).textContent).toContain("Synthetic company"));
 fireEvent.change(input("notes"),{target:{value:"Uncertain retained payload"}});
 fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));
 await waitFor(()=>expect(m.error).toHaveBeenCalled());
 const first=m.update.mock.calls[0];
 m.failed=true;m.choiceRevision=999;
 await act(async()=>{await qc.invalidateQueries({queryKey:queryKeys.ownerCompanies(true),exact:true});});
 await waitFor(()=>expect(view.queryAllByRole("alert").length).toBeGreaterThan(0));
 expect(input("notes").disabled).toBe(true);
 expect(input("owner_company_id").value).toBe("1");expect(input("branch_id").value).toBe("2");expect(input("parent_cost_center_id").value).toBe("5");
 expect(m.clear).not.toHaveBeenCalled();
 fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));
 await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));
 expect(m.update.mock.calls[1]).toEqual(first);expect(first[1]).toMatchObject({revision:"7"});
});
