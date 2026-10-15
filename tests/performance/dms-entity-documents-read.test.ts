import {beforeEach, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table: string; methods: unknown[][]};
const s = vi.hoisted(() => ({ctx: {} as AuthContext, calls: [] as Call[], rows: {} as Record<string, Row[]>, fault: "", nullCount: "", short: "", admin: 0, clients: 0, global: false, preview: false, extraction: false, findings:false,rpcFault: false, after: undefined as undefined | ((c: Call) => void)}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => s.ctx}));
vi.mock("@/server/actions/audit", () => ({logAudit: vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
function client() {
  return {rpc: (name: string, args?: {permission_code?: string}) => {
    const data = name === "current_user_is_global_admin" ? s.global : name==="current_user_has_permission"?s.findings:name==="current_user_has_role"?false:args?.permission_code?.endsWith("preview") ? s.preview : s.extraction;
    const result = {data, error: s.rpcFault ? {message: "PRIVATE_RPC_FAILURE"} : null};
    return {abortSignal: () => Promise.resolve(result), then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve)};
  }, from: (table: string) => {
    const c: Call = {table, methods: []}; s.calls.push(c);
    const b: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => {
      if (s.fault === table) return Promise.resolve({data: null, count: null, error: {message: "PRIVATE_SOURCE_FAILURE"}}).then(resolve);
      let rows = [...(s.rows[table] ?? [])];
      for (const [method, key, value, value2] of c.methods) {
        if (method === "eq") rows = rows.filter(r => r[String(key)] === value);
        if (method === "neq") rows = rows.filter(r => r[String(key)] != null && r[String(key)] !== value);
        if (method === "is") rows = rows.filter(r => (r[String(key)] ?? null) === value);
        if (method === "in") rows = rows.filter(r => (value as unknown[]).includes(r[String(key)]));
        if (method === "not" && value === "is") rows = rows.filter(r => r[String(key)] != null);
        if (method === "not" && value === "in") rows = rows.filter(r => !String(value2).replace(/[()]/g, "").split(",").map(Number).includes(Number(r[String(key)])));
        if (method === "or") {const term = String(key).match(/ilike\."?%([^%]*)%/)?.[1].toLowerCase() ?? ""; rows = rows.filter(r => String(r.document_no).toLowerCase().includes(term) || String(r.title).toLowerCase().includes(term));}
      }
      const orders = c.methods.filter(m => m[0] === "order");
      rows.sort((a,b) => {for (const [,key,opt] of orders) {const av=a[String(key)],bv=b[String(key)], sign=(opt as {ascending?:boolean} | undefined)?.ascending===false?-1:1;
        const cmp=typeof av==="number"?av-Number(bv):String(av).localeCompare(String(bv)); if(cmp)return cmp*sign;}return 0;});
      const count = s.nullCount === table ? null : rows.length, range=c.methods.find(m=>m[0]==="range"), limit=c.methods.find(m=>m[0]==="limit");
      rows=range?rows.slice(Number(range[1]),Number(range[2])+1):rows.slice(0,limit?Number(limit[1]):1000);
      if(s.short===table)rows=rows.slice(0,1);
      const single=c.methods.some(m=>m[0]==="maybeSingle"),head=(c.methods.find(m=>m[0]==="select")?.[2] as {head?:boolean}|undefined)?.head;
      s.after?.(c); return Promise.resolve({data:head?null:single?rows[0]??null:rows,count,error:null}).then(resolve);
    }};
    for(const m of ["select","eq","neq","is","in","not","or","order","range","limit","abortSignal","maybeSingle"])b[m]=(...a:unknown[])=>{c.methods.push([m,...a]);return b;};
    return b;
  }};
}
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {s.clients++;return client();}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {s.admin++;return client();}}));
import {getDmsDocumentsByEntity, getAvailableDmsDocumentsForLink} from "@/server/actions/dms/entity-documents";
import {readDmsEntityDocuments,ENTITY_DOCUMENTS_TIMEOUT_MS} from "@/server/reads/dms-entity-documents";
import {entityDocumentsCriteriaSchema,entityDocumentsResponseSchema,entityDocumentsListPage,entityDocumentsAttachPage,entityDocumentsSelectedPage,entityDocumentsSummaryPage} from "@/lib/reads/dms-entity-documents-schema";
import {GET,POST} from "@/app/api/reads/dms-entity-documents/route";
const doc=(id:number, extra:Row={})=>({id,document_no:`DOC-${id}`,title:`Document ${id}`,status:"active",issue_date:null,expiry_date:null,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",deleted_at:null,legacy_document_code:null,description:null,confidentiality_level:"internal",migrated_from_table:null,document_type_id:1,document_type:{type_code:"TEST",name_en:"Evidence"},ai_risk_level:null,ai_risk_score:null,completeness_score:null,...extra});
const link=(id:number,extra:Row={})=>({id,document_id:id,entity_type:"employee",entity_id:1,is_primary:false,link_role:null,linked_at:"2026-01-01T00:00:00Z",deleted_at:null,document:doc(id),...extra});
beforeEach(()=>{Object.assign(s,{calls:[],admin:0,clients:0,fault:"",nullCount:"",short:"",global:false,preview:false,extraction:false,findings:false,rpcFault:false,after:undefined,
  rows:{employees:[{id:1,deleted_at:null}],dms_documents:[doc(1)],dms_document_links:[],dms_document_files:[],dms_ai_extraction_results:[]}});
  s.ctx={profile:{id:1,auth_user_id:"synthetic",must_change_password:false},isAccountActive:true,accountStatus:"active",permissionCodes:["dms.admin"],roleCodes:[],roleAssignments:[]} as unknown as AuthContext;
});
it("RED baseline: attach reads must never acquire an admin client",async()=>{await getAvailableDmsDocumentsForLink("employee",1);expect(s.admin).toBe(0);});
it("RED baseline: attach choices beyond the former 50-row cutoff remain reachable",async()=>{s.rows.dms_documents=Array.from({length:65},(_,i)=>doc(i+1));const r=await getAvailableDmsDocumentsForLink("employee",1);expect(r.success).toBe(true);expect(r.data).toHaveLength(65);});
it("RED baseline: linked documents traverse provider pages beyond 1000",async()=>{s.rows.dms_documents=Array.from({length:1107},(_,i)=>doc(i+1));s.rows.dms_document_links=s.rows.dms_documents.map(r=>link(Number(r.id)));const r=await getDmsDocumentsByEntity("employee",1);expect(r.success).toBe(true);expect(r.data).toHaveLength(1107);});
it("RED baseline: attach exclusion failure must not become successful choices",async()=>{s.fault="dms_document_links";const r=await getAvailableDmsDocumentsForLink("employee",1);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
it("RED baseline: linked ordering has an ID tie breaker",async()=>{await getDmsDocumentsByEntity("employee",1);expect(s.calls.find(c=>c.table==="dms_document_links")?.methods).toContainEqual(["order","id",{ascending:false}]);});
const read=(operation="list",extra={})=>readDmsEntityDocuments({operation,entityType:"employee",entityId:1,...extra});
it("native composition counts all authorized links, pages late rows and counts files only for that page",async()=>{
  s.rows.dms_documents=Array.from({length:1107},(_,i)=>doc(i+1));s.rows.dms_document_links=s.rows.dms_documents.map(d=>link(Number(d.id)));
  s.rows.dms_document_files=Array.from({length:1107},(_,i)=>({id:i+1,document_id:1,deleted_at:null}));
  const r=entityDocumentsListPage.parse((await read("list",{offset:1100})).data);expect(r.totalCount).toBe(1107);expect(r.rows.map(d=>d.document_id)).toEqual([7,6,5,4,3,2,1]);expect(r.rows.at(-1)?.files_count).toBe(1107);
  expect(s.calls.filter(c=>c.table==="dms_document_links")).toHaveLength(3);expect(s.calls.filter(c=>c.table==="dms_document_files")).toHaveLength(3);expect(s.admin).toBe(0);
  for(const c of s.calls.filter(c=>c.table==="dms_documents"))expect((c.methods.find(m=>m[0]==="in")?.[2] as number[]).length).toBeLessThanOrEqual(200);
});
it("list retains archived and superseded records but omits deleted/invisible documents without leaking their count",async()=>{
  s.rows.dms_document_links=[link(1),link(2),link(3),link(4),link(5)];s.rows.dms_documents=[doc(1,{status:"archived"}),doc(2,{status:"superseded"}),doc(3,{status:"deleted"}),doc(4,{deleted_at:"2026-01-01"})];
  const r=entityDocumentsListPage.parse((await read()).data);expect(r.totalCount).toBe(2);expect(r.rows.map(d=>d.document_id)).toEqual([2,1]);expect(r.rows.every(d=>d.ai_summary===null)).toBe(true);
});
it("attach excludes the complete linked set beyond 1000 before exact count and server paging",async()=>{
  s.rows.dms_document_links=Array.from({length:1107},(_,i)=>link(i+1));s.rows.dms_documents=Array.from({length:1160},(_,i)=>doc(i+1));
  const r=entityDocumentsAttachPage.parse((await read("attach",{offset:50})).data);expect(r.totalCount).toBe(53);expect(r.rows.map(d=>d.id)).toEqual([1110,1109,1108]);
  expect(s.calls.find(c=>c.table==="dms_documents")?.methods).toContainEqual(["order","id",{ascending:false}]);expect(r.rows[0]).toMatchObject({has_extraction:null,has_ocr:null,extracted_person_name:null});
});
it("attach native search is applied before complete paging and preserves quoted wildcard grammar",async()=>{
  s.rows.dms_documents=[doc(1),doc(2,{title:"Needle"})];const r=entityDocumentsAttachPage.parse((await read("attach",{search:"  needle  "})).data);expect(r.rows.map(d=>d.id)).toEqual([2]);
  s.calls=[];await read("attach",{search:'a%,title.eq."secret"_\\tail'});expect(s.calls.find(c=>c.table==="dms_documents")?.methods.find(m=>m[0]==="or")?.[1]).toBe('document_no.ilike."%a%,title.eq.\\"secret\\"_\\\\tail%",title.ilike."%a%,title.eq.\\"secret\\"_\\\\tail%"');
});
it.each(["employees","dms_document_links","dms_documents","dms_document_files"])("%s errors are explicit, sanitized and never partial/empty success",async table=>{
  s.rows.dms_document_links=[link(1)];s.fault=table;const r=await read();expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(JSON.stringify(r)).not.toContain("PRIVATE_");
});
it.each(["employees","dms_document_links","dms_documents","dms_document_files"])("%s missing count fails closed",async table=>{s.rows.dms_document_links=[link(1)];s.nullCount=table;expect((await read()).success).toBe(false);});
it("provider-short and changing link pages are not complete",async()=>{
  s.rows.dms_document_links=[link(1),link(2)];s.short="dms_document_links";expect((await read()).success).toBe(false);
  s.short="";s.rows.dms_document_links=Array.from({length:501},(_,i)=>link(i+1));s.after=c=>{if(c.table==="dms_document_links")s.rows.dms_document_links.push(link(900));};expect((await read()).success).toBe(false);
});
it.each(["list","attach","summary"])("%s oversized source returns no rows, private counts or false zeros",async operation=>{
  s.rows.dms_document_links=Array.from({length:5001},(_,i)=>link(i+1));const r=await read(operation);expect(r.data).toMatchObject({availability:"too_large"});expect(r.data).not.toHaveProperty("rows");expect(r.data).not.toHaveProperty("totalCount");expect(r.data).not.toHaveProperty("summary");
});
it.each(["missing","inactive","password"])("%s principal is rejected before source access",async mode=>{if(mode==="missing")s.ctx.permissionCodes=[];if(mode==="inactive")s.ctx.isAccountActive=false;if(mode==="password")s.ctx.profile!.must_change_password=true;expect(await read()).toEqual({success:false,error:"Permission denied"});expect(s.clients).toBe(0);});
it("unavailable parent retires the read without enumerating links/documents",async()=>{s.rows.employees=[];const r=await read();expect(r.data).toMatchObject({availability:"unavailable"});expect(s.calls.map(c=>c.table)).toEqual(["employees"]);});
it.each([["company","owner_companies",false],["branch","branches",false],["site","work_sites",true],["party","parties",false]] as const)("%s point admission uses its actual protected parent contract",async(entityType,table,soft)=>{
  s.rows[table]=[{id:1,deleted_at:null}];await read("list",{entityType});expect(s.calls[0].table).toBe(table);expect(s.calls[0].methods.some(m=>m[0]==="is"&&m[1]==="deleted_at")).toBe(soft);
});
it("dependent admission also point-checks its live owning employee",async()=>{
  s.rows.employee_dependents=[{id:7,employee_id:1,deleted_at:null}];const r=await read("list",{entityType:"employee_dependent",entityId:7});expect(r.success).toBe(true);expect(s.calls.slice(0,2).map(c=>c.table)).toEqual(["employee_dependents","employees"]);
  s.rows.employees=[];expect((await read("list",{entityType:"employee_dependent",entityId:7})).data).toMatchObject({availability:"unavailable"});
});
it.each([undefined,null,"1",0,-1,Number.MAX_SAFE_INTEGER+1])("dependent owner %j is rejected before any employee or document read",async employeeId=>{
  s.rows.employee_dependents=[{id:7,employee_id:employeeId,deleted_at:null}];
  const r=await read("list",{entityType:"employee_dependent",entityId:7});
  expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(s.calls.map(c=>c.table)).toEqual(["employee_dependents"]);
});
it("dependent admission uses only its parsed owner ID, not the dependent ID",async()=>{
  s.rows.employee_dependents=[{id:7,employee_id:11,deleted_at:null}];s.rows.employees=[{id:11,deleted_at:null}];
  expect((await read("list",{entityType:"employee_dependent",entityId:7})).success).toBe(true);
  const [dependent,employee]=s.calls;expect(dependent.methods).toContainEqual(["select","id,employee_id",{count:"exact",head:false}]);
  expect(employee.methods).toContainEqual(["select","id",{count:"exact",head:false}]);expect(employee.methods).toContainEqual(["eq","id",11]);
  expect(employee.methods).toContainEqual(["is","deleted_at",null]);
});
it("id-only parent projection cannot cause a dependent-owner traversal from an unexpected field",async()=>{
  s.rows.employees=[{id:1,employee_id:99,deleted_at:null}];expect((await read()).success).toBe(true);
  expect(s.calls.filter(c=>c.table==="employees")).toHaveLength(1);expect(s.calls[0].methods).toContainEqual(["select","id",{count:"exact",head:false}]);
});
it("future unsupported parent has explicit non-enumerating unavailability, never guessed authorization",async()=>{expect((await read("list",{entityType:"vehicle"})).data).toMatchObject({availability:"unavailable"});expect(s.calls).toHaveLength(0);});
it.each(["missing","linked","deleted","soft-deleted"])("selected %s document yields a row-free child-only unavailable response",async mode=>{
  if(mode==="missing")s.rows.dms_documents=[];if(mode==="linked")s.rows.dms_document_links=[link(1)];if(mode==="deleted")s.rows.dms_documents=[doc(1,{status:"deleted"})];if(mode==="soft-deleted")s.rows.dms_documents=[doc(1,{deleted_at:"2026-01-01"})];
  const r=await read("selected",{documentIds:[1]});expect(r.data).toMatchObject({availability:"unavailable"});expect(r.data).not.toHaveProperty("rows");
});
it("selected admission independently reads every selected ID outside the current search page",async()=>{s.rows.dms_documents=[doc(1),doc(99)];const r=entityDocumentsSelectedPage.parse((await read("selected",{documentIds:[99,1]})).data);expect(r.rows.map(d=>d.id)).toEqual([1,99]);expect(r.criteria.documentIds).toEqual([1,99]);});
it("metadata-only reads do not query extraction/person-name/OCR content",async()=>{await read("attach");expect(s.calls.some(c=>["dms_ai_extraction_results","dms_document_files"].includes(c.table))).toBe(false);});
it("preview without AI review exposes only OCR availability, not extracted names",async()=>{
  s.preview=true;s.rows.dms_document_files=[{id:1,document_id:1,ocr_text:"PRIVATE_OCR",deleted_at:null}];const r=entityDocumentsAttachPage.parse((await read("attach")).data);expect(r.rows[0]).toMatchObject({has_extraction:null,has_ocr:true,extracted_person_name:null});expect(JSON.stringify(r)).not.toContain("PRIVATE_OCR");expect(s.calls.some(c=>c.table==="dms_ai_extraction_results")).toBe(false);
});
it("latest extraction tie is deterministic, name fallback and OCR are projected independently",async()=>{
  s.preview=s.extraction=true;s.rows.dms_ai_extraction_results=[{id:1,document_id:1,ai_status:"done",created_at:"2026-01-01",full_name_en:"old",full_name:null,holder_name:null,person_name:null},{id:2,document_id:1,ai_status:"done",created_at:"2026-01-01",full_name_en:null,full_name:"Synthetic current",holder_name:null,person_name:null}];
  const r=entityDocumentsAttachPage.parse((await read("attach")).data);expect(r.rows[0]).toMatchObject({has_extraction:true,has_ocr:false,extracted_person_name:"Synthetic current"});
  const c=s.calls.find(c=>c.table==="dms_ai_extraction_results")!;expect(c.methods).toContainEqual(["order","id",{ascending:false}]);expect(c.methods.find(m=>m[0]==="select")?.[1]).not.toBe("*");expect(String(c.methods.find(m=>m[0]==="select")?.[1])).not.toMatch(/extracted_fields_json(?:,|$)/);
});
it.each(["dms_ai_extraction_results","dms_document_files"])("%s enrichment failure never becomes false absence",async table=>{s.preview=s.extraction=true;s.fault=table;expect((await read("attach")).success).toBe(false);});
it("capability lookup failure is not treated as permission denial or false absence",async()=>{s.rpcFault=true;expect((await read("attach")).success).toBe(false);});
it("scoped compliance preserves visible link totals, expiry/status and restricted missing/findings",async()=>{
  s.rows.dms_document_links=[link(1),link(2),link(3)];s.rows.dms_documents=[doc(1,{expiry_date:"2000-01-01",ai_risk_level:"critical",status:"archived"}),doc(2,{expiry_date:"2999-01-01",ai_risk_level:"high"})];
  const r=entityDocumentsSummaryPage.parse((await read("summary")).data);expect(r.summary).toMatchObject({totalDocuments:2,expiredDocuments:1,expiringSoonDocuments:0,missingRequiredDocuments:null,openComplianceFindings:null,highRiskDocuments:1,criticalRiskDocuments:1,latestExpiryDate:"2999-01-01",scope:"visible_documents"});expect(s.admin).toBe(0);
});
it("global compliance uses complete native rules and the original deterministic missing-document helper",async()=>{
  s.global=true;s.rows.dms_document_links=[link(1)];s.rows.dms_required_document_rules=[{id:1,rule_code:"A",rule_name:"Present",entity_type:"employee",document_type_id:1,is_required:true,is_active:true,deleted_at:null},{id:2,rule_code:"B",rule_name:"Missing",entity_type:"employee",document_type_id:2,is_required:true,is_active:true,deleted_at:null}];
  expect(entityDocumentsSummaryPage.parse((await read("summary")).data).summary.missingRequiredDocuments).toBe(1);s.rows.dms_documents=[doc(1,{status:"archived"})];expect(entityDocumentsSummaryPage.parse((await read("summary")).data).summary.missingRequiredDocuments).toBe(2);
});
it("global flag alone never substitutes for a complete linked-document union",async()=>{s.global=true;s.rows.dms_document_links=[link(1)];s.rows.dms_documents=[];expect((await read("summary")).success).toBe(false);});
it.each(["dms_required_document_rules","erp_ai_compliance_findings"])("%s failure cannot manufacture compliance success/zero",async table=>{s.global=true;s.ctx.permissionCodes.push("ai.compliance.view");s.fault=table;expect((await read("summary")).success).toBe(false);});
it("findings uses its independent native capability and exact count (not page size)",async()=>{s.ctx.permissionCodes.push("ai.compliance.view");s.findings=true;s.rows.erp_ai_compliance_findings=Array.from({length:1107},(_,i)=>({id:i+1,entity_type:"employee",entity_id:1,status:"open",deleted_at:null}));expect(entityDocumentsSummaryPage.parse((await read("summary")).data).summary.openComplianceFindings).toBe(1107);s.nullCount="erp_ai_compliance_findings";expect((await read("summary")).success).toBe(false);});
it("flattened company-scoped findings capability is not a global RLS grant or a false zero",async()=>{s.ctx.permissionCodes.push("ai.compliance.view");s.ctx.roleAssignments=[{roleId:7,roleCode:"Scoped",ownerCompanyId:2,branchId:null,permissionCodes:["ai.compliance.view"]}];expect(entityDocumentsSummaryPage.parse((await read("summary")).data).summary.openComplianceFindings).toBeNull();expect(s.calls.some(c=>c.table==="erp_ai_compliance_findings")).toBe(false);});
it("whole attempt cancellation is checked before client creation and propagated to sources",async()=>{
  const abort=new AbortController();abort.abort();expect((await readDmsEntityDocuments({operation:"list",entityType:"employee",entityId:1},s.ctx,abort.signal)).success).toBe(false);expect(s.clients).toBe(0);
  await read();expect(ENTITY_DOCUMENTS_TIMEOUT_MS).toBe(15000);for(const c of s.calls)expect(c.methods.find(m=>m[0]==="abortSignal")?.[1]).toBeInstanceOf(AbortSignal);
});
it.each([{entityId:0},{offset:-1},{limit:101},{search:"x".repeat(201)},{extra:"private"}])("rejects invalid criteria %j before sources",async extra=>{expect((await read("attach",extra)).success).toBe(false);expect(s.clients).toBe(0);});
it("selected criteria reject empty, duplicate and oversized selections",()=>{for(const documentIds of [[],[1,1],Array.from({length:101},(_,i)=>i+1)])expect(entityDocumentsCriteriaSchema.safeParse({operation:"selected",entityType:"employee",entityId:1,documentIds}).success).toBe(false);});
it("unavailable DTO cannot carry existence hints or private rows",()=>{const data={criteria:entityDocumentsCriteriaSchema.parse({operation:"list",entityType:"employee",entityId:1}),asOf:new Date().toISOString(),availability:"unavailable"};for(const extra of [{rows:[]},{totalCount:0},{reason:"exists-but-denied"}])expect(entityDocumentsResponseSchema.safeParse({...data,...extra}).success).toBe(false);});
it("GET boundary is private uncached, denial/error sanitized, and request-size bounded",async()=>{
  const request=(value:unknown)=>new Request(`http://localhost/api/reads/dms-entity-documents?params=${encodeURIComponent(JSON.stringify(value))}`);
  let r=await GET(request({operation:"list",entityType:"employee",entityId:1}));expect(r.status).toBe(200);expect(r.headers.get("cache-control")).toContain("private, no-store");expect(r.headers.get("vary")).toBe("Cookie");
  s.fault="employees";r=await GET(request({operation:"list",entityType:"employee",entityId:1}));expect(r.status).toBe(503);expect(await r.text()).not.toContain("PRIVATE_SOURCE");
  s.ctx.permissionCodes=[];expect((await GET(request({operation:"list",entityType:"employee",entityId:1}))).status).toBe(403);expect((await GET(request({search:"x".repeat(4001)}))).status).toBe(400);
});
const postRequest=(body:string,contentType="application/json",signal?:AbortSignal)=>new Request("http://localhost/api/reads/dms-entity-documents",{method:"POST",body,headers:{"content-type":contentType},signal});
it("POST uses identical validated criteria/DTO and private response headers as legacy GET",async()=>{
  const criteria={operation:"attach",entityType:"employee",entityId:1,search:"Synthetic Person 42"};
  const response=await POST(postRequest(JSON.stringify(criteria)));expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");expect(response.headers.get("vary")).toBe("Cookie");expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(response.headers.get("x-erp-correlation")).toBeTruthy();
  const post=await response.json(),get=await (await GET(new Request(`http://localhost/api/reads/dms-entity-documents?params=${encodeURIComponent(JSON.stringify(criteria))}`))).json();
  expect({...post.data,asOf:null}).toEqual({...get.data,asOf:null});expect(post.data.criteria).toEqual(entityDocumentsCriteriaSchema.parse(criteria));expect(s.admin).toBe(0);
});
it("POST preserves terminal denial and sanitized unavailable responses",async()=>{
  const body=JSON.stringify({operation:"list",entityType:"employee",entityId:1});s.fault="employees";
  const failed=await POST(postRequest(body));expect(failed.status).toBe(503);expect(await failed.text()).not.toContain("PRIVATE_SOURCE");
  s.ctx.permissionCodes=[];expect((await POST(postRequest(body))).status).toBe(403);
});
it.each([["{","application/json"],["{}","text/plain"],[JSON.stringify({search:"x".repeat(4001)}),"application/json"]])("POST rejects malformed, non-JSON or oversized input before source reads (%#)",async(body,contentType)=>{
  expect((await POST(postRequest(body,contentType))).status).toBe(400);expect(s.clients).toBe(0);
});
it("POST propagates request cancellation without private source reads",async()=>{
  const abort=new AbortController();abort.abort();const response=await POST(postRequest(JSON.stringify({operation:"list",entityType:"employee",entityId:1}),"application/json",abort.signal));
  expect(response.status).toBe(400);expect(response.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");expect(s.clients).toBe(0);
});
it("all three business mutation blocks preserve the original source (line-ending normalized for CI)",()=>{
  const source=readFileSync("src/server/actions/dms/entity-documents.ts","utf8").replace(/\r\n/g,"\n");
  const original=[
    ["export async function linkDmsDocumentToEntity","function canLinkDocumentToEntity","449ee1357f8891882ec58c4976dd17fb3639cd33ee5f18f082bbe743965f10c9"],
    ["function canLinkDocumentToEntity","// ── unlinkDmsDocumentFromEntity","dd6ae92d49b18c4180e25d46bb74cd6903a5b849ac9f6687894b921d82eab34f"],
    ["export async function unlinkDmsDocumentFromEntity","// ── getDmsEntityDocumentComplianceSummary","495d42f6dce688bc20e0f2036c9dfe4f621e3fdee890e84a85daa84c3dd5a618"],
  ];
  for(const [start,end,sha] of original)expect(createHash("sha256").update(source.slice(source.indexOf(start),source.indexOf(end))).digest("hex")).toBe(sha);
});
it("protected read service has no privileged client, broad JSON/row projection, provider or mutation",()=>{
  const source=readFileSync("src/server/reads/dms-entity-documents.ts","utf8");expect(source).not.toMatch(/createAdminClient|supabase\/admin|\.insert\(|\.update\(|\.delete\(|\.upload\(|\.select\(["'`]\*/);expect(source).toContain("f03_has_document_permission");expect(source).toContain("current_user_has_permission");
});
