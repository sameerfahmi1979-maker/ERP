import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ queries: [] as Array<Array<[string,...unknown[]]>>, rows: [] as Array<Record<string, unknown>>, count: 0, error: null as unknown }));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>{
  const calls: Array<[string,...unknown[]]> = []; m.queries.push(calls);
  const q = new Proxy({}, {get:(_,key)=>key==="then" ? (ok:(v:unknown)=>unknown,fail:(e:unknown)=>unknown)=>{
    const range=calls.find(c=>c[0]==="range"); const from=Number(range?.[1]??0),to=Number(range?.[2]??499);
    return Promise.resolve({data:m.rows.slice(from,to+1),count:m.count,error:m.error}).then(ok,fail);
  } : (...args:unknown[])=>{calls.push([String(key),...args]);return q;}});return q;
}})}));
import { readDmsUsage } from "@/server/reads/dms-ai-observability";
beforeEach(()=>{m.queries=[];m.rows=[];m.count=0;m.error=null;});
it("applies every filter to every page of the single shared source set",async()=>{
  m.rows=Array.from({length:501},(_,i)=>({id:i+1,status:"success",feature_area:"dms",operation_type:"ocr",model_id:"test-model",provider_config_id:9,input_token_count:1,output_token_count:1,estimated_cost:0,duration_ms:1,document_id:12,created_at:"2026-10-26T00:00:00Z",error_message:null}));m.count=501;
  const data=await readDmsUsage({dateFrom:"2026-10-26",dateTo:"2026-10-26",featureArea:"dms",operationType:"ocr",modelId:"test-model",status:"failed",documentId:12});
  expect(data.overview.totalLogs).toBe(501);expect(m.queries).toHaveLength(2);
  for(const q of m.queries){for(const pair of [["feature_area","dms"],["operation_type","ocr"],["model_id","test-model"],["document_id",12]])expect(q).toContainEqual(["eq",...pair]);
    expect(q).toContainEqual(["in","status",["failed","failure","error"]]);expect(q).toContainEqual(["lt","created_at","2026-10-26T20:00:00.000Z"]);
    expect(q).toContainEqual(["order","id",{ascending:true}]);
    const columns = String(q.find(c=>c[0]==="select")?.[1]);
    expect(columns).not.toMatch(/(?:^|,)metadata_json(?:,|$)|prompt|response|ocr_text/);
    expect(columns).toContain("cost_currency:metadata_json->>cost_currency");
  }
});
it("fails closed on a database cap instead of returning partial totals",async()=>{m.count=600;expect(await readDmsUsage({}).then(()=>false,()=>true)).toBe(true);});
it("fails closed above the bounded workload budget",async()=>{m.count=50001;await expect(readDmsUsage({})).rejects.toThrow();expect(m.queries).toHaveLength(1);});
it("does not query for invalid filters",async()=>{await expect(readDmsUsage({documentId:-1})).rejects.toThrow();expect(m.queries).toHaveLength(0);});
