# PROMPT_ERP_BASE_002F_3C_4A_IMPLEMENT_SIDEBAR_COLLAPSE_SCROLL_FIX

Act as a senior ERP QA lead, Playwright automation engineer, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX navigation reviewer, senior React/Next.js frontend engineer, accessibility reviewer, and layout stability specialist.

## Phase

ERP BASE 002F.3C.4A — Sidebar Collapse and Scroll Fix

## Implementation Mode

This is a focused IMPLEMENTATION prompt.

Implement only the sidebar navigation UX fix approved in the 002F.3C.4 technical plan.

Do not implement 002F.3C.4B.

Do not implement master data QA fixes.

Do not implement Organization `default_currency` fix.

Do not implement role-based menu visibility.

Do not implement mobile sidebar redesign unless a tiny compatibility adjustment is required.

Do not implement localStorage persistence unless the current code already uses it and must be corrected.

Do not start new ERP modules.

Do not modify database schema.

Do not create migrations.

## Source Plan

Use this plan as reference:

```text
ERP_BASE_002F_3C_4_INTEGRATION_SIDEBAR_SELECTS_QA_READINESS_PLAN.md
```

The approved next step is:

```text
002F.3C.4A — Sidebar UX Collapse/Scroll Fix
```

## User-Reported Problem

Sameer reported:

```text
The sidebar has become long.
When user logs in or refreshes, all main menus are expanded.
The user needs to close each menu manually to reach the target menu.
The side menu needs its own scrollbar.
```

This is not acceptable for enterprise ERP navigation.

## Approved Sidebar Behavior

Implement:

```text
On login or browser refresh:
- all main menu groups collapsed by default
- only the active route group may auto-expand
- accordion behavior: opening one top-level group closes the others
- sidebar has independent vertical scroll
- user can reach bottom menus without manually closing multiple sections
```

## Explicitly Deferred

Do not implement these in this phase:

```text
mobile sidebar redesign
role-based menu visibility
localStorage persistence
full master data QA
organization default_currency fix
002F.3C.4B
002F.3C.4C
```

If you find a minor mobile or layout side effect while changing the sidebar, document it but do not expand scope.

---

# 1. Required Source Inspection

Inspect current sidebar/layout files before changes.

Expected files:

```text
src/components/layout/app-sidebar.tsx
src/components/layout/erp-shell.tsx
src/app/(protected)/layout.tsx
src/components/layout
```

Search for:

```text
sidebar
navGroups
expandedGroups
setExpandedGroups
collapse
collapsed
accordion
openMenus
localStorage
ScrollArea
overflow
overflow-y
max-height
height
100vh
usePathname
active route
```

Confirm the current root cause.

The 002F.3C.4 plan identified likely root cause:

```typescript
const [expandedGroups, setExpandedGroups] = useState<string[]>(
  navGroups.map((g) => g.label)
);
```

This opens all groups by default and must be fixed.

---

# 2. Required Fix Scope

## 2.1 Collapsed by Default

Replace “all groups expanded by default” behavior.

On initial login/refresh, sidebar groups must not all open.

Approved default:

```text
Only active route group is open if current page belongs to a group.
Otherwise all groups are closed.
```

Example:

If current route is:

```text
/admin/master-data/uom/units
```

Then only:

```text
Units & Measurements
```

should be expanded.

If current route is:

```text
/dashboard
```

Then either:

```text
Overview
```

may be expanded, or all groups may remain collapsed if Dashboard is visible as a direct item.

## 2.2 Active Group Detection

Use `usePathname()` or the current route detection method.

Find the top-level group that contains the current route.

Route matching should support nested paths.

Example:

```typescript
pathname === item.path || pathname.startsWith(item.path + "/")
```

If a group has nested items, scan them.

## 2.3 Accordion Behavior

Implement accordion behavior for top-level groups:

```text
Opening one group closes the others.
Clicking an already-open group closes it.
```

Example:

```typescript
const toggleGroup = (label: string) => {
  setExpandedGroups((prev) => prev.includes(label) ? [] : [label]);
};
```

If the existing state model uses object/map instead of array, adapt safely.

## 2.4 Sidebar Independent Scroll

The sidebar menu area must scroll independently from main page content.

Ensure:

```text
Sidebar container respects viewport height.
Scrollable menu area uses overflow-y-auto or ScrollArea correctly.
Header/footer areas stay fixed if applicable.
Main content scroll remains independent.
```

Recommended layout pattern:

```tsx
<aside className="h-screen flex flex-col">
  <SidebarHeader />
  <div className="flex-1 min-h-0 overflow-y-auto">
    <nav>...</nav>
  </div>
  <SidebarFooter />
</aside>
```

Important CSS concepts:

```text
h-screen or h-full based on layout
flex flex-col
flex-1
min-h-0
overflow-y-auto
```

If using `ScrollArea`, ensure it has:

```text
flex-1
min-h-0
```

and the parent allows height constraint.

## 2.5 Preserve Existing Sidebar Features

Do not break:

```text
sidebar expanded/collapsed width toggle
icon-only collapsed mode
active item highlight
current route highlight
existing sidebar groups
existing routes
existing icons
existing user profile/footer section
theme styles
responsive layout as currently working
```

Do not remove any menu items.

## 2.6 No localStorage Persistence in This Phase

Do not add new localStorage persistence.

Reason:

