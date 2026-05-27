# ERP_BASE_001A — Build & Lint Report

**Date:** 2026-05-27

---

## ESLint fix (Fix 5)

### Issue

`src/hooks/use-mobile.ts` — `react-hooks/set-state-in-effect` (synchronous `setState` inside `useEffect`).

### Fix

Replaced `useState` + `useEffect` with `useSyncExternalStore` + `matchMedia` subscription (no setState in effect body).

### Result (original workspace)

```
0 errors, 1 warning
```

Remaining warning: TanStack Table `useReactTable` incompatible-library notice in `data-table.tsx` (informational, not blocking).

---

## Production build (Fix 5)

### Original path issue

Path `...\AI & Apps\27_05_2026_SaaS` breaks npm `.bin` shims and caused Next.js prerender `workStore` invariant errors.

### Validation path used

```text
C:\dev\agt-erp
```

### Commands and results

```bash
npm install   # success
npm run lint  # 0 errors, 1 warning
npm run typecheck  # PASS
npm run build # PASS
```

Build output: all app routes generated as dynamic (`ƒ`).

---

## Recommendation

For day-to-day development, work from a path **without `&`** characters, e.g. clone/sync to `C:\dev\agt-erp`, or rename the OneDrive folder segment.

From original path, use:

```bash
node node_modules/next/dist/bin/next dev
```

---

## Summary

| Check | Status |
|-------|--------|
| TypeScript | **PASS** |
| ESLint errors | **PASS** (0 errors) |
| Production build | **PASS** (from `C:\dev\agt-erp`) |
| Migration pushed | **NO** |
