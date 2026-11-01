import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {createClient as sdk,type SupabaseClient} from "@supabase/supabase-js";
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import type {AuthContext} from "@/lib/rbac/check";
import {readDmsBrowser,DMS_BROWSER_READ_TIMEOUT_MS} from "@/server/reads/dms-browser";
import {POST} from "@/app/api/reads/dms-browser/route";
const state=vi.hoisted(()=>({ctx:{} as AuthContext,client:null as SupabaseClient|null,shared:vi.fn(),requests:[] as URL[],types:[] as unknown[],fault:"",preview:true,download:true,parent:true}));
vi.mock("@/server/ai/search/documents",()=>({searchDocuments:(...args:unknown[])=>state.shared(...args)}));
vi.mock("@/lib/rbac/check",async()=>({...await import("@/lib/rbac/scope"),getAuthContext:async()=>state.ctx}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>state.client}));
const document={id:1,document_no:"SYN-DMS-1",title:"Synthetic passport",status:"active",issue_date:null,expiry_date:null,created_at:"2026-10-30T00:00:00.000001Z",updated_at:"2026-10-30T00:00:00Z",document_type:{type_code:"PASSPORT",name_en:"Passport"}};
const sharedRow={...document,current_version_id:1,document_type_id:1,contentExcerpt:null,matchSource:"metadata"};
beforeEach(()=>{
 state.ctx={profile:{id:7,must_change_password:false} as AuthContext["profile"],email:null,roleCodes:[],permissionCodes:["dms.documents.view"],accountStatus:"active",isAccountActive:true};
 Object.assign(state,{requests:[],types:[{id:1,type_code:"PASSPORT",name_en:"Passport"}],fault:"",preview:true,download:true,parent:true});
 state.shared.mockReset();state.shared.mockImplementation(async()=>({success:true,data:{outcome:"available",asOf:"2026-10-30T00:00:00Z",totalCount:1,rows:[sharedRow]}}));
 state.client=withDocumentReadPolicy(sdk("https://synthetic.example.invalid","synthetic-not-a-key",{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);state.requests.push(url);const table=url.pathname.split("/").at(-1)!;
  if(table===state.fault)return new Response(JSON.stringify({code:"XX000",message:"SYNTHETIC_PRIVATE_FAILURE"}),{status:500});
  let rows:unknown[]=[],count=0;
  if(table==="dms_document_types"){const offset=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??500);rows=state.types.slice(offset,offset+limit);count=state.types.length;}
  else if(table==="f03_read_documents"){rows=state.parent?[document]:[];count=rows.length;}
  else if(table==="f03_read_document_files"){rows=[{id:11,document_id:1,file_name:"synthetic.pdf",mime_type:"application/pdf",file_size_bytes:20,ocr_text:"PRIVATE_RAW_TEXT",file_url:"PRIVATE_URL"}];count=1;}
  else if(table==="f03_has_document_permission"){const body=typeof init?.body==="string"?JSON.parse(init.body):{};return new Response(JSON.stringify((url.searchParams.get("permission_code")??body.permission_code)?.endsWith("preview")?state.preview:state.download),{headers:{"Content-Type":"application/json"}});}
  else throw Error("Unexpected synthetic request "+table);
  return new Response(JSON.stringify(rows),{headers:{"Content-Type":"application/json","Content-Range":`0-${Math.max(0,rows.length-1)}/${count}`}});
 }}}));
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
const search=(extra:Record<string,unknown>={})=>readDmsBrowser({operation:"search",query:"passport",...extra},state.ctx);
describe("DMS Browser shared-query adoption (Node, no browser)",()=>{
 it("delegates every hard filter and arbitrary offset without downloading content/link ID sets",async()=>{
  state.shared.mockResolvedValue({success:true,data:{outcome:"available",asOf:"2026-10-30T00:00:00Z",totalCount:8,rows:[sharedRow]}});
  const r=await search({offset:7,limit:25,documentTypeIds:[2],status:"active",issueDateFrom:"2025-01-01",issueDateTo:"2026-12-31",linkedEntityType:"employee"});
  expect(r.success).toBe(true);expect(state.shared).toHaveBeenCalledWith(expect.objectContaining({query:"passport",mode:"content",offset:7,pageSize:25,nullsFirst:true,includeExcerpts:true,filters:{documentTypeIds:[2],status:"active",issueFrom:"2025-01-01",issueTo:"2026-12-31",linkedType:"employee"}}),state.ctx,expect.any(AbortSignal));expect(state.requests).toHaveLength(0);
 });
 it("preserves current shared count, source and excerpt DTO without raw/private fields",async()=>{state.shared.mockResolvedValue({success:true,data:{outcome:"available",asOf:"2026-10-30T00:00:00Z",totalCount:1,rows:[{...sharedRow,matchSource:"content",contentExcerpt:"Authorized excerpt",content_text:"PRIVATE_RAW_TEXT"}]}});const r=await search();expect(r).toMatchObject({success:true,data:{totalCount:1,rows:[{documentNo:"SYN-DMS-1",matchSource:"content",contentExcerpt:"Authorized excerpt"}]}});expect(JSON.stringify(r)).not.toContain("PRIVATE_RAW_TEXT");});
 it("preserves current authorized empty result",async()=>{state.shared.mockResolvedValue({success:true,data:{outcome:"no_matches",asOf:"2026-10-30T00:00:00Z",totalCount:0,rows:[]}});expect(await search()).toMatchObject({success:true,data:{totalCount:0,rows:[]}});});
 it("clarification has no rows/count or existence hint",async()=>{state.shared.mockResolvedValue({success:true,data:{outcome:"clarification_required",message:"Choose exact subject"}});const r=await search();expect(r).toMatchObject({success:true,data:{availability:"clarification_required",message:"Choose exact subject"}});expect(r.data).not.toHaveProperty("rows");expect(r.data).not.toHaveProperty("totalCount");});
 it("does not substitute broader legacy matching after a shared read failure",async()=>{state.shared.mockResolvedValue({success:false,error:"PRIVATE_SOURCE_FAILURE"});const r=await search();expect(r.success).toBe(false);expect(r.data).toBeUndefined();expect(JSON.stringify(r)).not.toContain("PRIVATE_SOURCE_FAILURE");expect(state.requests).toHaveLength(0);});
 it("rejects an inconsistent shared count/page",async()=>{state.shared.mockResolvedValue({success:true,data:{outcome:"available",asOf:"2026-10-30T00:00:00Z",totalCount:5,rows:[sharedRow]}});expect((await search()).success).toBe(false);});
 it.each([{query:"x".repeat(201)},{limit:101},{offset:-1},{documentTypeIds:[-1]},{linkedEntityType:"__proto__"},{issueDateFrom:"not-date"},{admin:true}])("invalid %j makes no source call",async extra=>{expect((await search(extra)).success).toBe(false);expect(state.shared).not.toHaveBeenCalled();expect(state.requests).toHaveLength(0);});
 it.each(["inactive","password","permission"])("denies %s before shared service",async kind=>{if(kind==="inactive")state.ctx.isAccountActive=false;else if(kind==="password")state.ctx.profile!.must_change_password=true;else state.ctx.permissionCodes=[];expect((await search()).success).toBe(false);expect(state.shared).not.toHaveBeenCalled();});
 it("passes cancellation to the shared operation and does not publish its late result",async()=>{const c=new AbortController();state.shared.mockImplementation(async()=>{c.abort();return {success:true,data:{outcome:"available",asOf:"2026-10-30T00:00:00Z",totalCount:1,rows:[sharedRow]}};});expect((await readDmsBrowser({operation:"search",query:"passport"},state.ctx,c.signal)).success).toBe(false);});
 it("uses one finite deadline across shared search and evidence",async()=>{vi.useFakeTimers();vi.spyOn(AbortSignal,"timeout").mockImplementation(ms=>{const c=new AbortController();setTimeout(()=>c.abort(new DOMException("Timeout","TimeoutError")),ms);return c.signal;});state.shared.mockImplementation((_p,_ctx,signal:AbortSignal)=>new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true})));const pending=search();await vi.advanceTimersByTimeAsync(DMS_BROWSER_READ_TIMEOUT_MS+1);expect((await pending).success).toBe(false);expect(state.shared).toHaveBeenCalledTimes(1);});
 it("types use complete native paging beyond one provider page",async()=>{state.types=Array.from({length:1101},(_,i)=>({id:i+1,type_code:"SYN-T"+i,name_en:"Synthetic "+i}));const r=await readDmsBrowser({operation:"types"},state.ctx);expect(r).toMatchObject({success:true,data:{totalCount:1101}});expect(r.data&&"rows"in r.data?r.data.rows.length:0).toBe(1101);expect(state.shared).not.toHaveBeenCalled();});
 it("type read failure is unavailable, not successful absence",async()=>{state.fault="dms_document_types";expect((await readDmsBrowser({operation:"types"},state.ctx)).success).toBe(false);});
 it("file metadata stays scoped to the selected parent and separate preview/download authority",async()=>{state.preview=false;const r=await readDmsBrowser({operation:"files",documentId:1},state.ctx);expect(r).toMatchObject({success:true,data:{canPreview:false,canDownload:true,rows:[{id:11,fileName:"synthetic.pdf"}]}});expect(JSON.stringify(r)).not.toMatch(/PRIVATE_RAW_TEXT|PRIVATE_URL/);expect(state.requests.filter(u=>u.pathname.endsWith("f03_has_document_permission"))).toHaveLength(2);});
 it("hidden file parent is existence-safe and never reads children",async()=>{state.parent=false;const r=await readDmsBrowser({operation:"files",documentId:1},state.ctx);expect(r).toMatchObject({success:true,data:{availability:"unavailable"}});expect(r.data).not.toHaveProperty("rows");expect(state.requests.some(u=>u.pathname.endsWith("f03_read_document_files"))).toBe(false);});
 it.each(["f03_read_documents","f03_read_document_files","f03_has_document_permission"])("%s failure never becomes false absence or permission",async table=>{state.fault=table;expect((await readDmsBrowser({operation:"files",documentId:1},state.ctx)).success).toBe(false);});
 it("read route remains private/no-store and sanitizes failure text",async()=>{state.shared.mockResolvedValue({success:false,error:"PRIVATE"});const r=await POST(new Request("http://localhost/api/reads/dms-browser",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"search",query:"passport"})}));expect(r.status).toBe(503);expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");expect(r.headers.get("vary")).toBe("Cookie");expect(await r.text()).not.toContain("PRIVATE");});
});
