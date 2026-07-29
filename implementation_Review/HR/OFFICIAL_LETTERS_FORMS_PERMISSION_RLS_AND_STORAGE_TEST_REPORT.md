# Official Letters & Forms — Permission, RLS & Storage Test Report

- **Program:** OFFICIAL DOCS.1
- **Date:** 2026-07-28
- **Database:** live Supabase `mmiefuieduzdiiwnqpie` (read-only verification queries + approved forward-only migrations)

---

## 1. Permission Model

### 1.1 Per-document permission enforcement (server-side)

Every official output declares `required_permissions` in `erp_report_registry`.
`generateOfficialDocument` refuses with `permission_denied` **before any data is
fetched** when the actor lacks any required code. Verified assignments:

| Output | Required permission |
|--------|--------------------|
| HR_EMPLOYMENT_LETTER / HR_EMPLOYMENT_CONFIRMATION / HR_EXPERIENCE_LETTER / HR_EMBASSY_LETTER | `hr.employees.view` |
| HR_SALARY_CERT_WITH_AMOUNT / HR_SALARY_CERT_GENERAL / HR_BANK_SALARY_TRANSFER | `hr.payroll.view` |
| HR_NOC_GENERAL | `hr.employees.view` |
| HR_WARNING_LETTER / HR_HANDOVER_FORM | `hr.actions.view` |
| HR_LEAVE_CONFIRMATION | `hr.leave.view` |
| HR_CLEARANCE_FORM / HR_JOINING_CHECKLIST | `hr.employees.view` |
| HR_PPE_ISSUE_FORM | `hr.assignments.view` (**corrected** — see §1.3) |

### 1.2 Dedicated branding-override permission (Section 10.2)

- `reports.branding.override` seeded by migration
  `20260728120000_official_docs_1_catalog_identities_and_override_permission.sql`.
- Granted to **System Administrator only** (least privilege).
- Coordinator check: selecting a non-default `templateId` for a catalog document
  without this permission returns `permission_denied` — verified in code path
  `src/server/actions/output/generate-official-document.ts`.

### 1.3 Live-fire proof that enforcement is server-side (Defect D2)

`HR_PPE_ISSUE_FORM` was seeded requiring `hr.operations.view`, a code that does
not exist in `permissions`. Result: **every** actor, including System
Administrator, was denied — proving the server actually evaluates
`required_permissions` and the UI cannot bypass it. Fixed by migration
`20260728121000_official_docs_1_fix_ppe_form_permission.sql` (aligned to
`hr.assignments.view`, the permission already guarding the underlying PPE data),
then retested successfully (issuance 7).

### 1.4 Class-based approval and sensitivity

- Class A outputs (salary with amount, NOC, warning, bank/embassy) resolve
  `requires_approval` from `erp_output_class_policies` unless overridden.
- `HR_WARNING_LETTER` carries `qr_policy_override='none'` — never publicly
  verifiable (enforced by the same catalog migration; verified by row query).
- Approval denial path returns `approval_required` (verified in Package 7 UAT).

## 2. RLS Verification (Package 2, re-confirmed at closure)

| Table | RLS | Effective policy behavior |
|-------|-----|--------------------------|
| `erp_generated_pdf_documents` | ENABLED | Authenticated read restricted by owner-company scoping + permission; writes only via service-role server actions |
| `erp_output_public_links` | ENABLED | Anonymous access only through the token lookup path used by `/verify/[token]`; no enumeration |
| `erp_report_registry` | ENABLED | Read for authenticated; mutations restricted to service role |
| `erp_output_class_policies` | ENABLED | Read for authenticated; mutations restricted to service role |
| `erp_report_templates` | ENABLED | Governance-status-aware read; mutations via governed server actions |

All issuance writes go through `createAdminClient()` inside server actions that
first evaluate the RBAC context — the browser never receives a privileged client.

## 3. Storage

- Bucket **`erp-generated-pdfs` is private** (verified via storage config).
- Files are stored under `hr/employee/{companyId}/{employeeId}/…` and are only
  reachable through **short-lived signed URLs** (3600s for downloads; observed
  `exp − iat = 3600` in issued tokens; the reprint test in Package 8 issued a
  fresh token with a new `iat`).
- Permanent delete removed the storage object along with DB rows (verified: 0
  matching `storage.objects` rows after delete — Package 7 §5).
- SHA-256 of the exact PDF bytes is recorded per issuance
  (`content_sha256` on `erp_generated_pdf_documents`) at write time.

## 4. Sensitive Data Protection

- Salary, identity, bank and disciplinary values are fetched **server-side only**
  (registered fetchers); the client receives the catalog metadata and outcome
  status, never raw row payloads.
- The public verification page shows authenticity metadata only (document type,
  serial, issue date, status) — confirmed by screenshot evidence
  (`uat-public-qr-verification-page.png`); no salary or personal-identity fields
  are exposed.
- Error messages for blocked generations name the **missing field**, not data
  values (e.g. "the disciplinary record has no incident date").

## 5. Limitations Recorded Honestly

- Only one real user account (System Administrator) exists in this environment,
  so denial paths for lesser roles were proven via (a) the registry permission
  check code path, (b) live-fire Defect D2 (denial actually happened), and
  (c) the approval_required block observed in UAT — not via a full multi-account
  matrix. A staged multi-role matrix should be part of production activation.

## 6. Verdict

**PASS** for development/staging scope, with the §5 limitation recorded.
