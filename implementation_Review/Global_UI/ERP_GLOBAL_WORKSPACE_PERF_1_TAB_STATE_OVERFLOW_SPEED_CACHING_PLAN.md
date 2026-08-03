# ERP GLOBAL WORKSPACE.PERF.1 — Workspace Tabs: State Loss, Overflow, Speed & Local Caching Plan

**Phase:** ERP GLOBAL WORKSPACE.PERF.1
**Status:** IMPLEMENTED (WS.1 + WS.2 + WS.3) — 2026-08-03. WS.4 deferred per D4 ("no hot list" — revisit only if WS.2 caching proves insufficient). WS.5 remains a separate future phase. See `ERP_GLOBAL_WORKSPACE_PERF_1_IMPLEMENTATION_REPORT.md`.
**Date:** 2026-08-03
**Author:** Deep investigation of workspace code + Next.js 16.2.6 bundled docs + online research
**Stack facts:** Next.js `16.2.6`, React `19.2.4`, TanStack Query `5.101` (already installed, global provider), Turbopack dev

---

## 1. Reported Issues

| # | Issue (as reported) | Verdict after investigation |
|---|---|---|
| 1 | "When I navigate between the tabs, the previous tab is losing the updates if I didn't save" | CONFIRMED — partial draft system exists but has major coverage gaps |
| 2 | "When I open multiple tabs, the tabs after the size cannot be navigated to — I need to close previous tabs to see the last tab" | CONFIRMED — tab bar hides its scrollbar and offers no overflow affordance at all |
| 3 | "Navigation between tabs is slow" | CONFIRMED — every tab switch is a full server round-trip with zero client caching and zero loading boundaries |
| 4 | "Maybe we can make local caching so it will help" | AGREED — three complementary caching layers proposed (router cache, query cache, route state preservation) |

---

## 2. How the Workspace Works Today (evidence)

### 2.1 Architecture

- `src/components/layout/erp-shell.tsx` renders `WorkspaceDraftProvider > WorkspaceProvider > TabBar + WorkspaceContent{children}`.
- **There is only ONE page mounted at a time.** A workspace "tab" is only metadata (route, title, icon) stored in a reducer + localStorage. Switching tabs calls `router.push(tab.route)` (`workspace-provider.tsx` line 218-226) which performs a full Next.js App Router navigation: the current page **unmounts**, the target page **re-renders on the server**.
- Tab metadata persists in localStorage (`algt_erp_workspace_tabs`), but never form values (by design, Rule 11).

### 2.2 Why this explains all three problems

| Symptom | Mechanism |
|---|---|
| Unsaved edits lost | Page unmount destroys all React state. The in-memory draft store (UI.4E.2) is supposed to restore fields on remount — but coverage is incomplete (see §3.1) |
| Slow switching | 83 of 210 pages are `force-dynamic`, 70 have `revalidate = 0`. Next.js 15+/16 client router cache default for dynamic pages is `staleTime: 0` → **every** tab switch refires auth + permission checks + full DB queries + RSC render. There are **0 `loading.tsx` files in the whole app** and no `router.prefetch` anywhere, so the old page stays frozen until the server finishes — the click feels dead |
| Unreachable tabs | `MAX_TABS = 20` in `workspace-store.ts` (the standard doc says 8) but the tab strip is `overflow-x-auto scrollbar-none` with min-width 80px per chip — beyond ~10 tabs they overflow off-screen with no scroll buttons, no wheel handler, no dropdown, no auto-scroll-into-view |

---

## 3. Issue-by-Issue Deep Findings

### 3.1 Issue 1 — Unsaved edits lost on tab switch

A draft system **already exists** (ERP GLOBAL UI.4E.2):

- `src/lib/workspace/workspace-draft-store.ts` — in-memory `Map` (never localStorage, security rule)
- `src/hooks/use-workspace-form-draft.ts` — `getDraftDefault` / `writeDraftField` / `syncDraft` (FormData snapshot, 200ms debounce)
- Wired into ~30 workspace forms.

**Why the user still loses data — five gaps found:**

