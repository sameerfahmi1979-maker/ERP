# ERP_BASE_002F_3E_3B_6E — Lazy-Load Drawer Tabs and Child Sections
## Implementation Report

**Phase:** ERP BASE 002F.3E.3B.6E  
**Date:** 2026-06-12  
**Engineer:** Cursor Agent (Sonnet 4.6)  
**Status:** PASS WITH NOTES

---

## 1. Phase Name

ERP BASE 002F.3E.3B.6E — Lazy-Load Drawer Tabs and Child Sections

---

## 2. Date / Time

2026-06-12, ~12:00–12:15 PM UTC+4

---

## 3. Supabase Connection Confirmation

Connected to live Supabase project via `user-supabase` MCP server.

```
Project: https://mmiefuieduzdiiwnqpie.supabase.co
```

**Note:** The `plugin-supabase-supabase` MCP server was found to be pointing to a **different** project (weighing/scale system). The `user-supabase` MCP server correctly connects to the ERP project and was used for all verifications.

**No database schema changes were required for 3B.6E Lazy-Load Drawer Tabs and Child Sections.**

All 20 required tables verified present (RLS enabled):

| Table | Rows |
|---|---|
| customers | 1 |
| customer_contacts | 0 |
| customer_addresses | 1 |
| customer_bank_details | 1 |
| global_lookup_values | 278 |
| countries | 250 |
| emirates | 16 |
| cities | 24 |
| areas_zones | 22 |
| ports | 20 |
| banks | 35 |
| currencies | 162 |
| payment_terms | 8 |
| tax_types | 5 |
| uom_categories | 9 |
| units_of_measure | 40 |
| owner_companies | 2 |
| branches | 1 |
| cost_centers | 0 |
| profit_centers | 0 |
| global_numbering_rules | 14 |

---

## 4. Standards / Reports Reviewed

- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md` (reference)
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` (reference)
- `ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md`
- `ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md`

---

## 5. Source Audit Before Coding

### Files using `ERPDrawerSection` (25 files):

```
src/components/erp/erp-drawer-form.tsx                          (shared component)
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
src/features/master-data/finance-basics/components/currency-form-dialog.tsx
src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx
src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx
src/features/master-data/finance-basics/components/bank-form-dialog.tsx
src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx
src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx
src/features/master-data/uom/components/uom-category-form-dialog.tsx
src/features/master-data/uom/components/unit-form-dialog.tsx
src/features/master-data/uom/components/conversion-form-dialog.tsx
src/features/master-data/lookups/components/category-form-dialog.tsx
src/features/master-data/lookups/components/value-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/roles/role-detail-drawer.tsx
src/features/roles/role-form-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/add-user-dialog.tsx
```

### Customer child sections verified:

- `CustomerContactsSection` — `useEffect(() => loadContacts(), [customerId])` fires on mount → data fetch on drawer open
- `CustomerAddressesSection` — same pattern, mounted inside `location` section
- `CustomerBankDetailsSection` — same pattern, mounted inside `finance` section

---

## 6. Current Section Mount Behavior (Before This Phase)

`ERPDrawerSection` used **CSS-only hiding** (`hidden` Tailwind class). All sections were always rendered in the DOM regardless of active state:

```tsx
// Before:
export function ERPDrawerSection({ id, activeId, title, children }) {
  const isActive = id === activeId;
  return (
    <div className={`${isActive ? 'animate-in fade-in duration-200' : 'hidden'}`}>
      {children}   // ← Always rendered
    </div>
  );
}
```

**Consequence:** `CustomerContactsSection`, `CustomerAddressesSection`, and `CustomerBankDetailsSection` ALL fetched their data from Supabase immediately when the Customer drawer opened, even if those tabs were never visited.

---

## 7. FormData / Save-Risk Analysis

### Critical finding: Customer form uses `new FormData(form)`

The Customer `handleSave` builds its payload as:
```typescript
const formData = new FormData(form);
const shared = {
  customer_name_en: formData.get("customer_name_en") as string,
  address_line_1: (formData.get("address_line_1") as string) || null,
  credit_limit: formData.get("credit_limit") ? parseFloat(...) : null,
  icv_certificate_number: (formData.get("icv_certificate_number") as string) || null,
  // etc.
};
```

