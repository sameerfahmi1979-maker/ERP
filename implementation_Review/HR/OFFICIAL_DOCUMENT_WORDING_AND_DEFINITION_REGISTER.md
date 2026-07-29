# Official Document Wording & Definition Register

**Program:** Global Official Letters & Forms Generator (OFFICIAL DOCS.1)
**Date:** 2026-07-28
**Source of truth:** `src/lib/official-documents/definitions/**` (code) + `erp_report_registry` (identity/policy, live DB verified)
**Rule enforced:** No invented wording. Every published paragraph traces to a verified repository source. Documents without verified wording are `disabled_pending_wording` and can never be generated (enforced by `validateOfficialDocumentRegistry()` + coordinator refusal + unit tests).

Class policy defaults (live `erp_output_class_policies`):

| Class | Approval | QR policy | Serial | Official |
|---|---|---|---|---|
| A | Required | `days` (90) | Yes | Yes |
| B | Not required (unless registry override) | `valid_until_revoked` | Yes | Yes |
| C | Not required | `none` | No | Yes |
| D | Not required | `none` | No | No |

Shared rules for ALL documents below:

- **Company/letterhead rule:** `auto_by_owner_company` — branding resolves from the employee's owner company profile; selecting a different approved profile requires the dedicated audited permission `reports.branding.override` (seeded 2026-07-28, System Administrator only).
- **Stamp/signature rule:** injected server-side only, only on approved official issuance, only for callers whose context passes the `reports.sign` gate; never present in previews; renderer accepts only https signed URLs or server-embedded base64 image data URIs (`escapeImageSrc`).
- **Template versioning:** every wording/layout change requires a `version` bump in code review; in-place edits are forbidden by policy.

---

## 1. HR_EMPLOYMENT_LETTER — Employment Certificate

| Attribute | Value |
|---|---|
| Display name | Employment Certificate |
| Business purpose | Certifies current employment (name, position, department, joining date, employment type) for official third-party use |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `src/components/erp/print/templates/hr-employment-letter.tsx` — **verified_code** (ERP PDF.1 production template prose, migrated verbatim) |
| AR wording source | none — Arabic not offered |
| Required ERP fields | employee_name, employee_code, designation, joining_date, company_name |
| Optional user inputs | none |
| Sensitive fields | none |
| Conditional paragraphs | Department phrase included only when department present |
| Approval policy | Class B — no approval |
| Permission policy | `hr.employees.view` |
| QR policy | Class B — `valid_until_revoked` |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 2. HR_EMPLOYMENT_CONFIRMATION — Employment Confirmation Letter

| Attribute | Value |
|---|---|
| Display name | Employment Confirmation Letter / خطاب تأكيد التوظيف |
| Business purpose | Confirms active full-time employment to third parties |
| Languages | EN yes · AR yes · Bilingual yes (`narrative_two_column`) |
| EN wording source | `src/components/erp/print/templates/bilingual-sample.tsx` — **verified_code** |
| AR wording source | `src/components/erp/print/templates/bilingual-sample.tsx` — **verified_code** (visual QA of Arabic rendering executed in Gate 3 of this program) |
| Required ERP fields | employee_name, employee_code, designation, joining_date, company_name (AR fields fall back to EN exactly as the verified source does) |
| Optional user inputs | none |
| Sensitive fields | none |
| Conditional paragraphs | none |
| Approval policy | Class B — no approval |
| Permission policy | `hr.employees.view` |
| QR policy | Class B — `valid_until_revoked` |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 3. HR_EXPERIENCE_LETTER — Experience Certificate

| Attribute | Value |
|---|---|
| Display name | Experience Certificate |
| Business purpose | Certifies the employee's service record (position, department, tenure, last working date where applicable) |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `src/server/actions/reports/hr/hr-letter-documents.ts` (experienceLetterFetcher, REPORT.4) — **verified_code**; published as the verified structured field layout |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code, designation, joining_date, company_name |
| Optional user inputs | none |
| Sensitive fields | last_working_date |
| Conditional paragraphs | Department row and Last Working Date row rendered only when present |
| Approval policy | Class B — no approval |
| Permission policy | `hr.employees.view` |
| QR policy | Class B — `valid_until_revoked` |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | Narrative prose upgrade **pending approved wording** — no verified narrative exists in the repo; the structured layout is the only verified presentation |

## 4. HR_SALARY_CERT_WITH_AMOUNT — Salary Certificate (with amount)

