# PROMPT_ERP_BASE_002B — Continue Phase 002 Admin Completion After Organizations CRUD

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

You are continuing Phase 002 of an existing Next.js + Supabase ERP foundation.

Phase 002 has already partially completed:

- Dev server conflict fixed and restarted
- Users page PostgREST relationship error fixed
- Audit logging infrastructure added
- Organizations CRUD completed and manually tested
- TypeScript compilation errors resolved

Now continue Phase 002 without restarting from scratch.

---

## 1. Current Confirmed Progress

The following are considered completed unless testing proves otherwise:

1. User Query Fix
   - The PostgREST relationship error on the Users page was resolved.
   - Users page should no longer crash because of ambiguous `user_profiles` and `user_roles` relationships.

2. Audit Logging Infrastructure
   - Audit logging support is in place for admin actions.

3. Organizations CRUD
   - Create organization
   - Edit organization
   - Delete/deactivate organization
   - Status management: activate/deactivate/suspend
   - Full form with required fields
   - Data table with row actions
   - RLS-protected queries
   - Audit logging enabled

4. TypeScript
   - Existing compilation errors resolved.

Do not redo these items unless a validation failure is found.

---

## 2. Main Objective

Complete the remaining Phase 002 admin functions:

1. Branches CRUD
2. Users admin completion
3. User role assignment
4. Roles management
5. Permissions management
6. Role-permission matrix or structured permission assignment UI
7. Audit logs listing
8. Final Phase 002 validation and reports

Do not start HR, Fleet, Workshop, HSE, DMS, Finance, Procurement, Inventory, Diesel, Weighbridge, or any business module.

---

## 3. Strict Safety Rules

Do not weaken or modify existing security foundation.

Do not touch unless absolutely required and approved:

```text
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
supabase/migrations/20260527120000_erp_base_foundation.sql
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
```

Do not expose service-role key to the browser.

Do not print secrets.

Do not use the provided admin password in files, reports, logs, or code.

Do not add fake database records unless explicitly instructed by the user.

Do not add a full external admin template that overwrites the app.

Do not install a full shadcn admin template package over this project.

Use the existing UI system and shadcn components already integrated.

