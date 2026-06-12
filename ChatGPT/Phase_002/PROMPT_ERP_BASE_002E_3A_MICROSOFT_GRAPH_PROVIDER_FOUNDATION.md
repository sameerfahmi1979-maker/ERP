# PROMPT_ERP_BASE_002E_3A — Microsoft Graph Email Provider Foundation

## 0. Required Cursor Persona

Act as a senior Microsoft 365 / Microsoft Graph integration engineer, Next.js App Router backend engineer, TypeScript architect, SaaS security auditor, Supabase/RLS reviewer, and ERP QA lead.

This is Phase 002E.3A.

Implement only the Microsoft Graph Email Provider Foundation.

Do not implement the email dialog UI yet.

Do not integrate Send by Email into the export menu yet.

Do not implement attachment generation yet.

Do not send live emails yet unless a safe test script is explicitly requested and Microsoft credentials are configured.

Do not start 002E.3B, 002E.3C, 002E.4, 002F, or Phase 003.

---

## 1. Context

The planning package for Phase 002E.3 has been reviewed and approved for staged implementation.

The ERP already has:

- Next.js App Router
- TypeScript
- Supabase Auth
- Supabase PostgreSQL
- RLS/RBAC
- Global export engine
- Global table/list rules
- Export selected rows / visible columns / sorted/filtered records working

The user confirmed the company email provider is Microsoft.

Primary provider:

```text
Microsoft 365 / Microsoft Graph
```

---

## 2. Purpose of 002E.3A

Create the foundational server-side email provider architecture.

This phase must create:

1. Email type definitions
2. Email validation helpers
3. Provider interface
4. Microsoft Graph provider class
5. Microsoft Graph configuration loader
6. Attachment helper utilities
7. `.env.local.example` placeholders
8. Setup guide refinement if needed
9. Security/validation reports

No UI integration yet.

---

## 3. Critical Safety Rules

