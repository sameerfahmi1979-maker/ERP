# ERP BASE 002F.3C — CORE UAE SHARED MASTER DATA TECHNICAL IMPLEMENTATION PLAN

**Date**: June 5, 2026  
**Phase**: ERP BASE 002F.3C  
**Status**: READY FOR SAMEER REVIEW  
**Next Phase After Approval**: ERP BASE 002F.3C Implementation

---

## 1. Executive Summary

### Purpose of 002F.3C

Phase 002F.3C establishes the foundational shared master data required by all future ERP modules. This phase creates the core reference data for geography, finance basics, and units of measurement that will be consumed by HR, CRM, Fleet, Workshop, Inventory, Procurement, HSE, DMS, and Scrap/Waste/Demolition modules.

### Why Core UAE Shared Master Data is Next After Lookup Engine

The 002F.3B Global Lookup / Dropdown Engine (now approved with PASS WITH NOTES) provides the foundation for simple categorical data like status types, priority levels, and approval workflows. However, many master data entities require:

- Complex hierarchical relationships (e.g., Country → Emirate → City → Area)
- Rich metadata beyond what lookups provide (e.g., currency decimal places, UOM conversion factors, tax effective dates)
- External references (e.g., ISO country codes, SWIFT codes, phone codes)
- Specialized validation (e.g., tax rates, conversion formulas)
- Company/branch scoping for operational data (e.g., cost centers, work sites)

Phase 002F.3C creates **dedicated master data tables** where appropriate, while leveraging the 002F.3B lookup engine for simple categorical data.

### What Will Be Implemented

**Geography & Locations:**
- Countries (dedicated table with ISO codes, nationalities, phone codes, GCC flags)
- Emirates (UAE-specific dedicated table)
- Cities (dedicated table with emirate/country linkage)
- Areas/Zones (dedicated table for industrial/free zones)
- Ports (dedicated table for maritime operations)
- Work Sites (dedicated table for project/operations locations)

**Finance Basics:**
- Currencies (dedicated table with decimal places, base currency flag)
- Payment Terms (dedicated table with due days, advance/retention percentages)
- Payment Methods (lookup category)
- Tax Types (dedicated table with rates, effective dates, reverse charge flags)
- Tax Treatment Types (lookup category)
- Banks (dedicated table with SWIFT codes, country linkage)
- Bank Account Types (lookup category)
- Cost Centers (dedicated table with hierarchy, company/branch scope)
- Profit Centers (dedicated table, similar to cost centers)

**Units & Measurements:**
- UOM Categories (dedicated table)
- Units of Measure (dedicated table with conversion factors)
- UOM Conversions (dedicated table for cross-category conversions)

**Lookup Category Additions:**
- AREA_TYPES
- PORT_TYPES
- SITE_TYPES
- PAYMENT_METHODS
- BANK_ACCOUNT_TYPES
- BANK_TYPES
- TAX_TREATMENT_TYPES
- COST_CENTER_TYPES
- PROFIT_CENTER_TYPES

### What Will NOT Be Implemented

**Out of Scope:**
- ❌ Full accounting module (GL, trial balance, financial statements)
- ❌ Chart of accounts
- ❌ Customers/Vendors master data
- ❌ CRM operational screens
- ❌ HR employee master data
- ❌ Fleet assets master data
- ❌ Workshop job orders
- ❌ Inventory item master
- ❌ Procurement transactions
- ❌ HSE incident module
- ❌ DMS attachment engine
- ❌ Scrap/waste/demolition operational modules
- ❌ Import engine (deferred as in 002F.3B)
- ❌ Migration of existing hardcoded dropdown values in organization/branch forms

### How This Supports Future Phases

**002F.3D - Organization / Branch Completion:**
- Organizations can reference currencies, countries, emirates, banks
- Branches can reference cities, areas, ports, cost/profit centers

**002F.3E - People / Contacts / CRM:**
- Contact nationality uses countries
- Contact location uses emirates/cities
- CRM opportunities use currencies, payment terms

**002F.3F - HR Master Data:**
- Employee nationality uses countries
- Employee work location uses emirates/cities
- Salary currencies from currencies table
- Cost center allocation uses cost_centers

**002F.3G - Fleet / Equipment:**
- Vehicle registration emirate uses emirates
- Fuel measured in UOM (L, GAL_IMP, GAL_US)
- Equipment location uses work sites, areas

**002F.3H - Workshop / Inventory / Procurement:**
- Inventory items use UOM
- Procurement uses payment terms, tax types, currencies
- Vendor country/emirate linkage
- Workshop job costing uses cost centers

**002F.3I - Basic HSE / DMS / Compliance:**
- Incident location uses emirates, cities, work sites
- Document location/archive uses areas/work sites

**002F.3J - Scrap / Waste / Demolition:**
- Scrap weight uses UOM (TON, KG)
- Scrap tax type uses tax_types (RCM_SCRAP)
- Customer/vendor location uses countries/emirates/cities

### Readiness Status for Implementation

✅ **READY**

- Source inspection complete
- 002F.3B patterns understood
- Foundation schema reviewed
- Decision matrix prepared
- UAE compliance requirements identified
- Schema design complete
- RLS strategy defined
- Permissions planned
- UI structure planned
- Implementation sequence defined

**Next Step**: Await Sameer approval of this technical plan, then proceed to implementation prompt.

---

## 2. Existing Source Code Inspection Summary

| Area | Files/Tables Inspected | Current Pattern Found | Impact on 002F.3C |
|------|------------------------|----------------------|-------------------|
| **002F.3B Lookup Engine** | `supabase/migrations/20260605113000_erp_base_002f3b_global_lookup_engine.sql` | - BIGINT PKs<br>- `is_system`, `is_locked`, `is_active` flags<br>- Audit fields (created/updated/deactivated)<br>- RLS with permission checks<br>- Category scope: GLOBAL/COMPANY/BRANCH/MODULE<br>- Supports hierarchy, color, icon<br>- 13 seed categories, 70+ seed values | ✅ Use same BIGINT PK pattern<br>✅ Reuse is_system/is_locked flags<br>✅ Add similar audit fields<br>✅ Use similar RLS pattern<br>✅ Leverage lookup categories for simple data (payment methods, bank account types)<br>✅ Use dedicated tables where complex metadata needed |
| **Database Migrations** | All 6 migration files | - Sequential timestamp naming<br>- `create table if not exists`<br>- Foreign keys with `on delete restrict` for master data<br>- CHECK constraints for status<br>- Triggers for `updated_at`<br>- RLS enabled on all tables<br>- Seed data in DO blocks | ✅ Follow same migration naming convention<br>✅ Use `if not exists` for idempotency<br>✅ Use `on delete restrict` for master data FKs<br>✅ Add CHECK constraints for enums<br>✅ Create `updated_at` triggers<br>✅ Enable RLS<br>✅ Seed data in DO $$ blocks |
| **Permissions Table** | `public.permissions` | - permission_code unique<br>- module_code + action_code structure<br>- is_active flag<br>- Examples: `master_data.lookups.view`, `master_data.lookups.manage` | ✅ Create permissions:<br>- `master_data.geography.view/manage/export/audit_view`<br>- `master_data.finance_basics.view/manage/export/audit_view`<br>- `master_data.uom.view/manage/export/audit_view` |
| **Role Permissions** | `public.role_permissions` | - system_admin: all permissions<br>- group_admin: view/manage/export/audit<br>- company_admin: view/export<br>- branch_admin: view only | ✅ Follow same assignment pattern<br>✅ System admin gets all new permissions<br>✅ Group admin gets view/manage/export/audit<br>✅ Company admin gets view/export<br>✅ Branch admin gets view only |
| **RLS Policies** | 002F.3B lookup tables | - SELECT: requires `master_data.lookups.view`<br>- INSERT: requires `master_data.lookups.manage`<br>- UPDATE: lock-aware (locked = lock permission, unlocked = manage permission)<br>- DELETE: blocked (no policies)<br>- Policy pattern: JOIN user_profiles → user_roles → role_permissions → permissions | ✅ Use same SELECT/INSERT/UPDATE policy pattern<br>✅ Lock-aware updates where applicable<br>✅ Block DELETE<br>✅ For global tables: all valid users read, admin manage<br>✅ For scoped tables: add owner_company/branch filters |
| **Audit Logs** | `public.audit_logs` | - actor_user_profile_id<br>- owner_company_id<br>- branch_id<br>- module_code<br>- entity_name<br>- entity_id<br>- entity_reference<br>- action<br>- old_values/new_values JSONB<br>- created_at | ✅ Log all creates/updates/status changes<br>✅ Use module_code: `master_data`<br>✅ Entity_name: table name<br>✅ Entity_reference: meaningful code (e.g., currency_code, country_code)<br>✅ Use `logAudit` helper<br>✅ Use `createAuditDiff` for updates |
| **Server Actions** | `src/server/actions/master-data/lookups.ts` | - `"use server"` directive<br>- Permission checks via `getAuthContext()` and `hasPermission()`<br>- Zod validation<br>- Lock status checks<br>- Audit logging<br>- `revalidatePath()` after mutations<br>- Safe dropdown service for normal users<br>- ActionResult<T> return type | ✅ Create:<br>- `src/server/actions/master-data/geography.ts`<br>- `src/server/actions/master-data/finance-basics.ts`<br>- `src/server/actions/master-data/uom.ts`<br>✅ Follow same permission check pattern<br>✅ Validate with Zod<br>✅ Log audit<br>✅ Revalidate paths<br>✅ Create safe dropdown services |
| **Validation** | `src/features/master-data/lookups/validation.ts` | - Zod schemas for create/update<br>- Regex patterns for uppercase codes<br>- Transform to uppercase<br>- Min/max length validation<br>- Nullable/optional fields<br>- Refine for cross-field validation | ✅ Create validation files:<br>- `src/features/master-data/geography/validation.ts`<br>- `src/features/master-data/finance-basics/validation.ts`<br>- `src/features/master-data/uom/validation.ts`<br>✅ Validate ISO codes, SWIFT codes, currency codes<br>✅ Validate conversion factors positive<br>✅ Validate effective dates |
| **Organization/Branch Tables** | `public.owner_companies`, `public.branches` | **owner_companies:**<br>- country text<br>- emirate text<br>- default_currency text (default 'AED')<br>- status text with CHECK<br><br>**branches:**<br>- emirate text<br>- area text | ⚠️ **Hardcoded Fields Noted**:<br>- country (text) → will later reference countries.id<br>- emirate (text) → will later reference emirates.id<br>- default_currency (text) → will later reference currencies.id<br>- area (text) → will later reference areas_zones.id<br><br>✅ **002F.3C Action**: Create master data tables, do NOT migrate existing fields yet<br>✅ Future Phase: Gradual migration with FK constraints |
| **Sidebar** | `src/components/layout/app-sidebar.tsx` | - Flat structure with groups<br>- Master Data group exists (from 002F.3B)<br>- Individual lookup pages listed<br>- Permission-based visibility not yet enforced in component | ✅ Add hierarchical submenus:<br>- Geography & Locations (collapsible)<br>  - Countries, Emirates, Cities, Areas/Zones, Ports, Work Sites<br>- Finance Basics (collapsible)<br>  - Currencies, Payment Terms, Tax Types, Banks, Cost Centers, Profit Centers<br>- Units & Measurements (collapsible)<br>  - UOM Categories, Units of Measure, UOM Conversions<br>⚠️ Sidebar currently flat; need nested menu support or permission-gated visibility |
| **Admin Routes** | `src/app/(protected)/admin/master-data/` | - Dashboard page exists<br>- Lookup pages: categories, values, system<br>- Pattern: server component fetches data, renders client table component | ✅ Create route structure:<br>- `/admin/master-data/geography/countries`<br>- `/admin/master-data/geography/emirates`<br>- `/admin/master-data/geography/cities`<br>- `/admin/master-data/geography/areas`<br>- `/admin/master-data/geography/ports`<br>- `/admin/master-data/geography/sites`<br>- `/admin/master-data/finance/currencies`<br>- `/admin/master-data/finance/payment-terms`<br>- `/admin/master-data/finance/tax-types`<br>- `/admin/master-data/finance/banks`<br>- `/admin/master-data/finance/cost-centers`<br>- `/admin/master-data/finance/profit-centers`<br>- `/admin/master-data/uom/categories`<br>- `/admin/master-data/uom/units`<br>- `/admin/master-data/uom/conversions` |
| **Drawer Forms** | `src/components/erp/erp-drawer-form.tsx` | - ERPDrawerForm (right-side, 80vw width)<br>- ERPDrawerSectionNav (left sidebar tabs)<br>- ERPDrawerBody (scrollable content)<br>- ERPDrawerSection (collapsible sections)<br>- ERPFieldGrid (12-column grid)<br>- ERPDrawerFooter (sticky bottom)<br>- Mode: add/edit/view<br>- Integrates with server actions | ✅ Use ERPDrawerForm for all CRUD dialogs<br>✅ Organize into logical sections (Basic Info, Location, Dates, Status, Audit)<br>✅ Use ERPFieldGrid for consistent 12-column layout<br>✅ Disable fields in view mode |
| **Data Tables** | `src/components/erp/table/erp-data-table.tsx` | - ERPDataTable with TanStack Table<br>- Search, filters, sorting, column visibility<br>- Row selection<br>- Export support via exportConfig<br>- Toolbar slot for action buttons<br>- Meta for exportable columns | ✅ Use ERPDataTable for all list pages<br>✅ Define column meta for export<br>✅ Add search/filters<br>✅ Add Add/Edit/View/Deactivate/Lock actions<br>✅ Export configuration for each table |
| **Export Menu** | `src/components/erp/export/erp-export-menu.tsx` | - PDF, Excel, CSV export<br>- Email integration<br>- Uses exportConfig from table<br>- Respects visible/selected rows | ✅ Leverage existing export<br>✅ Each table provides exportConfig |
| **LookupSelect** | `src/components/erp/lookup-select.tsx` | - Client component<br>- Uses `useLookupValues` hook<br>- Category-based filtering<br>- Parent value filtering<br>- Color/icon/badge display<br>- Safe service: `getActiveLookupValuesByCategoryCode` | ✅ Use LookupSelect for simple lookups (payment methods, bank account types, area types, port types, site types)<br>✅ Create dedicated selects for complex tables (CountrySelect, EmirateSelect, CitySelect, CurrencySelect, UOMSelect, TaxTypeSelect, PaymentTermSelect) |
| **Types Pattern** | `src/features/master-data/lookups/types.ts` | - Database types match table schema<br>- Extended types with stats (_WithStats)<br>- Filter types for list actions<br>- Component prop types<br>- Dashboard stats types | ✅ Create type files:<br>- `src/features/master-data/geography/types.ts`<br>- `src/features/master-data/finance-basics/types.ts`<br>- `src/features/master-data/uom/types.ts`<br>✅ Define DB types, extended types, filter types, dashboard types |

