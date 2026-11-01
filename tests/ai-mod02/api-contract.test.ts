import {beforeEach,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
const s=vi.hoisted(()=>({ctx:{} as AuthContext,doc:vi.fn(),global:vi.fn(),hr:vi.fn(),semantic:vi.fn(),delivery:vi.fn()}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>s.ctx}));
vi.mock("@/server/ai/search/documents",()=>({searchDocuments:(...a:unknown[])=>s.doc(...a)}));
vi.mock("@/server/ai/search/global",()=>({searchGlobal:(...a:unknown[])=>s.global(...a)}));
vi.mock("@/server/reads/hr-search",()=>({readHrSearch:(...a:unknown[])=>s.hr(...a)}));
vi.mock("@/server/actions/dms/semantic-search",()=>({semanticSearchDmsDocuments:(...a:unknown[])=>s.semantic(...a)}));
vi.mock("@/server/ai/search/security",()=>({verifySearchDelivery:(...a:unknown[])=>s.delivery(...a)}));
import {searchErp} from "@/server/ai/search/service";
import {POST} from "@/app/api/v1/search/route";
const request=(extra:Record<string,unknown>={})=>({contractVersion:"erp-ai/1",capabilityId:"dms.metadata",query:"ISO certificates",mode:"keyword",filters:[],pageSize:25,cursor:null,...extra});
const filter=(field:string,operator:string,values:unknown[])=>({field,operator,values});
beforeEach(()=>{vi.resetAllMocks();s.ctx={profile:{id:1,auth_user_id:"synthetic-one",must_change_password:false},isAccountActive:true,permissionCodes:["dms.documents.view"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
 s.doc.mockResolvedValue({success:true,data:{outcome:"available",rows:[],totalCount:0,hasMore:false}});
 s.global.mockResolvedValue({success:true,data:{outcome:"available",rows:[],totalCount:0,hasMore:false}});
 s.hr.mockResolvedValue({success:true,data:{results:[],totalCount:0,hasMore:false}});
 s.semantic.mockResolvedValue({success:true,data:[{documentId:7}]});
});
it("uses the foundation contract and maps all hard constraints to the owning document service",async()=>{
 const r=await searchErp(request({context:{entityType:"dependent",entityId:3},metadataFilters:[{field_code:"nationality",value:"Nigerian"}],filters:[filter("owning_company_id","in",[1,2]),filter("owning_branch_id","eq",[11]),filter("document_type_id","eq",[4]),filter("expiry_date","gte",["2026-10-01"]),filter("expiry_date","lte",["2027-10-01"]),filter("issue_date","gte",["2025-01-01"]),filter("status","eq",["active"])]}));
 expect(r.success).toBe(true);expect(s.doc).toHaveBeenCalledWith(expect.objectContaining({subject:{type:"employee_dependent",id:3},filters:expect.objectContaining({companyIds:[1,2],branchId:11,documentTypeIds:[4],expiryFrom:"2026-10-01",expiryTo:"2027-10-01",issueFrom:"2025-01-01",status:"active",metadata:[{field_code:"nationality",value:"Nigerian"}]})}),s.ctx,undefined);
});
it.each([
 {contractVersion:"erp-ai/0"},{capabilityId:"__proto__"},{capabilityId:"hr.payroll"},{sql:"select *"},
 {filters:[filter("salary","eq",[1])]},{filters:[filter("document_type_id","eq",[1,2])]},
 {filters:[filter("document_type_id","eq",[1]),filter("document_type_id","in",[2])]},
 {filters:[filter("status","gte",["active"])]},{context:{entityType:"employee",entityId:1},filters:[filter("subject_id","eq",[2])]},
 {filters:[filter("expiry_date","gte",["2027-01-01"]),filter("expiry_date","lte",["2026-01-01"])]},
 {filters:[filter("owning_company_id","eq",[true])]},{query:"x".repeat(501)},
])("rejects invalid/unregistered criteria without retrieval: %j",async change=>{expect((await searchErp(request(change))).success).toBe(false);expect(s.doc).not.toHaveBeenCalled();expect(s.global).not.toHaveBeenCalled();expect(s.hr).not.toHaveBeenCalled();expect(s.semantic).not.toHaveBeenCalled();});
it("validates semantic filters before any possible provider call",async()=>{expect((await searchErp(request({mode:"semantic",context:{entityType:"dms_document",entityId:1}}))).success).toBe(false);expect(s.semantic).not.toHaveBeenCalled();});
it.each(["inactive","password"])("%s account is denied before semantic provider dispatch",async kind=>{if(kind==="inactive")s.ctx.isAccountActive=false;else s.ctx.profile!.must_change_password=true;expect(await searchErp(request({mode:"semantic"}))).toMatchObject({success:false,error:"Permission denied"});expect(s.semantic).not.toHaveBeenCalled();expect(s.doc).not.toHaveBeenCalled();});
it("semantic candidates are intersected with current hard constraints and labelled a preview",async()=>{const r=await searchErp(request({mode:"semantic",filters:[filter("owning_company_id","eq",[1])]}));expect(r).toMatchObject({success:true,data:{countScope:"bounded_preview",hasMore:null,complete:false,nextCursor:null}});expect(s.doc).toHaveBeenCalledWith(expect.objectContaining({filters:expect.objectContaining({companyId:1,candidateIds:[7]})}),s.ctx,undefined);expect(s.semantic).toHaveBeenCalledTimes(1);});
it("disabled semantic mode stays unavailable without a literal success fallback",async()=>{s.semantic.mockResolvedValue({success:false});expect((await searchErp(request({mode:"semantic"}))).success).toBe(false);expect(s.doc).not.toHaveBeenCalled();});
it("an empty bounded semantic preview cannot claim the full ERP search has no matches",async()=>{expect(await searchErp(request({mode:"semantic"}))).toMatchObject({success:true,data:{outcome:"partial",countScope:"bounded_preview",complete:false}});});
it("clarification remains a count-free global API outcome",async()=>{s.global.mockResolvedValue({success:false,code:"clarification_required",error:"Choose exact person"});expect(await searchErp(request({capabilityId:"global.search"}))).toMatchObject({success:true,data:{outcome:"clarification_required",totalCount:null,rows:[]}});});
it.each(["company.metadata","branch.metadata","party.metadata","site.metadata"])("%s uses only its owning domain, not global search admission",async capabilityId=>{expect((await searchErp(request({capabilityId}))).success).toBe(true);expect(s.global.mock.calls[0][3]).toBe("domain");expect(s.global.mock.calls[0][0].domains).toHaveLength(1);});
it("HR criteria reach the existing owning reader and final access is rechecked",async()=>{await searchErp(request({capabilityId:"hr.search",filters:[filter("category","in",["employees","compliance"]),filter("owner_company_id","eq",[1])]}));expect(s.hr).toHaveBeenCalledWith(expect.objectContaining({categories:["employees","compliance"],ownerCompanyId:1}),s.ctx,undefined);expect(s.delivery).toHaveBeenCalledWith(s.ctx);});
it("HR late authority change withholds a successful reader response",async()=>{s.delivery.mockRejectedValue(Error("Changed"));expect((await searchErp(request({capabilityId:"hr.search"}))).success).toBe(false);});
it("continuation is bound to the current authority, query and filters",async()=>{s.global.mockResolvedValue({success:true,data:{rows:[],totalCount:40,hasMore:true}});const r=await searchErp(request({capabilityId:"global.search"}));const cursor=r.success&&"nextCursor"in r.data?r.data.nextCursor:null;expect(cursor).toBeTypeOf("string");await searchErp(request({capabilityId:"global.search",cursor}));expect(s.global.mock.calls.at(-1)?.[0].page).toBe(2);s.global.mockClear();s.ctx={...s.ctx,permissionCodes:["branches.view"]};expect((await searchErp(request({capabilityId:"global.search",cursor}))).success).toBe(false);expect(s.global).not.toHaveBeenCalled();});
it("POST is private/no-store and does not accept oversized or non-JSON requests",async()=>{const response=await POST(new Request("http://localhost/api/v1/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(request())}));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");expect(response.headers.get("vary")).toBe("Cookie");const oversized=await POST(new Request("http://localhost/api/v1/search",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(4001)}));expect(oversized.status).toBe(400);});
it("a cancelled API request dispatches no domain or provider action",async()=>{const c=new AbortController();c.abort();const r=await POST(new Request("http://localhost/api/v1/search",{method:"POST",signal:c.signal,headers:{"content-type":"application/json"},body:JSON.stringify(request())}));expect(r.headers.get("x-erp-read-outcome")).toBe("cancelled");expect(s.doc).not.toHaveBeenCalled();expect(s.semantic).not.toHaveBeenCalled();});
