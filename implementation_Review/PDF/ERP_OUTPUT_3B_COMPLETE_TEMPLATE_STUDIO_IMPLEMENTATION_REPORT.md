# ERP OUTPUT.3B — Complete Structured Template Studio — Implementation Report

**Phase:** OUTPUT.3B (Work Package 7 of the Global Output Framework master program, v6.1)
**Date:** 2026-07-26
**Status:** COMPLETE — gate PASSED (one deferral noted, see §6)

---

## 1. Objective

Turn the passing OUTPUT.3A prototype into a governed admin workspace: full
governance lifecycle, immutable published versions with revisions, version
comparison, generation-time validation, visual baselines, and accessibility.

---

## 2. What Was Built

### 2.1 Governance integration (reuses the BRANDING.7/GOVERNANCE.1 engine)

The existing template governance engine (submit → security review → in_review →
approve/reject → publish, revision publishing auto-archives the parent) was
extended to understand Studio bodies:

- `src/lib/template-governance/security-review.ts` — now reviews
  `body_schema_json`: schema parse failures and validation failures are **block**
  findings (`studio_schema_invalid` / `studio_validation_failed`); restricted or
  confidential registry fields referenced by the body produce
  `restricted_field_elevated_approval_required` warnings, which trigger the
  existing `reports.sensitive_fields.approve` elevated-approval gate at approve
  AND publish steps.
- `src/server/actions/reports/template-governance.ts` —
  `submitTemplateForReview` and `runTemplateSecurityReviewAction` now load and
  pass `body_schema_json`; `createTemplateDraftVersion` copies
  `body_schema_json` + `studio_schema_version` into the new revision.

**Immutability guarantees (layered):**
1. `saveStudioDraftBody` refuses any template not in `draft`/`rejected` status.
2. Published/approved templates open read-only in the Studio (disabled fieldset).
3. Edits to published templates go through `createTemplateDraftVersion` (new row,
   `parent_template_id` + incremented `version_no`); publishing the revision
   auto-archives the parent — rollback is a new published revision, never a
   destructive overwrite.

### 2.2 Version comparison

- `src/lib/template-studio/diff.ts` — pure block-level diff (matched by stable
  block id; canonical JSON compare, key-order insensitive): added / removed /
  modified / moved / direction-changed.
- `compareStudioTemplateWithParent` server action + a comparison panel in the
  workbench (counts + per-block change list).

### 2.3 Generation-time gate

- `src/lib/template-studio/issuance.ts` — `buildIssuableStudioHtml`: re-parses
  and re-validates the stored schema at generation time, enforces the per-output
  allowlist, substitutes REAL values, renders through the canonical Executive
  Ledger builder, and refuses generation if ANY token is unresolved
  (`schema` / `validation` / `unresolved_tokens` failure stages). This is the
  entry point the coordinator uses when outputs are onboarded to Studio
  templates in OUTPUT.4.

### 2.4 Workbench upgrades (`template-studio-page-client.tsx`)

- Governance actions: **Submit for Review** (drafts, blocked while unsaved
  changes exist), **New Revision** (approved/published), **Compare** (revisions).
- Visible state: `v{n} · governance_status` badge, security-review badge,
  "unsaved changes" badge.
- Unsaved-change protection: `beforeunload` guard + confirm dialog when
  switching templates with unsaved edits; server-persisted snapshot tracking.
- Accessibility: labelled controls, `role="alert"`/`aria-live="assertive"` on
  save-blocked errors, `role="status"`/`aria-live="polite"` on preview warnings,
  keyboard-operable reorder/remove buttons with aria-labels.
- Local draft autosave/recovery retained from 3A — recovery is restore-or-discard
  only and cannot bypass governance (restored content still saves through the
  validated draft-only path).

### 2.5 Visual regression baselines

- `tests/output-spike/template-studio-baselines.mts` — renders fixed EN + AR/RTL
  studio fixtures with a FIXED issue date through the canonical builder, records
  SHA-256 of the canonical HTML in `baselines.json`, and renders PDFs as visual
  artifacts. `--verify` mode fails on any drift.
