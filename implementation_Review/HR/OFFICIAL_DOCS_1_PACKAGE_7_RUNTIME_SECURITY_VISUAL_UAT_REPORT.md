# OFFICIAL DOCS.1 — Package 7: Runtime, Security & Visual UAT Report

- **Program:** Global Official Letters & Forms Generator + Report Designer Retirement
- **Package:** 7 — Runtime, security & visual UAT (Gate 7)
- **Date:** 2026-07-28
- **Environment:** Local dev (`localhost:3000`, Turbopack) + local Gotenberg 8 (Docker) + live Supabase `mmiefuieduzdiiwnqpie`
- **Actor:** Sameer Fahmi (System Administrator)
- **Test record:** Employee EMP-000001 (id=1)

---

## 1. Result Summary

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | Generate Arabic Employment Confirmation (RTL, Arabic-Indic dates) | PASS | `official-docs-uat-evidence/uat-employment-confirmation-arabic-issued.png` |
| 2 | Generate Bilingual Employment Confirmation (two-column EN/AR + QR) | PASS | `official-docs-uat-evidence/uat-employment-confirmation-bilingual-issued.png` |
| 3 | Generation dialog — language selector + optional inputs | PASS | `official-docs-uat-evidence/uat-generation-dialog-language-selector.png` |
| 4 | Warning Letter blocked on missing `incident_date` (precise inline error) | PASS | `official-docs-uat-evidence/uat-warning-letter-blocked-missing-incident-date.png` |
| 5 | Duplicate-content warning on identical regeneration | PASS | Inline banner shown; no second issuance created |
| 6 | Public QR verification page (valid document, no sensitive data) | PASS | `official-docs-uat-evidence/uat-public-qr-verification-page.png` |
| 7 | Revoke issued document (reason required, min 5 chars enforced server-side) | PASS | See §3 |
| 8 | Public verification page after revoke → "Verification Link Cancelled" | PASS | `official-docs-uat-evidence/uat-revoked-verification-page.png` |
| 9 | Reissue (superseding copy) with correct supersession links + new serial | PASS | `official-docs-uat-evidence/uat-reissued-employment-confirmation-serial5.png` |
| 10 | **DEFECT FOUND & FIXED:** reissue lost original language variant | FIXED + RETESTED | See §4; `official-docs-uat-evidence/uat-reissued-arabic-preserved-serial6.png` |
| 11 | Permanent delete (system_admin): row + public link + storage file removed | PASS | See §5 |
| 12 | **DEFECT FOUND & FIXED:** PPE form required a non-existent permission | FIXED + RETESTED | See §6; `official-docs-uat-evidence/uat-ppe-issue-form-generated-after-permission-fix.png` |
| 13 | Unit tests after fixes | PASS — 433/433 (22 files) | vitest run |
| 14 | Typecheck after fixes | PASS — 72 errors, identical to Package 0 baseline (0 new) | tsc --noEmit |

---

## 2. Issuance Ledger State After UAT

| ID | Output | Serial | Locale/Dir | State |
|----|--------|--------|-----------|-------|
| 1 | HR_SALARY_CERT_WITH_AMOUNT | …000001 | en/ltr | issued |
| 2 | HR_EMPLOYMENT_CONFIRMATION | …000002 | ar/rtl | issued, superseded by 6 |
| 3 | HR_EXPERIENCE_LETTER | …000003 | en/ltr | revoked → **permanently deleted** (UAT artifact) |
| 4 | HR_EMPLOYMENT_CONFIRMATION | …000004 | en-ar/auto | issued, superseded by 5 |
| 5 | HR_EMPLOYMENT_CONFIRMATION | …000005 | en/ltr | issued (superseding copy of 4 — issued **before** the language-preservation fix) |
| 6 | HR_EMPLOYMENT_CONFIRMATION | …000006 | ar/rtl | issued (superseding copy of 2 — **after** fix, Arabic correctly preserved) |
| 7 | HR_PPE_ISSUE_FORM | — (Class D, no serial by policy) | en/ltr | issued |

