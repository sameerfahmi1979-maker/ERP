# PROMPT_ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_REVIEW_FILES_ONLY

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX architect, reusable component architect, shadcn/ui combobox implementation specialist, accessibility reviewer, master-data governance auditor, and Cursor implementation planner.

## Phase

ERP BASE 002F.3E.3B.2 — Global Combobox Foundation in Shared Components

## Prompt Purpose

This is a PLANNING / REVIEW-FILES-ONLY prompt.

Do not implement code.

Do not modify application source files.

Do not modify database schema.

Do not apply SQL to the database.

Do not create migrations in the active migration folder.

Do not update UI components directly.

Do not continue Customer module changes.

Your task is to inspect the live project, review existing select/dropdown components, verify whether any database support is required, and generate review files only:

1. A detailed UI/UX and technical implementation plan for the global Combobox foundation.
2. A SQL review file only if any database helper, index, view, or function is recommended.
3. A risk/impact review file for all affected modules/components.
4. A next-step implementation prompt recommendation file.

The purpose is to allow Sameer/Dina to review everything before any implementation starts.

---

# 1. Mandatory Standards To Read First

Before planning, read and follow the approved standards now stored in:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

These guides are mandatory.

The implementation plan must explicitly confirm that both guide files were read.

The key rules for this phase are:

```text
All selectable fields must use Combobox behavior.
No traditional non-searchable dropdowns/selects are allowed in ERP forms.
Do not create one-off comboboxes.
Enhance shared components once and reuse them everywhere.
Comboboxes must support search by code, English name/label, Arabic name/label where available.
Comboboxes must support keyboard navigation, clear option, loading state, empty state, disabled/read-only states, consistent styling, and accessibility readiness.
```

---

# 2. Mandatory Supabase Connection First

Before generating the review files, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Inspect live schema and existing data sources for all existing select/dropdown components, including:

```text
global_lookup_categories
global_lookup_values
countries
emirates
cities
areas_zones
banks
currencies
payment_terms
tax_types
customers
customer_contacts
customer_addresses
customer_bank_details
```

Also check any indexes or views currently supporting lookup/master-data searches.

The review files must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before planning the Global Combobox Foundation.
```

If Supabase connection fails, stop and create a BLOCKED review report only.

Do not guess database support requirements without live verification.

---

# 3. Source Code To Inspect

Inspect the current project source before planning.

At minimum, inspect these files/folders if they exist:

```text
src/components/erp/lookup-select.tsx

src/components/erp/geography/
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx

src/components/erp/finance/
src/components/erp/finance-basics/
src/components/erp/finance/bank-select.tsx
src/components/erp/finance/currency-select.tsx
src/components/erp/finance/payment-term-select.tsx
src/components/erp/finance/tax-type-select.tsx
src/components/erp/finance-basics/bank-select.tsx
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx

src/components/ui/command.tsx
src/components/ui/popover.tsx
src/components/ui/select.tsx
src/components/ui/button.tsx

src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx

src/server/actions/master-data/
src/lib/supabase/
src/lib/rbac/check.ts
```

If exact paths differ, find the actual existing paths and document them.

Do not invent component paths.

---

# 4. Required Output Files

Create exactly these review/planning files:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Important:

```text
The SQL file is REVIEW ONLY.
Do not apply it.
Do not place it into supabase/migrations/.
Do not run it.
```

If no SQL is required, still create the SQL review file with:

```sql
-- NO SQL REQUIRED FOR THIS PHASE
-- Reason: [explain based on live schema verification]
```

---

# 5. Output File 1 — UI/UX Technical Plan Requirements

Create:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md
```

This file must include:

## 5.1 Phase Information

```text
Phase name
Purpose
Planning-only status
Supabase connection confirmation
Standards files read confirmation
```

## 5.2 Current Select/Dropdown Inventory

List all current select/dropdown components found in the codebase.

For each component, document:

```text
component name
file path
current behavior
data source table/action
currently searchable? yes/no
supports clear option? yes/no
supports loading state? yes/no
supports empty state? yes/no
supports disabled/read-only state? yes/no
used by which forms/modules
risk level to modify
```