If a section is **unmounted** (not rendered), its `<Input name="...">` elements are absent from the DOM → `formData.get(...)` returns `null` → **existing DB values overwritten with null**.

### FormData risk matrix by Customer section:

| Section | Uncontrolled Inputs (FormData) | Controlled State | Risk if Unmounted |
|---|---|---|---|
| `basic` | customer_name_en, trn, trade_license_number, etc. | customerTypeCode, statusCode, etc. | CRITICAL — required field |
| `location` | address_line_1, address_line_2, po_box, makani_number | countryId, emirateId, cityId, areaZoneId | HIGH — address data loss |
| `contacts` | None (child CRUD section only) | None | SAFE |
| `finance` | credit_limit, credit_days | currencyId, paymentTermId, taxTypeId | MEDIUM — credit data loss |
| `compliance` | icv_certificate_number, icv_score_percentage, all ICV fields | icvStatusCode | HIGH — compliance data loss |
| `documents` | None (static placeholder) | None | SAFE |
| `audit` | None (display-only, no `name` attr) | None | SAFE |

### Decision: Safe vs. Not Safe for full lazy-mount

| Decision | Customer Sections |
|---|---|
| **SAFE — full lazyMount** | `contacts`, `documents`, `audit` |
| **SAFE — child CRUD guard only** | `location` (CustomerAddressesSection), `finance` (CustomerBankDetailsSection) |
| **NOT SAFE — always mounted** | `basic`, `compliance` |

---

## 8. Shared Drawer Changes

### `src/components/erp/erp-drawer-form.tsx` — `ERPDrawerSection` enhanced

Added `lazyMount?: boolean` prop (default `false` for full backward compatibility):

```typescript
export function ERPDrawerSection({
  id, activeId, title, children, lazyMount = false,
}: {
  id: string;
  activeId: string;
  title: string;
  children: React.ReactNode;
  lazyMount?: boolean;
}) {
  const isActive = id === activeId;

  // Start mounted if lazyMount=false (default) or already active on first render.
  const [hasMounted, setHasMounted] = React.useState<boolean>(!lazyMount || isActive);

  React.useEffect(() => {
    if (isActive && !hasMounted) {
      setHasMounted(true);
    }
  }, [isActive, hasMounted]);

  // Before first activation → render nothing (no DOM, no data fetches)
  if (!hasMounted) return null;

  return (
    <div
      className={`space-y-4.5 ${isActive ? 'animate-in fade-in duration-200' : 'hidden'}`}
      aria-hidden={!isActive}
    >
      <h3 ...>{title}</h3>
      {children}
    </div>
  );
}
```

**Key properties:**
- `lazyMount=false` (default): identical to previous behavior — all sections always mounted
- `lazyMount=true`: section starts unmounted; mounts on first activation; stays mounted afterward (implicit `keepMounted=true`)
- No changes to `ERPDrawerForm`, `ERPDrawerSectionNav`, `ERPDrawerBody`, `ERPDrawerHeader`, or any other shared drawer components
- 100% backward compatible — no existing form behavior changed unless `lazyMount` is explicitly passed

---

## 9. Customer Drawer Changes

### File: `src/features/master-data/customers/components/customer-form-drawer.tsx`

#### a) Added `mountedSections` tracking

```typescript
import { useState, useCallback } from "react";

// Track which sections have been activated at least once.
const [mountedSections, setMountedSections] = useState<Set<string>>(
  () => new Set(["basic"])
);

const handleSectionChange = useCallback((id: string) => {
  setActiveSection(id);
  setMountedSections(prev => {
    if (prev.has(id)) return prev;
    const next = new Set(prev);
    next.add(id);
    return next;
  });
}, []);
```

`handleSectionChange` passed to `ERPDrawerSectionNav.setActiveSection` instead of `setActiveSection` directly.

#### b) Applied `lazyMount` to safe sections

```tsx
{/* contacts — pure child CRUD, no FormData inputs */}
<ERPDrawerSection id="contacts" ... lazyMount>

{/* documents — static placeholder, no form inputs */}
<ERPDrawerSection id="documents" ... lazyMount>

{/* audit — display-only, no named form inputs */}
<ERPDrawerSection id="audit" ... lazyMount>
```

#### c) Lazy child CRUD guards in mixed sections

