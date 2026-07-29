# ERP OUTPUT.6 — Global Output Operations Console Implementation Report

**Phase:** WP10 / OUTPUT.6 of the ERP Global Output Framework (12 work packages)
**Date:** 2026-07-26
**Status:** ✅ COMPLETE (runtime-verified against live Supabase + Gotenberg + browser)

---

## 1. Objective

Build a module-agnostic, secure administrator workspace for operating the Global
Output Framework: all-module issuance history, lifecycle visibility with stage
timings, permissioned retry/cancel/revoke with immutable audit events,
reconciliation queues, QR link state visibility, snapshot/renderer provenance,
and renderer health + operational metrics.

---

## 2. What Was Built

### 2.1 Permissions (migration `20260726170000_output_6_ops_console_grants.sql`)

- `outputs.ops.view`, `outputs.ops.retry`, `outputs.ops.revoke` (defined in
  OUTPUT.1) are now **granted to the System Administrator role**.
- Grant is idempotent (`NOT EXISTS` guard); `role_permissions.id` is left to the
  identity default.
- Separation of duties: `outputs.ops.*` grants operational **metadata** access
  only. Document **content** (downloads, data snapshots) remains behind
  document-level report permissions.

### 2.2 Server actions — `src/server/actions/output/ops-console.ts`

| Action | Permission | Behavior |
|---|---|---|
| `listOpsIssuances` | `outputs.ops.view` | Paginated (max 100/page), server-side filters: lifecycle state, document class, output code, company, renderer, generated-by, date range, and text search over serial/file/output code. Single batched QR-status lookup (no N+1). Returns total count + caller's retry/revoke capability flags. |
| `getOpsIssuanceDetail` | `outputs.ops.view` | Full operational metadata: lifecycle timestamps + derived stage durations (queue → render → finalize, clamped ≥ 0 against clock skew), serial + void reason, checksum/size/pages, renderer + version + Chromium version, template id/version, request key, supersession chain, revocation, all public QR links, policy + branding snapshots. **Data snapshot is returned only with `reports.view`/`reports.manage`**; a `data_snapshot_hidden` flag distinguishes "withheld" from "never captured (legacy)". |
| `retryOpsIssuance` | `outputs.ops.retry` | Guard: retryable states only, framework rows only (`output_code` required), company scope. Close-out = atomic conditional transition to `cancelled` (serial voided, never recycled) → fresh coordinator run with a new `clientRequestToken`. Concurrent double-retry fails cleanly on the conditional update. Both steps write audit events. |
| `cancelOpsIssuance` | `outputs.ops.retry` | Non-terminal rows only; atomic conditional transition; serial voided when present; audit event. |
| `getOpsMetrics` | `outputs.ops.view` | Lifecycle state counts, issued/failed volumes (24h), average render duration (24h), live Gotenberg health probe, stuck in-flight rows (> 15 min), reconciliation-required queue, voided serial count. Company-scoped for non-global operators. |

Company scoping: non-`system_admin`/`group_admin` operators are restricted to
companies from their active `user_roles` rows (via `user_profile_id`, the
correct column per the WP9 bug fix).

### 2.3 UI — `/admin/reports/output-ops`

- `src/app/(protected)/admin/reports/output-ops/page.tsx` — server-gated on
  `outputs.ops.view`; renders a "Not Enabled" card when
  `OUTPUT_OPS_CONSOLE_ENABLED` is off (schedules-style pattern).
- `src/features/output-ops/output-ops-console.tsx` — the console:
  - **Metrics strip:** renderer health, issued/failed 24h, avg render, stuck
    in-flight count, voided serials; clickable state-count chips that drive the
    lifecycle filter; a reconciliation-required banner when applicable.
  - **Filters:** lifecycle state, document class, text search (serial / file /
    output code) — all server-side, with pagination (25/page).
  - **History table:** output + source record + company, class, state chip
    (incl. revoked/superseded overrides), serial + voided marker, QR status,
    generated time, total duration, and permission-gated row actions.
  - **Detail dialog** (`ERPChildDialogForm`, view mode): lifecycle timings,
    identity & integrity block, QR links, policy/branding/data snapshots.
  - **Action dialogs** (retry / cancel / revoke): mandatory reason (client
    min-5 check + server zod validation); dialog stays open on failure so the
    reason is not lost. Revoke reuses the WP8 `revokeIssuance` action.
