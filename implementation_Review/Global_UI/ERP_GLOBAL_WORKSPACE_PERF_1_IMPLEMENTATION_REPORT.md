# ERP GLOBAL WORKSPACE.PERF.1 — Implementation Report

**Phase:** ERP GLOBAL WORKSPACE.PERF.1 — Workspace Tabs: State Loss, Overflow, Speed & Local Caching
**Status:** IMPLEMENTED — WS.1 + WS.2 + WS.3 complete; WS.4 deferred (D4: no hot list); WS.5 separate future phase
**Date:** 2026-08-03
**Plan:** `ERP_GLOBAL_WORKSPACE_PERF_1_TAB_STATE_OVERFLOW_SPEED_CACHING_PLAN.md` (decisions D1–D4 resolved by Sameer)

---

## 1. What Was Implemented

### WS.1 — Tab Overflow & Tab Bar UX (Issue #2)

`src/components/workspace/workspace-tab-bar.tsx` (rewritten):

- **Active tab auto-scrolls into view** whenever the active tab changes (uses `data-tab-id` attribute + `scrollIntoView({ inline: "nearest" })`).
- **Left/right chevron scroll buttons** appear only when the strip overflows; each is disabled at its end of the strip (ResizeObserver + scroll listener with 1px tolerance).
- **Mouse-wheel horizontal scrolling** over the strip (Chrome tab-strip behavior; uses the dominant axis of deltaX/deltaY).
- **"All tabs" dropdown** (chevron + open-tab count, right side): lists every open tab with dirty indicator, subtitle, activate-on-click, and per-tab close X. Built with Base UI `DropdownMenu`; trigger styled directly (no nested `<Button>`, per workspace standard).
- **Compact chip density** when more than 8 tabs are open: min-width drops 80→60px, subtitle hidden, "Close all" collapses to icon-only.
- **`MAX_TABS` reduced 20 → 10** (`src/lib/workspace/workspace-store.ts`, decision D1). Users restored with more keep their tabs; only opening NEW tabs is blocked.
- Standard doc updated: `.cursor/rules/erp-workspace-tabs-standard.mdc` Rule 6 now documents the single 10-tab limit and the overflow UX contract.

`src/components/workspace/workspace-tab.tsx` (rewritten):

- `compact` prop, `data-tab-id` attribute, and **route prefetch on hover** (WS.2 synergy).

### WS.2 — Navigation Speed (Issue #3 + #4 router layer)

- **`next.config.ts`**: `experimental.staleTimes = { dynamic: 30, static: 300 }` (decision D2). Returning to a tab visited < 30 s ago reuses the cached RSC payload — instant, zero server work. Server actions calling `revalidatePath` / `router.refresh()` still bypass the cache, so saves always show fresh data.
- **`src/app/(protected)/loading.tsx`** (NEW): the app previously had ZERO loading boundaries, so tab clicks froze on the old page until the server finished. This single file gives every protected route an instant skeleton (page header + toolbar + table rows) while the shell (sidebar + tab bar) stays mounted.
- **Prefetch on hover**: workspace tab chips (`workspace-tab.tsx`) and sidebar nav items (`app-sidebar.tsx`) call `router.prefetch(route)` on mouse-enter, so by the time the user clicks, the payload is usually already local.

### WS.3 — Draft System Hardening (Issue #1)

- **Two-tier field policy** (`src/lib/workspace/workspace-draft-types.ts`, decision D3):
  - Tier 1 `NEVER_DRAFT_FIELDS` / `NEVER_DRAFT_SUBSTRINGS`: credentials & files (password, token, secret, api_key, otp, pin, file, attachment) — never stored anywhere.
  - Tier 2 `MEMORY_ONLY_FIELDS`: business PII (emirates_id, iban, account_number, bank_account_number, passport_number) — now ALLOWED in the strictly in-memory draft store, so these fields survive tab switches like every other field. They remain forbidden in any future persisted storage.
- **`useWorkspaceFormDraft` hook**: new `restoredFromDraft` return value (frozen at mount via lazy `useState` initializer) — "did this form restore unsaved values?".
- **`DraftRestoredNotice`** (NEW, `src/components/workspace/draft-restored-notice.tsx`): dismissible amber banner telling the user unsaved values from a previous visit were restored.
- **Employee form** (`employee-workspace-form.tsx`) — the priority-1 gap:
  - The controlled `comboboxForm` state (18 fields: gender, nationality, department, designation, contract type, all org/manager selections) previously reset to server values on every tab switch. It now initializes from the draft (`cb_`-prefixed keys, typed back to number/string) and persists every user change to the draft via an effect with first-run/server-re-init skip guards.
  - Removed the dead local `DRAFT_DENYLIST` constant (superseded by D3 policy).
  - `DraftRestoredNotice` rendered at the top of the form.
