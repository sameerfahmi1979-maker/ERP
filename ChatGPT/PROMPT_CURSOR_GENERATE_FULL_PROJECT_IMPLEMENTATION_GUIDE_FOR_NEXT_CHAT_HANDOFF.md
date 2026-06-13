# PROMPT_CURSOR_GENERATE_FULL_PROJECT_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT_HANDOFF

Act as Fable 5 inside Cursor.

Use deep source-code reasoning as a senior ERP technical documentation engineer, Next.js/Supabase architect, implementation historian, phase tracker, QA reviewer, and handoff-document generator.

## Purpose

Generate a complete technical implementation guide for the current ALGT ERP project so a new ChatGPT chat and future Cursor sessions can continue the work without losing context.

This is a documentation-only task.

Do not modify application code.

Do not create migrations.

Do not change database schema.

Do not start a new implementation phase.

---

# 1. Mandatory Live Project Verification

Connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Confirm the project URL is correct.

Previous reports found that one Supabase plugin can point to a different weighing/industrial project. Use the correct ERP connection.

Document any connection/tool mismatch.

No database changes are allowed.

---

# 2. Mandatory Files and Reports to Read

Read the latest standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Read the latest reports:

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
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

If some reports are missing from the repo, search by filename and document missing files.

---

# 3. Source Areas to Inspect

Inspect and summarize:

```text
src/app/(protected)/**
src/components/erp/**
src/components/layout/**
src/features/**
src/server/actions/**
src/server/queries/**
src/hooks/**
src/lib/query/**
src/lib/lookups/**
docs/standards/**
package.json
middleware/proxy files
Supabase-related files
```

Run source searches:

```bash
grep -R "ERPDrawerForm" -n src
grep -R "ERPFormFooter" -n src
grep -R "RequiredLabel" -n src
grep -R "ERPCombobox" -n src
grep -R "LookupSelect" -n src
grep -R "useFormDirty" -n src
grep -R "UnsavedChangesDialog" -n src
grep -R "useQuery" -n src/hooks src/features src/components
grep -R "queryKeys" -n src
grep -R "generateNextReference" -n src
grep -R "getAuthContext" -n src
grep -R "hasPermission" -n src
grep -R "revalidatePath" -n src/server/actions
grep -R "/dev/" -n src/app
```

---

# 4. Output File Required

Create:

```text
ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md
```

This file must be complete and ready to upload to a new ChatGPT chat.

---

# 5. Required Guide Contents

The guide must include:

## 5.1 Project Overview

```text
project name
stack
purpose
company context
Supabase project URL
main architecture
```

## 5.2 Current Phase Status

List every completed or relevant phase with status:

```text
002F.3E.3B.2
002F.3E.3B.3
002F.3E.3B.4
002F.3E.3B.5
002F.3E.3B.6A–6G
002F.3E.3B.7
002F.3E.4
```

Include:

```text
CLOSED
CLOSED WITH NOTES
PASS WITH NOTES
known notes
```

## 5.3 Implemented Modules

For each module, include:

```text
route
main components
server actions
tables
permissions
status
known notes
```

Modules:

```text
Users
Roles
Permissions
Organizations
Branches
Numbering Rules
Lookup Categories
Lookup Values
Locked System Values
Geography
Finance Basics
UOM
Customers
Audit Logs
Profile
Settings
Dashboard
```

## 5.4 Global Components

Document:

```text
ERPDrawerForm
ERPDrawerSection
ERPFormFooter
RequiredLabel
ERPCombobox
LookupSelect
UnsavedChangesDialog
useFormDirty
TanStack Query provider
query keys
invalidation helpers
prefetch utilities
child table query hook
```

## 5.5 Customer Module Reference Implementation

Explain:

```text
Customer list
Add/Edit/View drawer
lookup prefetch
child tables
child query hooks
Safe Close
numbering
FormData safety
known notes
```

## 5.6 Global Runtime Rules

Summarize:

```text
Safe Close rule
Footer rule
Required field rule
Combobox rule
Parent form runtime rule
Child table query rule
FormData lazy mount safety
Prefetch rule
Numbering rule
Permissions/RLS rule
Runtime QA rule
```

## 5.7 Current Known Technical Debt

Include at least:

```text
dev harnesses to delete before production
pre-existing lint debt
middleware/proxy deprecation warning
numbering page unauthorized empty shell UX
Organization/Branch legacy text-column Supabase sync calls
DMS/Documents placeholder
Customer sales owner picker future
browser QA manual acceptance pending
```

## 5.8 Important Files List

List all important files, grouped by category.

Include standards, reports, global components, hooks, actions, module components.

## 5.9 Next Recommended Phases

Recommend next sequence.

Primary recommendation:

```text
ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness
```

Then:

```text
ERP BASE 002F.5 — Party-Master Module Preparation
First Party-Master Module: Vendors
Then Subcontractors
Then Consultants
Then Government Authorities
Then Recruitment Agencies
```

Also mention:

```text
Production cleanup phase before deployment:
delete dev harness routes
lint cleanup
middleware/proxy migration
manual browser QA
```

## 5.10 Instructions for New ChatGPT Chat

Include a ready-to-paste opening message for the new chat.

---

# 6. Important Requirements

Be honest and precise.

Do not claim browser QA was completed if reports say authenticated browser QA was unavailable.

Distinguish:

```text
source-verified
harness-verified
manual user-confirmed
browser-authenticated pending
```

Do not invent modules that are not implemented.

Do not delete or modify application files.

Do not start any new phase.

---

# 7. Final Output

After generating the guide, create a short report:

```text
ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT_REPORT.md
```

It should list:

```text
files read
guide file created
known missing reports if any
Supabase verification status
recommendation for next phase
```

Stop after creating both files.