| Gap | Detail | Evidence |
|---|---|---|
| G1 — Uneven wiring | Draft restore requires **per-field** wiring. `party-workspace-form.tsx` has 44 draft call sites; `employee-workspace-form.tsx` has only **8** — the Employee form has dozens of fields across many tabs, so most of it silently loses state | grep counts |
| G2 — Controlled components | `snapshotFormData()` only captures **named `<input>` elements** via FormData. `ERPCombobox`, date pickers, switches, rich editors hold value in React state and need an explicit `writeDraftField` call each — easily forgotten, no lint/QA net catches an unwired field | `workspace-draft-store.ts` L22-35 |
| G3 — Denylist drops business fields | `DRAFT_FIELD_DENYLIST` excludes `emirates_id`, `account_number`, `iban`, `passport_number`… — these fields **always** lose their value on tab switch, by design, with no user feedback | `workspace-draft-types.ts` L42-74 |
| G4 — Child/sub-tab state not covered | Child tab grids (contacts, addresses), unsent child-dialog inputs, and section-local UI state have no draft coverage at all | code review |
| G5 — In-memory only | Any hard reload, dev recompile, or session expiry wipes all drafts (accepted security trade-off, but users are not warned) | `workspace-draft-provider.tsx` |

**There is also no user-visible signal** that a draft was restored (or NOT restored) after switching back.

### 3.2 Issue 2 — Tab overflow unreachable

`workspace-tab-bar.tsx` L63-77: the scroll row is

```tsx
className="flex items-end overflow-x-auto scrollbar-none flex-1 min-w-0"
style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
```

- Scrollbar deliberately hidden; **no left/right chevron buttons**, **no mouse-wheel → horizontal scroll translation**, **no "list all tabs" dropdown**, **no scroll-active-tab-into-view effect** when a tab is activated programmatically (e.g. opened from sidebar).
- Store allows **20** tabs (`MAX_TABS = 20`) while the workspace standard says 8/10 — the overflow was designed for 8 tabs but the limit was raised without adding overflow UX.
- Mouse users literally cannot reach the right-most tabs. (Trackpad horizontal swipe works, which is why this passed earlier UAT.)

### 3.3 Issue 3 — Slow tab switching

Measured mechanics of one tab switch (e.g. to Party Master list):

1. `router.push("/admin/master-data/parties")` — client router cache **miss guaranteed** (dynamic staleTime = 0 since Next 15).
2. Server: `getAuthContext()` (session + profile + permission queries) → `getParties()` (full table query) → RSC render.
3. Client: nothing changes on screen until step 2 starts streaming (**no `loading.tsx` anywhere**, page-internal `<Suspense>` only helps after streaming starts).
4. Old page unmounts, new page mounts from scratch (all client hooks refetch their own lookups unless TanStack-cached).

So a tab switch costs 1 full network round-trip + auth overhead + DB queries **every time**, even when returning to a tab visited 5 seconds ago. In dev, Turbopack compile-on-demand makes it worse (first visit to each route compiles it).

### 3.4 Issue 4 — Local caching options (research results)

Three complementary layers, all verified against Next.js 16.2.6 bundled docs:

| Layer | What it caches | Mechanism | Status in 16.2.6 |
|---|---|---|---|
| A. Client Router Cache | RSC payload of visited pages for N seconds | `experimental.staleTimes: { dynamic: 30 }` in `next.config.ts` | Available, experimental, 1-line change (default became 0 in v15) |
| B. TanStack Query | Business data fetched client-side | Already installed with 5-min staleTime; today only used for lookups/widgets — **list pages don't use it** | Available now |
| C. Cache Components + React `<Activity>` | **Entire route trees stay mounted (hidden), preserving React state, DOM, scroll** | `cacheComponents: true` — Next.js hides inactive routes with `display:none` instead of unmounting; **up to 3 routes preserved**, oldest evicted | Available in Next 16, but a **major migration**: route segment configs (`dynamic`, `revalidate`) must be removed/replaced with `use cache` across 83+ pages |

Key research references:
- Next.js docs: *Preserving UI state with Activity* (`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`) — "Instead of unmounting pages on navigation, Next.js hides them using React's `<Activity>`… preserves up to 3 routes."
- Next.js docs: *staleTimes* — dynamic default changed 30s → 0s in v15.0.0; opt back in via config.
- Next.js docs: *Instant navigation* (`instant-navigation.md`) — `unstable_instant` validation, Suspense boundary placement rules for instant client navigations.
- GitHub `vercel/next.js` #66039 — "[Breaking] disable client router cache for page segments" (explains exactly our symptom).
- GitHub commit `56d9513` — `useRouter().bfcacheId` opt-out mechanism for Activity state preservation (needed for "New Record" forms that SHOULD reset).

---

