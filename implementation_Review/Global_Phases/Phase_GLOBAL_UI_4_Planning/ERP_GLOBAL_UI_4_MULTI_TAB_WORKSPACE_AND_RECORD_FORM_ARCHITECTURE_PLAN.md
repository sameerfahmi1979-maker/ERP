# ERP GLOBAL UI.4 — Multi-Tab Workspace + Workspace Record Form Architecture Plan

**Document Type:** Architecture investigation and implementation plan  
**Phase:** ERP GLOBAL UI.4 (Audit + Plan only — no implementation)  
**Date:** 2026-06-14  
**Status:** PLAN ONLY — awaiting Sameer approval before any implementation  
**Next phase:** ERP GLOBAL UI.4A (upon approval)

---

## 1. Executive Summary

The ALGT ERP currently uses a classic sidebar-navigation + side-drawer form model. Every page is a full Next.js route; forms open as right-side Sheet drawers. There is no tab persistence, no multi-context switching, and no concept of a "workspace."

This plan proposes introducing a **Chrome-style multi-tab workspace** above the page content area. Tabs represent open routes. Sidebar clicks open tabs instead of hard-navigating. Existing drawers continue to work unchanged initially. A new `ERPRecordWorkspaceForm` standard is designed to eventually replace `ERPDrawerForm` for large main records (Party Master as pilot).

**Recommended architecture: Option C — Hybrid Workspace.**

---

## 2. Current App Layout Findings

### 2.1 Layout Tree

```
RootLayout (app/layout.tsx)
  └── AppProviders (client, wraps: QueryClientProvider > ThemeProvider > TooltipProvider > Toaster)
       └── ProtectedLayout (app/(protected)/layout.tsx — server component)
            ├── Supabase auth check → redirect /login if unauthenticated
            └── ErpShell (client component, erp-shell.tsx)
                 ├── AppSidebar (left, collapsible, w-260px / w-68px)
                 └── div.flex-1.flex-col.overflow-hidden
                      ├── AppHeader (h-14, fixed top bar)
                      └── main.flex-1.overflow-auto.p-6 (page content — {children})
```

### 2.2 Key Observations

- `ErpShell` is a **client component** in `src/components/layout/erp-shell.tsx`. It owns `sidebarCollapsed` state.
- `AppProviders` is the right place to add a `WorkspaceProvider` since it wraps everything client-side.
- The `main` element (`flex-1 overflow-auto p-6`) is where tab content would render. The `p-6` padding applies to all pages — workspace tabs would need to override or suppress this.
- `ProtectedLayout` is a **server component** — it only does auth check and profile fetch. It cannot hold workspace state.
- **No tab bar exists today.** The workspace tab bar must be inserted between `AppHeader` and `main`.

### 2.3 Current Protected Layout Injection Point

The workspace tab bar should be inserted inside `ErpShell`, between `AppHeader` and `main`:

```
AppHeader (h-14)
WorkspaceTabBar (h-10 — NEW)    ← insert here
main (flex-1, page content)
```

---

## 3. Current Routing Findings

### 3.1 Complete Protected Route Inventory

| Route | Module | Type | Notes |
|---|---|---|---|
| `/dashboard` | Dashboard | page | Pinned tab |
| `/admin/users` | Users | list page | Has add/edit drawer |
| `/admin/organizations` | Organizations | list page | Has add/edit drawer |
| `/admin/branches` | Branches | list page | Has add/edit drawer |
| `/admin/roles` | Roles | list page | Has add/edit drawer |
| `/admin/permissions` | Permissions | list page | View-only table |
| `/admin/settings/numbering` | Numbering Rules | list page | Has add/edit drawer |
| `/admin/master-data` | Master Data Hub | landing page | Links only |
| `/admin/master-data/lookups/categories` | Lookup Categories | list page | Has add/edit drawer |
| `/admin/master-data/lookups/values` | Lookup Values | list page | Has add/edit drawer |
| `/admin/master-data/lookups/system` | System Lookups | list page | Read-only |
| `/admin/audit` | Audit Logs | list page | Read-only |
| `/admin/master-data/geography/countries` | Countries | list page | Has add/edit drawer |
| `/admin/master-data/geography/emirates` | Emirates | list page | Has add/edit drawer |
| `/admin/master-data/geography/cities` | Cities | list page | Has add/edit drawer |
| `/admin/master-data/geography/areas` | Areas & Zones | list page | Has add/edit drawer |
| `/admin/master-data/geography/ports` | Ports | list page | Has add/edit drawer |
| `/admin/master-data/parties` | All Parties | list page | Has ERPDrawerForm (large) |
| `/admin/master-data/parties/[typeSlug]` | Typed Party list | list page (dynamic) | Same drawer |
| `/admin/master-data/parties/types` | Party Types | admin list | Small add/edit drawer |
| `/admin/master-data/parties/service-categories` | Service Categories | admin list | Small add/edit drawer |
| `/admin/master-data/parties/relationship-types` | Relationship Types | admin list | Small add/edit drawer |
| `/admin/master-data/finance-basics/currencies` | Currencies | list page | Small drawer |
| `/admin/master-data/finance-basics/payment-terms` | Payment Terms | list page | Small drawer |
| `/admin/master-data/finance-basics/tax-types` | Tax Types | list page | Small drawer |
| `/admin/master-data/finance-basics/banks` | Banks | list page | Small drawer |
| `/admin/master-data/finance-basics/cost-centers` | Cost Centers | list page | Small drawer |
| `/admin/master-data/finance-basics/profit-centers` | Profit Centers | list page | Small drawer |
| `/admin/master-data/uom/categories` | UOM Categories | list page | Small drawer |
| `/admin/master-data/uom/units` | UOM Units | list page | Small drawer |
| `/admin/master-data/uom/conversions` | UOM Conversions | list page | Small drawer |
| `/admin/master-data/customers` | Customers (Legacy) | list page | Has ERPDrawerForm (large) |
| `/profile` | User Profile | page | Edit-in-place |
| `/settings` | Settings | page | General settings |

