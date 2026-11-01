import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createClient as createSupabaseClient, type SupabaseClient} from "@supabase/supabase-js";
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import {aiSearchTextTerms, buildAiSearchTextQuery, matchAiSearchLookups} from "@/lib/dms/ai/search-text";
import {searchDmsDocumentsByIntent} from "../ai-search";
import type {DmsSearchIntent} from "@/lib/dms/ai/types";

const state = vi.hoisted(() => ({
  allowed: true, admin: true, lookupError: false, searchError: false, errorCode:"XX000", resolvedSubject:false,
  types: [] as Array<{id:number;name_en:string;type_code:string}>,
  categories: [] as Array<{id:number;name_en:string}>,
  requests: [] as URL[],
  client: null as SupabaseClient | null,
}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => state.client}));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({profile:{id:7,must_change_password:false},isAccountActive:true,accountStatus:"active",permissionCodes:["dms.documents.view"],roleCodes:state.admin ? ["system_admin"] : []}),
  hasPermission: (_ctx:unknown, permission:string) =>
    permission === "dms.documents.view" ? state.allowed : permission === "dms.admin" && state.admin,
}));
vi.mock("@/server/actions/audit", () => ({logAudit:vi.fn()}));
vi.mock("@/lib/dms/ai/factory", () => ({getDmsAiProvider:vi.fn()}));
vi.mock("@/lib/ai/observability/log-dms-ai-usage", () => ({logDmsAiUsage:vi.fn()}));
const diagnostic = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({logger:{error:diagnostic}}));

const certificateQuery = "'iso' & ('certificate' | 'certificates' | 'certification' | 'certifications')";
const intent = (patch:Partial<DmsSearchIntent> = {}):DmsSearchIntent => ({
  keywords:["iso","certificates"],document_type_hint:null,category_hint:null,
  person_name_hint:null,party_name_hint:null,person_dob_hint:null,date_from:null,date_to:null,
  expiry_state:null,outcome_hint:null,risk_hint:null,metadata_filters:[],confidentiality_max:null,
  ...patch,
});
const documentRequest = () => state.requests.find(url => url.pathname.endsWith("/ai_mod02_search_documents"));

beforeEach(() => {
  Object.assign(state,{allowed:true,admin:true,lookupError:false,searchError:false,errorCode:"XX000",resolvedSubject:false,types:[],categories:[],requests:[]});
  diagnostic.mockClear();
  state.client = withDocumentReadPolicy(createSupabaseClient("http://127.0.0.1:1", "synthetic-not-a-key", {
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async input => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      state.requests.push(url);
      const table = url.pathname.split("/").at(-1);
      if(table === "dms_document_types" || table === "dms_document_categories") {
        if(state.lookupError) return new Response(JSON.stringify({code:"XX000",message:"Synthetic lookup failure"}),{status:500});
        const rows = table === "dms_document_types" ? state.types : state.categories;
        const from = Number(url.searchParams.get("offset") ?? 0);
        const size = Number(url.searchParams.get("limit") ?? 1000);
        const slice = rows.slice(from,from+size);
        return new Response(JSON.stringify(slice),{
          headers:{"Content-Type":"application/json","Content-Range":from+"-"+Math.max(from,from+slice.length-1)+"/"+rows.length},
        });
      }
      if(table==="ai_mod02_resolve_subject")return new Response(JSON.stringify(state.resolvedSubject?[{entity_type:"employee",entity_id:901,label:"Synthetic Person",code:"EMP-SYN-901"}]:[]),{headers:{"Content-Type":"application/json"}});
      if(table !== "ai_mod02_search_documents") throw new Error("Unexpected test request: "+table);
      // PostgREST's ordered function result must retain the ordering column in
      // its projection. This reproduces the owner's 42703(created_at) receipt.
      if(url.searchParams.get("order")?.includes("created_at") && !url.searchParams.get("select")?.split(",").includes("created_at")) {
        return new Response(JSON.stringify({code:"42703",message:'column "created_at" does not exist'}),{status:400});
      }
      if(state.searchError) return new Response(JSON.stringify({code:state.errorCode,message:"Private synthetic search text",details:"Private source facts"}),{status:500});
      return new Response(JSON.stringify([{
        id:901,document_no:"DMS-TEST-901",title:"Synthetic ISO 9001 Certificate",expiry_date:"2030-01-01",
        ai_summary:"Synthetic summary",ai_risk_level:null,completeness_score:100,
        content_text:"Must not be returned",content_tsv:"Must not be returned",
      }]),{headers:{"Content-Type":"application/json","Content-Range":"0-0/1"}});
    }},
  }));
});

