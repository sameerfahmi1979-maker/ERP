# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_LOCK_UNLOCK_FIX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Lock / Unlock Fix

## Purpose

Sameer manually tested ERP BASE 002F.3C.1 Geography & Locations UI pages and confirmed the following actions are working well:

- Add
- Edit
- Delete
- View
- General page navigation

However, the lock/unlock action is missing or not visible/working for:

- Countries
- Emirates
- Cities
- Areas / Zones
- Ports

This prompt is only to fix the missing lock/unlock functionality.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

## Reference Files / Reports

Review:

- `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX_REPORT.md`
- `ERP_BASE_002F_3C_1_GEOGRAPHY_UI_COMPLETION_REPORT.md`

Review existing files:

- `src/features/master-data/geography/actions.ts`
- `src/features/master-data/geography/components/countries-table.tsx`
- `src/features/master-data/geography/components/emirates-table.tsx`
- `src/features/master-data/geography/components/cities-table.tsx`
- `src/features/master-data/geography/components/areas-table.tsx` or `areas-zones-table.tsx`
- `src/features/master-data/geography/components/ports-table.tsx`
- all related form/dialog files if lock state is shown there
- the geography migration/RLS policies if needed

## Critical Business Rule

Global admin / system_admin must be able to:

```text
view, insert, edit, delete, lock, and unlock all geography records all the time.
```

For non-system_admin roles:

- Lock/unlock must not be available unless the user has the required lock permission.
- Existing permission expected from 002F.3B:
  - `master_data.lookups.lock`
- If the system uses a different lock permission, inspect existing permissions and use the actual one.

## Required Scope

Fix lock/unlock for:

1. Countries
2. Emirates
3. Cities
4. Areas / Zones
5. Ports

## Required Behavior

### Lock / Unlock Visibility

The lock/unlock action must be visible only when the user is authorized.

Authorized users:

- system_admin/global admin always
- users with `master_data.lookups.lock`, if the existing permission system supports this

Unauthorized users:

- must not see lock/unlock action
- must not be able to call lock/unlock server action successfully

### Lock / Unlock Functionality

For each entity, lock/unlock must:

- toggle `is_locked`
- preserve all other fields
- audit the change
- revalidate the correct route
- show success toast
- show error toast if failed
- refresh the table after action
- update the locked badge/state immediately after refresh

### Locked Record UI Rules

When a record is locked:

- locked badge should show clearly
- non-system_admin users should not be able to edit locked records
- system_admin/global admin can edit locked records
- delete remains system_admin only as already implemented
- activate/deactivate behavior must follow existing backend rules

## Required Server Actions

Review if these actions already exist. If not, add them to the existing geography actions file without duplicating logic:

```text
toggleCountryLock
toggleEmirateLock
toggleCityLock
toggleAreaZoneLock
togglePortLock
```

Each action must:

1. Check auth context.
2. Allow system_admin/global admin.
3. Otherwise require `master_data.lookups.lock`.
4. Fetch the existing record.
5. Toggle `is_locked`.
6. Log audit before/after values.
7. Revalidate the related page path.
8. Return typed `ActionResult`.
9. Return friendly error on failure.

Routes for revalidation:

```text
/admin/master-data/geography/countries
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

## Required UI Updates

Update each geography table row action menu to include lock/unlock action.

### Countries Table

Add row action:

```text
Lock / Unlock
```

Call:

```text
toggleCountryLock
```

### Emirates Table

Call:

```text
toggleEmirateLock
```

### Cities Table

Call:

```text
toggleCityLock
```

### Areas / Zones Table

Call:

```text
toggleAreaZoneLock
```

### Ports Table

Call:

```text
togglePortLock
```

## Required Confirmation Dialog

Use a confirmation dialog for lock/unlock if existing UX pattern supports it.

Message examples:

### Lock

```text
Are you sure you want to lock this record? Locked records cannot be edited by normal admins.
```

### Unlock

```text
Are you sure you want to unlock this record? This will allow authorized admins to edit it again.
```

If the app pattern does not use confirmation for lock/unlock, a direct action is acceptable only if consistent with existing lookup/numbering modules.

## Required Audit Actions

Audit actions must include:

```text
country.lock
country.unlock
emirate.lock
emirate.unlock
city.lock
city.unlock
area_zone.lock
area_zone.unlock
port.lock
port.unlock
```

Audit must include:

- old_values
- new_values
- entity name
- entity id
- entity reference/code
- actor user
- timestamp

## Required RLS Verification

Confirm RLS allows lock/unlock for:

- system_admin/global admin
- users with lock permission, if approved

Confirm RLS blocks lock/unlock for:

- company_admin without lock permission
- branch_admin without lock permission
- normal users

If the database RLS blocks lock/unlock incorrectly, create a corrective migration.

Do not weaken RLS broadly.

Do not create unsafe update policies.

## Required Testing

Run:

```text
npm run typecheck
npm run lint
npm run build
```

Then browser-test:

1. Countries lock/unlock
2. Emirates lock/unlock
3. Cities lock/unlock
4. Areas/Zones lock/unlock
5. Ports lock/unlock

Test as system_admin:

- Lock works.
- Unlock works.
- Edit still works even when locked.
- Delete still works.

Test as non-system_admin where practical:

- Lock/unlock action hidden or blocked.
- Locked record edit is blocked where applicable.

## Required Final Report

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_LOCK_UNLOCK_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of issue.
4. Files reviewed.
5. Files modified.
6. Server actions added/fixed.
7. UI row actions added/fixed.
8. RLS verification.
9. Audit logging verification.
10. Permission behavior.
11. Browser testing result.
12. Typecheck result.
13. Lint result.
14. Build result.
15. Remaining known limitations.
16. Final status.

At the end write one of:

```text
PASS — Geography lock/unlock is complete and ERP BASE 002F.3C.1 is ready for Sameer final approval.
PASS WITH NOTES — Geography lock/unlock works with minor non-blocking notes.
FAIL — Geography lock/unlock still requires correction.
```

## Final Instruction

Fix only geography lock/unlock.

Do not proceed to ERP BASE 002F.3C.2.

Generate the lock/unlock fix report and stop.