**Coming Soon (no route exists):** Fleet, HR, Workshop, HSE, Finance, Inventory, Procurement, Documents.

### 3.2 Route Classification for Tabs

| Class | Description | Tab behavior |
|---|---|---|
| **dashboard** | `/dashboard` | Pinned, non-closable |
| **list** | Most admin pages | `openTab(route)` — switch existing if open |
| **large-record** | Party Master drawer, Customer drawer | Candidate for future record tab |
| **settings** | `/profile`, `/settings` | Single instance, closable |
| **utility** | `/admin/master-data` landing | Closable |

---

## 4. Current Sidebar Findings

### 4.1 Sidebar Architecture

- **Component:** `AppSidebar` in `src/components/layout/app-sidebar.tsx`
- **Navigation data:** `navGroups: NavGroup[]` — static array in same file
- **Active detection:** `usePathname()` compared via strict `===`
- **Navigation method:** Next.js `<Link href>` — standard hard navigation
- **Coming Soon:** `comingSoon: true` flag renders a disabled `<div>` instead of `<Link>`
- **Groups:** Collapsed by default, manually toggleable (multi-open)
- **Collapsed state:** Owned by `ErpShell` (`sidebarCollapsed` state)

### 4.2 Sidebar Gaps for Workspace

- Uses `<Link>` which causes full page navigation. For workspace, must intercept clicks and call `openWorkspaceTab()` instead.
- No concept of "tab already open" — clicking the same route just re-navigates.
- Active state is `pathname ===` route — with workspace, active should reflect the active tab's route, not the current URL.
- No access to workspace store yet.

### 4.3 Required Changes (ERP GLOBAL UI.4A)

```
sidebar click → router.push(route) TODAY
sidebar click → workspaceStore.openTab(route, title, icon) IN WORKSPACE
```

The sidebar must receive `openTab` from a workspace context and call it instead of relying on `<Link>`. Coming Soon items remain as-is.

---

## 5. Current Drawer/Form Standard Findings

### 5.1 ERPDrawerForm (`src/components/erp/erp-drawer-form.tsx`)

- Built on Base UI `Sheet`
- Right-side drawer, `sm:!max-w-[80vw]`, min-width 960px
- Has: `ERPDrawerFormContext` for safe-close
- Has: `UnsavedChangesDialog` integration (inside the component)
- Exports: `ERPDrawerHeader`, `ERPDrawerSectionNav`, `ERPDrawerBody`, `ERPDrawerSection`, `ERPDrawerFooter`, `ERPFieldGrid`
- `ERPDrawerSection`: supports `lazyMount` — sections not rendered until first visited

### 5.2 ERPFormFooter (`src/components/erp/erp-form-footer.tsx`)

- Separate from `ERPDrawerFooter` (newer, preferred)
- Buttons: Cancel (uses `requestClose` from drawer context), Save, Save & Close
- View mode: Close only
- Shows "Unsaved Changes" indicator dot

### 5.3 ERPChildDialogForm (`src/components/erp/erp-child-dialog-form.tsx`)

- Built on custom `Dialog` (Base UI `@base-ui/react/dialog`)
- Sizes: sm=480px, md=640px, lg=960px (default), xl=1120px
- Overlay: `bg-slate-950/40 backdrop-blur-[2px]` at z-[60]
- Content: z-[70]
- Fixed header (icon+title+subtitle+X), scrollable body, sticky footer
- `onSubmit` is a button click handler (not FormEvent)

### 5.4 useFormDirty (`src/hooks/use-form-dirty.ts`)

- Uses **document-level event delegation** (not direct form listener)
- Listens on `input` and `change` events in capture phase
- Scopes to form by `form.id === formId`
- `markDirty()` callable manually for non-native inputs
- `resetDirty()` called after save
- Auto-resets when form element leaves DOM (MutationObserver)
- **Critical limitation for workspace:** `isDirty` is local to the component using the hook. The workspace store has no visibility into it. To show dirty dot on tab, the form must call `workspaceStore.markDirty(tabId, true)` when dirty changes.

### 5.5 UnsavedChangesDialog (`src/components/erp/unsaved-changes-dialog.tsx`)

- Uses `AlertDialog` (Base UI AlertDialog)
- Two buttons: "Stay on Form" / "Discard Changes"
- Currently coupled inside `ERPDrawerForm`
- For workspace record forms, this same dialog will be reused when closing a dirty tab

