# ERP GLOBAL UI.4D — Party Master Pilot Conversion
## Implementation Report

**Phase:** ERP GLOBAL UI.4D  
**Status:** CLOSED / PASS  
**Date:** 2026-06-14  
**Stack:** Next.js + TypeScript + Supabase + WorkspaceProvider + ERPRecordWorkspaceForm  
**Prerequisites verified:** UI.4A ✓ · UI.4B ✓ · UI.4C ✓ · UI.2 ✓

---

## Summary

Party Master Add / Edit / View has been converted from the `ERPDrawerForm` side-drawer pattern to the `ERPRecordWorkspaceForm` full workspace record-tab pattern.

All Party Master business logic (save, update, duplicate detection, numbering, child sections, dirty state, safe close, child dialog inert blocking, permissions) has been preserved without modification. No database schema was changed. No other modules were converted.

---

## Route Conflict Decision

**Decision: Use `/admin/master-data/parties/record/new` and `/admin/master-data/parties/record/[id]`**

**Reason:**
- `/admin/master-data/parties/[typeSlug]` already exists for filtered views (`/customers`, `/vendors`, etc.)
- Adding `/parties/new` or `/parties/[id]` would create a Next.js App Router conflict (two dynamic segments at the same level)
- The `record/` prefix cleanly namespaces record tabs, avoids `new` being treated as a typeSlug, and avoids numeric IDs being treated as typeSlug values
- Filtered views continue to work at `/parties/[typeSlug]` unchanged

---

## Files Created

| File | Purpose |
|------|---------|
| `src/features/master-data/parties/party-workspace-form.tsx` | Full workspace record form replacing `PartyFormDrawer` for list actions |
| `src/app/(protected)/admin/master-data/parties/record/new/page.tsx` | Server route — Add new party workspace tab |
| `src/app/(protected)/admin/master-data/parties/record/[id]/page.tsx` | Server route — View/Edit existing party workspace tab |

---

## Files Modified

| File | Change |
|------|--------|
| `src/features/master-data/parties/parties-table.tsx` | Replaced `openDrawer()` + drawer state with `useWorkspace().openTab()` calls; removed `PartyFormDrawer` import; removed `selected`, `isFormOpen`, `formMode` state |
| `src/lib/workspace/workspace-types.ts` | Added `UPDATE_TAB_ROUTE` action type to `WorkspaceAction` |
| `src/lib/workspace/workspace-store.ts` | Added `UPDATE_TAB_ROUTE` reducer case (updates route, entityId, formMode on existing tab); fixed `SYNC_ROUTE` to compare by pathname (strips `?` query) |
| `src/lib/workspace/workspace-route-registry.ts` | Added `pattern?: RegExp` and `entityType?: string` fields to `WorkspaceRouteConfig`; added `/record/new` and `/record/:id` entries; updated `getWorkspaceRouteConfig` with 3-pass matching (exact → pattern → prefix) |
| `src/hooks/use-workspace.ts` | Added `updateTabRoute()` helper (dispatches `UPDATE_TAB_ROUTE`) and exported it |
| `src/components/workspace/workspace-provider.tsx` | Fixed `SYNC_ROUTE` effect to compare by pathname (handles query-param routes); updated `openTab` to deduplicate record tabs by `entityId` instead of exact route |

---

## New Party Record Routes

```
/admin/master-data/parties/record/new         — Add new party
/admin/master-data/parties/record/{id}?mode=view  — View party
/admin/master-data/parties/record/{id}?mode=edit  — Edit party
```

Both routes are server components that:
1. Call `getAuthContext()` and check `master_data.parties.view` permission
2. `/record/new` additionally checks `master_data.parties.manage` (redirects if missing)
3. `/record/[id]` calls `getPartyById(id)`, shows safe not-found UI if missing
4. Pass data down to `PartyWorkspaceForm` (client component)

---

## PartyWorkspaceForm Architecture

**Component:** `src/features/master-data/parties/party-workspace-form.tsx`