- **DMS document record form** (`dms-document-record-form.tsx` + `sections/dms-document-overview-section.tsx`):
  - The form previously had NO `syncDraft` capture at all — added `onInput`/`onChange` capture (title, description, dates, hidden combobox inputs).
  - Overview section's controlled text/date fields (title, description, issue_date, expiry_date) now initialize from the draft via a new optional `getDraftDefault` prop.
  - `DraftRestoredNotice` rendered in the Overview section.
- **Unit tests** (NEW, `src/lib/workspace/__tests__/workspace-draft-policy.test.ts`): 7 tests covering both tiers, case-insensitivity, substrings, PII storage/restore, credential filtering on all three write paths, and per-tab clearing.

### Deferred by design

- **WS.4** (TanStack Query hot-list caching): deferred per decision D4 ("no hot list"). Revisit only if WS.2's 30 s router cache proves insufficient on specific screens.
- **WS.5** (Cache Components / `React.Activity` true state preservation): separate future phase as planned — large blast radius, prerequisite conflicts with `force-dynamic` pages.

---

## 2. Files Changed

| File | Change |
|---|---|
| `src/components/workspace/workspace-tab-bar.tsx` | REWRITTEN — chevrons, wheel scroll, All-tabs dropdown, auto-scroll, density |
| `src/components/workspace/workspace-tab.tsx` | REWRITTEN — compact prop, data-tab-id, hover prefetch |
| `src/components/workspace/draft-restored-notice.tsx` | NEW — WS.3 banner |
| `src/lib/workspace/workspace-store.ts` | MAX_TABS 20 → 10 (D1) |
| `src/lib/workspace/workspace-draft-types.ts` | Two-tier policy (D3) |
| `src/hooks/use-workspace-form-draft.ts` | `restoredFromDraft` return value |
| `src/lib/workspace/__tests__/workspace-draft-policy.test.ts` | NEW — 7 unit tests |
| `next.config.ts` | `experimental.staleTimes { dynamic: 30, static: 300 }` (D2) |
| `src/app/(protected)/loading.tsx` | NEW — global instant loading skeleton |
| `src/components/layout/app-sidebar.tsx` | Hover prefetch on nav items |
| `src/features/hr/employees/employee-workspace-form.tsx` | Combobox draft restore/persist + banner |
| `src/features/dms/documents/dms-document-record-form.tsx` | syncDraft capture + banner |
| `src/features/dms/documents/sections/dms-document-overview-section.tsx` | Draft-aware text/date initializers |
| `.cursor/rules/erp-workspace-tabs-standard.mdc` | Rule 6 updated (10-tab limit + overflow UX contract) |

No database changes. No new dependencies.

---

## 3. Verification Performed

| Check | Result |
|---|---|
| ESLint on all touched files | 0 errors (remaining warnings pre-existing) |
| `tsc --noEmit` | No errors in touched files (only pre-existing `@/types/database` errors in unrelated forms) |
| Unit tests | 24 files / 447 tests passed, including the 7 new draft-policy tests |
| Live browser UAT (dev server, 21 open tabs) | Chevrons render with correct disabled states; All-tabs dropdown lists all 21 tabs with dirty dots and close buttons; clicking a far tab activates + navigates + auto-scrolls it into view |

### Bug found & fixed during UAT

Base UI throws `MenuGroupContext is missing` when `DropdownMenuLabel` (Menu.GroupLabel) is used outside `Menu.Group`. Fixed by wrapping the dropdown header label in `DropdownMenuGroup`. Verified working after fix.

---

## 4. Expected Outcomes

| Issue | Before | After |
|---|---|---|
| Unreachable tabs | Tabs beyond viewport width were unreachable | Every tab reachable via chevrons, wheel, dropdown; active tab always scrolled into view; 10-tab cap keeps the strip sane |
| Slow tab switching | Frozen old page until server render finished; every switch a full round trip | Instant skeleton paint; sub-30 s revisits served from client router cache; hover prefetch warms the rest |
| Lost unsaved edits | Employee combobox selections and all DMS document fields silently reset on tab switch; Emirates ID/IBAN always dropped | Restored from the in-memory draft with a visible "draft restored" banner; PII fields retained per D3 |

## 5. Notes / Follow-ups

- `staleTimes` requires the dev server to have restarted after the `next.config.ts` change (Next.js auto-restarts on config change; if switching still always hits the server, restart `npm run dev` once).
- The 30 s router cache means a list edited in tab B may show ≤30 s stale data when flipping back to tab A within that window — accepted trade-off per D2; server actions that `revalidatePath` still invalidate immediately.
- Remaining forms outside Employee/DMS document/Party already using `useWorkspaceFormDraft` follow the same pattern; any form found lacking coverage should be wired using the Employee form as the reference implementation.