---

## 6. Current Child Dialog Findings

### 6.1 Pattern (Party Master)

- Each tab component accepts `onChildOpen?: (open: boolean) => void`
- Parent drawer wraps all interactive content in `<div inert={childDialogOpen || undefined}>`
- Wrapper has `opacity-50` CSS when `childDialogOpen=true`
- Child dialogs use `ERPChildDialogForm` at z-[70]
- `DialogPortal` renders to `document.body`, outside the inert wrapper — so the dialog stays interactive

### 6.2 Workspace Child Dialog Behavior (Planned)

- In workspace, the child dialog must **only dim/inert the owning tab content**, not the tab bar or other tabs
- This is achievable because: each tab renders independently; the child dialog `inert` wrapper lives inside the tab's render tree
- The workspace tab bar must remain interactive while any tab's child dialog is open
- Z-index hierarchy in workspace context:
  - App/sidebar: base
  - Workspace tab bar: z-30
  - Tab content: z-auto
  - Child dialog overlay: z-[60]
  - Child dialog content: z-[70]

---

## 7. Current Module Summary

### 7.1 Form Type Classification

| Module | Form Type | Form Size | Workspace Candidate? |
|---|---|---|---|
| Party Master | `ERPDrawerForm` | Large (12 tabs, child tables) | **YES — priority pilot** |
| Customers (Legacy) | `ERPDrawerForm` | Large (contacts/addr/bank) | YES (after Party Master) |
| Users | `ERPDrawerForm` | Medium (roles, profile) | Maybe later |
| Organizations | `ERPDrawerForm` | Small-medium | Keep drawer |
| Branches | `ERPDrawerForm` | Small | Keep drawer |
| Roles | `ERPDrawerForm` | Small | Keep drawer |
| Permissions | View-only table | — | Keep drawer |
| Numbering | `ERPDrawerForm` | Small | Keep drawer |
| Geography (5 pages) | `ERPDrawerForm` | Small | Keep drawer |
| Finance Basics (6 pages) | `ERPDrawerForm` | Small | Keep drawer |
| UOM (3 pages) | `ERPDrawerForm` | Small | Keep drawer |
| Lookups | `ERPDrawerForm` | Small | Keep drawer |
| Audit | Read-only | — | Keep as list tab |
| Profile | Edit-in-place | Small | Keep as tab |

---

## 8. Recommended Architecture: Option C — Hybrid Workspace

### 8.1 Decision

**Option C (Hybrid)** is recommended over:
- Option A (full keep-alive): too memory-heavy for large ERP pages
- Option B (route remount + cache): loses unsaved local form state

**Hybrid behavior:**
- Tab metadata stored in `WorkspaceStore` (Zustand or React context + `useReducer`)
- Active tab drives `router.push(route)` — Next.js handles the render
- Next.js TanStack Query cache provides fast data restoration on re-navigate
- Dirty record tabs are protected: closing warns; navigating away preserves tab in store
- No CSS keep-alive initially — remount from cache is acceptable for list tabs
- Future: optional keep-alive for record workspace form tabs only (when introduced)

### 8.2 Why Hybrid Works Here

- Next.js App Router does not support React `<Offscreen>` / keep-alive natively
- TanStack Query cache with `staleTime: 5min` (already set) restores list data near-instantly on re-navigate
- `useFormDirty` auto-resets when form leaves DOM — but workspace can checkpoint dirty state before navigation and warn before close
- Record forms (future `ERPRecordWorkspaceForm`) can be kept alive if they are rendered in a single workspace slot (not route-switched)

---

## 9. Workspace Tab Lifecycle

```
User clicks sidebar item
  ↓
workspaceStore.openTab(route, tabConfig)
  ↓
  IF tab already open for route → setActiveTab(existingId) → router.push(route)
  IF max tabs reached → show toast "Close a tab first"
  ELSE → add new tab → setActiveTab(newId) → router.push(route)
  ↓
WorkspaceTabBar re-renders (new tab appears, active tab highlights)
  ↓
Next.js navigates to route → page renders normally in main area
  ↓
User closes tab
  ↓
  IF tab.dirty → show UnsavedChangesDialog → discard → close
  ELSE → removeTab(id) → navigate to previous active tab's route
```

---

## 10. Workspace Store Design

**Recommended implementation:** Zustand (already a transitive dep via TanStack) or React context + useReducer.

**File:** `src/lib/workspace/workspace-store.ts`

```ts
type WorkspaceTab = {
  id: string              // uuid
  route: string           // e.g. "/admin/master-data/parties"
  title: string           // e.g. "All Parties"
  subtitle?: string       // e.g. "PTY-000001"
  icon?: string           // Lucide icon name string
  moduleCode?: string     // e.g. "PARTY_MASTER"
  entityType?: string     // e.g. "party"
  entityId?: number | string
  dirty?: boolean         // synced from form
  childDialogOpen?: boolean
  closable: boolean       // dashboard = false
  pinned?: boolean
  tabKind: "list" | "record" | "dashboard" | "settings" | "utility"
  formMode?: "add" | "edit" | "view"
  openedAt: string        // ISO timestamp
  lastActiveAt: string
}

type WorkspaceState = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

// Actions
openTab(config: Partial<WorkspaceTab> & { route: string; title: string; tabKind: string })
openRecordTab(config: WorkspaceTab)
closeTab(tabId: string)
closeOtherTabs(tabId: string)
closeAllClosableTabs()
setActiveTab(tabId: string)
markDirty(tabId: string, dirty: boolean)
markChildDialogOpen(tabId: string, open: boolean)
renameTab(tabId: string, title: string, subtitle?: string)
restoreFromLocalStorage()
persistToLocalStorage()
```

