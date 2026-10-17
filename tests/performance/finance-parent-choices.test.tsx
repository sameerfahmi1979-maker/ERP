// Offline only: the real PostgREST builder serializes requests into a controlled
// transport. The evaluator below is not a claim about real PostgreSQL RLS.
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, renderHook, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fetchConfigurationChoices, type ConfigurationParams, type ConfigurationResource} from "@/lib/lookups/configuration-fetchers";
import {useCostCentersQuery, useProfitCentersQuery} from "@/hooks/lookups/use-org-queries";
import {CostCenterSelect} from "@/components/erp/finance-basics/cost-center-select";
import {ProfitCenterSelect} from "@/components/erp/finance-basics/profit-center-select";

type Row = {id:number; owner_company_id:number|null; branch_id:number|null; is_active:boolean; [key:string]:unknown};
type Call = {url:URL; signal?:AbortSignal|null; headers:Headers};
const transport = vi.hoisted(()=>({calls:[] as Call[], rows:[] as Row[], visible:null as number[]|null,
  respond:undefined as undefined|((call:Call)=>Promise<Response>), fetch:vi.fn()}));
vi.mock("@/lib/supabase/client", async()=>{
  const {PostgrestClient}=await import("@supabase/postgrest-js");
  return {createClient:()=>new PostgrestClient("https://synthetic.invalid/rest/v1",{fetch:transport.fetch})};
});

function splitLogic(text:string):string[] {
  let depth=0,start=0;const parts:string[]=[];
  for(let i=0;i<text.length;i++){
    if(text[i]==="(")depth++;if(text[i]===")")depth--;
    if(text[i]===","&&depth===0){parts.push(text.slice(start,i));start=i+1;}
  }
  parts.push(text.slice(start));return parts;
}
function expression(row:Row,clause:string):boolean {
  const group=/^(and|or)\((.*)\)$/.exec(clause);
  if(group){const matches=splitLogic(group[2]).map(part=>expression(row,part));return group[1]==="and"?matches.every(Boolean):matches.some(Boolean);}
  const match=/^([a-z_]+)\.(eq|neq|is)\.(null|true|false|[1-9]\d*)$/.exec(clause);
  if(!match)throw Error("Unsupported synthetic predicate: "+clause);
  const value=match[3]==="null"?null:match[3]==="true"?true:match[3]==="false"?false:Number(match[3]);
  // Test fixtures have explicit SQL-like nulls. Every URL filter is conjunctive.
  return match[2]==="neq"?row[match[1]]!==null&&row[match[1]]!==value:row[match[1]]===value;
}
function answer(call:Call):Response {
  const params=call.url.searchParams;
  const rows=transport.rows.filter(row=>transport.visible===null||transport.visible.includes(row.id)).filter(row=>
    [...params].every(([key,value])=>["select","order","offset","limit"].includes(key)||
      (key==="or"?expression(row,"or"+value):expression(row,key+"."+value))));
  const from=Number(params.get("offset")??0),size=Number(params.get("limit")??500);
  return new Response(JSON.stringify(rows.slice(from,from+size)),{status:200,headers:{"content-type":"application/json","content-range":`${from}-${Math.min(from+size,rows.length)-1}/${rows.length}`}});
}
const row=(id:number,company:number|null,branch:number|null,active=true):Row=>({id,owner_company_id:company,branch_id:branch,is_active:active,
  cost_center_code:"C"+id,cost_center_name_en:"Centre "+id,cost_center_name_ar:"مركز "+id,
  profit_center_code:"P"+id,profit_center_name_en:"Centre "+id,profit_center_name_ar:"مركز "+id});