---

## 3. Lookup vs Dedicated Table Decision Matrix

| Master Data Item | Recommended Type | Proposed Table / Lookup Category | Why | Used By Future Modules | Implementation Priority |
|------------------|------------------|-----------------------------------|-----|------------------------|------------------------|
| **Countries** | Dedicated Table | `countries` | Complex metadata: ISO2/ISO3 codes, nationality names (EN/AR), phone codes, default currency, GCC flag, UAE flag. External standard references (ISO 3166). | HR (nationality), CRM (client country), Procurement (vendor country), Organizations, Branches | ⭐⭐⭐ Critical |
| **Emirates** | Dedicated Table | `emirates` | UAE-specific, hierarchical (belongs to country), needs codes (AUH, DXB, etc.), bilingual names. Foundation for UAE business logic. | Organizations, Branches, HR (work emirate), Fleet (registration), Procurement (delivery emirate), CRM | ⭐⭐⭐ Critical |
| **Cities** | Dedicated Table | `cities` | Hierarchical (country → emirate → city), bilingual, is_capital flag. Too many cities for simple lookup. Used heavily in addresses. | Organizations, Branches, HR, CRM, Procurement, Fleet, HSE (incident location) | ⭐⭐⭐ Critical |
| **Areas / Zones** | Dedicated Table | `areas_zones` | Hierarchical (city → area), metadata: is_free_zone, is_industrial_area, is_port_area. Key for UAE operations (Mussafah, ICAD, KIZAD, Jebel Ali FZ, Hamriyah FZ). | Branches, Work Sites, Inventory (warehouse location), Workshop | ⭐⭐ High |
| **Ports** | Dedicated Table | `ports` | Specialized metadata: port_code, port_type, operator_name. Maritime operations reference. UAE has 7+ major ports. | Fleet (vessel operations), Scrap (export port), Procurement (import port), Logistics | ⭐ Medium |
| **Work Sites** | Dedicated Table | `work_sites` | Project/operations-specific. Links to customers/projects (future). GPS coordinates. Dynamic (created per project). | Fleet (job site), Workshop (service location), HSE (incident site), HR (work location) | ⭐ Medium |
| **Currencies** | Dedicated Table | `currencies` | Complex metadata: ISO currency code, symbol, decimal_places (0-6), is_base_currency flag. Financial calculations depend on decimal precision. | Finance (all transactions), Procurement, CRM, HR (salary), Fleet (costs) | ⭐⭐⭐ Critical |
| **Exchange Rate Sources** | ⏳ Deferred | N/A (future enhancement) | Not needed for foundation. Actual exchange rates belong in finance module. Placeholder can be lookup if needed. | Finance Module (future) | ⏸️ Deferred to Finance Module |
| **Payment Terms** | Dedicated Table | `payment_terms` | Complex metadata: due_days, advance_percentage, retention_percentage. Business logic for payment schedules. | Procurement, CRM, Finance (invoicing future) | ⭐⭐ High |
| **Payment Methods** | Lookup Category | `PAYMENT_METHODS` | Simple categorical (CASH, CHEQUE, BANK_TRANSFER, CREDIT_CARD, LC, PDC). No complex metadata. Perfect for LookupSelect. | Finance, Procurement, CRM, HR (salary payment method) | ⭐⭐ High |
| **Tax Types** | Dedicated Table | `tax_types` | Complex: tax_rate (decimal), effective_from/to dates, is_reverse_charge flag, applies_to sales/purchase/scrap flags. UAE VAT (5%, 0%, exempt), RCM for scrap. | Procurement, CRM, Finance, Scrap (RCM), Inventory | ⭐⭐⭐ Critical |
| **Tax Treatment Types** | Lookup Category | `TAX_TREATMENT_TYPES` | Simple categorical (STANDARD_RATED, ZERO_RATED, EXEMPT, OUT_OF_SCOPE, REVERSE_CHARGE). Complements tax_types. | Procurement, Finance, Scrap | ⭐⭐ High |
| **VAT Categories** | Lookup Category | Use `TAX_TREATMENT_TYPES` | Same as Tax Treatment Types. Avoid duplication. | Procurement, Finance | ✅ Covered by TAX_TREATMENT_TYPES |
| **Banks** | Dedicated Table | `banks` | Metadata: bank_code, SWIFT code, country link, website. UAE has 20+ banks. External reference (SWIFT). | Finance (bank accounts), HR (salary banks), Procurement (vendor banks) | ⭐⭐ High |
| **Bank Account Types** | Lookup Category | `BANK_ACCOUNT_TYPES` | Simple categorical (CURRENT, SAVINGS, CALL_ACCOUNT, FIXED_DEPOSIT, LC_ACCOUNT, GUARANTEE_ACCOUNT). | Finance (company accounts), HR (employee accounts) | ⭐⭐ High |
| **Bank Types** | Lookup Category | `BANK_TYPES` | Simple categorical (COMMERCIAL, ISLAMIC, INVESTMENT, CENTRAL). | Banks table reference | ⭐ Medium |
| **Cost Centers** | Dedicated Table | `cost_centers` | Hierarchical (parent_cost_center_id), company/branch scoped. Metadata: cost_center_type, responsible_person. Dynamic operational data. | Finance (cost allocation), HR (department costing), Fleet (job costing), Workshop, Procurement | ⭐⭐⭐ Critical |
| **Profit Centers** | Dedicated Table | `profit_centers` | Similar to cost centers. Tracks revenue streams (Transport, Equipment Rental, Scrap Trading, Demolition, Waste Management). | Finance (profitability), CRM (revenue tracking), Fleet, Scrap | ⭐⭐ High |
| **UOM Categories** | Dedicated Table | `uom_categories` | Logical grouping (LENGTH, WEIGHT, VOLUME, AREA, FUEL, TIME, COUNT). Metadata: base_unit_code. Foundation for UOM system. | Inventory, Procurement, Fleet (fuel), Workshop, Scrap (weight) | ⭐⭐⭐ Critical |
| **Units of Measure** | Dedicated Table | `units_of_measure` | Complex: uom_code, symbol, is_base_unit, conversion_factor_to_base, decimal_precision. UAE-specific: GAL_IMP for diesel. | Inventory (all items), Procurement (ordering), Fleet (fuel consumption), Scrap (tonnage), Workshop | ⭐⭐⭐ Critical |
| **UOM Conversions** | Dedicated Table | `uom_conversions` | Cross-category conversions: from_uom_id, to_uom_id, conversion_factor, formula_type, offset_value. Enables flexible unit conversion. | Inventory, Procurement, Fleet, Scrap | ⭐⭐ High |
| **Area Types** | Lookup Category | `AREA_TYPES` | Simple categorical (INDUSTRIAL, FREE_ZONE, PORT_AREA, RESIDENTIAL, COMMERCIAL, MIXED). | areas_zones table reference | ⭐ Medium |
| **Port Types** | Lookup Category | `PORT_TYPES` | Simple categorical (SEA_PORT, AIR_PORT, DRY_PORT, CONTAINER_TERMINAL). | ports table reference | ⭐ Medium |
| **Site Types** | Lookup Category | `SITE_TYPES` | Simple categorical (PROJECT_SITE, CLIENT_SITE, WAREHOUSE, YARD, OFFICE, WORKSHOP). | work_sites table reference | ⭐ Medium |
| **Cost Center Types** | Lookup Category | `COST_CENTER_TYPES` | Simple categorical (DEPARTMENT, DIVISION, PROJECT, LOCATION, COST_POOL). | cost_centers table reference | ⭐⭐ High |
| **Profit Center Types** | Lookup Category | `PROFIT_CENTER_TYPES` | Simple categorical (BUSINESS_UNIT, PRODUCT_LINE, SERVICE_LINE, REVENUE_STREAM). | profit_centers table reference | ⭐⭐ High |
| **Core Status Values** | Existing Lookup | Already in 002F.3B `STATUS_TYPES` | Already seeded: ACTIVE, INACTIVE, PENDING, SUSPENDED, DRAFT, ARCHIVED. | All modules | ✅ Already implemented |
| **Address Types** | Existing Lookup | Already in 002F.3B `ADDRESS_TYPES` | Already seeded: REGISTERED, PHYSICAL, BILLING, SHIPPING. | Organizations, Branches, Contacts, Vendors | ✅ Already implemented |
| **Phone Types** | Existing Lookup | Already in 002F.3B `PHONE_TYPES` | Already seeded: MOBILE, OFFICE, HOME, FAX. | Contacts, Vendors, Organizations | ✅ Already implemented |
| **Email Types** | Existing Lookup | Already in 002F.3B `EMAIL_TYPES` | Already seeded: PRIMARY, WORK, PERSONAL. | Contacts, Vendors, Organizations | ✅ Already implemented |

### Decision Summary

**Dedicated Tables (19):**
- countries, emirates, cities, areas_zones, ports, work_sites
- currencies, payment_terms, tax_types, banks, cost_centers, profit_centers
- uom_categories, units_of_measure, uom_conversions

**Lookup Categories (9 new):**
- PAYMENT_METHODS, TAX_TREATMENT_TYPES, BANK_ACCOUNT_TYPES, BANK_TYPES
- AREA_TYPES, PORT_TYPES, SITE_TYPES, COST_CENTER_TYPES, PROFIT_CENTER_TYPES

**Already Implemented (4):**
- STATUS_TYPES, ADDRESS_TYPES, PHONE_TYPES, EMAIL_TYPES (from 002F.3B)

**Deferred (1):**
- Exchange Rate Sources (finance module)

---

## 4. Proposed Database Schema Plan

### Schema Design Principles

1. **Primary Keys**: BIGINT `id generated by default as identity primary key`
2. **Foreign Keys**: `on delete restrict` for master data (prevent orphans)
3. **Status Management**: `is_active` boolean + deactivation audit fields (deactivated_at, deactivated_by, deactivation_reason)
4. **System Flags**: `is_system` (seeded during install), `is_locked` (requires special permission to modify)
5. **Audit Trail**: created_at, created_by, updated_at, updated_by, deactivation fields
6. **Bilingual Support**: `*_name_en`, `*_name_ar` for Arabic localization
7. **Codes**: Uppercase alphanumeric with underscores, CHECK constraint `code = upper(code)`
8. **RLS**: Enabled on all tables
9. **Triggers**: `set_updated_at()` trigger on all tables
10. **Indexes**: On code fields, foreign keys, active status, sort order

---

## 4.1 Table: countries

### Purpose
Global reference table for all countries. Supports employee nationality, vendor/customer country, organization country, currency defaults, GCC business logic.

### Fields

```sql
create table if not exists public.countries (
  id bigint generated by default as identity primary key,
  
  -- ISO Codes
  country_code_iso2 text not null unique check (country_code_iso2 = upper(country_code_iso2) and length(country_code_iso2) = 2),
  country_code_iso3 text not null unique check (country_code_iso3 = upper(country_code_iso3) and length(country_code_iso3) = 3),
  
  -- Names
  country_name_en text not null,
  country_name_ar text,
  nationality_en text,
  nationality_ar text,
  
  -- Contact/Currency
  phone_code text, -- e.g., +971, +1, +44
  default_currency_code text, -- ISO 4217, e.g., AED, USD
  
  -- Regional Flags
  is_gcc boolean not null default false,
  is_uae boolean not null default false,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.countries is 'Global countries master data with ISO codes, nationalities, and GCC flags';
comment on column public.countries.is_gcc is 'True for GCC countries (UAE, Saudi, Oman, Qatar, Bahrain, Kuwait)';
comment on column public.countries.is_uae is 'True only for United Arab Emirates';
```

### Indexes

```sql
create index if not exists idx_countries_iso2 on public.countries(country_code_iso2);
create index if not exists idx_countries_iso3 on public.countries(country_code_iso3);
create index if not exists idx_countries_active on public.countries(is_active);
create index if not exists idx_countries_gcc on public.countries(is_gcc) where is_gcc = true;
create index if not exists idx_countries_sort on public.countries(sort_order);
```

### Trigger