**localStorage schema:**
```json
{
  "erp_workspace_tabs": [...tabMetadata],  // route, title, id, tabKind — NO form values
  "erp_workspace_activeTabId": "uuid"
}
```

**Security constraints:**
- Never store form field values in localStorage
- Never store sensitive data (passwords, tokens, PII) in localStorage
- On restore, revalidate each route's permission before showing the tab
- Drop unauthorized tabs silently (no error)

---

## 11. Workspace Route Registry Design

**File:** `src/lib/workspace/workspace-route-registry.ts`

Each module registers its routes so the workspace knows tab metadata automatically:

```ts
type WorkspaceRouteConfig = {
  route: string           // exact path or pattern
  title: string | ((params: Record<string,string>) => string)
  icon: string            // Lucide icon name
  tabKind: WorkspaceTab["tabKind"]
  closable?: boolean
  pinned?: boolean
  moduleCode?: string
  singleton?: boolean     // true = switch existing tab on re-open
}

const WORKSPACE_ROUTE_REGISTRY: WorkspaceRouteConfig[] = [
  { route: "/dashboard", title: "Dashboard", icon: "LayoutDashboard", tabKind: "dashboard", closable: false, pinned: true, singleton: true },
  { route: "/admin/master-data/parties", title: "All Parties", icon: "Building2", tabKind: "list", singleton: true },
  { route: "/admin/master-data/parties/customers", title: "Customers", icon: "Users", tabKind: "list", singleton: true },
  // ... all routes
]
```

Functions:
- `getTabConfigForRoute(route: string): WorkspaceRouteConfig | null`
- `resolveTabTitle(config, params): string`

---

## 12. ERPRecordWorkspaceForm Design

**This is designed now but implemented in ERP GLOBAL UI.4C.**

### 12.1 Purpose

Replaces `ERPDrawerForm` for large main-record forms. Renders as full page content inside a workspace tab, not as a side drawer.

### 12.2 Files to Create (in ERP GLOBAL UI.4C)

```
src/components/workspace/erp-record-workspace-form.tsx
src/components/workspace/erp-record-header.tsx
src/components/workspace/erp-record-section-nav.tsx
src/components/workspace/erp-record-form-footer.tsx
src/hooks/use-record-workspace-form.ts
```

### 12.3 Component Anatomy

```
ERPRecordWorkspaceForm
  ├── ERPRecordHeader (fixed top)
  │    ├── Record code badge
  │    ├── Display name / title
  │    ├── Status badge
  │    ├── Mode badge (Add / Edit / View)
  │    ├── Last updated
  │    └── Actions dropdown (Save, Save & Close, Close Tab, Print — future)
  ├── div.flex.flex-1.overflow-hidden
  │    ├── ERPRecordSectionNav (left, 240px, same pattern as ERPDrawerSectionNav)
  │    └── form#record-form.flex-1.flex-col.overflow-hidden (or div for view)
  │         ├── ERPDrawerBody (scrollable content area — reuse existing)
  │         │    └── ERPDrawerSection x N (lazyMount per section)
  │         └── ERPRecordFormFooter (sticky bottom, same buttons as ERPFormFooter)
  └── Child dialogs: ERPChildDialogForm (unchanged)
       └── Parent inert wrapper: same pattern as drawer (opacity-50 + inert attr)
```

### 12.4 Key Differences from ERPDrawerForm

| Aspect | ERPDrawerForm | ERPRecordWorkspaceForm |
|---|---|---|
| Container | Sheet (slide-in drawer) | Full page content in workspace tab |
| Width | 80vw max | Full available width (minus sidebar) |
| Close behavior | `onOpenChange(false)` | `workspaceStore.closeTab(tabId)` |
| Dirty close | `UnsavedChangesDialog` internal | Delegates to workspace close-tab flow |
| Tab metadata | Not known to workspace | Reports dirty state to `workspaceStore.markDirty()` |
| Child dialog | `inert` wrapper inside drawer | Same — `inert` wrapper inside record form |
| Scroll | `ERPDrawerBody` ScrollArea | Same reusable `ERPDrawerBody` |

### 12.5 useRecordWorkspaceForm Hook

```ts
function useRecordWorkspaceForm(options: {
  tabId: string
  formId: string
  mode: "add" | "edit" | "view"
}) {
  // Bridges useFormDirty → workspaceStore.markDirty
  // Provides: isDirty, resetDirty, markDirty, requestClose
  // requestClose: if dirty → UnsavedChangesDialog → then workspaceStore.closeTab
}
```

---

## 13. Drawer-to-Record-Form Migration Strategy

### 13.1 Criteria for Migration

