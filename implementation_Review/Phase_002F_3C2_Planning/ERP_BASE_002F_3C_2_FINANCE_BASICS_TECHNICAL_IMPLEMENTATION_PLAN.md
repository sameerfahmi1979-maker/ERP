# ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN

## Document Information

- **Phase**: ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness
- **Plan Date**: 2026-06-06
- **Plan Type**: Technical Implementation Plan (Planning Only - No Implementation)
- **Prepared By**: Claude (AI Planning Agent)
- **Status**: READY FOR SAMEER REVIEW

---

## 1. Executive Summary

### Purpose of 002F.3C.2

ERP BASE 002F.3C.2 implements **Finance Basics / Commercial Readiness** master data required for commercial operations, CRM, procurement, inventory, and future accounting modules. This phase establishes foundational financial master data **without implementing full accounting functionality**.

**Core Objective**: Enable commercial operations (quotes, orders, invoicing) with proper currency, tax, payment, and cost tracking support while remaining strictly outside the accounting module scope.

### Why Finance Basics Comes After Geography (002F.3C.1)

Geography foundation provides:
- ✅ **countries table** — Required for `banks.country_id` foreign key
- ✅ **Geographic select components** — Pattern template for finance selects
- ✅ **RLS and permission patterns** — Proven and stable, ready to replicate
- ✅ **UI patterns** — ERPDrawerForm, ERPDataTable, page structure all working
- ✅ **Audit logging** — Pattern established and tested
- ✅ **Lock/unlock/delete behavior** — System admin patterns clear

Finance Basics builds directly on this proven foundation.

### What Will Be Implemented

**6 Dedicated Master Data Tables**:
1. **currencies** — Multi-currency support (AED base, USD, EUR, GCC currencies, decimal places)
2. **payment_terms** — Commercial payment terms (NET_30, ADVANCE_50, retention, due days)
3. **tax_types** — UAE VAT/RCM tax definitions (5% VAT, zero-rated, exempt, RCM for scrap)
4. **banks** — UAE and international bank master data (FAB, ENBD, ADCB, with SWIFT codes)
5. **cost_centers** — Reporting and cost allocation centers (departments, projects, branches)
6. **profit_centers** — Revenue and profit tracking centers (business units, service lines)

**6 Lookup Categories** (using existing global_lookup_categories/values):
1. **PAYMENT_METHODS** — Cash, cheque, bank transfer, LC, PDC, credit card, online transfer
2. **TAX_TREATMENT_TYPES** — Standard rated, zero rated, exempt, out of scope, reverse charge
3. **BANK_ACCOUNT_TYPES** — Current, savings, call account, LC account, guarantee account
4. **BANK_TYPES** — Commercial, Islamic, central bank, exchange house, finance company
5. **COST_CENTER_TYPES** — Department, branch, project, equipment, workshop, fleet, admin
6. **PROFIT_CENTER_TYPES** — Business unit, service line, revenue stream, project, branch

**Complete Implementation**:
- ✅ Full CRUD UI pages (6 pages)
- ✅ Reusable select components (6 components)
- ✅ RLS policies (all 6 tables)
- ✅ Permissions (view, manage, export, audit_view)
- ✅ Audit logging (all operations)
- ✅ Validation schemas (Zod)
- ✅ Server actions (create, update, delete, toggle)
- ✅ Seed data (system records)
- ✅ Export functionality
- ✅ Global admin full access

### What Will NOT Be Implemented

This phase **strictly avoids** becoming an accounting module:

❌ **Accounting Core**:
- Chart of accounts
- General ledger
- Journal entries
- Ledger transactions
- Trial balance
- Balance sheet / P&L
- Financial statements
- Double-entry bookkeeping
- Accounting posting engine
- Financial period closing

❌ **AR/AP**:
- Accounts receivable ledger
- Accounts payable ledger
- Customer/vendor master data (CRM phase)
- Invoice posting to GL
- Payment posting to GL

❌ **Advanced Finance**:
- Exchange rate engine
- Automatic currency revaluation
- Budget control/management
- Budget vs actual reporting
- Bank reconciliation
- Payment processing integration
- VAT return filing
- UAE FTA API integration
- E-invoicing integration

❌ **Other Modules**:
- CRM transactions
- Procurement transactions
- Inventory transactions
- HR/Payroll
- Fleet management
- Workshop management
- Work Sites master data
- Units & Measurements master data

**Rule**: Any field or feature that seems accounting-related will be marked as "future placeholder" and NOT implemented in 002F.3C.2.

### How This Phase Supports Future Modules

**CRM (002F.3E)** — Customer Management:
- Payment terms for customer quotes and proposals
- Tax types for customer pricing calculations
- Currencies for international customers
- Banks for customer payment account details
- Profit centers for sales tracking

**Procurement**:
- Payment terms for purchase orders
- Tax types for vendor invoices (input VAT)
- Currencies for international vendors
- Banks for vendor payment processing
- Cost centers for PO expense allocation

**Inventory**:
- Cost centers for warehouse/stock location tracking
- Tax types for item tax treatment classification

**HR & Payroll**:
- Banks for employee salary bank accounts
- Cost centers for employee department allocation

**Fleet/Workshop/Equipment**:
- Cost centers for vehicle/equipment tracking
- Profit centers for rental revenue tracking
- Tax types for service invoicing

**Scrap Trading**:
- Tax types (RCM_SCRAP for reverse charge mechanism)
- Profit centers for scrap revenue tracking
- Cost centers for scrap operations

**Demolition Services**:
- Profit centers for project revenue
- Cost centers for project costs
- Payment terms for customer contracts

**Commercial Offers/Proposals**:
- Payment terms for offer conditions
- Tax calculations (VAT, zero-rated, exempt)
- Multi-currency pricing
- Cost/profit center allocation

### Readiness Status

✅ **Foundation Ready**:
- Geography master data (002F.3C.1) approved and stable
- Lookup engine (002F.3B) approved and tested
- RLS and permission infrastructure proven
- UI component library mature (ERPDrawerForm, ERPDataTable, ERPPageHeader)
- Audit logging operational
- Select component patterns established

✅ **Patterns Proven**:
- Database schema conventions clear
- Server action patterns working
- Validation approach mature (Zod)
- Lock/unlock/delete behavior stable
- System admin full access pattern understood

✅ **Dependencies Met**:
- countries table exists (for banks FK)
- global_lookup_categories/values ready
- current_user_has_permission() working
- set_updated_at() trigger available
- Audit helpers (logAudit, createAuditDiff) operational

**Conclusion**: ✅ **READY FOR IMPLEMENTATION** after Sameer approval of this technical plan.

---

## 2. Scope and Non-Scope Confirmation

### In Scope ✅

**Dedicated Tables (6)**:
- ✅ `currencies` — Multi-currency master data
- ✅ `payment_terms` — Commercial payment term definitions
- ✅ `tax_types` — VAT, RCM, and tax rate master data
- ✅ `banks` — Bank master data (UAE and international)
- ✅ `cost_centers` — Cost allocation centers
- ✅ `profit_centers` — Profit tracking centers

**Lookup Categories (6)**:
- ✅ `PAYMENT_METHODS` — Payment method types
- ✅ `TAX_TREATMENT_TYPES` — Tax treatment classifications
- ✅ `BANK_ACCOUNT_TYPES` — Bank account types
- ✅ `BANK_TYPES` — Bank institution types
- ✅ `COST_CENTER_TYPES` — Cost center classifications
- ✅ `PROFIT_CENTER_TYPES` — Profit center classifications

**Features**:
- ✅ UAE VAT 5% standard rate
- ✅ VAT zero-rated classification
- ✅ VAT exempt classification
- ✅ Out-of-scope classification
- ✅ Reverse charge mechanism (RCM) for scrap trading
- ✅ Multi-currency support (AED base + international)
- ✅ GCC currency support (SAR, QAR, OMR, BHD, KWD)
- ✅ Payment term calculations (due days, advance %, retention %)
- ✅ UAE bank master data (FAB, ADCB, ENBD, DIB, Mashreq, etc.)
- ✅ SWIFT/BIC code support
- ✅ Cost/profit center hierarchy (parent-child relationships)
- ✅ Company and branch association (owner_company_id, branch_id)

**Infrastructure**:
- ✅ Full CRUD UI pages (add, edit, view, delete)
- ✅ RLS policies (row-level security)
- ✅ Permissions (view, manage, export, audit_view)
- ✅ Audit logging (all CRUD operations)
- ✅ Lock/unlock functionality
- ✅ Activate/deactivate status management
- ✅ System record protection
- ✅ Global admin (system_admin) full access
- ✅ Seed data (system records)
- ✅ Reusable select components
- ✅ Zod validation schemas
- ✅ Server actions (create/update/delete/toggle)
- ✅ Export functionality (Excel/CSV)
- ✅ Search and filtering
- ✅ Sort order management

### Out of Scope ❌

**Accounting Module (Strictly Excluded)**:
- ❌ Chart of accounts structure
- ❌ Account groups / account hierarchy
- ❌ General ledger (GL)
- ❌ Journal entries / journal vouchers
- ❌ Ledger transactions / ledger posting
- ❌ Trial balance
- ❌ Balance sheet
- ❌ Profit & loss statement
- ❌ Cash flow statement
- ❌ Financial period closing
- ❌ Accounting posting engine
- ❌ Double-entry accounting logic
- ❌ AR (Accounts Receivable) ledger
- ❌ AP (Accounts Payable) ledger
- ❌ GL account code linkage to cost/profit centers

**Financial Transactions (Not This Phase)**:
- ❌ Customer master data (CRM phase)
- ❌ Vendor master data (Procurement phase)
- ❌ Invoice creation/posting
- ❌ Payment processing/recording
- ❌ Receipt processing/recording
- ❌ Credit notes
- ❌ Debit notes
- ❌ Bank reconciliation
- ❌ Cash management

**Advanced Finance (Future)**:
- ❌ Exchange rate engine
- ❌ Multi-currency exchange rate tables
- ❌ Automatic currency revaluation
- ❌ Foreign exchange gain/loss calculations
- ❌ Budget management
- ❌ Budget control
- ❌ Budget vs actual reporting
- ❌ Financial forecasting
- ❌ VAT return filing
- ❌ UAE Federal Tax Authority (FTA) API integration
- ❌ E-invoicing integration
- ❌ ZATCA integration (Saudi)

**Other Master Data (Other Phases)**:
- ❌ Work Sites (002F.3C.3 or later)
- ❌ Units & Measurements (002F.3C.3)
- ❌ Customers (CRM phase)
- ❌ Vendors (Procurement phase)
- ❌ Items/Products (Inventory phase)
- ❌ Employees (HR phase)
- ❌ Vehicles (Fleet phase)
- ❌ Equipment (Fleet/Workshop phase)

**Rationale**: This phase focuses exclusively on **commercial readiness master data** — the foundational reference tables needed by transactional modules. It intentionally avoids accounting to prevent scope creep and maintain clear boundaries.

---

## 3. Source Code Inspection Summary

| Area | Files/Tables Inspected | Existing Pattern Found | Impact on 002F.3C.2 |
|------|------------------------|------------------------|---------------------|
| **002F.3B Lookup Engine** | `supabase/migrations/20260605113000_erp_base_002f3b_global_lookup_engine.sql`<br>`src/features/master-data/lookups/types.ts`<br>`src/features/master-data/lookups/validation.ts`<br>`src/features/master-data/lookups/hooks/use-lookup-values.ts` | - global_lookup_categories table with category_code, module_code, scope<br>- global_lookup_values table with hierarchy, color, icon, effective dates<br>- RLS policies enabled<br>- system_admin full access<br>- LookupSelect component pattern<br>- Seed data pattern with ON CONFLICT DO NOTHING | **Reuse existing tables** for 6 lookup categories (PAYMENT_METHODS, TAX_TREATMENT_TYPES, BANK_TYPES, BANK_ACCOUNT_TYPES, COST_CENTER_TYPES, PROFIT_CENTER_TYPES).<br><br>Follow exact seed data pattern.<br><br>Reference lookup values using `value_code` in finance tables. |
| **002F.3C.1 Geography** | `supabase/migrations/20260605135301_erp_base_002f3c1_geography_locations.sql`<br>`src/features/master-data/geography/actions.ts` (2143 lines)<br>`src/features/master-data/geography/types.ts` (459 lines)<br>`src/features/master-data/geography/validation.ts` (489 lines)<br>All 6 geography page components | - Dedicated tables: countries, emirates, cities, areas_zones, ports<br>- Standard columns: id, code, name_en, name_ar, is_system, is_locked, is_active, sort_order, created_at/by, updated_at/by, deactivated_at/by/reason<br>- Server actions: create, update, delete, toggleStatus, toggleLock<br>- Zod validation with regex patterns<br>- ERPDrawerForm with sections<br>- ERPDataTable with filters/actions<br>- Select components (CountrySelect, EmirateSelect, CitySelect)<br>- Lock/unlock UI conditional on system_admin<br>- Delete restricted to system_admin | **Replicate exact pattern** for 6 finance tables.<br><br>Use countries.id as FK for banks.country_id.<br><br>Follow identical:<br>- Column naming conventions<br>- Server action structure<br>- Validation approach<br>- UI component architecture<br>- Lock/unlock/delete logic |
| **RLS Helpers** | Geography RLS policies in migration:<br>- SELECT policies<br>- INSERT policies<br>- UPDATE policies<br>- DELETE policies | - All tables: `ENABLE ROW LEVEL SECURITY`<br>- SELECT: `current_user_has_permission('master_data.geography.view')` OR system_admin<br>- INSERT: `current_user_has_permission('master_data.geography.manage')` with CHECK<br>- UPDATE: Permission check + locked row protection<br>- DELETE: system_admin role only<br>- Helper: `current_user_has_permission(permission_code TEXT)` exists and works | **Apply identical RLS pattern** to all 6 finance tables.<br><br>Policies:<br>- SELECT: finance_basics.view<br>- INSERT: finance_basics.manage<br>- UPDATE: finance_basics.manage + not locked<br>- DELETE: system_admin only<br><br>System_admin bypass for all operations. |
| **Permissions** | Geography permissions:<br>`master_data.geography.view`<br>`master_data.geography.manage`<br>`master_data.geography.export`<br>`master_data.geography.audit_view`<br><br>Role assignments in migration | - Permission format: `module.feature.action`<br>- Module_code: 'master_data'<br>- Permission_type: 'view', 'manage', 'export', 'audit_view'<br>- system_admin: All permissions<br>- group_admin: view, manage, export, audit_view<br>- company_admin: view, export<br>- branch_admin: view | **Create permissions**:<br>- master_data.finance_basics.view<br>- master_data.finance_basics.manage<br>- master_data.finance_basics.export<br>- master_data.finance_basics.audit_view<br><br>**Assign to roles** same as geography pattern. |
| **Audit** | Geography audit calls:<br>`await logAudit({...})`<br>`createAuditDiff(old, new)` | - logAudit() imported from @/server/actions/audit<br>- Parameters: module_code, entity_name, entity_id, entity_reference, action, old_values, new_values<br>- Actions: create, update, delete, activate, deactivate, lock, unlock<br>- Called after every CRUD operation<br>- Includes diff calculation for updates | **Use identical audit pattern** for all finance operations.<br><br>Module_code: 'master_data'<br>Entity_name: 'currencies', 'payment_terms', etc.<br><br>Log all CRUD + status + lock operations. |
| **ERPDrawerForm** | Geography form dialogs (e.g., city-form-dialog.tsx, emirate-form-dialog.tsx) | - Client component "use client"<br>- Props: entity, mode (add/edit/view), open, onOpenChange<br>- ERPDrawerForm wrapper with title/subtitle/recordNumber<br>- ERPDrawerSectionNav for multi-section forms<br>- ERPDrawerBody, ERPDrawerSection, ERPFieldGrid<br>- ERPDrawerFooter for submit/cancel<br>- Disabled fields in view mode<br>- State management (useState, useEffect)<br>- Form submission with FormData<br>- Toast notifications (success/error) | **Replicate pattern** for all 6 finance form dialogs.<br><br>Use same:<br>- Component structure<br>- Section navigation<br>- Field layout (ERPFieldGrid)<br>- State management<br>- Form handling<br>- Toast messages |
| **ERPDataTable** | Geography table components (e.g., cities-table.tsx, emirates-table.tsx) | - Client component with data prop<br>- ERPDataTable with tableId, columns, data<br>- Column definitions (ColumnDef)<br>- Row actions: view, edit, delete, lock/unlock, activate/deactivate<br>- System_admin conditional rendering for delete<br>- Lock status indicators<br>- System record indicators<br>- Filters (search, active/inactive)<br>- Pagination<br>- Add button with permission check | **Replicate pattern** for all 6 finance tables.<br><br>Same columns, actions, permissions, indicators. |
| **ERPExportMenu** | Geography export patterns | - ERPExportMenu component available<br>- Export server actions return data arrays<br>- Exported to Excel/CSV<br>- Permission check: finance_basics.export | **Implement export actions** for all 6 tables.<br><br>Return flat data arrays.<br><br>Check export permission. |
| **Sidebar** | `src/components/layout/app-sidebar.tsx` | - Grouped navigation structure<br>- Example: Master Data → Geography & Locations → Countries/Emirates/Cities/etc.<br>- Icon support (lucide-react)<br>- Path routing<br>- Recently updated for "Regions / Emirates" | **Add Finance Basics group**:<br>- Master Data → Finance Basics → Currencies/Payment Terms/Tax Types/Banks/Cost Centers/Profit Centers<br><br>Use DollarSign or Banknote icon. |
| **Select Components** | `src/components/erp/geography/country-select.tsx`<br>`emirate-select.tsx`<br>`city-select.tsx` | - Client component "use client"<br>- Props: value, onValueChange, placeholder, disabled, required, className, error<br>- Additional props: includeInactive, language, showCode, allowClear<br>- useEffect for data loading<br>- createClient() for Supabase queries<br>- Filter by is_active = true<br>- Loading state (Loader2 spinner)<br>- Error state display<br>- Empty state message<br>- Select from shadcn/ui | **Create 6 finance select components**:<br>- CurrencySelect<br>- PaymentTermSelect<br>- TaxTypeSelect<br>- BankSelect<br>- CostCenterSelect<br>- ProfitCenterSelect<br><br>Follow identical pattern. |
| **Owner Companies / Branches** | Verified tables exist:<br>- public.owner_companies<br>- public.branches | - Tables exist in database<br>- Used for multi-company support<br>- FK relationships available<br>- No currency or cost center fields yet added | **Cost/profit centers** will reference owner_company_id and branch_id.<br><br>Document: Future integration will add currency_id to owner_companies and default_cost_center_id to branches (NOT in this phase). |

