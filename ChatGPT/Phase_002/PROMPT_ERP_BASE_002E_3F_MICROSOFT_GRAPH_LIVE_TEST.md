# PROMPT_ERP_BASE_002E_3F — Microsoft Graph Live Email Test

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Microsoft 365 / Microsoft Graph live integration tester, Next.js App Router runtime tester, SaaS security tester, email deliverability tester, export/reporting validation engineer, Supabase/RLS auditor, and production readiness reviewer.

You are working on the existing ERP Foundation application after:

- 002E.3A — Microsoft Graph Provider Foundation
- 002E.3B — Attachment Generation from Export Engine
- 002E.3C — Send Email Dialog UI
- 002E.3D — Export Menu Integration + Server Action

This phase is:

```text
Phase 002E.3F — Microsoft Graph Live Email Test
```

This is primarily a **live validation and readiness phase**, not a new feature implementation phase.

Do not start 002E.3E hardening unless explicitly approved.

Do not start 002E.4 Draft Workflow.

Do not start 002F App Settings / Master Data / Numbering.

Do not start Phase 003.

---

## 1. Phase Purpose

Validate that the ERP can actually send emails through Microsoft 365 / Microsoft Graph using real Azure App Registration credentials.

The test must verify:

1. Microsoft Graph credentials are configured.
2. Token acquisition works.
3. SendMail endpoint works.
4. PDF attachment email works.
5. Excel attachment email works.
6. CSV attachment email works.
7. Selected rows are respected.
8. Hidden columns are excluded.
9. Search/filter/sort state is respected.
10. Emails are received in Outlook/Microsoft 365 mailbox.
11. Attachments open correctly.
12. Audit logs are created.
13. Failure scenarios return user-friendly errors.
14. No secrets are exposed.

---

## 2. Strict Scope Control

### Allowed

- Test email sending
- Create test reports
- Create troubleshooting notes
- Add temporary dev-only test script only if absolutely needed and remove before completion
- Fix minor defects discovered during live test only after documenting them
- Update reports

### Not allowed without approval

- New database migrations
- New permissions migration
- Dedicated email logs table
- Rate limiting implementation
- Major UI redesign
- App Settings implementation
- Letterhead implementation
- Draft workflow
- Business module work

---

## 3. Critical Safety Rules

Do not expose or print:

- MICROSOFT_TENANT_ID value
- MICROSOFT_CLIENT_ID value
- MICROSOFT_CLIENT_SECRET value
- Microsoft access token
- Supabase service role key
- `.env.local` contents

Do not commit:

```text
.env.local
real credentials
access tokens
downloaded email attachments containing sensitive data
```