A form should migrate from `ERPDrawerForm` to `ERPRecordWorkspaceForm` when it meets **2 or more** of these:
- Has 5+ navigation sections
- Has child tables (contacts, addresses, bank details, documents, etc.)
- Has audit/notes/compliance tabs
- Record is a "long-lived entity" (not a quick setup value)
- Users frequently need to switch context while editing

### 13.2 Migration Decision Matrix

| Module | Migrate? | Reason |
|---|---|---|
| Party Master | **YES — Phase 4D pilot** | 12 tabs, 8+ child tables, long-lived entity |
| Customers (Legacy) | YES (after Party Master, or retire) | Same structure |
| Users | Maybe later | 3 tabs (profile, roles, audit) — borderline |
| Organizations | **Keep drawer** | 2-3 fields, simple |
| Branches | **Keep drawer** | 2-3 fields, simple |
| Roles | **Keep drawer** | Simple form |
| Geography/Finance/UOM | **Keep drawer** | All simple 1-3 field forms |
| Future: Employee | YES | Same pattern as Party Master |
| Future: Equipment/Fleet | YES | Large record |
| Future: Purchase Order | YES | Document type, multi-section |
| Future: Job Card | YES | Operational, multi-step |

### 13.3 Migration Steps (per module)

1. Create `[module]-workspace-form.tsx` — new record workspace form component
2. Create route `src/app/(protected)/.../[id]/page.tsx` (or use query param)
3. Register route in workspace registry
4. Update list page: "Add" opens `openRecordTab({ route: ".../new", ... })`, "Edit" opens `openRecordTab({ route: `.../${id}`, ... })`
5. Remove old `ERPDrawerForm`-based drawer from list page
6. Preserve all server actions, validation, child tabs — same logic, different shell

---

## 14. Party Master Pilot Conversion Plan (ERP GLOBAL UI.4D)

### 14.1 Current State

- List page: `/admin/master-data/parties`
- Add/Edit/View: opens `PartyFormDrawer` (Sheet-based `ERPDrawerForm`)
- 12 tabs (Basic Info, Types, Licenses, Tax, Contacts, Addresses, Bank, Documents, Services, Notes, Audit, Compliance)
- 8 child tables with `ERPChildDialogForm`

### 14.2 Target State

```
/admin/master-data/parties            → "All Parties" list tab (unchanged)
/admin/master-data/parties/new        → "New Party" record tab
/admin/master-data/parties/[id]       → "Party — ABC Contracting" record tab
```

### 14.3 Tab Naming Convention

```
New party:    "New Party"
Edit/View:    "Party — {display_name}" or "Party — {party_code}"
```

### 14.4 Steps

1. Create `src/app/(protected)/admin/master-data/parties/new/page.tsx`
2. Create `src/app/(protected)/admin/master-data/parties/[id]/page.tsx`
3. Create `src/features/master-data/parties/party-workspace-form.tsx` (wraps existing tab components in `ERPRecordWorkspaceForm`)
4. Update `parties-table.tsx`: Add/Edit buttons call `openRecordTab` instead of `setOpen(true)`
5. Remove `PartyFormDrawer` open/close state from list page
6. Preserve all 12 tabs, all child dialog logic — only the shell changes
7. Register routes in workspace registry

---

## 15. Sidebar Integration Plan

### 15.1 Change Required

Today: `<Link href={item.path}>` → full Next.js navigation

After workspace: `onClick → workspaceStore.openTab(route, config)` → then `router.push(route)` internally

### 15.2 Implementation Approach

Option 1: Pass `openTab` as a prop from `ErpShell` down to `AppSidebar`
Option 2: `AppSidebar` uses `useWorkspace()` hook directly (requires `WorkspaceProvider` above `ErpShell`)

**Recommended: Option 2** — cleaner, no prop drilling.

`WorkspaceProvider` wraps `ErpShell` (or wraps inside `AppProviders`).

`AppSidebar` change:
```tsx
// Replace Link with:
<button onClick={() => openTab({ route: item.path, title: item.label, icon: item.icon })}>
```

Coming Soon items: unchanged (still disabled div).

### 15.3 Active State Change

Today: `isActive = pathname === path`

After: `isActive = workspaceStore.activeTab?.route === path`

URL still updates on tab switch, so `usePathname()` would also work — but reading from workspace store is more reliable when tabs are switched programmatically.

---

## 16. Direct URL / Browser Refresh / History Strategy

### 16.1 Direct URL Access

If user opens `/admin/master-data/parties` directly (bookmark or share):
- `WorkspaceProvider` mounts
- `restoreFromLocalStorage()` loads saved tabs
- If the route matches a restored tab → activate it
- If no matching tab → create a new tab for this route using registry

### 16.2 Browser Refresh

- `persistToLocalStorage()` saves tab list after every tab change
- On mount, `restoreFromLocalStorage()` restores tabs
- Route permission check: each restored tab's route is validated against current user's permission codes — unauthorized routes are silently dropped

### 16.3 Browser Back/Forward

- With workspace, `router.push()` adds to browser history
- Browser back navigates the page back, but workspace tab bar will not auto-update
- **Recommendation:** Intercept `popstate` or use `usePathname()` watcher to sync active tab on URL change
- `window.addEventListener("popstate", () => workspaceStore.syncActiveTabToRoute(pathname))`

### 16.4 New Tab / Window

