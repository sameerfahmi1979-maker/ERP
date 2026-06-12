# PROMPT_ERP_BASE_002F_3E_3B_CORRECT_THREE_UX_PLANNING_FILES

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX architect, senior React/Next.js implementation planner, master-data governance auditor, reusable component architect, SaaS product design-system specialist, accessibility reviewer, enterprise ERP benchmarking analyst, and AI-ready ERP foundation planner.

## Phase

ERP BASE 002F.3E.3B — Correct Customer UX/Performance Planning and Global UI/UX Guide

## Prompt Purpose

This is a CORRECTION prompt for existing planning documents only.

Do not implement code.

Do not modify database schema.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Do not change Customers module.

Your task is to update only the three existing planning/guide files listed below, based on Sameer/Dina review comments and enterprise UI/UX benchmarking principles.

---

# 1. Mandatory Supabase Connection First

Before updating the files, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect the current live schema only where needed to ensure the plan remains aligned with actual ERP implementation.

The updated documents must clearly state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database/application context was verified before updating the planning documents.
```

If you cannot connect, still update the planning documents using the available reports, but clearly state:

```text
WARNING — Live Supabase verification could not be completed during this correction.
```

Do not block the document update unless the files cannot be safely updated.

---

# 2. Files To Update

Update only these three files:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md

ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md

ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Do not create any additional files.

Do not create implementation prompts in this step.

Do not create migrations.

Do not modify source code.

---

# 3. Review Comments To Apply

Sameer/Dina review decision:

```text
The three files are structurally good but require enhancement before approval.
```

Required enhancements:

```text
1. Replace “searchable dropdown” concept with “Combobox everywhere”.
2. Add Global Search / Command Palette standard.
3. Add AI-Ready ERP Foundation standard.
4. Add enterprise UI/UX benchmarking principles.
5. Add design system and pattern library standards.
6. Add information architecture, cognitive load, usability friction, accessibility, microcopy, localization, and UI/UX testing standards.
7. Strengthen modal sizing and no-horizontal-scroll rules.
8. Update Customer performance plan with confirmed frontend-only loading issue.
9. Update implementation sequence.
```

---

# 4. Enterprise UI/UX Benchmarking Principles To Add

Incorporate principles inspired by enterprise ERP and design system references:

```text
SAP Fiori:
- modular reusable design system
- pattern-based enterprise UI
- consistency across complex business applications
- responsive and accessible business apps

Microsoft Dynamics / Power Apps:
- model-driven app approach
- table + view + form + relationship structure
- consistent user experience across modules
- forms organized by tabs/sections
- views/lists with defined columns, sorting, filtering, and actions

Microsoft Fluent:
- combobox for selectable values and searchable selection
- field labels with required indicators and validation messages
- drawer/dialog anatomy with header/body/footer
- safe close behavior for forms with inputs
- dialogs focused on one task
- up to three footer actions

Oracle Redwood / Oracle JET public design direction:
- modern enterprise experience
- guided workflows
- clean, consistent business components
- business-user productivity focus

Workday-style enterprise UX:
- simple business-process flow
- role-based tasks
- clear actions and review steps
- minimal cognitive load for non-technical users

Infor CloudSuite-style ERP direction:
- role-based workflows
- industry-specific processes
- integrated data visibility
- operational efficiency