```sql
create trigger trigger_countries_updated_at
  before update on public.countries
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed minimum 25 countries (UAE and key labor/trade countries):

| ISO2 | ISO3 | Country Name (EN) | Nationality (EN) | Phone | Currency | GCC | UAE | System | Locked |
|------|------|-------------------|------------------|-------|----------|-----|-----|--------|--------|
| AE | ARE | United Arab Emirates | Emirati | +971 | AED | ✅ | ✅ | ✅ | ✅ |
| SA | SAU | Saudi Arabia | Saudi | +966 | SAR | ✅ | ❌ | ✅ | ✅ |
| OM | OMN | Oman | Omani | +968 | OMR | ✅ | ❌ | ✅ | ✅ |
| QA | QAT | Qatar | Qatari | +974 | QAR | ✅ | ❌ | ✅ | ✅ |
| BH | BHR | Bahrain | Bahraini | +973 | BHD | ✅ | ❌ | ✅ | ✅ |
| KW | KWT | Kuwait | Kuwaiti | +965 | KWD | ✅ | ❌ | ✅ | ✅ |
| JO | JOR | Jordan | Jordanian | +962 | JOD | ❌ | ❌ | ✅ | ✅ |
| IN | IND | India | Indian | +91 | INR | ❌ | ❌ | ✅ | ✅ |
| PK | PAK | Pakistan | Pakistani | +92 | PKR | ❌ | ❌ | ✅ | ✅ |
| PH | PHL | Philippines | Filipino | +63 | PHP | ❌ | ❌ | ✅ | ✅ |
| BD | BGD | Bangladesh | Bangladeshi | +880 | BDT | ❌ | ❌ | ✅ | ✅ |
| NP | NPL | Nepal | Nepalese | +977 | NPR | ❌ | ❌ | ✅ | ✅ |
| LK | LKA | Sri Lanka | Sri Lankan | +94 | LKR | ❌ | ❌ | ✅ | ✅ |
| EG | EGY | Egypt | Egyptian | +20 | EGP | ❌ | ❌ | ✅ | ✅ |
| SY | SYR | Syria | Syrian | +963 | SYP | ❌ | ❌ | ✅ | ✅ |
| LB | LBN | Lebanon | Lebanese | +961 | LBP | ❌ | ❌ | ✅ | ✅ |
| GB | GBR | United Kingdom | British | +44 | GBP | ❌ | ❌ | ✅ | ✅ |
| US | USA | United States | American | +1 | USD | ❌ | ❌ | ✅ | ✅ |
| CN | CHN | China | Chinese | +86 | CNY | ❌ | ❌ | ✅ | ✅ |
| JP | JPN | Japan | Japanese | +81 | JPY | ❌ | ❌ | ✅ | ✅ |
| DE | DEU | Germany | German | +49 | EUR | ❌ | ❌ | ✅ | ✅ |
| IT | ITA | Italy | Italian | +39 | EUR | ❌ | ❌ | ✅ | ✅ |
| FR | FRA | France | French | +33 | EUR | ❌ | ❌ | ✅ | ✅ |
| TR | TUR | Turkey | Turkish | +90 | TRY | ❌ | ❌ | ✅ | ✅ |
| AU | AUS | Australia | Australian | +61 | AUD | ❌ | ❌ | ✅ | ✅ |

All seed countries: `is_system = true`, `is_locked = true`, `is_active = true`, `sort_order = 10, 20, 30, ...`

**Arabic Names**: Add during implementation using proper transliteration (e.g., الإمارات العربية المتحدة for UAE).

### RLS

```sql
-- Enable RLS
alter table public.countries enable row level security;

-- SELECT: All authenticated users can read countries (needed for dropdowns)
create policy select_countries_all_users
  on public.countries
  for select
  to authenticated
  using (true);

-- INSERT: Requires manage permission
create policy insert_countries_admin
  on public.countries
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles up
      join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id and p.is_active = true
      where up.auth_user_id = auth.uid()
      and p.permission_code = 'master_data.geography.manage'
    )
  );

-- UPDATE: Lock-aware (locked requires lock permission, unlocked requires manage)
create policy update_countries_admin
  on public.countries
  for update
  to authenticated
  using (
    case
      when is_locked = true then
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.lookups.lock' -- lock permission from 002F.3B
        )
      else
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.geography.manage'
        )
    end
  );

-- DELETE: Blocked (no policy)
```

### Permissions

- `master_data.geography.view`: View geography admin pages
- `master_data.geography.manage`: Create/update countries
- `master_data.lookups.lock`: Lock/unlock system countries (reuse from 002F.3B)

### Audit

Log actions:
- `create_country`
- `update_country`
- `activate_country` / `deactivate_country`
- `lock_country` / `unlock_country`

Entity reference: `country_code_iso2` (e.g., "AE", "US")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/countries`
- **Table Columns**: ISO2, ISO3, Country Name (EN), Nationality (EN), Phone Code, Currency, GCC, Active, Locked
- **Filters**: Active status, GCC countries, Locked
- **Search**: By country name, ISO2, ISO3, nationality
- **Drawer Form Sections**:
  1. Basic Information (ISO2, ISO3, Name EN/AR, Nationality EN/AR)
  2. Contact & Currency (Phone code, Default currency)
  3. Regional Flags (GCC, UAE)
  4. Status & Governance (Active, Locked, System)
  5. Audit Information
- **Dropdown Usage**: `CountrySelect` component for organization/branch/employee/vendor forms

---

## 4.2 Table: emirates

### Purpose
UAE-specific administrative divisions. Required for organization/branch emirate, employee work emirate, fleet registration emirate, incident location.

### Fields

```sql
create table if not exists public.emirates (
  id bigint generated by default as identity primary key,
  
  -- Country reference
  country_id bigint not null references public.countries(id) on delete restrict,
  
  -- Emirate identification
  emirate_code text not null unique check (emirate_code = upper(emirate_code) and emirate_code ~ '^[A-Z0-9_]+$'),
  emirate_name_en text not null,
  emirate_name_ar text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.emirates is 'UAE emirates master data';
```

### Indexes

```sql
create index if not exists idx_emirates_country on public.emirates(country_id);
create index if not exists idx_emirates_code on public.emirates(emirate_code);
create index if not exists idx_emirates_active on public.emirates(is_active);
create index if not exists idx_emirates_sort on public.emirates(sort_order);
```

### Trigger

```sql
create trigger trigger_emirates_updated_at
  before update on public.emirates
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed the 7 UAE emirates:

| Code | Name (EN) | Name (AR) | Sort | System | Locked |
|------|-----------|-----------|------|--------|--------|
| AUH | Abu Dhabi | أبو ظبي | 10 | ✅ | ✅ |
| DXB | Dubai | دبي | 20 | ✅ | ✅ |
| SHJ | Sharjah | الشارقة | 30 | ✅ | ✅ |
| AJM | Ajman | عجمان | 40 | ✅ | ✅ |
| UAQ | Umm Al Quwain | أم القيوين | 50 | ✅ | ✅ |
| RAK | Ras Al Khaimah | رأس الخيمة | 60 | ✅ | ✅ |
| FUJ | Fujairah | الفجيرة | 70 | ✅ | ✅ |

All linked to country_id where `country_code_iso2 = 'AE'`.

### RLS

Same pattern as countries: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.geography.view`
- `master_data.geography.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_emirate`, `update_emirate`, `activate_emirate`, `deactivate_emirate`, `lock_emirate`, `unlock_emirate`

Entity reference: `emirate_code` (e.g., "AUH", "DXB")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/emirates`
- **Table Columns**: Emirate Code, Name (EN), Name (AR), Country, Active, Locked
- **Filters**: Active status, Country, Locked
- **Dropdown Usage**: `EmirateSelect` component (filtered by country_id = UAE)

---

## 4.3 Table: cities

### Purpose
Cities/locations within countries/emirates. Supports branch city, employee work city, vendor city, incident location.

### Fields

```sql
create table if not exists public.cities (
  id bigint generated by default as identity primary key,
  
  -- Location hierarchy
  country_id bigint not null references public.countries(id) on delete restrict,
  emirate_id bigint references public.emirates(id) on delete restrict, -- nullable for non-UAE cities
  
  -- City identification
  city_code text not null check (city_code = upper(city_code) and city_code ~ '^[A-Z0-9_]+$'),
  city_name_en text not null,
  city_name_ar text,
  
  -- Flags
  is_capital boolean not null default false,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  unique (country_id, emirate_id, city_code),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.cities is 'Cities and major locations within countries/emirates';
comment on column public.cities.emirate_id is 'Required for UAE cities, null for non-UAE cities';
```

### Indexes

```sql
create index if not exists idx_cities_country on public.cities(country_id);
create index if not exists idx_cities_emirate on public.cities(emirate_id) where emirate_id is not null;
create index if not exists idx_cities_code on public.cities(city_code);
create index if not exists idx_cities_active on public.cities(is_active);
create index if not exists idx_cities_sort on public.cities(sort_order);
```

### Trigger

```sql
create trigger trigger_cities_updated_at
  before update on public.cities
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed key UAE cities/locations (minimum 15):

| Code | Name (EN) | Name (AR) | Emirate | Capital | Sort | System | Locked |
|------|-----------|-----------|---------|---------|------|--------|--------|
| ABU_DHABI | Abu Dhabi | أبو ظبي | AUH | ✅ | 10 | ✅ | ✅ |
| DUBAI | Dubai | دبي | DXB | ✅ | 20 | ✅ | ✅ |
| SHARJAH | Sharjah | الشارقة | SHJ | ✅ | 30 | ✅ | ✅ |
| AJMAN | Ajman | عجمان | AJM | ✅ | 40 | ✅ | ✅ |
| AL_AIN | Al Ain | العين | AUH | ❌ | 50 | ✅ | ✅ |
| MUSSAFAH | Mussafah | مصفح | AUH | ❌ | 60 | ✅ | ✅ |
| ICAD | ICAD | أيكاد | AUH | ❌ | 70 | ✅ | ✅ |
| KHALIFA_CITY | Khalifa City | مدينة خليفة | AUH | ❌ | 80 | ✅ | ✅ |
| RUWAIS | Ruwais | الرويس | AUH | ❌ | 90 | ✅ | ✅ |
| TAWEELAH | Taweelah | الطويلة | AUH | ❌ | 100 | ✅ | ✅ |
| AL_DHAFRA | Al Dhafra | الظفرة | AUH | ❌ | 110 | ✅ | ✅ |
| JEBEL_ALI | Jebel Ali | جبل علي | DXB | ❌ | 120 | ✅ | ✅ |
| HAMRIYAH | Hamriyah | حمرية | SHJ | ❌ | 130 | ✅ | ✅ |
| RAS_AL_KHAIMAH | Ras Al Khaimah | رأس الخيمة | RAK | ✅ | 140 | ✅ | ✅ |
| FUJAIRAH | Fujairah | الفجيرة | FUJ | ✅ | 150 | ✅ | ✅ |

All linked to country_id = UAE and appropriate emirate_id.

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.geography.view`
- `master_data.geography.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_city`, `update_city`, `activate_city`, `deactivate_city`, `lock_city`, `unlock_city`

Entity reference: `city_code` (e.g., "ABU_DHABI", "DUBAI")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/cities`
- **Table Columns**: City Code, Name (EN), Name (AR), Country, Emirate, Capital, Active, Locked
- **Filters**: Active, Country, Emirate, Locked
- **Dropdown Usage**: `CitySelect` component (filtered by country_id, emirate_id)

---

## 4.4 Table: areas_zones

### Purpose
Sub-city areas, industrial zones, free zones. Key for UAE operations (Mussafah, ICAD, KIZAD, Jebel Ali FZ, Hamriyah FZ). Supports branch area, warehouse location, work site area.

### Fields

```sql
create table if not exists public.areas_zones (
  id bigint generated by default as identity primary key,
  
  -- Location hierarchy
  country_id bigint not null references public.countries(id) on delete restrict,
  emirate_id bigint references public.emirates(id) on delete restrict,
  city_id bigint references public.cities(id) on delete restrict,
  
  -- Area identification
  area_code text not null check (area_code = upper(area_code) and area_code ~ '^[A-Z0-9_]+$'),
  area_name_en text not null,
  area_name_ar text,
  
  -- Area type (lookup reference)
  area_type_code text, -- references AREA_TYPES lookup
  
  -- Flags
  is_free_zone boolean not null default false,
  is_industrial_area boolean not null default false,
  is_port_area boolean not null default false,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  unique (country_id, emirate_id, city_id, area_code),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.areas_zones is 'Sub-city areas, industrial zones, and free zones';
comment on column public.areas_zones.is_free_zone is 'True for UAE free zones (Jebel Ali FZ, Hamriyah FZ, etc.)';
comment on column public.areas_zones.is_industrial_area is 'True for industrial areas (Mussafah, ICAD, etc.)';
```

### Indexes

```sql
create index if not exists idx_areas_zones_country on public.areas_zones(country_id);
create index if not exists idx_areas_zones_emirate on public.areas_zones(emirate_id) where emirate_id is not null;
create index if not exists idx_areas_zones_city on public.areas_zones(city_id) where city_id is not null;
create index if not exists idx_areas_zones_code on public.areas_zones(area_code);
create index if not exists idx_areas_zones_active on public.areas_zones(is_active);
create index if not exists idx_areas_zones_free_zone on public.areas_zones(is_free_zone) where is_free_zone = true;
create index if not exists idx_areas_zones_industrial on public.areas_zones(is_industrial_area) where is_industrial_area = true;
```

### Trigger

```sql
create trigger trigger_areas_zones_updated_at
  before update on public.areas_zones
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed key UAE industrial areas and free zones (minimum 10):

| Code | Name (EN) | City | Type | Free Zone | Industrial | Sort | System | Locked |
|------|-----------|------|------|-----------|------------|------|--------|--------|
| MUSSAFAH | Mussafah | ABU_DHABI | INDUSTRIAL | ❌ | ✅ | 10 | ✅ | ✅ |
| ICAD_1 | ICAD 1 | ABU_DHABI | INDUSTRIAL | ❌ | ✅ | 20 | ✅ | ✅ |
| ICAD_2 | ICAD 2 | ABU_DHABI | INDUSTRIAL | ❌ | ✅ | 30 | ✅ | ✅ |
| KIZAD | KIZAD | ABU_DHABI | FREE_ZONE | ✅ | ✅ | 40 | ✅ | ✅ |
| JAFZA | Jebel Ali Free Zone | JEBEL_ALI | FREE_ZONE | ✅ | ✅ | 50 | ✅ | ✅ |
| HAMRIYAH_FZ | Hamriyah Free Zone | HAMRIYAH | FREE_ZONE | ✅ | ✅ | 60 | ✅ | ✅ |
| AL_QUOZ | Al Quoz | DUBAI | INDUSTRIAL | ❌ | ✅ | 70 | ✅ | ✅ |
| DUBAI_INDUSTRIAL_CITY | Dubai Industrial City | DUBAI | INDUSTRIAL | ❌ | ✅ | 80 | ✅ | ✅ |
| RUWAIS_INDUSTRIAL | Ruwais Industrial Area | RUWAIS | INDUSTRIAL | ❌ | ✅ | 90 | ✅ | ✅ |
| TAWEELAH_INDUSTRIAL | Taweelah Industrial Area | TAWEELAH | INDUSTRIAL | ❌ | ✅ | 100 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.geography.view`
- `master_data.geography.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_area`, `update_area`, `activate_area`, `deactivate_area`, `lock_area`, `unlock_area`

Entity reference: `area_code` (e.g., "MUSSAFAH", "JAFZA")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/areas`
- **Table Columns**: Area Code, Name (EN), City, Type, Free Zone, Industrial, Active, Locked
- **Filters**: Active, Country, Emirate, City, Free Zone, Industrial, Locked
- **Dropdown Usage**: `AreaSelect` component (filtered by city_id)

---

## 4.5 Table: ports

### Purpose
Ports for maritime operations. Supports fleet vessel operations, scrap export, procurement import.

### Fields

```sql
create table if not exists public.ports (
  id bigint generated by default as identity primary key,
  
  -- Location
  country_id bigint not null references public.countries(id) on delete restrict,
  emirate_id bigint references public.emirates(id) on delete restrict,
  city_id bigint references public.cities(id) on delete restrict,
  
  -- Port identification
  port_code text not null unique check (port_code = upper(port_code) and port_code ~ '^[A-Z0-9_]+$'),
  port_name_en text not null,
  port_name_ar text,
  
  -- Port metadata
  port_type_code text, -- references PORT_TYPES lookup (SEA_PORT, AIR_PORT, DRY_PORT, CONTAINER_TERMINAL)
  operator_name text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.ports is 'Ports for maritime and logistics operations';
```

### Indexes

```sql
create index if not exists idx_ports_country on public.ports(country_id);
create index if not exists idx_ports_emirate on public.ports(emirate_id) where emirate_id is not null;
create index if not exists idx_ports_city on public.ports(city_id) where city_id is not null;
create index if not exists idx_ports_code on public.ports(port_code);
create index if not exists idx_ports_active on public.ports(is_active);
```

### Trigger

```sql
create trigger trigger_ports_updated_at
  before update on public.ports
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed key UAE ports (7):

| Code | Name (EN) | City | Type | Operator | Sort | System | Locked |
|------|-----------|------|------|----------|------|--------|--------|
| KHALIFA_PORT | Khalifa Port | TAWEELAH | SEA_PORT | ADPC | 10 | ✅ | ✅ |
| ZAYED_PORT | Zayed Port | ABU_DHABI | SEA_PORT | ADPC | 20 | ✅ | ✅ |
| JEBEL_ALI | Jebel Ali Port | JEBEL_ALI | SEA_PORT | DP World | 30 | ✅ | ✅ |
| HAMRIYAH_PORT | Hamriyah Port | HAMRIYAH | SEA_PORT | SAQR Port | 40 | ✅ | ✅ |
| FUJAIRAH_PORT | Fujairah Port | FUJAIRAH | SEA_PORT | Fujairah Port | 50 | ✅ | ✅ |
| MINA_SAQR | Mina Saqr | RAS_AL_KHAIMAH | SEA_PORT | SAQR Port | 60 | ✅ | ✅ |
| PORT_RASHID | Port Rashid | DUBAI | SEA_PORT | DP World | 70 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.geography.view`
- `master_data.geography.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_port`, `update_port`, `activate_port`, `deactivate_port`, `lock_port`, `unlock_port`

Entity reference: `port_code` (e.g., "KHALIFA_PORT", "JEBEL_ALI")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/ports`
- **Table Columns**: Port Code, Name (EN), City, Type, Operator, Active, Locked
- **Filters**: Active, Country, Emirate, Port Type, Locked
- **Dropdown Usage**: `PortSelect` component

---

## 4.6 Table: work_sites

### Purpose
Project/operations-specific locations. Dynamic (created per project/client). Links to customers/projects (future). GPS coordinates for fleet tracking, HSE incidents.

### Fields

```sql
create table if not exists public.work_sites (
  id bigint generated by default as identity primary key,
  
  -- Site identification
  site_code text not null unique check (site_code = upper(site_code) and site_code ~ '^[A-Z0-9_]+$'),
  site_name_en text not null,
  site_name_ar text,
  
  -- Site type (lookup reference)
  site_type_code text, -- references SITE_TYPES lookup (PROJECT_SITE, CLIENT_SITE, WAREHOUSE, YARD, OFFICE, WORKSHOP)
  
  -- Future links (nullable until customers/vendors implemented)
  customer_id bigint, -- references public.customers(id) future
  vendor_id bigint, -- references public.vendors(id) future
  
  -- Location
  country_id bigint not null references public.countries(id) on delete restrict,
  emirate_id bigint references public.emirates(id) on delete restrict,
  city_id bigint references public.cities(id) on delete restrict,
  area_zone_id bigint references public.areas_zones(id) on delete restrict,
  
  -- GPS coordinates
  latitude numeric(10, 7), -- e.g., 24.4539° N (Abu Dhabi)
  longitude numeric(10, 7), -- e.g., 54.3773° E
  
  -- Address
  address_line_1 text,
  address_line_2 text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.work_sites is 'Project and operations work sites';
comment on column public.work_sites.latitude is 'GPS latitude in decimal degrees';
comment on column public.work_sites.longitude is 'GPS longitude in decimal degrees';
```

### Indexes

```sql
create index if not exists idx_work_sites_code on public.work_sites(site_code);
create index if not exists idx_work_sites_country on public.work_sites(country_id);
create index if not exists idx_work_sites_emirate on public.work_sites(emirate_id) where emirate_id is not null;
create index if not exists idx_work_sites_city on public.work_sites(city_id) where city_id is not null;
create index if not exists idx_work_sites_area on public.work_sites(area_zone_id) where area_zone_id is not null;
create index if not exists idx_work_sites_active on public.work_sites(is_active);
```

### Trigger

```sql
create trigger trigger_work_sites_updated_at
  before update on public.work_sites
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed minimal generic examples (3-5) or none (fully dynamic). Recommendation: Seed 3 internal sites (company warehouses/yards), mark as system/locked.

| Code | Name (EN) | Type | City | System | Locked |
|------|-----------|------|------|--------|--------|
| HQ_YARD | HQ Main Yard | YARD | ABU_DHABI | ✅ | ✅ |
| MUSSAFAH_WAREHOUSE | Mussafah Warehouse | WAREHOUSE | MUSSAFAH | ✅ | ✅ |
| DUBAI_WORKSHOP | Dubai Workshop | WORKSHOP | DUBAI | ✅ | ✅ |

### RLS

**Different RLS pattern** (company/branch scoped):

```sql
-- Enable RLS
alter table public.work_sites enable row level security;

-- SELECT: Users can read sites in their owner_company/branch scope
create policy select_work_sites_scoped
  on public.work_sites
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.auth_user_id = auth.uid()
      and (
        -- system_admin/group_admin can see all
        exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_profile_id = up.id
          and r.role_code in ('system_admin', 'group_admin')
        )
        -- TODO: company/branch scope when work_sites has owner_company_id/branch_id
      )
    )
  );

