# PROMPT_ERP_BASE_002D — Admin Master Data Hardening, User Creation, Roles & UAE Company/Branch Upgrade

## 0. Required Cursor Persona

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, UAE ERP master-data architect, HR/fleet-ready master-data designer, and enterprise admin-module implementation specialist.

You are working on the existing Next.js + Supabase ERP foundation after Phase 002C.

The system already has:

- ERP Base 001 deployed to Supabase Cloud
- Supabase Auth
- RLS/RBAC
- BIGINT ERP table primary keys
- Admin foundation
- Organizations CRUD
- Branches CRUD
- Users page
- User profile edit
- User role assignment
- Roles CRUD
- Permissions matrix
- Audit logs
- Inter font
- Enterprise UI shell

The user confirmed that Phase 002B/002C is working, but the master data is still too weak to move to Phase 003 business modules.

This Phase 002D must strengthen the admin master data before HR/Fleet/DMS development.

---

## 1. Phase 002D Purpose

Implement and harden the following four areas before Phase 003:

1. User Management Completion
   - Add/invite user
   - Edit/deactivate/delete users safely
   - Role assignment and permission visibility
   - Audit all actions

2. Roles & Permissions Completion
   - Improve roles CRUD
   - Protect system roles
   - Improve permission matrix
   - Role detail view must show assigned users
   - Allow safe permission display-name/description edits where appropriate

3. UAE-Ready Owner Company Master Data
   - Upgrade database and forms for UAE legal, tax, registration, licensing, address, and compliance fields

4. UAE-Ready Branch Master Data
   - Upgrade database and forms for UAE branch/site/yard/workshop/warehouse/weighbridge operational fields

Do not start Phase 003.

Do not create HR, Fleet, Workshop, HSE, DMS, Finance, Procurement, Inventory, Diesel, Weighbridge, or any business module yet.

---

## 2. Current Problems to Solve

### 2.1 User management is incomplete

Currently:

- Users can be listed.
- User profile edit exists.
- Role assignment exists.
- But adding/inviting a new user is not complete enough.
- Delete/deactivate workflow must be clarified and safe.
- Permission visibility by user should be improved.

### 2.2 Roles management is incomplete

Currently:

- Roles page exists.
- Roles CRUD exists.
- Permission matrix exists.
- But viewing a role must show the users assigned to that role.
- Role deletion rules need to be safer.
- Permission display names/descriptions may need controlled editing.

### 2.3 Organization form is too weak

Current Add Organization form has only limited fields.

It must support UAE company/legal/tax/master-data needs.

### 2.4 Branch form is too weak

Current Add Branch form has limited fields.

It must support branch/site/yard/workshop/warehouse/weighbridge and UAE address needs.

---

## 3. Strict Safety Rules

Do not weaken security.

Do not expose secrets.

Do not print `.env.local`.

Do not expose service-role key to the browser.

Do not use service-role key in client components.

Do not use UUID primary keys for ERP tables.

Do not modify already-applied Phase 001 migration:

```text
supabase/migrations/20260527120000_erp_base_foundation.sql
```

If database schema changes are required, create exactly one new migration for this phase:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002d_admin_master_data_hardening.sql
```

Do not run `supabase db push` until migration SQL and reports are generated and approved by the user.

Do not add:

- Clerk
- Firebase
- Prisma
- MongoDB
- React Router
- Vite
- New auth provider
- New backend framework
- Full external shadcn admin template

Do not touch unless absolutely necessary and documented:

```text
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
```

---

## 4. Required Initial Review

Before implementation, inspect:

- current database types
- current `owner_companies` schema and UI
- current `branches` schema and UI
- current user management actions/forms
- current roles actions/forms
- current permissions matrix
- current audit logging helper
- current RLS behavior
- current service-role usage, if any
- current build/lint status

Create:

```text
ERP_BASE_002D_INITIAL_REVIEW_REPORT.md
```

Include:

- current master data gaps
- fields missing in owner_companies
- fields missing in branches
- Add User current status
- Role detail current status
- whether migration is required
- files expected to change
- security risks
- implementation plan

---

## 5. Required Database Migration

Create a new Phase 002D migration if fields do not exist.

Migration name:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002d_admin_master_data_hardening.sql
```

### 5.1 owner_companies new/expanded fields

Add fields if missing:

