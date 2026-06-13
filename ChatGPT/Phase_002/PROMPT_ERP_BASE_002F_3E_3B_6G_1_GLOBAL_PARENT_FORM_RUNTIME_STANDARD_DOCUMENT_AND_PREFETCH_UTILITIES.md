# PROMPT_ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_DOCUMENT_AND_PREFETCH_UTILITIES

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior ERP form-runtime architect, Next.js 16 performance engineer, TanStack Query architect, Supabase query optimization reviewer, enterprise standards writer, reusable utility designer, Safe Close regression reviewer, and future-module foundation engineer.

## Phase

ERP BASE 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows the approved plan:

```text
ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD_PLAN.md
```

This phase must implement the **foundation only**:

```text
official global parent form runtime standard document
lookup prefetch utility foundation
batch lookup seeding utility
child-table query key convention
future module checklist / developer rule
```

Do not wire Customer yet.

Do not change Customer UI yet.

Do not migrate child tables yet.

Do not implement Customer child table TanStack Query yet.

Do not start 3B.6G.2.

The goal is to create the official app-wide standard and reusable utilities that 3B.6G.2 and later phases will use.

---

# 1. Current Context

Already completed:

```text
3B.6A — Global Combobox/Form Runtime Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime / Dirty Integration
3B.6D — Apply Optimized Hooks to Current Forms
3B.6E — Lazy-Load Drawer Tabs and Child Sections
3B.6F — Global Performance Runtime QA Closure Gate
3B.6G — Global Parent Form / Child Table / Lookup Prefetch Runtime Standard Plan
```

The approved 3B.6G plan found:

```text
Customer lookup fields appear one by one because each LookupSelect fires its own individual server action.
useLookupBatchQuery exists but is not consumed.
Batch query key is different from individual LookupSelect keys.
Therefore, the correct fix is:
1. batch fetch lookup category values once
2. seed the individual query keys that LookupSelect already reads
```

This phase creates the standard and utility to support that.

---

# 2. Strict Scope

## In Scope

Implement:

```text
Global Parent Form Runtime Standard document in docs/standards
prefetch utility for lookup categories
batch lookup seed utility
master-data prefetch helper utilities
child query key convention
future module checklist/rules
source-level tests/type safety
implementation report
```

## Out of Scope

Do not implement:

```text
Customer lookup prefetch wiring
Customer UI change
Customer child table TanStack Query migration
generic child table hook implementation beyond query key standard
drawer lazy-load changes
new modules
database schema changes
database migrations
DMS
Global Search
AI
export/email
server-side entity search
virtualization
```

These are for later phases:

```text
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
3B.6G.3 — Customer Child Tables TanStack Query Migration
3B.6G.4 — Generic Child Table Query/Invalidation Pattern
3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
3B.6G.6 — Runtime QA and Closure Gate
```

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports found that one Supabase plugin points to an unrelated weighing/industrial project.

Verify at minimum:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
customer_documents
global_lookup_categories
global_lookup_values
countries
emirates
cities
areas_zones
ports
banks
currencies
payment_terms
tax_types
uom_categories
units_of_measure
uom_conversions
owner_companies
branches
cost_centers
profit_centers
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.1 Global Parent Form Runtime Standard Document + Prefetch Utilities.
```

If Supabase connection is wrong/unavailable, continue source implementation but document the issue.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD_PLAN.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_6E_LAZY_LOAD_DRAWER_TABS_AND_CHILD_SECTIONS_REPORT.md
ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/lib/query/query-client.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/hooks/lookups/use-lookup-queries.ts
src/server/actions/master-data/lookups.ts
src/lib/lookups/option-mappers.ts
src/components/erp/lookup-select.tsx
src/components/erp/combobox/erp-combobox.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run:

```bash
grep -R "useLookupBatchQuery" -n src
grep -R "getActiveLookupValuesByCategoryCodes" -n src
grep -R "setQueryData" -n src
grep -R "prefetchQuery" -n src
grep -R "queryKeys" -n src/lib src/hooks src/components
grep -R "lookupValues" -n src/lib src/hooks src/components
grep -R "child" -n src/lib/query src/hooks src/features/master-data/customers
```

Answer in the report:

```text
Is useLookupBatchQuery currently consumed anywhere?
Are individual lookup keys named consistently?
Is there any existing utility that seeds individual query keys from a batch result?
Are child query keys already defined?
Are master-data prefetch utilities already defined?
```

Do not assume; verify.

---

# 6. Required Standard Document

Create a new standards document:

```text
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

