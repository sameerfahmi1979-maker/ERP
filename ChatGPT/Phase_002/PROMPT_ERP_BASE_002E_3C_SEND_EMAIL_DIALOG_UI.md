# PROMPT_ERP_BASE_002E_3C — Send Email Dialog UI

## 0. Required Cursor Persona

Act as a senior ERP QA lead, enterprise email UX designer, Next.js App Router frontend engineer, TypeScript architect, shadcn/Base UI integration specialist, Microsoft Graph email workflow planner, export/reporting integration engineer, accessibility tester, and SaaS security reviewer.

You are working on the existing ERP Foundation application after:

- Phase 002E.3A — Microsoft Graph Provider Foundation
- Phase 002E.3B — Attachment Generation from Export Engine

This phase is:

```text
Phase 002E.3C — Send Email Dialog UI
```

Implement only the **email compose dialog UI and client-side validation**.

Do not send live email.

Do not integrate the dialog into the export menu yet unless only as an isolated demo/preview component.

Do not create the server action for sending email.

Do not call Microsoft Graph.

Do not implement audit logging.

Do not start 002E.3D, 002E.3E, 002E.3F, 002E.4, 002F, or Phase 003.

---

## 1. Purpose

Create a reusable enterprise email composition UI that will later be connected to:

- Microsoft Graph provider from 002E.3A
- Attachment generation from 002E.3B
- Export menu integration in 002E.3D
- Audit logging in 002E.3E
- Live Microsoft Graph testing in 002E.3F

The UI must allow a user to prepare an email with generated export attachments.

---

## 2. Current Context

The ERP already has:

- Global export engine
- CSV / Excel / PDF download generation
- Attachment generation:
  - `generateCSVAttachment`
  - `generateExcelAttachment`
  - `generatePDFAttachment`
  - `generateAttachmentByType`
- Microsoft Graph provider foundation
- Email validation utilities:
  - `validateEmail`
  - `parseEmailList`
  - `deduplicateRecipients`
  - `validateSendEmailInput`
- Attachment utilities:
  - `formatBytes`
  - `getTotalAttachmentBytes`

Existing files to inspect:

```text
src/lib/email/
src/lib/export/generate-attachment.ts
src/lib/export/export-types.ts
src/components/erp/export/erp-export-menu.tsx
src/components/erp/table/erp-data-table.tsx
src/components/ui/dialog.tsx
src/components/ui/textarea.tsx
src/components/ui/input.tsx
src/components/ui/button.tsx
src/components/ui/badge.tsx
src/components/ui/radio-group.tsx
```

If any UI component does not exist, use the closest existing shadcn/Base UI component or add only the needed shadcn component.

---

## 3. Strict Scope Control

### Implement only

- Send email dialog UI
- Recipient input UI
- Attachment preview UI
- Attachment type selector
- Client-side validation
- UI states:
  - idle
  - preparing attachment
  - validation error
  - ready to send placeholder
  - future sending state placeholder
- No-op send button or disabled send button until 002E.3D
- Reports

### Do not implement