**Key Findings**:
1. ✅ All required patterns **exist and are proven stable**
2. ✅ All infrastructure components **ready for reuse**
3. ✅ Geography provides **exact template** to replicate
4. ✅ No new patterns or infrastructure needed
5. ✅ System_admin full access pattern is **clear and working**
6. ✅ Lookup engine **ready for new categories**
7. ✅ Countries table **available for banks FK**

**Conclusion**: Implementation can proceed with **very high confidence**. The established patterns are mature, well-tested, and directly applicable to Finance Basics.

---

## 4. Lookup vs Dedicated Table Decision Matrix

| Master Data Item | Type | Table / Lookup Category | Reason | Used By | Priority | Phase |
|------------------|------|-------------------------|--------|---------|----------|-------|
| **Currencies** | Dedicated Table | `currencies` | Multi-attribute (symbol, decimal_places, is_base_currency), complex business rule (only one base currency), critical for all financial transactions, needs FK references | CRM, Procurement, Inventory, HR, All Financial Modules | **CRITICAL** | 002F.3C.2 |
| **Payment Terms** | Dedicated Table | `payment_terms` | Multi-attribute (due_days, advance_percentage, retention_percentage), business logic, heavily used in commercial documents (quotes, POs, invoices) | CRM, Procurement, Offers, Contracts | **CRITICAL** | 002F.3C.2 |
| **Payment Methods** | Lookup | `PAYMENT_METHODS` | Simple value list (CASH, CHEQUE, BANK_TRANSFER), no complex attributes, rarely changes, no FK references needed | CRM, Procurement, Finance, AR/AP | **HIGH** | 002F.3C.2 |
| **Tax Types** | Dedicated Table | `tax_types` | Multi-attribute (tax_rate, effective dates, applies_to flags, tax_treatment), UAE VAT compliance requirements, needs audit trail | CRM, Procurement, Inventory, Finance, Reporting | **CRITICAL** | 002F.3C.2 |
| **Tax Treatment Types** | Lookup | `TAX_TREATMENT_TYPES` | Simple classification (STANDARD_RATED, ZERO_RATED, EXEMPT, REVERSE_CHARGE), referenced by tax_types.tax_treatment_code | Tax Types, Finance, Reporting | **HIGH** | 002F.3C.2 |
| **Banks** | Dedicated Table | `banks` | Multi-attribute (country_id FK, swift_code, bank_type, website), international data, needs geography FK, used in multiple contexts | CRM, Procurement, HR, Finance, Payment Processing | **CRITICAL** | 002F.3C.2 |
| **Bank Account Types** | Lookup | `BANK_ACCOUNT_TYPES` | Simple type list (CURRENT, SAVINGS, LC_ACCOUNT), referenced by future bank_accounts table, minimal attributes | Finance, AR/AP, Cash Management | **MEDIUM** | 002F.3C.2 |
| **Bank Types** | Lookup | `BANK_TYPES` | Simple classification (COMMERCIAL, ISLAMIC, CENTRAL), referenced by banks.bank_type_code, minimal attributes | Banks, Reporting | **MEDIUM** | 002F.3C.2 |
| **Cost Centers** | Dedicated Table | `cost_centers` | Multi-attribute (hierarchy with parent_cost_center_id, owner_company_id, branch_id, type), reporting structure, future budget tracking possibility | Procurement, HR, Fleet, Workshop, Projects, Reporting | **HIGH** | 002F.3C.2 |
| **Profit Centers** | Dedicated Table | `profit_centers` | Multi-attribute (hierarchy with parent_profit_center_id, owner_company_id, branch_id, type), revenue tracking, future target management possibility | CRM, Projects, Services, Reporting | **HIGH** | 002F.3C.2 |
| **Cost Center Types** | Lookup | `COST_CENTER_TYPES` | Simple classification (DEPARTMENT, PROJECT, BRANCH), referenced by cost_centers.cost_center_type_code, minimal attributes | Cost Centers, Reporting | **MEDIUM** | 002F.3C.2 |
| **Profit Center Types** | Lookup | `PROFIT_CENTER_TYPES` | Simple classification (BUSINESS_UNIT, SERVICE_LINE), referenced by profit_centers.profit_center_type_code, minimal attributes | Profit Centers, Reporting | **MEDIUM** | 002F.3C.2 |
| **Commercial Term Types** | Optional (Not Recommended) | N/A | Redundant — payment_terms table already captures advance, retention, credit period | Future consideration | **LOW** | Deferred |
| **Retention Types** | Optional (Not Recommended) | N/A | Redundant — payment_terms.retention_percentage covers all retention scenarios | Future consideration | **LOW** | Deferred |
| **Advance Payment Types** | Optional (Not Recommended) | N/A | Redundant — payment_terms.advance_percentage covers all advance scenarios | Future consideration | **LOW** | Deferred |

**Decision Summary**:
- ✅ **6 Dedicated Tables**: currencies, payment_terms, tax_types, banks, cost_centers, profit_centers
- ✅ **6 Lookup Categories**: PAYMENT_METHODS, TAX_TREATMENT_TYPES, BANK_ACCOUNT_TYPES, BANK_TYPES, COST_CENTER_TYPES, PROFIT_CENTER_TYPES
- ❌ **3 Deferred/Not Recommended**: COMMERCIAL_TERM_TYPES, RETENTION_TYPES, ADVANCE_PAYMENT_TYPES (payment_terms table covers these use cases)

**Rationale for Dedicated Tables**:
- Multiple attributes beyond just name/label
- Business logic or constraints (e.g., one base currency)
- FK relationships to other tables
- Audit trail requirements
- Frequently referenced in transactions
- Future extensibility needs

**Rationale for Lookups**:
- Simple name/label values
- Minimal or no additional attributes
- Rarely change
- No FK references needed
- Already supported by global lookup engine

---

## 5. Database Schema Plan

### 5.1 Table: `currencies`

**Purpose**: Multi-currency master data for international operations, customer quotes, vendor POs, and future financial transactions.

**Migration File**: `supabase/migrations/20260606110000_erp_base_002f3c2_finance_basics_currencies.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.currencies (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  currency_code TEXT NOT NULL UNIQUE,  -- ISO 4217 code (AED, USD, EUR, GBP, SAR, etc.)
  currency_name_en TEXT NOT NULL,      -- English name: "UAE Dirham"
  currency_name_ar TEXT,                -- Arabic name: "درهم إماراتي"
  symbol TEXT NOT NULL,                 -- Currency symbol: "د.إ", "$", "€", "£", "﷼"
  
  -- Multi-Currency Configuration
  decimal_places INTEGER NOT NULL DEFAULT 2,  -- 2 for AED/USD, 3 for KWD/BHD/OMR
  is_base_currency BOOLEAN NOT NULL DEFAULT FALSE,  -- Only ONE currency can be true (system base)
  exchange_rate_placeholder NUMERIC(18, 6),  -- Future: store static rates (NOT in this phase)
  
  -- Reference & Classification
  notes TEXT,
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_currencies_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_currencies_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_currencies_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_currencies_code_format CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_currencies_decimal_places CHECK (decimal_places BETWEEN 0 AND 4),
  CONSTRAINT chk_currencies_unique_base CHECK (
    is_base_currency = FALSE OR 
    (SELECT COUNT(*) FROM public.currencies WHERE is_base_currency = TRUE AND id != currencies.id) = 0
  )
);

-- Index for fast lookups
CREATE INDEX idx_currencies_code ON public.currencies(currency_code);
CREATE INDEX idx_currencies_active ON public.currencies(is_active);
CREATE INDEX idx_currencies_base ON public.currencies(is_base_currency) WHERE is_base_currency = TRUE;
CREATE INDEX idx_currencies_sort ON public.currencies(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- RLS Policies (see section 9)
```

**Key Features**:
- ✅ ISO 4217 currency code enforcement (3 uppercase letters)
- ✅ Multi-currency decimal place support (KWD = 3, AED/USD = 2)
- ✅ Base currency constraint (only one currency can be base at a time)
- ✅ Future-ready: `exchange_rate_placeholder` column for future rate engine (not used in 002F.3C.2)
- ✅ Standard audit columns
- ✅ Lock/active/system flags

**Business Rules**:
1. **One Base Currency**: Only ONE currency can have `is_base_currency = TRUE`. This will be AED for this project.
2. **System Currency Protection**: AED will be marked `is_system = TRUE` and cannot be deleted.
3. **Code Uniqueness**: ISO 4217 codes must be unique and uppercase 3-letter format.
4. **Decimal Places**: KWD (Kuwaiti Dinar), BHD (Bahraini Dinar), OMR (Omani Rial) use 3 decimals; most others use 2.

**Seed Data** (section 16):
- AED (base currency, system record)
- USD
- EUR
- GBP
- SAR (Saudi Riyal)
- QAR (Qatari Riyal)
- OMR (Omani Rial)
- BHD (Bahraini Dinar)
- KWD (Kuwaiti Dinar)
- INR (Indian Rupee)

---

### 5.2 Table: `payment_terms`

**Purpose**: Commercial payment term definitions for customer quotes, purchase orders, contracts, and invoicing.

**Migration File**: `supabase/migrations/20260606110001_erp_base_002f3c2_finance_basics_payment_terms.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.payment_terms (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  term_code TEXT NOT NULL UNIQUE,     -- NET_30, ADVANCE_50_BALANCE_DELIVERY, CASH_ON_DELIVERY, etc.
  term_name_en TEXT NOT NULL,         -- "Net 30 Days"
  term_name_ar TEXT,                   -- "صافي 30 يوم"
  
  -- Payment Structure
  due_days INTEGER DEFAULT 0,          -- Days after invoice date (0 = immediate, 30 = NET_30, 60 = NET_60)
  advance_percentage NUMERIC(5, 2) DEFAULT 0,   -- Advance payment % (0-100): 50.00 = 50% advance
  retention_percentage NUMERIC(5, 2) DEFAULT 0,  -- Retention % (0-100): 10.00 = 10% retention
  
  -- Calculation Logic Notes
  calculation_notes TEXT,  -- Example: "50% advance + 40% on delivery + 10% retention for 30 days"
  
  -- Reference
  description_en TEXT,
  description_ar TEXT,
  notes TEXT,
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_payment_terms_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_payment_terms_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_payment_terms_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_payment_terms_code_format CHECK (term_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_payment_terms_due_days CHECK (due_days >= 0),
  CONSTRAINT chk_payment_terms_advance CHECK (advance_percentage BETWEEN 0 AND 100),
  CONSTRAINT chk_payment_terms_retention CHECK (retention_percentage BETWEEN 0 AND 100)
);

-- Indexes
CREATE INDEX idx_payment_terms_code ON public.payment_terms(term_code);
CREATE INDEX idx_payment_terms_active ON public.payment_terms(is_active);
CREATE INDEX idx_payment_terms_sort ON public.payment_terms(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payment_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;
```

**Key Features**:
- ✅ Due days for credit period (NET_30, NET_60, NET_90)
- ✅ Advance percentage for prepayment scenarios
- ✅ Retention percentage for holdback scenarios
- ✅ Calculation notes for complex payment structures
- ✅ Multi-language support

**Business Rules**:
1. **Due Days**: 0 = immediate payment (COD, CIA), 30 = NET_30, 60 = NET_60, etc.
2. **Advance %**: 0-100%, used for customer deposits or supplier advance payments.
3. **Retention %**: 0-100%, typically 5-10% held back for warranty or quality assurance.
4. **Complex Terms**: Use `calculation_notes` for multi-stage payments (e.g., "30% advance, 50% on delivery, 20% after 30 days").

**Seed Data Examples**:
- NET_0 (Immediate / Cash on Delivery)
- NET_7 (7 days)
- NET_15 (15 days)
- NET_30 (30 days)
- NET_45 (45 days)
- NET_60 (60 days)
- NET_90 (90 days)
- ADVANCE_50 (50% advance, 50% on delivery)
- ADVANCE_30_BALANCE_30DAYS (30% advance, 70% NET 30)
- ADVANCE_100 (100% prepayment)

---

### 5.3 Table: `tax_types`

**Purpose**: UAE VAT, RCM (Reverse Charge Mechanism), and tax rate definitions for pricing, invoicing, and UAE FTA compliance.

**Migration File**: `supabase/migrations/20260606110002_erp_base_002f3c2_finance_basics_tax_types.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.tax_types (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  tax_code TEXT NOT NULL UNIQUE,       -- VAT_5, VAT_ZERO, VAT_EXEMPT, RCM_SCRAP, etc.
  tax_name_en TEXT NOT NULL,           -- "UAE VAT 5%"
  tax_name_ar TEXT,                     -- "ضريبة القيمة المضافة 5%"
  
  -- Tax Configuration
  tax_rate NUMERIC(5, 2) NOT NULL,      -- 5.00 = 5%, 0.00 = zero-rated/exempt
  tax_treatment_code TEXT NOT NULL,     -- FK to global_lookup_values.value_code (STANDARD_RATED, ZERO_RATED, EXEMPT, REVERSE_CHARGE, OUT_OF_SCOPE)
  
  -- Applicability
  applies_to_sales BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to_purchases BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Effective Dates (UAE VAT changed from 5% to 15% in Saudi, future-proofing)
  effective_from DATE,
  effective_to DATE,
  
  -- Reference
  description_en TEXT,
  description_ar TEXT,
  notes TEXT,                           -- Notes for UAE FTA compliance, usage guidance
  fta_code TEXT,                        -- Future: UAE FTA classification code
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_tax_types_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_tax_types_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_tax_types_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_tax_types_code_format CHECK (tax_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_tax_types_rate_range CHECK (tax_rate BETWEEN 0 AND 100),
  CONSTRAINT chk_tax_types_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Indexes
CREATE INDEX idx_tax_types_code ON public.tax_types(tax_code);
CREATE INDEX idx_tax_types_treatment ON public.tax_types(tax_treatment_code);
CREATE INDEX idx_tax_types_active ON public.tax_types(is_active);
CREATE INDEX idx_tax_types_effective ON public.tax_types(effective_from, effective_to);
CREATE INDEX idx_tax_types_sort ON public.tax_types(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tax_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.tax_types ENABLE ROW LEVEL SECURITY;
```