Do not modify:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
.env.local
scripts/bootstrap-admin.mjs
```

Allowed to modify:

```text
.env.local.example
src/lib/email/**
```

Do not expose secrets.

Do not use `NEXT_PUBLIC_` for Microsoft credentials.

Do not print tokens or client secrets.

Do not call Microsoft Graph from client/browser code.

Do not create database migrations.

Do not run:

```bash
supabase db push
```

---

## 4. Files to Create

Create:

```text
src/lib/email/
  index.ts
  email-types.ts
  email-validation.ts
  email-provider.ts
  microsoft-graph-provider.ts
  attachment-utils.ts
  microsoft-graph-config.ts
```

If any file already exists, review it and update safely.

---

## 5. Required Types

In `email-types.ts`, define:

```ts
export type EmailAttachment = {
  filename: string
  contentType: string
  base64Content: string
  sizeBytes: number
}

export type EmailRecipient = {
  email: string
  name?: string
}

export type SendEmailInput = {
  to: EmailRecipient[]
  cc?: EmailRecipient[]
  bcc?: EmailRecipient[]
  subject: string
  body: string
  bodyFormat?: "text" | "html"
  attachments: EmailAttachment[]
  saveToSentItems?: boolean
}

export type SendEmailResult = {
  success: boolean
  provider: "microsoft_graph"
  error?: string
  statusCode?: number
  graphErrorCode?: string
}

export type MicrosoftGraphConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  senderEmail: string
  graphBaseUrl: string
  saveToSentItems: boolean
  maxAttachmentMB: number
  maxRecipients: number
}
```

Do not include secrets in types or logs.

---

## 6. Provider Interface

In `email-provider.ts`, define:

```ts
export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>
}
```

---

## 7. Configuration Loader

In `microsoft-graph-config.ts`, implement a server-only configuration loader.

Required env vars:

```env
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_MAIL_SENDER=
```

Optional env vars:

```env
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
MICROSOFT_MAIL_MAX_RECIPIENTS=20
```

Function:

```ts
export function getMicrosoftGraphConfig(): {
  configured: boolean
  config?: MicrosoftGraphConfig
  missing: string[]
}
```

Rules:

- Return missing env names if not configured.
- Do not throw for missing config unless specifically requested by provider initialization.
- Do not print env values.

---

## 8. Email Validation Helpers

In `email-validation.ts`, implement:

```ts
validateEmail(email: string): boolean
parseEmailList(input: string): EmailRecipient[]
deduplicateRecipients(input: SendEmailInput): SendEmailInput
validateSendEmailInput(input: SendEmailInput, config: MicrosoftGraphConfig): { valid: boolean; errors: string[] }
```

Rules:

- Parse comma, semicolon, and newline separated addresses.
- Trim whitespace.
- Lowercase email addresses for duplicate detection.
- Require at least one To recipient.
- Validate max total recipient count.
- Validate subject required and max 255 characters.
- Validate body required and max 10,000 characters.
- Validate total attachment size against config.
- Validate attachment has filename, contentType, base64Content, and sizeBytes.

---

## 9. Attachment Utilities

In `attachment-utils.ts`, implement:

```ts
arrayBufferToBase64(buffer: ArrayBuffer): string
stringToBase64Utf8(value: string): string
base64SizeBytes(base64: string): number
formatBytes(bytes: number): string
getTotalAttachmentBytes(attachments: EmailAttachment[]): number
```

These utilities must not depend on browser-only APIs unless guarded.

They must work in server-side code.

---

## 10. Microsoft Graph Provider

In `microsoft-graph-provider.ts`, implement:

```ts
export class MicrosoftGraphProvider implements EmailProvider {
  constructor(config: MicrosoftGraphConfig)

  sendEmail(input: SendEmailInput): Promise<SendEmailResult>
}
```

Internal methods:

```ts
private getAccessToken(): Promise<string>
private buildGraphMessage(input: SendEmailInput): object
private mapGraphError(response: Response, body: unknown): SendEmailResult
```

### Token request

Use OAuth client credentials:

```text
POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
grant_type=client_credentials
client_id=...
client_secret=...
scope=https://graph.microsoft.com/.default
```

### Token caching

- Cache token in memory.
- Cache for 50 minutes maximum.
- If Microsoft returns `expires_in`, use it with safety buffer.
- Clear cache on 401/403 token-related failure.
- Retry once on token/auth error only.

### Send endpoint

```text
POST {graphBaseUrl}/users/{senderEmail}/sendMail
```

### Payload

Must support:

- toRecipients
- ccRecipients
- bccRecipients
- subject
- body
- file attachments
- saveToSentItems

### Error handling

Return clean errors for:

- missing config
- invalid client
- admin consent missing
- mailbox not found
- insufficient permissions
- payload too large
- recipient invalid
- network error

Do not leak tokens or secrets in error messages.

---

## 11. .env.local.example

Update `.env.local.example` with placeholders only:

```env
# Microsoft Graph Email Provider
MICROSOFT_TENANT_ID=PASTE_TENANT_ID_HERE
MICROSOFT_CLIENT_ID=PASTE_CLIENT_ID_HERE
MICROSOFT_CLIENT_SECRET=PASTE_CLIENT_SECRET_HERE
MICROSOFT_MAIL_SENDER=erp@yourdomain.com
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
MICROSOFT_MAIL_MAX_RECIPIENTS=20
```

Do not update `.env.local`.

---

## 12. Testing Requirements

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Do not require real Microsoft credentials for this phase.

If credentials are missing, config loader should report missing values cleanly.

Optional dev-only test:

- Create no permanent test script unless user approves.
- If creating a temporary test file, delete it before final report.

---

## 13. Required Reports

Create:

```text
ERP_BASE_002E_3A_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_3A_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_3A_VALIDATION_REPORT.md
ERP_BASE_002E_3A_NEXT_STEPS.md
```

Reports must include:

### Implementation Report

- files created
- provider architecture
- config loader behavior
- validation helpers
- token cache strategy
- what was not implemented

### Security Review

- no client exposure
- no NEXT_PUBLIC Microsoft secrets
- no token logging
- no `.env.local` modification
- no RLS/Auth changes
- no database changes

### Validation Report

- lint result
- typecheck result
- build result
- missing-config behavior

### Next Steps

Recommend:

```text
002E.3B — Attachment generation from export engine
002E.3C — Send email dialog UI
002E.3D — Export menu integration
002E.3E — Audit logging and security validation
002E.3F — Microsoft Graph live test
```

---

## 14. Acceptance Criteria

002E.3A is complete only if:

- Email library structure exists.
- Microsoft Graph provider exists.
- Config loader exists.
- Validation helpers exist.
- Attachment utilities exist.
- `.env.local.example` has placeholders.
- No secrets are exposed.
- No client-side Microsoft Graph code exists.
- TypeScript passes.
- Build passes.
- Reports generated.
- No email UI or export integration is implemented yet.

---

## 15. Final Instruction

Implement 002E.3A foundation only.

Do not implement email UI.

Do not integrate export menu.

Do not send live email.

Stop after reports and validation.
