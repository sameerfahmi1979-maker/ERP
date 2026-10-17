import {beforeEach,expect,it,vi} from "vitest";
type Result={data:unknown;count:number|null;error:unknown};
const state=vi.hoisted(()=>({allowed:true,active:true,forced:false,results:[] as Result[],calls:[] as {table:string;ops:[string,unknown[]][]}[],response:undefined as undefined|((call:{table:string;ops:[string,unknown[]][]})=>Result)}));
vi.mock("@/lib/rbac/check",()=>({hasPermission:(_ctx:unknown,p:string)=>state.allowed&&p==="dms.documents.view",getAuthContext:async()=>({profile:{id:1,must_change_password:state.forced},isAccountActive:state.active,roleCodes:[]})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const call={table,ops:[] as [string,unknown[]][]};state.calls.push(call);
 const chain=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(result:unknown)=>unknown)=>Promise.resolve(state.response?.(call)??state.results.shift()??{data:null,count:null,error:{message:"private failure"}}).then(resolve):(...args:unknown[])=>{call.ops.push([String(key),args]);return chain;}});return chain;
}})}));
import {readDmsArchivePage,readAllDmsArchive} from "@/server/reads/dms-archive";
import {POST} from "@/app/api/reads/dms-archive/route";
const row=(id=1)=>({id,document_no:`TEST-${id}`,legacy_document_code:null,title:"Synthetic archive",description:null,document_type_id:1,category_id:1,status:"superseded",confidentiality_level:"company",owner_user_id:null,owning_company_id:1,owning_branch_id:1,party_id:null,issue_date:null,expiry_date:null,reminder_policy_id:null,ocr_status:"pending",ai_status:"pending",review_status:"pending",is_archived:true,archived_at:null,created_by:1,created_at:"2026-10-01",updated_by:null,updated_at:"2026-10-01",deleted_at:null,superseded_by_document_id:null as number|null,document_type:null,category:null,tags:[]});
beforeEach(()=>{state.allowed=true;state.active=true;state.forced=false;state.results=[];state.calls=[];state.response=undefined;});
it("uses the existing protected document client and only this page's replacements",async()=>{
 state.results=[{data:[{...row(),superseded_by_document_id:2}],count:1,error:null},{data:[{id:2,document_no:"TEST-2",title:"Permitted replacement"}],count:1,error:null}];
 const result=await readDmsArchivePage();expect(result.success).toBe(true);expect(result.data?.rows[0].superseded_by?.id).toBe(2);
 expect(state.calls.map(c=>c.table)).toEqual(["dms_documents","dms_documents"]);
 expect(state.calls[0].ops).toContainEqual(["in",["status",["archived","superseded"]]]);
 expect(state.calls[0].ops).toContainEqual(["or",["confidentiality_level.in.(internal,company),owner_user_id.eq.1,created_by.eq.1"]]);
 expect(state.calls[1].ops).toContainEqual(["in",["id",[2]]]);expect(state.calls[1].ops).toContainEqual(["range",[0,0]]);
});
it("accepts empty, past-last-page, exact partial tails and hidden replacements",async()=>{
 for(const input of [{},{page:2}]){state.results=[{data:[],count:0,error:null}];expect((await readDmsArchivePage(input)).data?.rows).toEqual([]);}
 state.results=[{data:Array.from({length:7},(_,i)=>row(i+1101)),count:1107,error:null}];expect((await readDmsArchivePage({page:45})).data?.rows).toHaveLength(7);
 state.results=[{data:[{...row(),superseded_by_document_id:2}],count:1,error:null},{data:[],count:0,error:null}];expect((await readDmsArchivePage()).data?.rows[0].superseded_by).toBeNull();
});
it.each([null,{},[{id:1}],"not an array"] as unknown[])("rejects malformed parent shape: %j",async data=>{
 state.results=[{data,count:1,error:null}];expect((await readDmsArchivePage()).success).toBe(false);expect(state.calls).toHaveLength(1);
});
it.each([{data:[row()],count:1107},{data:[row(),row()],count:2},{data:[row()],count:0},{data:[],count:1},{data:[row()],count:null},{data:[],count:-1},{data:[],count:1.5}])("rejects partial, duplicate or inconsistent counted rows: %j",async result=>{
 state.results=[{...result,error:null}];const r=await readDmsArchivePage();expect(r.success).toBe(false);expect(r.data).toBeUndefined();
});
it.each([{data:[{id:2}],count:1,error:null},{data:[],count:1,error:null},{data:[{id:3,document_no:"OTHER",title:"Unrequested"}],count:1,error:null},{data:[{id:2,document_no:"TEST",title:"Replacement"},{id:2,document_no:"TEST",title:"Replacement"}],count:2,error:null},{data:null,count:null,error:{message:"private provider error"}}])("rejects malformed, unrequested, duplicated or partial replacements",async linked=>{
 state.results=[{data:[{...row(),superseded_by_document_id:2}],count:1,error:null},linked];const result=await readDmsArchivePage();expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(result.error).not.toContain("private");
});
it("denies inactive, forced-password and unauthorized accounts without reading",async()=>{
 state.active=false;expect((await readDmsArchivePage()).success).toBe(false);state.active=true;state.forced=true;expect((await readDmsArchivePage()).success).toBe(false);state.forced=false;state.allowed=false;expect((await readDmsArchivePage()).success).toBe(false);expect(state.calls).toEqual([]);
});
it.each([{pageSize:101},{page:0},{sortKey:"secret"},{companyId:1},{columnFilters:{unknown:"x"}},{search:"x".repeat(201)}])("rejects unsupported criteria: %j",async params=>{
 expect((await readDmsArchivePage(params)).success).toBe(false);expect(state.calls).toEqual([]);
});
it("applies search, reason and identity filters before a stable bounded page",async()=>{
 state.results=[{data:[],count:0,error:null}];const r=await readDmsArchivePage({search:"test",reason:"renewed",documentTypeId:2,categoryId:3,page:2,pageSize:25,sortKey:"title",sortDir:"asc",columnFilters:{document_no:"ABC",title:"title"}});
 expect(r.success).toBe(true);expect(state.calls[0].ops).toEqual(expect.arrayContaining([["in",["status",["superseded"]]],["eq",["document_type_id",2]],["eq",["category_id",3]],["order",["title",{ascending:true,nullsFirst:false}]],["order",["id",{ascending:true}]],["range",[25,49]]]));
});
it("traverses 1,107 synthetic rows once in bounded pages without changing compatibility scope",async()=>{
 state.response=call=>{const [from,to]=call.ops.find(([op])=>op==="range")![1] as number[];return {data:Array.from({length:Math.min(to-from+1,Math.max(0,1107-from))},(_,i)=>row(from+i+1)),count:1107,error:null};};
 const result=await readAllDmsArchive();expect(result.success).toBe(true);expect(result.data).toHaveLength(1107);expect(new Set(result.data?.map(r=>r.id)).size).toBe(1107);expect(state.calls).toHaveLength(12);
});
it("actual archive endpoint is private and distinguishes invalid, denied, unavailable and empty",async()=>{
 const request=(body:string)=>new Request("http://localhost/api/reads/dms-archive",{method:"POST",headers:{"content-type":"application/json"},body});
 state.allowed=false;const denied=await POST(request("{}"));expect(denied.status).toBe(403);expect(denied.headers.get("Cache-Control")).toContain("no-store");expect(denied.headers.get("Vary")).toBe("Cookie");expect(state.calls).toEqual([]);
 state.allowed=true;expect((await POST(request('{"pageSize":101}'))).status).toBe(400);expect(state.calls).toEqual([]);
 state.results=[{data:null,count:null,error:{message:"private SQL diagnostic"}}];const unavailable=await POST(request("{}"));expect(unavailable.status).toBe(503);expect(await unavailable.text()).not.toContain("private SQL");
 state.results=[{data:[],count:0,error:null}];const empty=await POST(request("{}"));expect(empty.status).toBe(200);expect((await empty.json()).data.totalCount).toBe(0);
});
