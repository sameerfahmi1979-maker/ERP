# Designation Seed Compatibility and Plan

## 1. Executive Summary
We have performed a thorough compatibility check on the ERP database schema, numbering system, RLS policies, audit logging, and existing master data to plan the seeding of Designation Master Data.

Seeding is **SAFE TO SEED** because:
- The `designations` table is currently empty (0 records).
- Unlike departments, the `designations` table permits `owner_company_id` and `department_id` to be `NULL`, allowing a clean configuration for "General / Shared" designations without duplicating them.
- All proposed designation codes are globally unique, satisfying the table's `UNIQUE (designation_code)` constraint.

---

## 2. Files and Database Objects Reviewed
- **Migrations**:
  - `supabase/migrations/20260527120000_erp_base_foundation.sql` (Creates base schemas)
  - `supabase/migrations/20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql` (Creates `designations` table, indexes, and RLS policies)
- **Application Server Actions**:
  - `src/server/actions/common-master-data/designations.ts` (Validations and operations on designations)
- **Live Database Inspection**:
  - Verified that the `designations` table contains 0 records.

---

## 3. Designation Table Structure
Confirmed from `20260616120000_erp_common_md_1_cross_module_master_data_foundation.sql`:
- **Table Name**: `designations`
- **Primary Key**: `id` (BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY)
- **Required Columns**:
  - `designation_code` (TEXT NOT NULL)
  - `designation_name_en` (TEXT NOT NULL)
- **Unique Constraint**: `UNIQUE (designation_code)`
- **Foreign Keys**:
  - `owner_company_id` REFERENCES `owner_companies(id)` (Nullable)
  - `department_id` REFERENCES `departments(id)` (Nullable)
  - `created_by` / `updated_by` REFERENCES `user_profiles(id)` (Nullable)
