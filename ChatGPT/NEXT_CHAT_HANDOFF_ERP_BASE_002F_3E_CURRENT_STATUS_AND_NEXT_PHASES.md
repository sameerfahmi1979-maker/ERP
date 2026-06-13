# NEXT_CHAT_HANDOFF_ERP_BASE_002F_3E_CURRENT_STATUS_AND_NEXT_PHASES

## Purpose of This File

Use this file to start a new faster ChatGPT chat for continuing the ALGT ERP implementation.

This file summarizes the project, stack, global rules, implemented phases, current status, known notes, critical files, and the recommended next phases.

---

# 1. Project Identity

Project name:

```text
ALGT-ERP-2026
```

ERP project goal:

```text
Build a custom ERP foundation for Alliance Gulf Transport & Construction L.L.C. / Alliance Scrap Trading L.L.C. / related group entities using a modern Next.js + Supabase stack.
```

Primary business context:

```text
ALGT / Alliance Scrap / PGI Group
Abu Dhabi / UAE operations
Transport, scrap, demolition, equipment, workshop, fleet, HR, projects, compliance, documents, and future AI center.
```

---

# 2. Technology Stack

Current ERP stack:

```text
Next.js 16
TypeScript
Supabase PostgreSQL
Supabase Auth / RLS
shadcn / Base UI
TanStack Query
TanStack Table
ERPCombobox
Server Actions
Global Drawer Forms
Global Numbering Engine
Global Lookup Engine
Global Parent Form Runtime Standard
```

Live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Important instruction:

```text
Always verify the live Supabase schema before planning or implementation.
The live schema is the source of truth.
Do not rely only on reports.
```

Known tooling note:

```text
A previous plugin Supabase connection sometimes pointed to a different weighing/industrial system project.
Use the correct ERP Supabase connection/tool and verify the project URL.
```

---

# 3. Global Development Rules

## 3.1 Database and IDs

```text
Use BIGINT primary keys / foreign keys.
Do not introduce UUIDs unless explicitly approved.
Human-readable codes must come from the global numbering engine.
No hardcoded autonumbering.
No manual typing of auto-generated codes.
```

## 3.2 Runtime Verification Rule

A major lesson from Safe Close:

```text
Source review alone is not enough for runtime behavior.
Browser/runtime verification is required for drawer close, outside click, Safe Close, combobox dirty state, performance, lazy loading, and child table behavior.
```

If browser auth is unavailable:

```text
Use a real production-component dev harness, clearly production-guarded.
Document it and remove it before production deployment.
```

## 3.3 Prompt / Report Rule

Every implementation phase must:

```text
Read standards and previous reports.
Connect to live Supabase first.
Implement only the scoped phase.
Run typecheck, lint, build.
Generate an implementation report.
Stop after report.
```

No report means the phase is not fully closed.

---

# 4. Global UI / Form Standards Implemented

The following standards are implemented and must be preserved:

```text
ERPDrawerForm
ERPDrawerSection
ERPFormFooter
RequiredLabel
ERPCombobox
LookupSelect
useFormDirty
UnsavedChangesDialog
Global Safe Close
Global Parent Form Runtime Standard
TanStack Query lookup caching
Child table query/invalidation pattern
```

## 4.1 Footer Standard

Add/Edit mode:

```text
Cancel | Save | Save & Close
```

View mode:

```text
Close only
```

## 4.2 Save Behavior

```text
Save:
- validates
- saves
- keeps form open
- resets dirty state

Save & Close:
- validates
- saves
- closes only after successful save
```

## 4.3 Safe Close

Dirty Add/Edit:

```text
outside click / Esc / X / Cancel => Unsaved Changes confirmation
Stay on Form => keep drawer open
Discard Changes => close drawer
```

View mode:

```text
outside click / Esc / X / Close => direct close
```

## 4.4 Combobox Standard

```text
All lookup/master data fields must use ERPCombobox / LookupSelect / approved wrapper.
No plain Select for domain lookup/master-data fields.
Plain Select is allowed only for fixed enum/admin metadata fields.
Combobox-only edits must mark form dirty.
```

