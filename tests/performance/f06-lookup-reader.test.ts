// @vitest-environment node
// Offline: real reader/routes/permission helpers/collector; only live auth and
// protected client transport ports are controlled. No credentials or network.
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table:string; columns:string; exact:boolean; filters:[string,string,unknown][]; order:string[]; from:number; to:number; single:boolean; signal?:AbortSignal};
type Result = {data:Row[]|Row|null; count:number|null; error:unknown};
const state = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext, calls: [] as Call[],
  rows: {} as Record<string, Row[]>, auth: vi.fn(),
  fault: undefined as undefined | ((call:Call, result:Result) => Result | Promise<Result>),
  clients: vi.fn(), warn: vi.fn(),
}));
vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"),
  getAuthContext: state.auth,
}));
vi.mock("@/lib/logger", () => ({logger:{warn:state.warn}}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: state.clients,
}));
import {readLookupValues, readLookupBatch} from "@/server/reads/lookup-values";
import {POST as singlePOST, dynamic as singleDynamic} from "@/app/api/reads/lookup-values/route";
import {POST as batchPOST, dynamic as batchDynamic} from "@/app/api/reads/lookup-batch/route";

const categoryTable = "erp_lookup_category_choices", valueTable = "erp_lookup_value_choices";
function principal(global:string[] = [], scoped:string[] = []):AuthContext {
  return {profile:{id:1,auth_user_id:"synthetic-a",must_change_password:false}, email:null,
    accountStatus:"active",isAccountActive:true,roleCodes:[],permissionCodes:[...global,...scoped],
    globalPermissionCodes:global,
    roleAssignments:[{roleId:7,roleCode:"synthetic",ownerCompanyId:scoped.length?10:null,branchId:scoped.length?11:null,permissionCodes:[...global,...scoped]}],
  } as AuthContext;
}
const value = (id:number, category=1, parent:number|null=null):Row => ({
  id,category_id:category,value_code:"VALUE_"+id,value_label_en:"Synthetic "+id,value_label_ar:"تجريبي",
  color_hex:null,icon_name:null,badge_variant:null,sort_order:0,is_default:false,parent_value_id:parent,is_active:true,
  metadata_json:{private:"NEVER_PROJECT"},created_by:777,
});
function builder(table:string) {
  if (![categoryTable,valueTable].includes(table)) throw Error("Raw-table fallback is forbidden");
  const call:Call={table,columns:"",exact:false,filters:[],order:[],from:0,to:499,single:false};
  async function execute():Promise<Result> {
    state.calls.push(call);
    let rows = [...state.rows[table]];
    for (const [op,key,v] of call.filters) rows = rows.filter(row => op==="in" ? (v as unknown[]).includes(row[key]) : row[key]===v);
    rows.sort((a,b) => {
      for (const key of call.order) {
        const x=a[key], y=b[key];
        if (x===y) continue;
        return typeof x==="number"&&typeof y==="number" ? x-y : String(x).localeCompare(String(y));
      }
      return 0;
    });
    const projected=rows.map(row=>Object.fromEntries(call.columns.split(",").map(key=>[key,row[key]])));
    const result:Result={data:call.single ? projected[0]??null : projected.slice(call.from,call.to+1),count:call.exact?rows.length:null,error:null};
    return state.fault ? state.fault(call,result) : result;
  }
  const query = {
    select(columns:string, options?:{count?:string}) {call.columns=columns;call.exact=options?.count==="exact";return query;},
    eq(key:string,v:unknown) {call.filters.push(["eq",key,v]);return query;},
    is(key:string,v:unknown) {call.filters.push(["is",key,v]);return query;},
    in(key:string,v:unknown[]) {call.filters.push(["in",key,v]);return query;},
    order(key:string) {call.order.push(key);return query;},
    range(from:number,to:number) {call.from=from;call.to=to;return query;},
    abortSignal(signal:AbortSignal) {call.signal=signal;return query;},
    maybeSingle() {call.single=true;return execute();},
    then(resolve:(r:Result)=>unknown,reject:(e:unknown)=>unknown) {return execute().then(resolve,reject);},
  };
  return query;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.ctx=principal();state.calls=[];
  state.rows={[categoryTable]:[{id:1,category_code:"TEST",is_active:true}],[valueTable]:[value(1)]};
  state.fault=undefined;
  state.auth.mockImplementation(async()=>state.ctx);
  state.clients.mockImplementation(async()=>({from:builder}));
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("No network allowed in L0 tests");}));
});
afterEach(()=>vi.unstubAllGlobals());
const valuesCall=()=>state.calls.find(call=>call.table===valueTable&&call.exact)!;
const request=(input:unknown,signal?:AbortSignal)=>new Request("https://synthetic.invalid/api/reads/lookup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input),signal});
function privateHeaders(response:Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Vary")).toBe("Cookie");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("X-ERP-Correlation")).toMatch(/^[a-f0-9-]{36}$/);
}

it("loads only fixed choice-view projections, with normalized category and stable exact pages",async()=>{
  const result=await readLookupValues({categoryCode:" test "});
  expect(result.success).toBe(true);expect(result.data?.[0]).toMatchObject({id:1,sort_order:0,is_default:false});
  expect(result.data?.[0]).not.toHaveProperty("metadata_json");
  expect(result.data?.[0]).not.toHaveProperty("created_by");
  expect(state.calls.map(c=>c.table)).toEqual([categoryTable,valueTable]);
  expect(state.calls[0].filters).toEqual([["eq","category_code","TEST"]]);
  expect(valuesCall()).toMatchObject({exact:true,from:0,to:499,order:["sort_order","value_label_en","id"]});
  expect(valuesCall().filters).toEqual([["eq","category_id",1],["is","parent_value_id",null],["eq","is_active",true]]);
  expect(state.auth).toHaveBeenCalledOnce();
});
it.each(["master_data.lookups.view","master_data.lookups.manage","master_data.lookups.lock"])("only exact-global %s enables inactive catalogue reads",async permission=>{
  state.ctx=principal([permission]);
  expect((await readLookupValues({categoryCode:"TEST",includeInactive:true})).success).toBe(true);
  expect(valuesCall().filters).not.toContainEqual(["eq","is_active",true]);
  state.calls=[];state.ctx=principal([], [permission]);
  await readLookupValues({categoryCode:"TEST",includeInactive:true});
  expect(valuesCall().filters).toContainEqual(["eq","is_active",true]);
});
it("accepts an explicit global administrator, not a company-assigned admin role",async()=>{
  state.ctx=principal();state.ctx.roleCodes=["system_admin"];
  state.ctx.roleAssignments![0].roleCode="system_admin";
  await readLookupBatch({categoryCodes:["TEST"],includeInactive:true});
  expect(valuesCall().filters).not.toContainEqual(["eq","is_active",true]);
  state.calls=[];state.ctx.roleAssignments![0].ownerCompanyId=10;
  await readLookupBatch({categoryCodes:["TEST"],includeInactive:true});
  expect(valuesCall().filters).toContainEqual(["eq","is_active",true]);
});
it.each(["none","inactive","suspended","forced"] as const)("rejects %s principals before opening the choice client",async kind=>{
  if(kind==="none")state.ctx.profile=null;
  else if(kind==="forced")state.ctx.profile!.must_change_password=true;
  else {state.ctx.accountStatus=kind;state.ctx.isAccountActive=false;}
  expect(await readLookupValues({categoryCode:"TEST"})).toEqual({success:false,error:"Permission denied"});
  expect(await readLookupBatch({categoryCodes:["TEST"]})).toEqual({success:false,error:"Permission denied"});
  expect(state.clients).not.toHaveBeenCalled();
});
it("reloads authority on every read after grant revocation instead of trusting old context",async()=>{
  state.ctx=principal(["master_data.lookups.manage"]);
  await readLookupValues({categoryCode:"TEST",includeInactive:true});
  expect(valuesCall().filters).not.toContainEqual(["eq","is_active",true]);
  state.calls=[];state.ctx=principal();
  await readLookupValues({categoryCode:"TEST",includeInactive:true});
  expect(valuesCall().filters).toContainEqual(["eq","is_active",true]);
  expect(state.auth).toHaveBeenCalledTimes(2);
});
it.each([
  {categoryCode:"TEST",actor:1},{categoryCode:"TEST",context:{globalPermissionCodes:["master_data.lookups.manage"]}},
  {categoryCode:"TEST",table:"global_lookup_values"},{categoryCode:"TEST",selected:0},
  {categoryCode:"TEST",selected:Number.MAX_SAFE_INTEGER+1},{categoryCode:"TEST",selected:"1.2"},
  {categoryCode:"TEST",selected:"VALUE",valueField:"id"},{categoryCode:"TEST",parentValueCode:"bad,filter"},
])("rejects unsafe input before auth/client work: %j",async input=>{
  expect((await readLookupValues(input)).error).toBe("Invalid lookup parameters");
  expect(state.auth).not.toHaveBeenCalled();expect(state.clients).not.toHaveBeenCalled();
});
it("preserves category, parent and selected-code predicates without raw fallback",async()=>{
  state.rows[valueTable]=[value(8),{...value(9,1,8),value_code:"LEGACY",is_active:false},value(10,2,8)];
  state.ctx=principal(["master_data.lookups.view"]);
  const signal=new AbortController().signal;
  const result=await readLookupValues({categoryCode:"TEST",parentValueCode:" value_8 ",selected:" legacy ",valueField:"code"},signal);
  expect(result.data?.map(r=>r.id)).toEqual([9]);
  expect(valuesCall().filters).toEqual([["eq","category_id",1],["eq","parent_value_id",8],["eq","value_code","LEGACY"]]);
  expect(state.calls.every(call=>call.signal===signal)).toBe(true);
  state.rows[valueTable]=[];state.calls=[];state.ctx=principal();
  const unavailable=await readLookupValues({categoryCode:"TEST",selected:9});
  expect(unavailable).toEqual({success:true,data:[]});
  expect(state.calls.every(call=>[categoryTable,valueTable].includes(call.table))).toBe(true);
});
it("does not treat an unknown/hidden category or parent as a verified empty catalogue",async()=>{
  state.rows[categoryTable]=[];
  expect((await readLookupValues({categoryCode:"TEST"})).success).toBe(false);
  state.rows[categoryTable]=[{id:1,category_code:"TEST",is_active:true}];
  expect((await readLookupValues({categoryCode:"TEST",parentValueCode:"HIDDEN"})).success).toBe(false);
  state.rows[valueTable]=[];
  expect(await readLookupValues({categoryCode:"TEST"})).toEqual({success:true,data:[]});
});
it("batch requires every requested code and permits truthful empty visible categories",async()=>{
  expect((await readLookupBatch({categoryCodes:["TEST","HIDDEN"]})).success).toBe(false);
  state.rows[categoryTable].push({id:2,category_code:"EMPTY",is_active:true});
  const result=await readLookupBatch({categoryCodes:[" test ","TEST","EMPTY"]});
  expect(result.data?.TEST.map(row=>row.id)).toEqual([1]);expect(result.data?.EMPTY).toEqual([]);
  expect(valuesCall().filters).toContainEqual(["is","parent_value_id",null]);
});
it("loads 1107 rows completely in single and batch resources",async()=>{
  state.rows[valueTable]=Array.from({length:1107},(_,i)=>value(i+1));
  for(const run of [()=>readLookupValues({categoryCode:"TEST"}),()=>readLookupBatch({categoryCodes:["TEST"]})]){
    state.calls=[];
    const result=await run();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)?result.data:(result.data as Record<string,unknown[]>).TEST).toHaveLength(1107);
    expect(state.calls.filter(c=>c.table===valueTable).map(c=>[c.from,c.to])).toEqual([[0,499],[500,999],[1000,1499]]);
  }
});
it.each(["missing-count","changing-count","short-page","duplicate","late-error"] as const)("rejects %s without returning partial rows or provider diagnostics",async fault=>{
  state.rows[valueTable]=Array.from({length:1107},(_,i)=>value(i+1));
  state.fault=(call,result)=>{
    if(call.table!==valueTable)return result;
    if(fault==="missing-count")return {...result,count:null};
    if(fault==="short-page")return {...result,data:(result.data as Row[]).slice(0,2)};
    if(call.from===500){
      if(fault==="changing-count")return {...result,count:1108};
      if(fault==="duplicate")return {...result,data:[(state.rows[valueTable][0]),...(result.data as Row[]).slice(1)]};
      if(fault==="late-error")return {data:null,count:null,error:{message:"SYNTHETIC_PRIVATE_DATABASE_ERROR"}};
    }
    return result;
  };
  const result=await readLookupValues({categoryCode:"TEST"});
  expect(result.success).toBe(false);expect(result.data).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
});
it("aborts before auth and after a page even when the synthetic transport ignores abort",async()=>{
  const before=new AbortController();before.abort();
  expect((await readLookupValues({categoryCode:"TEST"},before.signal)).success).toBe(false);
  expect(state.auth).not.toHaveBeenCalled();
  const controller=new AbortController();
  state.rows[valueTable]=Array.from({length:1107},(_,i)=>value(i+1));
  state.fault=(call,result)=>{if(call.table===valueTable)controller.abort();return result;};
  expect((await readLookupValues({categoryCode:"TEST"},controller.signal)).success).toBe(false);
  expect(state.calls.filter(c=>c.table===valueTable)).toHaveLength(1);
  expect(state.calls.every(c=>c.signal===controller.signal)).toBe(true);
});
it.each([[singlePOST,{categoryCode:"TEST"}],[batchPOST,{categoryCodes:["TEST"]}]] as const)("actual POST route uses private headers, caller authority and cancellation",async(route,input)=>{
  expect(singleDynamic).toBe("force-dynamic");expect(batchDynamic).toBe("force-dynamic");
  const controller=new AbortController(), req=request(input,controller.signal), response=await route(req);
  privateHeaders(response);expect(response.status).toBe(200);
  expect(state.calls.every(call=>call.signal===req.signal)).toBe(true);
  state.ctx.profile=null;
  const denied=await route(request(input));privateHeaders(denied);expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({success:false,error:"Permission denied"});
});
it("route validation and exceptions never disclose input or provider errors",async()=>{
  const invalid=await singlePOST(request({categoryCode:"TEST",secret:"SYNTHETIC_PRIVATE_INPUT"}));
  privateHeaders(invalid);expect(invalid.status).toBe(400);expect(state.auth).not.toHaveBeenCalled();
  state.auth.mockRejectedValue(Error("SYNTHETIC_PRIVATE_AUTH"));
  const failed=await singlePOST(request({categoryCode:"TEST"}));
  privateHeaders(failed);expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("SYNTHETIC_PRIVATE");
  expect(JSON.stringify(state.warn.mock.calls)).not.toContain("SYNTHETIC_PRIVATE");
});

it.each(["categories","values"] as const)("batch cancellation during %s stops before any partial result escapes",async phase=>{
  const controller=new AbortController();
  state.rows[valueTable]=Array.from({length:1107},(_,i)=>value(i+1));
  state.fault=(call,result)=>{
    if(call.table===(phase==="categories"?categoryTable:valueTable))controller.abort();
    return result;
  };
  const result=await readLookupBatch({categoryCodes:["TEST"]},controller.signal);
  expect(result.success).toBe(false);expect(result.data).toBeUndefined();
  expect(state.calls.every(call=>call.signal===controller.signal)).toBe(true);
  expect(state.calls.filter(call=>call.table===valueTable)).toHaveLength(phase==="categories"?0:1);
});

it("batch late-page failure cannot return a partially completed category map",async()=>{
  state.rows[valueTable]=Array.from({length:1107},(_,i)=>value(i+1));
  state.fault=(call,result)=>call.table===valueTable&&call.from===500
    ? {data:null,count:null,error:{message:"SYNTHETIC_PRIVATE_LATE_ERROR"}}:result;
  const result=await readLookupBatch({categoryCodes:["TEST"]});
  expect(result.success).toBe(false);expect(result.data).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
});
