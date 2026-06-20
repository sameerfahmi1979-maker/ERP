/**
 * Microsoft Graph Configuration Loader
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * Server-only configuration loader for Microsoft Graph email integration
 * 
 * SECURITY: This file must ONLY be imported from server-side code
 * Do NOT import from client components or pages
 */

import type { MicrosoftGraphConfig } from "./email-types";
import { logger } from "@/lib/logger";

/**
 * Configuration check result
 */
export type MicrosoftGraphConfigResult = {
  /** Whether all required env vars are present */
  configured: boolean;
  /** Loaded configuration (only if configured=true) */
  config?: MicrosoftGraphConfig;
  /** Missing environment variable names (if configured=false) */
  missing: string[];
};

/**
 * Required environment variables
 */
const REQUIRED_ENV_VARS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_MAIL_SENDER",
] as const;

/**
 * Get Microsoft Graph configuration from environment variables
 * 
 * Checks for required env vars and returns configuration object.
 * Does NOT throw errors - returns missing var names for graceful handling.
 * 
 * Environment Variables:
 * - MICROSOFT_TENANT_ID (required) - Azure AD Tenant ID
 * - MICROSOFT_CLIENT_ID (required) - Azure App Registration Client ID
 * - MICROSOFT_CLIENT_SECRET (required) - Client Secret from App Registration
 * - MICROSOFT_MAIL_SENDER (required) - Sender email address (must be valid M365 mailbox)
 * - MICROSOFT_GRAPH_BASE_URL (optional) - Default: https://graph.microsoft.com/v1.0
 * - MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS (optional) - Default: true
 * - MICROSOFT_MAIL_MAX_ATTACHMENT_MB (optional) - Default: 10
 * - MICROSOFT_MAIL_MAX_RECIPIENTS (optional) - Default: 20
 * 
 * @returns Configuration result with missing env var names if not configured
 * 
 * @example
 * ```typescript
 * const result = getMicrosoftGraphConfig();
 * if (!result.configured) {
 *   logger.error("Missing env vars:", result.missing);
 *   return { success: false, error: "Email service not configured" };
 * }
 * const provider = new MicrosoftGraphProvider(result.config);
 * ```
 */
export function getMicrosoftGraphConfig(): MicrosoftGraphConfigResult {
  // Check for missing required env vars
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // If any required vars missing, return early
  if (missing.length > 0) {
    return {
      configured: false,
      missing,
    };
  }

  // All required vars present - build config
  const config: MicrosoftGraphConfig = {
    tenantId: process.env.MICROSOFT_TENANT_ID!,
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    senderEmail: process.env.MICROSOFT_MAIL_SENDER!,
    
    // Optional vars with defaults
    graphBaseUrl: process.env.MICROSOFT_GRAPH_BASE_URL || "https://graph.microsoft.com/v1.0",
    saveToSentItems: process.env.MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS !== "false",
    maxAttachmentMB: Number(process.env.MICROSOFT_MAIL_MAX_ATTACHMENT_MB) || 10,
    maxRecipients: Number(process.env.MICROSOFT_MAIL_MAX_RECIPIENTS) || 20,
  };

  return {
    configured: true,
    config,
    missing: [],
  };
}