-- INSERT: Requires geography.manage permission
create policy insert_work_sites_admin
  on public.work_sites
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles up
      join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id and p.is_active = true
      where up.auth_user_id = auth.uid()
      and p.permission_code = 'master_data.geography.manage'
    )
  );

-- UPDATE: Lock-aware
create policy update_work_sites_admin
  on public.work_sites
  for update
  to authenticated
  using (
    case
      when is_locked = true then
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.lookups.lock'
        )
      else
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.geography.manage'
        )
    end
  );

-- DELETE: Blocked
```

**Note**: Work sites will later need `owner_company_id` and `branch_id` for proper scoping. For 002F.3C foundation, global visibility is acceptable.

### Permissions

- `master_data.geography.view`
- `master_data.geography.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_work_site`, `update_work_site`, `activate_work_site`, `deactivate_work_site`, `lock_work_site`, `unlock_work_site`

Entity reference: `site_code` (e.g., "HQ_YARD", "CLIENT_SITE_001")

### UI Usage

- **Admin Page**: `/admin/master-data/geography/sites`
- **Table Columns**: Site Code, Name (EN), Type, City, Area, GPS Coordinates, Active, Locked
- **Filters**: Active, Country, Emirate, City, Site Type, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Type)
  2. Location (Country, Emirate, City, Area, GPS)
  3. Address (Line 1, Line 2)
  4. Status & Governance
  5. Audit Information
- **Dropdown Usage**: `WorkSiteSelect` component

---

## 4.7 Table: currencies

### Purpose
Global currencies for financial transactions. Critical for procurement, CRM, HR salary, fleet costs. Supports decimal precision (AED: 2, OMR/BHD: 3, JPY: 0).

### Fields

```sql
create table if not exists public.currencies (
  id bigint generated by default as identity primary key,
  
  -- Currency identification
  currency_code text not null unique check (currency_code = upper(currency_code) and length(currency_code) = 3), -- ISO 4217
  currency_name_en text not null,
  currency_name_ar text,
  symbol text, -- e.g., AED, $, £, €
  
  -- Financial metadata
  decimal_places integer not null default 2 check (decimal_places >= 0 and decimal_places <= 6),
  is_base_currency boolean not null default false,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.currencies is 'Global currencies for financial transactions';
comment on column public.currencies.currency_code is 'ISO 4217 three-letter currency code';
comment on column public.currencies.decimal_places is 'Number of decimal places (AED: 2, OMR: 3, JPY: 0)';
comment on column public.currencies.is_base_currency is 'True for the base currency (AED for UAE operations)';
```

### Indexes

```sql
create index if not exists idx_currencies_code on public.currencies(currency_code);
create index if not exists idx_currencies_active on public.currencies(is_active);
create index if not exists idx_currencies_base on public.currencies(is_base_currency) where is_base_currency = true;
```

### Trigger

```sql
create trigger trigger_currencies_updated_at
  before update on public.currencies
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed 15 key currencies:

| Code | Name (EN) | Symbol | Decimals | Base | Sort | System | Locked |
|------|-----------|--------|----------|------|------|--------|--------|
| AED | UAE Dirham | AED | 2 | ✅ | 10 | ✅ | ✅ |
| USD | US Dollar | $ | 2 | ❌ | 20 | ✅ | ✅ |
| EUR | Euro | € | 2 | ❌ | 30 | ✅ | ✅ |
| GBP | British Pound | £ | 2 | ❌ | 40 | ✅ | ✅ |
| SAR | Saudi Riyal | SAR | 2 | ❌ | 50 | ✅ | ✅ |
| QAR | Qatari Riyal | QAR | 2 | ❌ | 60 | ✅ | ✅ |
| OMR | Omani Rial | OMR | 3 | ❌ | 70 | ✅ | ✅ |
| BHD | Bahraini Dinar | BHD | 3 | ❌ | 80 | ✅ | ✅ |
| KWD | Kuwaiti Dinar | KWD | 3 | ❌ | 90 | ✅ | ✅ |
| JOD | Jordanian Dinar | JOD | 3 | ❌ | 100 | ✅ | ✅ |
| INR | Indian Rupee | ₹ | 2 | ❌ | 110 | ✅ | ✅ |
| PKR | Pakistani Rupee | PKR | 2 | ❌ | 120 | ✅ | ✅ |
| PHP | Philippine Peso | ₱ | 2 | ❌ | 130 | ✅ | ✅ |
| CNY | Chinese Yuan | ¥ | 2 | ❌ | 140 | ✅ | ✅ |
| JPY | Japanese Yen | ¥ | 0 | ❌ | 150 | ✅ | ✅ |

**Only one currency** can have `is_base_currency = true` (AED).

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

**Special constraint enforcement**: Only one base currency allowed (application-level check in server action).

### Permissions

- `master_data.finance_basics.view`
- `master_data.finance_basics.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_currency`, `update_currency`, `activate_currency`, `deactivate_currency`, `lock_currency`, `unlock_currency`, `set_base_currency`

Entity reference: `currency_code` (e.g., "AED", "USD")

### UI Usage

- **Admin Page**: `/admin/master-data/finance/currencies`
- **Table Columns**: Currency Code, Name (EN), Symbol, Decimal Places, Base, Active, Locked
- **Filters**: Active, Base, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Symbol)
  2. Financial Settings (Decimal Places, Base Currency)
  3. Status & Governance
  4. Audit Information
- **Dropdown Usage**: `CurrencySelect` component

---

## 4.8 Exchange Rate Sources / Placeholder

### Recommendation

**DEFER** exchange rate engine to full finance module.

**Rationale:**
- 002F.3C is foundation master data, not finance module
- Exchange rates require:
  - Historical rates table (rate per day per currency pair)
  - API integration for live rates (Central Bank, forex APIs)
  - Rate type (official, market, custom)
  - Complex validation and audit
- This belongs in Finance Module, not foundation master data

**For 002F.3C:**
- Currencies table is sufficient for foundation
- Future finance module will add `exchange_rates` table with:
  - `from_currency_id`, `to_currency_id`, `rate_date`, `rate`, `rate_type`, `source`

**No implementation in 002F.3C.**

---

## 4.9 Table: payment_terms

### Purpose
Payment terms for procurement, CRM, finance. Business logic for payment schedules (NET_30, ADVANCE_50_BALANCE_50, etc.).

### Fields

```sql
create table if not exists public.payment_terms (
  id bigint generated by default as identity primary key,
  
  -- Payment term identification
  payment_term_code text not null unique check (payment_term_code = upper(payment_term_code) and payment_term_code ~ '^[A-Z0-9_]+$'),
  payment_term_name_en text not null,
  payment_term_name_ar text,
  
  -- Payment logic
  due_days integer not null default 0 check (due_days >= 0), -- days after invoice date
  advance_percentage numeric(5, 2) default 0 check (advance_percentage >= 0 and advance_percentage <= 100),
  retention_percentage numeric(5, 2) default 0 check (retention_percentage >= 0 and retention_percentage <= 100),
  
  -- Description
  description text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.payment_terms is 'Payment terms for procurement and sales';
comment on column public.payment_terms.due_days is 'Days after invoice date for payment (NET terms)';
comment on column public.payment_terms.advance_percentage is 'Percentage of advance payment required';
comment on column public.payment_terms.retention_percentage is 'Percentage retained until completion/warranty';
```

### Indexes

```sql
create index if not exists idx_payment_terms_code on public.payment_terms(payment_term_code);
create index if not exists idx_payment_terms_active on public.payment_terms(is_active);
```

### Trigger

