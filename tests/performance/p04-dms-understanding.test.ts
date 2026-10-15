import {beforeEach,expect,it,vi} from "vitest";
const s=vi.hoisted(()=>({fail:"",nullCount:false,active:true,flag:true,calls:[] as {table:string;ops:[string,unknown[]][]}[]}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({profile:{id:1},isAccountActive:s.active,roleCodes:[]}),hasPermission:()=>true}));
vi.mock("@/lib/dms/resolve-link-entity-display-name",()=>({resolveDmsLinkEntityDisplayNames:async()=>new Map(),formatDmsLinkEntityFallback:()=>"Synthetic"}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const c={table,ops:[] as [string,unknown[]][]};s.calls.push(c);const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(r:unknown)=>unknown,reject:(e:unknown)=>unknown)=>{
  if(s.fail===table)return Promise.reject(Error("Read unavailable")).then(resolve,reject);
  const page=c.ops.find(([op])=>op==="range")?.[1] as number[]|undefined;
  const total=table==="dms_document_files"||table==="dms_document_tags"?1107:0;
  const rows=page?Array.from({length:Math.min(page[1]-page[0]+1,Math.max(0,total-page[0]))},(_,i)=>({id:page[0]+i+1,tag_id:page[0]+i+1,tag:{tag_name:"Synthetic"},ocr_status:"completed",ocr_text:"Synthetic",ocr_completed_at:"2026-10-13T08:00:00Z"})):[];
  const data=table==="erp_ai_feature_flags"?{is_enabled:s.flag}:table==="dms_documents"?{id:9,document_no:"SYN-9",title:"Synthetic",confidentiality_level:"internal",status:"active"}:c.ops.some(([op])=>op==="maybeSingle")?null:rows;
  return Promise.resolve({data,count:s.nullCount?null:total,error:null}).then(resolve,reject);
 }:(...args:unknown[])=>{c.ops.push([String(key),args]);return q;}});return q;
}})}));
import {getDmsDocumentUnderstanding} from "@/server/actions/dms/document-understanding";
beforeEach(()=>{Object.assign(s,{fail:"",nullCount:false,active:true,flag:true,calls:[]});});
it("aggregates all files/tags while keeping preview labels bounded",async()=>{const r=await getDmsDocumentUnderstanding(9);expect(r.success,r.error).toBe(true);expect(r.data?.ocrStatus.fileCount).toBe(1107);expect(r.data?.tagsLinks.tagCount).toBe(1107);expect(r.data?.tagsLinks.tagNames).toHaveLength(10);const metadata=s.calls.filter(c=>c.table==="dms_document_metadata_values");expect(metadata[0].ops).toContainEqual(["or",["value_text.not.is.null,value_number.not.is.null,value_date.not.is.null,value_datetime.not.is.null,value_boolean.not.is.null,value_json.not.is.null"]]);});
it.each(["dms_document_files","dms_document_content","dms_ai_extraction_results","dms_document_metadata_values","dms_document_tags","dms_ai_tag_suggestions","dms_document_links","dms_ai_link_suggestions","dms_upload_sessions","erp_ai_duplicate_candidates","erp_ai_compliance_findings"])("does not convert a failed %s read to empty intelligence",async table=>{s.fail=table;const r=await getDmsDocumentUnderstanding(9);expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
it("rejects missing counts",async()=>{s.nullCount=true;expect((await getDmsDocumentUnderstanding(9)).success).toBe(false);});
it("retains explicit feature-disabled and inactive-account outcomes",async()=>{s.flag=false;expect((await getDmsDocumentUnderstanding(9)).code).toBe("FEATURE_DISABLED");s.active=false;expect((await getDmsDocumentUnderstanding(9)).success).toBe(false);});