General UI/UX Design Guide concepts:
- design system
- style guide
- pattern library
- information architecture
- user-centered design
- usability
- accessibility / WCAG readiness
- cognitive load reduction
- usability friction reduction
- microcopy
- localization / Arabic-English readiness
- UI/UX testing
- acceptance testing
```

Do not copy external brand visuals or proprietary UI exactly.

Extract reusable principles only.

---

# 5. Major Required Change — Combobox Everywhere

The existing files use wording such as:

```text
dropdown
searchable dropdown
select
only dropdowns with more than 10 records must be searchable
```

This must be changed.

## New Global Decision

Sameer decided:

```text
Use Combobox everywhere.
Do not use traditional non-searchable dropdown/select components anywhere in ERP forms.
```

## Required Global Rule

Add this as a mandatory global standard:

```text
All selectable fields in ERP forms must use a searchable Combobox component, regardless of the number of records.
```

This applies to:

```text
Lookup values
Countries
Emirates / Regions
Cities
Areas / Zones
Banks
Currencies
Payment Terms
Tax Types
Customers
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
Employees
Assets
Projects
Cost Centers
Profit Centers
Branches
Organizations
All future entity selections
```

## Combobox Must Support

```text
search by code
search by English name / label
search by Arabic name / label where available
keyboard navigation
clear option for optional fields
loading state
empty / no results state
disabled state
read-only state
consistent width and styling
RLS-safe data loading
permission-safe data filtering where applicable
```

## Component Strategy

The guide must say:

```text
Do not create one-off dropdowns.
Do not create module-specific comboboxes unless there is a reusable entity select pattern.
Enhance shared components once and reuse them everywhere.
```

Shared components to enhance:

```text
LookupSelect / convert to LookupCombobox or keep name but behave as combobox
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
BankSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
CustomerSelect
VendorSelect
EmployeeSelect
AssetSelect
ProjectSelect
```

It is acceptable for technical file names to remain `Select` temporarily, but the behavior must be Combobox.

---

# 6. Add Global Search / Command Palette Standard

Add a new official section to the global guide:

```text
Global Search / Command Palette Standard
```

The top search bar in the ERP must become functional, not decorative.

Required behavior:

```text
Global shortcut: Ctrl + K / Cmd + K
Search by code/reference
Search by English name
Search by Arabic name
Search by email
Search by mobile/phone
Search by TRN
Search by trade license
Search by ICV certificate number
Search by CICPA registration number
Group results by module/entity
Respect RLS
Respect permissions
Click result opens correct module/entity drawer in View mode
No result is shown if user does not have permission
```

Initial searchable entities:

```text
Customers
Customer contacts
Organizations / owner companies
Branches
Vendors later
Subcontractors later
Consultants later
Government authorities later
Recruitment agencies later
Employees later
Assets later
Projects later
Documents later after DMS
```

Recommended architecture:

```text
Global search registry
Search providers per module
Central global-search service/action
Permission-aware search
Result grouping by entity type
Open result in drawer/view mode
```

Add note:

```text
Do not implement global search now in the Customer UX phase.
Create a future foundation phase for it.
```

Recommended future phase:

```text
ERP BASE 002F.3E.3C — Global Search / Command Palette Foundation
```

---

# 7. Add AI-Ready ERP Foundation Standard

Add a new official section to the global guide:

```text
AI-Ready ERP Foundation Standard
```

Important:

```text
Do not implement AI now.
Prepare the ERP so AI can be added safely later.
```

AI-ready foundation includes:

```text
consistent master data
clean reference codes
global search registry
DMS-ready document placeholders
audit logs
permission/RLS model
standard form metadata
clear field labels and descriptions
structured validation schemas
well-documented modules
user actions and audit trail
```

Future AI features to plan later:

```text
AI form fill
AI document extraction
AI customer/vendor summary
AI DMS search
AI compliance expiry insights
AI report generation
AI workflow suggestions
AI data quality warnings
```

First recommended AI feature later:

```text
AI form fill / document extraction after DMS foundation.
```

Example:

```text
Upload trade license or VAT certificate.
AI extracts company name, license number, TRN, expiry date, address, and contact details.
```

Add note:

```text
AI should come after DMS foundation, global search foundation, and more stable master data modules.
```

---

# 8. Add Design System and Pattern Library Standards

Add sections or strengthen existing sections:

```text
Enterprise Design System Standard
Reusable Pattern Library Standard
```

Must include:

```text
Build once, reuse everywhere.
All modules must use shared ERP components.
Avoid one-off UI components.
Every reusable UI pattern must be documented.
Component behavior must be predictable across modules.
```

Shared components:

```text
ERPDrawerForm
ERPDrawerSectionNav
ERPDrawerSection
ERPDataTable
ERPFieldGrid
ERPFormFooter
ERPCombobox
LookupCombobox
EntityCombobox
RequiredLabel / required Label prop
ConfirmDiscardDialog
ChildRecordDialog
DocumentsPlaceholder
AuditSystemInfoSection
```

---

# 9. Add Information Architecture Standard

Add or strengthen:

```text
Information Architecture Standard
```

Must state:

```text
Menus must be logically grouped.
Modules must follow business mental model.
One module = one main list screen.
One entity = one main drawer.
Related data = tabs.
Child records = inside parent tabs.
Do not scatter related data across many pages.
Use clear labels that match business terminology.
```

---

# 10. Add Cognitive Load and Usability Friction Standards

Add sections:

```text
Cognitive Load Reduction Standard
Usability Friction Reduction Standard
```

Must include:

```text
Use tabs to break complex forms into meaningful groups.
Use progressive disclosure.
Do not show irrelevant controls.
Avoid excessive fields on one screen.
Avoid repeated loading when switching tabs.
Avoid non-searchable lists.
Avoid accidental form close.
Avoid unclear action names.
Use simple microcopy.
```

---

# 11. Add Accessibility and Localization Standards

Add or strengthen:

```text
Accessibility / WCAG Readiness Standard
Localization / Arabic-English Readiness Standard
```

Must include:

```text
Keyboard navigation for comboboxes, dialogs, drawers, and tables.
Readable contrast.
Do not rely on color only.
Error messages must be textual.
ARIA-friendly dialogs/comboboxes where possible.
Labels must be associated with inputs.
Arabic labels/names supported where database has Arabic fields.
RTL readiness for Arabic input fields.
Date/currency/number formatting must respect UAE/business context.
```

---

# 12. Add Microcopy Standard

Add section:

```text
Microcopy and Form Help Text Standard
```

Must include approved wording examples:

```text
Auto-generated on save.
Save customer first to add contacts.
Documents will be managed through the centralized DMS module.
Available after DMS implementation.
No results found.
Loading...
You have unsaved changes. Do you want to discard them?
Failed to generate customer code.
```

---

# 13. Strengthen Modal/Dialog Sizing Standard

Current guide uses 600px for standard forms. Based on screenshots, address form is cramped.

Update standard:

```text
Standard child Add/Edit modal width: 720px
Minimum: 600px only for very small forms
Maximum width: 90vw
Maximum height: 85vh
Vertical scroll only
No horizontal scroll
Two-column layout on desktop
One-column layout on tablet/mobile
Sticky footer where needed
```

Apply to:

```text
Add/Edit Contact
Add/Edit Address
Add/Edit Bank Detail
Future vendor contacts
Future subcontractor contacts
Employee dependents
Asset child records
```

---

# 14. Keep Save / Save & Close / Cancel Standard

Ensure guide clearly states:

```text
Add/Edit forms:
Cancel | Save | Save & Close

