# PROMPT_ERP_BASE_002E_3D — Export Menu Integration + Server Action for Microsoft Graph Email

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Microsoft Graph integration engineer, Next.js App Router server-action engineer, TypeScript architect, export/reporting integration specialist, Supabase/RLS auditor, SaaS security tester, and enterprise email workflow validator.

You are working on the existing ERP Foundation application after:

- Phase 002E.3A — Microsoft Graph Provider Foundation
- Phase 002E.3B — Attachment Generation from Export Engine
- Phase 002E.3C — Send Email Dialog UI

This phase is:

```text
Phase 002E.3D — Export Menu Integration + Server Action
```

Implement the integration between:

1. Existing `ERPExportMenu`
2. Existing `ERPSendEmailDialog`
3. Existing attachment generation functions
4. Existing Microsoft Graph provider foundation
5. New server action for sending email

Do not start Phase 002E.3E audit hardening yet, except basic audit if existing helper is safe.

Do not perform Microsoft Graph live test yet unless credentials are already configured and user explicitly requests live test.

Do not start 002E.4 Draft Workflow.

Do not start 002F App Settings / Master Data.

Do not start Phase 003.

---

## 1. Phase Purpose

Enable users to send generated export files by email from the export menu.

The export menu must support:

```text
Print
PDF
Excel
CSV
Send by Email
```

When user clicks **Send by Email**:

1. Open the existing email dialog from 002E.3C.
2. Use current table state from the export menu:
   - selected rows if any
   - filtered rows if no selection
   - sorted order
   - visible columns only
3. Let user choose attachment type:
   - PDF
   - Excel
   - CSV
4. Generate attachment using 002E.3B functions.
5. Submit to server action.
6. Server action sends through Microsoft Graph provider from 002E.3A.
7. Return success/error to UI.
8. Show toast feedback.

---

## 2. Current System Context

Existing relevant files:

```text
src/components/erp/export/erp-export-menu.tsx
src/components/erp/email/erp-send-email-dialog.tsx
src/components/erp/email/email-types-ui.ts
src/lib/export/generate-attachment.ts
src/lib/export/index.ts
src/lib/email/
src/server/actions/
src/server/actions/audit.ts
```

Current email UI exists but only prepares email and does not send.

Current Microsoft Graph provider exists but is not wired to UI.

Current attachment generation exists and returns:

```ts
EmailAttachment
```

Current export engine works with selected rows, visible columns, sorting, and filters.

---

## 3. Strict Scope Control

### Implement in this phase

- `sendExportEmail` server action
- Server-side validation
- Microsoft Graph provider call
- Export menu "Send by Email" item
- Integration of `ERPSendEmailDialog`
- Client-to-server send flow
- Toast success/error
- Missing Microsoft configuration error handling
- Attachment size validation
- Basic audit logging if safe using existing audit helper
- Reports

### Do not implement in this phase

- App Settings UI
- Letterhead selector backend
- Full email templates
- Scheduled email
- Email drafts
- Multi-attachment email beyond selected single format
- Full audit dashboard enhancement
- New database migration unless absolutely required and approved
- Microsoft Graph live test unless credentials are configured and user approves
- Draft workflow
- HR/Fleet/DMS

---

## 4. Critical Safety Rules

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

Do not expose:

- Microsoft tenant ID
- Microsoft client ID
- Microsoft client secret
- Microsoft access token
- Supabase service role key
- `.env.local`

Do not use:

```text
NEXT_PUBLIC_MICROSOFT_*
```

Do not run:

```bash
supabase db push
```

No database migration should be needed.

Do not weaken RLS or RBAC.

---

## 5. Required Initial Review

Before implementation, inspect:

```text
src/components/erp/export/erp-export-menu.tsx
src/components/erp/email/erp-send-email-dialog.tsx
src/components/erp/email/email-types-ui.ts
src/lib/export/generate-attachment.ts
src/lib/export/export-types.ts
src/lib/email/email-types.ts
src/lib/email/email-validation.ts
src/lib/email/microsoft-graph-config.ts
src/lib/email/microsoft-graph-provider.ts
src/server/actions/audit.ts
src/lib/rbac/**
```

Create:

```text
ERP_BASE_002E_3D_INITIAL_REVIEW_REPORT.md
```

Include:

- files reviewed
- existing email UI behavior
- existing export menu behavior
- server action pattern found
- RBAC helper pattern found
- audit helper availability
- integration risks
- implementation plan

---