- Registered in: sidebar (Reports → Output Operations, `outputs.ops.view`),
  `route-access-registry`, `workspace-route-registry` (singleton tab).

---

## 3. Defects Found and Fixed During Build/UAT

| # | Defect | Fix |
|---|---|---|
| 1 | Search sanitizer stripped `_`, so searching `HR_NOC` matched nothing (output codes/serials are underscore-heavy) | Strip only `%` and PostgREST `or()` delimiters; keep `_` |
| 2 | Legacy rows with no captured data snapshot showed the misleading "Hidden — requires permissions" message | Added `data_snapshot_hidden` flag; UI now shows "No data snapshot captured (legacy issuance)" |
| 3 | "Queue → render" stage showed −603 ms (DB `generated_at` default vs app-side stamp clock skew) | Stage durations clamped at 0 |
| 4 | Action dialog closed even when the server rejected the action (losing the typed reason) | Dialog now closes only on success; client-side min-length pre-check added |
| 5 | Migration attempted to insert `role_permissions.id` (identity column) | Column removed from INSERT |

---

## 4. Runtime UAT Evidence (live browser, admin session)

| Check | Result |
|---|---|
| Sidebar entry + route + workspace tab render, permission-gated | ✅ |
| Metrics: renderer Healthy, issued 24h = 8, failed = 0, avg render 735 ms | ✅ |
| State chips (issued/pending/cancelled) act as filters | ✅ |
| Lifecycle state + class filters, server-side pagination | ✅ |
| Search `HR_NOC` returns issuance #8 with serial + valid QR + 1.7 s duration (after fix #1) | ✅ |
| Detail #8: stage timings, serial `HR_NOC-C1-2026-000008 (issued)`, checksum, renderer `gotenberg_html gotenberg@dev`, template v1, request key, QR link (valid, views 0), policy + branding snapshots | ✅ |
| Detail #2 (legacy): renders cleanly, "No data snapshot captured (legacy issuance)" | ✅ |
| Cancel with empty reason → rejected, dialog stays open | ✅ |
| Cancel stuck legacy `pending` row #18 with reason → `cancelled`, audit event `output_ops_cancelled` `{from: pending, to: cancelled, reason: …}` | ✅ (DB-verified) |
| Retry synthetic `failed_retryable` row #19 → close-out audit event `output_ops_retry_closeout`, coordinator re-run returned `duplicate_content_warning` (valid identical HR_NOC #8 exists — correctly refused to double-issue), audit event `output_ops_retry` | ✅ (DB-verified) |

Synthetic row #19 remains in history as a `cancelled` row with an explicit
"WP10 UAT" reason — intentional, self-documenting evidence.

## 5. Regression

- `npx tsc --noEmit`: no new errors (only the known pre-existing
  `@/types/database` set).
- ESLint on all new/changed files: clean.
- Vitest: **397/397 passing**.

## 6. Scope Notes

- **Schedules/delivery visibility:** the schedules UI remains hidden behind
  `OUTPUT_SCHEDULES_UI_ENABLED` (OUTPUT.1). No early activation; delivery
  history surfaces arrive with the WP11 worker.
- **Download/print/email history:** downloads go exclusively through
  `getIssuanceDownloadUrl` (document-level permissions); the console
  deliberately exposes no signed URLs.
- **Feature flag:** `OUTPUT_OPS_CONSOLE_ENABLED` (default on in dev; set
  explicitly in production).

## 7. Files Changed

- `supabase/migrations/20260726170000_output_6_ops_console_grants.sql` (new, applied)
- `src/server/actions/output/ops-console.ts` (new)
- `src/app/(protected)/admin/reports/output-ops/page.tsx` (new)
- `src/features/output-ops/output-ops-console.tsx` (new)
- `src/lib/rbac/route-access-registry.ts` (route entry)
- `src/lib/workspace/workspace-route-registry.ts` (tab entry)
- `src/components/layout/app-sidebar.tsx` (nav entry + `Activity` icon import)

## 8. Next Phase

**WP11 / OUTPUT.7** — schedules worker + safe UI reactivation.