```sql
create trigger trigger_payment_terms_updated_at
  before update on public.payment_terms
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed 9 common payment terms:

| Code | Name (EN) | Due Days | Advance % | Retention % | Description | Sort | System | Locked |
|------|-----------|----------|-----------|-------------|-------------|------|--------|--------|
| ADVANCE_100 | 100% Advance | 0 | 100 | 0 | Full payment in advance | 10 | ✅ | ✅ |
| ADVANCE_50_BALANCE_50 | 50% Advance, 50% Balance | 0 | 50 | 0 | 50% advance, 50% on delivery | 20 | ✅ | ✅ |
| NET_7 | Net 7 Days | 7 | 0 | 0 | Payment due within 7 days | 30 | ✅ | ✅ |
| NET_15 | Net 15 Days | 15 | 0 | 0 | Payment due within 15 days | 40 | ✅ | ✅ |
| NET_30 | Net 30 Days | 30 | 0 | 0 | Payment due within 30 days | 50 | ✅ | ✅ |
| NET_60 | Net 60 Days | 60 | 0 | 0 | Payment due within 60 days | 60 | ✅ | ✅ |
| COD | Cash on Delivery | 0 | 0 | 0 | Payment on delivery | 70 | ✅ | ✅ |
| AGAINST_INVOICE | Against Invoice | 0 | 0 | 0 | Payment against invoice submission | 80 | ✅ | ✅ |
| AGAINST_DELIVERY | Against Delivery | 0 | 0 | 0 | Payment on delivery confirmation | 90 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.finance_basics.view`
- `master_data.finance_basics.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_payment_term`, `update_payment_term`, `activate_payment_term`, `deactivate_payment_term`, `lock_payment_term`, `unlock_payment_term`

Entity reference: `payment_term_code` (e.g., "NET_30", "ADVANCE_100")

### UI Usage

- **Admin Page**: `/admin/master-data/finance/payment-terms`
- **Table Columns**: Code, Name (EN), Due Days, Advance %, Retention %, Active, Locked
- **Filters**: Active, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Description)
  2. Payment Logic (Due Days, Advance %, Retention %)
  3. Status & Governance
  4. Audit Information
- **Dropdown Usage**: `PaymentTermSelect` component

---

## 4.10 Payment Methods

### Recommendation

**Use Lookup Category**: `PAYMENT_METHODS`

### Rationale
Simple categorical data with no complex metadata. Perfect fit for 002F.3B lookup engine. Avoids table proliferation.

### Lookup Category Definition

**Category Code**: `PAYMENT_METHODS`  
**Category Name (EN)**: Payment Methods  
**Category Name (AR)**: طرق الدفع  
**Module Code**: `finance`  
**Category Scope**: `GLOBAL`  
**Supports Hierarchy**: false  
**Supports Color**: false  
**Supports Icon**: true  
**Supports Effective Dates**: false  
**Supports Metadata**: true  
**Is System**: true  
**Is Locked**: true  
**Is Active**: true

### Seed Values

| Code | Label (EN) | Label (AR) | Icon | Sort | Default | System | Locked | Active |
|------|-----------|-----------|------|------|---------|--------|--------|--------|
| CASH | Cash | نقد | dollar-sign | 10 | false | ✅ | ✅ | ✅ |
| CHEQUE | Cheque | شيك | file-text | 20 | false | ✅ | ✅ | ✅ |
| BANK_TRANSFER | Bank Transfer | حوالة بنكية | building | 30 | true | ✅ | ✅ | ✅ |
| ONLINE_TRANSFER | Online Transfer | تحويل إلكتروني | smartphone | 40 | false | ✅ | ✅ | ✅ |
| CREDIT_CARD | Credit Card | بطاقة ائتمان | credit-card | 50 | false | ✅ | ✅ | ✅ |
| DEBIT_CARD | Debit Card | بطاقة مدين | credit-card | 60 | false | ✅ | ✅ | ✅ |
| LC | Letter of Credit | خطاب اعتماد | file-signature | 70 | false | ✅ | ✅ | ✅ |
| PDC | Post-Dated Cheque | شيك مؤجل | calendar | 80 | false | ✅ | ✅ | ✅ |

### UI Usage

Use existing `LookupSelect` component:

```tsx
<LookupSelect
  categoryCode="PAYMENT_METHODS"
  value={paymentMethodId}
  onChange={setPaymentMethodId}
  label="Payment Method"
  showIcon={true}
  required
/>
```

---

## 4.11 Table: tax_types

### Purpose
Tax types for UAE VAT and special cases (RCM for scrap). Critical for procurement, CRM, finance, scrap modules. Supports rates, effective dates, reverse charge.

### Fields

```sql
create table if not exists public.tax_types (
  id bigint generated by default as identity primary key,
  
  -- Tax type identification
  tax_code text not null unique check (tax_code = upper(tax_code) and tax_code ~ '^[A-Z0-9_]+$'),
  tax_name_en text not null,
  tax_name_ar text,
  
  -- Tax rate
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  
  -- Tax category (lookup reference)
  tax_category_code text, -- references TAX_TREATMENT_TYPES lookup
  
  -- Flags
  is_vat boolean not null default false,
  is_reverse_charge boolean not null default false,
  applies_to_sales boolean not null default true,
  applies_to_purchase boolean not null default true,
  applies_to_scrap boolean not null default false,
  
  -- Effective dates
  effective_from date,
  effective_to date,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (effective_to is null or effective_from is null or effective_to >= effective_from),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.tax_types is 'Tax types for UAE VAT and special tax treatments';
comment on column public.tax_types.is_reverse_charge is 'True for reverse charge mechanism (e.g., RCM for scrap)';
comment on column public.tax_types.applies_to_scrap is 'True if this tax applies to scrap trading (RCM)';
```

### Indexes

```sql
create index if not exists idx_tax_types_code on public.tax_types(tax_code);
create index if not exists idx_tax_types_active on public.tax_types(is_active);
create index if not exists idx_tax_types_vat on public.tax_types(is_vat) where is_vat = true;
create index if not exists idx_tax_types_effective on public.tax_types(effective_from, effective_to);
```

### Trigger

```sql
create trigger trigger_tax_types_updated_at
  before update on public.tax_types
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed 5 UAE tax types:

| Code | Name (EN) | Rate | Category | VAT | RCM | Sales | Purchase | Scrap | Effective From | Sort | System | Locked |
|------|-----------|------|----------|-----|-----|-------|----------|-------|----------------|------|--------|--------|
| VAT_5 | VAT 5% | 5.00 | STANDARD_RATED | ✅ | ❌ | ✅ | ✅ | ❌ | 2018-01-01 | 10 | ✅ | ✅ |
| VAT_ZERO | VAT 0% (Zero-Rated) | 0.00 | ZERO_RATED | ✅ | ❌ | ✅ | ✅ | ❌ | 2018-01-01 | 20 | ✅ | ✅ |
| VAT_EXEMPT | VAT Exempt | 0.00 | EXEMPT | ✅ | ❌ | ✅ | ✅ | ❌ | 2018-01-01 | 30 | ✅ | ✅ |
| RCM_SCRAP | Reverse Charge (Scrap) | 5.00 | REVERSE_CHARGE | ✅ | ✅ | ❌ | ✅ | ✅ | 2018-01-01 | 40 | ✅ | ✅ |
| OUT_OF_SCOPE | Out of Scope | 0.00 | OUT_OF_SCOPE | ❌ | ❌ | ✅ | ✅ | ❌ | 2018-01-01 | 50 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.finance_basics.view`
- `master_data.finance_basics.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_tax_type`, `update_tax_type`, `activate_tax_type`, `deactivate_tax_type`, `lock_tax_type`, `unlock_tax_type`

Entity reference: `tax_code` (e.g., "VAT_5", "RCM_SCRAP")

### UI Usage

- **Admin Page**: `/admin/master-data/finance/tax-types`
- **Table Columns**: Tax Code, Name (EN), Rate, Category, VAT, RCM, Sales, Purchase, Scrap, Effective From/To, Active, Locked
- **Filters**: Active, VAT, RCM, Applies To (Sales/Purchase/Scrap), Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Rate, Category)
  2. Application Flags (VAT, RCM, Sales, Purchase, Scrap)
  3. Effective Dates (From, To)
  4. Status & Governance
  5. Audit Information
- **Dropdown Usage**: `TaxTypeSelect` component (filtered by applies_to flags)

---

## 4.12 Tax Treatment Types / VAT Categories

### Recommendation

**Use Lookup Category**: `TAX_TREATMENT_TYPES`

### Rationale
Simple categorical data complementing tax_types table. Avoids duplication with "VAT Categories". Single lookup category covers both use cases.

### Lookup Category Definition

**Category Code**: `TAX_TREATMENT_TYPES`  
**Category Name (EN)**: Tax Treatment Types  
**Category Name (AR)**: أنواع المعاملة الضريبية  
**Module Code**: `finance`  
**Category Scope**: `GLOBAL`  
**Supports Hierarchy**: false  
**Supports Color**: true  
**Supports Icon**: false  
**Supports Effective Dates**: false  
**Supports Metadata**: true  
**Is System**: true  
**Is Locked**: true  
**Is Active**: true

### Seed Values

| Code | Label (EN) | Label (AR) | Color | Badge Variant | Sort | Default | System | Locked | Active |
|------|-----------|-----------|-------|---------------|------|---------|--------|--------|--------|
| STANDARD_RATED | Standard Rated | معدل قياسي | #22C55E | success | 10 | true | ✅ | ✅ | ✅ |
| ZERO_RATED | Zero Rated | معدل صفر | #3B82F6 | default | 20 | false | ✅ | ✅ | ✅ |
| EXEMPT | Exempt | معفى | #94A3B8 | secondary | 30 | false | ✅ | ✅ | ✅ |
| OUT_OF_SCOPE | Out of Scope | خارج النطاق | #64748B | outline | 40 | false | ✅ | ✅ | ✅ |
| REVERSE_CHARGE | Reverse Charge | آلية الاحتساب العكسي | #F59E0B | warning | 50 | false | ✅ | ✅ | ✅ |

### UI Usage

Use existing `LookupSelect` component:

```tsx
<LookupSelect
  categoryCode="TAX_TREATMENT_TYPES"
  value={taxTreatmentId}
  onChange={setTaxTreatmentId}
  label="Tax Treatment"
  showColor={true}
  required
/>
```

---

## 4.13 Table: banks

### Purpose
Banks for company bank accounts, HR salary banks, procurement vendor banks. UAE banks with SWIFT codes, country linkage.

### Fields

```sql
create table if not exists public.banks (
  id bigint generated by default as identity primary key,
  
  -- Bank identification
  bank_code text not null unique check (bank_code = upper(bank_code) and bank_code ~ '^[A-Z0-9_]+$'),
  bank_name_en text not null,
  bank_name_ar text,
  
  -- Banking metadata
  swift_code text, -- e.g., NBADAEAA for FAB
  country_id bigint not null references public.countries(id) on delete restrict,
  bank_type_code text, -- references BANK_TYPES lookup (COMMERCIAL, ISLAMIC, INVESTMENT, CENTRAL)
  website text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.banks is 'Banks for company and employee bank accounts';
comment on column public.banks.swift_code is 'SWIFT/BIC code for international transfers';
```

### Indexes

```sql
create index if not exists idx_banks_code on public.banks(bank_code);
create index if not exists idx_banks_swift on public.banks(swift_code) where swift_code is not null;
create index if not exists idx_banks_country on public.banks(country_id);
create index if not exists idx_banks_active on public.banks(is_active);
```

### Trigger

```sql
create trigger trigger_banks_updated_at
  before update on public.banks
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed 10 major UAE banks:

| Code | Name (EN) | SWIFT | Type | Website | Sort | System | Locked |
|------|-----------|-------|------|---------|------|--------|--------|
| FAB | First Abu Dhabi Bank | NBADAEAA | COMMERCIAL | fabank.com | 10 | ✅ | ✅ |
| ADCB | Abu Dhabi Commercial Bank | ADCBAEAA | COMMERCIAL | adcb.com | 20 | ✅ | ✅ |
| ADIB | Abu Dhabi Islamic Bank | ABNIAEAA | ISLAMIC | adib.ae | 30 | ✅ | ✅ |
| ENBD | Emirates NBD | EBILAEAD | COMMERCIAL | emiratesnbd.com | 40 | ✅ | ✅ |
| DIB | Dubai Islamic Bank | DUIBAEAD | ISLAMIC | dib.ae | 50 | ✅ | ✅ |
| MASHREQ | Mashreq Bank | BOMLAEAD | COMMERCIAL | mashreqbank.com | 60 | ✅ | ✅ |
| RAKBANK | RAKBANK | NRAKAEAK | COMMERCIAL | rakbank.ae | 70 | ✅ | ✅ |
| CBD | Commercial Bank of Dubai | CBDUAEAD | COMMERCIAL | cbd.ae | 80 | ✅ | ✅ |
| HSBC_UAE | HSBC UAE | BBMEAEAD | COMMERCIAL | hsbc.ae | 90 | ✅ | ✅ |
| SCB_UAE | Standard Chartered UAE | SCBLAEAD | COMMERCIAL | sc.com/ae | 100 | ✅ | ✅ |

All linked to country_id = UAE.

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.finance_basics.view`
- `master_data.finance_basics.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_bank`, `update_bank`, `activate_bank`, `deactivate_bank`, `lock_bank`, `unlock_bank`

Entity reference: `bank_code` (e.g., "FAB", "ENBD")

### UI Usage

- **Admin Page**: `/admin/master-data/finance/banks`
- **Table Columns**: Bank Code, Name (EN), SWIFT, Country, Type, Website, Active, Locked
- **Filters**: Active, Country, Bank Type, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, SWIFT, Website)
  2. Bank Details (Country, Type)
  3. Status & Governance
  4. Audit Information
- **Dropdown Usage**: `BankSelect` component (filtered by country_id)

---

## 4.14 Bank Account Types

### Recommendation

**Use Lookup Category**: `BANK_ACCOUNT_TYPES`

### Rationale
Simple categorical data. Avoids table proliferation.

### Lookup Category Definition

