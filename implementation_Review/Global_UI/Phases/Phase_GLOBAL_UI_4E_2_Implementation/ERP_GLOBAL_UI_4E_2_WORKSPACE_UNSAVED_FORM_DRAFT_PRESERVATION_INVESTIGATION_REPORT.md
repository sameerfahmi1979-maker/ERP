# ERP GLOBAL UI.4E.2 — Workspace Unsaved Form Draft Preservation Investigation Report

**Document Type:** Investigation Report — Read-Only  
**Phase:** ERP GLOBAL UI.4E.2 — Investigation Only  
**Status:** INVESTIGATION COMPLETE — No runtime fixes implemented  
**Date:** 2026-06-14  
**Reported By:** Sameer  
**Investigated By:** Cursor Agent  

---

## 1. Phase Title and Status

**Phase:** ERP GLOBAL UI.4E.2 — Workspace Unsaved Form Draft Preservation  
**Status:** INVESTIGATION COMPLETE — Implementation pending approval  

---

## 2. Sameer-Reported Issue

> "If I open New Party, start entering data without saving, then open another form/menu/tab and return to New Party, the fields are empty."

Expected ERP behavior: dirty unsaved workspace tabs must preserve entered values while the tab remains open in the workspace bar.

---

## 3. Root Cause Analysis

### 3.1 Primary Root Cause — Next.js App Router Unmounts on Navigation

The workspace system is architecturally a **metadata-only tab bar layered on top of Next.js App Router navigation**.

When a user switches from one workspace tab to another:

1. `setActiveTab(tabId)` is called in `WorkspaceProvider`
2. `router.push(tab.route)` fires — a standard Next.js App Router navigation
3. Next.js **fully unmounts** the current page component tree and **mounts** the target route's page component
4. When the user switches back, `router.push(original.route)` fires again
5. The original page **remounts fresh** from the server — all React state is gone

This is not a bug — it is the fundamental behavior of Next.js App Router. The workspace tab bar is a UI illusion of "open tabs" but under the hood each tab switch is a full page navigation.

### 3.2 Confirmed by Code

**`src/components/layout/erp-shell.tsx`** — the layout structure:

```tsx
<WorkspaceContent>
  {children}   // ← THIS IS THE NEXT.JS PAGE. Changes on every navigation.
</WorkspaceContent>
```

**`src/components/workspace/workspace-content.tsx`** — `WorkspaceContent` is a thin wrapper with zero keep-alive logic:

```tsx
export function WorkspaceContent({ children }: WorkspaceContentProps) {
  return (
    <main className="...">
      {children}   // ← Passthrough only. No cache. No slot. No visibility control.
    </main>
  );
}
```

**`src/components/workspace/workspace-provider.tsx`** — tab switching calls `router.push()`:

```tsx
const setActiveTab = useCallback((tabId: string) => {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  dispatch({ type: "SET_ACTIVE_TAB", tabId });
  router.push(tab.route);   // ← Full Next.js navigation = page unmount
}, [state.tabs, router]);
```

### 3.3 Secondary Root Cause — All Forms Use Uncontrolled Inputs

All 23 workspace forms use React **uncontrolled inputs** with `defaultValue`:

```tsx
<Input id="full_name" name="full_name" defaultValue={user?.full_name ?? ""} />
```

`defaultValue` in React is **only applied on initial mount**. On remount (after navigation), React re-reads `defaultValue` from props — which come from server-fetched data, not the user's unsaved edits. The result: all typed values are silently reset.

**Confirmed count across all workspace forms:**
- 97 `defaultValue={...}` usages
- 127 `value={...}` usages (controlled selects and comboboxes for cascading state like company → branch)

### 3.4 Tertiary Cause — `useFormDirty` Actively Clears Dirty State on Unmount

`src/hooks/use-form-dirty.ts` has a MutationObserver that explicitly resets the dirty flag when the form element leaves the DOM:

```tsx
useEffect(() => {
  if (!isDirtyInternal) return undefined;
  const observer = new MutationObserver(() => {
    if (!document.getElementById(formId)) {
      setIsDirtyInternal(false);  // ← Deliberately clears dirty when form unmounts
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}, [isDirtyInternal, formId]);
```

This means switching tabs not only clears the field values but also resets the dirty indicator — so the tab loses its "dirty" dot indicator when the user returns.

### 3.5 The Workspace Page State Cache Does Not Cover Form Fields

`src/lib/workspace/workspace-page-state.ts` provides localStorage helpers for UI state. Its own comments explicitly exclude form field values:

> "Do NOT store unsaved form field values containing PII (bank account, IBAN, etc.)  
> ONLY store safe UI state: search, sort, pagination, section ids, scroll positions"

The existing page state cache is explicitly scoped to **non-form** UI state (table preferences, scroll, active sections).

---

## 4. Affected Forms

**All 23 workspace forms are affected.** Any form that has been switched away from and returned to will lose all unsaved field values. This includes:

- New record forms (most impacted — no server data, all values are user-entered)
- Edit record forms (moderately impacted — server defaults survive remount, but user's in-progress edits are lost)
- View forms (not impacted — no user input)

---

## 5. System-Wide Form Audit Matrix

| Module | Form Component | Form ID | Modes | Uses ERPRecordWorkspaceForm | Uses useFormDirty | Loses Unsaved Values | Has Sensitive Fields | Sensitive Fields | Draft Key | Integration Complexity |
|--------|----------------|---------|-------|---------------------------|-------------------|---------------------|---------------------|-----------------|-----------|----------------------|
| Party Master | `party-workspace-form.tsx` | `party-workspace-form` | add/edit/view | Yes | Yes | Yes (critical) | Low | trn, trade_license_number | `draft:tab:{tabId}:party-workspace-form` | Medium (many sections, controlled comboboxes) |
| Legacy Customer | `customer-workspace-form.tsx` | `customer-workspace-form` | add/edit/view | Yes | Yes | Yes (critical) | Low | trn, trade_license_number, license_expiry_date | `draft:tab:{tabId}:customer-workspace-form` | Medium |
| Banks | `bank-workspace-form.tsx` | `bank-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:bank-workspace-form` | Low |
| Currencies | `currency-workspace-form.tsx` | `currency-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:currency-workspace-form` | Low |
| Payment Terms | `payment-term-workspace-form.tsx` | `payment-term-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:payment-term-workspace-form` | Low |
| Tax Types | `tax-type-workspace-form.tsx` | `tax-type-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:tax-type-workspace-form` | Low |
| Cost Centers | `cost-center-workspace-form.tsx` | `cost-center-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:cost-center-workspace-form` | Low |
| Profit Centers | `profit-center-workspace-form.tsx` | `profit-center-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:profit-center-workspace-form` | Low |
| UOM Categories | `uom-category-workspace-form.tsx` | `uom-category-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:uom-category-workspace-form` | Low |
| Units of Measure | `unit-workspace-form.tsx` | `unit-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:unit-workspace-form` | Low |
| UOM Conversions | `conversion-workspace-form.tsx` | `conversion-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:conversion-workspace-form` | Low |
| Countries | `country-workspace-form.tsx` | `country-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:country-workspace-form` | Low |
| Emirates / Regions | `emirate-workspace-form.tsx` | `emirate-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:emirate-workspace-form` | Low |
| Cities | `city-workspace-form.tsx` | `city-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:city-workspace-form` | Low |
| Areas / Zones | `area-workspace-form.tsx` | `area-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:area-workspace-form` | Low |
| Ports | `port-workspace-form.tsx` | `port-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:port-workspace-form` | Low |
| Lookup Categories | `lookup-category-workspace-form.tsx` | `lookup-category-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:lookup-category-workspace-form` | Low |
| Lookup Values | `lookup-value-workspace-form.tsx` | `lookup-value-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:lookup-value-workspace-form` | Low |
| Roles | `role-workspace-form.tsx` | `role-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:role-workspace-form` | Low |
| Organizations | `organization-workspace-form.tsx` | `organization-workspace-form` | add/edit/view | Yes | Yes | Yes | Medium | trade_license_no, trn | `draft:tab:{tabId}:organization-workspace-form` | Medium |
| Branches | `branch-workspace-form.tsx` | `branch-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:branch-workspace-form` | Low |
| Numbering Rules | `numbering-rule-workspace-form.tsx` | `numbering-rule-workspace-form` | add/edit/view | Yes | Yes | Yes | Low | None | `draft:tab:{tabId}:numbering-rule-workspace-form` | Low |
| Users | `user-workspace-form.tsx` | `user-workspace-form` | add/edit/view | Yes | Yes | Yes | HIGH | `temporary_password` (auth credential) | `draft:tab:{tabId}:user-workspace-form` | Medium — `temporary_password` MUST be in denylist |

---

## 6. Security and Sensitivity Analysis

### 6.1 Sensitive Fields Identified

| Field | Form(s) | Risk Level | Decision |
|-------|---------|------------|----------|
| `temporary_password` | UserWorkspaceForm (add mode) | CRITICAL | Must NEVER enter draft store. Always exclude. |
| `trn` (Tax Registration Number) | Party, Customer, Organization | Low-Medium | Acceptable in in-memory draft; excluded from any localStorage |
| `trade_license_no` / `trade_license_number` | Organization, Customer | Low-Medium | Acceptable in in-memory draft; excluded from any localStorage |
| `license_expiry_date`, `trade_license_issue_date` | Organization, Customer | Low | Acceptable in in-memory draft |
| `iban` | Not currently in any form (Party has bank detail child entities) | N/A | Bank detail child forms use `ERPChildDialogForm` — modal state handles this naturally |
| `bank_account_number` | Not currently in any workspace form | N/A | Same — child dialog, no preservation needed |
| `notes` with sensitive content | Party, Customer | Low | Acceptable in in-memory draft |

### 6.2 Storage Risk Classification

| Storage Type | Risk | Decision |
|-------------|------|----------|
| In-memory (React context/ref) | Low — lost on page refresh, stays in JS heap | **RECOMMENDED for v1** |
| sessionStorage | Medium — survives refresh, written to disk, accessible by same-origin scripts | Optional future phase with strict denylist |
| localStorage | High — persists across sessions, accessible by same-origin scripts, can expose business data | **NOT RECOMMENDED** for form field values |

### 6.3 Security Rules for Draft Store

1. The draft store MUST maintain an explicit **field denylist** checked before any value is stored.
2. Fields on the denylist are never stored in the draft, even in-memory (to eliminate accidental future promotion to sessionStorage).
3. Denylist includes at minimum: `password`, `temporary_password`, `confirm_password`, `token`, `secret`, `api_key`.
4. Full IBAN, complete bank account numbers, Emirates ID, and passport numbers — if ever added to workspace forms — must also be on the denylist.
5. In-memory draft is cleared when: tab closes, save succeeds, user explicitly discards changes.
6. Draft must NEVER be serialized to `localStorage` by any utility in `workspace-page-state.ts`.

---

## 7. Solution Options Evaluated

### Option A — True Keep-Alive Workspace Tabs

**Approach:** Mount all open workspace tabs simultaneously; use CSS `display:none` / `visibility:hidden` to hide inactive tabs. The React component trees remain mounted and preserve all state naturally.

**In-depth analysis for Next.js App Router:**

The current architecture renders the current page via `{children}` in `WorkspaceContent`. The `children` prop is the Next.js page for the current route — it changes when the route changes. To implement true keep-alive:
- We would need to capture each page's rendered output and store it in React state
- This is feasible for **client components** — React can keep client component trees alive if we intercept the `children` prop, store previous pages in a `Map<route, ReactNode>`, and render all of them (with only the active one visible)
- Server components present a complication — the server side re-runs on navigation, but the **client component hydration tree** would stay alive
- Implementation would require modifying `WorkspaceContent` to maintain a slot map and `WorkspaceProvider` to intercept route changes before they trigger unmount

**Assessment:**
- Technically possible but architecturally invasive
- Risk: Next.js may not allow stable `ReactNode` storage across navigations cleanly
- Risk: Memory consumption scales with number of open tabs (8 max = manageable)
- Benefit: Zero form refactoring — all state preserved automatically
- Benefit: Scroll position, section state, combobox state all preserved

**Verdict:** Viable but complex. Requires careful Next.js integration work. Recommended for a future phase if Option E proves insufficient.

### Option B — In-Memory Draft Store

**Approach:** A global in-memory React context (`WorkspaceDraftStore`) stores form field snapshots keyed by `tabId:formId`. On form mount, if a draft exists for the tab, values are restored via `defaultValue` injection (merged with server data).

**How it works:**
1. `WorkspaceDraftStore` — a context holding a `Map<string, Record<string, string>>` (draft values keyed by draft key)
2. `useWorkspaceFormDraft(draftKey)` — hook that reads/writes from the store
3. On form mount: `getDraftDefault(fieldName, serverDefault)` returns draft value if exists, else server value
4. On any form input: debounced `FormData` snapshot is stored in the draft map (after filtering denylist)
5. On save success: `clearDraft(draftKey)` is called
6. On tab close: draft is cleared

**Compatibility with current forms:**
- Forms already use `defaultValue={serverValue}` — change to `defaultValue={getDraftDefault("field", serverValue)}`
- Since forms **remount** on navigation, the new `defaultValue` will be applied fresh from draft on remount
- This is the critical insight: `defaultValue` IS re-read on remount, so if the draft provides the correct value, it will be restored

**Assessment:**
- Safe — in-memory only, no disk writes
- Requires per-field change in all 23 forms (but each change is small: replace `serverValue` with `getDraftDefault("field", serverValue)`)
- Handles uncontrolled inputs cleanly via `defaultValue` on remount
- Special handling needed for: controlled selects, comboboxes, checkbox state
- The denylist prevents sensitive data from entering the store

**Verdict:** Best option for current architecture. Low security risk. Tractable refactoring.

### Option C — sessionStorage Draft Store

**Approach:** Same as Option B but persist to `sessionStorage` so drafts survive browser refresh.

**Assessment:**
- Survives refresh — better UX
- Written to disk — sensitive data risk even with denylist
- Recommended only as an optional future phase after strict field-level audit

**Verdict:** Deferred. May be added in a later phase with a strict field allowlist.

### Option D — Require Save Before Tab Switch

**EXPLICITLY REJECTED.** This is not acceptable ERP behavior. Users must be able to freely navigate the workspace without being forced to save unfinished work. The tab-based workspace paradigm implies parallel open work.

### Option E — Hybrid Recommended Solution (Selected)

**In-memory draft store (Option B) as the primary fix, with `beforeunload` already in place.**

- In-memory `WorkspaceDraftStore` for all workspace record form values
- `beforeunload` warning (already implemented in `WorkspaceProvider`) for browser refresh/close
- No sessionStorage or localStorage for form field values
- Strict field denylist enforced at draft write time
- Optional sessionStorage upgrade in a future security-reviewed phase

---

## 8. Recommended Solution

**Option E — In-Memory Workspace Draft Store**

Rationale:
1. Lowest security risk — data never touches disk
2. Compatible with all 23 existing forms without architecture overhaul
3. Works naturally with uncontrolled inputs (`defaultValue` re-read on remount)
4. Minimal cognitive overhead for developers — one hook, one helper function per form
5. Satisfies the UX requirement: switching tabs preserves dirty form data
6. `temporary_password` and any future sensitive fields are protected by the denylist

---

## 9. Proposed Files to Create

```
src/lib/workspace/workspace-draft-types.ts
  — Draft key types, storage types, field denylist definitions

src/lib/workspace/workspace-draft-store.ts  
  — In-memory Map, read/write/clear operations, FormData snapshot utility

src/hooks/use-workspace-form-draft.ts
  — React hook: getDraftDefault(), syncDraft(), clearDraft(), draftKey builder

src/components/workspace/workspace-draft-provider.tsx
  — React context provider wrapping the draft store (add to WorkspaceProvider subtree)

docs/standards/ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md
  — Standard doc for draft preservation rules

.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc
  — Cursor rule enforcement
```

---

## 10. Proposed Files to Modify

```
src/components/workspace/workspace-provider.tsx
  — Wrap with WorkspaceDraftProvider; pass tabId to clearDraft on tab close

src/components/workspace/workspace-content.tsx
  — No changes needed

src/hooks/use-form-dirty.ts
  — The MutationObserver that clears dirty on unmount should be suppressed if a draft exists
  — OR: draft existence should restore dirty state on remount

All 23 workspace form files (src/features/**/*-workspace-form.tsx):
  — Import useWorkspaceFormDraft
  — Replace defaultValue={serverValue} with defaultValue={getDraftDefault("field", serverValue)}
  — Add onInput/onChange draft sync call
  — Add clearDraft() call in handleSave success and handleDiscard

src/features/users/user-workspace-form.tsx — SPECIAL CASE:
  — temporary_password field must never call getDraftDefault — always use "" as defaultValue
  — Ensure field name is in the global denylist
```

---

## 11. Draft Key Strategy

### Key Format

```
draft:tab:{tabId}:{formId}
```

**For new records (add mode):** keyed by `tabId` — the tab UUID is stable for the lifetime of the tab.

**For existing records (edit mode):** optionally also keyed by `entityType:entityId:formId` to survive tab close/reopen:

```
draft:tab:{tabId}:{formId}          — primary key (always used)
draft:record:{entityType}:{entityId}:{formId}  — optional secondary key for edit mode persistence
```

For the initial implementation, **only `draft:tab:{tabId}:{formId}` is needed** — per-tab in-memory draft with no cross-tab persistence.

### Examples

```
draft:tab:3f2a-...-uuid:party-workspace-form
draft:tab:7b1c-...-uuid:bank-workspace-form
draft:tab:9e4d-...-uuid:user-workspace-form       (no password field)
draft:tab:2a0f-...-uuid:organization-workspace-form
```

---

## 12. Storage Strategy

**Phase 1 (this implementation):** In-memory only.

- `WorkspaceDraftStore` is a `React.useRef<Map<string, Record<string, string>>>` held in a context provider
- Data lives in the JavaScript heap — cleared on page refresh, browser close, or tab close
- Zero disk writes
- Zero serialization

**Phase 2 (future, security-reviewed):** sessionStorage with strict field allowlist.

- Only non-sensitive fields would be allowed
- Allowlist approach (opt-in) rather than denylist (opt-out) — safer default
- Would require a separate security review before implementation

---

## 13. Form Integration Strategy

### Recommended: FormData Snapshot + defaultValue Injection

**Why this approach:**
- All 23 forms already use uncontrolled `defaultValue` inputs
- React re-reads `defaultValue` on remount — so draft values injected as `defaultValue` will be applied on the next mount
- No need to switch to controlled inputs — avoids large-scale refactoring
- `new FormData(form)` captures all named inputs including hidden fields

**Integration pattern per form:**

```tsx
// 1. At top of form component:
const { getDraftDefault, syncDraft, clearDraft, draftKey } = useWorkspaceFormDraft({
  tabId: activeTab?.id ?? "",
  formId: "party-workspace-form",
});

// 2. In JSX — replace defaultValue:
<Input
  name="legal_name_en"
  defaultValue={getDraftDefault("legal_name_en", party?.legal_name_en ?? "")}
/>

// 3. On form — attach sync:
<form id={FORM_ID} onInput={() => syncDraft(FORM_ID)}>

// 4. On save success — clear draft:
const result = await saveFn(data);
if (result.success) {
  clearDraft();
  resetDirty();
  ...
}
```

**FormData snapshot utility:**

```ts
// In workspace-draft-store.ts
const FIELD_DENYLIST = new Set([
  "password", "temporary_password", "confirm_password",
  "token", "api_key", "secret",
]);

export function snapshotFormData(formId: string): Record<string, string> {
  const form = document.getElementById(formId) as HTMLFormElement | null;
  if (!form) return {};
  const fd = new FormData(form);
  const snapshot: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (!FIELD_DENYLIST.has(key) && typeof value === "string") {
      snapshot[key] = value;
    }
  });
  return snapshot;
}
```

---

## 14. Restore Strategy

On form remount, `getDraftDefault(fieldName, serverFallback)` is called for each field:

```ts
function getDraftDefault(fieldName: string, serverFallback: string): string {
  const draft = draftMap.get(draftKey);
  if (draft && fieldName in draft) {
    return draft[fieldName];
  }
  return serverFallback;
}
```

Since all forms use `defaultValue={getDraftDefault(...)}`, on remount after navigation, the draft value becomes the effective `defaultValue` for each input — restoring exactly what the user had typed.

### Handling Special Input Types

| Input Type | Restore Strategy |
|-----------|-----------------|
| `<Input type="text">` | `defaultValue={getDraftDefault("field", serverValue)}` |
| `<Input type="date">` | Same as text — `defaultValue` accepts ISO date strings |
| `<Input type="number">` | Same as text |
| `<Input type="email" / "url">` | Same as text |
| `<Textarea>` | `defaultValue={getDraftDefault("field", serverValue)}` |
| `<select>` (uncontrolled) | `defaultValue={getDraftDefault("field", serverValue)}` |
| `<select>` (controlled with `value={}`) | Read from draft in `useState` initializer |
| `<Checkbox>` | `defaultChecked` or read from draft in `useState` |
| `ERPCombobox` / `LookupSelect` | Read draft value in `useState(getDraftDefault("field", serverValue))` |
| Hidden / lazy-mounted sections | Draft values are stored globally in the draft map; fields in lazy sections read from draft when they mount |
| Lazy `ERPRecordSectionPanel` | Already stay mounted after first activation (keepMounted pattern). So lazy mount itself is not a problem once visited. BUT if a section was never visited and a draft exists, fields in that section will still get correct `defaultValue` when they first mount. |

### Dirty State Restoration

Currently `useFormDirty` resets to clean when the form leaves the DOM. After implementing draft:

- On remount: if a draft exists for `draftKey`, `markDirty` should be called on the workspace tab to restore the dirty indicator
- This can be done in `useWorkspaceFormDraft` via a `useEffect` on mount: `if (hasDraft(draftKey)) markDirty(tabId)`

---

## 15. Save / Discard Cleanup Strategy

| Event | Draft Action |
|-------|-------------|
| Save succeeds | `clearDraft(draftKey)` + `resetDirty()` |
| Save & Close succeeds | `clearDraft(draftKey)` + `resetDirty()` + `closeTab()` |
| User clicks "Discard Changes" in dirty-close dialog | `clearDraft(draftKey)` + `doCloseTab()` |
| Tab is closed cleanly (not dirty) | `clearDraft(draftKey)` (cleanup) |
| User types in form (any input/change event) | `syncDraft(formId)` — debounced |

**Draft must NOT be cleared when:**
- User switches workspace tabs
- User opens another menu item
- User opens a list screen
- Component remounts due to route navigation
- Child dialog opens/closes

---

## 16. Lazy Section and Child Tab Handling

**`ERPRecordSectionPanel` with `lazyMount=true`:** These sections do not render their children until first activated. When a draft exists and the user navigates back to the form, the lazy section has never been visited — so its inputs have not mounted yet and cannot be synced.

**Solution:** Draft values are stored at the form level (not per-section). When the lazy section finally mounts, its inputs call `getDraftDefault()` with the correct field names and receive the draft value as `defaultValue`. The draft snapshot will have those field values from before the tab switch (if the user had visited that section before).

**If the user had never visited the lazy section before switching tabs:** No draft values for those fields — defaults to server value. This is correct behavior since the user hadn't touched those fields.

---

## 17. Combobox Handling

`ERPCombobox` and `LookupSelect` components are typically used as controlled components with `useState`:

```tsx
const [selectedValue, setSelectedValue] = useState<string>(initial);
```

**Draft integration for controlled comboboxes:**

```tsx
const { getDraftDefault } = useWorkspaceFormDraft({ tabId, formId: "party-workspace-form" });

// Read initial value from draft if exists
const [selectedTypeId, setSelectedTypeId] = useState(
  getDraftDefault("party_type_id", party?.party_type_id?.toString() ?? "")
);
```

Since `useState` initializer runs only on first mount — and draft reads from the in-memory map synchronously — this works correctly on remount.

For the sync: when the `onChange` of a combobox fires, write to draft:
```tsx
onChange={(value) => {
  setSelectedTypeId(value);
  writeDraftField(draftKey, "party_type_id", value);
}}
```

---

## 18. Dirty State Integration

Current flow:
1. `useFormDirty` tracks `isDirty` per form
2. Forms call `markDirty(tabId, isDirty)` via workspace hook on `isDirty` change
3. The workspace tab shows a dirty dot indicator

After draft integration:
1. On form remount, `useWorkspaceFormDraft` checks if a draft exists for `draftKey`
2. If yes: immediately calls `markDirty(tabId, true)` to restore the tab's dirty dot
3. The dirty dot will correctly reappear when switching back to a dirty tab

This restores the complete visual state — not just field values but also the dirty indicator.

---

## 19. Browser Refresh Behavior

**Current (already implemented):** `WorkspaceProvider` attaches a `beforeunload` handler when any tab is `dirty`. The browser shows a "Leave site?" dialog. This is the correct behavior.

**After draft implementation:** The `beforeunload` warning continues to work as-is. The tab's `dirty` state will be correctly restored on remount (see section 18), so `beforeunload` will still fire if the user had unsaved work.

**Draft data on refresh:** In-memory drafts are lost on browser refresh. This is acceptable for Phase 1. The `beforeunload` warning protects against accidental data loss by making the user confirm before leaving.

**Optional Phase 2:** sessionStorage drafts would survive a single refresh with strict allowlist — but requires a separate security review and is explicitly deferred.

---

## 20. Cursor Rule Updates Needed

The following rules should be added/updated in the next implementation phase:

```
.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc
```

Draft rule text (to be finalized in implementation phase):

```text
1. Workspace record forms MUST preserve unsaved field values while the workspace tab is open.
2. Switching workspace tabs MUST NOT clear dirty unsaved form data.
3. Opening menus or other forms MUST NOT clear dirty unsaved form data.
4. Draft values are stored in in-memory WorkspaceDraftStore only.
5. Do NOT store sensitive form values in localStorage or sessionStorage.
6. Fields named: password, temporary_password, confirm_password, token, secret, api_key MUST be in the field denylist and excluded from all draft storage.
7. Drafts clear ONLY after: save success, save-and-close success, user confirms Discard Changes, or tab is cleanly closed.
8. All workspace form implementations MUST use useWorkspaceFormDraft hook.
9. getDraftDefault(fieldName, serverFallback) MUST be used as the source for all defaultValue props.
10. On save success, clearDraft() MUST be called before closeTab() or resetDirty().
11. Child ERPChildDialogForm instances do NOT need draft preservation — modal state naturally persists while open.
```

---

## 21. Acceptance Criteria for Next Implementation Phase

The implementation phase is complete only if:

```text
1. WorkspaceDraftProvider is created and integrated into WorkspaceProvider subtree
2. workspace-draft-store.ts implements the in-memory Map, field denylist, snapshotFormData, clearDraft
3. use-workspace-form-draft.ts hook is created with getDraftDefault, syncDraft, clearDraft, hasDraft
4. All 23 workspace forms use getDraftDefault for all defaultValue props
5. All 23 workspace forms call syncDraft on form onInput
6. All 23 workspace forms call clearDraft on save success
7. user-workspace-form.tsx temporary_password field is excluded from draft
8. On tab remount with existing draft, the dirty dot indicator is restored
9. Tab close (discard path) clears the draft
10. TypeScript passes clean
11. No sensitive fields (password, token, api_key) appear in any draft snapshot
12. Cursor rules updated
13. Implementation report created
14. Source of Truth updated
```

---

## 22. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|---------|-----------|
| Stale draft applied to a different record (e.g., edit user A, close tab, edit user B in same tab) | Medium | Draft key includes `tabId` — each tab has a unique UUID. New tab opened for user B has a different tabId, different draft key. No collision. |
| Draft not cleared after save (data persistence confusion) | Medium | Explicit `clearDraft()` call required in every `handleSave` success path. Enforced by Cursor rule. |
| Memory growth if many tabs left open for extended sessions | Low | MAX_TABS = 8. Each draft is a flat `Record<string, string>`. 8 tabs × ~50 fields × ~100 chars = ~40KB max. Negligible. |
| Sensitive field accidentally entered into draft store | High | Explicit static denylist checked at `snapshotFormData()` level. Denylist is shared across all forms. |
| Combobox state not captured by FormData snapshot | Medium | Combobox values written individually via `writeDraftField()` in `onChange` handler. Controlled selects initialized from `getDraftDefault()` in `useState` initializer. |
| Lazy section values not captured before tab switch | Low | If section was never visited, no values to capture. Once visited, inputs are mounted and captured in FormData. |
| `useFormDirty` MutationObserver clearing dirty state on unmount before draft restoration | Medium | Add `hasDraft(draftKey)` check in workspace form's `useEffect` on mount — call `markDirty(tabId, true)` if draft exists. This restores the dirty indicator. |
| sessionStorage promotion in future without security review | Medium | Standard doc and Cursor rule explicitly prohibit this. Any promotion requires explicit security review phase. |

---

## 23. Exact Next Implementation Prompt Scope

The next prompt (`ERP_GLOBAL_UI_4E_2_WORKSPACE_UNSAVED_FORM_DRAFT_PRESERVATION_IMPLEMENTATION_PROMPT.md`) should implement:

### Phase 4E.2-IMPL — In-Memory Workspace Draft Store

**New files to create:**
1. `src/lib/workspace/workspace-draft-types.ts` — types, field denylist
2. `src/lib/workspace/workspace-draft-store.ts` — in-memory store, snapshotFormData, CRUD
3. `src/hooks/use-workspace-form-draft.ts` — hook for forms
4. `src/components/workspace/workspace-draft-provider.tsx` — React context provider
5. `docs/standards/ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md`
6. `.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc`

**Files to modify:**
1. `src/components/workspace/workspace-provider.tsx` — integrate draft provider, clear draft on tab close
2. All 23 workspace form files — add `useWorkspaceFormDraft`, `getDraftDefault`, `syncDraft`, `clearDraft`

**Draft key pattern:** `draft:tab:{tabId}:{formId}`

**Field denylist:** `password`, `temporary_password`, `confirm_password`, `token`, `api_key`, `secret`

**Do NOT:**
- Write to localStorage or sessionStorage
- Modify database schema
- Change server actions
- Change routing
- Convert any form patterns
- Implement sessionStorage upgrade

---

## Summary

The unsaved form data loss is caused by a fundamental architectural fact: **the ERP workspace tabs are a metadata UI layer over Next.js App Router navigation**. Every tab switch is a full page navigation that unmounts and remounts the form component. All 23 workspace forms use uncontrolled inputs with `defaultValue`, which reset to server values on each remount.

The recommended fix is an **in-memory `WorkspaceDraftStore`** that captures a `FormData` snapshot on every input event (filtered by a field denylist), keyed by `draft:tab:{tabId}:{formId}`. On remount, form fields read their initial value from `getDraftDefault(field, serverFallback)` instead of directly from server data. This restores all user-entered values transparently.

Option D (require save before switching) is explicitly rejected.

Implementation must not begin until Sameer reviews and approves this report.
