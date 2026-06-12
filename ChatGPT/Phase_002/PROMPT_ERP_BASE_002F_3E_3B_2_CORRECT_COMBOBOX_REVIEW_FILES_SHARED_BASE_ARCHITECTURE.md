# PROMPT_ERP_BASE_002F_3E_3B_2_CORRECT_COMBOBOX_REVIEW_FILES_SHARED_BASE_ARCHITECTURE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP UI/UX architect, reusable component architect, shadcn/ui combobox implementation specialist, accessibility reviewer, master-data governance auditor, and Cursor implementation planner.

## Phase

ERP BASE 002F.3E.3B.2 — Correct Global Combobox Foundation Review Files

## Prompt Purpose

This is a CORRECTION prompt for the existing Combobox planning/review files only.

The current review files are approved with one required architecture modification.

Current plan recommends enhancing existing `*Select` components in-place.

Sameer/Dina decision:

```text
Keep existing *Select component names and import paths for backward compatibility,
but create one shared base ERPCombobox component first,
then refactor existing *Select components to internally use ERPCombobox.
```

This means:

```text
ERPCombobox = shared base UI behavior
LookupSelect = wrapper using ERPCombobox
CountrySelect = wrapper using ERPCombobox
EmirateSelect = wrapper using ERPCombobox
CitySelect = wrapper using ERPCombobox
AreaZoneSelect = wrapper using ERPCombobox
BankSelect = wrapper using ERPCombobox
CurrencySelect = wrapper using ERPCombobox
PaymentTermSelect = wrapper using ERPCombobox
TaxTypeSelect = wrapper using ERPCombobox
```

Do not implement code.

Do not modify application source files.

Do not modify database schema.

Do not apply SQL.

Do not create migrations.

Do not continue Customer module changes.

Only update the review/planning files listed below.

---

# 1. Mandatory Standards To Read First

Before updating the review files, read:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

The updated review files must confirm both standards were considered.

---

# 2. Mandatory Supabase Connection First

Before updating the files, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

No database change is required. This connection is only for workflow compliance and to confirm that the previous "no SQL required" decision remains valid.

If Supabase connection fails, still update the documents and include:

```text
WARNING — Live Supabase verification could not be completed during this correction. No SQL implementation is being performed.
```

---

# 3. Files To Update

Update only these existing files:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Do not update the SQL review file unless it contains language that conflicts with this correction.

The SQL decision remains:

```text
NO SQL REQUIRED
```

Do not create new review files.

Do not create implementation prompt files.

---

# 4. Required Architecture Correction

Update all sections that currently recommend pure in-place enhancement or direct Popover + Command implementation inside every component.

Replace with this final architecture:

## Final Approved Architecture

```text
Create a shared base component:
src/components/erp/combobox/erp-combobox.tsx

Then update existing *Select components to internally use ERPCombobox.

Keep existing component names, exports, import paths, and public props.
```

## Existing Components Must Remain Backward Compatible

The following existing component names and imports must remain valid:

```text
LookupSelect
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
BankSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
```

Future wrappers may include:

```text
CustomerSelect
VendorSelect
EmployeeSelect
AssetSelect
ProjectSelect
```

But this correction phase is planning only.

---

# 5. ERPCombobox Base Component Requirements

Add a new planned section explaining `ERPCombobox`.

Recommended file:

```text
src/components/erp/combobox/erp-combobox.tsx
```

Recommended role:

```text
ERPCombobox provides all shared Combobox UI behavior:
- trigger
- popover
- command/search input
- option filtering
- selected check icon
- empty state
- loading state
- clear button
- disabled/read-only state
- error styling
- keyboard behavior
- ARIA/accessibility attributes
- consistent sizing and styling
```

## Recommended Generic Option Shape

Add a recommended interface such as:

```typescript
export interface ERPComboboxOption {
  value: string | number;
  label: string;
  labelAr?: string | null;
  code?: string | null;
  description?: string | null;
  badge?: string | null;
  colorHex?: string | null;
  icon?: React.ReactNode;
  raw?: unknown;
}
```

## Recommended ERPCombobox Props

Add planned props such as:

```typescript
export interface ERPComboboxProps {
  value: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: ERPComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
  allowClear?: boolean;
  loading?: boolean;
  emptyText?: string;
  noResultsText?: string;
  showCode?: boolean;
  language?: 'en' | 'ar';
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  name?: string;
}
```

Cursor may refine exact typing during implementation, but plan should clearly define expected behavior.

---

# 6. Wrapper Component Strategy

Update the plan to explain that each existing `*Select` component becomes a wrapper:

## LookupSelect Wrapper

```text
LookupSelect:
- fetches data from global_lookup_values
- handles categoryCode
- handles parentValueCode
- handles valueField = id/code
- maps lookup rows to ERPComboboxOption[]
- preserves color badges and default badge logic
- passes options to ERPCombobox
```

## Geography Wrappers

```text
CountrySelect:
- fetches countries
- maps country_code/name_en/name_ar to options
- passes to ERPCombobox

EmirateSelect:
- fetches emirates filtered by countryId
- maps to options
- passes to ERPCombobox

CitySelect:
- fetches cities filtered by emirateId
- maps to options
- passes to ERPCombobox

AreaZoneSelect:
- fetches areas_zones filtered by cityId
- maps to options
- passes to ERPCombobox
```

