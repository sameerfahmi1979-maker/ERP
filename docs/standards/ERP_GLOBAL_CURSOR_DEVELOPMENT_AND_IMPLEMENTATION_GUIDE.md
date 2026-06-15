# ERP GLOBAL CURSOR DEVELOPMENT AND IMPLEMENTATION GUIDE

**Document Type**: Official Cursor Development and Implementation Standard  
**Project**: ALGT ERP  
**Version**: REV1  
**Status**: Approved with minor corrections applied  
**Applies To**: All ERP phases, modules, prompts, implementations, migrations, reports, and fixes

---

## DOCUMENT PURPOSE

This is the **main Cursor working guide** for ALGT ERP development.

Every future planning, implementation, database, UI, server-action, security, testing, and reporting task must reference and follow this guide.

**This guide works together with**:
- `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (controls design-system behavior)

**This Cursor guide controls**:
- Development workflow
- Implementation standards
- Database and migration rules
- Testing requirements
- Reporting and governance
- Security and RLS enforcement

---

## SUPABASE VERIFICATION

**Connected to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`

✅ **Live database context was verified before creating this guide.**

**Verified**:
- Database exists and is reachable (55+ tables)
- Current ERP tables exist with RLS enabled
- Global numbering infrastructure operational (3 tables, 2 functions)
- Customer module implemented (customers, customer_contacts, customer_addresses, customer_bank_details)
- Party master tables exist (vendors, subcontractors, consultants, government_authorities, recruitment_agencies)
- Global lookup system operational (global_lookup_categories, global_lookup_values)
- Geography master data complete (countries, emirates, cities, areas_zones, ports)
- Finance basics complete (currencies, payment_terms, tax_types, banks)
- Audit logging operational (audit_logs table)
- Permission system operational (roles, permissions, role_permissions, user_roles)

---

## TABLE OF CONTENTS