```text
The approved behavior is predictable collapsed/default state on login/refresh.
```

If the current sidebar already uses localStorage and it causes all groups to reopen, disable or adjust it so it does not override the approved behavior.

## 2.7 No Role-Based Visibility in This Phase

Do not hide menu items by permissions in this prompt.

RBAC remains page-level until a later phase.

---

# 3. Expected Technical Approach

Use the safest approach after inspecting real code.

Recommended logic:

```typescript
function findActiveGroup(pathname: string): string | null {
  for (const group of navGroups) {
    const hasActiveItem = group.items.some((item) => {
      if (item.path && (pathname === item.path || pathname.startsWith(`${item.path}/`))) {
        return true;
      }

      if (item.children) {
        return item.children.some((child) =>
          pathname === child.path || pathname.startsWith(`${child.path}/`)
        );
      }

      return false;
    });

    if (hasActiveItem) return group.label;
  }

  return null;
}

const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
  const activeGroup = findActiveGroup(pathname);
  return activeGroup ? [activeGroup] : [];
});

useEffect(() => {
  const activeGroup = findActiveGroup(pathname);

  if (activeGroup) {
    setExpandedGroups([activeGroup]);
  } else {
    setExpandedGroups([]);
  }
}, [pathname]);
```

But be careful:

```text
If this makes the menu close immediately when user manually opens another group without navigation, avoid over-aggressive useEffect.
```

Better behavior:

```text
On pathname change, open active group.
On manual click, allow user to open another group.
On refresh, initial state comes from active route only.
```

Recommended:

```typescript
const initialActiveGroup = findActiveGroup(pathname);
const [expandedGroups, setExpandedGroups] = useState<string[]>(
  initialActiveGroup ? [initialActiveGroup] : []
);

useEffect(() => {
  const activeGroup = findActiveGroup(pathname);
  if (activeGroup) {
    setExpandedGroups([activeGroup]);
  }
}, [pathname]);
```

This ensures navigation opens the active group.

---

# 4. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If full lint has unrelated legacy issues, separate them clearly:

```text
Sidebar fix lint errors:
Legacy unrelated lint errors:
```

All sidebar/layout-related errors must be fixed.

## Manual Browser Tests

Test as normal logged-in user and system_admin if possible.

### Test 1 — Login / Refresh Default

1. Login to the application.
2. Refresh browser on Dashboard.
3. Confirm all sidebar top-level groups are not expanded.
4. Confirm sidebar is clean and not showing all menu items.

Expected:

```text
All groups collapsed, or only Overview active group expanded.
```

### Test 2 — Active Route Group Opens

1. Navigate directly to:

```text
/admin/master-data/uom/units
```

2. Refresh browser.

Expected:

```text
Only Units & Measurements group is open.
Units of Measure item is highlighted.
Other groups are collapsed.
```

### Test 3 — Accordion Behavior

1. Open Geography & Locations.
2. Open Finance Basics.

Expected:

```text
Geography & Locations closes.
Finance Basics opens.
```

3. Open Units & Measurements.

Expected:

```text
Finance Basics closes.
Units & Measurements opens.
```

### Test 4 — Independent Sidebar Scroll

1. Expand a group near the bottom.
2. Scroll inside sidebar.
3. Confirm main page content does not scroll because of sidebar scroll.
4. Confirm bottom menus are reachable without closing unrelated groups.

### Test 5 — Sidebar Width Toggle

1. Click existing sidebar collapse/expand button.
2. Confirm sidebar becomes icon-only or compact as before.
3. Expand again.
4. Confirm group behavior still works.

### Test 6 — Route Highlight

1. Navigate to several pages:

```text
/admin/master-data/geography/countries
/admin/master-data/finance-basics/currencies
/admin/master-data/uom/categories
/admin/organizations
/admin/branches
```

2. Confirm active item highlight remains correct.
3. Confirm only active group is opened after navigation.

### Test 7 — No Menu Loss

Confirm these groups and routes still exist:

```text
Overview
Administration
Geography & Locations
Finance Basics
Units & Measurements
Operations
Finance & Supply
```

And all previously existing menu items still appear when their group opens.

---

# 5. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_4A_SIDEBAR_COLLAPSE_SCROLL_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of problem.
4. Files reviewed.
5. Files modified.
6. Root cause confirmed.
7. Collapsed-by-default behavior implemented.
8. Active route group behavior implemented.
9. Accordion behavior implemented.
10. Independent sidebar scroll implemented/verified.
11. Sidebar width toggle regression check.
12. Active route highlight check.
13. Typecheck result.
14. Lint result.
15. Build result.
16. Browser testing result.
17. Remaining known limitations.
18. Deferred items confirmation.
19. Final status.

At the end write one of:

```text
PASS — Sidebar collapse and scroll fix is complete and ready for Sameer review.
PASS WITH NOTES — Sidebar fix works with minor non-blocking notes.
FAIL — Sidebar fix requires correction before approval.
```

## Deferred Items to Confirm in Report

The report must explicitly confirm these were not implemented:

```text
mobile sidebar redesign
role-based menu visibility
localStorage persistence
full master data QA
organization default_currency fix
002F.3C.4B
```

## Final Instruction

Implement only:

```text
ERP BASE 002F.3C.4A — Sidebar Collapse and Scroll Fix
```

Do not implement the next 002F.3C.4B phase.

Generate the report and stop.
