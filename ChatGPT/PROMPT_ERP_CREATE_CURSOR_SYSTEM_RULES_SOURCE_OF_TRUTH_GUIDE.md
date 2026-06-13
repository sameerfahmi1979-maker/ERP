# PROMPT_ERP_CREATE_CURSOR_SYSTEM_RULES_SOURCE_OF_TRUTH_GUIDE

Act as Fable 5 inside Cursor.

Use deep source-code and documentation reasoning as a senior ERP documentation architect, Cursor project-rules engineer, Next.js/Supabase technical lead, phase tracker maintainer, and ERP implementation governance reviewer.

## Task

Create a permanent Cursor source-of-truth system guide for the ALGT ERP project.

This must be saved inside a dedicated `.cursor` folder and must become the main guide that Cursor reads before every future prompt or implementation.

The goal is to make one single updatable ERP source-of-truth file that merges:

```text
1. ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md
2. ERP_BASE_FULL_PHASE_STATUS_TRACKER.md
3. ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
4. Existing docs/standards files
5. Current source-code reality
6. Latest phase reports in implementation_Review/
```

The guide must include:

```text
all current implemented modules
all planned ERP modules
all placeholder modules
all DB-ready but not UI-built modules
all global standards
all global settings
all source-of-truth rules
all completed phases
all next phases
all known technical debt
all important file paths
all implementation rules for Cursor
```

This file must be updated in every future ERP prompt when a phase is completed.

---

# 1. Files to Create

Create this folder structure:

```text
.cursor/
.cursor/rules/
```

Create these files:

```text
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
.cursor/rules/algt-erp-source-of-truth.mdc
.cursor/README.md
implementation_Review/Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md
```

The main requirement is:

```text
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
```

This must become the single merged source-of-truth file.

---

# 2. Cursor Rule File Requirement

Create:

```text
.cursor/rules/algt-erp-source-of-truth.mdc
```

Use Cursor Project Rule format:

```mdc
---
description: ALGT ERP source-of-truth rules for every implementation, QA, planning, and documentation task
globs:
  - "**/*"
alwaysApply: true
---

# ALGT ERP Source of Truth Rule

Before any ERP implementation, planning, QA, bug fix, refactor, database work, or UI task:

1. Read `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`.
2. Read the current phase prompt.
3. Read latest relevant implementation reports.
4. Connect to live Supabase if database/source verification is needed.
5. Follow the global ERP rules exactly.

After any phase is completed:

1. Create the phase report.
2. Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`.
3. Add phase status, files changed, report filename, bugs fixed, known notes, and next recommended phase.
4. Do not rely on stale tracker files when a newer closure report or source code contradicts them.
5. The live source code and latest closure reports override older planning documents.
6. Do not build modules marked PLANNED or DB-READY unless Sameer/Dina explicitly approve the phase.
```

---

# 3. Mandatory Files to Read First

Read these attached/current files if present:

```text
ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md
ERP_BASE_FULL_PHASE_STATUS_TRACKER.md
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Read latest closure reports under:

```text
implementation_Review/
```

Prioritize the latest reports over older trackers. The phase tracker may be stale compared with the latest full implementation guide and closure reports.

---

# 4. Mandatory Supabase Check

Connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Confirm the connection is correct.

Document in `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:

```text
Live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Correct MCP/tool: user-supabase
Wrong/avoid MCP/tool if present: plugin-supabase-supabase if it points to unrelated project
```

No database changes are allowed in this prompt.

---

# 5. Source Code Audit Required

Inspect the repository source to confirm actual implemented modules.

Run or equivalent:

```bash
find src/app -path "*page.tsx" -type f
find src/features -maxdepth 4 -type f
find src/components/erp -maxdepth 4 -type f
find src/server/actions -type f
find src/hooks -type f
find src/lib/query -type f
grep -R "comingSoon" -n src/components/layout src/app
grep -R "ERPDrawerForm" -n src
grep -R "ERPFormFooter" -n src
grep -R "RequiredLabel" -n src
grep -R "ERPCombobox" -n src
grep -R "LookupSelect" -n src
grep -R "useFormDirty" -n src
grep -R "generateNextReference" -n src
grep -R "hasPermission" -n src
grep -R "getAuthContext" -n src
grep -R "/dev/" -n src/app
```

The source-code reality must be reflected in the final `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`.

---

# 6. Required Contents of `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

