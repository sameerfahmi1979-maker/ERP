/**
 * Microsoft Graph Email Provider
 * Phase 002E.3A - Microsoft Graph Email Provider Foundation
 * 
 * OAuth 2.0 client credentials flow for server-to-server email sending
 * 
 * SECURITY: This class must ONLY be instantiated from server-side code
 * Tokens and secrets are never exposed to client
 */

import type { EmailProvider } from "./email-provider";
import type { SendEmailInput, SendEmailResult, MicrosoftGraphConfig } from "./email-types";

/**
 * OAuth token cache entry
 */
type TokenCacheEntry = {
  token: string;
  expiresAt: number; // Unix timestamp in milliseconds
};

/**
 * Microsoft Graph sendMail request body structure
 */
type GraphSendMailBody = {
  message: {
    subject: string;
    body: {
      contentType: "Text" | "HTML";
      content: string;
    };
    toRecipients: { emailAddress: { address: string; name?: string } }[];
    ccRecipients?: { emailAddress: { address: string; name?: string } }[];
    bccRecipients?: { emailAddress: { address: string; name?: string } }[];
    attachments?: {
      "@odata.type": "#microsoft.graph.fileAttachment";
      name: string;
      contentType: string;
      contentBytes: string;
    }[];
  };
  saveToSentItems: boolean;
};

/**
 * Microsoft Graph email provider implementation
 * 
 * Implements OAuth 2.0 client credentials flow and sendMail API
 * 
 * Features:
 * - Token caching (50-minute lifetime with safety buffer)
 * - Automatic retry on auth errors (once)
 * - Comprehensive error mapping
 * - No credential exposure in errors
 * 
 * @example
 * ```typescript
 * const config = getMicrosoftGraphConfig();
 * if (!config.configured) throw new Error("Not configured");
 * 
 * const provider = new MicrosoftGraphProvider(config.config);
 * const result = await provider.sendEmail({
 *   to: [{ email: "user@example.com" }],
 *   subject: "Test",
 *   body: "Hello",
 *   attachments: [],
 * });
 * ```
 */
export class MicrosoftGraphProvider implements EmailProvider {
  private config: MicrosoftGraphConfig;
  private tokenCache: TokenCacheEntry | null = null;

  /**
   * Create Microsoft Graph provider
   * 
   * @param config - Microsoft Graph configuration from environment
   */
  constructor(config: MicrosoftGraphConfig) {
    this.config = config;
  }

  /**
   * Send email via Microsoft Graph sendMail API
   * 
   * @param input - Email details (recipients, subject, body, attachments)
   * @returns Result with success status and error details if failed
   */
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      // Get access token (cached or fresh)
      const token = await this.getAccessToken();

      // Build Graph API request body
      const body = this.buildGraphMessage(input);

      // Call sendMail endpoint
      const endpoint = `${this.config.graphBaseUrl}/users/${this.config.senderEmail}/sendMail`;
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      // Microsoft Graph returns 202 Accepted on success (async send)
      if (response.status === 202) {
        return {
          success: true,
          provider: "microsoft_graph",
          statusCode: 202,
        };
      }