## Finance Wrappers

```text
BankSelect:
- fetches banks
- searches/matches bank_code, bank_name_en, bank_name_ar, short_name
- maps to options
- passes to ERPCombobox

CurrencySelect:
- fetches currencies
- maps to options

PaymentTermSelect:
- fetches payment_terms
- maps to options

TaxTypeSelect:
- fetches tax_types
- maps to options
```

---

# 7. Benefits To Add

Add a clear subsection explaining why this architecture is safer than copying Popover + Command into each component:

```text
one place to fix keyboard behavior
one place to fix styling
one place to fix accessibility
one place to fix empty/loading states
one place to fix clear button behavior
one place to fix popover sizing
less repeated code
lower future maintenance cost
consistent UX across all modules
existing imports remain backward compatible
```

---

# 8. Implementation Split Update

Update implementation split to:

```text
3B.2A — Create Base ERPCombobox + Convert LookupSelect
3B.2B — Convert Geography Selects using ERPCombobox
3B.2C — Convert Finance Selects using ERPCombobox
3B.2D — Customer Form Final QA
3B.2E — Remaining Select Components Later
```

## 3B.2A Must Include Base Component

Update 3B.2A scope to include:

```text
create src/components/erp/combobox/erp-combobox.tsx
create optional src/components/erp/combobox/index.ts
convert LookupSelect to use ERPCombobox internally
do not change LookupSelect public import path
do not change LookupSelect public props
```

Add testing:

```text
ERPCombobox base behavior tested through LookupSelect
LookupSelect existing props preserved
color badges preserved
valueField=id/code preserved
parentValueCode filtering preserved
clear/loading/empty/disabled/error states preserved
keyboard navigation works
```

## 3B.2B Must Use ERPCombobox

Update 3B.2B:

```text
Convert CountrySelect, EmirateSelect, CitySelect, AreaZoneSelect to use ERPCombobox internally.
Do not duplicate Popover + Command logic inside each file.
Preserve cascading behavior.
```

## 3B.2C Must Use ERPCombobox

Update 3B.2C:

```text
Convert BankSelect, CurrencySelect, PaymentTermSelect, TaxTypeSelect to use ERPCombobox internally.
Do not duplicate Popover + Command logic inside each file.
```

---

# 9. Risk Review Updates

Update the risk file to reflect the architecture modification.

Add risk reduction:

```text
Creating shared ERPCombobox reduces repeated code and lowers long-term risk.
```

Add new risk:

```text
ERPCombobox base component becomes a central dependency. If base component breaks, all wrappers may be affected.
```

Add mitigation:

```text
Implement ERPCombobox first and test through LookupSelect before converting other wrappers.
Keep wrapper props backward compatible.
Commit each sub-phase separately.
```

Update architecture decision point:

```text
Decision 3: Architecture
APPROVED WITH MODIFICATION — Use shared ERPCombobox base component while preserving existing *Select wrappers/imports.
```

---

# 10. Next Implementation Prompt Plan Updates

Update proposed prompt names and scope.

Replace:

```text
PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_LOOKUPCOMBOBOX_FOUNDATION.md
```

with:

```text
PROMPT_ERP_BASE_002F_3E_3B_2A_IMPLEMENT_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_WRAPPER.md
```

3B.2A prompt scope must include:

```text
create base ERPCombobox
convert LookupSelect wrapper
preserve LookupSelect API
test LookupSelect customer fields
generate report
```

Update later prompt names if useful:

```text
PROMPT_ERP_BASE_002F_3E_3B_2B_CONVERT_GEOGRAPHY_SELECTS_TO_ERPCOMBOBOX.md

PROMPT_ERP_BASE_002F_3E_3B_2C_CONVERT_FINANCE_SELECTS_TO_ERPCOMBOBOX.md

PROMPT_ERP_BASE_002F_3E_3B_2D_CUSTOMER_COMBOBOX_FINAL_QA.md
```

---

# 11. SQL Review File

No SQL change is required.

If you update SQL file, only add a comment:

```sql
-- Architecture correction does not change SQL decision.
-- Shared ERPCombobox is frontend/component architecture only.
-- NO SQL REQUIRED.
```

Otherwise leave SQL file unchanged.

---

# 12. Required Status Updates

At the end of each updated MD file, include:

For UI/UX technical plan:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation UI/UX technical plan complete with shared ERPCombobox base architecture.
```

For risk impact review:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation risk/impact review complete with shared ERPCombobox base architecture.
```

For next implementation prompt plan:

```text
READY FOR SAMEER REVIEW — Global Combobox Foundation next implementation prompt plan complete with shared ERPCombobox base architecture.
```

---

# 13. Stop Condition

After updating the review files, stop.

Do not implement.

Do not apply SQL.

Do not create new source files.

Do not create implementation prompts.

Do not start 3B.2A.

Wait for Sameer/Dina review.

---

# Final Instruction

Read both standards guides.

Connect to Supabase.

Update only the Combobox review/planning files to use shared `ERPCombobox` base-component architecture.

Stop.
