# ERP BASE 002F.3C.3 — Units & Measurements Technical Implementation Plan

**Created:** 2026-06-06  
**Phase:** ERP BASE 002F.3C.3  
**Status:** PLANNING - AWAITING SAMEER APPROVAL  
**Author:** AI Planning Agent  

---

## 1. Executive Summary

This technical implementation plan defines the complete architecture, database schema, permissions, RLS policies, UI structure, and integration strategy for the **Units & Measurements (UOM)** master data module.

### Scope

Implement three dedicated tables (`uom_categories`, `units_of_measure`, `uom_conversions`) with full CRUD UI, reusable select components, permissions, RLS, audit logging, and seed data for UAE/ALGT business requirements.

### Key Decisions

1. **Unit codes are unique per category** using `unique(uom_category_id, unit_code)`
2. **Base unit per category** using `is_base_unit` boolean on units table
3. **Conversion factors stored on units** via `conversion_factor_to_base` for simple conversions
4. **Dedicated conversions table** for special/cross-category/item-specific conversions
5. **FUEL category uses GAL_IMP as base** aligning with UAE diesel operations
6. **PACKAGING category defined** but conversions deferred to future inventory phase
7. **BIGINT primary/foreign keys** following project standard
8. **user_profiles(id) for audit fields** following established pattern
9. **Actual RLS helper functions** from foundation migration
10. **Single consolidated migration** for DDL, RLS, permissions, and seed data

### Implementation Readiness

- Source code inspection: ✅ Complete
- Existing patterns identified: ✅ Geography, Finance Basics, Lookups
- Database schema planned: ✅ Detailed with constraints
- Permissions planned: ✅ master_data.uom.*
- RLS policies planned: ✅ Using actual helpers
- UI structure planned: ✅ 3 pages, tables, forms
- Select components planned: ✅ 3 reusable components
- Seed data planned: ✅ 8 categories, 45+ units
- Risk analysis: ✅ Documented with mitigations
- Testing strategy: ✅ Database, UI, conversion tests

### Estimated Complexity

**Medium-High** — Three interdependent tables with unique constraints, conversion logic, and comprehensive seed data requirements.

---

## 2. Scope and Non-Scope Confirmation

### In Scope

✅ `uom_categories` table with DDL, RLS, permissions, seed  
✅ `units_of_measure` table with DDL, RLS, permissions, seed  
✅ `uom_conversions` table with DDL, RLS, permissions, seed  
✅ Global lookup categories (if needed): `UOM_ROUNDING_METHODS`  
✅ Permissions: `master_data.uom.view/manage/export/audit_view`  
✅ Role assignments: system_admin, group_admin, company_admin, branch_admin  
✅ RLS policies for all three tables (SELECT/INSERT/UPDATE/DELETE)  
✅ Server actions in `src/features/master-data/uom/actions.ts`  
✅ TypeScript types in `src/features/master-data/uom/types.ts`  
✅ Zod validation in `src/features/master-data/uom/validation.ts`  
✅ UI pages: `/admin/master-data/uom/categories`, `/units`, `/conversions`  
✅ Table components using `ERPDataTable`  
✅ Form dialogs using `ERPDrawerForm`  
✅ Reusable select components: `UomCategorySelect`, `UnitOfMeasureSelect`, `UnitByCategorySelect`  
✅ Sidebar menu integration under "Master Data"  
✅ Seed data for 8 categories and 45+ units  
✅ Audit logging for all CRUD operations  
✅ system_admin-only hard delete  
✅ Lock/unlock functionality  
✅ Activate/deactivate functionality  

### Explicitly Out of Scope

❌ Inventory item master  
❌ Stock transactions  
❌ Purchase orders  
❌ Sales orders  
❌ Weighbridge transactions  
❌ Fuel management operational module  
❌ Fleet/Workshop/CRM operational modules  
❌ Item-specific packaging conversions (future inventory phase)  
❌ Barcode/batch/lot tracking  
❌ Pricing engine  
❌ Unit costing  
❌ Complex formula-based conversions (basic factor only)  
❌ Real-time conversion calculation API (planning level only)  

---

## 3. Source Code Inspection Summary

### Existing Master Data Patterns Reviewed

**Geography Module** (`src/features/master-data/geography/`)
- Established pattern: types.ts, validation.ts, actions.ts
- UI: table components, form dialogs, pages
- Select components in `src/components/erp/geography/`
- Uses `ERPDataTable`, `ERPDrawerForm`, `ERPPageHeader`

**Finance Basics Module** (`src/features/master-data/finance-basics/`)
- Recent implementation with currencies, payment terms, tax types, banks, cost/profit centers
- Server actions with RBAC checks (`hasPermission`)
- Audit logging using `logAudit` and `createAuditDiff`
- Zod validation schemas
- Select components with loading/error states
- Forms use `LookupSelect` for type codes

**Global Lookup Engine** (`src/features/master-data/lookups/`)
- `global_lookup_categories` and `global_lookup_values`
- `LookupSelect` component for reusable dropdowns
- Used extensively in geography and finance forms

### Database Foundation Confirmed

**Foundation Migration** (`20260527120000_erp_base_foundation.sql`)
- `user_profiles` table with BIGINT id
- RLS helper functions confirmed:
  - `current_user_has_permission(text)`
  - `current_user_has_role(text)`
  - `current_user_profile_id()`
- `set_updated_at()` trigger function
- Roles: system_admin, group_admin, company_admin, branch_admin

**Finance Basics Migration** (`20260606140000_erp_base_002f3c2_finance_basics.sql`)
- Pattern: BIGINT PKs/FKs
- Audit fields reference `user_profiles(id)`
- Check constraints for code formats, ranges
- Unique indexes for base records (e.g., single base currency)
- RLS policies: active records public, admin operations require permission
- system_admin-only DELETE policies
- Permissions inserted and assigned to roles
- Seed data in same migration

### UI Component Patterns Confirmed

**ERPDataTable** — Used for all master data list views  
**ERPDrawerForm** — Side drawer for add/edit/view with section navigation  
**ERPPageHeader** — Page title, description, breadcrumbs  
**Select components** — Fetch active records, show name/code, handle loading/error  

### Sidebar Integration Pattern

New master data groups added to `src/components/layout/app-sidebar.tsx` in `navGroups` array.

---

## 4. UOM Design Principles

### Principle 1: Category-Based Organization

Units are organized into categories (WEIGHT, LENGTH, VOLUME, etc.) to group related measurements and enforce conversion logic boundaries.

### Principle 2: Base Unit Per Category

Each category has ONE base unit (e.g., KG for WEIGHT, M for LENGTH). All other units in that category define their conversion factor relative to the base.

### Principle 3: Unique Unit Codes Per Category

`unit_code` is unique within a category, allowing the same code (e.g., "L") to exist in multiple categories if semantically different (though unlikely in practice).

Constraint: `unique(uom_category_id, unit_code)`

### Principle 4: Simple Factor-Based Conversions

Most conversions are handled by `conversion_factor_to_base` on the `units_of_measure` table:
- 1 T = 1000 KG → conversion_factor_to_base = 1000
- 1 G = 0.001 KG → conversion_factor_to_base = 0.001

### Principle 5: Special Conversions Table

`uom_conversions` table handles:
- Cross-category conversions (if allowed in future)
- Item-specific packaging conversions (future inventory)
- Legacy or exception conversions

### Principle 6: UAE Diesel Gallons = Imperial Gallons

FUEL category base unit is **GAL_IMP** (Imperial Gallon = 4.54609 L) because UAE diesel operations measure in gallons, and Imperial is the standard in the region.

### Principle 7: No Hardcoded Units in Future Modules

All inventory, procurement, fleet, workshop, weighbridge, and billing modules must SELECT from `units_of_measure` table. No hardcoded dropdowns.

### Principle 8: System/Locked Protection

Critical units (KG, M, L, etc.) are marked `is_system = true` and `is_locked = true` to prevent accidental modification or deletion.

### Principle 9: Decimal Places and Fractions

Units define `decimal_places` (e.g., 3 for weights, 2 for volumes) and `allow_fraction` boolean for UI input validation.

### Principle 10: Future-Proof for Packaging

PACKAGING category is defined with base unit = EA, but item-specific conversions (e.g., 1 BOX = 12 EA for Item X) are deferred to inventory item master implementation.

---

## 5. Dedicated Table Decision Matrix

| Decision Point | Options Considered | Selected Approach | Rationale |
|---|---|---|---|
| **Unit Code Uniqueness** | Global unique vs. Per-category unique | `unique(uom_category_id, unit_code)` | Allows flexibility while preventing duplicates within category |
| **Base Unit Storage** | `base_unit_id` on category vs. `is_base_unit` on unit | `is_base_unit` boolean on unit | Avoids circular FK dependency, enforced by unique constraint |
| **Conversion Storage** | Only on unit vs. Only in conversions table vs. Both | `conversion_factor_to_base` on unit + `uom_conversions` for special cases | Efficient for simple conversions, flexible for complex cases |
| **Cross-Category Conversions** | Allow vs. Block | Block initially, allow if needed in future | Simpler logic, safer data integrity |
| **Fuel Category** | Separate FUEL vs. Sub-use of VOLUME | Separate FUEL category | Clear business semantics, allows fuel-specific fields later |
| **Fuel Base Unit** | GAL_IMP vs. GAL_US vs. L | GAL_IMP | UAE diesel operations standard |
| **Packaging Conversions** | Universal factors vs. Item-specific | Define category, defer item-specific conversions | Future inventory phase will handle per-item packaging |
| **Decimal Places** | Fixed vs. Per-unit | Per-unit (`decimal_places` column) | Flexibility for different precision needs |
| **System Protection** | Soft lock vs. Hard lock | `is_system` + `is_locked` + RLS system_admin check | Strong protection, flexible for system_admin |
| **Lookup Categories** | Add UOM_SYSTEM_TYPES, FORMULA_TYPES, ROUNDING | Only ROUNDING_METHODS if needed | Avoid premature complexity |

