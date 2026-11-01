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
 * The public verification host is independent of local sign-in redirects.
 * Local frontends using live ERP data set PUBLIC_VERIFICATION_BASE_URL to the
 * public ERP HTTPS origin; auth and local navigation keep their local origin.
 */
export function buildVerificationUrl(token: string): string {
  const override = process.env.PUBLIC_VERIFICATION_BASE_URL;
  if (override !== undefined) {
    const parsed = new URL(override);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('Public verification requires a valid HTTPS origin.');
    }
    return `${parsed.origin}${buildVerificationPath(token)}`;
  }
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, '');
  return `${baseUrl}/verify/${token}`;
}

/**
 * Build just the path portion of the verification URL.
 * Stored in public_url_path; used for rendering in HTML without requiring the base URL.
 */
export function buildVerificationPath(token: string): string {
  return `/verify/${token}`;
}
