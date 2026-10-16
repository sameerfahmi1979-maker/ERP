import { resolveAiProviderSecret } from "@/lib/settings/resolve-ai-secret";
import { aiEndpoint, providerApiVersion, ProviderConfigurationError, safeProviderFailure } from "@/lib/settings/provider-endpoints";
/**
 * DMS.10 — OpenAI DMS Adapter
 *
 * Extends the SETTINGS.1 OpenAI provider with chat completion for DMS.
 * Uses fetch-native calls (no OpenAI SDK) — same pattern as email provider.
 * API key is resolved from resolveAiProviderSecret(this.config) — never exposed to frontend.
 */

import type { AiProviderConfig } from "@/lib/ai/providers/types";
import type {
  IDmsAiProvider,
  DmsAiInput,
  DmsAiOutput,
  DmsSummaryOutput,
  DmsStructuredCompletionOutput,
  DmsEmbeddingOutput,
} from "./types";
import { buildCombinedPrompt } from "./prompt-builders";
import { validateAiOutput } from "./result-validator";

const COMPLETION_TIMEOUT_MS = 120_000; // 120 seconds — vision + full transcription requests take longer
const MAX_TOKENS = 16_000;            // GPT-4.1 supports up to 16,384 output tokens — raised to capture long transcriptions
const SUMMARY_TIMEOUT_MS = 45_000;   // 45 seconds — text-only requests are faster
const SUMMARY_MAX_TOKENS = 800;      // 3-5 sentence summary
const STRUCTURED_TIMEOUT_MS = 30_000; // 30 seconds — intent/QA/suggestions
const STRUCTURED_DEFAULT_MAX_TOKENS = 600; // intent/QA/suggestions are small outputs
const EMBEDDING_TIMEOUT_MS = 30_000; // 30 seconds
const EMBEDDING_MODEL_DEFAULT = "text-embedding-3-small"; // 1536 dims

export class OpenAiDmsAdapter implements IDmsAiProvider {
  readonly providerCode: string;
  readonly providerName: string;
  readonly modelId: string | null;

  private readonly config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.config = config;
    this.providerCode = config.providerType;
    this.providerName = config.providerName;
    this.modelId = config.modelId ?? "gpt-4.1";
  }

  private destination(operation: "chat/completions" | "embeddings", model: string) {
    if (!this.config.isActive || !this.config.isEnabled || !["openai", "azure_openai"].includes(this.config.providerType))
      throw new ProviderConfigurationError("The AI provider is inactive, disabled or unsupported.");
    const base = aiEndpoint(this.config.providerType, this.config.apiEndpoint);
    if (this.config.providerType === "azure_openai") {
      if (!this.config.modelId || !model || model.length > 200) throw new ProviderConfigurationError("An explicit Azure deployment must be configured.");
      return `${base}/openai/deployments/${encodeURIComponent(model)}/${operation}?api-version=${providerApiVersion(this.config.apiVersion, "2024-10-21")}`;
    }
    return `${base}/${operation}`;
  }

  isConfigured(): boolean {
    try {
      this.destination("chat/completions", this.modelId ?? "");
      return !!resolveAiProviderSecret(this.config);
    } catch { return false; }
  }

  private async request(operation: "chat/completions" | "embeddings", model: string, body: unknown, timeout: number): Promise<Response> {
    const url = this.destination(operation, model);
    const key = resolveAiProviderSecret(this.config);
    if (!key) throw new ProviderConfigurationError("The protected AI credential is unavailable.");
    const headers: Record<string, string> = {"Content-Type": "application/json"};
    if (this.config.providerType === "azure_openai") headers["api-key"] = key;
    else headers.Authorization = `Bearer ${key}`;
    try {
      return await fetch(url, {method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(timeout)});
    } catch (error) { throw new Error(safeProviderFailure(error)); }
  }

  async analyze(input: DmsAiInput): Promise<DmsAiOutput> {
    const { systemPrompt, userContent, hasImages } = buildCombinedPrompt(
      input.ocrText,
      input.typeCandidates,
      input.metadataFields,
      input.currentTypeCode,
      input.imageFiles ?? [],
      input.originalFilename,
      input.classificationPackets
    );

    // Preserve the configured model/deployment identifier exactly.
    const model = this.modelId ?? "gpt-4.1";

    // Use multimodal content array when images are present;
    // fall back to plain string for text-only (wider model compatibility).
    const textPart = userContent[0];
    const userMessage = hasImages
      ? { role: "user", content: userContent }
      : { role: "user", content: textPart.type === "text" ? textPart.text : "" };

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        userMessage,
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.1,
    };

    // json_object response format is only reliable for text-only requests;
    // vision models return structured JSON via prompt instruction instead.
    if (!hasImages) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await this.request("chat/completions", model, requestBody, COMPLETION_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(
        `AI provider request failed (HTTP ${response.status}). External error details are withheld.`
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI provider returned empty response.");

    const validated = validateAiOutput(content);
    if (!validated.ok || !validated.output) {
      throw new Error(validated.error ?? "AI response validation failed.");
    }

    return {
      ...validated.output,
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    };
  }

  async summarize(systemPrompt: string, userMessage: string): Promise<DmsSummaryOutput> {
    // Preserve the configured model/deployment identifier exactly.
    const model = this.modelId ?? "gpt-4.1";

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0.2,
    };

    const response = await this.request("chat/completions", model, requestBody, SUMMARY_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`AI provider request failed (HTTP ${response.status}). External error details are withheld.`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("AI provider returned an empty summary.");

    return {
      summary: content,
      model: data.model ?? model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }

  async callStructuredCompletion(
    systemPrompt: string,
    userMessage: string,
    opts?: { maxTokens?: number; temperature?: number }
  ): Promise<DmsStructuredCompletionOutput> {
    // Preserve the configured model/deployment identifier exactly.
    const model = this.modelId ?? "gpt-4.1";

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: opts?.maxTokens ?? STRUCTURED_DEFAULT_MAX_TOKENS,
      temperature: opts?.temperature ?? 0.0,
      response_format: { type: "json_object" },
    };

    const response = await this.request("chat/completions", model, requestBody, STRUCTURED_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`AI provider request failed (HTTP ${response.status}). External error details are withheld.`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const rawJson = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!rawJson) throw new Error("AI provider returned an empty structured response.");

    return {
      rawJson,
      model: data.model ?? model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }

  async embedText(
    input: string,
    options?: { model?: string }
  ): Promise<DmsEmbeddingOutput> {
    // Never use a chat model for embeddings — default to a real embedding model.
    const model = options?.model ?? EMBEDDING_MODEL_DEFAULT;

    const response = await this.request("embeddings", model, { model, input }, EMBEDDING_TIMEOUT_MS);

    if (!response.ok) {
      throw new Error(`AI provider request failed (HTTP ${response.status}). External error details are withheld.`);
    }

    const data = (await response.json()) as {
      data?: { embedding?: number[] }[];
      usage?: { prompt_tokens?: number };
      model?: string;
    };

    const embedding = data.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error("AI provider returned an empty embedding.");
    }

    return {
      embedding,
      model: data.model ?? model,
      inputTokenCount: data.usage?.prompt_tokens ?? null,
    };
  }
}