- Actual sending
- Server action
- Microsoft Graph API call
- Export menu integration that sends email
- Audit logging
- Database changes
- RLS changes
- App settings
- Letterheads
- Draft workflow
- Business modules

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
src/server/actions/**
src/server/queries/**
```

Do not change:

- Supabase Auth
- RLS policies
- database schema
- service-role handling
- Microsoft Graph provider logic from 002E.3A unless only a type import is needed
- attachment generation logic from 002E.3B unless a small type-compatible import/export fix is required

Do not run:

```bash
supabase db push
```

---

## 5. Required Initial Review

Before coding, inspect:

1. Current email library files from 002E.3A.
2. Current attachment generation files from 002E.3B.
3. Existing UI primitives.
4. Base UI/shadcn dropdown/dialog requirements to avoid:
   - `MenuGroupContext` error
   - `nativeButton` error
   - nested button issues

Create:

```text
ERP_BASE_002E_3C_INITIAL_REVIEW_REPORT.md
```

Include:

- files reviewed
- available validation helpers
- available attachment helpers
- UI components available
- expected files to create
- risks
- implementation plan

---

## 6. Required New Components

Create folder:

```text
src/components/erp/email/
```

Create:

```text
src/components/erp/email/erp-send-email-dialog.tsx
src/components/erp/email/email-recipient-input.tsx
src/components/erp/email/email-attachment-preview.tsx
src/components/erp/email/email-types-ui.ts
```

If a different naming convention is already used, follow project style and document it.

---

## 7. ERPSendEmailDialog Component

Create reusable component:

```ts
type AttachmentFormat = "pdf" | "excel" | "csv"

type AttachmentOption = {
  type: AttachmentFormat
  label: string
  filename: string
  generateAttachment: () => Promise<EmailAttachment> | EmailAttachment
}

type ERPSendEmailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  defaultSubject?: string
  defaultBody?: string
  attachmentOptions: AttachmentOption[]
  defaultAttachmentType?: AttachmentFormat
  generatedBy?: string
  recordCount?: number
  exportMode?: "selected" | "filtered" | "all"
  moduleCode?: string
  onPreparedSend?: (input: PreparedEmailInput) => void
}
```

Important:

- `onPreparedSend` is a placeholder callback only.
- Do not call server action.
- Do not call Microsoft Graph.
- In 002E.3D this component will be wired to real server action.

---

## 8. Dialog Fields

The dialog must include:

### Header

- Title: `Send by Email`
- Subtitle: show report/module title and export summary
- Example:
  - `Organizations Report`
  - `2 selected records • PDF attachment`

### Recipients

Fields:

- To — required
- CC — optional
- BCC — optional

Behavior:

- Multiple emails can be separated by comma, semicolon, or newline.
- Show helper text:
  - `Separate multiple emails with comma, semicolon, or new line.`
- Validate each email.
- Deduplicate recipients.
- Show error if invalid.

### Subject

- Required.
- Default:
  - `{title} - {YYYY-MM-DD}`
- Max 255 characters.
- Show validation error if empty or too long.

### Message Body

- Required.
- Default:
  ```text
  Dear Sir/Madam,

  Please find attached the requested report.

  Regards,
  ERP System
  ```
- Max 10,000 characters.
- Show character count.

### Attachment Type

Radio group or segmented control:

- PDF
- Excel
- CSV

Default:

- PDF unless `defaultAttachmentType` supplied.

### Attachment Preview

Show:

- file icon
- filename
- format badge
- size using `formatBytes`
- record count / export mode
- loading state while generating attachment
- error state if attachment generation fails

### Footer

Buttons:

- Cancel
- Prepare Send / Continue

For this phase:

- Button text should be:
  ```text
  Prepare Send
  ```
- It validates the form and calls `onPreparedSend` only if provided.
- It should show a clear message:
  ```text
  Actual sending will be connected in Phase 002E.3D.
  ```

Do not send email.

---

## 9. EmailRecipientInput Component

Create:

```text
email-recipient-input.tsx
```

Responsibilities:

- multiline textarea
- parse emails using existing `parseEmailList`
- show validation errors
- show recipient count
- support placeholder
- support required flag
- support disabled state

Props:

```ts
type EmailRecipientInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  error?: string
  disabled?: boolean
}
```

Keep simple; no autocomplete yet.

Autocomplete can be future enhancement.

---

## 10. EmailAttachmentPreview Component

Create:

```text
email-attachment-preview.tsx
```

Props:

```ts
type EmailAttachmentPreviewProps = {
  attachment?: EmailAttachment | null
  format: "pdf" | "excel" | "csv"
  isLoading?: boolean
  error?: string | null
  recordCount?: number
  exportMode?: "selected" | "filtered" | "all"
}
```

Must show:

- icon based on type
- filename
- content type/format
- size
- record count context
- warning if size is large, for example > 8 MB

---

## 11. Client-Side Validation

Use existing helpers from `src/lib/email`.

Validate:

- To required.
- All To/CC/BCC emails valid.
- Total recipients <= default/config max.
- Subject required.
- Subject max 255.
- Body required.
- Body max 10,000.
- Attachment exists.
- Attachment size visible.

For this phase, if full `validateSendEmailInput()` requires MicrosoftGraphConfig, use a lightweight UI validation wrapper or temporary local constants:

```ts
const MAX_RECIPIENTS = 20
const MAX_ATTACHMENT_MB = 10
```

Document that final server validation happens in 002E.3D.

---

## 12. Attachment Generation Behavior

When dialog opens:

1. Select default attachment type.
2. Generate attachment using matching `attachmentOptions`.
3. Show loading state.
4. Show preview when ready.
5. If user changes attachment type, regenerate preview.

Important:

- Do not download the file.
- Do not send the file.
- Do not persist the file.
- Keep base64 in component state only temporarily.
- Clear attachment state when dialog closes.

---

## 13. Integration / Demo

Do not integrate with export menu as production behavior yet.

But you may add a safe isolated demo/preview route or story-like component only if needed for testing.

Preferred:

- Do not add route.
- Validate component by temporary local test if possible, then remove.
- Integration will happen in 002E.3D.

If you need to test in app, add a temporary hidden/dev-only demo only if necessary and document it. Remove before final unless user approves.

---

## 14. UI/UX Requirements

The dialog should look enterprise-grade:

- clean header
- compact but readable fields
- clear validation
- professional attachment preview
- no oversized controls
- no childish colors
- consistent with ERP theme
- light mode default, dark mode compatible
- responsive for smaller screens

Use Inter font.

Avoid Base UI nested button/nativeButton issues.

---

## 15. Accessibility Requirements

- focus To field on open
- labels for all fields
- error messages visible and readable
- keyboard navigation
- ESC closes if no unsent changes
- no focus trap issues beyond normal dialog behavior
- buttons clearly named
- attachment format radio group accessible

---

## 16. Testing Requirements

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Component/manual validation:

1. Dialog renders.
2. To validation works.
3. CC/BCC validation works.
4. Subject required validation works.
5. Body required validation works.
6. Attachment type changes generate new preview.
7. Attachment size displays correctly.
8. Prepare Send button is disabled or shows validation until valid.
9. No Microsoft Graph call happens.
10. No network request is made.
11. No server action is called.
12. Build passes.

---

## 17. Required Reports

Create:

```text
ERP_BASE_002E_3C_INITIAL_REVIEW_REPORT.md
ERP_BASE_002E_3C_IMPLEMENTATION_REPORT.md
ERP_BASE_002E_3C_UI_VALIDATION_REPORT.md
ERP_BASE_002E_3C_SECURITY_REVIEW_REPORT.md
ERP_BASE_002E_3C_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- files inspected
- helpers available
- risks
- implementation plan

### Implementation Report

- components created
- props/API
- validation behavior
- attachment preview behavior
- what was intentionally not implemented

### UI Validation Report

- lint/typecheck/build results
- manual component behavior
- known issues

### Security Review

- no email sent
- no Microsoft Graph call
- no server action
- no secret exposure
- attachment base64 kept client-side only
- no database/RLS/Auth changes

### Next Steps

Recommend:

```text
002E.3D — Export Menu Integration + Server Action
002E.3E — Audit Logging & Security Validation
002E.3F — Microsoft Graph Live Test
```

---

## 18. Acceptance Criteria

002E.3C is complete only if:

- `ERPSendEmailDialog` exists.
- Recipient input component exists.
- Attachment preview component exists.
- Attachment type selector works.
- Attachment preview generation works.
- Client validation works.
- No email is sent.
- No server action is created.
- No Microsoft Graph call is made.
- TypeScript passes.
- Build passes.
- Reports generated.

---

## 19. Final Instruction

Implement only Send Email Dialog UI.

Do not integrate export menu yet.

Do not send email.

Do not create server action.

Stop after reports and validation.
