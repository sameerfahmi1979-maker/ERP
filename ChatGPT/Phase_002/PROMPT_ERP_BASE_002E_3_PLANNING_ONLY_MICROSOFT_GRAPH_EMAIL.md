# PROMPT_ERP_BASE_002E_3_PLANNING_ONLY — Microsoft Graph Send by Email Engine Detailed Plan

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Microsoft 365 / Microsoft Graph integration architect, Azure App Registration specialist, Next.js App Router backend architect, TypeScript system designer, SaaS security auditor, export/reporting engine specialist, Supabase/RLS reviewer, and enterprise email workflow designer.

This is a **PLANNING ONLY** prompt.

Do not implement code.

Do not modify source files.

Do not install packages.

Do not create migrations.

Do not update `.env.local`.

Do not change Supabase Auth.

Do not change RLS.

Do not change server actions.

Do not start Phase 002E.4, 002F, or Phase 003.

Your task is to produce a detailed implementation plan for Phase 002E.3.

---

## 1. Phase Name

```text
Phase 002E.3 — Send by Email Engine Using Microsoft 365 / Microsoft Graph
```

---

## 2. Existing ERP Context

The ERP already has:

- Next.js App Router
- TypeScript
- Supabase Auth
- Supabase PostgreSQL
- RLS/RBAC
- BIGINT ERP table IDs
- Admin foundation
- Global drawer form system
- Global Print/PDF/Excel/CSV export engine
- Global table/list rules
- Export selected rows / visible columns / filtered/sorted records working
- Current admin pages:
  - Organizations
  - Branches
  - Users
  - Roles
  - Permissions
  - Audit Logs

The user confirmed the email provider is **Microsoft**.

Therefore the primary provider must be:

```text
Microsoft 365 / Microsoft Graph
```

---

## 3. Planning Objective

Create a detailed plan for implementing a reusable “Send by Email” engine.

The future implementation must allow users to:

1. Select rows or use current filtered table state.
2. Generate:
   - PDF
   - Excel
   - CSV
3. Open email compose dialog.
4. Fill:
   - To
   - CC
   - BCC
   - Subject
   - Message body
   - Attachment type
5. Send the generated attachment through Microsoft Graph.
6. Log the action in audit logs.
7. Later integrate selected company letterhead from Phase 002F.

This planning document must be detailed enough that a later implementation prompt can be generated from it.

---

## 4. Must Review Current Codebase

Inspect current export and table code, but do not modify.

Review:

```text
src/components/erp/export/erp-export-menu.tsx
src/lib/export/
src/components/erp/table/erp-data-table.tsx
src/components/erp/table/erp-table-types.ts
src/app/(protected)/admin/organizations/page.tsx
src/app/(protected)/admin/branches/page.tsx
src/app/(protected)/admin/users/page.tsx
src/app/(protected)/admin/roles/page.tsx
src/app/(protected)/admin/permissions/page.tsx
src/app/(protected)/admin/audit/page.tsx
```

Review existing server action patterns:

```text
src/server/actions/
src/server/queries/
src/lib/rbac/
src/lib/supabase/
```

Review audit logging helper:

```text
src/server/actions/audit.ts
```

If files are missing or paths differ, document the actual paths found.

---

## 5. Planning Scope

### Include in the plan

- Microsoft Graph architecture
- Azure app registration setup
- Required Microsoft permissions
- Required environment variables
- Provider abstraction
- Server action/API route design
- Email dialog UI design
- Attachment generation design
- PDF/Excel/CSV file generation for email
- Validation design
- Security design
- Audit logging design
- Error handling design
- Testing plan
- Implementation sequence
- Risks and mitigations
- Files to create/modify
- Acceptance criteria

### Exclude from the plan

- Actual implementation
- Actual credentials
- App settings/letterhead backend
- Draft workflow
- Business modules
- HR/Fleet/DMS

---

## 6. Microsoft Graph Planning Requirements

Plan the Microsoft Graph integration using application permissions.

Expected approach:

```text
Azure App Registration
→ Tenant ID
→ Client ID
→ Client Secret
→ Microsoft Graph Application Permission: Mail.Send
→ Admin consent
→ Configured sender mailbox
→ Server-side token request
→ Microsoft Graph sendMail endpoint
```

Plan for endpoint:

```text
POST https://graph.microsoft.com/v1.0/users/{sender}/sendMail
```

Plan for OAuth token:

```text
POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
grant_type=client_credentials
scope=https://graph.microsoft.com/.default
client_id=...
client_secret=...
```

Plan required env variables:

```env
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_MAIL_SENDER=
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
```

Also plan optional future variables:

```env
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
MICROSOFT_MAIL_ALLOWED_DOMAINS=
```

---

## 7. Provider Abstraction Plan

Plan reusable email provider architecture.

Expected files:

```text
src/lib/email/
  email-types.ts
  email-validation.ts
  email-provider.ts
  microsoft-graph-provider.ts
  attachment-utils.ts
```

Plan types:

```ts
EmailAttachment
SendEmailInput
SendEmailResult
EmailProvider
```

Plan support for future providers:

- Microsoft Graph now
- SMTP later if needed
- Resend/SendGrid later if needed

But implementation should use Microsoft Graph first.

---

## 8. Attachment Generation Planning

Plan how existing export engine should produce email attachments instead of only downloads.

Current export formats:

- CSV
- Excel
- PDF

Plan required changes:

- CSV utility returns string/blob/base64
- Excel utility returns ArrayBuffer/base64
- PDF utility returns ArrayBuffer/base64
- Keep existing download/export behavior unchanged
- Add new functions specifically for attachment generation

Plan output:

```ts
{
  filename: string
  contentType: string
  base64Content: string
  sizeBytes: number
}
```

Plan MIME types:

```text
PDF: application/pdf
Excel: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
CSV: text/csv
```

---

## 9. Email Dialog UX Planning

Plan reusable component:

```text
src/components/erp/email/erp-send-email-dialog.tsx
```

Plan fields:

- To
- CC
- BCC
- Subject
- Body
- Attachment type:
  - PDF
  - Excel
  - CSV
- Attachment preview
- Send button
- Cancel button

Plan states:

- idle
- preparing attachment
- sending
- sent
- failed
- provider not configured
- validation error

Plan recipient input behavior:

- multiple emails separated by comma/semicolon/newline
- validation per email
- duplicate removal
- max recipient count
- CC/BCC optional

Plan UX:

- show generated filename
- show file size
- show selected rows count or filtered record count
- show module/report title
- show selected attachment type

---

## 10. Integration With Export Menu

Plan how `ERPExportMenu` will get:

```text
Send by Email
```

Add option only when:

- email feature enabled
- attachment generation supported
- user has view permission for the data

Plan flow:

```text
User opens Export menu
→ clicks Send by Email
→ Send Email dialog opens
→ user selects attachment type
→ system generates attachment from current table state
→ server action sends email via Microsoft Graph
→ success/failure toast
→ audit log entry
```

Plan how current table state is passed:

- selected rows
- visible columns
- filtered/sorted records
- report title
- filename
- module code

Do not break existing export downloads.

---

## 11. Server Action/API Plan

Plan server action:

```text
src/server/actions/email.ts
```

Potential function:

```ts
sendExportEmail(input)
```

Responsibilities:

1. Verify current user is authenticated.
2. Verify user has permission to view/export the relevant module.
3. Validate input.
4. Validate attachment count and total size.
5. Call Microsoft Graph provider.
6. Log audit entry.
7. Return typed result.

Plan whether to use:

- server action
- API route
- both

Recommendation should be explained.

---

## 12. Audit Logging Plan

Plan audit events:

```text
email_send_success
email_send_failed
```

Plan audit data:

```json
{
  "provider": "microsoft_graph",
  "to_count": 1,
  "cc_count": 0,
  "bcc_count": 0,
  "subject": "...",
  "attachment_names": ["organizations_2026-05-27.pdf"],
  "attachment_types": ["pdf"],
  "module_code": "organizations",
  "record_count": 2,
  "export_mode": "selected"
}
```

Do not log:

- body content if potentially sensitive
- base64 attachment
- Microsoft token
- client secret
- passwords
- raw credentials

---

## 13. Security Planning Requirements

Plan security controls:

- Microsoft secrets server-only.
- No `NEXT_PUBLIC_` Microsoft secrets.
- No token sent to client.
- Attachment size limit.
- Recipient validation.
- Permission check per module.
- No service-role usage unless necessary and justified.
- No RLS bypass.
- No sensitive fields exported.
- No secrets in logs.
- Clear failure messages without leaking provider secrets.
- Rate limiting/future abuse control recommendation.

Plan max attachment size:

```text
Default: 10 MB total attachments
```

Plan max recipient count:

```text
Default: 20 recipients total
```

---

## 14. Microsoft Setup Guide Requirement

Create a detailed setup guide:

```text
ERP_BASE_002E_3_MICROSOFT_GRAPH_SETUP_GUIDE.md
```

Guide must include:

1. Sign in to Azure Portal.
2. Create App Registration.
3. Copy Tenant ID and Client ID.
4. Create Client Secret.
5. Add Microsoft Graph API permission:
   - Application permission
   - Mail.Send
6. Grant admin consent.
7. Confirm sender mailbox.
8. Set environment variables.
9. Restart app.
10. Send test email.
11. Common errors:
   - invalid_client
   - unauthorized_client
   - insufficient privileges
   - sender mailbox not found
   - admin consent missing

No real secrets.

---

## 15. Planning Reports Required

Create these planning reports only:

```text
ERP_BASE_002E_3_EMAIL_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_3_MICROSOFT_GRAPH_ARCHITECTURE_PLAN.md
ERP_BASE_002E_3_EMAIL_UIUX_PLAN.md
ERP_BASE_002E_3_ATTACHMENT_GENERATION_PLAN.md
ERP_BASE_002E_3_SECURITY_AND_AUDIT_PLAN.md
ERP_BASE_002E_3_IMPLEMENTATION_SEQUENCE.md
ERP_BASE_002E_3_MICROSOFT_GRAPH_SETUP_GUIDE.md
ERP_BASE_002E_3_RISK_REGISTER.md
```

Do not create implementation files yet.

---

## 16. Implementation Sequence Must Be Proposed

The implementation sequence should be broken into substeps.

Recommended:

```text
002E.3A — Email Engine Architecture & Microsoft Graph Provider
002E.3B — Attachment Generation from Export Engine
002E.3C — Send Email Dialog UI
002E.3D — Export Menu Integration
002E.3E — Audit Logging & Security Validation
002E.3F — Microsoft Graph Live Test
```

Cursor should propose this or a better sequence.

---

## 17. Acceptance Criteria for This Planning Phase

This planning phase is complete only if:

- No code is changed.
- No packages are installed.
- No migrations are created.
- All current export/table files are reviewed.
- Microsoft Graph architecture is documented.
- Email UI/UX is documented.
- Attachment generation plan is documented.
- Security/audit plan is documented.
- Microsoft setup guide is created.
- Implementation sequence is clear.
- Risks are documented.
- Reports are generated.

---

## 18. Final Instruction

Do planning only.

Do not implement Phase 002E.3 yet.

Stop after reports.