Create a complete, structured guide with these sections.

## 6.1 Project Identity

Include:

```text
Project name
Company context
ERP purpose
Stack
Repository path
GitHub repo if known
Live Supabase URL
Correct Supabase MCP/tool
Wrong Supabase MCP/tool warning
```

## 6.2 Global Non-Negotiable Rules

Include:

```text
BIGINT IDs only
No UUID unless approved
No hardcoded dropdowns
Global numbering for human-readable references
No source-only closure for runtime behavior
Browser/runtime verification required for drawer/dirty/Safe Close/performance
No database changes unless phase prompt explicitly approves it
No new modules outside approved phase
Every phase must create a report
Every future prompt must update this source-of-truth file
```

## 6.3 Implemented Technology Stack

Include exact versions from `package.json` if available:

```text
Next.js
React
TypeScript
Supabase
TanStack Query
TanStack Table
Zod
React Hook Form
shadcn/ui
Tailwind
```

## 6.4 Current Implemented Modules

Create a table:

```text
Module | Route | UI Status | DB Status | Main Files | Server Actions | Status | Notes
```

Include all live modules:

```text
Dashboard
Users
Roles
Permissions
Organizations
Branches
Numbering Rules
Lookup Categories
Lookup Values
Locked System Values
Geography:
  Countries
  Emirates/Regions
  Cities
  Areas/Zones
  Ports
Finance Basics:
  Currencies
  Payment Terms
  Tax Types
  Banks
  Cost Centers
  Profit Centers
UOM:
  Categories
  Units
  Conversions
Customers:
  Customer main
  Customer Contacts
  Customer Addresses
  Customer Bank Details
  Customer Documents placeholder
Audit Logs
Profile
Settings
```

## 6.5 On-Screen Placeholder Modules

Include all disabled/sidebar/dashboard placeholder modules:

```text
Fleet Management
HR & Payroll
Workshop
HSE
Finance
Inventory
Procurement
Documents / DMS
```

Mark clearly:

```text
Visible but not built.
Sidebar items disabled with Soon badge.
Dashboard cards are demo/fake data only.
Do not treat as implemented.
```

## 6.6 DB-Ready But Not UI-Built Modules

Include:

```text
Vendors
Vendor Contacts
Vendor Addresses
Vendor Bank Details
Vendor Documents

Subcontractors
Subcontractor Contacts
Subcontractor Addresses
Subcontractor Bank Details
Subcontractor Documents

Consultants
Consultant Contacts
Consultant Addresses
Consultant Bank Details
Consultant Documents

Government Authorities
Government Authority Contacts
Government Authority Addresses
Government Authority Documents
No government authority bank details table by design

Recruitment Agencies
Recruitment Agency Contacts
Recruitment Agency Addresses
Recruitment Agency Bank Details
Recruitment Agency Documents
```

Mark:

```text
DB/RLS exists, UI not built.
Do not claim these modules are implemented.
```

## 6.7 Planned Operational Modules

Include all roadmap/planned modules:

```text
CRM
HR / Payroll
Fleet / Equipment
Workshop
Inventory
Procurement
DMS / Document Control
Task Management / Workflow
HSE
Scrap Trading
Waste Management
Demolition Projects
Transport / Trips
Rental / Equipment Utilization
Fuel / Diesel Management
Weighbridge Integration
Reporting / KPI / BI Dashboard
Notification / Reminder Engine
Approval Workflow Engine
Global Print / PDF / Email Output
External Integrations
Global Search / Command Palette
AI Center
Security / Penetration Testing
Final QA / UAT / Deployment
```

