// ============================================================================
// ERP AI Provider Abstraction Types
// Phase: ERP SETTINGS.1
// All AI/OCR calls in the ERP must go through these interfaces.
// Never import provider SDKs (openai, @azure/*) directly in feature modules.
// ============================================================================

export type AiProviderType =
  | "openai"
  | "azure_openai"
  | "azure_document_intelligence"
  | "google_document_ai"
  | "aws_textract"
  | "tesseract"
  | "local_ollama"
  | "local_custom";

export type AiOperationType =
  | "chat"
  | "ocr"
  | "classification"
  | "extraction"
  | "embedding"
  | "test_connection";

export type AiPurpose =
  | "general"
  | "chat"
  | "ocr"
  | "classification"
  | "extraction"
  | "embedding"
  | "dms"
  | "assistant";

export type AiTestStatus = "not_tested" | "success" | "failed";

export interface AiProviderConfig {
  id: number;
  configCode: string;
  providerType: AiProviderType;
  providerName: string;
  apiEndpoint?: string | null;
  modelId?: string | null;
  apiVersion?: string | null;
  purpose: AiPurpose;
  isDefault: boolean;
  isEnabled: boolean;
  isActive: boolean;
  requiresHumanReview: boolean;
  confidenceThreshold: number;
  configJson?: Record<string, unknown> | null;
  secretRef?: string | null;
  maskedSecretPreview?: string | null;
  lastTestStatus?: AiTestStatus | null;
  lastTestAt?: string | null;
  lastTestMessage?: string | null;
  notes?: string | null;
}

export interface AiTestConnectionResult {
  ok: boolean;
  status: "success" | "failed";
  message: string;
  durationMs?: number;
  modelId?: string | null;
  providerType?: AiProviderType;
}

export interface AiProviderInterface {
  providerType: AiProviderType;
  config: AiProviderConfig;
  isEnabled: boolean;
  testConnection(): Promise<AiTestConnectionResult>;
}

export interface AiFeatureFlag {
  id: number;
  featureCode: string;
  featureName: string;
  description?: string | null;
  isEnabled: boolean;
  requiresHumanReview: boolean;
  minConfidenceThreshold: number;
}