```sql
legal_name_ar text
short_name text
company_code text
legal_form text
country text default 'United Arab Emirates'
emirate text
city text
area text
address_line_1 text
address_line_2 text
po_box text
makani_number text
trade_license_no text
trade_license_issue_date date
trade_license_expiry_date date
licensing_authority text
chamber_membership_no text
chamber_membership_expiry_date date
trn text
vat_registered boolean default true
corporate_tax_no text
corporate_tax_registered boolean default false
icv_certificate_no text
icv_score numeric(5,2)
icv_issue_date date
icv_expiry_date date
adnoc_supplier_no text
default_currency text default 'AED'
primary_email text
primary_phone text
website text
logo_url text
status text default 'active'
notes text
```

If some fields already exist, do not duplicate them.

Add useful indexes:

- `company_code`
- `trade_license_no`
- `trn`
- `status`
- `emirate`

Add constraints where safe:

- company_code unique if already expected
- status controlled through check constraint if current design allows it
- default_currency default AED

Do not overrestrict legal forms/emirates if it risks blocking future GCC companies. Prefer controlled UI options, flexible DB text.

### 5.2 branches new/expanded fields

Add fields if missing:

```sql
owner_company_id bigint
branch_code text
branch_name_en text
branch_name_ar text
branch_type text
emirate text
city text
area text
address_line_1 text
address_line_2 text
po_box text
makani_number text
latitude numeric(10,7)
longitude numeric(10,7)
contact_person_name text
contact_phone text
contact_email text
phone text
email text
is_main_branch boolean default false
has_workshop boolean default false
has_warehouse boolean default false
has_yard boolean default false
has_weighbridge boolean default false
operating_status text default 'active'
status text default 'active'
notes text
```

If some fields already exist, do not duplicate.

Add indexes:

- `owner_company_id`
- `branch_code`
- `branch_type`
- `emirate`
- `status`
- `operating_status`

Ensure branch/company consistency remains enforced by existing or new trigger if required.

### 5.3 roles/permissions fields

If needed, add safe display fields only:

For `roles`, if missing:

```sql
display_name text
role_category text
role_level text
is_assignable boolean default true
notes text
```

For `permissions`, if missing:

```sql
display_name text
description text
is_system_permission boolean default true
is_visible boolean default true
sort_order integer default 0
```

Important:

- Do not break existing `role_code` or `permission_code`.
- Do not rename permission_code automatically.
- Permission codes are system keys and must remain stable.

### 5.4 user_profiles additions

If missing and useful for admin user management:

```sql
employee_reference text
manager_user_profile_id bigint references public.user_profiles(id)
preferred_language text default 'en'
timezone text default 'Asia/Dubai'
last_admin_updated_at timestamptz
notes text
```

Do not add HR business fields here if they belong to future HR module. Keep it admin/user profile only.

---

## 6. User Management Completion

### 6.1 Add / Invite User

Implement secure Add User from `/admin/users`.

Required UI:

```text
src/features/users/add-user-dialog.tsx
```

Add User button must open a real dialog.

Required fields:

- email
- temporary_password OR send_invite_email option
- full_name
- display_name
- phone
- job_title
- department
- owner_company_id
- branch_id
- status
- initial_role_id
- role_scope_type:
  - global
  - company
  - branch

Use Zod validation.

### 6.2 Supabase Auth admin creation

Use server-only Supabase Admin API.

Preferred:

- Use `supabase.auth.admin.createUser()` with temporary password if invite email is not configured.
- Or use `supabase.auth.admin.inviteUserByEmail()` if SMTP/invite is configured and tested.

Implement the method that works reliably in this project.

Service role key rules:

- server-only
- never imported into client component
- never printed
- never logged
- never returned to browser
- permission check before admin API call

Required permission:

```text
users.manage
```

### 6.3 Profile creation/update

After Auth user creation:

- find or create `user_profiles`
- update full profile fields
- ensure `user_profiles.id` is BIGINT
- use `auth_user_id` only as UUID auth link
- avoid duplicate profiles

### 6.4 Initial role assignment

If an initial role is selected:

- create user_roles record
- enforce existing scope rules
- global role assignment only by true global admin
- prevent non-global admins from assigning `system_admin` or `group_admin`
- audit role assignment

### 6.5 User edit/deactivate/delete

Implement or refine:

- Edit user profile
- Deactivate user profile
- Suspend user profile
- Reactivate user profile
- Delete only if safe

Important:

Preferred default is deactivate/suspend, not hard delete.

If deleting Auth user is implemented:

- only global admin
- only if no critical references
- use server-only Supabase Admin API
- strongly confirm in UI
- audit the action
- document risks

