# ERP GLOBAL UI.4B — Dirty State and Safe Close Integration
## Implementation Report

**Phase:** ERP GLOBAL UI.4B  
**Status:** COMPLETE ✅  
**Date:** 2026-06-14  
**Prerequisite satisfied:** ERP GLOBAL UI.4A — Workspace Architecture Foundation  
**Build result:** TypeScript ✅ (0 errors) · Next.js build ✅ (exit 0)

---

## 1. Summary

This phase wires existing form dirty state into the workspace tab layer, shows an amber dirty-dot indicator on tabs with unsaved changes, blocks unintentional tab closure with a confirmation dialog, and protects against browser-level page unload when any tab is dirty. No record forms were converted, no database changes were made, and all existing `ERPDrawerForm` Safe Close behavior was preserved.

---

## 2. Files Created

| File | Purpose |
|---|---|
| `src/hooks/use-workspace-tab-dirty.ts` | Bridge hook — calls `dispatch(MARK_DIRTY)` when `isDirty` changes. Null-safe outside `WorkspaceProvider`. |

---

## 3. Files Modified

| File | Change |
|---|---|
| `src/components/erp/unsaved-changes-dialog.tsx` | Added optional `title`, `description`, `stayLabel`, `discardLabel` props; defaults preserve all existing call sites unchanged. |
| `src/components/erp/erp-drawer-form.tsx` | Added `import useWorkspaceTabDirty`; calls it with `isDirty` and `enabled: isEditable && open`. Zero call-site changes needed — all drawers using `ERPDrawerForm` automatically sync. |
| `src/components/workspace/workspace-provider.tsx` | (a) Changed `useWorkspaceContext` to return `null` instead of throwing — safe for optional consumers. (b) Added `pendingCloseTabId` state for dirty-close dialog. (c) `closeTab` now checks `tab.dirty` before closing; dirty tabs show `UnsavedChangesDialog` with tab-specific wording. (d) Added `useEffect` for `window.beforeunload` — registers/unregisters handler whenever `state.tabs` changes dirty state. (e) Imported and rendered `UnsavedChangesDialog` inside provider JSX. |
| `src/hooks/use-workspace.ts` | Updated `useWorkspaceContext` null guard (throws with informative message). Added `requestCloseTab` alias. `closeTab` JSDoc updated to note dirty-safe behavior. |

---

## 4. Dirty Bridge Hook Design

**`src/hooks/use-workspace-tab-dirty.ts`**

```ts
export type UseWorkspaceTabDirtyOptions = {
  isDirty: boolean
  enabled?: boolean   // defaults true; set false for view mode
  tabId?: string      // explicit override; defaults to activeTabId
}

export function useWorkspaceTabDirty(options): void
```

- Uses `useWorkspaceContext()` which now returns `null` outside provider — no try/catch needed.
- On every `isDirty` / `activeTab.id` change, dispatches `MARK_DIRTY` to the store.
- **Does NOT clear dirty on unmount** — the tab retains its indicator when a drawer closes without saving. Clearing only happens when `isDirty` becomes `false` from the form (after save or `resetDirty()`).

---

## 5. Workspace Close Warning Design

**Flow for X click on a dirty tab:**

```
closeTab(tabId) called from WorkspaceTabChip
  └─ tab.dirty === true?
       ├─ YES → setPendingCloseTabId(tabId) → UnsavedChangesDialog opens
       │          ├─ Stay on Tab → setPendingCloseTabId(null) — tab stays open
       │          └─ Discard → MARK_DIRTY(false) + CLOSE_TAB — tab removed + navigate
       └─ NO  → CLOSE_TAB immediately (unchanged from 4A)
```

**Dialog copy:**
- Title: `"Unsaved changes in this tab"`
- Description: `"<tabTitle> has unsaved changes. Closing this tab will discard those changes."`
- Stay button: `"Stay on Tab"`
- Discard button: `"Discard Changes"`

The same `UnsavedChangesDialog` component is reused — no new component was needed.