- Workspace state is per-window (localStorage scoped to origin, but tab-switched state is in-memory)
- Multiple windows each maintain independent workspace state — acceptable

---

## 17. Dirty State / Safe Close Integration Plan

### 17.1 Current State

- `useFormDirty` lives inside each form component
- Reports dirty via `isDirty` local state only
- `ERPDrawerForm` reads `isDirty` prop and blocks close

### 17.2 Workspace Integration Required

Each record form must:
1. Call `workspaceStore.markDirty(tabId, true)` when `isDirty` becomes true
2. Call `workspaceStore.markDirty(tabId, false)` when saved or reset

In `useRecordWorkspaceForm`:
```tsx
useEffect(() => {
  workspaceStore.markDirty(tabId, isDirty)
}, [isDirty])
```

### 17.3 Tab Close with Dirty State

```
closeTab(tabId)
  → IF tab.dirty → show UnsavedChangesDialog
  → "Discard" → workspaceStore.markDirty(tabId, false) → removeTab(tabId)
  → "Stay" → do nothing (tab remains, dialog closes)
```

### 17.4 Browser Close / Navigate Away

```tsx
useEffect(() => {
  const hasDirtyTab = workspaceStore.tabs.some(t => t.dirty)
  if (hasDirtyTab) {
    window.onbeforeunload = (e) => { e.returnValue = ""; return ""; }
  } else {
    window.onbeforeunload = null
  }
}, [workspaceStore.tabs])
```

### 17.5 Tab Dirty Indicator

Tab component shows amber dot when `tab.dirty === true`:
```tsx
{tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />}
```

---

## 18. Child Dialog Behavior in Workspace

### 18.1 Rule

Child dialogs block **only their owning tab**. The workspace tab bar and other tabs remain usable.

### 18.2 Implementation

This works naturally because:
- Each tab renders its content independently
- `inert` + `opacity-50` wrapper is inside each tab's render tree
- Child dialogs render to `document.body` via `DialogPortal` — above the current tab content, below no other tab's content
- Workspace tab bar has `z-30`; child dialog overlay is at `z-[60]` — BUT the overlay covers viewport, so tab bar would be obscured

**Fix needed:** Child dialog overlay should NOT cover the tab bar.
- Tab bar height: ~40px (h-10)
- Apply `top: 40px` (or equivalent) to the child dialog overlay when inside a workspace tab
- OR: render workspace tab bar at `z-[90]` (above child dialog) with pointer-events preserved

**Recommended:** `WorkspaceTabBar` at `z-[90] pointer-events-auto` — always on top. Child dialog overlays at `z-[60]` cover the page content but the tab bar renders above.

### 18.3 Tab Switch While Child Dialog Open

If user switches to another tab while Tab A has a child dialog open:
- Tab A's content unmounts (current hybrid architecture)
- On return to Tab A, child dialog state is lost (React state gone)
- **Mitigation:** Show visual indicator on Tab A (e.g., `childDialogOpen` dot) to remind user
- **Future:** For record tabs with child dialogs open, consider soft keep-alive (the record form stays mounted as hidden)

---

## 19. Performance Strategy

### 19.1 Tab Limits

- Initial: `MAX_TABS = 8`
- Hard limit: `10`
- Overflow: toast "Maximum tabs open. Close a tab to open a new one."

### 19.2 Unmount Policy

| Tab Kind | Policy |
|---|---|
| List tabs | Remount on re-visit (TanStack cache restores data) |
| Dashboard | Always mounted (pinned) |
| Settings/Profile | Remount (lightweight) |
| Record tabs (future) | Keep-alive optional — implement in ERP GLOBAL UI.4C |

### 19.3 TanStack Query Cache

All master-data queries already have `staleTime: 5 * 60 * 1000` — list pages reload from cache instantly.

Child table queries (`["child", table, parentId]`) also have `staleTime: 5min` — party tabs reload child tables from cache.

### 19.4 Memory Risk

- With 8 tabs open and no keep-alive, memory is minimal — only one page renders at a time
- Risk area: if keep-alive is added for record tabs with large grids — needs monitoring
- Recommendation: no keep-alive in Phase 4A/4B; evaluate in 4C

---

## 20. Security / Permission Strategy

### 20.1 Route Protection

- ProtectedLayout already redirects to `/login` if unauthenticated
- Each page.tsx has its own auth + permission checks (e.g., `getAuthContext()` + `hasPermission()`)
- The workspace does not bypass these — it only controls tab metadata and navigation

### 20.2 localStorage Tab Restore

On restore:
1. Load tab list from localStorage
2. For each tab, check if route is in the registry and still valid
3. Optionally: call a lightweight permission check before restoring (or trust page-level check on first render)
4. Drop tabs whose routes are no longer accessible

### 20.3 Disabled Sidebar Items

Coming Soon items remain disabled — no `openTab` call is made for them.

---

## 21. Responsive / Mobile Strategy

| Screen | Behavior |
|---|---|
| Desktop (lg+) | Full horizontal tab bar below header |
| Tablet (md) | Horizontal scrollable tab bar |
| Mobile (sm) | Collapsed: current tab title + dropdown picker for all open tabs |

Tab bar height: `h-10` on all sizes. On mobile, each tab narrows to icon + short title or icon only.

