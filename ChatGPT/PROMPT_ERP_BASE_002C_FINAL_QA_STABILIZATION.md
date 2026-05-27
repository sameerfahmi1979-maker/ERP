# PROMPT_ERP_BASE_002C — Final QA, Stabilization, Commit Readiness & Admin Baseline Sign-Off

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, Git release manager, and enterprise ERP stabilization specialist.

You are working on the existing Next.js + Supabase ERP foundation after Phase 002B.

The user manually tested Phase 002B and confirmed that everything is working fine.

This phase is not for adding new business modules.

This phase is for final stabilization, QA verification, screenshot/documentation collection, Git commit readiness, and confirming the admin foundation is ready for future modules.

---

## 1. Current Confirmed Status

The following are completed and manually tested by the user:

- ERP Base 001 foundation deployed to Supabase Cloud
- Supabase Auth working
- RLS/RBAC foundation working
- BIGINT primary key standard preserved
- Environment variables configured
- First admin user working
- UI/UX admin shell integrated
- Organizations CRUD working
- Branches CRUD working
- Users page working
- User profile edit working
- User role assignment working
- Roles CRUD working
- Permissions matrix working
- Audit logs listing working
- Audit entries generated
- Manual testing passed

---

## 2. Purpose of Phase 002C

Perform final admin baseline stabilization.

Required outcomes:

1. Re-run full validation.
2. Confirm no hidden console/runtime errors.
3. Confirm no security files were unintentionally modified.
4. Confirm all admin workflows are functional.
5. Create screenshots.
6. Create final QA reports.
7. Prepare clean Git commit.
8. Recommend the next business module phase.

---

## 3. Strict Safety Rules

Do not start HR, Fleet, Workshop, HSE, DMS, Finance, Procurement, Inventory, Diesel, Weighbridge, or any business module.

Do not modify database schema unless a critical bug requires it and the user approves a new migration.

Do not run `supabase db push`.

Do not touch or weaken:

```text
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
supabase/migrations/20260527120000_erp_base_foundation.sql
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
```

Do not expose service-role key.

Do not print secrets.

Do not install a full shadcn admin template.

Do not introduce a new auth provider or ORM.

---

## 4. Validation Tasks

Run from the clean path:

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

Confirm:

- dev server starts
- no blocking build errors
- no TypeScript errors
- no active source lint errors
- no secrets printed
- no browser console errors on admin routes

---

## 5. Manual Route Verification

Open and verify these routes:

```text
http://localhost:3000/dashboard
http://localhost:3000/admin/organizations
http://localhost:3000/admin/branches
http://localhost:3000/admin/users
http://localhost:3000/admin/roles
http://localhost:3000/admin/permissions
http://localhost:3000/admin/audit
http://localhost:3000/profile
http://localhost:3000/settings
```

Verify:

- page loads
- no crash
- no console error
- table loads
- action buttons open dialogs
- form validation appears
- toasts appear
- user can cancel dialogs
- sidebar navigation works
- header/user menu works
- theme toggle works if present

---

## 6. Admin Workflow Smoke Tests

Perform or verify these smoke tests:

### Organizations

- Create test organization if safe
- Edit organization
- Change status
- Confirm audit log generated

### Branches

- Create branch under organization
- Edit branch
- Change status
- Confirm audit log generated

### Users

- Open users page
- Confirm relationship error is gone
- Edit user profile
- Assign role
- Remove role
- Confirm audit log generated

### Roles

- Create custom role
- Edit custom role
- Change status
- Confirm system roles are protected
- Confirm audit log generated

### Permissions

- Open permissions matrix
- Toggle a permission for a non-critical custom role if safe
- Revert the toggle if needed
- Confirm audit log generated

### Audit Logs

- Confirm recent actions appear
- Confirm actor/module/action/entity details are readable

If any smoke test cannot be performed safely, document why.

---

## 7. Security Review

Confirm:

- No changes to RLS policies
- No changes to middleware
- No changes to Supabase clients
- No service-role key in browser/client files
- No secrets in reports
- No `.env.local` tracked by Git
- No UUID primary keys added
- All admin operations use server actions
- All state-changing operations have permission checks
- All state-changing operations write audit logs

Run safe checks:

```bash
git status --short
git diff --stat
```

Do not print secrets.

---

## 8. Screenshots Required

Create screenshots if possible:

```text
implementation_Review/screenshots/002C/
  002C_dashboard.png
  002C_organizations.png
  002C_organization_form.png
  002C_branches.png
  002C_branch_form.png
  002C_users.png
  002C_user_assign_role.png
  002C_roles.png
  002C_permissions_matrix.png
  002C_audit_logs.png
```

If screenshots cannot be created, document why.

---

## 9. Git Commit Readiness

Prepare a clean commit.

Do not push unless user explicitly asks.

Recommended commit message:

```text
feat(admin): complete ERP base Phase 002 admin foundation

- Complete organizations and branches CRUD
- Complete users admin and role assignment
- Complete roles management
- Add permissions matrix
- Add audit logs listing
- Add audit logging for admin actions
- Fix users relationship query issue
- Preserve Supabase Auth, RLS, RBAC, and BIGINT schema
```

Before committing:

1. Review `git status --short`.
2. Ensure `.env.local` is not tracked.
3. Ensure generated screenshots/reports are placed in the correct review folder.
4. Ensure no unwanted UIUX zip/extracted files are staged unless intentionally excluded.
5. Commit only relevant project files and reports.

If the project is currently on main and user prefers feature branch, create:

```bash
git checkout -b feature/erp-base-002-admin-foundation
```

Then commit.

Do not push unless user approves.

---

## 10. Required Reports

Create:

```text
ERP_BASE_002C_FINAL_QA_REPORT.md
ERP_BASE_002C_SECURITY_SIGNOFF_REPORT.md
ERP_BASE_002C_GIT_COMMIT_READINESS_REPORT.md
ERP_BASE_002C_NEXT_PHASE_RECOMMENDATION.md
```

Reports must include:

### `ERP_BASE_002C_FINAL_QA_REPORT.md`

- validation commands/results
- route verification
- smoke test results
- screenshots path
- known issues
- final QA status

### `ERP_BASE_002C_SECURITY_SIGNOFF_REPORT.md`

- security files unchanged confirmation
- RLS/RBAC unchanged confirmation
- service-role exposure check
- `.env.local` gitignore check
- BIGINT/no UUID check
- audit logging check
- final security status

### `ERP_BASE_002C_GIT_COMMIT_READINESS_REPORT.md`

- branch name
- git status summary
- files staged/recommended for commit
- files excluded
- recommended commit message
- push status

### `ERP_BASE_002C_NEXT_PHASE_RECOMMENDATION.md`

Recommend the next phase.

Include these options:

1. Phase 003A — HR Foundation
2. Phase 003B — Fleet Foundation
3. Phase 003C — DMS Foundation
4. Phase 003D — Notifications & Expiry Engine
5. Phase 003E — UI Polish & Test Automation

Give a practical recommendation based on current ERP readiness.

---

## 11. Acceptance Criteria

Phase 002C is complete only if:

- lint passes or only documented non-blocking warnings remain
- typecheck passes
- build passes
- key admin routes load
- manual smoke tests are documented
- screenshots are created or documented as unavailable
- security foundation remains unchanged
- `.env.local` is not tracked
- Git commit readiness report is created
- next phase recommendation is created
- no business module is started

---

## 12. Final Instruction

Perform final QA and stabilization only.

Do not implement business modules.

Do not change database schema.

Do not push to GitHub unless the user explicitly approves.

Stop after reports and commit readiness.