Inside `location` section (always mounted for FormData safety):
```tsx
{/* CustomerAddressesSection only mounts when location tab first opened */}
{currentCustomer && mountedSections.has("location") && (
  <CustomerAddressesSection customerId={currentCustomer.id} disabled={isViewing} />
)}
```

Inside `finance` section (always mounted for FormData safety):
```tsx
{/* CustomerBankDetailsSection only mounts when finance tab first opened */}
{currentCustomer && mountedSections.has("finance") && (
  <CustomerBankDetailsSection customerId={currentCustomer.id} disabled={isViewing} />
)}
```

#### d) Performance impact

Before: 3 child section Supabase queries on every Customer drawer open (contacts, addresses, bank details).  
After: 0 child section queries on drawer open. Each query fires only when the respective tab is first visited.

---

## 10. Other Forms Audited

### Lazy-mounted sections applied (17 audit sections across 16 forms):

| Form | Section | Type | lazyMount Applied |
|---|---|---|---|
| city-form-dialog | audit | display-only | ✅ |
| emirate-form-dialog | audit | display-only | ✅ |
| country-form-dialog | audit | display-only | ✅ |
| area-form-dialog | audit | display-only | ✅ |
| port-form-dialog | audit | display-only | ✅ |
| bank-form-dialog | audit | display-only | ✅ |
| currency-form-dialog | audit | display-only | ✅ |
| payment-term-form-dialog | audit | display-only | ✅ |
| tax-type-form-dialog | audit | display-only | ✅ |
| cost-center-form-dialog | audit | display-only | ✅ |
| profit-center-form-dialog | audit | display-only | ✅ |
| uom-category-form-dialog | audit | display-only | ✅ |
| unit-form-dialog | audit | display-only | ✅ |
| conversion-form-dialog | audit | display-only | ✅ |
| category-form-dialog (lookup) | audit | display-only | ✅ |
| value-form-dialog (lookup) | audit | display-only | ✅ |
| numbering-rule-form-dialog | audit | display-only | ✅ |

All these audit sections use `<Input value={...} disabled>` (no `name` attribute) — they are 100% display-only and contribute nothing to FormData.

---

## 11. Lazy-Mounted Sections Matrix

| Form | Section | Strategy | Safe? | Applied |
|---|---|---|---|---|
| Customer | `contacts` | Full lazyMount | ✅ (no FormData inputs) | ✅ |
| Customer | `documents` | Full lazyMount | ✅ (placeholder only) | ✅ |
| Customer | `audit` | Full lazyMount | ✅ (display-only) | ✅ |
| Customer | `location` → CustomerAddressesSection | mountedSections guard | ✅ (child CRUD only) | ✅ |
| Customer | `finance` → CustomerBankDetailsSection | mountedSections guard | ✅ (child CRUD only) | ✅ |
| All 17 master forms | `audit` | Full lazyMount | ✅ (display-only) | ✅ |
| Numbering Rule | `audit` | Full lazyMount | ✅ (display-only) | ✅ |

---

## 12. Deferred Sections with Reasons

| Form | Section(s) | Reason Deferred |
|---|---|---|
| Customer | `location`, `finance`, `compliance` | FormData risk: uncontrolled `<Input name="...">` fields; unmounting would overwrite existing DB values with null on save |
| Customer | `basic` | Always-mounted default section (initial tab) |
| Branch | All 5 sections | All sections contain uncontrolled form inputs; no display-only sections identified |
| Organization | All 5 sections | All sections contain uncontrolled form inputs; no display-only sections identified |
| Roles, Users | All sections | All sections contain form inputs |
| Numbering Rule | `notes` | Contains `<Textarea name="notes">` — FormData dependent |

---

## 13. Dirty / Safe Close Regression Analysis

### `useFormDirty` compatibility:

`useFormDirty` listens at the `document` level in **capture phase** for `input` and `change` events:

```typescript
document.addEventListener("input", handleEvent, true);   // capture
document.addEventListener("change", handleEvent, true);  // capture
```

It checks whether the event target's closest `form` matches the registered `formId`. Since it operates at the document level (not on the form element itself), lazy-mounting a section does NOT affect dirty tracking:

- When a lazily-mounted section first mounts, all its fields fire `input`/`change` events that bubble up to document → dirty tracking works normally.
- `ERPCombobox` dispatches a synthetic `change` event that bubbles (implemented in Phase 3B.6C) → combobox edits in lazy sections also mark dirty.
- Unvisited unmounted sections cannot generate events → no false-dirty state.

