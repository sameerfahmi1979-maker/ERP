# ANTIGRAVITY_PROMPT_ERP_BASE_002E_UIUX_PLANNING — Enterprise Drawer Forms, Export/Email UX, App Settings & Global Master Data UI Plan

## 0. Required Antigravity Persona

Act as a senior enterprise ERP UI/UX director, Next.js App Router frontend architect, shadcn/ui design-system engineer, SaaS product designer, accessibility reviewer, visual QA engineer, and browser-based UI auditor.

You are working on an existing ERP Foundation application.

This task is **UI/UX planning and prototype preparation only**.

Do not modify the database.

Do not modify Supabase Auth.

Do not modify RLS.

Do not modify middleware.

Do not modify backend/server actions.

Do not implement business modules.

Do not start HR, Fleet, DMS, Workshop, HSE, Finance, Procurement, Inventory, Diesel, or Weighbridge.

The goal is to create a clear Antigravity UI/UX plan and visual implementation blueprint for the next ERP foundation phases after Phase 002D.

---

## 1. Existing ERP Context

The existing ERP application already has:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Inter font
- Supabase Auth
- Supabase PostgreSQL
- RLS/RBAC
- BIGINT ERP table primary keys
- Admin dashboard
- Organizations CRUD
- Branches CRUD
- Users management
- Roles and permissions
- Audit logs
- UAE-ready owner company and branch fields from Phase 002D

Current issue:

The add/edit forms are still displayed as small centered dialogs. This is not acceptable for an enterprise ERP with long forms.

Current forms are too narrow, cramped, and not suitable for:

- employee add/edit
- vehicle add/edit
- owner company add/edit
- branch add/edit
- document add/edit
- contracts
- approvals
- future HR/Fleet/DMS modules

---

## 2. Mission

Create a professional UI/UX plan and implementation blueprint for:

1. Global right-side sliding drawer forms
2. Global save-as-draft workflow
3. Global Print/PDF/Excel/CSV export actions
4. Send generated PDF/Excel/CSV directly by email
5. Multi-company app settings and letterhead selector
6. Global shared master data UI
7. Numbering engine UI
8. Attachment/document readiness UI
9. Future Cursor implementation plan

This must be prepared as a design and implementation blueprint for the existing app.

Do not directly implement all functionality unless explicitly asked later.

---

## 3. Browser Inspection Requirement

Open the current app in the browser and inspect these pages visually:

```text
http://localhost:3000/dashboard
http://localhost:3000/admin/organizations
http://localhost:3000/admin/branches
http://localhost:3000/admin/users
http://localhost:3000/admin/roles
http://localhost:3000/admin/permissions
http://localhost:3000/admin/audit
```

Inspect especially:

- current Add Organization dialog
- current Add Branch dialog
- current Add User dialog
- Role detail drawer if available
- page spacing
- table layout
- sidebar/header
- field density
- modal size
- validation pattern
- action buttons

Create screenshots if possible and reference them in the report.

---

## 4. Key UI/UX Standard Required

All major Add/Edit/View forms in the ERP must use a **right-side sliding drawer form**.

### Required drawer behavior

```text
Slide from right to left
Cover approximately 80% of desktop screen width
Height: full viewport
Internal scroll area
Sticky header
Sticky footer
Background page dimmed but visible
```

### Desktop sizing

```text
Width: 78% to 82% of viewport
Max width: 1450px
Min width: 960px
Position: right
Height: 100vh
```

### Tablet sizing

```text
Width: 90% to 100%
Still slides from right
```

### Mobile sizing

```text
Full screen
Header/footer sticky
Fields single-column
```

### Use cases

Drawer forms must become standard for:

- Add Organization
- Edit Organization
- View Organization
- Add Branch
- Edit Branch
- Add User
- Edit User
- Assign Role
- View Role
- Add Employee
- Edit Employee
- Add Vehicle
- Edit Vehicle
- Add Document
- Edit Document
- Future module forms

Small center dialogs should only remain for:

- delete confirmation
- simple warning
- yes/no action

---

## 5. Drawer Form Structure

Design the global drawer system with reusable components:

```text
ERPDrawerForm
ERPDrawerHeader
ERPDrawerBody
ERPDrawerFooter
ERPDrawerSection
ERPDrawerSectionNav
ERPFieldGrid
ERPValidationSummary
ERPDraftBadge
ERPStatusBadge
ERPUnsavedChangesBar
ERPFormAuditPanel
```

### Drawer header must include

- Form mode badge:
  - Add
  - Edit
  - View
  - Draft
  - Approval
- Entity title
- Record number/reference if available
- Status badge
- Close button
- More actions menu:
  - Print
  - Download PDF
  - Download Excel
  - Download CSV
  - Send by Email
  - View Audit Trail

### Drawer body must support

#### Pattern A — Section cards

Good for medium forms:

- Basic Information
- Contact
- Legal
- Tax
- Address
- Notes

#### Pattern B — Left internal section navigation

Preferred for long forms:

Left internal menu:

- Basic
- Address
- Legal & Tax
- Documents
- Attachments
- Audit

Right content area:

- Form sections with fields

### Drawer footer must include

- Cancel
- Save as Draft
- Save & Close
- Save & New
- Submit / Finalize
- Unsaved changes indicator
- Last saved timestamp
- Validation error count

---

## 6. Draft Workflow UX

Design a global save-as-draft workflow.

Requirement:

When adding or editing a record, user can save the form as **Draft**.

Draft records:

- can be incomplete
- must be clearly marked as Draft
- must be visible in lists with Draft badge
- can be reopened and completed later
- are not treated as final/active records
- should not trigger final business workflows until submitted/finalized

Draft UX must include:

- Draft status badge
- Draft warning banner
- Resume draft action
- Save as Draft button
- Submit final button
- Minimal validation on draft save
- Full validation on final submit
- Draft list filters
- Draft audit logging

Plan how this can apply globally to future modules.

---

## 7. Global Export / Print / Email UX

Design a global export/share system for every list, form, and detail page.

Every page should support:

```text
Print
Download PDF
Download Excel
Download CSV
Send by Email
```

### List pages

Export menu in page header or table toolbar.

Should include:

- Export current page
- Export all filtered records
- Include active filters in report header
- Include generated by
- Include generated date/time
- Include page numbers for PDF

### Detail / drawer forms

Export menu in drawer header.

Should include:

- Print current record
- Download PDF
- Download Excel
- Download CSV
- Send by Email

### Enterprise PDF/Print template

Design should include:

- selected company logo
- company name
- company address
- TRN/trade license if selected
- report title
- report reference
- generated by
- generated date/time
- filters applied
- page number
- footer
- optional QR code later

---

## 8. Send by Email UX

Design a reusable email send flow.

User can generate a PDF/Excel/CSV and send it directly from the system.

Email dialog/drawer must include:

- To
- CC
- BCC
- Subject
- Message body
- Attachment type:
  - PDF
  - Excel
  - CSV
- Selected letterhead/company
- Email template
- Attachment preview
- Send button
- Save draft email if needed later

Email UX states:

- preparing attachment
- sending
- sent successfully
- failed to send
- retry
- validation errors

Important:

Do not implement actual email backend now. Plan UI/UX and architecture only.

---

## 9. Multi-Company App Settings & Letterhead UX

The ERP must support multiple company identities/letterheads.

Example companies:

- Alliance Gulf Transport & Construction L.L.C
- Alliance Scrap Trading L.L.C
- Pan Gulf / future companies if needed

Design App Settings sections for:

### Company / Letterhead Profiles

Fields:

- company name English
- company name Arabic
- short name
- logo
- letterhead logo
- address
- phone
- email
- website
- TRN
- trade license number
- footer text
- stamp image
- signature image
- default PDF template
- default print template
- active/inactive

### Letterhead selection UX

When printing/PDF/emailing, user selects:

```text
Print as / Letterhead:
Alliance Gulf Transport
Alliance Scrap Trading
Other active company profile
```

Show:

- company logo preview
- address preview
- TRN/license preview
- footer preview

---

## 10. App Settings UX Plan

Design App Settings pages for:

1. Company & Letterhead Profiles
2. Print/PDF Templates
3. Export Settings
4. Email Settings
5. Numbering Settings
6. UI Preferences
7. Security Preferences
8. Notification Preferences
9. Storage / Attachment Settings
10. Audit Settings