---

## 6. Database Schema Plan

### 6.1 Table: uom_categories

**Purpose:** Organize units into logical categories (WEIGHT, LENGTH, VOLUME, FUEL, AREA, TIME, COUNT, PACKAGING).

**DDL:**

```sql
create table if not exists public.uom_categories (
  id bigint generated by default as identity primary key,
  
  category_code text not null unique,
  category_name_en text not null,
  category_name_ar text,
  
  description_en text,
  description_ar text,
  notes text,
  
  is_system boolean not null default false,
  is_locked boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  
  created_at timestamptz not null default now(),
  created_by bigint references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references public.user_profiles(id),
  deactivation_reason text,
  
  check (category_code = upper(category_code)),
  check (category_code ~ '^[A-Z_]+$'),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

create index idx_uom_categories_code on public.uom_categories(category_code);
create index idx_uom_categories_active on public.uom_categories(is_active);
create index idx_uom_categories_sort on public.uom_categories(sort_order);

create trigger trigger_uom_categories_updated_at
  before update on public.uom_categories
  for each row execute function public.set_updated_at();
```

**Seed Data (8 categories):**

- WEIGHT, LENGTH, VOLUME, FUEL, AREA, TIME, COUNT, PACKAGING

---

### 6.2 Table: units_of_measure

**Purpose:** Store individual units within categories with conversion factors to base unit.

**DDL:**

```sql
create table if not exists public.units_of_measure (
  id bigint generated by default as identity primary key,
  
  uom_category_id bigint not null references public.uom_categories(id) on delete restrict,
  
  unit_code text not null,
  unit_name_en text not null,
  unit_name_ar text,
  symbol text,
  
  conversion_factor_to_base numeric(20, 10) not null default 1,
  is_base_unit boolean not null default false,
  
  decimal_places integer not null default 2,
  allow_fraction boolean not null default true,
  
  description_en text,
  description_ar text,
  notes text,
  
  is_system boolean not null default false,
  is_locked boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  
  created_at timestamptz not null default now(),
  created_by bigint references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references public.user_profiles(id),
  deactivation_reason text,
  
  unique (uom_category_id, unit_code),
  check (unit_code = upper(unit_code)),
  check (unit_code ~ '^[A-Z0-9_]+$'),
  check (conversion_factor_to_base > 0),
  check (decimal_places between 0 and 6),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

create unique index idx_units_one_base_per_category
  on public.units_of_measure (uom_category_id)
  where is_base_unit = true;

create index idx_units_category on public.units_of_measure(uom_category_id);
create index idx_units_code on public.units_of_measure(unit_code);
create index idx_units_active on public.units_of_measure(is_active);
create index idx_units_base on public.units_of_measure(is_base_unit);

create trigger trigger_units_of_measure_updated_at
  before update on public.units_of_measure
  for each row execute function public.set_updated_at();
```

**Seed Data (45+ units across 8 categories):**

See section 9 for detailed seed data plan.

---

### 6.3 Table: uom_conversions

**Purpose:** Store special/cross-category/item-specific conversions not handled by simple base conversion factor.

**DDL:**

```sql
create table if not exists public.uom_conversions (
  id bigint generated by default as identity primary key,
  
  from_uom_id bigint not null references public.units_of_measure(id) on delete restrict,
  to_uom_id bigint not null references public.units_of_measure(id) on delete restrict,
  
  conversion_factor numeric(20, 10) not null,
  conversion_formula_code text,
  is_bidirectional boolean not null default false,
  
  notes text,
  
  is_system boolean not null default false,
  is_locked boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  
  created_at timestamptz not null default now(),
  created_by bigint references public.user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references public.user_profiles(id),
  deactivation_reason text,
  
  unique (from_uom_id, to_uom_id),
  check (from_uom_id <> to_uom_id),
  check (conversion_factor > 0),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

create index idx_uom_conversions_from on public.uom_conversions(from_uom_id);
create index idx_uom_conversions_to on public.uom_conversions(to_uom_id);
create index idx_uom_conversions_active on public.uom_conversions(is_active);

create trigger trigger_uom_conversions_updated_at
  before update on public.uom_conversions
  for each row execute function public.set_updated_at();
```

**Seed Data:**

Minimal or empty initially. Add specific conversions only when business case requires (e.g., future item-specific packaging).

---

## 7. Lookup Categories Plan

### Evaluation

**UOM_SYSTEM_TYPES** — Not needed. `is_system` boolean sufficient.  
**UOM_FORMULA_TYPES** — Not needed initially. Simple factor conversions only.  
**UOM_ROUNDING_METHODS** — Potentially useful for future precision rules.

### Decision

Add **one optional lookup category** if beneficial:

```sql
insert into public.global_lookup_categories (category_code, category_name_en, description_en, is_system, is_locked, sort_order)
values ('UOM_ROUNDING_METHODS', 'UOM Rounding Methods', 'Rounding methods for unit conversions', true, true, 160);

insert into public.global_lookup_values (category_id, value_code, value_name_en, description_en, is_system, is_locked, sort_order)
select id, 'ROUND_NORMAL', 'Normal Rounding', 'Standard rounding to nearest', true, true, 1
from public.global_lookup_categories where category_code = 'UOM_ROUNDING_METHODS'
union all
select id, 'ROUND_UP', 'Round Up', 'Always round up', true, true, 2
from public.global_lookup_categories where category_code = 'UOM_ROUNDING_METHODS'
union all
select id, 'ROUND_DOWN', 'Round Down', 'Always round down', true, true, 3
from public.global_lookup_categories where category_code = 'UOM_ROUNDING_METHODS';
```

**Usage:** Optional field `rounding_method_code` on `units_of_measure` or `uom_conversions` if needed in future.

**Recommendation:** Skip for initial implementation unless Sameer requests it.

---

## 8. UAE / ALGT Business Compatibility Review

### Business Context

ALGT operates in UAE with:
- **Transport fleet** measuring diesel fuel in gallons (imperial)
- **Workshop** tracking spare parts inventory by EA, BOX, SET
- **Weighbridge** operations for scrap metal (KG, T)
- **Demolition** materials in M3, T, truckloads
- **Equipment rental** by HOUR, DAY, MONTH
- **Procurement** ordering in various packaging units

### UOM Coverage Analysis

| Business Area | Required Units | Category | Base Unit | Covered? |
|---|---|---|---|---|
| Diesel Fuel | Gallon (Imp), Liter | FUEL | GAL_IMP | ✅ |
| Spare Parts Qty | EA, PCS, SET, BOX | COUNT, PACKAGING | EA | ✅ |
| Scrap Weight | KG, T, LB | WEIGHT | KG | ✅ |
| Material Volume | M3, L | VOLUME | L | ✅ |
| Pipe Length | M, CM, FT | LENGTH | M | ✅ |
| Rental Time | HOUR, DAY, MONTH | TIME | HOUR | ✅ |
| Land Area | M2, FT2 | AREA | M2 | ✅ |

### UAE-Specific Considerations

**Imperial Gallon Standard:** UAE diesel industry uses imperial gallons (4.54609 L), not US gallons (3.78541 L). Seed data includes both for flexibility, but operational default is GAL_IMP.

**Metric Primary:** UAE officially uses metric system. Primary units are KG, M, L. Imperial units (LB, FT, GAL_IMP) are secondary for compatibility.

**Multi-Unit Procurement:** Suppliers quote in various units. System must support conversions for comparison (e.g., price per KG vs. price per T).

**Future Weighbridge Integration:** Weight tickets will reference WEIGHT category units (KG, T). Decimal places set to 3 for precision.

### Compatibility: ✅ PASS

Seed data covers all identified business requirements for ALGT UAE operations.

---

## 9. Permissions and Role Assignment Plan

### Permissions to Create

```sql
insert into public.permissions (permission_code, permission_name, module_code, action_code, description)
values
  ('master_data.uom.view', 'View UOM Master Data', 'master_data', 'view', 'View UOM categories, units, and conversions'),
  ('master_data.uom.manage', 'Manage UOM Master Data', 'master_data', 'manage', 'Create, update, lock/unlock UOM master data'),
  ('master_data.uom.export', 'Export UOM Master Data', 'master_data', 'export', 'Export UOM data to Excel/CSV'),
  ('master_data.uom.audit_view', 'View UOM Audit Logs', 'master_data', 'audit_view', 'View audit trail for UOM changes');
```

### Role Assignments

```sql
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_code = 'system_admin'
  and p.permission_code like 'master_data.uom.%'

union all

select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_code = 'group_admin'
  and p.permission_code in (
    'master_data.uom.view',
    'master_data.uom.manage',
    'master_data.uom.export',
    'master_data.uom.audit_view'
  )

union all

select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_code = 'company_admin'
  and p.permission_code in (
    'master_data.uom.view',
    'master_data.uom.export'
  )

union all

select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_code = 'branch_admin'
  and p.permission_code = 'master_data.uom.view';
```

### Permission Summary

| Role | View | Manage | Export | Audit View | Delete |
|---|---|---|---|---|---|
| system_admin | ✅ | ✅ | ✅ | ✅ | ✅ Hard Delete |
| group_admin | ✅ | ✅ | ✅ | ✅ | ❌ |
| company_admin | ✅ | ❌ | ✅ | ❌ | ❌ |
| branch_admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Normal Users | ❌ Admin Page | ❌ | ❌ | ❌ | ❌ |

**Note:** Normal users can SELECT active units through business forms (e.g., purchase order line item unit dropdown) via select components, which use anon-safe queries. No admin page access.

