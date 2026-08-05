# 12 — Findings Register

Audit date: 2026-08-05 · Machine registers: [`registers/findings.csv`](./registers/findings.csv) · [`registers/findings.json`](./registers/findings.json)
Totals: **1 Blocker · 1 Critical · 14 High · 17 Medium · 9 Low · 3 Informational** (45 findings; confidence Confirmed 43, Needs verification 2).

Top findings use the full master-prompt structure; the remainder are indexed in §2 with evidence pointers (same fields condensed — full expansion during remediation planning).

## 1. Full-detail findings

### SEC-002 — `erp_vault_create_secret` executable by anonymous callers
- Severity: **Critical** · Confidence: Confirmed (live)
- Domain: Security / secrets vault · Roles: unauthenticated internet users · Companies: all
- Exact source evidence: function exposed via PostgREST RPC (spec `evidence/phase6_openapi_spec.json`); migrations define `erp_vault_*` (supabase/migrations) without PUBLIC EXECUTE revocation found in repo SQL.
- Live database evidence: anon-key `POST /rest/v1/rpc/erp_vault_create_secret` → **HTTP 200**, UUID returned (doc 05 §3b). A junk secret (name `x`, value `y`) was created by this probe — **delete it during remediation**.
- Current behavior: anyone on the internet can insert secrets into the vault. Expected: only service role can write secrets.
- Business impact: vault poisoning, secret-name enumeration, potential downstream reads if consumers trust vault names. Security impact: direct.
- Reproduction: doc 05 §3b script with anon key.
- Root cause: Postgres default `EXECUTE TO PUBLIC` on CREATE FUNCTION; no REVOKE migration; no grant audit tooling.
- Recommended correction: `REVOKE EXECUTE ON FUNCTION public.erp_vault_create_secret FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;` — repeat for all 52 RPCs (grant audit migration); add CI check (OPS-001).
- Files/objects: migration new file; `src/lib/email/vault.ts` consumer re-test. Effort: **XS**.
- Acceptance criteria: anon probe returns 401/404/42501; service-role path still works; CI gate fails on future PUBLIC-executable functions in public schema.
- Required tests: RLS/grant negative test script (anon vs service) for every RPC.

### TEST-001 — `npm run typecheck` fails on HEAD
- Severity: **Blocker** · Confidence: Confirmed
- Domain: Build quality · Evidence: doc 09 §1.
- **Update 2026-08-05 16:40:** owner removed `source HRMS/` from the repo → errors now **72** (58 app + 14 spikes), down from 1,257. Remaining root causes: (a) `tsconfig.json` still missing `spikes` exclude; (b) stale UTF-16 generated types (DB-004); (c) users/permissions feature code referencing removed type exports.
- Current: type safety still broken; build hides it (`ignoreBuildErrors`, TEST-002). Expected: green typecheck gating every change.
- Correction: add `spikes` exclude; regenerate types UTF-8; fix/repoint 10 files importing dead type aliases; remove `ignoreBuildErrors`; wire into CI.
- Effort: **S** (reduced from original estimate — LI noise eliminated by folder removal). Acceptance: `npm run typecheck` = 0 errors; CI runs it on every push.

### SEC-003 — Anonymous numbering-sequence consumption
- Severity: High · Confidence: Confirmed (live probe reached business logic)
- Evidence: doc 05 §3b. Correction: revoke PUBLIC/anon/authenticated EXECUTE on `generate_next_reference_number`/`preview_next_reference_number`; grant to authenticated with `current_user_has_permission` guard inside function (or service-only via server actions). Effort: XS. Tests: anon + non-privileged-user negative tests.

### HR-002 — Leave approval balance update is non-transactional and silently lossy
- Severity: High · Confidence: Confirmed
- Evidence: `src/server/actions/hr/time.ts:958-1025` (doc 04). Current: status checked pre-update but not in UPDATE; balance read-modify-write; missing balance row → silent skip; audit logs approval regardless.
- Correction: single DB function `approve_leave_request(p_id, p_actor)` performing conditional status transition + upsert balance + audit in one transaction (idempotent on repeat call); reject/cancel mirror functions; migrate overtime to same pattern.
- Effort: **M**. Acceptance: concurrent double-approve → one succeeds; approval without balance row creates the row; audit/notification exactly once. Tests: concurrency + idempotency integration tests.