## 6.8 Phase Status Tracker

Create an up-to-date phase table based on the latest guide and closure reports.

At minimum include:

```text
001 — Base Foundation — CLOSED
002D — Admin Master Data Hardening — CLOSED
002F.2 — Global Numbering Engine — CLOSED
002F.3B — Global Lookup / Dropdown Engine — CLOSED
002F.3C.1 — Geography & Locations — CLOSED
002F.3C.2 — Finance Basics — CLOSED
002F.3C.3 — Units & Measurements — CLOSED
002F.3E.2 — Database + Lookups + Seeds — CLOSED
002F.3E.3 — Customers initial module — CLOSED
002F.3E.3B.2 — Global Combobox Foundation — CLOSED
002F.3E.3B.3 — Required/Footer — CLOSED
002F.3E.3B.4 — Safe Close — CLOSED
002F.3E.3B.5 — Global Form Runtime QA — CLOSED WITH NOTES
002F.3E.3B.6A-G — Performance / Prefetch / Parent Runtime Standard — CLOSED WITH NOTES
002F.3E.3B.7 — Customer Module Final QA and Closure — CLOSED WITH NOTES
002F.3E.4 — Current Modules Global QA Gate — PASS WITH NOTES
```

Also include notes about stale older tracker rows.

## 6.9 Global Standards Implemented

Document:

```text
ERPDrawerForm
ERPDrawerSection
ERPFormFooter
RequiredLabel
ERPCombobox
LookupSelect
useFormDirty
UnsavedChangesDialog
TanStack Query provider
queryKeys
invalidation helpers
prefetch utilities
child table query hook
parent form runtime standard
```

## 6.10 Customer Reference Implementation

Document Customer as the copy-template for Vendors and future party-master modules.

Include:

```text
customer-prefetch.ts
use-customer-form-prefetch.ts
use-customer-child-queries.ts
customers-table.tsx
customer-form-drawer.tsx
customer contacts/addresses/bank sections
server actions
numbering CUSTOMER and CUSTOMER_CONTACT
effectiveCustomerId fix
Contacts loading fix
documents placeholder
sales owner future
```

## 6.11 Party Master Rules From REV1 Plan

Merge the important business classification rules from the REV1 plan:

```text
Customer types:
GOVERNMENT_CUSTOMER
SEMI_GOVERNMENT_CUSTOMER
UTILITY_COMPANY
WATER_POWER_PLANT
INDUSTRIAL_CUSTOMER
COMMERCIAL_CUSTOMER
MAIN_CONTRACTOR
EPC_CONTRACTOR
SCRAP_BUYER
SCRAP_SUPPLIER
PARTNER_CUSTOMER
NORMAL_CUSTOMER

Vendor types:
TRANSPORTER
TRANSPORT_SERVICE_PROVIDER
LOGISTICS_SERVICE_PROVIDER
PRIVATE_WASTE_DISPOSAL_FACILITY
WASTE_DISPOSAL_SERVICE_PROVIDER
MATERIAL_SUPPLIER
EQUIPMENT_SUPPLIER
SERVICE_PROVIDER
INSURANCE_COMPANY
PROPERTY_LESSOR
VEHICLE_LESSOR
EQUIPMENT_LESSOR
CAMP_ACCOMMODATION_LESSOR
UTILITY_PROVIDER
SUPPLIER

Subcontractor types:
TRANSPORTER
TRANSPORT_SUBCONTRACTOR
CIVIL_SUBCONTRACTOR
MANPOWER_SUBCONTRACTOR
DEMOLITION_SUBCONTRACTOR
EQUIPMENT_SUBCONTRACTOR
SPECIALIZED_SUBCONTRACTOR
PARTNER_SUBCONTRACTOR

Government authority types:
LICENSE_ISSUER
PERMIT_ISSUER
UTILITY_AUTHORITY
TRANSPORT_AUTHORITY
PORT_AUTHORITY
CUSTOMS_AUTHORITY
GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
MUNICIPALITY
POLICE
CIVIL_DEFENSE
ENVIRONMENTAL_AUTHORITY
FREE_ZONE_AUTHORITY
REGULATOR
MINISTRY
```

