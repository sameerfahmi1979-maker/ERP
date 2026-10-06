import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({auth:vi.fn(),permission:vi.fn(),browse:vi.fn(),client:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:state.auth,hasPermission:state.permission}));
vi.mock("@/lib/rbac/employee-access",()=>({canBrowseEmployees:state.browse}));
vi.mock("@/lib/supabase/server",()=>({createClient:state.client}));
import {readEmployees} from "@/server/reads/employees";
import {readDepartments} from "@/server/reads/departments";
import {readEmployeeFilterOptions} from "@/server/reads/employee-filter-options";
import {readDmsDocumentPage,readAllDmsDocuments} from "@/server/reads/dms-documents";
import {POST as employeeRoute} from "@/app/api/reads/employees/route";
const operations:Array<{table:string;method:string;args:unknown[]}>=[];
let responses:unknown[]=[];
function builderFor(table:string){
 const builder:Record<string,unknown>={then:(resolve:(v:unknown)=>void)=>Promise.resolve(responses.shift()).then(resolve)};
 for(const method of ["select","eq","in","is","not","order","range","or","ilike","textSearch","gte","lte","lt","gt","returns"])
  builder[method]=(...args:unknown[])=>{operations.push({table,method,args});return builder;};return builder;
}
beforeEach(()=>{
 operations.length=0;responses=[];vi.resetAllMocks();
 state.auth.mockResolvedValue({profile:{id:1},isAccountActive:true,roleCodes:[]});state.permission.mockReturnValue(true);state.browse.mockReturnValue(true);
 state.client.mockImplementation(async()=>({from:builderFor,rpc:(name:string,...args:unknown[])=>{operations.push({table:name,method:"rpc",args});return builderFor(name);}}));
});
it.each([0,101,-1,1.5])("rejects invalid page size %s before business reads",async pageSize=>{
 expect((await readEmployees({pageSize})).success).toBe(false);
 expect((await readDmsDocumentPage({pageSize})).success).toBe(false);expect(state.client).not.toHaveBeenCalled();
});
it("rejects arbitrary columns and injected filters",async()=>{
 for(const input of [{sortKey:"private_sql"},{owner:"any"},{filters:{sql:"true"}}])expect((await readDmsDocumentPage(input)).success).toBe(false);
 expect((await readEmployeeFilterOptions("departments",{table:"roles"})).success).toBe(false);
});
it("employee sort/filter/search/count is before page range and never selects medical columns",async()=>{
 responses=[{data:[{id:26}],count:26,error:null}];
 const r=await readEmployees({page:2,search:'_%"',ownerCompanyId:3,departmentId:4,sortKey:"department",sortDir:"desc"});
 expect(r.data?.totalCount).toBe(26);expect(r.data?.rows[0].blood_group).toBeNull();
 expect(operations).toContainEqual({table:"employees",method:"eq",args:["owner_company_id",3]});
 expect(operations).toContainEqual({table:"employees",method:"range",args:[25,49]});
 expect(operations).toContainEqual({table:"employees",method:"order",args:["department(department_name_en)",{ascending:false,nullsFirst:false}]});
 expect(String(operations.find(o=>o.method==="select")?.args[0])).not.toMatch(/blood_group|bank|salary/);
 expect(String(operations.find(o=>o.method==="or")?.args[0])).toContain('\\\\_');
});
it.each([readEmployees,readDepartments,readDmsDocumentPage])("fails denied business reads before querying",async reader=>{
 state.permission.mockReturnValue(false);state.browse.mockReturnValue(false);
 expect((await reader({})).error).toBe("Permission denied");expect(state.client).not.toHaveBeenCalled();
});
it("selected inactive choices remain bounded to their company and department",async()=>{
 responses=[{data:[{id:7,name:"Old",code:"OLD",is_active:false}],count:1,error:null}];
 const r=await readEmployeeFilterOptions("designations",{selectedId:7,owner_company_id:1,department_id:3});
 expect(r.data?.[0].label).toBe("Old (inactive)");
 for(const [column,value]of [["owner_company_id",1],["department_id",3]])expect(operations).toContainEqual({table:"designations",method:"eq",args:[column,value]});
 expect(operations).toContainEqual({table:"designations",method:"or",args:["is_active.eq.true,id.eq.7"]});
});
it.each(["companies","countries"] as const)("minimal %s choices retain permitted selected inactive row",async kind=>{
 responses=[{data:[{id:7,name:"Old",code:"OLD",is_active:false,status:"inactive"}],count:1,error:null}];
 expect((await readEmployeeFilterOptions(kind,{selectedId:7})).data?.[0].label).toContain("inactive");
 expect(String(operations.find(o=>o.method==="select")?.args[0])).not.toContain("*");
});
it("department collection is complete, bounded and fails rather than claiming an empty result",async()=>{
 responses=[{data:Array.from({length:500},(_,id)=>({id})),count:501,error:null},{data:[{id:500}],count:501,error:null}];
 expect((await readDepartments()).data).toHaveLength(501);
 responses=[{data:[],count:1001,error:null}];expect((await readDepartments()).success).toBe(false);
 responses=[{data:[],count:null,error:{message:"secret"}}];const r=await readDepartments();expect(r.success).toBe(false);expect(r.error).not.toContain("secret");
});
it("DMS combined filters and unique full-result order survive paging",async()=>{
 responses=[{data:[{id:26}],count:26,error:null}];
 const r=await readDmsDocumentPage({page:2,sortKey:"title",sortDir:"asc",filters:{excludeArchived:true,category_id:4,document_type_id:8,confidentiality:"company",expiry_from:"2026-01-01"}});
 expect(r.data?.totalCount).toBe(26);
 expect(operations).toContainEqual({table:"dms_documents",method:"not",args:["status","in",'("archived","superseded")']});
 expect(operations).toContainEqual({table:"dms_documents",method:"order",args:["id",{ascending:true}]});
 expect(operations).toContainEqual({table:"dms_documents",method:"range",args:[25,49]});
 expect(String(operations.find(o=>o.method==="select")?.args[0])).not.toMatch(/content_tsv|summary_embedding|ai_summary/);
});
it("content lookup failure cannot be relabelled an empty document result",async()=>{
 responses=[{data:null,count:null,error:{message:"private SQL"}}];const r=await readDmsDocumentPage({filters:{search:"test",searchMode:"content"}});
 expect(r.success).toBe(false);expect(r.error).not.toContain("private SQL");
});
it("compatibility consumers receive all pages, not just the visible 25",async()=>{
 responses=[{data:Array.from({length:100},(_,id)=>({id})),count:101,error:null},{data:[{id:100}],count:101,error:null}];
 expect((await readAllDmsDocuments()).data).toHaveLength(101);
 expect(operations.filter(o=>o.method==="range").map(o=>o.args)).toEqual([[0,99],[100,199]]);
});
it("changing counts or duplicate records abort full-result compatibility",async()=>{
 responses=[{data:Array.from({length:100},(_,id)=>({id})),count:101,error:null},{data:[{id:1}],count:101,error:null}];expect((await readAllDmsDocuments()).success).toBe(false);
});
it("endpoint is private, strict and safe on denied access",async()=>{
 state.browse.mockReturnValue(false);
 const r=await employeeRoute(new Request("http://localhost/api/reads/employees",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}));
 expect(r.status).toBe(403);expect(r.headers.get("Cache-Control")).toContain("no-store");
});