## 6. Server Action Requirement

Create:

```text
src/server/actions/email.ts
```

or if project naming uses another convention:

```text
src/server/actions/email-actions.ts
```

Choose one and document it.

Implement:

```ts
export async function sendExportEmail(input: SendExportEmailInput): Promise<SendExportEmailResult>
```

### Required input type

Define type either in server action file or shared email file:

```ts
type SendExportEmailInput = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  bodyFormat?: "text" | "html"
  attachment: EmailAttachment
  context?: {
    moduleCode?: string
    entityName?: string
    entityId?: number | string
    entityReference?: string
    exportMode?: "selected" | "filtered" | "all"
    recordCount?: number
  }
}
```

### Required result type

```ts
type SendExportEmailResult = {
  success: boolean
  provider: "microsoft_graph"
  error?: string
  statusCode?: number
  graphErrorCode?: string
}
```

You may reuse existing `SendEmailInput` and `SendEmailResult` types from `src/lib/email/email-types.ts` if compatible.

---

## 7. Server Action Logic

The server action must:

1. Verify authenticated user.
2. Build/validate recipients using existing helpers.
3. Check permission.
4. Load Microsoft Graph config.
5. Return clear configuration error if missing env vars.
6. Validate input server-side.
7. Validate attachment exists.
8. Validate attachment size.
9. Deduplicate recipients.
10. Create `MicrosoftGraphProvider`.
11. Send email.
12. Log basic audit event if existing audit helper supports it safely.
13. Return typed result.

### Permission check

Use existing RBAC pattern.

Minimum permission should be:

```text
{moduleCode}.view
```

For example:

```text
organizations.view
branches.view
users.view
roles.view
permissions.view
audit.view
```

If `moduleCode` is missing, require a broad admin/export permission if available.

If no suitable permission exists, document limitation and use the same permission as the page view.

Do not create a new permission migration in this phase.

### Server-side validation

Use existing:

```ts
validateSendEmailInput()
deduplicateRecipients()
parseEmailList()
```

If current types expect `EmailRecipient[]`, convert string arrays into recipient objects.

### Missing configuration behavior

If Microsoft Graph env vars are missing, return:

```text
Email service is not configured. Please configure Microsoft Graph settings in .env.local.
```

Do not crash.

Do not reveal secret values.

### Attachment size

Use config:

```text
MICROSOFT_MAIL_MAX_ATTACHMENT_MB
```

Default:

```text
10 MB
```

### Body format

For this phase:

- Use plain text or basic HTML safely.
- If `bodyFormat` is omitted, use `"text"` or convert newlines to `<br>` only if provider expects HTML.
- Avoid unsanitized rich HTML.

---

## 8. Email Dialog Integration

Modify:

```text
src/components/erp/email/erp-send-email-dialog.tsx
```

Currently it:

- validates
- logs prepared email
- shows alert
- does not send

Update it to support real sending via callback.

Recommended prop changes:

```ts
onSend?: (input: PreparedEmailInput) => Promise<{ success: boolean; error?: string }>
isSending?: boolean
```

or keep `onPreparedSend` but make it support async and rename only if safe.

Preferred:

- Keep backward compatibility if possible.
- Remove `alert()` used for phase 002E.3C preview.
- Use toast notifications instead.
- Let parent `ERPExportMenu` call server action.

Important:

- The dialog itself should not import Microsoft Graph provider.
- The dialog should not directly call server action unless architecture requires.
- Preferred: dialog calls parent callback; parent handles server action.

---

## 9. Export Menu Integration

Modify:

```text
src/components/erp/export/erp-export-menu.tsx
```

Add menu item:

```text
Send by Email
```

### Base UI dropdown safety

The project has previously had Base UI issues:

- `MenuGroupContext` missing
- `nativeButton` warning

Therefore:

- Use the project’s correct `DropdownMenuGroup` wrapper.
- Avoid nesting `<button>` inside menu items.
- If using `DropdownMenuItem`, follow existing fixed patterns.
- Do not use unsupported `asChild` if it causes type/runtime errors.
- Test the menu in browser.

### Flow

When user clicks Send by Email:

1. Open `ERPSendEmailDialog`.
2. Pass attachment options:
   - PDF attachment generator
   - Excel attachment generator
   - CSV attachment generator
3. Each generator must use the same export data/columns currently used by download exports:
   - selected rows if any
   - filtered rows otherwise
   - visible columns only
   - sorted order
4. `onSend` calls server action.
5. Toast success or error.
6. Close dialog on success.