afterEach(() => {
  for (const url of state.requests.filter(url=>url.pathname.endsWith("/ai_mod02_search_documents"))) {
    for (const field of ["subject_type","subject_id","linked_type","expiry_state"]) {
      expect(url.searchParams.get(field)).not.toBe("null");
    }
    expect(()=>JSON.parse(url.searchParams.get("metadata_filters")??"[]")).not.toThrow();
  }
});

describe("document vocabulary without fuzzy identity expansion", () => {
  it.each(["certificate","certificates","certification","certifications"])("treats %s as a reviewed certificate alternative",word => {
    expect(buildAiSearchTextQuery(["ISO",word])).toBe(certificateQuery);
  });
  it("keeps ISO standard numbers mandatory",() => {
    expect(buildAiSearchTextQuery(["ISO 9001","certificates"])).toContain("'iso' & '9001' & (");
  });
  it.each([
    "DMS-2026-000741", "784-1985-8637035-9", "person@example.test",
    "ISO-9001", "ABC/123", "2026-10-30", "12.5", "ISO_9001_CERT",
  ])("preserves PostgreSQL literal boundaries for %s through intent normalization", value => {
    const terms = aiSearchTextTerms(intent({keywords:[value]}),false,false);
    expect(buildAiSearchTextQuery(terms)).toBe("'"+value.toLowerCase()+"'");
  });
  it("keeps literal identifiers in unresolved hints and independent subjects",() => {
    const terms = aiSearchTextTerms(intent({keywords:[], document_type_hint:"ISO-9001",
      category_hint:"ABC/123", person_name_hint:"person@example.test",
      party_name_hint:"Example.Company", outcome_hint:"2026-10-30"}),false,false);
    expect(buildAiSearchTextQuery(terms)).toBe(
      "'iso-9001' & 'abc/123' & 'person@example.test' & 'example.company' & '2026-10-30'",
    );
  });
  it("removes an exact resolved type code without splitting an independent reference",() => {
    const terms = aiSearchTextTerms(intent({keywords:["ISO_9001","DMS-2026-000741"],
      document_type_hint:"ISO_9001"}),true,false);
    expect(buildAiSearchTextQuery(terms)).toBe("'dms-2026-000741'");
  });
  it("does not turn separate names into OR alternatives",() => {
    expect(buildAiSearchTextQuery(["Sameer Fahmi","passport"])).toBe("'sameer' & 'fahmi' & 'passport'");
  });
  it("supports Arabic literal tokens",() => {
    expect(buildAiSearchTextQuery(["شهادة","ISO"])).toBe("'شهادة' & 'iso'");
  });
  it("cannot inject query operators or prefix modifiers",() => {
    expect(buildAiSearchTextQuery(["iso | !foo:* (bar)"])).toBe("'iso' & 'foo' & 'bar'");
  });
  it("deduplicates repeated certificate words",() => {
    expect(buildAiSearchTextQuery(["ISO","certificate","certificates"])).toBe(certificateQuery);
  });
  it("rejects oversized query construction",() => {
    expect(() => buildAiSearchTextQuery(["x".repeat(121)])).toThrow();
  });
  it("does not generate a query for punctuation",() => expect(buildAiSearchTextQuery(["()|!*"])).toBeNull());
  it("matches all applicable ISO types, excluding other certificates",() => {
    const rows=[{id:1,name_en:"ISO 9001 Certificate"},{id:2,name_en:"ISO 14001 Certification"},{id:3,name_en:"Training Certificate"}];
    expect(matchAiSearchLookups("ISO certificates",rows).map(row=>row.id)).toEqual([1,2]);
    expect(matchAiSearchLookups("ISO 9001 certificates",rows).map(row=>row.id)).toEqual([1]);
  });
  it("does not match ISO inside an unrelated word",() => {
    expect(matchAiSearchLookups("ISO certificate",[{id:1,name_en:"Isolation Certificate"}])).toEqual([]);
  });
  it("retains person constraints even when a lookup covers the same word",() => {
    const terms=aiSearchTextTerms(intent({document_type_hint:"ISO certificate",person_name_hint:"ISO"}),true,false);
    expect(terms).toEqual(["iso"]);
  });
});

