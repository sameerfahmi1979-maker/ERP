/**
 * DMS.10 — OpenAI DMS Adapter
 *
 * Extends the SETTINGS.1 OpenAI provider with chat completion for DMS.
 * Uses fetch-native calls (no OpenAI SDK) — same pattern as email provider.
 * API key is resolved from process.env[secretRef] — never exposed to frontend.
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

const COMPLETION_TIMEOUT_MS = 90_000; // 90 seconds — vision requests take longer
const MAX_TOKENS = 4000;             // increased for detailed field extraction
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
    this.modelId = config.modelId ?? "gpt-4o-mini";
  }

  isConfigured(): boolean {
    if (!this.config.isEnabled || !this.config.isActive) return false;
    const secretRef = this.config.secretRef;
    if (!secretRef) return false;
    return !!process.env[secretRef];
  }

  async analyze(input: DmsAiInput): Promise<DmsAiOutput> {
    const secretRef = this.config.secretRef;
    if (!secretRef) throw new Error("No API key reference configured in AI Settings.");

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      throw new Error(
        `API key environment variable '${secretRef}' is not set. Configure it in your deployment environment.`
      );
    }

    const { systemPrompt, userContent, hasImages } = buildCombinedPrompt(
      input.ocrText,
      input.typeCandidates,
      input.metadataFields,
      input.currentTypeCode,
      input.imageFiles ?? [],
      input.originalFilename
    );

    const baseUrl =
      this.config.apiEndpoint?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    const model = this.modelId ?? "gpt-4o-mini";

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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.apiVersion ? { "api-version": this.config.apiVersion } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI API error ${response.status}: ${body.substring(0, 300)}`
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("AI provider returned empty response.");

    const validated = validateAiOutput(content);
    if (!validated.ok || !validated.output) {
      throw new Error(validated.error ?? "AI response validation failed.");
    }

    return validated.output;
  }

  async summarize(systemPrompt: string, userMessage: string): Promise<DmsSummaryOutput> {
    const secretRef = this.config.secretRef;
    if (!secretRef) throw new Error("No API key reference configured in AI Settings.");

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      throw new Error(
        `API key environment variable '${secretRef}' is not set. Configure it in your deployment environment.`
      );
    }

    const baseUrl =
      this.config.apiEndpoint?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    const model = this.modelId ?? "gpt-4o-mini";

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: SUMMARY_MAX_TOKENS,
      temperature: 0.2,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.apiVersion ? { "api-version": this.config.apiVersion } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body.substring(0, 300)}`);
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
    const secretRef = this.config.secretRef;
    if (!secretRef) throw new Error("No API key reference configured in AI Settings.");

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      throw new Error(
        `API key environment variable '${secretRef}' is not set. Configure it in your deployment environment.`
      );
    }

    const baseUrl =
      this.config.apiEndpoint?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    const model = this.modelId ?? "gpt-4o-mini";

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

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.apiVersion ? { "api-version": this.config.apiVersion } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(STRUCTURED_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body.substring(0, 300)}`);
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
    const secretRef = this.config.secretRef;
    if (!secretRef) throw new Error("No API key reference configured in AI Settings.");

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      throw new Error(
        `API key environment variable '${secretRef}' is not set. Configure it in your deployment environment.`
      );
    }

    const baseUrl =
      this.config.apiEndpoint?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
    // Never use a chat model for embeddings — default to a real embedding model.
    const model = options?.model ?? EMBEDDING_MODEL_DEFAULT;

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(this.config.apiVersion ? { "api-version": this.config.apiVersion } : {}),
      },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body.substring(0, 300)}`);
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