The document must define the official app-wide rule.

It must include at least these sections:

## 6.1 Purpose

Define why the standard exists:

```text
fast parent form opening
no one-by-one lookup loading
safe child table loading
no FormData data loss
future module consistency
```

## 6.2 Parent Form Opening Phases

Include:

```text
Phase A — Open drawer shell immediately
Phase B — Load or receive parent record
Phase C — Prefetch default/basic tab lookup data
Phase D — Render default tab with synchronized lookup availability
Phase E — Lazy-mount non-visible safe sections
Phase F — Lazy-fetch child tables only when tab opens and parent id exists
```

## 6.3 Lookup Prefetch Standard

Include:

```text
parent forms must declare lookup categories
batch lookup category values should be fetched once
batch results must seed individual LookupSelect query keys
common master lists use TanStack Query prefetchQuery
dependent lookups are not prefetched until parent value exists
```

## 6.4 Child Table Standard

Include:

```text
child tables fetch only when tab first opens and parent id exists
child query key shape
child mutation invalidation
add mode shows Save parent first
child row edits do not mark parent form dirty unless intentionally affecting parent
```

## 6.5 Lazy Mount and FormData Safety Rule

Include:

```text
safe-to-lazy sections
unsafe-to-lazy sections
full-payload FormData risk
patch-style save as future unlock
```

## 6.6 Future Module Checklist

Include a checklist for future HR/Fleet/Workshop/Inventory/Projects modules.

## 6.7 Runtime QA Checklist

Include tests:

```text
no one-by-one lookup loading
child section no fetch before tab activation
cached reopen
Safe Close after combobox-only edit
Save/Save & Close regression
no FormData data loss
```

## 6.8 Developer Rules

Include strict rules:

```text
No direct lookup fetch inside parent form body.
No hidden child table fetch before tab activation.
No lazy unmount of FormData-dependent sections.
Every parent form must declare lookup and child table runtime plan.
Every child table query must have a query key and invalidation rule.
```

---

# 7. Required Utility Implementation

Implement reusable utilities.

## 7.1 Lookup Prefetch Utility

Suggested file:

```text
src/lib/query/prefetch-lookups.ts
```

Implement utilities such as:

```typescript
prefetchLookupCategories(queryClient, categoryCodes, options?)
seedLookupCategoryValues(queryClient, batchResult, options?)
prefetchMasterDataQueries(queryClient, queryDescriptors)
```

The key requirement:

```text
Batch result must seed individual LookupSelect query keys.
```

Example concept:

```typescript
const result = await getActiveLookupValuesByCategoryCodes(categoryCodes);

for (const code of categoryCodes) {
  queryClient.setQueryData(
    queryKeys.lookupValues(code, null, includeInactive),
    result[code] ?? []
  );
}
```

Use actual query key function names from source.

Do not create mismatched keys.

Do not seed a key shape that LookupSelect does not read.

Return enough metadata for reports/testing:

```typescript
{
  requestedCodes,
  seededCodes,
  missingCodes,
  seededCount
}
```

## 7.2 Form Lookup Declaration Types

Create types for parent form lookup declarations.

Suggested file:

```text
src/lib/query/form-prefetch-types.ts
```

Types should support:

```typescript
lookupCategories: readonly string[]
masterQueries: readonly ...
childTables: readonly ...
```

