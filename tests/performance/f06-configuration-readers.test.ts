// @vitest-environment jsdom
// Actual closed collectors/descriptors/prefetch. Synthetic Supabase and Server Action ports only.
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {QueryClient} from "@tanstack/react-query";
import {fetchConfigurationChoices,type ConfigurationResource} from "@/lib/lookups/configuration-fetchers";
import {fetchCountries} from "@/lib/lookups/master-data-fetchers";
import {prefetchMasterDataQueries} from "@/lib/query/prefetch-lookups";
import {ORGANIZATION_FORM_PREFETCH} from "@/features/organizations/organization-prefetch";
import {BRANCH_FORM_PREFETCH} from "@/features/branches/branch-prefetch";
import {prefetchPartyFormData} from "@/features/master-data/parties/party-form-prefetch";
import {queryKeys} from "@/lib/query/query-keys";

type Call={table:string;columns?:string;count?:string;filters:[string,unknown][];order:string[];from?:number;to?:number;signal?:AbortSignal;retry?:boolean};
type Result={data:{id:number;[key:string]:unknown}[]|null;count:number|null;error:null|{message:string};status:number};
const state=vi.hoisted(()=>({calls:[] as Call[],reply:undefined as undefined|((call:Call)=>Promise<Result>),partyFailure:false}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({from:(table:string)=>{
 const call:Call={table,filters:[],order:[]};
 const b={
  select:(columns:string,options?:{count:string})=>{call.columns=columns;call.count=options?.count;return b;},
  retry:(value:boolean)=>{call.retry=value;return b;},order:(column:string)=>{call.order.push(column);return b;},
  eq:(column:string,value:unknown)=>{call.filters.push([column,value]);return b;},
  range:(from:number,to:number)=>{call.from=from;call.to=to;return b;},
  abortSignal:(signal:AbortSignal)=>{call.signal=signal;return b;},
  then:(resolve:(v:Result)=>unknown,reject:(e:unknown)=>unknown)=>{state.calls.push(call);if(!state.reply)throw Error("Unexpected test transport");return state.reply(call).then(resolve,reject);},
 };return b;
}})}));
vi.mock("@/server/actions/master-data/parties",()=>Object.fromEntries(["getPartyNatures","getPartyStatuses","getPartyTypes","getPartyLicenseTypes","getPartyLicenseStatuses","getPartyTaxStatuses","getPartyContactRoles","getPartyContactDepartments","getPartyAddressTypes","getPartyDocumentTypes","getPartyDocumentStatuses","getPaymentMethods"].map(name=>[name,async()=>state.partyFailure&&["getPartyNatures","getPartyStatuses"].includes(name)?{success:false,error:"PRIVATE ACTION DETAIL"}:{success:true,data:[]}])));
vi.mock("@/server/actions/master-data/party-notes",()=>({getPartyNoteTypes:async()=>({success:true,data:[]})}));
vi.mock("@/server/actions/master-data/party-service-categories",()=>({getServiceCategoriesForSelect:async()=>({success:true,data:[]})}));
const clients:QueryClient[]=[];
function cache(){const qc=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,staleTime:0,gcTime:60000}}});clients.push(qc);return qc;}
const empty=():Result=>({data:[],count:0,error:null,status:200});
beforeEach(()=>{state.calls=[];state.reply=async()=>empty();state.partyFailure=false;});
afterEach(()=>clients.splice(0).forEach(qc=>qc.clear()));
const definitions=[
 ["ownerCompanies","owner_companies","id,company_code,legal_name_en,legal_name_ar,short_name",null,null],
 ["branches","branches","id,branch_code,branch_name_en,branch_name_ar,owner_company_id","owner_company_id",null],
 ["costCenters","cost_centers","id,cost_center_code,cost_center_name_en,cost_center_name_ar,owner_company_id","owner_company_id",null],
 ["profitCenters","profit_centers","id,profit_center_code,profit_center_name_en,profit_center_name_ar,owner_company_id","owner_company_id",null],
 ["countries","countries","id,country_code,name_en,name_ar,is_gcc",null,"is_gcc"],
 ["emirates","emirates","id,emirate_code,name_en,name_ar","country_id",null],
 ["cities","cities","id,city_code,name_en,name_ar,emirate_id","emirate_id",null],
 ["areas","areas_zones","id,area_code,name_en,name_ar,city_id,area_type_code","city_id","area_type_code"],
 ["ports","ports","id,port_code,name_en,name_ar,emirate_id,port_type_code","emirate_id","port_type_code"],
] as const;
it.each(definitions)("%s uses only its exact lean source, every range signal and the same selected parent/filter",async(resource,table,columns,parent,filter)=>{
 const signal=new AbortController().signal,filterValue=filter==="is_gcc"?true:"TYPE";
 await fetchConfigurationChoices(resource,{parentId:7,filter:filterValue,selectedId:31},signal);
 expect(state.calls).toHaveLength(1);
 const call=state.calls[0];
 expect(call).toMatchObject({table,columns,count:"exact",from:0,to:499,signal,retry:false});
 expect(call.order.at(-1)).toBe("id");
 expect(call.filters).toEqual([...(parent?[[parent,7]]:[]),...(filter?[[filter,filterValue]]:[]),["id",31]]);
});
it.each(definitions)("%s rejects late-page failure rather than caching a complete-looking partial list",async resource=>{
 state.reply=async call=>call.from===0?{data:Array.from({length:500},(_,i)=>({id:i+1,active:false,amount:0})),count:501,error:null,status:200}:{data:null,count:null,error:{message:"PRIVATE DATABASE DETAIL"},status:503};
 await expect(fetchConfigurationChoices(resource)).rejects.toThrow("Choices could not be loaded");
 expect(state.calls).toHaveLength(2);
});
it("closed resources reject prototype names and invalid IDs before creating any query",async()=>{
 for(const resource of ["constructor","toString","private_table"])await expect(fetchConfigurationChoices(resource as ConfigurationResource)).rejects.toMatchObject({status:400});
 for(const selectedId of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])await expect(fetchConfigurationChoices("countries",{selectedId})).rejects.toMatchObject({status:400});
 expect(state.calls).toEqual([]);
});
it("shared country prefetch uses the exact complete collector and retains false/zero",async()=>{
 state.reply=async call=>({data:Array.from({length:Math.min(500,503-call.from!)},(_,i)=>({id:call.from!+i+1,is_gcc:false,amount:0})),count:503,error:null,status:200});
 const signal=new AbortController().signal,data=await fetchCountries(false,false,signal);
 expect(data).toHaveLength(503);expect(data[502]).toMatchObject({id:503,is_gcc:false,amount:0});
 expect(state.calls.every(call=>call.signal===signal&&call.count==="exact")).toBe(true);
});
it.each([["organization",ORGANIZATION_FORM_PREFETCH.masterQueries[0]],["branch",BRANCH_FORM_PREFETCH.masterQueries[0]]] as const)("%s descriptor forwards the exact AbortSignal",async(_name,descriptor)=>{
 const controller=new AbortController();
 await descriptor.queryFn(controller.signal);
 expect(state.calls[0].signal).toBe(controller.signal);
 controller.abort();
 await expect(descriptor.queryFn(controller.signal)).rejects.toMatchObject({name:"AbortError"});
 expect(state.calls).toHaveLength(1);
});
it("active party country descriptor forwards cancellation without weakening party nature/status failures",async()=>{
 const qc=cache();let finish!:(r:Result)=>void;
 state.partyFailure=true;
 state.reply=call=>call.table==="countries"?new Promise(resolve=>{finish=resolve;}):Promise.resolve(empty());
 const pending=prefetchPartyFormData(qc);
 await vi.waitFor(()=>expect(state.calls.some(call=>call.table==="countries")).toBe(true));
 const country=state.calls.find(call=>call.table==="countries")!;
 expect(country.signal).toBeInstanceOf(AbortSignal);
 await qc.cancelQueries({queryKey:queryKeys.countries(false,false),exact:true});
 expect(country.signal?.aborted).toBe(true);
 finish({data:[{id:1,name_en:"Late country"}],count:1,error:null,status:200});
 await pending;await Promise.resolve();
 expect(qc.getQueryData(queryKeys.countries(false,false))).toBeUndefined();
 expect(qc.getQueryState(["party_natures"])?.status).toBe("error");
 expect(qc.getQueryState(["party_statuses"])?.status).toBe("error");
 expect(qc.getQueryState(queryKeys.currencies(false))?.status).toBe("success");
});
it("master prefetch reports only successful siblings and never raw provider details",async()=>{
 const qc=cache(),receipt=await prefetchMasterDataQueries(qc,[
  {queryKey:["master","good"],queryFn:async()=>[1]},
  {queryKey:["master","bad"],queryFn:async()=>{throw Error("PRIVATE CREDENTIAL OR SQL DETAIL");}},
 ]);
 expect(receipt.prefetchedKeys).toEqual([["master","good"]]);expect(receipt.error).toBe("Choices failed");
 expect(JSON.stringify(receipt)).not.toContain("PRIVATE");expect(qc.getQueryData(["master","good"])).toEqual([1]);
});
it("master prefetch cancellation cannot perform a post-await reseed",async()=>{
 const qc=cache(),write=vi.spyOn(qc,"setQueryData");let signal!:AbortSignal,finish!:(v:number[])=>void;
 const pending=prefetchMasterDataQueries(qc,[{queryKey:["master","pending"],queryFn:s=>{signal=s!;return new Promise(resolve=>{finish=resolve;});}}]);
 expect(signal).toBeInstanceOf(AbortSignal);
 await qc.cancelQueries();qc.clear();finish([999]);
 const receipt=await pending;
 expect(signal.aborted).toBe(true);expect(receipt.error).not.toBeNull();
 expect(qc.getQueryCache().getAll()).toHaveLength(0);expect(write).not.toHaveBeenCalled();
});
it("preserves finance company-equality predicates; lawful global-parent completeness remains OPEN",async()=>{
 await fetchConfigurationChoices("costCenters",{parentId:7});
 await fetchConfigurationChoices("profitCenters",{parentId:7});
 for(const call of state.calls)expect(call.filters).toContainEqual(["owner_company_id",7]);
});
