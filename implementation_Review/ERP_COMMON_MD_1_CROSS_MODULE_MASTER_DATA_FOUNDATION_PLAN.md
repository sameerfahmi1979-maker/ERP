# ERP COMMON MD.1 — Cross-Module Master Data Foundation Plan

**Phase:** ERP COMMON MD.1  
**Title:** Cross-Module Master Data Foundation  
**Status:** PLAN ONLY — Awaiting Sameer/ChatGPT review and approval before implementation  
**Date:** 2026-06-16  
**Prepared by:** Cursor AI based on live codebase audit  

---

## 0. Executive Summary

This plan defines the **common master data layer** required before building HR, Fleet, Workshop, Projects, Finance, and other operational ERP modules. It covers 8 master areas that are genuinely cross-module — shared infrastructure, not module-specific data.

The plan was written after auditing:
- Live `owner_companies` and `branches` table schemas (via Supabase MCP)
- Existing organization/branch feature code and schemas
- DMS entity type registry (`src/lib/dms/dms-entity-types.ts`)
- DMS integration readiness (ERP DMS.15)
- ALGT ERP Source of Truth

**Key finding:** `owner_companies` and `branches` are already quite comprehensive. The 8 new/extended areas are:
1. Organization Extended Profile — **minor additions only** to existing `owner_companies`
2. Branch Extended Profile — **minor additions only** to existing `branches`
3. Departments — **new table** `departments`
4. Designations / Job Titles — **new table** `designations`
5. Work Sites / Operational Locations — **new table** `work_sites`
6. Work Calendars / Shifts — **new tables** `work_calendars` + `work_shifts`
7. Approval Roles / Authority Levels — **new table** `approval_roles`
8. DMS Required Document Rules — **new table** `dms_required_document_rules`

---

## 1. What Already Exists (Must Preserve)

### 1.1 `owner_companies` — Current Fields (Live DB)
| Field | Type | Status |
|---|---|---|
| id | BIGINT | PK |
| legal_name_en | TEXT | ✅ Required |
| legal_name_ar | TEXT | Optional |
| short_name | TEXT | Optional |
| company_code | TEXT UNIQUE | ✅ Required |
| legal_form | TEXT | Optional |
| country / country_id | TEXT / BIGINT FK | ✅ Both |
| emirate / emirate_id | TEXT / BIGINT FK | ✅ Both |
| city / city_id | TEXT / BIGINT FK | ✅ Both |
| area / area_zone_id | TEXT / BIGINT FK | ✅ Both |
| address_line_1/2, po_box, makani_number | TEXT | Optional |
| primary_email, primary_phone, website | TEXT | Optional |
| trade_license_no, issue_date, expiry_date | TEXT / DATE | Optional |
| licensing_authority, chamber_membership_no/expiry | TEXT / DATE | Optional |
| trn, vat_registered, corporate_tax_no/registered | TEXT / BOOL | Optional |
| icv_certificate_no, icv_score, icv_issue/expiry_date | TEXT / NUM / DATE | Optional |
| adnoc_supplier_no | TEXT | Optional |
| logo_url | TEXT | Optional |
| default_currency | TEXT | AED default |
| status | TEXT | active/inactive/suspended |
| notes, internal_reference_number | TEXT | Optional |
| created_at, updated_at, created_by, updated_by | TIMESTAMPTZ / BIGINT | Audit |

**Gap Analysis:** Missing fields that are meaningful and cross-module:
- `trade_name` — commercial/trading name (different from legal_name_en)
- `main_activity` — principal business activity
- `established_date` — company incorporation/establishment date
- `default_tax_type_id` — FK to `tax_types` table
- `default_bank_id` — FK to `banks` table for default bank
- `compliance_status` — overall compliance flag
- `authorized_signatories` — separate child table needed (see 2.2)
- **DMS Documents tab** — `entityType="company"` is already in registry

### 1.2 `branches` — Current Fields (Live DB)
| Field | Type | Status |
|---|---|---|
| id | BIGINT | PK |
| owner_company_id | BIGINT FK | ✅ Required |
| branch_code | TEXT | ✅ Required |
| branch_name_en / branch_name_ar | TEXT | ✅ / Optional |
| branch_type | TEXT | Optional |
| is_main_branch | BOOLEAN | Optional |
| operating_status | TEXT | Optional |
| emirate, area, city | TEXT | Optional |
| address_line_1/2, po_box, makani_number | TEXT | Optional |
| latitude, longitude | NUMERIC | Optional |
| phone, email | TEXT | Optional |
| contact_person_name, contact_phone, contact_email | TEXT | Optional |
| has_workshop, has_warehouse, has_yard, has_weighbridge | BOOLEAN | Optional |
| status | TEXT | active/inactive |
| notes, internal_reference_number | TEXT | Optional |
| created_at, updated_at, created_by, updated_by | TIMESTAMPTZ / BIGINT | Audit |

**Gap Analysis:** Missing fields for operational readiness:
- `opening_date` — DATE when branch opened
- `closing_date` — DATE when branch closed/will close
- `cost_center_id` — FK to `cost_centers`
- `profit_center_id` — FK to `profit_centers`
- `default_work_calendar_id` — FK to `work_calendars` (new table)
- `branch_manager_user_id` — FK to `user_profiles` (nullable, for future HR)
- `legal_branch_name` — if branch has a distinct legal name
- `trade_license_branch_ref` — if branch has its own trade license reference
- **DMS Documents tab** — `entityType="branch"` is already in registry

