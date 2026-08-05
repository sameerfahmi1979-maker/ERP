# 00 — Master Executive Audit: AGT ERP + LI HRMS + Live Supabase

Audit date: 2026-08-05 · Scope: `C:\dev\agt-erp` (HEAD `262a9dcd`), `source HRMS\li-hrms-main`, live project `mmiefuieduzdiiwnqpie` · Conducted read-only (one disclosed exception: SEC-002 probe created a junk vault secret — delete during PKG-0.1).

## Decision-ready overview

**AGT ERP is a well-architected HR+DMS platform whose engineering process has collapsed.** The design (RBAC+RLS, DMS AI pipeline, official documents, report center, notifications) is genuinely enterprise-grade and, in several areas, better than the reference system. But the basics that make software shippable are red: typecheck fails (1,257 errors), the linter crashes, the build hides type errors, there is no CI, the generated DB types are stale, and a Critical live finding lets anonymous callers write to the secrets vault. Meanwhile the product is an **HRMS + DMS + master-data + reports system — not yet an ERP**: sales, purchasing, inventory, finance and payroll execution do not exist; the sidebar shows them as disabled placeholders.

**Verdict:** stabilize first (Level 0/1 packages are days-to-weeks), then build payroll/attendance/leave-ledger on top of AGT's strong foundations using LI HRMS as a *requirements source* — never as code to port (Mongo/Express/India-specific). Do not rewrite.

## Key numbers

| Metric | Value |
|---|---|
| Files inventoried | 4,453 (AGT 3,299 / LI 1,154) — ledger `01_REPOSITORY_AND_FILE_REVIEW_LEDGER.csv` |
| App routes | 213 pages + 9 API routes; ~95 menu destinations; matrix `registers/route_screen_matrix.csv` |
| Live DB | 275 tables/views, 52 RPCs, 4 private buckets, 939 RLS policies (migrations) |
| Typecheck | ❌ 72 errors (58 app + 14 spikes; **updated** after owner removed `source HRMS/` — was 1,257) · Lint ❌ OOM on spikes (179 with spikes ignored) · Unit ✅ 459/459 · Build ⚠️ passes w/ types skipped |
| Findings | **1 Blocker · 1 Critical · 14 High · 17 Medium · 9 Low · 3 Info** (`registers/findings.csv/json`) |
| LI comparison | 34 capabilities classified (`registers/li_to_agt_feature_matrix.csv`) |

## Top 10 confirmed findings

1. **SEC-002 (Critical)** — anonymous callers can execute `erp_vault_create_secret` (live-proven).
2. **TEST-001 (Blocker)** — typecheck fails: 72 errors after `source HRMS/` removal (was 1,257; remaining = stale types + spikes).
3. **SEC-003 (High)** — anonymous numbering-sequence consumption (`generate_next_reference_number`).
4. **HR-002 (High)** — leave approval mutates balances non-transactionally; silent data loss paths.
5. **SEC-005 (High)** — service-role client in 152 files, no `server-only` guard.
6. **DB-003/DB-004 (High)** — migration/live drift (18 unmigrated objects incl. a foreign EV-charging schema) + stale UTF-16 generated types.
7. **OPS-001 (High)** — no CI/CD; nothing gates regressions.
8. **TEST-002 (High)** — build skips type validation (`ignoreBuildErrors`).
9. **TEST-003 (High)** — lint script OOMs; flat config lints LI HRMS + spikes.
10. **SEC-001 (High)** — middleware gate narrower than protected surface (layout backstop saves it today).

## Ten largest LI capabilities missing from AGT
Payroll batch engine · payslips (snapshots+view) · biometric ADMS integration · attendance sync/replay · leave accrual crons · leave register/snapshots · loans & EMI · pay register/paysheet export · roster planner + multi/confused-shift detection · HR movement workflows (promotion/transfer/update-requests). Details: doc 08 + mockups 01–04.

## Where AGT is already stronger (preserve)
RBAC/RLS depth (282 permissions, scoped RPCs, live-verified anon deny) · DMS OCR→AI→human-review→apply pipeline · server-rendered verified official documents · DB-configured email with vault indirection + retry queue · UAE-first masters (MOHRE, Emirates ID, WPS profiles, Arabic AI extraction) · redaction/sensitivity profiles in reporting.

## Recommended first package
**PKG-0.1 RPC grant lockdown** (XS–S, same-day) followed immediately by **PKG-0.2 type/build gate repair** (S) — together they remove the Critical exposure and restore the safety net every later package depends on (doc 13).

## Blockers / evidence not safely obtainable
No runtime session on live tenant (login touches production) — runtime statuses are source-derived · no SQL catalog access (no DB password) — policies reviewed from migrations + live behavior probes · npm audit not run · Playwright e2e not executed (needs isolated DB) — all logged in doc 14 §5.

## Deliverables index
[01 File ledger](./01_REPOSITORY_AND_FILE_REVIEW_LEDGER.csv) · [02 Architecture](./02_ARCHITECTURE_AND_DATA_FLOW.md) · [03 Route matrix](./03_ROUTE_MENU_SCREEN_COMPONENT_MATRIX.md) · [04 Modules](./04_MODULE_BY_MODULE_FUNCTIONAL_AUDIT.md) · [05 Database](./05_LIVE_SUPABASE_DATABASE_AUDIT.md) · [06 Security](./06_RBAC_RLS_SECURITY_AND_PRIVACY_AUDIT.md) · [07 UI/UX](./07_UI_UX_ACCESSIBILITY_AND_MOCKUP_AUDIT.md) · [08 LI gap](./08_LI_HRMS_DEEP_REVIEW_AND_AGT_GAP_MATRIX.md) · [09 Build/test](./09_CODE_QUALITY_TEST_BUILD_AND_RUNTIME_AUDIT.md) · [10 Perf/ops](./10_PERFORMANCE_SCALABILITY_JOBS_AND_OBSERVABILITY.md) · [11 Reports/DMS/AI](./11_REPORTS_DMS_AI_AND_EXTERNAL_INTEGRATIONS_AUDIT.md) · [12 Findings](./12_FINDINGS_REGISTER.md) · [13 Roadmap](./13_PRIORITIZED_REMEDIATION_AND_IMPLEMENTATION_ROADMAP.md) · [14 Acceptance](./14_ACCEPTANCE_TEST_AND_RELEASE_READINESS_PLAN.md) · [mockups/](./mockups/) · [evidence/](./evidence/) · [registers/](./registers/)
