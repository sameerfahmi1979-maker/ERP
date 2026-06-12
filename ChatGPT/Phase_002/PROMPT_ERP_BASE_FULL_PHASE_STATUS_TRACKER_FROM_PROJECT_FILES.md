# PROMPT_ERP_BASE_FULL_PHASE_STATUS_TRACKER_FROM_PROJECT_FILES

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Next.js runtime tester, SaaS security tester, implementation documentation auditor, project phase controller, and ERP delivery governance manager.

## Objective

Create one clean markdown file that lists the full ERP BASE phase history and suggested future phase plan from the beginning until the current point.

You must inspect the project folder, prompts, reports, migrations, implementation reports, QA reports, review files, and any phase-related markdown files available in the repository.

## Required Output File

Create only this file:

```text
ERP_BASE_FULL_PHASE_STATUS_TRACKER.md
```

## Important Instructions

Do not implement code.

Do not create migrations.

Do not modify the application.

Do not modify database schema.

Do not change any existing phase report.

Only read, analyze, and produce the phase tracker markdown file.

## What the Markdown File Must Include

The markdown file must include a clear table with these columns:

```text
Phase Number
Phase Title / Description
Status
Evidence / Files Found
Notes / Next Action
```

## Status Values

Use only these status values:

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

## Required Scope

You must list phases from the beginning of the ERP BASE work up to the current point, including closed phases, in-progress phases, planned phases, and suggested future phases.

At minimum, include and verify the following phase groups if evidence exists:

```text
002F.3B — Global Lookup / Dropdown Engine
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
002F.3D — Settings Foundation
002F.3D.1 — Dynamic Sidebar / Menu Builder
002F.3D.1A — Technical Plan & Architecture
002F.3D.1B — Database Foundation + Static Menu Migration
002F.3D.1C — Runtime Dynamic Sidebar Renderer
002F.3D.1D — Menu Builder Admin UI + Role/User Preferences
002F.3D.1E — QA, Security, Audit, Cache, Recovery, and Sign-Off
002F.3D.2 — App Branding, Identity, Favicon, Logos
002F.3D.3 — Letterheads, Print/PDF, and Email Templates
002F.3E — People / Contacts / CRM Foundation
002F.3F — HR Master Data
002F.3G — Fleet / Equipment Master Data
002F.3H — Workshop / Inventory / Procurement Master Data
002F.3I — Basic HSE / DMS / Compliance Master Data
002F.3J — Scrap / Waste / Demolition Master Data
002F.3K — Master Data QA / Permissions / Readiness Gate
```

## Evidence Rules

For each phase, inspect the project files and identify evidence.

Evidence may include:

```text
Prompt files
Planning files
Implementation reports
Review reports
Correction prompts
Completion reports
QA reports
Security reports
Migration files
Sidebar/menu files
Feature folder files
Page files
Database migration files
```

In the `Evidence / Files Found` column, list only the most relevant file names, not long explanations.

Example:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
20260606140000_erp_base_002f3c2_finance_basics.sql
src/features/master-data/finance-basics/
```

## Status Decision Rules

Use these rules:

### CLOSED

Use `CLOSED` when:

```text
There is a final implementation report or final review report.
The phase was manually tested or approved.
The report states PASS / PASS WITH NOTES and no blocking issue remains.
```

### DONE

Use `DONE` when:

```text
The implementation appears complete and reports pass, but final manual closure is not clearly documented.
```

### IN PROGRESS

Use `IN PROGRESS` when:

```text
There is an implementation prompt/report but no final approval or closure yet.
```

### PLANNED

Use `PLANNED` when:

```text
A phase is planned with a prompt or technical plan but implementation has not started.
```

### SUGGESTED

Use `SUGGESTED` when:

```text
The phase is proposed by Sameer/Dina but no formal prompt/report exists yet.
```

### BLOCKED

Use `BLOCKED` when:

```text
A report says blocked or prerequisite missing.
```

### NEEDS REVIEW

Use `NEEDS REVIEW` when:

```text
A report exists but has unresolved notes, pending browser QA, pending typecheck/build, or unclear result.
```

### UNKNOWN

Use `UNKNOWN` when:

```text
No clear evidence is found.
```

## Current Known Context To Consider

Current known working direction from Sameer/Dina:

```text
002F.3B is done.
002F.3C is nearly complete.
002F.3C.1, 002F.3C.1A, 002F.3C.1B.1, 002F.3C.1B.2, 002F.3C.2, 002F.3C.3, and 002F.3C.4A are treated as closed based on user/manual confirmation.
002F.3C.4B and 002F.3C.4C are next/pending unless files show otherwise.
002F.3D should include Settings Foundation.
002F.3D.1 should include Dynamic Sidebar / Menu Builder.
002F.3D.2 should include App Branding, Identity, Favicon, Logos.
002F.3D.3 should include Letterheads, Print/PDF, and Email Templates.
```

Still verify all of this from project files where possible.

## Required Markdown Format

The file must be concise and easy to follow.

Use this structure:

```markdown
# ERP BASE Full Phase Status Tracker

| Phase Number | Phase Title / Description | Status | Evidence / Files Found | Notes / Next Action |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |
```

Do not add long paragraphs.

Do not add unnecessary explanation.

Do not include full prompt contents.

Do not include code blocks unless needed.

## Required Extra Section

At the end, add a short section:

```markdown
## Immediate Next Recommended Phases

| Order | Phase | Action |
|---|---|---|
| 1 | ... | ... |
| 2 | ... | ... |
```

This should list the next 3 to 5 actions only.

## Important Accuracy Requirement

If you are not sure about a phase status, do not guess.

Use:

```text
NEEDS REVIEW
```

or:

```text
UNKNOWN
```

and mention the missing evidence.

## Final Instruction

Create only:

```text
ERP_BASE_FULL_PHASE_STATUS_TRACKER.md
```

Do not implement anything else.
