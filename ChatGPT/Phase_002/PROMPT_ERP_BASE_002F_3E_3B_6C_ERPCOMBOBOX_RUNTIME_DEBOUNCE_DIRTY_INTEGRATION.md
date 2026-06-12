# PROMPT_ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION

Act as a senior React runtime engineer, ERP combobox architect, Next.js 16 performance optimizer, TanStack Query integration specialist, Safe Close runtime debugger, browser QA engineer, accessibility reviewer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows:

```text
3B.6A — Global Combobox and Form Runtime Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
```

3B.6B implemented:

```text
TanStack Query provider
global query keys
lookup hooks
geography hooks
finance hooks
option mappers
invalidation helpers
batch lookup server action
proof migration for 8 high-impact wrappers
```

This phase must now improve the **ERPCombobox runtime itself**.

The most important defect to fix is from 3B.5 / 3B.6A:

```text
Combobox-only edits may not trigger useFormDirty.
If the user only changes a combobox and then clicks outside, Safe Close may not appear.
```

This phase must make combobox-only edits mark forms dirty globally, without per-form hacks.

Also improve combobox runtime foundations for search/debounce/performance readiness, but do not migrate all remaining wrappers yet. That is 3B.6D.

---

# 1. Immediate Required Outcome

After this phase:

```text
Changing any ERPCombobox / LookupSelect / approved domain combobox value must mark the surrounding form dirty.
Safe Close must trigger after combobox-only changes.
Clearing a combobox must mark the form dirty.
The combobox must remain searchable and keyboard/mouse usable.
No current forms should break.
Typecheck and build must pass.
```

---

# 2. Strict Scope

## In Scope

Implement:

```text
ERPCombobox dirty integration
LookupSelect dirty integration through ERPCombobox
domain wrappers dirty integration through ERPCombobox automatically
optional onDirty / onDirtyMark prop if needed
synthetic bubbling form change event if reliable
debounced search state if needed
runtime performance cleanup in ERPCombobox
large-list preparation rule or threshold
browser/runtime proof harness if authenticated routes unavailable
implementation report
```

## Out of Scope

Do not implement:

```text
full migration of remaining wrappers to cached hooks
form-level batch lookup wiring
drawer tab lazy-mount
child-section lazy loading
server-side entity search
virtualization package installation unless absolutely required and approved by source review
database migrations
new modules
Global Search
AI
DMS
export/email
```

These belong to later phases:

```text
3B.6D — Apply Optimized Hooks to Current Forms
3B.6E — Lazy-Load Drawer Tabs and Child Sections
3B.6F — Runtime Performance QA and Closure Gate
```

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify relevant tables:

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
uom_categories
units_of_measure
owner_companies
branches
```

No schema changes are expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6C ERPCombobox Runtime, Debounce, Dirty Integration.
```

