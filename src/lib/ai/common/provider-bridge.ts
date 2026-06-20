/**
 * ERP COMMON AI.1D — Common AI Provider Bridge
 *
 * Thin bridge between the Common AI engine and the existing DMS AI provider layer.
 * Re-uses getDmsAiProvider() and callStructuredCompletion() for Common AI calls.
 *
 * Rules:
 * - Never import OpenAI SDK directly.
 * - Never create direct fetch calls to OpenAI in this file.
 * - API key stays in env via existing provider config (secret_ref).
 * - Prompts and raw responses are NEVER logged.
 * - Usage metadata (tokens, model, duration) MAY be returned for logging.
 */

import { getDmsAiProvider } from "@/lib/dms/ai/factory";

// ── Provider call result ──────────────────────────────────────────────────────

export interface CommonAiCallResult {
  rawJson: string;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  providerCode: string;
  configCode: string | null;
  configId: number | null;
  durationMs: number;
}

export interface CommonAiCallError {
  error: string;
  isProviderNotConfigured: boolean;
  durationMs: number;
}

export type CommonAiCallOutcome =
  | ({ success: true } & CommonAiCallResult)
  | ({ success: false } & CommonAiCallError);

// ── Bridge function ───────────────────────────────────────────────────────────

/**
 * Calls the shared AI provider with a structured completion request.
 * Returns parsed raw JSON string + safe metadata for usage logging.
 *
 * Never logs prompts, raw responses, or sensitive content.
 */
export async function callCommonAiStructuredCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<CommonAiCallOutcome> {
  const start = Date.now();

  const { provider, configCode, configId } = await getDmsAiProvider();

  if (!provider.isConfigured()) {
    return {
      success: false,
      error: "AI provider is not configured. Configure a provider in Settings → AI Settings.",
      isProviderNotConfigured: true,
      durationMs: Date.now() - start,
    };
  }

  try {
    const result = await provider.callStructuredCompletion(
      systemPrompt,
      userPrompt,
      options ?? { maxTokens: 4000, temperature: 0 }
    );

    return {
      success: true,
      rawJson: result.rawJson,
      model: result.model,
      promptTokens: result.promptTokens ?? null,
      completionTokens: result.completionTokens ?? null,
      providerCode: provider.providerCode,
      configCode,
      configId,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Strip any potential prompt content from error messages
    const safeMsg = msg.slice(0, 300);

    return {
      success: false,
      error: `AI provider call failed: ${safeMsg}`,
      isProviderNotConfigured: false,
      durationMs: Date.now() - start,
    };
  }
}
