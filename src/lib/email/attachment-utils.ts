/**
 * Attachment Utility Functions
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Server-side helpers for attachment processing
 */

import type { EmailAttachment } from "./email-types";

/**
 * Convert ArrayBuffer to base64 string
 * 
 * Used for PDF and Excel attachment generation
 * 
 * @param buffer - ArrayBuffer from jsPDF or XLSX
 * @returns Base64-encoded string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert UTF-8 string to base64
 * 
 * Used for CSV attachment generation
 * Handles UTF-8 characters correctly (including emojis, Arabic, etc.)
 * 
 * @param value - UTF-8 string
 * @returns Base64-encoded string
 */
export function stringToBase64Utf8(value: string): string {
  // Handle UTF-8 properly (including emojis and non-ASCII characters)
  return btoa(unescape(encodeURIComponent(value)));
}

/**
 * Calculate size in bytes from base64 string
 * 
 * Base64 encoding adds ~33% overhead, so decode to get actual size
 * 
 * @param base64 - Base64-encoded string
 * @returns Size in bytes (original data, not base64 string length)
 */
export function base64SizeBytes(base64: string): number {
  // Remove padding
  const padding = (base64.match(/=/g) || []).length;
  // Base64 is 4/3 the size of original data
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Format bytes as human-readable string
 * 
 * Examples:
 * - 512 → "512 B"
 * - 2048 → "2.0 KB"
 * - 1536000 → "1.5 MB"
 * 
 * @param bytes - Size in bytes
 * @returns Formatted string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get total attachment size in bytes
 * 
 * @param attachments - Array of email attachments
 * @returns Total size in bytes (sum of all sizeBytes)
 */
export function getTotalAttachmentBytes(attachments: EmailAttachment[]): number {
  return attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
}
