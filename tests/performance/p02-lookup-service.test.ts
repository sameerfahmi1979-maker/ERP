import {beforeEach, expect, it, vi} from "vitest";
const state=vi.hoisted(()=>({auth:vi.fn(), permission:vi.fn(), client:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:state.auth,hasPermission:state.permission}));
vi.mock("@/lib/supabase/server",()=>({createClient:state.client}));
import {readLookupValues,readLookupBatch,readLookupSearch} from "@/server/reads/lookup-values";
const operations:Array<{table:string;method:string;args:unknown[]}>=[];
let responses:unknown[]=[];
beforeEach(()=>{
 operations.length=0; responses=[];vi.resetAllMocks();
 state.auth.mockResolvedValue({profile:{must_change_password:false},isAccountActive:true});
 state.permission.mockReturnValue(false);
 state.client.mockImplementation(async()=>({from:(table:string)=>{
  const builder:Record<string,unknown>={then:(resolve:(v:unknown)=>void)=>Promise.resolve(responses.shift()).then(resolve)};
  for(const method of ["select","eq","in","is","order","range","maybeSingle","ilike"])
   builder[method]=(...args:unknown[])=>{operations.push({table,method,args});return builder;};
  return builder;
 }}));
});
it("search uses bounded exact counts, literal wildcards, fixed locale column and unique tie breaker",async()=>{
 responses=[{data:{id:1,is_active:true},error:null},{data:[{id:2}],count:30,error:null}];
 const result=await readLookupSearch({categoryCode:"TEST",search:"_%",page:2,pageSize:25,language:"ar"});
 expect(result.success).toBe(true);expect(result.data?.totalCount).toBe(30);
 expect(operations).toContainEqual({table:"global_lookup_values",method:"range",args:[25,49]});
 expect(operations).toContainEqual({table:"global_lookup_values",method:"ilike",args:["value_label_ar","%\\_\\%%"]});
 expect(operations).toContainEqual({table:"global_lookup_values",method:"order",args:["id"]});
 expect((await readLookupSearch({categoryCode:"TEST",pageSize:101})).success).toBe(false);
});
it.each([{profile:null,isAccountActive:true},{profile:{},isAccountActive:false},{profile:{must_change_password:true},isAccountActive:true}])("rejects inactive, absent and forced-change identity before reading business rows",async context=>{
 state.auth.mockResolvedValue(context);expect((await readLookupValues({categoryCode:"TEST"})).error).toBe("Permission denied");expect(state.client).not.toHaveBeenCalled();
});
it("strictly rejects injected filter/category/selection options",async()=>{
 for(const input of [{categoryCode:"TEST",table:"user_profiles"},{categoryCode:"X;DROP"},{categoryCode:"TEST",selected:"NaN"},{categoryCode:"TEST",includeInactive:"true"}])expect((await readLookupValues(input)).success).toBe(false);
 expect(state.auth).not.toHaveBeenCalled();
});
it("never treats missing or RLS-hidden categories as a successful empty result",async()=>{
 responses=[{data:null,error:null}];expect((await readLookupValues({categoryCode:"TEST"})).success).toBe(false);
 responses=[{data:[{id:1,category_code:"A",is_active:true}],count:1,error:null}];expect((await readLookupBatch({categoryCodes:["A","B"]})).success).toBe(false);
});
it("keeps selected legacy values constrained to category, parent and user-scoped client",async()=>{
 responses=[{data:{id:1,is_active:true},error:null},{data:{id:7},error:null},{data:[{id:9}],count:1,error:null}];
 const result=await readLookupValues({categoryCode:"TEST",parentValueCode:"PARENT",selected:9,includeInactive:true});expect(result.success).toBe(true);
 expect(operations).toContainEqual({table:"global_lookup_values",method:"eq",args:["category_id",1]});
 expect(operations).toContainEqual({table:"global_lookup_values",method:"eq",args:["parent_value_id",7]});
 expect(operations).toContainEqual({table:"global_lookup_values",method:"eq",args:["id",9]});
 const projection=operations.filter(o=>o.method==="select").map(o=>String(o.args[0])).join(",");
 expect(projection).not.toMatch(/metadata|created_by|description|\*/);
});
it("includeInactive is not an administrative permission",async()=>{
 responses=[{data:{id:1,is_active:true},error:null},{data:[],count:0,error:null}];
 expect((await readLookupValues({categoryCode:"TEST",includeInactive:true})).success).toBe(true);
 expect(operations).toContainEqual({table:"global_lookup_values",method:"eq",args:["is_active",true]});
});
it("does not expose backend details and rejects over-limit configuration collections",async()=>{
 responses=[{data:{id:1,is_active:true},error:null},{data:[],count:5001,error:null}];
 expect((await readLookupValues({categoryCode:"TEST"})).success).toBe(false);
 responses=[{data:null,error:{message:"private SQL"}}];const result=await readLookupValues({categoryCode:"TEST"});expect(JSON.stringify(result)).not.toContain("private SQL");expect(result.success).toBe(false);
});
