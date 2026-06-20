# Department Seed Compatibility and Plan

## 1. Executive Summary
We have performed a thorough compatibility check on the ERP database schema, numbering system, RLS policies, audit logging, and existing master data to plan the seeding of Department Master Data.

Seeding is **SAFE ONLY AFTER HUMAN APPROVAL** due to a structural constraint: the `departments` table schema enforces that `owner_company_id` is `NOT NULL`, and no shared group company (e.g. `PGI` or `Group`) currently exists in the database. A decision is required on whether to seed the "General / Shared" departments under both active companies (ALGT and ALS) or to take an alternative approach.

The database `departments` table is currently empty (0 records), so there is no immediate risk of duplicate departments.

---

## 2. Files and Database Objects Reviewed
- **Migrations**:
  - `supabase/migrations/20260527120000_erp_base_foundation.sql` (Creates base tables: `owner_companies`, `branches`, `user_profiles`, `audit_logs`)
  - `supabase/migrations/20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql` (Creates `departments` table, indexes, and RLS policies)
  - `supabase/migrations/20260604180757_erp_base_002f2_global_numbering_engine.sql` (Configures global numbering engine and sample rules)
  - `supabase/migrations/20260608105300_erp_base_002f3e2c_global_master_data_numbering_rules.sql` (Party numbering rules)
- **Application Server Actions**:
  - `src/server/actions/common-master-data/departments.ts` (Validations and operations on departments)
  - `src/server/actions/audit.ts` (Audit logs utility)
- **Live Database Inspection**:
  - Validated records in `owner_companies`, `branches`, and `departments` using direct queries via Supabase REST API.

---

## 3. Department Table Structure
Confirmed from `20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql`:
- **Table Name**: `departments`
- **Primary Key**: `id` (BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)
- **Required Columns**: 
  - `department_code` (TEXT NOT NULL)
  - `department_name_en` (TEXT NOT NULL)
  - `owner_company_id` (BIGINT NOT NULL REFERENCES owner_companies(id) ON DELETE RESTRICT)
- **Unique Constraint**: `UNIQUE (owner_company_id, department_code)`
- **Foreign Keys**:
  - `owner_company_id` REFERENCES `owner_companies(id)`
  - `branch_id` REFERENCES `branches(id)`
  - `parent_department_id` REFERENCES `departments(id)`
  - `cost_center_id` REFERENCES `cost_centers(id)`
  - `department_head_user_id` REFERENCES `user_profiles(id)`
  - `created_by` / `updated_by` REFERENCES `user_profiles(id)`