---

## 2. Master Area 1: Organization Extended Profile

### 2.1 Purpose
Provide the legal, compliance, and operational foundation for all ERP modules. The organization is the top-level entity.

### 2.2 Why Cross-Module
- HR assigns employees to organizations
- Finance uses organization bank accounts, tax codes, cost centers
- DMS documents are linked to organizations (trade license, VAT certificate, etc.)
- Approval authority is scoped to organization
- Fleet/Workshop/Projects reference organization for ownership

### 2.3 Database Change: Extend `owner_companies`
**Approach: ALTER TABLE — add missing columns only. Do not recreate.**

Columns to add:
```sql
ALTER TABLE owner_companies
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS main_activity TEXT,
  ADD COLUMN IF NOT EXISTS established_date DATE,
  ADD COLUMN IF NOT EXISTS default_tax_type_id BIGINT REFERENCES tax_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_bank_id BIGINT REFERENCES banks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'compliant'
    CHECK (compliance_status IN ('compliant','non_compliant','under_review','suspended')),
  ADD COLUMN IF NOT EXISTS office_address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS office_address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS office_emirate_id BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS office_city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL;
```

> **Note:** `logo_url`, `letterhead_url`, `stamp_url` for document generation should be considered as DMS-linked files rather than DB columns, or stored as signed URLs. Plan to add `letterhead_url` and `stamp_url` to `owner_companies` only if the document printing module is approved.

### 2.4 New Child Table: `owner_company_signatories`
```sql
CREATE TABLE owner_company_signatories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE CASCADE,
  user_id     BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  designation TEXT,
  signature_scope TEXT,    -- e.g. "financial", "legal", "hr", "general"
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to   DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMPTZ
);
```
- RLS: enabled, forced
- Policy: view = `common_md.organizations.view` or `system_admin`; manage = `common_md.organizations.manage` or `system_admin`

### 2.5 UI Route
- **Existing:** `/admin/organizations/record/[id]` — already exists
- **Action:** Add new sections to the existing Organization record workspace form:
  - **Extended Profile section** — trade name, main activity, established date, compliance status, default bank, default tax type, office address (if different from registered address)
  - **Authorized Signatories section** — child dialog list (standard ERPChildDialogForm)
  - **DMS Documents tab** — `<DmsEntityDocumentsTab entityType="company" entityId={orgId} canUpload canLinkExisting canUnlink />`

### 2.6 DMS Integration
- Entity type: **`company`** (already in registry)
- Documents to link: Trade License, VAT Certificate, Chamber Certificate, Company Profile, Bank Confirmation Letter, Insurance Certificates, ISO Certificates, Power of Attorney, Tenancy Contract, Authorized Signatory Passport/EID
- Workflow: Open Organization record → Documents tab → Upload New (opens DMS inbox with `?entityType=company&entityId={id}`) → AI intake → document saved + linked to organization

### 2.7 Permissions
```
common_md.organizations.view    (replaces/extends existing: organizations.view)
common_md.organizations.manage  (replaces/extends: organizations.edit + organizations.create)
```
Decision: **Deprecate** `organizations.view` / `organizations.edit` / `organizations.create` in favor of `common_md.organizations.*` in this phase. Add the new permission codes to the `erp_permissions` table.

### 2.8 RLS Approach
```sql
-- owner_companies: existing RLS policy applies
-- owner_company_signatories: new policies
CREATE POLICY signatory_select ON owner_company_signatories
  FOR SELECT USING (current_user_has_permission('common_md.organizations.view'));
CREATE POLICY signatory_write ON owner_company_signatories
  FOR ALL USING (current_user_has_permission('common_md.organizations.manage'));
```

### 2.9 Integration Use Cases
- HR: default organization for employee records, payroll
- Finance: default currency, tax type, bank account reference
- DMS: trade license expiry → DMS expiry reminders

### 2.10 Future Expansion
- Multiple registered addresses (registered vs operational vs legal vs postal)
- Organization hierarchy (parent company / subsidiary)
- ESG/sustainability scores

---

## 3. Master Area 2: Branch Extended Profile

### 3.1 Purpose
Extend branch profile to support operational assignments and module integrations.

### 3.2 Why Cross-Module
- HR assigns employees to branches
- Fleet/Workshop assets belong to branches
- Finance uses branch cost/profit centers
- Projects reference branch as base
- Work sites are linked to branches

### 3.3 Database Change: Extend `branches`
```sql
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS opening_date DATE,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS cost_center_id BIGINT REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profit_center_id BIGINT REFERENCES profit_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_work_calendar_id BIGINT REFERENCES work_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_manager_user_id BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legal_branch_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_license_branch_ref TEXT,
  ADD COLUMN IF NOT EXISTS emirate_id BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_zone_id BIGINT REFERENCES area_zones(id) ON DELETE SET NULL;
```

> Note: `default_work_calendar_id` FK is added now but will only be populated after Work Calendars table is implemented.

### 3.4 UI Route
- **Existing:** `/admin/branches/record/[id]`
- **Action:** Add new sections:
  - **Extended Profile section** — legal branch name, trade license branch ref, opening/closing date, cost center, profit center, branch manager
  - **DMS Documents tab** — `<DmsEntityDocumentsTab entityType="branch" entityId={branchId} ... />`

