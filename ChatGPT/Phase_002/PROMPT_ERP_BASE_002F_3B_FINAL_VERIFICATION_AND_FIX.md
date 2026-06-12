# PROMPT_ERP_BASE_002F_3B_FINAL_VERIFICATION_AND_FIX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, and senior Next.js/Supabase code reviewer.

## Phase

ERP BASE 002F.3B — Final Verification and Fix

## Purpose

This is a final verification and correction prompt for the already implemented:

**ERP BASE 002F.3B — Global Lookup / Dropdown Engine**

The implementation report says 002F.3B is implemented and marked PASS, but before Sameer approves it and before moving to 002F.3C, you must perform a focused verification and fix round.

This is not a new feature implementation prompt.

Do not start 002F.3C.

Do not add Countries, Emirates, UOM, Finance Basics, CRM, HR, Fleet, HSE, DMS, Inventory, Procurement, or Scrap/Waste/Demolition master data in this step.

Only review and fix the 002F.3B implementation.

## Reference Files

Review the implementation report:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md`

Review all files created/modified for 002F.3B, especially:

## Database

- `supabase/migrations/20260605113000_erp_base_002f3b_global_lookup_engine.sql`

## Server Actions

- `src/server/actions/master-data/lookups.ts`

## Types / Validation

- `src/features/master-data/lookups/types.ts`
- `src/features/master-data/lookups/validation.ts`

## Hooks / Components

- `src/features/master-data/lookups/hooks/use-lookup-values.ts`
- `src/components/erp/lookup-select.tsx`
- `src/features/master-data/lookups/components/categories-table.tsx`
- `src/features/master-data/lookups/components/values-table.tsx`
- `src/features/master-data/lookups/components/category-form-dialog.tsx`
- `src/features/master-data/lookups/components/value-form-dialog.tsx`

## Pages

- `src/app/(protected)/admin/master-data/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/categories/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/values/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/system/page.tsx`

## Sidebar

- `src/components/layout/app-sidebar.tsx`

## Important Review Context

The implementation report states:

- Migration applied successfully.
- TypeScript typecheck passed.
- Build passed.
- ESLint showed 130 warnings/errors, mostly pre-existing.
- 13 lookup categories were seeded.
- 62+ lookup values were seeded.
- 7 permissions were created.
- RLS policies were created.
- `LookupSelect` was created.
- Dashboard and lookup admin pages were created.
- Sidebar was integrated.
- Import is placeholder/future only.
- Export was deferred.

Your task is to verify this carefully and fix only 002F.3B-related issues.

---

# 1. Scope Rules

## Must Do

You must:

1. Review only the files created/modified for 002F.3B unless a dependency file must be inspected.
2. Identify any lint/type/build/runtime issues caused by 002F.3B.
3. Fix issues caused by 002F.3B.
4. Confirm no service role key is exposed to the frontend.
5. Confirm active lookup values can load for normal valid ERP users.
6. Confirm admin management pages require correct permissions.
7. Confirm RLS blocks unauthorized writes.
8. Confirm locked system values cannot be modified without lock permission.
9. Confirm import is not active and is clearly future-only.
10. Confirm export is either working or clearly deferred.
11. Confirm browser UI works.
12. Generate final verification/fix report.

## Must Not Do

Do not:

1. Start 002F.3C.
2. Add countries, emirates, currencies, UOM, tax types, banks, HR, CRM, fleet, HSE, DMS, procurement, inventory, or scrap master data.
3. Redesign the lookup engine.
4. Rewrite the whole module if small fixes are enough.
5. Remove RLS.
6. Create unsafe policies.
7. Expose service role key to frontend.
8. Make import active.
9. Create broad unrelated changes.
10. Modify unrelated older lint issues unless they directly block build or 002F.3B.

---

# 2. Lint / Type / Build Review

Run:

```bash
npm run typecheck
npm run build
npm run lint
```

If commands differ in the project, use the actual available commands.

## Required Output

Document:

- Typecheck result.
- Build result.
- Lint result.
- Which lint warnings/errors are pre-existing.
- Which lint warnings/errors are caused by 002F.3B.
- Which 002F.3B lint issues were fixed.
- Which issues remain and why.

## Required Fix

Fix all lint/type/build issues caused by 002F.3B where practical.

Examples of issues to fix:

- unused imports
- unused variables
- wrong `any` types if easy to replace
- invalid component props
- missing dependencies in hooks
- unsafe server/client imports
- incorrect badge variants
- incorrect React keys
- incorrect form props
- incorrect export/import paths

Do not spend time fixing unrelated old warnings unless they block build.

---

# 3. Database Verification

Verify migration:

`20260605113000_erp_base_002f3b_global_lookup_engine.sql`

Check:

1. Migration applies successfully.
2. `global_lookup_categories` exists.
3. `global_lookup_values` exists.
4. All required constraints exist.
5. All required indexes exist.
6. updated_at triggers exist.
7. parent/category validation trigger exists.
8. 13 seed categories exist.
9. 62+ seed values exist.
10. Seed categories and values are:
    - `is_system = true`
    - `is_locked = true`
    - `is_active = true`
11. 7 permissions exist.
12. Role assignments exist as planned.
13. RLS is enabled.
14. RLS policies exist.
15. DELETE is blocked.
16. Deep circular hierarchy detection is documented as deferred if not implemented.

Do not modify the schema unless a defect is found.

If a migration correction is needed, create a new corrective migration. Do not edit an already-applied migration unless the project convention allows it and it has not been applied anywhere.

---

# 4. Permissions Verification

Verify these 7 permissions exist:

```text
master_data.dashboard.view
master_data.lookups.view
master_data.lookups.manage
master_data.lookups.lock
master_data.lookups.import
master_data.lookups.export
master_data.lookups.audit_view
```

Verify role assignment:

## system_admin

Should have all 7.

## group_admin

Should have:

```text
master_data.dashboard.view
master_data.lookups.view
master_data.lookups.manage
master_data.lookups.export
master_data.lookups.audit_view
```

## company_admin

Should have:

```text
master_data.dashboard.view
master_data.lookups.view
master_data.lookups.export
```

## branch_admin

Should have:

```text
master_data.lookups.view
```

If the actual project role codes differ, document the actual role codes and mappings.

Confirm sidebar and page access follow permissions.

---

# 5. RLS and Security Verification

Verify RLS on:

- `global_lookup_categories`
- `global_lookup_values`

Verify:

1. Users with `master_data.lookups.view` can read admin lookup pages.
2. Users without `master_data.lookups.view` cannot open admin lookup pages.
3. Users without `master_data.lookups.manage` cannot insert/update categories/values.
4. Users without `master_data.lookups.lock` cannot modify locked records.
5. DELETE is blocked.
6. Normal valid ERP users can load active lookup values for forms without admin management permissions.
7. Normal valid ERP users cannot load inactive values unless permission allows.
8. Service role key is never imported or exposed in client components.
9. Any service role usage is server-side only.
10. No public unsafe write policy exists.
11. No broad unrestricted `USING (true)` write policy exists.
12. No client component imports server-only service role utilities.

If any security issue is found, fix it immediately.

---

# 6. Service Role / LookupSelect Safety Review

Review:

- `getActiveLookupValuesByCategoryCode`
- `listLookupValues`
- `useLookupValues`
- `LookupSelect`

Confirm:

1. `LookupSelect` is a client component but does not receive or access service role secrets.
2. Hook calls are safe.
3. Normal dropdown loading returns only:
   - active values
   - correct category
   - correct parent if parent filter used
   - sorted values
4. Inactive values require admin permission.
5. Locked/system metadata is not unnecessarily exposed in normal form dropdown mode.
6. Server action validates the user/session/profile before returning values.
7. Loading/error/empty states work.

Fix any issue found.

---

# 7. UI Browser Verification

Manually run the app and test browser UI.

Verify pages:

```text
/admin/master-data
/admin/master-data/lookups/categories
/admin/master-data/lookups/values
/admin/master-data/lookups/system
```

Check:

## Master Data Dashboard

- page loads
- cards show counts
- links work
- no console errors
- permission gate works

## Lookup Categories

- page loads
- table loads
- search works
- filters work
- add drawer opens
- edit drawer opens
- view drawer opens
- fields are visible
- drawer uses correct right-side layout
- create category works
- update category works
- deactivate/reactivate works
- lock/unlock works for authorized user
- unauthorized actions hidden or blocked

## Lookup Values

- page loads
- table loads
- category filter works
- search works
- filters work
- add drawer opens
- edit drawer opens
- view drawer opens
- fields are visible
- color preview works
- parent value works where applicable
- set default works
- deactivate/reactivate works
- lock/unlock works for authorized user
- unauthorized actions hidden or blocked

## Locked System Values

- page loads
- warning banner visible
- locked categories/values listed
- normal admin cannot edit without lock permission
- lock user can edit only where allowed

## Sidebar

- Master Data group appears for users with permissions
- Global Lookups links work
- active route highlighting works
- no future master data groups are shown yet

---

# 8. Import / Export Verification

## Import

Confirm import is not active.

Acceptable options:

- no import button shown
- disabled import button with tooltip/future enhancement message
- placeholder action returns clear future enhancement message

Import must not allow file upload yet.

## Export

Confirm one of:

- export works properly, or
- export is clearly deferred and not shown as active.

If export button appears but does not work, either fix it or hide/disable it and document as deferred.

---

# 9. Audit Logging Verification

Verify audit logging for:

- create category
- update category
- activate/deactivate category
- lock/unlock category
- create value
- update value
- activate/deactivate value
- lock/unlock value
- set default value

Confirm audit rows include:

- module_code = `master_data`
- entity_name
- entity_id
- entity_reference
- action
- old_values where applicable
- new_values where applicable
- actor user

If audit helper is unavailable or has limitations, document clearly and apply compatible fix if needed.

---

# 10. Test Data and Cleanup

If you create test lookup categories/values during manual testing:

- mark them clearly as test
- remove them if safe
- or deactivate them
- do not leave confusing production-looking test data

Do not delete system seed values.

---

# 11. Required Final Verification Report

Create this file:

`ERP_BASE_002F_3B_FINAL_VERIFICATION_AND_FIX_REPORT.md`

The report must include:

1. Phase name.
2. Date.
3. Summary.
4. Files reviewed.
5. Files modified.
6. Issues found.
7. Fixes applied.
8. Typecheck result.
9. Build result.
10. Lint result.
11. Database verification.
12. Permission verification.
13. RLS/security verification.
14. Service role safety confirmation.
15. UI browser verification.
16. Import/export verification.
17. Audit verification.
18. Remaining known limitations.
19. Final status.

Use accurate status labels:

- ✅ completed and verified
- ⚠️ completed with notes
- ❌ failed / requires correction
- ⏳ deferred / future enhancement

Do not mark anything complete unless verified.

At the end, write one of:

```text
PASS — ERP BASE 002F.3B is approved for Sameer final review.
PASS WITH NOTES — ERP BASE 002F.3B can be reviewed with minor notes.
FAIL — ERP BASE 002F.3B requires correction before Sameer review.
```

Do not proceed to 002F.3C.

---

# 12. Final Instruction

Perform final verification and fixes now for ERP BASE 002F.3B only.

Generate:

`ERP_BASE_002F_3B_FINAL_VERIFICATION_AND_FIX_REPORT.md`

Do not start the next phase.
