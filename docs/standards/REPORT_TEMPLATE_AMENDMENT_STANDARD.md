# Editing approved or published report templates

Implemented 30 October 2026. The owner subsequently authorized additive migration
`20261030120000_report_template_admin_amendments.sql`, which is applied and verified
in ERP project `mmiefuieduzdiiwnqpie`. The local frontend can use it. No publication
or production frontend deployment is implied. Do not replay the recorded migration.

- Only the reserved active `system_admin` assignment at null company/null branch
  may prepare, submit, withdraw or discard same-template amendments. Aggregate
  permissions, legacy `group_admin`, Company Administrator and Branch
  Administrator do not inherit this special editing capability.
- The current Auth session/account and actual source company are checked on the
  server and again in the service-only database transaction. Existing scoped
  template approval/publication/signing permissions remain authoritative.
- Published configuration stays in `erp_report_templates`. Pending configuration
  is in private tables, with protected snapshots and operation receipts. Ordinary
  template selectors, report rendering and issuance never read these drafts.
- Use **Templates & Branding → Edit / Template changes**. Save pending changes,
  submit for deterministic security review, obtain a different authorized
  reviewer's approval, then publish. Reviewers use **Template changes** to compare
  the proposed settings against the current publication. Changes during review
  require withdrawal; editing resets review and approval. Rejected edits remain
  available for correction. Discarding requires a reason and retains history.
- Publishing atomically updates the same template ID/code, increments its version
  and normal workspace revision, and records snapshots/events/audit. No manual
  catalogue copies are required. Source/revision conflicts cannot overwrite newer
  changes. An existing active successor must be reconciled first.
- Retries keep the original operation and payload. A lost response must be
  reconciled before another action or closing the change dialog. Revoked
  authority cannot replay a receipt. Publication also rechecks the independent
  reviewer's current account, session and company authority.
- Issued files, saved branding provenance, serial reservations and QR/history
  retain their original versions. Existing official wording/business-approval
  gates remain separate; this editor does not approve code-based legal wording.
- The shared letter issue-date line uses isolated English/Arabic label/value
  pairs: `Date: 30 October 2026 — التاريخ: ٣٠ أكتوبر ٢٠٢٦`. Arabic dates use Arabic
  digits. Layout frame version 6 supersedes version 5 for future rendering only.
  Old unresolved render operations retain their existing version-mismatch
  protection; do not silently regenerate or replace their retained payloads.

Acceptance evidence: `CODEX_AUDIT_13_09_2026/IMPLEMENTATION/LETTER_DATE_TEMPLATE_EDIT_20261030/RESULTS.md`.