If hard delete is risky, disable it and show “Deactivate” as main action.

### 6.6 User permission visibility

Add user detail or dialog showing:

- assigned roles
- role scopes
- effective permissions if practical
- company/branch assignment
- status

This can be read-only for Phase 002D if editable role assignment already exists.

---

## 7. Roles & Permissions Completion

### 7.1 Role detail view must show assigned users

Implement role view/details drawer/dialog.

When user clicks View on a role:

Show:

- role_code
- role_name / display_name
- description
- is_system_role
- is_active
- permissions assigned
- assigned users list

Assigned users list must show:

- profile ID
- full name
- email if safely available
- status
- owner company
- branch
- assignment scope:
  - global
  - company
  - branch
- assigned_at
- assigned_by if available

If Auth email requires service-role, use server-only safe query or show profile fields only and document limitation.

### 7.2 Role delete rules

Implement:

- System roles cannot be deleted.
- Roles assigned to users cannot be deleted.
- Roles with permissions may require confirmation or permission removal first.
- Prefer deactivate over delete.
- Custom roles can be deleted only if safe.
- Audit all delete/deactivate/reactivate operations.

### 7.3 Role editing

Improve role edit form:

- role_code
- role_name
- display_name
- description
- role_category
- role_level
- is_assignable
- is_system_role guarded
- is_active
- notes

Do not allow non-global admins to edit system roles.

### 7.4 Permissions display name/description

Allow global admin to edit:

- permission_name or display_name
- description
- is_visible
- sort_order

Do not allow changing `permission_code` unless explicitly in developer-only advanced mode.

Do not allow deleting seeded/system permissions.

### 7.5 Permission matrix improvement

Improve matrix:

- group by module_code
- show readable permission display names
- show assigned roles clearly
- show assigned user count per role if practical
- protect system permissions
- audit every change

---

## 8. UAE-Ready Owner Company Form

Upgrade organization UI and validation.

Required layout:

Use tabs or sections:

1. Basic Information
2. Legal & Licensing
3. Tax & Compliance
4. Address & Contact
5. Vendor/Client Registration References
6. Notes

### 8.1 Basic Information

Fields:

- legal_name_en required
- legal_name_ar
- short_name
- company_code required
- legal_form
- country default United Arab Emirates
- status

### 8.2 Legal & Licensing

Fields:

- trade_license_no
- trade_license_issue_date
- trade_license_expiry_date
- licensing_authority
- chamber_membership_no
- chamber_membership_expiry_date

### 8.3 Tax & Compliance

Fields:

- trn
- vat_registered
- corporate_tax_no
- corporate_tax_registered
- icv_certificate_no
- icv_score
- icv_issue_date
- icv_expiry_date
- adnoc_supplier_no

### 8.4 Address & Contact

Fields:

- emirate
- city
- area
- address_line_1
- address_line_2
- po_box
- makani_number
- primary_email
- primary_phone
- website
- default_currency

### 8.5 Notes

Fields:

- notes
- logo_url if already supported

Validation:

- legal_name_en required
- company_code required
- valid email if provided
- valid website if provided
- ICV score between 0 and 100 if provided
- issue date before expiry date where both exist
- default currency defaults to AED

---

## 9. UAE-Ready Branch Form

Upgrade branch UI and validation.

Required layout:

Use tabs or sections:

1. Basic Branch Details
2. Location
3. Contact
4. Operational Flags
5. Notes

### 9.1 Basic Branch Details

Fields:

- owner_company_id required
- branch_code required
- branch_name_en required
- branch_name_ar
- branch_type
- status
- operating_status
- is_main_branch

Branch type options:

- Head Office
- Branch Office
- Yard
- Workshop
- Warehouse
- Camp
- Project Site
- Weighbridge
- Other

### 9.2 Location

Fields:

- emirate
- city
- area
- address_line_1
- address_line_2
- po_box
- makani_number
- latitude
- longitude

### 9.3 Contact

Fields:

- contact_person_name
- contact_phone
- contact_email
- phone
- email

### 9.4 Operational Flags

Fields:

- has_workshop
- has_warehouse
- has_yard
- has_weighbridge

### 9.5 Notes

Fields:

- notes

Validation:

- owner_company_id required
- branch_code required
- branch_name_en required
- email/contact_email valid if provided
- latitude valid range
- longitude valid range
- branch_type controlled in UI
- status controlled
- operating_status controlled

---

## 10. UI/UX Requirements

Forms must be professional and not weak/simple.

Use:

- Tabs or section cards
- Clear labels
- Descriptions/help text where needed
- Required field indicators
- Error messages
- Good spacing
- Save/Cancel buttons
- Loading states
- Toast messages
- Confirmation dialogs for destructive/status actions

Do not make long forms as one cramped screen.

Use existing Inter/shadcn/enterprise style.

---

## 11. Audit Logging Requirements

Log all new actions:

- user create/invite
- user profile edit
- user deactivate/reactivate/suspend/delete
- user role assign/remove
- role view not required
- role create/edit/deactivate/delete
- permission display update
- role-permission assign/remove
- organization create/edit/status/delete
- branch create/edit/status/delete

Do not log:

- temporary passwords
- service role keys
- secrets

---

## 12. Testing Requirements

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Manual test:

### User Management

1. Login as `sameer@algt.net`.
2. Open `/admin/users`.
3. Add a test user.
4. Confirm Auth user created.
5. Confirm user profile created.
6. Confirm initial role assigned if selected.
7. Edit user.
8. Deactivate/reactivate user.
9. View assigned roles/effective permissions.
10. Check audit logs.

### Roles

1. Open `/admin/roles`.
2. View a role.
3. Confirm assigned users appear.
4. Create custom role.
5. Edit custom role.
6. Deactivate/delete custom role if safe.
7. Confirm system role delete is blocked.
8. Check audit logs.

### Permissions

1. Open `/admin/permissions`.
2. Edit display name/description if implemented.
3. Toggle role permission.
4. Confirm audit logs.

### Organizations

1. Open `/admin/organizations`.
2. Create organization using expanded UAE form.
3. Edit legal/tax/address fields.
4. Confirm validation works.
5. Confirm audit logs.

### Branches

1. Open `/admin/branches`.
2. Create branch using expanded UAE form.
3. Set branch type and operational flags.
4. Edit location/contact details.
5. Confirm audit logs.

---

## 13. Required Screenshots

Create screenshots if possible:

```text
implementation_Review/screenshots/002D/
  002D_add_user_dialog.png
  002D_user_detail_permissions.png
  002D_role_detail_assigned_users.png
  002D_role_form.png
  002D_permission_matrix_improved.png
  002D_organization_form_basic.png
  002D_organization_form_legal_tax.png
  002D_branch_form_basic.png
  002D_branch_form_location_flags.png
  002D_audit_logs_after_002d.png
```

If screenshots cannot be created, document why.

---

## 14. Required Reports

Create:

```text
ERP_BASE_002D_INITIAL_REVIEW_REPORT.md
ERP_BASE_002D_DATABASE_MIGRATION_REPORT.md
ERP_BASE_002D_IMPLEMENTATION_REPORT.md
ERP_BASE_002D_SECURITY_RLS_REVIEW_REPORT.md
ERP_BASE_002D_VALIDATION_REPORT.md
ERP_BASE_002D_NEXT_STEPS.md
```

Reports must include:

### Initial Review

- current gaps
- schema gaps
- UI gaps
- risk plan

### Database Migration Report

- migration file name
- columns added
- indexes added
- constraints added
- RLS impact
- whether migration pushed
- BIGINT/no UUID confirmation

### Implementation Report

- files changed
- forms upgraded
- user create workflow
- role assigned users view
- permission improvements
- organization/branch enhancements
- audit logging coverage

### Security/RLS Review

- service-role usage
- no browser exposure
- RLS preserved
- role assignment protection
- delete/deactivate rules
- system role protections
- no secrets

### Validation Report

- lint/typecheck/build
- manual testing
- screenshots path
- known issues

### Next Steps

- remaining master data enhancements
- suggested Phase 002E
- readiness for Phase 003

---

## 15. Acceptance Criteria

Phase 002D is complete only if:

- Add User/Invite User works.
- User profile creation/update works.
- Initial role assignment works.
- User deactivate/reactivate works.
- Role detail view shows assigned users.
- Roles delete/deactivate rules are safe.
- Permission display/matrix is improved.
- Owner company form is UAE-ready with expanded fields.
- Branch form is UAE-ready with expanded fields.
- Required database migration is generated and approved before push.
- No service-role exposure.
- No RLS weakening.
- No UUID primary keys added.
- Audit logging works.
- Lint passes.
- Typecheck passes.
- Build passes.
- Reports generated.

---

## 16. Final Instruction

Implement Phase 002D only.

Do not start Phase 003.

If migration is required, generate it and stop for approval before pushing.

After migration approval, continue implementation and validation.

Stop after reports.