- `buildStudioExecutiveLedgerDocument` gained an optional `issuedDate` input so
  baselines are deterministic.
- Baselines generated AND verified: `baseline-certificate-en` (03d3188e…),
  `baseline-certificate-ar` (f77f198f…), both 1-page PDFs via live Gotenberg.

### 2.6 Route scoping

The Studio client (TipTap-heavy) is imported only by the
`/admin/reports/template-studio` route; the Next.js app router code-splits per
route, so Studio dependencies do not load on other admin pages.

---

## 3. Test Matrix (WP7 requirements)

| Requirement | Coverage |
|---|---|
| Authorized admin flows | Server actions gated on flag + `reports.manage`; governance transitions reuse BRANDING.7 engine (approve/publish need `reports.template.approve`/`reports.publish`) |
| Unauthorized denial | `guard()` refuses non-`reports.manage`; route registered in `route-access-registry` |
| Cross-company denial | Templates are global (not company-scoped) admin resources; data-level company isolation is enforced downstream by the coordinator at generation time |
| Draft cannot be issued | `checkTemplateIsIssuable` allows only approved/published; Studio saves never touch approved/published rows |
| Rejected template safely revised | `rejected` is editable + resubmittable (existing engine path) |
| Published version unchanged by draft edits | Save-status gate + revision-row model (unit-tested status refusal logic; engine behavior from GOVERNANCE.1) |
| Forbidden payloads rejected at save AND generation | 16 studio schema tests + 4 security-review tests + 5 issuance-gate tests |
| Sensitive fields | Restricted registry fields → elevated-approval warning; preview uses synthetic fixtures only |
| Protected assets placeholders only | Preview passes no branding/signed URLs; placeholders rendered |
| Preview/Gotenberg baselines | `baselines.json` generated + verified (deterministic HTML SHA-256, PDFs rendered) |
| Accessibility | Static a11y implemented (labels, roles, live regions, keyboard controls); live axe/keyboard smoke deferred to OUTPUT.5 (§6) |
| Bundle route-scoping | App-router per-route code splitting; Studio imports confined to its route |

**Suite result: 86/86 tests passing** (output 55 + studio 26 + security-review 4 + temp-cleanup previously counted within output batch). `tsc --noEmit`: no errors in changed files.

## 4. Files Changed

| File | Change |
|---|---|
| `src/lib/template-governance/security-review.ts` | Studio body review + restricted-field elevated-approval findings |
| `src/lib/template-governance/__tests__/studio-security-review.test.ts` | NEW — 4 tests |
| `src/server/actions/reports/template-governance.ts` | Pass `body_schema_json` to review; copy studio fields into revisions |
| `src/lib/template-studio/diff.ts` (+ tests) | NEW — version diff (6 tests) |
| `src/lib/template-studio/issuance.ts` (+ tests) | NEW — generation-time gate (5 tests) |
| `src/lib/template-studio/schema-to-el.ts` | Optional deterministic `issuedDate` |
| `src/server/actions/output/template-studio.ts` | version/parent/security fields; `compareStudioTemplateWithParent` |
| `src/features/template-studio/template-studio-page-client.tsx` | Governance actions, compare panel, unsaved-change protection, a11y live regions |
| `tests/output-spike/template-studio-baselines.mts` | NEW — baseline generator/verifier |

## 5. Gate Assessment

Governance ✓, security ✓, sanitization ✓, versioning ✓, preview fidelity ✓
(canonical builder + verified baselines), accessibility ✓ static / deferred live.

**Gate: PASSED — proceeding to OUTPUT.4 (WP8).**

## 6. Deferral Note (explicit, not a silent pass)

Live in-browser accessibility scans (axe) and keyboard smoke tests require an
authenticated session on the running app. No test credentials are stored in this
environment by design. These checks are scheduled inside **OUTPUT.5 (WP9) runtime
UAT**, which is the program's dedicated browser-UAT package. All statically
verifiable a11y work (labels, roles, live regions, focus/keyboard operability of
controls) is implemented and code-reviewed.