- **Status Field**: `is_active` (BOOLEAN NOT NULL DEFAULT true)
- **Soft-Delete Field**: `deleted_at` (TIMESTAMPTZ NULL)
- **Timestamp Fields**: `created_at` / `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT now())

---

## 4. Department Relationship and Mapping
- **Mandatory or Optional**: Optional. The database schema allows `department_id` to be `NULL`.
- **Mapping Strategy**: For this initial seed, designations will be inserted with `department_id = NULL` since the prompt does not specify department-specific restrictions. Designations can be associated with departments later via the UI or subsequent migrations.

---

## 5. Company / Organization Mapping
- **Scoping Strategy**:
  - **General / Shared**: Seeded with `owner_company_id = NULL` (fully global/shared).
  - **ALGT Specific**: Seeded with `owner_company_id = 1` (ALGT).
  - **ALS Specific**: Seeded with `owner_company_id = 2` (ALS).

---

## 6. Numbering and Code Compatibility
- **Generation Method**: Designation codes are entered manually (`TEXT`). There is no numbering rule or sequence state configured for designations in the global numbering engine.
- **Length**: The `designation_code` Zod schema enforces `max(20)`. The longest proposed code is `ALGT-DES-035` (12 characters), which is fully compatible.
- **Uniqueness**: Enforced globally on the `designation_code` column. The prefixes `GEN-DES-`, `ALGT-DES-`, and `ALS-DES-` prevent any naming conflicts.

---

## 7. RLS and Permission Compatibility
- **Row Level Security**: Enabled and forced on the `designations` table.
- **Policies**:
  - `SELECT` allowed for users with `common_md.view`, `common_md.designations.view`, or `system_admin` role.
  - `INSERT` / `UPDATE` allowed for users with `common_md.manage`, `common_md.designations.manage`, or `system_admin` role.
  - `DELETE` allowed only for `system_admin` role.
- **Seeding Method Bypass**: Direct SQL migrations or service-role API clients bypass RLS and are safe to run without user session contexts.

---

## 8. Audit Logging Compatibility
- **Audit Logging**: Handled via the Next.js server action layer. SQL-based seeding will bypass `audit_logs` insertion, which is standard for master data seeding.

---

## 9. Existing Designation Records Found
- The `designations` table is currently **empty (0 records)**.

---

## 10. Duplicate Risk Assessment
- Since there are no existing records, there is **zero risk** of duplicates.
- However, to ensure idempotence, all seed statements will use `ON CONFLICT (designation_code) DO NOTHING`.

---

## 11. Proposed Designation Seed Data
We propose seeding 25 General, 35 ALGT-specific, and 28 ALS-specific designations, using `owner_company_id = NULL` for General, `1` for ALGT, and `2` for ALS.

---

## 12. Recommended Seed Method
Use a new migration SQL file or execute direct SQL on the database console using the service role API key.

---

## 13. SQL / Script Preview

```sql
-- 1. General / Shared Designations (Global - owner_company_id is NULL)
INSERT INTO public.designations (designation_code, designation_name_en, owner_company_id, is_active)
VALUES
  ('GEN-DES-001', 'Managing Director', NULL, true),
  ('GEN-DES-002', 'General Manager', NULL, true),
  ('GEN-DES-003', 'Operations Manager', NULL, true),
  ('GEN-DES-004', 'Finance Manager', NULL, true),
  ('GEN-DES-005', 'Accountant', NULL, true),
  ('GEN-DES-006', 'Accounts Assistant', NULL, true),
  ('GEN-DES-007', 'HR Manager', NULL, true),
  ('GEN-DES-008', 'HR Officer', NULL, true),
  ('GEN-DES-009', 'Payroll Officer', NULL, true),
  ('GEN-DES-010', 'Admin Manager', NULL, true),
  ('GEN-DES-011', 'Admin Officer', NULL, true),
  ('GEN-DES-012', 'Procurement Manager', NULL, true),
  ('GEN-DES-013', 'Procurement Officer', NULL, true),
  ('GEN-DES-014', 'IT Administrator', NULL, true),
  ('GEN-DES-015', 'ERP Administrator', NULL, true),
  ('GEN-DES-016', 'QHSE Manager', NULL, true),
  ('GEN-DES-017', 'HSE Officer', NULL, true),
  ('GEN-DES-018', 'Document Controller', NULL, true),
  ('GEN-DES-019', 'PRO / Government Relations Officer', NULL, true),
  ('GEN-DES-020', 'Business Development Manager', NULL, true),
  ('GEN-DES-021', 'Commercial Manager', NULL, true),
  ('GEN-DES-022', 'Estimation Engineer', NULL, true),
  ('GEN-DES-023', 'Office Assistant', NULL, true),
  ('GEN-DES-024', 'Driver', NULL, true),
  ('GEN-DES-025', 'Storekeeper', NULL, true)
ON CONFLICT (designation_code) DO NOTHING;

-- 2. ALGT Specific Designations (owner_company_id = 1)
INSERT INTO public.designations (designation_code, designation_name_en, owner_company_id, is_active)
VALUES
  ('ALGT-DES-001', 'Transport Manager', 1, true),
  ('ALGT-DES-002', 'Fleet Manager', 1, true),
  ('ALGT-DES-003', 'Workshop Manager', 1, true),
  ('ALGT-DES-004', 'Project Manager', 1, true),
  ('ALGT-DES-005', 'Site Manager', 1, true),
  ('ALGT-DES-006', 'Site Engineer', 1, true),
  ('ALGT-DES-007', 'Site Supervisor', 1, true),
  ('ALGT-DES-008', 'Transport Coordinator', 1, true),
  ('ALGT-DES-009', 'Dispatcher', 1, true),
  ('ALGT-DES-010', 'Logistics Coordinator', 1, true),
  ('ALGT-DES-011', 'Fleet Coordinator', 1, true),
  ('ALGT-DES-012', 'Maintenance Planner', 1, true),
  ('ALGT-DES-013', 'Workshop Supervisor', 1, true),
  ('ALGT-DES-014', 'Heavy Equipment Mechanic', 1, true),
  ('ALGT-DES-015', 'Truck Mechanic', 1, true),
  ('ALGT-DES-016', 'Hydraulic Mechanic', 1, true),
  ('ALGT-DES-017', 'Electrician', 1, true),
  ('ALGT-DES-018', 'Welder / Fabricator', 1, true),
  ('ALGT-DES-019', 'Tire Technician', 1, true),
  ('ALGT-DES-020', 'Excavator Operator', 1, true),
  ('ALGT-DES-021', 'Wheel Loader Operator', 1, true),
  ('ALGT-DES-022', 'Dozer Operator', 1, true),
  ('ALGT-DES-023', 'Crane Operator', 1, true),
  ('ALGT-DES-024', 'Lowbed Driver', 1, true),
  ('ALGT-DES-025', 'Trailer Driver', 1, true),
  ('ALGT-DES-026', 'Tipper Driver', 1, true),
  ('ALGT-DES-027', 'Bus Driver', 1, true),
  ('ALGT-DES-028', 'Pickup Driver', 1, true),
  ('ALGT-DES-029', 'Rigger', 1, true),
  ('ALGT-DES-030', 'Banksman', 1, true),
  ('ALGT-DES-031', 'Weighbridge Operator', 1, true),
  ('ALGT-DES-032', 'Yard Supervisor', 1, true),
  ('ALGT-DES-033', 'CICPA Coordinator', 1, true),
  ('ALGT-DES-034', 'Permit Coordinator', 1, true),
  ('ALGT-DES-035', 'Timekeeper', 1, true)
