// @vitest-environment jsdom
// Real hooks/controls/QueryClient; only the Supabase browser transport is synthetic.
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,waitFor,within} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {queryKeys} from "@/lib/query/query-keys";
import {ReadError} from "@/lib/reads/client";
import {registerPrivateCache,clearPrivateCaches} from "@/lib/query/private-cache";
import {useBranchesQuery} from "@/hooks/lookups/use-org-queries";
import {CountrySelect} from "@/components/erp/geography/country-select";
import {EmirateSelect} from "@/components/erp/geography/emirate-select";
import {CitySelect} from "@/components/erp/geography/city-select";
import {AreaZoneSelect} from "@/components/erp/geography/area-zone-select";
import {PortSelect} from "@/components/erp/geography/port-select";
import {OwnerCompanySelect} from "@/components/erp/organizations/owner-company-select";
import {BranchSelect} from "@/components/erp/organizations/branch-select";
import {CostCenterSelect} from "@/components/erp/finance-basics/cost-center-select";
import {ProfitCenterSelect} from "@/components/erp/finance-basics/profit-center-select";

type Call={table:string;columns?:string;count?:string;filters:[string,unknown][];order:string[];from?:number;to?:number;signal?:AbortSignal};
type Row={id:number;[key:string]:unknown};
type Reply={data:Row[]|null;count:number|null;error:null|{message:string};status:number};
const state=vi.hoisted(()=>({calls:[] as Call[],reply:undefined as undefined|((call:Call)=>Promise<Reply>)}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({from:(table:string)=>{
 const call:Call={table,filters:[],order:[]};
 const builder={
  select:(columns:string,options?:{count:string})=>{call.columns=columns;call.count=options?.count;return builder;},
  retry:()=>builder,order:(column:string)=>{call.order.push(column);return builder;},
  eq:(column:string,value:unknown)=>{call.filters.push([column,value]);return builder;},
  range:(from:number,to:number)=>{call.from=from;call.to=to;return builder;},
  abortSignal:(signal:AbortSignal)=>{call.signal=signal;return builder;},
  then:(resolve:(value:Reply)=>unknown,reject:(error:unknown)=>unknown)=>{state.calls.push(call);if(!state.reply)throw Error("Unexpected synthetic query");return state.reply(call).then(resolve,reject);},
 };return builder;
}})}));
const row=(id=1,label="Synthetic one"):Row=>({id,name_en:label,name_ar:"اختيار تجريبي",legal_name_en:label,branch_name_en:label,cost_center_name_en:label,profit_center_name_en:label});
const ok=(data:Row[]):Reply=>({data,count:data.length,error:null,status:200});
const fail=(status=503):Reply=>({data:null,count:null,error:{message:"PRIVATE PROVIDER DETAIL"},status});
const clients:QueryClient[]=[];
function cache(){const qc=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,staleTime:60000,gcTime:60000}}});clients.push(qc);return qc;}
beforeEach(()=>{state.calls=[];state.reply=async()=>ok([row(),row(2,"Synthetic two")]);});
afterEach(()=>{cleanup();clearPrivateCaches();clients.splice(0).forEach(qc=>qc.clear());vi.restoreAllMocks();});
const controls=[
 ["country",CountrySelect,{},queryKeys.countries(false,false)],
 ["region",EmirateSelect,{countryId:1},queryKeys.emirates(1,false)],
 ["city",CitySelect,{emirateId:1},queryKeys.cities(1,false)],
 ["area",AreaZoneSelect,{cityId:1},[...queryKeys.areas(1,false),null]],
 ["port",PortSelect,{emirateId:1},queryKeys.ports(1,null,false)],
 ["company",OwnerCompanySelect,{},queryKeys.ownerCompanies(false)],
 ["branch",BranchSelect,{ownerCompanyId:1},queryKeys.branches(1,false)],
 ["cost",CostCenterSelect,{ownerCompanyId:1},queryKeys.costCenters(1,false)],
 ["profit",ProfitCenterSelect,{ownerCompanyId:1},queryKeys.profitCenters(1,false)],
] as const;
it.each(controls)("%s open portal is read-only on503, keeps its named draft and recovers explicitly",async(_name,Control,props,key)=>{
 const qc=cache(),changed=vi.fn(),dirty=vi.fn();
 const view=render(<QueryClientProvider client={qc}><Control {...props} value={1} name="draft-choice" onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(within(view.container).getByRole("combobox").textContent).toContain("Synthetic one"));
 view.container.addEventListener("change",dirty);
 fireEvent.click(within(view.container).getByRole("combobox"));
 expect(view.container.contains(view.getByRole("option",{name:"Synthetic two"}))).toBe(false);
 state.reply=async()=>fail();
 await act(async()=>{await qc.invalidateQueries({queryKey:key,exact:true});});
 await waitFor(()=>expect(qc.getQueryState(key)?.status).toBe("error"));
 const option=view.queryByRole("option",{name:"Synthetic two"});if(option)fireEvent.click(option);
 expect(changed).not.toHaveBeenCalled();expect(dirty).not.toHaveBeenCalled();
 expect(view.getByRole("alert")).toBeTruthy();
 expect((within(view.container).getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
 for(const item of view.queryAllByRole("option"))expect(item.getAttribute("aria-disabled")).toBe("true");
 const search=view.queryByPlaceholderText(/Search/);if(search){fireEvent.keyDown(search,{key:"ArrowDown"});fireEvent.keyDown(search,{key:"Enter"});}
 expect(changed).not.toHaveBeenCalled();expect(dirty).not.toHaveBeenCalled();
 expect((view.container.querySelector('input[name="draft-choice"]') as HTMLInputElement).value).toBe("1");
 expect(view.container.textContent).not.toContain("PRIVATE PROVIDER DETAIL");
 state.reply=async()=>ok([row(),row(2,"Synthetic two")]);
 fireEvent.click(view.getByRole("button",{name:"Retry loading"}));
 await waitFor(()=>expect(view.queryByRole("alert")).toBeNull());
 if(!view.queryByRole("option",{name:"Synthetic two"}))fireEvent.click(within(view.container).getByRole("combobox"));
 fireEvent.click(view.getByRole("option",{name:"Synthetic two"}));
 expect(changed).toHaveBeenCalledExactlyOnceWith(2);expect(dirty).toHaveBeenCalledTimes(1);
 view.container.removeEventListener("change",dirty);
});

it.each(["clear","unregister","replacement"] as const)("%s retires all mounted configuration retries before any late continuation",async mode=>{
 const old=cache(),fresh=cache(),key=queryKeys.branches(1,false),selectedKey=[...key,"selected",5];
 old.setQueryData(key,[row()]);old.setQueryData(selectedKey,[row(5,"Historical")]);
 fresh.setQueryData(["fresh-owner"],"unchanged");
 let retry!:()=>Promise<unknown>,pending!:Promise<unknown>,dispose!:()=>void,retired=false;
 const late:Call[]=[],finish:(()=>void)[]=[];
 state.reply=call=>{
  if(retired){late.push(call);return Promise.resolve(ok([row(999)]));}
  return new Promise(resolve=>finish.push(()=>resolve(ok(call.filters.some(([k])=>k==="id")?[row(5)]:[row()]))));
 };
 function Field(){const read=useBranchesQuery({ownerCompanyId:1,selectedId:5});React.useLayoutEffect(()=>{retry=read.refetch;},[read.refetch]);return <span>{read.options.map(o=>o.label).join(",")}</span>;}
 function Registered({qc,children}:{qc:QueryClient;children:React.ReactNode}){React.useLayoutEffect(()=>{const stop=registerPrivateCache(qc);dispose=stop;return stop;},[qc]);return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;}
 const view=render(<Registered qc={old}><Field/></Registered>);
 act(()=>{pending=retry();});
 await waitFor(()=>expect(state.calls).toHaveLength(2));
 retired=true;
 act(()=>{
  if(mode==="clear")clearPrivateCaches();
  if(mode==="unregister")dispose();
  if(mode==="replacement")view.rerender(<Registered qc={fresh}><span>New owner</span></Registered>);else view.unmount();
 });
 expect(state.calls.every(call=>call.signal?.aborted)).toBe(true);
 await act(async()=>{finish.forEach(f=>f());await pending;});
 expect(late).toEqual([]);expect(old.getQueryCache().getAll()).toHaveLength(0);
 expect(fresh.getQueryData(key)).toBeUndefined();expect(fresh.getQueryData(selectedKey)).toBeUndefined();
 expect(fresh.getQueryData(["fresh-owner"])).toBe("unchanged");
});
it("parent replacement never adopts an ignored-abort selected row or its old warm error",async()=>{
 let finish!:(reply:Reply)=>void;
 state.reply=call=>{
  const parent=call.filters.find(([k])=>k==="owner_company_id")?.[1];
  if(parent===2)return Promise.resolve(ok([]));
  return call.filters.some(([k])=>k==="id")?new Promise(resolve=>{finish=resolve;}):Promise.resolve(ok([row()]));
 };
 const qc=cache(),view=render(<QueryClientProvider client={qc}><BranchSelect ownerCompanyId={1} value={5} name="parent-choice"/></QueryClientProvider>);
 await waitFor(()=>expect(state.calls).toHaveLength(2));
 const selectedCall=state.calls[1];
 view.rerender(<QueryClientProvider client={qc}><BranchSelect ownerCompanyId={2} value={5} name="parent-choice"/></QueryClientProvider>);
 await waitFor(()=>expect(state.calls).toHaveLength(4));
 expect(selectedCall.signal?.aborted).toBe(true);
 await act(async()=>finish(ok([row(5,"Old company historical")])));
 expect(view.container.textContent).not.toContain("Old company historical");expect(view.queryByRole("alert")).toBeNull();
 expect((view.container.querySelector('input[name="parent-choice"]') as HTMLInputElement).value).toBe("5");
 expect(state.calls[3].filters).toEqual([["owner_company_id",2],["id",5]]);
});
const geography=controls.slice(0,4);
it.each(geography)("%s selected-read failure retains only the exact authorized saved label and named value",async(_name,Control,props)=>{
 state.reply=async call=>call.filters.some(([k])=>k==="id")?fail(403):ok([row()]);
 const changed=vi.fn(),view=render(<QueryClientProvider client={cache()}><Control {...props} value={5} savedSelection={{value:5,label:"Saved authorized label"}} name="saved-choice" onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(view.getByRole("alert")).toBeTruthy());
 expect(within(view.container).getByRole("combobox").textContent).toContain("Saved authorized label (saved selection)");
 expect((within(view.container).getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
 expect((view.container.querySelector('input[name="saved-choice"]') as HTMLInputElement).value).toBe("5");
 expect(changed).not.toHaveBeenCalled();expect(state.calls).toHaveLength(2);
});
it("explicit includeInactive catalogue membership remains selectable and finance excludeId stays excluded",async()=>{
 state.reply=async()=>ok([row(),row(5,"Explicit catalogue choice")]);
 const qc=cache(),view=render(<QueryClientProvider client={qc}><CostCenterSelect ownerCompanyId={3} value={5} includeInactive excludeId={1}/></QueryClientProvider>);
 await waitFor(()=>expect(within(view.container).getByRole("combobox").textContent).toContain("Explicit catalogue choice"));
 fireEvent.click(within(view.container).getByRole("combobox"));
 expect(view.getByRole("option",{name:"Explicit catalogue choice"}).getAttribute("aria-disabled")).not.toBe("true");
 expect(view.queryByRole("option",{name:"Synthetic one"})).toBeNull();
 expect(state.calls[0].filters).toEqual([["owner_company_id",3]]);
});

it.each(controls)("%s selected-only provenance cannot turn a readable historical row into a new choice",async(_name,Control,props)=>{
 state.reply=async call=>ok(call.filters.some(([key])=>key==="id")?[row(5,"Readable historical")]:[row()]);
 const changed=vi.fn(),view=render(<QueryClientProvider client={cache()}><Control {...props} value={5} name="historical-choice" onValueChange={changed}/></QueryClientProvider>);
 await waitFor(()=>expect(within(view.container).getByRole("combobox").textContent).toContain("Readable historical"));
 fireEvent.click(within(view.container).getByRole("combobox"));
 const historical=view.getByRole("option",{name:"Readable historical"});
 expect(historical.getAttribute("aria-disabled")).toBe("true");fireEvent.click(historical);
 expect(changed).not.toHaveBeenCalled();
 expect((view.container.querySelector('input[name="historical-choice"]') as HTMLInputElement).value).toBe("5");
});
it.each([403,503])("authorized branch [] and explicit catalogue ignore warm shared%i errors and both queries",async status=>{
 for(const authorizedOptions of [[],[{value:5,label:"Authorized branch"}]]){
  const qc=cache(),key=queryKeys.branches(1,false),selected=[...key,"selected",5];
  for(const queryKey of [key,selected]){
   qc.setQueryData(queryKey,[row(99,"Other shared row")]);
   await qc.fetchQuery({queryKey,queryFn:async()=>{throw new ReadError("Denied shared read",status);},retry:false,staleTime:0}).catch(()=>undefined);
  }
  const before=state.calls.length,view=render(<QueryClientProvider client={qc}><BranchSelect ownerCompanyId={1} value={5} authorizedOptions={authorizedOptions} name="authorized-branch" error="Caller validation"/></QueryClientProvider>);
  await act(async()=>{await Promise.resolve();});
  expect(state.calls).toHaveLength(before);expect(view.queryByRole("alert")).toBeNull();
  expect(view.getByText("Caller validation")).toBeTruthy();
  expect((within(view.container).getByRole("combobox") as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(within(view.container).getByRole("combobox"));
  expect(view.queryByRole("option",{name:"Other shared row"})).toBeNull();
  expect(view.queryAllByRole("option")).toHaveLength(authorizedOptions.length);
  expect((view.container.querySelector('input[name="authorized-branch"]') as HTMLInputElement).value).toBe("5");
  view.unmount();
 }
});
