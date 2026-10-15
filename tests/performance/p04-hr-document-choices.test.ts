import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({allow:true,subject:true,dependent:true,manage:true,flag:true,admin:true,fail:false,short:false,rangeError:false,links:[] as {id:number;document_id:number}[],rows:[] as Record<string,unknown>[],calls:[] as {table:string;projection?:string;head?:boolean;filters:unknown[][];orders:string[];from?:number;to?:number}[]}));
vi.mock("@/server/reads/read-context",()=>({getReadAuthContext:async()=>({})}));
vi.mock("@/lib/rbac/scope",()=>({hasPermission:()=>state.allow,isGlobalAdmin:()=>state.admin}));
vi.mock("@/server/reads/hr-subject-access",()=>({hrSubjectPermission:async()=>state.manage}));
vi.mock("@/lib/hr/ai/feature-flags",()=>({isHrAiFeatureEnabled:async()=>state.flag}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const call:typeof state.calls[number]={table,filters:[],orders:[]};state.calls.push(call);
 const q={select:(projection:string,options?:{head?:boolean})=>{call.projection=projection;call.head=options?.head;return q;},
 eq:(...args:unknown[])=>{call.filters.push(["eq",...args]);return q;},is:(...args:unknown[])=>{call.filters.push(["is",...args]);return q;},neq:(...args:unknown[])=>{call.filters.push(["neq",...args]);return q;},or:(...args:unknown[])=>{call.filters.push(["or",...args]);return q;},not:(...args:unknown[])=>{call.filters.push(["not",...args]);return q;},order:(column:string)=>{call.orders.push(column);return q;},limit:(...args:unknown[])=>{call.filters.push(["limit",...args]);return q;},abortSignal:()=>q,maybeSingle:()=>q,range:(from:number,to:number)=>{call.from=from;call.to=to;return q;},then:(resolve:(r:unknown)=>unknown)=>{
  const parent=table!=="dms_documents";
  const r=table==="dms_document_links"?{data:state.links.slice(call.from,call.to!+1),count:state.links.length,error:null}:parent?{data:(table==="employees"?state.subject:state.dependent)?{id:7}:null,error:null}:state.rangeError&&!call.head?{error:{code:"PGRST103"},status:416,count:null,data:null}:{data:call.head?null:state.rows.slice(call.from,call.to!+1-(state.short?1:0)),count:state.rows.length,error:state.fail?{}:null,status:200};return Promise.resolve(r).then(resolve);
 }};return q;
}})}));
import {readHrDocumentChoices} from "@/server/reads/hr-document-choices";
const row=(id:number)=>({id,title:`Synthetic ${id}`,document_no:`TEST-${id}`,status:"active",issue_date:null,expiry_date:null,document_type:{type_code:"TEST",name_en:"Synthetic type"},employee_link:[],extraction:[],ocr:[]});
beforeEach(()=>{Object.assign(state,{allow:true,subject:true,dependent:true,manage:true,flag:true,admin:true,fail:false,short:false,rangeError:false,links:[],rows:Array.from({length:1111},(_,i)=>row(i+1)),calls:[]});});
it("retrieves later pages rather than truncating choices at 50/60",async()=>{
 const r=await readHrDocumentChoices({employeeId:7,mode:"library",page:23});expect(r.success).toBe(true);expect(r.data?.totalCount).toBe(1111);expect(r.data?.rows.map(d=>d.id)).toEqual(Array.from({length:11},(_,i)=>1101+i));
 const call=state.calls.at(-1)!;expect(call).toMatchObject({from:1100,to:1149,orders:["created_at","id"]});expect(state.calls.some(c=>c.table==="dms_document_links")).toBe(true);expect(call.projection).not.toMatch(/extracted_fields|ocr_text|file_path|storage/);
});
it("validates native counts and rejects truncated pages and errors",async()=>{
 state.short=true;expect((await readHrDocumentChoices({employeeId:7,mode:"library"})).success).toBe(false);state.short=false;state.fail=true;expect((await readHrDocumentChoices({employeeId:7,mode:"library"})).success).toBe(false);
});
it("verifies beyond-end counts independently",async()=>{
 state.rangeError=true;const r=await readHrDocumentChoices({employeeId:7,mode:"library",page:24});expect(r.success).toBe(true);expect(r.data).toMatchObject({totalCount:1111,rows:[]});expect(state.calls.at(-1)?.head).toBe(true);
 expect((await readHrDocumentChoices({employeeId:7,mode:"library",page:2})).success).toBe(false);
});
it.each(["allow","subject","manage"]as const)("denies %s before reading any document",async field=>{
 state[field]=false;expect(await readHrDocumentChoices({employeeId:7,mode:"library"})).toEqual({success:false,error:"Permission denied"});expect(state.calls.some(c=>c.table==="dms_documents")).toBe(false);
});
it("binds an existing dependent to the requested employee",async()=>{
 state.dependent=false;expect((await readHrDocumentChoices({employeeId:7,target:"dependent",dependentId:99,mode:"library"})).success).toBe(false);expect(state.calls.at(-1)?.filters).toContainEqual(["eq","employee_id",7]);
});
it("a new dependent does not wrongly exclude all employee-linked documents",async()=>{
 const r=await readHrDocumentChoices({employeeId:7,target:"dependent",mode:"library"});expect(r.success).toBe(true);expect(state.calls.some(c=>c.table==="dms_document_links")).toBe(false);
});
it("wizard retains linked metadata and excludes archived documents",async()=>{
 state.links=[{id:9,document_id:1}];state.rows=[{...row(1),employee_link:[{id:9}],extraction:[{id:4}],ocr:[{id:5}]}];const r=await readHrDocumentChoices({employeeId:7,mode:"wizard"});expect(r.data?.rows[0]).toMatchObject({has_extraction:true,has_ocr:true,is_linked_to_employee:true,extracted_person_name:null});expect(state.calls.at(-1)?.filters).toContainEqual(["neq","status","archived"]);
});
it("non-admin wizard callers require its feature flag",async()=>{
 state.admin=false;state.flag=false;expect(await readHrDocumentChoices({employeeId:7,mode:"wizard"})).toEqual({success:false,error:"Permission denied"});
});
it("rejects invalid subjects and arbitrary query parameters",async()=>{
 for(const p of [{employeeId:0,mode:"library"},{employeeId:7,mode:"library",pageSize:5000},{employeeId:7,mode:"library",table:"user_profiles"}])expect((await readHrDocumentChoices(p)).success).toBe(false);expect(state.calls).toHaveLength(0);
});
