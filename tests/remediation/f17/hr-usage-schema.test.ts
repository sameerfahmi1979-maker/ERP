import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({insert:vi.fn(),rate:{rate_type:"token",input_cost_per_1m_tokens:1,output_cost_per_1m_tokens:2,requires_confirmation:false,currency_code:"USD"} as Record<string,unknown>,warnings:vi.fn()}));
vi.mock("@/lib/logger",()=>({logger:{warn:m.warnings}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
 const q:Record<string,unknown>={};for(const method of ["select","eq","lte","or","order","limit"])q[method]=()=>q;
 q.insert=(value:unknown)=>{m.insert(value);return q;};q.single=async()=>({data:{id:1},error:null});q.maybeSingle=async()=>({data:table==="erp_ai_provider_configs"?{provider_type:"test"}:m.rate,error:null});return q;
}})}));
import { logHrAiUsage } from "@/lib/hr/ai/usage-log";
const input={featureCode:"ERP_AI_HR_CORRECTIONS",entityId:8,outputType:"correction_suggestions",status:"success" as const,durationMs:5,model:"synthetic-model",promptTokens:100,completionTokens:20,profileId:1,providerCode:"test",configCode:"test",configId:9};
beforeEach(()=>{vi.clearAllMocks();m.rate={rate_type:"token",input_cost_per_1m_tokens:1,output_cost_per_1m_tokens:2,requires_confirmation:false,currency_code:"USD"};});
it("writes canonical columns and minimal subject metadata",async()=>{
 await logHrAiUsage(input);expect(m.insert).toHaveBeenCalledOnce();
 const row=m.insert.mock.calls[0][0];expect(row).toMatchObject({feature_area:input.featureCode,operation_type:input.outputType,provider_config_id:9,created_by:1,input_token_count:100,metadata_json:{entity_type:"employee",entity_id:8,cost_currency:"USD"}});
 expect(Object.keys(row)).not.toContain("feature_code");expect(Object.keys(row)).not.toContain("model_used");expect(row.estimated_cost).toBeCloseTo(.00014);
});
it.each(["currency","missing tokens","missing rate","unconfirmed"])("does not invent a cost for %s",async condition=>{
 const params={...input};if(condition==="currency")m.rate.currency_code="AED";if(condition==="missing tokens")params.promptTokens=null as never;if(condition==="missing rate")m.rate.input_cost_per_1m_tokens=null;if(condition==="unconfirmed")m.rate.requires_confirmation=true;
 await logHrAiUsage(params);const row=m.insert.mock.calls[0][0];expect(row.estimated_cost).toBeNull();expect(row.metadata_json.cost_currency).toBeNull();
});
it("normalizes failure status to the canonical status",async()=>{await logHrAiUsage({...input,status:"failure"});expect(m.insert.mock.calls[0][0].status).toBe("failed");});