## 5.3 Target Global Combobox Standard

Define final standard behavior for every Combobox:

```text
search by code
search by English name/label
search by Arabic name/label
keyboard navigation
Enter to select
Escape to close
clear option for optional fields
loading state
empty state
disabled state
read-only state
required marker compatibility
error/validation compatibility
consistent width and styling
ARIA/accessibility readiness
no horizontal scroll
responsive behavior
```

## 5.4 Recommended Component Architecture

Plan reusable shared components.

Recommended structure may include:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/combobox/lookup-combobox.tsx
src/components/erp/combobox/entity-combobox.tsx
src/components/erp/combobox/geography-combobox.tsx
src/components/erp/combobox/finance-combobox.tsx
```

But Cursor must inspect existing project structure first and recommend the least disruptive architecture.

Do not force a new folder if existing structure should be enhanced in-place.

The plan must decide and explain:

```text
Option A: enhance existing *Select components to behave as Combobox while keeping filenames/APIs
Option B: create new *Combobox components and gradually replace usage
Option C: shared base ERPCombobox + thin wrappers
```

Recommend the safest approach.

## 5.5 Backward Compatibility Plan

The plan must explain how to avoid breaking existing forms.

Include:

```text
preserve current props if possible
value/onValueChange compatibility
id/code value compatibility
required prop support
disabled prop support
placeholder prop support
clearable optional field support
do not break existing Customer form
do not break existing master data modules
```

## 5.6 Data Loading Strategy

Document when to use:

```text
client-side filtering
server-side search
debounced search
pagination
minimum search characters
```

Recommended rule:

```text
Small/master lists: client-side filtering after initial load
Large entity lists such as customers/vendors/employees/assets: server-side search with debounce
```

But verify current data volume and existing actions before recommending.

## 5.7 Component-Specific Plans

Create a subsection for each existing component:

```text
LookupSelect / LookupCombobox
CountrySelect / CountryCombobox
EmirateSelect / EmirateCombobox
CitySelect / CityCombobox
AreaZoneSelect / AreaZoneCombobox
BankSelect / BankCombobox
CurrencySelect / CurrencyCombobox
PaymentTermSelect / PaymentTermCombobox
TaxTypeSelect / TaxTypeCombobox
Future CustomerSelect
Future VendorSelect
Future EmployeeSelect
Future AssetSelect
```

For each, specify:

```text
source table
search fields
display label format
value field
clear option rules
loading/empty behavior
implementation risk
test cases
```

## 5.8 UI/UX Details

Include:

```text
trigger style
popover width
command input placeholder
show selected check icon
display code + English name
Arabic name display option
empty state wording
loading wording
clear selected option
keyboard behavior
focus behavior
mobile/tablet behavior
validation/error integration
read-only mode behavior
```

## 5.9 Accessibility Requirements

Include:

```text
role="combobox"
aria-expanded
aria-controls if applicable
keyboard navigation
focus visible
screen reader label
do not rely on color only
error message association where used inside forms
```

## 5.10 Testing Plan

The plan must include detailed test cases:

```text
typecheck
lint
build
browser test
Customer form Basic Info comboboxes
Customer address geography comboboxes
Customer contact lookup comboboxes
Customer bank detail finance comboboxes
clear optional fields
disabled/view mode
required fields
search by code
search by English
search by Arabic
no results state
loading state
keyboard navigation
no console errors
no horizontal scroll
```

## 5.11 Implementation Split Recommendation

Because this is high risk, the plan should recommend whether to implement as:

```text
one phase
or multiple small sub-phases
```

Recommended split:

```text
3B.2A — Base ERPCombobox component and LookupCombobox
3B.2B — Geography comboboxes
3B.2C — Finance comboboxes
3B.2D — Apply comboboxes to Customer forms
3B.2E — QA/regression
```

Cursor may refine this but must justify.

## 5.12 Acceptance Criteria

Define acceptance criteria before implementation.

---

# 6. Output File 2 — SQL Review File Requirements

Create:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql
```

This file must be SQL review only.

It must start with:

```sql
-- ERP BASE 002F.3E.3B.2 — Global Combobox Foundation SQL Review
-- REVIEW ONLY — DO NOT APPLY
-- This file is for Sameer/Dina review before any database change.
```

The SQL review must be based on live schema verification.

The file should include one of two paths:

## Path A — No SQL Required

If existing tables/indexes are enough, write:

```sql
-- NO SQL REQUIRED FOR THIS PHASE.
-- Reason:
-- 1. Existing lookup/master-data tables already contain required fields for combobox search.
-- 2. Existing indexes are sufficient or data volume is small.
-- 3. Combobox foundation is frontend/shared-component work only.
```

## Path B — SQL Recommended For Review

If SQL is recommended, include only safe review SQL, such as:

```sql
-- Suggested indexes only, not applied:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
```

Before recommending indexes, verify existing indexes.

Possible index areas:

```text
global_lookup_values(category_code, is_active)
countries(country_code, name_en, name_ar)
emirates(country_id, name_en, name_ar)
cities(emirate_id, name_en, name_ar)
areas_zones(city_id, name_en, name_ar)
banks(bank_code, bank_name_en, bank_name_ar)
currencies(currency_code, currency_name_en, currency_name_ar)
payment_terms(term_code, term_name_en, term_name_ar)
tax_types(tax_type_code, tax_type_name_en, tax_type_name_ar)
```

Only include SQL if actually needed.

Never include destructive SQL.

Never include DROP/TRUNCATE/DELETE.

---

# 7. Output File 3 — Risk Impact Review Requirements

Create:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md
```

This file must include:

```text
Affected components
Affected forms
Affected modules
Risk level for each component
Potential breakages
Backward compatibility concerns
Testing scope
Rollback strategy
Recommended implementation split
Decision points for Sameer
```

Include high-risk notes:

```text
Combobox migration affects many forms.
Do not implement everything blindly.
Preserve existing component APIs where possible.
Apply first to Customers after shared components pass tests.
```

---

# 8. Output File 4 — Next Implementation Prompt Plan Requirements

Create:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

This file must propose the next implementation prompt(s), but not implement.

It should include recommended prompt names, for example:

```text
PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_BASE_ERPCOMBOBOX_AND_LOOKUPCOMBOBOX.md

PROMPT_ERP_BASE_002F_3E_3B_2B_IMPLEMENT_GEOGRAPHY_COMBOBOXES.md

PROMPT_ERP_BASE_002F_3E_3B_2C_IMPLEMENT_FINANCE_COMBOBOXES.md

PROMPT_ERP_BASE_002F_3E_3B_2D_APPLY_COMBOBOXES_TO_CUSTOMER_FORMS.md

PROMPT_ERP_BASE_002F_3E_3B_2E_COMBOBOX_QA_REGRESSION_REPORT.md
```

For each proposed prompt, include:

```text
purpose
scope
out of scope
files likely modified
required tests
required report name
stop condition
```

---

# 9. Scope Control

In scope:

```text
inspect existing select/dropdown components
inspect live DB data sources
inspect standards docs
create planning/review files only
create SQL review file only
create risk impact review
create next implementation prompt plan
```

Out of scope:

```text
actual component implementation
editing source code
changing Select to Combobox in code
database migration application
SQL execution
Customer form code changes
Required field implementation
Safe close implementation
Performance optimization
Vendors module
Global search implementation
AI implementation
DMS implementation
```

---

# 10. Required Final Status

Each output file must end with one of these statuses.

For UI/UX technical plan:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation UI/UX technical plan complete.
```

For SQL review file:

```sql
-- READY FOR SAMEER REVIEW — Global Combobox Foundation SQL review complete.
```

For risk impact review:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation risk/impact review complete.
```

For next implementation prompt plan:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation next implementation prompt plan complete.
```

---

# 11. Stop Condition

After creating the four review files, stop.

Do not implement.

Do not apply SQL.

Do not modify application code.

Do not start 3B.2A.

Wait for Sameer/Dina review.

---

# Final Instruction

Read both standards guides first.

Connect to Supabase.

Inspect current source code and live schema.

Create only the four review files.

Stop.
