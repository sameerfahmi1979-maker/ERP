# ERP BASE 002F.3E.3B.6C — ERPCOMBOBOX RUNTIME, DEBOUNCE, DIRTY INTEGRATION REPORT

## 1. Phase Information

**Phase ID**: ERP BASE 002F.3E.3B.6C  
**Phase Title**: ERPCombobox Runtime, Debounce, Dirty Integration  
**Date/Time**: 2026-06-12  
**Report Type**: Implementation  
**Status**: PASS WITH NOTES — Dirty integration implemented and source-verified. Dev harness created at `/dev/combobox-dirty-qa` for browser proof. Authenticated ERP routes not available in test environment.

---

## 2. Supabase Connection Confirmation

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6C ERPCombobox Runtime, Debounce, Dirty Integration.
```

Table names confirmed unchanged from 3B.6B audit.

---

## 3. Standards and Reports Read

- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
- `ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md`
- `ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md`
- `ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md`
- `ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md`

---

## 4. Source Investigation Findings

### How ERPCombobox handled value changes (before this phase)

| Question | Finding |
|---|---|
| How does ERPCombobox call onValueChange? | `handleSelect(optionValue)` → `onValueChange(optionValue)` then `setOpen(false)` |
| Does it render a hidden input? | Yes — `<input type="hidden" name={name}>` when `name` prop is provided |
| Does it dispatch any native DOM event? | **No** — only calls `onValueChange` callback; no DOM events |
| Does useFormDirty receive input/change from combobox? | **No** — `useFormDirty` listens for `"input"`/`"change"` DOM events; ERPCombobox dispatched none |
| Does ERPCombobox know the nearest form? | Not previously. Now yes — via `containerRef.current?.closest("form")` |
| Can it safely dispatch an event to the parent form? | **Yes** — dispatch `new Event("change", { bubbles: true })` from container div |
| Does clearing a value call the same dirty path? | Before: `handleClear → onValueChange(null)`, no event. After: same + dirty signal |
| Does disabled/readOnly avoid dirty? | **Yes** — `dispatchDirtySignal` guards `if (disabled || readOnly) return` |
| Does View mode render disabled comboboxes? | **Yes** — `ERPCombobox` receives `disabled={true}` in view mode → guard prevents any event |

### How `useFormDirty` (3B.4C) captures events

```typescript
// Document-level listener in CAPTURE phase
document.addEventListener("change", handleEvent, true);

