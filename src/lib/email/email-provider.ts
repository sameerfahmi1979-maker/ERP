/**
 * Email Provider Interface
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Abstract interface for email sending providers
 */

import type { SendEmailInput, SendEmailResult } from "./email-types";

/**
 * Email provider interface
 * 
 * Implementations: MicrosoftGraphProvider
 * Future: SMTPProvider, ResendProvider, SendGridProvider
 */
export interface EmailProvider {
  /**
   * Send an email
   * 
   * @param input - Email details (recipients, subject, body, attachments)
   * @returns Result with success status and error details if failed
   */
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