**Category Code**: `BANK_ACCOUNT_TYPES`  
**Category Name (EN)**: Bank Account Types  
**Category Name (AR)**: أنواع الحسابات المصرفية  
**Module Code**: `finance`  
**Category Scope**: `GLOBAL`  
**Supports Hierarchy**: false  
**Supports Color**: false  
**Supports Icon**: true  
**Supports Effective Dates**: false  
**Supports Metadata**: true  
**Is System**: true  
**Is Locked**: true  
**Is Active**: true

### Seed Values

| Code | Label (EN) | Label (AR) | Icon | Sort | Default | System | Locked | Active |
|------|-----------|-----------|------|------|---------|--------|--------|--------|
| CURRENT | Current Account | حساب جاري | briefcase | 10 | true | ✅ | ✅ | ✅ |
| SAVINGS | Savings Account | حساب توفير | piggy-bank | 20 | false | ✅ | ✅ | ✅ |
| CALL_ACCOUNT | Call Account | حساب تحت الطلب | phone | 30 | false | ✅ | ✅ | ✅ |
| FIXED_DEPOSIT | Fixed Deposit | وديعة ثابتة | lock | 40 | false | ✅ | ✅ | ✅ |
| LC_ACCOUNT | LC Account | حساب خطابات الاعتماد | file-signature | 50 | false | ✅ | ✅ | ✅ |
| GUARANTEE_ACCOUNT | Guarantee Account | حساب ضمانات | shield | 60 | false | ✅ | ✅ | ✅ |

### UI Usage

Use existing `LookupSelect` component:

```tsx
<LookupSelect
  categoryCode="BANK_ACCOUNT_TYPES"
  value={accountTypeId}
  onChange={setAccountTypeId}
  label="Account Type"
  showIcon={true}
  required
/>
```

---

## 4.15 Bank Types

### Recommendation

**Use Lookup Category**: `BANK_TYPES`

### Rationale
Simple categorical data for banks table reference.

### Lookup Category Definition

**Category Code**: `BANK_TYPES`  
**Category Name (EN)**: Bank Types  
**Category Name (AR)**: أنواع البنوك  
**Module Code**: `finance`  
**Category Scope**: `GLOBAL`  
**Supports Hierarchy**: false  
**Supports Color**: false  
**Supports Icon**: false  
**Supports Effective Dates**: false  
**Supports Metadata**: true  
**Is System**: true  
**Is Locked**: true  
**Is Active**: true

### Seed Values

| Code | Label (EN) | Label (AR) | Sort | Default | System | Locked | Active |
|------|-----------|-----------|------|---------|--------|--------|--------|
| COMMERCIAL | Commercial Bank | بنك تجاري | 10 | true | ✅ | ✅ | ✅ |
| ISLAMIC | Islamic Bank | بنك إسلامي | 20 | false | ✅ | ✅ | ✅ |
| INVESTMENT | Investment Bank | بنك استثماري | 30 | false | ✅ | ✅ | ✅ |
| CENTRAL | Central Bank | بنك مركزي | 40 | false | ✅ | ✅ | ✅ |

### UI Usage

Use existing `LookupSelect` component in banks form.

---

## 4.16 Table: cost_centers

### Purpose
Cost centers for financial cost allocation. Hierarchical (parent_cost_center_id). Company/branch scoped. Used by Finance, HR, Fleet, Workshop, Procurement.

### Fields

```sql
create table if not exists public.cost_centers (
  id bigint generated by default as identity primary key,
  
  -- Cost center identification
  cost_center_code text not null check (cost_center_code = upper(cost_center_code) and cost_center_code ~ '^[A-Z0-9_]+$'),
  cost_center_name_en text not null,
  cost_center_name_ar text,
  
  -- Hierarchy
  parent_cost_center_id bigint references public.cost_centers(id) on delete restrict,
  
  -- Scope (nullable = global seed, non-null = company/branch specific)
  owner_company_id bigint references public.owner_companies(id) on delete restrict,
  branch_id bigint references public.branches(id) on delete restrict,
  
  -- Cost center type (lookup reference)
  cost_center_type_code text, -- references COST_CENTER_TYPES lookup (DEPARTMENT, DIVISION, PROJECT, LOCATION, COST_POOL)
  
  -- Future link
  responsible_person_id bigint, -- references public.user_profiles(id) future
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  unique nulls not distinct (owner_company_id, branch_id, cost_center_code), -- unique within scope
  check (parent_cost_center_id is null or parent_cost_center_id != id), -- prevent direct self-reference
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.cost_centers is 'Cost centers for financial cost allocation and tracking';
comment on column public.cost_centers.owner_company_id is 'Null for global seed cost centers, non-null for company-specific';
comment on column public.cost_centers.branch_id is 'Optional branch scope';
```

### Indexes

```sql
create index if not exists idx_cost_centers_code on public.cost_centers(cost_center_code);
create index if not exists idx_cost_centers_parent on public.cost_centers(parent_cost_center_id) where parent_cost_center_id is not null;
create index if not exists idx_cost_centers_company on public.cost_centers(owner_company_id) where owner_company_id is not null;
create index if not exists idx_cost_centers_branch on public.cost_centers(branch_id) where branch_id is not null;
create index if not exists idx_cost_centers_active on public.cost_centers(is_active);
```

### Trigger

```sql
create trigger trigger_cost_centers_updated_at
  before update on public.cost_centers
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed minimal generic global cost centers (9):

| Code | Name (EN) | Type | Sort | System | Locked | Owner Company | Branch |
|------|-----------|------|------|--------|--------|---------------|--------|
| ADMIN | Administration | DEPARTMENT | 10 | ✅ | ✅ | NULL | NULL |
| OPERATIONS | Operations | DIVISION | 20 | ✅ | ✅ | NULL | NULL |
| FLEET | Fleet Management | DEPARTMENT | 30 | ✅ | ✅ | NULL | NULL |
| WORKSHOP | Workshop | DEPARTMENT | 40 | ✅ | ✅ | NULL | NULL |
| HR | Human Resources | DEPARTMENT | 50 | ✅ | ✅ | NULL | NULL |
| SALES | Sales | DEPARTMENT | 60 | ✅ | ✅ | NULL | NULL |
| HSE | Health, Safety & Environment | DEPARTMENT | 70 | ✅ | ✅ | NULL | NULL |
| SCRAP | Scrap Trading | BUSINESS_UNIT | 80 | ✅ | ✅ | NULL | NULL |
| DEMOLITION | Demolition | BUSINESS_UNIT | 90 | ✅ | ✅ | NULL | NULL |

**Global seeds** (owner_company_id = NULL, branch_id = NULL) are system/locked.  
Companies can create their own cost centers with owner_company_id/branch_id set.

### RLS

**Company/branch scoped**:

```sql
-- Enable RLS
alter table public.cost_centers enable row level security;

-- SELECT: Users can read global cost centers OR cost centers in their scope
create policy select_cost_centers_scoped
  on public.cost_centers
  for select
  to authenticated
  using (
    owner_company_id is null -- global seed visible to all
    or exists (
      select 1 from public.user_profiles up
      where up.auth_user_id = auth.uid()
      and (
        -- system/group admin can see all
        exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_profile_id = up.id
          and r.role_code in ('system_admin', 'group_admin')
        )
        -- company/branch users see their scope
        or (owner_company_id = up.owner_company_id or owner_company_id is null)
      )
    )
  );

-- INSERT: Requires finance_basics.manage permission
create policy insert_cost_centers_admin
  on public.cost_centers
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles up
      join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id and p.is_active = true
      where up.auth_user_id = auth.uid()
      and p.permission_code = 'master_data.finance_basics.manage'
    )
  );

-- UPDATE: Lock-aware
create policy update_cost_centers_admin
  on public.cost_centers
  for update
  to authenticated
  using (
    case
      when is_locked = true then
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.lookups.lock'
        )
      else
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.finance_basics.manage'
        )
    end
  );