Overflow: `overflow-x-auto` with CSS scrollbar-hide, or `More →` dropdown chevron at end of bar.

---

## 22. Files to Create

```
src/lib/workspace/workspace-types.ts          — WorkspaceTab type, WorkspaceState type
src/lib/workspace/workspace-store.ts          — Zustand store or context+reducer
src/lib/workspace/workspace-route-registry.ts — route → tab config map
src/components/workspace/workspace-provider.tsx   — context provider, localStorage restore
src/components/workspace/workspace-tab-bar.tsx    — Chrome-style tab bar UI
src/components/workspace/workspace-tab.tsx        — single tab chip component
src/components/workspace/workspace-content.tsx    — wraps main content, provides tab context
src/hooks/use-workspace.ts                    — useWorkspace() access hook

— Phase 4C only —
src/components/workspace/erp-record-workspace-form.tsx
src/components/workspace/erp-record-header.tsx
src/components/workspace/erp-record-section-nav.tsx
src/components/workspace/erp-record-form-footer.tsx
src/hooks/use-record-workspace-form.ts

— Rules —
.cursor/rules/erp-workspace-tabs-standard.mdc
.cursor/rules/erp-record-workspace-form-standard.mdc
```

---

## 23. Files to Modify

```
src/app/layout.tsx                            — wrap children in WorkspaceProvider
  OR
src/components/layout/app-providers.tsx       — add WorkspaceProvider here (preferred)
src/components/layout/erp-shell.tsx           — insert WorkspaceTabBar between AppHeader and main, remove padding from main if workspace renders it
src/components/layout/app-sidebar.tsx         — replace <Link> with openTab(), update active state logic
src/components/layout/app-header.tsx          — update getPageTitle() to reflect active workspace tab title (or deprecate)

— Phase 4B —
src/hooks/use-form-dirty.ts                   — expose markDirty callback to workspace bridge
src/components/erp/erp-drawer-form.tsx        — optionally accept tabId prop for workspace dirty sync
src/components/erp/unsaved-changes-dialog.tsx — no change needed (reuse as-is)

— Phase 4D —
src/features/master-data/parties/parties-table.tsx    — open record tab instead of drawer
src/features/master-data/parties/party-form-drawer.tsx — retire or keep for fallback
src/app/(protected)/admin/master-data/parties/page.tsx — remove drawer state

.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md           — update after implementation
```

---

## 24. Files NOT to Touch

```
Supabase migrations (anything in supabase/)
Database schema
Server actions (src/server/actions/**)
RLS policies
src/features/master-data/customers/* (legacy module — do not retire)
All existing ERPChildDialogForm implementations (ERP GLOBAL UI.2 — already complete)
src/components/erp/erp-child-dialog-form.tsx (no changes)
src/components/erp/erp-form-footer.tsx (no changes)
src/components/erp/required-label.tsx (no changes)
src/components/erp/combobox/erp-combobox.tsx (no changes)
Any module not explicitly listed in "Files to Modify"
```

---

## 25. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Child dialog overlay covers workspace tab bar | Medium | Set workspace tab bar `z-[90]`, always above child dialog overlays |
| Losing unsaved form state on tab switch (hybrid remount) | Medium | Warn before tab close if dirty; future keep-alive for record tabs only |
| localStorage tab restore with stale/unauthorized routes | Low | Revalidate each restored route on WorkspaceProvider mount |
| Browser back/forward desync from workspace | Medium | Watch `usePathname()` to sync active tab on URL change |
| Multiple workspace Providers if nested | Low | Single Provider at root — one global workspace instance |
| Next.js App Router + Zustand hydration mismatch | Low | Initialize Zustand store client-side only (no SSR) |
| Party Master drawer `key` remount pattern | Low | Record workspace form uses `key={mode-${id}}` same pattern |
| Sidebar groups collapsed by default — tab switching without sidebar | Low | Tab bar always visible — user can switch tabs without sidebar |
| Max 8 tabs hit frequently | Low | Increase to 10 later; Most users need < 5 concurrent |

---

## 26. Implementation Phase Split

### ERP GLOBAL UI.4A — Workspace Architecture Foundation

```
Deliverables:
- WorkspaceProvider, WorkspaceStore, WorkspaceRouteRegistry
- WorkspaceTabBar, WorkspaceTab, WorkspaceContent
- Sidebar integration (openTab instead of Link)
- Direct URL / localStorage restore
- Max 8 tabs enforcement
- Dashboard pinned tab
- No keep-alive; existing drawers remain

Files to create: workspace-types.ts, workspace-store.ts, workspace-route-registry.ts,
                 workspace-provider.tsx, workspace-tab-bar.tsx, workspace-tab.tsx,
                 workspace-content.tsx, use-workspace.ts
Files to modify: app-providers.tsx (or layout.tsx), erp-shell.tsx, app-sidebar.tsx
```

### ERP GLOBAL UI.4B — Dirty State and Safe Close Integration

```
Deliverables:
- Tab dirty indicator dot
- Close dirty tab warning (UnsavedChangesDialog)
- beforeunload warning if any dirty tab
- useFormDirty bridge to workspace store
- ERPDrawerForm dirty → workspace sync

Files to modify: use-form-dirty.ts, erp-drawer-form.tsx, workspace-store.ts
Files to create: use-workspace-tab-dirty.ts (bridge hook)
```

