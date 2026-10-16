// Real form, selectors, PostgREST serialization and F04 save session; synthetic
// transports/shell only. No actual DB/Auth/Storage/browser/service execution.
import "../remediation/f05/setup";
import React,{type ReactNode} from "react";
import {act,cleanup,fireEvent,render,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import type {CenterRecord} from "@/features/master-data/finance-basics/center-form-state";

type Choice=Record<string,unknown> & {id:number};
const m=vi.hoisted(()=>({calls:[] as URL[],rows:[] as Choice[],status:200,choiceRevision:1,
  update:vi.fn(),create:vi.fn(),error:vi.fn(),clear:vi.fn(),write:vi.fn(),invalidate:vi.fn(),fetch:vi.fn()}));
vi.mock("@/features/master-data/finance-basics/actions",()=>Object.fromEntries(["CostCenter","ProfitCenter"].flatMap(n=>[["create"+n,m.create],["update"+n,m.update]])));
vi.mock("@/lib/query/invalidation",()=>({invalidateCostCenters:m.invalidate,invalidateProfitCenters:m.invalidate}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:m.error}}));
vi.mock("next/navigation",()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>"/synthetic-finance",useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/hooks/use-workspace-form-navigation",()=>({useWorkspaceFormNavigation:()=>({activeTab:null,closeTab:vi.fn(),markDirty:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn(),isTabActive:()=>true})}));
vi.mock("@/hooks/use-workspace-form-section",()=>({useWorkspaceFormSection:()=>["basic",vi.fn()]}));
vi.mock("@/hooks/use-workspace-form-draft",()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_:string,v:unknown)=>v,clearDraft:m.clear,writeDraftField:m.write,restoredFromDraft:false})}));
vi.mock("@/components/workspace/erp-record-workspace-form",()=>({
  ERPRecordWorkspaceForm:({children,onSave}:{children:ReactNode;onSave?:()=>void})=><div>{children}<button onClick={onSave}>Save synthetic</button></div>,
  ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>,
}));
vi.mock("@/lib/supabase/client",async()=>{
  const {PostgrestClient}=await import("@supabase/postgrest-js");
  return {createClient:()=>new PostgrestClient("https://synthetic.invalid/rest/v1",{fetch:m.fetch})};
});
import {FinanceCenterWorkspaceForm} from "@/features/master-data/finance-basics/components/finance-center-workspace-form";
const auth={profile:{id:1},isAccountActive:true,permissionCodes:["master_data.finance_basics.manage"],globalPermissionCodes:["master_data.finance_basics.manage"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
const input=(name:string)=>document.querySelector<HTMLInputElement>('[name="'+name+'"]')!;
const fields=(prefix:"cost"|"profit",id=81,parentId:number|null=6)=>({id,workspace_revision:7,[prefix+"_center_code"]:"SYNTHETIC",[prefix+"_center_name_en"]:"Opened record",
  owner_company_id:1,branch_id:11,["parent_"+prefix+"_center_id"]:parentId,is_active:false,is_locked:false,sort_order:0,
  parent:{[prefix+"_center_code"]:"HISTORIC",[prefix+"_center_name_en"]:"Authorized opened label",[prefix+"_center_name_ar"]:"اسم محفوظ"},
  created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z"}) as unknown as CenterRecord;
const choice=(id:number,company:number|null,branch:number|null,active=true):Choice=>({id,owner_company_id:company,branch_id:branch,is_active:active,
  cost_center_code:"C"+id,cost_center_name_en:"Choice "+id,profit_center_code:"P"+id,profit_center_name_en:"Choice "+id});
function matches(row:Choice,text:string):boolean{
  const [column,op,literal]=text.split(".");const value=literal==="null"?null:literal==="true"?true:literal==="false"?false:/^\d+$/.test(literal)?Number(literal):literal;
  if(op==="neq")return row[column]!==null&&row[column]!==value;
  if(op!=="is"&&op!=="eq")throw Error("Unexpected synthetic filter");return row[column]===value;
}
let qc:QueryClient;
beforeEach(()=>{
  vi.clearAllMocks();m.calls=[];m.status=200;m.choiceRevision=1;
  m.rows=[choice(1,null,null),choice(2,1,null),choice(3,1,11),choice(4,1,12),choice(5,2,21),choice(6,1,11,false),choice(81,1,11)];
  m.update.mockResolvedValue({success:true,data:{id:81,revision:"8",changed:true,replayed:false}});
  m.fetch.mockImplementation(async(url:string)=>{
    const request=new URL(url);m.calls.push(request);const table=request.pathname.split("/").at(-1),p=request.searchParams;
    if(["cost_centers","profit_centers"].includes(table!)&&m.status!==200)return new Response(JSON.stringify({message:"PRIVATE"}),{status:m.status});
    let rows:Choice[]=table==="owner_companies"?[{id:1,legal_name_en:"Company A",status:"active"},{id:2,legal_name_en:"Company B",status:"active"}]:table==="branches"?
      [{id:11,branch_name_en:"Branch A1",owner_company_id:1,status:"active"},{id:12,branch_name_en:"Branch A2",owner_company_id:1,status:"active"},{id:21,branch_name_en:"Branch B1",owner_company_id:2,status:"active"}]:m.rows;
    rows=rows.filter(row=>[...p].every(([key,value])=>["select","order","offset","limit"].includes(key)||
      (key==="or"?value.slice(1,-1).split(",").some(part=>matches(row,part)):matches(row,key+"."+value))));
    return new Response(JSON.stringify(rows.map(row=>({...row,workspace_revision:m.choiceRevision}))),{status:200,headers:{"content-type":"application/json","content-range":`0-${rows.length-1}/${rows.length}`}});
  });
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({success:true,data:[]})));
  qc=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,staleTime:60000,gcTime:60000}}});
});
afterEach(()=>{cleanup();qc.clear();vi.unstubAllGlobals();});

