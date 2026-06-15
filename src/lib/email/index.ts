/**
 * Email System Exports
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Centralized exports for email sending functionality
 */

// Types
export type {
  EmailAttachment,
  EmailRecipient,
  SendEmailInput,
  SendEmailResult,
  MicrosoftGraphConfig,
} from "./email-types";

// Provider interface
export type { EmailProvider } from "./email-provider";

// Provider implementation
export { MicrosoftGraphProvider } from "./microsoft-graph-provider";

// Configuration
export { getMicrosoftGraphConfig } from "./microsoft-graph-config";
export type { MicrosoftGraphConfigResult } from "./microsoft-graph-config";

// Validation helpers
export {
  validateEmail,
  parseEmailList,
  deduplicateRecipients,
  validateSendEmailInput,
} from "./email-validation";

// Attachment utilities
export {
  arrayBufferToBase64,
  stringToBase64Utf8,
  base64SizeBytes,
  formatBytes,
  getTotalAttachmentBytes,
} from "./attachment-utils";