**Key Features**:
- ✅ UAE VAT 5% standard rate
- ✅ Zero-rated (0% VAT charged but input VAT recoverable)
- ✅ Exempt (no VAT charged, no input VAT recovery)
- ✅ Out of scope (outside UAE VAT system)
- ✅ Reverse Charge Mechanism (RCM) for scrap trading
- ✅ Effective date range (future rate changes)
- ✅ Sales vs. purchase applicability flags

**Business Rules**:
1. **UAE VAT**: Current standard rate is 5% (effective 2018-01-01).
2. **Zero-Rated**: 0% tax rate but VAT registered entities can recover input VAT (exports, international transport).
3. **Exempt**: 0% tax rate, no input VAT recovery (residential property, local passenger transport, some financial services).
4. **RCM (Reverse Charge)**: For scrap trading, buyer accounts for VAT instead of seller.
5. **Out of Scope**: Transactions outside UAE or not subject to UAE VAT.

**Seed Data**:
- VAT_5 (Standard UAE VAT 5%)
- VAT_ZERO (Zero-rated supply)
- VAT_EXEMPT (Exempt supply)
- OUT_OF_SCOPE (Out of scope)
- RCM_SCRAP (Reverse charge for scrap metal)

---

### 5.4 Table: `banks`

**Purpose**: UAE and international bank master data for payment processing, customer/vendor bank accounts, employee salaries, and cash management.

**Migration File**: `supabase/migrations/20260606110003_erp_base_002f3c2_finance_basics_banks.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.banks (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  bank_code TEXT NOT NULL UNIQUE,      -- FAB, ENBD, ADCB, DIB, HSBC, etc.
  bank_name_en TEXT NOT NULL,          -- "First Abu Dhabi Bank"
  bank_name_ar TEXT,                    -- "بنك أبوظبي الأول"
  bank_short_name TEXT,                 -- "FAB", "ENBD", "ADCB"
  
  -- International Codes
  swift_code TEXT,                      -- SWIFT/BIC code (8 or 11 characters)
  country_id INTEGER NOT NULL,          -- FK to countries.id (UAE, US, UK, etc.)
  
  -- Classification
  bank_type_code TEXT,                  -- FK to global_lookup_values.value_code (COMMERCIAL, ISLAMIC, CENTRAL, EXCHANGE_HOUSE)
  
  -- Contact Information
  website_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address_en TEXT,
  address_ar TEXT,
  
  -- Reference
  notes TEXT,
  logo_url TEXT,                        -- Future: bank logo path
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_banks_country FOREIGN KEY (country_id) REFERENCES public.countries(id),
  CONSTRAINT fk_banks_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_banks_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_banks_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_banks_code_format CHECK (bank_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_banks_swift_format CHECK (swift_code IS NULL OR swift_code ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$')
);

-- Indexes
CREATE INDEX idx_banks_code ON public.banks(bank_code);
CREATE INDEX idx_banks_country ON public.banks(country_id);
CREATE INDEX idx_banks_swift ON public.banks(swift_code);
CREATE INDEX idx_banks_type ON public.banks(bank_type_code);
CREATE INDEX idx_banks_active ON public.banks(is_active);
CREATE INDEX idx_banks_sort ON public.banks(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.banks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
```

**Key Features**:
- ✅ SWIFT/BIC code validation (8 or 11 characters)
- ✅ Country FK to geography.countries
- ✅ Bank type classification (commercial, Islamic, central bank)
- ✅ Multi-language support
- ✅ Contact information

**Business Rules**:
1. **UAE Banks**: Major UAE banks will be seeded (FAB, ENBD, ADCB, DIB, Mashreq, etc.).
2. **International Banks**: Support for international banks (HSBC, Citibank, etc.).
3. **SWIFT Codes**: Format validation (4 letters + 2 letters + 2 alphanumeric + optional 3 alphanumeric).
4. **Country Association**: Every bank must belong to a country.

**Seed Data Examples**:
- FAB (First Abu Dhabi Bank) - SWIFT: NBADAEAA
- ENBD (Emirates NBD) - SWIFT: EBILAEAD
- ADCB (Abu Dhabi Commercial Bank) - SWIFT: ADCBAEAA
- DIB (Dubai Islamic Bank) - SWIFT: DUIBAEAA
- Mashreq Bank - SWIFT: BOMLAEAD
- HSBC UAE - SWIFT: BBMEAEAD

---

### 5.5 Table: `cost_centers`

**Purpose**: Cost allocation, expense tracking, reporting, and future budget management.

**Migration File**: `supabase/migrations/20260606110004_erp_base_002f3c2_finance_basics_cost_centers.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.cost_centers (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  cost_center_code TEXT NOT NULL UNIQUE,  -- DEPT_ADMIN, DEPT_WORKSHOP, PROJ_2024_001, VEH_FLEET_TRUCKS, etc.
  cost_center_name_en TEXT NOT NULL,       -- "Administration Department"
  cost_center_name_ar TEXT,                 -- "قسم الإدارة"
  
  -- Hierarchy
  parent_cost_center_id INTEGER,            -- Self-referencing FK for hierarchy (e.g., DEPT_WORKSHOP > WORKSHOP_WELDING)
  cost_center_type_code TEXT NOT NULL,      -- FK to global_lookup_values.value_code (DEPARTMENT, BRANCH, PROJECT, EQUIPMENT, WORKSHOP, FLEET, ADMIN)
  
  -- Multi-Company & Branch
  owner_company_id INTEGER,                 -- FK to owner_companies.id (optional: corporate-level cost centers may not belong to one company)
  branch_id INTEGER,                        -- FK to branches.id (optional: cost center may be branch-specific)
  
  -- Financial Planning (Future)
  budget_enabled BOOLEAN NOT NULL DEFAULT FALSE,  -- Future: enable budget tracking for this cost center
  
  -- Reference
  description_en TEXT,
  description_ar TEXT,
  notes TEXT,
  manager_user_id UUID,                     -- Future: responsible manager
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_cost_centers_parent FOREIGN KEY (parent_cost_center_id) REFERENCES public.cost_centers(id),
  CONSTRAINT fk_cost_centers_owner_company FOREIGN KEY (owner_company_id) REFERENCES public.owner_companies(id),
  CONSTRAINT fk_cost_centers_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT fk_cost_centers_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_cost_centers_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_cost_centers_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_cost_centers_manager FOREIGN KEY (manager_user_id) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_cost_centers_code_format CHECK (cost_center_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_cost_centers_no_self_parent CHECK (parent_cost_center_id IS NULL OR parent_cost_center_id != id)
);

-- Indexes
CREATE INDEX idx_cost_centers_code ON public.cost_centers(cost_center_code);
CREATE INDEX idx_cost_centers_parent ON public.cost_centers(parent_cost_center_id);
CREATE INDEX idx_cost_centers_type ON public.cost_centers(cost_center_type_code);
CREATE INDEX idx_cost_centers_company ON public.cost_centers(owner_company_id);
CREATE INDEX idx_cost_centers_branch ON public.cost_centers(branch_id);
CREATE INDEX idx_cost_centers_active ON public.cost_centers(is_active);
CREATE INDEX idx_cost_centers_sort ON public.cost_centers(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
```

**Key Features**:
- ✅ Hierarchical structure (parent-child relationships)
- ✅ Multi-company and branch association
- ✅ Cost center type classification
- ✅ Budget enablement flag (for future budget module)
- ✅ Manager assignment (future)

**Business Rules**:
1. **Hierarchy**: Cost centers can have parent cost centers (e.g., Administration → HR → Recruitment).
2. **Types**: DEPARTMENT, BRANCH, PROJECT, EQUIPMENT, WORKSHOP, FLEET, ADMIN.
3. **Company/Branch**: Optional — some cost centers are corporate-wide, others are branch-specific.
4. **Self-Parent Protection**: Cannot reference self as parent.

**Seed Data Examples**:
- DEPT_ADMIN (Administration Department)
- DEPT_OPERATIONS (Operations Department)
- DEPT_FINANCE (Finance Department)
- DEPT_WORKSHOP (Workshop Department)
- FLEET_TRUCKS (Truck Fleet)
- FLEET_EQUIPMENT (Heavy Equipment Fleet)
- PROJ_GENERAL (General Projects)

---

### 5.6 Table: `profit_centers`

**Purpose**: Revenue tracking, profit analysis, reporting, and future performance management.