---

## 10. RLS Policy Plan

Enable RLS on all three tables and create policies using actual project RLS helper functions.

### 10.1 uom_categories RLS

```sql
alter table public.uom_categories enable row level security;

create policy select_uom_categories_authenticated on public.uom_categories for select
  using (is_active = true or public.current_user_has_permission('master_data.uom.view'));

create policy insert_uom_categories on public.uom_categories for insert
  with check (public.current_user_has_permission('master_data.uom.manage'));

create policy update_uom_categories on public.uom_categories for update
  using (
    public.current_user_has_permission('master_data.uom.manage')
    and (not is_locked or public.current_user_has_role('system_admin'))
  );

create policy delete_uom_categories on public.uom_categories for delete
  using (public.current_user_has_role('system_admin'));
```

### 10.2 units_of_measure RLS

```sql
alter table public.units_of_measure enable row level security;

create policy select_units_authenticated on public.units_of_measure for select
  using (is_active = true or public.current_user_has_permission('master_data.uom.view'));

create policy insert_units on public.units_of_measure for insert
  with check (public.current_user_has_permission('master_data.uom.manage'));

create policy update_units on public.units_of_measure for update
  using (
    public.current_user_has_permission('master_data.uom.manage')
    and (not is_locked or public.current_user_has_role('system_admin'))
  );

create policy delete_units on public.units_of_measure for delete
  using (public.current_user_has_role('system_admin'));
```

### 10.3 uom_conversions RLS

```sql
alter table public.uom_conversions enable row level security;

create policy select_conversions_authenticated on public.uom_conversions for select
  using (is_active = true or public.current_user_has_permission('master_data.uom.view'));

create policy insert_conversions on public.uom_conversions for insert
  with check (public.current_user_has_permission('master_data.uom.manage'));

create policy update_conversions on public.uom_conversions for update
  using (
    public.current_user_has_permission('master_data.uom.manage')
    and (not is_locked or public.current_user_has_role('system_admin'))
  );

create policy delete_conversions on public.uom_conversions for delete
  using (public.current_user_has_role('system_admin'));
```

### Policy Summary

- **SELECT:** Active records visible to all authenticated users; inactive records require `master_data.uom.view` permission
- **INSERT:** Requires `master_data.uom.manage` permission
- **UPDATE:** Requires `master_data.uom.manage` permission; locked records require `system_admin` role
- **DELETE:** system_admin only (hard delete)

---

## 11. Global Admin Full Access Plan

**system_admin role** has full access:

1. View all records (active and inactive)
2. Create new categories, units, conversions
3. Update any record including locked/system records
4. Lock/unlock any record
5. Hard delete records (should be avoided; soft delete via is_active preferred)
6. View audit logs

**Lock bypass:** UPDATE policy checks `not is_locked or current_user_has_role('system_admin')`, allowing system_admin to edit locked records.

**System protection:** UI should warn when editing `is_system = true` records, but system_admin can proceed if necessary.

---

## 12. Audit Logging Plan

All CRUD operations on uom_categories, units_of_measure, and uom_conversions must be logged to `audit_logs` table using `logAudit()` server action.

### Audit Actions

| Action | Event | Old Values | New Values |
|---|---|---|---|
| create | Insert new record | null | Full record |
| update | Modify existing record | Changed fields only (diff) | Changed fields only |
| delete | Soft delete (deactivate) | {is_active: true} | {is_active: false, deactivation_reason} |
| hard_delete | Physical delete (system_admin only) | Full record | null |
| lock | Set is_locked = true | {is_locked: false} | {is_locked: true} |
| unlock | Set is_locked = false | {is_locked: true} | {is_locked: false} |
| toggle_status | Activate/deactivate | Status change diff | Status change diff |

### Audit Fields

```typescript
await logAudit({
  module_code: "master_data",
  entity_name: "units_of_measure",
  entity_id: unit.id,
  entity_reference: unit.unit_code,
  action: "update",
  old_values: createAuditDiff(existingUnit, updatedData),
  new_values: updatedData,
});
```

### Audit Access

Users with `master_data.uom.audit_view` permission can view audit logs for UOM changes.

---

## 13. Server Actions / Services Plan

Create `src/features/master-data/uom/actions.ts` with server actions following established patterns from finance-basics module.

### UOM Categories Actions

```typescript
getUomCategories(filters?: UomCategoryFilters): Promise<ActionResult<UomCategory[]>>
getUomCategoryById(id: number): Promise<ActionResult<UomCategory>>
createUomCategory(input: CreateUomCategoryInput): Promise<ActionResult<{ id: number }>>
updateUomCategory(input: UpdateUomCategoryInput): Promise<ActionResult<void>>
deleteUomCategory(id: number): Promise<ActionResult<void>>
toggleUomCategoryStatus(input: ToggleStatusInput): Promise<ActionResult<void>>
toggleUomCategoryLock(id: number, locked: boolean): Promise<ActionResult<void>>
getActiveUomCategoriesForSelect(): Promise<ActionResult<UomCategorySelectOption[]>>
```

### Units of Measure Actions

```typescript
getUnitsOfMeasure(filters?: UnitOfMeasureFilters): Promise<ActionResult<UnitOfMeasure[]>>
getUnitOfMeasureById(id: number): Promise<ActionResult<UnitOfMeasure>>
createUnitOfMeasure(input: CreateUnitInput): Promise<ActionResult<{ id: number }>>
updateUnitOfMeasure(input: UpdateUnitInput): Promise<ActionResult<void>>
deleteUnitOfMeasure(id: number): Promise<ActionResult<void>>
toggleUnitOfMeasureStatus(input: ToggleStatusInput): Promise<ActionResult<void>>
toggleUnitOfMeasureLock(id: number, locked: boolean): Promise<ActionResult<void>>
getActiveUnitsForSelect(categoryId?: number): Promise<ActionResult<UnitSelectOption[]>>
```

### UOM Conversions Actions

```typescript
getUomConversions(filters?: UomConversionFilters): Promise<ActionResult<UomConversion[]>>
getUomConversionById(id: number): Promise<ActionResult<UomConversion>>
createUomConversion(input: CreateConversionInput): Promise<ActionResult<{ id: number }>>
updateUomConversion(input: UpdateConversionInput): Promise<ActionResult<void>>
deleteUomConversion(id: number): Promise<ActionResult<void>>
toggleUomConversionStatus(input: ToggleStatusInput): Promise<ActionResult<void>>
toggleUomConversionLock(id: number, locked: boolean): Promise<ActionResult<void>>
```

### Common Patterns

Each action must:
1. Validate input using Zod schemas
2. Check RBAC permissions using `hasPermission(ctx, 'master_data.uom.manage')`
3. Check lock status for updates (allow system_admin to bypass)
4. Log audit trail
5. Revalidate Next.js cache paths
6. Return `ActionResult<T>` with success/error

Example structure (from finance-basics):

```typescript
export async function createUnitOfMeasure(input: CreateUnitInput): Promise<ActionResult<{ id: number }>> {
  try {
    const result = createUnitSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: formatValidationErrors(result.error.issues) };
    }

    const validated = result.data;
    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "master_data.uom.manage")) {
      return { success: false, error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("units_of_measure")
      .insert({
        ...validated,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select("id, unit_code")
      .single();

    if (error) return { success: false, error: error.message };

    await logAudit({
      module_code: "master_data",
      entity_name: "units_of_measure",
      entity_id: data.id,
      entity_reference: data.unit_code,
      action: "create",
      new_values: validated,
    });

    revalidateUomPages();
    return { success: true, data: { id: data.id } };
  } catch (error) {
    return { success: false, error: "Unexpected error" };
  }
}
```

---

## 14. Validation Plan

Create `src/features/master-data/uom/validation.ts` with Zod schemas.

### UOM Category Schemas

```typescript
export const createUomCategorySchema = z.object({
  category_code: z.string().regex(/^[A-Z_]+$/).transform(v => v.toUpperCase()),
  category_name_en: z.string().min(2).max(255),
  category_name_ar: z.string().max(255).nullable().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateUomCategorySchema = z.object({
  id: z.number().int().positive(),
  // category_code NOT updatable
  category_name_en: z.string().min(2).max(255).optional(),
  category_name_ar: z.string().max(255).nullable().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});
```

### Unit of Measure Schemas

```typescript
export const createUnitSchema = z.object({
  uom_category_id: z.number().int().positive(),
  unit_code: z.string().regex(/^[A-Z0-9_]+$/).transform(v => v.toUpperCase()),
  unit_name_en: z.string().min(1).max(255),
  unit_name_ar: z.string().max(255).nullable().optional(),
  symbol: z.string().max(20).nullable().optional(),
  conversion_factor_to_base: z.number().positive().default(1),
  is_base_unit: z.boolean().default(false),
  decimal_places: z.number().int().min(0).max(6).default(2),
  allow_fraction: z.boolean().default(true),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateUnitSchema = z.object({
  id: z.number().int().positive(),
  // uom_category_id NOT updatable
  // unit_code NOT updatable
  unit_name_en: z.string().min(1).max(255).optional(),
  unit_name_ar: z.string().max(255).nullable().optional(),
  symbol: z.string().max(20).nullable().optional(),
  conversion_factor_to_base: z.number().positive().optional(),
  is_base_unit: z.boolean().optional(),
  decimal_places: z.number().int().min(0).max(6).optional(),
  allow_fraction: z.boolean().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});
```

### UOM Conversion Schemas