If Supabase connection fails, continue frontend implementation and document the warning.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source files:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/combobox/types.ts
src/components/erp/lookup-select.tsx
src/hooks/use-form-dirty.ts
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/hooks/lookups/*
src/lib/query/*
src/lib/lookups/option-mappers.ts
```

Also inspect migrated wrappers:

```text
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/finance-basics/currency-select.tsx
src/components/erp/finance-basics/payment-term-select.tsx
src/components/erp/finance-basics/tax-type-select.tsx
src/components/erp/finance-basics/bank-select.tsx
```

Find actual paths if they differ.

---

# 5. Required Source Investigation

Before coding, answer:

```text
How does ERPCombobox currently call onChange/onValueChange?
Does it render a hidden input?
Does it dispatch any native DOM event?
Does useFormDirty receive input/change from combobox selection today?
Does ERPCombobox know the nearest form?
Can it safely dispatch an event to the parent form?
Does clearing a value call the same dirty path?
Does disabled/read-only combobox avoid dirty marking?
Does View mode render disabled comboboxes?
```

Document findings in the report.

---

# 6. Dirty Integration Design

Choose the most reliable global approach.

## Preferred Option A — Synthetic Form Change Event

When ERPCombobox value changes due to user selection or clear:

```tsx
const form = triggerElementRef.current?.closest("form");
form?.dispatchEvent(new Event("change", { bubbles: true }));
```

or dispatch from a hidden input if available.

This works because the 3B.4C `useFormDirty` hook listens at document level for bubbling `input` / `change` events and matches the nearest form id.

Requirements:

```text
only dispatch after a real user-initiated value change
do not dispatch on initial render / loading default value
do not dispatch when disabled
do not dispatch when value is unchanged
dispatch on selection
dispatch on clear
```

## Option B — Dirty Context

If the project has or can safely add a form dirty context:

```text
ERPCombobox calls markDirty()
LookupSelect/domain wrappers inherit it
```

Only implement this if it is cleaner than synthetic events and does not require large form rewrites.

## Option C — Hybrid

Implement:

```text
onDirtyMark?: () => void
plus synthetic event fallback
```

This gives future advanced forms a direct dirty hook while still fixing current forms globally.

Recommended final design:

```text
ERPCombobox supports optional onDirtyMark.
On user value change:
1. call onChange/onValueChange as existing
2. call onDirtyMark if provided
3. dispatch bubbling change event to nearest form as fallback
```

Keep backward compatibility.

---

# 7. Debounce / Search Runtime Improvements

ERPCombobox currently filters client-side. For this phase:

```text
Do not implement server-side search yet.
Do not install virtualization package unless required.
```

But implement safe, low-risk runtime improvements:

```text
debounced search state if filtering large options causes lag
stable memoization of filtered options
limit visible rendered results optionally if option count is very large
preserve selected option visibility
ensure no excessive re-render on every keystroke beyond necessary
loading and empty states remain clear
keyboard navigation remains functional
```

If adding a result limit, use a prop with safe default:

```typescript
maxVisibleOptions?: number
```

But do not hide too many results without clear “Type to narrow results” message.

Suggested behavior:

```text
If options.length > 100 and search is empty:
- show first 100
- show message: "Type to search more results"
```

Only implement if it does not break cmdk behavior.

---

# 8. Accessibility / UX Requirements

Keep:

```text
searchable input
keyboard navigation
selected state
clear button if allowClear
disabled state
loading state
empty state
popover placement inside drawer
modern enterprise styling
no horizontal scroll
```

Do not regress:

```text
ERPCombobox visual design
LookupSelect behavior
domain wrapper public APIs
Safe Close
Save / Save & Close
RequiredLabel
```

---

# 9. Runtime Test Harness

If authenticated ERP routes are not available, create a temporary dev-only harness to prove:

```text
combobox-only change marks dirty
outside click triggers Unsaved Changes
clear marks dirty
Save resets dirty
View mode disabled combobox does not trigger dirty
```

Harness must use production components:

```text
ERPDrawerForm
ERPFormFooter
ERPCombobox
LookupSelect or CountrySelect
useFormDirty
```

Remove harness before final build unless explicitly documented as dev-only and excluded from production.

Do not use a fake implementation that bypasses real components.

---

# 10. Required Browser QA

If authenticated routes are available, test:

```text
Customer Add
Organization Add
Branch Add
Country Add
Bank Add
Currency Add
```

Minimum required runtime proof:

```text
Open Add form.
Change only a combobox value.
Do not type in any text field.
Click outside drawer.
Expected:
- drawer stays open
- Unsaved Changes dialog appears
- selected combobox value remains visible

Click Stay on Form:
- dialog closes
- drawer remains open
- selected combobox value remains

Click Save:
- form saves or mock-saves
- dirty resets

Open View mode:
- combobox disabled/read-only
- outside click closes directly
```

If login unavailable, execute equivalent tests in harness.

---

# 11. Source Verification Coverage

Verify every wrapper using ERPCombobox benefits automatically:

```text
LookupSelect
CountrySelect
EmirateSelect
CitySelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
future wrappers that use ERPCombobox
```

Also identify wrappers not yet using ERPCombobox and document for 3B.6D:

```text
AreaZoneSelect
CostCenterSelect
ProfitCenterSelect
UomCategorySelect
UnitOfMeasureSelect
OwnerCompanySelect
BranchSelect
PortSelect
```

If any of these already use ERPCombobox, update the list accurately.

---

# 12. Static Tests

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

# 13. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source investigation findings.
6. Dirty integration design chosen.
7. Files modified.
8. ERPCombobox changes.
9. LookupSelect/domain wrapper impact.
10. Combobox-only Safe Close runtime test result.
11. Clear-button dirty test result.
12. View mode dirty behavior result.
13. Debounce/search runtime changes, if any.
14. Accessibility/UX regression notes.
15. Static test results.
16. Browser/harness QA status.
17. Known limitations.
18. Remaining work for 3B.6D/6E/6F.
19. Final status.

Final status must be exactly one of:

```text
PASS — ERPCombobox runtime and dirty integration implemented and browser-verified.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 14. Closure Criteria

Do not mark PASS unless:

```text
combobox-only changes mark form dirty
outside click after combobox-only change shows Unsaved Changes dialog
clear marks form dirty
Save resets dirty
View mode remains clean / closes directly
LookupSelect benefits automatically
migrated domain wrappers benefit automatically
typecheck passes
build passes
no current forms are broken
browser or harness runtime proof exists
```

If runtime proof is through harness instead of authenticated ERP routes:

```text
PASS WITH NOTES
```

unless user later confirms in real forms.

---

# 15. Stop Condition

After implementation, testing, and report, stop.

Do not start 3B.6D.

Wait for Sameer/Dina review.

---

# Final Instruction

Fix the combobox-only dirty tracking gap globally in ERPCombobox.

Keep wrapper APIs backward compatible.

Add low-risk runtime search/debounce improvements only if safe.

Prove in browser/harness that changing only a combobox triggers Safe Close.

Run tests.

Create report.

Stop.