**Migration File**: `supabase/migrations/20260606110005_erp_base_002f3c2_finance_basics_profit_centers.sql`

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS public.profit_centers (
  -- Primary Key
  id SERIAL PRIMARY KEY,
  
  -- Core Identity
  profit_center_code TEXT NOT NULL UNIQUE,  -- BU_SCRAP_TRADING, BU_DEMOLITION, SVC_EQUIPMENT_RENTAL, etc.
  profit_center_name_en TEXT NOT NULL,       -- "Scrap Trading Business Unit"
  profit_center_name_ar TEXT,                 -- "وحدة تجارة الخردة"
  
  -- Hierarchy
  parent_profit_center_id INTEGER,            -- Self-referencing FK for hierarchy
  profit_center_type_code TEXT NOT NULL,      -- FK to global_lookup_values.value_code (BUSINESS_UNIT, SERVICE_LINE, REVENUE_STREAM, PROJECT, BRANCH)
  
  -- Multi-Company & Branch
  owner_company_id INTEGER,                   -- FK to owner_companies.id
  branch_id INTEGER,                          -- FK to branches.id
  
  -- Financial Planning (Future)
  target_enabled BOOLEAN NOT NULL DEFAULT FALSE,  -- Future: enable revenue/profit targets
  
  -- Reference
  description_en TEXT,
  description_ar TEXT,
  notes TEXT,
  manager_user_id UUID,                       -- Future: responsible manager
  
  -- System Management
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  
  -- Audit & Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID,
  deactivated_reason TEXT,
  
  -- Foreign Keys
  CONSTRAINT fk_profit_centers_parent FOREIGN KEY (parent_profit_center_id) REFERENCES public.profit_centers(id),
  CONSTRAINT fk_profit_centers_owner_company FOREIGN KEY (owner_company_id) REFERENCES public.owner_companies(id),
  CONSTRAINT fk_profit_centers_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT fk_profit_centers_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT fk_profit_centers_updated_by FOREIGN KEY (updated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_profit_centers_deactivated_by FOREIGN KEY (deactivated_by) REFERENCES auth.users(id),
  CONSTRAINT fk_profit_centers_manager FOREIGN KEY (manager_user_id) REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT chk_profit_centers_code_format CHECK (profit_center_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_profit_centers_no_self_parent CHECK (parent_profit_center_id IS NULL OR parent_profit_center_id != id)
);

-- Indexes
CREATE INDEX idx_profit_centers_code ON public.profit_centers(profit_center_code);
CREATE INDEX idx_profit_centers_parent ON public.profit_centers(parent_profit_center_id);
CREATE INDEX idx_profit_centers_type ON public.profit_centers(profit_center_type_code);
CREATE INDEX idx_profit_centers_company ON public.profit_centers(owner_company_id);
CREATE INDEX idx_profit_centers_branch ON public.profit_centers(branch_id);
CREATE INDEX idx_profit_centers_active ON public.profit_centers(is_active);
CREATE INDEX idx_profit_centers_sort ON public.profit_centers(sort_order);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profit_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.profit_centers ENABLE ROW LEVEL SECURITY;
```

**Key Features**:
- ✅ Hierarchical structure
- ✅ Multi-company and branch association
- ✅ Profit center type classification
- ✅ Target enablement flag (for future performance management)
- ✅ Manager assignment (future)

**Business Rules**:
1. **Hierarchy**: Profit centers can have parent profit centers (e.g., Services → Equipment Rental → Crane Rental).
2. **Types**: BUSINESS_UNIT, SERVICE_LINE, REVENUE_STREAM, PROJECT, BRANCH.
3. **Company/Branch**: Optional — some profit centers are corporate-wide, others are branch-specific.

**Seed Data Examples**:
- BU_SCRAP_TRADING (Scrap Trading Business Unit)
- BU_DEMOLITION (Demolition Services Business Unit)
- SVC_EQUIPMENT_RENTAL (Equipment Rental Service Line)
- SVC_WORKSHOP_SERVICES (Workshop Services)
- REV_SCRAP_SALES (Scrap Sales Revenue Stream)

---

## 6. Lookup Categories and Seed Values

### 6.1 Lookup Category: `PAYMENT_METHODS`

**Purpose**: Payment method types for transactions (invoices, receipts, POs).

**Migration**: `supabase/migrations/20260606110010_erp_base_002f3c2_lookups_payment_methods.sql`

**Category Seed**:
```sql
INSERT INTO public.global_lookup_categories (
  category_code, category_name_en, category_name_ar, 
  module_code, scope, description_en, is_system
) VALUES (
  'PAYMENT_METHODS', 'Payment Methods', 'طرق الدفع',
  'finance_basics', 'GLOBAL', 'Methods of payment for commercial transactions', TRUE
) ON CONFLICT (category_code) DO NOTHING;
```

**Values**:
| Value Code | Name EN | Name AR | Sort | Color | Icon |
|------------|---------|---------|------|-------|------|
| CASH | Cash | نقدي | 1 | green | Banknote |
| CHEQUE | Cheque | شيك | 2 | blue | FileText |
| BANK_TRANSFER | Bank Transfer | تحويل بنكي | 3 | indigo | ArrowRightLeft |
| LETTER_OF_CREDIT | Letter of Credit (LC) | خطاب ائتمان | 4 | purple | ScrollText |
| POST_DATED_CHEQUE | Post-Dated Cheque (PDC) | شيك مؤجل | 5 | amber | CalendarClock |
| CREDIT_CARD | Credit Card | بطاقة ائتمان | 6 | rose | CreditCard |
| DEBIT_CARD | Debit Card | بطاقة خصم مباشر | 7 | pink | CreditCard |
| ONLINE_TRANSFER | Online Transfer | تحويل إلكتروني | 8 | cyan | Smartphone |
| DIRECT_DEBIT | Direct Debit | خصم مباشر | 9 | violet | RefreshCw |

---

### 6.2 Lookup Category: `TAX_TREATMENT_TYPES`

**Purpose**: Tax treatment classifications for tax_types table.

**Migration**: `supabase/migrations/20260606110011_erp_base_002f3c2_lookups_tax_treatment.sql`

**Category Seed**:
```sql
INSERT INTO public.global_lookup_categories (
  category_code, category_name_en, category_name_ar, 
  module_code, scope, description_en, is_system
) VALUES (
  'TAX_TREATMENT_TYPES', 'Tax Treatment Types', 'أنواع المعاملة الضريبية',
  'finance_basics', 'GLOBAL', 'UAE VAT tax treatment classifications', TRUE
) ON CONFLICT (category_code) DO NOTHING;
```

**Values**:
| Value Code | Name EN | Name AR | Sort | Color |
|------------|---------|---------|------|-------|
| STANDARD_RATED | Standard Rated | معياري | 1 | blue |
| ZERO_RATED | Zero Rated | صفري | 2 | green |
| EXEMPT | Exempt | معفي | 3 | gray |
| OUT_OF_SCOPE | Out of Scope | خارج النطاق | 4 | slate |
| REVERSE_CHARGE | Reverse Charge Mechanism | آلية الاحتساب العكسي | 5 | amber |

---

### 6.3 Lookup Category: `BANK_ACCOUNT_TYPES`

**Purpose**: Bank account type classifications (for future bank_accounts table).

**Migration**: `supabase/migrations/20260606110012_erp_base_002f3c2_lookups_bank_account_types.sql`

**Values**:
| Value Code | Name EN | Name AR | Sort |
|------------|---------|---------|------|
| CURRENT | Current Account | حساب جاري | 1 |
| SAVINGS | Savings Account | حساب توفير | 2 |
| CALL_ACCOUNT | Call Account | حساب استدعاء | 3 |
| LC_ACCOUNT | LC Account | حساب خطاب ائتمان | 4 |
| GUARANTEE_ACCOUNT | Guarantee Account | حساب ضمان | 5 |

---

### 6.4 Lookup Category: `BANK_TYPES`

**Purpose**: Bank institution type classifications.

**Migration**: `supabase/migrations/20260606110013_erp_base_002f3c2_lookups_bank_types.sql`

**Values**:
| Value Code | Name EN | Name AR | Sort |
|------------|---------|---------|------|
| COMMERCIAL | Commercial Bank | بنك تجاري | 1 |
| ISLAMIC | Islamic Bank | بنك إسلامي | 2 |
| CENTRAL_BANK | Central Bank | بنك مركزي | 3 |
| EXCHANGE_HOUSE | Exchange House | صراف | 4 |
| FINANCE_COMPANY | Finance Company | شركة تمويل | 5 |

---

### 6.5 Lookup Category: `COST_CENTER_TYPES`

**Purpose**: Cost center type classifications.

**Migration**: `supabase/migrations/20260606110014_erp_base_002f3c2_lookups_cost_center_types.sql`

**Values**:
| Value Code | Name EN | Name AR | Sort |
|------------|---------|---------|------|
| DEPARTMENT | Department | قسم | 1 |
| BRANCH | Branch | فرع | 2 |
| PROJECT | Project | مشروع | 3 |
| EQUIPMENT | Equipment | معدات | 4 |
| WORKSHOP | Workshop | ورشة | 5 |
| FLEET | Fleet | أسطول | 6 |
| ADMIN | Administration | إدارة | 7 |

---

### 6.6 Lookup Category: `PROFIT_CENTER_TYPES`

**Purpose**: Profit center type classifications.

**Migration**: `supabase/migrations/20260606110015_erp_base_002f3c2_lookups_profit_center_types.sql`

**Values**:
| Value Code | Name EN | Name AR | Sort |
|------------|---------|---------|------|
| BUSINESS_UNIT | Business Unit | وحدة أعمال | 1 |
| SERVICE_LINE | Service Line | خط خدمة | 2 |
| REVENUE_STREAM | Revenue Stream | مصدر إيرادات | 3 |
| PROJECT | Project | مشروع | 4 |
| BRANCH | Branch | فرع | 5 |

---

## 7. UAE VAT and RCM Compatibility Plan

### 7.1 UAE VAT Overview

**Current Rate**: 5% (effective 2018-01-01)  
**Governing Authority**: UAE Federal Tax Authority (FTA)  
**Scope**: Goods and services supplied in UAE

**Tax Treatment Categories** (seeded in 002F.3C.2):

1. **Standard Rated (5% VAT)**:
   - Most goods and services
   - Output VAT charged on sales
   - Input VAT recoverable on purchases
   - **Example**: Workshop services, equipment rental, non-food retail

2. **Zero Rated (0% VAT)**:
   - Exports outside GCC
   - International transport
   - Certain food items
   - Certain medicines
   - **Input VAT Recoverable**: Yes (key difference vs. exempt)
   - **Example**: Scrap export sales

3. **Exempt**:
   - Residential property (sale/rent)
   - Local passenger transport
   - Bare land
   - Certain financial services
   - **Input VAT Recoverable**: No
   - **Example**: Renting residential accommodation

4. **Out of Scope**:
   - Transactions outside UAE
   - Non-business transactions
   - **Example**: Overseas operations, personal transactions

5. **Reverse Charge Mechanism (RCM)**:
   - Specific supplies where buyer accounts for VAT instead of seller
   - **002F.3C.2 Relevance**: Scrap metal trading
   - Seller issues tax invoice with 0% and "Subject to reverse charge"
   - Buyer self-accounts VAT (both output and input, typically net-zero effect if VAT registered)

### 7.2 RCM for Scrap Trading

**Business Context**: AGT ERP deals with scrap trading — copper, aluminum, iron, steel, etc.

**UAE VAT Rule**: **Scrap metal sales are subject to Reverse Charge Mechanism (RCM)**.

**Implementation in 002F.3C.2**:

**Seed Tax Type**: `RCM_SCRAP`
```sql
INSERT INTO public.tax_types (
  tax_code, tax_name_en, tax_name_ar, 
  tax_rate, tax_treatment_code, 
  applies_to_sales, applies_to_purchases, 
  effective_from, description_en, is_system
) VALUES (
  'RCM_SCRAP', 
  'Reverse Charge - Scrap Metal', 
  'الاحتساب العكسي - خردة معدنية', 
  0.00, 
  'REVERSE_CHARGE', 
  TRUE, 
  TRUE, 
  '2018-01-01', 
  'UAE RCM for scrap metal trading. Buyer self-accounts VAT.', 
  TRUE
);
```

**Usage**:
- **Scrap Sales Invoice**: Use `RCM_SCRAP` tax type → 0% VAT charged, note "Subject to reverse charge" on invoice
- **Scrap Purchase Invoice**: If supplier uses RCM, buyer must account for VAT (future accounting module)
- **Reporting**: Separate line on UAE VAT return for RCM supplies

**Future Phase** (NOT 002F.3C.2):
- Accounting module will handle RCM journal entries
- VAT return reporting will include RCM boxes
- FTA API integration for e-filing

### 7.3 Tax Type Usage Matrix

| Scenario | Tax Type | Tax Rate | Input VAT Recovery | Invoice Note |
|----------|----------|----------|---------------------|--------------|
| Workshop service to UAE customer | VAT_5 | 5% | Yes (for registered entity) | Standard VAT invoice |
| Equipment rental to UAE customer | VAT_5 | 5% | Yes | Standard VAT invoice |
| Scrap sale to UAE customer | RCM_SCRAP | 0% | N/A (RCM) | "Subject to reverse charge" |
| Export scrap outside GCC | VAT_ZERO | 0% | Yes | Zero-rated export |
| Residential rent (landlord) | VAT_EXEMPT | 0% | No | Exempt supply |
| International service (outside UAE) | OUT_OF_SCOPE | 0% | No | Out of scope |

### 7.4 Future VAT Compliance (NOT in 002F.3C.2)

The following will be implemented in future accounting/reporting phases:

❌ **NOT in 002F.3C.2**:
- VAT return generation
- Box 1-16 calculations
- FTA portal API integration
- E-invoicing integration
- Input VAT ledger
- Output VAT ledger
- VAT reconciliation
- VAT payment processing
- Automatic reverse charge posting
- VAT audit trail reports

✅ **002F.3C.2 Provides**:
- Tax type master data (foundation)
- Tax rate definitions
- Tax treatment classifications
- RCM support data structure
- Ready for future transactional use

---

## 8. Permissions and Role Assignments

### 8.1 Permission Structure

Following the geography module pattern (`master_data.geography.*`), Finance Basics will use:

**Module Code**: `master_data`  
**Feature Code**: `finance_basics`

**Permissions**:
1. `master_data.finance_basics.view` — View all finance basics master data
2. `master_data.finance_basics.manage` — Create, edit, activate/deactivate finance basics records
3. `master_data.finance_basics.export` — Export finance basics data to Excel/CSV
4. `master_data.finance_basics.audit_view` — View audit logs for finance basics changes

### 8.2 Permission Seeds

**Migration**: `supabase/migrations/20260606110020_erp_base_002f3c2_permissions.sql`

```sql
-- Insert permissions
INSERT INTO public.permissions (
  permission_code, module_code, permission_name_en, permission_type, description_en, created_by
) VALUES
  ('master_data.finance_basics.view', 'master_data', 'View Finance Basics', 'view', 'View currencies, payment terms, tax types, banks, cost centers, profit centers', (SELECT id FROM auth.users LIMIT 1)),
  ('master_data.finance_basics.manage', 'master_data', 'Manage Finance Basics', 'manage', 'Create, edit, activate/deactivate finance basics master data', (SELECT id FROM auth.users LIMIT 1)),
  ('master_data.finance_basics.export', 'master_data', 'Export Finance Basics', 'export', 'Export finance basics data to Excel/CSV', (SELECT id FROM auth.users LIMIT 1)),
  ('master_data.finance_basics.audit_view', 'master_data', 'View Finance Basics Audit Logs', 'audit_view', 'View audit trail for finance basics changes', (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT (permission_code) DO NOTHING;
```

### 8.3 Role Assignments

**Migration**: Same file as above

```sql
-- Assign permissions to roles
-- system_admin: All permissions (already has implicit full access, but explicit is good for audit)
INSERT INTO public.role_permissions (role_id, permission_id, created_by)
SELECT 
  r.id AS role_id,
  p.id AS permission_id,
  (SELECT id FROM auth.users LIMIT 1) AS created_by
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'master_data.finance_basics.%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- group_admin: view, manage, export, audit_view
INSERT INTO public.role_permissions (role_id, permission_id, created_by)
SELECT 
  r.id AS role_id,
  p.id AS permission_id,
  (SELECT id FROM auth.users LIMIT 1) AS created_by
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'master_data.finance_basics.view',
    'master_data.finance_basics.manage',
    'master_data.finance_basics.export',
    'master_data.finance_basics.audit_view'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- company_admin: view, export
INSERT INTO public.role_permissions (role_id, permission_id, created_by)
SELECT 
  r.id AS role_id,
  p.id AS permission_id,
  (SELECT id FROM auth.users LIMIT 1) AS created_by
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'company_admin'
  AND p.permission_code IN (
    'master_data.finance_basics.view',
    'master_data.finance_basics.export'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- branch_admin: view only
INSERT INTO public.role_permissions (role_id, permission_id, created_by)
SELECT 
  r.id AS role_id,
  p.id AS permission_id,
  (SELECT id FROM auth.users LIMIT 1) AS created_by
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'branch_admin'
  AND p.permission_code = 'master_data.finance_basics.view'
ON CONFLICT (role_id, permission_id) DO NOTHING;
```

### 8.4 Permission Usage in Application

**Server Actions**:
```typescript
// src/features/master-data/finance-basics/actions.ts
export async function getCurrencies() {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.finance_basics.view')) {
    throw new Error('Insufficient permissions');
  }
  // ... fetch logic
}

export async function createCurrency(data: CreateCurrencyInput) {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.finance_basics.manage')) {
    throw new Error('Insufficient permissions');
  }
  // ... create logic
}
```

**UI Components**:
```typescript
// Check permission before showing "Add" button
const authContext = await getAuthContext();
const canManage = hasPermission(authContext, 'master_data.finance_basics.manage');

{canManage && (
  <ERPAddButton onClick={() => setDialogOpen(true)} />
)}
```

---

## 9. RLS Policies

All 6 finance basics tables will follow the geography module RLS pattern exactly.

### 9.1 RLS Policy Pattern

**Enable RLS**:
```sql
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
```

**SELECT Policy** (view permission):
```sql
CREATE POLICY "currencies_select_policy" ON public.currencies
  FOR SELECT
  USING (
    current_user_has_permission('master_data.finance_basics.view')
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role_code = 'system_admin')
  );
```

**INSERT Policy** (manage permission):
```sql
CREATE POLICY "currencies_insert_policy" ON public.currencies
  FOR INSERT
  WITH CHECK (
    current_user_has_permission('master_data.finance_basics.manage')
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role_code = 'system_admin')
  );
```

**UPDATE Policy** (manage permission + locked check):
```sql
CREATE POLICY "currencies_update_policy" ON public.currencies
  FOR UPDATE
  USING (
    (current_user_has_permission('master_data.finance_basics.manage') AND is_locked = FALSE)
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role_code = 'system_admin')
  )
  WITH CHECK (
    (current_user_has_permission('master_data.finance_basics.manage') AND is_locked = FALSE)
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role_code = 'system_admin')
  );
```

**DELETE Policy** (system_admin only):
```sql
CREATE POLICY "currencies_delete_policy" ON public.currencies
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = auth.uid() AND role_code = 'system_admin')
  );
```

### 9.2 RLS Policies for All Tables

Apply identical pattern to:
- ✅ `currencies`
- ✅ `payment_terms`
- ✅ `tax_types`
- ✅ `banks`
- ✅ `cost_centers`
- ✅ `profit_centers`

**Key Points**:
1. **system_admin bypass**: system_admin role bypasses all restrictions (view, manage, lock, delete)
2. **Locked rows**: Non-admin users cannot update locked rows
3. **Delete restriction**: Only system_admin can delete records
4. **View permission**: Required for all users to see data
5. **Manage permission**: Required to create/edit (unless system_admin)

---

## 10. Global Admin (system_admin) Full Access

### 10.1 System Admin Capabilities

**Role Code**: `system_admin`

**Full Access**:
- ✅ View all records (active and inactive)
- ✅ Create new records
- ✅ Edit any record (including locked records)
- ✅ Delete any record (including system records, if absolutely necessary)
- ✅ Lock/unlock records
- ✅ Activate/deactivate records
- ✅ Edit system records (with caution)
- ✅ Bypass RLS policies

### 10.2 Lock/Unlock UI Logic

Following geography pattern:

**Lock Button Visibility**:
```typescript
const authContext = await getAuthContext();
const isSystemAdmin = authContext.user.role_code === 'system_admin';