### 3.5 DMS Integration
- Entity type: **`branch`** (already in registry)
- Documents: Branch Trade License, Tenancy Contract, Municipality Approval, Lease Agreement, Utility Account Letter, Branch Insurance, Site/Office Photos

### 3.6 Permissions
```
common_md.branches.view
common_md.branches.manage
```
Deprecate `branches.view` / `branches.edit` in favor of these.

---

## 4. Master Area 3: Departments

### 4.1 Purpose
Common organizational unit used by HR, Finance, HSE, Fleet, Workshop, Projects for cost allocation, document ownership, approval routing, notifications, and responsibility assignment.

### 4.2 Why Cross-Module
Every module that assigns work, costs, or approvals to an organizational unit needs departments.

### 4.3 New Table: `departments`
```sql
CREATE TABLE departments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_code       TEXT NOT NULL,
  department_name_en    TEXT NOT NULL,
  department_name_ar    TEXT,
  owner_company_id      BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE RESTRICT,
  branch_id             BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  parent_department_id  BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  cost_center_id        BIGINT REFERENCES cost_centers(id) ON DELETE SET NULL,
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  effective_from        DATE,
  effective_to          DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ,
  UNIQUE (owner_company_id, department_code)
);
```

### 4.4 Indexes
```sql
CREATE INDEX idx_departments_company ON departments(owner_company_id);
CREATE INDEX idx_departments_branch ON departments(branch_id);
CREATE INDEX idx_departments_parent ON departments(parent_department_id);
CREATE INDEX idx_departments_active ON departments(is_active) WHERE deleted_at IS NULL;
```

### 4.5 Notes
- `parent_department_id` enables hierarchy (max recommended depth: 5 levels)
- `branch_id` is optional — some departments span multiple branches
- Department head will be an FK to `employees` (future HR table) — not added now; FK will be added in HR phase
- No DMS Documents tab required for department by default, but `entityType="department"` should be added to `dms-entity-types.ts` if compliance documents per department are needed (e.g. safety certificates, departmental ISO certs)

### 4.6 UI Route
```
/admin/common-master-data/departments
/admin/common-master-data/departments/record/new
/admin/common-master-data/departments/record/[id]
```

### 4.7 Form Sections
1. **Department Info** — code, name (EN/AR), organization, branch, parent department
2. **Cost & Finance** — cost center
3. **Effectivity** — effective from/to, active flag
4. **Notes**

No DMS Documents tab in v1. May be added in a future minor extension.

### 4.8 Permissions
```
common_md.departments.view
common_md.departments.manage
```

### 4.9 RLS
```sql
-- view requires common_md.departments.view
-- write requires common_md.departments.manage
-- Scoped to owner_company records the user has access to via organization permission
```

### 4.10 Integration Use Cases
- HR: employee department assignment
- Finance: cost allocation per department
- HSE: department safety responsibility
- Fleet: fleet responsibility assignment
- Notifications: department-level notification recipients
- Approvals: department-scoped approval roles

### 4.11 Numbering
Auto-incrementing `department_code` using global numbering rules: `DEPT-{COMPANY_CODE}-{SEQ}`.

---

## 5. Master Area 4: Designations / Job Titles

### 5.1 Purpose
Standard job titles/designations used across HR, payroll, approval routing, document signing authority, and HSE accountability.

### 5.2 Why Cross-Module
- HR assigns designations to employees
- Approval routing checks if designation has authority level
- DMS document signing checks authorized signatory flags
- HSE tracks safety-critical designations

### 5.3 New Table: `designations`
```sql
CREATE TABLE designations (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  designation_code        TEXT NOT NULL,
  designation_name_en     TEXT NOT NULL,
  designation_name_ar     TEXT,
  owner_company_id        BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  department_id           BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  job_level               TEXT,       -- e.g. "L1", "L2", "L3", "Manager", "Director", "VP"
  management_level        TEXT        CHECK (management_level IN ('staff','supervisor','manager','senior_manager','director','executive','c_level')),
  is_supervisor           BOOLEAN NOT NULL DEFAULT false,
  is_authorized_signatory BOOLEAN NOT NULL DEFAULT false,
  has_approval_authority  BOOLEAN NOT NULL DEFAULT false,
  is_safety_critical      BOOLEAN NOT NULL DEFAULT false,
  description             TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at              TIMESTAMPTZ,
  UNIQUE (designation_code)
);
```

### 5.4 Notes
- `owner_company_id` is optional — some designations are global across all companies
- `department_id` is optional — some designations are cross-department
- `is_authorized_signatory` → links to `owner_company_signatories` when employee is assigned this designation in future HR
- No DMS Documents tab needed for designation (document compliance is per employee in HR)

### 5.5 UI Route
```
/admin/common-master-data/designations
/admin/common-master-data/designations/record/new
/admin/common-master-data/designations/record/[id]
```

### 5.6 Form Sections
1. **Designation Info** — code, name (EN/AR), organization, department
2. **Level & Authority** — job level, management level, supervisor flag, signatory flag, approval authority flag, safety critical flag
3. **Notes**

### 5.7 Permissions
```
common_md.designations.view
common_md.designations.manage
```

