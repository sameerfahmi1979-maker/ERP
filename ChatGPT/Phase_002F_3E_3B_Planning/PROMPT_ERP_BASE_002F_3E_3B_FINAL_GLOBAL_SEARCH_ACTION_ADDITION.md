# PROMPT_ERP_BASE_002F_3E_3B_FINAL_GLOBAL_SEARCH_ACTION_ADDITION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, enterprise ERP UI/UX architect, global search architect, command-palette UX designer, permission/RLS reviewer, and master-data navigation specialist.

## Phase

ERP BASE 002F.3E.3B — Final Global Search Action Addition

## Prompt Purpose

This is a small final correction prompt.

The REV1 UX planning files were reviewed and approved, but one final clarification must be added to the Global Search / Command Palette standard:

```text
Every global search result must open the related record directly.
Search results must never be display-only.
```

Do not implement code.

Do not modify database schema.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Only update the approved planning/guide files listed below.

---

# 1. Files To Update

Update only these files:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md

ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Do not update:

```text
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md
```

unless you find it necessary only to keep references consistent.

Do not create new files.

---

# 2. Required Addition to Global Guide

In:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Find the section:

```text
Global Search / Command Palette Standard
```

Add a subsection titled:

```text
Global Search Result Action Standard
```

Add the following rules:

```text
Every global search result must be actionable.
Search results must never be display-only.

When the user clicks a result:
- Parent record result opens the related module/page and opens the parent drawer in View mode.
- Child record result opens the parent record drawer in View mode and activates the related child tab.
- Future document result opens the parent record drawer in View mode and activates the Documents tab.
- Edit mode must not open directly from global search. User must click Edit after opening the record, if permitted.
- Results must respect RLS and permissions. If the user cannot view the record, it must not appear.
```

Add examples:

```text
CUST-000001 → open Customers page and Customer drawer in View mode.

Customer contact email → open related Customer drawer and activate Contacts tab.

Customer address / Makani / PO Box result → open related Customer drawer and activate Address / Location tab.

Customer bank IBAN result → open related Customer drawer and activate Commercial / Finance tab.

Trade license document result later → open related parent record drawer and activate Documents tab.

Vendor result later → open Vendors page and Vendor drawer in View mode.

Employee result later → open Employees page and Employee drawer in View mode.
```

Also add technical design notes:

```text
Global search results should include enough metadata to open the target:
- entity_type
- entity_id
- parent_entity_type if result is a child record
- parent_entity_id if result is a child record
- module_route
- target_drawer_mode = view
- target_tab_id when applicable
- display_title
- display_subtitle
- matched_field
- permission_required
```

And:

```text
The global search opening mechanism must support deep-linking or route-state so that the correct module page can open the correct drawer and tab.
```

---

# 3. Required Addition to Next Implementation Steps

In:

```text
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Find the future phase:

```text
ERP BASE 002F.3E.3C — Global Search / Command Palette Foundation
```

Update the description to include:

```text
Global search must open results directly:
- parent results open parent drawer in View mode
- child results open parent drawer and activate related tab
- document results later open parent drawer and activate Documents tab
- all results respect RLS and permissions
```

Add a note:

```text
The Global Search / Command Palette phase must include deep-linking or route-state support for opening module drawers from search results.
```

---

# 4. Status Updates

Update the revision history or notes in both files to mention:

```text
Final global search action behavior added.
```

The files should end with:

For the global guide:

```text
READY FOR SAMEER REVIEW — Global ERP UI/UX development guide REV1 complete with final global search action standard.
```

For next implementation steps:

```text
READY FOR SAMEER REVIEW — Next implementation steps REV1 prepared with final global search action standard.
```

---

# 5. Final Instruction

Update only:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

Do not implement code.

Do not create new files.

Do not modify database.

Stop after updating the files.
