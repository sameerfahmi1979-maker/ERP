# PROMPT_ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, master-data governance auditor, database migration reviewer, implementation release manager, Cursor development workflow architect, and senior technical documentation planner.

## Prompt Purpose

This is a PLANNING-ONLY prompt.

Create the official global Cursor development and implementation guide for the ERP project.

This guide will become the mandatory reference that Cursor must read and follow before every future ERP planning, database, UI, server-action, security, testing, and implementation prompt.

Do not implement code.

Do not modify database schema.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Do not continue Customer module work.

Create the guide file only.

---

# 1. Mandatory Supabase Connection First

Before creating the guide, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect the live project context enough to confirm:

```text
database exists and is reachable
current ERP tables exist
RLS/permissions architecture exists
global numbering infrastructure exists
Customer module tables exist
global UI/UX guide context is relevant
```

The generated guide must include this standing rule:

```text
Before any future planning or implementation, Cursor must connect to the live Supabase project https://mmiefuieduzdiiwnqpie.supabase.co, inspect the current live schema, and verify that the planned work matches the actual database/application state.
```

If Supabase connection fails, still generate the guide but clearly state:

```text
WARNING — Live Supabase verification could not be completed while generating this guide. The guide still requires every future implementation prompt to connect to Supabase first.
```

---

# 2. Required Source Files To Review

Review these approved / current ERP guide files and planning reports:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md

ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md

ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md

ERP_BASE_002F_3E_2_MIGRATION_VERIFICATION_REPORT_FINAL.md

ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_COMPLETE_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3A_CUSTOMER_CHILD_ADD_EDIT_FORMS_IMPLEMENTATION_REPORT.md
```

If some files are not present, document that as a note but continue based on available files and live database inspection.

---

# 3. Required Output File

Create exactly this file:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

Do not create implementation files.

Do not create migration files.

Do not create extra reports.

---

# 4. Guide Purpose

The guide must explain that it is the **main Cursor working guide** for ALGT ERP.

It must define:

```text
how Cursor should plan
how Cursor should inspect Supabase
how Cursor should use the live database as source of truth
how Cursor should create migrations
how Cursor should implement UI
how Cursor should implement server actions
how Cursor should apply RLS/security
how Cursor should test
how Cursor should generate reports
how Cursor should stop and wait for Sameer review
```

It must also clearly say:

```text
This guide works together with:
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

The UI/UX guide controls design-system behavior.  
This Cursor guide controls development, implementation, database, testing, reporting, and governance behavior.

---

# 5. Required Guide Sections

The generated guide must include at least these sections.

## 5.1 Document Identity

Include:

```text
Document Type: Official Cursor Development and Implementation Standard
Project: ALGT ERP
Version: 1.0
Status: Draft for Sameer Review
Applies To: All ERP phases, modules, prompts, implementations, migrations, reports, and fixes
```

## 5.2 Project Stack and Architecture

Document current stack:

```text
Next.js
TypeScript
Supabase PostgreSQL
Supabase RLS
Custom authentication using anon role
shadcn/ui
ERPDataTable
ERPDrawerForm
server actions
Zod validation
global numbering engine
audit logging
```

Do not assume package versions unless verified.

## 5.3 Mandatory Live Supabase Verification Rule

This must be a major section.

Required rule:

```text
Before every planning or implementation task:
1. connect to https://mmiefuieduzdiiwnqpie.supabase.co
2. inspect actual live schema
3. verify required tables, columns, views, functions, indexes, triggers, RLS policies, permissions, and seed data
4. do not assume from old reports only
5. if live schema does not match plan, stop and generate correction/report before implementation
```

## 5.4 Source of Truth Rule

Define source priority:

```text
1. Live Supabase schema
2. Current source code
3. Latest approved guide files
4. Latest approved implementation reports
5. Older plans/reports only as historical reference
```

Cursor must never treat old plan files as stronger than live database/schema.

## 5.5 Phase-Gated Workflow

Define strict workflow:

```text
Planning prompt
Plan file generated
Sameer/Dina review
Correction prompt if needed
Implementation prompt only after approval
Implementation report generated
Review report
Close phase only after approval
```

No phase is closed without a report.

## 5.6 File and Report Rules

Include:

```text
Every implementation must create a report.
Every database migration must have verification.
Every partial implementation must be marked partial.
No report = phase not closed.
No “I completed it” without file evidence.
Reports must list files created/modified, DB changes, tests, errors, limitations, and final status.
```

## 5.7 Database and Migration Rules

Required rules:

```text
No destructive SQL unless explicitly approved.
No DROP TABLE.
No TRUNCATE.
No DELETE FROM.
No ALTER destructive changes unless approved.
All migrations must be idempotent where practical.
Use IF NOT EXISTS and ON CONFLICT where safe.
Inspect actual live schema before writing SQL.
Do not invent missing columns.
Do not assume helper functions exist.
Do not create duplicate numbering or lookup systems.
```

Also include:

```text
When migration affects existing production-like data, plan rollback or mitigation.
```

## 5.8 RLS and Permission Rules

Must include user’s known requirement:

```text
The ERP uses anon role with custom authentication.
RLS policies must be created/verified for the anon role/custom auth flow where applicable.
Do not create only authenticated-role RLS policies if the app uses anon role.
UI permissions are UX only, not security.
Server actions must check permissions.
Database RLS must enforce access.
```

Permissions must be verified before implementation.

## 5.9 Server Action Rules

Define standard:

```text
Every mutation server action must:
- validate input using Zod
- check auth context
- check permissions
- use RLS-safe Supabase client
- use live schema fields
- generate reference numbers using global numbering engine if needed
- insert/update with audit fields
- log audit
- revalidate path
- return typed ActionResult
- handle errors clearly
```