### Print/PDF Settings

- page size A4
- orientation
- margin size
- header layout
- footer layout
- page numbers
- watermark option
- logo position
- default template

### Export Settings

- Excel styling
- CSV delimiter
- filename pattern
- include filters
- include generated by/date
- date format
- number/currency formatting

### Email Settings

- sender name
- sender email
- reply-to
- email signature
- email templates
- SMTP/provider placeholder

### UI Settings

- default theme
- compact mode
- language
- timezone
- date format
- number format
- currency format

---

## 11. Global Shared Master Data UX Plan

Create UI plan for global master data that will be used across all modules.

Do not implement module-specific master data yet.

Shared master data includes:

- Countries
- Emirates / States
- Cities / Areas
- Currencies
- Units of Measure
- Departments
- Designations / Job Titles
- Nationalities
- Banks
- Payment Terms
- Tax Types
- Document Types
- Document Categories
- Status Lists
- Notification Templates
- Numbering Prefixes
- Attachment Categories
- File Type Rules

Each master data screen should use:

- list/table
- search
- filter
- active/inactive status
- right-side drawer add/edit form
- export actions
- audit trail
- draft support if relevant

---

## 12. Numbering Engine UX Plan

Create UI/UX for global numbering settings.

Examples:

- EMP-000001
- VEH-000001
- DOC-2026-000001
- BRN-000001
- INV-2026-000001
- PO-2026-000001

Settings must include:

- entity/module
- prefix
- reset rule:
  - never
  - yearly
  - monthly
- current number
- padding length
- next number preview
- active/inactive
- editable by admin only
- audit history

---

## 13. Attachment / Document Readiness UX

Before full DMS, every form should be ready for attachments.

Design a reusable attachment panel:

- upload area
- document type
- document category
- expiry date
- has expiry yes/no
- file size
- uploaded by
- uploaded date
- preview/download
- delete if allowed
- version placeholder
- status badge

Do not implement storage now. Plan the UI and architecture.

---

## 14. Visual Quality Benchmark

Design should feel closer to:

- Atoms-style enterprise admin
- Microsoft Dynamics
- Zoho One
- Odoo Enterprise
- SAP Fiori-inspired clarity
- Oracle NetSuite seriousness

Avoid:

- tiny center modal forms
- childish gradients
- playful SaaS cards
- too much empty white space
- cramped tabs
- default unstyled shadcn look
- oversized form controls
- weak hierarchy

---

## 15. Required Deliverables

Create these design/plan reports:

```text
ANTIGRAVITY_002E_UIUX_AUDIT_REPORT.md
ANTIGRAVITY_002E_DRAWER_FORM_DESIGN_PLAN.md
ANTIGRAVITY_002E_EXPORT_EMAIL_UX_PLAN.md
ANTIGRAVITY_002E_APP_SETTINGS_UX_PLAN.md
ANTIGRAVITY_002E_GLOBAL_MASTER_DATA_UX_PLAN.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_PLAN.md
```

Each report must be detailed and implementation-ready.

---

## 16. Optional Prototype Deliverables

If practical, create visual-only prototype components in a safe separate folder, not wired to backend:

```text
uiux_prototypes/002E/
  drawer-form-prototype.tsx
  export-email-prototype.tsx
  app-settings-prototype.tsx
  master-data-prototype.tsx
  numbering-settings-prototype.tsx
```

These prototypes must not affect the live app unless explicitly approved.

---

## 17. What Not To Do

Do not:

- modify database
- modify migrations
- modify Supabase Auth
- modify RLS
- modify middleware
- modify server actions
- change real app behavior
- implement business modules
- implement email backend
- implement file storage backend
- install a full admin template
- replace existing app

This is UI/UX planning and optional prototype only.

---

## 18. Final Goal

Create a clear implementation blueprint so Cursor can later implement Phase 002E/002F safely in the existing ERP app.

The future standard must be:

```text
Right-side 80% drawer forms
Draft workflow
Enterprise print/PDF/Excel/CSV export
Send by email from system
Multi-company letterhead selector
App settings
Global shared master data
Numbering engine
Attachment readiness
```

Stop after reports/prototypes.
