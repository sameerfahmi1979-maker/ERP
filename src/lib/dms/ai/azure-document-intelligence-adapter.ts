/**
 * DMS ARABIC FIX.1 — Azure Document Intelligence Adapter
 *
 * Provides Arabic-optimized OCR and document extraction via
 * Azure AI Document Intelligence (formerly Form Recognizer).
 *
 * Key advantages over GPT-4.1 vision for Arabic documents:
 * - Native Arabic OCR with proper RTL text direction
 * - Bidi (bidirectional) text handling
 * - Arabic handwriting recognition
 * - Pre-built models for UAE ID cards, passports, invoices
 * - Much lower cost per page vs GPT-4.1 vision
 * - Preserves Arabic table structures and layouts
 *
 * Configuration in erp_ai_provider_configs:
 *   provider_type: "azure_document_intelligence"
 *   api_endpoint: "https://<region>.api.cognitive.microsoft.com"
 *   model_id: "prebuilt-read" | "prebuilt-document" | "prebuilt-idDocument" | "prebuilt-invoice"
 *   secret_ref: "AZURE_DOCUMENT_INTELLIGENCE_KEY" (env var name)
 *   api_version: "2024-11-30" (or latest)
 *
 * Security rules:
 * - API key stays in env var (process.env[secretRef]) — never exposed to client.
 * - Raw OCR text never logged.
 * - Extracted field values never logged.
 */

import type { AiProviderConfig } from "@/lib/ai/providers/types";
import type {
  IDmsAiProvider,
  DmsAiInput,
  DmsAiOutput,
  DmsSummaryOutput,
  DmsStructuredCompletionOutput,
  DmsEmbeddingOutput,
  DmsAiImageFile,
} from "./types";

const AZURE_API_VERSION = "2024-11-30";
const AZURE_TIMEOUT_MS = 60_000; // 60 seconds — Azure is slower than OpenAI for OCR
const POLLING_INTERVAL_MS = 2_000;
const MAX_POLLS = 25; // 25 × 2s = 50 seconds max

// ── Arabic-specific model recommendations ─────────────────────────────────────

/**
 * Recommended Azure Document Intelligence models for Arabic documents:
 *
 * prebuilt-read:
 *   General text extraction. Best for: Arabic PDFs, scanned letters, mixed documents.
 *   Handles: Arabic + English text, RTL layout, tables, handwriting.
 *
 * prebuilt-idDocument:
 *   Optimized for identity documents (Emirates ID, passports, driving licenses).
 *   Pre-trained for UAE ID card layouts. Extracts: name, ID number, nationality, dates.
 *
 * prebuilt-invoice:
 *   Optimized for invoices. Handles Arabic invoice layouts with RTL column structure.
 *   Extracts: vendor name, invoice date, total amount, line items.
 *
 * prebuilt-document:
 *   General document structure (headings, paragraphs, tables, key-value pairs).
 *   Use for: contracts, certificates, agreements.
 */
export const AZURE_DI_MODEL_RECOMMENDATIONS = {
  EMIRATES_ID: "prebuilt-idDocument",
  PASSPORT: "prebuilt-idDocument",
  INVOICE: "prebuilt-invoice",
  GENERAL: "prebuilt-read",
  CONTRACT: "prebuilt-document",
} as const;

// ── Adapter ───────────────────────────────────────────────────────────────────

export class AzureDocumentIntelligenceAdapter implements IDmsAiProvider {
  readonly providerCode: string;
  readonly providerName: string;
  readonly modelId: string | null;

  private readonly config: AiProviderConfig;

  constructor(config: AiProviderConfig) {
    this.config = config;
    this.providerCode = config.providerType;
    this.providerName = config.providerName;
    this.modelId = config.modelId ?? "prebuilt-read";
  }

  isConfigured(): boolean {
    if (!this.config.isEnabled || !this.config.isActive) return false;
    const secretRef = this.config.secretRef;
    if (!secretRef) return false;
    const apiKey = process.env[secretRef];
    if (!apiKey) return false;
    const endpoint = this.config.apiEndpoint;
    return !!(endpoint && endpoint.includes("cognitiveservices.azure.com"));
  }

  // ── OCR via Azure Document Intelligence ────────────────────────────────────

