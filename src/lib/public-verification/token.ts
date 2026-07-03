/**
 * Public Verification — Secure Token Generation
 * Phase: BRANDING.6
 *
 * Generates cryptographically secure, URL-safe verification tokens.
 * Uses Node.js crypto — server-side only.
 */

import { randomBytes } from "crypto";

/**
 * Generate a cryptographically secure, URL-safe verification token.
 *
 * - Uses `crypto.randomBytes(32)` → 256 bits of entropy
 * - Base64url encoded → 43 URL-safe characters (no +, /, = padding)
 * - Satisfies the DB constraint: length >= 32
 * - Never uses sequential IDs or report-specific data
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Build the public URL for a verification link.
 * Uses NEXT_PUBLIC_SITE_URL env var (consistent with rest of app),
 * falling back to NEXT_PUBLIC_APP_URL, then empty string.
 */
export function buildVerificationUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${baseUrl}/verify/${token}`;
}

/**
 * Build just the path portion of the verification URL.
 * Stored in public_url_path; used for rendering in HTML without requiring the base URL.
 */
export function buildVerificationPath(token: string): string {
  return `/verify/${token}`;
}