// Show lock/unlock button ONLY to system_admin
{isSystemAdmin && (
  <DropdownMenuItem onClick={() => handleToggleLock(row.original)}>
    {row.original.is_locked ? <UnlockIcon /> : <LockIcon />}
    {row.original.is_locked ? "Unlock" : "Lock"}
  </DropdownMenuItem>
)}
```

**Delete Button Visibility**:
```typescript
// Show delete button ONLY to system_admin
{isSystemAdmin && (
  <DropdownMenuItem onClick={() => handleDelete(row.original)} className="text-destructive">
    <TrashIcon /> Delete
  </DropdownMenuItem>
)}
```

**Edit Locked Records**:
- Non-admin users: Cannot edit locked records (form disabled, or edit action blocked by RLS)
- System admin: Can edit locked records

### 10.3 System Record Protection

**is_system = TRUE**:
- Indicates record is critical to system operation (e.g., AED base currency, VAT_5 tax type)
- UI should show a badge or warning when viewing/editing system records
- System admin can edit, but should be cautious
- System admin can delete (but really shouldn't for critical records like AED)

**Best Practice**:
- System records should be locked (`is_locked = TRUE`) to prevent accidental edits
- System admin must unlock before editing

---

## 11. Audit Logging Strategy

### 11.1 Audit Events

All CRUD + status + lock operations will be audited for all 6 tables.

**Audit Actions**:
- `create` — New record created
- `update` — Record updated (includes diff of changes)
- `delete` — Record deleted (soft or hard)
- `activate` — Record activated (`is_active` TRUE)
- `deactivate` — Record deactivated (`is_active` FALSE)
- `lock` — Record locked (`is_locked` TRUE)
- `unlock` — Record unlocked (`is_locked` FALSE)

### 11.2 Audit Implementation Pattern

**Server Action Example** (create):
```typescript
export async function createCurrency(data: CreateCurrencyInput) {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.finance_basics.manage')) {
    throw new Error('Insufficient permissions');
  }

  const validated = createCurrencySchema.parse(data);
  const supabase = createClient();

  const { data: newCurrency, error } = await supabase
    .from('currencies')
    .insert({ ...validated, created_by: authContext.user.id })
    .select()
    .single();

  if (error) throw error;

  // Audit log
  await logAudit({
    module_code: 'master_data',
    entity_name: 'currencies',
    entity_id: newCurrency.id,
    entity_reference: newCurrency.currency_code,
    action: 'create',
    new_values: newCurrency,
  });

  revalidatePath('/admin/master-data/finance-basics/currencies');
  return newCurrency;
}
```

**Server Action Example** (update with diff):
```typescript
export async function updateCurrency(id: number, data: UpdateCurrencyInput) {
  const authContext = await getAuthContext();
  if (!hasPermission(authContext, 'master_data.finance_basics.manage')) {
    throw new Error('Insufficient permissions');
  }

  const validated = updateCurrencySchema.parse(data);
  const supabase = createClient();

  // Fetch old values for diff
  const { data: oldCurrency } = await supabase
    .from('currencies')
    .select('*')
    .eq('id', id)
    .single();

  const { data: updated, error } = await supabase
    .from('currencies')
    .update({ ...validated, updated_by: authContext.user.id })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Audit log with diff
  const diff = createAuditDiff(oldCurrency, updated);
  await logAudit({
    module_code: 'master_data',
    entity_name: 'currencies',
    entity_id: updated.id,
    entity_reference: updated.currency_code,
    action: 'update',
    old_values: oldCurrency,
    new_values: updated,
  });

  revalidatePath('/admin/master-data/finance-basics/currencies');
  return updated;
}
```

### 11.3 Audit Viewing

**Permission**: `master_data.finance_basics.audit_view`

**Future UI** (not in 002F.3C.2 initial scope, but data structure ready):
- Audit log viewer page
- Filter by entity, action, user, date range
- Show diff highlights for updates

---

## 12. Server Actions Plan

### 12.1 File Structure

```
src/features/master-data/finance-basics/
├── actions.ts              # All server actions for 6 tables
├── types.ts                # TypeScript interfaces
├── validation.ts           # Zod schemas
├── hooks/
│   ├── use-currencies.ts
│   ├── use-payment-terms.ts
│   ├── use-tax-types.ts
│   ├── use-banks.ts
│   ├── use-cost-centers.ts
│   └── use-profit-centers.ts
└── components/
    ├── currency-form-dialog.tsx
    ├── currency-table.tsx
    ├── payment-term-form-dialog.tsx
    ├── payment-term-table.tsx
    ├── tax-type-form-dialog.tsx
    ├── tax-type-table.tsx
    ├── bank-form-dialog.tsx
    ├── bank-table.tsx
    ├── cost-center-form-dialog.tsx
    ├── cost-center-table.tsx
    ├── profit-center-form-dialog.tsx
    └── profit-center-table.tsx
```

### 12.2 Server Actions per Table

**Pattern** (apply to all 6 tables):

1. **getCurrencies()** — List all currencies (with filters)
2. **getCurrencyById(id)** — Get single currency
3. **createCurrency(data)** — Create new currency
4. **updateCurrency(id, data)** — Update currency
5. **deleteCurrency(id)** — Delete currency (system_admin only)
6. **toggleCurrencyStatus(id)** — Activate/deactivate
7. **toggleCurrencyLock(id)** — Lock/unlock (system_admin only)
8. **exportCurrencies()** — Export to Excel/CSV

**Total Actions**: 8 actions × 6 tables = **48 server actions**

### 12.3 Action Naming Convention

| Table | Prefix |
|-------|--------|
| currencies | `Currency` / `Currencies` |
| payment_terms | `PaymentTerm` / `PaymentTerms` |
| tax_types | `TaxType` / `TaxTypes` |
| banks | `Bank` / `Banks` |
| cost_centers | `CostCenter` / `CostCenters` |
| profit_centers | `ProfitCenter` / `ProfitCenters` |

**Example**:
- `getCurrencies()`
- `createPaymentTerm()`
- `updateTaxType()`
- `deletBank()`
- `toggleCostCenterStatus()`
- `exportProfitCenters()`

---

## 13. Validation Schemas (Zod)

### 13.1 Currency Schemas

**File**: `src/features/master-data/finance-basics/validation.ts`

```typescript
import { z } from 'zod';

