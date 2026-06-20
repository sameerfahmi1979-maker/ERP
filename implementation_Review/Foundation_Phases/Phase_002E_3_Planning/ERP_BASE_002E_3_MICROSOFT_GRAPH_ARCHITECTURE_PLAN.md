# ERP BASE 002E.3 — Microsoft Graph Architecture Plan
## Detailed Technical Design for Microsoft 365 Email Integration

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI Microsoft Graph Integration Architect  
**Status**: ✅ PLANNING COMPLETE

**IMPORTANT**: This is a PLANNING document. No code implemented.

---

## 🎯 Microsoft Graph Integration Overview

**Provider**: Microsoft 365 / Microsoft Graph API  
**Authentication**: OAuth 2.0 Client Credentials flow (Application permissions)  
**Primary API**: `POST /v1.0/users/{sender}/sendMail`  
**Required Permissions**: `Mail.Send` (Application)  

---

## 🔐 Azure App Registration Setup

### Step 1: Create App Registration

**Azure Portal Flow**:
```
1. Navigate to https://portal.azure.com
2. Azure Active Directory → App registrations → New registration
3. Name: "ERP Email Sender" (or company preference)
4. Supported account types: "Single tenant"
5. Redirect URI: Not needed (server-to-server)
6. Register
```

**Outputs**:
- Application (client) ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Directory (tenant) ID: `yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy`

---

### Step 2: Create Client Secret

**Flow**:
```
App Registration → Certificates & secrets → New client secret
Name: "ERP Production Secret"
Expires: 24 months (recommended)
```

**Output**:
- Secret Value: `abc123...` (copy immediately, shown once)
- Secret ID: (for reference only)

---

### Step 3: Add API Permissions

**Required Permission**:
```
API: Microsoft Graph
Permission: Mail.Send
Type: Application (not Delegated)
Description: "Send mail as any user"
```

**Flow**:
```
App Registration → API permissions → Add a permission
→ Microsoft Graph → Application permissions
→ Search "Mail.Send" → Check → Add permissions
```

**CRITICAL**: Click "Grant admin consent for [Organization]"

**Status Should Show**:
- ✅ Mail.Send | Application | Granted for [Organization]

---

### Step 4: Verify Sender Mailbox

**Requirements**:
- Sender email must be valid M365 mailbox
- Examples:
  - `noreply@company.com`
  - `erp@company.com`
  - `system@company.com`

**Verify**:
```
M365 Admin Center → Users → Active users
→ Confirm mailbox exists and is licensed
```

---

## 🔌 Microsoft Graph API Integration

### OAuth Token Acquisition

**Endpoint**:
```
POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
```

**Request Headers**:
```http
Content-Type: application/x-www-form-urlencoded
```

**Request Body** (form-encoded):
```
grant_type=client_credentials
client_id={MICROSOFT_CLIENT_ID}
client_secret={MICROSOFT_CLIENT_SECRET}
scope=https://graph.microsoft.com/.default
```

**Response** (JSON):
```json
{
  "token_type": "Bearer",
  "expires_in": 3599,
  "access_token": "eyJ0eXAi..."
}
```

**Token Characteristics**:
- Type: Bearer token
- Lifetime: 3599 seconds (~60 minutes)
- Scope: Full Graph API access
- Refresh: Re-request when expired (no refresh token in client credentials flow)

---

### SendMail API

**Endpoint**:
```
POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail
```

**Request Headers**:
```http
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body Structure**:
```json
{
  "message": {
    "subject": "Organizations Report - 2026-05-27",
    "body": {
      "contentType": "HTML",
      "content": "<p>Please find attached the organizations report.</p>"
    },
    "toRecipients": [
      {
        "emailAddress": {
          "address": "manager@company.com"
        }
      }
    ],
    "ccRecipients": [
      {
        "emailAddress": {
          "address": "admin@company.com"
        }
      }
    ],
    "bccRecipients": [],
    "attachments": [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        "name": "organizations_2026-05-27.pdf",
        "contentType": "application/pdf",
        "contentBytes": "JVBERi0xLjQKJeLjz9MK..." 
      }
    ]
  },
  "saveToSentItems": true
}
```

**Field Requirements**:
- `subject`: Required, max 255 characters
- `body.contentType`: "Text" or "HTML" (use HTML for formatting)
- `body.content`: Required, max ~1MB
- `toRecipients`: Required, at least 1
- `ccRecipients`: Optional array
- `bccRecipients`: Optional array
- `attachments[].contentBytes`: Base64-encoded file content
- `saveToSentItems`: Boolean (save to sender's Sent Items folder)

**Response**:
- Status: `202 Accepted` (success)
- No response body (fire-and-forget)

**Error Responses**:
```json
// 400 Bad Request - invalid input
{
  "error": {
    "code": "InvalidRecipients",
    "message": "The recipient address is not valid."
  }
}

