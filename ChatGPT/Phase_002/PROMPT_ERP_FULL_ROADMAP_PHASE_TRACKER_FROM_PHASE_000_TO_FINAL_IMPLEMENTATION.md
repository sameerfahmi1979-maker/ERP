# PROMPT_ERP_FULL_ROADMAP_PHASE_TRACKER_FROM_PHASE_000_TO_FINAL_IMPLEMENTATION

Act as a senior ERP program manager, ERP solution architect, Supabase/PostgreSQL RLS auditor, Next.js implementation reviewer, SaaS security reviewer, master-data governance lead, implementation documentation controller, and project delivery roadmap manager.

## Objective

Create a complete ERP roadmap markdown file from Phase 000 until the final expected implementation of the ERP system.

This roadmap must be used as the main project follow-up file.

It must include:

- phase number
- phase title / description
- status
- evidence files found in the project folder
- notes / next action
- ability to add modifications or inserted phases later without breaking the roadmap

## Required Output File

Create only this file:

```text
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
```

## Important Instructions

Do not implement code.

Do not create migrations.

Do not modify the application.

Do not modify database schema.

Do not change any existing phase report.

Only inspect the project folder and produce the roadmap markdown file.

## Source Inspection Requirement

Inspect the full project folder before writing the roadmap.

Search for:

```text
PROMPT_
ERP_BASE_
IMPLEMENTATION_REPORT
REVIEW_REPORT
QA_REPORT
SECURITY_REPORT
COMPLETION_REPORT
FINAL_VERIFICATION
NEXT_STEPS
migration
supabase/migrations
src/features
src/app
src/components
implementation_Review
planning
review
phase
```

Inspect all available evidence:

```text
prompt files
technical plans
implementation reports
review reports
correction prompts
completion reports
QA reports
security reports
migration files
feature folders
page routes
database migration files
```

## Required Roadmap Coverage

The roadmap must start from Phase 000 and continue until final ERP implementation.

At minimum, include these major sections:

```text
000 — Project Vision, Scope, Architecture, and Governance
001 — ERP Base Foundation
002 — Admin, Security, RBAC, Audit, and Core System Foundation
002D — Admin Master Data Hardening
002E — Global UI/UX Foundation, Drawer Forms, Export, Email, Drafts
002F — Shared ERP Foundation and Master Data
002F.2 — Global Numbering Engine
002F.3B — Global Lookup / Dropdown Engine
002F.3C — Core UAE Shared Master Data
002F.3D — Settings Foundation
002F.3E — People / Contacts / CRM Foundation
002F.3F — HR Master Data
002F.3G — Fleet / Equipment Master Data
002F.3H — Workshop / Inventory / Procurement Master Data
002F.3I — Basic HSE / DMS / Compliance Master Data
002F.3J — Scrap / Waste / Demolition Master Data
002F.3K — Master Data QA / Permissions / Readiness Gate
003 — CRM Module
004 — HR Module
005 — Fleet / Equipment Module
006 — Workshop Module
007 — Inventory / Store Module
008 — Procurement Module
009 — DMS / Document Control Module
010 — Task Management / Workflow Module
011 — HSE Basic Module
012 — Scrap Trading Module
013 — Waste Management Module
014 — Demolition Project Module
015 — Transport / Trips Module
016 — Rental / Equipment Utilization Module
017 — Fuel / Diesel Management Module
018 — Weighbridge Integration Module
019 — Reporting / KPI / Dashboard Module
020 — Notification Engine / Reminder Engine
021 — Approval Workflow Engine
022 — Global Print / PDF / Email Output Engine
023 — External Integrations
024 — Security, RLS, Audit, Penetration Testing
025 — Final QA, UAT, Production Readiness, Deployment
```

You may add or adjust phases if project evidence clearly shows a different structure.

## Required Detail for Current Foundation Phases

For 002F.3C, include all completed and pending sub-phases:

```text
002F.3C — Core UAE Shared Master Data
002F.3C.1 — Geography & Locations
002F.3C.1A — Geography Integration Impact Plan
002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
002F.3C.1B.2 — Branches Geography Integration
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review
002F.3C.4A — Sidebar Collapse and Scroll Fix
002F.3C.4B — Master Data Selects QA Fix
002F.3C.4C — Final Readiness Review / Master Data Gate
```