describe("AI document search server action with real PostgREST request construction", () => {
  it("does not request unused embedded relations or confidential source columns",async()=>{
    await searchDmsDocumentsByIntent(intent());
    expect(documentRequest()?.searchParams.get("select")).toBe("id,document_no,title,created_at,expiry_date,ai_risk_level,completeness_score,ai_summary");
  });
  it("searches a verified person even without additional text or type filters",async()=>{
    state.resolvedSubject=true;
    const result=await searchDmsDocumentsByIntent(intent({keywords:[],person_name_hint:"Synthetic Person"}));
    expect(result.success).toBe(true);
    expect(documentRequest()?.searchParams.get("subject_id")).toBe("901");
    expect(documentRequest()?.searchParams.get("subject_type")).toBe("employee");
  });
  it.each(["57014","42501","PGRST200","XX000","private question text"])("returns only a safe failure reference for %s",async code=>{
    state.searchError=true;state.errorCode=code;
    const result=await searchDmsDocumentsByIntent(intent());
    const safeCode=code==="private question text"?"UNAVAILABLE":code;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Reference: "+safeCode);
    expect(diagnostic).toHaveBeenCalledWith("DMS AI search query failed",{code:safeCode});
    expect(JSON.stringify([result,diagnostic.mock.calls])).not.toContain("Private");
    expect(state.requests.filter(url=>url.pathname.endsWith("/ai_mod02_search_documents"))).toHaveLength(1);
  });
  it("uses normalized alternatives with the explicit full-text parser",async () => {
    await searchDmsDocumentsByIntent(intent());
    expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple)."+certificateQuery);
  });
  it.each(["DMS-2026-000741","person@example.test","ISO-9001"])(
    "passes the literal %s unchanged to the protected read",async value => {
      await searchDmsDocumentsByIntent(intent({keywords:[value]}));
      expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple).'"+value.toLowerCase()+"'");
    },
  );
  it("uses the protected F03 document read and a bounded result",async () => {
    const result=await searchDmsDocumentsByIntent(intent());
    expect(result.success).toBe(true);
    expect(documentRequest()?.searchParams.get("limit")).toBe("25");
    expect(documentRequest()?.searchParams.get("deleted_at")).toBe("is.null");
    expect(JSON.stringify(result)).not.toContain("Must not be returned");
  });
  it("does not return the search vector in its projection",async () => {
    await searchDmsDocumentsByIntent(intent());
    expect(documentRequest()?.searchParams.get("select")).not.toContain("content_tsv");
  });
  it("filters every matching ISO type and does not re-require type words in the title",async () => {
    state.types=[{id:101,name_en:"ISO 9001 Certificate",type_code:"ISO_9001"},{id:102,name_en:"ISO 14001 Certificate",type_code:"ISO_14001"},{id:103,name_en:"Training Certificate",type_code:"TRAINING"}];
    await searchDmsDocumentsByIntent(intent({document_type_hint:"ISO certificates"}));
    expect(documentRequest()?.searchParams.get("document_type_id")).toBe("in.(101,102)");
    expect(documentRequest()?.searchParams.has("content_tsv")).toBe(false);
  });
  it("finds matching types after the old first-50 cutoff",async () => {
    state.types=Array.from({length:101},(_,i)=>({id:i+1,name_en:"Other Type "+i,type_code:"OTHER_"+i}));
    state.types.push({id:501,name_en:"ISO Certificate",type_code:"ISO_CERT"});
    await searchDmsDocumentsByIntent(intent({document_type_hint:"ISO certificates"}));
    expect(documentRequest()?.searchParams.get("document_type_id")).toBe("in.(501)");
    expect(state.requests.filter(url=>url.pathname.endsWith("/dms_document_types"))).toHaveLength(2);
  });
  it("retains an unresolved type hint as a mandatory text constraint",async () => {
    await searchDmsDocumentsByIntent(intent({keywords:[],document_type_hint:"ISO certificates"}));
    expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple)."+certificateQuery);
  });
  it("holds an unresolved explicit party instead of matching an OCR company mention",async () => {
    state.types=[{id:1,name_en:"ISO Certificate",type_code:"ISO_CERT"}];
    const result=await searchDmsDocumentsByIntent(intent({document_type_hint:"ISO certificate",party_name_hint:"Example Company"}));
    expect(result.success).toBe(false);
    expect(documentRequest()).toBeUndefined();
  });
  it("does not hide lookup failures as empty or unfiltered results",async () => {
    state.lookupError=true;
    const result=await searchDmsDocumentsByIntent(intent({document_type_hint:"ISO certificate"}));
    expect(result.success).toBe(false);
    expect(documentRequest()).toBeUndefined();
  });
  it("retains an unresolved category constraint",async () => {
    await searchDmsDocumentsByIntent(intent({keywords:["ISO"],category_hint:"Quality"}));
    expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple).'iso' & 'quality'");
  });
  it("preserves expiry and explicit standard-number restrictions",async () => {
    await searchDmsDocumentsByIntent(intent({keywords:["ISO","9001","certificates"],expiry_state:"expired"}));
    expect(documentRequest()?.searchParams.get("expiry_date")).toMatch(/^lt\.\d{4}-\d{2}-\d{2}$/);
    expect(documentRequest()?.searchParams.get("content_tsv")).toContain("'9001'");
  });
  it("returns a query failure, not a successful empty result",async () => {
    state.searchError=true;
    expect((await searchDmsDocumentsByIntent(intent())).success).toBe(false);
  });
  it("does not query records without document-view permission",async () => {
    state.allowed=false;
    expect((await searchDmsDocumentsByIntent(intent())).success).toBe(false);
    expect(state.requests).toEqual([]);
  });
  it("preserves the existing confidentiality restriction",async () => {
    state.admin=false;
    await searchDmsDocumentsByIntent(intent());
    expect(documentRequest()?.searchParams.get("confidentiality_level")).toBe("not.in.(hr,legal,executive)");
  });
  it("does not run a broad document search for an empty intent",async () => {
    expect((await searchDmsDocumentsByIntent(intent({keywords:[]}))).data).toEqual([]);
    expect(documentRequest()).toBeUndefined();
  });

  it("keeps the specific ISO number when resolving a wider certificate family",async () => {
    state.types=[{id:1,name_en:"ISO 9001 Certificate",type_code:"ISO_9001"},{id:2,name_en:"ISO 14001 Certificate",type_code:"ISO_14001"}];
    await searchDmsDocumentsByIntent(intent({keywords:["ISO","9001","certificates"],document_type_hint:"ISO certificate"}));
    expect(documentRequest()?.searchParams.get("document_type_id")).toBe("in.(1,2)");
    expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple).'9001'");
  });
  it("resolves categories beyond the old first-50 cutoff",async () => {
    state.categories=Array.from({length:101},(_,i)=>({id:i+1,name_en:"Other "+i}));
    state.categories.push({id:701,name_en:"Quality"});
    await searchDmsDocumentsByIntent(intent({category_hint:"Quality"}));
    expect(documentRequest()?.searchParams.get("category_id")).toBe("in.(701)");
    expect(documentRequest()?.searchParams.get("content_tsv")).toBe("fts(simple)."+certificateQuery);
  });
  it("does not ignore failed category reads",async () => {
    state.lookupError=true;
    expect((await searchDmsDocumentsByIntent(intent({category_hint:"Quality"}))).success).toBe(false);
    expect(documentRequest()).toBeUndefined();
  });
  it("fails explicitly if the lookup inventory exceeds its safe bound",async () => {
    state.types=Array.from({length:5001},(_,i)=>({id:i+1,name_en:"ISO Certificate "+i,type_code:"ISO_"+i}));
    expect((await searchDmsDocumentsByIntent(intent({document_type_hint:"ISO certificate"}))).success).toBe(false);
    expect(documentRequest()).toBeUndefined();
  });
  it("validates direct action inputs before querying",async () => {
    const result=await searchDmsDocumentsByIntent({keywords:42} as unknown as DmsSearchIntent);
    expect(result).toEqual({success:false,error:"Invalid search filters."});
    expect(state.requests).toEqual([]);
  });
  it("accepts an explicit date range without inventing keywords",async () => {
    const result=await searchDmsDocumentsByIntent(intent({keywords:[],date_from:"2026-01-01",date_to:"2026-12-31"}));
    expect(result.success).toBe(true);
    expect(documentRequest()?.searchParams.getAll("issue_date")).toEqual(["gte.2026-01-01","lte.2026-12-31"]);
    expect(documentRequest()?.searchParams.has("content_tsv")).toBe(false);
  });
});
