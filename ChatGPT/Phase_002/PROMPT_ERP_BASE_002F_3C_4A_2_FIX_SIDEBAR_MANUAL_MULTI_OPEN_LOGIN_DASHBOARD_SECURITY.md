# PROMPT_ERP_BASE_002F_3C_4A_2_FIX_SIDEBAR_MANUAL_MULTI_OPEN_AND_LOGIN_DASHBOARD_SECURITY

Act as a senior ERP QA lead, Next.js runtime tester, SaaS security tester, session/navigation security reviewer, enterprise ERP UI/UX navigation reviewer, senior React/Next.js frontend engineer, and layout stability specialist.

## Phase

ERP BASE 002F.3C.4A.2 — Sidebar Manual Multi-Open State and Login Dashboard Security Fix

## Implementation Mode

This is a focused IMPLEMENTATION prompt.

Implement only the sidebar state/navigation security fix described in this prompt.

Do not start ERP BASE 002F.3C.4B.

Do not start ERP BASE 002F.3D.

Do not implement Dynamic Sidebar / Menu Builder.

Do not implement Branding.

Do not implement any operational module.

Do not modify database schema.

Do not create migrations.

## Current Problem

After the previous sidebar fix, the sidebar behavior is still not correct.

Current issue reported by Sameer:

```text
When user clicks any submenu, the app opens the required page, but then collapses all menus and opens the Administration menu.
```

This is wrong.

The sidebar must not reset itself to Administration or to any active route group after clicking a submenu.

## Additional Security Requirement

Sameer also reported a security concern:

```text
When user refreshes or logs in, the app should go to Dashboard, not to the previous opened screen.
If two users use the same computer, restoring the previous opened screen can create a security issue.
```

Therefore, login and refresh behavior must be reviewed and fixed safely.

---

# 1. Required Final Behavior

## 1.1 Sidebar Behavior

Required behavior:

```text
On login or browser refresh:
- all main sidebar menus are collapsed
```

After that:

```text
When user manually opens a main menu:
- keep that menu open
```

```text
When user opens another main menu:
- keep the previous menu open also
- do NOT auto-close the previous menu
- no accordion behavior
```

```text
When user clicks a submenu:
- navigate to the selected page
- keep current menu state
- do NOT collapse all menus
- do NOT auto-open Administration
- do NOT recalculate expanded group based on pathname after submenu click
```

```text
When user manually closes a main menu:
- close only that menu
```

## 1.2 Login / Refresh Security Behavior

Required behavior:

```text
On successful login:
- redirect user to /dashboard
- do not redirect to previously opened protected screen
- do not use returnTo/redirectTo previous protected path unless explicitly approved later
```

```text
On browser refresh inside protected app:
- reset navigation/session-entry behavior so the app lands on /dashboard where practical
- do not restore previous screen from localStorage/sessionStorage/sidebar state
```

Important:

```text
Do not break normal authenticated page navigation after user is already inside the app.
```

The user should still be able to navigate normally after landing on Dashboard.

Security objective:

```text
If another user uses the same computer/browser, the app should not automatically reopen the previous user's last visited ERP screen after login/refresh.
```

---

# 2. Required Source Inspection

Inspect current files before changes.

Expected files:

```text
src/components/layout/app-sidebar.tsx
src/components/layout/erp-shell.tsx
src/app/(protected)/layout.tsx
src/app/(auth)/login/page.tsx
src/app/login/page.tsx
src/app/(protected)/dashboard/page.tsx
src/middleware.ts
src/proxy.ts if exists
src/lib/supabase/middleware.ts
src/lib/auth
src/lib/rbac/check.ts
```

Search for:

```text
expandedGroups
setExpandedGroups
findActiveGroup
usePathname
pathname
toggleGroup
accordion
localStorage
sessionStorage
redirectTo
returnTo
next
callbackUrl
lastRoute
previousRoute
dashboard
login
auth redirect
middleware redirect
router.push
router.replace
```

Find exactly what causes:

```text
submenu click → menus collapse → Administration opens
```

Likely cause:

```text
useEffect on pathname change calls setExpandedGroups([activeGroup])
```

or route matching incorrectly identifies Administration group.

---

# 3. Sidebar Fix Requirements

## 3.1 Remove Accordion Behavior

Previous fix likely introduced:

```typescript
setExpandedGroups((prev) => prev.includes(label) ? [] : [label]);
```

Change to manual multi-open behavior:

```typescript
setExpandedGroups((prev) =>
  prev.includes(label)
    ? prev.filter((g) => g !== label)
    : [...prev, label]
);
```

## 3.2 Remove Pathname Auto-Override After Submenu Click

Do not allow `useEffect([pathname])` to override expanded menu groups during normal navigation.

Bad behavior:

```typescript
useEffect(() => {
  const activeGroup = findActiveGroup(pathname);
  if (activeGroup) {
    setExpandedGroups([activeGroup]);
  }
}, [pathname]);
```

This causes menu reset after submenu click.

Correct behavior:

```text
Initial render / page load:
- all groups collapsed

Manual user action:
- controls expandedGroups

Navigation:
- does not reset expandedGroups
```

## 3.3 Initial State

Set:

```typescript
const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
```

No localStorage.

No active-route auto-open.

No all-groups-open.

## 3.4 Active Route Highlight

Keep active submenu highlighting.

