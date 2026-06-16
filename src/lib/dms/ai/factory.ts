/**
 * DMS.10 — DMS AI Provider Factory
 *
 * Returns an IDmsAiProvider by trying provider config codes in priority order:
 *   1. DEFAULT_DMS_CLASSIFIER (or DEFAULT_DMS_EXTRACTOR)
 *   2. DEFAULT_CHAT
 *
 * Falls back to a no-op provider if none are configured.
 * Never throws — always returns a provider (may be unconfigured).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { AiProviderConfig } from "@/lib/ai/providers/types";
import type {
  IDmsAiProvider,
  DmsAiInput,
  DmsAiOutput,
  DmsSummaryOutput,
  DmsStructuredCompletionOutput,
  DmsEmbeddingOutput,
} from "./types";
import { OpenAiDmsAdapter } from "./openai-dms-adapter";

const CONFIG_PRIORITY = [
  "DEFAULT_DMS_CLASSIFIER",
  "DEFAULT_DMS_EXTRACTOR",
  "DEFAULT_CHAT",
] as const;

class NoopDmsAiProvider implements IDmsAiProvider {
  readonly providerCode = "noop";
  readonly providerName = "No AI Provider Configured";
  readonly modelId = null;

  isConfigured() {
    return false;
  }

  async analyze(_input: DmsAiInput): Promise<DmsAiOutput> {
    throw new Error(
      "No AI provider is configured. Please configure an AI provider in Administration → Settings → AI Settings."
    );
  }

  async summarize(_systemPrompt: string, _userMessage: string): Promise<DmsSummaryOutput> {
    throw new Error(
      "No AI provider is configured. Please configure an AI provider in Administration → Settings → AI Settings."
    );
  }

  async callStructuredCompletion(
    _systemPrompt: string,
    _userMessage: string,
    _opts?: { maxTokens?: number; temperature?: number }
  ): Promise<DmsStructuredCompletionOutput> {
    throw new Error(
      "No AI provider is configured. Please configure an AI provider in Administration → Settings → AI Settings."
    );
  }

  async embedText(
    _input: string,
    _options?: { model?: string }
  ): Promise<DmsEmbeddingOutput> {
    throw new Error("DMS embedding provider is not configured.");
  }
}

let _noopProvider: NoopDmsAiProvider | null = null;

function getNoopProvider(): NoopDmsAiProvider {
  if (!_noopProvider) _noopProvider = new NoopDmsAiProvider();
  return _noopProvider;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(row: Record<string, any>): AiProviderConfig {
  return {
    id: row.id,
    configCode: row.config_code,
    providerType: row.provider_type,
    providerName: row.provider_name,
    apiEndpoint: row.api_endpoint ?? null,
    modelId: row.model_id ?? null,
    apiVersion: row.api_version ?? null,
    purpose: row.purpose,
    isDefault: row.is_default,
    isEnabled: row.is_enabled,
    isActive: row.is_active,
    requiresHumanReview: row.requires_human_review,
    confidenceThreshold: parseFloat(row.confidence_threshold ?? "0.85"),
    configJson: row.config_json ?? null,
    secretRef: row.secret_ref ?? null,
    maskedSecretPreview: row.masked_secret_preview ?? null,
    lastTestStatus: row.last_test_status ?? null,
    lastTestAt: row.last_test_at ?? null,
    lastTestMessage: row.last_test_message ?? null,
    notes: row.notes ?? null,
  };
}

function createDmsAdapter(config: AiProviderConfig): IDmsAiProvider {
  const type = config.providerType;
  if (type === "openai" || type === "azure_openai") {
    return new OpenAiDmsAdapter(config);
  }
  // Future: add Azure Document Intelligence, etc.
  return getNoopProvider();
}

/**
 * Returns the best available DMS AI provider.
 * Tries config codes in priority order; falls back to noop.
 */
export async function getDmsAiProvider(): Promise<{
  provider: IDmsAiProvider;
  configCode: string | null;
  configId: number | null;
}> {
  try {
    // Use admin client: erp_ai_provider_configs requires settings.ai.view which
    // regular DMS users don't have. Reading provider config is an internal
    // server-side operation — the API key secret_ref is never returned to clients.
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .in("config_code", CONFIG_PRIORITY)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .is("deleted_at", null)
      .order("config_code"); // consistent ordering

    if (error || !data || data.length === 0) {
      return { provider: getNoopProvider(), configCode: null, configId: null };
    }

    // Sort by priority
    const byCode = new Map(
      (data as Record<string, unknown>[]).map((r) => [r.config_code as string, r])
    );

    for (const code of CONFIG_PRIORITY) {
      const row = byCode.get(code);
      if (row) {
        const config = rowToConfig(row as Record<string, unknown>);
        const provider = createDmsAdapter(config);
        if (provider.isConfigured()) {
          return { provider, configCode: code, configId: config.id };
        }
      }
    }

    return { provider: getNoopProvider(), configCode: null, configId: null };
  } catch {
    return { provider: getNoopProvider(), configCode: null, configId: null };
  }
}

// ── Embedding provider (DMS 12.5) ──────────────────────────────────────────────

const EMBEDDING_CONFIG_PRIORITY = ["DEFAULT_EMBEDDING", "DEFAULT_CHAT"] as const;

/**
 * Returns the best available embedding provider.
 * Prefers the dedicated DEFAULT_EMBEDDING config (text-embedding-3-small),
 * falling back to DEFAULT_CHAT's credentials. `modelId` is the embedding
 * model to request (never a chat model). Falls back to noop if none configured.
 */
export async function getDmsEmbeddingProvider(): Promise<{
  provider: IDmsAiProvider;
  configCode: string | null;
  configId: number | null;
  modelId: string;
}> {
  const FALLBACK_EMBEDDING_MODEL = "text-embedding-3-small";
  try {
    // Use admin client for the same reason as getDmsAiProvider.
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("erp_ai_provider_configs")
      .select("*")
      .in("config_code", EMBEDDING_CONFIG_PRIORITY)
      .eq("is_active", true)
      .eq("is_enabled", true)
      .is("deleted_at", null);

    if (error || !data || data.length === 0) {
      return { provider: getNoopProvider(), configCode: null, configId: null, modelId: FALLBACK_EMBEDDING_MODEL };
    }

    const byCode = new Map(
      (data as Record<string, unknown>[]).map((r) => [r.config_code as string, r])
    );

    for (const code of EMBEDDING_CONFIG_PRIORITY) {
      const row = byCode.get(code);
      if (!row) continue;
      const config = rowToConfig(row as Record<string, unknown>);
      const provider = createDmsAdapter(config);
      if (provider.isConfigured()) {
        // Only trust the configured model when this is the dedicated embedding
        // config; the chat fallback's model is not an embedding model.
        const modelId =
          code === "DEFAULT_EMBEDDING" && config.modelId
            ? config.modelId
            : FALLBACK_EMBEDDING_MODEL;
        return { provider, configCode: code, configId: config.id, modelId };
      }
    }

    return { provider: getNoopProvider(), configCode: null, configId: null, modelId: FALLBACK_EMBEDDING_MODEL };
  } catch {
    return { provider: getNoopProvider(), configCode: null, configId: null, modelId: FALLBACK_EMBEDDING_MODEL };
  }
}
