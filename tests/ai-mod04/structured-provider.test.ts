import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiDmsAdapter } from "@/lib/dms/ai/openai-dms-adapter";
import { preparationResponseSchema } from "@/lib/dms/preparation/response-schema";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import { preparationProgressMessage } from "@/lib/dms/preparation/progress";
const config: AiProviderConfig = { id: 9, configCode: "SYNTHETIC_ANALYSIS", providerType: "openai", providerName: "Synthetic", modelId: "gpt-6.1-sol", purpose: "chat", isDefault: false, isEnabled: true, isActive: true, requiresHumanReview: true, confidenceThreshold: 0.85, secretRef: "OPENAI_API_KEY" };
let fetchMock: ReturnType<typeof vi.fn>;
const payload = (message: object = { content: '{}' }, reason = "stop") => new Response(JSON.stringify({ choices: [{ message, finish_reason: reason }], model: "gpt-6.1-sol", usage: { prompt_tokens: 10, completion_tokens: 20 } }));
const call = () => new OpenAiDmsAdapter(config).callStructuredCompletion("JSON", "SYNTHETIC", { maxTokens: 6000, responseSchema: preparationResponseSchema });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-key"); fetchMock = vi.fn().mockResolvedValue(payload()); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("preparation structured provider contract", () => {
  it("requests the exact required schema without changing model or adding unsupported reasoning parameters", async () => {
    await call(); const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: "gpt-6.1-sol", max_completion_tokens: 6000, reasoning_effort: "low", response_format: { type: "json_schema", json_schema: { strict: true, name: "dms_preparation_v1" } } });
    const schema = body.response_format.json_schema.schema;
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.fields.items.additionalProperties).toBe(false);
    expect(schema.properties.documentTypeCode).not.toHaveProperty("default");
    expect(JSON.stringify(schema)).not.toContain('"format":"date"');
    expect(JSON.stringify(schema)).not.toContain('exclusiveMinimum');
    expect(body).not.toHaveProperty("temperature"); expect(body).not.toHaveProperty("max_tokens");
  });
  it.each([[429,"provider_rate_limit"],[401,"provider_authentication"],[400,"provider_request_rejected"],[503,"provider_unavailable"]])("retains safe HTTP %s category without external error text", async (status,code) => {
    fetchMock.mockResolvedValue(new Response("PRIVATE EXTERNAL BODY", { status: Number(status) }));
    await expect(call()).rejects.toMatchObject({code,message:code});expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([["length","provider_output_incomplete"],["content_filter","provider_refusal"]])("returns a durable diagnostic receipt for %s", async(reason,code)=>{
    fetchMock.mockResolvedValue(payload({content:'{"partial":'},reason));
    expect(await call()).toMatchObject({rawJson:'{"partial":',responseIssue:code,promptTokens:10,completionTokens:20});
  });
  it("does not retain private refusal wording",async()=>{
    fetchMock.mockResolvedValue(payload({refusal:"PRIVATE REFUSAL",content:null}));
    const result=await call();expect(result).toMatchObject({rawJson:"",responseIssue:"provider_refusal"});expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("keeps ordinary structured callers fail-closed on incomplete output",async()=>{
    fetchMock.mockResolvedValue(payload({content:'{"partial":'},"length"));
    await expect(new OpenAiDmsAdapter(config).callStructuredCompletion("JSON","SYNTHETIC")).rejects.toMatchObject({code:"provider_output_incomplete"});
  });
  it("reports timeout distinctly without automatic retry",async()=>{
    fetchMock.mockRejectedValue(new DOMException("private destination", "TimeoutError"));
    await expect(call()).rejects.toMatchObject({code:"provider_timeout",message:"provider_timeout"});expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("shows only allowlisted failure explanations, never raw external text",()=>{
    const progress={stage:'held' as const,admitted:true,workerHealthy:true,createdAt:'',startedAt:null,updatedAt:'',errorCode:'provider_output_invalid'};
    expect(preparationProgressMessage(progress)).toContain('unsupported format');
    expect(preparationProgressMessage({...progress,errorCode:'PRIVATE UNTRUSTED ERROR'})).not.toContain('PRIVATE');
    expect(preparationProgressMessage({...progress,errorCode:'__proto__'})).not.toContain('__proto__');
  });
});