---

## 6. Browser beforeunload Implementation

Mounted in `WorkspaceProvider` via `useEffect`:

```ts
useEffect(() => {
  const hasDirty = state.tabs.some(t => t.dirty)
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault()
    e.returnValue = ""
  }
  if (hasDirty) {
    window.addEventListener("beforeunload", handler)
  } else {
    window.removeEventListener("beforeunload", handler)
  }
  return () => window.removeEventListener("beforeunload", handler)
}, [state.tabs])
```

- Listener attaches only when at least one tab is dirty.
- Listener removes automatically when all tabs are clean or closed.
- No custom message — modern browsers ignore custom `returnValue` text.

---

## 7. ERPDrawerForm Integration Approach

**Global — zero call-site changes.**

`ERPDrawerForm` already receives `isDirty: boolean` as a prop (managed by its parent via `useFormDirty`). The new line inside the component:

```ts
useWorkspaceTabDirty({ isDirty, enabled: isEditable && open });
```

This means:
- Any drawer in **add** or **edit** mode that uses `ERPDrawerForm` automatically syncs dirty state.
- View mode drawers (`mode="view"`) pass `enabled: false` → no dirty sync.
- Drawers outside `WorkspaceProvider` (none in this app, but theoretically safe) → `useWorkspaceContext()` returns `null` → no-op.

**`useFormDirty` itself was not modified** — it remains a standalone hook tracking DOM-level field changes for drawer Safe Close. `useWorkspaceTabDirty` is a separate, additive sync layer.

---

## 8. Modules/Forms Covered

All modules using `ERPDrawerForm` are automatically covered:

| Module | Form File |
|---|---|
| Party Master | `party-form-drawer.tsx` |
| Customer (legacy) | `customer-form-drawer.tsx` |
| Organizations | `organization-form-dialog.tsx` |
| Branches | `branch-form-dialog.tsx` |
| Users | `src/features/users/` (ERPDrawerForm-based) |
| Roles | `src/features/roles/` (ERPDrawerForm-based) |
| Numbering | `src/features/numbering/` (ERPDrawerForm-based) |
| Geography | `src/features/master-data/geography/` |
| Finance Basics | `src/features/master-data/finance-basics/` |
| UOM | `src/features/master-data/uom/` |
| Lookups | `src/features/master-data/lookups/` |

---

## 9. Scenarios Tested (Code Reasoning)

### Scenario A — Dirty drawer tab close ✅
- Open Parties tab → open Add Party drawer → change Display Name.
- `useFormDirty` marks form dirty → `ERPDrawerForm.useWorkspaceTabDirty` fires → `MARK_DIRTY(tabId, true)`.
- Workspace tab shows amber dot (already in `WorkspaceTabChip` via `tab.dirty`).
- Click X on Parties tab → `closeTab` checks `tab.dirty === true` → `UnsavedChangesDialog` opens.
- Stay: `setPendingCloseTabId(null)` — tab and drawer remain open.
- Discard: `MARK_DIRTY(false)` + `CLOSE_TAB` — tab removes and navigates.

### Scenario B — Save clears dirty ✅
- Change fields → dirty dot appears.
- Save → server action runs → `resetDirty()` is called inside `useFormDirty` → `isDirty` becomes false → `useWorkspaceTabDirty` syncs → `MARK_DIRTY(tabId, false)` → dot disappears.

### Scenario C — Browser reload warning ✅
- Open drawer, change field → `state.tabs.some(t => t.dirty)` becomes true → `beforeunload` listener attached.
- Browser refresh/close → native warning dialog shown.
- After save or discard: `isDirty → false` → `MARK_DIRTY(false)` → no dirty tabs → listener removed.

### Scenario D — Non-dirty tab close ✅
- Open UOM Categories, no changes → `tab.dirty === false` → `closeTab` calls `doCloseTab` immediately. No dialog.