## 4. Solution Plan (phased, ordered by value ÷ risk)

### WS.1 — Tab Overflow & Tab Bar UX (fixes Issue 2) — LOW RISK, HIGH VALUE, ~half day

1. **Auto-scroll active tab into view** — `useEffect` on `activeTabId` calling `scrollIntoView({ inline: "nearest" })` on the active chip. Fixes "tab opened from sidebar is off-screen".
2. **Left/right chevron scroll buttons** — appear only when content overflows (compare `scrollWidth > clientWidth`); scroll by ~200px per click; disabled states at each end.
3. **Mouse-wheel horizontal scrolling** — `onWheel` handler translating vertical delta to `scrollLeft` (standard Chrome-tab-strip behavior).
4. **"All tabs" dropdown** (VS Code / Chrome style) — a `⌄` button at the right end listing every open tab with title, dirty dot, and close action; clicking activates + scrolls into view. This makes any tab reachable regardless of count.
5. **Optional: shrink-to-fit** — reduce `min-w-[80px]` to `min-w-[60px]` and hide subtitles when > 10 tabs (progressive density).
6. **MAX_TABS → 10** *(D1 DECIDED)* — restore the limit to 10 in `workspace-store.ts` (currently 20) and update the workspace tabs standard doc to match. Existing users with >10 persisted tabs keep them until closed; only opening NEW tabs is blocked at the limit (no silent closing).

Files: `workspace-tab-bar.tsx`, `workspace-tab.tsx` only. No store/provider changes.

### WS.2 — Perceived + Real Navigation Speed (fixes Issue 3, part of 4) — LOW-MEDIUM RISK, ~1-2 days

1. **`staleTimes: { dynamic: 30, static: 300 }`** in `next.config.ts` *(D2 DECIDED: 30s)* — returning to a tab visited < 30s ago becomes instant (RSC payload reused, zero server work). One line. Trade-off: list data can be up to 30s stale on re-visit; mitigated because saves call `revalidatePath`/`router.refresh()` which bypass the cache.
2. **Add `loading.tsx` skeletons** to the ~15 highest-traffic route groups (dashboard, parties, employees, DMS documents/inbox, users, settings…). The tab switch then paints instantly with a skeleton instead of freezing on the old page. Cheap and framework-native.
3. **Prefetch on tab hover + on tab open** — `router.prefetch(tab.route)` in `WorkspaceTabChip` `onMouseEnter` and in `openTab()`. With (1), the prefetched payload is actually reusable.
4. **Sidebar prefetch** — same `onMouseEnter` prefetch for sidebar items (they call `openTab`, not `<Link>`, so no automatic prefetching exists today).

### WS.3 — Draft System Hardening (fixes Issue 1) — MEDIUM RISK, ~2-3 days

1. **Coverage audit + completion**: sweep all `*-workspace-form.tsx` / record forms; wire `getDraftDefault` + `writeDraftField` for **every** editable field, including all `ERPCombobox`/date/switch controlled components. Priority order: Employee (worst coverage: 8 call sites), DMS Document, Party child tabs, then the rest.
2. **"Draft restored" indicator**: when a form mounts with `hasDraft === true`, show a small amber banner "Unsaved changes restored — not yet saved" with a *Discard draft* action. Makes behavior trustworthy and debuggable.
3. **In-memory retention of denylisted fields** *(D3 DECIDED: in-memory only)*: fields like Emirates ID, IBAN, account numbers WILL now be preserved across tab switches in the **in-memory** draft store (they are lost today). Security invariants that stay absolute: (a) drafts NEVER touch localStorage/sessionStorage — the existing UI.4E.2 rule is unchanged; (b) passwords/tokens/secrets/API keys remain fully denylisted even in memory; (c) drafts are cleared on tab close, save, and logout. Implementation: split the denylist into `NEVER_DRAFT` (credentials) vs `MEMORY_ONLY` (business PII) tiers in `workspace-draft-types.ts`.
4. **Regression net**: add a unit test per form (or a shared test helper) asserting every named field + registered controlled field round-trips through the draft store.
5. **Child-dialog protection**: child dialogs already block tab switching (UI.4G z-index design), so no draft needed there — document this explicitly.

### WS.4 — Client Data Cache for Hot Lists (rest of Issue 4) — MEDIUM RISK, ~2-3 days, OPTIONAL after WS.2