### SEC-001 — Middleware gate narrower than protected surface
- Severity: High · Confidence: Confirmed. Evidence: `middleware.ts:36-41` vs route universe (doc 03); layout backstop prevents current exposure. Correction: unify — either protect all of `(protected)` in middleware or delete middleware gate and rely on layout; add regression test listing protected prefixes. Effort: XS.

### SEC-005 — Pervasive service-role usage without import guard
- Severity: High · Confidence: Confirmed. Evidence: 152 `createAdminClient` files; `admin.ts:1-17` no `server-only`. Correction: `import "server-only"` in admin.ts; ESLint `no-restricted-imports` for client components; per-file justification pass reducing count. Effort: S.

### OPS-001 — No CI/CD
- Severity: High · Confidence: Confirmed (no workflows found). Correction: minimal pipeline: install → typecheck → lint (scoped) → vitest → build; plus SQL grant-lint (SEC-002 class). Effort: M.

### TEST-005 — No tests over the security/transaction layer
- Severity: High · Confidence: Confirmed. Evidence: 459 green tests are pure helpers; zero action/RBAC/RLS/API tests (doc 09 §3). Correction: test pyramid per doc 14 (deny-by-default RBAC tests, RLS isolation tests, action transaction tests). Effort: L (ongoing).

### DB-003/DB-004 — Migration drift + broken type codegen
- Severity: High · Confidence: Confirmed. Evidence: doc 05 §2. Correction: reconcile live↔migrations (drop/foreign-schema-move the 8 EV tables; document the rest); regenerate `database.ts` (UTF-8) via CLI; add drift check to CI. Effort: M.

### TEST-003 — Lint script broken
- Severity: High · Confidence: Confirmed (OOM; config evidence doc 09 §1). **Update:** after `source HRMS/` removal the OOM persists — remaining cause is `spikes/**`; `npx eslint . --ignore-pattern "spikes/**"` completes with 179 errors. Correction: flat-config `globalIgnores` for `spikes/**` (+ `ChatGPT/**`); fix 149 src errors (start with UTF-16 parse error + hooks violations). Effort: S.

## 2. Indexed findings (condensed — full expansion in remediation packages, doc 13)

| ID | Sev | Title (evidence) |
|---|---|---|
| SEC-004 | M | anon-executable duplicate-detection RPC (doc 05 §3b) |
| SEC-006 | L | dev/QA pages in prod build (doc 06) |
| SEC-007 | M | email payload console logging (`erp-send-email-dialog.tsx:251-298`) |
| SEC-008 | M | no prompt-injection framing (`prompt-builders.ts:65`) |
| PRIV-001 | M | raw PII to OpenAI; DPA/region unverified (doc 11 §3) |
| DB-001 | M | 18 unmigrated live objects; EV-charging schema residue (doc 05 §2a) |
| DB-002 | L | duplicate/shadow tables (doc 05 §2a) |
| RBAC-005 | L | registry/sidebar drift (doc 03 §B) |
| TEST-002 | H | build skips type validation (`next.config.ts:30-32`) |
| TEST-004 | L | encoding hygiene (UTF-16, mojibake, CR/LF mix) |
| HR-001 | M | 4 active reports without fetchers (doc 04) |
| HR-003 | Info | no payroll engine by design (doc 04) |
| HR-004 | M | no attendance capture path (doc 04) |
| ERP-GAP-001 | Info | no Sales/Purchasing/Inventory/Finance modules (doc 04) |
| UI-001 | M | duplicate customers routes (doc 07) |
| UI-002/003/004 | L | retired route / renewals overlap / mojibake (doc 07) |
| UI-005 | M | standards unenforced by tooling (doc 07) |
| UI-006 | Info | English-only UI (doc 07) |
| PERF-002 | M | auth-context query fan-out, no request cache (`check.ts:39-145`) |
| OPS-002 | L | env example drift (doc 10) |
| OPS-003/004 | L/Info | TLS-off in scripts; no rollback strategy (doc 10) |
| OBS-001/002 | M/L | no APM; no health endpoint (doc 10) |
| LI-GAP-001…010 | H×4, M×6 | payroll, payslips, biometric, attendance sync, accrual, register, loans, pay register, roster, HR movement workflows (doc 08 §3) |
