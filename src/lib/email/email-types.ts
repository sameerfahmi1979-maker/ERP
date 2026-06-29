/**
 * Email System Type Definitions
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Core types for email sending functionality via Microsoft Graph API
 */

/**
 * Email attachment for Microsoft Graph sendMail
 */
export type EmailAttachment = {
  /** Attachment filename with extension */
  filename: string;
  /** MIME content type (e.g., application/pdf, text/csv) */
  contentType: string;
  /** Base64-encoded file content */
  base64Content: string;
  /** Size in bytes (before base64 encoding) */
  sizeBytes: number;
};

/**
 * Email recipient
 */
export type EmailRecipient = {
  /** Email address (required) */
  email: string;
  /** Display name (optional) */
  name?: string;
};

/**
 * Input for sending an email
 */
export type SendEmailInput = {
  /** To recipients (at least 1 required) */
  to: EmailRecipient[];
  /** CC recipients (optional) */
  cc?: EmailRecipient[];
  /** BCC recipients (optional) */
  bcc?: EmailRecipient[];
  /** Email subject (required, max 255 chars) */
  subject: string;
  /** Email body (required, max 10,000 chars) */
  body: string;
  /** Body format (default: "html") */
  bodyFormat?: "text" | "html";
  /** File attachments */
  attachments: EmailAttachment[];
  /** Save to sender's Sent Items folder (default: true) */
  saveToSentItems?: boolean;
};

/**
 * Result from email send operation
 */
export type SendEmailResult = {
  /** Whether email was sent successfully */
  success: boolean;
  /** Provider code used (e.g. provider_code from erp_email_provider_configs) */
  provider: string;
  /** Error message (if failed) */
  error?: string;
  /** HTTP status code (if available) */
  statusCode?: number;
  /** Microsoft Graph error code (if available) */
  graphErrorCode?: string;
};

/**
 * Microsoft Graph configuration
 */
export type MicrosoftGraphConfig = {
  /** Azure AD Tenant ID */
  tenantId: string;
  /** Azure AD Application (Client) ID */
  clientId: string;
  /** Azure AD Client Secret */
  clientSecret: string;
  /** Sender email address (must be valid M365 mailbox) */
  senderEmail: string;
  /** Microsoft Graph API base URL */
  graphBaseUrl: string;
  /** Save sent emails to Sent Items folder */
  saveToSentItems: boolean;
  /** Max attachment size in MB */
  maxAttachmentMB: number;
  /** Max total recipients (To + CC + BCC) */
  maxRecipients: number;
};