## 5.10 Numbering Rules

Must include:

```text
Use global numbering engine only.
No hardcoded numbering.
No module-specific numbering unless configured in global numbering system.
Code fields are read-only.
Add mode shows Auto-generated on save.
Edit/View mode keeps code read-only.
Do not include year/month/company/branch in codes unless Sameer explicitly requests.
Standard simple format examples:
CUST-000001
VEND-000001
SUBC-000001
CONS-000001
AUTH-000001
AGCY-000001
```

## 5.11 Lookup / Combobox / Master Data Rules

Reference UI/UX guide:

```text
All selectable fields must use Combobox behavior.
No traditional non-searchable dropdowns.
No hardcoded dropdown values.
Lookup values must come from global lookup tables or master data tables.
Combobox must search code, English name, Arabic name where available.
```

## 5.12 UI/UX Guide Reference Rule

Require every UI implementation to follow:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

List the most important standards:

```text
Combobox everywhere
Required red *
Save / Save & Close / Cancel
Safe close and unsaved changes confirmation
720px child modal standard
No horizontal scroll
One entity = one drawer
Related data = tabs
Child forms = dialogs
Documents placeholder until DMS
Global search action standard
AI-ready foundation
```

## 5.13 DMS Rule

Must include:

```text
Do not implement document upload until centralized DMS phase.
Do not create storage bucket logic prematurely.
Documents tabs must remain placeholder only until DMS is implemented.
Documents later must be centralized and linked to target records.
```

## 5.14 Testing Rules

Required:

```text
Run npm run typecheck
Run npm run lint
Run npm run build
```

If scripts differ, use actual project scripts.

Also:

```text
Perform browser/manual testing where required.
If browser testing cannot be performed, report clearly.
Never mark implementation fully passed if browser/manual testing is deferred and required for the phase.
```

## 5.15 Browser / Playwright / Manual Testing Rule

Define:

```text
For UI phases, Cursor must test:
page loads
drawer opens
add/edit/view modes
save/save-close/cancel
permissions
combobox search
no horizontal scroll
safe close
documents placeholder
basic create/edit/delete
```

If Playwright is available, use it. If not, report manual testing limitation.

## 5.16 Error and Blocker Handling

Rules:

```text
If implementation is partial, say partial.
If blocked, create blocker report.
If schema mismatch, stop and report.
If TypeScript/build fails, do not claim PASS.
If a feature is deferred, document why and where it will be handled.
```

## 5.17 Final Status Rules

Every report must end with one of:

```text
PASS
PASS WITH NOTES
FAIL
BLOCKED
PARTIAL
```

Define what each means.

## 5.18 Prompt Writing Rules for Cursor

Include:

```text
Every prompt must state:
- phase number
- purpose
- scope
- out of scope
- files to review
- files to create/update
- mandatory Supabase connection
- live schema verification
- implementation rules
- testing rules
- required report
- stop condition
```

## 5.19 Implementation Scope Control

Include:

```text
Do not implement extra modules.
Do not start next phase automatically.
Do not expand scope without approval.
Do not “improve” unrelated files unless required.
Do not implement Vendors while working on Customers.
```

## 5.20 Performance Rules

Include:

```text
For drawer/tab modules:
- load related child data in parallel where practical
- cache in parent drawer state
- refresh only affected child list after mutation
- verify DB indexes before adding new indexes
- do not add indexes blindly
```

## 5.21 Global Search Rule

Include final global search behavior:

```text
Search result must open related record.
Parent result opens parent drawer in View mode.
Child result opens parent drawer and activates related tab.
Document result later opens parent drawer and activates Documents tab.
Results must respect RLS and permissions.
```

## 5.22 AI-Ready Rule

Include:

```text
Do not implement AI now unless explicitly requested.
Prepare app for AI through clean data, global search, audit logs, DMS readiness, standard forms, and permissions.
AI form fill/document extraction should come after DMS.
```

## 5.23 Future Module Reuse Rule

Include:

```text
Customers module is the first party-master template.
Future modules must reuse the pattern:
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
```

They must follow:

```text
one list screen
one drawer
tabs
child dialogs
comboboxes
numbering
permissions
audit
reporting
```

## 5.24 Documentation Location Recommendation

Recommend storing guide under:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

## 5.25 Cursor Pre-Flight Checklist

Create a checklist that Cursor must run before every implementation:

```text
[ ] Connected to Supabase
[ ] Live schema inspected
[ ] Source files inspected
[ ] UI/UX guide read
[ ] Cursor development guide read
[ ] Scope confirmed
[ ] Out-of-scope confirmed
[ ] No destructive SQL
[ ] Permissions/RLS verified
[ ] Numbering/lookup rules verified
[ ] Testing commands known
[ ] Report file planned
```

## 5.26 Cursor Completion Checklist

Create a checklist:

```text
[ ] Files created/modified listed
[ ] Database changes listed
[ ] Supabase verification included
[ ] Typecheck run
[ ] Lint run
[ ] Build run
[ ] Browser/manual tests documented
[ ] Known limitations documented
[ ] Final status included
[ ] Stop condition followed
```

---

# 6. Tone and Style

The guide must be:

```text
clear
strict
professional
implementation-oriented
easy for Cursor to follow
not too theoretical
not generic
specific to ALGT ERP
```

Do not write unnecessary filler.

---

# 7. Required Final Status

The file must end with:

```text
READY FOR SAMEER REVIEW — ERP Global Cursor Development and Implementation Guide complete.
```

---

# Final Instruction

Create only:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

Do not implement code.

Do not modify database.

Do not create extra files.

Stop after creating the guide.
