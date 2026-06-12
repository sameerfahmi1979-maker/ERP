# PROMPT_ERP_BASE_002F_3E_3B_1_STORE_BOTH_GLOBAL_GUIDES_IN_DOCS_STANDARDS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, enterprise ERP documentation governance lead, Cursor development workflow architect, implementation release manager, and senior technical documentation maintainer.

## Phase

ERP BASE 002F.3E.3B.1 — Store Both Global Guides in docs/standards

## Prompt Purpose

This is a controlled DOCUMENTATION IMPLEMENTATION prompt.

Your task is to store the two approved global ERP development guides inside the project documentation structure so they become the official mandatory standards for all future Cursor work.

Do not implement application code.

Do not modify database schema.

Do not create migrations.

Do not modify UI components.

Do not continue Customer UX implementation.

Do not start Combobox implementation.

Do not start Required Fields implementation.

Do not start Safe Close implementation.

Do not start Customer Performance Optimization.

This phase is only for storing and indexing approved guide documents.

---

# 1. Mandatory Supabase Connection First

Before doing the documentation update, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

This is required to keep the standard workflow consistent.

You only need to verify that the project is reachable. No schema changes are required.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live Supabase connection was confirmed before storing the global guides.
```

If Supabase connection fails, continue the documentation storage if the source files are available, but clearly state:

```text
WARNING — Live Supabase verification could not be completed during this documentation phase.
```

Do not block the documentation update only because Supabase is temporarily unreachable.

---

# 2. Required Source Files

Review and use these approved guide files:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Important:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md must be the REV1 version with Sameer/Dina minor corrections applied.
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md must be the REV1 version with final global search action standard included.
```

Before copying, verify both files exist in the project workspace.

If either file is missing, stop and generate a BLOCKED report listing the missing file.

---

# 3. Required Output / Files To Create or Update

Create this folder if it does not already exist:

```text
docs/standards/
```

Copy or move the two approved guide files into:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Create or update:

```text
docs/standards/README.md
```

Update root project README if it exists:

```text
README.md
```

Create implementation report:

```text
ERP_BASE_002F_3E_3B_1_STORE_GLOBAL_GUIDES_IMPLEMENTATION_REPORT.md
```

Do not create any other files unless the existing project documentation structure requires an index file and you document why.

---

# 4. docs/standards/README.md Requirements

Create or update the README with this purpose:

```text
This folder contains official mandatory development standards for ALGT ERP.
All future Cursor planning, implementation, database, UI, server-action, testing, reporting, and QA work must reference these standards.
```

The README must include links or relative references to:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

The README must explain the difference between the two files:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
Controls Cursor workflow, phase-gating, Supabase verification, database/migration safety, RLS/permissions, server actions, testing, reports, scope control, and implementation governance.

ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
Controls UI/UX standards, drawers, forms, tables, tabs, comboboxes, required fields, modal sizing, no-horizontal-scroll, safe close, Save/Save & Close/Cancel, documents placeholder, global search behavior, accessibility, localization, and AI-ready design direction.
```

The README must include a mandatory usage rule:

```text
Before every future ERP prompt or implementation, Cursor must read:
1. docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
2. docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also add a short pre-flight checklist:

```text
[ ] Read Cursor Development Guide
[ ] Read UI/UX Development Guide
[ ] Connect to live Supabase
[ ] Verify live schema
[ ] Confirm scope and out-of-scope
[ ] Generate report after implementation
```

---

# 5. Root README.md Update Requirements

If root `README.md` exists, add a section titled:

```text
ERP Development Standards
```

Include:

```text
All ERP development work must follow the official standards stored in docs/standards/.
```

Add references to:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Keep the root README update concise.

Do not overwrite existing README content.

Append the section if no clear place exists.

If root `README.md` does not exist, create a simple one only if the project has no existing root documentation. Document this in the report.

---

# 6. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_1_STORE_GLOBAL_GUIDES_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Source files verified.
5. Files created.
6. Files updated.
7. Final location of both guide files.
8. Confirmation that `docs/standards/README.md` references both guides.
9. Confirmation that root README references the standards folder if root README exists.
10. Confirmation that no database changes were made.
11. Confirmation that no application source code was modified.
12. Typecheck/lint/build result.

For this documentation-only phase:

```text
typecheck/lint/build are optional unless the project requires documentation changes to pass CI.
```

If you do not run them, state:

```text
Typecheck/lint/build not run because this phase only stores Markdown documentation and does not modify application code.
```

13. Known notes/limitations.
14. Final status.

Final status must be exactly one of:

```text
PASS — Global guides stored in docs/standards successfully.
PASS WITH NOTES — Global guides stored with non-blocking notes.
FAIL — Global guide storage requires correction.
BLOCKED — Could not store global guides due to missing source files or blocking issue.
```

---

# 7. Scope Control

In scope:

```text
docs/standards/ folder
docs/standards/README.md
copy/store both approved global guide files
root README.md reference update
implementation report
```

Out of scope:

```text
UI implementation
Combobox implementation
Customer UX fixes
Customer performance optimization
database migrations
RLS changes
server actions
global search implementation
AI implementation
DMS implementation
Vendors module
any other module
```

---

# 8. Stop Condition

After storing the two guides, updating README references, and creating the implementation report, stop.

Do not continue to:

```text
002F.3E.3B.2 — Global Combobox Foundation
```

The next phase will start only after Sameer/Dina reviews the implementation report and approves closure of 002F.3E.3B.1.

---

# Final Instruction

Connect to Supabase first.

Verify the two approved guide files exist.

Store both guides under:

```text
docs/standards/
```

Create/update standards README.

Update root README reference if available.

Create implementation report.

Stop.