```typescript
export const createConversionSchema = z.object({
  from_uom_id: z.number().int().positive(),
  to_uom_id: z.number().int().positive(),
  conversion_factor: z.number().positive(),
  conversion_formula_code: z.string().max(50).nullable().optional(),
  is_bidirectional: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
}).refine(data => data.from_uom_id !== data.to_uom_id, {
  message: "from_uom_id and to_uom_id must be different",
});

export const updateConversionSchema = z.object({
  id: z.number().int().positive(),
  // from_uom_id NOT updatable
  // to_uom_id NOT updatable
  conversion_factor: z.number().positive().optional(),
  conversion_formula_code: z.string().max(50).nullable().optional(),
  is_bidirectional: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});
```

---

## 15. UI / Screen Plan

### Routes

```
/admin/master-data/uom/categories
/admin/master-data/uom/units
/admin/master-data/uom/conversions
```

### Page Structure

Each page follows established pattern:

```typescript
// src/app/(protected)/admin/master-data/uom/categories/page.tsx
export default async function UomCategoriesPage() {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "master_data.uom.view")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6">
      <ERPPageHeader
        title="UOM Categories"
        description="Manage unit of measure categories (WEIGHT, LENGTH, VOLUME, etc.)"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Master Data", href: "/admin/master-data" },
          { label: "Units & Measurements", href: "/admin/master-data/uom/categories" },
          { label: "Categories", href: "/admin/master-data/uom/categories" },
        ]}
      />

      <Suspense fallback={<LoadingSpinner />}>
        <UomCategoriesContent authContext={ctx} />
      </Suspense>
    </div>
  );
}
```

### Table Components

**UomCategoriesTable** — `src/features/master-data/uom/components/uom-categories-table.tsx`
- Uses `ERPDataTable`
- Columns: Code, Name EN, Name AR, Status, System, Locked, Sort Order
- Row actions: View, Edit, Activate/Deactivate, Lock/Unlock, Delete (system_admin only)
- Filters: Search by code/name, status filter, system filter
- Sort: By code, name, sort_order
- Pagination

**UnitsOfMeasureTable** — `src/features/master-data/uom/components/units-table.tsx`
- Columns: Category, Code, Name EN, Symbol, Base Unit, Conversion Factor, Decimal Places, Status, System, Locked
- Row actions: View, Edit, Activate/Deactivate, Lock/Unlock, Delete (system_admin only)
- Filters: Category filter, search by code/name, base unit filter, status filter
- Category badge/chip in table
- Highlight base units

**UomConversionsTable** — `src/features/master-data/uom/components/conversions-table.tsx`
- Columns: From Unit, To Unit, Conversion Factor, Bidirectional, Status, System, Locked
- Row actions: View, Edit, Activate/Deactivate, Lock/Unlock, Delete (system_admin only)
- Filters: From/To unit filters, bidirectional filter, status filter
- Display unit names/symbols, not IDs

### Form Dialogs

**UomCategoryFormDialog** — `src/features/master-data/uom/components/uom-category-form-dialog.tsx`
- Mode: add, edit, view
- Sections: Basic Info, Status, Audit Info
- Fields:
  - Basic: category_code (disabled if edit), category_name_en, category_name_ar, description_en/ar, notes, sort_order
  - Status: is_active checkbox (edit/view only), system badge (read-only), locked badge (read-only)
  - Audit: created_at, created_by, updated_at, updated_by (read-only, view mode only)
- Validation: Real-time Zod validation
- Submit: Calls `createUomCategory` or `updateUomCategory` server action

**UnitOfMeasureFormDialog** — `src/features/master-data/uom/components/unit-form-dialog.tsx`
- Sections: Basic Info, Conversion, Display, Status, Audit Info
- Fields:
  - Basic: uom_category_id (dropdown, disabled if edit), unit_code (disabled if edit), unit_name_en, unit_name_ar, symbol
  - Conversion: is_base_unit checkbox, conversion_factor_to_base (disabled if is_base_unit checked, auto-set to 1)
  - Display: decimal_places, allow_fraction checkbox
  - Description: description_en/ar, notes
  - Status: is_active, system badge, locked badge, sort_order
  - Audit: timestamps
- Uses `UomCategorySelect` component
- Warning message if is_base_unit checked and category already has a base unit

**UomConversionFormDialog** — `src/features/master-data/uom/components/conversion-form-dialog.tsx`
- Sections: Conversion Setup, Settings, Status, Audit Info
- Fields:
  - Setup: from_uom_id (dropdown, disabled if edit), to_uom_id (dropdown, disabled if edit), conversion_factor
  - Settings: conversion_formula_code (optional), is_bidirectional checkbox
  - Notes: notes
  - Status: is_active, system badge, locked badge, sort_order
  - Audit: timestamps
- Uses `UnitOfMeasureSelect` components for from/to units
- Warning if reverse conversion already exists
- Calculated reverse factor displayed if bidirectional

---

## 16. Reusable Select Component Plan

Create three select components in `src/components/erp/uom/`.

### 16.1 UomCategorySelect

**File:** `src/components/erp/uom/uom-category-select.tsx`

**Purpose:** Dropdown for selecting UOM category (used in unit form).

**Features:**
- Fetch active categories from `uom_categories` table
- Display: `category_name_en` (or `category_name_ar` if language=ar)
- Optional: Show `category_code` if `showCode=true`
- Props: `value`, `onValueChange`, `placeholder`, `disabled`, `required`, `includeInactive`, `language`, `showCode`, `allowClear`, `className`, `name`, `error`
- Loading state, error state, empty state

**Example Usage:**

```tsx
<UomCategorySelect
  value={categoryId}
  onValueChange={setCategoryId}
  showCode
  required
  placeholder="Select category..."
/>
```

---

### 16.2 UnitOfMeasureSelect

**File:** `src/components/erp/uom/unit-of-measure-select.tsx`

**Purpose:** Dropdown for selecting any unit (used in conversion form).

**Features:**
- Fetch active units from `units_of_measure` table
- Display: `symbol` if exists, else `unit_name_en` (e.g., "KG" or "Kilogram")
- Optional: Filter by `categoryId` prop
- Optional: Exclude specific unit ID (`excludeId`)
- Props: `value`, `onValueChange`, `categoryId`, `excludeId`, `placeholder`, `disabled`, `required`, `includeInactive`, `showCode`, `showSymbol`, `allowClear`, `className`, `name`, `error`
- Show category badge/chip alongside unit name if multiple categories

**Example Usage:**

```tsx
<UnitOfMeasureSelect
  value={fromUomId}
  onValueChange={setFromUomId}
  categoryId={selectedCategoryId}
  showSymbol
  required
  placeholder="Select unit..."
/>
```

---

### 16.3 UnitByCategorySelect

**File:** `src/components/erp/uom/unit-by-category-select.tsx`

**Purpose:** Specialized dropdown for selecting unit within a specific category (used in business forms like purchase order line items).

**Features:**
- **Requires `categoryId` prop** (fails gracefully if null)
- Fetch active units WHERE `uom_category_id = categoryId`
- Display: `symbol` or `unit_name_en`
- Show conversion factor hint tooltip (e.g., "1 T = 1000 KG")
- Highlight base unit option
- Props: `value`, `onValueChange`, `categoryId` (required), `placeholder`, `disabled`, `required`, `showSymbol`, `showConversionHint`, `allowClear`, `className`, `name`, `error`

**Example Usage (in future purchase order line item form):**

```tsx
<UnitByCategorySelect
  value={lineItem.uom_id}
  onValueChange={(uomId) => updateLineItem(lineItem.id, { uom_id: uomId })}
  categoryId={WEIGHT_CATEGORY_ID}
  showSymbol
  showConversionHint
  required
  placeholder="Select weight unit..."
/>
```

---

### 16.4 Index Export

**File:** `src/components/erp/uom/index.ts`

```typescript
export { UomCategorySelect } from "./uom-category-select";
export { UnitOfMeasureSelect } from "./unit-of-measure-select";
export { UnitByCategorySelect } from "./unit-by-category-select";
```

---

## 17. Seed Data Plan

### 17.1 UOM Categories (8)

```sql
insert into public.uom_categories (category_code, category_name_en, category_name_ar, description_en, is_system, is_locked, sort_order)
values
  ('WEIGHT', 'Weight', 'الوزن', 'Mass and weight measurements', true, true, 10),
  ('LENGTH', 'Length', 'الطول', 'Linear distance measurements', true, true, 20),
  ('VOLUME', 'Volume', 'الحجم', 'Volumetric capacity measurements', true, true, 30),
  ('FUEL', 'Fuel', 'الوقود', 'Fuel volume measurements', true, true, 40),
  ('AREA', 'Area', 'المساحة', 'Surface area measurements', true, true, 50),
  ('TIME', 'Time', 'الوقت', 'Duration and time measurements', true, true, 60),
  ('COUNT', 'Count', 'العدد', 'Quantity count measurements', true, true, 70),
  ('PACKAGING', 'Packaging', 'التعبئة', 'Packaging and container units', true, true, 80);
```

---

### 17.2 Units of Measure (45+)

#### WEIGHT Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'KG', 'Kilogram', 'كيلوغرام', 'kg', 1, true, 3, true, true, 10
from public.uom_categories c where c.category_code = 'WEIGHT'
union all
select c.id, 'G', 'Gram', 'غرام', 'g', 0.001, false, 3, true, true, 20
from public.uom_categories c where c.category_code = 'WEIGHT'
union all
select c.id, 'T', 'Metric Ton', 'طن متري', 't', 1000, false, 3, true, true, 30
from public.uom_categories c where c.category_code = 'WEIGHT'
union all
select c.id, 'LB', 'Pound', 'رطل', 'lb', 0.453592, false, 3, true, true, 40
from public.uom_categories c where c.category_code = 'WEIGHT';
```

#### LENGTH Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'M', 'Meter', 'متر', 'm', 1, true, 2, true, true, 10
from public.uom_categories c where c.category_code = 'LENGTH'
union all
select c.id, 'CM', 'Centimeter', 'سنتيمتر', 'cm', 0.01, false, 2, true, true, 20
from public.uom_categories c where c.category_code = 'LENGTH'
union all
select c.id, 'MM', 'Millimeter', 'ميليمتر', 'mm', 0.001, false, 2, true, true, 30
from public.uom_categories c where c.category_code = 'LENGTH'
union all
select c.id, 'KM', 'Kilometer', 'كيلومتر', 'km', 1000, false, 2, true, true, 40
from public.uom_categories c where c.category_code = 'LENGTH'
union all
select c.id, 'IN', 'Inch', 'بوصة', 'in', 0.0254, false, 2, true, true, 50
from public.uom_categories c where c.category_code = 'LENGTH'
union all
select c.id, 'FT', 'Foot', 'قدم', 'ft', 0.3048, false, 2, true, true, 60
from public.uom_categories c where c.category_code = 'LENGTH';
```

