# ERP OUTPUT.4 — HR First-Adopter UX and Full HR Output Onboarding — Implementation Report

**Phase:** ERP GLOBAL OUTPUT FRAMEWORK — Work Package 8 (OUTPUT.4)
**Date:** 2026-07-26
**Status:** ✅ COMPLETE (runtime-verified end to end)
**Depends on:** OUTPUT.1 (WP4), OUTPUT.2 (WP5), OUTPUT.3A/3B (WP6/WP7)

---

## 1. Objective

Make HR the first complete consumer of the Global Output Framework:

1. Reconcile the **full HR catalog** (all registry rows, not only visible cards).
2. Build one clear **Letters & Forms** area inside the Employee Workspace.
3. Route all official issuance through the global coordinator (`generateOfficialDocument`).
4. Remove routine employee-letter generation from the Report Center.
5. Watermark all Quick Print / draft outputs.
6. Add permissioned download / revoke / reissue with full history.
7. Reserve, finalize, and void official serial numbers (never recycled).

---

## 2. Catalog reconciliation (gate requirement)

Live registry query (`erp_report_registry`, `module_code = 'HR'`): **27 rows, zero unclassified.**

| Class | Count | Outputs | Home |
|---|---|---|---|
| A (official + serial + approval) | 1 | `HR_SALARY_CERT_WITH_AMOUNT` | Letters & Forms |
| B (official + serial) | 4 | `HR_EMPLOYMENT_LETTER`, `HR_EXPERIENCE_LETTER`, `HR_NOC` (approval override), `HR_SALARY_CERT_GENERAL` | Letters & Forms |
| C (internal form/checklist) | 3 | `HR_CLEARANCE_FORM`, `HR_JOINING_CHECKLIST`, `HR_PPE_ISSUE_FORM` | Letters & Forms |
| D (card/badge) | 1 | `HR_EMPLOYEE_ID_CARD` | Letters & Forms |
| E (analytical report) | 18 | Employee List, Attendance Summary, WPS Readiness, etc. | Report Center (unchanged) |

- Employment Letter and Experience Letter remain **separate** registry rows, fetchers, and allowlists.
- All 9 class A–D outputs have typed fetchers registered in `src/lib/report-center/report-fetchers.ts`.
- The 5 letter-type outputs (A/B) have per-output variable allowlists in `src/lib/output/variable-allowlist.ts`; C/D outputs use structured fetch models with no `{{tokens}}` — the universal zero-unresolved-tokens gate still applies to their final HTML.
- Future HR document types onboard via registry row + fetcher + allowlist + class policy only; no engine change required.

---

## 3. What was built

### 3.1 Employee "Letters & Forms" area

**New:** `src/features/hr/employees/employee-letters-forms.tsx`
Wired into `employee-workspace-form.tsx` (replaces `HrLetterGenerator`, which was deleted).

- Registry-driven catalog grouped into **Official Letters & Certificates / Internal Forms & Checklists / Cards & Badges** (grouping logic in `src/lib/output/issuance-status.ts` — pure, unit-tested).
- Per-card badges: document class, QR policy, approval-required, sensitivity (`hr.payroll.view` lock on salary-with-amount).
- Permission-gated: outputs the user cannot generate render locked with an explanation, no dead buttons.
- Search filter across the catalog.
- **Preview** opens the existing `LetterPreviewDialog` (watermarked draft path).
- **Issue Official** calls `generateOfficialDocument` with a fresh `clientRequestToken`, handles all four outcomes (issued / duplicate-content warning / approval-required / error) with distinct toasts.
- **Issued Documents history**: serial, status chip (Issued / Superseded / Revoked / Cancelled / Failed / Processing), issue date, and permissioned Download / Reissue / Revoke actions with mandatory reason dialogs (`ERPChildDialogForm`).
- No raw technical IDs in the UI — serials and human labels only.

### 3.2 Issuance operations server actions

**New:** `src/server/actions/output/issuance-history.ts`

- `listRecordIssuances` — history for a record + `canRevoke` / `canReissue` capability flags.
- `getIssuanceDownloadUrl` — signed URL; refuses revoked/superseded/non-issued rows.
- `revokeIssuance` — requires `outputs.ops.revoke` or `reports.pdf.approve`; sets `revoked_at` + `revoke_reason`, cancels active public links.
- `reissueOfficialDocument` — requires reason (min 5 chars); re-runs the coordinator with `authorizeReissue`, links `supersedes_issuance_id`, marks the old row `superseded_by_id`.

**New:** `src/server/actions/output/output-catalog.ts` — `listEmployeeOutputCatalog()` returns the class A–D catalog with per-user `canGenerate` resolution.

### 3.3 Official serial numbers

- `IssuancePorts.reserveSerial` added to `src/lib/output/issuance-engine.ts`; serial is reserved **before rendering**, finalized `issued` on success, **voided (never recycled)** on any failure path (`serial_void_reason` recorded).
- Format: `{OUTPUT_CODE}-C{companyId}-{year}-{issuanceId 6-digit}` — deterministic, unique, gap-tolerant.
- Serial is embedded in the rendered document footer (`documentRef`).

### 3.4 Draft watermarking + Report Center boundary