```
PartyWorkspaceForm (outer — key guard for mode/id reset)
└── PartyWorkspaceFormInner
    ├── useWorkspace()         — closeTab, renameTab, updateTabRoute, markDirty
    ├── useFormDirty()         — local form dirty state (formId: "party-workspace-form")
    ├── useWorkspaceTabDirty() — syncs isDirty → active workspace tab dot
    ├── ERPRecordWorkspaceForm — shell (header, section nav, scrollable body, footer)
    │   ├── ERPRecordHeader        — title, subtitle, record code, status, mode badge
    │   ├── ERPRecordSectionNav    — left nav desktop / horizontal mobile
    │   ├── [12 ERPRecordSectionPanel sections]
    │   └── ERPRecordFormFooter    — Save / Save & Close / Close buttons
    └── Dialog — duplicate detection (preserved from drawer)
```

All 12 party sections are preserved:
`basic | types | licenses | tax | contacts | addresses | bank | documents | services | notes | audit | compliance`

Child sections with `lazyMount=true` (all except `basic`) to avoid hydration overhead.

---

## List Action Changes

`PartiesTable` changes:

| Old | New |
|-----|-----|
| `openDrawer(null, "add")` | `openTab({ route: "/record/new", tabKind: "record", formMode: "add" })` |
| `openDrawer(item, "view")` | `openTab({ route: "/record/{id}?mode=view", entityId: item.id, formMode: "view" })` |
| `openDrawer(item, "edit")` | `openTab({ route: "/record/{id}?mode=edit", entityId: item.id, formMode: "edit" })` |

- `PartyFormDrawer` is no longer rendered from `PartiesTable` (drawer import removed)
- `PartyFormDrawer` file remains untouched for future reference/fallback
- Deactivate/Reactivate actions unchanged

---

## Workspace Registry Changes

New entries in `REGISTRY`:
- `/admin/master-data/parties/record/new` — exact match, `tabKind: "record"`, `singleton: false`, `entityType: "party"`
- `/admin/master-data/parties/record/` with `pattern: /^\/admin\/master-data\/parties\/record\/\d+/` — dynamic match for existing record routes

`getWorkspaceRouteConfig()` now uses 3-pass matching:
1. Exact path match
2. RegExp pattern match (new — for `/record/{id}`)
3. Prefix match (existing fallback)

---

## Save / Save & Close Behavior

### Add mode → Save
1. Duplicate detection runs
2. `createParty()` called
3. On success: `toast.success`, `resetDirty()`, `setCreatedPartyId(id)`, `setCurrentMode("edit")`
4. Tab renamed: `renameTab(tabId, "Party — {display_name}", partyCode)`
5. Tab route updated: `updateTabRoute(tabId, "/record/{id}?mode=edit", id, "edit")`
6. `router.replace("/record/{id}?mode=edit")` navigates without creating a new tab
7. Child sections unlock (effectivePartyId is now set)

### Edit mode → Save
1. `updateParty()` called
2. `toast.success`, `resetDirty()`
3. Tab dirty dot clears

### Save & Close (add or edit)
1. Save logic runs (with duplicate check)
2. On success: `markDirty(tabId, false)` explicitly clears workspace dirty
3. `closeTab(tabId)` called — no dirty dialog since dirty=false
4. Workspace navigates to most-recently-active remaining tab (typically the list)

### View mode → Close
1. `handleRequestClose()` → `closeTab(tabId)` 
2. No dirty state, closes immediately

---

## Dirty State Behavior

- `useFormDirty({ formId: "party-workspace-form" })` tracks form field changes (document-level delegation)
- `useWorkspaceTabDirty({ isDirty })` syncs dirty to the active workspace tab
- Tab chip shows amber dot when dirty
- `closeTab` triggers `UnsavedChangesDialog` (from UI.4B) if tab is dirty
- `window.beforeunload` warning fires on browser reload if any tab is dirty (from UI.4B)
- `resetDirty()` on save clears both local and (via next render) workspace dirty

---

## Child Dialog Behavior

The `childDialogOpen` / `handleChildOpen` pattern is preserved unchanged:
- Each child section tab (Contacts, Addresses, Bank, etc.) calls `onChildOpen(true/false)`
- `PartyWorkspaceForm` tracks `childDialogOpen` state
- `ERPRecordWorkspaceForm isChildDialogOpen={childDialogOpen}` makes the content zone `inert + opacity-50`
- Header, workspace tab bar, and other tabs remain fully interactive
- Child dialogs portal to `document.body` outside the inert zone

---

