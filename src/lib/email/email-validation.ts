/**
 * Email Validation Helpers
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Client and server-side email validation utilities
 */

import type { SendEmailInput, EmailRecipient, MicrosoftGraphConfig } from "./email-types";

/**
 * Email format validation regex
 * Matches: user@domain.com, user.name+tag@sub.domain.co.uk
 * Rejects: user@domain, @domain.com, user@, multiple @
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email address format
 * 
 * @param email - Email address to validate
 * @returns True if valid format
 */
export function validateEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Parse comma/semicolon/newline-separated email list
 * 
 * Supports:
 * - "email1@test.com, email2@test.com"
 * - "email1@test.com; email2@test.com"
 * - "email1@test.com\nemail2@test.com"
 * - Mixed: "email1@test.com, email2@test.com; email3@test.com"
 * 
 * @param input - Raw email list string
 * @returns Array of EmailRecipient objects
 */
export function parseEmailList(input: string): EmailRecipient[] {
  if (!input || !input.trim()) return [];

  // Split by comma, semicolon, or newline
  const emails = input
    .split(/[,;\n]/)
    .map(e => e.trim())
    .filter(e => e.length > 0);

  return emails.map(email => ({
    email: email.toLowerCase(), // Normalize for deduplication
    name: undefined, // Name extraction not implemented yet
  }));
}

/**
 * Remove duplicate recipients across To/CC/BCC
 * 
 * Case-insensitive deduplication using lowercased email addresses
 * Keeps first occurrence of each unique email
 * 
 * @param input - SendEmailInput with potentially duplicate recipients
 * @returns SendEmailInput with deduplicated recipients
 */
export function deduplicateRecipients(input: SendEmailInput): SendEmailInput {
  const seen = new Set<string>();

  const dedupe = (recipients: EmailRecipient[]): EmailRecipient[] => {
    return recipients.filter(r => {
      const email = r.email.toLowerCase().trim();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  };

  return {
    ...input,
    to: dedupe(input.to),
    cc: input.cc ? dedupe(input.cc) : undefined,
    bcc: input.bcc ? dedupe(input.bcc) : undefined,
  };
}

/**
 * Validate SendEmailInput against Microsoft Graph constraints
 * 
 * Validates:
 * - At least 1 To recipient
 * - All email addresses have valid format
 * - Total recipients <= maxRecipients
 * - Subject required and <= 255 chars
 * - Body required and <= 10,000 chars
 * - All attachments have required fields
 * - Total attachment size <= maxAttachmentMB
 * 
 * @param input - Email input to validate
 * @param config - Microsoft Graph configuration (for limits)
 * @returns Validation result with errors array
 */
export function validateSendEmailInput(
  input: SendEmailInput,
  config: MicrosoftGraphConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate recipients
  if (!input.to || input.to.length === 0) {
    errors.push("At least one To recipient is required");
  }

  // Validate all email addresses
  const allRecipients = [
    ...(input.to || []),
    ...(input.cc || []),
    ...(input.bcc || []),
  ];

  for (const recipient of allRecipients) {
    if (!validateEmail(recipient.email)) {
      errors.push(`Invalid email address: ${recipient.email}`);
    }
  }

  // Validate total recipient count
  const totalRecipients = allRecipients.length;
  if (totalRecipients > config.maxRecipients) {
    errors.push(
      `Too many recipients (${totalRecipients}). Maximum: ${config.maxRecipients}`
    );
  }

  // Validate subject
  if (!input.subject || input.subject.trim().length === 0) {
    errors.push("Subject is required");
  } else if (input.subject.length > 255) {
    errors.push("Subject too long (max 255 characters)");
  }

  // Validate body
  if (!input.body || input.body.trim().length === 0) {
    errors.push("Message body is required");
  } else if (input.body.length > 10_000) {
    errors.push("Message body too long (max 10,000 characters)");
  }

  // Validate attachments
  for (const attachment of input.attachments) {
    if (!attachment.filename || attachment.filename.trim().length === 0) {
      errors.push("Attachment filename is required");
    }
    if (!attachment.contentType || attachment.contentType.trim().length === 0) {
      errors.push(`Attachment "${attachment.filename}" missing contentType`);
    }
    if (!attachment.base64Content || attachment.base64Content.trim().length === 0) {
      errors.push(`Attachment "${attachment.filename}" missing base64Content`);
    }
    if (typeof attachment.sizeBytes !== "number" || attachment.sizeBytes <= 0) {
      errors.push(`Attachment "${attachment.filename}" missing or invalid sizeBytes`);
    }
  }

  // Validate total attachment size
  const totalBytes = input.attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  const maxBytes = config.maxAttachmentMB * 1024 * 1024;
  if (totalBytes > maxBytes) {
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    errors.push(
      `Total attachment size too large (${totalMB} MB). Maximum: ${config.maxAttachmentMB} MB`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
