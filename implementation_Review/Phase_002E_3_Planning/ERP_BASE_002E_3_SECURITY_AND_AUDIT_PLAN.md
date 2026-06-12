# ERP BASE 002E.3 — Security and Audit Plan
## Comprehensive Security Strategy for Email Integration

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI Security Auditor & Compliance Specialist  
**Status**: ✅ PLANNING COMPLETE

---

## 🎯 Security Objectives

1. **Protect Microsoft Graph credentials** (tenant ID, client ID, client secret, tokens)
2. **Prevent unauthorized email sends** (permission checks, RLS compliance)
3. **Validate all user input** (recipients, subject, body, attachment size)
4. **Audit all email activity** (success + failure, metadata only)
5. **Prevent data exfiltration** (only export data user can view)
6. **Prevent abuse** (rate limiting future consideration)

---

## 🔐 1. Credentials Security

### Microsoft Graph Secrets

**Storage Location**: `.env.local` (server-only, Git-ignored)

**Environment Variables**:
```env
MICROSOFT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_CLIENT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
MICROSOFT_CLIENT_SECRET=abc123xyz789...
MICROSOFT_MAIL_SENDER=noreply@company.com
```

**Security Rules**:

✅ **DO**:
- Store in `.env.local` only
- Add `.env.local` to `.gitignore`
- Provide `.env.local.example` with empty values
- Access via `process.env` from server-only code
- Rotate client secret every 12-24 months

❌ **DO NOT**:
- Use `NEXT_PUBLIC_` prefix (exposes to client)
- Commit secrets to Git
- Log secrets in console, logs, or audit tables
- Send secrets to client in API response
- Store in database or localStorage
- Hard-code in source files

---

### OAuth Token Security

**Token Characteristics**:
- Bearer token from Microsoft login endpoint
- Lifetime: 60 minutes
- Cached in server memory only (not persisted)

**Security Rules**:

✅ **DO**:
- Store token in memory (class property, Map, or variable)
- Cache for 50 minutes (safe buffer)
- Clear cache on authentication error
- Validate token before each use

❌ **DO NOT**:
- Store token in database
- Store token in Redis/cache (unless encrypted + short TTL)
- Send token to client
- Log token to console or audit logs
- Persist token to disk

---

## 🛡️ 2. Authentication & Authorization

### User Authentication

**Requirement**: User must be authenticated via Supabase Auth

**Server Action Check**:
```typescript
// In sendExportEmail server action
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return { success: false, error: "Authentication required" };
}
```