// 401 Unauthorized - invalid token
{
  "error": {
    "code": "InvalidAuthenticationToken",
    "message": "Access token has expired or is not yet valid."
  }
}

// 403 Forbidden - insufficient permissions
{
  "error": {
    "code": "InsufficientPermissions",
    "message": "The application does not have Mail.Send permission."
  }
}

// 404 Not Found - sender mailbox not found
{
  "error": {
    "code": "MailboxNotFound",
    "message": "The requested mailbox was not found."
  }
}

// 413 Payload Too Large - attachment too big
{
  "error": {
    "code": "MessageSizeExceeded",
    "message": "The message size exceeds the maximum allowed limit."
  }
}
```

---

## 📐 Provider Architecture Design

### Directory Structure

```
src/lib/email/
├── email-types.ts              # Type definitions
├── email-validation.ts         # Input validation
├── email-provider.ts           # Provider interface
├── microsoft-graph-provider.ts # Microsoft implementation
├── attachment-utils.ts         # Base64/size helpers
└── index.ts                    # Exports
```

---

### Type Definitions (`email-types.ts`)

```typescript
/**
 * Email attachment for Microsoft Graph
 */
export type EmailAttachment = {
  filename: string;
  contentType: string;
  base64Content: string;
  sizeBytes: number;
};

/**
 * Email recipient
 */
export type EmailRecipient = {
  email: string;
  name?: string;
};

/**
 * Input for sending email
 */
export type SendEmailInput = {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  bodyFormat?: "text" | "html"; // Default: "html"
  attachments: EmailAttachment[];
  saveToSentItems?: boolean; // Default: true
};

/**
 * Email provider result
 */
export type SendEmailResult = {
  success: boolean;
  error?: string;
  messageId?: string; // If provider returns ID
};

/**
 * Email provider interface
 */
export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

/**
 * Microsoft Graph config
 */
export type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
  baseUrl?: string; // Default: https://graph.microsoft.com/v1.0
  saveToSentItems?: boolean; // Default: true
  maxAttachmentMB?: number; // Default: 10
};
```

---

### Microsoft Graph Provider Implementation

**File**: `src/lib/email/microsoft-graph-provider.ts`

**Responsibilities**:
1. Acquire OAuth token (cache for 50 minutes)
2. Build Graph API request body
3. Send POST request to sendMail endpoint
4. Parse response
5. Handle errors

**Key Methods**:
```typescript
class MicrosoftGraphProvider implements EmailProvider {
  private config: MicrosoftGraphConfig;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config: MicrosoftGraphConfig) {
    // Validate config
    // Initialize
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    // 1. Validate input
    // 2. Get access token (cached or refresh)
    // 3. Build request body
    // 4. POST to Graph API
    // 5. Return result
  }

  private async getAccessToken(): Promise<string> {
    // Check cache
    // If expired, request new token
    // POST to login.microsoftonline.com
    // Cache token for 50 minutes (safe buffer)
  }

  private buildRequestBody(input: SendEmailInput): object {
    // Convert SendEmailInput to Graph API format
    // Map recipients, attachments, body
  }

  private async callGraphAPI(token: string, body: object): Promise<Response> {
    // fetch() to graph.microsoft.com
    // Return response
  }
}
```

**Token Caching**:
- Store token in memory (not persisted)
- Cache duration: 50 minutes (safe buffer from 60-minute token lifetime)
- Clear cache on error
- **Do NOT** store in database or client-side storage

---

### Environment Variables

**File**: `.env.local.example`

```env
# Microsoft Graph Email Configuration
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_MAIL_SENDER=noreply@company.com