| Attribute | Value |
|---|---|
| Display name | Salary Certificate |
| Business purpose | Certifies employment and monthly salary amount for banks/embassies/institutions |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql` — HR_SALARY_CERTIFICATE seed — **verified_migration**. Token mapping: `{{total_salary}}` → payroll profile `gross_salary` (+ `currency`) |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code, designation, company_name, joining_date, gross_salary, currency |
| Optional user inputs | `addressee` (text, optional, ≤120 chars) |
| Sensitive fields | basic_salary, gross_salary |
| Conditional paragraphs | `To: {addressee}` line rendered only when addressee provided |
| Approval policy | **Class A — approval required** |
| Permission policy | `hr.payroll.view` |
| QR policy | Class A — `days`, 90-day validity |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 5. HR_SALARY_CERT_GENERAL — Salary Certificate (without amount)

| Attribute | Value |
|---|---|
| Display name | Salary Certificate (General) |
| Business purpose | Certifies employment without disclosing salary figures |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | Derived from the same verified HR_SALARY_CERTIFICATE seed with the salary sentence removed (removal-only edit, no new wording) — **verified_migration** |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code, designation, company_name, joining_date |
| Optional user inputs | `addressee` (text, optional, ≤120 chars) |
| Sensitive fields | none |
| Conditional paragraphs | `To: {addressee}` line rendered only when addressee provided |
| Approval policy | Class B — no approval |
| Permission policy | `hr.employees.view` |
| QR policy | Class B — `valid_until_revoked` |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 6. HR_NOC — No Objection Certificate

| Attribute | Value |
|---|---|
| Display name | No Objection Certificate |
| Business purpose | States the company has no objection to a specified purpose (travel, visa, driving licence, …) |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql` — HR_NOC_LETTER seed — **verified_migration** |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code, company_name |
| Optional user inputs | `purpose` (text, **required**, ≤200); `validity_period` (text, optional, ≤60) |
| Sensitive fields | passport_number_masked |
| Conditional paragraphs | Validity sentence rendered only when validity_period provided; Passport row only when masked value present |
| Approval policy | Class B + **registry override `approval_required_override = true`** (OUTPUT.4) — approval required |
| Permission policy | `hr.employees.view` |
| QR policy | Class B — `valid_until_revoked` |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | Per-purpose approval relaxation is a recorded future policy option |

## 7. HR_WARNING_LETTER — Official Warning Letter

| Attribute | Value |
|---|---|
| Display name | Official Warning Letter / خطاب إنذار رسمي (identity name only; document body EN) |
| Business purpose | Formal disciplinary warning tied to a recorded disciplinary action |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `supabase/migrations/20260618100000_erp_hr_1_settings_foundation.sql` — HR_WARNING_LETTER seed — **verified_migration** |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code, warning_level, warning_reason, incident_date (all from the recorded disciplinary action; precise missing-data messages defined) |
| Optional user inputs | none |
| Sensitive fields | warning_level, warning_reason, incident_date, incident_description |
| Conditional paragraphs | Incident description line only when recorded |
| Approval policy | **Class A — approval required** |
| Permission policy | `hr.actions.view` |
| QR policy | **`none` (registry override, applied 2026-07-28)** — warning letters are never publicly verifiable |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 8. HR_CLEARANCE_FORM — Employee Clearance Form

| Attribute | Value |
|---|---|
| Display name | Employee Clearance Form / نموذج تسوية الموظف |
| Business purpose | Departmental sign-off form for exit/clearance |
| Languages | EN yes · AR label-level · Bilingual yes (`bilingual_form_table`) |
| EN wording source | `src/server/actions/reports/hr/hr-letter-documents.ts` (clearance fetcher, REPORT.4) — **verified_code** |
| AR wording source | Program prompt Section 9.4 bilingual label pairs + HR seed title — **verified_prompt** (labels only; no Arabic narrative exists or is required) |
| Required ERP fields | employee_name, employee_code; clearance area rows from fetcher rows |
| Optional user inputs | none |
| Sensitive fields | none |
| Conditional paragraphs | Department and Last Working Day meta rows only when present |
| Approval policy | Class C — no approval |
| Permission policy | `hr.actions.view` |
| QR policy | Class C — none |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 9. HR_JOINING_CHECKLIST — Joining Checklist

