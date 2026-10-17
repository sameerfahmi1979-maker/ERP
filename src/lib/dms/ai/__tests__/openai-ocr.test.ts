import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAiDmsAdapter } from "../openai-dms-adapter";
import type { AiProviderConfig } from "@/lib/ai/providers/types";

const config: AiProviderConfig = { id: 8, configCode: "ARABIC_OCR_AZURE", providerType: "openai",
  providerName: "OpenAI OCR", modelId: "gpt-6.1-sol", purpose: "ocr", isDefault: false,
  isEnabled: true, isActive: true, requiresHumanReview: true, confidenceThreshold: 0.85,
  secretRef: "OPENAI_API_KEY" };
const output = { classification: { suggested_type_code: null, confidence_score: 0.9 },
  full_text_transcription: "ALGT SYNTHETIC OCR 6101", fields: [], warnings: [] };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key-for-tests-only");
  fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 40, completion_tokens: 25 } })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function body() { return JSON.parse(fetchMock.mock.calls[0][1].body); }

describe("GPT-6.1 OCR requests", () => {
  it("transcribes an image using the existing deployment key and compatible reasoning parameters", async () => {
    const result = await new OpenAiDmsAdapter(config).analyze({ ocrText: "", typeCandidates: [], metadataFields: [], currentTypeCode: null,
      imageFiles: [{ fileName: "synthetic.png", mimeType: "image/png", base64: "c3ludGhldGlj" }] });
    expect(result.extraction.fullTextTranscription).toBe("ALGT SYNTHETIC OCR 6101");
    expect(body()).toMatchObject({ model: "gpt-6.1-sol", max_completion_tokens: 16000, reasoning_effort: "low" });
    expect(body()).not.toHaveProperty("temperature"); expect(body()).not.toHaveProperty("max_tokens");
    expect(body().messages[1].content[1]).toMatchObject({ type: "image_url" });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer synthetic-key-for-tests-only");
    expect(JSON.stringify(body())).not.toContain("synthetic-key-for-tests-only");
  });
  it("uses compatible parameters for text classification", async () => {
    await new OpenAiDmsAdapter(config).analyze({ ocrText: "synthetic text", imageFiles: [], typeCandidates: [], metadataFields: [], currentTypeCode: null });
    expect(body()).toMatchObject({ response_format: { type: "json_object" }, reasoning_effort: "low" });
    expect(body()).not.toHaveProperty("temperature");
  });
  it("uses a reasoning budget for summaries and structured metadata", async () => {
    await new OpenAiDmsAdapter(config).summarize("Summarize", "synthetic");
    expect(body()).toMatchObject({ max_completion_tokens: 4096, reasoning_effort: "low" });
    fetchMock.mockClear();
    await new OpenAiDmsAdapter(config).callStructuredCompletion("Return JSON", "synthetic", { maxTokens: 700, temperature: 0.4 });
    expect(body()).toMatchObject({ max_completion_tokens: 4096, response_format: { type: "json_object" } });
    expect(body()).not.toHaveProperty("temperature");
  });
  it("keeps GPT-4.1 parameters unchanged", async () => {
    await new OpenAiDmsAdapter({ ...config, modelId: "gpt-4.1" }).summarize("Summarize", "synthetic");
    expect(body()).toMatchObject({ model: "gpt-4.1", max_tokens: 800, temperature: 0.2 });
    expect(body()).not.toHaveProperty("reasoning_effort");
  });
  it("rejects a stale Azure reference without calling OpenAI", async () => {
    const provider = new OpenAiDmsAdapter({ ...config, secretRef: "AZURE_DOCUMENT_INTELLIGENCE_KEY" });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.summarize("x", "y")).rejects.toThrow("The protected AI credential is unavailable.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps embeddings on their dedicated model", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }], model: "text-embedding-3-small" })));
    await new OpenAiDmsAdapter(config).embedText("synthetic");
    expect(body()).toEqual({ model: "text-embedding-3-small", input: "synthetic" });
  });
});