*(D4 DECIDED: Sameer has no specific hot-list preference — use the default set below, chosen from the most-navigated modules in daily use. WS.4 stays optional: measure WS.2 first; implement WS.4 only if switching to these screens still feels slow.)*

Default screen set: **Parties, Employees, DMS Documents, DMS Upload Inbox, Users.**

Convert these list screens from "server component passes full array" to **TanStack Query with initialData from the server**:

- Server page still renders instantly with server-fetched data (no UX regression, RBAC unchanged).
- Client `useQuery` takes over with `staleTime` ~30-60s and `placeholderData: keepPreviousData` — returning to the tab renders cached rows instantly, then silently refetches.
- Mutations invalidate the query key — fresher than today's full-page model.
- This also future-proofs pagination/search server-side later.

### WS.5 — STRATEGIC: Cache Components + `<Activity>` route preservation — HIGH EFFORT, separate phase

The only mechanism that **truly keeps a tab's full React state alive** (form values incl. denylisted fields, scroll, expanded sections) is Next 16 `cacheComponents: true`, which renders inactive routes inside React `<Activity mode="hidden">` instead of unmounting.

- Preserves up to **3 routes** — combined with WS.3 drafts (for older tabs) this covers the real-world "flip between 2-3 tabs while filling a form" workflow completely.
- **Migration cost is real**: route segment configs (`force-dynamic` on 83 pages, `revalidate = 0` on 70) are replaced by the `use cache` model; behavior of dropdowns/dialogs on remount changes (they stay open — need `useLayoutEffect` cleanup per the migration guide); "New Record" forms must reset via `useRouter().bfcacheId` key or explicit reset.
- Recommendation: **schedule as its own phase (WORKSPACE.PERF.2) after WS.1-WS.3 prove insufficient or when upgrading anyway.** Do not bundle into this phase.

---

## 5. Suggested Execution Order

| Batch | Items | Effort | Risk | Solves |
|---|---|---|---|---|
| 1 | WS.1 (overflow UX) | 0.5 day | Low | Issue 2 completely |
| 2 | WS.2 (staleTimes + loading.tsx + prefetch) | 1-2 days | Low-Med | Issue 3 mostly, Issue 4 layer A |
| 3 | WS.3 (draft hardening) | 2-3 days | Med | Issue 1 for all practical cases |
| 4 | WS.4 (TanStack hot lists) | 2-3 days | Med | Issue 3+4 fully for hot screens |
| Later | WS.5 (Cache Components/Activity) | 1-2 weeks | High | Issues 1+3 natively — separate phase |

Each batch is independently shippable and UAT-able.

## 6. Decisions — RESOLVED (Sameer, 2026-08-03)

| # | Question | Decision |
|---|---|---|
| **D1** | MAX_TABS | **Restore to 10** (from 20). "All tabs" dropdown still built — it also serves users at the 10-tab limit. Standard doc updated to match during implementation. |
| **D2** | Router cache `dynamic` staleTime | **30 seconds.** |
| **D3** | Denylisted business fields (Emirates ID, IBAN, account numbers) | **Retain in memory only.** Two-tier denylist: credentials stay NEVER-drafted; business PII becomes MEMORY_ONLY (never localStorage/sessionStorage). |
| **D4** | WS.4 hot-list screens | **No specific list from Sameer** — default set applies (Parties, Employees, DMS Documents, DMS Upload Inbox, Users), and WS.4 remains optional pending WS.2 results. |

## 7. Security Constraints (unchanged)

- Drafts remain **in-memory only** — never localStorage/sessionStorage (UI.4E.2 rule).
- localStorage keeps tab **metadata** only (Rule 11).
- `staleTimes` caches RSC payloads in browser memory per-session — same trust boundary as the rendered DOM; no new exposure.
- RBAC checks unchanged — caching only affects *when* the server is re-asked, never *what* a user is allowed to see (revalidation still re-runs full auth).

## 8. References

- `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` (Activity, 3-route limit)
- `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md` (segment-config replacement, dropdown/dialog caveats)
- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` (`unstable_instant`, Suspense placement)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`
- GitHub: `vercel/next.js` issue #66039 (dynamic router cache disabled by default in v15)
- GitHub: `vercel/next.js` commit 56d9513 (`useRouter().bfcacheId` reset mechanism)
- Internal: `.cursor/rules/erp-workspace-tabs-standard.mdc`, `src/components/workspace/*`, `src/lib/workspace/*`, `src/hooks/use-workspace-form-draft.ts`
