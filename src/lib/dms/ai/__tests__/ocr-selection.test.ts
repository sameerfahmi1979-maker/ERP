import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => {
  const query = { select: () => query, in: () => query, or: () => query, eq: () => query, is: () => query,
    order: async () => ({ data: state.rows.filter(row => row.is_enabled && row.is_active), error: null }) };
  return { from: () => query };
} }));
import { getDmsAiProvider } from "../factory";
vi.mock("@/lib/dms/file-content-extractor", () => ({ extractFileContent: async () => ({ hasContent: true, images: [{ fileName: "synthetic.png", mimeType: "image/png", base64: "c3ludGhldGlj" }] }) }));
import { routeOcr } from "@/lib/dms/ocr/ocr-router";
const row = (id: number, code: string, type = "openai", ref = "OPENAI_API_KEY") => ({ id, config_code: code, provider_type: type,
  provider_name: code, model_id: id === 8 ? "gpt-6.1-sol" : "gpt-4.1", is_enabled: true, is_active: true,
  secret_ref: ref, confidence_threshold: "0.85", purpose: id === 8 ? "ocr" : "classification" });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "synthetic-key"); state.rows = [row(3, "DEFAULT_DMS_CLASSIFIER"), row(8, "ARABIC_OCR_AZURE")]; });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("uses the dedicated converted OCR config before classifier/chat", async () => { expect((await getDmsAiProvider("ocr")).configId).toBe(8); });
it("leaves classification/extraction priority unchanged", async () => { expect((await getDmsAiProvider()).configId).toBe(3); });
it("skips disabled/local OCR implementations and preserves OpenAI fallback", async () => {
  state.rows = [row(2, "DEFAULT_DMS_OCR", "tesseract", ""), row(3, "DEFAULT_DMS_CLASSIFIER")];
  expect((await getDmsAiProvider("ocr")).configId).toBe(3);
});
it("rejects stale Azure references and falls back to the configured OpenAI provider", async () => {
  state.rows[1] = row(8, "ARABIC_OCR_AZURE", "openai", "AZURE_DOCUMENT_INTELLIGENCE_KEY");
  expect((await getDmsAiProvider("ocr")).configId).toBe(3);
});
it("returns unconfigured when no approved OpenAI reference resolves", async () => {
  state.rows = [row(8, "ARABIC_OCR_AZURE", "openai", "AZURE_DOCUMENT_INTELLIGENCE_KEY")];
  expect((await getDmsAiProvider("ocr")).provider.isConfigured()).toBe(false);
});
it("selects an enabled custom OCR provider and respects the disabled historical provider", async () => {
  state.rows[1].is_enabled = false;
  state.rows.push({ ...row(9, "OPENAI_OCR"), purpose: "ocr", model_id: "gpt-6.1-sol" });
  const selected = await getDmsAiProvider("ocr");
  expect(selected.configId).toBe(9);
  expect(selected.configCode).toBe("OPENAI_OCR");
  expect(selected.provider.modelId).toBe("gpt-6.1-sol");
  expect(state.rows[1].is_enabled).toBe(false);
  expect((await getDmsAiProvider()).configId).toBe(3);
});
it("prefers the default custom OCR provider with stable fallback ordering", async () => {
  state.rows = [row(3,"DEFAULT_DMS_CLASSIFIER"), { ...row(9,"A_OCR"),purpose:"ocr" },
    { ...row(10,"Z_OCR"),purpose:"ocr",is_default:true }];
  expect((await getDmsAiProvider("ocr")).configId).toBe(10);
});
it("skips unconfigured and non-vision custom OCR providers", async () => {
  state.rows = [row(3,"DEFAULT_DMS_CLASSIFIER"), { ...row(9,"A_OCR","openai","MISSING_KEY"),purpose:"ocr" },
    { ...row(10,"B_OCR","tesseract",""),purpose:"ocr" }];
  expect((await getDmsAiProvider("ocr")).configId).toBe(3);
});
it("routes provider 9 through GPT-6.1 without invoking disabled Azure or changing the existing key", async () => {
  state.rows = [{ ...row(8, "ARABIC_OCR_AZURE"), is_enabled: false },
    { ...row(9, "OPENAI_OCR"), purpose: "ocr", model_id: "gpt-6.1-sol" }];
  const request = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    classification: { suggested_type_code: null, confidence_score: 0.9 },
    full_text_transcription: "ALGT SYNTHETIC OCR 6101", fields: [], warnings: []
  }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })));
  vi.stubGlobal("fetch", request);
  const selected = await getDmsAiProvider("ocr");
  const azure = { providerCode: "azure_doc_intel" as const, providerName: "Disabled Azure",
    supportedMimeTypes: ["image/png"], isConfigured: () => true, supports: () => true, extractText: vi.fn() };
  const result = await routeOcr({ buffer: Buffer.from("synthetic"), mimeType: "image/png", fileName: "synthetic.png",
    featureFlags: { dmsOcr: true, dmsOcrRouter: true, dmsOcrAzure: false, dmsOcrGptVisionFallback: true },
    azureProvider: azure, gptProvider: selected.provider });
  expect(selected.configId).toBe(9);
  expect(result).toMatchObject({ text: "ALGT SYNTHETIC OCR 6101", model: "gpt-6.1-sol", providerCode: "vision" });
  expect(azure.extractText).not.toHaveBeenCalled();expect(request).toHaveBeenCalledOnce();
  const init = request.mock.calls[0] as unknown as [string, RequestInit];
  expect(init[0]).toBe("https://api.openai.com/v1/chat/completions");
  expect((init[1].headers as Record<string,string>).Authorization).toBe("Bearer synthetic-key");
  expect(JSON.parse(String(init[1].body))).toMatchObject({ model: "gpt-6.1-sol", reasoning_effort: "low" });
  expect(process.env.OPENAI_API_KEY).toBe("synthetic-key");expect(state.rows[0].is_enabled).toBe(false);
});