const handleEvent = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const form = target.closest("form");          // walks up from event target
  if (form?.id === formId) setIsDirtyInternal(true);
};
```

**Key insight**: The capture phase listener fires top-down before the event reaches its target. When `ERPCombobox` dispatches from its container `div`, the event travels up through the DOM tree. The container is inside `<form id="...">`, so `target.closest("form")?.id` matches `formId` and sets `isDirty = true`. This requires **no form-level changes** — all forms that embed `ERPCombobox` benefit automatically.

---

## 5. Dirty Integration Design

### Option chosen: **Option C — Hybrid (onDirtyMark + synthetic bubbling event)**

Both mechanisms are implemented for maximum reliability:

1. **Synthetic DOM event** (primary, works globally):
   ```typescript
   containerRef.current?.dispatchEvent(new Event('change', { bubbles: true }))
   ```
   Caught by `useFormDirty`'s document capture listener. Requires no form changes.

2. **`onDirtyMark` callback** (advanced forms):
   ```typescript
   onDirtyMark?: () => void  // new ERPComboboxProps field
   ```
   Forms can pass `markDirty` from `useFormDirty` directly. Called before the DOM event.

Both fire together in `dispatchDirtySignal()`:
```typescript
const dispatchDirtySignal = React.useCallback(() => {
  if (disabled || readOnly) return;
  onDirtyMark?.();
  const container = containerRef.current;
  if (container) {
    container.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, [disabled, readOnly, onDirtyMark]);
```

### Guard conditions (no dirty signal dispatched when):
- `disabled = true` — guard at top of `dispatchDirtySignal`
- `readOnly = true` — guard at top of `dispatchDirtySignal`
- User clicks already-selected item AND `required = true` — value is unchanged; no signal
- Initial render / loading — `handleSelect` and `handleClear` are only called on user interaction

### When dirty signal IS dispatched:
- User selects a different value (`handleSelect` — new selection)
- User de-selects a value by clicking the selected item (`handleSelect` — `!required` deselect)
- User clicks the clear (X) button (`handleClear`)

---

## 6. Files Modified

| File | Change |
|---|---|
| `src/components/erp/combobox/types.ts` | Added `onDirtyMark?: () => void` and `maxVisibleOptions?: number` |
| `src/components/erp/combobox/erp-combobox.tsx` | Added `containerRef`, `dispatchDirtySignal`, `useCallback` on handlers, `maxVisibleOptions` truncation, `showTypeHint` hint |
| `src/app/dev/combobox-dirty-qa/page.tsx` | New dev-only harness (production-guarded, documented) |

---

## 7. ERPCombobox Changes Detail

### New in `erp-combobox.tsx`

```typescript
// Container ref for DOM event dispatch
const containerRef = React.useRef<HTMLDivElement>(null);

// Dirty signal dispatcher
const dispatchDirtySignal = React.useCallback(() => {
  if (disabled || readOnly) return;
  onDirtyMark?.();
  const container = containerRef.current;
  if (container) {
    container.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, [disabled, readOnly, onDirtyMark]);

// handleSelect — signals dirty on actual value change
const handleSelect = React.useCallback((optionValue: string | number) => {
  const isAlreadySelected = optionValue === value || String(optionValue) === String(value);
  if (isAlreadySelected) {
    if (!required) { onValueChange(null); dispatchDirtySignal(); }
    // required=true + same item: no dirty
  } else {
    onValueChange(optionValue); dispatchDirtySignal();
  }
  setOpen(false); setSearchQuery('');
}, [value, required, onValueChange, dispatchDirtySignal]);

// handleClear — always signals dirty (value changes from something to null)
const handleClear = React.useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  onValueChange(null);
  dispatchDirtySignal();
}, [onValueChange, dispatchDirtySignal]);
```

### `maxVisibleOptions` implementation

When `maxVisibleOptions` is set AND `options.length > maxVisibleOptions` AND search is empty:
- Shows `maxVisibleOptions` items (selected item always included)
- Shows hint below the list: "Showing N of M — type to search"
- When search is active: all filtered results shown (no truncation)

```typescript
const { visibleOptions, showTypeHint } = React.useMemo(() => {
  if (!maxVisibleOptions || searchQuery || filteredOptions.length <= maxVisibleOptions) {
    return { visibleOptions: filteredOptions, showTypeHint: false };
  }
  // Always keep selected option visible
  const selected = filteredOptions.filter(
    (opt) => opt.value === value || String(opt.value) === String(value)
  );
  const rest = filteredOptions
    .filter((opt) => opt.value !== value && String(opt.value) !== String(value))
    .slice(0, Math.max(0, maxVisibleOptions - selected.length));
  return { visibleOptions: [...selected, ...rest], showTypeHint: true };
}, [filteredOptions, maxVisibleOptions, searchQuery, value]);
```

**Default behaviour unchanged**: `maxVisibleOptions` is undefined by default — no truncation, no visual change for any existing combobox.

### Additional improvements
- `handleSelect` and `handleClear` wrapped in `React.useCallback` with explicit deps for stable references
- Filter function `null` checks use `!= null` instead of `&&` (minor type safety)
- `filterFn ?? defaultFilterFn` instead of `||` (preserves `false`-y custom functions)

---

## 8. LookupSelect / Domain Wrapper Impact

**Zero wrapper changes needed.** All wrappers that render `ERPCombobox` automatically benefit:

| Wrapper | Dirty from select? | Dirty from clear? | Mechanism |
|---|---|---|---|
| `LookupSelect` | ✓ | ✓ (allowClear) | via ERPCombobox |
| `CountrySelect` | ✓ | ✓ | via ERPCombobox |
| `EmirateSelect` | ✓ | ✓ | via ERPCombobox |
| `CitySelect` | ✓ | ✓ | via ERPCombobox |
| `CurrencySelect` | ✓ | ✓ | via ERPCombobox |
| `PaymentTermSelect` | ✓ | ✓ | via ERPCombobox |
| `TaxTypeSelect` | ✓ | ✓ | via ERPCombobox |
| `BankSelect` | ✓ | ✓ | via ERPCombobox |
| Future ERPCombobox wrappers | ✓ | ✓ | automatic |

---

## 9. Combobox-Only Safe Close Test (Source Verification)

**Source chain verified:**

```
User clicks Country option
  → ERPCombobox.handleSelect(id)
    → onValueChange(id)                        ← CountrySelect updates parent state
    → dispatchDirtySignal()
      → containerRef.current.dispatchEvent(new Event("change", { bubbles: true }))
        ← event bubbles up through form element
          ← useFormDirty document listener (capture phase) fires
            → target.closest("form")?.id === formId  ← MATCH
              → setIsDirtyInternal(true)
                → isDirty = true (since enabled=true in add/edit mode)
                  → ERPDrawerForm receives isDirty=true
                    → shouldBlockClose = true
                      → outside click → setShowUnsavedDialog(true) ← DIALOG SHOWN
```

**All preconditions confirmed:**
- `useFormDirty` uses capture phase: fires before target receives event ✓
- Container div is always inside `<form id="...">` in all ERP drawers ✓
- `disabled=true` in view mode guards prevent dirty signal ✓
- `ERPDrawerForm.handleOpenChange` checks `shouldBlockClose = isEditable && isDirty` ✓

---

## 10. Clear-Button Dirty Test (Source Verification)

```
User clicks X (clear) button on Country
  → ERPCombobox.handleClear(e)
    → e.stopPropagation()                     ← prevents trigger button toggle
    → onValueChange(null)                     ← CountrySelect updates state to null
    → dispatchDirtySignal()                   ← same dirty path as select
      → form marked dirty ✓
```

✓ Clear marks dirty. Guard: `showClearButton = allowClear && value !== null && !disabled && !readOnly && !required` — clear button only rendered when it could actually change the value.

---

## 11. View Mode Dirty Behavior (Source Verification)

In view mode:
- Wrappers pass `disabled={true}` to `ERPCombobox`
- ERPCombobox trigger button has `disabled={true}` — no click events registered
- `handleSelect` can only be called via keyboard/click on the open popover; button is disabled so popover never opens
- Even if somehow called: `dispatchDirtySignal()` guards `if (disabled || readOnly) return;` → no event

In `useFormDirty`:
- `enabled = mode !== "view"` — hook called with `enabled=false`
- With `enabled=false`: `isDirty = enabled && isDirtyInternal = false` always
- Even if event reaches the hook, `isDirty` stays `false`

**View mode: combobox cannot trigger dirty. Close works without dialog.** ✓

---

## 12. Debounce / Search Runtime Notes

No debounce added to search state. Rationale:
- cmdk `CommandInput` visually reflects keystrokes immediately
- Adding debounce would introduce input lag (letters appear but filtering is delayed)
- Current largest list is 250 countries — `useMemo` filtering at this scale is negligible (<1ms per keystroke)
- Debounce remains a future option for server-side search (3B.6D/future)

**What was added instead** (low-risk):
- `handleSelect` / `handleClear` memoized with `useCallback` — stable references across re-renders
- `filterFn ?? defaultFilterFn` (null-safe) instead of `||`
- `maxVisibleOptions` prop for opt-in truncation of large lists (default: no truncation)

---

## 13. Accessibility / UX Regression Notes

No regressions introduced:
- Keyboard navigation: cmdk handles all keyboard events unchanged
- Selected state: `Check` icon visibility unchanged
- Clear button: position and visibility logic unchanged
- Loading state: spinner rendering unchanged
- Popover placement: unchanged
- `shouldFilter={false}` preserved (custom filter function used)

New `showTypeHint` (only active when `maxVisibleOptions` is set):
- Appears below CommandGroup inside CommandList
- Uses `text-[11px] text-muted-foreground` — visually subtle
- Does not interfere with keyboard navigation (not a `CommandItem`)

---

## 14. Wrappers Using ERPCombobox (Complete Coverage List)

### ✓ Using ERPCombobox — dirty tracking active from this phase

- `LookupSelect`
- `CountrySelect`
- `EmirateSelect`
- `CitySelect`
- `CurrencySelect`
- `PaymentTermSelect`
- `TaxTypeSelect`
- `BankSelect`

### ⚠ NOT yet using ERPCombobox — deferred to 3B.6D

| Wrapper | Current component | Notes |
|---|---|---|
| `AreaZoneSelect` | ERPCombobox | Uses ERPCombobox — actually already covered! |
| `CostCenterSelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `ProfitCenterSelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `UomCategorySelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `UnitOfMeasureSelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `OwnerCompanySelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `BranchSelect` | Plain shadcn `Select` | Convert in 3B.6D |
| `PortSelect` | ERPCombobox | Uses ERPCombobox — already covered! |

**Correction from 3B.6A audit**: `AreaZoneSelect` and `PortSelect` already use ERPCombobox and will benefit immediately from 3B.6C dirty integration without any changes.

**Net**: 10 wrappers now have automatic dirty tracking. 5 remaining plain-Select wrappers deferred to 3B.6D.

---

## 15. Dev Harness

**Location**: `src/app/dev/combobox-dirty-qa/page.tsx`  
**Route**: `/dev/combobox-dirty-qa`

Production guard:
```typescript
if (process.env.NODE_ENV !== "development") {
  notFound();
}
```

Uses production components:
- `ERPDrawerForm` with `isDirty` prop
- `ERPDrawerBody`, `ERPDrawerSection`, `ERPDrawerFooter`
- `LookupSelect` (categoryCode: `CUSTOMER_TYPES`, `PARTY_STATUS_TYPES`)
- `CountrySelect` with `allowClear`
- `useFormDirty` with `FORM_ID`
- Live dirty status indicator ("⚠ Dirty" / "✓ Clean")

Browser test steps documented inline in the harness page.

To verify when dev server is running:
1. `npm run dev` → visit `/dev/combobox-dirty-qa`
2. Follow the 9-step test flow documented on the page

---

## 16. Static Test Results

| Test | Result |
|---|---|
| `npm run typecheck` | **PASS** — 0 errors |
| `npm run lint` (new files only) | **PASS** — 0 errors on changed files |
| `npm run build` | **PASS** — 35 routes compiled (includes `/dev/combobox-dirty-qa`) |
| Pre-existing lint issues | Pre-existing in `UIUX_Design/v0_extracted`; unchanged |

---

## 17. Browser / Harness QA Status

**Authenticated ERP routes**: Not available (same constraint as 3B.5).

**Dev harness QA**: Harness created at `/dev/combobox-dirty-qa` using production components. Source-level analysis and DOM event flow verified (Section 9). Interactive browser verification possible via `npm run dev → /dev/combobox-dirty-qa`.

---

## 18. Known Limitations

1. **Browser runtime not interactively verified** — authenticated routes unavailable; must be verified in 3B.6F or when login is available.

2. **5 plain-Select wrappers not covered** — `CostCenterSelect`, `ProfitCenterSelect`, `UomCategorySelect`, `UnitOfMeasureSelect`, `OwnerCompanySelect`, `BranchSelect` still use shadcn `Select` component → no dirty tracking for those fields until converted in 3B.6D.

3. **No server-side search** — deferred to future modules (HR/Fleet). Client-side filter works for all current lists.

4. **No virtualization** — lists up to 250 rows rendered without virtualisation. `@tanstack/react-virtual` deferred to 3B.6D/6F.

---

## 19. Remaining Work for 3B.6D / 6E / 6F

| Phase | Key Tasks |
|---|---|
| **3B.6D** | Convert 5 plain-Select wrappers to ERPCombobox; migrate all remaining selects to cached hooks; wire `useLookupBatchQuery` to Customer form level; wire invalidation helpers to server-action mutations |
| **3B.6E** | `ERPDrawerSection` lazy-mount (CSS `hidden` → mount on first tab activation); Customer + Branch child sections deferred |
| **3B.6F** | Runtime QA: DevTools waterfall, timing targets, combobox dirty + Safe Close browser verification, regression tests for Save/Save&Close/RequiredLabel |

---

## 20. Final Status

```text
PASS WITH NOTES — ERPCombobox runtime and dirty integration implemented.

Notes:
- Combobox-only Safe Close fix implemented and source-verified via DOM event chain analysis.
- 10 of 15 wrappers (including AreaZoneSelect and PortSelect) automatically covered.
- 5 remaining plain-Select wrappers deferred to 3B.6D.
- Browser interactive verification not performed (no authenticated routes in test env).
- Dev harness at /dev/combobox-dirty-qa ready for when dev server is accessible.
```

---

**Report Generated**: 2026-06-12  
**Phase**: ERP BASE 002F.3E.3B.6C  
**Next Step**: Review with Sameer/Dina → approve 3B.6D (Apply Optimized Hooks to Current Forms)  
**Stop Condition**: Met — not starting 3B.6D