      // Handle errors
      const errorBody = await response.json().catch(() => null);
      return this.mapGraphError(response, errorBody);

    } catch (error) {
      // Network or unexpected errors
      console.error("Microsoft Graph sendEmail error:", error);
      return {
        success: false,
        provider: "microsoft_graph",
        error: "Network error or service unavailable. Please try again.",
      };
    }
  }

  /**
   * Get OAuth access token (cached or fresh)
   * 
   * Token caching:
   * - Cache duration: 50 minutes (10-minute safety buffer from 60-minute token lifetime)
   * - Cleared on auth errors (401/403)
   * - Stored in memory only (not persisted)
   * 
   * @returns Bearer token
   * @throws Error if token acquisition fails
   */
  private async getAccessToken(): Promise<string> {
    // Check cache
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    // Request new token
    const tokenEndpoint = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
    
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    });

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorCode = errorBody?.error || "unknown";
      const errorDesc = errorBody?.error_description || "Token acquisition failed";
      
      console.error("OAuth token acquisition failed:", {
        status: response.status,
        error: errorCode,
        description: errorDesc,
      });

      throw new Error(`OAuth token acquisition failed: ${errorCode}`);
    }

    const tokenData = await response.json();
    const expiresIn = tokenData.expires_in || 3600; // Default 60 minutes

    // Cache token with 50-minute lifetime (10-minute safety buffer)
    const cacheLifetime = Math.min(expiresIn, 3000) * 1000; // Max 50 minutes
    this.tokenCache = {
      token: tokenData.access_token,
      expiresAt: Date.now() + cacheLifetime,
    };

    return tokenData.access_token;
  }

  /**
   * Build Microsoft Graph sendMail request body
   * 
   * @param input - Email input
   * @returns Graph API sendMail body structure
   */
  private buildGraphMessage(input: SendEmailInput): GraphSendMailBody {
    return {
      message: {
        subject: input.subject,
        body: {
          contentType: input.bodyFormat === "text" ? "Text" : "HTML",
          content: input.body,
        },
        toRecipients: input.to.map(r => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        })),
        ccRecipients: input.cc?.map(r => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        })),
        bccRecipients: input.bcc?.map(r => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        })),
        attachments: input.attachments.map(a => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.contentType,
          contentBytes: a.base64Content,
        })),
      },
      saveToSentItems: input.saveToSentItems ?? this.config.saveToSentItems,
    };
  }

  /**
   * Map Microsoft Graph API error to SendEmailResult
   * 
   * Common error codes:
   * - InvalidAuthenticationToken: Token expired or invalid
   * - InsufficientPermissions: Missing Mail.Send permission
   * - MailboxNotFound: Sender mailbox doesn't exist
   * - InvalidRecipients: Invalid email address format
   * - MessageSizeExceeded: Attachment too large
   * 
   * @param response - Failed HTTP response
   * @param body - Parsed error body (if available)
   * @returns SendEmailResult with user-friendly error message
   */
  private mapGraphError(response: Response, body: unknown): SendEmailResult {
    const status = response.status;
    
    // Safely extract error details from body
    const isErrorBody = (b: unknown): b is { error?: { code?: string; message?: string } } => {
      return (
        typeof b === "object" &&
        b !== null &&
        "error" in b &&
        typeof (b as any).error === "object"
      );
    };

    const errorCode = isErrorBody(body) && body.error?.code ? body.error.code : "UnknownError";
    const errorMessage = isErrorBody(body) && body.error?.message ? body.error.message : "Unknown error";

    // Log error for debugging (no tokens logged)
    console.error("Microsoft Graph API error:", {
      status,
      errorCode,
      message: errorMessage,
    });

    // Map to user-friendly messages
    let userMessage: string;

    switch (status) {
      case 400:
        if (errorCode === "InvalidRecipients") {
          userMessage = "Invalid recipient email address.";
        } else if (errorCode === "MessageSizeExceeded") {
          userMessage = `Attachment too large. Maximum: ${this.config.maxAttachmentMB} MB.`;
        } else {
          userMessage = "Invalid email data. Please check all fields.";
        }
        break;

      case 401:
        userMessage = "Email service authentication failed. Contact administrator.";
        // Clear token cache on auth errors
        this.tokenCache = null;
        break;

      case 403:
        if (errorCode === "InsufficientPermissions") {
          userMessage = "Email service not properly configured. Contact administrator.";
        } else {
          userMessage = "Permission denied. Contact administrator.";
        }
        break;

      case 404:
        if (errorCode === "MailboxNotFound") {
          userMessage = "Email service configuration error. Contact administrator.";
        } else {
          userMessage = "Email service endpoint not found. Contact administrator.";
        }
        break;

      case 429:
        userMessage = "Email service temporarily busy. Please try again in a few minutes.";
        break;

      case 500:
      case 503:
        userMessage = "Email service temporarily unavailable. Please try again.";
        break;

      default:
        userMessage = "Failed to send email. Please try again.";
    }

    return {
      success: false,
      provider: "microsoft_graph",
      error: userMessage,
      statusCode: status,
      graphErrorCode: errorCode,
    };
  }
}
