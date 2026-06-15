// ============================================================================
// ERP Email Provider Abstraction Types
// Phase: ERP SETTINGS.2
//
// All email sending in the ERP must go through these interfaces.
// Never call Microsoft Graph SDK directly in feature modules (DMS, HR, Fleet, etc.).
// Never store secrets in the DB; store only secret_ref (env var name).
// ============================================================================

export type EmailProviderType =
  | "microsoft_graph"
  | "smtp"
  | "sendgrid"
  | "mailgun"
  | "aws_ses"
  | "local_dev"
  | "custom";

export type EmailAuthMode =
  | "client_credentials"
  | "certificate"
  | "delegated_future";

export type EmailSendMode =
  | "graph_send_mail"
  | "smtp_future";

export type EmailTestStatus = "not_tested" | "success" | "failed";

export interface EmailProviderConfig {
  id: number;
  providerCode: string;
  providerType: EmailProviderType;
  providerName: string;
  isDefault: boolean;
  isEnabled: boolean;
  isActive: boolean;
  tenantId?: string | null;
  clientId?: string | null;
  authorityUrl?: string | null;
  graphBaseUrl?: string | null;
  senderEmail?: string | null;
  senderDisplayName?: string | null;
  replyToEmail?: string | null;
  /** env var name or vault secret name — NEVER the actual secret */
  secretRef?: string | null;
  /** Masked display preview e.g. "****abcd" */
  maskedSecretPreview?: string | null;
  authMode: EmailAuthMode;
  sendMode: EmailSendMode;
  defaultRecipientForTests?: string | null;
  throttlePerMinute?: number | null;
  dailySendLimit?: number | null;
  lastTestStatus?: string | null;
  lastTestAt?: string | null;
  lastTestMessage?: string | null;
  configJson?: Record<string, unknown> | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailFeatureFlag {
  id: number;
  featureCode: string;
  featureName: string;
  isEnabled: boolean;
  requiresApproval: boolean;
  notes?: string | null;
  updatedAt: string;
}

export interface EmailMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  replyTo?: string;
  saveToSentItems?: boolean;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  message: string;
  externalMessageId?: string | null;
  durationMs?: number;
}

export interface EmailTestConnectionResult {
  ok: boolean;
  status: "success" | "failed";
  message: string;
  durationMs?: number;
}

export interface IEmailProvider {
  readonly config: EmailProviderConfig;
  testConnection(): Promise<EmailTestConnectionResult>;
  sendEmail(input: EmailMessageInput): Promise<EmailSendResult>;
}

export type EmailSendLogRow = {
  id: number;
  providerConfigId: number | null;
  featureArea: string;
  operationType: string;
  status: string;
  fromEmail: string | null;
  toEmails: string[] | null;
  subject: string | null;
  messagePreview: string | null;
  externalMessageId: string | null;
  durationMs: number | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  providerName?: string | null;
};
