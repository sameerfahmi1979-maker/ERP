# PROMPT_ERP_BASE_002F_3B_TECHNICAL_PLAN_CORRECTION_BEFORE_IMPLEMENTATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3B — Technical Plan Correction Before Implementation

## Purpose

Review and correct the existing technical implementation plan:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN.md`

This is a correction/revision prompt only.

Do not implement code.

Do not create migrations.

Do not modify app source files.

Do not start implementation.

Your task is to revise the technical plan and produce a corrected final plan that is ready for Sameer approval before implementation.

## Required Output File

Create only this revised markdown report:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`

## Context

The uploaded technical plan is generally strong and approved in direction. It correctly plans:

- Master Data Dashboard
- Lookup Categories
- Lookup Values
- Locked System Values
- Reusable LookupSelect component
- Permissions
- RLS
- Audit logging
- Sidebar integration
- Seed lookup categories/values
- Testing strategy

However, before implementation, the following corrections are required.

---

# Required Corrections

## 1. Correct Permission Count Inconsistency

The current plan says 6 new permissions in the executive summary, but the permission section lists 7 permissions.

The plan must be corrected to consistently state **7 permissions**:

```text
master_data.dashboard.view
master_data.lookups.view
master_data.lookups.manage
master_data.lookups.lock
master_data.lookups.import
master_data.lookups.export
master_data.lookups.audit_view
```

Keep `master_data.lookups.lock` because it is needed for locked system values.

Update all sections where the permission count is mentioned.

---

## 2. Correct Lookup Read Access Strategy

The current RLS plan may be too restrictive because it requires `master_data.lookups.view` for SELECT access to lookup values.

This may cause future normal users to see empty dropdowns in HR, CRM, Fleet, Workshop, HSE, Procurement, Inventory, etc.

The corrected plan must separate:

### A. Master Data Management Page Access

Access to Master Data pages should require:

```text
master_data.dashboard.view
master_data.lookups.view
```

### B. Lookup Value Read Access for Forms

Active lookup values used in normal ERP forms must be readable by valid ERP users, even if they do not have Master Data management permissions.

Correct strategy:

```text
Active lookup categories and active lookup values should be readable by authorized ERP users for dropdown usage.
Master Data admin pages still require master_data.lookups.view.
Create/edit/deactivate/lock/manage actions require master_data.lookups.manage or master_data.lookups.lock.
```

The revised plan must clearly explain this distinction.

The revised plan should recommend one of the following safe approaches after inspecting existing project auth/RLS patterns:

### Option 1 — RLS Allows Active Lookup Read for Valid App Users

- Active categories/values can be selected by valid logged-in ERP users.
- Inactive values require management permission.
- Locked/system values can still be visible if active, but cannot be modified.

### Option 2 — Server/Service Layer Provides Dropdown Values

- `LookupSelect` retrieves active values through a controlled server action/API that validates the user is a valid ERP user.
- Master Data admin pages still use permission checks.

Cursor must choose the approach most compatible with the current ERP source.

Do not leave lookup SELECT access so restrictive that normal business forms cannot load dropdowns.

---

## 3. Add Explicit Anon / Custom Authentication RLS Compatibility

The ERP has previously used Supabase frontend anon key with custom authentication patterns.

The corrected plan must not blindly assume only `TO authenticated` policies.

The revised plan must instruct implementation to:

1. Inspect existing RLS policies first.
2. Determine whether the project uses `anon`, `authenticated`, or both.
3. Follow the existing project’s secure RLS pattern.
4. If the app uses anon role with custom auth, create RLS policies compatible with that pattern.
5. Do not create unsafe public write policies.
6. Do not use broad unrestricted `USING (true)` for write access.
7. Ensure active lookup values are readable for valid ERP users without exposing management access.

Add this requirement clearly in the RLS section and implementation guardrails.

---

## 4. Fix Markdown SQL Code Fence Formatting

The current report uses malformed SQL fences such as:

```text
``sql
```

The revised report must use proper Markdown formatting:

````text
```sql
-- SQL here
```
````