Include classification rules:

```text
Transporter as service provider = Vendor.
Transporter hired for project execution = Subcontractor.
Private waste disposal facility = Vendor.
Government/municipality waste disposal facility = Government Authority.
Recruitment agencies are separate table but vendor-like for payment.
Government authorities do not have bank details table by design.
```

## 6.12 Important File List

Group important paths:

```text
standards
global components
query/cache utilities
customer module
organization/branch prefetch
future party templates
server actions
auth/RBAC
dev harnesses
latest reports
```

## 6.13 Known Technical Debt

Include:

```text
Dev harnesses must be deleted before production:
/dev/performance-qa
/dev/customer-prefetch-qa
/dev/customer-child-qa

Pre-existing lint debt
Next.js middleware to proxy deprecation
Numbering page unauthorized empty shell
Organization/Branch legacy text-column sync
Branch geography FK migration deferred
Customer Documents placeholder
DMS not implemented
Customer sales owner picker not implemented
Browser-authenticated QA pending
Older phase tracker partly stale
```

## 6.14 Next Recommended Phases

Include recommended next order:

```text
1. ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness
2. ERP BASE 002F.5 — Party-Master Module Preparation
3. Vendors module
4. Subcontractors module
5. Consultants module
6. Government Authorities module
7. Recruitment Agencies module
8. Production cleanup before deployment
```

Mention:

```text
If Sameer wants to skip DMS readiness, build Vendors next using Customer as reference, but this is less recommended because every party-master module has documents.
```

## 6.15 Update Protocol

Add a mandatory protocol:

```text
At the start of every Cursor phase:
1. Read .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
2. Read .cursor/rules/algt-erp-source-of-truth.mdc
3. Read phase prompt
4. Read latest relevant reports
5. Connect to Supabase if DB involved
6. Confirm status before implementation

At the end of every Cursor phase:
1. Create phase report
2. Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
3. Add phase status to tracker section
4. Add files changed
5. Add known notes
6. Add next recommended phase
7. Run typecheck/build/lint
8. Stop
```

---

# 7. `.cursor/README.md` Content

Create a short README:

```text
This folder contains project-level source-of-truth rules for ALGT ERP.
Cursor must read ALGT_ERP_SOURCE_OF_TRUTH.md before every phase.
Cursor must update it after every phase.
The rule file in .cursor/rules/ is alwaysApply=true.
```

---

# 8. Validation

After creating files, run:

```bash
ls -la .cursor
ls -la .cursor/rules
```

If possible run:

```bash
npm run typecheck
```

No app code should be modified, so build is not required unless Cursor changed code accidentally.

---

# 9. Required Output Report

Create:

```text
implementation_Review/Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md
```

Report must include:

```text
files read
files created
Supabase verification result
source audit summary
where the guide was saved
where the rule was saved
how future prompts must update it
known stale documents found
next recommended phase
```

---

# 10. Stop Condition

After creating:

```text
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
.cursor/rules/algt-erp-source-of-truth.mdc
.cursor/README.md
implementation_Review/Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md
```

stop.

Do not implement ERP features.

Do not start the next phase.

Wait for Sameer/Dina review.

---

# Final Instruction

Create the `.cursor` source-of-truth guide and always-apply Cursor rule.

Merge the attached guides, trackers, plans, latest reports, and live source-code reality.

Make `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` the single updatable guide for all future ERP prompts.

Stop after creating the report.