Save:
- saves and keeps form open
- refreshes current form data
- useful for entering multiple child records

Save & Close:
- saves and closes
- refreshes parent list or affected child list

Cancel:
- if no changes, close
- if unsaved changes, ask confirmation

View mode:
Close only
```

This applies to:

```text
main drawer forms
child modals
settings forms
future transaction forms
```

---

# 15. Keep Safe Close Standard

Ensure guide clearly states:

```text
Add/Edit:
- outside click does not close
- Escape does not close without confirmation
- X asks confirmation if dirty
- Cancel asks confirmation if dirty

View:
- outside click can close
- Escape can close
- Close button only
```

---

# 16. Update Customer Closure Plan

Update:

```text
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md
```

Must include:

```text
Combobox everywhere, not searchable dropdowns
Customer child modal standard width 720px
No horizontal scroll
Safe close behavior
Save / Save & Close / Cancel
Required fields with red *
Global search is future phase, not this phase
AI-ready foundation is guide-only, not implementation now
Performance issue is frontend-only because indexes already exist
Parallel loading recommended
```

Update open questions:

Remove or resolve these:

```text
Should we use existing Select or switch to Combobox?
```

Replace with:

```text
Decision: Use Combobox everywhere.
```

Remove:

```text
Any dropdown with more than 10 records only
```

Replace with:

```text
All selectable fields must use Combobox.
```

---

# 17. Update Next Implementation Steps

Update:

```text
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Replace current sequence with this refined sequence:

```text
002F.3E.3B.1 — Update and Store Global UI/UX Development Guide
002F.3E.3B.2 — Implement Global Combobox Foundation in Shared Components
002F.3E.3B.3 — Implement Required Field Markers and Form Footer Standard
002F.3E.3B.4 — Implement Safe Close, Unsaved Changes, and Modal Layout Standard
002F.3E.3B.5 — Apply Standards to Customer Forms and Enhance Documents Placeholder
002F.3E.3B.6 — Optimize Customer Drawer Loading Performance
002F.3E.3B.7 — Final Customer QA and Closure Report
```

Add future phases:

```text
ERP BASE 002F.3E.3C — Global Search / Command Palette Foundation
ERP BASE 002F.Future — AI-Ready ERP Assistant / AI Form Fill Foundation after DMS
```

Do not schedule AI implementation now.

---

# 18. Required Status Updates

Update file statuses.

For the global guide:

```text
Status: REV1 — Enhanced with Sameer/Dina review comments
```

For customer plan:

```text
Status: REV1 — Enhanced with Sameer/Dina review comments
```

For next implementation steps:

```text
Status: REV1 — Enhanced with Sameer/Dina review comments
```

Each file must end with:

For global guide:

```text
READY FOR SAMEER REVIEW — Global ERP UI/UX development guide REV1 complete.
```

For customer plan:

```text
READY FOR SAMEER REVIEW — Customer UX/performance closure plan REV1 complete.
```

For next steps:

```text
READY FOR SAMEER REVIEW — Next implementation steps REV1 prepared.
```

---

# 19. Final Instruction

Update only:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Do not implement code.

Do not create migrations.

Do not change application source files.

Do not create new files.

Stop after updating the three files.