| Attribute | Value |
|---|---|
| Display name | Joining Checklist |
| Business purpose | Onboarding checklist (HR, compliance, payroll, operations, DMS, safety, IT) |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `src/server/actions/reports/hr/hr-letter-documents.ts` (joiningChecklistFetcher, REPORT.4) — **verified_code** (items migrated verbatim) |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code; checklist items from fetcher rows |
| Optional user inputs | none |
| Sensitive fields | none |
| Conditional paragraphs | none |
| Approval policy | Class C — no approval |
| Permission policy | `hr.employees.view` |
| QR policy | Class C — none |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

## 10. HR_PPE_ISSUE_FORM — PPE Issue Form

| Attribute | Value |
|---|---|
| Display name | PPE Issue Form |
| Business purpose | Records PPE issued to the employee with acknowledgment signature |
| Languages | EN yes · AR no · Bilingual no |
| EN wording source | `src/server/actions/reports/hr/hr-letter-documents.ts` (ppeIssueFormFetcher, REPORT.4) — **verified_code** |
| AR wording source | none |
| Required ERP fields | employee_name, employee_code; PPE item rows from fetcher rows |
| Optional user inputs | none |
| Sensitive fields | none |
| Conditional paragraphs | Empty-state paragraph when no PPE items are recorded (verbatim fetcher empty-state) |
| Approval policy | Class C — no approval |
| Permission policy | `hr.operations.view` |
| QR policy | Class C — none |
| Template version | 1 |
| Publication status | **published** |
| Missing decisions | none |

---

## Identities reserved — DISABLED (no verified wording; generation refused)

These four identities were registered in `erp_report_registry` (migration `20260728120000_official_docs_1_catalog_identities_and_override_permission`) so numbering, permissions, and catalog visibility are governed from day one, but their code definitions are `disabled_pending_wording`. The registry validator and the coordinator both refuse generation; the UI must label them "Awaiting approved wording" with no Generate action.

| # | Code | Display name | Class | Permission | Sensitive profile | What is missing |
|---|---|---|---|---|---|---|
| 11 | HR_BANK_SALARY_TRANSFER | Bank Salary Transfer Letter | A | `hr.payroll.view` | payroll | Approved EN wording (bank-specific salary-transfer body); no verified source anywhere in repo/migrations |
| 12 | HR_EMBASSY_LETTER | Embassy / Consulate Letter | A | `hr.employees.view` | mixed_sensitive | Approved EN wording; embassy letters vary by mission — needs approved base wording + policy decision on salary disclosure |
| 13 | HR_HANDOVER_FORM | Employee Handover Form | C | `hr.actions.view` | normal | Approved structure/wording for duties & assets handover; no verified source |
| 14 | HR_LEAVE_CONFIRMATION | Leave Confirmation Letter | B | `hr.leave.view` | normal | Approved EN wording; must bind to an approved leave record — data contract also pending |

**To activate any of the above:** provide approved wording (Sameer/Dina sign-off), implement the definition with `status: "published"` + wording evidence, bump nothing (first version = 1), add exact-wording unit tests, and re-run the visual baseline set.

---

## Explicit safe dispositions of pre-existing official HR outputs (Gate 4)

| Existing output | Disposition |
|---|---|
| HR_EMPLOYMENT_LETTER (OUTPUT.2 executive-ledger path) | Wording migrated verbatim into definition #1; identity unchanged; history preserved |
| HR_EXPERIENCE_LETTER (REPORT.4 fetcher) | Structured layout kept as published presentation (#3); narrative upgrade pending wording |
| HR_SALARY_CERT_WITH_AMOUNT / HR_SALARY_CERT_GENERAL (REPORT.4) | Wording from HR.1 notification seed migrated (#4, #5); split identities preserved (no merge) |
| HR_NOC (REPORT.4 + OUTPUT.4 approval override) | Seed wording migrated (#6); approval override retained |
| HR_CLEARANCE_FORM / HR_JOINING_CHECKLIST / HR_PPE_ISSUE_FORM (REPORT.4) | Fetcher content migrated verbatim (#8–#10) |
| Bilingual sample template (ERP PDF.1) | Promoted into HR_EMPLOYMENT_CONFIRMATION (#2) with Gate 3 Arabic visual QA executed |
| Template Studio (`erp_report_templates`) drafts | NOT migrated — designer-authored bodies are rejected by program decision; rows retained non-destructively for history until Package 8/9 |
| AI letter drafts (Common AI 7 / HR AI) | Out of scope — remain informal drafts (Class E/F paths); never enter the official catalog |
