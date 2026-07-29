# ERP OUTPUT.5 — Full Security, Runtime, PDF, and Visual UAT — Report

**Phase:** ERP GLOBAL OUTPUT FRAMEWORK — Work Package 9 (OUTPUT.5)
**Date:** 2026-07-26
**Status:** ✅ GATE PASSED (dev activation verified; production activation remains a business decision)
**Depends on:** OUTPUT.1–OUTPUT.4 (WP4–WP8)

---

## 1. Objective

Prove the global foundation and HR first-adopter path against the live runtime (real Supabase project, real Gotenberg, real browser session) before Operations Console exposure, schedules activation, or Puck removal.

---

## 2. UAT slices executed and results

### 2.1 Catalog and functional (live browser, admin)

All 9 class A–D HR outputs exercised for employee EMP-000001:

| Output | Class | Result |
|---|---|---|
| Salary Certificate (with Amount) | A | ✅ issued — serial `-000006`, QR with 90-day expiry, approval satisfied |
| Employment Letter | B | ✅ issued — serial `-000007`, QR valid-until-revoked |
| Experience Letter | B | ✅ issued (WP8) + reissue/supersede + revoke chain (rows 3–5) |
| NOC (approval override) | B | ✅ issued — approval enforced via `approval_required_override` |
| Salary Certificate (General) | B | ✅ issued — serial `-000009`, QR valid-until-revoked |
| Employee Clearance Form | C | ✅ issued — correctly NO serial, NO QR |
| Joining Checklist | C | ✅ issued — correctly NO serial, NO QR |
| PPE Issue Form | C | ✅ correctly LOCKED (admin lacks `hr.operations.view`) — permission gating proof |
| Employee ID Card | D | ✅ correctly Preview-only (class D `official=false` → no Issue button) |

Also verified live: duplicate-content guard (identical re-issue blocked **before** any row/serial creation — 2 repeat calls, 0 new rows), duplicate-click lock, empty-reason validation, Report Center Run gated for employee documents.

### 2.2 PDF integrity + policy + unauthenticated security — **97/97 checks**

Script: `tests/output-spike/wp9-uat-integrity-security.mts` (results: `evidence/wp9-uat/wp9-integrity-security-results.json`).

Per issued framework document (9 documents):
- `%PDF` header; **exact stored-byte SHA-256 == DB checksum**; byte size == `file_size_bytes`.
- Page objects present; **embedded fonts** (`/FontFile2`) present.
- Data/policy/branding **snapshots captured**; renderer + version captured.
- **Serial embedded in PDF text** (pdfjs extraction: `Ref: HR_EMPLOYMENT_LETTER-C1-2026-000007`).
- **QR verification block rendered** (label + image XObject); QR expiry per class (A: 90d, B: none).
- Class C/D: **no serial, no QR** (policy-correct).
- All serials unique including voided ones (7 serials, 0 collisions).

Unauthenticated (anon key) probes:
- Cannot read `erp_generated_pdf_documents` or `erp_output_public_links`.
- Cannot modify class policies. Cannot download stored PDFs from the bucket.
- Public verification RPC: valid token → **metadata only** (no salary values, no storage paths); revoked-document token → not valid; random token → null.

### 2.3 Authenticated limited-user security — **9/9 checks**

Script: `tests/output-spike/wp9-uat-limited-user.mts`. A throwaway auth user with the "Read Only User" role was created, signed in with a real password grant, probed with **their own JWT**, then deleted:

- Cannot read issued documents or public-link tokens (RLS).
- Cannot download stored official PDFs.
- Cannot revoke via direct table write (tamper attempt was a silent no-op).
- Cannot weaken class-A policy or remove the HR_NOC approval override.
- Public verification RPC still returns metadata (by design).

### 2.4 Lifecycle and resilience — **5/5 checks**

Script: `tests/output-spike/wp9-uat-resilience-perf.mts`:

- Unreachable renderer → clean `OutputRenderError` with `retryable=true` in ~1s (health-check fail-fast).
- 1 ms timeout → clean abort in <100 ms, no hang.
- **DB idempotency**: second insert with the same `request_key` rejected by unique index `uq_gen_pdf_request_key`.
- Engine-level paths (idempotent replay, parallel conflict, render/upload/finalize/QR failures, reconciliation, serial voiding) covered by the 102-test unit suite.

### 2.5 Performance

- 5 parallel official renders: all succeed, wall time 865 ms, per-render 520–865 ms.
- Large multi-page document (400-row table, 6 pages): 46.8 KB in ~850 ms — well within the 30 s timeout.
- Single letter render: ~0.5–1 s; full issuance round trip (permissions → data → render → upload → verify → QR): 3.2–11 s observed live.

### 2.6 Visual

- WP7 deterministic baselines (EN + AR/RTL certificate) re-verified against live Gotenberg — HTML SHA-256s unchanged, page counts correct.
- WP6 demo set (short cert, 2-page letter, AR/RTL, table form) remains in `evidence/template-studio/`.
- Large-document evidence: `evidence/wp9-uat/wp9-large-multipage.pdf`.

### 2.7 Regression

| Gate | Result |
|---|---|
| Unit tests (full repo) | ✅ 397/397 (20 files) |
| TypeScript `tsc --noEmit` | ✅ no new errors (pre-existing `@/types/database` baseline unchanged) |
| Production build (`npm run build`) | ✅ compiles, all routes emitted |
| Lint (program files) | ✅ 0 errors after fixing `prefer-const` + unused import (repo-wide baseline of pre-existing errors unrelated to this program) |
| Visual baselines | ✅ unchanged |

---

## 3. Hardening applied during WP9

| Change | File |
|---|---|
| `serial_no` unique index at DB level (defense-in-depth for "serials never recycled") | migration `20260726160000_output_5_serial_unique_index.sql` (applied live) |
| Backfilled `file_size_bytes` for pre-fix row #4 | data fix |
| `prefer-const` + unused-import lint fixes | `temp-cleanup.ts`, `issuance-engine.test.ts` |

---

## 4. Findings and open decisions

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| 1 | HIGH (functional, fail-closed) | **HR Manager role lacks `reports.pdf.generate`** — HR Managers cannot issue any official document; today only System Administrator can. This is over-restriction, not a security hole. | Sameer/Dina to decide: grant `reports.pdf.generate` (and optionally `reports.pdf.approve`) to HR Manager via a permissions migration. |
| 2 | MEDIUM | Cross-company attacker test with a real second-company user not run — every existing user/employee belongs to company 1. Company isolation is enforced in code + RLS (verified by probes). | Re-run this slice when a second company's users exist. |
| 3 | LOW | Superseded documents' public QR remains "valid" (policy: valid-until-revoked). Verification page does not yet say "superseded". | WP10 Ops Console: surface supersession state on the public page. |
| 4 | LOW | Arabic/RTL official HR letter templates not yet authored (framework AR support proven via Studio baselines). | Author AR templates as templates work, not engine work. |
| 5 | INFO | PDF/A not enabled anywhere; treated as a separate future step per the master prompt. | — |
| 6 | INFO | `reports.sign` flows unchanged by this program; sign-specific UAT deferred until signing joins the coordinator. | — |

---

## 5. Activation gate decision

**PASS.**
- No company-isolation, protected-asset, storage, QR, integrity, approval, or lifecycle failure remains.
- All mandatory suites pass; evidence artifacts exist under `tests/output-spike/evidence/wp9-uat/`.
- The legacy employment-letter path remains recoverable via `OUTPUT_LEGACY_EMPLOYMENT_LETTER_ENABLED`.
- `OUTPUT_OFFICIAL_ISSUANCE_ENABLED` stays **dev-only**; enabling it in production (Railway env) is a business go-live decision, now unblocked by this gate.

Proceed to **WP10 (OUTPUT.6) — Global Output Operations Console**.