- **Status Field**: `is_active` (BOOLEAN NOT NULL DEFAULT true)
- **Soft-Delete Field**: `deleted_at` (TIMESTAMPTZ NULL)
- **Timestamp Fields**: `created_at` / `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT now())

---

## 4. Company / Organization Mapping
An inspection of the active `owner_companies` table shows two records:
1. **ALGT**: `id: 1` | `legal_name_en: "Alliance Gulf Transport and construction L.L.C"` | `company_code: "ALGT"`
2. **ALS**: `id: 2` | `legal_name_en: "Alliance Scrap Trading L.L.C"` | `company_code: "ALS"`

There is one active branch:
- **BR1**: `id: 1` | `branch_name_en: "ICAD II"` | `owner_company_id: 1` (belongs to ALGT)

**Key Finding**:
- General / Shared departments *cannot* use NULL `owner_company_id` due to the `NOT NULL` schema constraint.
- No general group or parent organization (e.g. `PGI` or `Group`) is present in `owner_companies`.
- Consequently, general/shared departments must either be duplicated under both ALGT (id: 1) and ALS (id: 2), or a shared group company must be created first.

---

## 5. Numbering and Code Compatibility
- **Generation Method**: Department codes are entered manually (`TEXT`). There is no numbering rule or sequence state configured for departments in the global numbering engine.
- **Length**: The `department_code` Zod schema in `src/server/actions/common-master-data/departments.ts` enforces `max(20)`. The longest proposed code is `ALS-COMPLIANCE` (14 characters), which is fully compatible.
- **Uniqueness**: Enforced per-company (`UNIQUE (owner_company_id, department_code)`). Codes can be repeated across different companies.

---

## 6. RLS and Permission Compatibility
- **Row Level Security**: Enabled and forced on the `departments` table.
- **Policies**:
  - `SELECT` allowed for users with `common_md.view`, `common_md.departments.view`, or `system_admin` role.
  - `INSERT` / `UPDATE` allowed for users with `common_md.manage`, `common_md.departments.manage`, or `system_admin` role.
  - `DELETE` allowed only for `system_admin` role.
- **Seeding Method Bypass**: Direct SQL migrations or service-role API clients bypass RLS and are safe to run without user session contexts.

---

## 7. Audit Logging Compatibility
- **Audit Logging**: Handled via the Next.js server action layer calling `logAudit` which inserts into the `audit_logs` table.
- **Trigger**: No database-level trigger automatically inserts into `audit_logs`.
- Seeding via SQL migrations will bypass the server actions and won't write to `audit_logs`. This is expected and safe for master data seeds.

---

## 8. Existing Department Records Found
- The `departments` table is currently **empty (0 records)**.

---

## 9. Duplicate Risk Assessment
- Since there are no existing records, there is **zero risk** of duplicates or breaking existing references upon initial seed.
- However, to ensure idempotence, all seed statements will use `ON CONFLICT (owner_company_id, department_code) DO NOTHING`.

---

## 10. Proposed Department Seed Data
We propose seeding the departments as follows:
1. **General / Shared**: Seeded under both ALGT (company_id: 1) and ALS (company_id: 2).
2. **ALGT Specific**: Seeded under ALGT (company_id: 1).
3. **ALS Specific**: Seeded under ALS (company_id: 2).

---

## 11. Recommended Seed Method
Use a new migration SQL file or execute direct SQL on the database console. A SQL migration is the standard project pattern for deploying schema and master data seeds.

---

## 12. SQL / Script Preview

```sql
-- 1. General / Shared Departments (ALGT - Company ID 1)
INSERT INTO public.departments (department_code, department_name_en, owner_company_id, is_active)
VALUES
  ('GEN-MGMT', 'Management / Executive Office', 1, true),
  ('GEN-ADMIN', 'Administration', 1, true),
  ('GEN-HR', 'Human Resources', 1, true),
  ('GEN-PAYROLL', 'Payroll & WPS', 1, true),
  ('GEN-FIN', 'Finance & Accounts', 1, true),
  ('GEN-PROC', 'Procurement', 1, true),
  ('GEN-IT', 'IT & Systems', 1, true),
  ('GEN-QHSE', 'QHSE', 1, true),
  ('GEN-LEGAL', 'Legal & Contracts', 1, true),
  ('GEN-DOC', 'Documents & DMS Control', 1, true),
  ('GEN-BD', 'Business Development', 1, true),
  ('GEN-COM', 'Commercial & Estimation', 1, true),
  ('GEN-REPORTS', 'Reports & Analytics', 1, true)
ON CONFLICT (owner_company_id, department_code) DO NOTHING;

-- 2. General / Shared Departments (ALS - Company ID 2)
INSERT INTO public.departments (department_code, department_name_en, owner_company_id, is_active)
VALUES
  ('GEN-MGMT', 'Management / Executive Office', 2, true),
  ('GEN-ADMIN', 'Administration', 2, true),
  ('GEN-HR', 'Human Resources', 2, true),
  ('GEN-PAYROLL', 'Payroll & WPS', 2, true),
  ('GEN-FIN', 'Finance & Accounts', 2, true),
  ('GEN-PROC', 'Procurement', 2, true),
  ('GEN-IT', 'IT & Systems', 2, true),
  ('GEN-QHSE', 'QHSE', 2, true),
  ('GEN-LEGAL', 'Legal & Contracts', 2, true),
  ('GEN-DOC', 'Documents & DMS Control', 2, true),
  ('GEN-BD', 'Business Development', 2, true),
  ('GEN-COM', 'Commercial & Estimation', 2, true),
  ('GEN-REPORTS', 'Reports & Analytics', 2, true)
ON CONFLICT (owner_company_id, department_code) DO NOTHING;