### Core Standards
1. [Project Stack and Architecture](#1-project-stack-and-architecture)
2. [Mandatory Live Supabase Verification Rule](#2-mandatory-live-supabase-verification-rule)
3. [Source of Truth Rule](#3-source-of-truth-rule)
4. [Phase-Gated Workflow](#4-phase-gated-workflow)
5. [File and Report Rules](#5-file-and-report-rules)

### Database and Security Standards
6. [Database and Migration Rules](#6-database-and-migration-rules)
7. [RLS and Permission Rules](#7-rls-and-permission-rules)
8. [Numbering Rules](#8-numbering-rules)
9. [Lookup / Combobox / Master Data Rules](#9-lookup--combobox--master-data-rules)

### Implementation Standards
10. [Server Action Rules](#10-server-action-rules)
11. [UI/UX Guide Reference Rule](#11-uiux-guide-reference-rule)
12. [DMS Rule](#12-dms-rule)
13. [Performance Rules](#13-performance-rules)

### Testing and Quality Standards
14. [Testing Rules](#14-testing-rules)
15. [Browser / Playwright / Manual Testing Rule](#15-browser--playwright--manual-testing-rule)
16. [Error and Blocker Handling](#16-error-and-blocker-handling)
17. [Final Status Rules](#17-final-status-rules)

### Workflow and Governance Standards
18. [Prompt Writing Rules for Cursor](#18-prompt-writing-rules-for-cursor)
19. [Implementation Scope Control](#19-implementation-scope-control)
20. [Global Search Rule](#20-global-search-rule)
21. [AI-Ready Rule](#21-ai-ready-rule)
22. [Future Module Reuse Rule](#22-future-module-reuse-rule)
23. [Documentation Location Recommendation](#23-documentation-location-recommendation)

### Checklists
24. [Cursor Pre-Flight Checklist](#24-cursor-pre-flight-checklist)
25. [Cursor Completion Checklist](#25-cursor-completion-checklist)

---

## 1. PROJECT STACK AND ARCHITECTURE

### 1.1 Current Technology Stack

**Frontend** (verified snapshot at guide creation):
- Next.js 16.2.6 (App Router)
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui components
- Lucide React icons
- Sonner (toast notifications)
- date-fns (date formatting)

**Backend**:
- Next.js Server Actions
- Supabase PostgreSQL
- Supabase RLS (Row Level Security)
- Custom authentication using anon role (NOT standard Supabase Auth)

**Data & Validation** (verified snapshot at guide creation):
- Zod 4.4.3 (schema validation)
- @tanstack/react-table 8.21.3 (data tables)
- react-hook-form 7.76.1 (form management)

**Reporting** (verified snapshot at guide creation):
- jsPDF 4.2.1 (PDF generation)
- jspdf-autotable 5.0.8 (PDF tables)
- xlsx 0.18.5 (Excel export)

**Package Version Verification Rule**:
Package versions listed above are informational snapshots only (verified June 8, 2026).

**Before any dependency-sensitive implementation**, Cursor **MUST**:
- Re-check the current `package.json` and lockfile
- Verify package versions match the guide or note differences
- Follow the live project `package.json` if versions differ
- Do not assume package versions from this guide are still current
- Document any version differences in the implementation report

**Custom ERP Components**:
- ERPDataTable (data tables with search, filter, sort, pagination)
- ERPDrawerForm (main entity drawer, 80vw width)
- ERPDrawerSectionNav (vertical tab navigation)
- ERPDrawerSection (content sections)
- ERPFieldGrid (responsive form field grid)
- ERPFormFooter (standardized footer buttons)

**Custom ERP Infrastructure**:
- Global numbering engine (simple reference generation: CUST-000001, VEND-000001, etc.)
- Audit logging system (audit_logs table)
- Permission/role system (roles, permissions, role_permissions, user_roles)
- Global lookup system (global_lookup_categories, global_lookup_values)

### 1.2 Project Scripts

**Verified Scripts** (from `package.json`):
```bash
npm run dev          # Development server
npm run build        # Production build
npm run lint         # ESLint check
npm run typecheck    # TypeScript type check
```

**Always use these exact scripts** when testing. Do not assume different script names.

### 1.3 Architecture Patterns

**Page Structure**:
```
/admin/[module]/[entity]/page.tsx
├─ Page Header (title, breadcrumb, actions)
├─ ERPDataTable (list view with search, filter, sort)
└─ ERPDrawerForm (drawer for Add/Edit/View, 80vw width)
   ├─ Drawer Header (mode, record number, status, actions)
   ├─ ERPDrawerSectionNav (vertical tabs)
   ├─ Drawer Body (scrollable sections)
   │  ├─ Basic Info section
   │  ├─ Related data sections (Location, Contacts, Finance, etc.)
   │  ├─ Documents section (placeholder until DMS)
   │  └─ Audit/System Info section
   └─ Drawer Footer (Cancel, Save, Save & Close)
```

**Server Action Pattern**:

**Server Action Path Source-of-Truth Rule**:
Use the existing project folder structure as the source of truth.

**Current Project Structure** (verified June 8, 2026):
```
src/server/actions/master-data/
├─ customers.ts
├─ customer-contacts.ts
├─ customer-addresses.ts
├─ customer-bank-details.ts
└─ [future entities].ts
```

**Alternate Pattern** (if used in other modules):
```
src/features/[module]/[entity]/actions.ts
```

**Rules**:
- Before creating or modifying server actions, inspect current modules and follow the closest existing pattern
- Do not force new server action paths if the module already follows an approved structure
- For party master/customer implementation, server actions are located under `src/server/actions/master-data/`
- If a future module uses another established pattern, document and follow that pattern consistently
- Do not create duplicate server action structures for the same type of entity

**Standard Functions**:
- `createEntity()`
- `updateEntity()`
- `deleteEntity()`
- `getEntity()`
- `getEntityList()`
- `getEntityChildren()` (for child records)

**Authentication Flow**:
- Custom authentication using Supabase anon role
- NOT using standard Supabase Auth
- Auth context via `getAuthContext()` from `@/lib/rbac/check`
- Permission checks via `hasPermission(authContext, "permission.code")`

---

## 2. MANDATORY LIVE SUPABASE VERIFICATION RULE

### 2.1 Connection Requirement

**CRITICAL**: Before **every** planning or implementation task, Cursor **MUST**:

1. **Connect to live Supabase project**: `https://mmiefuieduzdiiwnqpie.supabase.co`
2. **Inspect actual live schema** for target tables
3. **Verify required tables, columns, views, functions, indexes, triggers, RLS policies, permissions, and seed data**
4. **Do not assume from old reports only** - reports can be outdated
5. **If live schema does not match plan, STOP and generate correction/report before implementation**

### 2.2 How to Connect

**MCP Tool** (preferred):
```javascript
// Use Supabase MCP server: user-supabase
CallMcpTool({
  server: "user-supabase",
  toolName: "list_tables"
})

CallMcpTool({
  server: "user-supabase",
  toolName: "execute_sql",
  arguments: {
    sql: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position"
  }
})
```

### 2.3 What to Verify

**For Database Tasks**:
- [ ] Target table exists
- [ ] All required columns exist with correct data types
- [ ] Foreign key relationships exist
- [ ] Indexes exist (check `pg_indexes`)
- [ ] RLS policies exist (check `pg_policies`)
- [ ] Required functions exist
- [ ] Numbering rules configured (if applicable)
- [ ] Lookup values seeded (if applicable)

**For UI Tasks**:
- [ ] Target entity table exists
- [ ] Child tables exist (if applicable)
- [ ] Required lookup categories/values exist
- [ ] Numbering rules configured (if codes are auto-generated)

### 2.4 Required Statement in Every Report

Every implementation report **MUST** include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was verified before [planning/implementation].
```

### 2.5 Failure to Connect

If Supabase connection fails:
- Still attempt implementation if source code and guides provide enough context
- Clearly state in report: `WARNING — Live Supabase verification could not be completed during this implementation.`
- Recommend follow-up verification

---

## 3. SOURCE OF TRUTH RULE

### 3.1 Priority Order

When conflicts arise, follow this source priority:

| Priority | Source | Description |
|----------|--------|-------------|
| **1** | **Live Supabase schema** | Actual database structure is always the truth |
| **2** | **Current source code** | Existing TypeScript/React files in `src/` |
| **3** | **Latest approved guide files** | `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`, this guide |
| **4** | **Latest approved implementation reports** | Most recent phase implementation reports |
| **5** | **Older plans/reports** | Historical reference only, may be outdated |

### 3.2 When Sources Conflict

**If live database differs from plan**:
- Trust live database
- Stop implementation
- Create schema mismatch report
- Request clarification/correction

**If current code differs from guide**:
- Trust guide for new implementations
- Update existing code to match guide (if in scope)
- Document discrepancy if not updating

**If old report differs from live database**:
- Trust live database
- Note that report is outdated
- Use live database as reference

### 3.3 Never Trust Old Plans Blindly

**Do NOT**:
- Assume a table exists because an old plan mentions it
- Assume a column has a certain data type from old documentation
- Implement based on 6-month-old requirements without verification

**DO**:
- Verify live schema first
- Read current source code
- Check latest guides
- Use old plans as historical context only

---

## 4. PHASE-GATED WORKFLOW

### 4.1 Standard Workflow

Every ERP phase follows this strict sequence:

```
1. Planning Prompt
   ↓
2. Plan File Generated
   ↓
3. Sameer/Dina Review
   ↓
4. Correction Prompt (if needed) → back to step 2
   ↓
5. Implementation Prompt (only after approval)
   ↓
6. Implementation Report Generated
   ↓
7. Review Report
   ↓
8. Close Phase (only after approval)
```

### 4.2 Phase Closure Rule

**A phase is NOT closed until**:
- Implementation report exists
- Report status is PASS or PASS WITH NOTES
- Sameer/Dina has reviewed and approved
- All deliverables are documented

**Do NOT**:
- Say "I completed it" without file evidence
- Close phase without report
- Automatically proceed to next phase

### 4.3 Partial Implementation

**If implementation is partial**:
- Clearly mark report status as `PARTIAL`
- Document what was completed
- Document what was NOT completed
- Document reason for partial completion
- Document follow-up phase for remaining work

---

## 5. FILE AND REPORT RULES

### 5.1 Mandatory Reports

**Every implementation phase MUST create a report** with this naming pattern:

```
[PHASE_ID]_[MODULE]_IMPLEMENTATION_REPORT.md

Examples:
ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_COMPLETE_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3A_CUSTOMER_CHILD_ADD_EDIT_FORMS_IMPLEMENTATION_REPORT.md
```

### 5.2 Required Report Sections

Every implementation report **MUST** include:

```markdown
# [PHASE_ID]_[MODULE]_IMPLEMENTATION_REPORT

## 1. Phase Information
- Phase ID
- Report Date
- Report Status

## 2. Supabase Connection Confirmation
- Connection status
- Live database verification summary

## 3. Implementation Summary
- What was implemented
- Key achievements

## 4. Files Created/Modified
- Complete list with paths

## 5. Database Changes
- Migrations run
- Indexes created
- RLS policies created
- Functions created
- Seed data inserted

## 6. Testing Results
- Typecheck result
- Lint result
- Build result
- Browser/manual test results

## 7. Known Issues/Limitations
- Any issues encountered
- Any limitations to note

## 8. Next Steps
- Follow-up work needed
- Related phases

## 9. Final Status
- PASS / PASS WITH NOTES / FAIL / BLOCKED / PARTIAL
```

### 5.3 Report Location

**Recommended Default Location**:
```
implementation_Review/Phase_[PHASE_ID]_Implementation/[REPORT_NAME].md

Example:
implementation_Review/Phase_002F_3E_2C_Implementation/ERP_BASE_002F_3E_2C_GLOBAL_MASTER_DATA_NUMBERING_IMPLEMENTATION_REPORT.md
```

**Report Location Flexibility Rule**:
- Use the existing project report structure if one is already established for the current phase/module
- If no structure exists, use the recommended `implementation_Review/Phase_[PHASE_ID]_Implementation/` path
- Do not create duplicate report folders for the same phase
- If report location differs from the recommended path, document the actual location in the implementation report
- Maintain consistency within the same phase/module family

### 5.4 No Report = Phase Not Closed

**If no report exists**:
- Phase is not considered complete
- Implementation may have been done but is not verified
- Cannot proceed to dependent phases
- Must create retrospective report if needed

---

## 6. DATABASE AND MIGRATION RULES

### 6.1 Destructive SQL Prohibition

**NEVER run destructive SQL without explicit approval**:

❌ **Forbidden (unless explicitly approved)**:
- `DROP TABLE`
- `DROP COLUMN`
- `TRUNCATE TABLE`
- `DELETE FROM` (for bulk deletes)
- `ALTER COLUMN ... TYPE` (data loss risk)
- `ALTER COLUMN ... SET NOT NULL` (without checking data)

✅ **Safe Operations**:
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `INSERT ... ON CONFLICT DO NOTHING`
- `UPDATE` (with specific WHERE clause)
- `CREATE OR REPLACE FUNCTION`

### 6.2 Migration Idempotency

**All migrations should be idempotent where practical**:

```sql
-- Good: Idempotent
CREATE TABLE IF NOT EXISTS customers (...);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_code
  ON customers(customer_code);

INSERT INTO global_lookup_categories (category_code, category_name_en)
VALUES ('CUSTOMER_TYPE', 'Customer Type')
ON CONFLICT (category_code) DO NOTHING;

-- Bad: Not idempotent (fails on second run)
CREATE TABLE customers (...);
ALTER TABLE customers ADD COLUMN new_column TEXT;
INSERT INTO global_lookup_categories (...);
```

### 6.3 Schema Verification Before SQL

**Before writing any SQL**:
1. Connect to live Supabase
2. Inspect actual live schema
3. Check if table/column/index/function already exists
4. Write SQL that accounts for existing state

**Do NOT**:
- Assume column doesn't exist
- Invent column names
- Assume helper functions exist
- Create duplicate numbering systems
- Create duplicate lookup categories

### 6.4 Migration File Naming

**Standard naming pattern**:
```
supabase/migrations/[YYYYMMDDHHMMSS]_[phase_id]_[description].sql

Example:
supabase/migrations/20260608105300_erp_base_002f3e2c_global_master_data_numbering_rules.sql
```

**Timestamp format**: `YYYYMMDDHHMMSS` (14 digits)

### 6.5 Migration Verification

**After running migration**:
- Verify tables created
- Verify columns created
- Verify indexes created (check `pg_indexes`)
- Verify RLS policies created (check `pg_policies`)
- Verify functions created
- Verify seed data inserted
- Document verification in report

### 6.6 Rollback Planning

**When migration affects existing production-like data**:
- Plan rollback strategy
- Document rollback steps in migration header comment
- Consider data backup strategy
- Test migration on development environment first (if available)

---

## 7. RLS AND PERMISSION RULES

### 7.1 Authentication Model

**CRITICAL**: This ERP uses **anon role with custom authentication**, NOT standard Supabase Auth.

**Auth Flow**:
```typescript
// Get auth context
const ctx = await getAuthContext();

// Check authentication
if (!ctx.authenticated) {
  return { success: false, error: "Authentication required" };
}

// Check permission
if (!hasPermission(ctx, "master_data.party_master.manage")) {
  return { success: false, error: "Permission denied" };
}
```

**Auth Context Structure** (example only - **verify actual source code before use**):
```typescript
// EXAMPLE - actual shape may differ
{
  profile: UserProfile | null,
  roleCodes: string[],        // Actual field name in current implementation
  permissionCodes: string[]   // Actual field name in current implementation
}

// OR another possible shape:
{
  authenticated: boolean,
  profile: { id, email, full_name, ... } | null,
  roles: string[],
  permissions: string[]
}
```

**Auth Context Shape Verification Rule**:
Always inspect the actual `getAuthContext()` return shape before using role or permission fields.

**Do NOT assume**:
- Property is named `permissions` (it might be `permissionCodes`)
- Property is named `roles` (it might be `roleCodes`)
- Property is named `profile` or `user`
- An `authenticated` boolean exists

**MUST DO**:
- Read `src/lib/rbac/check.ts` (or equivalent) to verify TypeScript types
- Check the actual return type of `getAuthContext()`
- Use the live source code and TypeScript types as source of truth
- If the auth context shape differs from examples in this guide, follow the live source code
- Document the actual shape in the implementation report

### 7.2 RLS Policy Requirements

**When creating RLS policies**:
- Policies must work with **anon role** and custom auth flow
- Do NOT create policies that only work with `authenticated` role
- Policies must check custom session/context
- Policies must respect user roles and permissions

**Example Pattern** (consult existing policies for exact pattern):
```sql
CREATE POLICY "Users can view customers based on permission"
ON customers FOR SELECT
TO anon
USING (
  -- Custom auth check via function
  -- Example only - verify actual pattern in live database
  EXISTS (
    SELECT 1 FROM check_user_permission('master_data.party_master.view')
  )
);
```

### 7.3 Three-Layer Security

**Security is enforced at three layers**:

| Layer | Purpose | Type |
|-------|---------|------|
| **UI** | Hide buttons/actions user cannot perform | UX only (NOT security) |
| **Server Actions** | Check auth context and permissions before execution | Security |
| **Database RLS** | Enforce access at database level | Security |

**UI Permissions**:
```typescript
{hasPermission(authContext, "master_data.party_master.manage") && (
  <Button onClick={handleAdd}>Add Customer</Button>
)}
```

**Server Action Permissions**:
```typescript
export async function createCustomer(input: unknown) {
  const ctx = await getAuthContext();
  if (!ctx.authenticated) {
    return { success: false, error: "Authentication required" };
  }
  if (!hasPermission(ctx, "master_data.party_master.manage")) {
    return { success: false, error: "Permission denied" };
  }
  // ... proceed with creation
}
```

**RLS Enforcement**: Automatic at database level

### 7.4 Permission Verification

**Before implementation**:
- Check which permissions apply to the module
- Verify permission codes exist in `permissions` table
- Verify role_permissions mappings exist
- Test with different user roles

---

## 8. NUMBERING RULES

### 8.1 Global Numbering Engine Only

**Use global numbering engine for all reference codes**:

**Numbering Tables**:
- `global_numbering_rules` - Configuration
- `global_numbering_sequence_states` - Sequence state
- `global_numbering_generated_references` - Audit trail

**Numbering Functions**:
- `preview_next_reference_number()` - Preview next code
- `generate_next_reference_number()` - Generate and reserve code

**Do NOT**:
- Create hardcoded numbering logic
- Create module-specific numbering systems
- Use database sequences directly
- Generate codes in application code

### 8.2 Standard Code Formats

**Simple format (no year/month/company/branch unless explicitly requested)**:

**Examples only — actual format must be verified from live `global_numbering_rules` before implementation**:

```
CUST-000001  (Customer)
VEND-000001  (Vendor)
SUBC-000001  (Subcontractor)
CONS-000001  (Consultant)
AUTH-000001  (Government Authority)
AGCY-000001  (Recruitment Agency)
CONT-000001  (Contact - if globally unique)
EMP-0001     (Employee)
BR-0001      (Branch)
ORG-0001     (Owner Company/Organization)
PO-0001      (Purchase Order)
INV-0001     (Invoice)
```

**Format pattern**: `{PREFIX}-{SEQUENCE}`

**Sequence padding**:
- Master data: 6 digits (`000001`)
- Transactions: 4 digits (`0001`) - already configured

**Live Numbering Rule Source-of-Truth**:
Use the live `global_numbering_rules` configuration as the source of truth for:
- Document type codes
- Prefixes
- Sequence length
- Format template
- Reset policy
- Active status

**CRITICAL RULES**:
- Do not change existing ORG, BR, EMP, party-master, or transaction numbering formats unless Sameer explicitly approves
- If this guide shows an example that differs from live `global_numbering_rules`, follow the live database
- Document any differences in the implementation report
- Always verify numbering rule configuration before implementing code generation

### 8.3 Server Action Integration

**Standard pattern for generating codes**:

```typescript
export async function createCustomer(input: unknown) {
  // ... validation and auth checks
  
  // Generate code BEFORE insert
  const numberingResult = await generateNextReference({
    documentTypeCode: "CUSTOMER",
    targetTableName: "customers",
    generationReason: "Customer creation",
  });

  if (!numberingResult.success) {
    return { 
      success: false, 
      error: "Failed to generate customer code" 
    };
  }

  const customer_code = numberingResult.data.generatedReferenceNumber;

  // Insert with generated code
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert({ ...validatedData, customer_code })
    .select()
    .single();

  return { success: true, data: newCustomer };
}
```

### 8.4 Code Field UI Behavior

**Add Mode**:
- Field is read-only/disabled
- Shows placeholder: `"Auto-generated on save"`
- No user input allowed

**Edit Mode**:
- Field is read-only/disabled
- Shows actual code value
- No user input allowed

**View Mode**:
- Field is read-only/disabled
- Shows actual code value

**Code is IMMUTABLE** - never changes after creation.

### 8.5 Update Actions Must Not Regenerate Codes

```typescript
export async function updateCustomer(data: UpdateCustomerInput) {
  // Code is immutable - do NOT regenerate
  const { customer_code, ...updateData } = data; // Remove code from update
  
  const { data: updatedCustomer, error } = await supabase
    .from("customers")
    .update(updateData)
    .eq("id", data.id)
    .select()
    .single();
  
  return { success: true, data: updatedCustomer };
}
```

---

## 9. LOOKUP / COMBOBOX / MASTER DATA RULES

### 9.1 Combobox Everywhere (from UI/UX Guide)

**CRITICAL DECISION**: ALL selectable fields must use Combobox behavior, not traditional dropdowns.

**Applies to**:
- Lookup values (customer types, industry types, segments, etc.)
- Countries, Emirates, Cities, Areas/Zones
- Banks, Currencies, Payment Terms, Tax Types
- Customers, Vendors, Employees (entity selection)
- ALL future selectable fields

**No Exceptions**: No record count threshold. Even 5-item lists must use Combobox.

### 9.2 No Hardcoded Dropdown Values

**Do NOT**:
```typescript
// BAD: Hardcoded values
<Select>
  <SelectItem value="TYPE1">Type 1</SelectItem>
  <SelectItem value="TYPE2">Type 2</SelectItem>
</Select>
```

**DO**:
```typescript
// GOOD: Dynamic from database
<LookupCombobox 
  categoryCode="CUSTOMER_TYPE" 
  value={customerType}
  onValueChange={setCustomerType}
  required
/>
```

### 9.3 Lookup System

**Lookup Tables**:
- `global_lookup_categories` - Lookup categories (e.g., CUSTOMER_TYPE)
- `global_lookup_values` - Individual values within categories

**Master Data Tables**:
- `countries`, `emirates`, `cities`, `areas_zones`
- `banks`, `currencies`, `payment_terms`, `tax_types`

**Shared Components**:
- `LookupCombobox` - For global lookup values
- `CountryCombobox` - For countries
- `EmirateCombobox` - For emirates
- `CityCombobox` - For cities
- `AreaZoneCombobox` - For areas/zones
- `BankCombobox` - For banks
- `CurrencyCombobox` - For currencies
- `PaymentTermCombobox` - For payment terms
- `TaxTypeCombobox` - For tax types

### 9.4 Combobox Required Features

Every Combobox **MUST** support:
- ✅ Search by code
- ✅ Search by English name
- ✅ Search by Arabic name (where available)
- ✅ Keyboard navigation (up/down arrows, Enter, Escape)
- ✅ Clear option for optional fields
- ✅ Loading state
- ✅ Empty / "No results found" state
- ✅ Disabled state
- ✅ Read-only state
- ✅ RLS-safe data loading

### 9.5 Before Creating New Lookup Category

**Check if category already exists**:
```sql
SELECT * FROM global_lookup_categories 
WHERE category_code = 'YOUR_CATEGORY';
```

**If category doesn't exist**:
- Add to migration
- Seed initial values
- Document in report

---

## 10. SERVER ACTION RULES

### 10.1 Standard Server Action Pattern

**Every mutation server action MUST**:

1. ✅ Validate input using Zod
2. ✅ Check auth context
3. ✅ Check permissions
4. ✅ Use RLS-safe Supabase client
5. ✅ Use live schema fields (verify first)
6. ✅ Generate reference numbers using global numbering engine (if applicable)
7. ✅ Insert/update with audit fields (created_by, updated_by, created_at, updated_at)
8. ✅ Log audit (optional but recommended)
9. ✅ Revalidate path
10. ✅ Return typed `ActionResult<T>`
11. ✅ Handle errors clearly

### 10.2 Complete Example

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { generateNextReference } from "@/lib/numbering/generate";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { createCustomerSchema } from "./validation";
import type { ActionResult, Customer } from "./types";

export async function createCustomer(
  input: unknown
): Promise<ActionResult<Customer>> {
  try {
    // 1. Validate input
    const validated = createCustomerSchema.parse(input);

    // 2. Get auth context
    const ctx = await getAuthContext();
    if (!ctx.authenticated) {
      return { success: false, error: "Authentication required" };
    }

    // 3. Check permission
    if (!hasPermission(ctx, "master_data.party_master.manage")) {
      return { success: false, error: "Permission denied" };
    }

    // 4. Create Supabase client (RLS-safe)
    const supabase = await createClient();

    // 5. Generate code
    const numberingResult = await generateNextReference({
      documentTypeCode: "CUSTOMER",
      targetTableName: "customers",
      generationReason: "Customer creation",
    });

    if (!numberingResult.success) {
      return { success: false, error: "Failed to generate customer code" };
    }

    const customer_code = numberingResult.data.generatedReferenceNumber;

    // 6. Insert record with audit fields
    const { data, error } = await supabase
      .from("customers")
      .insert({
        ...validated,
        customer_code,
        created_by: ctx.profile?.id ?? null,
        updated_by: ctx.profile?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    // 7. Audit log (optional)
    await logAudit({
      action: "create",
      module_code: "master_data",
      entity_type: "customer",
      entity_id: data.id,
      entity_name: data.customer_name_en,
      description: `Created customer ${data.customer_code}`,
      changes: validated,
    });

    // 8. Revalidate path
    revalidatePath("/admin/master-data/party/customers");

    // 9. Return typed result
    return { success: true, data };
  } catch (error) {
    console.error("Create customer error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create customer",
    };
  }
}
```

### 10.3 ActionResult Type

```typescript
export type ActionResult<T = void> = 
  | { success: true; data: T }
  | { success: false; error: string };
```

### 10.4 Validation Schema Pattern

```typescript
import { z } from "zod";

export const customerBaseSchema = z.object({
  customer_name_en: z.string().min(1, "Customer name is required").max(255),
  customer_name_ar: z.string().max(255).optional().nullable(),
  customer_type_code: z.string().min(1, "Customer type is required"),
  // ... other fields
});

export const createCustomerSchema = customerBaseSchema;

export const updateCustomerSchema = customerBaseSchema.partial().extend({
  id: z.number(),
  is_active: z.boolean().optional(),
});
```

---

## 11. UI/UX GUIDE REFERENCE RULE

### 11.1 Mandatory Reference

**Every UI implementation MUST follow**:
```
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

**Before implementing any UI**, read these key sections:
1. Global Screen Architecture Standard
2. Global Drawer Form Standard
3. Global Tab Standard
4. Global Child Record Add/Edit Standard
5. Global Modal/Dialog Sizing Standard
6. Global No-Horizontal-Scroll Rule
7. Global Required Field Standard
8. Global Combobox Standard (Everywhere)
9. Global Form Footer Button Standard
10. Global Safe Close and Unsaved Changes Standard

### 11.2 Most Important UI/UX Standards

**From UI/UX Guide - Non-Negotiable**:

✅ **Combobox everywhere** - ALL selectable fields use Combobox, no traditional dropdowns  
✅ **Required red asterisk (*)** - All required fields marked with red `*`  
✅ **Save / Save & Close / Cancel** - Standard footer buttons for Add/Edit modes  
✅ **Safe close and unsaved changes confirmation** - Prevent data loss  
✅ **720px child modal standard** - Standard width for child Add/Edit forms  
✅ **No horizontal scroll** - NEVER allow horizontal scrolling in forms/modals/drawers  
✅ **One entity = one drawer** - Do not create separate pages for one entity  
✅ **Related data = tabs** - Use tabs for different sections of same entity  
✅ **Child forms = dialogs** - Child Add/Edit use Dialog (not nested drawers)  
✅ **Documents placeholder until DMS** - Do not implement document upload yet  
✅ **Global search action standard** - Search results must be actionable  
✅ **AI-ready foundation** - Prepare for AI, do not implement AI yet

### 11.3 Reusable Components Required

**Use these shared components** (do not create duplicates):

```
ERPDrawerForm - Main entity drawer (80vw)
ERPDrawerSectionNav - Vertical tab navigation
ERPDrawerSection - Content sections
ERPDrawerBody - Scrollable body
ERPDrawerFooter - Action buttons footer
ERPFieldGrid - Responsive form field grid
ERPDataTable - Enterprise data table
LookupCombobox - Lookup value selection
CountryCombobox, EmirateCombobox, CityCombobox, AreaZoneCombobox - Geography
BankCombobox, CurrencyCombobox, PaymentTermCombobox, TaxTypeCombobox - Finance
ConfirmDiscardDialog - Unsaved changes confirmation
DocumentsPlaceholder - DMS placeholder component
AuditSystemInfoSection - Standard audit info display
```

---

## 12. DMS RULE

### 12.1 Document Management Prohibition

**Do NOT implement document upload until centralized DMS phase**.

**Do NOT**:
- Create storage bucket logic
- Implement file upload functionality
- Create document preview/download
- Create document versioning
- Create document workflow

**DO**:
- Keep Documents tabs as placeholder only
- Use standard documents placeholder component
- Show disabled Upload/View buttons with "Available after DMS implementation" message

### 12.2 Documents Placeholder Standard

```tsx
<ERPDrawerSection id="documents">
  <div className="p-6">
    <div className="flex items-center gap-2 mb-4">
      <FileText className="h-5 w-5 text-muted-foreground" />
      <h3 className="font-semibold">Document Management</h3>
    </div>
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {entityType} documents such as trade license, VAT certificate, 
        ICV certificate, agreements, and approvals will be uploaded and 
        managed through the centralized DMS (Document Management System).
      </p>
      <div className="flex gap-3">
        <Button variant="outline" disabled className="gap-2">
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
        <Button variant="outline" disabled className="gap-2">
          <FolderOpen className="h-4 w-4" />
          View Documents
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Available after DMS implementation.
      </p>
    </div>
  </div>
</ERPDrawerSection>
```

### 12.3 Future DMS Phase

**DMS will be centralized**:
- One DMS module for all entities
- Documents linked to parent records
- Document workflow, approval, expiry tracking
- Document search, preview, download
- Document versioning

**Do not implement entity-specific document systems**.

---

## 13. PERFORMANCE RULES

### 13.1 Parallel Loading for Drawers

**For drawer/tab modules**:
- Load related child data in **parallel** where practical (use `Promise.all`)
- Cache in parent drawer state
- Pass data to child components as props
- Refresh only affected child list after mutation

**Example Pattern**:
```typescript
// In main drawer component
const [contacts, setContacts] = useState<Contact[]>([]);
const [addresses, setAddresses] = useState<Address[]>([]);
const [bankDetails, setBankDetails] = useState<BankDetail[]>([]);

const loadAllData = async (entityId: number) => {
  setLoading(true);
  try {
    const [contactsResult, addressesResult, bankDetailsResult] = 
      await Promise.all([
        getContacts(entityId),
        getAddresses(entityId),
        getBankDetails(entityId)
      ]);
    
    if (contactsResult.success) setContacts(contactsResult.data || []);
    if (addressesResult.success) setAddresses(addressesResult.data || []);
    if (bankDetailsResult.success) setBankDetails(bankDetailsResult.data || []);
  } finally {
    setLoading(false);
  }
};

// Load on mount (edit/view modes only)
useEffect(() => {
  if (entityId && mode !== 'add') {
    loadAllData(entityId);
  }
}, [entityId, mode]);

// Pass to child components
<ContactsSection 
  contacts={contacts}
  onRefresh={() => loadAllData(entityId)}
/>
```

### 13.2 Database Index Verification

**Before adding new indexes**:
1. Check existing indexes: `SELECT * FROM pg_indexes WHERE tablename = 'your_table'`
2. Verify index doesn't already exist
3. Only add index if needed for performance

**Do NOT**:
- Add indexes blindly
- Create duplicate indexes
- Add indexes without checking existing schema

**DO**:
- Verify existing indexes first
- Create only necessary indexes
- Use `CREATE INDEX CONCURRENTLY` to avoid locking
- Document index purpose in migration comments

### 13.3 Performance Targets

**From UI/UX Guide**:
- Page load: < 2 seconds
- Drawer open: < 1 second
- Tab switching: < 100ms after initial load (instant)
- Form submission: < 1 second

---

## 14. TESTING RULES

### 14.1 Mandatory Tests

**ALWAYS run these tests before marking implementation as complete**:

```bash
npm run typecheck  # TypeScript type check
npm run lint       # ESLint check
npm run build      # Production build
```

**If any test fails**:
- Fix the errors
- Re-run tests
- Do NOT mark implementation as PASS until all tests pass

### 14.2 Test Results in Report

**Every report MUST include test results**:

```markdown
## Testing Results

- **TypeScript typecheck**: PASS / FAIL
  ```
  [output or error message if fail]
  ```

- **ESLint**: PASS / FAIL
  ```
  [output or error message if fail]
  ```

- **Next.js build**: PASS / FAIL
  ```
  [output or error message if fail]
  ```

- **Browser/Manual tests**: [documented below]
```

### 14.3 Build Errors Must Be Fixed

**If build fails**:
- Analyze error message
- Fix the error
- Re-run build
- Do not proceed until build passes

**Common build errors**:
- Missing imports
- TypeScript type errors
- Unused variables (if strict lint)
- Missing environment variables

---

## 15. BROWSER / PLAYWRIGHT / MANUAL TESTING RULE

### 15.1 UI Phase Testing Requirements

**For UI phases, Cursor must test**:
- [ ] Page loads without errors
- [ ] Drawer opens in Add mode
- [ ] Drawer opens in Edit mode
- [ ] Drawer opens in View mode
- [ ] Save button works
- [ ] Save & Close button works
- [ ] Cancel button works (with confirmation if dirty)
- [ ] Permissions hide/show appropriate actions
- [ ] Combobox search works
- [ ] No horizontal scrolling in any view
- [ ] Safe close behavior (confirmation if unsaved changes)
- [ ] Documents placeholder displays correctly
- [ ] Basic create/edit/delete operations work

### 15.2 Testing Methods

**Preferred** (if available):
- Use Playwright via `playwright-cli` or bundled wrapper script
- Automated browser testing

**Alternative** (if Playwright unavailable):
- Manual browser testing
- Document manual test steps and results

### 15.3 Testing Limitations

**If browser/manual testing cannot be performed**:
- Clearly state in report: `Browser/manual testing could not be performed during this implementation`
- List required manual tests for follow-up
- Mark report status as `PASS WITH NOTES` (not full PASS)
- Never mark implementation fully passed if browser testing is deferred and required

---

## 16. ERROR AND BLOCKER HANDLING

### 16.1 Implementation Status Rules

**Be honest about implementation status**:

| Status | When to Use |
|--------|-------------|
| **PASS** | All work completed, all tests passed, no known issues |
| **PASS WITH NOTES** | Work completed, tests passed, but minor notes/limitations documented |
| **PARTIAL** | Some work completed, some work NOT completed (document both) |
| **FAIL** | Implementation attempted but failed, critical errors encountered |
| **BLOCKED** | Cannot proceed due to blocker (missing dependency, schema mismatch, etc.) |

### 16.2 Partial Implementation

**If implementation is partial**:
- Mark status as `PARTIAL`
- Document what WAS completed
- Document what was NOT completed
- Document reason for partial completion
- Document follow-up phase ID for remaining work

**Example**:
```markdown
## Status

⚠️ **PARTIAL** — Customer module basic CRUD implemented. Child records (contacts, addresses, bank details) deferred to Phase 002F.3E.3A.

**Completed**:
- Customer main form Add/Edit/View
- Customer list page
- Customer code auto-generation
- Basic validation

**NOT Completed**:
- Child record forms (contacts, addresses, bank details)
- Documents tab (placeholder only)

**Reason**: Scope was too large for single phase. Split into 2 phases.

**Follow-up Phase**: ERP BASE 002F.3E.3A — Customer Child Add/Edit Forms
```

### 16.3 Blocker Report

**If blocked**:
- Stop immediately
- Create blocker report
- Document blocker clearly
- Recommend resolution
- Wait for approval before proceeding

**Example**:
```markdown
## Status

🚫 **BLOCKED** — Cannot implement vendor contacts because `vendor_contacts` table does not exist in live database.

**Blocker Details**:
- Expected table: `vendor_contacts`
- Actual status: Table not found in live Supabase schema
- Verified via: `SELECT * FROM information_schema.tables WHERE table_name = 'vendor_contacts'`

**Recommended Resolution**:
1. Run Vendor module database migration first
2. Verify `vendor_contacts` table exists
3. Then proceed with vendor contacts UI implementation

**Next Step**: Wait for schema correction before proceeding.
```

### 16.4 Schema Mismatch

**If live schema doesn't match plan**:
- STOP immediately
- Do NOT proceed with implementation
- Create schema mismatch report
- List expected vs actual schema
- Request clarification

---

## 17. FINAL STATUS RULES

### 17.1 Status Definitions

Every report must end with ONE of these statuses:

**✅ PASS**:
- All work completed as planned
- All tests passed (typecheck, lint, build)
- Browser/manual testing completed (if applicable)
- No known issues or limitations
- Ready for production

**✅ PASS WITH NOTES**:
- All work completed as planned
- All tests passed
- Minor notes or limitations documented (e.g., browser testing deferred)
- Follow-up not critical but recommended
- Acceptable for production with notes

**⚠️ PARTIAL**:
- Some work completed, some NOT completed
- Must clearly document both what was done and what wasn't
- Follow-up phase required for remaining work
- NOT ready for production without follow-up

**❌ FAIL**:
- Implementation attempted but failed
- Critical errors encountered
- Tests failed
- NOT ready for production
- Requires rework

**🚫 BLOCKED**:
- Cannot proceed due to blocker
- Blocker must be resolved first
- Implementation NOT attempted or partially attempted
- Requires external action (schema fix, dependency, approval)

### 17.2 Status Format in Report

```markdown
## 9. Final Status

✅ **PASS** — [Phase description] completed successfully.

**Summary**: [1-2 sentence summary of what was achieved]

**Date**: [Date]
**Approved By**: _________________

---

**END OF REPORT**
```

---

## 18. PROMPT WRITING RULES FOR CURSOR

### 18.1 Required Prompt Structure

**Every implementation prompt MUST state**:

```markdown
# PROMPT_[PHASE_ID]_[DESCRIPTION]

Act as [roles].

## Phase

[PHASE_ID] — [Description]

## Prompt Purpose

[Clear statement of purpose]

## Mandatory Supabase Connection First

Before implementation, connect to live Supabase project:
https://mmiefuieduzdiiwnqpie.supabase.co

Inspect [specific tables/schema to verify].

## Scope

[What IS in scope - be specific]

## Out of Scope

[What is NOT in scope - be specific]

## Files to Review

[List existing files to read for context]

## Files to Create/Update

[List files to create or modify]

## Implementation Rules

[Specific implementation requirements]

## Testing Rules

- Run npm run typecheck
- Run npm run lint
- Run npm run build
- [Any specific browser/manual tests]

## Required Report

Create: [REPORT_NAME].md

Must include:
- Supabase connection confirmation
- Files created/modified
- Database changes
- Testing results
- Known issues/limitations
- Final status

## Stop Condition

Stop after [specific completion point].
Do not [list what NOT to do].
```

### 18.2 Clear Scope Definition

**Every prompt must clearly define**:
- What IS being implemented
- What is NOT being implemented
- What files will be modified
- What database changes will be made

**Good Example**:
```markdown
## Scope
- Implement Vendor main form (Add/Edit/View)
- Implement vendor code auto-generation
- Implement vendor list page
- Create vendor server actions
- Create vendor validation schemas

## Out of Scope
- Vendor contacts (deferred to next phase)
- Vendor addresses (deferred to next phase)
- Vendor bank details (deferred to next phase)
- Vendor documents (placeholder only until DMS)
```

---

## 19. IMPLEMENTATION SCOPE CONTROL

### 19.1 Strict Scope Adherence

**Do NOT**:
- ❌ Implement extra modules not in scope
- ❌ Start next phase automatically
- ❌ Expand scope without approval
- ❌ "Improve" unrelated files unless required
- ❌ Implement Vendors while working on Customers (unless explicitly scoped)
- ❌ Create "convenience" features not in plan

**DO**:
- ✅ Follow scope exactly as defined in prompt
- ✅ Stop when scope is complete
- ✅ Document deferred work in report
- ✅ Request approval before expanding scope

### 19.2 When You Want to Expand Scope

**If you identify additional work that should be done**:
- Document it in report under "Recommendations" or "Future Enhancements"
- Do NOT implement it automatically
- Wait for approval in next prompt

### 19.3 Scope Creep Prevention

**Example of scope creep** (what NOT to do):

❌ **Bad**:
```
Prompt: Implement Customer module
Cursor: "I also implemented Vendors and Subcontractors since they're similar"
```

✅ **Good**:
```
Prompt: Implement Customer module
Cursor: Implements Customer module only
Report: "Recommendation: Vendors and Subcontractors can follow same pattern. Ready for implementation after approval."
```

---

## 20. GLOBAL SEARCH RULE

### 20.1 Global Search Is Future Phase

**Do NOT implement global search now** unless explicitly requested.

**Future Phase**: `ERP BASE 002F.3E.3C — Global Search / Command Palette Foundation`

**Timing**: After multiple master data modules (Customers, Vendors, Subcontractors, Consultants, etc.) are complete

### 20.2 Global Search Action Standard

**When global search IS implemented**, it must follow this standard:

**Search result must open related record**:
- **Parent result** → Opens parent drawer in View mode
- **Child result** → Opens parent drawer and activates related tab
- **Document result** (later) → Opens parent drawer and activates Documents tab
- **Results must respect RLS and permissions** - if user cannot view, result doesn't appear

**Examples**:
- `CUST-000001` → Opens Customers page and Customer drawer in View mode
- Customer contact email → Opens related Customer drawer and activates Contacts tab
- Customer address → Opens related Customer drawer and activates Location tab
- Customer bank IBAN → Opens related Customer drawer and activates Finance tab

**Technical Requirements**:
- Search results metadata must include entity type, entity ID, parent info (if child), module route, target tab ID
- Results must be actionable (not display-only)
- Clicking a result opens the record directly
- Deep-linking or route-state support required

---

## 21. AI-READY RULE

### 21.1 AI Is Future Phase

**Do NOT implement AI now** unless explicitly requested.

**Future Phase**: `ERP BASE 002F.Future — AI-Ready ERP Assistant / AI Form Fill Foundation`

**Timing**: After DMS foundation and Global Search foundation

### 21.2 AI-Ready Foundation

**Prepare app for AI through**:
- ✅ Clean master data structure
- ✅ Global search registry (future)
- ✅ Audit logs (complete history)
- ✅ DMS readiness (document placeholders)
- ✅ Standard form metadata (predictable fields)
- ✅ Permissions model (secure AI access)
- ✅ Well-documented modules

**Do NOT implement now**:
- ❌ AI form fill
- ❌ AI document extraction
- ❌ AI customer/vendor summary
- ❌ AI DMS search
- ❌ AI compliance expiry insights
- ❌ AI report generation

### 21.3 First AI Feature Recommendation

**AI form fill / document extraction** should come after DMS foundation.

**Example future flow**:
1. User uploads trade license PDF
2. AI extracts: company name, license number, TRN, expiry date, address, contact
3. Pre-fills customer form
4. User reviews and saves

**Do not implement this now**.

---

## 22. FUTURE MODULE REUSE RULE

### 22.1 Customer Module as Template

**Customers module is the first party-master template**.

**Future party master modules MUST reuse the pattern**:
- Vendors
- Subcontractors
- Consultants
- Government Authorities
- Recruitment Agencies

### 22.2 Standard Pattern

**All party master modules MUST follow**:

**Screen Structure**:
- One list screen (`/admin/master-data/party/[entity]/page.tsx`)
- One drawer (ERPDrawerForm, 80vw width)
- Tabs for different sections
- Child dialogs for related records (contacts, addresses, bank details)

**Features**:
- Comboboxes for all selectable fields
- Auto-generated code using global numbering
- Permissions checks (UI, server actions, RLS)
- Audit logging
- Standard validation
- Documents placeholder

**Implementation Approach**:
1. Copy Customer module structure
2. Adapt to entity-specific requirements
3. Follow all standards in this guide
4. Follow all UI/UX standards in UI/UX guide
5. Create implementation report

### 22.3 Module Reuse Checklist

When implementing future party master module:
- [ ] Copy Customer module structure as starting point
- [ ] Adapt table names, types, validation schemas
- [ ] Configure numbering rule in global_numbering_rules
- [ ] Create lookup categories/values if needed
- [ ] Follow same tab structure (Basic Info, Location, Contacts, Finance, Compliance, Documents, Audit)
- [ ] Use same child dialog pattern for contacts/addresses/bank details
- [ ] Use same combobox components
- [ ] Follow same permission checks
- [ ] Follow same audit logging pattern
- [ ] Create comprehensive implementation report

---

## 23. DOCUMENTATION LOCATION RECOMMENDATION

### 23.1 Recommended Folder Structure

**Store standards under**:
```
docs/
├─ standards/
│  ├─ ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
│  ├─ ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
│  └─ README.md (index of all standards)
└─ ...
```

**Store implementation reports under**:
```
implementation_Review/
├─ Phase_[PHASE_ID]_Planning/
│  ├─ [PLANNING_FILES].md
│  └─ ...
├─ Phase_[PHASE_ID]_Implementation/
│  ├─ [IMPLEMENTATION_REPORTS].md
│  └─ ...
└─ ...
```

**Store prompts under**:
```
ChatGPT/
├─ PROMPT_[PHASE_ID]_[DESCRIPTION].md
├─ Phase_[PHASE_ID]_Planning/
│  ├─ [PLANNING_FILES].md
│  └─ ...
└─ ...
```

### 23.2 README.md for Standards

**Create `docs/standards/README.md`**:
```markdown
# ERP Development Standards

Official standards and guides for ALGT ERP development.

## Mandatory References

All ERP development must follow these standards:

1. **[ERP Global Cursor Development and Implementation Guide](./ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md)**
   - Development workflow
   - Implementation standards
   - Database and migration rules
   - Testing requirements
   - Reporting and governance

2. **[ERP Global UI/UX Form, Table, and Drawer Development Guide](./ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md)**
   - Design system standards
   - Component patterns
   - UI/UX best practices
   - Accessibility standards

## How to Use

Before starting any ERP task:
1. Read the relevant sections of both guides
2. Connect to live Supabase project
3. Verify current schema and code
4. Follow standards exactly
5. Create comprehensive report

---

Last Updated: June 8, 2026
```

---

## 24. CURSOR PRE-FLIGHT CHECKLIST

**BEFORE starting any implementation, Cursor MUST complete this checklist**:

```
Cursor Pre-Flight Checklist for Phase [PHASE_ID]

Connection and Verification:
[ ] Connected to Supabase (https://mmiefuieduzdiiwnqpie.supabase.co)
[ ] Live schema inspected for target tables/columns
[ ] Source files inspected for current patterns
[ ] UI/UX guide read (relevant sections)
[ ] Cursor development guide read (this document)

Scope Confirmation:
[ ] Scope clearly defined and understood
[ ] Out-of-scope confirmed and documented
[ ] Files to create/modify identified
[ ] Database changes identified (if any)

Safety Checks:
[ ] No destructive SQL planned (unless explicitly approved)
[ ] Permissions/RLS verified for target entities
[ ] Numbering/lookup rules verified (if applicable)
[ ] Existing code patterns reviewed

Testing Preparation:
[ ] Testing commands known (typecheck, lint, build)
[ ] Browser/manual testing plan defined (if applicable)
[ ] Report file name planned

Ready to Proceed:
[ ] All above items checked
[ ] Prompt scope understood
[ ] Implementation approach clear
[ ] Stop condition known

---

Date: [Date]
Phase: [PHASE_ID]
```

**Do NOT proceed with implementation until all items are checked**.

---

## 25. CURSOR COMPLETION CHECKLIST

**AFTER completing implementation, Cursor MUST complete this checklist**:

```
Cursor Completion Checklist for Phase [PHASE_ID]

Implementation:
[ ] All scope items completed
[ ] Files created/modified listed
[ ] Database changes documented (if any)
[ ] Supabase verification included in report

Testing:
[ ] npm run typecheck executed → result: [PASS/FAIL]
[ ] npm run lint executed → result: [PASS/FAIL]
[ ] npm run build executed → result: [PASS/FAIL]
[ ] Browser/manual tests documented (if applicable)

Quality:
[ ] No destructive SQL used (or explicitly approved)
[ ] RLS/permissions verified
[ ] Code follows UI/UX guide standards
[ ] Code follows Cursor development guide standards

Documentation:
[ ] Known limitations documented
[ ] Out-of-scope items documented
[ ] Recommendations for future work documented (if any)
[ ] Final status included (PASS / PASS WITH NOTES / PARTIAL / FAIL / BLOCKED)

Report:
[ ] Report file created with correct name
[ ] All required report sections included
[ ] Supabase connection confirmation included
[ ] Files created/modified listed
[ ] Database changes listed
[ ] Testing results included
[ ] Final status clearly stated

Stop Condition:
[ ] Stop condition from prompt followed
[ ] Did not implement out-of-scope items
[ ] Did not start next phase automatically

Ready for Review:
[ ] All above items checked
[ ] Report complete
[ ] Implementation ready for Sameer/Dina review

---

Date: [Date]
Phase: [PHASE_ID]
Status: [PASS / PASS WITH NOTES / PARTIAL / FAIL / BLOCKED]
```

**Do NOT submit report until all items are checked**.

---

## APPENDIX A: COMMON PATTERNS

### A.1 Server Action Pattern

See Section 10.2 for complete example.

### A.2 Combobox Pattern

```typescript
<LookupCombobox 
  categoryCode="CUSTOMER_TYPE" 
  value={customerType}
  onValueChange={setCustomerType}
  required
  disabled={isViewing}
/>
```

### A.3 ERPDrawerForm Pattern

```tsx
<ERPDrawerForm
  open={isDrawerOpen}
  onOpenChange={setIsDrawerOpen}
  title="Customer"
  subtitle={mode === 'add' ? "Create new customer" : customer?.customer_name_en}
  mode={mode}
  status={customer?.status_code}
  recordNumber={customer?.customer_code}
>
  <ERPDrawerSectionNav sections={sections} />
  
  <ERPDrawerBody>
    <ERPDrawerSection id="basic-info">
      {/* Basic info fields */}
    </ERPDrawerSection>
    
    <ERPDrawerSection id="contacts">
      {/* Child records */}
    </ERPDrawerSection>
    
    {/* ... other sections */}
  </ERPDrawerBody>
  
  <ERPDrawerFooter
    mode={mode}
    isSubmitting={isSubmitting}
    onCancel={handleCancel}
    onSave={handleSave}
    onSaveAndClose={handleSaveAndClose}
  />
</ERPDrawerForm>
```

### A.4 Child Dialog Pattern

```tsx
<Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
  <DialogContent className="sm:max-w-[720px] max-h-[85vh]">
    <DialogHeader>
      <DialogTitle>{editMode ? "Edit" : "Add"} Contact</DialogTitle>
      <DialogDescription>
        {editMode ? "Update contact information" : "Add a new contact"}
      </DialogDescription>
    </DialogHeader>
    
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* Form fields */}
      </div>
      
      <ERPFormFooter
        mode={editMode ? "edit" : "add"}
        isSubmitting={isSubmitting}
        onCancel={handleCancel}
        onSave={() => handleSave(false)}
        onSaveAndClose={() => handleSave(true)}
      />
    </form>
  </DialogContent>
</Dialog>

<ConfirmDiscardDialog
  open={showConfirmDiscard}
  onOpenChange={setShowConfirmDiscard}
  onConfirm={handleConfirmDiscard}
/>
```

---

## APPENDIX B: TESTING COMMAND REFERENCE

### B.1 Standard Testing Commands

```bash
# TypeScript type check
npm run typecheck

# ESLint check
npm run lint

# Production build
npm run build

# Development server
npm run dev

# Bootstrap admin user (one-time)
npm run bootstrap:admin
```

### B.2 Supabase MCP Commands

```typescript
// List all tables
CallMcpTool({ server: "user-supabase", toolName: "list_tables" })

// Execute SQL query
CallMcpTool({ 
  server: "user-supabase", 
  toolName: "execute_sql",
  arguments: { sql: "SELECT * FROM customers LIMIT 10" }
})

// Get project URL
CallMcpTool({ server: "user-supabase", toolName: "get_project_url" })
```

---

## APPENDIX C: REPORT TEMPLATE

```markdown
# [PHASE_ID]_[MODULE]_IMPLEMENTATION_REPORT

---

## 1. Phase Information

**Phase**: [PHASE_ID] — [Description]

**Report Date**: [Date] [Time] UTC+4

**Report Status**: [PASS / PASS WITH NOTES / PARTIAL / FAIL / BLOCKED]

---

## 2. Supabase Connection Confirmation

**Status**: ✅ CONNECTED / ❌ NOT CONNECTED

**Live Supabase Project URL**:
```
https://mmiefuieduzdiiwnqpie.supabase.co
```

**Connection Method**: Supabase MCP (`user-supabase` server)

**Verification**: [Summary of what was verified]

---

## 3. Implementation Summary

[1-2 paragraph summary of what was implemented]

**Key Achievements**:
- ✅ [Achievement 1]
- ✅ [Achievement 2]
- ✅ [Achievement 3]

---

## 4. Files Created/Modified

**Created**:
```
- path/to/file1.ts
- path/to/file2.tsx
- path/to/file3.ts
```

**Modified**:
```
- path/to/existing1.ts
- path/to/existing2.tsx
```

---

## 5. Database Changes

**Migrations**:
```
- supabase/migrations/[timestamp]_[description].sql
```

**Tables Created/Modified**:
- `table_name` - [description]

**Indexes Created**:
- `idx_table_column` on `table(column)`

**RLS Policies Created**:
- Policy name on `table` for [SELECT/INSERT/UPDATE/DELETE]

**Functions Created/Modified**:
- `function_name()` - [description]

**Seed Data Inserted**:
- [Description of seed data]

---

## 6. Testing Results

**TypeScript Typecheck**:
```
✅ PASS
```

**ESLint**:
```
✅ PASS
```

**Next.js Build**:
```
✅ PASS
```

**Browser/Manual Tests**:
- [ ] Page loads without errors
- [ ] Drawer opens in Add mode
- [ ] Drawer opens in Edit mode
- [ ] Save works
- [ ] Save & Close works
- [ ] Cancel works
[... complete checklist]

---

## 7. Known Issues/Limitations

[None / or list of issues and limitations]

---

## 8. Next Steps

**Immediate**:
- [Next immediate step]

**Future**:
- [Future enhancement or follow-up phase]

---

## 9. Final Status

✅ **PASS** — [Phase description] completed successfully.

**Date**: [Date]  
**Approved By**: _________________

---

**END OF REPORT**
```

---

## DOCUMENT APPROVAL

**Reviewed By**: _________________  
**Date**: _________________  
**Status**: ⬜ Approved  ⬜ Needs Revision  ⬜ Rejected  
**Comments**: _________________________________________________

---

## DOCUMENT REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-08 | AI Agent | Initial draft - comprehensive Cursor development and implementation guide |
| REV1 | 2026-06-08 | AI Agent | Applied Sameer/Dina minor corrections: package-version verification rule, server-action path flexibility, report-location flexibility, auth-context shape verification rule, and live numbering-rule source-of-truth |

---

## STATUS

✅ **READY FOR SAMEER REVIEW** — ERP Global Cursor Development and Implementation Guide REV1 complete with minor corrections applied.

**Date**: June 8, 2026  
**Version**: REV1  
**Next Step**: Review and approve guide, then use as mandatory reference for all future ERP work

---

**This guide, together with `ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`, forms the complete development standard for ALGT ERP.**

**All future planning, implementation, database, UI, server-action, security, testing, and reporting tasks MUST reference and follow these guides.**

---

**END OF DOCUMENT**
