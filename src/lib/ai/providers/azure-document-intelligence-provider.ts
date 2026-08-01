// ============================================================================
// Azure Document Intelligence Provider
// Phase: ERP SETTINGS.1B
// Implements testConnection for provider_type "azure_document_intelligence".
// OCR analysis itself is handled by src/lib/dms/ai/azure-document-intelligence-adapter.ts.
// Security: API key resolved from process.env[secretRef] at call time — never logged.
// ============================================================================

import type { AiProviderInterface, AiProviderConfig, AiTestConnectionResult } from "./types";

const TEST_TIMEOUT_MS = 10_000;
const DEFAULT_API_VERSION = "2024-11-30";

export class AzureDocumentIntelligenceProvider implements AiProviderInterface {
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
    const fail = (message: string): AiTestConnectionResult => ({
      ok: false,
      status: "failed",
      message,
      durationMs: Date.now() - start,
      providerType: this.config.providerType,
    });

    const endpoint = this.config.apiEndpoint?.replace(/\/+$/, "");
    if (!endpoint) {
      return fail("API Endpoint is not set. Enter your Azure Document Intelligence resource endpoint (https://<resource>.cognitiveservices.azure.com).");
    }

    const secretRef = this.config.secretRef;
    if (!secretRef) {
      return fail("No API key reference configured. Enter the API key in the provider form.");
    }

    const apiKey = process.env[secretRef];
    if (!apiKey) {
      return fail(`Environment variable '${secretRef}' is not set. Save the API key in the provider form.`);
    }

    const apiVersion = this.config.apiVersion?.trim() || DEFAULT_API_VERSION;

    // The "info" operation is the lightest authenticated call.
    // Newer API versions (2024+) use the documentintelligence path;
    // older versions (2023.x and earlier) use formrecognizer.
    const candidatePaths = [
      `${endpoint}/documentintelligence/info?api-version=${encodeURIComponent(apiVersion)}`,
      `${endpoint}/formrecognizer/info?api-version=${encodeURIComponent(apiVersion)}`,
    ];

    let lastError = "";
    for (const url of candidatePaths) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "Ocp-Apim-Subscription-Key": apiKey },
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });

        if (response.ok) {
          return {
            ok: true,
            status: "success",
            message: `Azure Document Intelligence connected (api-version ${apiVersion}, model ${this.config.modelId ?? "prebuilt-read"}).`,
            durationMs: Date.now() - start,
            modelId: this.config.modelId ?? null,
            providerType: this.config.providerType,
          };
        }

        if (response.status === 401 || response.status === 403) {
          return fail("Azure rejected the API key (401/403). Verify KEY 1 in Azure Portal → your resource → Keys and Endpoint, and re-save it in the provider form.");
        }

        // 404 can mean wrong path for this api-version — try the next candidate
        lastError = `HTTP ${response.status} at ${url.split("?")[0]}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return fail(`Cannot reach Azure Document Intelligence at ${endpoint}: ${lastError}. Check the endpoint URL and API version.`);
  }
}
