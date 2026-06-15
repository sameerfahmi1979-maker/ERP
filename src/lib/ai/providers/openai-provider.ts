// ============================================================================
// OpenAI / Azure OpenAI Provider
// Phase: ERP SETTINGS.1
// Handles test connection for OpenAI and Azure OpenAI provider types.
// Full chat/extraction support will be added in DMS.10.
// ============================================================================

import type { AiProviderInterface, AiProviderConfig, AiTestConnectionResult } from "./types";

export class OpenAiProvider implements AiProviderInterface {
  readonly providerType = "openai" as const;
  readonly config: AiProviderConfig;
  readonly isEnabled: boolean;

  constructor(config: AiProviderConfig) {
    this.config = config;
    this.isEnabled = config.isEnabled;
  }

  async testConnection(): Promise<AiTestConnectionResult> {
    const start = Date.now();

    // Note: isEnabled is NOT checked here — test connection works on disabled providers.
    // The purpose of testing is to verify credentials BEFORE enabling.

    // Resolve API key from environment variable (secretRef stores the env var name)
    const secretRef = this.config.secretRef;
    if (!secretRef) {
      return {
        ok: false,
        status: "failed",
        message: "No API key reference configured. Add a secret reference in AI Settings.",
        durationMs: Date.now() - start,
        providerType: this.config.providerType,
      };
    }

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      return {
        ok: false,
        status: "failed",
        message: `Environment variable '${secretRef}' is not set. Configure it in your deployment environment.`,
        durationMs: Date.now() - start,
        providerType: this.config.providerType,
      };
    }

    try {
      const baseUrl = this.config.apiEndpoint ?? "https://api.openai.com/v1";
      const response = await fetch(`${baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const durationMs = Date.now() - start;

      if (response.ok) {
        const data = await response.json() as { data?: { id: string }[] };
        const modelId = this.config.modelId;
        const modelFound = modelId
          ? (data.data ?? []).some((m) => m.id === modelId)
          : true;

        return {
          ok: true,
          status: "success",
          message: modelId && !modelFound
            ? `Connected successfully. Note: model '${modelId}' not found in available models.`
            : "Connected successfully.",
          durationMs,
          modelId: this.config.modelId,
          providerType: this.config.providerType,
        };
      } else {
        const body = await response.text();
        return {
          ok: false,
          status: "failed",
          message: `API returned ${response.status}: ${body.substring(0, 200)}`,
          durationMs,
          providerType: this.config.providerType,
        };
      }
    } catch (err: unknown) {
      return {
        ok: false,
        status: "failed",
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - start,
        providerType: this.config.providerType,
      };
    }
  }
}
