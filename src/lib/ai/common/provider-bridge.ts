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
import {admitAiQualityModelCall,recordAiQualityCall} from '@/server/ai/quality-usage-scope';

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
  options?: { maxTokens?: number; temperature?: number; promptVersion?:string; selectedProvider?:Awaited<ReturnType<typeof getDmsAiProvider>> }
): Promise<CommonAiCallOutcome> {
  const start = Date.now();

  const { provider, configCode, configId } = options?.selectedProvider??await getDmsAiProvider();

  if (!provider.isConfigured()) {
    return {
      success: false,
      error: "AI provider is not configured. Configure a provider in Settings → AI Settings.",
      isProviderNotConfigured: true,
      durationMs: Date.now() - start,
    };
  }

  try{admitAiQualityModelCall();}catch{return {success:false,error:'This turn has reached its model-call limit.',isProviderNotConfigured:false,durationMs:Date.now()-start};}
  try {
    const result = await provider.callStructuredCompletion(
      systemPrompt,
      userPrompt,
      {maxTokens:options?.maxTokens??4000,temperature:options?.temperature??0}
    );

    await recordAiQualityCall({providerConfigId:configId,model:result.model??null,promptVersion:options?.promptVersion,success:true,inputTokens:result.promptTokens??null,outputTokens:result.completionTokens??null,durationMs:Date.now()-start});
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
  } catch {
    await recordAiQualityCall({providerConfigId:configId,model:provider.modelId??null,promptVersion:options?.promptVersion,success:false,inputTokens:null,outputTokens:null,durationMs:Date.now()-start});
    return {
      success: false,
      error: "AI provider could not complete this request. Try again later or contact your administrator.",
      isProviderNotConfigured: false,
      durationMs: Date.now() - start,
    };
  }
}