### 5.8 Integration Use Cases
- HR: employee designation assignment
- Payroll: grade-based salary bands (future)
- Approvals: authority level linked to designation
- DMS: signatory authority check
- HSE: safety-critical accountability

---

## 6. Master Area 5: Work Sites / Operational Locations

### 6.1 Purpose
Operational locations used by Fleet, Workshop, Projects, HR (camp/accommodation), HSE (site safety), and Transport. Distinct from geography (geography = abstract place; work site = a physical ERP-managed operational location).

### 6.2 Why Cross-Module
- Fleet assigns vehicles/equipment to work sites
- Workshop operates from a site
- Projects are executed at sites
- HR assigns employees to sites (camp, office, field)
- HSE manages site safety plans and incidents per site
- Transport routes start/end at sites

### 6.3 New Table: `work_sites`
```sql
CREATE TABLE work_sites (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_code           TEXT NOT NULL UNIQUE,
  site_name           TEXT NOT NULL,
  site_type           TEXT NOT NULL
    CHECK (site_type IN ('office','yard','workshop','camp','warehouse','project_site','client_site','weighbridge','fuel_point','storage_area','other')),
  owner_company_id    BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE RESTRICT,
  branch_id           BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  party_id            BIGINT REFERENCES parties(id) ON DELETE SET NULL,  -- optional client/party link
  country_id          BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  emirate_id          BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  city_id             BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  area_zone_id        BIGINT REFERENCES area_zones(id) ON DELETE SET NULL,
  address_line_1      TEXT,
  address_line_2      TEXT,
  po_box              TEXT,
  makani_number       TEXT,
  latitude            NUMERIC(10, 7),
  longitude           NUMERIC(10, 7),
  site_contact_name   TEXT,
  site_contact_phone  TEXT,
  site_contact_email  TEXT,
  is_restricted_area  BOOLEAN NOT NULL DEFAULT false,
  cicpa_required      BOOLEAN NOT NULL DEFAULT false,    -- CICPA pass required
  adnoc_required      BOOLEAN NOT NULL DEFAULT false,    -- ADNOC access required
  work_calendar_id    BIGINT REFERENCES work_calendars(id) ON DELETE SET NULL,
  access_notes        TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','closed','decommissioned')),
  opening_date        DATE,
  closing_date        DATE,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ
);
```

### 6.4 Indexes
```sql
CREATE INDEX idx_work_sites_company ON work_sites(owner_company_id);
CREATE INDEX idx_work_sites_branch ON work_sites(branch_id);
CREATE INDEX idx_work_sites_type ON work_sites(site_type);
CREATE INDEX idx_work_sites_active ON work_sites(status) WHERE deleted_at IS NULL;
```

### 6.5 DMS Integration
- Entity type: **`site`** (already in registry as `"site"`)
- Documents: Site Access Approval, CICPA/ADNOC Access Approval, Lease/Tenancy Contract, Site Insurance, Municipality Approval, HSE Site Approval, Site Layout Plan, Emergency Contact List

### 6.6 UI Route
```
/admin/common-master-data/work-sites
/admin/common-master-data/work-sites/record/new
/admin/common-master-data/work-sites/record/[id]
```

### 6.7 Form Sections
1. **Site Info** — code, name, type, organization, branch, party (client)
2. **Location** — geography (country/emirate/city/area), address, GPS coordinates
3. **Access & Restrictions** — restricted area flags, CICPA, ADNOC, access notes
4. **Contact** — site contact name/phone/email
5. **Scheduling** — work calendar assignment, opening/closing dates
6. **DMS Documents** — `<DmsEntityDocumentsTab entityType="site" entityId={siteId} ... />`

### 6.8 Permissions
```
common_md.work_sites.view
common_md.work_sites.manage
```

### 6.9 Integration Use Cases
- Fleet: vehicle/equipment deployed to site
- Workshop: workshop site operations
- Projects: project site location
- HR: employee stationed at site (camp, office)
- HSE: site incident/permit management
- Transport: pickup/delivery point

---

## 7. Master Area 6: Work Calendars / Shifts

### 7.1 Purpose
Define working schedules, weekly patterns, and shifts for use by HR attendance, Fleet assignment scheduling, Workshop operations, and Project timeline planning.

### 7.2 Why Cross-Module
- HR uses calendars for attendance, leaves, and overtime
- Workshop uses calendars for operating hours
- Fleet uses shift definitions for driver assignments
- Projects use calendars for working-day calculations
- Sites reference calendars for access scheduling

### 7.3 New Table: `work_calendars`
```sql
CREATE TABLE work_calendars (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calendar_code         TEXT NOT NULL UNIQUE,
  calendar_name         TEXT NOT NULL,
  calendar_type         TEXT NOT NULL DEFAULT 'standard'
    CHECK (calendar_type IN ('standard','ramadan','summer','project','custom')),
  owner_company_id      BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  working_days          TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri'],  -- array of day codes
  weekend_days          TEXT[] NOT NULL DEFAULT ARRAY['sat','sun'],
  has_ramadan_timing    BOOLEAN NOT NULL DEFAULT false,
  has_summer_timing     BOOLEAN NOT NULL DEFAULT false,
  effective_from        DATE,
  effective_to          DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ
);
```