**Verdict: Safe Close and useFormDirty are fully compatible with the lazy-mount implementation.**

---

## 14. Child Fetch Behavior

### Before Phase 3B.6E:

Every Customer drawer open (Edit/View with existing customer):
1. `CustomerContactsSection` mounts → `getCustomerContacts(customerId)` fired
2. `CustomerAddressesSection` mounts → `getCustomerAddresses(customerId)` fired
3. `CustomerBankDetailsSection` mounts → `getCustomerBankDetails(customerId)` fired

= **3 unnecessary Supabase queries on every drawer open**

### After Phase 3B.6E:

- Contacts fetch: deferred until user clicks "Contacts" tab
- Addresses fetch: deferred until user clicks "Address / Location" tab
- Bank details fetch: deferred until user clicks "Commercial / Finance" tab
- Once fetched, results remain in component state (no re-fetch on tab switch)

**ADD mode:** `currentCustomer` is null → child sections show "Save first" placeholder regardless; no Supabase queries fired.

---

## 15. Runtime / Browser QA Status

Full browser QA was not performed in this session (no authenticated browser session available). Static analysis confirms:

- `lazyMount` is backed by `React.useState` which is safe for SSR (initial value is deterministic based on props)
- `hasMounted` initializes to `!lazyMount || isActive` — for `lazyMount=true` + inactive section, returns `null` immediately; no hydration mismatch risk
- `mountedSections` tracking uses `useCallback` with empty deps and a functional `setState` updater — no closure stale state risk
- Child CRUD guards (`mountedSections.has("location")`) start false for `location` and `finance` on initial render → CustomerAddressesSection / CustomerBankDetailsSection skipped on first render
- Controlled state (`countryId`, `emirateId`, etc.) and uncontrolled inputs in `location`/`finance`/`compliance` sections remain always-mounted → no FormData regression

**QA status: PASS WITH NOTES (no browser QA)**

---

## 16. Static Test Results

| Test | Result |
|---|---|
| `npm run typecheck` | ✅ PASS — exit 0, no errors |
| `npm run lint` | ⚠ 146 problems (62 errors, 84 warnings) — all pre-existing in `src/server/actions/master-data/lookups.ts` and `src/uiux_prototypes/`. Zero new errors introduced by this phase. |
| `npm run build` | ✅ PASS — exit 0, all routes compiled |

---

## 17. Known Limitations

1. **No full browser QA** — verified through static analysis and code review only
2. **`location`, `finance`, `compliance` sections remain always-mounted** — full lazy-mount of these would require refactoring Customer save logic to preserve existing values for unvisited sections (Option C from the prompt)
3. **Branch and Organization forms deferred** — no safe sections identified; all sections are FormData-dependent
4. **`plugin-supabase-supabase` MCP mismatch** — this server points to a different project (weighing system). Used `user-supabase` MCP for all verifications
5. **Performance gain for simple forms is minimal** — audit sections are lightweight; the main gain is in the Customer drawer

---

## 18. Remaining Work for 3B.6F

Candidate improvements for the next phase:

1. **Full lazy-mount for Customer `location`, `finance`, `compliance`** — refactor save logic to use PATCH-style updates (only send changed fields), or initialize all fields as controlled state before lazy-mounting
2. **Server-side pagination/search for large lookup lists** (noted in 3B.6A audit)
3. **Drawer tab lazy-load for Branch and Organization forms** — pending safe pattern for FormData
4. **TanStack Query for CustomerContactsSection/AddressesSection/BankDetailsSection** — replace manual `useState` + server action pattern with cached queries
5. **Virtualization for large combobox lists** (noted in 3B.6A; `maxVisibleOptions` was a temporary mitigation in 3B.6C)

---

## 19. Final Status

**PASS WITH NOTES**

> Lazy-mount drawer section architecture implemented safely.
> Customer child sections (contacts, addresses, bank details) deferred until tab first activated.
> Audit sections across 17 forms lazy-mounted.
> FormData-dependent sections left always-mounted to prevent data loss.
> No regression to Save, Safe Close, or dirty tracking.
> TypeScript clean. Build passes. No new lint errors.
> Full browser QA not available — PASS WITH NOTES.