---

## 10. Attachment Generation Integration

Use existing functions from 002E.3B:

```ts
generateCSVAttachment()
generateExcelAttachment()
generatePDFAttachment()
generateAttachmentByType()
```

These must receive the same export options used by the export menu.

Important:

- Do not regenerate using all raw data.
- Use table-state-aware export data already passed into `ERPExportMenu`.
- Confirm selected rows remain selected-only in email attachment.
- Confirm hidden columns remain excluded in email attachment.

---

## 11. Toasts and UX

Use existing toast library if present, likely:

```text
sonner
```

Show states:

- Preparing attachment
- Sending email
- Email sent successfully
- Failed to send email
- Microsoft Graph not configured
- Validation error

Do not use `alert()` in final implementation.

The Send button in dialog should show loading:

```text
Sending...
```

Disable form while sending.

---

## 12. Audit Logging

If existing audit helper can be called safely, log:

```text
email_send_success
email_send_failed
```

Recommended audit metadata:

```json
{
  "provider": "microsoft_graph",
  "to_count": 1,
  "cc_count": 0,
  "bcc_count": 0,
  "subject": "Organizations Report - 2026-05-28",
  "attachment_filename": "organizations_2026-05-28.pdf",
  "attachment_content_type": "application/pdf",
  "attachment_size_bytes": 123456,
  "module_code": "organizations",
  "record_count": 2,
  "export_mode": "selected",
  "success": true
}
```

Do not log:

- email body
- attachment base64
- Microsoft token
- client secret
- full recipient list if considered sensitive

If audit helper cannot support this safely, document and defer to 002E.3E.

---

## 13. Security Requirements

- No secrets in client bundle.
- No Microsoft Graph calls from client.
- No token in browser.
- No client secret in browser.
- Server action validates everything again.
- Attachment size checked server-side.
- Recipient count checked server-side.
- No RLS bypass.
- No service role needed.
- No database changes.
- Do not export/send data beyond what user already selected/viewed.
- Do not log attachment content.

---

## 14. Validation Required

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

### Manual browser test without Microsoft credentials

If Microsoft env vars are not configured:

1. Open `/admin/organizations`.
2. Select 1 or 2 rows.
3. Open Export menu.
4. Click Send by Email.
5. Fill To, Subject, Body.
6. Select PDF.
7. Click Send.
8. Confirm clear error:
   ```text
   Email service is not configured
   ```
9. Confirm app does not crash.
10. Confirm no Microsoft secret is exposed.

### Manual browser test with Microsoft credentials

Only if user configured `.env.local`:

1. Send PDF to own email.
2. Confirm received.
3. Repeat with Excel.
4. Repeat with CSV.
5. Confirm selected rows only are attached.
6. Confirm hidden columns excluded.
7. Confirm audit log if implemented.

---

## 15. Required Reports

Create:

```text
ERP_BASE_002E_3D_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_3D_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_3D_EMAIL_SEND_VALIDATION_REPORT.md
ERP_BASE_002E_3D_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_3D_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- files inspected
- integration design
- server action pattern
- risks

### Implementation Report

- server action created
- export menu changes
- dialog changes
- attachment generation integration
- what remains for 002E.3E/3F

### Email Send Validation

- config-missing behavior
- real Microsoft send result if credentials available
- PDF/Excel/CSV attachment status
- selected rows/visible columns status

### Security Review

- no secret exposure
- no Graph call in client
- server validation
- RBAC checks
- attachment size limit
- audit logging behavior

### Next Steps

Recommend:

```text
002E.3E — Audit Logging & Security Validation
002E.3F — Microsoft Graph Live Test
002E.4 — Draft Workflow
```

---

## 16. Acceptance Criteria

002E.3D is complete only if:

- `Send by Email` appears in export menu.
- Email dialog opens from export menu.
- Attachment options use current export/table state.
- Server action exists.
- Server action validates input.
- Server action loads Microsoft Graph config safely.
- If config missing, clear error is returned.
- If config present, server action can call Microsoft Graph provider.
- No Graph call occurs in client.
- No secrets exposed.
- No database/RLS/Auth changes.
- TypeScript passes.
- Build passes.
- Reports generated.

---

## 17. Final Instruction

Implement 002E.3D only.

Do not implement 002E.3E hardening beyond basic safe audit if existing helper supports it.

Do not perform Microsoft Graph live testing unless credentials are configured and user approves.

Stop after reports and validation.