# Optional: Override defaults
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
```

**Security**:
- ✅ All variables are server-only (no `NEXT_PUBLIC_`)
- ✅ Never committed to Git (in `.gitignore`)
- ✅ User copies `.env.local.example` to `.env.local` and fills values

---

## 🛡️ Error Handling Strategy

### Microsoft Graph Error Categories

**1. Authentication Errors** (401):
- `InvalidAuthenticationToken` - Token expired or invalid
- **Mitigation**: Clear token cache, retry once
- **User Message**: "Email service authentication failed. Please contact administrator."

**2. Permission Errors** (403):
- `InsufficientPermissions` - Missing Mail.Send permission
- **Mitigation**: None (requires Azure admin fix)
- **User Message**: "Email service not properly configured. Contact administrator."

**3. Validation Errors** (400):
- `InvalidRecipients` - Malformed email address
- `MessageSizeExceeded` - Attachment too large (> 10MB usually)
- **Mitigation**: Client-side validation should prevent this
- **User Message**: "Invalid email address" or "Attachment too large (max 10MB)"

**4. Not Found Errors** (404):
- `MailboxNotFound` - Sender mailbox doesn't exist
- **Mitigation**: None (requires M365 admin fix)
- **User Message**: "Email service configuration error. Contact administrator."

**5. Rate Limit Errors** (429):
- `TooManyRequests` - Exceeded Graph API throttling limit
- **Mitigation**: Exponential backoff (not in Phase 002E.3, document for future)
- **User Message**: "Email service temporarily unavailable. Try again in a few minutes."

**6. Server Errors** (500, 503):
- Microsoft Graph service issues
- **Mitigation**: Retry once after 2 seconds
- **User Message**: "Email service temporarily unavailable. Please try again."

---

### Error Logging Strategy

**✅ DO LOG**:
- Error code from Graph API
- Error message (sanitized)
- Timestamp
- Request ID (if provided by Graph)
- Recipient count (not addresses)

**❌ DO NOT LOG**:
- Access tokens
- Client secret
- Recipient email addresses (privacy)
- Email body content (may be sensitive)
- Attachment content (base64)

**Example Audit Log**:
```json
{
  "action": "email_send_failed",
  "module_code": "email",
  "error_code": "InvalidAuthenticationToken",
  "error_message": "Token expired",
  "recipient_count": 2,
  "attachment_count": 1
}
```

---

## 🧪 Testing Strategy

### Unit Tests (Future)

**Provider Tests**:
```typescript
// Mock fetch for Graph API
// Test token caching
// Test error handling
// Test request body building
```

**Validation Tests**:
```typescript
// Test email format validation
// Test attachment size validation
// Test recipient deduplication
```

---

### Manual Testing Checklist

**✅ Happy Path**:
1. Configure Azure app registration correctly
2. Set environment variables
3. Restart app
4. Open Organizations page
5. Select 2 rows
6. Click Export → Send by Email
7. Fill recipient, subject, body
8. Select attachment type (PDF)
9. Click Send
10. Verify email received
11. Verify attachment opens correctly

**✅ Error Scenarios**:
1. **Missing env var**: Expect clear error message
2. **Invalid client secret**: Expect auth error
3. **Invalid recipient email**: Expect validation error
4. **Attachment too large**: Expect size error
5. **Sender mailbox not found**: Expect config error

---

## 🔒 Security Checklist

**✅ Credentials**:
- Client secret never exposed to client
- Token never sent to client
- Token never logged
- Token stored in memory only (no persistence)

**✅ Input Validation**:
- Email format validation
- Attachment size validation
- Max recipient count enforcement

**✅ Rate Limiting** (Future):
- Consider per-user limits (e.g., 50 emails/hour)

**✅ RLS Compliance**:
- Email only exports data user can view (same permissions as export)

---

## 📊 Performance Considerations

**Token Acquisition**:
- First call: ~500ms (network + OAuth)
- Cached calls: 0ms (memory lookup)
- Cache hit rate: ~98% (tokens valid 60 min, requests every few seconds)

**SendMail API**:
- Typical response time: 200-500ms
- Large attachments (5-10MB): 1-2 seconds
- Microsoft Graph is async (returns 202 immediately, email sent in background)

**Total User-Perceived Time**:
- Generate attachment: 100-500ms (browser)
- Send to server: 50-200ms (JSON + base64)
- Server action: 500-1000ms (token + Graph API)
- **Total**: ~1-2 seconds

**Optimization** (Future):
- Pre-generate attachment while user fills out email form
- Show progress indicator during send
- Background send with notification

---

## 🎯 Acceptance Criteria (Microsoft Graph Component)

Phase 002E.3 Microsoft Graph integration is complete when:

✅ `MicrosoftGraphProvider` class implemented  
✅ OAuth token acquisition functional  
✅ Token caching working (50-minute lifetime)  
✅ SendMail API call successful  
✅ Error handling for all Graph API errors  
✅ Environment variables documented  
✅ No credentials exposed to client  
✅ No tokens logged  
✅ Audit logging for email sends  
✅ Test email sent successfully from production  

---

**Report Status**: ✅ COMPLETE  
**Code Changes**: ❌ NONE (planning only)  
**Next Document**: `ERP_BASE_002E_3_EMAIL_UIUX_PLAN.md`  

---

**Report End**