it.each([null,-1,1.5,NaN])("rejects invalid exact counts %s",async count=>{
 responses=[{data:[],count,error:null}];expect((await readEmployees({})).success).toBe(false);
 responses=[{data:[],count,error:null}];expect((await readDmsDocumentPage({})).success).toBe(false);
});
it("rejects truncated page success",async()=>{
 responses=[{data:[{id:1}],count:100,error:null}];expect((await readEmployees({})).success).toBe(false);
 responses=[{data:[{id:1}],count:100,error:null}];expect((await readDmsDocumentPage({})).success).toBe(false);
});
it("rejects duplicate document identities even when the page count is exact",async()=>{
 responses=[{data:[{id:1},{id:1}],count:2,error:null}];
 expect((await readDmsDocumentPage({})).success).toBe(false);
});
it("file/content existence filters stay in the database and strip child metadata",async()=>{
 responses=[{data:[{id:1,content_match:[{document_id:1}],perf_document_has_files:true,perf_document_has_extracted_text:true}],count:1,error:null}];
 const r=await readDmsDocumentPage({filters:{hasExtractedText:true,has_files:true}});
 expect(r.success).toBe(true);expect(r.data?.rows).toEqual([{id:1}]);
 expect(operations.every(o=>o.table==="dms_documents")).toBe(true);
 expect(operations).toContainEqual({table:"dms_documents",method:"eq",args:["perf_document_has_extracted_text",true]});
 expect(operations).toContainEqual({table:"dms_documents",method:"eq",args:["perf_document_has_files",true]});
});
it("missing extracted text is the complement of non-null extracted text",async()=>{
 responses=[{data:[],count:0,error:null}];expect((await readDmsDocumentPage({filters:{hasExtractedText:false,has_files:false}})).success).toBe(true);
 expect(operations).toContainEqual({table:"dms_documents",method:"eq",args:["perf_document_has_extracted_text",false]});
 expect(operations).toContainEqual({table:"dms_documents",method:"eq",args:["perf_document_has_files",false]});
});
it("content search passes only bounded text to the protected invoker RPC",async()=>{
 responses=[{data:[{id:1}],count:1,error:null}];expect((await readDmsDocumentPage({filters:{search:" Arabic عربي ",searchMode:"content"}})).success).toBe(true);
 expect(operations).toContainEqual({table:"perf_search_documents_content",method:"rpc",args:[{search_text:"Arabic عربي"},{get:true,count:"exact"}]});
 expect(operations.every(o=>o.table==="perf_search_documents_content")).toBe(true);
});