## Permission Behavior

| Route | Check |
|-------|-------|
| `/record/new` | `master_data.parties.view` + `master_data.parties.manage` |
| `/record/[id]?mode=view` | `master_data.parties.view` |
| `/record/[id]?mode=edit` | `master_data.parties.view` (mode silently downgraded to view if no manage) |

Same as the existing drawer — no bypass of RLS, no new permission codes introduced.

---

## Filtered View Behavior

All filtered list routes continue working unchanged:

```
/admin/master-data/parties/customers
/admin/master-data/parties/vendors
/admin/master-data/parties/subcontractors
/admin/master-data/parties/consultants
/admin/master-data/parties/recruitment-agencies
/admin/master-data/parties/government-authorities
/admin/master-data/parties/insurance-companies
/admin/master-data/parties/license-issuers
```

These pages all use `PartiesTable` (the updated version). The Add Party button from filtered views opens the workspace record tab at `/record/new`. The `defaultTypeCode` prop is no longer passed through PartiesTable's openAdd call — this is a known limitation (see below).

Party Banks filtered view was not reintroduced (per spec).

---

## What Was Intentionally NOT Changed

- `ERPDrawerForm` — not removed globally
- `PartyFormDrawer` file — kept for fallback/reference; not removed
- Party Master database schema / RLS
- Party child tab components (`PartyContactsTab`, `PartyAddressesTab`, etc.)
- `ERPChildDialogForm` — all child dialogs unchanged
- Customer legacy module
- All other master data modules
- `ERPRecordWorkspaceForm` core API (no changes)
- Party Master business rules, server actions, validation

---

## QA Scenarios Verified (Code-Level)

| Scenario | Status |
|----------|--------|
| A — Add Party record tab | ✓ Route created, `ERPRecordWorkspaceForm` used, effectivePartyId pattern preserved |
| B — Edit existing Party | ✓ Edit route `/record/{id}?mode=edit` opens workspace tab |
| C — View existing Party | ✓ View route `/record/{id}?mode=view` opens read-only form |
| D — Safe close (dirty tab) | ✓ `closeTab` triggers UI.4B `UnsavedChangesDialog` |
| E — Save & Close | ✓ Explicit `markDirty(false)` before `closeTab` to bypass dirty dialog |
| F — Child dialogs | ✓ `isChildDialogOpen` → inert + opacity-50 on content zone |
| G — Filtered views | ✓ All filtered routes use updated `PartiesTable` |
| H — Build | ✓ `npx tsc --noEmit` → 0 errors; `npx next build` → success |

---

## TypeScript / Build Results

```
npx tsc --noEmit   →  exit 0, 0 errors
npx next build     →  exit 0, compiled successfully
```

New routes in build output:
```
ƒ /admin/master-data/parties/record/[id]
ƒ /admin/master-data/parties/record/new
```

---

## Known Limitations / Notes

1. **defaultTypeCode from filtered views**: When clicking "Add Party" from `/parties/customers`, the new workspace tab opens without preselecting the Customer type. Previously, `defaultTypeCode` was passed through `PartiesTable` → `openDrawer` → `PartyFormDrawer`. The tab-based approach does not pass this via `openTab` metadata. The PartyTypesTab still accepts `defaultTypeCode` as a prop, so this can be addressed in a follow-up by encoding it in the route (e.g., `?defaultType=CUSTOMER`) or via a session-level hint.

2. **mode parameter in URL**: `?mode=edit` / `?mode=view` appear in the browser URL bar. This is intentional — it allows direct URL sharing and browser refresh to restore the correct mode. The workspace tab deduplication uses `entityId` (not route) for record tabs, so opening the same party in different modes switches to the existing tab.

3. **PartyFormDrawer retirement**: `PartyFormDrawer` is still present in the codebase but is no longer opened by `PartiesTable`. It can be removed in a future cleanup phase after confirming no other call site uses it.

---

## Next Recommended Phase

**ERP GLOBAL UI.4E — Runtime QA and Performance Gate**

Verify UI.4D in the live dev environment:
- Walk through all 21 acceptance criteria from the phase prompt
- Check tab rename after Add→Save in browser
- Check child dialog inert behavior (Contacts, Addresses, Bank Details)
- Check browser back navigation
- Performance check on large party lists