If a new database change is required, create a new Phase 002 migration only:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002_admin_completion.sql
```

Do not edit already-pushed Phase 001 migration.

Do not run `supabase db push` for any new migration without approval.

---

## 4. Continue From Current Branch

Before changes:

1. Check current branch.
2. Check git status.
3. Confirm current Phase 002 files and reports.
4. Confirm Organizations CRUD files exist and compile.
5. Confirm the Users query fix is still working.

If there are uncommitted changes, document them first.

Create or continue a branch such as:

```text
feature/erp-base-002-admin-completion
```

---

## 5. Required Task 1 — Branches CRUD

Complete `/admin/branches`.

Required functions:

- List branches
- Search branches
- Filter by owner company
- Filter by status
- Create branch
- Edit branch
- Activate/deactivate/suspend branch
- Delete only if safe; otherwise deactivate/archive
- Row actions menu
- Toast messages
- Loading state
- Empty state
- Error state
- Audit logging

Required fields:

- owner_company_id
- branch_code
- branch_name_en
- branch_name_ar
- emirate
- area
- address_line_1
- address_line_2
- po_box
- phone
- email
- status

Validation:

- owner_company_id required
- branch_code required
- branch_name_en required
- email valid if provided
- status controlled
- branch_code unique per owner company
- branch must belong to selected owner company

Use Zod validation.

Use RLS-safe server actions.

Use current UI style.

---

## 6. Required Task 2 — Users Admin Completion

Complete `/admin/users`.

Required:

- Users list must load without the previous relationship error.
- Show real `user_profiles` records.
- Show numeric profile ID.
- Show user_code.
- Show full_name.
- Show display_name.
- Show email if safely available.
- Show owner company.
- Show branch.
- Show status.
- Show roles.
- Show created date.
- Actions menu.

If Supabase Auth email requires service-role:

- Use service role only in server-only code.
- Protect access with admin permission checks.
- Never expose service-role key to client.
- Document usage.

Required UI:

- Search
- Filter by role
- Filter by status
- Filter by company
- Filter by branch
- Edit profile dialog
- Activate/deactivate user profile
- Assign role dialog
- Remove role confirmation

Required user profile editable fields for admin:

- full_name
- display_name
- phone
- job_title
- department
- owner_company_id
- branch_id
- status

Do not allow normal self-service update to edit admin fields. Keep self-profile RPC restriction.

---

## 7. Required Task 3 — User Role Assignment

Implement role assignment functionality.

Required:

- Assign role to user.
- Remove role from user.
- Show assigned roles.
- Scope assignment:
  - Global
  - Owner company
  - Branch
- Prevent non-global admins from assigning:
  - system_admin
  - group_admin
  - global-null assignments
- Company admin can assign allowed roles only inside company scope.
- Branch admin can assign allowed roles only inside branch scope.
- Use existing RLS/helper protections.
- Audit every assignment/removal.

Required dialog:

- User display summary
- Role dropdown
- Scope selector
- Company dropdown
- Branch dropdown filtered by selected company
- Active flag
- Save/cancel
- Validation messages

---

## 8. Required Task 4 — Roles Management

Complete `/admin/roles`.

Required:

- List roles.
- Search roles.
- Show role code.
- Show role name.
- Show description.
- Show system role status.
- Show active status.
- Show permissions count.
- Actions menu.
- Create role dialog.
- Edit role dialog.
- Activate/deactivate role.
- Protect system roles from unsafe deletion.

Validation:

- role_code required
- role_code lowercase snake_case
- role_name required
- is_system_role guarded
- is_active controlled

Security:

- Only global admin should manage system roles.
- Non-global admins should have read-only or scoped behavior depending on permission.

Audit role changes.

---

## 9. Required Task 5 — Permissions Management

Complete `/admin/permissions`.

Required:

- List permissions.
- Search permissions.
- Filter by module_code.
- Filter by action_code.
- Show permission_code.
- permission_name.
- module_code.
- action_code.
- description.
- active status.
- Actions if allowed.

System permissions should be protected.

Adding/editing permissions should be global-admin only unless explicitly designed otherwise.

Audit permission changes if implemented.

---

## 10. Required Task 6 — Role-Permission Matrix

Implement one of the following:

### Preferred

Editable permission matrix for global admin:

- Group permissions by module_code.
- Show roles.
- Toggle permission assignment.
- Save changes.
- Audit changes.
- Protect system roles if needed.

### Acceptable if time/complexity is high

Read-only matrix plus role-permission edit dialog:

- Show which roles have which permissions.
- Allow global admin to edit one role’s permissions in a dialog.
- Document remaining matrix enhancement.

The page must be useful and not just a placeholder.

---

## 11. Required Task 7 — Audit Logs Listing

Complete `/admin/audit`.

Required:

- List audit logs visible to current admin scope.
- Filter by module_code.
- Filter by action.
- Filter by date range if practical.
- Search entity_reference.
- Pagination.
- Detail dialog/drawer showing old_values and new_values.
- Empty state.
- Export placeholder if not implemented.

Audit log rows should show:

- created_at
- actor user/profile if available
- module_code
- entity_name
- entity_id
- entity_reference
- action
- scope/company/branch if available

Do not expose sensitive secrets.

---

## 12. UI/UX Rules

Use the current refined UI style.

Do not regress the current design.

All admin pages must use:

- consistent page header
- breadcrumbs
- primary action button
- search toolbar
- filters
- table/card container
- action menu
- status badges
- empty/loading/error states
- confirmation dialogs for destructive actions
- toast notifications

Keep Inter font.

Keep sidebar/header design.

---

## 13. Testing Requirements

Run from clean path:

```text
C:\dev\agt-erp
```

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Manual test:

1. Login using the existing admin user.
2. Verify dashboard loads.
3. Verify `/admin/users` loads without relationship error.
4. Verify `/admin/organizations` still works.
5. Create branch under an owner company.
6. Edit branch.
7. Deactivate/reactivate branch.
8. Edit a user profile.
9. Assign a role to a user.
10. Remove a role assignment.
11. Create a custom role.
12. Edit a custom role.
13. View permissions.
14. Update role-permission assignment if implemented.
15. View audit logs and confirm admin actions are recorded.
16. Confirm no console errors.
17. Confirm no RLS/security errors cause page crash.

---

## 14. Required Screenshots

Create screenshots if possible:

```text
implementation_Review/screenshots/002/
  002_branches_list.png
  002_branch_form.png
  002_users_list.png
  002_user_edit_profile.png
  002_user_assign_role.png
  002_roles_list.png
  002_role_form.png
  002_permissions_list.png
  002_permission_matrix.png
  002_audit_logs.png
```

If screenshots cannot be created, document why.

---

## 15. Required Reports

Update/create:

```text
ERP_BASE_002B_CONTINUATION_REVIEW_REPORT.md
ERP_BASE_002B_IMPLEMENTATION_REPORT.md
ERP_BASE_002B_SECURITY_RLS_REVIEW_REPORT.md
ERP_BASE_002B_VALIDATION_REPORT.md
ERP_BASE_002B_NEXT_STEPS.md
```

Also update the existing Phase 002 reports if they already exist:

```text
ERP_BASE_002_IMPLEMENTATION_REPORT.md
ERP_BASE_002_SECURITY_RLS_REVIEW_REPORT.md
ERP_BASE_002_VALIDATION_REPORT.md
ERP_BASE_002_NEXT_STEPS.md
```

Reports must include:

- what was already completed before 002B
- what was implemented in 002B
- files changed
- server actions created/updated
- UI components created/updated
- any database changes
- service-role usage review
- RLS/security review
- lint/typecheck/build result
- manual testing result
- screenshots path
- known issues
- remaining work

---

## 16. Acceptance Criteria

This continuation is complete only if:

- Branches CRUD works.
- Users page loads real data or safe empty state without relationship error.
- User profile edit works.
- User role assignment works.
- Roles management works.
- Permissions page is useful and not a placeholder.
- Role-permission management or matrix is implemented at least to practical usable level.
- Audit logs list works.
- Audit entries are generated for admin actions.
- No service-role exposure.
- No RLS weakening.
- No UUID primary keys introduced.
- No auth/security regression.
- TypeScript passes.
- ESLint passes.
- Build passes.
- Reports are generated.

---

## 17. Final Instruction

Continue from the current Phase 002 progress.

Do not reinstall a full shadcn admin template.

Do not start business modules.

Do not modify security foundation.

Complete the remaining admin functionality and stop after reports.