-- 3. ALGT Specific Departments (Company ID 1)
INSERT INTO public.departments (department_code, department_name_en, owner_company_id, is_active)
VALUES
  ('ALGT-OPS', 'Operations', 1, true),
  ('ALGT-TRANS', 'Transport Operations', 1, true),
  ('ALGT-FLEET', 'Fleet Management', 1, true),
  ('ALGT-WORKSHOP', 'Workshop', 1, true),
  ('ALGT-PLANT', 'Plant & Equipment', 1, true),
  ('ALGT-PROJ', 'Projects', 1, true),
  ('ALGT-SITE', 'Site Operations', 1, true),
  ('ALGT-LOG', 'Logistics', 1, true),
  ('ALGT-YARD', 'Yard Operations', 1, true),
  ('ALGT-WB', 'Weighbridge', 1, true),
  ('ALGT-CICPA', 'CICPA / Security Passes', 1, true),
  ('ALGT-HSE', 'Site HSE', 1, true),
  ('ALGT-MAINT', 'Maintenance Planning', 1, true),
  ('ALGT-DISP', 'Dispatch & Scheduling', 1, true)
ON CONFLICT (owner_company_id, department_code) DO NOTHING;

-- 4. ALS Specific Departments (Company ID 2)
INSERT INTO public.departments (department_code, department_name_en, owner_company_id, is_active)
VALUES
  ('ALS-OPS', 'Scrap Operations', 2, true),
  ('ALS-YARD', 'Scrap Yard', 2, true),
  ('ALS-TRADING', 'Scrap Trading', 2, true),
  ('ALS-WB', 'Weighbridge', 2, true),
  ('ALS-MAT', 'Material Segregation', 2, true),
  ('ALS-LOAD', 'Loading & Offloading', 2, true),
  ('ALS-TRANS', 'Scrap Transport', 2, true),
  ('ALS-COMPLIANCE', 'Environmental Compliance', 2, true),
  ('ALS-QC', 'Material Inspection / QC', 2, true),
  ('ALS-SALES', 'Scrap Sales', 2, true),
  ('ALS-DISP', 'Dispatch & Delivery', 2, true),
  ('ALS-PERMIT', 'Permits & Disposal Documentation', 2, true)
ON CONFLICT (owner_company_id, department_code) DO NOTHING;
```

---

## 13. Rollback / Safety Plan
In case of any issues, the seeded departments can be deleted cleanly without affecting other tables, as no other tables currently contain references to them.

```sql
DELETE FROM public.departments
WHERE department_code IN (
  'GEN-MGMT', 'GEN-ADMIN', 'GEN-HR', 'GEN-PAYROLL', 'GEN-FIN', 'GEN-PROC', 'GEN-IT', 'GEN-QHSE', 'GEN-LEGAL', 'GEN-DOC', 'GEN-BD', 'GEN-COM', 'GEN-REPORTS',
  'ALGT-OPS', 'ALGT-TRANS', 'ALGT-FLEET', 'ALGT-WORKSHOP', 'ALGT-PLANT', 'ALGT-PROJ', 'ALGT-SITE', 'ALGT-LOG', 'ALGT-YARD', 'ALGT-WB', 'ALGT-CICPA', 'ALGT-HSE', 'ALGT-MAINT', 'ALGT-DISP',
  'ALS-OPS', 'ALS-YARD', 'ALS-TRADING', 'ALS-WB', 'ALS-MAT', 'ALS-LOAD', 'ALS-TRANS', 'ALS-COMPLIANCE', 'ALS-QC', 'ALS-SALES', 'ALS-DISP', 'ALS-PERMIT'
);
```

---

## 14. Blockers or Open Questions
1. **Shared/General Company Definition**: Since `departments.owner_company_id` is a `NOT NULL` field, we cannot insert general departments without a company relationship. Do you approve duplicating the "General / Shared" departments under both ALGT (id: 1) and ALS (id: 2) as proposed?
2. **Alternative Group Company**: Should we instead insert a new group/holding company (e.g. `PGI` or `Group`) into `owner_companies` and assign all General departments to it?

---

## 15. Final Recommendation
State: **SAFE ONLY AFTER HUMAN APPROVAL**
Once the user confirms the preferred handling of General / Shared departments (Option 1: Duplicated under ALGT and ALS, or Option 2: Creation of a Group Company), the seed can be executed immediately.
