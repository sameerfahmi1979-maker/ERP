import {beforeEach,describe,expect,it,vi} from "vitest";
import native from "./fixtures/native-comparison.json";
import {compareDocumentSources} from "@/server/ai/document-comparison";
const m=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),principal:vi.fn(),delivery:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:m.actor}));
vi.mock("@/server/ai/search/document-query",()=>({assertSearchPrincipal:m.principal}));
vi.mock("@/server/ai/search/security",()=>({verifySearchDelivery:m.delivery}));
const sources=native.sources.map(s=>({documentId:s.documentId,versionId:s.versionId}));
beforeEach(()=>{vi.resetAllMocks();m.actor.mockResolvedValue({synthetic:true});m.rpc.mockResolvedValue({data:native,error:null});m.delivery.mockResolvedValue(undefined);});
describe("actual native comparison to API contract",()=>{
 it("accepts the native DTO, including typed header dates and partial source precision",async()=>{const r=await compareDocumentSources({sources});expect(r.success).toBe(true);if(!r.success)return;expect(r.data.sources[0].facts.some(f=>f.key==="document.expiry_date")).toBe(true);expect(r.data.sourcePrecision).toContain("no invented");expect(m.delivery).toHaveBeenCalledTimes(1);});
 it("read-only comparison never asks native SQL to record findings",async()=>{await compareDocumentSources({sources});expect(m.rpc.mock.calls[0][1]).toMatchObject({p_record_findings:false,p_expected_hashes:null});});
 it("does not deliver an unrelated source receipt",async()=>{m.rpc.mockResolvedValue({data:{...native,sources:[{...native.sources[0],documentId:999999},native.sources[1]]},error:null});expect((await compareDocumentSources({sources})).success).toBe(false);});
 it("retires the receipt when delivery authority changes",async()=>{m.delivery.mockRejectedValue(Error("revoked"));const result=await compareDocumentSources({sources});expect(result.success).toBe(false);expect(result).not.toHaveProperty("data");});
 it("does not convert a permission failure into an empty successful comparison",async()=>{m.rpc.mockResolvedValue({error:{code:"42501"},data:null});expect(await compareDocumentSources({sources})).toMatchObject({success:false,error:"Permission denied"});});
});