ON CONFLICT (designation_code) DO NOTHING;

-- 3. ALS Specific Designations (owner_company_id = 2)
INSERT INTO public.designations (designation_code, designation_name_en, owner_company_id, is_active)
VALUES
  ('ALS-DES-001', 'Scrap Operations Manager', 2, true),
  ('ALS-DES-002', 'Yard Manager', 2, true),
  ('ALS-DES-003', 'Scrap Trading Manager', 2, true),
  ('ALS-DES-004', 'Sales Executive', 2, true),
  ('ALS-DES-005', 'Buyer / Scrap Purchaser', 2, true),
  ('ALS-DES-006', 'Material Inspector', 2, true),
  ('ALS-DES-007', 'Material Grader', 2, true),
  ('ALS-DES-008', 'Yard Supervisor', 2, true),
  ('ALS-DES-009', 'Loading Supervisor', 2, true),
  ('ALS-DES-010', 'Weighbridge Operator', 2, true),
  ('ALS-DES-011', 'Dispatch Coordinator', 2, true),
  ('ALS-DES-012', 'Permit & Disposal Coordinator', 2, true),
  ('ALS-DES-013', 'Environmental Compliance Officer', 2, true),
  ('ALS-DES-014', 'HSE Officer', 2, true),
  ('ALS-DES-015', 'Forklift Operator', 2, true),
  ('ALS-DES-016', 'Excavator Operator', 2, true),
  ('ALS-DES-017', 'Wheel Loader Operator', 2, true),
  ('ALS-DES-018', 'Grappler Operator', 2, true),
  ('ALS-DES-019', 'Cutting Supervisor', 2, true),
  ('ALS-DES-020', 'Gas Cutter', 2, true),
  ('ALS-DES-021', 'Plasma Cutter', 2, true),
  ('ALS-DES-022', 'General Helper', 2, true),
  ('ALS-DES-023', 'Sorting Worker', 2, true),
  ('ALS-DES-024', 'Storekeeper', 2, true),
  ('ALS-DES-025', 'Truck Driver', 2, true),
  ('ALS-DES-026', 'Trailer Driver', 2, true),
  ('ALS-DES-027', 'Yard Clerk', 2, true),
  ('ALS-DES-028', 'Document Controller', 2, true)
ON CONFLICT (designation_code) DO NOTHING;
```

---

## 14. Rollback / Safety Plan
```sql
DELETE FROM public.designations
WHERE designation_code LIKE 'GEN-DES-%'
   OR designation_code LIKE 'ALGT-DES-%'
   OR designation_code LIKE 'ALS-DES-%';
```

---

## 15. Blockers or Open Questions
- None.

---

## 16. Final Recommendation
State: **SAFE TO SEED**
The database and schema are fully ready to support the designation seeds.