describe.each(["cost","profit"] as const)("%s actual parent form",prefix=>{
  const entity=prefix==="cost"?"cost_centers":"profit_centers";
  const parentName="parent_"+prefix+"_center_id";
  const tree=(record=fields(prefix),ctx=auth)=><QueryClientProvider client={qc}><FinanceCenterWorkspaceForm entity={entity} mode="edit" record={record} authContext={ctx}/></QueryClientProvider>;
  const parentButton=(container:HTMLElement)=>within(container).getByRole("combobox",{name:parentName.replaceAll("_"," ")});
  it("passes the exact draft scope and excludes self with active catalogue plus disabled history",async()=>{
    const view=render(tree());await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    const requests=m.calls.filter(url=>url.pathname.endsWith(entity));expect(requests).toHaveLength(2);
    expect(requests[0].searchParams.getAll("or")).toEqual(["(owner_company_id.is.null,owner_company_id.eq.1)","(branch_id.is.null,branch_id.eq.11)"]);
    expect(requests[0].searchParams.get("is_active")).toBe("eq.true");expect(requests[0].searchParams.get("id")).toBe("neq.81");
    expect(requests[1].searchParams.getAll("id")).toEqual(["neq.81","eq.6"]);
    fireEvent.click(parentButton(view.container));await waitFor(()=>expect(view.getByRole("option",{name:/Choice 6/}).getAttribute("aria-disabled")).toBe("true"));
    expect(view.queryByRole("option",{name:/Choice 4/})).toBeNull();expect(view.queryByRole("option",{name:/Choice 5/})).toBeNull();
    expect(view.getByRole("option",{name:/Choice 1$/})).toBeTruthy();expect(m.write).not.toHaveBeenCalled();
  });
  it("keeps an exact authorized saved label on a missing read without dirtying or fabricating eligibility",async()=>{
    m.rows=m.rows.filter(r=>r.id!==6);const view=render(tree());
    await waitFor(()=>expect(m.calls.filter(url=>url.pathname.endsWith(entity))).toHaveLength(2));
    expect(parentButton(view.container).textContent).toContain("Authorized opened label (saved selection)");expect(input(parentName).value).toBe("6");
    expect(m.write).not.toHaveBeenCalled();
    fireEvent.click(parentButton(view.container));expect(view.getByRole("option",{name:/Authorized opened label/}).getAttribute("aria-disabled")).toBe("true");
  });
  it("explicit branch then company changes clear dependent IDs and change the parent query scope",async()=>{
    const view=render(tree());await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    fireEvent.click(within(view.container).getByRole("combobox",{name:"Branch"}));fireEvent.click(await view.findByRole("option",{name:/Branch A2/}));
    expect(input("branch_id").value).toBe("12");await waitFor(()=>expect(input(parentName)?.value).toBe(""));
    await waitFor(()=>expect(m.calls.some(url=>url.pathname.endsWith(entity)&&url.searchParams.getAll("or").includes("(branch_id.is.null,branch_id.eq.12)"))).toBe(true));
    fireEvent.click(within(view.container).getByRole("combobox",{name:"Company"}));fireEvent.click(await view.findByRole("option",{name:/Company B/}));
    expect(input("owner_company_id").value).toBe("2");await waitFor(()=>{expect(input("branch_id")?.value).toBe("");expect(input(parentName)?.value).toBe("");});
    await waitFor(()=>expect(m.calls.some(url=>url.pathname.endsWith(entity)&&url.searchParams.get("branch_id")==="is.null"&&url.searchParams.getAll("or").includes("(owner_company_id.is.null,owner_company_id.eq.2)"))).toBe(true));
  });
  it("choice refresh cannot replace the opening revision or local draft",async()=>{
    const view=render(tree());await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    fireEvent.change(input("notes"),{target:{value:"Retained draft"}});m.choiceRevision=999;
    await act(async()=>{await qc.invalidateQueries({queryKey:["master",entity]});});
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
    expect(m.update.mock.calls[0][0]).toMatchObject({id:81,notes:"Retained draft",owner_company_id:1,branch_id:11,[parentName]:6});expect(m.update.mock.calls[0][1].revision).toBe("7");
  });
  it("selects the lawful global parent without changing the child scope or opening save contract",async()=>{
    const view=render(tree());await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    fireEvent.click(parentButton(view.container));fireEvent.click(await view.findByRole("option",{name:/Choice 1$/}));
    expect(input(parentName).value).toBe("1");expect(input("owner_company_id").value).toBe("1");expect(input("branch_id").value).toBe("11");
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.update).toHaveBeenCalledOnce());
    expect(m.update.mock.calls[0][0]).toMatchObject({id:81,owner_company_id:1,branch_id:11,[parentName]:1});expect(m.update.mock.calls[0][1].revision).toBe("7");
  });
  it("a parent failure leaves an uncertain operation/payload/revision byte-equivalent on retry",async()=>{
    m.update.mockResolvedValueOnce({success:false,uncertain:true});const view=render(tree());
    await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    fireEvent.change(input("notes"),{target:{value:"Uncertain draft"}});fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));
    await waitFor(()=>expect(m.error).toHaveBeenCalled());const first=structuredClone(m.update.mock.calls[0]);m.status=503;m.choiceRevision=999;
    await act(async()=>{await qc.invalidateQueries({queryKey:["master",entity]});});
    await waitFor(()=>expect(view.queryAllByRole("alert").length).toBeGreaterThan(0));
    expect(input("notes").disabled).toBe(true);expect(input(parentName).value).toBe("6");expect(m.clear).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update.mock.calls[1]).toEqual(first);expect(first[1].revision).toBe("7");
  });
  it("known no-op receipt advances only the save session and uses its new revision",async()=>{
    m.update.mockResolvedValueOnce({success:true,data:{id:81,revision:"8",changed:false,replayed:false}});
    const view=render(tree());await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Choice 6"));
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.clear).toHaveBeenCalled());
    fireEvent.change(input("notes"),{target:{value:"Next edit"}});fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));
    await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));expect(m.update.mock.calls[1][1].revision).toBe("8");
    expect(m.update.mock.calls[1][1].operationId).not.toBe(m.update.mock.calls[0][1].operationId);
  });
  it("account/record replacement cannot reuse the prior saved label or uncertain request",async()=>{
    m.rows=[];m.update.mockResolvedValueOnce({success:false,uncertain:true});const view=render(tree());
    await waitFor(()=>expect(parentButton(view.container).textContent).toContain("Authorized opened label"));
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.error).toHaveBeenCalled());const first=m.update.mock.calls[0];
    const next={...fields(prefix,82,7),parent:undefined};view.rerender(tree(next,{...auth,profile:{...auth.profile,id:2}} as AuthContext));
    expect(view.container.textContent).not.toContain("Authorized opened label");expect(input(parentName).value).toBe("7");expect(input("notes").disabled).toBe(false);
    m.update.mockResolvedValue({success:true,data:{id:82,revision:"8",changed:true,replayed:false}});
    fireEvent.click(view.getByRole("button",{name:"Save synthetic"}));await waitFor(()=>expect(m.update).toHaveBeenCalledTimes(2));
    expect(m.update.mock.calls[1][0].id).toBe(82);expect(m.update.mock.calls[1][1].operationId).not.toBe(first[1].operationId);
  });
});