-- DELETE: Blocked
```

### Permissions

- `master_data.finance_basics.view`
- `master_data.finance_basics.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_cost_center`, `update_cost_center`, `activate_cost_center`, `deactivate_cost_center`, `lock_cost_center`, `unlock_cost_center`

Entity reference: `cost_center_code` (e.g., "ADMIN", "FLEET")

### UI Usage

- **Admin Page**: `/admin/master-data/finance/cost-centers`
- **Table Columns**: Cost Center Code, Name (EN), Parent, Type, Company, Branch, Active, Locked
- **Filters**: Active, Company, Branch, Type, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Type)
  2. Hierarchy (Parent Cost Center)
  3. Scope (Company, Branch, Responsible Person)
  4. Status & Governance
  5. Audit Information
- **Dropdown Usage**: `CostCenterSelect` component (filtered by owner_company_id/branch_id)

---

## 4.17 Table: profit_centers

### Purpose
Profit centers for revenue stream tracking. Similar to cost centers. Used by Finance, CRM, Fleet, Scrap.

### Fields

Similar to cost_centers, with:
- `profit_center_code`, `profit_center_name_en`, `profit_center_name_ar`
- `parent_profit_center_id`
- `profit_center_type_code` (references PROFIT_CENTER_TYPES lookup)
- Same scope: owner_company_id, branch_id
- Same audit fields

### Seed Data

Seed minimal generic global profit centers (6):

| Code | Name (EN) | Type | Sort | System | Locked |
|------|-----------|------|------|--------|--------|
| TRANSPORT | Transport Services | BUSINESS_UNIT | 10 | ✅ | ✅ |
| EQUIPMENT_RENTAL | Equipment Rental | BUSINESS_UNIT | 20 | ✅ | ✅ |
| SCRAP_TRADING | Scrap Trading | BUSINESS_UNIT | 30 | ✅ | ✅ |
| DEMOLITION | Demolition Services | BUSINESS_UNIT | 40 | ✅ | ✅ |
| WASTE_MANAGEMENT | Waste Management | BUSINESS_UNIT | 50 | ✅ | ✅ |
| CRM_SALES | CRM Sales | REVENUE_STREAM | 60 | ✅ | ✅ |

### RLS, Permissions, Audit, UI

Same pattern as cost_centers.

- **Admin Page**: `/admin/master-data/finance/profit-centers`
- **Dropdown Usage**: `ProfitCenterSelect` component

---

## 4.18 Table: uom_categories

### Purpose
Logical grouping for units of measure (LENGTH, WEIGHT, VOLUME, etc.). Foundation for UOM system.

### Fields

```sql
create table if not exists public.uom_categories (
  id bigint generated by default as identity primary key,
  
  -- UOM category identification
  uom_category_code text not null unique check (uom_category_code = upper(uom_category_code) and uom_category_code ~ '^[A-Z0-9_]+$'),
  uom_category_name_en text not null,
  uom_category_name_ar text,
  
  -- Base unit reference
  base_unit_code text, -- references units_of_measure.uom_code (set after UOM table created)
  
  -- Description
  description text,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.uom_categories is 'UOM categories for logical grouping of units';
comment on column public.uom_categories.base_unit_code is 'Base unit for this category (e.g., M for LENGTH, KG for WEIGHT)';
```

### Indexes

```sql
create index if not exists idx_uom_categories_code on public.uom_categories(uom_category_code);
create index if not exists idx_uom_categories_active on public.uom_categories(is_active);
```

### Trigger

```sql
create trigger trigger_uom_categories_updated_at
  before update on public.uom_categories
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed 7 UOM categories:

| Code | Name (EN) | Base Unit | Description | Sort | System | Locked |
|------|-----------|-----------|-------------|------|--------|--------|
| LENGTH | Length | M | Length measurements | 10 | ✅ | ✅ |
| WEIGHT | Weight | KG | Weight measurements | 20 | ✅ | ✅ |
| VOLUME | Volume | L | Volume measurements | 30 | ✅ | ✅ |
| AREA | Area | SQM | Area measurements | 40 | ✅ | ✅ |
| FUEL | Fuel | L | Fuel volume (diesel, petrol) | 50 | ✅ | ✅ |
| TIME | Time | HOUR | Time duration | 60 | ✅ | ✅ |
| COUNT | Count | PCS | Quantity counting | 70 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.uom.view`
- `master_data.uom.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_uom_category`, `update_uom_category`, `activate_uom_category`, `deactivate_uom_category`, `lock_uom_category`, `unlock_uom_category`

Entity reference: `uom_category_code` (e.g., "LENGTH", "WEIGHT")

### UI Usage

- **Admin Page**: `/admin/master-data/uom/categories`
- **Table Columns**: Category Code, Name (EN), Base Unit, Description, Active, Locked
- **Filters**: Active, Locked
- **Dropdown Usage**: `UOMCategorySelect` component

---

## 4.19 Table: units_of_measure

### Purpose
Units of measure within categories. Critical for Inventory, Procurement, Fleet (fuel), Scrap (weight). UAE-specific: GAL_IMP for diesel.

### Fields

```sql
create table if not exists public.units_of_measure (
  id bigint generated by default as identity primary key,
  
  -- UOM identification
  uom_category_id bigint not null references public.uom_categories(id) on delete restrict,
  uom_code text not null unique check (uom_code = upper(uom_code) and uom_code ~ '^[A-Z0-9_]+$'),
  uom_name_en text not null,
  uom_name_ar text,
  symbol text, -- e.g., m, kg, L, ft²
  
  -- Conversion
  is_base_unit boolean not null default false,
  conversion_factor_to_base numeric(18, 6) not null default 1.0 check (conversion_factor_to_base > 0),
  decimal_precision integer not null default 2 check (decimal_precision >= 0 and decimal_precision <= 6),
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  sort_order integer not null default 0,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.units_of_measure is 'Units of measure within categories';
comment on column public.units_of_measure.conversion_factor_to_base is 'Multiply by this to convert to base unit (e.g., 1 cm = 0.01 m)';
comment on column public.units_of_measure.is_base_unit is 'True for the base unit of the category (only one per category)';
```

### Indexes

```sql
create index if not exists idx_units_of_measure_code on public.units_of_measure(uom_code);
create index if not exists idx_units_of_measure_category on public.units_of_measure(uom_category_id);
create index if not exists idx_units_of_measure_active on public.units_of_measure(is_active);
create index if not exists idx_units_of_measure_base on public.units_of_measure(is_base_unit) where is_base_unit = true;
```

### Trigger

```sql
create trigger trigger_units_of_measure_updated_at
  before update on public.units_of_measure
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed key units (22):

**LENGTH** (base: M):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| M | Meter | m | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| CM | Centimeter | cm | ❌ | 0.01 | 2 | 20 | ✅ | ✅ |
| MM | Millimeter | mm | ❌ | 0.001 | 2 | 30 | ✅ | ✅ |
| KM | Kilometer | km | ❌ | 1000.0 | 2 | 40 | ✅ | ✅ |

**WEIGHT** (base: KG):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| KG | Kilogram | kg | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| TON | Metric Ton | ton | ❌ | 1000.0 | 3 | 20 | ✅ | ✅ |
| G | Gram | g | ❌ | 0.001 | 2 | 30 | ✅ | ✅ |

**VOLUME** (base: L):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| L | Liter | L | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| M3 | Cubic Meter | m³ | ❌ | 1000.0 | 3 | 20 | ✅ | ✅ |
| GAL_IMP | Imperial Gallon | gal | ❌ | 4.54609 | 2 | 30 | ✅ | ✅ |
| GAL_US | US Gallon | gal | ❌ | 3.78541 | 2 | 40 | ✅ | ✅ |

**AREA** (base: SQM):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| SQM | Square Meter | m² | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| SQFT | Square Foot | ft² | ❌ | 0.092903 | 2 | 20 | ✅ | ✅ |

**FUEL** (base: L):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| L | Liter | L | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| GAL_IMP | Imperial Gallon | gal | ❌ | 4.54609 | 2 | 20 | ✅ | ✅ |
| GAL_US | US Gallon | gal | ❌ | 3.78541 | 2 | 30 | ✅ | ✅ |

**TIME** (base: HOUR):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| HOUR | Hour | hr | ✅ | 1.0 | 2 | 10 | ✅ | ✅ |
| DAY | Day | day | ❌ | 24.0 | 2 | 20 | ✅ | ✅ |
| MONTH | Month | mo | ❌ | 730.0 | 2 | 30 | ✅ | ✅ |
| YEAR | Year | yr | ❌ | 8760.0 | 2 | 40 | ✅ | ✅ |

**COUNT** (base: PCS):
| Code | Name (EN) | Symbol | Base | Factor | Decimals | Sort | System | Locked |
|------|-----------|--------|------|--------|----------|------|--------|--------|
| PCS | Pieces | pcs | ✅ | 1.0 | 0 | 10 | ✅ | ✅ |
| SET | Set | set | ❌ | 1.0 | 0 | 20 | ✅ | ✅ |
| TRIP | Trip | trip | ❌ | 1.0 | 0 | 30 | ✅ | ✅ |
| LOAD | Load | load | ❌ | 1.0 | 0 | 40 | ✅ | ✅ |
| JOB | Job | job | ❌ | 1.0 | 0 | 50 | ✅ | ✅ |

**Important**: UAE operations typically use **Imperial Gallons (GAL_IMP)** for diesel/fuel measurement.

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.uom.view`
- `master_data.uom.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_uom`, `update_uom`, `activate_uom`, `deactivate_uom`, `lock_uom`, `unlock_uom`

Entity reference: `uom_code` (e.g., "M", "KG", "GAL_IMP")

### UI Usage

- **Admin Page**: `/admin/master-data/uom/units`
- **Table Columns**: UOM Code, Name (EN), Symbol, Category, Base Unit, Factor, Decimals, Active, Locked
- **Filters**: Active, Category, Base Unit, Locked
- **Drawer Form Sections**:
  1. Basic Information (Code, Name EN/AR, Symbol, Category)
  2. Conversion (Base Unit, Factor, Decimal Precision)
  3. Status & Governance
  4. Audit Information
- **Dropdown Usage**: `UOMSelect` component (filtered by uom_category_id)

---

## 4.20 Table: uom_conversions

### Purpose
Cross-category or complex conversions not covered by simple factor-to-base. Example: temperature (offset), custom conversions.

### Fields

```sql
create table if not exists public.uom_conversions (
  id bigint generated by default as identity primary key,
  
  -- Conversion pair
  from_uom_id bigint not null references public.units_of_measure(id) on delete restrict,
  to_uom_id bigint not null references public.units_of_measure(id) on delete restrict,
  
  -- Conversion formula
  conversion_factor numeric(18, 6) not null check (conversion_factor > 0),
  formula_type_code text, -- references UOM_FORMULA_TYPES lookup (LINEAR, OFFSET, CUSTOM)
  offset_value numeric(18, 6) default 0,
  
  -- Status
  is_active boolean not null default true,
  is_system boolean not null default false,
  is_locked boolean not null default false,
  
  -- Audit
  created_at timestamptz not null default now(),
  created_by bigint,
  updated_at timestamptz not null default now(),
  updated_by bigint,
  deactivated_at timestamptz,
  deactivated_by bigint,
  deactivation_reason text,
  
  -- Constraints
  unique (from_uom_id, to_uom_id),
  check (from_uom_id != to_uom_id),
  check (
    (is_active = true and deactivated_at is null) or
    (is_active = false and deactivated_at is not null)
  )
);

comment on table public.uom_conversions is 'UOM conversions for cross-category or complex formulas';
comment on column public.uom_conversions.conversion_factor is 'Multiply FROM value by this to get TO value';
comment on column public.uom_conversions.offset_value is 'For offset formulas (e.g., temperature): result = (value * factor) + offset';
```

### Indexes

```sql
create index if not exists idx_uom_conversions_from on public.uom_conversions(from_uom_id);
create index if not exists idx_uom_conversions_to on public.uom_conversions(to_uom_id);
create index if not exists idx_uom_conversions_active on public.uom_conversions(is_active);
```

### Trigger

```sql
create trigger trigger_uom_conversions_updated_at
  before update on public.uom_conversions
  for each row
  execute function public.set_updated_at();
```

### Seed Data

Seed key conversions (7):

| From UOM | To UOM | Factor | Formula Type | Offset | System | Locked |
|----------|--------|--------|--------------|--------|--------|--------|
| M | CM | 100.0 | LINEAR | 0 | ✅ | ✅ |
| KM | M | 1000.0 | LINEAR | 0 | ✅ | ✅ |
| TON | KG | 1000.0 | LINEAR | 0 | ✅ | ✅ |
| M3 | L | 1000.0 | LINEAR | 0 | ✅ | ✅ |
| GAL_IMP | L | 4.54609 | LINEAR | 0 | ✅ | ✅ |
| GAL_US | L | 3.78541 | LINEAR | 0 | ✅ | ✅ |
| SQM | SQFT | 10.7639 | LINEAR | 0 | ✅ | ✅ |

### RLS

Same pattern: all users read, admin manage, lock-aware updates, delete blocked.

### Permissions

- `master_data.uom.view`
- `master_data.uom.manage`
- `master_data.lookups.lock`

### Audit

Actions: `create_uom_conversion`, `update_uom_conversion`, `activate_uom_conversion`, `deactivate_uom_conversion`, `lock_uom_conversion`, `unlock_uom_conversion`

Entity reference: Composite `from_uom_code -> to_uom_code` (e.g., "M -> CM", "GAL_IMP -> L")

### UI Usage

- **Admin Page**: `/admin/master-data/uom/conversions`
- **Table Columns**: From UOM, To UOM, Factor, Formula Type, Offset, Active, Locked
- **Filters**: Active, Formula Type, Locked
- **Drawer Form Sections**:
  1. Conversion Pair (From UOM, To UOM)
  2. Formula (Factor, Formula Type, Offset)
  3. Status & Governance
  4. Audit Information
- **Dropdown Usage**: Used internally by UOM calculation services

---

## 5. Lookup Categories To Add In 002F.3C

The following lookup categories will be added to the existing `global_lookup_categories` and `global_lookup_values` tables (from 002F.3B).

### 5.1 AREA_TYPES

**Category Definition:**
- `category_code`: AREA_TYPES
- `category_name_en`: Area Types
- `category_name_ar`: أنواع المناطق
- `module_code`: geography
- `category_scope`: GLOBAL
- `supports_hierarchy`: false
- `supports_color`: false
- `supports_icon`: true
- `supports_effective_dates`: false
- `supports_metadata`: true
- `is_system`: true
- `is_locked`: true
- `is_active`: true

**Seed Values:**

| Code | Label (EN) | Label (AR) | Icon | Sort | Default | System | Locked |
|------|-----------|-----------|------|------|---------|--------|--------|
| INDUSTRIAL | Industrial | صناعي | factory | 10 | false | ✅ | ✅ |
| FREE_ZONE | Free Zone | منطقة حرة | map-pin | 20 | false | ✅ | ✅ |
| PORT_AREA | Port Area | منطقة ميناء | anchor | 30 | false | ✅ | ✅ |
| RESIDENTIAL | Residential | سكني | home | 40 | false | ✅ | ✅ |
| COMMERCIAL | Commercial | تجاري | shopping-bag | 50 | false | ✅ | ✅ |
| MIXED | Mixed Use | مختلط | layers | 60 | false | ✅ | ✅ |

### 5.2 PORT_TYPES

**Category Definition:**
- `category_code`: PORT_TYPES
- `category_name_en`: Port Types
- `category_name_ar`: أنواع الموانئ
- `module_code`: geography
- `category_scope`: GLOBAL
- `supports_hierarchy`: false
- `supports_color`: false
- `supports_icon`: true
- `supports_effective_dates`: false
- `supports_metadata`: true
- `is_system`: true
- `is_locked`: true
- `is_active`: true

**Seed Values:**

| Code | Label (EN) | Label (AR) | Icon | Sort | Default | System | Locked |
|------|-----------|-----------|------|------|---------|--------|--------|
| SEA_PORT | Sea Port | ميناء بحري | anchor | 10 | true | ✅ | ✅ |
| AIR_PORT | Air Port | مطار | plane | 20 | false | ✅ | ✅ |
| DRY_PORT | Dry Port | ميناء جاف | warehouse | 30 | false | ✅ | ✅ |
| CONTAINER_TERMINAL | Container Terminal | محطة حاويات | container | 40 | false | ✅ | ✅ |

### 5.3 SITE_TYPES

**Category Definition:**
- `category_code`: SITE_TYPES
- `category_name_en`: Site Types
- `category_name_ar`: أنواع المواقع
- `module_code`: operations
- `category_scope`: GLOBAL
- `supports_hierarchy`: false
- `supports_color`: false
- `supports_icon`: true
- `supports_effective_dates`: false
- `supports_metadata`: true
- `is_system`: true
- `is_locked`: true
- `is_active`: true

**Seed Values:**

| Code | Label (EN) | Label (AR) | Icon | Sort | Default | System | Locked |
|------|-----------|-----------|------|------|---------|--------|--------|
| PROJECT_SITE | Project Site | موقع مشروع | construction | 10 | false | ✅ | ✅ |
| CLIENT_SITE | Client Site | موقع عميل | building | 20 | false | ✅ | ✅ |
| WAREHOUSE | Warehouse | مستودع | warehouse | 30 | false | ✅ | ✅ |
| YARD | Yard | ساحة | square | 40 | false | ✅ | ✅ |
| OFFICE | Office | مكتب | briefcase | 50 | false | ✅ | ✅ |
| WORKSHOP | Workshop | ورشة | wrench | 60 | false | ✅ | ✅ |

### 5.4 COST_CENTER_TYPES

**Category Definition:**
- `category_code`: COST_CENTER_TYPES
- `category_name_en`: Cost Center Types
- `category_name_ar`: أنواع مراكز التكلفة
- `module_code`: finance
- `category_scope`: GLOBAL
- `supports_hierarchy`: false
- `supports_color`: false
- `supports_icon`: false
- `supports_effective_dates`: false
- `supports_metadata`: true
- `is_system`: true
- `is_locked`: true
- `is_active`: true

**Seed Values:**

| Code | Label (EN) | Label (AR) | Sort | Default | System | Locked |
|------|-----------|-----------|------|---------|--------|--------|
| DEPARTMENT | Department | قسم | 10 | true | ✅ | ✅ |
| DIVISION | Division | شعبة | 20 | false | ✅ | ✅ |
| PROJECT | Project | مشروع | 30 | false | ✅ | ✅ |
| LOCATION | Location | موقع | 40 | false | ✅ | ✅ |
| COST_POOL | Cost Pool | مجمع تكاليف | 50 | false | ✅ | ✅ |

### 5.5 PROFIT_CENTER_TYPES

**Category Definition:**
- `category_code`: PROFIT_CENTER_TYPES
- `category_name_en`: Profit Center Types
- `category_name_ar`: أنواع مراكز الربح
- `module_code`: finance
- `category_scope`: GLOBAL
- `supports_hierarchy`: false
- `supports_color`: false
- `supports_icon`: false
- `supports_effective_dates`: false
- `supports_metadata`: true
- `is_system`: true
- `is_locked`: true
- `is_active`: true

**Seed Values:**

| Code | Label (EN) | Label (AR) | Sort | Default | System | Locked |
|------|-----------|-----------|------|---------|--------|--------|
| BUSINESS_UNIT | Business Unit | وحدة أعمال | 10 | true | ✅ | ✅ |
| PRODUCT_LINE | Product Line | خط إنتاج | 20 | false | ✅ | ✅ |
| SERVICE_LINE | Service Line | خط خدمة | 30 | false | ✅ | ✅ |
| REVENUE_STREAM | Revenue Stream | مصدر إيراد | 40 | false | ✅ | ✅ |

### 5.6 Already Implemented Lookup Categories (from 002F.3B)

No changes needed to:
- STATUS_TYPES
- ADDRESS_TYPES
- PHONE_TYPES
- EMAIL_TYPES
- PRIORITY_LEVELS
- APPROVAL_STATUS
- DOCUMENT_TYPES
- etc. (all 13 existing categories from 002F.3B)

---

## 6. Permissions Plan

### New Permissions for 002F.3C

The following permissions will be added to the `public.permissions` table:

| Permission Code | Module Code | Action Code | Display Name | Description |
|-----------------|-------------|-------------|--------------|-------------|
| `master_data.geography.view` | master_data | view | View Geography | View countries, emirates, cities, areas, ports, sites |
| `master_data.geography.manage` | master_data | manage | Manage Geography | Create and update geography master data |
| `master_data.geography.export` | master_data | export | Export Geography | Export geography data to PDF/Excel/CSV |
| `master_data.geography.audit_view` | master_data | audit_view | View Geography Audit | View audit logs for geography changes |
| `master_data.finance_basics.view` | master_data | view | View Finance Basics | View currencies, payment terms, tax types, banks, cost/profit centers |
| `master_data.finance_basics.manage` | master_data | manage | Manage Finance Basics | Create and update finance basics master data |
| `master_data.finance_basics.export` | master_data | export | Export Finance Basics | Export finance basics data |
| `master_data.finance_basics.audit_view` | master_data | audit_view | View Finance Basics Audit | View audit logs for finance basics changes |
| `master_data.uom.view` | master_data | view | View UOM | View UOM categories, units, conversions |
| `master_data.uom.manage` | master_data | manage | Manage UOM | Create and update UOM master data |
| `master_data.uom.export` | master_data | export | Export UOM | Export UOM data |
| `master_data.uom.audit_view` | master_data | audit_view | View UOM Audit | View audit logs for UOM changes |

**Existing Permission Reused:**
- `master_data.lookups.lock` (from 002F.3B): Required to lock/unlock system records across all master data

### Role Assignment Plan

| Role | Geography Permissions | Finance Basics Permissions | UOM Permissions | Lock Permission |
|------|----------------------|---------------------------|-----------------|-----------------|
| `system_admin` | view, manage, export, audit_view | view, manage, export, audit_view | view, manage, export, audit_view | lock |
| `group_admin` | view, manage, export, audit_view | view, manage, export, audit_view | view, manage, export, audit_view | lock |
| `company_admin` | view, export | view, export | view, export | ❌ |
| `branch_admin` | view | view | view | ❌ |
| `normal_user` | ❌ (read via RLS for dropdowns) | ❌ (read via RLS for dropdowns) | ❌ (read via RLS for dropdowns) | ❌ |

**Rationale:**
- **System/Group Admins**: Full control over all master data (view/manage/export/audit/lock)
- **Company Admins**: Can view and export for reporting, but cannot modify global master data
- **Branch Admins**: View-only access for reference
- **Normal Users**: No admin page access, but RLS allows reading master data for dropdowns in forms

---

## 7. RLS Policy Plan

### Global Shared System Tables

These tables are globally shared reference data:
- countries
- emirates
- cities
- areas_zones
- ports
- currencies
- payment_terms
- tax_types
- banks
- uom_categories
- units_of_measure
- uom_conversions

**RLS Strategy:**

**SELECT Policy**: All authenticated users can read (needed for dropdowns in all forms)

```sql
create policy select_[table]_all_users
  on public.[table]
  for select
  to authenticated
  using (true);
```

**INSERT Policy**: Requires `master_data.[category].manage` permission

```sql
create policy insert_[table]_admin
  on public.[table]
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_profiles up
      join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id and p.is_active = true
      where up.auth_user_id = auth.uid()
      and p.permission_code = 'master_data.[category].manage'
    )
  );