### ERP GLOBAL UI.4C — Workspace Record Form Standard

```
Deliverables:
- ERPRecordWorkspaceForm component
- ERPRecordHeader, ERPRecordSectionNav, ERPRecordFormFooter
- useRecordWorkspaceForm hook
- Documentation and Cursor rule finalization

Files to create: erp-record-workspace-form.tsx, erp-record-header.tsx,
                 erp-record-section-nav.tsx, erp-record-form-footer.tsx,
                 use-record-workspace-form.ts
```

### ERP GLOBAL UI.4D — Party Master Pilot Conversion

```
Deliverables:
- /admin/master-data/parties/new/page.tsx
- /admin/master-data/parties/[id]/page.tsx
- party-workspace-form.tsx (ERPRecordWorkspaceForm shell around existing tabs)
- parties-table.tsx updated to open record tabs
- party-form-drawer.tsx retired or kept as fallback
- Workspace route registry updated

Files to create: parties/new/page.tsx, parties/[id]/page.tsx, party-workspace-form.tsx
Files to modify: parties-table.tsx, workspace-route-registry.ts
```

### ERP GLOBAL UI.4E — Runtime QA and Performance Gate

```
Manual browser QA checklist:
- Tab open/close/switch
- Dirty state indicator
- Close dirty tab warning
- Browser refresh tab restore
- Direct URL access
- Sidebar click behavior
- Child dialog in workspace tab
- Party Master record tab (open, edit, save, tabs)
- Mobile/tablet responsive tab bar
Build verification (next build)
```

---

## 27. Cursor Rule Drafts

See separate files:
- `.cursor/rules/erp-workspace-tabs-standard.mdc`
- `.cursor/rules/erp-record-workspace-form-standard.mdc`

---

## 28. Acceptance Checklist (This Plan Phase)

- [x] App layout files inspected (layout.tsx, erp-shell.tsx, app-providers.tsx, app-header.tsx)
- [x] All protected routes inventoried (34 pages)
- [x] Sidebar navigation inspected (navGroups, Link, active state, comingSoon)
- [x] Drawer/form standards inspected (ERPDrawerForm, ERPFormFooter, ERPChildDialogForm)
- [x] Dirty state inspected (useFormDirty, UnsavedChangesDialog)
- [x] Child dialog pattern inspected (inert wrapper, z-index, opacity-50)
- [x] Party Master drawer implementation inspected
- [x] All implemented feature module folders inspected
- [x] Recommended architecture documented (Option C Hybrid)
- [x] Workspace store designed
- [x] Workspace route registry designed
- [x] ERPRecordWorkspaceForm designed
- [x] Files to create listed
- [x] Files to modify listed
- [x] Files not to touch listed
- [x] Drawer-to-record-form migration strategy documented
- [x] Party Master pilot conversion plan documented
- [x] Sidebar integration plan documented
- [x] Direct URL / refresh / history strategy documented
- [x] Dirty state / safe close integration plan documented
- [x] Child dialog workspace behavior planned
- [x] Performance strategy documented (max tabs, unmount policy, TanStack cache)
- [x] Security / permission strategy documented
- [x] Responsive strategy documented
- [x] Risks documented
- [x] Implementation phases split (4A → 4E)
- [x] Cursor rule drafts created
- [x] No implementation done
- [x] No database changes made

---

## 29. Open Decisions for Sameer

| # | Decision | Recommendation |
|---|---|---|
| 1 | Maximum open tabs: 8 or 10? | **8 initially**, increase to 10 later if needed |
| 2 | Persist tabs after browser refresh? | **Yes** — route metadata + title only, no form values |
| 3 | Persist unsaved form values after refresh? | **No** — wait for future draft/auto-save workflow |
| 4 | Start record workspace form now or later? | **Later** — 4A first (foundation), then 4C (record form) |
| 5 | Party Master as first record-form pilot? | **Yes** — 12 tabs justifies the investment |
| 6 | Sidebar always opens tabs after workspace? | **Yes** — consistent UX; no mixing Link and tab behavior |
| 7 | Dashboard tab pinned and non-closable? | **Yes** |
| 8 | Duplicate route → switch existing or new? | **Switch existing** for list/singleton tabs |
| 9 | Multiple record instances allowed? | **Yes** — allow multiple Party records open simultaneously (different IDs) |
| 10 | ERPDrawerForm allowed for small forms? | **Yes, permanently** — small setup forms (< 5 fields) stay as drawers |
| 11 | Which forms require ERPRecordWorkspaceForm? | Party Master (pilot), Customers, future Employee, Fleet, PO, Job Card |
| 12 | Workspace tab bar height: h-8 or h-10? | **h-10** (40px) — readable without wasting space |
| 13 | Should WorkspaceProvider wrap AppProviders or ErpShell? | **Wrap inside AppProviders** — cleaner; workspace accessible everywhere |

---

*End of ERP GLOBAL UI.4 Architecture Plan*  
*Created: 2026-06-14*  
*Next action: Sameer approves → ERP GLOBAL UI.4A implementation begins*