export const createCurrencySchema = z.object({
  currency_code: z.string().regex(/^[A-Z]{3}$/, 'Must be 3 uppercase letters (ISO 4217)'),
  currency_name_en: z.string().min(1, 'Required'),
  currency_name_ar: z.string().optional(),
  symbol: z.string().min(1, 'Required'),
  decimal_places: z.number().int().min(0).max(4),
  is_base_currency: z.boolean().default(false),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateCurrencySchema = createCurrencySchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

### 13.2 Payment Term Schemas

```typescript
export const createPaymentTermSchema = z.object({
  term_code: z.string().regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  term_name_en: z.string().min(1, 'Required'),
  term_name_ar: z.string().optional(),
  due_days: z.number().int().min(0),
  advance_percentage: z.number().min(0).max(100),
  retention_percentage: z.number().min(0).max(100),
  calculation_notes: z.string().optional(),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updatePaymentTermSchema = createPaymentTermSchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

### 13.3 Tax Type Schemas

```typescript
export const createTaxTypeSchema = z.object({
  tax_code: z.string().regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  tax_name_en: z.string().min(1, 'Required'),
  tax_name_ar: z.string().optional(),
  tax_rate: z.number().min(0).max(100),
  tax_treatment_code: z.string().min(1, 'Required'), // FK to lookup
  applies_to_sales: z.boolean().default(true),
  applies_to_purchases: z.boolean().default(true),
  effective_from: z.string().optional(), // Date string
  effective_to: z.string().optional(),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  notes: z.string().optional(),
  fta_code: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateTaxTypeSchema = createTaxTypeSchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

### 13.4 Bank Schemas

```typescript
export const createBankSchema = z.object({
  bank_code: z.string().regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  bank_name_en: z.string().min(1, 'Required'),
  bank_name_ar: z.string().optional(),
  bank_short_name: z.string().optional(),
  swift_code: z.string().regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid SWIFT/BIC format').optional(),
  country_id: z.number().int().positive('Required'),
  bank_type_code: z.string().optional(), // FK to lookup
  website_url: z.string().url().optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  address_en: z.string().optional(),
  address_ar: z.string().optional(),
  notes: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateBankSchema = createBankSchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

### 13.5 Cost Center Schemas

```typescript
export const createCostCenterSchema = z.object({
  cost_center_code: z.string().regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  cost_center_name_en: z.string().min(1, 'Required'),
  cost_center_name_ar: z.string().optional(),
  parent_cost_center_id: z.number().int().positive().optional(),
  cost_center_type_code: z.string().min(1, 'Required'), // FK to lookup
  owner_company_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
  budget_enabled: z.boolean().default(false),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  notes: z.string().optional(),
  manager_user_id: z.string().uuid().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateCostCenterSchema = createCostCenterSchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

### 13.6 Profit Center Schemas

```typescript
export const createProfitCenterSchema = z.object({
  profit_center_code: z.string().regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only'),
  profit_center_name_en: z.string().min(1, 'Required'),
  profit_center_name_ar: z.string().optional(),
  parent_profit_center_id: z.number().int().positive().optional(),
  profit_center_type_code: z.string().min(1, 'Required'), // FK to lookup
  owner_company_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
  target_enabled: z.boolean().default(false),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  notes: z.string().optional(),
  manager_user_id: z.string().uuid().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateProfitCenterSchema = createProfitCenterSchema.partial().extend({
  is_locked: z.boolean().optional(),
});
```

---

## 14. UI / Screen Plans

### 14.1 Page Structure

**URL Pattern**: `/admin/master-data/finance-basics/{entity}`

**Pages** (6 total):
1. `/admin/master-data/finance-basics/currencies`
2. `/admin/master-data/finance-basics/payment-terms`
3. `/admin/master-data/finance-basics/tax-types`
4. `/admin/master-data/finance-basics/banks`
5. `/admin/master-data/finance-basics/cost-centers`
6. `/admin/master-data/finance-basics/profit-centers`

### 14.2 Page Component Pattern

**File**: `src/app/(protected)/admin/master-data/finance-basics/currencies/page.tsx`

```typescript
import { Metadata } from 'next';
import { ERPPageHeader } from '@/components/erp/layouts/erp-page-header';
import { CurrenciesTable } from '@/features/master-data/finance-basics/components/currencies-table';
import { getCurrencies } from '@/features/master-data/finance-basics/actions';
import { getAuthContext, hasPermission } from '@/server/actions/auth';

export const metadata: Metadata = {
  title: 'Currencies | Finance Basics | Master Data',
  description: 'Manage multi-currency master data',
};

export default async function CurrenciesPage() {
  const authContext = await getAuthContext();
  const canView = hasPermission(authContext, 'master_data.finance_basics.view');
  
  if (!canView) {
    return <div>Access Denied</div>;
  }

  const currencies = await getCurrencies();

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="Currencies"
        description="Manage multi-currency master data for international operations"
        breadcrumbs={[
          { label: 'Master Data', href: '/admin/master-data' },
          { label: 'Finance Basics', href: '/admin/master-data/finance-basics' },
          { label: 'Currencies' },
        ]}
      />
      <CurrenciesTable data={currencies} />
    </div>
  );
}
```

### 14.3 Table Component Pattern

**File**: `src/features/master-data/finance-basics/components/currencies-table.tsx`

**Structure**:
- Client component (`"use client"`)
- `ERPDataTable` wrapper
- Column definitions with `ColumnDef<Currency>`
- Row actions: View, Edit, Delete (system_admin), Lock/Unlock (system_admin), Activate/Deactivate
- Add button (permission check: `master_data.finance_basics.manage`)
- Export menu (permission check: `master_data.finance_basics.export`)
- Filters: search, active/inactive, currency type (base/non-base)
- Status badges: system record, locked, active/inactive, base currency

**Key Columns**:
1. Currency Code (primary identifier)
2. Currency Name (EN)
3. Symbol
4. Decimal Places
5. Base Currency (badge if true)
6. Active Status
7. System/Locked indicators
8. Actions

### 14.4 Form Dialog Pattern

**File**: `src/features/master-data/finance-basics/components/currency-form-dialog.tsx`

**Structure**:
- Client component (`"use client"`)
- Props: `currency`, `mode` (add/edit/view), `open`, `onOpenChange`
- `ERPDrawerForm` wrapper
- Sections: Basic Information, Configuration, Status
- Fields:
  - Currency Code (disabled in edit mode)
  - Currency Name EN/AR
  - Symbol
  - Decimal Places (number input, 0-4)
  - Is Base Currency (checkbox with warning if changing)
  - Notes
  - Active/Locked (status section, system_admin only for locked)
  - Sort Order
- Form submission with `createCurrency` or `updateCurrency` server action
- Toast notifications (success/error)
- Revalidation trigger

### 14.5 Form Sections

**Example: Currency Form**

**Section 1: Basic Information**
- Currency Code*
- Currency Name (EN)*
- Currency Name (AR)
- Symbol*

**Section 2: Configuration**
- Decimal Places* (0-4)
- Is Base Currency (checkbox)
- Sort Order

**Section 3: Notes & Status**
- Notes (textarea)
- Active (toggle, if editing)
- Locked (toggle, system_admin only, if editing)

**Validation**:
- Required fields marked with *
- Real-time validation with Zod
- Error messages displayed inline

---

## 15. Select Components Plan

### 15.1 Component List

**Location**: `src/components/erp/finance-basics/`

**Files**:
1. `currency-select.tsx` — Currency dropdown
2. `payment-term-select.tsx` — Payment term dropdown
3. `tax-type-select.tsx` — Tax type dropdown
4. `bank-select.tsx` — Bank dropdown
5. `cost-center-select.tsx` — Cost center dropdown (with hierarchy support)
6. `profit-center-select.tsx` — Profit center dropdown (with hierarchy support)

### 15.2 Component Pattern

**File**: `src/components/erp/finance-basics/currency-select.tsx`

```typescript
"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface CurrencySelectProps {
  value: number | null;
  onValueChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  includeInactive?: boolean;
  showSymbol?: boolean;
  onlyBaseCurrency?: boolean;
}

export function CurrencySelect({
  value,
  onValueChange,
  placeholder = "Select currency",
  disabled = false,
  required = false,
  className,
  error,
  includeInactive = false,
  showSymbol = true,
  onlyBaseCurrency = false,
}: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrencies() {
      try {
        const supabase = createClient();
        let query = supabase.from('currencies').select('*').order('sort_order', { ascending: true });

        if (!includeInactive) {
          query = query.eq('is_active', true);
        }

        if (onlyBaseCurrency) {
          query = query.eq('is_base_currency', true);
        }

        const { data, error } = await query;

        if (error) throw error;
        setCurrencies(data || []);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load currencies');
      } finally {
        setLoading(false);
      }
    }

    fetchCurrencies();
  }, [includeInactive, onlyBaseCurrency]);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading currencies...</span>
      </div>
    );
  }

  if (errorMsg) {
    return <div className="text-sm text-destructive">{errorMsg}</div>;
  }

  const selectedCurrency = currencies.find(c => c.id === value);
  const displayValue = selectedCurrency 
    ? `${selectedCurrency.currency_code}${showSymbol ? ` (${selectedCurrency.symbol})` : ''}`
    : undefined;

  return (
    <div className={className}>
      <Select
        value={value?.toString() || ""}
        onValueChange={(val) => onValueChange(val ? parseInt(val) : null)}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger className={error ? "border-destructive" : ""}>
          <SelectValue placeholder={placeholder}>
            {displayValue || placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {currencies.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">No currencies available</div>
          ) : (
            currencies.map((currency) => (
              <SelectItem key={currency.id} value={currency.id.toString()}>
                {currency.currency_code} {showSymbol && `(${currency.symbol})`} — {currency.currency_name_en}
                {currency.is_base_currency && <span className="ml-2 text-xs text-blue-600">[BASE]</span>}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

### 15.3 Hierarchy Support (Cost/Profit Centers)

**Challenge**: Cost centers and profit centers have parent-child relationships.

**Solution**:
- Fetch all records
- Build tree structure client-side
- Display with indentation in dropdown
- Or use a tree-select component (e.g., from Ant Design, or custom)

**Simple Approach** (flat list with indentation):
```typescript
// Render with indentation based on depth
{costCenters.map((cc) => (
  <SelectItem key={cc.id} value={cc.id.toString()}>
    {'\u00A0'.repeat(cc.depth * 4)}{cc.cost_center_code} — {cc.cost_center_name_en}
  </SelectItem>
))}
```

---

## 16. Seed Data Plan

### 16.1 Currencies Seed Data

**Migration**: `supabase/migrations/20260606110050_erp_base_002f3c2_seed_currencies.sql`

```sql
INSERT INTO public.currencies (
  currency_code, currency_name_en, currency_name_ar, symbol, decimal_places, is_base_currency, is_system, is_locked, is_active, sort_order
) VALUES
  ('AED', 'UAE Dirham', 'درهم إماراتي', 'د.إ', 2, TRUE, TRUE, TRUE, TRUE, 1),
  ('USD', 'US Dollar', 'دولار أمريكي', '$', 2, FALSE, FALSE, FALSE, TRUE, 2),
  ('EUR', 'Euro', 'يورو', '€', 2, FALSE, FALSE, FALSE, TRUE, 3),
  ('GBP', 'British Pound', 'جنيه إسترليني', '£', 2, FALSE, FALSE, FALSE, TRUE, 4),
  ('SAR', 'Saudi Riyal', 'ريال سعودي', '﷼', 2, FALSE, FALSE, FALSE, TRUE, 5),
  ('QAR', 'Qatari Riyal', 'ريال قطري', 'ر.ق', 2, FALSE, FALSE, FALSE, TRUE, 6),
  ('OMR', 'Omani Rial', 'ريال عماني', 'ر.ع.', 3, FALSE, FALSE, FALSE, TRUE, 7),
  ('BHD', 'Bahraini Dinar', 'دينار بحريني', 'د.ب', 3, FALSE, FALSE, FALSE, TRUE, 8),
  ('KWD', 'Kuwaiti Dinar', 'دينار كويتي', 'د.ك', 3, FALSE, FALSE, FALSE, TRUE, 9),
  ('INR', 'Indian Rupee', 'روبية هندية', '₹', 2, FALSE, FALSE, FALSE, TRUE, 10)
ON CONFLICT (currency_code) DO NOTHING;
```

**Key Notes**:
- AED is base currency (`is_base_currency = TRUE`)
- AED is system record and locked
- KWD, BHD, OMR use 3 decimal places
- All others use 2 decimal places

---

### 16.2 Payment Terms Seed Data

**Migration**: `supabase/migrations/20260606110051_erp_base_002f3c2_seed_payment_terms.sql`

```sql
INSERT INTO public.payment_terms (
  term_code, term_name_en, term_name_ar, due_days, advance_percentage, retention_percentage, calculation_notes, is_system, is_active, sort_order
) VALUES
  ('NET_0', 'Immediate / Cash on Delivery', 'فوري / الدفع عند التسليم', 0, 0, 0, 'Full payment on delivery', TRUE, TRUE, 1),
  ('NET_7', 'Net 7 Days', 'صافي 7 أيام', 7, 0, 0, 'Payment due within 7 days', FALSE, TRUE, 2),
  ('NET_15', 'Net 15 Days', 'صافي 15 يوم', 15, 0, 0, 'Payment due within 15 days', FALSE, TRUE, 3),
  ('NET_30', 'Net 30 Days', 'صافي 30 يوم', 30, 0, 0, 'Payment due within 30 days', TRUE, TRUE, 4),
  ('NET_45', 'Net 45 Days', 'صافي 45 يوم', 45, 0, 0, 'Payment due within 45 days', FALSE, TRUE, 5),
  ('NET_60', 'Net 60 Days', 'صافي 60 يوم', 60, 0, 0, 'Payment due within 60 days', FALSE, TRUE, 6),
  ('NET_90', 'Net 90 Days', 'صافي 90 يوم', 90, 0, 0, 'Payment due within 90 days', FALSE, TRUE, 7),
  ('ADVANCE_50', '50% Advance, 50% on Delivery', '50% مقدم، 50% عند التسليم', 0, 50, 0, '50% advance payment, balance on delivery', FALSE, TRUE, 8),
  ('ADVANCE_30_BALANCE_30DAYS', '30% Advance, 70% Net 30', '30% مقدم، 70% بعد 30 يوم', 30, 30, 0, '30% advance, 70% due in 30 days from invoice', FALSE, TRUE, 9),
  ('ADVANCE_100', '100% Prepayment', '100% دفعة مقدمة', 0, 100, 0, 'Full prepayment before delivery', FALSE, TRUE, 10),
  ('RETENTION_10_NET_30', '10% Retention, Net 30', '10% احتفاظ، صافي 30 يوم', 30, 0, 10, '90% due in 30 days, 10% retention released later', FALSE, TRUE, 11)
ON CONFLICT (term_code) DO NOTHING;
```

---

### 16.3 Tax Types Seed Data

**Migration**: `supabase/migrations/20260606110052_erp_base_002f3c2_seed_tax_types.sql`

```sql
INSERT INTO public.tax_types (
  tax_code, tax_name_en, tax_name_ar, tax_rate, tax_treatment_code, applies_to_sales, applies_to_purchases, effective_from, description_en, is_system, is_locked, is_active, sort_order
) VALUES
  ('VAT_5', 'UAE VAT 5%', 'ضريبة القيمة المضافة 5%', 5.00, 'STANDARD_RATED', TRUE, TRUE, '2018-01-01', 'Standard UAE VAT rate of 5%', TRUE, TRUE, TRUE, 1),
  ('VAT_ZERO', 'Zero Rated Supply', 'توريد بنسبة صفر', 0.00, 'ZERO_RATED', TRUE, TRUE, '2018-01-01', 'Zero-rated supply (e.g., exports, international transport)', FALSE, FALSE, TRUE, 2),
  ('VAT_EXEMPT', 'Exempt Supply', 'توريد معفي', 0.00, 'EXEMPT', TRUE, TRUE, '2018-01-01', 'Exempt supply (e.g., residential property, local transport)', FALSE, FALSE, TRUE, 3),
  ('OUT_OF_SCOPE', 'Out of Scope', 'خارج النطاق', 0.00, 'OUT_OF_SCOPE', TRUE, TRUE, '2018-01-01', 'Outside the scope of UAE VAT', FALSE, FALSE, TRUE, 4),
  ('RCM_SCRAP', 'Reverse Charge - Scrap Metal', 'الاحتساب العكسي - خردة معدنية', 0.00, 'REVERSE_CHARGE', TRUE, TRUE, '2018-01-01', 'Reverse charge mechanism for scrap metal trading. Buyer self-accounts VAT.', TRUE, TRUE, TRUE, 5)
ON CONFLICT (tax_code) DO NOTHING;
```

**Key Notes**:
- VAT_5 is system record and locked (standard UAE VAT)
- RCM_SCRAP is system record and locked (scrap trading RCM)
- All effective from 2018-01-01 (UAE VAT introduction date)

---

### 16.4 Banks Seed Data

**Migration**: `supabase/migrations/20260606110053_erp_base_002f3c2_seed_banks.sql`

```sql
-- Assumes UAE country_id = 1 (verify after geography migration)
INSERT INTO public.banks (
  bank_code, bank_name_en, bank_name_ar, bank_short_name, swift_code, country_id, bank_type_code, website_url, is_system, is_active, sort_order
) VALUES
  ('FAB', 'First Abu Dhabi Bank', 'بنك أبوظبي الأول', 'FAB', 'NBADAEAA', 1, 'COMMERCIAL', 'https://www.bankfab.com', FALSE, TRUE, 1),
  ('ENBD', 'Emirates NBD', 'بنك الإمارات دبي الوطني', 'ENBD', 'EBILAEAD', 1, 'COMMERCIAL', 'https://www.emiratesnbd.com', FALSE, TRUE, 2),
  ('ADCB', 'Abu Dhabi Commercial Bank', 'بنك أبوظبي التجاري', 'ADCB', 'ADCBAEAA', 1, 'COMMERCIAL', 'https://www.adcb.com', FALSE, TRUE, 3),
  ('DIB', 'Dubai Islamic Bank', 'بنك دبي الإسلامي', 'DIB', 'DUIBAEAA', 1, 'ISLAMIC', 'https://www.dib.ae', FALSE, TRUE, 4),
  ('MASHREQ', 'Mashreq Bank', 'بنك المشرق', 'Mashreq', 'BOMLAEAD', 1, 'COMMERCIAL', 'https://www.mashreqbank.com', FALSE, TRUE, 5),
  ('RAK_BANK', 'Rak Bank', 'بنك رأس الخيمة الوطني', 'RAKBANK', 'NRAKAEAK', 1, 'COMMERCIAL', 'https://www.rakbank.ae', FALSE, TRUE, 6),
  ('HSBC_UAE', 'HSBC UAE', 'HSBC الإمارات', 'HSBC', 'BBMEAEAD', 1, 'COMMERCIAL', 'https://www.hsbc.ae', FALSE, TRUE, 7),
  ('ADIB', 'Abu Dhabi Islamic Bank', 'مصرف أبوظبي الإسلامي', 'ADIB', 'ABDIAEAD', 1, 'ISLAMIC', 'https://www.adib.ae', FALSE, TRUE, 8)
ON CONFLICT (bank_code) DO NOTHING;
```

**Note**: Verify `country_id` for UAE from `countries` table after geography migration is confirmed. Adjust if UAE is not `id = 1`.

---

### 16.5 Cost Centers Seed Data

**Migration**: `supabase/migrations/20260606110054_erp_base_002f3c2_seed_cost_centers.sql`

```sql
INSERT INTO public.cost_centers (
  cost_center_code, cost_center_name_en, cost_center_name_ar, parent_cost_center_id, cost_center_type_code, description_en, is_system, is_active, sort_order
) VALUES
  ('DEPT_ADMIN', 'Administration Department', 'قسم الإدارة', NULL, 'DEPARTMENT', 'General administration and management', FALSE, TRUE, 1),
  ('DEPT_OPERATIONS', 'Operations Department', 'قسم العمليات', NULL, 'DEPARTMENT', 'Operational activities and field work', FALSE, TRUE, 2),
  ('DEPT_FINANCE', 'Finance Department', 'قسم المالية', NULL, 'DEPARTMENT', 'Finance, accounting, and treasury', FALSE, TRUE, 3),
  ('DEPT_WORKSHOP', 'Workshop Department', 'قسم الورشة', NULL, 'DEPARTMENT', 'Workshop, maintenance, and fabrication', FALSE, TRUE, 4),
  ('FLEET_TRUCKS', 'Truck Fleet', 'أسطول الشاحنات', NULL, 'FLEET', 'Truck fleet operations and costs', FALSE, TRUE, 5),
  ('FLEET_EQUIPMENT', 'Heavy Equipment Fleet', 'أسطول المعدات الثقيلة', NULL, 'FLEET', 'Cranes, excavators, bulldozers, etc.', FALSE, TRUE, 6),
  ('PROJ_GENERAL', 'General Projects', 'مشاريع عامة', NULL, 'PROJECT', 'General project cost allocation', FALSE, TRUE, 7)
ON CONFLICT (cost_center_code) DO NOTHING;
```

---

### 16.6 Profit Centers Seed Data

**Migration**: `supabase/migrations/20260606110055_erp_base_002f3c2_seed_profit_centers.sql`

```sql
INSERT INTO public.profit_centers (
  profit_center_code, profit_center_name_en, profit_center_name_ar, parent_profit_center_id, profit_center_type_code, description_en, is_system, is_active, sort_order
) VALUES
  ('BU_SCRAP_TRADING', 'Scrap Trading Business Unit', 'وحدة تجارة الخردة', NULL, 'BUSINESS_UNIT', 'Scrap metal buying and selling operations', FALSE, TRUE, 1),
  ('BU_DEMOLITION', 'Demolition Services Business Unit', 'وحدة خدمات الهدم', NULL, 'BUSINESS_UNIT', 'Building and structure demolition services', FALSE, TRUE, 2),
  ('SVC_EQUIPMENT_RENTAL', 'Equipment Rental Service Line', 'خط خدمة تأجير المعدات', NULL, 'SERVICE_LINE', 'Crane, excavator, and equipment rental services', FALSE, TRUE, 3),
  ('SVC_WORKSHOP_SERVICES', 'Workshop Services', 'خدمات الورشة', NULL, 'SERVICE_LINE', 'Workshop repair and maintenance services', FALSE, TRUE, 4),
  ('REV_SCRAP_SALES', 'Scrap Sales Revenue Stream', 'مصدر إيرادات مبيعات الخردة', 1, 'REVENUE_STREAM', 'Revenue from scrap metal sales', FALSE, TRUE, 5)
ON CONFLICT (profit_center_code) DO NOTHING;
```

**Note**: `parent_profit_center_id = 1` for REV_SCRAP_SALES assumes BU_SCRAP_TRADING will be assigned `id = 1`. Adjust if needed or use a subquery:
```sql
(SELECT id FROM public.profit_centers WHERE profit_center_code = 'BU_SCRAP_TRADING')
```

---

## 17. Sidebar and Menu Updates

### 17.1 Current Sidebar Structure

**File**: `src/components/layout/app-sidebar.tsx`

**Current Master Data Section**:
```typescript
{
  label: "Master Data",
  items: [
    {
      label: "Geography & Locations",
      items: [
        { label: "Countries", path: "/admin/master-data/geography/countries", icon: MapIcon },
        { label: "Regions / Emirates", path: "/admin/master-data/geography/emirates", icon: MapPinIcon },
        { label: "Cities", path: "/admin/master-data/geography/cities", icon: Building2Icon },
        { label: "Areas & Zones", path: "/admin/master-data/geography/areas", icon: MapIcon },
        { label: "Ports & Terminals", path: "/admin/master-data/geography/ports", icon: ShipIcon },
      ],
    },
  ],
},
```

### 17.2 Add Finance Basics Section

**New Section**:
```typescript
{
  label: "Finance Basics",
  items: [
    { label: "Currencies", path: "/admin/master-data/finance-basics/currencies", icon: DollarSignIcon },
    { label: "Payment Terms", path: "/admin/master-data/finance-basics/payment-terms", icon: CalendarCheckIcon },
    { label: "Tax Types", path: "/admin/master-data/finance-basics/tax-types", icon: ReceiptTextIcon },
    { label: "Banks", path: "/admin/master-data/finance-basics/banks", icon: BuildingIcon },
    { label: "Cost Centers", path: "/admin/master-data/finance-basics/cost-centers", icon: FolderTreeIcon },
    { label: "Profit Centers", path: "/admin/master-data/finance-basics/profit-centers", icon: TrendingUpIcon },
  ],
},
```

**Icons** (from `lucide-react`):
- Currencies: `DollarSign` or `Banknote`
- Payment Terms: `CalendarCheck` or `FileText`
- Tax Types: `ReceiptText` or `Percent`
- Banks: `Building` or `Landmark`
- Cost Centers: `FolderTree` or `FolderKanban`
- Profit Centers: `TrendingUp` or `Target`

### 17.3 Updated Sidebar Structure

```typescript
{
  label: "Master Data",
  items: [
    {
      label: "Geography & Locations",
      items: [
        { label: "Countries", path: "/admin/master-data/geography/countries", icon: MapIcon },
        { label: "Regions / Emirates", path: "/admin/master-data/geography/emirates", icon: MapPinIcon },
        { label: "Cities", path: "/admin/master-data/geography/cities", icon: Building2Icon },
        { label: "Areas & Zones", path: "/admin/master-data/geography/areas", icon: MapIcon },
        { label: "Ports & Terminals", path: "/admin/master-data/geography/ports", icon: ShipIcon },
      ],
    },
    {
      label: "Finance Basics",
      items: [
        { label: "Currencies", path: "/admin/master-data/finance-basics/currencies", icon: DollarSignIcon },
        { label: "Payment Terms", path: "/admin/master-data/finance-basics/payment-terms", icon: CalendarCheckIcon },
        { label: "Tax Types", path: "/admin/master-data/finance-basics/tax-types", icon: ReceiptTextIcon },
        { label: "Banks", path: "/admin/master-data/finance-basics/banks", icon: BuildingIcon },
        { label: "Cost Centers", path: "/admin/master-data/finance-basics/cost-centers", icon: FolderTreeIcon },
        { label: "Profit Centers", path: "/admin/master-data/finance-basics/profit-centers", icon: TrendingUpIcon },
      ],
    },
  ],
},
```

---

## 18. File Creation Plan

### 18.1 Database Migrations (16 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `20260606110000_erp_base_002f3c2_finance_basics_currencies.sql` | Create currencies table + indexes + RLS | ~120 |
| `20260606110001_erp_base_002f3c2_finance_basics_payment_terms.sql` | Create payment_terms table + indexes + RLS | ~100 |
| `20260606110002_erp_base_002f3c2_finance_basics_tax_types.sql` | Create tax_types table + indexes + RLS | ~120 |
| `20260606110003_erp_base_002f3c2_finance_basics_banks.sql` | Create banks table + indexes + RLS | ~120 |
| `20260606110004_erp_base_002f3c2_finance_basics_cost_centers.sql` | Create cost_centers table + indexes + RLS | ~130 |
| `20260606110005_erp_base_002f3c2_finance_basics_profit_centers.sql` | Create profit_centers table + indexes + RLS | ~130 |
| `20260606110010_erp_base_002f3c2_lookups_payment_methods.sql` | Seed PAYMENT_METHODS lookup category + values | ~50 |
| `20260606110011_erp_base_002f3c2_lookups_tax_treatment.sql` | Seed TAX_TREATMENT_TYPES lookup category + values | ~40 |
| `20260606110012_erp_base_002f3c2_lookups_bank_account_types.sql` | Seed BANK_ACCOUNT_TYPES lookup category + values | ~40 |
| `20260606110013_erp_base_002f3c2_lookups_bank_types.sql` | Seed BANK_TYPES lookup category + values | ~40 |
| `20260606110014_erp_base_002f3c2_lookups_cost_center_types.sql` | Seed COST_CENTER_TYPES lookup category + values | ~50 |
| `20260606110015_erp_base_002f3c2_lookups_profit_center_types.sql` | Seed PROFIT_CENTER_TYPES lookup category + values | ~40 |
| `20260606110020_erp_base_002f3c2_permissions.sql` | Seed permissions + role assignments | ~80 |
| `20260606110050_erp_base_002f3c2_seed_currencies.sql` | Seed currency data (AED, USD, EUR, etc.) | ~30 |
| `20260606110051_erp_base_002f3c2_seed_payment_terms.sql` | Seed payment term data (NET_30, ADVANCE_50, etc.) | ~35 |
| `20260606110052_erp_base_002f3c2_seed_tax_types.sql` | Seed tax type data (VAT_5, RCM_SCRAP, etc.) | ~30 |
| `20260606110053_erp_base_002f3c2_seed_banks.sql` | Seed UAE bank data (FAB, ENBD, ADCB, etc.) | ~30 |
| `20260606110054_erp_base_002f3c2_seed_cost_centers.sql` | Seed cost center data | ~25 |
| `20260606110055_erp_base_002f3c2_seed_profit_centers.sql` | Seed profit center data | ~25 |

**Total**: 16 migration files

---

### 18.2 TypeScript Types and Validation (3 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `src/features/master-data/finance-basics/types.ts` | TypeScript interfaces for all 6 entities + input types | ~400 |
| `src/features/master-data/finance-basics/validation.ts` | Zod validation schemas (create + update for 6 entities) | ~400 |
| `src/features/master-data/finance-basics/actions.ts` | Server actions (8 actions × 6 entities = 48 functions) | ~2000 |

**Total**: 3 files, ~2800 lines

---

### 18.3 React Hooks (6 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `src/features/master-data/finance-basics/hooks/use-currencies.ts` | Client hook for currencies data | ~60 |
| `src/features/master-data/finance-basics/hooks/use-payment-terms.ts` | Client hook for payment terms data | ~60 |
| `src/features/master-data/finance-basics/hooks/use-tax-types.ts` | Client hook for tax types data | ~60 |
| `src/features/master-data/finance-basics/hooks/use-banks.ts` | Client hook for banks data | ~60 |
| `src/features/master-data/finance-basics/hooks/use-cost-centers.ts` | Client hook for cost centers data | ~60 |
| `src/features/master-data/finance-basics/hooks/use-profit-centers.ts` | Client hook for profit centers data | ~60 |

**Total**: 6 files, ~360 lines

---

### 18.4 UI Components (12 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `src/features/master-data/finance-basics/components/currencies-table.tsx` | Currency data table | ~250 |
| `src/features/master-data/finance-basics/components/currency-form-dialog.tsx` | Currency form dialog | ~300 |
| `src/features/master-data/finance-basics/components/payment-terms-table.tsx` | Payment terms data table | ~250 |
| `src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx` | Payment term form dialog | ~350 |
| `src/features/master-data/finance-basics/components/tax-types-table.tsx` | Tax types data table | ~250 |
| `src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx` | Tax type form dialog | ~350 |
| `src/features/master-data/finance-basics/components/banks-table.tsx` | Banks data table | ~250 |
| `src/features/master-data/finance-basics/components/bank-form-dialog.tsx` | Bank form dialog | ~400 |
| `src/features/master-data/finance-basics/components/cost-centers-table.tsx` | Cost centers data table | ~250 |
| `src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx` | Cost center form dialog | ~400 |
| `src/features/master-data/finance-basics/components/profit-centers-table.tsx` | Profit centers data table | ~250 |
| `src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx` | Profit center form dialog | ~400 |

**Total**: 12 files, ~3700 lines

---

### 18.5 Page Components (6 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `src/app/(protected)/admin/master-data/finance-basics/currencies/page.tsx` | Currencies page | ~60 |
| `src/app/(protected)/admin/master-data/finance-basics/payment-terms/page.tsx` | Payment terms page | ~60 |
| `src/app/(protected)/admin/master-data/finance-basics/tax-types/page.tsx` | Tax types page | ~60 |
| `src/app/(protected)/admin/master-data/finance-basics/banks/page.tsx` | Banks page | ~60 |
| `src/app/(protected)/admin/master-data/finance-basics/cost-centers/page.tsx` | Cost centers page | ~60 |
| `src/app/(protected)/admin/master-data/finance-basics/profit-centers/page.tsx` | Profit centers page | ~60 |

**Total**: 6 files, ~360 lines

---

### 18.6 Select Components (6 files)

| File | Purpose | Lines (Est.) |
|------|---------|--------------|
| `src/components/erp/finance-basics/currency-select.tsx` | Currency dropdown | ~120 |
| `src/components/erp/finance-basics/payment-term-select.tsx` | Payment term dropdown | ~120 |
| `src/components/erp/finance-basics/tax-type-select.tsx` | Tax type dropdown | ~120 |
| `src/components/erp/finance-basics/bank-select.tsx` | Bank dropdown | ~120 |
| `src/components/erp/finance-basics/cost-center-select.tsx` | Cost center dropdown (with hierarchy) | ~150 |
| `src/components/erp/finance-basics/profit-center-select.tsx` | Profit center dropdown (with hierarchy) | ~150 |

**Total**: 6 files, ~780 lines

---

### 18.7 Sidebar Update (1 file)

| File | Purpose | Lines Changed |
|------|---------|---------------|
| `src/components/layout/app-sidebar.tsx` | Add Finance Basics menu section | ~15 lines added |

---

### 18.8 Summary

| Category | Files | Lines (Est.) |
|----------|-------|--------------|
| Database Migrations | 16 | ~1200 |
| TypeScript (types, validation, actions) | 3 | ~2800 |
| React Hooks | 6 | ~360 |
| UI Components (tables + forms) | 12 | ~3700 |
| Page Components | 6 | ~360 |
| Select Components | 6 | ~780 |
| Sidebar Update | 1 | ~15 |
| **TOTAL** | **50 files** | **~9215 lines** |

**Note**: Estimates are conservative. Actual implementation may vary.

---

## 19. Implementation Sequence

### Phase 1: Database Foundation (1-2 hours)

1. ✅ Create all 16 migration files
2. ✅ Run migrations on Supabase (via MCP `apply_migration`)
3. ✅ Verify table structure (`DESCRIBE tables`)
4. ✅ Verify RLS policies (`SELECT * FROM pg_policies`)
5. ✅ Verify seed data (`SELECT * FROM currencies`, etc.)
6. ✅ Verify permissions (`SELECT * FROM permissions WHERE permission_code LIKE 'master_data.finance_basics.%'`)
7. ✅ Test permission helper (`SELECT current_user_has_permission('master_data.finance_basics.view')`)

### Phase 2: TypeScript Foundation (1-2 hours)

1. ✅ Create `types.ts` (all 6 entity interfaces + input types)
2. ✅ Create `validation.ts` (all 12 Zod schemas)
3. ✅ Verify TypeScript compilation (`npm run typecheck`)

### Phase 3: Server Actions (2-3 hours)

1. ✅ Create `actions.ts` with all 48 server actions
2. ✅ Test one action manually (e.g., `getCurrencies()`)
3. ✅ Verify audit logging works
4. ✅ Verify RLS policies enforced
5. ✅ Verify permission checks work

### Phase 4: Select Components (1-2 hours)

1. ✅ Create all 6 select components
2. ✅ Test each select component in isolation
3. ✅ Verify dropdown data loads correctly
4. ✅ Verify hierarchy rendering (cost/profit centers)

### Phase 5: UI Tables (2-3 hours)

1. ✅ Create all 6 table components
2. ✅ Verify columns render correctly
3. ✅ Verify row actions work (view, edit, delete, lock, activate)
4. ✅ Verify system_admin conditional actions
5. ✅ Verify filters and search

### Phase 6: UI Forms (3-4 hours)

1. ✅ Create all 6 form dialog components
2. ✅ Verify add/edit/view modes
3. ✅ Verify validation errors display correctly
4. ✅ Verify form submission success/error toasts
5. ✅ Verify lock/unlock protection in UI

### Phase 7: Pages (1 hour)

1. ✅ Create all 6 page components
2. ✅ Verify page metadata (title, description)
3. ✅ Verify breadcrumbs
4. ✅ Verify permission checks (access denied for unauthorized users)

### Phase 8: React Hooks (Optional, 1 hour)

1. ✅ Create all 6 custom hooks (if needed for client-side data fetching)
2. ✅ Verify hooks fetch data correctly

### Phase 9: Sidebar Update (15 minutes)

1. ✅ Update `app-sidebar.tsx` with Finance Basics section
2. ✅ Verify menu navigation works

### Phase 10: Testing and Verification (2-3 hours)

1. ✅ Run typecheck: `npm run typecheck`
2. ✅ Run lint: `npm run lint`
3. ✅ Run build: `npm run build`
4. ✅ Manual UI testing (all 6 pages, all CRUD operations)
5. ✅ Test permission enforcement (login as different roles)
6. ✅ Test system_admin full access
7. ✅ Test lock/unlock behavior
8. ✅ Test audit logging (verify audit_logs table entries)
9. ✅ Test export functionality

### Phase 11: Documentation and Handoff (1 hour)

1. ✅ Generate implementation report (markdown)
2. ✅ Document any deviations from plan
3. ✅ Document any future enhancements needed
4. ✅ Provide Sameer with testing checklist

**Total Estimated Time**: 15-22 hours (2-3 working days)

**Note**: This is implementation time only. Does NOT include this planning document creation time.

---

## 20. Testing Strategy

### 20.1 Database Testing

**Tools**: Supabase SQL Editor, MCP `execute_sql`

**Tests**:
1. ✅ Verify all 6 tables exist
2. ✅ Verify all columns exist with correct types
3. ✅ Verify all indexes exist
4. ✅ Verify all FK constraints exist
5. ✅ Verify RLS enabled on all tables
6. ✅ Verify RLS policies exist (4 policies × 6 tables = 24 policies)
7. ✅ Verify seed data inserted correctly
8. ✅ Test `chk_currencies_unique_base` constraint (try inserting second base currency → should fail)
9. ✅ Test `chk_cost_centers_no_self_parent` constraint (try setting parent_id = id → should fail)
10. ✅ Test RLS SELECT policy (login as non-admin → should only see active records if permission granted)
11. ✅ Test RLS UPDATE policy (login as non-admin → should NOT be able to update locked records)
12. ✅ Test RLS DELETE policy (login as non-admin → should NOT be able to delete)

### 20.2 TypeScript Testing

**Tools**: `npm run typecheck`

**Tests**:
1. ✅ No TypeScript errors in types.ts
2. ✅ No TypeScript errors in validation.ts
3. ✅ No TypeScript errors in actions.ts
4. ✅ No TypeScript errors in all UI components
5. ✅ Verify Zod schemas validate correctly (manual test with sample data)

### 20.3 Server Action Testing

**Tools**: Manual UI testing, browser console

**Tests** (for each entity):
1. ✅ **getCurrencies()**: Fetches all currencies, respects `includeInactive` filter
2. ✅ **getCurrencyById(id)**: Fetches single currency
3. ✅ **createCurrency(data)**: Creates new currency, logs audit, revalidates path
4. ✅ **updateCurrency(id, data)**: Updates currency, logs audit with diff, revalidates path
5. ✅ **deleteCurrency(id)**: Deletes currency (system_admin only), logs audit
6. ✅ **toggleCurrencyStatus(id)**: Activates/deactivates currency, logs audit
7. ✅ **toggleCurrencyLock(id)**: Locks/unlocks currency (system_admin only), logs audit
8. ✅ **exportCurrencies()**: Returns data array for export

**Permission Tests**:
- Login as `system_admin` → All actions should work
- Login as `group_admin` → View, manage, export, audit_view should work; cannot delete
- Login as `company_admin` → View, export should work; cannot manage or delete
- Login as `branch_admin` → View should work; cannot manage, export, or delete
- Login as user without permissions → All actions should throw "Insufficient permissions" error

### 20.4 UI Component Testing

**Tools**: Manual browser testing

**Tests** (for each entity):

**Table Component**:
1. ✅ Data loads and displays correctly
2. ✅ Search filter works
3. ✅ Active/inactive filter works
4. ✅ Sort columns work
5. ✅ Pagination works (if many records)
6. ✅ "Add" button visible if user has `manage` permission
7. ✅ "Export" button visible if user has `export` permission
8. ✅ Row actions: View, Edit, Delete (system_admin only), Lock/Unlock (system_admin only), Activate/Deactivate
9. ✅ System record badge visible for system records
10. ✅ Locked badge visible for locked records
11. ✅ Clicking "Add" opens form dialog in add mode
12. ✅ Clicking "Edit" opens form dialog in edit mode with pre-filled data
13. ✅ Clicking "View" opens form dialog in view mode with disabled fields

**Form Dialog Component**:
1. ✅ Add mode: Empty form, all fields enabled (except disabled by default like code in edit)
2. ✅ Edit mode: Pre-filled form, all fields enabled except locked fields if not system_admin
3. ✅ View mode: Pre-filled form, all fields disabled, no submit button
4. ✅ Required field validation works (empty → error message)
5. ✅ Regex validation works (e.g., currency_code must be 3 uppercase letters)
6. ✅ Submit button disabled if validation errors
7. ✅ Submit success → Toast success message → Dialog closes → Table refreshes
8. ✅ Submit error → Toast error message → Dialog remains open
9. ✅ Cancel button closes dialog without saving
10. ✅ Lock toggle visible only to system_admin (in edit mode)

**Select Component**:
1. ✅ Dropdown loads data
2. ✅ Dropdown displays correct labels (name, code, symbol, etc.)
3. ✅ Dropdown filters inactive records (unless `includeInactive` prop)
4. ✅ Selected value displays correctly in trigger
5. ✅ onChange callback fires correctly
6. ✅ Disabled state works
7. ✅ Loading state shows spinner
8. ✅ Error state shows error message
9. ✅ Empty state shows "No records available" message
10. ✅ Hierarchy indentation works (cost/profit centers)

### 20.5 Integration Testing

**Tests**:
1. ✅ Create currency → Use in payment term form (if applicable)
2. ✅ Create cost center → Use in invoice allocation (future)
3. ✅ Create tax type → Use in pricing calculation (future)
4. ✅ Lock currency → Try to edit as non-admin → Should fail
5. ✅ Delete bank as non-admin → Should fail (RLS blocks)
6. ✅ Export currencies → Verify Excel/CSV file generated correctly

### 20.6 Acceptance Testing

**Final Checks**:
1. ✅ All 6 pages accessible and load without errors
2. ✅ All 6 sidebar menu items present and navigate correctly
3. ✅ All CRUD operations work for all 6 entities
4. ✅ All seed data present and correct
5. ✅ All permissions enforced correctly
6. ✅ All RLS policies working correctly
7. ✅ All audit logs created correctly
8. ✅ No TypeScript errors
9. ✅ No lint errors (or only acceptable warnings)
10. ✅ Build succeeds without errors
11. ✅ System_admin has full access
12. ✅ Lock/unlock works as expected
13. ✅ Activate/deactivate works as expected
14. ✅ Export works as expected

**Performance Checks**:
1. ✅ Page load time < 2 seconds (with reasonable data volume)
2. ✅ Table renders quickly (< 1 second for 100+ records)
3. ✅ Form submission completes in < 1 second
4. ✅ Select component dropdown opens quickly (< 500ms)

---

## 21. Risk Analysis

### 21.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **RLS Policy Misconfiguration** | High (security breach, unauthorized access) | Low | Thoroughly test RLS policies with different user roles. Review policy logic carefully. Follow proven geography pattern. |
| **Base Currency Constraint Failure** | Medium (data integrity issue, multiple base currencies) | Low | Database constraint enforced. Add UI validation warning when toggling base currency. |
| **Self-Parent Loop in Cost/Profit Centers** | Low (data integrity issue) | Low | Database constraint enforced (`chk_no_self_parent`). Add UI validation to prevent parent = self. |
| **SWIFT Code Validation Regex Bug** | Low (accepts invalid SWIFT codes) | Low | Use proven regex pattern. Test with valid and invalid SWIFT codes. |
| **Decimal Places Misconfiguration** | Medium (KWD/BHD/OMR amount rounding errors) | Medium | Clearly document decimal places for each currency. Add UI hint text. Test amount calculations. |
| **Lookup Category FK Errors** | Medium (invalid tax_treatment_code references) | Low | Seed lookups BEFORE seeding tables that reference them. Add FK validation in Zod schemas. |
| **Permission Check Missing** | High (unauthorized access) | Low | Use server action pattern consistently. Review all actions for permission checks. Add integration tests. |
| **Audit Logging Failure** | Medium (compliance issue, no change history) | Low | Test audit logging for all CRUD operations. Monitor audit_logs table growth. |
| **Lock/Unlock UI Confusion** | Low (users unsure what locked means) | Medium | Add tooltip/help text explaining locked records. Show locked badge clearly. |
| **System Record Accidental Deletion** | High (AED or VAT_5 deleted → system breaks) | Very Low | RLS prevents non-admin delete. Add UI confirmation dialog for system_admin delete. Consider soft delete instead. |

### 21.2 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **UAE VAT Rate Change** | Medium (5% → new rate, all transactions affected) | Low (UAE stable) | Design effective_from/effective_to columns. Document rate change procedure. |
| **RCM Rule Change** | Medium (scrap trading compliance affected) | Low | Monitor UAE FTA announcements. Keep tax_types flexible for new rules. |
| **Missing Payment Term Scenarios** | Low (user needs term not in seed data) | Medium | Allow users to create custom payment terms. Document common terms. |
| **Cost/Profit Center Hierarchy Complexity** | Medium (users confused by hierarchy depth) | Medium | Limit hierarchy depth to 3-4 levels. Provide hierarchy visualization (future). |
| **Bank List Incompleteness** | Low (user bank not in list) | High | Allow users to add new banks. Provide "Other" option. |
| **Currency Exchange Rate Needs** | High (users ask for rates) | High | Clearly document: Exchange rates NOT in 002F.3C.2. Point to future phase. Add `exchange_rate_placeholder` column for future. |

### 21.3 Scope Creep Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **"Can you add GL account codes?"** | High (enters accounting scope) | High | Firmly decline. Redirect to future accounting phase. Document exclusion clearly. |
| **"Can you add budget management?"** | High (complex feature, out of scope) | Medium | Decline for 002F.3C.2. Add `budget_enabled` flag for future enablement. |
| **"Can you add exchange rate engine?"** | High (complex feature, out of scope) | High | Decline. Add `exchange_rate_placeholder` column but do NOT implement rate logic. |
| **"Can you add bank reconciliation?"** | High (complex feature, out of scope) | Medium | Decline. Redirect to future cash management / finance module. |
| **"Can you add customer/vendor master data?"** | High (CRM/procurement scope) | Medium | Decline. Explain: CRM phase is separate. Finance Basics is just reference data. |

**Scope Creep Response Template**:
> "That feature [X] is part of [Accounting / CRM / Procurement / Advanced Finance] and is explicitly out of scope for ERP BASE 002F.3C.2 Finance Basics. This phase focuses only on foundational master data needed for commercial readiness. [X] will be addressed in [Future Phase]. I've documented this as a future enhancement note."

---

## 22. Acceptance Criteria

### 22.1 Database Criteria

✅ **PASS** if ALL of the following are true:

1. All 6 tables exist: `currencies`, `payment_terms`, `tax_types`, `banks`, `cost_centers`, `profit_centers`
2. All 6 lookup categories exist with values
3. All RLS policies exist and are enabled
4. All seed data inserted correctly (10 currencies, 11 payment terms, 5 tax types, 8 banks, 7 cost centers, 5 profit centers)
5. AED is base currency and system record
6. VAT_5 and RCM_SCRAP are system records
7. Permissions exist: `master_data.finance_basics.view`, `manage`, `export`, `audit_view`
8. Permissions assigned to roles (system_admin, group_admin, company_admin, branch_admin)
9. `current_user_has_permission('master_data.finance_basics.view')` returns TRUE for authorized users
10. Base currency constraint enforced (cannot insert second base currency)
11. Self-parent constraint enforced (cost/profit centers cannot reference self as parent)

### 22.2 Code Criteria

✅ **PASS** if ALL of the following are true:

1. `npm run typecheck` passes with 0 errors
2. `npm run lint` passes with 0 errors (warnings acceptable for pre-existing issues)
3. `npm run build` succeeds
4. All 48 server actions implemented (8 × 6 entities)
5. All server actions have permission checks
6. All server actions have audit logging
7. All 12 Zod schemas implemented (create + update for 6 entities)
8. All 6 select components implemented and functional
9. All 12 UI components implemented (6 tables + 6 forms)
10. All 6 pages implemented and accessible

### 22.3 Functional Criteria

✅ **PASS** if ALL of the following are true:

1. **CRUD Operations**: Add, edit, view, delete work for all 6 entities
2. **Permission Enforcement**: Non-admin users cannot delete or manage without permission
3. **Lock/Unlock**: system_admin can lock/unlock; non-admin cannot edit locked records
4. **Activate/Deactivate**: Status toggle works for all entities
5. **System Records**: System records are protected (locked), display system badge
6. **Audit Logging**: All CRUD + status + lock operations logged to audit_logs table
7. **Export**: Export functionality works for all 6 entities (returns data array)
8. **Select Components**: All dropdowns load data, display correctly, respect is_active filter
9. **Search/Filter**: Table search and active/inactive filter work
10. **Sidebar Navigation**: All 6 menu items present and navigate to correct pages
11. **Breadcrumbs**: Correct breadcrumbs display on all 6 pages
12. **Validation**: Form validation prevents invalid submissions (e.g., invalid currency code)
13. **Toast Notifications**: Success and error toasts display correctly

### 22.4 User Acceptance Criteria

✅ **PASS** if Sameer confirms:

1. ✅ All 6 pages accessible and functional
2. ✅ Seed data accurate and useful (AED, USD, NET_30, VAT_5, FAB bank, etc.)
3. ✅ UAE VAT and RCM correctly represented
4. ✅ Payment terms cover common scenarios
5. ✅ Banks list includes major UAE banks
6. ✅ Cost/profit center seed data useful as starting point
7. ✅ UI/UX intuitive and consistent with geography module
8. ✅ No critical bugs or blockers
9. ✅ Performance acceptable (pages load quickly, forms submit quickly)
10. ✅ Ready for integration with future CRM and Procurement modules

### 22.5 Documentation Criteria

✅ **PASS** if ALL of the following exist:

1. ✅ This technical implementation plan document
2. ✅ Implementation report (after implementation complete)
3. ✅ Code comments explaining non-obvious logic
4. ✅ README updates (if applicable)
5. ✅ Migration files clearly named and commented
6. ✅ Future enhancement notes documented

---

## 23. Future Integration Notes

### 23.1 Integration with CRM (002F.3E or later)

**Customer Master Data** will reference Finance Basics:

**Fields**:
- `default_currency_id` → FK to `currencies.id`
- `default_payment_term_id` → FK to `payment_terms.id`
- `tax_type_id` → FK to `tax_types.id` (default tax treatment for customer)
- `default_bank_id` → FK to `banks.id` (customer's bank for direct debit/transfers)

**Use Cases**:
- Customer quotes: Use `default_currency_id` and `default_payment_term_id`
- Invoice generation: Apply `tax_type_id` for VAT calculation
- Payment processing: Use `default_bank_id` for bank transfer details

**Migration Dependency**: CRM customer table will add FK to Finance Basics tables.

---

### 23.2 Integration with Procurement

**Vendor Master Data** will reference Finance Basics:

**Fields**:
- `default_currency_id` → FK to `currencies.id`
- `default_payment_term_id` → FK to `payment_terms.id`
- `tax_type_id` → FK to `tax_types.id` (default tax treatment for vendor)
- `default_bank_id` → FK to `banks.id` (vendor's bank for payment processing)

**Purchase Order** will reference Finance Basics:
- `currency_id` → FK to `currencies.id`
- `payment_term_id` → FK to `payment_terms.id`
- `cost_center_id` → FK to `cost_centers.id` (expense allocation)

**Use Cases**:
- Purchase orders: Multi-currency support, payment terms, cost center allocation
- Vendor invoice processing: Tax calculation, input VAT recovery
- Payment runs: Bank details, payment terms due date calculation

---

### 23.3 Integration with Inventory

**Item Master Data** will reference Finance Basics:

**Fields**:
- `default_tax_type_id` → FK to `tax_types.id` (default tax treatment for item)
- `cost_center_id` → FK to `cost_centers.id` (warehouse/stock location cost allocation)

**Use Cases**:
- Pricing: Apply default tax type to sales price
- Stock valuation: Allocate stock value to cost center
- Scrap items: Use RCM_SCRAP tax type

---

### 23.4 Integration with HR & Payroll

**Employee Master Data** will reference Finance Basics:

**Fields**:
- `salary_currency_id` → FK to `currencies.id`
- `bank_id` → FK to `banks.id` (employee's salary bank account)
- `cost_center_id` → FK to `cost_centers.id` (employee's department for cost allocation)

**Use Cases**:
- Payroll: Multi-currency salary support, bank transfer details
- Cost allocation: Allocate employee costs to cost center
- Expat employees: Pay in USD/EUR with currency conversion

---

### 23.5 Integration with Fleet & Workshop

**Vehicle/Equipment Master Data** will reference Finance Basics:

**Fields**:
- `cost_center_id` → FK to `cost_centers.id` (vehicle/equipment cost allocation)
- `profit_center_id` → FK to `profit_centers.id` (rental revenue tracking)

**Service Invoice** will reference Finance Basics:
- `tax_type_id` → FK to `tax_types.id` (UAE VAT 5%)
- `profit_center_id` → FK to `profit_centers.id`

**Use Cases**:
- Workshop service invoices: Apply VAT_5
- Equipment rental invoices: Revenue to profit center
- Vehicle operating costs: Allocate to cost center

---

### 23.6 Integration with Accounting (Future)

**Chart of Accounts** will reference Finance Basics:

**Fields** (future):
- `default_cost_center_id` → FK to `cost_centers.id`
- `default_profit_center_id` → FK to `profit_centers.id`

**Journal Entry Lines** will reference Finance Basics:
- `cost_center_id` → FK to `cost_centers.id`
- `profit_center_id` → FK to `profit_centers.id`
- `currency_id` → FK to `currencies.id` (for multi-currency GL)

**Use Cases**:
- GL posting: Cost/profit center allocation
- Financial reporting: Cost center profit & loss, profit center revenue analysis
- Multi-currency accounting: Foreign currency transactions, revaluation

---

### 23.7 Owner Companies & Branches Integration (Future Enhancement)

**Not in 002F.3C.2 scope**, but documented for future:

**owner_companies table** enhancement:
```sql
ALTER TABLE public.owner_companies
ADD COLUMN default_currency_id INTEGER REFERENCES public.currencies(id);
```

**branches table** enhancement:
```sql
ALTER TABLE public.branches
ADD COLUMN default_cost_center_id INTEGER REFERENCES public.cost_centers(id),
ADD COLUMN default_profit_center_id INTEGER REFERENCES public.profit_centers(id);
```

**Use Cases**:
- Each company has a default currency for financial reporting
- Each branch has default cost/profit centers for operations

**Note**: Do NOT implement in 002F.3C.2. Document only.

---

### 23.8 Exchange Rate Engine (Future)

**Not in 002F.3C.2 scope**, but placeholder exists:

**Future Table**: `currency_exchange_rates`
```sql
CREATE TABLE public.currency_exchange_rates (
  id SERIAL PRIMARY KEY,
  from_currency_id INTEGER NOT NULL REFERENCES public.currencies(id),
  to_currency_id INTEGER NOT NULL REFERENCES public.currencies(id),
  rate NUMERIC(18, 6) NOT NULL,
  effective_date DATE NOT NULL,
  rate_source TEXT,  -- ECB, Central Bank, Manual, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Use Case**: Convert USD invoice to AED for accounting posting.

**Note**: Do NOT implement in 002F.3C.2. Use static `exchange_rate_placeholder` column in `currencies` table if absolutely needed for future reference only (not for calculations).

---

## 24. Final Recommendation

### 24.1 Recommendation to Sameer

**Status**: ✅ **READY FOR APPROVAL AND IMPLEMENTATION**

**Summary**:
This technical implementation plan for **ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness** is comprehensive, well-structured, and ready for implementation. It builds directly on the proven patterns from ERP BASE 002F.3C.1 (Geography & Locations) and ERP BASE 002F.3B (Global Lookup Engine), ensuring consistency, stability, and predictability.

**Key Strengths**:
1. ✅ **Clear Scope**: Strictly defines what IS and IS NOT in scope, preventing scope creep into accounting
2. ✅ **Proven Patterns**: Replicates geography module patterns exactly (RLS, permissions, audit, UI, server actions)
3. ✅ **UAE VAT Compliance**: Correctly models UAE VAT 5%, RCM for scrap, zero-rated, exempt classifications
4. ✅ **Multi-Currency**: Full support for international operations (AED base, GCC currencies, decimal places)
5. ✅ **Commercial Readiness**: Enables CRM, Procurement, Inventory, and future modules to operate commercially
6. ✅ **Future-Proof**: Designed for extensibility (exchange rates, budget management, GL integration) without over-engineering
7. ✅ **System Admin Full Access**: Lock/unlock, delete, and edit system records capabilities preserved
8. ✅ **Comprehensive Testing**: Detailed testing strategy and acceptance criteria
9. ✅ **Risk Mitigation**: All major risks identified with mitigations

**What Sameer Gets**:
- ✅ 6 dedicated master data tables (currencies, payment_terms, tax_types, banks, cost_centers, profit_centers)
- ✅ 6 lookup categories (payment methods, tax treatments, bank types, etc.)
- ✅ Full CRUD UI for all 6 entities
- ✅ 6 reusable select components
- ✅ RLS, permissions, audit logging
- ✅ UAE VAT and RCM support
- ✅ Seed data for immediate use
- ✅ ~50 files, ~9200 lines of code
- ✅ Estimated 2-3 working days implementation time

**What Sameer Does NOT Get** (by design):
- ❌ Accounting module (GL, journals, AR/AP)
- ❌ Exchange rate engine (future phase)
- ❌ Budget management (future phase)
- ❌ VAT return filing (future phase)
- ❌ Customer/vendor master data (CRM/procurement phases)

**Next Steps**:
1. **Sameer reviews and approves this plan** (recommend careful review of sections 1-9, 21-22)
2. **Sameer provides any adjustments or clarifications** (if needed)
3. **Implementation begins** following the sequence in section 19
4. **Implementation report generated** after completion
5. **Sameer performs user acceptance testing** using criteria in section 22
6. **002F.3C.2 marked COMPLETE** and ERP proceeds to next phase

**Confidence Level**: ✅ **VERY HIGH**

All dependencies are met, all patterns are proven, and all risks are identified and mitigated. This phase is a natural and logical extension of the Geography module work.

**Recommendation**: ✅ **APPROVE AND PROCEED WITH IMPLEMENTATION**

---

## Document Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-06-06 | 1.0 | Initial technical implementation plan created (Planning Only) |

---

**END OF TECHNICAL IMPLEMENTATION PLAN**

**Document Status**: ✅ COMPLETE — READY FOR SAMEER REVIEW

**Next Action**: Sameer approval required before implementation begins.