Keep simple and reusable.

## 7.3 Child Query Key Convention

Add child query key helpers to:

```text
src/lib/query/query-keys.ts
```

Suggested:

```typescript
childTable(tableName: string, parentId: number | string | null | undefined)
customerContacts(customerId)
customerAddresses(customerId)
customerBankDetails(customerId)
customerDocuments(customerId)
```

Do not use them yet in Customer components unless trivial and no behavior change.

This phase is foundation.

## 7.4 Child Invalidation Utilities

Add helpers to:

```text
src/lib/query/invalidation.ts
```

Suggested:

```typescript
invalidateChildTable(queryClient, tableName, parentId)
invalidateCustomerContacts(queryClient, customerId)
invalidateCustomerAddresses(queryClient, customerId)
invalidateCustomerBankDetails(queryClient, customerId)
invalidateCustomerDocuments(queryClient, customerId)
```

Do not wire mutations yet unless trivial and safe; Customer child migration belongs to 3B.6G.3.

## 7.5 Customer Lookup Declaration Constant

Create declaration but do not wire it yet.

Suggested file:

```text
src/features/master-data/customers/customer-prefetch.ts
```

or similar.

Include actual verified category codes:

```text
CUSTOMER_TYPES
INDUSTRY_TYPES
CUSTOMER_SEGMENTS
CRM_LEAD_SOURCES
PARTY_STATUS_TYPES
ICV_STATUS_TYPES
```

Also include master query descriptors for:

```text
countries
currencies
payment terms
tax types
```

This will be used by 3B.6G.2.

Do not modify Customer drawer in this phase unless a simple import-only export is needed.

---

# 8. Type Safety and Backward Compatibility

Requirements:

```text
Do not break existing queryKeys imports.
Do not rename existing query key functions without updating all usages.
Do not break useLookupValuesQuery.
Do not modify LookupSelect behavior.
Do not change ERPCombobox behavior.
Do not change Customer form runtime yet.
```

All new utilities must compile and be tree-shakeable.

Avoid `any` unless existing project style forces it. Prefer typed generics and readonly arrays.

---

# 9. Optional Unit-Like Source Proof

If project has no test runner, create no test framework.

But you may create strongly typed helper examples or comments.

At minimum, verify via typecheck that:

```text
prefetchLookupCategories accepts readonly category code array
Customer declaration compiles as const
child query keys are serializable
invalidation helpers compile
```

Do not add full testing libraries.

---

# 10. Static Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Rules:

```text
typecheck must pass
build must pass
lint must be run
new lint errors introduced by this phase must be fixed
pre-existing unrelated lint issues may be documented
```

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_AND_PREFETCH_UTILITIES_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit findings.
6. Standard document created.
7. Utility files created/modified.
8. Lookup prefetch utility design.
9. Batch seeding individual key explanation.
10. Child query key convention.
11. Child invalidation utilities.
12. Customer lookup declaration constant.
13. Backward compatibility verification.
14. Static test results.
15. What was intentionally not implemented.
16. Next phase recommendation.
17. Final status.

Final status must be exactly one of:

```text
PASS — Standard document and prefetch utilities implemented successfully.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 12. Closure Criteria

Do not mark PASS unless:

```text
standard document exists
prefetch utility exists
batch lookup result seeds individual LookupSelect query keys
child query keys exist
child invalidation helpers exist
Customer lookup declaration exists
no Customer UI runtime changed
typecheck passes
build passes
report created
```

If Supabase tooling was not available but source work completed:

```text
PASS WITH NOTES
```

not clean PASS.

---

# 13. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6G.2.

Wait for Sameer/Dina review.

---

# Final Instruction

Implement the global parent form runtime standard document and reusable prefetch utilities.

Do not wire Customer yet.

Do not change runtime behavior yet.

Create the foundation for 3B.6G.2.

Run tests.

Create report.

Stop.