**Fallback**: If no user found, return generic error (don't reveal auth details).

---

### Permission Checking

**Requirement**: User must have permission to view the data they're exporting

**Implementation**:
```typescript
// In sendExportEmail server action
const ctx = await getAuthContext();

// Check module-specific permission
const hasPermission = hasPermission(ctx, `${moduleCode}.view`);
// e.g., "organizations.view", "users.view", "audit.view"

if (!hasPermission) {
  return { success: false, error: "Insufficient permissions" };
}
```

**Module Codes**:
- `organizations` - Organizations master data
- `branches` - Branches master data
- `users` - User directory
- `roles` - Roles & permissions
- `audit` - Audit logs

**Permission Logic**:
- If user can **view** the data, they can **export** it
- If user can export it, they can **email** it
- **No separate "email" permission** needed (inherits from view)

---

### RLS Compliance

**Requirement**: Email only exports data that respects RLS policies

**Strategy**: Data is already filtered by RLS before it reaches client table.

**Flow**:
```
1. User loads Organizations page
2. Supabase RLS filters organizations by user's owner_company_id
3. User sees only 2 organizations (their company)
4. User selects both rows
5. User clicks Send Email
6. Dialog receives 2 organizations (already RLS-filtered)
7. Server action receives 2 organizations
8. Email sent with 2 organizations only
```

**RLS Bypass Prevention**:
- ❌ **DO NOT** use service-role admin client for data queries
- ✅ **DO** use regular authenticated Supabase client (respects RLS)
- ✅ Server action only receives data that client already has

**Edge Case**: User manually crafts API request with other company's data
- **Mitigation**: N/A - server action receives data as JSON, doesn't query database
- **Risk**: Low (user can only send data they already have access to)
- **Future Enhancement**: Re-query database in server action to verify IDs (Phase 002E.4)

---

## 🔍 3. Input Validation

### Email Address Validation

**Regex Pattern**:
```typescript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

**Rules**:
- ✅ Required format: `user@domain.com`
- ❌ Disallow: `user@domain`, `@domain.com`, `user@`
- ❌ Disallow: Multiple `@` symbols
- ❌ Disallow: Whitespace

**Client-Side Validation** (UI):
```typescript
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
```

**Server-Side Validation** (server action):
```typescript
// Re-validate on server (never trust client)
for (const recipient of [...input.to, ...input.cc, ...input.bcc]) {
  if (!validateEmail(recipient.email)) {
    return {
      success: false,
      error: `Invalid email address: ${recipient.email}`,
    };
  }
}
```

---

### Recipient Count Limits

**Default Limits**:
- Max total recipients (To + CC + BCC): 20
- Max per field: No hard limit, but total must be ≤ 20

**Rationale**: Prevent mass email abuse

**Validation**:
```typescript
const totalRecipients = input.to.length + (input.cc?.length || 0) + (input.bcc?.length || 0);

if (totalRecipients > MAX_RECIPIENTS) {
  return {
    success: false,
    error: `Too many recipients (${totalRecipients}). Maximum: ${MAX_RECIPIENTS}.`,
  };
}
```

**Environment Variable** (optional):
```env
MICROSOFT_MAIL_MAX_RECIPIENTS=20
```

---

### Subject & Body Validation

**Subject**:
- Required: ✅ Yes
- Max length: 255 characters
- Min length: 1 character (after trim)
- Allowed: Any UTF-8 text

**Body**:
- Required: ✅ Yes
- Max length: 10,000 characters
- Min length: 1 character (after trim)
- Allowed: Any UTF-8 text (HTML or plain text)

**Validation**:
```typescript
if (!input.subject || input.subject.trim().length === 0) {
  return { success: false, error: "Subject is required" };
}

if (input.subject.length > 255) {
  return { success: false, error: "Subject too long (max 255 characters)" };
}

if (!input.body || input.body.trim().length === 0) {
  return { success: false, error: "Message body is required" };
}

if (input.body.length > 10_000) {
  return { success: false, error: "Message too long (max 10,000 characters)" };
}
```

---

### Attachment Size Validation

**Default Max Size**: 10 MB

**Validation** (client-side):
```typescript
if (attachment.sizeBytes > maxSizeBytes) {
  toast.error(`Attachment too large (${formatBytes(attachment.sizeBytes)}). Max: 10 MB.`);
  return;
}
```

**Validation** (server-side):
```typescript
const maxSizeMB = Number(process.env.MICROSOFT_MAIL_MAX_ATTACHMENT_MB) || 10;
const maxSizeBytes = maxSizeMB * 1024 * 1024;

if (input.attachmentSizeBytes > maxSizeBytes) {
  return {
    success: false,
    error: `Attachment too large (${formatBytes(input.attachmentSizeBytes)}). Max: ${maxSizeMB} MB.`,
  };
}
```

**Environment Variable**:
```env
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
```

---

### Duplicate Recipient Prevention

**Requirement**: Deduplicate emails across To/CC/BCC

**Implementation**:
```typescript
function deduplicateRecipients(input: SendEmailInput): SendEmailInput {
  const seen = new Set<string>();
  
  const dedupe = (recipients: EmailRecipient[]) =>
    recipients.filter(r => {
      const email = r.email.toLowerCase().trim();
      if (seen.has(email)) return false;
      seen.add(email);
      return true;
    });
  
  return {
    ...input,
    to: dedupe(input.to),
    cc: dedupe(input.cc || []),
    bcc: dedupe(input.bcc || []),
  };
}
```

---

## 📝 4. Audit Logging

### Audit Events

**New Events**:
- `email_send_success` - Email sent successfully
- `email_send_failed` - Email send failed (validation or provider error)

**Existing Event Types** (for reference):
- `create`, `update`, `delete` (existing admin actions)

---

### Audit Log Fields for Email

**Success Event** (`email_send_success`):
```json
{
  "module_code": "email",
  "entity_name": "email_send",
  "entity_id": null,
  "entity_reference": "organizations_report_2026-05-27",
  "action": "email_send_success",
  "new_values": {
    "provider": "microsoft_graph",
    "to_count": 2,
    "cc_count": 1,
    "bcc_count": 0,
    "subject": "Organizations Report - 2026-05-27",
    "attachment_filename": "organizations_2026-05-27.pdf",
    "attachment_type": "pdf",
    "attachment_size_kb": 156,
    "module_code": "organizations",
    "record_count": 2,
    "export_mode": "selected"
  }
}
```

**Failed Event** (`email_send_failed`):
```json
{
  "module_code": "email",
  "entity_name": "email_send",
  "entity_id": null,
  "entity_reference": "organizations_report_2026-05-27",
  "action": "email_send_failed",
  "new_values": {
    "provider": "microsoft_graph",
    "to_count": 2,
    "error_code": "InvalidAuthenticationToken",
    "error_message": "Access token expired",
    "module_code": "organizations",
    "record_count": 2
  }
}
```

---

### What to Log

✅ **DO LOG**:
- Recipient counts (not addresses)
- Subject (safe metadata)
- Attachment filename
- Attachment type (pdf/excel/csv)
- Attachment size (KB)
- Module code (organizations, users, etc.)
- Record count exported
- Export mode (selected/filtered/all)
- Error code + sanitized message (on failure)

❌ **DO NOT LOG**:
- Recipient email addresses (privacy)
- Email body content (may be sensitive)
- Attachment base64 content
- Access tokens
- Client secret
- Tenant ID / Client ID (already in env, no need to log)

---

### Audit Logging Implementation

**Server Action**:
```typescript
// On success
await logAudit({
  module_code: "email",
  entity_name: "email_send",
  entity_id: null,
  entity_reference: `${input.reportTitle}_${format(new Date(), "yyyy-MM-dd")}`,
  action: "email_send_success",
  new_values: {
    provider: "microsoft_graph",
    to_count: input.to.length,
    cc_count: input.cc?.length || 0,
    bcc_count: input.bcc?.length || 0,
    subject: input.subject,
    attachment_filename: input.attachmentFilename,
    attachment_type: input.attachmentType,
    attachment_size_kb: Math.round(input.attachmentSizeBytes / 1024),
    module_code: input.moduleCode,
    record_count: input.recordCount,
    export_mode: input.exportMode,
  },
});

// On failure
await logAudit({
  module_code: "email",
  entity_name: "email_send",
  entity_id: null,
  entity_reference: `${input.reportTitle}_${format(new Date(), "yyyy-MM-dd")}`,
  action: "email_send_failed",
  new_values: {
    provider: "microsoft_graph",
    to_count: input.to.length,
    error_code: error.code,
    error_message: sanitizeErrorMessage(error.message),
    module_code: input.moduleCode,
    record_count: input.recordCount,
  },
});
```

**Error Message Sanitization**:
```typescript
function sanitizeErrorMessage(message: string): string {
  // Remove tokens, secrets, or sensitive data from error messages
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "[REDACTED_TOKEN]")
    .replace(/client_secret=[^\s&]*/g, "client_secret=[REDACTED]");
}
```

---

## 🚨 5. Error Handling Security

### Error Messages to User

**✅ DO**: Show generic, actionable error messages

**Examples**:
- "Email service not configured. Contact administrator."
- "Failed to send email. Please try again."
- "Invalid recipient email address."
- "Attachment too large (max 10 MB)."

**❌ DO NOT**: Expose internal details

**Bad Examples**:
- ❌ "OAuth token expired: eyJ0eXAi..." (reveals token)
- ❌ "Client secret invalid: abc123xyz" (reveals secret)
- ❌ "Database connection failed: host=10.0.0.5 user=admin" (reveals infra)

---

### Error Logging (Internal)

**Console/Server Logs**:
- ✅ Log full error stack trace
- ✅ Log error code from Microsoft Graph
- ❌ DO NOT log tokens or secrets

**Example**:
```typescript
catch (error) {
  console.error("Microsoft Graph sendMail failed:", {
    errorCode: error.response?.data?.error?.code,
    message: error.response?.data?.error?.message,
    status: error.response?.status,
    // DO NOT: token, clientSecret, or other secrets
  });
  
  return {
    success: false,
    error: "Failed to send email. Please try again.",
  };
}
```

---

## 🚦 6. Rate Limiting (Future Consideration)

**Status**: Not implemented in Phase 002E.3 (internal admin users only)

**Future Enhancement** (Phase 002E.4):
- Track email sends per user per hour (Redis or database table)
- Default limit: 50 emails/hour per user
- Return error: "Email send limit reached. Try again in X minutes."

**Rationale for Deferring**:
- Internal admin users only (low abuse risk)
- Manual user interaction (not automated)
- Microsoft Graph has its own throttling (429 errors)

---

## 🔒 7. Content Security

### Sensitive Data in Exports

**Requirement**: Don't export sensitive fields

**Current Implementation** (Phase 002E.2A):
- Table columns already exclude sensitive fields via `exportable: false` metadata
- Examples:
  - `auth_user_id` (excluded from users export)
  - `old_values`/`new_values` (excluded from audit logs export)

**Email Integration**: Respects same column metadata

**No Change Needed**: Email attachments use same columns as download exports.

---

### HTML Injection Prevention

**Scenario**: User enters HTML/script in email body

**Mitigation**:
- Microsoft Graph sends email as-is (no XSS risk for sender)
- Recipient email client sanitizes HTML (not our responsibility)
- **No additional sanitization needed** (Graph API accepts HTML body type)

**Note**: If user enters `<script>alert('xss')</script>`, it's sent as HTML but recipient's email client (Outlook/Gmail) will strip scripts.

---

## 🎯 Security Acceptance Criteria

Phase 002E.3 security is complete when:

✅ Microsoft credentials never exposed to client  
✅ OAuth tokens never logged or sent to client  
✅ All user input validated (client + server)  
✅ Recipient email format validated  
✅ Recipient count limited (max 20)  
✅ Attachment size limited (max 10 MB)  
✅ Subject/body length validated  
✅ Permission check enforces module view permissions  
✅ RLS respected (only export user-visible data)  
✅ Audit logging for all email sends (success + failure)  
✅ Audit logs exclude sensitive data (no addresses, body, base64)  
✅ Error messages don't expose credentials or tokens  
✅ `.env.local` in `.gitignore`  
✅ `.env.local.example` created for user setup  

---

**Report Status**: ✅ COMPLETE  
**Code Changes**: ❌ NONE (planning only)  
**Next Document**: `ERP_BASE_002E_3_MICROSOFT_GRAPH_SETUP_GUIDE.md`  

---

**Report End**
