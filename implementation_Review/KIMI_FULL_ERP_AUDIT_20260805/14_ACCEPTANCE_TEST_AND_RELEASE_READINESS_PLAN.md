# 14 — Acceptance Test and Release Readiness Plan

Audit date: 2026-08-05 · Purpose: the gate every future release must pass (fills today's vacuum: no CI, red typecheck, zero guard tests).

## 1. Release gate (CI, blocking)

| Gate | Command/check | Current status |
|---|---|---|
| Typecheck | `npm run typecheck` → 0 errors | ❌ 1,257 (TEST-001) |
| Lint | `eslint src supabase` → 0 errors | ❌ OOM / 149 (TEST-003) |
| Unit | `npm test` → green | ✅ 459/459 |
| Build | `npm run build` with type validation ON | ⚠️ passes only because validation skipped (TEST-002) |
| SQL grants lint | no PUBLIC/anon EXECUTE on public-schema functions; RLS enabled on new tables | ❌ absent (SEC-002) |
| Migration drift | live ↔ migrations diff empty (except documented) | ❌ 18/8 drift (DB-001/003) |
| Type drift | regenerated `database.ts` diff empty | ❌ stale (DB-004) |
| Secrets scan | no secrets in repo/logs | ✅ (this audit found none in tracked files) |
| Dependency audit | `npm audit` policy gate | ❌ never run |

## 2. Test pyramid to build (per module, in roadmap order)

1. **RBAC deny-by-default**: for every server action — unauthenticated, wrong-permission, inactive-account, cross-company target → all rejected. (Today: 0 such tests.)
2. **RLS isolation**: seeded two-company fixture; anon/authenticated probes per sensitive table (extend doc 05 §3a method, automated).
3. **Transaction/idempotency**: concurrent approve twice, retry after failure, duplicate punch ingestion, double payroll calculation → exactly-once effects (PKG-1.1, 2.1–2.4).
4. **Workflow e2e (Playwright, isolated test DB — never live)**: login → employee create → leave request → approve → balance ledger → payroll run → payslip verify (QR) → EOS.
5. **A11y/responsive**: axe smoke on 10 core screens; 360px/768px/1440px snapshots; keyboard-only pass on forms/drawers (per UI standards).
6. **Security regression**: RPC anon-probe suite; `/api/*` auth matrix; upload MIME spoofing; CSV formula-injection check on exports; print-token expiry.
7. **Data-quality monitors** (post-release): orphan FKs, duplicate parties/employees, stuck queues (email/AI jobs), approved-without-approver — as scheduled audit queries.

## 3. Environment requirements
- **Isolated test Supabase project** (never run mutating tests on `mmiefuieduzdiiwnqpie`); seeded fixtures; Playwright against local dev server.
- Screenshot capture with masked/synthetic data only (this audit captured none — live tenant has real users).
- Restore-drill evidence for Supabase backups (PITR tier confirmation) before go-live.

## 4. Release-readiness checklist (from master prompt §D, adapted)
- [ ] Typecheck/lint/test/build gates green in CI
- [ ] RPC grants locked + negative probes automated
- [ ] HR approvals transactional (PKG-1.1)
- [ ] Schema/type drift zero
- [ ] 4 report stubs implemented or deactivated
- [ ] Dev pages gated; console PII logs removed
- [ ] Error monitoring + health endpoint live
- [ ] Backup/restore drill documented
- [ ] UAE payroll/leave legal sign-off (before PKG-2.1/2.2)
- [ ] WPS SIF format validated with bank/provider (before PKG-2.2c)

## 5. Audit limitations carried into acceptance (honesty ledger)
- No runtime session against live tenant (login would touch production audit trails) → all runtime statuses source-derived; first staging session should re-validate: sidebar filtering, guard redirects, realtime sync, DMS upload→review→apply happy path, print/verify flow.
- SQL catalog access unavailable (no DB password) → policy-expression review done from migrations only; run `implementation_Review/sql_review/` pack with read-only SQL access.
- npm audit and bundle analysis deferred (network/time).