Do not modify unless specifically required:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
scripts/bootstrap-admin.mjs
```

Do not run:

```bash
supabase db push
```

No migration should be required for live testing.

---

## 4. Prerequisites Checklist

Before live testing, verify the user/admin has completed Microsoft Azure setup.

Check `.env.local` exists and contains non-placeholder values for:

```env
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_MAIL_SENDER=
```

Optional:

```env
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
MICROSOFT_MAIL_MAX_RECIPIENTS=20
```

Important:

- Do not print actual values.
- Only report whether each is present/missing.
- If missing, stop live sending and create setup-status report.

Also confirm:

- Azure App Registration exists.
- Microsoft Graph Application Permission `Mail.Send` is granted.
- Admin consent is granted.
- Sender mailbox exists in Microsoft 365.
- Sender mailbox is licensed or is a valid shared mailbox.
- App server was restarted after updating `.env.local`.

---

## 5. Required Initial Review

Inspect these existing files before testing:

```text
src/lib/email/microsoft-graph-config.ts
src/lib/email/microsoft-graph-provider.ts
src/server/actions/email.ts
src/components/erp/export/erp-export-menu.tsx
src/components/erp/email/erp-send-email-dialog.tsx
src/lib/export/generate-attachment.ts
src/components/erp/table/erp-data-table.tsx
```

Create:

```text
ERP_BASE_002E_3F_INITIAL_LIVE_TEST_REVIEW.md
```

Include:

- files reviewed
- environment configuration present/missing status only
- Microsoft setup readiness
- live test plan
- risks
- whether live sending can proceed

---

## 6. Validation Commands

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

If lint has pre-existing issues, document them and confirm whether new email-related code is clean.

---

## 7. Live Test Cases

Use a safe test recipient first, preferably the current user/admin email.

Do not use external client emails during first test.

### Test 1 — Config Missing Behavior

If Microsoft env vars are missing or placeholders:

1. Open `/admin/organizations`.
2. Select one row.
3. Export → Send by Email.
4. Fill email form.
5. Attempt send.

Expected:

- Clear error: email service not configured.
- No crash.
- No secrets shown.
- Audit log for failed/config issue if implemented.

If config is present, document that this test is skipped.

---

### Test 2 — PDF Attachment Send

If credentials are configured:

1. Open `/admin/organizations`.
2. Select exactly 2 rows.
3. Click Export → Send by Email.
4. Select PDF.
5. Send to test recipient.
6. Confirm success toast.
7. Confirm email is received.
8. Confirm PDF opens.
9. Confirm PDF contains exactly selected rows.
10. Confirm hidden columns are not included if any were hidden.
11. Confirm audit log entry exists.

Expected:

- Email delivered.
- Attachment opens.
- Selected-row behavior correct.
- No browser console errors.

---

### Test 3 — Excel Attachment Send

1. Open `/admin/branches`.
2. Select 2 rows or use filtered state.
3. Send Excel attachment.
4. Confirm received.
5. Open `.xlsx`.
6. Confirm data matches selected/filtered rows.
7. Confirm visible-column behavior.

---

### Test 4 — CSV Attachment Send

1. Open `/admin/users` or `/admin/roles`.
2. Select rows.
3. Send CSV attachment.
4. Confirm received.
5. Open CSV in Excel.
6. Confirm UTF-8 content displays correctly.
7. Confirm sensitive fields are not included.

---

### Test 5 — Multiple Recipients

Use safe internal/test recipients.

Test:

- To: 1 recipient
- CC: 1 recipient
- BCC: 1 recipient

Expected:

- Email delivered.
- CC visible to To recipient.
- BCC not visible to To/CC recipients.
- Audit logs recipient counts only, not full body or attachment base64.

---

### Test 6 — Invalid Recipient

Use invalid email format:

```text
invalid@
```

Expected:

- Client-side validation blocks send OR server validation rejects.
- No Microsoft Graph send attempted if invalid at client.
- User-friendly error shown.

---

### Test 7 — Attachment Size Guard

If practical, select enough rows to create a large attachment.

Expected:

- Warning for large attachment if near threshold.
- Server rejects if above configured max.
- User-friendly error shown.

Do not force huge production data export if it risks browser crash.

---

### Test 8 — Unicode / Arabic Text

Send an email with Arabic text in subject/body:

```text
اختبار إرسال تقرير من نظام ERP
```

Expected:

- Subject/body display correctly in received email.
- Attachment filename remains safe.
- CSV/Excel/PDF content remains readable.

---

### Test 9 — Sent Items

If `MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true`:

- Check sender mailbox Sent Items.
- Confirm email appears there.

If using application permission/shared mailbox and Sent Items behavior differs, document actual result.

---

### Test 10 — Audit Log Verification

Open:

```text
/admin/audit
```

Verify audit entries for:

- email_send_success
- email_send_failed if any test failed
- email_send_validation_failed if tested
- email_send_denied if tested

Verify audit log does not include:

- full email body
- attachment base64
- Microsoft token
- client secret

---

## 8. Troubleshooting Scenarios

If sending fails, identify likely cause and document exact safe error.

Common causes:

### `invalid_client`

Likely:

- wrong client ID
- wrong client secret
- expired secret
- wrong tenant ID

### `insufficient privileges`

Likely:

- Mail.Send permission missing
- admin consent not granted

### `MailboxNotFound`

Likely:

- sender mailbox does not exist
- wrong `MICROSOFT_MAIL_SENDER`
- shared mailbox configuration issue

### `MessageSizeExceeded`

Likely:

- attachment too large
- base64 overhead

### `InvalidRecipients`

Likely:

- invalid recipient address
- blocked domain or address

### `ErrorAccessDenied`

Likely:

- application permission not allowed to send as selected mailbox
- mailbox restrictions
- tenant policy

Do not expose secrets while troubleshooting.

---

## 9. Optional Fixes During Live Test

If a small bug is found and fix is safe:

Allowed examples:

- improve user-friendly error message
- fix toast text
- fix attachment filename display
- fix audit metadata typo
- fix validation message
- fix missing module code in email context

Not allowed without approval:

- new migration
- new permission system
- rewrite provider
- rewrite export engine
- app settings implementation

If any code fix is made, rerun:

```bash
npm run typecheck
npm run build
```

and document the fix.

---

## 10. Required Reports

Create:

```text
ERP_BASE_002E_3F_INITIAL_LIVE_TEST_REVIEW.md
ERP_BASE_002E_3F_MICROSOFT_GRAPH_LIVE_TEST_REPORT.md
ERP_BASE_002E_3F_EMAIL_DELIVERY_VALIDATION_REPORT.md
ERP_BASE_002E_3F_ATTACHMENT_VALIDATION_REPORT.md
ERP_BASE_002E_3F_SECURITY_VALIDATION_REPORT.md
ERP_BASE_002E_3F_TROUBLESHOOTING_REPORT.md
ERP_BASE_002E_3F_NEXT_STEPS.md
```

Reports must include:

### Initial Live Test Review

- env var present/missing status only
- readiness
- live test plan

### Microsoft Graph Live Test Report

- token acquisition success/failure
- sendMail result
- Graph error codes if any
- no secrets

### Email Delivery Validation

- received/not received
- sender shown
- recipients shown
- CC/BCC behavior
- Sent Items behavior

### Attachment Validation

- PDF result
- Excel result
- CSV result
- selected rows verification
- visible columns verification
- file open status

### Security Validation

- no token/secrets exposed
- no client Graph call
- no attachment base64 in audit logs
- audit metadata safe
- permission checks

### Troubleshooting Report

- any issues
- root cause
- fix/next action

### Next Steps

Recommend whether to proceed to:

```text
002E.3E — Audit Logging & Security Hardening
```

or if live test failed, recommend corrective phase first.

---

## 11. Acceptance Criteria

002E.3F is complete only if:

- Microsoft env configuration is checked safely.
- If credentials configured, at least one real email is sent successfully.
- PDF attachment live test passes.
- Excel attachment live test passes or documented if not tested.
- CSV attachment live test passes or documented if not tested.
- Selected rows are respected.
- Hidden columns are respected.
- Email received in Microsoft mailbox.
- Attachments open correctly.
- Audit logs are checked.
- No secrets exposed.
- TypeScript/build pass.
- Reports generated.

If credentials are not configured, 002E.3F can only be marked:

```text
BLOCKED — Awaiting Microsoft Graph credentials
```

not complete.

---

## 12. Final Instruction

Perform live Microsoft Graph email testing only.

Do not start 002E.3E, 002E.4, 002F, or Phase 003.

Stop after reports.