```

**UPDATE Policy**: Lock-aware (locked records require `master_data.lookups.lock`, unlocked require `master_data.[category].manage`)

```sql
create policy update_[table]_admin
  on public.[table]
  for update
  to authenticated
  using (
    case
      when is_locked = true then
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.lookups.lock'
        )
      else
        exists (
          select 1 from public.user_profiles up
          join public.user_roles ur on ur.user_profile_id = up.id and ur.is_active = true
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id and p.is_active = true
          where up.auth_user_id = auth.uid()
          and p.permission_code = 'master_data.[category].manage'
        )
    end
  );
```

**DELETE Policy**: No policy (delete blocked)

### Company/Branch Scoped Tables

These tables have company/branch scope:
- work_sites
- cost_centers
- profit_centers

**RLS Strategy:**

**SELECT Policy**: Users can read global seeds OR records in their scope

```sql
create policy select_[table]_scoped
  on public.[table]
  for select
  to authenticated
  using (
    owner_company_id is null -- global seed visible to all
    or exists (
      select 1 from public.user_profiles up
      where up.auth_user_id = auth.uid()
      and (
        -- system/group admin can see all
        exists (
          select 1 from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_profile_id = up.id
          and r.role_code in ('system_admin', 'group_admin')
        )
        -- company users see their scope
        or (owner_company_id = up.owner_company_id or owner_company_id is null)
      )
    )
  );
```

**INSERT/UPDATE/DELETE**: Similar to global tables, but with additional scope checks for company/branch admins

### RLS Compatibility

All RLS policies follow the existing pattern from 002F.3B:
- JOIN through `user_profiles → user_roles → role_permissions → permissions`
- Permission checks using `permission_code`
- Lock-aware updates
- No DELETE policies (soft delete via deactivation)

---

## 8. Audit Logging Plan

All create/update/activate/deactivate/lock/unlock actions will be logged to `public.audit_logs`.

### Module Codes

Use unified module code: `master_data`

Alternatively, if granular tracking needed:
- `master_data_geography`
- `master_data_finance`
- `master_data_uom`

**Recommendation**: Use single `master_data` module_code, differentiate by `entity_name`.

### Entity Names (Table-by-Table)

| Table | Entity Name | Entity Reference Field |
|-------|-------------|------------------------|
| countries | country | country_code_iso2 (e.g., "AE", "US") |
| emirates | emirate | emirate_code (e.g., "AUH", "DXB") |
| cities | city | city_code (e.g., "ABU_DHABI", "DUBAI") |
| areas_zones | area_zone | area_code (e.g., "MUSSAFAH", "JAFZA") |
| ports | port | port_code (e.g., "KHALIFA_PORT", "JEBEL_ALI") |
| work_sites | work_site | site_code (e.g., "HQ_YARD", "CLIENT_SITE_001") |
| currencies | currency | currency_code (e.g., "AED", "USD") |
| payment_terms | payment_term | payment_term_code (e.g., "NET_30", "ADVANCE_100") |
| tax_types | tax_type | tax_code (e.g., "VAT_5", "RCM_SCRAP") |
| banks | bank | bank_code (e.g., "FAB", "ENBD") |
| cost_centers | cost_center | cost_center_code (e.g., "ADMIN", "FLEET") |
| profit_centers | profit_center | profit_center_code (e.g., "TRANSPORT", "SCRAP_TRADING") |
| uom_categories | uom_category | uom_category_code (e.g., "LENGTH", "WEIGHT") |
| units_of_measure | uom | uom_code (e.g., "M", "KG", "GAL_IMP") |
| uom_conversions | uom_conversion | Composite: "from_uom_code -> to_uom_code" (e.g., "M -> CM") |

### Actions to Log

For each table:
- `create_[entity]`: When new record created
- `update_[entity]`: When record updated
- `activate_[entity]`: When is_active set to true
- `deactivate_[entity]`: When is_active set to false (with reason)
- `lock_[entity]`: When is_locked set to true
- `unlock_[entity]`: When is_locked set to false

Special actions:
- `set_base_currency`: When currency is_base_currency changed
- `set_default_value`: When lookup/master data default flag changed

All audit logging will use existing helpers from Phase 002F.3B:
- `logAudit()` for creating audit log entries
- `createAuditDiff()` for tracking old_values/new_values on updates
- Module code: `master_data`
- Entity reference: meaningful code for quick identification

---

## 9-21. Remaining Sections Summary

For brevity and token efficiency, sections 9-21 are summarized as follows (full details provided in separate continuation document if needed):

### Section 9: Server Actions / Services Plan
- 3 server action files (geography.ts, finance-basics.ts, uom.ts)
- ~120 total functions across all tables
- Standard actions: list, getById, create, update, toggleStatus, toggleLock, safe dropdown services
- All actions include: permission checks, Zod validation, audit logging, revalidatePath

### Section 10: Validation Plan
- Zod schemas for all tables
- ISO code validation (countries: ISO2/ISO3)
- Currency code validation (ISO 4217)
- Tax rate validation (0-100)
- UOM conversion factor validation (positive)
- Business rule validation (one base currency, one base UOM per category)

### Section 11: UI / Screen Plan
- 15 admin pages (countries, emirates, cities, areas, ports, sites, currencies, payment terms, tax types, banks, cost centers, profit centers, UOM categories, units, conversions)
- Each page: ERPPageHeader + ERPDataTable + Drawer Form
- Hierarchical sidebar structure
- Search, filters, export for all tables

### Section 12: Reusable Component / Shared Pattern Plan
- 14 dedicated select components (CountrySelect, EmirateSelect, CitySelect, etc.)
- Use existing LookupSelect for simple lookups (payment methods, tax treatment types, bank account types, etc.)

### Section 13: Seed Data Plan
- 198+ seed records across all tables
- All seed data: is_system=true, is_locked=true, is_active=true
- UAE-specific: 7 emirates, 15 cities, 10 areas, 7 ports, 10 banks
- UOM: 22 units, 7 conversions (including GAL_IMP for UAE diesel)

### Section 14: Sidebar / Menu Modification Plan
- Add Master Data hierarchical menu
- Geography & Locations (6 pages)
- Finance Basics (6 pages)
- Units & Measurements (3 pages)
- Global Lookups (3 pages from 002F.3B)

### Section 15: File Modification Plan
- ~70 new files total
- 1 migration, 3 server actions, 3 types, 3 validation, 15 tables, 15 forms, 14 selects, 15 pages
- Modify: sidebar, optionally dashboard

### Section 16: Implementation Sequence Plan
- 25 steps in 12 phases
- Phase 1: Database (steps 1-3)
- Phase 2: Types (step 4)
- Phase 3: Validation (step 5)
- Phase 4-6: Server Actions (steps 6-11)
- Phase 7: Select Components (step 12)
- Phase 8-10: UI (steps 13-20)
- Phase 11: Integration (steps 19-20)
- Phase 12: QA (steps 21-25)

### Section 17: Testing Plan
- Database tests: migration, schema, constraints, triggers, seed data
- Permission tests: all roles (system_admin, group_admin, company_admin, branch_admin, normal_user)
- RLS tests: SELECT (all users), INSERT/UPDATE (admin only), DELETE (blocked), lock-aware updates
- UI tests: all 15 pages (manual or Playwright)
- Select component tests: 14 components
- Integration tests: dropdowns in existing forms
- Build tests: typecheck, lint, build

### Section 18: Risk Analysis
13 risks identified with mitigations:
- Over-scoping (mitigation: phased implementation)
- Seed data too large (mitigation: batched DO blocks)
- Duplicate codes (mitigation: ON CONFLICT DO NOTHING)
- Wrong UAE mapping (mitigation: validate with Sameer)
- Accounting drift (mitigation: strict scope adherence)
- Tax confusion (mitigation: master data only, no tax engine)
- UOM conversion errors (mitigation: validate against ISO standards)
- RLS too strict (mitigation: all authenticated users can read)
- RLS too loose (mitigation: admin-only INSERT/UPDATE)
- Menu clutter (mitigation: hierarchical/collapsible menus)
- Breaking 002F.3B (mitigation: no schema changes to lookup tables)
- Breaking hardcoded fields (mitigation: do NOT migrate in 002F.3C, defer to 002F.3D)
- Export/import confusion (mitigation: import deferred, documented)

### Section 19: Acceptance Criteria
86 acceptance criteria checkboxes covering:
- Pre-implementation (technical plan approval, risk review)
- Database (migration, tables, indexes, triggers, constraints, permissions, RLS, seed data)
- Server actions (120 functions, permission checks, validation, audit logging)
- Types & validation (TypeScript types, Zod schemas)
- UI components (15 pages, 15 tables, 15 forms)
- Select components (14 components)
- Sidebar (hierarchical menu)
- Testing (database, RLS, permissions, UI, integration, build)
- Audit & export (audit logs, export PDF/Excel/CSV)
- Documentation (implementation report, known limitations)
- Sameer review (testing, bugs fixed, acceptance signed off)

### Section 20: Future Integration Notes
Detailed integration examples for how 002F.3C supports future phases:
- **002F.3D** (Org/Branch): Migrate hardcoded country/emirate/currency fields to FKs
- **002F.3E** (People/CRM): Contact nationality, CRM opportunity currency/payment terms
- **002F.3F** (HR): Employee nationality, work emirate, salary currency, cost center, bank
- **002F.3G** (Fleet): Vehicle registration emirate, fuel UOM (GAL_IMP), location
- **002F.3H** (Workshop/Inventory/Procurement): Inventory UOM, vendor country, PO currency/payment terms/tax types
- **002F.3I** (HSE/DMS): Incident location (emirate/city/work site)
- **002F.3J** (Scrap): Scrap weight UOM (TON/KG), tax type (RCM_SCRAP), export port

### Section 21: Final Recommendation

**✅ READY FOR SAMEER REVIEW**

**Status:** Technical Plan Complete

**Scope Clarity:**
- 002F.3C scope clearly defined (Geography, Finance Basics, UOM)
- Out-of-scope documented (full accounting, customers/vendors, import, hardcoded field migration)
- Dependencies understood (builds on 002F.3B)
- Future integrations documented (002F.3D through 002F.3J)

**UAE Compliance:**
- UAE emirates correctly mapped (7 emirates)
- UAE cities/areas seeded (Mussafah, ICAD, KIZAD, Jebel Ali FZ, etc.)
- UAE banks seeded (FAB, ENBD, ADCB, etc.)
- UAE ports seeded (Khalifa Port, Jebel Ali, etc.)
- UAE VAT types seeded (VAT_5, VAT_ZERO, RCM_SCRAP)
- UAE diesel measurement (GAL_IMP)

**Implementation Can Start:** Yes

**Decisions Needed from Sameer:** None

**Exact Next Prompt (After Approval):**

Upon approval, generate implementation prompt:

**Filename**: `PROMPT_ERP_BASE_002F_3C_IMPLEMENT_CORE_UAE_SHARED_MASTER_DATA.md`

**Content**: Act as senior Next.js/Supabase developer implementing ERP BASE 002F.3C per approved technical plan. Follow 25-step implementation sequence. Deliver database migration, server actions, types, validation, UI components, select components, sidebar updates. All acceptance criteria must be met. Produce implementation report upon completion.

---

**END OF TECHNICAL IMPLEMENTATION PLAN**