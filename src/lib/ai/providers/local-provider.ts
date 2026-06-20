// ============================================================================
// Local / Tesseract / Ollama Provider
// Phase: ERP SETTINGS.1
// Placeholder for local OCR and LLM providers.
// Full implementation in DMS.9+ for Tesseract, future for Ollama.
// ============================================================================

import type { AiProviderInterface, AiProviderConfig, AiTestConnectionResult } from "./types";
import { logger } from "@/lib/logger";

export class LocalProvider implements AiProviderInterface {
  readonly providerType;
  readonly config: AiProviderConfig;
  readonly isEnabled: boolean;

  constructor(config: AiProviderConfig) {
    this.config = config;
    this.providerType = config.providerType;
    this.isEnabled = config.isEnabled;
  }

  async testConnection(): Promise<AiTestConnectionResult> {
    const start = Date.now();

    // Note: isEnabled is NOT checked here — test connection works on disabled providers.
    // The purpose of testing is to verify credentials BEFORE enabling.

    if (this.config.providerType === "tesseract") {
      // Tesseract is a local library — no network test needed.
      // Full validation happens when DMS.9 OCR pipeline is implemented.
      return {
        ok: true,
        status: "success",
        message: "Tesseract OCR is configured as local provider. Full validation available in DMS.9 OCR phase.",
        durationMs: Date.now() - start,
        providerType: this.config.providerType,
      };
    }

    if (this.config.providerType === "local_ollama") {
      const rawEndpoint = this.config.apiEndpoint ?? (process.env[this.config.secretRef ?? "LOCAL_LLM_ENDPOINT"] ?? "http://localhost:11434");
      // Warn if a non-localhost endpoint uses plain HTTP (security risk in production)
      const endpoint = rawEndpoint;
      if (process.env.NODE_ENV === "production" && endpoint.startsWith("http://") && !endpoint.includes("localhost") && !endpoint.includes("127.0.0.1")) {
        logger.warn("AI local provider: Ollama endpoint uses plain HTTP in production. Use HTTPS.", { endpoint: endpoint.replace(/^http:\/\//, "http://[redacted]/") });
      }
      try {
        const response = await fetch(`${endpoint}/api/tags`, {
          signal: AbortSignal.timeout(5000),
        });
        const durationMs = Date.now() - start;
        if (response.ok) {
          return {
            ok: true,
            status: "success",
            message: `Ollama connected at ${endpoint}`,
            durationMs,
            providerType: this.config.providerType,
          };
        } else {
          return {
            ok: false,
            status: "failed",
            message: `Ollama returned ${response.status} at ${endpoint}`,
            durationMs,
            providerType: this.config.providerType,
          };
        }
      } catch (err) {
        return {
          ok: false,
          status: "failed",
          message: `Cannot reach Ollama at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
          durationMs: Date.now() - start,
          providerType: this.config.providerType,
        };
      }
    }

    return {
      ok: false,
      status: "failed",
      message: `Provider type '${this.config.providerType}' test connection not yet implemented.`,
      durationMs: Date.now() - start,
      providerType: this.config.providerType,
    };
  }
}