- `src/lib/output/draft-watermark.ts` — injects a fixed **"DRAFT — NOT OFFICIALLY ISSUED"** overlay; applied to Quick Print and Save-Draft-PDF paths in `letter-preview-dialog.tsx`. Legacy QR-issuance UI removed from the preview dialog.
- `report-registry-table.tsx` — Run action for `letter/certificate/form/checklist/badge` categories replaced by an **Employee Profile** link; Report Center now only runs analytical reports (Class E).

### 3.5 Database migrations (applied to live)

| Migration | Purpose |
|---|---|
| `20260726140000_output_4_hr_onboarding_policy_overrides.sql` | `HR_NOC` → `approval_required_override = true` |
| `20260726150000_output_4_checksum_finalization.sql` | `prevent_checksum_update` trigger now allows one-time finalization from `NULL`/`'pending'` to the final SHA-256, then immutable |

---

## 4. Bugs found and fixed during WP8

| # | Bug | Fix |
|---|---|---|
| 1 | Permission code `reports.approve` checked but DB permission is `reports.pdf.approve` | Corrected in `generate-official-document.ts` and `issuance-history.ts` |
| 2 | `prevent_checksum_update` trigger blocked the `uploaded → issued` transition (checksum finalization) | Migration `20260726150000` — one-time finalization allowed |
| 3 | `file_size_bytes` never persisted (engine did not pass it on the `uploaded` transition) | Engine now records `buffer.byteLength` |
| 4 | Stale comment references to deleted `hr-letter-generator.tsx` | Updated |

---

## 5. Runtime UAT evidence (live dev, employee EMP-000001)

All flows executed in the browser against the running app + live Supabase + Gotenberg:

| Flow | Result | Evidence |
|---|---|---|
| Official issue (Experience Letter) | ✅ issued, PDF stored, SHA-256 exact-byte verified | row id 4, serial `HR_EXPERIENCE_LETTER-C1-2026-000004` |
| QR activation-last | ✅ link `pending_activation` → `active` only after `issued` | public verify page renders |
| Serial voiding on failure | ✅ failed row's serial `voided`, never reused | row id 3 (`cancelled`, serial `-000003` voided) |
| Reissue with reason | ✅ new row 5 (serial `-000005`, `supersedes_issuance_id=4`), row 4 marked superseded | DB + history UI shows "Superseded" |
| Empty reissue reason | ✅ rejected by validation | dialog error |
| Revoke with reason | ✅ row 5 `revoked_at` set, reason persisted, links cancelled | DB verified |
| Duplicate content guard | ✅ identical re-issue blocked **before** any row/serial creation; warning toast branch executed | server log: 2 repeat calls, 0 new rows |
| Idempotent double-click guard | ✅ `issuingCode` client lock + `clientRequestToken` per logical request | — |
| Permission lock | ✅ output without permission renders locked ("You don't have access…") | catalog UI |
| Report Center boundary | ✅ letter/cert/form/checklist/badge rows show "Employee Profile" link instead of Run | registry table |
| `file_size_bytes` persisted | ✅ 28,203 bytes on row 5 | DB |

### Test suite

- `vitest run` (output + template-studio + template-governance + dms/temp-cleanup): **11 files, 102 tests, all pass**.
- `tsc --noEmit`: no new errors from WP8 files (remaining errors are the pre-existing `@/types/database` baseline in permissions/users/DMS-expiry modules).

---

## 6. Known deferrals (tracked to later WPs)

| Item | Deferred to |
|---|---|
| Superseded documents' public verification page should display "superseded" state (currently valid-until-revoked) | WP10 (Ops Console) |
| Full multi-role permission matrix UAT (HR admin / HR user / limited / cross-company attacker) | WP9 (OUTPUT.5) |
| Arabic/RTL official templates for HR outputs | WP9 UAT + template authoring |
| `OUTPUT_OFFICIAL_ISSUANCE_ENABLED` remains **dev-only**; production activation gate | WP9 sign-off |
| AI Draft as separate human-review-first action (existing AI letter path untouched) | Already isolated; final check in WP9 |

---

## 7. Files changed (WP8)

**New**
- `src/features/hr/employees/employee-letters-forms.tsx`
- `src/server/actions/output/issuance-history.ts`
- `src/server/actions/output/output-catalog.ts`
- `src/lib/output/issuance-status.ts` (+ `__tests__/issuance-status.test.ts`)
- `src/lib/output/draft-watermark.ts`
- `supabase/migrations/20260726140000_output_4_hr_onboarding_policy_overrides.sql`
- `supabase/migrations/20260726150000_output_4_checksum_finalization.sql`

**Modified**
- `src/features/hr/employees/employee-workspace-form.tsx`
- `src/features/report-center/letter-preview-dialog.tsx`
- `src/features/report-center/report-registry-table.tsx`
- `src/lib/output/issuance-engine.ts`, `src/lib/output/types.ts`
- `src/server/actions/output/generate-official-document.ts`
- `src/server/actions/pdf/generate-hr-letter.ts` (comment only)
- `src/lib/output/__tests__/issuance-engine.test.ts`

**Deleted**
- `src/features/report-center/hr-letter-generator.tsx`

---

## 8. Gate decision

**PASS.** Every discovered HR output (27/27) is classified and onboarded (A–D in Letters & Forms, E in Report Center). The replacement UX enforces permissions, company isolation, approval, serials, watermarking, and lifecycle rules through the global coordinator. Proceed to **WP9 (OUTPUT.5) — Full Security, Runtime, PDF, and Visual UAT**.
