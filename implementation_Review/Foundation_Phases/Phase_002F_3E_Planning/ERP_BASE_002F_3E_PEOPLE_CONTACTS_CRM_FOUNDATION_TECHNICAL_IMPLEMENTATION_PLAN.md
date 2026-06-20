# ERP BASE 002F.3E — PEOPLE / CONTACTS / CRM FOUNDATION
## TECHNICAL IMPLEMENTATION PLAN

**Phase:** ERP BASE 002F.3E — People / Contacts / CRM Foundation  
**Plan Date:** Sunday, June 7, 2026  
**Planner:** Claude Sonnet 4.5 (AI Agent)  
**Plan Type:** Technical Implementation Planning (No Code Implementation)  
**Technology Stack:** Next.js 16.2.6 (Turbopack), Supabase PostgreSQL, Shadcn UI  

---

## Document Purpose

This document provides a comprehensive, implementation-ready technical plan for ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation. This phase establishes the master data foundation for customers, vendors, subcontractors, consultants, government authorities, and recruitment agencies, along with their associated contacts, addresses, documents, and bank details.

**This is a PLANNING DOCUMENT ONLY.** No code implementation, database migrations, or application modifications are performed as part of this planning phase.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Non-Scope Confirmation](#2-scope-and-non-scope-confirmation)
3. [Source Inspection Summary](#3-source-inspection-summary)
4. [Final Entity Category Decision](#4-final-entity-category-decision)
5. [Dedicated Table Decision Matrix](#5-dedicated-table-decision-matrix)
6. [Lookup Category Plan](#6-lookup-category-plan)
7. [Database Schema Plan](#7-database-schema-plan)
8. [Contact / Address / Document Strategy](#8-contact--address--document-strategy)
9. [Bank Details Strategy](#9-bank-details-strategy)
10. [CRM Foundation Strategy](#10-crm-foundation-strategy)
11. [Master Data Reuse and Dropdown Mapping Matrix](#11-master-data-reuse-and-dropdown-mapping-matrix)
12. [RLS / Permission / Role Assignment Plan](#12-rls--permission--role-assignment-plan)
13. [Audit Logging Plan](#13-audit-logging-plan)
14. [Server Actions Plan](#14-server-actions-plan)
15. [Validation Plan](#15-validation-plan)
16. [UI / Screen Plan](#16-ui--screen-plan)
17. [Reusable Select Component Plan](#17-reusable-select-component-plan)
18. [Sidebar / Menu Plan](#18-sidebar--menu-plan)
19. [Seed Data Plan](#19-seed-data-plan)
20. [Data Migration / Legacy Strategy](#20-data-migration--legacy-strategy)
21. [Testing Plan](#21-testing-plan)
22. [Risk Analysis and Mitigation](#22-risk-analysis-and-mitigation)
23. [Acceptance Criteria](#23-acceptance-criteria)
24. [Future Integration Notes](#24-future-integration-notes)
25. [Implementation Phasing Recommendation](#25-implementation-phasing-recommendation)
26. [Final Recommendation](#26-final-recommendation)

---

## 1. Executive Summary

### 1.1 Phase Overview

Phase 002F.3E establishes the **People / Contacts / CRM Foundation** — a comprehensive master data layer for all external business entities (parties) that Alliance Gulf Transport interacts with across its diverse operations (fleet management, scrap trading, waste management, demolition, workshop, transport, and HSE).

This phase creates **6 main entity tables** with associated child records (contacts, addresses, documents, bank details), supported by **20+ lookup categories** for classification and status management. All data structures follow the established ERP BASE patterns (BIGINT PKs/FKs, `user_profiles` audit fields, RLS policies, permission-gated access).

### 1.2 Key Design Principles

1. **Separation of Entity Types**: No generic `persons` table. Each business entity category has a dedicated table with appropriate fields.
2. **No Employee Data**: Employees are explicitly excluded from this phase (handled in 002F.3F — HR Master Data).
3. **No Hardcoded Dropdowns**: All classification fields use existing master data tables or new lookup categories.
4. **Master Data Reuse**: Leverages existing Geography, Finance Basics, UOM, and Lookup Engine modules.
5. **Future-Ready**: Designed to support CRM, Sales, Procurement, Subcontracting, Recruitment, and Government Correspondence modules.

### 1.3 Scope Summary

**In Scope:**
- 6 main entity tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`
- 24 child tables: contacts (6), addresses (6), documents (6), bank details (6)
- 20+ lookup categories for classification and status
- 48+ server actions for CRUD operations
- 18+ UI screens (main entities + child records)
- 6 reusable select components for future modules
- Comprehensive RLS policies and permissions

**Out of Scope:**
- Employees and HR master data (Phase 002F.3F)
- CRM operational module (leads, opportunities, quotations)
- Procurement transactions (POs, RFQs)
- Sales orders and invoicing
- DMS operational workflow
- Project/contract management

### 1.4 Business Value

This phase provides:
- **Centralized party master data** for consistent customer/vendor/subcontractor information across all modules
- **Contact management** with designation, communication preferences, and authorization tracking
- **Address hierarchy** supporting billing, shipping, and site locations
- **Document tracking** with expiry management for licenses, insurance, registrations
- **Bank details** for payment processing and vendor settlements
- **CRM foundation** with customer segmentation, lead sources, and relationship tracking
- **Compliance support** for TRN, trade license, and government authority tracking

### 1.5 Dependencies

**Prerequisites (All Complete):**
- ✅ 002F.3B — Global Lookup / Dropdown Engine
- ✅ 002F.3C.1 — Geography & Locations
- ✅ 002F.3C.2 — Finance Basics
- ✅ 002F.3C.3 — Units & Measurements

**Blocks:**
- 003 — CRM Module
- 008 — Procurement Module
- Future: Subcontracting, Recruitment, Government Correspondence

### 1.6 Estimated Effort

Based on complexity analysis and comparison to previous phases:

| Sub-Phase | Estimated Effort | Complexity |
|-----------|-----------------|------------|
| 002F.3E.2 — Database + Lookups + Seeds | 2-3 days | High (30 tables, 20+ lookup categories) |
| 002F.3E.3 — Customers + Child Tables | 2-3 days | High (4 tables, complex validation) |
| 002F.3E.4 — Vendors + Child Tables | 2-3 days | High (4 tables, bank details) |
| 002F.3E.5 — Remaining Entities | 2-3 days | Medium (12 tables, similar patterns) |
| 002F.3E.6 — Select Components + QA | 1-2 days | Medium (6 components, sidebar, testing) |
| **Total** | **9-14 days** | **Very High** |

**Recommendation:** Split into 5 implementation sub-phases for manageable complexity and incremental testing.

---

## 2. Scope and Non-Scope Confirmation

### 2.1 In-Scope Entities

The following 6 main entity categories are **confirmed in scope** for Phase 002F.3E:

| Entity | Table Name | Business Purpose |
|--------|-----------|------------------|
| **Customers** | `customers` | Main contractors, EPC contractors, scrap buyers/suppliers, normal customers, partners |
| **Vendors** | `vendors` | Suppliers (material/equipment), service providers, insurance companies, lessors (property/vehicle/equipment/camp) |
| **Subcontractors** | `subcontractors` | Civil/manpower/demolition/equipment subcontractors, transporters, partners |
| **Consultants** | `consultants` | Engineering, HSE, legal, technical, environmental consultants |
| **Government Authorities** | `government_authorities` | Municipalities, police, civil defense, environmental authorities, free zones, waste disposal facilities, port customs, ministries, regulators |
| **Recruitment Agencies** | `recruitment_agencies` | Local/overseas recruitment agencies, manpower supply agencies, executive search agencies |

### 2.2 Classification via Lookup Categories (Not Separate Tables)

The following business entity types are **classified via lookup values**, not separate tables:

| Business Concept | Classified Under | Lookup Category |
|-----------------|------------------|-----------------|
| Main Contractors | Customers | `CUSTOMER_TYPES` → `MAIN_CONTRACTOR` |
| EPC Contractors | Customers | `CUSTOMER_TYPES` → `EPC_CONTRACTOR` |
| Scrap Buyers | Customers | `CUSTOMER_TYPES` → `SCRAP_BUYER` |
| Scrap Suppliers | Customers | `CUSTOMER_TYPES` → `SCRAP_SUPPLIER` |
| Partners (Customer) | Customers | `CUSTOMER_TYPES` → `PARTNER_CUSTOMER` |
| Material Suppliers | Vendors | `VENDOR_TYPES` → `MATERIAL_SUPPLIER` |
| Equipment Suppliers | Vendors | `VENDOR_TYPES` → `EQUIPMENT_SUPPLIER` |
| Service Providers | Vendors | `VENDOR_TYPES` → `SERVICE_PROVIDER` |
| Insurance Companies | Vendors | `VENDOR_TYPES` → `INSURANCE_COMPANY` |
| Lessors (All Types) | Vendors | `VENDOR_TYPES` → `PROPERTY_LESSOR`, `VEHICLE_LESSOR`, `EQUIPMENT_LESSOR`, `CAMP_ACCOMMODATION_LESSOR` |
| Transporters | Subcontractors | `SUBCONTRACTOR_TYPES` → `TRANSPORTER` |
| Partners (Subcontractor) | Subcontractors | `SUBCONTRACTOR_TYPES` → `PARTNER_SUBCONTRACTOR` |
| Waste Disposal Facilities | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` → `WASTE_DISPOSAL_FACILITY` |

### 2.3 Child Records In Scope

For each of the 6 main entities, the following child record types are in scope:

| Child Record Type | Tables (6 total) | Purpose |
|------------------|------------------|---------|
| **Contacts** | `customer_contacts`, `vendor_contacts`, `subcontractor_contacts`, `consultant_contacts`, `government_authority_contacts`, `recruitment_agency_contacts` | Contact persons with designation, email, phone, communication preferences, authorization flags |
| **Addresses** | `customer_addresses`, `vendor_addresses`, `subcontractor_addresses`, `consultant_addresses`, `government_authority_addresses`, `recruitment_agency_addresses` | Multiple addresses per entity (billing, shipping, site, office) with geography hierarchy |
| **Documents** | `customer_documents`, `vendor_documents`, `subcontractor_documents`, `consultant_documents`, `government_authority_documents`, `recruitment_agency_documents` | TRN certificates, trade licenses, insurance policies, registrations with expiry tracking |
| **Bank Details** | `vendor_bank_details`, `subcontractor_bank_details`, `consultant_bank_details`, `recruitment_agency_bank_details`, *optional:* `customer_bank_details` | Bank account information for payment processing |

**Total Child Tables:** 24 (6 contacts + 6 addresses + 6 documents + 6 bank details)

### 2.4 Explicitly Out of Scope

The following are **confirmed out of scope** for Phase 002F.3E:

#### 2.4.1 HR Master Data (Phase 002F.3F)
- ❌ `employees`
- ❌ `employee_contacts`
- ❌ `employee_documents`
- ❌ `employee_dependents`
- ❌ `employee_emergency_contacts`
- ❌ `departments`
- ❌ `positions`
- ❌ `job_titles`
- ❌ `employment_types`
- ❌ `salary_grades`

#### 2.4.2 CRM Operational Module (Phase 003)
- ❌ `leads`
- ❌ `opportunities`
- ❌ `sales_pipeline_stages`
- ❌ `quotations`
- ❌ `sales_orders`
- ❌ `customer_interactions`
- ❌ `customer_complaints`
- ❌ `customer_portal`

#### 2.4.3 Procurement Operational Module (Phase 008)
- ❌ `purchase_requisitions`
- ❌ `rfqs`
- ❌ `purchase_orders`
- ❌ `goods_receipts`
- ❌ `vendor_invoices`
- ❌ `payment_vouchers`

#### 2.4.4 Other Operational Modules
- ❌ Inventory items
- ❌ Fleet assets
- ❌ Workshop jobs
- ❌ HSE operational modules
- ❌ DMS operational workflow
- ❌ Scrap trading transactions
- ❌ Waste operation transactions
- ❌ Demolition projects
- ❌ Contracts and agreements
- ❌ Project management
- ❌ Accounting module

### 2.5 Scope Validation

**Confirmation:** This phase is **master data only**. It establishes the foundation entities (customers, vendors, subcontractors, etc.) and their associated reference data (contacts, addresses, documents, bank details). Operational transactions, workflows, and business processes are handled by future operational modules that will **reference** this master data.

---

## 3. Source Inspection Summary

### 3.1 Reports Reviewed

The following implementation reports and planning documents were reviewed to understand established patterns:

| Report | Phase | Key Insights |
|--------|-------|--------------|
| `ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` | Roadmap | 61 phases defined, 15 closed, master data foundation 90% complete |
| `ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW_MASTER_DATA_GATE_REPORT.md` | 002F.3C.4C | Master data gate passed, 17 select components available, comprehensive RLS/audit verification |
| `ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX_REPORT.md` | 002F.3C.4B | Select component patterns, currency select integration, geography FK strategy |
| `ERP_BASE_002F_3C_3_UOM_IMPLEMENTATION_REPORT.md` | 002F.3C.3 | UOM module patterns, 23 server actions, 3 select components, migration chunking strategy |
| `ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md` | 002F.3C.2 | Finance Basics patterns, 6 entities, lookup integration, MCP migration approach |
| `ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md` | 002F.3C.1 | Geography module patterns, 5 entities, cascading selects, seed data strategy |

### 3.2 Source Code Patterns Inspected

#### 3.2.1 Database Patterns

**Reviewed:** `supabase/migrations/*.sql` (12 migration files)

**Established Patterns:**
- BIGINT primary keys: `id bigint generated by default as identity primary key`
- BIGINT foreign keys: `created_by bigint references public.user_profiles(id)`
- Audit fields: `created_by`, `updated_by`, `deactivated_by` → `user_profiles.id`
- Soft delete: `is_active boolean not null default true`, `deactivated_at`, `deactivated_by`, `deactivation_reason`
- System protection: `is_system boolean not null default false`, `is_locked boolean not null default false`
- Timestamps: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- Sort control: `sort_order integer not null default 0`
- Triggers: `set_updated_at()` trigger on all tables
- RLS: `enable row level security` on all tables
- Indexes: Code fields, foreign keys, status fields, combination indexes for common queries

#### 3.2.2 Type Definitions

**Reviewed:** `src/features/master-data/*/types.ts`

**Established Patterns:**
- Database entity interfaces (exact column mapping)
- Extended types with relationships (e.g., `BankWithCountry`)
- Create/Update input types (separate interfaces for immutable fields)
- Filter/Query types for search operations
- Select component props types with optional filters

**Example Structure:**
```typescript
export interface Currency {
  id: number;
  currency_code: string;
  currency_name_en: string;
  currency_name_ar: string | null;
  // ... all database columns ...
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface CreateCurrencyInput {
  currency_code: string;
  currency_name_en: string;
  // ... required fields ...
}

export interface UpdateCurrencyInput {
  id: number;
  // currency_code NOT included (immutable)
  currency_name_en?: string;
  // ... optional update fields ...
}
```

#### 3.2.3 Validation Schemas

**Reviewed:** `src/features/master-data/*/validation.ts`

**Established Patterns:**
- Zod schemas for create/update operations
- Regex patterns for code formats (ISO codes, uppercase alphanumeric)
- String length validation (min/max)
- Number constraints (int, positive, min/max)
- Nullable/optional field handling
- Transform functions for normalization (e.g., `.transform((val) => val.toUpperCase())`)
- Immutable field enforcement (code fields not updatable)

**Example Structure:**
```typescript
export const createCurrencySchema = z.object({
  currency_code: z
    .string()
    .length(3, "Currency code must be exactly 3 characters (ISO 4217)")
    .regex(ISO3_CURRENCY_CODE, "Currency code must be uppercase letters only")
    .transform((val) => val.toUpperCase()),
  currency_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  // ... rest of fields ...
});
```

#### 3.2.4 Server Actions

**Reviewed:** `src/features/master-data/*/actions.ts`

**Established Patterns:**
- Action functions return `Promise<ActionResult<T>>`
- Validation via Zod `.safeParse()`
- Permission checks via `checkPermission(permission)`
- Supabase client from `createClient()`
- Locked record protection checks before updates
- Audit logging via `logAudit()` and `createAuditDiff()`
- Path revalidation via `revalidatePath()`
- Typed error handling with descriptive messages

**Common Actions per Entity:**
- `getEntities()` — List all (with filters)
- `getEntityById(id)` — Get single record
- `createEntity(input)` — Create new
- `updateEntity(input)` — Update existing
- `deleteEntity(id)` — Soft delete (set `is_active = false`)
- `toggleEntityStatus(id)` — Toggle `is_active`
- `toggleEntityLock(id)` — Toggle `is_locked` (system_admin only)
- `exportEntities()` — Export to CSV/Excel
- `getActiveEntitiesForSelect()` — For select components

#### 3.2.5 UI Components

**Reviewed:** `src/features/master-data/*/components/*.tsx`

**Established Patterns:**
- `ERPPageHeader` with title, description, action buttons
- `ERPDataTable` with sorting, filtering, global search, column resizing, export
- `ERPDrawerForm` with tabs/sections, form state management, validation display
- `ERPDrawerSectionNav` for multi-section forms
- Form state with `useState` and validation errors
- Inner component with `key={open}` for form reset on dialog close
- Loading/submitting states with disabled inputs
- Toast notifications for success/error feedback

**Table Column Patterns:**
```typescript
{
  accessorKey: "entity_code",
  accessorFn: (row) => `${row.entity_name_en} ${row.entity_code}`, // For global search
  header: "Entity",
  cell: ({ row }) => (
    <div>
      <span className="font-medium">{row.original.entity_name_en}</span>
      <span className="text-muted-foreground"> ({row.original.entity_code})</span>
    </div>
  ),
  meta: { exportable: true, exportHeader: "Entity Code", exportValue: (row) => row.entity_code },
}
```

#### 3.2.6 Select Components

**Reviewed:** `src/components/erp/*/`

**Established Patterns:**
- Client component (`"use client"`)
- `useEffect` to load data from Supabase
- `createClient()` for anon key (RLS-protected queries)
- Filter active records by default (`includeInactive` prop to override)
- Display format: `{code} — {name_en}` or `{name_en} ({code})`
- Props: `value`, `onValueChange`, `placeholder`, `disabled`, `required`, `className`
- Optional filter props for cascading (e.g., `countryId` for `EmirateSelect`)
- Loading, empty, and error states
- Shadcn `Select` component wrapper

**Example Structure:**
```typescript
export function CurrencySelect({ 
  value, 
  onValueChange, 
  placeholder = "Select currency...",
  disabled = false,
  showCode = false,
  className 
}: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCurrencies() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("currencies")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      // ... set state ...
    }
    loadCurrencies();
  }, []);

  return (
    <Select value={value?.toString()} onValueChange={(val) => onValueChange?.(Number(val))} disabled={disabled || loading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {currencies.map((currency) => (
          <SelectItem key={currency.id} value={currency.id.toString()}>
            {showCode ? `${currency.currency_code} — ` : ""}{currency.currency_name_en}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

#### 3.2.7 RLS Policies

**Reviewed:** Migration files with RLS policy definitions

**Established Patterns:**
- Helper functions: `current_user_has_permission(permission text)`, `current_user_has_role(role text)`
- SELECT policies: Allow active records OR users with view permission
- INSERT policies: Require manage permission
- UPDATE policies: Require manage permission AND (not locked OR system_admin)
- DELETE policies: System admin only (soft delete via UPDATE is preferred)
- System record protection: `is_system = true` records editable only by system_admin
- Locked record protection: `is_locked = true` records editable only by system_admin

**Example RLS Policy:**
```sql
-- SELECT: View active records if user has permission
create policy "Allow SELECT on customers for users with permission"
  on customers for select
  using (
    is_active = true 
    OR current_user_has_permission('master_data.customers.view')
  );

-- UPDATE: Manage permission + respect locked status
create policy "Allow UPDATE on customers for users with permission"
  on customers for update
  using (
    current_user_has_permission('master_data.customers.manage')
    AND (
      is_locked = false 
      OR current_user_has_role('system_admin')
    )
  );
```

#### 3.2.8 Permissions and Roles

**Reviewed:** Migration files with permission seeds and role assignments

**Established Pattern:**
- Permission naming: `{module}.{entity}.{action}`
- Actions: `view`, `manage`, `export`, `audit_view`
- Role hierarchy:
  - `system_admin`: All permissions
  - `group_admin`: view, manage, export, audit_view
  - `company_admin`: view, export (manage if approved)
  - `branch_admin`: view only
  - Normal users: No admin page access by default

**Example Permission Seeds:**
```sql
INSERT INTO permissions (permission_code, permission_name, description, module_code) VALUES
('master_data.customers.view', 'View Customers', 'View customer master data', 'MASTER_DATA'),
('master_data.customers.manage', 'Manage Customers', 'Create, edit, deactivate customers', 'MASTER_DATA'),
('master_data.customers.export', 'Export Customers', 'Export customer data', 'MASTER_DATA'),
('master_data.customers.audit_view', 'View Customer Audit Logs', 'View customer change history', 'MASTER_DATA');
```

### 3.3 Existing Master Data Available for Reuse

#### 3.3.1 Geography Master Data (Phase 002F.3C.1) ✅

| Table | Records | Select Component | Usage in 002F.3E |
|-------|---------|------------------|------------------|
| `countries` | 245 (15 active) | `CountrySelect` | Customer/vendor/subcontractor/consultant/government authority/recruitment agency addresses and primary location |
| `emirates` | 7 UAE + expandable | `EmirateSelect` | Emirate/region/governorate for all party addresses |
| `cities` | 17 UAE cities | `CitySelect` | City for all party addresses |
| `areas_zones` | 22 industrial/residential | `AreaZoneSelect` | Area/zone for all party addresses |
| `ports` | 19 ports | `PortSelect` | *Not directly used in 002F.3E* |

**Cascading Hierarchy:** Country → Emirates → City → Area/Zone

#### 3.3.2 Finance Basics Master Data (Phase 002F.3C.2) ✅

| Table | Records | Select Component | Usage in 002F.3E |
|-------|---------|------------------|------------------|
| `currencies` | 17 (AED base) | `CurrencySelect` | Customer/vendor/subcontractor/consultant/recruitment agency default currency, bank account currency |
| `payment_terms` | 10 | `PaymentTermSelect` | Customer/vendor/subcontractor/consultant/recruitment agency default payment terms |
| `tax_types` | 4 (VAT, Zero-rated, Exempt, Reverse Charge) | `TaxTypeSelect` | Customer/vendor/subcontractor/consultant/recruitment agency default tax treatment |
| `banks` | 20+ UAE banks | `BankSelect` | Vendor/subcontractor/consultant/recruitment agency bank details |
| `cost_centers` | 5 | `CostCenterSelect` | *Not directly used in 002F.3E* |
| `profit_centers` | 5 | `ProfitCenterSelect` | *Not directly used in 002F.3E* |

#### 3.3.3 UOM Master Data (Phase 002F.3C.3) ✅

| Table | Records | Select Component | Usage in 002F.3E |
|-------|---------|------------------|------------------|
| `uom_categories` | 8 | `UomCategorySelect` | *Not directly used in 002F.3E* |
| `units_of_measure` | 45+ | `UnitOfMeasureSelect` | *Not directly used in 002F.3E* |
| `uom_conversions` | 0 (empty by design) | N/A | *Not directly used in 002F.3E* |

#### 3.3.4 Global Lookup Engine (Phase 002F.3B) ✅

| Table | Records | Component | Usage in 002F.3E |
|-------|---------|-----------|------------------|
| `global_lookup_categories` | 13 existing | N/A | Will add 20+ new categories for party classification |
| `global_lookup_values` | 70 existing | `LookupSelect` | Will add 100+ new values for customer types, vendor types, subcontractor types, consultant types, government authority types, recruitment agency types, industry types, contact types, address types, document types, etc. |

**`LookupSelect` Component:**
- Category-filtered dropdown
- Badge variants for visual differentiation
- Hierarchical parent-child support
- Lock/unlock system values
- Set default value per category

#### 3.3.5 Organizations / Branches ✅

| Table | Usage in 002F.3E |
|-------|------------------|
| `owner_companies` | Optional FK for cost/profit center party filtering (future) |
| `branches` | Optional FK for cost/profit center party filtering (future) |
| `user_profiles` | Required for audit fields (`created_by`, `updated_by`, `deactivated_by`), optional for `sales_owner_user_profile_id` in customers |

### 3.4 Established Codebase Patterns Summary

| Pattern | Status | Reuse Strategy for 002F.3E |
|---------|--------|----------------------------|
| **BIGINT PK/FK** | ✅ Mandatory | All tables use `id bigint generated by default as identity primary key` |
| **User Profiles Audit** | ✅ Mandatory | `created_by`, `updated_by`, `deactivated_by` → `user_profiles.id` |
| **Soft Delete** | ✅ Mandatory | `is_active`, `deactivated_at`, `deactivated_by`, `deactivation_reason` |
| **System/Locked Protection** | ✅ Mandatory | `is_system`, `is_locked` with RLS enforcement |
| **Timestamps** | ✅ Mandatory | `created_at`, `updated_at` with `set_updated_at()` trigger |
| **Sort Order** | ✅ Mandatory | `sort_order integer not null default 0` |
| **RLS Enabled** | ✅ Mandatory | All tables with permission-gated policies |
| **Permissions** | ✅ Mandatory | `view`, `manage`, `export`, `audit_view` per entity |
| **Audit Logging** | ✅ Mandatory | `logAudit()` and `createAuditDiff()` for all mutations |
| **Zod Validation** | ✅ Mandatory | Create/update schemas with regex, length, and constraint validation |
| **ActionResult<T>** | ✅ Mandatory | All server actions return typed result with success/error |
| **ERPDataTable** | ✅ Mandatory | All list screens with sorting, filtering, global search, export |
| **ERPDrawerForm** | ✅ Mandatory | All create/edit forms with tabs/sections, validation display |
| **Select Components** | ✅ Mandatory | All FK fields use reusable select components (no hardcoded dropdowns) |
| **LookupSelect** | ✅ Mandatory | All classification fields use lookup categories |
| **Sidebar Navigation** | ✅ Mandatory | Menu groups with collapsed-by-default, manual multi-open behavior |

**Conclusion:** All established patterns are mature, well-documented, and ready for reuse in Phase 002F.3E. No architectural changes or new patterns are required.

---

## 4. Final Entity Category Decision

### 4.1 Main Entity Tables (6 Total)

The following 6 main entity categories are confirmed for dedicated table creation:

| # | Entity | Table Name | Primary Business Use Cases |
|---|--------|------------|---------------------------|
| 1 | **Customers** | `customers` | Main contractors, EPC contractors, scrap buyers, scrap suppliers, normal customers, partners |
| 2 | **Vendors** | `vendors` | Material suppliers, equipment suppliers, service providers, insurance companies, lessors (property/vehicle/equipment/camp) |
| 3 | **Subcontractors** | `subcontractors` | Civil subcontractors, manpower subcontractors, transporters, demolition subcontractors, equipment subcontractors, partners |
| 4 | **Consultants** | `consultants` | Engineering consultants, HSE consultants, legal consultants, technical consultants, environmental consultants |
| 5 | **Government Authorities** | `government_authorities` | Municipalities, police, civil defense, environmental authorities, free zones, waste disposal facilities, port customs, ministries, regulators |
| 6 | **Recruitment Agencies** | `recruitment_agencies` | Local recruitment agencies, overseas recruitment agencies, manpower supply agencies, executive search agencies |

**Rationale:**
- Each entity category has distinct business processes, workflows, and data requirements
- Customers vs. Vendors have different commercial relationships (we sell to customers, we buy from vendors)
- Subcontractors require specialized fields (HSE prequalification, worker/equipment supply flags)
- Consultants have distinct engagement models (advisory, not transactional)
- Government authorities require jurisdiction and authority type tracking (compliance/regulatory focus)
- Recruitment agencies are specialized vendors for HR/manpower (not material/equipment suppliers)

### 4.2 Entity Types Classified via Lookup Categories

The following business entity types are **not** separate tables but are classified via lookup categories:

| Business Entity Type | Classified Under | Lookup Category | Lookup Value Code |
|---------------------|------------------|-----------------|-------------------|
| **Main Contractors** | Customers | `CUSTOMER_TYPES` | `MAIN_CONTRACTOR` |
| **EPC Contractors** | Customers | `CUSTOMER_TYPES` | `EPC_CONTRACTOR` |
| **Scrap Buyers** | Customers | `CUSTOMER_TYPES` | `SCRAP_BUYER` |
| **Scrap Suppliers** | Customers | `CUSTOMER_TYPES` | `SCRAP_SUPPLIER` |
| **Partner Customers** | Customers | `CUSTOMER_TYPES` | `PARTNER_CUSTOMER` |
| **Normal Customers** | Customers | `CUSTOMER_TYPES` | `NORMAL_CUSTOMER` |
| **Material Suppliers** | Vendors | `VENDOR_TYPES` | `MATERIAL_SUPPLIER` |
| **Equipment Suppliers** | Vendors | `VENDOR_TYPES` | `EQUIPMENT_SUPPLIER` |
| **Service Providers** | Vendors | `VENDOR_TYPES` | `SERVICE_PROVIDER` |
| **Insurance Companies** | Vendors | `VENDOR_TYPES` | `INSURANCE_COMPANY` |
| **Property Lessors** | Vendors | `VENDOR_TYPES` | `PROPERTY_LESSOR` |
| **Vehicle Lessors** | Vendors | `VENDOR_TYPES` | `VEHICLE_LESSOR` |
| **Equipment Lessors** | Vendors | `VENDOR_TYPES` | `EQUIPMENT_LESSOR` |
| **Camp/Accommodation Lessors** | Vendors | `VENDOR_TYPES` | `CAMP_ACCOMMODATION_LESSOR` |
| **Civil Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `CIVIL_SUBCONTRACTOR` |
| **Manpower Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `MANPOWER_SUBCONTRACTOR` |
| **Transporters** | Subcontractors | `SUBCONTRACTOR_TYPES` | `TRANSPORTER` |
| **Demolition Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `DEMOLITION_SUBCONTRACTOR` |
| **Equipment Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `EQUIPMENT_SUBCONTRACTOR` |
| **Partner Subcontractors** | Subcontractors | `SUBCONTRACTOR_TYPES` | `PARTNER_SUBCONTRACTOR` |
| **Waste Disposal Facilities** | Government Authorities | `GOVERNMENT_AUTHORITY_TYPES` | `WASTE_DISPOSAL_FACILITY` |

**Rationale:**
- These entity types share the same core data structure (name, address, contact, TRN, license, etc.)
- The "type" distinction is for business classification, filtering, and reporting (not structural differences)
- Using lookup categories allows users to add new types without schema changes
- Reduces table proliferation (avoids 20+ separate tables for minor variations)
- Simplifies queries (single table with type filter vs. UNION across many tables)

### 4.3 Employees Explicitly Excluded

**Confirmation:** Employees are **not** part of Phase 002F.3E.

The following entity types and tables are explicitly excluded:

❌ `employees`  
❌ `employee_contacts`  
❌ `employee_documents`  
❌ `employee_dependents`  
❌ `employee_emergency_contacts`  
❌ `departments`  
❌ `positions`  
❌ `job_titles`  

**Reason:** Employees are handled in **Phase 002F.3F — HR Master Data**, which will create a separate, comprehensive HR foundation with employment contracts, salary structures, leave entitlements, etc. Mixing employees with customers/vendors/subcontractors violates the user's explicit requirement for separation.

### 4.4 Dual-Role Entity Handling

**Business Scenario:** A company may be both a customer and a vendor (e.g., a contractor we sell scrap to AND buy services from).

**Recommended Strategy:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **A. Separate Records** | Clean separation, clear relationship type, no data model complexity | Data duplication, separate contacts/addresses, risk of inconsistency | ✅ **Recommended for Phase 002F.3E** |
| **B. Shared Party Table** | Single source of truth, no duplication | High complexity, mixed business logic, harder to enforce constraints | ❌ Not aligned with user's separation requirement |
| **C. Link Table** | Tracks dual roles, links records | Adds complexity, query overhead, still requires separate records | ⏳ Future enhancement if needed |

**Decision:** Use **Approach A (Separate Records)** for Phase 002F.3E.

- If "ABC Trading LLC" is both a customer (we sell scrap to them) and a vendor (we buy equipment from them), create:
  - 1 record in `customers` table (for scrap sales relationship)
  - 1 record in `vendors` table (for equipment purchase relationship)
- Each record has independent contacts, addresses, bank details, commercial terms
- This aligns with the user's stated preference for clear separation by business category
- Future: If cross-entity linkage is needed, a `party_relationships` table can be added in a later phase

---

## 5. Dedicated Table Decision Matrix

### 5.1 Entity Table Summary

| Entity | Dedicated Table | Child Tables | Total Tables | Rationale |
|--------|----------------|--------------|--------------|-----------|
| **Customers** | `customers` | `customer_contacts`, `customer_addresses`, `customer_documents`, optional `customer_bank_details` | 4-5 | Primary revenue source, CRM foundation, sales owner tracking, credit management |
| **Vendors** | `vendors` | `vendor_contacts`, `vendor_addresses`, `vendor_documents`, `vendor_bank_details` | 4 | Payment processing requires bank details, procurement integration, supplier management |
| **Subcontractors** | `subcontractors` | `subcontractor_contacts`, `subcontractor_addresses`, `subcontractor_documents`, `subcontractor_bank_details` | 4 | HSE prequalification, worker/equipment supply tracking, payment processing |
| **Consultants** | `consultants` | `consultant_contacts`, `consultant_addresses`, `consultant_documents`, `consultant_bank_details` | 4 | Professional services, engagement tracking, payment processing |
| **Government Authorities** | `government_authorities` | `government_authority_contacts`, `government_authority_addresses`, `government_authority_documents` | 3 | Compliance/regulatory focus, no bank details (fees paid via government portals), jurisdiction tracking |
| **Recruitment Agencies** | `recruitment_agencies` | `recruitment_agency_contacts`, `recruitment_agency_addresses`, `recruitment_agency_documents`, `recruitment_agency_bank_details` | 4 | HR integration, manpower supply, payment processing, countries served tracking |
| **Total** | **6 main tables** | **23-24 child tables** | **29-30 tables** | Comprehensive party master data foundation |

### 5.2 Customer Bank Details Decision

**Question:** Should `customer_bank_details` table be created?

| Scenario | Need Bank Details? | Rationale |
|----------|-------------------|-----------|
| **Normal B2B Sales** | ❌ No | Customers pay us (we receive payments via our bank accounts, not theirs) |
| **Scrap Sales with Advance Payment** | ❌ No | Advance payments received to our account, not outgoing to customer |
| **Customer Refunds** | ✅ Yes (edge case) | Refunds for overpayments or returned goods require customer bank details |
| **Customer Rebates / Incentives** | ✅ Yes | Year-end rebates or volume discounts paid to customers require bank details |
| **Scrap Purchases (Customer as Scrap Supplier)** | ✅ Yes | If customer is also a scrap supplier, we pay them for scrap material |

**Recommendation:** **Create `customer_bank_details` table (optional)**

**Rationale:**
- Future-proofing: Customer refunds and rebates are common business scenarios
- Scrap trading: Alliance Gulf Transport's scrap business includes buying scrap from some customers
- Low cost: Adding the table now avoids schema migration later
- Optional usage: If a customer never requires refunds/rebates, the table remains empty for that customer
- Consistency: All payment-related entities have bank details tables (vendors, subcontractors, consultants, recruitment agencies)

**Decision:** ✅ Include `customer_bank_details` in Phase 002F.3E.

### 5.3 Final Table Count

**Main Entity Tables:** 6  
**Contact Tables:** 6  
**Address Tables:** 6  
**Document Tables:** 6  
**Bank Details Tables:** 6 (including `customer_bank_details`)  

**Total New Tables:** **30 tables**

**Plus:**
- **20+ new lookup categories** in `global_lookup_categories`
- **100+ new lookup values** in `global_lookup_values`

**Total Database Objects:** 30 tables + 20+ lookup categories + 100+ lookup values + 180+ RLS policies + 60+ indexes + 30 triggers

---

## 6. Lookup Category Plan

### 6.1 Overview

Phase 002F.3E requires **22 new lookup categories** with **approximately 120 new lookup values** to support party classification, status management, and operational workflows.

**Design Principle:** No hardcoded dropdowns. All classification and status fields must use lookup categories that are:
- Editable by authorized users via the Global Lookup Engine UI
- System-locked for critical values (e.g., ACTIVE status)
- Badge-styled for visual differentiation
- Hierarchical where parent-child relationships add value

### 6.2 New Lookup Categories Required

#### 6.2.1 Party Status and Classification

| Category Code | Category Name | Description | Seed Values Count | Is System | Module Code |
|---------------|---------------|-------------|-------------------|-----------|-------------|
| `PARTY_STATUS_TYPES` | Party Status Types | Common status values for all party entities | 5 | Yes | `PARTIES` |
| `CUSTOMER_TYPES` | Customer Types | Customer classification types | 6 | Yes | `PARTIES` |
| `CUSTOMER_SEGMENTS` | Customer Segments | Customer segmentation for CRM and marketing | 5 | No | `PARTIES` |
| `VENDOR_TYPES` | Vendor Types | Vendor classification types | 10 | Yes | `PARTIES` |
| `VENDOR_CATEGORIES` | Vendor Categories | Additional vendor categorization | 8 | No | `PARTIES` |
| `SUPPLIER_CATEGORIES` | Supplier Categories | Material and equipment supplier categories | 12 | No | `PARTIES` |
| `SUBCONTRACTOR_TYPES` | Subcontractor Types | Subcontractor classification types | 6 | Yes | `PARTIES` |
| `SUBCONTRACTOR_CATEGORIES` | Subcontractor Categories | Additional subcontractor categorization | 6 | No | `PARTIES` |
| `CONSULTANT_TYPES` | Consultant Types | Consultant classification types | 5 | Yes | `PARTIES` |
| `CONSULTANT_CATEGORIES` | Consultant Categories | Additional consultant categorization | 4 | No | `PARTIES` |
| `GOVERNMENT_AUTHORITY_TYPES` | Government Authority Types | Government authority classification | 9 | Yes | `PARTIES` |
| `GOVERNMENT_AUTHORITY_CATEGORIES` | Government Authority Categories | Additional authority categorization | 4 | No | `PARTIES` |
| `JURISDICTION_LEVEL_TYPES` | Jurisdiction Level Types | Authority jurisdiction levels | 4 | Yes | `PARTIES` |
| `RECRUITMENT_AGENCY_TYPES` | Recruitment Agency Types | Recruitment agency classification | 4 | Yes | `PARTIES` |
| `RECRUITMENT_AGENCY_CATEGORIES` | Recruitment Agency Categories | Additional agency categorization | 3 | No | `PARTIES` |
| `INDUSTRY_TYPES` | Industry Types | Industry/sector classification for customers and vendors | 15 | No | `PARTIES` |
| `CRM_LEAD_SOURCES` | CRM Lead Sources | Customer lead source tracking | 9 | No | `PARTIES` |

**Subtotal: 17 categories for classification**

#### 6.2.2 Contact, Address, and Document Management

| Category Code | Category Name | Description | Seed Values Count | Is System | Module Code |
|---------------|---------------|-------------|-------------------|-----------|-------------|
| `CONTACT_TYPES` | Contact Types | Contact person role/function types | 10 | No | `PARTIES` |
| `COMMUNICATION_PREFERENCE_TYPES` | Communication Preference Types | Preferred communication channels | 6 | No | `PARTIES` |
| `ADDRESS_TYPES` | Address Types | Address classification (billing, shipping, site, office) | 6 | No | `PARTIES` |
| `PARTY_DOCUMENT_TYPES` | Party Document Types | Document types for customers, vendors, subcontractors, etc. | 20 | No | `PARTIES` |
| `BANK_ACCOUNT_TYPES` | Bank Account Types | Bank account classification | 4 | No | `PARTIES` |

**Subtotal: 5 categories for operational management**

**Total New Lookup Categories:** **22 categories**  
**Total New Lookup Values:** **Approximately 120 values**

### 6.3 Detailed Lookup Category Specifications

#### 6.3.1 PARTY_STATUS_TYPES

```sql
-- Category
category_code: 'PARTY_STATUS_TYPES'
category_name_en: 'Party Status Types'
description: 'Common status values for all party entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)'
module_code: 'PARTIES'
is_system: true
is_locked: true
sort_order: 10

-- Values
ACTIVE                → Active                  → Green badge    → is_system: true, is_locked: true, is_default: true
INACTIVE              → Inactive                → Gray badge     → is_system: true, is_locked: true
BLACKLISTED           → Blacklisted             → Red badge      → is_system: true, is_locked: true
ON_HOLD               → On Hold                 → Yellow badge   → is_system: true, is_locked: true
UNDER_REVIEW          → Under Review            → Blue badge     → is_system: true, is_locked: false
```

**Usage:** `customers.status_code`, `vendors.status_code`, `subcontractors.status_code`, `consultants.status_code`, `government_authorities.status_code`, `recruitment_agencies.status_code`

**Rationale:** Unified status management across all party types. System-locked to ensure critical statuses (ACTIVE, INACTIVE, BLACKLISTED) cannot be accidentally deleted.

#### 6.3.2 CUSTOMER_TYPES

```sql
-- Category
category_code: 'CUSTOMER_TYPES'
category_name_en: 'Customer Types'
description: 'Customer classification types for Alliance Gulf Transport business units'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 20

-- Values
NORMAL_CUSTOMER       → Normal Customer         → Blue badge     → is_default: true
MAIN_CONTRACTOR       → Main Contractor         → Purple badge
EPC_CONTRACTOR        → EPC Contractor          → Purple badge
SCRAP_BUYER           → Scrap Buyer             → Green badge
SCRAP_SUPPLIER        → Scrap Supplier          → Orange badge
PARTNER_CUSTOMER      → Partner Customer        → Gold badge
```

**Usage:** `customers.customer_type_code`

**Rationale:**
- MAIN_CONTRACTOR/EPC_CONTRACTOR: Large projects, complex commercial terms, retention management
- SCRAP_BUYER/SCRAP_SUPPLIER: Scrap trading business unit (buying and selling scrap)
- PARTNER_CUSTOMER: Strategic partners, joint ventures
- NORMAL_CUSTOMER: Standard B2B customers

#### 6.3.3 CUSTOMER_SEGMENTS

```sql
-- Category
category_code: 'CUSTOMER_SEGMENTS'
category_name_en: 'Customer Segments'
description: 'Customer segmentation for CRM, marketing, and sales prioritization'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 30

-- Values
ENTERPRISE            → Enterprise              → Gold badge     → Large corporations, high value
CORPORATE             → Corporate               → Blue badge     → Mid-size companies
SME                   → SME                     → Green badge    → Small-medium enterprises
GOVERNMENT            → Government              → Purple badge   → Government entities
ONE_TIME              → One-Time                → Gray badge     → Single transaction customers
```

**Usage:** `customers.customer_segment_code`

**Rationale:** Enables CRM segmentation, sales prioritization, and targeted marketing campaigns.

#### 6.3.4 VENDOR_TYPES

```sql
-- Category
category_code: 'VENDOR_TYPES'
category_name_en: 'Vendor Types'
description: 'Vendor classification types for procurement and supplier management'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 40

-- Values
SUPPLIER              → Supplier                → Blue badge     → is_default: true
MATERIAL_SUPPLIER     → Material Supplier       → Green badge
EQUIPMENT_SUPPLIER    → Equipment Supplier      → Orange badge
SERVICE_PROVIDER      → Service Provider        → Purple badge
INSURANCE_COMPANY     → Insurance Company       → Yellow badge
PROPERTY_LESSOR       → Property Lessor         → Brown badge
VEHICLE_LESSOR        → Vehicle Lessor          → Brown badge
EQUIPMENT_LESSOR      → Equipment Lessor        → Brown badge
CAMP_ACCOMMODATION_LESSOR → Camp/Accommodation Lessor → Brown badge
UTILITY_PROVIDER      → Utility Provider        → Gray badge
```

**Usage:** `vendors.vendor_type_code`

**Rationale:**
- Separates material/equipment suppliers from service providers
- Tracks lessors by asset type (property, vehicle, equipment, camp)
- Insurance companies and utility providers are distinct vendor types

#### 6.3.5 VENDOR_CATEGORIES

```sql
-- Category
category_code: 'VENDOR_CATEGORIES'
category_name_en: 'Vendor Categories'
description: 'Additional vendor categorization for supplier management'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 50

-- Values
PREFERRED_VENDOR      → Preferred Vendor        → Gold badge
APPROVED_VENDOR       → Approved Vendor         → Green badge
TRIAL_VENDOR          → Trial Vendor            → Blue badge
LOCAL_VENDOR          → Local Vendor            → Green badge
INTERNATIONAL_VENDOR  → International Vendor    → Blue badge
STRATEGIC_PARTNER     → Strategic Partner       → Purple badge
SINGLE_SOURCE         → Single Source           → Red badge
BACKUP_VENDOR         → Backup Vendor           → Orange badge
```

**Usage:** `vendors.vendor_category_code`

**Rationale:** Enables vendor performance tracking, strategic sourcing, and supplier relationship management.

#### 6.3.6 SUPPLIER_CATEGORIES

```sql
-- Category
category_code: 'SUPPLIER_CATEGORIES'
category_name_en: 'Supplier Categories'
description: 'Material and equipment supplier categories for procurement'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 60

-- Values
SPARE_PARTS           → Spare Parts             → Blue badge
LUBRICANTS            → Lubricants              → Orange badge
TYRES                 → Tyres                   → Black badge
BATTERIES             → Batteries               → Yellow badge
TOOLS_EQUIPMENT       → Tools & Equipment       → Green badge
SAFETY_EQUIPMENT      → Safety Equipment        → Red badge
OFFICE_SUPPLIES       → Office Supplies         → Gray badge
CLEANING_SUPPLIES     → Cleaning Supplies       → Cyan badge
FUEL_DIESEL           → Fuel & Diesel           → Red badge
CONSTRUCTION_MATERIALS → Construction Materials → Brown badge
SCRAP_MATERIALS       → Scrap Materials         → Orange badge
WASTE_DISPOSAL        → Waste Disposal          → Green badge
```

**Usage:** `vendors.supplier_category_code` (when `vendor_type_code` is MATERIAL_SUPPLIER or EQUIPMENT_SUPPLIER)

**Rationale:** Detailed supplier categorization for inventory, procurement, and spend analysis.

#### 6.3.7 SUBCONTRACTOR_TYPES

```sql
-- Category
category_code: 'SUBCONTRACTOR_TYPES'
category_name_en: 'Subcontractor Types'
description: 'Subcontractor classification types for subcontracting management'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 70

-- Values
CIVIL_SUBCONTRACTOR   → Civil Subcontractor     → Blue badge     → is_default: true
MANPOWER_SUBCONTRACTOR → Manpower Subcontractor → Green badge
TRANSPORTER           → Transporter             → Orange badge
DEMOLITION_SUBCONTRACTOR → Demolition Subcontractor → Red badge
EQUIPMENT_SUBCONTRACTOR → Equipment Subcontractor → Purple badge
PARTNER_SUBCONTRACTOR → Partner Subcontractor   → Gold badge
```

**Usage:** `subcontractors.subcontractor_type_code`

**Rationale:**
- CIVIL_SUBCONTRACTOR: Construction and civil works
- MANPOWER_SUBCONTRACTOR: Labor supply
- TRANSPORTER: Transportation and logistics services
- DEMOLITION_SUBCONTRACTOR: Demolition projects
- EQUIPMENT_SUBCONTRACTOR: Equipment rental with operator
- PARTNER_SUBCONTRACTOR: Joint venture or strategic partners

#### 6.3.8 SUBCONTRACTOR_CATEGORIES

```sql
-- Category
category_code: 'SUBCONTRACTOR_CATEGORIES'
category_name_en: 'Subcontractor Categories'
description: 'Additional subcontractor categorization for performance tracking'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 80

-- Values
PREFERRED_SUBCONTRACTOR → Preferred Subcontractor → Gold badge
APPROVED_SUBCONTRACTOR → Approved Subcontractor → Green badge
TRIAL_SUBCONTRACTOR   → Trial Subcontractor     → Blue badge
HSE_CERTIFIED         → HSE Certified           → Green badge
ISO_CERTIFIED         → ISO Certified           → Blue badge
BLACKLISTED           → Blacklisted             → Red badge
```

**Usage:** `subcontractors.subcontractor_category_code`

**Rationale:** Tracks subcontractor qualifications, HSE compliance, and performance history.

#### 6.3.9 CONSULTANT_TYPES

```sql
-- Category
category_code: 'CONSULTANT_TYPES'
category_name_en: 'Consultant Types'
description: 'Consultant classification types for professional services'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 90

-- Values
ENGINEERING_CONSULTANT → Engineering Consultant  → Blue badge     → is_default: true
HSE_CONSULTANT        → HSE Consultant          → Red badge
LEGAL_CONSULTANT      → Legal Consultant        → Purple badge
TECHNICAL_CONSULTANT  → Technical Consultant    → Green badge
ENVIRONMENTAL_CONSULTANT → Environmental Consultant → Green badge
```

**Usage:** `consultants.consultant_type_code`

**Rationale:** Separates consultants by professional specialty for engagement tracking and compliance.

#### 6.3.10 CONSULTANT_CATEGORIES

```sql
-- Category
category_code: 'CONSULTANT_CATEGORIES'
category_name_en: 'Consultant Categories'
description: 'Additional consultant categorization'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 100

-- Values
RETAINER_CONSULTANT   → Retainer Consultant     → Gold badge
PROJECT_CONSULTANT    → Project Consultant      → Blue badge
ADVISORY_CONSULTANT   → Advisory Consultant     → Purple badge
AUDIT_CONSULTANT      → Audit Consultant        → Red badge
```

**Usage:** `consultants.consultant_category_code`

**Rationale:** Tracks consultant engagement models (retainer vs. project-based).

#### 6.3.11 GOVERNMENT_AUTHORITY_TYPES

```sql
-- Category
category_code: 'GOVERNMENT_AUTHORITY_TYPES'
category_name_en: 'Government Authority Types'
description: 'Government authority classification for compliance and regulatory management'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 110

-- Values
MUNICIPALITY          → Municipality            → Blue badge     → is_default: true
POLICE                → Police                  → Red badge
CIVIL_DEFENSE         → Civil Defense           → Red badge
ENVIRONMENTAL_AUTHORITY → Environmental Authority → Green badge
FREE_ZONE_AUTHORITY   → Free Zone Authority     → Purple badge
WASTE_DISPOSAL_FACILITY → Waste Disposal Facility → Orange badge
PORT_CUSTOMS_AUTHORITY → Port & Customs Authority → Blue badge
MINISTRY              → Ministry                → Purple badge
REGULATOR             → Regulator               → Gray badge
```

**Usage:** `government_authorities.authority_type_code`

**Rationale:** Tracks government entities by function for compliance, permits, inspections, and correspondence.

#### 6.3.12 GOVERNMENT_AUTHORITY_CATEGORIES

```sql
-- Category
category_code: 'GOVERNMENT_AUTHORITY_CATEGORIES'
category_name_en: 'Government Authority Categories'
description: 'Additional government authority categorization'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 120

-- Values
PERMIT_ISSUING        → Permit Issuing          → Blue badge
INSPECTION_AUTHORITY  → Inspection Authority    → Orange badge
REGULATORY_BODY       → Regulatory Body         → Purple badge
LICENSING_AUTHORITY   → Licensing Authority     → Green badge
```

**Usage:** `government_authorities.authority_category_code`

**Rationale:** Categorizes authorities by their function for workflow routing and compliance tracking.

#### 6.3.13 JURISDICTION_LEVEL_TYPES

```sql
-- Category
category_code: 'JURISDICTION_LEVEL_TYPES'
category_name_en: 'Jurisdiction Level Types'
description: 'Government authority jurisdiction levels'
module_code: 'PARTIES'
is_system: true
is_locked: true
sort_order: 130

-- Values
FEDERAL               → Federal                 → Purple badge   → is_system: true
EMIRATE               → Emirate                 → Blue badge     → is_system: true
MUNICIPAL             → Municipal               → Green badge    → is_system: true
FREE_ZONE             → Free Zone               → Orange badge   → is_system: true
```

**Usage:** `government_authorities.jurisdiction_level_code`

**Rationale:** Critical for understanding authority scope and compliance hierarchy. System-locked to prevent accidental modification.

#### 6.3.14 RECRUITMENT_AGENCY_TYPES

```sql
-- Category
category_code: 'RECRUITMENT_AGENCY_TYPES'
category_name_en: 'Recruitment Agency Types'
description: 'Recruitment agency classification for HR and manpower management'
module_code: 'PARTIES'
is_system: true
is_locked: false
sort_order: 140

-- Values
LOCAL_RECRUITMENT_AGENCY → Local Recruitment Agency → Blue badge → is_default: true
OVERSEAS_RECRUITMENT_AGENCY → Overseas Recruitment Agency → Green badge
MANPOWER_SUPPLY_AGENCY → Manpower Supply Agency → Orange badge
EXECUTIVE_SEARCH_AGENCY → Executive Search Agency → Purple badge
```

**Usage:** `recruitment_agencies.agency_type_code`

**Rationale:** Separates local vs. overseas recruitment, manpower supply (blue-collar) vs. executive search (white-collar).

#### 6.3.15 RECRUITMENT_AGENCY_CATEGORIES

```sql
-- Category
category_code: 'RECRUITMENT_AGENCY_CATEGORIES'
category_name_en: 'Recruitment Agency Categories'
description: 'Additional recruitment agency categorization'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 150

-- Values
PREFERRED_AGENCY      → Preferred Agency        → Gold badge
APPROVED_AGENCY       → Approved Agency         → Green badge
TRIAL_AGENCY          → Trial Agency            → Blue badge
```

**Usage:** `recruitment_agencies.agency_category_code`

**Rationale:** Tracks agency performance and approval status for HR vendor management.

#### 6.3.16 INDUSTRY_TYPES

```sql
-- Category
category_code: 'INDUSTRY_TYPES'
category_name_en: 'Industry Types'
description: 'Industry/sector classification for customers and vendors'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 160

-- Values
CONSTRUCTION          → Construction            → Blue badge
OIL_GAS               → Oil & Gas               → Red badge
MANUFACTURING         → Manufacturing           → Gray badge
TRANSPORTATION_LOGISTICS → Transportation & Logistics → Orange badge
WASTE_MANAGEMENT      → Waste Management        → Green badge
GOVERNMENT            → Government              → Purple badge
REAL_ESTATE           → Real Estate             → Brown badge
HOSPITALITY           → Hospitality             → Cyan badge
RETAIL                → Retail                  → Pink badge
AUTOMOTIVE            → Automotive              → Black badge
UTILITIES             → Utilities               → Yellow badge
HEALTHCARE            → Healthcare              → Red badge
EDUCATION             → Education               → Blue badge
SCRAP_TRADING         → Scrap Trading           → Orange badge
DEMOLITION            → Demolition              → Red badge
```

**Usage:** `customers.industry_type_code`, `vendors.industry_type_code` (optional)

**Rationale:** Enables industry-based customer segmentation, market analysis, and targeted sales strategies.

#### 6.3.17 CRM_LEAD_SOURCES

```sql
-- Category
category_code: 'CRM_LEAD_SOURCES'
category_name_en: 'CRM Lead Sources'
description: 'Customer lead source tracking for CRM and marketing ROI'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 170

-- Values
REFERRAL              → Referral                → Gold badge
WEBSITE               → Website                 → Blue badge
EMAIL_CAMPAIGN        → Email Campaign          → Green badge
PHONE_CALL            → Phone Call              → Orange badge
SITE_VISIT            → Site Visit              → Purple badge
TENDER                → Tender                  → Red badge
EXISTING_CUSTOMER     → Existing Customer       → Green badge
SOCIAL_MEDIA          → Social Media            → Cyan badge
ADVERTISEMENT         → Advertisement           → Yellow badge
```

**Usage:** `customers.lead_source_code`

**Rationale:** Tracks customer acquisition channels for marketing ROI analysis and lead source optimization.

#### 6.3.18 CONTACT_TYPES

```sql
-- Category
category_code: 'CONTACT_TYPES'
category_name_en: 'Contact Types'
description: 'Contact person role/function types for all party entities'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 180

-- Values
GENERAL               → General                 → Gray badge     → is_default: true
SALES                 → Sales                   → Blue badge
PROCUREMENT           → Procurement             → Green badge
FINANCE               → Finance                 → Yellow badge
OPERATIONS            → Operations              → Orange badge
HSE                   → HSE                     → Red badge
TECHNICAL             → Technical               → Purple badge
MANAGEMENT            → Management              → Gold badge
SITE_CONTACT          → Site Contact            → Brown badge
AUTHORIZED_SIGNATORY  → Authorized Signatory    → Red badge
```

**Usage:** `customer_contacts.contact_type_code`, `vendor_contacts.contact_type_code`, etc. (all 6 contact tables)

**Rationale:** Enables contact filtering by function (e.g., show all finance contacts for payment follow-up, all HSE contacts for safety coordination).

#### 6.3.19 COMMUNICATION_PREFERENCE_TYPES

```sql
-- Category
category_code: 'COMMUNICATION_PREFERENCE_TYPES'
category_name_en: 'Communication Preference Types'
description: 'Preferred communication channels for contacts'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 190

-- Values
EMAIL                 → Email                   → Blue badge     → is_default: true
PHONE                 → Phone                   → Green badge
MOBILE                → Mobile                  → Green badge
WHATSAPP              → WhatsApp                → Green badge
SMS                   → SMS                     → Orange badge
IN_PERSON             → In Person               → Purple badge
```

**Usage:** `customer_contacts.preferred_communication_code`, `vendor_contacts.preferred_communication_code`, etc. (all 6 contact tables)

**Rationale:** Respects contact communication preferences, improves response rates, and enhances customer/vendor relationships.

#### 6.3.20 ADDRESS_TYPES

```sql
-- Category
category_code: 'ADDRESS_TYPES'
category_name_en: 'Address Types'
description: 'Address classification for billing, shipping, site, and office locations'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 200

-- Values
PRIMARY               → Primary                 → Blue badge     → is_default: true
BILLING               → Billing                 → Yellow badge
SHIPPING              → Shipping                → Green badge
SITE                  → Site                    → Orange badge
OFFICE                → Office                  → Blue badge
WAREHOUSE             → Warehouse               → Brown badge
```

**Usage:** `customer_addresses.address_type_code`, `vendor_addresses.address_type_code`, etc. (all 6 address tables)

**Rationale:** Enables proper address selection for invoices (billing address), deliveries (shipping address), site visits (site address).

#### 6.3.21 PARTY_DOCUMENT_TYPES

```sql
-- Category
category_code: 'PARTY_DOCUMENT_TYPES'
category_name_en: 'Party Document Types'
description: 'Document types for customers, vendors, subcontractors, consultants, government authorities, recruitment agencies'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 210

-- Values (20 seed values)
TRADE_LICENSE         → Trade License           → Blue badge
TRN_CERTIFICATE       → TRN Certificate         → Green badge
VAT_CERTIFICATE       → VAT Certificate         → Green badge
COMMERCIAL_REGISTRATION → Commercial Registration → Blue badge
INSURANCE_POLICY      → Insurance Policy        → Yellow badge
BANK_DETAILS_DOCUMENT → Bank Details Document   → Orange badge
AUTHORIZED_SIGNATORY_DOC → Authorized Signatory Document → Red badge
BOARD_RESOLUTION      → Board Resolution        → Purple badge
POWER_OF_ATTORNEY     → Power of Attorney       → Purple badge
HSE_CERTIFICATE       → HSE Certificate         → Red badge
ISO_CERTIFICATE       → ISO Certificate         → Blue badge
QUALITY_CERTIFICATE   → Quality Certificate     → Green badge
PASSPORT_COPY         → Passport Copy           → Gray badge
EMIRATES_ID_COPY      → Emirates ID Copy        → Gray badge
CONTRACT_AGREEMENT    → Contract Agreement      → Purple badge
NDA                   → NDA                     → Red badge
PREQUALIFICATION_DOC  → Prequalification Document → Orange badge
AUDIT_REPORT          → Audit Report            → Blue badge
FINANCIAL_STATEMENT   → Financial Statement     → Yellow badge
REFERENCE_LETTER      → Reference Letter        → Green badge
```

**Usage:** `customer_documents.document_type_code`, `vendor_documents.document_type_code`, etc. (all 6 document tables)

**Rationale:** Comprehensive document tracking with expiry management for compliance (trade license, TRN, insurance, HSE certificates).

#### 6.3.22 BANK_ACCOUNT_TYPES

```sql
-- Category
category_code: 'BANK_ACCOUNT_TYPES'
category_name_en: 'Bank Account Types'
description: 'Bank account classification for payment processing'
module_code: 'PARTIES'
is_system: false
is_locked: false
sort_order: 220

-- Values
CURRENT_ACCOUNT       → Current Account         → Blue badge     → is_default: true
SAVINGS_ACCOUNT       → Savings Account         → Green badge
ESCROW_ACCOUNT        → Escrow Account          → Purple badge
FOREIGN_CURRENCY      → Foreign Currency Account → Orange badge
```

**Usage:** `vendor_bank_details.bank_account_type_code`, `subcontractor_bank_details.bank_account_type_code`, etc. (all 6 bank details tables)

**Rationale:** Tracks account types for payment processing, foreign currency payments, and escrow arrangements.

### 6.4 Lookup Category Seed SQL Summary

**Total Categories:** 22  
**Total Values:** ~120  
**Module Code:** `PARTIES` for all categories  
**System Locked:** 5 categories (PARTY_STATUS_TYPES, CUSTOMER_TYPES, VENDOR_TYPES, SUBCONTRACTOR_TYPES, CONSULTANT_TYPES, GOVERNMENT_AUTHORITY_TYPES, JURISDICTION_LEVEL_TYPES, RECRUITMENT_AGENCY_TYPES)  
**User-Editable:** 14 categories (segmentation, categorization, operational)  

**Implementation Strategy:**
1. Create lookup categories via INSERT INTO `global_lookup_categories`
2. Create lookup values via INSERT INTO `global_lookup_values`
3. System-lock critical categories to prevent deletion
4. Set default values where appropriate (e.g., ACTIVE status, NORMAL_CUSTOMER type)
5. Assign badge variants for visual differentiation in UI

---

## 7. Database Schema Plan

### 7.1 Schema Overview

Phase 002F.3E will create **30 new tables**:
- 6 main entity tables (customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies)
- 6 contact tables
- 6 address tables
- 6 document tables
- 6 bank details tables

All tables follow the established ERP BASE patterns (BIGINT PKs/FKs, user_profiles audit fields, soft delete, system/locked protection, RLS enabled).

### 7.2 Standard Field Template

All tables include these standard fields (not repeated in individual table specs below):

```sql
-- Primary Key
id bigint generated by default as identity primary key,

-- Audit Fields
created_at timestamptz not null default now(),
created_by bigint references public.user_profiles(id),
updated_at timestamptz not null default now(),
updated_by bigint references public.user_profiles(id),
deactivated_at timestamptz,
deactivated_by bigint references public.user_profiles(id),
deactivation_reason text,

-- Status Fields
is_active boolean not null default true,
is_locked boolean not null default false,
is_system boolean not null default false,
sort_order integer not null default 0
```

### 7.3 Main Entity Tables

#### 7.3.1 customers

**Purpose:** Customer master data for sales, CRM, scrap trading, and commercial transactions.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `customer_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., CUST-0001) |
| `customer_name_en` | `text` | `not null` | Customer legal name (English) |
| `customer_name_ar` | `text` | `null` | Customer legal name (Arabic) |
| `customer_type_code` | `text` | `not null` → `CUSTOMER_TYPES` | Customer classification (MAIN_CONTRACTOR, SCRAP_BUYER, etc.) |
| `industry_type_code` | `text` | `null` → `INDUSTRY_TYPES` | Industry/sector classification |
| `customer_segment_code` | `text` | `null` → `CUSTOMER_SEGMENTS` | CRM segmentation (ENTERPRISE, CORPORATE, SME, etc.) |
| `lead_source_code` | `text` | `null` → `CRM_LEAD_SOURCES` | How the customer was acquired |
| `trn` | `text` | `null unique` | UAE Tax Registration Number (15 digits) |
| `trade_license_number` | `text` | `null` | Trade license number |
| `license_expiry_date` | `date` | `null` | Trade license expiry date |
| `website_url` | `text` | `null` | Customer website URL |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `country_id` | `bigint` | `null` → `countries.id` | Primary country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Primary emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | Primary city (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Primary area/zone (FK) |
| `address_line_1` | `text` | `null` | Primary address line 1 |
| `address_line_2` | `text` | `null` | Primary address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `makani_number` | `text` | `null` | Dubai Makani number (smart addressing) |
| `currency_id` | `bigint` | `null` → `currencies.id` | Default currency for transactions (FK) |
| `payment_term_id` | `bigint` | `null` → `payment_terms.id` | Default payment terms (FK) |
| `tax_type_id` | `bigint` | `null` → `tax_types.id` | Default tax treatment (FK) |
| `credit_limit` | `numeric(15,2)` | `null` | Credit limit amount |
| `credit_days` | `integer` | `null` | Credit days allowed |
| `sales_owner_user_profile_id` | `bigint` | `null` → `user_profiles.id` | Assigned sales owner (FK) |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, BLACKLISTED, etc.) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:**

```sql
create index idx_customers_customer_code on customers(customer_code);
create index idx_customers_trn on customers(trn) where trn is not null;
create index idx_customers_customer_type_code on customers(customer_type_code);
create index idx_customers_industry_type_code on customers(industry_type_code) where industry_type_code is not null;
create index idx_customers_status_code on customers(status_code);
create index idx_customers_is_active on customers(is_active);
create index idx_customers_country_id on customers(country_id) where country_id is not null;
create index idx_customers_emirate_id on customers(emirate_id) where emirate_id is not null;
create index idx_customers_sales_owner_user_profile_id on customers(sales_owner_user_profile_id) where sales_owner_user_profile_id is not null;
create index idx_customers_customer_name_en on customers(customer_name_en);
```

**Triggers:**

```sql
create trigger set_updated_at before update on customers
  for each row execute function set_updated_at();
```

**Constraints:**

```sql
alter table customers add constraint customers_trn_format check (trn ~ '^[0-9]{15}$' or trn is null);
alter table customers add constraint customers_email_format check (primary_email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' or primary_email is null);
alter table customers add constraint customers_credit_limit_positive check (credit_limit >= 0 or credit_limit is null);
alter table customers add constraint customers_credit_days_positive check (credit_days >= 0 or credit_days is null);
```

#### 7.3.2 vendors

**Purpose:** Vendor master data for procurement, supplier management, and payables.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `vendor_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., VEND-0001) |
| `vendor_name_en` | `text` | `not null` | Vendor legal name (English) |
| `vendor_name_ar` | `text` | `null` | Vendor legal name (Arabic) |
| `vendor_type_code` | `text` | `not null` → `VENDOR_TYPES` | Vendor classification (SUPPLIER, SERVICE_PROVIDER, LESSOR, etc.) |
| `vendor_category_code` | `text` | `null` → `VENDOR_CATEGORIES` | Vendor categorization (PREFERRED_VENDOR, APPROVED_VENDOR, etc.) |
| `supplier_category_code` | `text` | `null` → `SUPPLIER_CATEGORIES` | Supplier category (SPARE_PARTS, LUBRICANTS, etc.) |
| `trn` | `text` | `null unique` | UAE Tax Registration Number (15 digits) |
| `trade_license_number` | `text` | `null` | Trade license number |
| `license_expiry_date` | `date` | `null` | Trade license expiry date |
| `website_url` | `text` | `null` | Vendor website URL |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `country_id` | `bigint` | `null` → `countries.id` | Primary country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Primary emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | Primary city (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Primary area/zone (FK) |
| `address_line_1` | `text` | `null` | Primary address line 1 |
| `address_line_2` | `text` | `null` | Primary address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `makani_number` | `text` | `null` | Dubai Makani number (smart addressing) |
| `currency_id` | `bigint` | `null` → `currencies.id` | Default currency for transactions (FK) |
| `payment_term_id` | `bigint` | `null` → `payment_terms.id` | Default payment terms (FK) |
| `tax_type_id` | `bigint` | `null` → `tax_types.id` | Default tax treatment (FK) |
| `default_bank_id` | `bigint` | `null` → `banks.id` | Default bank for payments (FK, references master banks table) |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, BLACKLISTED, etc.) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:** Similar to customers (vendor_code, trn, vendor_type_code, status_code, is_active, country_id, emirate_id, vendor_name_en)

**Triggers:** `set_updated_at` trigger

**Constraints:** TRN format, email format validation

#### 7.3.3 subcontractors

**Purpose:** Subcontractor master data for subcontracting, manpower supply, transportation, and HSE tracking.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `subcontractor_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., SUBC-0001) |
| `subcontractor_name_en` | `text` | `not null` | Subcontractor legal name (English) |
| `subcontractor_name_ar` | `text` | `null` | Subcontractor legal name (Arabic) |
| `subcontractor_type_code` | `text` | `not null` → `SUBCONTRACTOR_TYPES` | Subcontractor classification (CIVIL, MANPOWER, TRANSPORTER, etc.) |
| `subcontractor_category_code` | `text` | `null` → `SUBCONTRACTOR_CATEGORIES` | Subcontractor categorization (PREFERRED, APPROVED, etc.) |
| `trn` | `text` | `null unique` | UAE Tax Registration Number (15 digits) |
| `trade_license_number` | `text` | `null` | Trade license number |
| `license_expiry_date` | `date` | `null` | Trade license expiry date |
| `website_url` | `text` | `null` | Subcontractor website URL |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `country_id` | `bigint` | `null` → `countries.id` | Primary country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Primary emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | Primary city (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Primary area/zone (FK) |
| `address_line_1` | `text` | `null` | Primary address line 1 |
| `address_line_2` | `text` | `null` | Primary address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `makani_number` | `text` | `null` | Dubai Makani number (smart addressing) |
| `currency_id` | `bigint` | `null` → `currencies.id` | Default currency for transactions (FK) |
| `payment_term_id` | `bigint` | `null` → `payment_terms.id` | Default payment terms (FK) |
| `tax_type_id` | `bigint` | `null` → `tax_types.id` | Default tax treatment (FK) |
| `hse_prequalification_status_code` | `text` | `null` → `HSE_PREQUALIFICATION_STATUS_TYPES` | HSE prequalification status |
| `worker_supply_allowed` | `boolean` | `not null default false` | Can supply workers |
| `equipment_supply_allowed` | `boolean` | `not null default false` | Can supply equipment with operator |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, BLACKLISTED, etc.) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:** Similar to customers/vendors

**Triggers:** `set_updated_at` trigger

**Constraints:** TRN format, email format validation

**Note:** `hse_prequalification_status_code` references a new lookup category `HSE_PREQUALIFICATION_STATUS_TYPES` (to be added to lookup category plan).

#### 7.3.4 consultants

**Purpose:** Consultant master data for professional services, advisory, and technical engagements.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `consultant_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., CONS-0001) |
| `consultant_name_en` | `text` | `not null` | Consultant legal name (English) |
| `consultant_name_ar` | `text` | `null` | Consultant legal name (Arabic) |
| `consultant_type_code` | `text` | `not null` → `CONSULTANT_TYPES` | Consultant classification (ENGINEERING, HSE, LEGAL, etc.) |
| `consultant_category_code` | `text` | `null` → `CONSULTANT_CATEGORIES` | Consultant categorization (RETAINER, PROJECT, ADVISORY, AUDIT) |
| `trn` | `text` | `null unique` | UAE Tax Registration Number (15 digits) |
| `trade_license_number` | `text` | `null` | Trade license number |
| `license_expiry_date` | `date` | `null` | Trade license expiry date |
| `website_url` | `text` | `null` | Consultant website URL |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `country_id` | `bigint` | `null` → `countries.id` | Primary country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Primary emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | Primary city (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Primary area/zone (FK) |
| `address_line_1` | `text` | `null` | Primary address line 1 |
| `address_line_2` | `text` | `null` | Primary address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `makani_number` | `text` | `null` | Dubai Makani number (smart addressing) |
| `currency_id` | `bigint` | `null` → `currencies.id` | Default currency for transactions (FK) |
| `payment_term_id` | `bigint` | `null` → `payment_terms.id` | Default payment terms (FK) |
| `tax_type_id` | `bigint` | `null` → `tax_types.id` | Default tax treatment (FK) |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, BLACKLISTED, etc.) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:** Similar to customers/vendors/subcontractors

**Triggers:** `set_updated_at` trigger

**Constraints:** TRN format, email format validation

#### 7.3.5 government_authorities

**Purpose:** Government authority master data for compliance, permits, inspections, and regulatory correspondence.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `authority_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., AUTH-0001) |
| `authority_name_en` | `text` | `not null` | Authority name (English) |
| `authority_name_ar` | `text` | `null` | Authority name (Arabic) |
| `authority_type_code` | `text` | `not null` → `GOVERNMENT_AUTHORITY_TYPES` | Authority classification (MUNICIPALITY, POLICE, etc.) |
| `authority_category_code` | `text` | `null` → `GOVERNMENT_AUTHORITY_CATEGORIES` | Authority categorization (PERMIT_ISSUING, INSPECTION, etc.) |
| `jurisdiction_level_code` | `text` | `not null` → `JURISDICTION_LEVEL_TYPES` | Jurisdiction level (FEDERAL, EMIRATE, MUNICIPAL, FREE_ZONE) |
| `website_url` | `text` | `null` | Authority website URL |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `country_id` | `bigint` | `null` → `countries.id` | Country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | City (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Area/zone (FK) |
| `address_line_1` | `text` | `null` | Address line 1 |
| `address_line_2` | `text` | `null` | Address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:** Similar to other entities

**Triggers:** `set_updated_at` trigger

**Constraints:** Email format validation

**Note:** No TRN field (government entities don't have TRN). No bank details table (fees paid via government portals, not bank transfers).

#### 7.3.6 recruitment_agencies

**Purpose:** Recruitment agency master data for HR, manpower supply, and recruitment vendor management.

**Fields:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `agency_code` | `text` | `not null unique` | Auto-generated via numbering engine (e.g., AGCY-0001) |
| `agency_name_en` | `text` | `not null` | Agency legal name (English) |
| `agency_name_ar` | `text` | `null` | Agency legal name (Arabic) |
| `agency_type_code` | `text` | `not null` → `RECRUITMENT_AGENCY_TYPES` | Agency classification (LOCAL, OVERSEAS, MANPOWER_SUPPLY, etc.) |
| `agency_category_code` | `text` | `null` → `RECRUITMENT_AGENCY_CATEGORIES` | Agency categorization (PREFERRED, APPROVED, etc.) |
| `country_id` | `bigint` | `null` → `countries.id` | Primary country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Primary emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | Primary city (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Primary area/zone (FK) |
| `address_line_1` | `text` | `null` | Primary address line 1 |
| `address_line_2` | `text` | `null` | Primary address line 2 |
| `po_box` | `text` | `null` | P.O. Box number |
| `primary_email` | `text` | `null` | Primary contact email |
| `primary_phone` | `text` | `null` | Primary contact phone |
| `primary_mobile` | `text` | `null` | Primary contact mobile |
| `website_url` | `text` | `null` | Agency website URL |
| `license_number` | `text` | `null` | Recruitment license number |
| `license_expiry_date` | `date` | `null` | License expiry date |
| `countries_served` | `text[]` | `null` | Array of country codes the agency recruits from (e.g., {PH, IN, BD, PK}) |
| `currency_id` | `bigint` | `null` → `currencies.id` | Default currency for transactions (FK) |
| `payment_term_id` | `bigint` | `null` → `payment_terms.id` | Default payment terms (FK) |
| `tax_type_id` | `bigint` | `null` → `tax_types.id` | Default tax treatment (FK) |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, BLACKLISTED, etc.) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes:** Similar to other entities

**Triggers:** `set_updated_at` trigger

**Constraints:** Email format validation

**Note:** `countries_served` is a PostgreSQL array (`text[]`) to store multiple country codes for overseas recruitment agencies. Alternative: Create a separate `recruitment_agency_countries` junction table if more complex filtering is needed (recommend array for simplicity in Phase 002F.3E).

### 7.4 Contact Tables (6 Total)

All 6 contact tables follow the same structure with parent FK variations.

**Tables:**
- `customer_contacts`
- `vendor_contacts`
- `subcontractor_contacts`
- `consultant_contacts`
- `government_authority_contacts`
- `recruitment_agency_contacts`

**Standard Contact Table Structure:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `parent_id` | `bigint` | `not null` → parent table `id` | FK to parent entity (customer_id, vendor_id, etc.) |
| `contact_code` | `text` | `null` | Optional auto-generated code (e.g., C-CUST-0001-01) |
| `contact_name_en` | `text` | `not null` | Contact person name (English) |
| `contact_name_ar` | `text` | `null` | Contact person name (Arabic) |
| `designation` | `text` | `null` | Job title/designation |
| `department` | `text` | `null` | Department name |
| `contact_type_code` | `text` | `null` → `CONTACT_TYPES` | Contact role (SALES, PROCUREMENT, FINANCE, etc.) |
| `email` | `text` | `null` | Contact email |
| `mobile` | `text` | `null` | Contact mobile |
| `phone` | `text` | `null` | Contact phone |
| `whatsapp` | `text` | `null` | WhatsApp number |
| `is_primary` | `boolean` | `not null default false` | Primary contact flag |
| `is_authorized_signatory` | `boolean` | `not null default false` | Authorized to sign agreements |
| `is_decision_maker` | `boolean` | `not null default false` | Decision maker flag |
| `is_finance_contact` | `boolean` | `not null default false` | Finance/payment contact |
| `is_operations_contact` | `boolean` | `not null default false` | Operations contact |
| `preferred_communication_code` | `text` | `null` → `COMMUNICATION_PREFERENCE_TYPES` | Preferred communication channel |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes (per table):**

```sql
create index idx_customer_contacts_parent_id on customer_contacts(parent_id);
create index idx_customer_contacts_contact_type_code on customer_contacts(contact_type_code) where contact_type_code is not null;
create index idx_customer_contacts_is_primary on customer_contacts(is_primary) where is_primary = true;
create index idx_customer_contacts_is_authorized_signatory on customer_contacts(is_authorized_signatory) where is_authorized_signatory = true;
create index idx_customer_contacts_is_finance_contact on customer_contacts(is_finance_contact) where is_finance_contact = true;
create index idx_customer_contacts_status_code on customer_contacts(status_code);
create index idx_customer_contacts_is_active on customer_contacts(is_active);
create index idx_customer_contacts_email on customer_contacts(email) where email is not null;
```

**Triggers:** `set_updated_at` trigger

**Constraints:**

```sql
alter table customer_contacts add constraint customer_contacts_email_format check (email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' or email is null);
alter table customer_contacts add constraint customer_contacts_at_least_one_contact check (email is not null or mobile is not null or phone is not null);
```

**Foreign Key Cascading:**

```sql
alter table customer_contacts add constraint customer_contacts_parent_id_fkey
  foreign key (parent_id) references customers(id) on delete cascade;
```

**Rationale:** `on delete cascade` ensures contacts are automatically deleted when parent customer is deleted (hard delete, rare scenario). For soft deletes (is_active = false), contacts remain in database.

**Repeat for:** vendor_contacts, subcontractor_contacts, consultant_contacts, government_authority_contacts, recruitment_agency_contacts (change parent_id FK and table name).

### 7.5 Address Tables (6 Total)

All 6 address tables follow the same structure with parent FK variations.

**Tables:**
- `customer_addresses`
- `vendor_addresses`
- `subcontractor_addresses`
- `consultant_addresses`
- `government_authority_addresses`
- `recruitment_agency_addresses`

**Standard Address Table Structure:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `parent_id` | `bigint` | `not null` → parent table `id` | FK to parent entity |
| `address_type_code` | `text` | `not null` → `ADDRESS_TYPES` | Address type (PRIMARY, BILLING, SHIPPING, SITE, etc.) |
| `country_id` | `bigint` | `null` → `countries.id` | Country (FK) |
| `emirate_id` | `bigint` | `null` → `emirates.id` | Emirate/region (FK) |
| `city_id` | `bigint` | `null` → `cities.id` | City (FK) |
| `area_zone_id` | `bigint` | `null` → `areas_zones.id` | Area/zone (FK) |
| `address_line_1` | `text` | `null` | Address line 1 |
| `address_line_2` | `text` | `null` | Address line 2 |
| `building_name` | `text` | `null` | Building name |
| `street_name` | `text` | `null` | Street name |
| `po_box` | `text` | `null` | P.O. Box number |
| `makani_number` | `text` | `null` | Dubai Makani number (smart addressing) |
| `latitude` | `numeric(10,7)` | `null` | GPS latitude |
| `longitude` | `numeric(10,7)` | `null` | GPS longitude |
| `is_primary` | `boolean` | `not null default false` | Primary address flag |
| `is_billing_address` | `boolean` | `not null default false` | Billing address flag |
| `is_shipping_address` | `boolean` | `not null default false` | Shipping/delivery address flag |
| `notes` | `text` | `null` | Address notes (access instructions, landmarks, etc.) |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes (per table):**

```sql
create index idx_customer_addresses_parent_id on customer_addresses(parent_id);
create index idx_customer_addresses_address_type_code on customer_addresses(address_type_code);
create index idx_customer_addresses_country_id on customer_addresses(country_id) where country_id is not null;
create index idx_customer_addresses_emirate_id on customer_addresses(emirate_id) where emirate_id is not null;
create index idx_customer_addresses_is_primary on customer_addresses(is_primary) where is_primary = true;
create index idx_customer_addresses_is_billing_address on customer_addresses(is_billing_address) where is_billing_address = true;
create index idx_customer_addresses_is_shipping_address on customer_addresses(is_shipping_address) where is_shipping_address = true;
create index idx_customer_addresses_status_code on customer_addresses(status_code);
create index idx_customer_addresses_is_active on customer_addresses(is_active);
```

**Triggers:** `set_updated_at` trigger

**Constraints:**

```sql
alter table customer_addresses add constraint customer_addresses_latitude_range check (latitude >= -90 and latitude <= 90 or latitude is null);
alter table customer_addresses add constraint customer_addresses_longitude_range check (longitude >= -180 and longitude <= 180 or longitude is null);
```

**Foreign Key Cascading:**

```sql
alter table customer_addresses add constraint customer_addresses_parent_id_fkey
  foreign key (parent_id) references customers(id) on delete cascade;
```

**Repeat for:** vendor_addresses, subcontractor_addresses, consultant_addresses, government_authority_addresses, recruitment_agency_addresses.

### 7.6 Document Tables (6 Total)

All 6 document tables follow the same structure with parent FK variations.

**Tables:**
- `customer_documents`
- `vendor_documents`
- `subcontractor_documents`
- `consultant_documents`
- `government_authority_documents`
- `recruitment_agency_documents`

**Standard Document Table Structure:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `parent_id` | `bigint` | `not null` → parent table `id` | FK to parent entity |
| `document_type_code` | `text` | `not null` → `PARTY_DOCUMENT_TYPES` | Document type (TRADE_LICENSE, TRN_CERTIFICATE, etc.) |
| `document_name` | `text` | `not null` | Document name/title |
| `document_number` | `text` | `null` | Document number (license number, certificate number, etc.) |
| `issue_date` | `date` | `null` | Document issue date |
| `expiry_date` | `date` | `null` | Document expiry date |
| `has_expiry` | `boolean` | `not null default true` | Does the document expire? |
| `expiry_reminder_days` | `integer` | `null` | Reminder days before expiry (e.g., 30 days) |
| `file_path` | `text` | `null` | File path or document ID (DMS integration) |
| `is_required` | `boolean` | `not null default false` | Is this document required for compliance? |
| `is_verified` | `boolean` | `not null default false` | Has the document been verified? |
| `verified_by` | `bigint` | `null` → `user_profiles.id` | User who verified the document (FK) |
| `verified_at` | `timestamptz` | `null` | Verification timestamp |
| `notes` | `text` | `null` | Internal notes |
| `status_code` | `text` | `not null` → `PARTY_STATUS_TYPES` | Status (ACTIVE, INACTIVE, EXPIRED) |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, deactivated_at, deactivated_by, deactivation_reason, is_active, is_locked, is_system, sort_order |

**Indexes (per table):**

```sql
create index idx_customer_documents_parent_id on customer_documents(parent_id);
create index idx_customer_documents_document_type_code on customer_documents(document_type_code);
create index idx_customer_documents_expiry_date on customer_documents(expiry_date) where expiry_date is not null;
create index idx_customer_documents_has_expiry on customer_documents(has_expiry) where has_expiry = true;
create index idx_customer_documents_is_required on customer_documents(is_required) where is_required = true;
create index idx_customer_documents_is_verified on customer_documents(is_verified);
create index idx_customer_documents_status_code on customer_documents(status_code);
create index idx_customer_documents_is_active on customer_documents(is_active);
```

**Triggers:** `set_updated_at` trigger

**Constraints:**

```sql
alter table customer_documents add constraint customer_documents_issue_before_expiry check (issue_date <= expiry_date or issue_date is null or expiry_date is null);
alter table customer_documents add constraint customer_documents_expiry_reminder_positive check (expiry_reminder_days > 0 or expiry_reminder_days is null);
```

**Foreign Key Cascading:**

```sql
alter table customer_documents add constraint customer_documents_parent_id_fkey
  foreign key (parent_id) references customers(id) on delete cascade;
```

**Repeat for:** vendor_documents, subcontractor_documents, consultant_documents, government_authority_documents, recruitment_agency_documents.

**Future Integration:** When DMS (Phase 009) is implemented, `file_path` will be replaced with `document_id` FK to DMS document storage table. For Phase 002F.3E, `file_path` can store a placeholder or local file path.

### 7.7 Bank Details Tables (6 Total)

**Tables:**
- `customer_bank_details` (optional, for refunds/rebates)
- `vendor_bank_details`
- `subcontractor_bank_details`
- `consultant_bank_details`
- `recruitment_agency_bank_details`

**Note:** No `government_authority_bank_details` table (government fees paid via portals, not bank transfers).

**Standard Bank Details Table Structure:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `parent_id` | `bigint` | `not null` → parent table `id` | FK to parent entity |
| `bank_id` | `bigint` | `null` → `banks.id` | Bank (FK to master banks table) |
| `bank_account_type_code` | `text` | `not null` → `BANK_ACCOUNT_TYPES` | Account type (CURRENT, SAVINGS, ESCROW, etc.) |
| `account_name` | `text` | `not null` | Account holder name |
| `account_number` | `text` | `not null` | Bank account number |
| `iban` | `text` | `null` | IBAN (International Bank Account Number) |
| `swift_code` | `text` | `null` | SWIFT/BIC code |
| `currency_id` | `bigint` | `null` → `currencies.id` | Account currency (FK) |
| `is_primary` | `boolean` | `not null default false` | Primary bank account flag |
| `is_active` | `boolean` | `not null default true` | Account active status |
| `notes` | `text` | `null` | Internal notes |
| *(standard fields)* | | | id, created_at, created_by, updated_at, updated_by, is_locked, is_system, sort_order |

**Note:** Bank details tables do NOT have `deactivated_at`, `deactivated_by`, `deactivation_reason` fields. Instead, they use `is_active` boolean for status management (simpler model for bank accounts).

**Indexes (per table):**

```sql
create index idx_customer_bank_details_parent_id on customer_bank_details(parent_id);
create index idx_customer_bank_details_bank_id on customer_bank_details(bank_id) where bank_id is not null;
create index idx_customer_bank_details_is_primary on customer_bank_details(is_primary) where is_primary = true;
create index idx_customer_bank_details_is_active on customer_bank_details(is_active);
create index idx_customer_bank_details_account_number on customer_bank_details(account_number);
create index idx_customer_bank_details_iban on customer_bank_details(iban) where iban is not null;
```

**Triggers:** `set_updated_at` trigger

**Constraints:**

```sql
alter table customer_bank_details add constraint customer_bank_details_iban_format check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' or iban is null);
alter table customer_bank_details add constraint customer_bank_details_swift_format check (swift_code ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$' or swift_code is null);
```

**Foreign Key Cascading:**

```sql
alter table customer_bank_details add constraint customer_bank_details_parent_id_fkey
  foreign key (parent_id) references customers(id) on delete cascade;
```

**Repeat for:** vendor_bank_details, subcontractor_bank_details, consultant_bank_details, recruitment_agency_bank_details.

### 7.8 Schema Summary

**Total Tables:** 30
- 6 main entity tables
- 6 contact tables
- 6 address tables
- 6 document tables
- 6 bank details tables (including customer_bank_details)

**Total Indexes:** ~180 (6 per table average)

**Total Triggers:** 30 (`set_updated_at` on all tables)

**Total RLS Policies:** ~180 (6 per table: SELECT, INSERT, UPDATE, DELETE for users and service role)

**Total Constraints:** ~60 (email format, TRN format, IBAN format, SWIFT format, positive amounts, date ranges, lat/long ranges)

**Foreign Keys to Existing Tables:**
- `user_profiles.id` (created_by, updated_by, deactivated_by, verified_by, sales_owner_user_profile_id)
- `countries.id`, `emirates.id`, `cities.id`, `areas_zones.id` (geography)
- `currencies.id`, `payment_terms.id`, `tax_types.id`, `banks.id` (finance basics)
- `global_lookup_values.value_code` (all classification and status fields)

---

## 8. Contact / Address / Document Strategy

### 8.1 Strategy Overview

**Decision:** Use **separate contact/address/document tables** for each main entity type (no shared generic tables).

**Rationale:**
- Aligns with user's explicit requirement for entity separation
- Simplifies queries (no polymorphic associations or discriminator columns)
- Enables entity-specific business rules and validation
- Better performance (no JOIN filtering overhead)
- Clearer data ownership and permissions

**Trade-off:** More tables (24 child tables vs. 4 shared tables), but clearer architecture and better alignment with user requirements.

### 8.2 Contact Strategy

**Business Requirements:**
- Multiple contacts per entity
- Contact role/function tracking (Sales, Procurement, Finance, HSE, etc.)
- Communication preference tracking
- Authorization flags (signatory, decision maker, finance contact)
- Primary contact designation

**Implementation:**
- 6 separate contact tables (customer_contacts, vendor_contacts, etc.)
- `contact_type_code` → `CONTACT_TYPES` lookup
- `preferred_communication_code` → `COMMUNICATION_PREFERENCE_TYPES` lookup
- Boolean flags: `is_primary`, `is_authorized_signatory`, `is_decision_maker`, `is_finance_contact`, `is_operations_contact`
- Cascading delete: Contacts deleted when parent entity is hard-deleted
- Soft delete: `is_active` flag for inactive contacts

**UI Considerations:**
- Contact list displayed as child tab in entity drawer form
- Add/Edit contact via inline drawer
- Filter contacts by type (show all finance contacts, all site contacts, etc.)
- Primary contact prominently displayed on entity list table
- Quick actions: Call, Email, WhatsApp (link generation)

### 8.3 Address Strategy

**Business Requirements:**
- Multiple addresses per entity
- Address types (Primary, Billing, Shipping, Site, Office, Warehouse)
- Geography hierarchy integration (Country → Emirate → City → Area/Zone)
- GPS coordinates for site locations
- Makani number support (Dubai smart addressing)
- Primary/Billing/Shipping flags

**Implementation:**
- 6 separate address tables
- `address_type_code` → `ADDRESS_TYPES` lookup
- Geography FKs: `country_id`, `emirate_id`, `city_id`, `area_zone_id`
- Optional GPS: `latitude`, `longitude` (numeric(10,7))
- Boolean flags: `is_primary`, `is_billing_address`, `is_shipping_address`
- Cascading delete: Addresses deleted when parent entity is hard-deleted

**UI Considerations:**
- Address list displayed as child tab in entity drawer form
- Add/Edit address via inline drawer with geography cascade selects
- Map preview for GPS coordinates (future integration with Google Maps / Mapbox)
- Billing address auto-selected for invoices
- Shipping address auto-selected for delivery orders
- Site address auto-selected for project/job assignments

### 8.4 Document Strategy

**Business Requirements:**
- Document tracking with expiry management
- Document types (Trade License, TRN, VAT Certificate, Insurance, HSE Certificate, etc.)
- Issue and expiry dates
- Expiry reminder system (integration with future notification engine)
- Verification workflow (verified by, verified at)
- Required document flagging for compliance
- Document file storage (DMS integration)

**Implementation:**
- 6 separate document tables
- `document_type_code` → `PARTY_DOCUMENT_TYPES` lookup
- Expiry tracking: `issue_date`, `expiry_date`, `has_expiry`, `expiry_reminder_days`
- Verification: `is_verified`, `verified_by`, `verified_at`
- Compliance: `is_required` flag for mandatory documents
- File storage: `file_path` (placeholder for DMS integration in Phase 009)
- Cascading delete: Documents deleted when parent entity is hard-deleted

**UI Considerations:**
- Document list displayed as child tab in entity drawer form
- Add/Edit document via inline drawer
- Expiry alerts displayed prominently (red badge for expired, yellow badge for expiring soon)
- Upload button for document file (future DMS integration)
- Download/View buttons for stored documents
- Verification status display (pending, verified badges)
- Expiry reminder configuration per document

**Future Integration:**
- Phase 009 (DMS): Replace `file_path` with `document_id` FK to DMS document storage
- Phase 020 (Notification Engine): Automatic expiry reminders via email/SMS

---

## 9. Bank Details Strategy

### 9.1 Business Requirements

**Entities Requiring Bank Details:**
- ✅ Vendors (for payment processing)
- ✅ Subcontractors (for payment processing)
- ✅ Consultants (for payment processing)
- ✅ Recruitment Agencies (for payment processing)
- ✅ Customers (for refunds, rebates, scrap purchases)
- ❌ Government Authorities (fees paid via government portals, not bank transfers)

### 9.2 Implementation

**Tables:** 6 bank details tables (including `customer_bank_details`, excluding government authorities)

**Fields:**
- `bank_id` → `banks.id` (FK to master banks table)
- `bank_account_type_code` → `BANK_ACCOUNT_TYPES` lookup
- `account_name`, `account_number`, `iban`, `swift_code`
- `currency_id` → `currencies.id` (for foreign currency accounts)
- `is_primary` flag (default bank account for payments)
- `is_active` flag (simple status management, no soft delete complexity)

**No Deactivation Fields:** Bank details tables use `is_active` boolean only (no `deactivated_at`, `deactivated_by`, `deactivation_reason`). Rationale: Bank accounts have simple active/inactive status, no need for detailed deactivation tracking.

**Validation:**
- IBAN format validation (regex)
- SWIFT code format validation (regex)
- At least one bank account per vendor/subcontractor/consultant (business rule, not DB constraint)
- Primary flag uniqueness per parent (only one primary account)

**UI Considerations:**
- Bank details list displayed as child tab in entity drawer form
- Add/Edit bank details via inline drawer
- BankSelect component for bank selection
- CurrencySelect component for account currency
- Primary account prominently displayed on entity list table
- Copy IBAN/SWIFT buttons for easy clipboard access

### 9.3 Customer Bank Details Decision

**Recommendation:** ✅ **Include `customer_bank_details` table**

**Use Cases:**
1. Customer refunds (overpayments, returned goods)
2. Customer rebates and incentives (year-end volume discounts)
3. Scrap trading (when customer is also a scrap supplier, we pay them for scrap material)

**Rationale:** Low cost to add now, avoids schema migration later. Optional usage (table remains empty for customers who never require refunds/rebates).

---

## 10. CRM Foundation Strategy

### 10.1 CRM Foundation Scope

**In Phase 002F.3E:**
- ✅ Customer master data with CRM-relevant fields
- ✅ Customer segmentation (`customer_segment_code`)
- ✅ Lead source tracking (`lead_source_code`)
- ✅ Sales owner assignment (`sales_owner_user_profile_id`)
- ✅ Credit management (`credit_limit`, `credit_days`)
- ✅ Contact management with decision maker flags
- ✅ Address management with site locations
- ✅ Industry classification

**Out of Scope (Future Phase 003 — CRM Module):**
- ❌ Leads
- ❌ Opportunities
- ❌ Sales pipeline
- ❌ Quotations
- ❌ Sales orders
- ❌ Customer interactions log
- ❌ Customer complaints
- ❌ Customer portal

### 10.2 CRM Foundation Fields in Customers Table

| Field | Purpose | CRM Value |
|-------|---------|-----------|
| `customer_segment_code` | Segmentation (ENTERPRISE, CORPORATE, SME, GOVERNMENT, ONE_TIME) | Enables targeted marketing, sales prioritization, differential pricing |
| `lead_source_code` | Acquisition channel tracking (REFERRAL, WEBSITE, TENDER, SOCIAL_MEDIA, etc.) | Marketing ROI analysis, channel optimization |
| `sales_owner_user_profile_id` | Assigned sales rep | Account ownership, performance tracking, commission calculation |
| `credit_limit` | Maximum credit allowed | Risk management, credit control |
| `credit_days` | Payment terms in days | Cash flow management, aging reports |
| `industry_type_code` | Industry/sector | Industry-based segmentation, vertical marketing |
| `customer_type_code` | Customer classification (MAIN_CONTRACTOR, SCRAP_BUYER, etc.) | Business unit segmentation, reporting |

### 10.3 Contact Management for CRM

**Key Features:**
- Decision maker flags (`is_decision_maker`) for targeting key stakeholders
- Finance contact flags (`is_finance_contact`) for payment follow-up
- Communication preferences for respectful outreach
- Multiple contacts per customer for relationship breadth

**Future Integration:**
- Phase 003 (CRM Module): Contact interaction history, last contact date, next follow-up date
- Phase 020 (Notification Engine): Automated follow-up reminders

### 10.4 Customer Lifecycle Support

**Lifecycle Stages (via `status_code`):**
1. **ACTIVE** — Active customer, normal transactions
2. **INACTIVE** — No recent transactions, potential for reactivation
3. **ON_HOLD** — Temporary suspension (payment issues, disputes)
4. **BLACKLISTED** — Permanently blacklisted (bad debt, legal issues)
5. **UNDER_REVIEW** — New customer under credit review

**Future Enhancement:** Add `customer_lifecycle_stage` lookup category (PROSPECT, LEAD, CUSTOMER, DORMANT, LOST) in Phase 003 for deeper CRM tracking.

---

## 11. Master Data Reuse and Dropdown Mapping Matrix

### 11.1 Overview

This section provides a comprehensive mapping of every dropdown field in Phase 002F.3E to its data source, ensuring **no hardcoded dropdowns** as per the mandatory requirement.

### 11.2 Dropdown Mapping Matrix

| Screen/Form | Field | Dropdown Source | Component | Hardcoded? | Notes |
|-------------|-------|-----------------|-----------|------------|-------|
| **Customer Form** | `customer_type_code` | `global_lookup_values` (CUSTOMER_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Customer Form** | `industry_type_code` | `global_lookup_values` (INDUSTRY_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Customer Form** | `customer_segment_code` | `global_lookup_values` (CUSTOMER_SEGMENTS) | `LookupSelect` | No | Editable via Lookup Engine |
| **Customer Form** | `lead_source_code` | `global_lookup_values` (CRM_LEAD_SOURCES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Customer Form** | `country_id` | `countries` table | `CountrySelect` | No | Geography module |
| **Customer Form** | `emirate_id` | `emirates` table | `EmirateSelect` | No | Geography module, cascades from country |
| **Customer Form** | `city_id` | `cities` table | `CitySelect` | No | Geography module, cascades from emirate |
| **Customer Form** | `area_zone_id` | `areas_zones` table | `AreaZoneSelect` | No | Geography module, cascades from city |
| **Customer Form** | `currency_id` | `currencies` table | `CurrencySelect` | No | Finance Basics module |
| **Customer Form** | `payment_term_id` | `payment_terms` table | `PaymentTermSelect` | No | Finance Basics module |
| **Customer Form** | `tax_type_id` | `tax_types` table | `TaxTypeSelect` | No | Finance Basics module |
| **Customer Form** | `sales_owner_user_profile_id` | `user_profiles` table | `UserSelect` | No | New select component (optional) |
| **Customer Form** | `status_code` | `global_lookup_values` (PARTY_STATUS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Vendor Form** | `vendor_type_code` | `global_lookup_values` (VENDOR_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Vendor Form** | `vendor_category_code` | `global_lookup_values` (VENDOR_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Vendor Form** | `supplier_category_code` | `global_lookup_values` (SUPPLIER_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Vendor Form** | `country_id`, `emirate_id`, `city_id`, `area_zone_id` | Geography tables | Geography Selects | No | Same as Customer Form |
| **Vendor Form** | `currency_id`, `payment_term_id`, `tax_type_id` | Finance tables | Finance Selects | No | Same as Customer Form |
| **Vendor Form** | `default_bank_id` | `banks` table | `BankSelect` | No | Finance Basics module |
| **Vendor Form** | `status_code` | `global_lookup_values` (PARTY_STATUS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Subcontractor Form** | `subcontractor_type_code` | `global_lookup_values` (SUBCONTRACTOR_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Subcontractor Form** | `subcontractor_category_code` | `global_lookup_values` (SUBCONTRACTOR_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Subcontractor Form** | `hse_prequalification_status_code` | `global_lookup_values` (HSE_PREQUALIFICATION_STATUS_TYPES) | `LookupSelect` | No | New lookup category |
| **Subcontractor Form** | Geography, Finance, Status fields | Same as above | Same as above | No | |
| **Consultant Form** | `consultant_type_code` | `global_lookup_values` (CONSULTANT_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Consultant Form** | `consultant_category_code` | `global_lookup_values` (CONSULTANT_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Consultant Form** | Geography, Finance, Status fields | Same as above | Same as above | No | |
| **Government Authority Form** | `authority_type_code` | `global_lookup_values` (GOVERNMENT_AUTHORITY_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Government Authority Form** | `authority_category_code` | `global_lookup_values` (GOVERNMENT_AUTHORITY_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Government Authority Form** | `jurisdiction_level_code` | `global_lookup_values` (JURISDICTION_LEVEL_TYPES) | `LookupSelect` | No | System-locked lookup |
| **Government Authority Form** | Geography, Status fields | Same as above | Same as above | No | |
| **Recruitment Agency Form** | `agency_type_code` | `global_lookup_values` (RECRUITMENT_AGENCY_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Recruitment Agency Form** | `agency_category_code` | `global_lookup_values` (RECRUITMENT_AGENCY_CATEGORIES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Recruitment Agency Form** | Geography, Finance, Status fields | Same as above | Same as above | No | |
| **Contact Forms (All 6)** | `contact_type_code` | `global_lookup_values` (CONTACT_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Contact Forms (All 6)** | `preferred_communication_code` | `global_lookup_values` (COMMUNICATION_PREFERENCE_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Contact Forms (All 6)** | `status_code` | `global_lookup_values` (PARTY_STATUS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Address Forms (All 6)** | `address_type_code` | `global_lookup_values` (ADDRESS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Address Forms (All 6)** | `country_id`, `emirate_id`, `city_id`, `area_zone_id` | Geography tables | Geography Selects | No | |
| **Address Forms (All 6)** | `status_code` | `global_lookup_values` (PARTY_STATUS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Document Forms (All 6)** | `document_type_code` | `global_lookup_values` (PARTY_DOCUMENT_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Document Forms (All 6)** | `status_code` | `global_lookup_values` (PARTY_STATUS_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Document Forms (All 6)** | `has_expiry` | Boolean field (Yes/No radio) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Document Forms (All 6)** | `is_required` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Document Forms (All 6)** | `is_verified` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Bank Details Forms (All 6)** | `bank_id` | `banks` table | `BankSelect` | No | Finance Basics module |
| **Bank Details Forms (All 6)** | `bank_account_type_code` | `global_lookup_values` (BANK_ACCOUNT_TYPES) | `LookupSelect` | No | Editable via Lookup Engine |
| **Bank Details Forms (All 6)** | `currency_id` | `currencies` table | `CurrencySelect` | No | Finance Basics module |
| **Bank Details Forms (All 6)** | `is_primary` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Bank Details Forms (All 6)** | `is_active` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Subcontractor Form** | `worker_supply_allowed` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Subcontractor Form** | `equipment_supply_allowed` | Boolean field (checkbox) | Native boolean input | **Yes** | Acceptable: Technical boolean |
| **Contact Forms (All 6)** | `is_primary`, `is_authorized_signatory`, `is_decision_maker`, `is_finance_contact`, `is_operations_contact` | Boolean fields (checkboxes) | Native boolean input | **Yes** | Acceptable: Technical booleans |
| **Address Forms (All 6)** | `is_primary`, `is_billing_address`, `is_shipping_address` | Boolean fields (checkboxes) | Native boolean input | **Yes** | Acceptable: Technical booleans |

### 11.3 Acceptable Hardcoded Values

**Technical Booleans (Allowed):**
- `is_active`, `is_locked`, `is_system` (database system flags)
- `has_expiry`, `is_required`, `is_verified` (document flags)
- `is_primary`, `is_authorized_signatory`, `is_decision_maker` (contact flags)
- `is_billing_address`, `is_shipping_address` (address flags)
- `worker_supply_allowed`, `equipment_supply_allowed` (subcontractor flags)

**Rationale:** These are technical flags representing binary states (yes/no, true/false), not business classifications. They do not require editable dropdown values.

### 11.4 No Hardcoded Dropdowns Confirmation

**✅ Confirmation:** All classification, status, and type fields use either:
1. Existing master data tables (Geography, Finance Basics)
2. New lookup categories (CUSTOMER_TYPES, VENDOR_TYPES, etc.)
3. Reusable select components (CountrySelect, CurrencySelect, LookupSelect, etc.)

**❌ No hardcoded arrays** such as `["Customer", "Vendor"]`, `["Active", "Inactive"]`, `["Primary", "Secondary"]`.

---

## 12. RLS / Permission / Role Assignment Plan

### 12.1 Permission Strategy

**Approach:** Unified permission group for all party entities (simplified) vs. Granular permissions per entity (detailed).

**Recommendation:** **Granular permissions per entity** (detailed approach) for better access control.

**Rationale:**
- Different teams manage different entities (Sales manages customers, Procurement manages vendors, HR manages recruitment agencies)
- Fine-grained access control required for security and compliance
- Audit trail clarity (who accessed which entity type)

### 12.2 Permission List

#### 12.2.1 Customer Permissions

```sql
'master_data.customers.view'                    → View customers
'master_data.customers.manage'                  → Create, edit, deactivate customers
'master_data.customers.export'                  → Export customer data
'master_data.customers.audit_view'              → View customer audit logs

'master_data.customer_contacts.manage'          → Manage customer contacts
'master_data.customer_addresses.manage'         → Manage customer addresses
'master_data.customer_documents.manage'         → Manage customer documents
'master_data.customer_bank_details.manage'      → Manage customer bank details
```

#### 12.2.2 Vendor Permissions

```sql
'master_data.vendors.view'                      → View vendors
'master_data.vendors.manage'                    → Create, edit, deactivate vendors
'master_data.vendors.export'                    → Export vendor data
'master_data.vendors.audit_view'                → View vendor audit logs

'master_data.vendor_contacts.manage'            → Manage vendor contacts
'master_data.vendor_addresses.manage'           → Manage vendor addresses
'master_data.vendor_documents.manage'           → Manage vendor documents
'master_data.vendor_bank_details.manage'        → Manage vendor bank details
```

#### 12.2.3 Subcontractor Permissions

```sql
'master_data.subcontractors.view'               → View subcontractors
'master_data.subcontractors.manage'             → Create, edit, deactivate subcontractors
'master_data.subcontractors.export'             → Export subcontractor data
'master_data.subcontractors.audit_view'         → View subcontractor audit logs

'master_data.subcontractor_contacts.manage'     → Manage subcontractor contacts
'master_data.subcontractor_addresses.manage'    → Manage subcontractor addresses
'master_data.subcontractor_documents.manage'    → Manage subcontractor documents
'master_data.subcontractor_bank_details.manage' → Manage subcontractor bank details
```

#### 12.2.4 Consultant Permissions

```sql
'master_data.consultants.view'                  → View consultants
'master_data.consultants.manage'                → Create, edit, deactivate consultants
'master_data.consultants.export'                → Export consultant data
'master_data.consultants.audit_view'            → View consultant audit logs

'master_data.consultant_contacts.manage'        → Manage consultant contacts
'master_data.consultant_addresses.manage'       → Manage consultant addresses
'master_data.consultant_documents.manage'       → Manage consultant documents
'master_data.consultant_bank_details.manage'    → Manage consultant bank details
```

#### 12.2.5 Government Authority Permissions

```sql
'master_data.government_authorities.view'                  → View government authorities
'master_data.government_authorities.manage'                → Create, edit, deactivate government authorities
'master_data.government_authorities.export'                → Export government authority data
'master_data.government_authorities.audit_view'            → View government authority audit logs

'master_data.government_authority_contacts.manage'         → Manage government authority contacts
'master_data.government_authority_addresses.manage'        → Manage government authority addresses
'master_data.government_authority_documents.manage'        → Manage government authority documents
```

#### 12.2.6 Recruitment Agency Permissions

```sql
'master_data.recruitment_agencies.view'                    → View recruitment agencies
'master_data.recruitment_agencies.manage'                  → Create, edit, deactivate recruitment agencies
'master_data.recruitment_agencies.export'                  → Export recruitment agency data
'master_data.recruitment_agencies.audit_view'              → View recruitment agency audit logs

'master_data.recruitment_agency_contacts.manage'           → Manage recruitment agency contacts
'master_data.recruitment_agency_addresses.manage'          → Manage recruitment agency addresses
'master_data.recruitment_agency_documents.manage'          → Manage recruitment agency documents
'master_data.recruitment_agency_bank_details.manage'       → Manage recruitment agency bank details
```

#### 12.2.7 Optional: Simplified Unified Permissions (Alternative)

If granular permissions are deemed too complex, an alternative simplified approach:

```sql
'master_data.party_master.view'                 → View all party entities
'master_data.party_master.manage'               → Manage all party entities
'master_data.party_master.export'               → Export all party data
'master_data.party_master.audit_view'           → View all party audit logs
```

**Recommendation:** Start with **granular permissions** (detailed approach). Simplify later if organizational complexity warrants it.

**Total Permissions (Granular Approach):** 48 permissions (8 per entity × 6 entities)

### 12.3 Role Assignment Recommendation

| Role | Permissions Granted | Rationale |
|------|---------------------|-----------|
| `system_admin` | All permissions | Full system access for administrators |
| `group_admin` | view, manage, export, audit_view for all entities | Group-level administrators manage all master data |
| `company_admin` | view, export for all entities; manage for customers, vendors, subcontractors, consultants | Company-level administrators can view all but only manage commercial entities |
| `branch_admin` | view for all entities | Branch-level administrators have read-only access |
| **Sales Manager** (custom role) | customers.view, customers.manage, customers.export, customer_contacts.manage | Sales team manages customer master data |
| **Procurement Manager** (custom role) | vendors.view, vendors.manage, vendors.export, vendor_contacts.manage, vendor_bank_details.manage | Procurement team manages vendor master data |
| **HR Manager** (custom role) | recruitment_agencies.view, recruitment_agencies.manage, recruitment_agencies.export | HR team manages recruitment agency master data |
| **Compliance Officer** (custom role) | view, audit_view for all entities; documents.manage for all entities | Compliance team reviews and manages documents |

**Note:** Custom roles (Sales Manager, Procurement Manager, etc.) are recommendations for future role creation. Phase 002F.3E implements permissions; role assignments can be configured post-deployment.

### 12.4 RLS Policy Plan

#### 12.4.1 Standard RLS Pattern (Applied to All 30 Tables)

**SELECT Policy:**

```sql
create policy "Allow SELECT on customers for users with permission"
  on customers for select
  using (
    is_active = true 
    OR current_user_has_permission('master_data.customers.view')
    OR current_user_has_role('system_admin')
  );
```

**Rationale:** Active records visible to all authenticated users (for select components). Inactive/deactivated records require explicit view permission.

**INSERT Policy:**

```sql
create policy "Allow INSERT on customers for users with permission"
  on customers for insert
  with check (
    current_user_has_permission('master_data.customers.manage')
    OR current_user_has_role('system_admin')
  );
```

**UPDATE Policy:**

```sql
create policy "Allow UPDATE on customers for users with permission"
  on customers for update
  using (
    (current_user_has_permission('master_data.customers.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );
```

**Rationale:** Manage permission required. Locked and system records editable only by system_admin.

**DELETE Policy:**

```sql
create policy "Allow DELETE on customers for system_admin only"
  on customers for delete
  using (current_user_has_role('system_admin'));
```

**Rationale:** Hard deletes restricted to system_admin. Soft delete (is_active = false) is the preferred deletion method via UPDATE.

#### 12.4.2 Service Role Policies

For server-side operations (Supabase service role):

```sql
create policy "Allow service role full access"
  on customers for all
  to service_role
  using (true)
  with check (true);
```

**Applied to:** All 30 tables

### 12.5 RLS Policy Summary

**Total RLS Policies:** ~180 policies (6 policies per table × 30 tables)
- 30 SELECT policies
- 30 INSERT policies
- 30 UPDATE policies
- 30 DELETE policies
- 30 Service role SELECT policies
- 30 Service role INSERT/UPDATE/DELETE policies

**Helper Functions Required:**
- `current_user_has_permission(permission text)` ✅ Already exists
- `current_user_has_role(role text)` ✅ Already exists

---

## 13. Audit Logging Plan

### 13.1 Audit Requirements

**All mutations (create, update, delete) must be logged** for:
- Compliance and security
- Change history tracking
- User accountability
- Dispute resolution
- Forensic analysis

### 13.2 Audit Implementation

**Existing Audit System:** ✅ `logAudit()` and `createAuditDiff()` functions (Phase 001)

**Usage in Server Actions:**

```typescript
// Create operation
await logAudit({
  entity_type: 'customers',
  entity_id: customer.id,
  action: 'create',
  description: `Created customer: ${input.customer_name_en} (${customer.customer_code})`,
  old_values: null,
  new_values: customer,
});

// Update operation
const auditDiff = createAuditDiff(existingCustomer, updatedCustomer);
await logAudit({
  entity_type: 'customers',
  entity_id: customer.id,
  action: 'update',
  description: `Updated customer: ${customer.customer_name_en} (${customer.customer_code})`,
  old_values: auditDiff.old_values,
  new_values: auditDiff.new_values,
});

// Delete/Deactivate operation
await logAudit({
  entity_type: 'customers',
  entity_id: id,
  action: 'deactivate',
  description: `Deactivated customer: ${customer.customer_name_en} (${customer.customer_code})`,
  old_values: { is_active: true },
  new_values: { is_active: false, deactivated_at: new Date(), deactivation_reason: reason },
});
```

### 13.3 Entity Types for Audit Logging

**Main Entities:**
- `customers`
- `vendors`
- `subcontractors`
- `consultants`
- `government_authorities`
- `recruitment_agencies`

**Child Entities:**
- `customer_contacts`, `vendor_contacts`, etc. (6 contact tables)
- `customer_addresses`, `vendor_addresses`, etc. (6 address tables)
- `customer_documents`, `vendor_documents`, etc. (6 document tables)
- `customer_bank_details`, `vendor_bank_details`, etc. (6 bank details tables)

**Total Entity Types:** 30 (all tables logged)

### 13.4 Audit Actions

- `create` — Record created
- `update` — Record updated (with old/new values diff)
- `deactivate` — Record soft-deleted (is_active = false)
- `reactivate` — Record reactivated (is_active = true)
- `lock` — Record locked (is_locked = true)
- `unlock` — Record unlocked (is_locked = false)
- `delete` — Record hard-deleted (rare)

### 13.5 Audit Log Viewing

**Permission Required:** `master_data.{entity}.audit_view`

**UI Access:**
- Audit tab in entity drawer form
- Displays chronological audit log for the entity
- Shows action, timestamp, user, description, old/new values diff

**Future Enhancement:** Audit log search and filtering across all entities (Phase 019 — Reporting/KPI/Dashboard).

---

## 14. Server Actions Plan

### 14.1 Actions Overview

Each main entity requires **8-10 server actions** for CRUD operations, status management, and data export.

**Total Server Actions Estimate:** ~60 actions (10 per entity × 6 entities)

### 14.2 Server Action Organization

**File Structure (Recommended):**

```text
src/features/master-data/parties/
  customers-actions.ts      (Customer actions)
  vendors-actions.ts        (Vendor actions)
  subcontractors-actions.ts (Subcontractor actions)
  consultants-actions.ts    (Consultant actions)
  government-authorities-actions.ts (Government authority actions)
  recruitment-agencies-actions.ts (Recruitment agency actions)
  contacts-actions.ts       (Shared contact actions, or split per entity)
  addresses-actions.ts      (Shared address actions, or split per entity)
  documents-actions.ts      (Shared document actions, or split per entity)
  bank-details-actions.ts   (Shared bank details actions, or split per entity)
```

**Alternative:** Single `actions.ts` file if total lines < 2000. **Recommendation:** Split by entity for maintainability.

### 14.3 Standard Actions per Main Entity

#### 14.3.1 Customer Actions

| Action Name | Purpose | Input | Output | Permission |
|-------------|---------|-------|--------|------------|
| `getCustomers` | List all customers with filters | filters | `ActionResult<Customer[]>` | `customers.view` |
| `getCustomerById` | Get single customer by ID | id | `ActionResult<Customer>` | `customers.view` |
| `createCustomer` | Create new customer | CreateCustomerInput | `ActionResult<{ id: number }>` | `customers.manage` |
| `updateCustomer` | Update existing customer | UpdateCustomerInput | `ActionResult<void>` | `customers.manage` |
| `deleteCustomer` | Soft delete customer | id, reason | `ActionResult<void>` | `customers.manage` |
| `toggleCustomerStatus` | Toggle is_active | id | `ActionResult<void>` | `customers.manage` |
| `toggleCustomerLock` | Toggle is_locked | id | `ActionResult<void>` | `system_admin` |
| `exportCustomers` | Export customers to CSV | filters | `ActionResult<string>` (CSV data) | `customers.export` |
| `getActiveCustomersForSelect` | Get active customers for select component | none | `ActionResult<SelectOption[]>` | public (RLS) |

**Repeat for:** vendors, subcontractors, consultants, government_authorities, recruitment_agencies (change entity name and table).

#### 14.3.2 Child Record Actions (Contacts, Addresses, Documents, Bank Details)

| Action Name | Purpose | Input | Output | Permission |
|-------------|---------|-------|--------|------------|
| `getCustomerContacts` | List contacts for customer | customerId | `ActionResult<Contact[]>` | `customers.view` |
| `createCustomerContact` | Create contact | CreateContactInput | `ActionResult<{ id: number }>` | `customer_contacts.manage` |
| `updateCustomerContact` | Update contact | UpdateContactInput | `ActionResult<void>` | `customer_contacts.manage` |
| `deleteCustomerContact` | Delete contact | id | `ActionResult<void>` | `customer_contacts.manage` |

**Repeat for:** addresses, documents, bank details (change entity name and table).

**Decision:** Share contact/address/document/bank details actions across entities (e.g., `createContact` with `entity_type` parameter) **OR** create separate actions per entity (e.g., `createCustomerContact`, `createVendorContact`).

**Recommendation:** **Separate actions per entity** for type safety and clearer permissions.

### 14.4 Action Implementation Pattern

**Example: createCustomer**

```typescript
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";
import { createCustomerSchema, type CreateCustomerInput } from "../validation";
import type { ActionResult } from "@/types/actions";

export async function createCustomer(
  input: CreateCustomerInput
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate input
    const result = createCustomerSchema.safeParse(input);
    if (!result.success) {
      return {
        success: false,
        error: result.error.errors.map((e) => e.message).join(", "),
      };
    }
    const validated = result.data;

    // 2. Check permission
    const hasPermission = await checkPermission("master_data.customers.manage");
    if (!hasPermission) {
      return {
        success: false,
        error: "You do not have permission to create customers",
      };
    }

    // 3. Create customer
    const supabase = await createClient();
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        ...validated,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select("id, customer_code, customer_name_en")
      .single();

    if (error) {
      console.error("Error creating customer:", error);
      return {
        success: false,
        error: error.message || "Failed to create customer",
      };
    }

    // 4. Log audit
    await logAudit({
      entity_type: "customers",
      entity_id: customer.id,
      action: "create",
      description: `Created customer: ${customer.customer_name_en} (${customer.customer_code})`,
      old_values: null,
      new_values: customer,
    });

    // 5. Revalidate paths
    revalidatePath("/admin/master-data/parties/customers");

    // 6. Return success
    return {
      success: true,
      data: { id: customer.id },
    };
  } catch (error) {
    console.error("Unexpected error in createCustomer:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
```

**Pattern Applied to:** All 60+ server actions with entity-specific variations.

### 14.5 Server Actions Summary

**Total Actions:** ~60 actions
- 9 actions per main entity × 6 entities = 54 actions
- 4 actions per child entity type × 4 child types per entity × 6 entities = 96 actions (if separate)
- **OR** ~20 shared child actions (if parameterized by entity_type)

**Recommendation:** Start with **separate actions per entity** for type safety. Refactor to shared actions if code duplication becomes problematic.

---

## 15. Validation Plan

### 15.1 Validation Requirements

All input data must be validated using Zod schemas before database operations.

### 15.2 Validation File Structure

```text
src/features/master-data/parties/
  validation.ts             (All validation schemas)
```

**OR split by entity:**

```text
src/features/master-data/parties/
  customers-validation.ts
  vendors-validation.ts
  subcontractors-validation.ts
  consultants-validation.ts
  government-authorities-validation.ts
  recruitment-agencies-validation.ts
  contacts-validation.ts
  addresses-validation.ts
  documents-validation.ts
  bank-details-validation.ts
```

**Recommendation:** Single `validation.ts` file for Phase 002F.3E (estimated ~1000 lines). Split if exceeds 1500 lines.

### 15.3 Validation Schema Examples

#### 15.3.1 Create Customer Schema

```typescript
import { z } from "zod";

const TRN_REGEX = /^[0-9]{15}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const UPPERCASE_ALPHANUMERIC = /^[A-Z0-9_\-]+$/;

export const createCustomerSchema = z.object({
  customer_code: z.string().optional(), // Auto-generated if omitted
  
  customer_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  customer_name_ar: z.string().max(255).nullable().optional(),
  
  customer_type_code: z
    .string()
    .regex(UPPERCASE_ALPHANUMERIC, "Customer type code must be uppercase alphanumeric")
    .min(1, "Customer type is required"),
  
  industry_type_code: z
    .string()
    .regex(UPPERCASE_ALPHANUMERIC)
    .nullable()
    .optional(),
  
  customer_segment_code: z
    .string()
    .regex(UPPERCASE_ALPHANUMERIC)
    .nullable()
    .optional(),
  
  lead_source_code: z
    .string()
    .regex(UPPERCASE_ALPHANUMERIC)
    .nullable()
    .optional(),
  
  trn: z
    .string()
    .regex(TRN_REGEX, "TRN must be exactly 15 digits")
    .nullable()
    .optional()
    .transform((val) => val === "" ? null : val),
  
  trade_license_number: z.string().max(100).nullable().optional(),
  license_expiry_date: z.string().nullable().optional(), // ISO date string
  
  website_url: z.string().url().nullable().optional(),
  
  primary_email: z
    .string()
    .regex(EMAIL_REGEX, "Invalid email format")
    .nullable()
    .optional(),
  
  primary_phone: z.string().max(20).nullable().optional(),
  primary_mobile: z.string().max(20).nullable().optional(),
  
  country_id: z.number().int().positive().nullable().optional(),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  
  address_line_1: z.string().max(500).nullable().optional(),
  address_line_2: z.string().max(500).nullable().optional(),
  po_box: z.string().max(50).nullable().optional(),
  makani_number: z.string().max(50).nullable().optional(),
  
  currency_id: z.number().int().positive().nullable().optional(),
  payment_term_id: z.number().int().positive().nullable().optional(),
  tax_type_id: z.number().int().positive().nullable().optional(),
  
  credit_limit: z
    .number()
    .nonnegative("Credit limit must be positive")
    .nullable()
    .optional(),
  
  credit_days: z
    .number()
    .int()
    .nonnegative("Credit days must be positive")
    .nullable()
    .optional(),
  
  sales_owner_user_profile_id: z.number().int().positive().nullable().optional(),
  
  notes: z.string().max(2000).nullable().optional(),
  
  status_code: z
    .string()
    .regex(UPPERCASE_ALPHANUMERIC)
    .default("ACTIVE"),
  
  sort_order: z.number().int().nonnegative().default(0),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
```

#### 15.3.2 Update Customer Schema

```typescript
export const updateCustomerSchema = z.object({
  id: z.number().int().positive(),
  
  // customer_code NOT updatable (immutable)
  
  customer_name_en: z
    .string()
    .min(2)
    .max(255)
    .optional(),
  
  customer_name_ar: z.string().max(255).nullable().optional(),
  
  // ... all fields optional except id ...
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
```

**Repeat for:** All 6 main entities, all 4 child entity types (contacts, addresses, documents, bank details).

### 15.4 Validation Rules Summary

| Field Type | Validation Rules |
|------------|------------------|
| **Code Fields** | Uppercase alphanumeric, regex validation, immutable after creation |
| **Name Fields (English)** | Required (min 2 chars), max 255 chars |
| **Name Fields (Arabic)** | Optional, max 255 chars |
| **TRN** | Exactly 15 digits (regex), unique constraint |
| **Email** | Email format regex, optional |
| **Phone/Mobile** | Max 20 chars, optional |
| **URL** | URL format validation, optional |
| **IBAN** | IBAN format regex (country code + checksum + account), optional |
| **SWIFT Code** | SWIFT format regex (8 or 11 chars), optional |
| **Dates** | ISO date string format, optional |
| **Foreign Keys** | Positive integer, optional (nullable) |
| **Amounts** | Positive numeric, optional |
| **Boolean Flags** | Boolean type, default false |
| **Lookup Codes** | Uppercase alphanumeric regex, must exist in lookup values |

### 15.5 Client-Side Validation

**Recommendation:** Replicate Zod schemas on client-side for instant feedback before server submission.

**Alternative:** Use React Hook Form with Zod resolver for form validation.

**Example:**

```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createCustomerSchema } from "@/features/master-data/parties/validation";

const form = useForm<CreateCustomerInput>({
  resolver: zodResolver(createCustomerSchema),
});
```

---

## 16. UI / Screen Plan

### 16.1 Menu Structure

**Sidebar Location:** Master Data group

**Proposed Menu:**

```text
Master Data
└── People / Contacts / CRM Foundation
    ├── Customers
    ├── Vendors
    ├── Subcontractors
    ├── Consultants
    ├── Government Authorities
    └── Recruitment Agencies
```

**Alternative (if sidebar becomes too long):**

```text
Master Data
└── Parties & Contacts
    ├── Customers
    ├── Vendors
    ├── Subcontractors
    ├── Consultants
    ├── Government Authorities
    └── Recruitment Agencies
```

**Recommendation:** Use full name "People / Contacts / CRM Foundation" for clarity in Phase 002F.3E. Consider shortening to "Parties & Contacts" if sidebar becomes crowded after future phases.

### 16.2 Route Structure

| Entity | Route | Page Component |
|--------|-------|----------------|
| Customers | `/admin/master-data/parties/customers` | CustomersPage |
| Vendors | `/admin/master-data/parties/vendors` | VendorsPage |
| Subcontractors | `/admin/master-data/parties/subcontractors` | SubcontractorsPage |
| Consultants | `/admin/master-data/parties/consultants` | ConsultantsPage |
| Government Authorities | `/admin/master-data/parties/government-authorities` | GovernmentAuthoritiesPage |
| Recruitment Agencies | `/admin/master-data/parties/recruitment-agencies` | RecruitmentAgenciesPage |

**Total Routes:** 6 main entity routes

### 16.3 Page Structure (All Entities Follow Same Pattern)

#### 16.3.1 Main List Screen

**Components:**
- `ERPPageHeader` with title, description, Add button
- `ERPDataTable` with columns:
  - Code (with search accessorFn)
  - Name (English) (with search accessorFn)
  - Type/Classification (badge)
  - Status (badge)
  - Primary Contact (if available)
  - Primary Phone/Email
  - Actions (Edit, View, Delete)
- Global search, sorting, filtering, column resizing, export

**Example: Customers List**

```typescript
<ERPPageHeader
  title="Customers"
  description="Manage customer master data for sales, CRM, and commercial transactions"
  action={{
    label: "Add Customer",
    onClick: () => setDrawerOpen(true),
    permission: "master_data.customers.manage",
  }}
/>

<CustomersTable
  customers={customers}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onExport={handleExport}
/>
```

#### 16.3.2 Entity Drawer Form (Add/Edit)

**Tab Structure:**

1. **Basic Info** (Main tab, always visible)
   - Code, Names (English/Arabic)
   - Type, Category, Industry (lookup selects)
   - TRN, Trade License, Website
   - Status

2. **Primary Address** (Main tab, inline)
   - Geography cascade (Country → Emirate → City → Area)
   - Address lines, P.O. Box, Makani number
   - Primary contact fields (email, phone, mobile)

3. **Commercial Settings** (Tab)
   - Currency, Payment Terms, Tax Type (finance selects)
   - Credit Limit, Credit Days
   - Sales Owner (UserSelect)

4. **Contacts** (Tab, child records)
   - Contact list table (name, designation, email, phone, type, primary)
   - Add/Edit contact inline drawer

5. **Addresses** (Tab, child records)
   - Address list table (type, address line 1, city, emirate, primary/billing/shipping)
   - Add/Edit address inline drawer

6. **Documents** (Tab, child records)
   - Document list table (type, document name, number, issue date, expiry date, status)
   - Add/Edit document inline drawer
   - Expiry alerts (red/yellow badges)

7. **Bank Details** (Tab, child records, if applicable)
   - Bank details list table (bank, account name, account number, IBAN, currency, primary)
   - Add/Edit bank details inline drawer

8. **Audit Info** (Tab, read-only)
   - Created by, Created at
   - Updated by, Updated at
   - Deactivated by, Deactivated at, Deactivation reason
   - Audit log entries (if audit_view permission)

**Form Behavior:**
- Inner component with `key={open}` for state reset on dialog close
- Loading state during submission
- Toast notifications for success/error
- Form validation with inline error display
- Required field indicators

#### 16.3.3 Entity-Specific Variations

**Customers:**
- Include CRM fields (customer segment, lead source, sales owner, credit management)
- Optional bank details tab (for refunds/rebates)

**Vendors:**
- Include supplier category (if vendor type is SUPPLIER)
- Mandatory bank details tab (for payment processing)
- Default bank field in main form

**Subcontractors:**
- Include HSE prequalification status
- Worker supply allowed, Equipment supply allowed checkboxes
- Mandatory bank details tab

**Consultants:**
- Simpler form (no worker/equipment flags, no HSE)
- Mandatory bank details tab

**Government Authorities:**
- Jurisdiction level (FEDERAL, EMIRATE, MUNICIPAL, FREE_ZONE)
- No TRN field
- No bank details tab (fees paid via government portals)
- No commercial settings tab

**Recruitment Agencies:**
- Countries served field (multi-select or text array)
- License number and expiry date
- Mandatory bank details tab

### 16.4 UI Component File Structure

```text
src/features/master-data/parties/
  customers/
    components/
      customers-table.tsx        (List table)
      customer-form-dialog.tsx   (Main drawer form)
      customer-contact-form.tsx  (Contact inline drawer)
      customer-address-form.tsx  (Address inline drawer)
      customer-document-form.tsx (Document inline drawer)
      customer-bank-details-form.tsx (Bank details inline drawer)
      
  vendors/
    components/
      vendors-table.tsx
      vendor-form-dialog.tsx
      vendor-contact-form.tsx
      vendor-address-form.tsx
      vendor-document-form.tsx
      vendor-bank-details-form.tsx
      
  ... (repeat for all 6 entities)
```

**Total UI Components:** ~36 components (6 components per entity × 6 entities)

### 16.5 Shared UI Patterns

**Reuse from Existing Modules:**
- `ERPPageHeader`
- `ERPDataTable`
- `ERPDrawerForm`
- `ERPDrawerSectionNav`
- Geography select components
- Finance select components
- `LookupSelect` component
- Badge component for status/type display

**New Components Needed:**
- 6 main entity select components (see Section 17)
- `UserSelect` component (for sales owner assignment)

---

## 17. Reusable Select Component Plan

### 17.1 Overview

Create **6 new reusable select components** for party entities, following established patterns from Geography and Finance Basics modules.

### 17.2 Component List

| Component | Purpose | Used By (Future Modules) |
|-----------|---------|--------------------------|
| `CustomerSelect` | Select customer from active customers | CRM (quotations, sales orders), Scrap Trading, Project assignments |
| `VendorSelect` | Select vendor from active vendors | Procurement (purchase orders, RFQs), Inventory (supplier assignments) |
| `SubcontractorSelect` | Select subcontractor from active subcontractors | Subcontracting module, Project assignments, HSE tracking |
| `ConsultantSelect` | Select consultant from active consultants | Project assignments, Consultant engagement tracking |
| `GovernmentAuthoritySelect` | Select government authority from active authorities | Compliance module, Permit tracking, Inspection tracking |
| `RecruitmentAgencySelect` | Select recruitment agency from active agencies | HR module, Recruitment tracking, Manpower requisitions |

### 17.3 Component Implementation Pattern

**File Location:**

```text
src/components/erp/parties/
  customer-select.tsx
  vendor-select.tsx
  subcontractor-select.tsx
  consultant-select.tsx
  government-authority-select.tsx
  recruitment-agency-select.tsx
  index.ts (exports all selects)
```

**Example: CustomerSelect**

```typescript
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Customer } from "@/features/master-data/parties/types";

export interface CustomerSelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  showCode?: boolean;
  customerTypeFilter?: string | null; // Filter by customer type (e.g., MAIN_CONTRACTOR)
  industryTypeFilter?: string | null; // Filter by industry
  className?: string;
  name?: string;
  error?: string;
}

export function CustomerSelect({
  value,
  onValueChange,
  placeholder = "Select customer...",
  disabled = false,
  required = false,
  includeInactive = false,
  showCode = false,
  customerTypeFilter = null,
  industryTypeFilter = null,
  className,
}: CustomerSelectProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCustomers() {
      try {
        setLoading(true);
        setError(null);
        
        const supabase = createClient();
        let query = supabase
          .from("customers")
          .select("id, customer_code, customer_name_en, customer_name_ar, customer_type_code, industry_type_code, is_active")
          .order("customer_name_en", { ascending: true });

        if (!includeInactive) {
          query = query.eq("is_active", true);
        }

        if (customerTypeFilter) {
          query = query.eq("customer_type_code", customerTypeFilter);
        }

        if (industryTypeFilter) {
          query = query.eq("industry_type_code", industryTypeFilter);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error loading customers:", fetchError);
          setError(fetchError.message);
          return;
        }

        setCustomers(data || []);
      } catch (err) {
        console.error("Unexpected error loading customers:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, [includeInactive, customerTypeFilter, industryTypeFilter]);

  const handleValueChange = (val: string) => {
    if (val === "null") {
      onValueChange?.(null);
    } else {
      onValueChange?.(Number(val));
    }
  };

  return (
    <Select
      value={value?.toString() ?? ""}
      onValueChange={handleValueChange}
      disabled={disabled || loading}
      required={required}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? "Loading..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {error && (
          <div className="text-sm text-destructive p-2">{error}</div>
        )}
        {!loading && customers.length === 0 && (
          <div className="text-sm text-muted-foreground p-2">No customers found</div>
        )}
        {customers.map((customer) => (
          <SelectItem key={customer.id} value={customer.id.toString()}>
            {showCode && (
              <span className="text-muted-foreground">{customer.customer_code} — </span>
            )}
            {customer.customer_name_en}
            {!customer.is_active && (
              <span className="text-muted-foreground"> (Inactive)</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

**Repeat for:** VendorSelect, SubcontractorSelect, ConsultantSelect, GovernmentAuthoritySelect, RecruitmentAgencySelect (change entity name and table).

### 17.4 Component Props

All 6 select components follow the same prop interface pattern:

- `value: number | null` — Selected entity ID
- `onValueChange: (value: number | null) => void` — Callback when selection changes
- `placeholder: string` — Placeholder text (default: "Select {entity}...")
- `disabled: boolean` — Disable the select
- `required: boolean` — Mark as required field
- `includeInactive: boolean` — Include inactive records (default: false)
- `showCode: boolean` — Show entity code in dropdown (default: false)
- `{entity}TypeFilter: string | null` — Filter by type (e.g., customerTypeFilter: "MAIN_CONTRACTOR")
- `{entity}CategoryFilter: string | null` — Filter by category (if applicable)
- `className: string` — Additional CSS classes
- `name: string` — Form field name
- `error: string` — Error message to display

### 17.5 Select Component Usage in Forms

**Example:**

```typescript
<CustomerSelect
  value={customerId}
  onValueChange={setCustomerId}
  placeholder="Select customer..."
  showCode={true}
  customerTypeFilter="MAIN_CONTRACTOR" // Filter to show only main contractors
  required
  className="w-full"
/>
```

**Example: Cascading Filter (Vendor by Type)**

```typescript
<LookupSelect
  category="VENDOR_TYPES"
  value={vendorType}
  onValueChange={setVendorType}
  placeholder="Select vendor type..."
/>

<VendorSelect
  value={vendorId}
  onValueChange={setVendorId}
  placeholder="Select vendor..."
  vendorTypeFilter={vendorType} // Only show vendors of selected type
/>
```

### 17.6 Future Module Integration

These select components will be used by:

**CustomerSelect:**
- Phase 003 (CRM): Quotations, sales orders, opportunities
- Phase 012 (Scrap Trading): Scrap sales transactions
- Phase 014 (Demolition): Project customer assignments

**VendorSelect:**
- Phase 008 (Procurement): Purchase orders, RFQs, vendor selection
- Phase 007 (Inventory): Supplier assignments for stock items
- Phase 005 (Fleet): Equipment lessors, service providers

**SubcontractorSelect:**
- Future Subcontracting Module: Subcontract agreements, work orders
- Phase 011 (HSE): HSE prequalification tracking, incident reporting
- Phase 014 (Demolition): Subcontractor assignments

**ConsultantSelect:**
- Future Professional Services Module: Consultant engagements, retainer management
- Phase 011 (HSE): HSE consultant assignments

**GovernmentAuthoritySelect:**
- Future Compliance Module: Permit applications, inspection tracking
- Phase 011 (HSE): Regulatory compliance tracking

**RecruitmentAgencySelect:**
- Phase 004 (HR): Recruitment requisitions, candidate tracking, agency performance

---

## 18. Sidebar / Menu Plan

### 18.1 Sidebar Update Required

**Current Sidebar Structure (Excerpt):**

```typescript
{
  label: "Master Data",
  items: [
    // ... existing items ...
  ],
},
```

**New Sidebar Structure:**

```typescript
{
  label: "People / Contacts / CRM Foundation",
  items: [
    { label: "Customers", icon: Users, path: "/admin/master-data/parties/customers" },
    { label: "Vendors", icon: Building2, path: "/admin/master-data/parties/vendors" },
    { label: "Subcontractors", icon: HardHat, path: "/admin/master-data/parties/subcontractors" },
    { label: "Consultants", icon: Briefcase, path: "/admin/master-data/parties/consultants" },
    { label: "Government Authorities", icon: Landmark, path: "/admin/master-data/parties/government-authorities" },
    { label: "Recruitment Agencies", icon: UserSearch, path: "/admin/master-data/parties/recruitment-agencies" },
  ],
},
```

**Recommended Icons (from lucide-react):**

- Customers: `Users`
- Vendors: `Building2` or `Store`
- Subcontractors: `HardHat` or `Users`
- Consultants: `Briefcase` or `GraduationCap`
- Government Authorities: `Landmark` or `ShieldCheck`
- Recruitment Agencies: `UserSearch` or `Users`

### 18.2 Menu Group Behavior

**Behavior:** Collapsed by default, manual multi-open (as per Phase 002F.3C.4A.2 sidebar fix).

**Active Route Detection:** When user navigates to a party screen, the "People / Contacts / CRM Foundation" group does NOT auto-expand (user expands manually).

### 18.3 Icon Imports Required

```typescript
import {
  Users,
  Building2,
  HardHat,
  Briefcase,
  Landmark,
  UserSearch,
} from "lucide-react";
```

### 18.4 Sidebar File Modification

**File:** `src/components/layout/app-sidebar.tsx`

**Modification:** Add new `navGroup` for "People / Contacts / CRM Foundation" after "Units & Measurements" group.

---

## 19. Seed Data Plan

### 19.1 Seed Data Requirements

**Tables Requiring Seed Data:**

1. **global_lookup_categories** — 22 new categories
2. **global_lookup_values** — ~120 new values
3. **customers, vendors, subcontractors, consultants, government_authorities, recruitment_agencies** — Optional: 1-2 sample records per entity for demo/testing

**No seed data required for:** contact tables, address tables, document tables, bank details tables (child records created by users).

### 19.2 Lookup Category and Value Seeds

**Seed SQL Location:**

```text
supabase/migrations/20260607HHMMSS_erp_base_002f3e_people_contacts_crm_foundation.sql
```

**Seed SQL Structure:**

```sql
-- ============================================================================
-- SECTION 1: Lookup Categories
-- ============================================================================

INSERT INTO global_lookup_categories (category_code, category_name_en, category_name_ar, description, module_code, is_system, is_locked, sort_order) VALUES
('PARTY_STATUS_TYPES', 'Party Status Types', 'أنواع حالة الطرف', 'Common status values for all party entities', 'PARTIES', true, true, 10),
('CUSTOMER_TYPES', 'Customer Types', 'أنواع العملاء', 'Customer classification types', 'PARTIES', true, false, 20),
-- ... (repeat for all 22 categories) ...
('BANK_ACCOUNT_TYPES', 'Bank Account Types', 'أنواع الحسابات المصرفية', 'Bank account classification', 'PARTIES', false, false, 220);

-- ============================================================================
-- SECTION 2: Lookup Values - PARTY_STATUS_TYPES
-- ============================================================================

INSERT INTO global_lookup_values (category_code, value_code, value_name_en, value_name_ar, description, badge_variant, is_system, is_locked, is_default, sort_order) VALUES
('PARTY_STATUS_TYPES', 'ACTIVE', 'Active', 'نشط', 'Active party', 'green', true, true, true, 10),
('PARTY_STATUS_TYPES', 'INACTIVE', 'Inactive', 'غير نشط', 'Inactive party', 'gray', true, true, false, 20),
('PARTY_STATUS_TYPES', 'BLACKLISTED', 'Blacklisted', 'القائمة السوداء', 'Blacklisted party', 'red', true, true, false, 30),
('PARTY_STATUS_TYPES', 'ON_HOLD', 'On Hold', 'قيد الانتظار', 'Party on hold', 'yellow', true, true, false, 40),
('PARTY_STATUS_TYPES', 'UNDER_REVIEW', 'Under Review', 'قيد المراجعة', 'Party under review', 'blue', true, false, false, 50);

-- ... (repeat for all 22 categories, ~120 values total) ...

```

**Seed SQL Best Practices:**
- Include English and Arabic names for all categories and values
- Set `is_system: true` and `is_locked: true` for critical status values (ACTIVE, INACTIVE, BLACKLISTED)
- Set `is_default: true` for default values (e.g., ACTIVE status, NORMAL_CUSTOMER type)
- Assign badge variants for visual differentiation (green, red, yellow, blue, gray, purple, orange, brown, cyan, pink, gold)
- Use consistent sort_order (increments of 10) for future insertions

### 19.3 Sample Entity Records (Optional)

**Purpose:** Demo/testing data for development and QA.

**Recommendation:** Include 2-3 sample customers, 2-3 sample vendors, 1-2 sample subcontractors, 1 sample consultant, 1-2 sample government authorities, 1 sample recruitment agency.

**Example: Sample Customer**

```sql
-- Sample Customer
INSERT INTO customers (
  customer_code, customer_name_en, customer_name_ar, customer_type_code, industry_type_code, 
  customer_segment_code, trn, country_id, emirate_id, primary_email, primary_phone, 
  currency_id, payment_term_id, status_code, is_system, is_locked, sort_order
) VALUES (
  'CUST-0001', 'Dubai Main Contractors LLC', 'شركة دبي للمقاولات الرئيسية', 'MAIN_CONTRACTOR', 'CONSTRUCTION',
  'ENTERPRISE', '123456789012345', 
  (SELECT id FROM countries WHERE country_code = 'AE'), 
  (SELECT id FROM emirates WHERE emirate_code = 'DXB'),
  'info@dubaimaincontractors.ae', '+971-4-1234567',
  (SELECT id FROM currencies WHERE currency_code = 'AED'),
  (SELECT id FROM payment_terms WHERE term_code = 'NET30'),
  'ACTIVE', true, true, 10
);
```

**Repeat for:** 2-3 customers, 2-3 vendors, 1-2 subcontractors, etc.

**Note:** Set `is_system: true` and `is_locked: true` for sample records to prevent accidental deletion during testing.

---

## 20. Data Migration / Legacy Strategy

### 20.1 Migration Scenarios

**Scenario 1: Green-field Implementation (No Legacy Data)**

- No migration required
- Users create all party records via UI starting from Phase 002F.3E deployment

**Scenario 2: Migration from Legacy System (e.g., Excel, Old ERP)**

- Requires data extraction from legacy system
- Data mapping and transformation
- Import via bulk SQL INSERT or CSV import tool

**Scenario 3: Existing Database with Unstructured Party Data**

- Requires data cleanup and normalization
- Duplicate detection and merging
- Incremental migration with validation

### 20.2 Migration Strategy Recommendation

**Approach:** Provide migration support tools, but do NOT include migration logic in Phase 002F.3E core implementation.

**Rationale:**
- Migration requirements vary greatly per client/project
- Automated migration risks data corruption if not carefully planned
- Manual review of legacy data quality is critical

**Recommended Migration Process:**

1. **Data Extraction** (Client responsibility)
   - Export legacy customer/vendor data to CSV
   - Export legacy contact/address/document data to CSV

2. **Data Mapping** (Consultant/Developer task)
   - Map legacy fields to Phase 002F.3E schema
   - Resolve data quality issues (missing TRNs, invalid emails, etc.)
   - Create lookup value mappings (legacy statuses → PARTY_STATUS_TYPES)

3. **Data Transformation** (Script/Tool)
   - Transform CSV to SQL INSERT statements
   - Validate foreign key references (geography, currency, payment terms)
   - Handle nulls and defaults

4. **Bulk Import** (DBA/Developer task)
   - Run SQL INSERT scripts in staging environment
   - Verify record counts and data integrity
   - Test RLS policies and permissions
   - Migrate to production after QA approval

5. **Post-Migration QA** (User + QA team)
   - Verify all critical customers/vendors migrated
   - Check contact/address/document completeness
   - Validate bank details accuracy (critical for payments)

### 20.3 Migration Tools (Future Enhancement)

**Future Phase 023 (External Integrations) or Dedicated Migration Phase:**

- CSV Import Tool with field mapping UI
- Duplicate detection and merge wizard
- Data validation dashboard
- Rollback mechanism for failed imports

**Phase 002F.3E Scope:** ❌ Migration tools not included. Manual SQL-based migration supported.

---

## 21. Testing Plan

### 21.1 Testing Levels

| Testing Level | Responsibility | Tools | Timing |
|---------------|----------------|-------|--------|
| **Unit Testing** | Developer | Jest, Vitest (future) | During development |
| **Integration Testing** | Developer | Playwright (future) | Post-implementation |
| **Database Testing** | Developer | SQL queries, RLS verification | Post-migration |
| **Functional Testing** | QA Team | Manual browser testing | Post-deployment |
| **User Acceptance Testing (UAT)** | End Users | Production-like environment | Pre-go-live |

### 21.2 Database Testing Checklist

**Tables Created:**

- [ ] All 30 tables exist in database
- [ ] All tables have BIGINT primary keys
- [ ] All foreign keys reference correct tables
- [ ] All indexes created
- [ ] All triggers created (`set_updated_at`)
- [ ] All constraints applied (TRN format, email format, IBAN format, etc.)

**RLS Policies:**

- [ ] RLS enabled on all 30 tables
- [ ] SELECT policies allow active records OR view permission
- [ ] INSERT policies require manage permission
- [ ] UPDATE policies require manage permission + respect locked/system flags
- [ ] DELETE policies require system_admin only
- [ ] Service role policies grant full access

**Permissions Seeded:**

- [ ] All 48 permissions created in `permissions` table
- [ ] Permissions assigned to roles (`system_admin`, `group_admin`, `company_admin`, `branch_admin`)
- [ ] Permissions module code set to 'PARTIES'

**Lookup Categories and Values Seeded:**

- [ ] All 22 lookup categories created in `global_lookup_categories`
- [ ] All ~120 lookup values created in `global_lookup_values`
- [ ] Default values set correctly (ACTIVE status, NORMAL_CUSTOMER type, etc.)
- [ ] System-locked values marked (ACTIVE, INACTIVE, BLACKLISTED, etc.)
- [ ] Badge variants assigned

**Sample Data (if included):**

- [ ] Sample customers created
- [ ] Sample vendors created
- [ ] Sample subcontractors, consultants, government authorities, recruitment agencies created

### 21.3 Functional Testing Checklist

**Customer Management:**

- [ ] Add new customer (all fields)
- [ ] Edit customer (update name, type, status)
- [ ] Delete customer (soft delete via is_active = false)
- [ ] Reactivate customer
- [ ] Lock customer (system_admin only)
- [ ] Unlock customer (system_admin only)
- [ ] Add customer contact
- [ ] Edit customer contact
- [ ] Delete customer contact
- [ ] Add customer address
- [ ] Add customer document with expiry tracking
- [ ] Add customer bank details
- [ ] View customer audit log
- [ ] Export customers to CSV

**Vendor Management:**

- [ ] Add new vendor (all fields)
- [ ] Edit vendor (update name, type, status)
- [ ] Vendor bank details mandatory (verify constraint)
- [ ] Add vendor contact
- [ ] Add vendor address
- [ ] Add vendor document with expiry tracking
- [ ] Add vendor bank details
- [ ] View vendor audit log
- [ ] Export vendors to CSV

**Repeat for:** Subcontractors, Consultants, Government Authorities, Recruitment Agencies.

**Select Components:**

- [ ] `CustomerSelect` loads active customers
- [ ] `CustomerSelect` filters by customer type
- [ ] `VendorSelect` loads active vendors
- [ ] `SubcontractorSelect` loads active subcontractors
- [ ] `ConsultantSelect` loads active consultants
- [ ] `GovernmentAuthoritySelect` loads active government authorities
- [ ] `RecruitmentAgencySelect` loads active recruitment agencies
- [ ] All selects display correctly in forms
- [ ] All selects respect RLS (no unauthorized data access)

**Sidebar Navigation:**

- [ ] "People / Contacts / CRM Foundation" menu group appears
- [ ] All 6 entity menu items appear with correct icons
- [ ] Clicking menu item navigates to correct route
- [ ] Active route detection works (menu item highlighted)
- [ ] Menu group collapsed by default
- [ ] Manual multi-open behavior works

**Permissions:**

- [ ] system_admin: Full access to all entities
- [ ] group_admin: Can view, manage, export all entities
- [ ] company_admin: Can view, export all entities
- [ ] branch_admin: Can view all entities (read-only)
- [ ] User without permissions: Cannot access party screens (redirected or blocked)

### 21.4 Automated Testing (Future Enhancement)

**Unit Tests (Future):**
- Server action validation tests (Zod schema tests)
- Utility function tests (audit diff, code generation)

**Integration Tests (Future):**
- Playwright E2E tests for critical user flows
- API endpoint tests (if REST API layer added)

**Phase 002F.3E Scope:** ❌ Automated tests not included. Manual testing only.

### 21.5 Performance Testing

**Test Scenarios:**

- [ ] Load 1000 customers → List page renders in < 2 seconds
- [ ] Load 5000 customers → List page renders in < 5 seconds
- [ ] Global search across 10,000 customers → Results in < 3 seconds
- [ ] Add customer with 10 contacts, 5 addresses, 5 documents → Save completes in < 2 seconds

**Performance Considerations:**

- Database indexes on frequently queried fields (code, name, status, type)
- ERPDataTable pagination (default 50 rows per page)
- Select component query optimization (only load id, code, name fields)
- RLS policy optimization (avoid complex nested queries)

### 21.6 Testing Exit Criteria

**Phase 002F.3E Ready for Closure When:**

- ✅ All database tables created and verified
- ✅ All RLS policies tested and verified
- ✅ All permissions seeded and assigned
- ✅ All lookup categories and values seeded
- ✅ All UI screens functional (add, edit, delete, view)
- ✅ All select components working
- ✅ Sidebar navigation working
- ✅ TypeScript compilation: 0 errors
- ✅ Build: Success (npm run build)
- ✅ Lint: Pass with notes (pre-existing issues only)
- ✅ Manual browser QA: Pass
- ✅ User acceptance: Sameer/Dina approval

---

## 22. Risk Analysis and Mitigation

### 22.1 Risk Matrix

| Risk | Impact | Likelihood | Severity | Mitigation |
|------|--------|------------|----------|------------|
| **Too many tables in one phase (30 tables)** | High | Medium | High | Split into 5 implementation sub-phases (002F.3E.2 through 002F.3E.6) for incremental delivery |
| **Accidentally hardcoded dropdowns** | Medium | Low | Medium | Rigorous code review using dropdown mapping matrix (Section 11.2), pre-commit checklist |
| **Customers/vendors/subcontractors confused (dual-role entities)** | Medium | Medium | Medium | Clear documentation and user training, UI warnings when creating dual-role entities |
| **Same company is both customer and vendor (data duplication)** | Low | High | Low | Accepted trade-off for data clarity, future link table if cross-entity linkage needed |
| **RLS policies too strict (users blocked)** | High | Low | High | Comprehensive permission testing, role assignment matrix validation, fallback to group_admin for troubleshooting |
| **RLS policies too open (data leak)** | High | Low | Critical | Security audit during Phase 002F.3E.6, penetration testing in Phase 024 |
| **Contacts duplicated across modules (same person is customer contact and government authority contact)** | Low | Medium | Low | Accepted for Phase 002F.3E, future consolidated contacts if needed |
| **Bank details exposed incorrectly (IBAN/account number visible to unauthorized users)** | High | Low | Critical | RLS policies restrict bank details to manage permission only, UI hides sensitive fields for view-only users |
| **Document upload/DMS not ready (file_path field unused)** | Low | High | Low | Phase 002F.3E uses placeholder file_path, DMS integration deferred to Phase 009 |
| **License expiry tracking not integrated with notifications** | Medium | High | Medium | Document expiry fields created, notification integration deferred to Phase 020 |
| **Migration data quality issues (legacy data incomplete/incorrect)** | High | High | High | Manual data cleanup before migration, phased migration with validation, rollback plan |
| **Performance degradation with large datasets (10,000+ customers)** | Medium | Medium | Medium | Database indexes on key fields, ERPDataTable pagination, query optimization |
| **Lookup category explosion (100+ categories)** | Low | Low | Low | Limit to 22 categories for Phase 002F.3E, user-editable values prevent category proliferation |
| **User confusion between similar entities (vendor vs. subcontractor)** | Medium | Medium | Medium | Clear UI labels, descriptions, tooltips, user training documentation |

### 22.2 Critical Risks and Mitigation Plans

#### 22.2.1 Risk: Too Many Tables in One Phase

**Impact:** High — 30 tables is the largest module to date, risk of scope creep, extended implementation time, difficult QA.

**Mitigation:**

1. **Split into 5 sub-phases** (see Section 25):
   - 002F.3E.2 — Database + Lookups + Seeds (foundation)
   - 002F.3E.3 — Customers + Child Tables (highest business value)
   - 002F.3E.4 — Vendors + Child Tables (second highest business value)
   - 002F.3E.5 — Remaining Entities (subcontractors, consultants, government authorities, recruitment agencies)
   - 002F.3E.6 — Select Components + Sidebar + QA Readiness

2. **Incremental testing** after each sub-phase

3. **Gate approval** before proceeding to next sub-phase

#### 22.2.2 Risk: Dual-Role Entities (Customer + Vendor)

**Impact:** Medium — Same company could be both customer (we sell to) and vendor (we buy from), causing confusion.

**Mitigation:**

1. **Accept separate records** for Phase 002F.3E (aligned with user's separation requirement)

2. **UI warning** when creating entity with similar name: "A vendor with similar name already exists. Is this the same company?"

3. **Future link table** (phase TBD): `party_relationships` table to link dual-role entities if cross-entity reporting needed

4. **User training documentation**: "When to create separate records vs. when to use vendor vs. customer"

#### 22.2.3 Risk: Accidentally Hardcoded Dropdowns

**Impact:** Medium — Violates mandatory no-hardcoded-dropdown rule, breaks user editability.

**Mitigation:**

1. **Dropdown mapping matrix** (Section 11.2) as implementation reference

2. **Pre-commit checklist**: "Are all dropdowns mapped to lookup categories or master data tables?"

3. **Code review**: Reviewer checks for hardcoded arrays like `["Option1", "Option2"]`

4. **Automated linting rule** (future): ESLint rule to detect hardcoded dropdown arrays

#### 22.2.4 Risk: Bank Details Data Leak

**Impact:** High — IBAN, account numbers, SWIFT codes are sensitive financial data.

**Mitigation:**

1. **Separate permission**: `{entity}_bank_details.manage` permission required to view/edit bank details

2. **RLS policies**: Bank details tables have strict RLS (manage permission only)

3. **UI masking**: Display IBAN as `AE07••••••••••••••••7890` (partial masking) for non-finance users

4. **Audit logging**: All bank details access logged for forensic analysis

---

## 23. Acceptance Criteria

### 23.1 Technical Acceptance Criteria

- [ ] **Technical plan approved** by Sameer/Dina
- [ ] **Main entity categories confirmed** (6 entities: customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)
- [ ] **No generic persons table** (employees excluded from Phase 002F.3E)
- [ ] **No employee tables** in 002F.3E (deferred to 002F.3F — HR Master Data)
- [ ] **Customers planned** (all fields, child tables, lookup categories)
- [ ] **Vendors planned** (all fields, child tables, lookup categories, mandatory bank details)
- [ ] **Subcontractors planned** (all fields, child tables, lookup categories, HSE prequalification)
- [ ] **Consultants planned** (all fields, child tables, lookup categories)
- [ ] **Government authorities planned** (all fields, child tables, lookup categories, jurisdiction levels, no bank details)
- [ ] **Recruitment agencies planned** (all fields, child tables, lookup categories, countries served)
- [ ] **Contacts/address/document strategy planned** (6 separate contact tables, 6 address tables, 6 document tables)
- [ ] **Bank details strategy planned** (6 bank details tables including customer_bank_details)
- [ ] **Lookup categories planned** (22 categories, ~120 values, no hardcoded dropdowns)
- [ ] **No hardcoded dropdowns** (dropdown mapping matrix complete)
- [ ] **Existing master data reused** (Geography, Finance Basics, UOM, Lookup Engine)
- [ ] **Permissions/RLS planned** (48 permissions, ~180 RLS policies)
- [ ] **Audit planned** (logAudit for all mutations, audit_view permissions)
- [ ] **Select components planned** (6 new components: CustomerSelect, VendorSelect, etc.)
- [ ] **UI pages planned** (6 main entity pages, drawer forms with tabs, child record management)
- [ ] **Implementation phases recommended** (5 sub-phases: 002F.3E.2 through 002F.3E.6)
- [ ] **Next prompt name recommended** (PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md)

### 23.2 Business Acceptance Criteria

- [ ] **Customer master data supports CRM** (customer segments, lead sources, sales owner assignment, credit management)
- [ ] **Vendor master data supports Procurement** (vendor types, supplier categories, bank details for payment processing)
- [ ] **Subcontractor master data supports Subcontracting** (subcontractor types, HSE prequalification, worker/equipment supply flags)
- [ ] **Consultant master data supports Professional Services** (consultant types, engagement tracking)
- [ ] **Government authority master data supports Compliance** (authority types, jurisdiction levels, permit tracking)
- [ ] **Recruitment agency master data supports HR** (agency types, countries served, license tracking)
- [ ] **Contact management supports relationship breadth** (multiple contacts per entity, contact types, communication preferences)
- [ ] **Address management supports logistics** (billing, shipping, site addresses with geography hierarchy)
- [ ] **Document management supports compliance** (trade licenses, TRN, insurance, HSE certificates with expiry tracking)
- [ ] **Bank details support payment processing** (IBAN, SWIFT, account details for vendor/subcontractor/consultant payments)

### 23.3 Quality Acceptance Criteria

- [ ] **TypeScript compilation: 0 errors**
- [ ] **Build: Success** (npm run build)
- [ ] **Lint: Pass with notes** (pre-existing issues only)
- [ ] **Database migration applied successfully** (via MCP chunking if needed)
- [ ] **RLS policies verified** (system_admin full access, group_admin manage, company_admin view, branch_admin view)
- [ ] **Permissions seeded and assigned** (role assignment matrix validated)
- [ ] **Lookup categories and values seeded** (22 categories, ~120 values, default values set)
- [ ] **Select components working** (6 components load active records, respect RLS)
- [ ] **Sidebar navigation working** (menu group appears, routes navigate correctly)
- [ ] **Manual browser QA: Pass** (Sameer/Dina testing)
- [ ] **No hardcoded dropdowns** (dropdown mapping matrix validated)
- [ ] **Audit logging working** (all mutations logged, audit_view permission functional)

---

## 24. Future Integration Notes

### 24.1 Operational Modules Enabled by Phase 002F.3E

**Phase 002F.3E (People / Contacts / CRM Foundation) enables:**

#### 24.1.1 Phase 003 — CRM Module

**Dependencies:**
- ✅ Customers table (lead source, customer segment, sales owner)
- ✅ Customer contacts (decision makers, communication preferences)
- ✅ Customer addresses (site locations)
- ✅ Industry classification

**New Tables in Phase 003:**
- `leads` (referencing `customers.customer_segment_code`, `customers.lead_source_code`)
- `opportunities` (referencing `customers.id`)
- `quotations` (referencing `customers.id`, `customer_contacts.id`, `customer_addresses.id`)
- `sales_orders` (referencing `customers.id`, `customer_contacts.id`, `customer_addresses.id` for billing/shipping)
- `customer_interactions` (referencing `customers.id`, `customer_contacts.id`)
- `customer_complaints` (referencing `customers.id`, `customer_contacts.id`)

#### 24.1.2 Phase 008 — Procurement Module

**Dependencies:**
- ✅ Vendors table
- ✅ Vendor contacts
- ✅ Vendor addresses
- ✅ Vendor bank details
- ✅ Supplier categories

**New Tables in Phase 008:**
- `purchase_requisitions` (referencing `vendors.id`)
- `rfqs` (referencing `vendors.id`, `vendor_contacts.id`)
- `purchase_orders` (referencing `vendors.id`, `vendor_contacts.id`, `vendor_addresses.id`, `vendor_bank_details.id`)
- `goods_receipts` (referencing `vendors.id`, `purchase_orders.id`)
- `vendor_invoices` (referencing `vendors.id`, `purchase_orders.id`, `vendor_bank_details.id`)
- `payment_vouchers` (referencing `vendors.id`, `vendor_bank_details.id`)

#### 24.1.3 Future Subcontracting Module

**Dependencies:**
- ✅ Subcontractors table
- ✅ Subcontractor contacts
- ✅ Subcontractor addresses
- ✅ Subcontractor bank details
- ✅ HSE prequalification status
- ✅ Worker/equipment supply flags

**New Tables:**
- `subcontract_agreements` (referencing `subcontractors.id`)
- `subcontract_work_orders` (referencing `subcontractors.id`, `subcontractor_contacts.id`)
- `subcontractor_payments` (referencing `subcontractors.id`, `subcontractor_bank_details.id`)
- `subcontractor_performance_ratings` (referencing `subcontractors.id`)

#### 24.1.4 Phase 004 — HR Module

**Dependencies:**
- ✅ Recruitment agencies table
- ✅ Recruitment agency contacts
- ✅ Recruitment agency bank details
- ✅ Countries served

**New Tables in Phase 004:**
- `recruitment_requisitions` (referencing `recruitment_agencies.id`)
- `candidates` (referencing `recruitment_agencies.id`)
- `recruitment_agency_invoices` (referencing `recruitment_agencies.id`, `recruitment_agency_bank_details.id`)

#### 24.1.5 Future Professional Services Module

**Dependencies:**
- ✅ Consultants table
- ✅ Consultant contacts
- ✅ Consultant addresses
- ✅ Consultant bank details

**New Tables:**
- `consultant_engagements` (referencing `consultants.id`, `consultant_contacts.id`)
- `consultant_invoices` (referencing `consultants.id`, `consultant_bank_details.id`)
- `consultant_retainer_agreements` (referencing `consultants.id`)

#### 24.1.6 Future Compliance Module

**Dependencies:**
- ✅ Government authorities table
- ✅ Government authority contacts
- ✅ Government authority addresses
- ✅ Jurisdiction levels

**New Tables:**
- `permit_applications` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `inspections` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `regulatory_correspondence` (referencing `government_authorities.id`, `government_authority_contacts.id`)
- `compliance_certificates` (referencing `government_authorities.id`)

#### 24.1.7 Phase 011 — HSE Module

**Dependencies:**
- ✅ Subcontractors table (HSE prequalification)
- ✅ Consultants table (HSE consultants)
- ✅ Government authorities table (environmental authorities, civil defense)

**New Tables in Phase 011:**
- `hse_incidents` (referencing `subcontractors.id`, `government_authorities.id`)
- `hse_inspections` (referencing `subcontractors.id`, `government_authorities.id`, `consultants.id`)
- `hse_training_records` (referencing `subcontractors.id`, `consultants.id`)

### 24.2 Scrap Trading Integration

**Scenario:** Alliance Gulf Transport's scrap trading business involves both buying scrap (customers as scrap suppliers) and selling scrap (customers as scrap buyers).

**Phase 002F.3E Support:**
- ✅ Customers table with `customer_type_code` → `SCRAP_BUYER` or `SCRAP_SUPPLIER`
- ✅ Customer bank details for scrap purchase payments (we pay scrap suppliers)

**Future Phase 012 (Scrap Trading Module):**
- `scrap_purchase_transactions` (referencing `customers.id` where `customer_type_code = 'SCRAP_SUPPLIER'`)
- `scrap_sales_transactions` (referencing `customers.id` where `customer_type_code = 'SCRAP_BUYER'`)
- `weighbridge_tickets` (referencing `customers.id`)

### 24.3 Service Providers and Lessors Integration

**Scenario:** Alliance Gulf Transport uses various service providers (maintenance, cleaning, security) and lessors (property, vehicle, equipment, camp).

**Phase 002F.3E Support:**
- ✅ Vendors table with `vendor_type_code` → `SERVICE_PROVIDER`, `PROPERTY_LESSOR`, `VEHICLE_LESSOR`, `EQUIPMENT_LESSOR`, `CAMP_ACCOMMODATION_LESSOR`
- ✅ Vendor bank details for payment processing

**Future Integration:**
- Phase 005 (Fleet Module): Vehicle/equipment lessors for leased assets
- Phase 006 (Workshop Module): Service providers for outsourced maintenance
- Future Camp Management Module: Camp accommodation lessors for worker accommodation

### 24.4 Transporters Integration

**Scenario:** Transporters are subcontractors providing transportation and logistics services.

**Phase 002F.3E Support:**
- ✅ Subcontractors table with `subcontractor_type_code` → `TRANSPORTER`
- ✅ Subcontractor bank details for payment processing

**Future Phase 015 (Transport / Trips Module):**
- `trip_assignments` (referencing `subcontractors.id` where `subcontractor_type_code = 'TRANSPORTER'`)
- `transporter_invoices` (referencing `subcontractors.id`, `subcontractor_bank_details.id`)

### 24.5 Insurance Companies Integration

**Scenario:** Insurance companies are vendors providing insurance policies (vehicle, equipment, liability, workers' compensation).

**Phase 002F.3E Support:**
- ✅ Vendors table with `vendor_type_code` → `INSURANCE_COMPANY`
- ✅ Vendor contacts (insurance agents)
- ✅ Vendor documents (insurance policies with expiry tracking)

**Future Integration:**
- Phase 005 (Fleet Module): Vehicle insurance policies (referencing `vendors.id`, `vendor_documents.id`)
- Phase 006 (Workshop Module): Equipment insurance
- Phase 004 (HR Module): Workers' compensation insurance

### 24.6 DMS Integration (Phase 009)

**Phase 002F.3E Placeholder:**
- ✅ `file_path` field in all 6 document tables (customers, vendors, etc.)

**Future Phase 009 (DMS Module):**
- Replace `file_path` with `document_id bigint references documents(id)`
- `documents` table stores actual files (binary storage or S3 links)
- Document versioning, approval workflows, retention policies

### 24.7 Notification Engine Integration (Phase 020)

**Phase 002F.3E Placeholder:**
- ✅ `expiry_date` and `expiry_reminder_days` fields in all 6 document tables
- ✅ `license_expiry_date` fields in main entity tables

**Future Phase 020 (Notification Engine):**
- Automatic expiry reminder emails/SMS based on `expiry_reminder_days`
- Daily batch job to check upcoming expiries
- Notification preferences per user
- Escalation to managers if expiry not addressed

### 24.8 Accounting Module Integration (Future Phase)

**Phase 002F.3E Support:**
- ✅ Customers table with credit management (`credit_limit`, `credit_days`)
- ✅ Vendors/subcontractors/consultants with bank details for payment processing
- ✅ Payment terms
- ✅ Tax types

**Future Accounting Module:**
- Accounts receivable (referencing `customers.id`)
- Accounts payable (referencing `vendors.id`, `subcontractors.id`, `consultants.id`)
- Chart of accounts (referencing `cost_centers.id`, `profit_centers.id`)
- Payment processing (referencing `vendor_bank_details`, `subcontractor_bank_details`, etc.)

### 24.9 Employees Handled in Phase 002F.3F

**Reminder:** Employees are **NOT** part of Phase 002F.3E.

**Future Phase 002F.3F — HR Master Data:**
- `employees` table (separate from customers/vendors/subcontractors)
- `employee_contacts` (emergency contacts, family members)
- `employee_documents` (passports, visas, labor cards, driving licenses)
- `employee_dependents`
- `departments`, `positions`, `job_titles`, `employment_types`, `salary_grades`

**Integration Point:** Employees may have relationships to parties (e.g., employee assigned as sales owner for customer, employee is recruitment agency contact).

---

## 25. Implementation Phasing Recommendation

### 25.1 Complexity Analysis

**Phase 002F.3E Scope:**
- 30 tables (6 main entities + 24 child tables)
- 22 lookup categories + ~120 lookup values
- ~60 server actions
- ~36 UI components
- 48 permissions + ~180 RLS policies
- 6 select components
- 1 sidebar menu group

**Estimated Total Lines of Code:**
- Database migration: ~3000 lines SQL
- Types: ~1500 lines TypeScript
- Validation: ~1000 lines TypeScript
- Server actions: ~3000 lines TypeScript
- UI components: ~4000 lines TypeScript (JSX)
- **Total: ~12,500 lines of code**

**Recommendation:** **Split into 5 implementation sub-phases** for manageable complexity, incremental testing, and gate approvals.

### 25.2 Recommended Implementation Phasing

#### 25.2.1 Phase 002F.3E.1 — Technical Planning (Current Phase)

**Status:** IN PROGRESS

**Deliverables:**
- ✅ This technical implementation plan document
- ✅ Sameer/Dina review and approval

**Duration:** 1 day (planning only, no implementation)

#### 25.2.2 Phase 002F.3E.2 — Database + Lookups + Seeds

**Scope:**
- Create 30 database tables (DDL)
- Create 22 lookup categories
- Create ~120 lookup values
- Seed sample data (optional)
- Apply RLS policies (~180 policies)
- Seed permissions (48 permissions)
- Assign permissions to roles

**Deliverables:**
- Migration file(s): `20260607HHMMSS_erp_base_002f3e2_database_lookups_seeds.sql`
- Database verification report
- RLS policy verification report

**Duration:** 2-3 days

**Testing:**
- [ ] All tables created
- [ ] All RLS policies applied
- [ ] All permissions seeded
- [ ] All lookup categories and values seeded
- [ ] Sample data inserted (if included)
- [ ] Database constraints verified (TRN format, email format, etc.)

**Gate:** Database foundation complete, approved by Sameer/Dina before proceeding to 002F.3E.3.

#### 25.2.3 Phase 002F.3E.3 — Customers + Child Tables

**Scope:**
- Types, validation, server actions for customers
- Types, validation, server actions for customer_contacts, customer_addresses, customer_documents, customer_bank_details
- UI components: CustomersTable, CustomerFormDialog, child record forms
- Page: `/admin/master-data/parties/customers`

**Deliverables:**
- `src/features/master-data/parties/customers/`
  - `types.ts`
  - `validation.ts`
  - `customers-actions.ts`
  - `contacts-actions.ts`
  - `addresses-actions.ts`
  - `documents-actions.ts`
  - `bank-details-actions.ts`
  - `components/` (6 components)
- `src/app/(protected)/admin/master-data/parties/customers/page.tsx`

**Duration:** 2-3 days

**Testing:**
- [ ] Add customer with all fields
- [ ] Edit customer
- [ ] Delete customer (soft delete)
- [ ] Add customer contact
- [ ] Add customer address
- [ ] Add customer document
- [ ] Add customer bank details
- [ ] View customer audit log
- [ ] Export customers to CSV
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** Customers module complete, approved by Sameer/Dina before proceeding to 002F.3E.4.

#### 25.2.4 Phase 002F.3E.4 — Vendors + Child Tables

**Scope:**
- Types, validation, server actions for vendors
- Types, validation, server actions for vendor_contacts, vendor_addresses, vendor_documents, vendor_bank_details
- UI components: VendorsTable, VendorFormDialog, child record forms
- Page: `/admin/master-data/parties/vendors`

**Deliverables:**
- `src/features/master-data/parties/vendors/` (same structure as customers)
- `src/app/(protected)/admin/master-data/parties/vendors/page.tsx`

**Duration:** 2-3 days

**Testing:**
- [ ] Add vendor with all fields
- [ ] Edit vendor
- [ ] Vendor bank details mandatory (verify constraint)
- [ ] Add vendor contact
- [ ] Add vendor address
- [ ] Add vendor document
- [ ] Add vendor bank details
- [ ] View vendor audit log
- [ ] Export vendors to CSV
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** Vendors module complete, approved by Sameer/Dina before proceeding to 002F.3E.5.

#### 25.2.5 Phase 002F.3E.5 — Remaining Entities (Subcontractors, Consultants, Government Authorities, Recruitment Agencies)

**Scope:**
- Types, validation, server actions for subcontractors, consultants, government_authorities, recruitment_agencies
- Types, validation, server actions for all child tables (contacts, addresses, documents, bank details)
- UI components for all 4 entities (16 components)
- Pages for all 4 entities

**Deliverables:**
- `src/features/master-data/parties/subcontractors/` (same structure as customers)
- `src/features/master-data/parties/consultants/` (same structure as customers)
- `src/features/master-data/parties/government-authorities/` (same structure as customers)
- `src/features/master-data/parties/recruitment-agencies/` (same structure as customers)
- 4 pages (subcontractors, consultants, government-authorities, recruitment-agencies)

**Duration:** 2-3 days

**Testing:**
- [ ] Add/edit/delete subcontractor
- [ ] Subcontractor HSE prequalification status working
- [ ] Worker/equipment supply flags working
- [ ] Add/edit/delete consultant
- [ ] Add/edit/delete government authority
- [ ] Government authority jurisdiction level working
- [ ] Government authority: no bank details tab (verified)
- [ ] Add/edit/delete recruitment agency
- [ ] Recruitment agency countries served working
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success

**Gate:** All main entities complete, approved by Sameer/Dina before proceeding to 002F.3E.6.

#### 25.2.6 Phase 002F.3E.6 — Select Components + Sidebar + QA Readiness

**Scope:**
- Create 6 reusable select components (CustomerSelect, VendorSelect, SubcontractorSelect, ConsultantSelect, GovernmentAuthoritySelect, RecruitmentAgencySelect)
- Update sidebar navigation (`app-sidebar.tsx`)
- Comprehensive QA testing (all entities, all actions)
- Final readiness report

**Deliverables:**
- `src/components/erp/parties/`
  - `customer-select.tsx`
  - `vendor-select.tsx`
  - `subcontractor-select.tsx`
  - `consultant-select.tsx`
  - `government-authority-select.tsx`
  - `recruitment-agency-select.tsx`
  - `index.ts` (exports)
- `src/components/layout/app-sidebar.tsx` (updated)
- `implementation_Review/Phase_002F_3E/ERP_BASE_002F_3E_6_SELECT_COMPONENTS_SIDEBAR_QA_READINESS_REPORT.md`

**Duration:** 1-2 days

**Testing:**
- [ ] All 6 select components working
- [ ] Select components respect RLS
- [ ] Select components load active records only
- [ ] Select components support type/category filters
- [ ] Sidebar menu group "People / Contacts / CRM Foundation" appears
- [ ] All 6 entity menu items appear with correct icons
- [ ] Sidebar navigation working (collapsed by default, manual multi-open)
- [ ] Comprehensive QA: All entities, all actions (add, edit, delete, child records, audit logs, export)
- [ ] TypeScript compilation: 0 errors
- [ ] Build: Success
- [ ] Lint: Pass with notes
- [ ] Manual browser QA: Pass
- [ ] Sameer/Dina approval

**Gate:** Phase 002F.3E complete, ready for closure.

### 25.3 Implementation Phasing Summary

| Sub-Phase | Scope | Duration | Deliverables | Gate Criteria |
|-----------|-------|----------|--------------|---------------|
| **002F.3E.1** | Technical Planning | 1 day | Technical plan document | Sameer/Dina approval |
| **002F.3E.2** | Database + Lookups + Seeds | 2-3 days | Migration file(s), verification reports | Database foundation complete |
| **002F.3E.3** | Customers + Child Tables | 2-3 days | Customer module (types, actions, UI) | Customers module tested, approved |
| **002F.3E.4** | Vendors + Child Tables | 2-3 days | Vendor module (types, actions, UI) | Vendors module tested, approved |
| **002F.3E.5** | Remaining Entities | 2-3 days | Subcontractors, Consultants, Govt Authorities, Recruitment Agencies | All entities tested, approved |
| **002F.3E.6** | Select Components + Sidebar + QA | 1-2 days | 6 select components, sidebar update, final QA report | Comprehensive QA passed, Sameer/Dina approval |
| **Total** | **Full Phase 002F.3E** | **9-14 days** | **30 tables, 60 actions, 36 UI components, 6 select components** | **Phase 002F.3E CLOSED** |

### 25.4 Next Implementation Prompt Name

**Recommended Next Prompt:**

```text
PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
```

**Prompt Purpose:**
- Implement Phase 002F.3E.2 (Database + Lookups + Seeds)
- Create 30 database tables
- Seed 22 lookup categories + ~120 lookup values
- Apply 180 RLS policies
- Seed 48 permissions
- Optional: Seed sample data for testing

**Prompt Scope:**
- Database implementation only
- No UI components
- No server actions (except permissions seeding)
- Gate approval before proceeding to 002F.3E.3

---

## 26. Final Recommendation

### 26.1 Plan Status

**READY FOR SAMEER REVIEW — 002F.3E technical plan complete.**

### 26.2 Summary

This technical plan provides a comprehensive, implementation-ready blueprint for **ERP BASE Phase 002F.3E — People / Contacts / CRM Foundation**, covering:

✅ **6 main entity tables** (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)  
✅ **24 child tables** (contacts, addresses, documents, bank details)  
✅ **22 lookup categories** + ~120 lookup values  
✅ **48 permissions** + ~180 RLS policies  
✅ **~60 server actions**  
✅ **~36 UI components**  
✅ **6 reusable select components**  
✅ **Sidebar navigation update**  
✅ **No hardcoded dropdowns** (dropdown mapping matrix complete)  
✅ **Master data reuse** (Geography, Finance Basics, UOM, Lookup Engine)  
✅ **Separation by entity type** (no generic persons table, employees excluded)  
✅ **5 implementation sub-phases** (002F.3E.2 through 002F.3E.6)  

### 26.3 Key Decisions Confirmed

1. **Entity Separation:** 6 dedicated main entity tables (no generic persons table)
2. **Employee Exclusion:** Employees handled in Phase 002F.3F (HR Master Data)
3. **Separate Child Tables:** 6 contact tables, 6 address tables, 6 document tables, 6 bank details tables (no shared polymorphic tables)
4. **Dual-Role Entities:** Accepted separate records for dual-role entities (e.g., same company as both customer and vendor)
5. **Customer Bank Details:** Included for refunds, rebates, and scrap trading payments
6. **Government Authority Bank Details:** Excluded (fees paid via government portals)
7. **No Hardcoded Dropdowns:** All classification fields use lookup categories or master data tables
8. **Granular Permissions:** 48 permissions (8 per entity) for fine-grained access control
9. **Implementation Phasing:** Split into 5 sub-phases for manageable complexity

### 26.4 Success Criteria

Phase 002F.3E will be considered successful when:

✅ All 30 tables created with proper BIGINT PKs/FKs, RLS, and indexes  
✅ All 22 lookup categories and ~120 lookup values seeded  
✅ All 48 permissions seeded and assigned to roles  
✅ All ~60 server actions implemented with validation, permissions, and audit logging  
✅ All ~36 UI components implemented with ERPDataTable, ERPDrawerForm patterns  
✅ All 6 select components implemented and functional  
✅ Sidebar navigation updated with "People / Contacts / CRM Foundation" menu group  
✅ TypeScript compilation: 0 errors  
✅ Build: Success (npm run build)  
✅ Lint: Pass with notes (pre-existing issues only)  
✅ Manual browser QA: Pass (Sameer/Dina approval)  
✅ No hardcoded dropdowns (dropdown mapping matrix validated)  

### 26.5 Business Value

Phase 002F.3E unlocks:

- **CRM Module** (Phase 003) — Customer segmentation, lead tracking, sales pipeline
- **Procurement Module** (Phase 008) — Vendor management, purchase orders, payment processing
- **Subcontracting Module** (Future) — Subcontract agreements, work orders, HSE tracking
- **Professional Services Module** (Future) — Consultant engagements, retainer management
- **Compliance Module** (Future) — Permit tracking, inspection management, regulatory correspondence
- **HR Module** (Phase 004) — Recruitment agency tracking, candidate management
- **Scrap Trading** (Phase 012) — Scrap buyer/supplier management, payment processing
- **Service Providers** — Maintenance, cleaning, security service management
- **Lessors** — Property, vehicle, equipment, camp accommodation lease management
- **Transporters** (Phase 015) — Transportation and logistics service management

### 26.6 Risk Summary

**Low Risk:**
- ✅ Well-established patterns from previous phases (Geography, Finance Basics, UOM)
- ✅ No architectural changes required
- ✅ Reusable components and helper functions available
- ✅ RLS and permission patterns proven

**Medium Risk:**
- ⚠️ Largest module to date (30 tables, ~12,500 lines of code)
- ⚠️ Potential for accidentally hardcoding dropdowns (mitigated by dropdown mapping matrix)
- ⚠️ User confusion between similar entities (mitigated by clear UI labels and training)

**High Risk (Mitigated):**
- ⚠️ Too many tables in one phase → **Mitigated by 5-sub-phase approach**
- ⚠️ Bank details data leak → **Mitigated by strict RLS policies and UI masking**
- ⚠️ RLS policies too strict/open → **Mitigated by comprehensive testing and role matrix validation**

### 26.7 Next Steps

1. **Sameer/Dina Review** — Review this technical plan, provide feedback, request clarifications
2. **Plan Approval** — Approve this technical plan to proceed with implementation
3. **Implementation Kickoff** — Generate implementation prompt:
   ```text
   PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
   ```
4. **Phase 002F.3E.2 Implementation** — Database + Lookups + Seeds (2-3 days)
5. **Gate Approval** — Database foundation verified, approved before 002F.3E.3
6. **Phase 002F.3E.3 Implementation** — Customers + Child Tables (2-3 days)
7. **Gate Approval** — Customers module tested, approved before 002F.3E.4
8. **Phase 002F.3E.4 Implementation** — Vendors + Child Tables (2-3 days)
9. **Gate Approval** — Vendors module tested, approved before 002F.3E.5
10. **Phase 002F.3E.5 Implementation** — Remaining Entities (2-3 days)
11. **Gate Approval** — All entities tested, approved before 002F.3E.6
12. **Phase 002F.3E.6 Implementation** — Select Components + Sidebar + QA (1-2 days)
13. **Final Gate Approval** — Comprehensive QA passed, Sameer/Dina approval
14. **Phase 002F.3E Closure** — Phase marked CLOSED, roadmap updated

### 26.8 Estimated Timeline

**Total Implementation Time:** 9-14 days (business days, excluding planning)

**Breakdown:**
- 002F.3E.2: 2-3 days
- 002F.3E.3: 2-3 days
- 002F.3E.4: 2-3 days
- 002F.3E.5: 2-3 days
- 002F.3E.6: 1-2 days

**With gate approvals and testing buffer:** 12-16 days total

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Party** | Generic term for external business entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies) |
| **CRM** | Customer Relationship Management — Sales, marketing, and customer service processes |
| **TRN** | Tax Registration Number — UAE 15-digit tax ID |
| **IBAN** | International Bank Account Number — Standardized bank account identifier |
| **SWIFT** | Society for Worldwide Interbank Financial Telecommunication — Bank identification code |
| **Makani** | Dubai smart addressing system — 10-digit location code |
| **HSE** | Health, Safety, Environment — Compliance and safety management |
| **RLS** | Row Level Security — PostgreSQL database-level access control |
| **Lookup Category** | Editable dropdown category in global lookup engine |
| **Lookup Value** | Individual dropdown option within a lookup category |
| **Soft Delete** | Setting `is_active = false` instead of hard-deleting database records |
| **Hard Delete** | Permanently deleting database records (rare, system_admin only) |
| **Dual-Role Entity** | Company that exists as both customer and vendor (separate records in Phase 002F.3E) |
| **Cascading Delete** | Child records automatically deleted when parent record is hard-deleted |
| **Service Role** | Supabase admin role for server-side operations (bypasses RLS) |

---

## Appendix B: Quick Reference — File Locations

### Database
- Migration file: `supabase/migrations/20260607HHMMSS_erp_base_002f3e2_database_lookups_seeds.sql`

### Types
- `src/features/master-data/parties/customers/types.ts`
- `src/features/master-data/parties/vendors/types.ts`
- ... (repeat for all 6 entities)

### Validation
- `src/features/master-data/parties/customers/validation.ts`
- `src/features/master-data/parties/vendors/validation.ts`
- ... (repeat for all 6 entities)

### Server Actions
- `src/features/master-data/parties/customers/customers-actions.ts`
- `src/features/master-data/parties/customers/contacts-actions.ts`
- `src/features/master-data/parties/customers/addresses-actions.ts`
- `src/features/master-data/parties/customers/documents-actions.ts`
- `src/features/master-data/parties/customers/bank-details-actions.ts`
- ... (repeat for all 6 entities)

### UI Components
- `src/features/master-data/parties/customers/components/customers-table.tsx`
- `src/features/master-data/parties/customers/components/customer-form-dialog.tsx`
- ... (repeat for all 6 entities, ~36 components total)

### Select Components
- `src/components/erp/parties/customer-select.tsx`
- `src/components/erp/parties/vendor-select.tsx`
- `src/components/erp/parties/subcontractor-select.tsx`
- `src/components/erp/parties/consultant-select.tsx`
- `src/components/erp/parties/government-authority-select.tsx`
- `src/components/erp/parties/recruitment-agency-select.tsx`
- `src/components/erp/parties/index.ts` (exports)

### Pages
- `src/app/(protected)/admin/master-data/parties/customers/page.tsx`
- `src/app/(protected)/admin/master-data/parties/vendors/page.tsx`
- `src/app/(protected)/admin/master-data/parties/subcontractors/page.tsx`
- `src/app/(protected)/admin/master-data/parties/consultants/page.tsx`
- `src/app/(protected)/admin/master-data/parties/government-authorities/page.tsx`
- `src/app/(protected)/admin/master-data/parties/recruitment-agencies/page.tsx`

### Sidebar
- `src/components/layout/app-sidebar.tsx` (update required)

---

**END OF TECHNICAL IMPLEMENTATION PLAN**

**Document Version:** 1.0  
**Generated:** Sunday, June 7, 2026  
**Status:** READY FOR SAMEER REVIEW  
**Next Action:** Sameer/Dina review and approval to proceed with Phase 002F.3E.2 implementation

