// ============================================================================
// ERP AI Provider Factory
// Phase: ERP SETTINGS.1
// Returns the appropriate provider implementation for a given config code.
// All DMS and ERP feature modules must use this factory — never direct SDK imports.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import type { AiProviderInterface, AiProviderConfig } from "./types";
import { OpenAiProvider } from "./openai-provider";
import { LocalProvider } from "./local-provider";

/**
 * Fetches an AI provider by config_code from erp_ai_provider_configs.
 * Returns a provider interface ready for use.
 *
 * Usage:
 *   const provider = await getAiProvider("DEFAULT_DMS_EXTRACTOR");
 *   if (!provider.isEnabled) throw new Error("AI extraction is not enabled");
 *   const result = await provider.testConnection();
 */
export async function getAiProvider(configCode: string): Promise<AiProviderInterface> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_provider_configs")
    .select("*")
    .eq("config_code", configCode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`AI provider config not found: ${configCode}`);
  }

  const config: AiProviderConfig = mapRowToConfig(data);
  return createProvider(config);
}

/**
 * Fetches the default provider for a given purpose.
 */
export async function getDefaultAiProvider(purpose: string): Promise<AiProviderInterface> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("erp_ai_provider_configs")
    .select("*")
    .eq("purpose", purpose)
    .eq("is_default", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new Error(`No default AI provider found for purpose: ${purpose}`);
  }

  const config: AiProviderConfig = mapRowToConfig(data);
  return createProvider(config);
}

function createProvider(config: AiProviderConfig): AiProviderInterface {
  switch (config.providerType) {
    case "openai":
    case "azure_openai":
      return new OpenAiProvider(config);
    case "tesseract":
    case "local_ollama":
    case "local_custom":
      return new LocalProvider(config);
    default:
      // Fallback: return a disabled local provider for unimplemented types
      return new LocalProvider({ ...config, isEnabled: false });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToConfig(row: Record<string, any>): AiProviderConfig {
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