Known current status from Sameer/Dina:

```text
002F.3B — CLOSED
002F.3C.1 — CLOSED
002F.3C.1A — CLOSED
002F.3C.1B.1 — CLOSED
002F.3C.1B.2 — CLOSED
002F.3C.2 — CLOSED
002F.3C.3 — CLOSED
002F.3C.4A — CLOSED after Sameer browser check passed
002F.3C.4B — NEXT / PLANNED
002F.3C.4C — PLANNED
```

Verify from files where possible, but use Sameer confirmation for 002F.3C.4A closure.

## Required Detail for Settings Foundation

For 002F.3D, include at least:

```text
002F.3D — Settings Foundation
002F.3D.1 — Dynamic Sidebar / Menu Builder
002F.3D.1A — Technical Plan & Architecture
002F.3D.1B — Database Foundation + Static Menu Migration
002F.3D.1C — Runtime Dynamic Sidebar Renderer
002F.3D.1D — Menu Builder Admin UI + Role/User Preferences
002F.3D.1E — QA, Security, Audit, Cache, Recovery, and Sign-Off
002F.3D.2 — App Branding, Identity, Favicon, Logos
002F.3D.3 — Letterheads, Print/PDF, and Email Templates
```

## Status Values

Use only:

```text
CLOSED
DONE
IN PROGRESS
PLANNED
SUGGESTED
BLOCKED
NEEDS REVIEW
UNKNOWN
```

## Status Decision Rules

### CLOSED

Use when:

```text
Phase has implementation/report evidence and Sameer/Dina approved or closed it.
```

### DONE

Use when:

```text
Implementation appears complete but explicit closure is not found.
```

### IN PROGRESS

Use when:

```text
Implementation has started but no final report/closure exists.
```

### PLANNED

Use when:

```text
Prompt or technical plan exists but implementation has not started.
```

### SUGGESTED

Use when:

```text
Phase is required/suggested but no formal prompt/report exists yet.
```

### BLOCKED

Use when:

```text
A report explicitly says blocked or a prerequisite is missing.
```

### NEEDS REVIEW

Use when:

```text
A report exists but unresolved QA/manual testing/fix is pending.
```

### UNKNOWN

Use when:

```text
No clear evidence exists.
```

## Required Markdown Structure

Use this exact structure:

```markdown
# ERP Full Implementation Roadmap Phase Tracker

## Roadmap Table

| Phase Number | Phase Title / Description | Status | Evidence / Files Found | Notes / Next Action |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Immediate Next Recommended Phases

| Order | Phase | Action |
|---|---|---|
| 1 | ... | ... |

## Roadmap Maintenance Rules

| Rule | Description |
|---|---|
| ... | ... |
```

## Evidence Column Rules

List only short evidence file/folder names.

Examples:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
20260606140000_erp_base_002f3c2_finance_basics.sql
src/features/master-data/finance-basics/
```

Do not write long explanations inside the evidence column.

## Notes / Next Action Rules

Write short notes only.

Examples:

```text
Closed after browser QA.
Implementation pending.
Needs technical plan.
Next phase after 002F.3C.4C.
```

## Required Roadmap Maintenance Rules

At the end, add:

```text
1. New phases may be inserted between existing phases using suffixes A, B, C.
2. Any phase requiring database/RLS/UI work must first have a planning prompt.
3. Every implementation phase must generate a report.
4. A phase is not CLOSED until Sameer/Dina review is complete.
5. All future modules must reuse master data and global lookups.
6. No hardcoded dropdowns where master data exists.
7. All phases must preserve BIGINT PK/FK, user_profiles audit fields, RLS, permissions, and audit logging.
8. Any branding, menu, print, PDF, email, or template logic belongs under Settings Foundation unless directly tied to a business module.
```

## Important Accuracy Requirement

If evidence is missing, do not guess.

Use:

```text
UNKNOWN
```

or:

```text
SUGGESTED
```

and mention:

```text
No evidence file found.
```

## Final Instruction

Create only:

```text
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
```

Do not implement anything else.