### 7.4 New Table: `work_shifts`
```sql
CREATE TABLE work_shifts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_code          TEXT NOT NULL,
  shift_name          TEXT NOT NULL,
  calendar_id         BIGINT NOT NULL REFERENCES work_calendars(id) ON DELETE CASCADE,
  shift_start_time    TIME NOT NULL,
  shift_end_time      TIME NOT NULL,
  break_start_time    TIME,
  break_end_time      TIME,
  total_hours         NUMERIC(4,2),   -- derived or entered
  is_overnight        BOOLEAN NOT NULL DEFAULT false,
  ramadan_start_time  TIME,
  ramadan_end_time    TIME,
  summer_start_time   TIME,
  summer_end_time     TIME,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at          TIMESTAMPTZ,
  UNIQUE (calendar_id, shift_code)
);
```

### 7.5 Holiday Calendars (Deferred to COMMON MD.2)
Public holidays and custom company holidays are deferred to avoid scope creep. A `work_calendar_holidays` table will be planned in COMMON MD.2 if needed before HR module. The HR module can implement this if needed.

### 7.6 DMS Integration
- Work Calendar entity type is **not** in the current registry.
- Recommendation: Add `work_calendar` to `dms-entity-types.ts` only if documents per calendar are needed (e.g. approved working time circular, Ramadan notice).
- Decision: **Optional** — add `WORK_CALENDAR: "work_calendar"` to registry but do not show DMS tab in v1.

### 7.7 UI Route
```
/admin/common-master-data/work-calendars
/admin/common-master-data/work-calendars/record/new
/admin/common-master-data/work-calendars/record/[id]
```
Shifts managed as child sections within the Calendar record form (ERPChildDialogForm pattern).

### 7.8 Form Sections
1. **Calendar Info** — code, name, type, organization, effective dates
2. **Working Pattern** — working days (checkboxes), weekend days, Ramadan/summer flags
3. **Shifts** — child section, list of shifts with add/edit/delete (ERPChildDialogForm)
4. **Notes**

### 7.9 Permissions
```
common_md.work_calendars.view
common_md.work_calendars.manage
```

---

## 8. Master Area 7: Approval Roles / Authority Levels

### 8.1 Purpose
Common workflow foundation. Defines who can approve what, at what level, and within what scope. Enables consistent approval routing across HR, Finance, Purchase, Workshop, and Projects — without building the full workflow engine now.

### 8.2 Why Cross-Module
Every module with approval workflows (leave requests, purchase orders, job cards, project budgets, HSE permits) needs a common role/authority model to route approvals consistently.

### 8.3 New Table: `approval_roles`
```sql
CREATE TABLE approval_roles (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_code             TEXT NOT NULL UNIQUE,
  role_name             TEXT NOT NULL,
  level_number          INT NOT NULL CHECK (level_number > 0),
  scope                 TEXT NOT NULL DEFAULT 'company'
    CHECK (scope IN ('company','branch','department','site','module','global')),
  module_code           TEXT,   -- e.g. "HR", "FINANCE", "FLEET", "WORKSHOP" — null = global
  amount_limit          NUMERIC(18,4),   -- optional financial approval limit
  currency_code         TEXT DEFAULT 'AED',
  can_approve           BOOLEAN NOT NULL DEFAULT true,
  can_reject            BOOLEAN NOT NULL DEFAULT true,
  can_delegate          BOOLEAN NOT NULL DEFAULT false,
  escalation_role_id    BIGINT REFERENCES approval_roles(id) ON DELETE SET NULL,
  owner_company_id      BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  description           TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ
);
```

### 8.4 Notes
- This is **master data only**, not a workflow engine. Future workflow phases will add `approval_requests`, `approval_assignments` tables.
- `module_code` allows module-scoped approval roles (e.g. only used in HR, only in Finance)
- `escalation_role_id` defines who to escalate to if the primary approver does not respond
- No DMS Documents tab needed for approval roles in v1

### 8.5 UI Route
```
/admin/common-master-data/approval-roles
/admin/common-master-data/approval-roles/record/new
/admin/common-master-data/approval-roles/record/[id]
```

### 8.6 Form Sections
1. **Role Info** — code, name, level, scope, module, organization
2. **Authority** — amount limit, currency, can approve/reject/delegate
3. **Escalation** — escalation role
4. **Notes**

### 8.7 Permissions
```
common_md.approval_roles.view
common_md.approval_roles.manage
```

---

## 9. Master Area 8: DMS Required Document Rules

### 9.1 Purpose
Define which documents are required for which entity types, whether they have expiry requirements, and whether missing documents should block operational actions (e.g. cannot onboard employee without Emirates ID, cannot assign vehicle without insurance).

### 9.2 Why Cross-Module
All modules use DMS for document management. A common required-document rules table ensures consistent compliance enforcement across HR (employee documents), Fleet (vehicle documents), Company (trade license), Branch (tenancy contract), Site (access approval), and more.