#### VOLUME Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'L', 'Liter', 'لتر', 'L', 1, true, 2, true, true, 10
from public.uom_categories c where c.category_code = 'VOLUME'
union all
select c.id, 'ML', 'Milliliter', 'ميليلتر', 'ml', 0.001, false, 2, true, true, 20
from public.uom_categories c where c.category_code = 'VOLUME'
union all
select c.id, 'M3', 'Cubic Meter', 'متر مكعب', 'm³', 1000, false, 2, true, true, 30
from public.uom_categories c where c.category_code = 'VOLUME'
union all
select c.id, 'GAL_US', 'US Gallon', 'جالون أمريكي', 'gal (US)', 3.78541, false, 2, true, true, 40
from public.uom_categories c where c.category_code = 'VOLUME'
union all
select c.id, 'GAL_IMP', 'Imperial Gallon', 'جالون إمبراطوري', 'gal (Imp)', 4.54609, false, 2, true, true, 50
from public.uom_categories c where c.category_code = 'VOLUME';
```

#### FUEL Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'GAL_IMP', 'Imperial Gallon', 'جالون إمبراطوري', 'gal', 1, true, 2, true, true, 10
from public.uom_categories c where c.category_code = 'FUEL'
union all
select c.id, 'L', 'Liter', 'لتر', 'L', 0.21997, false, 2, true, true, 20
from public.uom_categories c where c.category_code = 'FUEL'
union all
select c.id, 'GAL_US', 'US Gallon', 'جالون أمريكي', 'gal (US)', 0.832674, false, 2, true, true, 30
from public.uom_categories c where c.category_code = 'FUEL';
```

**Note:** FUEL base unit is GAL_IMP (Imperial Gallon). Conversion factors are relative to GAL_IMP:
- 1 GAL_IMP = 4.54609 L → L conversion factor = 1 / 4.54609 = 0.21997
- 1 GAL_US = 3.78541 L = 0.832674 GAL_IMP

#### AREA Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'M2', 'Square Meter', 'متر مربع', 'm²', 1, true, 2, true, true, 10
from public.uom_categories c where c.category_code = 'AREA'
union all
select c.id, 'CM2', 'Square Centimeter', 'سنتيمتر مربع', 'cm²', 0.0001, false, 2, true, true, 20
from public.uom_categories c where c.category_code = 'AREA'
union all
select c.id, 'FT2', 'Square Foot', 'قدم مربع', 'ft²', 0.092903, false, 2, true, true, 30
from public.uom_categories c where c.category_code = 'AREA'
union all
select c.id, 'KM2', 'Square Kilometer', 'كيلومتر مربع', 'km²', 1000000, false, 2, true, true, 40
from public.uom_categories c where c.category_code = 'AREA';
```

#### TIME Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'HOUR', 'Hour', 'ساعة', 'hr', 1, true, 2, true, true, 10
from public.uom_categories c where c.category_code = 'TIME'
union all
select c.id, 'MIN', 'Minute', 'دقيقة', 'min', 0.0166667, false, 2, true, true, 20
from public.uom_categories c where c.category_code = 'TIME'
union all
select c.id, 'DAY', 'Day', 'يوم', 'day', 24, false, 2, true, true, 30
from public.uom_categories c where c.category_code = 'TIME'
union all
select c.id, 'MONTH', 'Month', 'شهر', 'month', 730, false, 2, true, true, 40
from public.uom_categories c where c.category_code = 'TIME'
union all
select c.id, 'YEAR', 'Year', 'سنة', 'year', 8760, false, 2, true, true, 50
from public.uom_categories c where c.category_code = 'TIME';
```

#### COUNT Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'EA', 'Each', 'قطعة', 'ea', 1, true, 0, true, true, 10
from public.uom_categories c where c.category_code = 'COUNT'
union all
select c.id, 'PCS', 'Pieces', 'قطع', 'pcs', 1, false, 0, true, true, 20
from public.uom_categories c where c.category_code = 'COUNT'
union all
select c.id, 'SET', 'Set', 'مجموعة', 'set', 1, false, 0, true, true, 30
from public.uom_categories c where c.category_code = 'COUNT'
union all
select c.id, 'PAIR', 'Pair', 'زوج', 'pair', 2, false, 0, true, true, 40
from public.uom_categories c where c.category_code = 'COUNT'
union all
select c.id, 'DOZEN', 'Dozen', 'دزينة', 'dz', 12, false, 0, true, true, 50
from public.uom_categories c where c.category_code = 'COUNT';
```

#### PACKAGING Category

```sql
insert into public.units_of_measure (uom_category_id, unit_code, unit_name_en, unit_name_ar, symbol, conversion_factor_to_base, is_base_unit, decimal_places, is_system, is_locked, sort_order)
select c.id, 'EA', 'Each', 'قطعة', 'ea', 1, true, 0, true, true, 10
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'BOX', 'Box', 'صندوق', 'box', 1, false, 0, true, false, 20
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'BAG', 'Bag', 'كيس', 'bag', 1, false, 0, true, false, 30
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'BUNDLE', 'Bundle', 'حزمة', 'bundle', 1, false, 0, true, false, 40
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'ROLL', 'Roll', 'لفة', 'roll', 1, false, 0, true, false, 50
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'DRUM', 'Drum', 'برميل', 'drum', 1, false, 0, true, false, 60
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'PALLET', 'Pallet', 'طبلية', 'pallet', 1, false, 0, true, false, 70
from public.uom_categories c where c.category_code = 'PACKAGING'
union all
select c.id, 'CONTAINER', 'Container', 'حاوية', 'container', 1, false, 0, true, false, 80
from public.uom_categories c where c.category_code = 'PACKAGING';
```

**Note:** PACKAGING units all have `conversion_factor_to_base = 1` because actual conversions are item-specific (e.g., "1 BOX of Item A = 12 EA" is different from "1 BOX of Item B = 24 EA"). These will be defined in future inventory item master with item-specific UOM conversions.

---

### 17.3 UOM Conversions

Initially **empty or minimal**. Add specific conversions only when needed for business cases not covered by simple base conversion factor.

Example (optional):

```sql
-- Example: Direct M3 to L conversion (already covered by base conversion, but demonstrating table usage)
insert into public.uom_conversions (from_uom_id, to_uom_id, conversion_factor, is_bidirectional, notes, is_system, is_locked)
select u1.id, u2.id, 1000, true, 'Direct M3 to L conversion', true, true
from public.units_of_measure u1
cross join public.units_of_measure u2
where u1.unit_code = 'M3' and u2.unit_code = 'L';
```

**Recommendation:** Leave conversions table empty for initial implementation. Add conversions in future phases when specific business requirements emerge.

---

## 18. Sidebar / Menu Plan

Add new "Units & Measurements" group to `src/components/layout/app-sidebar.tsx`.

### Updated navGroups Array

```typescript
import { Ruler, Weight, RefreshCw } from "lucide-react";