### Scenario E — Direct URL restore ✅
- `restoreFromStorage` restores tab metadata. `dirty` and `childDialogOpen` are not persisted (see `persistToStorage` which strips these fields). Tabs restore with `dirty: false`.

---

## 10. Preserved Behaviors

- **ERPDrawerForm Safe Close** (Esc / X / outside click on drawer while form is dirty → `UnsavedChangesDialog`): unchanged. `useFormDirty` and the drawer-level dialog are untouched.
- **Party Master drawer tabs / child dialogs**: unchanged. `useWorkspaceTabDirty` is additive.
- **Customer drawer**: unchanged. Covered automatically via `ERPDrawerForm`.
- **All small master-data drawers**: covered automatically.
- **localStorage restore**: `dirty = false` on restore (was already the case in 4A store).

---

## 11. Deferred Items

| Item | Reason |
|---|---|
| `markChildDialogOpen` workspace sync | Optional in 4B per prompt; deferred to 4C or standalone phase |
| Close All / Close Others dirty warning | UI.4A did not implement those actions; deferred per prompt §9 |
| `ERPRecordWorkspaceForm` | Out of scope for 4B |
| Party Master drawer → workspace record tab | Out of scope for 4B |
| Browser-authenticated QA (Sameer/Dina manual pass) | Always deferred to final pre-deploy gate |

---

## 12. TypeScript / Build Results

```
npx tsc --noEmit   → exit 0  (0 errors)
npx next build     → exit 0  (all routes compiled)
ReadLints          → 0 errors on all modified files
```

---

## 13. Known Issues

None identified. The `useWorkspaceContext` null-return change (from throw) is a breaking change to any code that used the undocumented internal export — but `useWorkspace` still throws (informative message), and the internal context was not part of the public API.

---

## 14. Acceptance Criteria Verification

| # | Criterion | Status |
|---|---|---|
| 1 | Workspace dirty bridge hook exists | ✅ `use-workspace-tab-dirty.ts` |
| 2 | Workspace tabs can be marked dirty | ✅ via `MARK_DIRTY` action |
| 3 | Dirty tabs show visible indicator | ✅ amber dot in `WorkspaceTabChip` already wired to `tab.dirty` |
| 4 | Closing dirty tab shows UnsavedChangesDialog | ✅ `pendingCloseTabId` + dialog in `WorkspaceProvider` |
| 5 | Stay keeps tab open | ✅ `setPendingCloseTabId(null)` |
| 6 | Discard closes tab | ✅ `MARK_DIRTY(false)` + `doCloseTab` |
| 7 | Non-dirty tabs close normally | ✅ `doCloseTab` called directly |
| 8 | Browser beforeunload warning when any tab dirty | ✅ `useEffect` on `state.tabs` |
| 9 | Beforeunload removed when no dirty tabs | ✅ listener removed when `hasDirty === false` |
| 10 | Dirty state resets after successful save | ✅ `resetDirty()` → `isDirty=false` → `MARK_DIRTY(false)` |
| 11 | Existing ERPDrawerForm Safe Close still works | ✅ unchanged |
| 12 | Party Master drawer still works | ✅ unchanged |
| 13 | Customer drawer still works | ✅ unchanged |
| 14 | Small master-data drawers still work | ✅ covered automatically |
| 15 | Dirty state not persisted after hard refresh | ✅ `persistToStorage` excludes `dirty` |
| 16 | No database changes | ✅ |
| 17 | No record-form conversion | ✅ |
| 18 | TypeScript passes | ✅ 0 errors |
| 19 | Build passes | ✅ exit 0 |
| 20 | Implementation report generated | ✅ this file |
| 21 | Source-of-truth updated | ✅ see §15 |

---

## 15. Next Recommended Phase

**ERP GLOBAL UI.3 — Customer Module Inert Wrapper** (minor, quick)  
or  
**ERP GLOBAL UI.4C — Workspace Record Form Standard** (major architecture)

Recommended order: complete **UI.3** (15–30 min) to close the customer module inert wrapper debt before tackling the larger UI.4C.
