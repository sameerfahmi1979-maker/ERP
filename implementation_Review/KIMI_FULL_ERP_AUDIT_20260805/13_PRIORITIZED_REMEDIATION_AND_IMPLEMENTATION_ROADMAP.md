# 13 — Prioritized Remediation and Implementation Roadmap

Audit date: 2026-08-05 · Dependency-aware; stabilization over rewrite (AGT's architecture is worth preserving).

## Level 0 — Immediate containment (this week)

### PKG-0.1 — RPC grant lockdown (SEC-002/003/004)
- Problem: anonymous EXECUTE on vault/numbering/duplicate-detection functions (live-proven).
- Scope: audit all 52 RPCs; REVOKE PUBLIC/anon; least-privilege GRANTs; delete audit's junk vault secret `x`; SQL grant-lint script.
- DB changes: 1 migration (revokes/grants only). No data change. Tests: anon negative-probe suite. Effort **XS–S** · Risk: low (verify app uses service/authed paths first).
- Acceptance: all anon probes fail closed; CI grant check green.

### PKG-0.2 — Type/build gate repair (TEST-001/002, DB-004)
- Scope: tsconfig excludes (`source HRMS`, `spikes`); regenerate `database.ts` UTF-8; fix 72 AGT errors; remove `ignoreBuildErrors`; minimal CI (install→typecheck→lint-scoped→vitest→build) (OPS-001); eslint flat-config ignores (TEST-003).
- Effort **S** · Unblocks everything else (safety net for all later packages).

### PKG-0.3 — Small security hygiene
SEC-005 `server-only` guard + lint rule · SEC-007 remove email console logs · SEC-001 unify middleware/layout gate · SEC-006 gate dev pages · PERF-002 wrap `getAuthContext` in React `cache()`. Effort **S**.

## Level 1 — P0 stabilization (before any production use)

### PKG-1.1 — Transactional HR state transitions (HR-002 class)
- DB: `approve/reject/cancel_leave_request` + overtime equivalents as transactional, idempotent DB functions (conditional UPDATE, balance upsert, audit in-tx). Server actions become thin callers. Migration + backfill: reconcile existing `used_days` vs approved requests (1 leave row live — trivial now, script for later).
- Tests: concurrency/idempotency integration tests. Effort **M**.

### PKG-1.2 — Schema reconciliation (DB-001/002/003)
- Quarantine/drop EV-charging tables (confirm no other project uses this Supabase DB); resolve `audit_log`/`shifts`/`notifications` duplicates; reconcile 8 missing migration tables; document manual objects in migrations. Effort **S–M**.

### PKG-1.3 — Report fetcher completion (HR-001)
4 fetchers (bank salary transfer, embassy letter, handover form, leave confirmation) on existing runner + letter framework. Effort **M**.

### PKG-1.4 — Test safety net v1 (TEST-005, UI-005 partial)
RBAC deny-by-default tests for top 20 actions; RLS anon/auth isolation probes automated; a11y smoke (axe) on 10 core screens. Effort **M**.

## Level 2 — P1 completion of advertised workflows

### PKG-2.1 — Leave ledger + accrual (LI-GAP-005/006; mockup 03B)
Append-only `hr_leave_ledger_entries` (replaces read-modify-write), monthly accrual Edge Function/cron, year snapshots, reconcile screen. **UAE leave rules: legal confirmation required.** Effort **L**.

### PKG-2.2 — Payroll engine v1 (LI-GAP-001/002/008; mockups 01/04A)
Periods → calculate (profiles+components+attendance+leave+OT) → variance → freeze (locks time edits) → approve → complete → payslip snapshots (official-documents) + pay register XLSX + **WPS SIF** (format/vendor confirmation required). Rollback with reason. Effort **XL** (split 2.2a engine, 2.2b outputs, 2.2c WPS).

### PKG-2.3 — Biometric attendance v1 (LI-GAP-003/004/009; mockups 02/03A)
ADMS collector (or vendor API), idempotent punch ingestion (replay-safe), exception queue, roster planner + auto-fill, multi/confused-shift detection. Effort **XL** (split collector/queue/roster).

### PKG-2.4 — Loans & advances (LI-GAP-007; mockup 04B)
Loan lifecycle + EMI schedules + payroll deduction hook + EOS settlement link. Effort **L**.

### PKG-2.5 — HR movement workflows (LI-GAP-010)
Promotion/transfer/increment cases; employee update requests with history; resignation→EOS timeline (extends existing EOS). Effort **L**.

## Level 3 — P2 operational efficiency
- ESS/manager self-service inbox (leave/OD/loan requests) · asset/PPE custody lifecycle UI · duplicate-route cleanup (UI-001/002/003) · observability: error monitoring + health endpoint (OBS-001/002) · AI prompt-injection framing + PII redaction policy (SEC-008/PRIV-001) · env example refresh (OPS-002) · Arabic UI locale planning (UI-006) · i18n of remaining English-only surfaces.

## Level 4 — P3 advanced
- Second-salary/dual-contract (redesign, LI-GAP row 9) · CCL/short-permission variants · advanced AI (compliance/risk expansion) · ERP-GAP-001 module decisions (Sales/Purchasing/Inventory/Finance — separate program, not this codebase's next step) · pay-register analytics.

## Dependency graph (critical path)
PKG-0.1 → PKG-0.2 (gates) → PKG-1.1 → PKG-2.1 → PKG-2.2 (payroll needs ledger+time data) → PKG-2.3 (biometric feeds payroll accuracy) → PKG-2.4 (loans hook into payroll) → PKG-2.5. PKG-1.2/1.3/1.4 parallel after 0.2.