## 4.5 Parent Form Runtime Standard

Parent forms must follow:

```text
Open drawer shell immediately.
Prefetch default/basic tab lookup data.
Seed individual LookupSelect query keys from batch results.
Lazy-mount only safe sections.
Never lazy-unmount FormData-dependent sections.
Fetch child tables only when tab opens and parent id exists.
Use TanStack Query for child tables.
Invalidate only the affected child table query after child mutation.
```

---

# 5. Official Standards Documents

The new chat should ask Cursor to keep and follow these files:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Important approved global standard:

```text
ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

This controls:

```text
parent form opening phases
lookup prefetch
child table loading
lazy mount safety
FormData data-loss prevention
future module checklist
runtime QA checklist
strict developer rules
```

---

# 6. Completed Phase Summary

## 6.1 Global Combobox / Form Runtime

```text
3B.2 — Global Combobox Foundation — CLOSED
3B.3 — Required Fields + ERPFormFooter — CLOSED WITH NOTES
3B.4 — Safe Close / Unsaved Changes — CLOSED
3B.5 — Global Form Runtime QA and Standard Closure Gate — CLOSED WITH NOTES
```

## 6.2 Performance / Cache / Lazy Loading

```text
3B.6A — Global Combobox and Form Runtime Performance Audit Plan — CLOSED
3B.6B — Global Lookup Cache and Hook Standard — CLOSED WITH NOTES
3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration — CLOSED WITH NOTES
3B.6D — Apply Optimized Hooks to Current Forms — CLOSED WITH NOTES
3B.6E — Lazy-Load Drawer Tabs and Child Sections — CLOSED WITH NOTES
3B.6F — Global Combobox/Form Performance Runtime QA Closure Gate — CLOSED WITH NOTES
```

## 6.3 Global Parent Form Runtime

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities — CLOSED
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring — CLOSED WITH NOTES
3B.6G.3 — Customer Child Tables TanStack Query Migration — CLOSED WITH NOTES
3B.6G.3B — Customer Contacts Loading Investigation and Fix — CLOSED WITH NOTES
3B.6G.4 — Generic Child Table Query / Invalidation Pattern — CLOSED WITH NOTES
3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules — CLOSED WITH NOTES
3B.6G.6 — Runtime QA Closure + Organization/Branch Prefetch Wiring — CLOSED WITH NOTES
```

## 6.4 Customer Module

```text
3B.7 — Customer Module Final QA and Closure — CLOSED WITH NOTES
```

Customer is now the reference implementation for:

```text
Vendor
Subcontractor
Consultant
Government Authority
Recruitment Agency
future party-master modules
```

## 6.5 Current Modules Global QA

```text
002F.3E.4 — Current Modules Global QA Gate — CLOSED WITH NOTES
```

---

# 7. Current Modules Verified in 002F.3E.4

The following modules/routes are implemented and were globally QA-audited:

```text
Dashboard
Users
Roles
Permissions
Organizations
Branches
Global Numbering Rules
Lookup Categories
Lookup Values
Locked System Values
Geography:
  Countries
  Emirates
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
  UOM Categories
  Units of Measure
  UOM Conversions
Customers:
  Customers
  Customer Contacts
  Customer Addresses
  Customer Bank Details
  Customer Documents placeholder
Audit Logs
Profile
Settings
```

The 002F.3E.4 report confirmed:

```text
29 protected routes inventoried.
All expected tables verified with RLS enabled and active policies.
All current routes build successfully.
All current module forms follow RequiredLabel / ERPFormFooter / useFormDirty / ERPCombobox standards.
Customer remains closed as reference implementation.
```

---

# 8. Important Fixes Already Completed

## 8.1 Safe Close Runtime Fix

Actual root cause found and fixed:

```text
useFormDirty attached before portal-rendered form existed.
It now uses document-level event delegation.
```

## 8.2 Customer Add → Save Child Sections Unlock Fix

Fixed in Customer final QA:

```text
effectiveCustomerId = currentCustomer?.id ?? createdCustomerId
```

After Add Customer → Save, child sections now unlock immediately.

## 8.3 Customer Lookup One-by-One Loading

Fixed by:

```text
CUSTOMER_FORM_PREFETCH
prefetchLookupCategories
seed individual LookupSelect query keys
CustomersTable page mount prefetch
Add/Edit/View click prefetch
```

## 8.4 Customer Child Table Performance

Fixed by:

```text
TanStack Query child hooks
queryKeys.child.*
targeted invalidation
5-minute staleTime
30-minute gcTime
skeleton loading
child-section lookup prefetch
```

## 8.5 Sidebar Dead Links

Fixed in 002F.3E.4:

```text
8 future module links that pointed to non-existent /modules/* routes were changed to disabled coming-soon items with Soon badge.
```

---

# 9. Known Notes / Technical Debt

These are known and non-blocking but must be remembered:

```text
Authenticated browser QA was not available in the agent environment; Sameer/Dina manual click-through still recommended.
Dev harness routes are retained and production-guarded, but must be deleted before production deployment.
Pre-existing lint debt remains, mostly in lookups.ts and prototype/UIUX files.
Numbering page unauthorized UX shows an empty shell instead of access denied; server-side permission still protects data.
Some src/server/queries rely on page-level permission checks + RLS; acceptable but note for future hardening.
Next.js middleware file convention deprecation warning should be migrated to proxy in maintenance.
Organization/Branch legacy raw Supabase calls remain for text-column sync.
DMS/Documents tab is placeholder only.
Sales owner picker in Customer is future enhancement.
Customer Documents table exists, but DMS is not implemented.
```

Dev harness routes to remove before production:

```text
/dev/performance-qa
/dev/customer-prefetch-qa
/dev/customer-child-qa
```

---

# 10. Current Completed Report Files to Upload to New Chat

Upload these key files to the new ChatGPT chat if possible:

```text
ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md
ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md
ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_ORGANIZATION_BRANCH_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_FUTURE_READY_MODULES_REPORT.md
ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6G_3B_CUSTOMER_CONTACTS_LOADING_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_AND_PREFETCH_UTILITIES_REPORT.md
ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Also upload the latest code inventory / Cursor-generated full implementation guide once Cursor creates it.

---

# 11. Latest Gate Result

Latest phase:

```text
ERP BASE 002F.3E.4 — Current Modules Global QA Gate
```

Status:

```text
PASS WITH NOTES
```

Key result:

```text
Current base modules are stable enough to proceed to the next business / party-master module, subject to manual click-through review.
```

---

# 12. Recommended Next Phase

The next ChatGPT chat should continue with:

```text
ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness
```

Reason:

```text
Customer Documents tab is placeholder.
Future party-master modules all include documents child tables.
Before building Vendor/Subcontractor/etc., we need a global attachments/documents placeholder/readiness standard.
```

Alternative next phase if Sameer decides to start party modules first:

```text
ERP BASE 002F.3E.5 — Party-Master Module Implementation Preparation
```

But recommended order:

```text
1. Create full project implementation guide from Cursor.
2. Open new ChatGPT chat with this handoff file.
3. Start ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness.
4. Then proceed to the first new party-master module, likely Vendors.
```

---

# 13. First Message for New Chat

Suggested message to paste in the new ChatGPT chat:

```text
We are continuing ALGT ERP project. Please read the uploaded NEXT_CHAT_HANDOFF_ERP_BASE_002F_3E_CURRENT_STATUS_AND_NEXT_PHASES.md and all uploaded reports. Do not jump to a new module yet. First confirm project status, current completed phases, global rules, known notes, and recommend the next phase prompt.
```

---

# 14. Critical Instruction for the New Chat

The new chat must remember:

```text
Do not build new business modules until the next foundation/document readiness phase is approved.
Always produce prompts as downloadable .md files only when requested.
Always review reports before deciding pass/fail.
Use Fable 5 for hard runtime bugs.
Sonnet 4.6 is okay for normal implementation/audit tasks.
```