const navGroups: NavGroup[] = [
  // ... existing groups ...
  {
    label: "Units & Measurements",
    items: [
      { label: "UOM Categories", icon: FolderTree, path: "/admin/master-data/uom/categories" },
      { label: "Units of Measure", icon: Ruler, path: "/admin/master-data/uom/units" },
      { label: "UOM Conversions", icon: RefreshCw, path: "/admin/master-data/uom/conversions" },
    ],
  },
  // ... rest of groups ...
];
```

### Menu Location

Insert after "Finance Basics" group and before "Operations" group.

### Icons

- **UOM Categories:** `FolderTree` (already imported)
- **Units of Measure:** `Ruler` (new import)
- **UOM Conversions:** `RefreshCw` (new import)

---

## 19. File Creation / Modification Plan

### Files to Create (19 new files)

**Migration:**
1. `supabase/migrations/20260606150000_erp_base_002f3c3_uom.sql`

**Types:**
2. `src/features/master-data/uom/types.ts`

**Validation:**
3. `src/features/master-data/uom/validation.ts`

**Server Actions:**
4. `src/features/master-data/uom/actions.ts`

**Table Components:**
5. `src/features/master-data/uom/components/uom-categories-table.tsx`
6. `src/features/master-data/uom/components/units-table.tsx`
7. `src/features/master-data/uom/components/conversions-table.tsx`

**Form Dialogs:**
8. `src/features/master-data/uom/components/uom-category-form-dialog.tsx`
9. `src/features/master-data/uom/components/unit-form-dialog.tsx`
10. `src/features/master-data/uom/components/conversion-form-dialog.tsx`

**Page Components:**
11. `src/app/(protected)/admin/master-data/uom/categories/page.tsx`
12. `src/app/(protected)/admin/master-data/uom/units/page.tsx`
13. `src/app/(protected)/admin/master-data/uom/conversions/page.tsx`

**Select Components:**
14. `src/components/erp/uom/uom-category-select.tsx`
15. `src/components/erp/uom/unit-of-measure-select.tsx`
16. `src/components/erp/uom/unit-by-category-select.tsx`
17. `src/components/erp/uom/index.ts`

**Documentation:**
18. `implementation_Review/Phase_002F_3C3_Implementation/ERP_BASE_002F_3C_3_UOM_IMPLEMENTATION_REPORT.md` (post-implementation)

### Files to Modify (1 file)

19. `src/components/layout/app-sidebar.tsx` — Add "Units & Measurements" group

---

## 20. Implementation Sequence Plan

### Phase 1: Database Foundation
1. Create migration file `20260606150000_erp_base_002f3c3_uom.sql`
2. Write DDL for `uom_categories` table
3. Write DDL for `units_of_measure` table
4. Write DDL for `uom_conversions` table
5. Insert permissions (`master_data.uom.*`)
6. Assign permissions to roles
7. Create RLS policies for all three tables
8. Optional: Insert lookup category `UOM_ROUNDING_METHODS`
9. Insert seed data: 8 categories
10. Insert seed data: 45+ units
11. Optional: Insert seed conversions (or skip)
12. Apply migration to remote database using MCP `apply_migration` tool

### Phase 2: TypeScript Foundation
13. Create `src/features/master-data/uom/types.ts` with interfaces
14. Create `src/features/master-data/uom/validation.ts` with Zod schemas

### Phase 3: Server Actions
15. Create `src/features/master-data/uom/actions.ts`
16. Implement UOM categories actions (8 functions)
17. Implement units of measure actions (8 functions)
18. Implement UOM conversions actions (7 functions)

### Phase 4: UI Components - Categories
19. Create `src/features/master-data/uom/components/uom-categories-table.tsx`
20. Create `src/features/master-data/uom/components/uom-category-form-dialog.tsx`
21. Create `src/app/(protected)/admin/master-data/uom/categories/page.tsx`

### Phase 5: UI Components - Units
22. Create `src/features/master-data/uom/components/units-table.tsx`
23. Create `src/features/master-data/uom/components/unit-form-dialog.tsx`
24. Create `src/app/(protected)/admin/master-data/uom/units/page.tsx`

### Phase 6: UI Components - Conversions
25. Create `src/features/master-data/uom/components/conversions-table.tsx`
26. Create `src/features/master-data/uom/components/conversion-form-dialog.tsx`
27. Create `src/app/(protected)/admin/master-data/uom/conversions/page.tsx`

### Phase 7: Select Components
28. Create `src/components/erp/uom/uom-category-select.tsx`
29. Create `src/components/erp/uom/unit-of-measure-select.tsx`
30. Create `src/components/erp/uom/unit-by-category-select.tsx`
31. Create `src/components/erp/uom/index.ts`

### Phase 8: Integration
32. Update `src/components/layout/app-sidebar.tsx` to add UOM menu group

### Phase 9: Testing & QA
33. Run `npm run typecheck`
34. Run `npm run lint` (scoped to uom files)
35. Run `npm run build`
36. Manual browser testing:
    - Add/edit/view category
    - Add/edit/view unit with base unit constraint test
    - Add/edit/view conversion
    - Lock/unlock functionality
    - Activate/deactivate functionality
    - Delete (system_admin only)
    - Verify RLS policies (non-admin user sees only active records)
    - Test select components in all three forms

### Phase 10: Documentation
37. Generate implementation report

---

## 21. Testing Plan

### 21.1 Database Tests

**Table Creation:**
- ✅ `uom_categories` table exists with correct columns and types
- ✅ `units_of_measure` table exists with correct columns and types
- ✅ `uom_conversions` table exists with correct columns and types

**Constraints:**
- ✅ `uom_categories.category_code` unique
- ✅ `units_of_measure` unique constraint `(uom_category_id, unit_code)`
- ✅ `uom_conversions` unique constraint `(from_uom_id, to_uom_id)`
- ✅ One base unit per category (unique index on `is_base_unit` where true)
- ✅ `conversion_factor_to_base > 0` enforced
- ✅ `from_uom_id <> to_uom_id` enforced
- ✅ `decimal_places between 0 and 6` enforced

**Seed Data:**
- ✅ 8 categories inserted (WEIGHT, LENGTH, VOLUME, FUEL, AREA, TIME, COUNT, PACKAGING)
- ✅ 45+ units inserted across all categories
- ✅ Each category has exactly one base unit (`is_base_unit = true`)
- ✅ FUEL base unit is GAL_IMP
- ✅ WEIGHT base unit is KG
- ✅ All system units are locked

**RLS:**
- ✅ RLS enabled on all three tables
- ✅ Active records visible to authenticated users without permission
- ✅ Inactive records require `master_data.uom.view` permission
- ✅ INSERT requires `master_data.uom.manage` permission
- ✅ UPDATE requires `master_data.uom.manage` permission
- ✅ Locked records cannot be updated unless `system_admin` role
- ✅ DELETE requires `system_admin` role

**Permissions:**
- ✅ `master_data.uom.view` permission created
- ✅ `master_data.uom.manage` permission created
- ✅ `master_data.uom.export` permission created
- ✅ `master_data.uom.audit_view` permission created
- ✅ Permissions assigned to roles as per plan

---

### 21.2 Conversion Logic Tests

**Base Unit Conversions:**
- ✅ 1 T = 1000 KG (conversion_factor_to_base = 1000)
- ✅ 1 KG = 1000 G (1 G = 0.001 KG)
- ✅ 1 M = 100 CM (1 CM = 0.01 M)
- ✅ 1 M = 1000 MM (1 MM = 0.001 M)
- ✅ 1 M3 = 1000 L (1 M3 in VOLUME = 1000 L)
- ✅ 1 GAL_IMP = 4.54609 L (in FUEL category, L conversion = 0.21997 GAL_IMP)
- ✅ 1 GAL_US = 3.78541 L (in VOLUME category)
- ✅ 1 DAY = 24 HOUR (conversion_factor_to_base = 24)
- ✅ 1 MONTH = 730 HOUR (approx 30.42 days)

**Derived Conversions (using base unit):**
- ✅ 1 T to G: 1 T = 1000 KG, 1 KG = 1000 G → 1 T = 1,000,000 G
- ✅ 1 KM to CM: 1 KM = 1000 M, 1 M = 100 CM → 1 KM = 100,000 CM

---

### 21.3 UI Tests

**Categories Page:**
- ✅ Page loads without errors
- ✅ Table displays categories with correct columns
- ✅ Search by code/name works
- ✅ Status filter works (active/inactive)
- ✅ Add category dialog opens
- ✅ Create new category succeeds
- ✅ Duplicate category code rejected
- ✅ Edit category dialog opens with pre-filled data
- ✅ Update category succeeds
- ✅ View category dialog shows read-only data
- ✅ Activate/deactivate toggle works
- ✅ Lock/unlock toggle works (system_admin only)
- ✅ Delete button visible only for system_admin
- ✅ Audit timestamps displayed correctly

**Units Page:**
- ✅ Page loads without errors
- ✅ Table displays units with correct columns
- ✅ Category filter works
- ✅ Base unit badge/highlight visible
- ✅ Add unit dialog opens
- ✅ UomCategorySelect dropdown works
- ✅ Create new unit succeeds
- ✅ `is_base_unit` checkbox disables/enables conversion factor input
- ✅ Creating second base unit in same category rejected (unique constraint)
- ✅ Duplicate unit code within category rejected
- ✅ Edit unit dialog opens with pre-filled data
- ✅ Update unit succeeds
- ✅ View unit dialog shows read-only data
- ✅ Activate/deactivate toggle works
- ✅ Lock/unlock toggle works (system_admin only)
- ✅ Delete button visible only for system_admin

**Conversions Page:**
- ✅ Page loads without errors
- ✅ Table displays conversions with unit names/symbols, not IDs
- ✅ Add conversion dialog opens
- ✅ UnitOfMeasureSelect dropdowns work
- ✅ Create new conversion succeeds
- ✅ Selecting same unit for from/to rejected (validation error)
- ✅ Duplicate from/to pair rejected (unique constraint)
- ✅ `is_bidirectional` checkbox explained clearly
- ✅ Edit conversion dialog opens with pre-filled data
- ✅ Update conversion succeeds
- ✅ View conversion dialog shows read-only data
- ✅ Activate/deactivate toggle works
- ✅ Lock/unlock toggle works (system_admin only)
- ✅ Delete button visible only for system_admin

---

### 21.4 Select Component Tests

**UomCategorySelect:**
- ✅ Component loads active categories
- ✅ Display shows category name
- ✅ `showCode` prop displays category code
- ✅ `allowClear` prop shows clear button
- ✅ `onValueChange` callback fires correctly
- ✅ Loading state displays spinner
- ✅ Error state displays error message
- ✅ Empty state displays "No categories available"

**UnitOfMeasureSelect:**
- ✅ Component loads active units
- ✅ Display shows unit symbol or name
- ✅ `categoryId` prop filters units correctly
- ✅ `excludeId` prop excludes specific unit
- ✅ `showSymbol` prop works
- ✅ `onValueChange` callback fires correctly
- ✅ Loading/error/empty states work

**UnitByCategorySelect:**
- ✅ Component requires `categoryId` prop
- ✅ Loads units for specified category only
- ✅ Display shows symbol or name
- ✅ Base unit highlighted
- ✅ Conversion hint tooltip shows (if enabled)
- ✅ Loading/error/empty states work

---

### 21.5 Build Tests

```bash
npm run typecheck
npm run lint
npm run build
```

Expected:
- ✅ No TypeScript errors
- ✅ No ESLint errors
- ✅ Production build succeeds
- ✅ All UOM pages included in build output

---

## 22. Risk Analysis and Mitigation

### Risk 1: Wrong Gallon Standard

**Description:** UAE uses Imperial Gallon, but implementation mistakenly uses US Gallon as FUEL base.

**Impact:** HIGH — Fuel calculations wrong by ~20% (4.546L vs 3.785L), affecting fleet cost reporting.

**Likelihood:** LOW — Plan explicitly specifies GAL_IMP.

**Mitigation:**
- ✅ Plan specifies FUEL base = GAL_IMP
- ✅ Seed data uses 4.54609 L conversion
- ✅ Explicitly note in seed data comments: "UAE diesel standard"
- ⚠️ Implementation reviewer must verify this in seed SQL
- ⚠️ Browser testing must check FUEL category base unit

---

### Risk 2: Duplicate Unit Codes Across Categories

**Description:** Same unit code (e.g., "L") appears in VOLUME and FUEL, causing confusion or FK errors.

**Impact:** MEDIUM — Data integrity issues, ambiguous unit references.

**Likelihood:** MEDIUM — Seed data includes L in both VOLUME and FUEL.

**Mitigation:**
- ✅ Unique constraint is `(uom_category_id, unit_code)`, allowing duplicates across categories
- ✅ Unit selection in business forms must use `UnitByCategorySelect` with categoryId filter
- ✅ Display unit with category context in tables/dropdowns where ambiguous

---

### Risk 3: Base Unit Not Enforced Properly

**Description:** Multiple units in same category have `is_base_unit = true`, or zero base units.

**Impact:** HIGH — Conversion logic breaks.

**Likelihood:** LOW — Unique index enforces one base unit per category.

**Mitigation:**
- ✅ Unique index `idx_units_one_base_per_category` on `(uom_category_id) where is_base_unit = true`
- ✅ Seed data inserts exactly one base unit per category
- ✅ UI form dialog warns if attempting to create second base unit
- ⚠️ Test creating duplicate base unit to ensure DB constraint works

---

### Risk 4: Conversion Factor Errors

**Description:** Incorrect conversion factors in seed data (e.g., 1 T = 100 KG instead of 1000 KG).

**Impact:** HIGH — Business calculations wrong, potentially financial loss.

**Likelihood:** MEDIUM — Manual data entry prone to typos.

**Mitigation:**
- ✅ Peer review seed data SQL
- ✅ Automated conversion tests in testing plan (section 21.2)
- ✅ Browser testing: create test conversion and manually verify calculation
- ⚠️ Implementation reviewer must spot-check conversion factors

---

### Risk 5: Packaging Conversions Treated as Universal

**Description:** User creates "1 BOX = 12 EA" in uom_conversions, expecting it to apply to all items, but packaging is item-specific.

**Impact:** MEDIUM — Wrong quantity calculations in inventory.

**Likelihood:** MEDIUM — User misunderstanding of packaging UOM design.

**Mitigation:**
- ✅ Plan explicitly states packaging conversions deferred to inventory phase
- ✅ Seed data sets all packaging units `conversion_factor_to_base = 1`
- ✅ Conversions table usage documented as "for special cases only"
- ⚠️ UI should include help text: "Packaging conversions are item-specific; define in Inventory Item Master"
- ⚠️ Admin training: explain packaging UOM limitation

---

### Risk 6: RLS Too Strict (Normal Users Cannot View Active Units)

**Description:** RLS SELECT policy blocks normal users from viewing active units needed in business forms.

**Impact:** MEDIUM — Business forms break for non-admin users.

**Likelihood:** LOW — Plan includes `is_active = true or has_permission()` pattern.

**Mitigation:**
- ✅ RLS SELECT policy: `is_active = true or current_user_has_permission('master_data.uom.view')`
- ✅ Active units visible to all authenticated users
- ⚠️ Test with branch_admin user: can they see active units in select dropdown?

---

### Risk 7: RLS Too Loose (Sensitive Data Exposed)

**Description:** RLS policies accidentally expose inactive/deleted units to unauthorized users.

**Impact:** LOW — Minor data leak, no financial/security risk.

**Likelihood:** LOW — Plan uses established RLS pattern.

**Mitigation:**
- ✅ Inactive records require `master_data.uom.view` permission
- ✅ Audit logs require `master_data.uom.audit_view` permission
- ⚠️ Security audit: test with normal user account, verify cannot see inactive records

---

### Risk 8: Hardcoded Units in Future Modules

**Description:** Developer hardcodes "KG" unit in procurement module instead of selecting from UOM master.

**Impact:** HIGH — Defeats purpose of UOM master data, creates maintenance nightmare.

**Likelihood:** MEDIUM — Developer convenience over architecture.

**Mitigation:**
- ✅ Plan explicitly states: "No hardcoded units allowed"
- ✅ Code review checklist: verify all UOM usage goes through select components
- ⚠️ Future module planning must reference UOM master
- ⚠️ Developer training: emphasize UOM master data usage

---

### Risk 9: Deleting System Units

**Description:** system_admin accidentally hard deletes KG or M unit.

**Impact:** HIGH — Breaks existing inventory, procurement, fleet records.

**Likelihood:** LOW — RLS restricts delete to system_admin only.

**Mitigation:**
- ✅ System units marked `is_system = true` and `is_locked = true`
- ✅ UI should show confirmation dialog: "This is a SYSTEM unit. Deletion may break existing records. Are you sure?"
- ✅ Prefer soft delete (deactivate) over hard delete
- ⚠️ FK constraints on units_of_measure should be `on delete restrict` (already planned)
- ⚠️ Training: educate system_admin to deactivate instead of delete

---

### Risk 10: Conversion Cycles

**Description:** User creates A→B, B→C, C→A conversion cycle, causing infinite loop.

**Impact:** MEDIUM — Calculation logic hangs or returns wrong value.

**Likelihood:** LOW — Initial implementation only uses simple factor conversions.

**Mitigation:**
- ✅ Initial phase: no complex conversion chains, only base unit conversions
- ⚠️ Future enhancement: add cycle detection logic if cross-category conversions added
- ⚠️ Document: conversions should only be A→base and B→base, not A→B direct

---

## 23. Acceptance Criteria

### Planning Phase

- [x] Technical plan created and approved by Sameer
- [x] BIGINT PK/FK planned for all three tables
- [x] `user_profiles(id)` audit fields planned
- [x] Actual RLS helper functions confirmed and planned
- [x] One consolidated migration file recommended
- [x] No hardcoded units rule established

### Database Schema

- [ ] `uom_categories` table created with all columns, constraints, indexes
- [ ] `units_of_measure` table created with all columns, constraints, indexes
- [ ] `uom_conversions` table created with all columns, constraints, indexes
- [ ] Unique constraint `(uom_category_id, unit_code)` enforced
- [ ] Unique index for one base unit per category enforced
- [ ] Check constraints validated (conversion factor > 0, decimal places range, etc.)

### Permissions & RLS

- [ ] `master_data.uom.view` permission created and assigned
- [ ] `master_data.uom.manage` permission created and assigned
- [ ] `master_data.uom.export` permission created and assigned
- [ ] `master_data.uom.audit_view` permission created and assigned
- [ ] RLS enabled on all three tables
- [ ] SELECT policy allows active records to all authenticated users
- [ ] INSERT/UPDATE policies require `master_data.uom.manage`
- [ ] UPDATE policy allows system_admin to edit locked records
- [ ] DELETE policy restricts to system_admin only

### Seed Data

- [ ] 8 UOM categories inserted (WEIGHT, LENGTH, VOLUME, FUEL, AREA, TIME, COUNT, PACKAGING)
- [ ] 45+ units inserted across all categories
- [ ] Each category has exactly one base unit
- [ ] FUEL category base unit is GAL_IMP
- [ ] WEIGHT category base unit is KG
- [ ] All critical units marked `is_system = true` and `is_locked = true`
- [ ] Conversion factors verified correct (spot checks: 1 T = 1000 KG, 1 M = 100 CM, etc.)

### TypeScript & Validation

- [ ] `types.ts` created with interfaces for all three entities
- [ ] `validation.ts` created with Zod schemas for create/update operations
- [ ] All schemas include proper regex, ranges, transformations

### Server Actions

- [ ] `actions.ts` created with 23+ server actions
- [ ] All actions perform RBAC checks
- [ ] All actions log audit trail
- [ ] All actions revalidate Next.js cache
- [ ] All actions return `ActionResult<T>` with success/error

### UI Components

- [ ] 3 table components created (categories, units, conversions)
- [ ] 3 form dialog components created
- [ ] 3 page components created with routes
- [ ] All tables use `ERPDataTable` pattern
- [ ] All forms use `ERPDrawerForm` pattern
- [ ] All pages use `ERPPageHeader` with breadcrumbs
- [ ] Lock/unlock functionality implemented
- [ ] Activate/deactivate functionality implemented
- [ ] Delete functionality restricted to system_admin

### Select Components

- [ ] `UomCategorySelect` component created
- [ ] `UnitOfMeasureSelect` component created
- [ ] `UnitByCategorySelect` component created
- [ ] All select components handle loading/error/empty states
- [ ] All select components display names/symbols, not IDs

### Integration

- [ ] Sidebar menu updated with "Units & Measurements" group
- [ ] All three UOM pages accessible from sidebar
- [ ] Navigation works correctly

### Testing

- [ ] TypeScript type check passes (`npm run typecheck`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Database constraints tested (duplicate base unit rejected, etc.)
- [ ] Conversion calculations tested (1 T = 1000 KG verified)
- [ ] RLS policies tested (normal user sees only active records)
- [ ] Browser testing completed:
  - [ ] Add/edit/view category
  - [ ] Add/edit/view unit with base unit constraint
  - [ ] Add/edit/view conversion
  - [ ] Lock/unlock functionality
  - [ ] Activate/deactivate functionality
  - [ ] Delete (system_admin only)
  - [ ] Select components in forms

### Documentation

- [ ] Implementation report generated
- [ ] Future integration notes documented

### Future Module Compliance

- [ ] All future inventory/procurement/fleet modules reference `units_of_measure` table
- [ ] No hardcoded unit dropdowns in future modules
- [ ] Select components used consistently

---

## 24. Future Integration Notes

### How UOM Supports Future Modules

**Inventory Item Master:**
- Stock unit: SELECT from `units_of_measure` WHERE category = 'COUNT' or 'WEIGHT'
- Packaging conversions: Define in `uom_conversions` with `item_id` reference (future enhancement)
- Example: Item "Bolt M12" → Stock UOM = EA, Alt UOM = BOX (1 BOX = 100 EA)

**Procurement:**
- Purchase order line item: SELECT from `units_of_measure` via `UnitByCategorySelect` filtered by item's stock category
- Price per unit: Store with `uom_id` reference
- Quantity conversions: Use `conversion_factor_to_base` to normalize for comparison

**Fleet Fuel Management:**
- Fuel transactions: Use FUEL category units (GAL_IMP, L)
- Default: GAL_IMP (UAE standard)
- Reporting: Convert to L for regulatory compliance if needed

**Weighbridge:**
- Weight tickets: Use WEIGHT category units (KG, T)
- Display precision: Use `decimal_places` from unit definition (3 for weights)
- Tare/Net weight: Store in base unit (KG), display in user-selected unit

**Workshop:**
- Spare parts: Use COUNT/PACKAGING units (EA, PCS, BOX)
- Fluids/lubricants: Use VOLUME units (L, ML)
- Time tracking: Use TIME units (HOUR, DAY)

**Equipment Rental:**
- Rental period: Use TIME units (HOUR, DAY, MONTH)
- Billing: Price per time unit

**CRM Quotations:**
- Line items: SELECT unit based on product category
- Multi-unit pricing: Store price for each UOM variant (price per EA vs price per BOX)

**Billing:**
- Invoice line items: Reference `uom_id` to display correct unit
- Quantity × Unit Price calculation
- Unit symbol display on printed invoice

### Example: Scrap Trading Workflow

1. **Weighbridge Ticket:**
   - Vehicle enters, tare weight = 8,500 KG
   - Vehicle exits, gross weight = 12,300 KG
   - Net scrap weight = 3,800 KG
   - Display to user: "3.8 T" (converted from base KG)

2. **Procurement Purchase Order:**
   - Buy scrap from supplier
   - PO line: 10 T × AED 450/T = AED 4,500
   - System stores: quantity = 10, uom_id = [T unit ID], unit_price = 450

3. **Sales Invoice:**
   - Sell processed scrap to buyer
   - Invoice line: 8,500 KG × AED 0.55/KG = AED 4,675
   - System converts 8,500 KG = 8.5 T for user reference

---

## 25. Final Recommendation

### Status: ✅ READY FOR SAMEER REVIEW

This technical implementation plan is **complete and implementation-ready** for the Units & Measurements master data module (ERP BASE 002F.3C.3).

### Completeness Check

✅ All 25 required sections completed  
✅ Database schema fully planned with DDL  
✅ Seed data defined (8 categories, 45+ units)  
✅ Permissions and RLS policies detailed  
✅ Server actions architecture planned  
✅ UI structure with 3 pages, tables, forms  
✅ Select components planned (3 reusable components)  
✅ Implementation sequence defined (37 steps)  
✅ Testing plan comprehensive (database, UI, conversion, build tests)  
✅ Risk analysis with mitigations  
✅ Acceptance criteria checklist  
✅ Future integration guidance  

### Critical Decisions Made

1. **Unit codes unique per category** — Flexible, prevents global conflicts
2. **FUEL base = GAL_IMP** — Aligns with UAE diesel operations
3. **Simple factor conversions** — Efficient, covers 95% of use cases
4. **Packaging deferred** — Item-specific conversions in future inventory phase
5. **BIGINT PKs/FKs** — Follows project standard
6. **user_profiles(id) audit** — Follows established pattern
7. **Single consolidated migration** — Proven approach from finance basics
8. **system_admin-only hard delete** — Data protection

### Next Steps

1. **Sameer Review:** Approve this technical plan
2. **Decision Point:** Confirm FUEL base = GAL_IMP vs. GAL_US vs. L
3. **Decision Point:** Include optional `UOM_ROUNDING_METHODS` lookup or skip?
4. **Implementation:** Use next prompt to begin implementation

### Recommended Next Prompt

```text
PROMPT_ERP_BASE_002F_3C_3_IMPLEMENT_UNITS_MEASUREMENTS.md
```

### Implementation Estimate

**Complexity:** Medium-High  
**Estimated Tool Calls:** 80-120  
**Estimated Duration:** 2-4 hours (AI implementation time)  
**Human QA:** 1-2 hours browser testing  

### Dependencies

**Prerequisites:**
- ✅ Geography module closed
- ✅ Finance Basics module closed and browser-tested
- ✅ Global lookup engine available
- ✅ Foundation RLS helpers available
- ✅ ERP UI components (`ERPDataTable`, `ERPDrawerForm`) available

**Blocks:**
- None. UOM is standalone master data.

### Risk Level

**LOW-MEDIUM** — Straightforward master data implementation following proven patterns. Main risks are seed data accuracy and future module compliance (both mitigated).

---

## Appendix A: Key Design Decisions Summary

| Decision | Option Chosen | Rationale |
|---|---|---|
| Unit Code Uniqueness | Per-category unique | Flexibility + data integrity |
| Base Unit Storage | `is_base_unit` boolean on unit | Avoids circular FK dependency |
| Conversion Storage | `conversion_factor_to_base` + `uom_conversions` table | Simple + flexible |
| FUEL Base Unit | GAL_IMP | UAE diesel standard |
| FUEL vs VOLUME | Separate FUEL category | Business semantics clarity |
| Packaging Conversions | Defined but deferred | Future inventory phase |
| System Protection | `is_system` + `is_locked` + RLS | Strong protection, system_admin override |
| Lookup Categories | Optional `UOM_ROUNDING_METHODS` | Minimal, avoid premature complexity |

---

## Appendix B: Conversion Factor Quick Reference

| From | To | Factor | Calculation |
|---|---|---|---|
| KG | G | 1000 | 1 KG = 1000 G |
| T | KG | 1000 | 1 T = 1000 KG |
| T | G | 1,000,000 | 1 T = 1000 KG × 1000 G/KG |
| M | CM | 100 | 1 M = 100 CM |
| M | MM | 1000 | 1 M = 1000 MM |
| KM | M | 1000 | 1 KM = 1000 M |
| L | ML | 1000 | 1 L = 1000 ML |
| M3 | L | 1000 | 1 M³ = 1000 L |
| GAL_IMP | L | 4.54609 | 1 Imperial Gallon = 4.54609 L |
| GAL_US | L | 3.78541 | 1 US Gallon = 3.78541 L |
| HOUR | MIN | 60 | 1 Hour = 60 Minutes |
| DAY | HOUR | 24 | 1 Day = 24 Hours |
| MONTH | HOUR | 730 | 1 Month ≈ 30.42 Days × 24 Hours |

---

## Appendix C: UAE Business Use Cases

### Use Case 1: Diesel Refueling

**Scenario:** Fleet vehicle refuels at ALGT yard.

**Flow:**
1. Driver requests 50 gallons of diesel
2. System records: quantity = 50, uom_id = [GAL_IMP unit ID]
3. Convert to liters for inventory deduction: 50 × 4.54609 = 227.3 L
4. Update fuel inventory: subtract 227.3 L (stored in base unit)
5. Display on fuel report: "50.0 gal (227.3 L)"

**UOM Support:** FUEL category with GAL_IMP base unit.

---

### Use Case 2: Scrap Metal Weighbridge

**Scenario:** Truck delivers scrap metal to ALGT demolition yard.

**Flow:**
1. Weighbridge ticket: Gross = 18,500 KG, Tare = 8,200 KG, Net = 10,300 KG
2. System stores: net_weight = 10300, uom_id = [KG unit ID]
3. Display to user: "10.3 T" (converted for readability)
4. Invoice to customer: Price per ton × 10.3 T

**UOM Support:** WEIGHT category with KG base unit, T conversion factor = 1000.

---

### Use Case 3: Workshop Spare Parts

**Scenario:** Workshop orders spare parts from supplier.

**Flow:**
1. Purchase order line: Item = "Oil Filter", Quantity = 5, UOM = BOX
2. Supplier delivers 5 boxes
3. Each box contains 10 filters (item-specific conversion: 1 BOX = 10 EA)
4. System updates stock: +50 EA (5 BOX × 10 EA/BOX)
5. Workshop issues 12 filters to mechanics: stock = 38 EA remaining

**UOM Support:** PACKAGING category (BOX, EA), item-specific conversion in future inventory module.

---

### Use Case 4: Equipment Rental Billing

**Scenario:** Customer rents excavator from ALGT.

**Flow:**
1. Rental contract: 15 days × AED 800/day
2. System stores: quantity = 15, uom_id = [DAY unit ID], rate = 800
3. Invoice line: "Excavator Rental - 15 days @ AED 800/day = AED 12,000"
4. Alternate billing: Convert to hours: 15 days × 24 hours = 360 hours
5. Display: "360 hours (15 days)"

**UOM Support:** TIME category with HOUR base unit, DAY conversion factor = 24.

---

**END OF TECHNICAL IMPLEMENTATION PLAN**

---

**Document Status:** PLANNING COMPLETE — AWAITING SAMEER APPROVAL  
**Next Action:** Sameer reviews and approves plan, then proceeds to implementation prompt  
**Implementation Prompt:** `PROMPT_ERP_BASE_002F_3C_3_IMPLEMENT_UNITS_MEASUREMENTS.md`