All SQL examples in the revised report must be properly fenced.

This is important because implementation prompts may copy SQL snippets later.

---

## 5. Clarify Parent/Child Circular Reference Limitation

The current plan prevents direct self-reference:

```text
parent_value_id = id
```

But it does not prevent deeper circular references:

```text
A parent of B
B parent of C
C parent of A
```

The revised plan must include this as a known limitation for Phase 002F.3B unless Cursor proposes a simple safe recursive validation.

Minimum requirement for 002F.3B:

- Prevent direct self-reference.
- Ensure parent belongs to the same category.
- Document that deep circular hierarchy prevention is future enhancement unless implemented safely.

Do not overcomplicate 002F.3B unless implementation can be done safely.

---

## 6. Review LookupSelect Data Loading Strategy

The current plan proposes loading lookup values through server actions.

This may work, but a reusable dropdown used across many forms must be fast and reliable.

The revised plan must analyze and decide the best data-loading strategy based on existing project patterns:

Possible strategies:

1. Server action.
2. API route.
3. Supabase client query.
4. Server component loader.
5. Cached client hook.
6. Hybrid cached server action + client hook.

The revised plan must include:

- Recommended approach.
- Why it is best for this project.
- Caching strategy.
- Revalidation strategy after lookup changes.
- Loading/error/empty states.
- How to avoid slow dropdowns.
- How to avoid permission problems for normal users.

The plan must not force a slow or awkward pattern if another existing project pattern is better.

---

## 7. Clarify Import Is Future-Only

The current plan includes:

```text
master_data.lookups.import
```

This is fine.

But import must not appear as an active working feature if it is not implemented.

The revised plan must state:

- Import permission can be seeded now for future readiness.
- Import UI must be hidden or disabled.
- If visible, it must show “Future enhancement”.
- No upload/import workflow should be implemented in 002F.3B unless specifically approved later.
- Implementation report must clearly state import is not implemented.

---

## 8. Tighten Scope of 002F.3B

The revised plan must clearly confirm 002F.3B will implement only:

- Master Data Dashboard basic page
- Lookup Categories
- Lookup Values
- Locked System Values
- LookupSelect reusable component
- Lookup categories/values database foundation
- Permissions
- RLS
- Audit
- Sidebar integration
- Initial seed lookup categories/values
- Export if existing export engine is stable
- Import placeholder only if needed

Do not include:

- Countries
- Emirates
- Cities
- Currencies
- Tax Types
- Banks
- UOM
- CRM master data implementation
- HR master data implementation
- Fleet master data implementation
- HSE master data implementation
- Scrap/waste/demolition master data implementation

---

## 9. Add Required Review Status

At the end of the revised plan, include one of:

```text
READY FOR SAMEER REVIEW — Technical plan corrected and ready for implementation prompt.
NEEDS USER DECISION — Specific decision required before implementation.
BLOCKED — Source inspection or design correction failed.
```

If no major design decisions are required, mark:

```text
READY FOR SAMEER REVIEW — Technical plan corrected and ready for implementation prompt.
```

---

# Required Final Structure

The revised plan must keep the original structure but correct and strengthen the following sections:

1. Executive Summary
2. Existing Source Code Inspection Summary
3. Proposed Database Schema Plan
4. Required Seed Lookup Categories and Values
5. Permissions Plan
6. RLS Policy Plan
7. Audit Logging Plan
8. Server Actions / Services Plan
9. Validation Plan
10. UI / Screen Plan
11. Reusable LookupSelect Component Plan
12. Export / Import Plan
13. Sidebar / Menu Modification Plan
14. File Modification Plan
15. Implementation Sequence Plan
16. Testing Plan
17. Risk Analysis
18. Acceptance Criteria
19. Future Integration Notes
20. Final Recommendation

In the revised file, add a short section near the top:

```text
Correction Summary From Sameer Review
```

List all corrections applied.

---

# Final Instruction

Create the corrected technical implementation plan file only:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`

Do not implement.

Do not create migrations.

Do not create UI files.

Do not modify application source code.