### 9.3 New Table: `dms_required_document_rules`
```sql
CREATE TABLE dms_required_document_rules (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code             TEXT NOT NULL UNIQUE,
  rule_name             TEXT NOT NULL,
  entity_type           TEXT NOT NULL,  -- matches dms_document_links.entity_type values
  entity_subtype        TEXT,           -- optional subtype filter (e.g. "UAE_NATIONAL" for employee)
  document_type_id      BIGINT REFERENCES dms_document_types(id) ON DELETE RESTRICT,
  is_required           BOOLEAN NOT NULL DEFAULT true,
  requires_expiry_date  BOOLEAN NOT NULL DEFAULT false,
  requires_issue_date   BOOLEAN NOT NULL DEFAULT false,
  blocks_activation     BOOLEAN NOT NULL DEFAULT false,
  reminder_days_before_expiry INT[],   -- e.g. ARRAY[90, 60, 30, 7]
  owner_company_id      BIGINT REFERENCES owner_companies(id) ON DELETE SET NULL,
  branch_id             BIGINT REFERENCES branches(id) ON DELETE SET NULL,
  department_id         BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  effective_from        DATE,
  effective_to          DATE,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at            TIMESTAMPTZ
);
```

### 9.4 Indexes
```sql
CREATE INDEX idx_dms_req_rules_entity ON dms_required_document_rules(entity_type);
CREATE INDEX idx_dms_req_rules_doc_type ON dms_required_document_rules(document_type_id);
CREATE INDEX idx_dms_req_rules_active ON dms_required_document_rules(is_active) WHERE deleted_at IS NULL;
```

### 9.5 Seed Data Examples
```sql
-- Company required documents
INSERT INTO dms_required_document_rules (rule_code, rule_name, entity_type, document_type_name, is_required, requires_expiry_date, blocks_activation)
VALUES
  ('RDR-COMP-001', 'Company Trade License',       'company', 'TRADE_LICENSE', true, true, false),
  ('RDR-COMP-002', 'Company VAT Certificate',     'company', 'VAT_CERTIFICATE', false, false, false),
  ('RDR-COMP-003', 'Company Insurance',           'company', 'INSURANCE_POLICY', false, true, false),
  ('RDR-BRNCH-001','Branch Tenancy Contract',     'branch',  'TENANCY_CONTRACT', false, true, false),
  ('RDR-BRNCH-002','Branch Municipality Approval','branch',  'MUNICIPALITY_APPROVAL', false, false, false);
-- Employee rules (seeded but entity not built yet — enables compliance check readiness)
  ('RDR-EMP-001',  'Employee Emirates ID',        'employee','EMIRATES_ID', true, true, true),
  ('RDR-EMP-002',  'Employee Passport',           'employee','PASSPORT', true, true, false),
  ('RDR-EMP-003',  'Employee UAE Visa',           'employee','UAE_VISA', false, true, false),
-- Vehicle rules
  ('RDR-VEH-001',  'Vehicle Registration',        'vehicle', 'VEHICLE_REGISTRATION', true, true, true),
  ('RDR-VEH-002',  'Vehicle Insurance',           'vehicle', 'VEHICLE_INSURANCE', true, true, true);
```

### 9.6 How This Upgrades `getDmsEntityDocumentComplianceSummary`
After this table is populated, the `getDmsEntityDocumentComplianceSummary` server action (DMS.15) can query `dms_required_document_rules` to calculate `missingRequiredDocuments` accurately. Currently it returns 0. This is the data that makes it functional.

### 9.7 UI Route
```
/admin/common-master-data/dms-required-documents
/admin/common-master-data/dms-required-documents/record/new
/admin/common-master-data/dms-required-documents/record/[id]
```

### 9.8 Form Sections
1. **Rule Info** — code, name, entity type, entity subtype
2. **Document** — document type (ERPCombobox → `dms_document_types`)
3. **Requirements** — is_required, requires_expiry_date, requires_issue_date, blocks_activation
4. **Reminders** — reminder days before expiry (multi-value)
5. **Scope** — organization, branch, department (all optional filters)
6. **Effectivity** — effective from/to, active flag

### 9.9 Permissions
```
common_md.dms_required_documents.view
common_md.dms_required_documents.manage
```

---

## 10. DMS Entity Type Registry — Additions Required

Add these to `src/lib/dms/dms-entity-types.ts`:

```ts
DEPARTMENT: "department",
DESIGNATION: "designation",       // optional — only if dept-level documents needed
WORK_SITE: "work_site",           // preferred over "site" for clarity; "site" already exists
WORK_CALENDAR: "work_calendar",   // optional — document storage for approved schedules
APPROVAL_ROLE: "approval_role",   // optional
```

**Recommendation:**
- Add `DEPARTMENT: "department"` — departments may have safety/compliance certificates
- Add `WORK_SITE: "work_site"` as alias alongside existing `SITE: "site"` — or simply rename "site" to "work_site" for clarity. Use `site` as the canonical code (already in DB) and add `WORK_SITE` as an alias pointing to same code.
- `DESIGNATION`, `WORK_CALENDAR`, `APPROVAL_ROLE` — add but don't show DMS tab in v1

---

## 11. Navigation & UI Routes Summary