  /**
   * Runs Arabic-optimized OCR using Azure Document Intelligence.
   * Used as an alternative/fallback to GPT-4.1 vision for Arabic documents.
   *
   * Input: base64-encoded file or URL
   * Returns: DmsAiOutput compatible structure (classification is generic)
   */
  async analyzeWithAzureOcr(
    fileBase64: string,
    mimeType: string
  ): Promise<{ success: boolean; text: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, text: "", error: "Azure Document Intelligence is not configured." };
    }

    const secretRef = this.config.secretRef!;
    const apiKey = process.env[secretRef];
    if (!apiKey) {
      return { success: false, text: "", error: "Azure Document Intelligence API key not set." };
    }

    const endpoint = this.config.apiEndpoint!.replace(/\/$/, "");
    const modelId = this.modelId ?? "prebuilt-read";
    const apiVersion = this.config.apiVersion ?? AZURE_API_VERSION;

    const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=${apiVersion}`;

    // Convert base64 to binary for Azure
    const body = JSON.stringify({
      base64Source: fileBase64,
    });

    // Start analysis
    const startResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(AZURE_TIMEOUT_MS),
    });

    if (!startResponse.ok) {
      const errText = await startResponse.text().catch(() => "");
      return {
        success: false,
        text: "",
        error: `Azure Document Intelligence start failed: HTTP ${startResponse.status}`,
      };
    }

    // Azure returns 202 with operation-location header for polling
    const operationLocation = startResponse.headers.get("Operation-Location") ??
                              startResponse.headers.get("operation-location");

    if (!operationLocation) {
      return { success: false, text: "", error: "Azure Document Intelligence: no operation location returned." };
    }

    // Poll for result
    let pollCount = 0;
    while (pollCount < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, POLLING_INTERVAL_MS));
      pollCount++;

      const pollResponse = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        signal: AbortSignal.timeout(15_000),
      });

      if (!pollResponse.ok) continue;

      const result = await pollResponse.json() as Record<string, unknown>;
      const status = result.status as string;

      if (status === "failed") {
        return { success: false, text: "", error: "Azure Document Intelligence analysis failed." };
      }

      if (status === "succeeded") {
        const text = extractTextFromAzureResult(result);
        return { success: true, text };
      }
      // status === "running" or "notStarted" — keep polling
    }

    return { success: false, text: "", error: "Azure Document Intelligence timed out after polling." };
  }

  // ── IDmsAiProvider interface — must implement for factory compatibility ──────

  async analyze(_input: DmsAiInput): Promise<DmsAiOutput> {
    throw new Error(
      "Azure Document Intelligence is used for OCR only. Use analyzeWithAzureOcr() for text extraction, then pass the text to the GPT-4.1 analyze() for classification and metadata extraction."
    );
  }

  async summarize(_systemPrompt: string, _userMessage: string): Promise<DmsSummaryOutput> {
    throw new Error("Azure Document Intelligence does not support text summarisation. Use OpenAI provider for summaries.");
  }

  async callStructuredCompletion(
    _systemPrompt: string,
    _userMessage: string
  ): Promise<DmsStructuredCompletionOutput> {
    throw new Error("Azure Document Intelligence does not support structured completion. Use OpenAI provider.");
  }

  async embedText(_input: string): Promise<DmsEmbeddingOutput> {
    throw new Error("Azure Document Intelligence does not support embeddings. Use OpenAI provider.");
  }
}

// ── Helper: extract text from Azure result ────────────────────────────────────

/**
 * Extracts consolidated text from Azure Document Intelligence analyze result.
 * Preserves Arabic text direction and paragraph structure.
 * Never logged — text is returned to caller for internal use only.
 */
function extractTextFromAzureResult(result: Record<string, unknown>): string {
  const analyzeResult = result.analyzeResult as Record<string, unknown> | null;
  if (!analyzeResult) return "";

  const lines: string[] = [];

  // Extract paragraphs (preserves natural reading order including RTL)
  const paragraphs = analyzeResult.paragraphs as Array<Record<string, unknown>> | null;
  if (paragraphs && paragraphs.length > 0) {
    for (const para of paragraphs) {
      const content = para.content as string;
      if (content?.trim()) lines.push(content.trim());
    }
    return lines.join("\n");
  }

  // Fallback: extract from pages → lines → words
  const pages = analyzeResult.pages as Array<Record<string, unknown>> | null;
  if (pages) {
    for (const page of pages) {
      const pageLines = page.lines as Array<Record<string, unknown>> | null;
      if (pageLines) {
        for (const line of pageLines) {
          const content = line.content as string;
          if (content?.trim()) lines.push(content.trim());
        }
      }
    }
  }

  return lines.join("\n");
}

// ── Get Azure Document Intelligence provider from config ──────────────────────

/**
 * Returns an AzureDocumentIntelligenceAdapter if a valid Azure DI config exists.
 * Used by the OCR pipeline as an alternative provider for Arabic documents.
 */
export function getAzureDocumentIntelligenceAdapter(
  config: AiProviderConfig | null | undefined
): AzureDocumentIntelligenceAdapter | null {
  if (!config) return null;
  if (config.providerType !== "azure_document_intelligence") return null;
  const adapter = new AzureDocumentIntelligenceAdapter(config);
  return adapter.isConfigured() ? adapter : null;
}