const scope=(companyId:number|null=1,branchId:number|null=11,excludeId:number|null=99)=>({companyId,branchId,excludeId});
const parent=(parentScope=scope(),selectedId?:number)=>({choiceMode:"finance-parent",parentScope,selectedId} as unknown as ConfigurationParams);
const cache=()=>new QueryClient({defaultOptions:{queries:{staleTime:60000,gcTime:60000,retryDelay:1}}});
const clients:QueryClient[]=[];
function wrapper(){const qc=cache();clients.push(qc);return {qc,Wrapper:({children}:{children:React.ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>};}
beforeEach(()=>{
  transport.calls=[];transport.visible=null;transport.respond=undefined;
  transport.rows=[row(1,null,null),row(2,1,null),row(3,1,11),row(4,1,12),row(5,2,21),row(6,1,11,false),row(99,1,11)];
  transport.fetch.mockReset().mockImplementation(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const call={url:new URL(String(input)),signal:init?.signal,headers:new Headers(init?.headers)};transport.calls.push(call);
    return transport.respond?transport.respond(call):answer(call);
  });
});
afterEach(()=>{cleanup();clients.splice(0).forEach(qc=>qc.clear());});

describe.each(["costCenters","profitCenters"] as const)("%s finance parent mode",resource=>{
  const useChoices=resource==="costCenters"?useCostCentersQuery:useProfitCentersQuery;
  const Select=resource==="costCenters"?CostCenterSelect:ProfitCenterSelect;
  const options=(s=scope(),selectedId?:number)=>({...parent(s,selectedId)} as unknown as Parameters<typeof useChoices>[0]);
  it.each([[null,null,[1]],[1,null,[1,2]],[1,11,[1,2,3]],[1,12,[1,2,4]]] as const)("mirrors SQL for child %s/%s",async(company,branch,expected)=>{
    const result=await fetchConfigurationChoices<Row>(resource,parent(scope(company,branch)));
    expect(result.map(r=>r.id)).toEqual(expected);
    const p=transport.calls[0].url.searchParams;
    expect(p.get("id")).toBe("neq.99");expect(p.get("is_active")).toBe("eq.true");
    if(company===null)expect(p.get("owner_company_id")).toBe("is.null");
    else expect(p.getAll("or")).toContain(`(owner_company_id.is.null,owner_company_id.eq.${company})`);
    if(branch===null)expect(p.get("branch_id")).toBe("is.null");
    else expect(p.getAll("or")).toContain(`(branch_id.is.null,branch_id.eq.${branch})`);
  });
  it("intersects eligibility with transport-visible rows rather than fabricating company-wide access",async()=>{
    transport.visible=[1,3,6];expect((await fetchConfigurationChoices<Row>(resource,parent())).map(r=>r.id)).toEqual([1,3]);
    transport.visible=[1,5];expect((await fetchConfigurationChoices<Row>(resource,parent())).map(r=>r.id)).toEqual([1]);
  });
  it("selected history omits only activity and retains both scopes and self exclusion",async()=>{
    expect((await fetchConfigurationChoices<Row>(resource,parent(scope(),6))).map(r=>r.id)).toEqual([6]);
    expect(await fetchConfigurationChoices(resource,parent(scope(),4))).toEqual([]);
    expect(await fetchConfigurationChoices(resource,parent(scope(),5))).toEqual([]);
    expect(await fetchConfigurationChoices(resource,parent(scope(),99))).toEqual([]);
    for(const call of transport.calls){expect(call.url.searchParams.getAll("id")).toContain("neq.99");expect(call.url.searchParams.has("is_active")).toBe(false);}
  });
  it("retains complete paging, predicates, stable ordering and cancellation on every range",async()=>{
    transport.rows=Array.from({length:1007},(_,i)=>row(i+1000,i%2?null:1,i%3?null:11));
    const signal=new AbortController().signal;
    expect(await fetchConfigurationChoices(resource,parent(),signal)).toHaveLength(1007);
    expect(transport.calls).toHaveLength(3);
    for(const [i,call] of transport.calls.entries()){
      expect(call.url.searchParams.get("offset")).toBe(String(i*500));expect(call.url.searchParams.get("limit")).toBe("500");
      expect(call.url.searchParams.getAll("or")).toHaveLength(2);expect(call.url.searchParams.get("id")).toBe("neq.99");
      expect(call.url.searchParams.get("order")?.split(",").at(-1)).toBe("id.asc");expect(call.signal).toBe(signal);
      expect(call.headers.get("Prefer")).toBe("count=exact");expect(call.url.searchParams.get("select")).not.toContain("*");
    }
  });
  it("rejects late page failure without returning partial choices",async()=>{
    transport.rows=Array.from({length:501},(_,i)=>row(i+1000,null,null));
    transport.respond=async call=>call.url.searchParams.get("offset")==="500"?new Response(JSON.stringify({message:"PRIVATE"}),{status:503}):answer(call);
    await expect(fetchConfigurationChoices(resource,parent())).rejects.toMatchObject({status:503});expect(transport.calls).toHaveLength(2);
  });
  it("keeps ordinary company equality and includeInactive behavior unchanged",async()=>{
    expect((await fetchConfigurationChoices<Row>(resource,{parentId:1,includeInactive:true})).map(r=>r.id)).toEqual([2,3,4,6,99]);
    expect(transport.calls[0].url.searchParams.get("owner_company_id")).toBe("eq.1");expect(transport.calls[0].url.searchParams.getAll("or")).toEqual([]);
  });
  it("isolates branch, mode and exclusion keys while coalescing exact consumers",async()=>{
    const {qc,Wrapper}=wrapper();
    const Hook=({s=scope()}:{s?:ReturnType<typeof scope>})=>{const read=useChoices(options(s));return <span>{read.isFetching?"busy":"ready"}</span>;};
    const view=render(<Wrapper><Hook/><Hook/></Wrapper>);
    await waitFor(()=>expect(view.getAllByText("ready")).toHaveLength(2));expect(transport.calls).toHaveLength(1);
    view.rerender(<Wrapper><Hook s={scope(1,12)}/></Wrapper>);await waitFor(()=>expect(view.getByText("ready")).toBeTruthy());
    view.rerender(<Wrapper><Hook s={scope(1,12,4)}/></Wrapper>);await waitFor(()=>expect(view.getByText("ready")).toBeTruthy());
    const {result}=renderHook(()=>useChoices({ownerCompanyId:1}),{wrapper:Wrapper});await waitFor(()=>expect(result.current.isFetching).toBe(false));
    expect(transport.calls).toHaveLength(4);
    expect(qc.getQueryCache().getAll().filter(q=>q.queryKey.length===6&&q.queryKey[2]==="finance-parent").map(q=>q.queryKey)).toEqual([
      ["master",resource==="costCenters"?"cost_centers":"profit_centers","finance-parent",1,11,99],
      ["master",resource==="costCenters"?"cost_centers":"profit_centers","finance-parent",1,12,99],
      ["master",resource==="costCenters"?"cost_centers":"profit_centers","finance-parent",1,12,4],
    ]);
  });
  it.each([undefined,null,"invalid",{companyId:null,branchId:null}])("malformed parent scope %j cannot reuse warm ordinary/global-parent data",async parentScope=>{
    const {Wrapper}=wrapper();const {result,rerender}=renderHook(({query})=>useChoices(query),{
      wrapper:Wrapper,initialProps:{query:{ownerCompanyId:null} as Parameters<typeof useChoices>[0]},
    });
    await waitFor(()=>expect(result.current.isFetching).toBe(false));expect(result.current.data.length).toBeGreaterThan(0);
    rerender({query:options(scope(null,null,null))});await waitFor(()=>expect(result.current.isFetching).toBe(false));expect(result.current.data.map(r=>r.id)).toEqual([1]);
    const calls=transport.calls.length;
    rerender({query:{choiceMode:"finance-parent",parentScope} as unknown as Parameters<typeof useChoices>[0]});
    await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.data).toEqual([]);expect(transport.calls).toHaveLength(calls);
  });
  it("marks exact inactive history disabled and never promotes it through a saved label",async()=>{
    const {Wrapper}=wrapper();const {result}=renderHook(()=>useChoices(options(scope(),6)),{wrapper:Wrapper});
    await waitFor(()=>expect(result.current.options.some(o=>o.value===6)).toBe(true));
    expect(result.current.options.find(o=>o.value===6)?.disabled).toBe(true);
    expect(result.current.options.filter(o=>!o.disabled).map(o=>o.value)).toEqual([1,2,3]);
  });
  it("a late ignored-abort selected result cannot cross the branch key",async()=>{
    let release!:(response:Response)=>void;let oldCall!:Call;
    transport.respond=call=>{
      if(call.url.searchParams.getAll("id").includes("eq.6")&&call.url.searchParams.getAll("or").includes("(branch_id.is.null,branch_id.eq.11)")){
        oldCall=call;return new Promise(resolve=>{release=resolve;});
      }
      return Promise.resolve(answer(call));
    };
    const {Wrapper}=wrapper();const {result,rerender}=renderHook(({branch})=>useChoices(options(scope(1,branch),6)),{wrapper:Wrapper,initialProps:{branch:11}});
    await waitFor(()=>expect(release).toBeTypeOf("function"));rerender({branch:12});
    await waitFor(()=>expect(result.current.isFetching).toBe(false));expect(result.current.data.map(r=>r.id)).toEqual([1,2,4]);
    expect(oldCall.signal?.aborted).toBe(true);
    await act(async()=>{release(answer(oldCall));});
    expect(result.current.data.map(r=>r.id)).toEqual([1,2,4]);expect(result.current.error).toBeNull();
  });
  it("retains only the exact saved label and excludes self even from fallback",async()=>{
    transport.rows=[];const {Wrapper}=wrapper(),change=vi.fn();
    const props={choiceMode:"finance-parent" as const,parentScope:scope(),value:6,savedSelection:{value:6,label:"Opened authorized parent"},onValueChange:change,name:"parent"};
    const view=render(<Wrapper><Select {...props}/></Wrapper>);
    await waitFor(()=>expect(view.getByRole("combobox").textContent).toContain("Opened authorized parent"));
    fireEvent.click(view.getByRole("combobox"));await waitFor(()=>expect(view.getByRole("option").getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(view.getByRole("option"));expect(change).not.toHaveBeenCalled();
    view.rerender(<Wrapper><Select {...props} value={5}/></Wrapper>);expect(view.container.textContent).not.toContain("Opened authorized parent");
    view.rerender(<Wrapper><Select {...props} value={99} savedSelection={{value:99,label:"Must not show self"}}/></Wrapper>);
    expect(view.container.textContent).not.toContain("Must not show self");expect(change).not.toHaveBeenCalled();
  });
  it.each([401,403,503])("makes warm %s failure inert including an open portal without clearing the value",async status=>{
    const {qc,Wrapper}=wrapper(),change=vi.fn();
    const props={choiceMode:"finance-parent" as const,parentScope:scope(),value:3,onValueChange:change,name:"parent"};
    const view=render(<Wrapper><Select {...props}/></Wrapper>);
    await waitFor(()=>expect(view.getByRole("combobox").textContent).toContain("Centre 3"));
    fireEvent.click(view.getByRole("combobox"));await waitFor(()=>expect(view.getAllByRole("option").length).toBeGreaterThan(0));
    transport.respond=async()=>new Response(JSON.stringify({message:"PRIVATE"}),{status});
    await act(async()=>{await qc.invalidateQueries({queryKey:["master"]});});
    await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());
    expect(within(view.container).getByRole("combobox").getAttribute("disabled")).not.toBeNull();
    for(const option of view.queryAllByRole("option"))fireEvent.click(option);
    expect(change).not.toHaveBeenCalled();expect(view.container.querySelector<HTMLInputElement>('input[name="parent"]')?.value).toBe("3");
    if(status!==503)expect(view.queryAllByRole("option")).toHaveLength(0);
    transport.respond=undefined;fireEvent.click(view.getByRole("button",{name:/Retry/}));
    await waitFor(()=>expect(view.queryByRole("alert")).toBeNull());
    expect(within(view.container).getByRole("combobox").textContent).toContain("Centre 3");expect(change).not.toHaveBeenCalled();
  });
});

it.each([
  {choiceMode:"unknown"}, {choiceMode:"finance-parent"},
  {choiceMode:"finance-parent",parentScope:{companyId:1,branchId:11}},
  {choiceMode:"finance-parent",parentScope:scope(null,11)},
  ...[0,-1,1.5,"1",Number.MAX_SAFE_INTEGER+1].map(companyId=>({choiceMode:"finance-parent",parentScope:{...scope(),companyId}})),
  ...[0,-1,1.5,"1",Number.MAX_SAFE_INTEGER+1].flatMap(value=>["branchId","excludeId"].map(key=>({choiceMode:"finance-parent",parentScope:{...scope(),[key]:value}}))),
  {choiceMode:"finance-parent",parentScope:{...scope(),rawFilter:"owner_company_id.gt.0"}},
  ...["parentId","filter"].map(key=>({...parent(),[key]:1})),
  {...parent(),includeInactive:true},
])("rejects malformed/ambiguous parent arguments before making a request: %j",async params=>{
  await expect(fetchConfigurationChoices("costCenters",params as ConfigurationParams)).rejects.toMatchObject({status:400});expect(transport.calls).toEqual([]);
});
it.each(["ownerCompanies","branches","countries","emirates","cities","areas","ports"] as ConfigurationResource[])("never broadens %s with finance mode",async resource=>{
  await expect(fetchConfigurationChoices(resource,parent())).rejects.toMatchObject({status:400});expect(transport.calls).toEqual([]);
});