### 11.1 New Routes
```
/admin/common-master-data                            (Landing page with 8 cards)
/admin/common-master-data/departments                (List)
/admin/common-master-data/departments/record/new     (Create)
/admin/common-master-data/departments/record/[id]    (Edit/View)
/admin/common-master-data/designations               (List)
/admin/common-master-data/designations/record/new
/admin/common-master-data/designations/record/[id]
/admin/common-master-data/work-sites                 (List)
/admin/common-master-data/work-sites/record/new
/admin/common-master-data/work-sites/record/[id]
/admin/common-master-data/work-calendars             (List)
/admin/common-master-data/work-calendars/record/new
/admin/common-master-data/work-calendars/record/[id]
/admin/common-master-data/approval-roles             (List)
/admin/common-master-data/approval-roles/record/new
/admin/common-master-data/approval-roles/record/[id]
/admin/common-master-data/dms-required-documents     (List)
/admin/common-master-data/dms-required-documents/record/new
/admin/common-master-data/dms-required-documents/record/[id]
```

### 11.2 Extended Existing Routes (add sections, no route change)
```
/admin/organizations/record/[id]  → add Extended Profile + Signatories + DMS Documents tab
/admin/branches/record/[id]       → add Extended Profile + DMS Documents tab
```

### 11.3 Sidebar Navigation Group
```
Admin Sidebar — Common Master Data
  ├── Departments
  ├── Designations
  ├── Work Sites
  ├── Work Calendars
  ├── Approval Roles
  └── DMS Required Documents
```

Organizations and Branches remain in their current sidebar positions (already present).

---

## 12. Permissions Summary

| Permission Code | Purpose |
|---|---|
| `common_md.view` | Broad read access to all common master data |
| `common_md.manage` | Broad manage access to all common master data |
| `common_md.organizations.view` | View organization profiles |
| `common_md.organizations.manage` | Manage organization profiles + signatories |
| `common_md.branches.view` | View branch profiles |
| `common_md.branches.manage` | Manage branch profiles |
| `common_md.departments.view` | View departments |
| `common_md.departments.manage` | Create/edit/delete departments |
| `common_md.designations.view` | View designations |
| `common_md.designations.manage` | Create/edit/delete designations |
| `common_md.work_sites.view` | View work sites |
| `common_md.work_sites.manage` | Create/edit/delete work sites |
| `common_md.work_calendars.view` | View work calendars + shifts |
| `common_md.work_calendars.manage` | Create/edit/delete calendars + shifts |
| `common_md.approval_roles.view` | View approval roles |
| `common_md.approval_roles.manage` | Create/edit/delete approval roles |
| `common_md.dms_required_documents.view` | View DMS required document rules |
| `common_md.dms_required_documents.manage` | Create/edit/delete required document rules |

**Decision needed:** Whether to deprecate `organizations.*` and `branches.*` permission codes or keep both in parallel for backward compatibility. Recommendation: add new `common_md.*` codes, deprecate old codes in a later cleanup phase after verifying all existing role assignments.

---

## 13. Who Maintains What

| Master Data | Typical Maintainer | Permission |
|---|---|---|
| Organization Extended Profile | System Admin / Management | `common_md.organizations.manage` |
| Branch Extended Profile | System Admin / Operations Manager | `common_md.branches.manage` |
| Departments | HR/Admin | `common_md.departments.manage` |
| Designations | HR/Admin | `common_md.designations.manage` |
| Work Sites | Operations / Projects / Admin | `common_md.work_sites.manage` |
| Work Calendars/Shifts | HR/Admin / Operations | `common_md.work_calendars.manage` |
| Approval Roles | Management / System Admin | `common_md.approval_roles.manage` |
| DMS Required Document Rules | DMS Admin / Compliance / HR/Admin | `common_md.dms_required_documents.manage` |

---

## 14. Database Migration Strategy

### 14.1 Migration Approach
Single migration file: `YYYYMMDDHHMMSS_erp_common_md_1_cross_module_master_data_foundation`

### 14.2 Migration Contents (in order)
1. Extend `owner_companies` (ALTER TABLE — add columns)
2. Extend `branches` (ALTER TABLE — add columns)
3. Create `owner_company_signatories`
4. Create `departments`
5. Create `designations`
6. Create `work_calendars`
7. Create `work_shifts`
8. Create `work_sites`
9. Create `approval_roles`
10. Create `dms_required_document_rules`
11. Add all RLS policies
12. Add all indexes
13. Seed common_md permission codes into `erp_permissions`
14. Seed example DMS required document rules (company + branch rules only — other entities deferred)

### 14.3 Migration Risk Level: **LOW**
- `ALTER TABLE` adds nullable columns only — no data loss risk
- All new tables are independent — no impact on existing tables except new FKs

---

## 15. Integration with Future Modules

### HR Module (003)
- Employee record → `department_id` FK to `departments`
- Employee record → `designation_id` FK to `designations`
- Employee record → `work_calendar_id` FK to `work_calendars`
- Employee record → `work_site_id` FK to `work_sites` (primary workplace)
- Employee compliance → `dms_required_document_rules` for Emirates ID, Passport, Visa, Medical Certificate
- Leave requests → approval routing via `approval_roles`

### Fleet Module (005)
- Vehicle record → `branch_id`, `work_site_id` (deployment location)
- Vehicle compliance → `dms_required_document_rules` for Registration, Insurance, Inspection
- Fleet approval → `approval_roles` for vehicle procurement, disposal

### Workshop Module (006)
- Workshop job card → `branch_id`, `work_site_id`
- Workshop operations → `work_calendars` for operating hours
- Workshop department → `departments`

### Projects Module (012)
- Project record → `work_site_id` (project site)
- Project approval → `approval_roles`
- Project department → `departments`