Even if a group is collapsed, the active page can still be shown in breadcrumb/header. If user opens that group, active item should be highlighted.

Do not break:

```text
pathname === item.path
active item style
```

## 3.5 Sidebar Scroll

Keep independent scroll behavior.

Do not break:

```text
h-screen
flex flex-col
ScrollArea / overflow-y-auto
sidebar footer
sidebar width toggle
```

---

# 4. Login / Refresh Dashboard Security Requirements

## 4.1 Login Redirect

Find login handler.

Ensure after successful login:

```text
router.replace('/dashboard')
```

or equivalent.

Do not use:

```text
returnTo
redirectTo previous path
callbackUrl
last visited route
```

unless the app has an existing security-approved reason.

If existing logic uses `next` or `redirectTo`, disable it for now and force Dashboard.

## 4.2 Refresh / Protected App Entry

Investigate whether app restores previous route from:

```text
localStorage
sessionStorage
middleware
browser history
auth redirect
```

If there is custom “last route” logic, remove/disable it.

If normal browser refresh naturally reloads the current URL, consider the safest practical app-level behavior:

Recommended minimum safe approach:

```text
On successful login, always redirect to Dashboard.
Clear any stored previous route / returnTo / lastRoute.
Do not persist last protected route.
```

If the user is already authenticated and manually refreshes a page, browser will normally reload the same URL. Do not create a disruptive redirect loop unless the app currently stores/restores last page. Document the exact implemented behavior.

Important distinction:

```text
Login must never restore previous user screen.
Refresh should not use stored previous-route logic.
But normal browser refresh of current authenticated page may still reload the current page unless a deliberate dashboard redirect is safely implemented without breaking UX.
```

Cursor must explain in the report what is technically implemented.

## 4.3 Logout Cleanup

If there is logout handler, ensure it clears:

```text
returnTo
redirectTo
lastRoute
sidebar expanded menu state
any route/session navigation keys
```

Only if such keys exist.

Do not clear unrelated user/business data.

---

# 5. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If lint has unrelated legacy issues, separate:

```text
Sidebar/login fix errors:
Legacy unrelated lint errors:
```

All errors caused by this fix must be corrected.

## Manual Browser Tests

### Test 1 — Login Opens Dashboard

1. Logout.
2. Login.
3. Confirm landing page is:

```text
/dashboard
```

4. Confirm it does not reopen the last protected screen.

### Test 2 — Menus Collapsed After Login

1. Login.
2. Confirm all main sidebar menu groups are collapsed.
3. Confirm no menu group opens automatically unless the Dashboard direct item is visible.

### Test 3 — Menus Collapsed After Refresh

1. Open app.
2. Refresh browser.
3. Confirm sidebar groups are collapsed.
4. Confirm no old expanded state is restored.

### Test 4 — Multi-Open Manual Behavior

1. Open Geography & Locations.
2. Open Finance Basics.
3. Confirm both remain open.
4. Open Units & Measurements.
5. Confirm all three can remain open.

### Test 5 — Manual Close

1. Close Finance Basics.
2. Confirm only Finance Basics closes.
3. Confirm Geography and Units remain open.

### Test 6 — Submenu Click Keeps Menu State

1. Open Geography & Locations and Finance Basics.
2. Click Currencies.
3. Confirm Currencies page opens.
4. Confirm Geography & Locations and Finance Basics remain open.
5. Confirm Administration does NOT auto-open unless manually opened.

### Test 7 — Active Highlight Still Works

1. Click Units of Measure.
2. Confirm page opens.
3. If Units & Measurements menu is open, active submenu is highlighted.

### Test 8 — Sidebar Scroll Still Works

1. Open several menus.
2. Scroll sidebar.
3. Confirm sidebar scrolls independently from main content.

### Test 9 — Width Toggle Still Works

1. Collapse sidebar to icon mode.
2. Expand it again.
3. Confirm manual menu behavior still works.

---

# 6. Required Report

Create:

```text
ERP_BASE_002F_3C_4A_2_SIDEBAR_MANUAL_MULTI_OPEN_LOGIN_DASHBOARD_FIX_REPORT.md
```

Report must include:

1. Phase name.
2. Date.
3. Summary of reported issue.
4. Files reviewed.
5. Files modified.
6. Root cause found.
7. Sidebar state fix implemented.
8. Accordion removed confirmation.
9. Pathname auto-reset removed confirmation.
10. Manual multi-open behavior implemented.
11. Login redirect to Dashboard implemented.
12. Previous-route restore disabled/cleared.
13. Refresh behavior explanation.
14. Logout cleanup if applicable.
15. Typecheck result.
16. Lint result.
17. Build result.
18. Browser testing result.
19. Remaining known limitations.
20. Deferred items.
21. Final status.

At the end write one of:

```text
PASS — Sidebar manual multi-open and login dashboard security fix is complete and ready for Sameer review.
PASS WITH NOTES — Sidebar/login fix works with minor non-blocking notes.
FAIL — Sidebar/login fix requires correction before approval.
```

## Deferred Items

Confirm these were not implemented:

```text
Dynamic Sidebar / Menu Builder
Role-based menu visibility
Branding
Mobile sidebar redesign
localStorage menu persistence
Operational modules
```

## Final Instruction

Implement only:

```text
ERP BASE 002F.3C.4A.2 — Sidebar Manual Multi-Open State and Login Dashboard Security Fix
```

Generate the report and stop.
