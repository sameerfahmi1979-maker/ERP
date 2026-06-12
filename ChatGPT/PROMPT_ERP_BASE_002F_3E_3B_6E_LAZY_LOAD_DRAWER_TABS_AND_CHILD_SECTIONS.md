# PROMPT_ERP_BASE_002F_3E_3B_6E_LAZY_LOAD_DRAWER_TABS_AND_CHILD_SECTIONS

Act as a senior ERP performance implementation engineer, React/Next.js 16 runtime optimizer, enterprise drawer-form architect, tab/lazy-mount specialist, Supabase query optimization reviewer, Safe Close regression tester, browser performance QA engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6E — Lazy-Load Drawer Tabs and Child Sections

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows:

```text
3B.6A — Global Combobox and Form Runtime Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration
3B.6D — Apply Optimized Hooks to Current Forms
```

3B.6B–3B.6D optimized lookup caching and combobox wrappers. This phase must now fix the next performance issue:

```text
Drawer tabs and child sections are mounted immediately even when hidden.
Hidden tabs can load lookup data, child records, and heavy sections before the user opens them.
```

The purpose is to make drawer forms open faster by rendering only the active/needed sections first, then lazy-mounting other tabs/sections when the user opens them.

This is not Customer-only.

This must define and implement a reusable global pattern for all current and future drawer forms.

---

# 1. Main Objectives

Implement a global lazy-mount standard for ERP drawer tabs/sections:

```text
drawer opens immediately
active/default section mounts first
hidden sections do not mount on initial drawer open
a section mounts when first activated
after first activation, section remains mounted to preserve local state
child sections/tables do not fetch until their section is mounted and applicable record id exists
Safe Close must still work across mounted sections
Save / Save & Close must still validate and save correctly
View mode must still work
```

Apply it to all current implemented drawer forms where the pattern is used, especially:

```text
Customer drawer
Organization drawer
Branch drawer
Numbering Rule drawer
Geography forms
Finance forms
UOM forms
Lookup forms
```

The heaviest priority is the Customer drawer because it has multiple tabs and child sections.

---

# 2. Strict Scope

## In Scope

```text
ERPDrawerForm / ERPDrawerSection lazy-mount architecture
section activation tracking
mount-on-first-open behavior
Customer child section lazy loading
contacts/addresses/banks/documents deferred until relevant tab opens
source-safe migration for current forms
runtime-safe dirty tracking after lazy mount
preserve form values and Save behavior
performance report
```

## Out of Scope

Do not implement:

```text
new modules
database migrations
schema changes
new DMS implementation
Global Search
AI
export/email
server-side entity search
virtualization
major UI redesign
new transaction modules
```

Do not rewrite business logic unless required to prevent data loss or broken save behavior.

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify relevant tables:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
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
owner_companies
branches
cost_centers
profit_centers
global_numbering_rules
```

No schema changes are expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6E Lazy-Load Drawer Tabs and Child Sections.
```