### Finance Module (010)
- PO/Invoice approval → `approval_roles`
- Cost allocation → `departments`, `cost_centers`

### HSE Module (011)
- Incident record → `work_site_id`, `department_id`
- HSE permit → `work_site_id`, approval via `approval_roles`
- HSE training → employee `designation_id` (safety critical)
- Site compliance → `dms_required_document_rules` for site approvals

### Procurement Module
- Purchase request approval → `approval_roles` with amount limits
- Supplier compliance → `dms_required_document_rules` for party documents

### Transport Module
- Route → `work_sites` as pickup/delivery points
- Driver schedule → `work_calendars`, `work_shifts`

---

## 16. Out-of-Scope Confirmation

The following remain in their respective future modules:

| Item | Module |
|---|---|
| Employee categories, probation types | HR |
| Payroll groups, salary grades | HR |
| Vehicle types, makes, models | Fleet |
| Equipment types, categories | Fleet |
| Maintenance types, service types | Workshop |
| Workshop job categories | Workshop |
| HSE incident types, hazard codes | HSE |
| Training types, course categories | HSE |
| Inventory item categories | Inventory |
| Spare part categories | Inventory |
| Procurement request types | Procurement |
| Transport route master | Transport |
| Fuel types, dispensing categories | Fleet/Transport |
| Weighbridge transaction types | Weighbridge |
| Project work package types | Projects |
| Module-specific compliance classifications | Each module |

---

## 17. ERP Standards Compliance

All COMMON MD.1 implementation must comply with:

1. **`erp-record-workspace-form-standard.mdc`** — all record forms use `ERPRecordWorkspaceForm`
2. **`erp-workspace-unsaved-form-draft-standard.mdc`** — all forms use `useWorkspaceFormDraft`
3. **`erp-child-dialog-form-standard.mdc`** — all child dialogs use `ERPChildDialogForm`
4. **`erp-dms-standard.mdc`** — DMS Documents tab uses `DmsEntityDocumentsTab`
5. **`algt-erp-source-of-truth.mdc`** — update SOT after phase completes
6. **Global rules** — BIGINT PKs, no UUID; `ERPCombobox` not bare `<Select>` for async data; `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()` in all server mutations

---

## 18. Future Modification Notes

- This is **version 1** of common master data. Not frozen.
- HR module will likely require adding `department_head_employee_id` FK to `departments` (after employees table exists)
- Work Calendars v1 does not include public holiday management — Holiday Calendar feature is planned for COMMON MD.2 or within the HR module
- Approval Roles v1 has no workflow engine; approval request routing tables are planned within the first module that needs workflow (likely HR or Finance)
- `dms_required_document_rules.entity_subtype` is not enforced in v1 — the HR module will define enforcement logic per employee nationality/type
- Organization signatories are manual entries in v1; future HR integration will auto-derive from employee designations with `is_authorized_signatory = true`

---

## 19. Open Questions for Sameer/ChatGPT Review

1. **Permission strategy:** Replace old `organizations.view/edit` codes with `common_md.organizations.*`? Or keep both?
2. **Organization "trade name":** Is `short_name` sufficient, or should a separate `trade_name` field be added?
3. **Holiday calendar:** Should it be in COMMON MD.1 or deferred to HR module?
4. **Branch geography FKs:** `branches` uses text fields for emirate/city/area — should we add FK columns (`emirate_id`, `city_id`, `area_zone_id`) to branches in COMMON MD.1? (Same pattern as `owner_companies`)
5. **Work Calendar → Work Site relationship:** Should `work_sites` have a `work_calendar_id` FK in COMMON MD.1, or defer that to Fleet/Workshop?
6. **Organization DMS Documents tab:** Should the Documents tab on the Organization record show `entityType="company"` documents, or should it use a new `entityType="organization"` for clarity? (Current registry has `"company"` — recommend using it as-is.)
7. **DMS Required Document Rules:** Seed company + branch rules in migration, or leave empty for admin to populate?
8. **`/admin/common-master-data` landing page:** Simple link grid or full dashboard with record counts?

---

## 20. Acceptance Criteria for This Plan

The plan is accepted when:

- [x] All 8 master areas covered
- [x] Required fields defined for each
- [x] Database table proposals complete
- [x] UI route/form proposals included
- [x] DMS integration proposal for each applicable area
- [x] Entity type registry additions identified
- [x] Upload/attach document from inside master record form described
- [x] Permissions mapped
- [x] Who maintains what defined
- [x] Future module integration notes included
- [x] Out-of-scope items confirmed
- [x] Open questions raised for review

---

## 21. Implementation Report Requirements (Post-Implementation)

File: `implementation_Review/ERP_COMMON_MD_1_CROSS_MODULE_MASTER_DATA_FOUNDATION_IMPLEMENTATION_REPORT.md`

Must include: objective, files created, files modified, migrations applied, tables created/extended, fields implemented, routes created, forms/sections built, DMS integration implemented, permissions seeded, RLS findings, known limitations, TS/build results, SOT update confirmation.

---

## 22. Source of Truth Update (Post-Implementation)

Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` with:
- ERP COMMON MD.1 as CLOSED / PASS
- All tables created/extended
- All routes implemented
- DMS integration points per entity
- Permission codes seeded
- Next phase: `ERP 003 — HR Module Foundation`