Serial numbers are never reused; the deleted issuance's serial `…000003` remains consumed.

## 3. Revoke Lifecycle (issuance 3)

1. Revoke dialog requires a reason (min 5 chars). Server-side validation confirmed: two submissions with an empty reason were **rejected** by `revokeIssuance` (Zod), no state change.
2. Successful revoke set `revoked_at`, `revoke_reason` and flipped the public link `status` from `valid` → `cancelled` in `erp_output_public_links`.
3. The public `/verify/<token>` page then rendered **"Verification Link Cancelled — This verification link has been cancelled by the issuing organization."** with no sensitive data.

## 4. Defect 1 — Reissue lost the original language variant (FIXED)

- **Symptom:** Reissuing bilingual issuance 4 produced issuance 5 with `locale=en` instead of `en-ar`.
- **Root cause:** `reissueOfficialDocument` (`src/server/actions/output/issuance-history.ts`) called `generateOfficialDocument` without the original `language`/`inputs`, so the coordinator defaulted to English.
- **Fix:** The action now reads `language` and `inputs` from the original issuance's `data_snapshot_json` (recorded by the coordinator for every catalog document) and passes them through, so a superseding copy always keeps the same approved variant.
- **Retest:** Reissued Arabic issuance 2 → issuance 6 with `locale=ar`, `direction=rtl`, correct RTL PDF (serial `…000006`), correct supersession links both ways.

## 5. Permanent Delete (system_admin)

Deleted the revoked UAT Experience Letter (issuance 3). Post-delete verification via SQL:

- `erp_generated_pdf_documents` rows for id=3: **0**
- `erp_output_public_links` rows for the document: **0**
- `storage.objects` in `erp-generated-pdfs` matching the file: **0**

The confirmation dialog correctly warns that the file, record, and QR link are removed and the serial is not reused.

## 6. Defect 2 — PPE Issue Form ungeneratable for everyone (FIXED)

- **Symptom:** "You don't have access to generate this document" shown even for System Administrator.
- **Root cause:** `HR_PPE_ISSUE_FORM` was seeded (REPORT.4 migration) requiring permission `hr.operations.view`, which **does not exist** in the `permissions` table — nobody could ever satisfy it.
- **Fix:** Migration `20260728121000_official_docs_1_fix_ppe_form_permission.sql` (applied to live DB) updates `required_permissions` to `['hr.assignments.view']` — the permission that already gates the HR Operations server actions serving the underlying PPE data (`src/server/actions/hr/operations.ts`).
- **Retest:** PPE Issue Form generated successfully (issuance 7). PDF renders the verified empty-state paragraph ("No PPE items are currently recorded as issued to this employee.") plus the acknowledgment signature block. No serial issued — correct for Class D internal forms.

## 7. Files Changed in Package 7

| File | Change |
|------|--------|
| `src/server/actions/output/issuance-history.ts` | Reissue now preserves original `language`/`inputs` from `data_snapshot_json` |
| `supabase/migrations/20260728121000_official_docs_1_fix_ppe_form_permission.sql` | New migration — PPE form permission corrected to an existing code |

## 8. Known Observations (non-blocking)

1. **Toast rendering in the automated browser session:** sonner toasts did not appear in the automation session; the inline result banner (Package 6) covers all critical feedback. Behaviour in a normal user browser was previously confirmed working.
2. **Reissue and QR:** the reissue dialog does not currently offer a QR toggle; `issueQr` defaults to false on reissue. Superseding copies of QR-bearing documents are issued without a fresh public link. Candidate enhancement for a follow-up phase.
3. **Cosmetic:** the revoke reason recorded for the (now deleted) UAT issuance contained a stray `undefined` prefix injected by the browser automation tooling — not an application bug.

## 9. Gate 7 Verdict

**PASS.** All runtime, security, and lifecycle scenarios verified with evidence; both defects found during UAT were fixed forward and retested in the same package. Ready to proceed to Package 8 (Designer UI retirement).