If Supabase MCP/tooling points to the wrong project, do not make DB changes. Continue source implementation and document the mismatch clearly.

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
ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read current source:

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/hooks/use-form-dirty.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/features/**/components/*form*.tsx
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run source searches:

```bash
grep -R "ERPDrawerForm" -n src/features src/components
grep -R "ERPDrawerSection" -n src/features src/components
grep -R "activeSection" -n src/features src/components
grep -R "hidden" -n src/components/erp src/features | grep -i section
grep -R "customer-contacts-section" -n src
grep -R "customer-addresses-section" -n src
grep -R "customer-bank-details-section" -n src
grep -R "useEffect" -n src/features/master-data/customers
grep -R "getCustomer" -n src/features src/server
```

Create a matrix:

```text
Form | Sections/Tabs | Current Mount Behavior | Child Fetch Risk | Lazy-Mount Needed | Priority
```

Do not rely only on prior reports. Verify actual source.

---

# 6. Understand Current ERPDrawerSection Runtime

Investigate:

```text
Does ERPDrawerSection currently render children even when inactive?
Does it use CSS hidden class only?
Does activeSection live inside ERPDrawerForm?
Do child components mount before section activation?
Does form data depend on inactive fields existing in the DOM?
Does Save use FormData from DOM only?
If inactive sections are not mounted, will Save lose their field values?
```

This is critical.

If form save relies on `new FormData(form)` and fields in inactive tabs are unmounted, then lazy-unmounting every inactive tab may cause data loss on save.

Therefore the implementation must choose the safest pattern.

---

# 7. Critical Save/FormData Rule

Many current forms may use uncontrolled inputs with `FormData(form)`.

If a hidden tab contains editable fields and those fields are not mounted, they will not appear in FormData.

Therefore:

## Safe Lazy-Mount Rule

For Add/Edit forms using uncontrolled inputs and FormData:

```text
Never unmount a section after it has been mounted once.
Mount active/default section on open.
Mount a section when first activated.
Keep mounted sections mounted afterward.
```

This preserves values for sections the user has visited.

But if an Edit form has existing values in unvisited tabs:

```text
Saving without visiting those tabs must not wipe existing values.
```

Verify each form's save logic.

If the save action sends only fields from FormData and overwrites missing fields with null/empty, unmounted unvisited tabs are dangerous.

For those forms, choose one of:

```text
A. Do not lazy-mount data-critical form fields yet; only lazy-mount child sections/tables.
B. Refactor save logic to preserve existing values for unmounted sections.
C. Use controlled state initialized from record for all fields before lazy-mounting.
```

Prefer **safe implementation over aggressive lazy loading**.

---

# 8. Recommended Architecture

## 8.1 ERPDrawerSection mount behavior

Enhance `ERPDrawerForm`/`ERPDrawerSection` to support:

```typescript
lazyMount?: boolean
keepMounted?: boolean
forceMount?: boolean
```

Possible defaults:

```text
lazyMount = false by default initially for backward compatibility
keepMounted = true when lazyMount enabled
```

Or, if current design supports global safe default:

```text
lazyMount enabled only for sections explicitly marked safe
```

Do not globally lazy-unmount all sections without checking save/data risks.

## 8.2 Track mounted sections

In `ERPDrawerForm`:

```typescript
const [mountedSections, setMountedSections] = useState<Set<string>>(new Set([activeSection]));
```

When activeSection changes:

```typescript
setMountedSections(prev => new Set(prev).add(activeSection));
```

`ERPDrawerSection` renders children when:

```text
active OR forceMount OR mountedSections has section id OR lazyMount disabled
```

If not rendered, return `null`.

If rendered but inactive, hide with CSS as today.

## 8.3 Preserve dirty tracking

`useFormDirty` works with document-level events on mounted fields.

Requirements:

```text
changing a field in a lazily mounted section marks dirty
combobox-only change in lazy section marks dirty
Safe Close still works
unvisited sections do not incorrectly mark dirty
```

## 8.4 Child section lazy loading

For Customer:

```text
contacts section should not mount/fetch until Contacts tab first activated
addresses section should not mount/fetch until Addresses tab first activated
bank details should not mount/fetch until Bank Details tab first activated
documents placeholder should not mount heavy future DMS code until Documents tab first activated
```

For Add mode:

```text
child sections should stay disabled/empty until customer id exists
do not fetch child records without customer id
```

For Edit/View mode:

```text
child sections fetch only when tab is first opened
then remain mounted/cached while drawer is open
```

---

# 9. Priority Implementation Strategy

## Step 1 — Implement global section mount tracking safely

Add support in shared drawer runtime, but keep backward compatibility.

Do not change all sections to lazy by default unless verified safe.

## Step 2 — Apply lazy-mount only to safe/heavy sections first

Recommended safe first targets:

```text
Customer child sections:
- contacts
- addresses
- bank details
- documents placeholder

Customer non-critical optional tabs if save logic is safe:
- commercial/finance tab only if values are controlled/preserved
- compliance tab only if values are controlled/preserved
```

Be cautious with editable fields in unvisited tabs.

## Step 3 — Audit other forms

Most simple master forms have few sections and may not need lazy mount.

Document:

```text
applied
not needed
deferred due FormData risk
```

## Step 4 — Standards update note

If standards doc has a performance section, update or append a short rule:

```text
ERP drawer sections may be lazy-mounted only when save logic preserves unmounted values.
Child tables/sections should be lazy-mounted by default.
```

Only update standards if the project convention allows it in this phase.

---

# 10. Customer Drawer Specific Rules

Inspect `customer-form-drawer.tsx` carefully.

Answer:

```text
How many sections/tabs?
Which sections contain normal form fields?
Which sections contain child CRUD data?
Which sections are placeholders?
Does handleSave collect FormData from all fields?
Does unmounting commercial/compliance fields cause missing values?
Does Customer save overwrite missing optional fields?
```

If save logic uses `FormData(form)` and optional fields from unvisited tabs would be missing, do NOT unmount those editable form sections unless save logic is made safe.

Minimum required Customer improvement:

```text
child record sections must not mount/fetch until their tab is first opened
```

Recommended:

```text
basic/main fields remain mounted or mounted immediately
child tables lazy
documents placeholder lazy
```

If safe, also lazy-mount optional tabs while preserving save values.

---

# 11. Runtime QA Requirements

If authenticated ERP routes are available, test:

```text
Customer Add
Customer Edit
Customer View
Organization Add/Edit if multi-section
Branch Add/Edit if multi-section
Numbering Rule Add/Edit/View
```

If not available, use a temporary dev harness using real `ERPDrawerForm`, `ERPDrawerSection`, `useFormDirty`, and child-section simulation. Remove harness before final build unless dev-only guarded and documented.

Minimum runtime proof:

```text
Drawer opens with only initial section mounted.
Switching tab mounts that section.
Returning to first tab preserves values.
Changing field in lazily mounted section marks dirty.
Safe Close works after lazy-section edit.
Save still includes required/visited fields.
Child section does not fetch before activation.
View mode still switches sections correctly.
```

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
ERP_BASE_002F_3E_3B_6E_LAZY_LOAD_DRAWER_TABS_AND_CHILD_SECTIONS_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit before coding.
6. Current section mount behavior.
7. FormData/save-risk analysis.
8. Shared drawer changes.
9. Customer drawer changes.
10. Other forms audited.
11. Lazy-mounted sections matrix.
12. Deferred sections with reasons.
13. Dirty/Safe Close regression result.
14. Child fetch behavior result.
15. Runtime/browser QA status.
16. Static test results.
17. Known limitations.
18. Remaining work for 3B.6F.
19. Final status.

Final status must be exactly one of:

```text
PASS — Lazy loading implemented and verified successfully.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 14. Closure Criteria

Do not mark PASS unless:

```text
source audit completed
FormData/save risk assessed
shared drawer lazy-mount support implemented safely
Customer child sections lazy-mounted or formally deferred with reason
no data-loss risk introduced
Safe Close still works
typecheck passes
build passes
dev harness removed or production-secured
implementation report created
```

If browser QA is not possible:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 15. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6F.

Wait for Sameer/Dina review.

---

# Final Instruction

Implement lazy-mount drawer tabs/sections safely.

Do not introduce data loss by unmounting fields needed for FormData saves.

Prioritize Customer child sections and reusable drawer architecture.

Run tests.

Create report.

Stop.
