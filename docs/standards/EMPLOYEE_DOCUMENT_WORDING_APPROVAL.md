# Employee document wording — review and approval

## Current status — nine source integrations completed, 31 October 2026

All **14** wordings retain the owner's explicit English/Arabic approval. The remaining nine source integrations are now implemented and technically accepted locally. The additive source-review migration `20261031052324_hr_letter_source_reviews.sql` was rehearsed with recovery and applied to the authorised ERP database on 31 October 2026. Local generation is eligible after the normal current-user, company, source, language, branding and issuance checks. No application publication or deployment accompanied this update.

The nine are Experience, Warning, PPE Issue, Handover, Salary Certificate With Amount, Bank Salary Information, Embassy/Consulate, Leave Confirmation and Clearance. Experience/Warning/PPE/Handover use explicit independently approved source particulars bound to the underlying transaction and DMS file version. The other integrations read their required current payroll, bank, employment, approved leave or clearance records. Missing records or Arabic particulars remain visible validation holds; wording approval never supplies missing facts.

Clearance is an accurate preparation/review form, not certification of completed stock clearance, settlement or payment. Handover records the selected reviewed transfer; it is not final clearance. Salary amount words are deterministic AED output. The bank letter neither exposes IBAN nor promises a transfer. Approved wording and Employment Confirmation v2 were not rewritten.

Verification: 600 unit/component checks; 31 isolated native database assertions; two concurrency cases; 29 synthetic PDF outputs (45 pages), including English/Arabic/bilingual and long content; affected lint, shipping types and a full offline production build passed. One older optional broad PDF-catalogue test was skipped; the separate 29-output run covers this task. No browser, physical-device or real employee issuance testing was performed. Owner visual/mobile acceptance remains pending.

Evidence: `CODEX_AUDIT_13_09_2026/IMPLEMENTATION/HR_LETTER_INTEGRATION_20261031/RESULTS.md`. Live postflight confirmed all 18 existing templates and four issued originals unchanged, zero new review/business records, and function/permission/trigger parity with the isolated acceptance database. The local frontend source is unpublished.

## Historical status — explicit owner approval, 30 October 2026

The system owner explicitly approved the revised English and Arabic wording for the other 13 letters/forms and authorised conditional local activation after checks, with no push/deployment. Both-language evidence records that exact approval; reviewed wording bytes and Confirmation v2 remain unchanged.

All 14 wordings are approved. Wording publication is not source-workflow acceptance. Five definitions (Confirmation, Employment Certificate, Employment Certificate Without Salary, NOC, Joining Checklist) are locally eligible, subject to record/current-access checks. Nine remain held: experience, warnings, bank, embassy, handover, leave confirmation, salary-with-amounts, PPE and clearance. The UI reports their source-integration reason, never asks for the same wording approval again. A future wording change requires a new explicit approval.

Source facts, required Arabic particulars, NOC purpose/date, payroll representations, independent approvals, stock ownership, verified clearance, QR and immutable originals remain protected. No sample facts can be substituted for a missing source. No real issuance or live database mutation is needed for this code-defined approval.

Evidence for that earlier milestone: `CODEX_AUDIT_13_09_2026/IMPLEMENTATION/HR_WORDING_APPROVAL_20261030/RESULTS.md` and `OWNER_APPROVAL.json`. These historical holds are superseded by the 31 October source integration above, without changing the original approval evidence.

## Historical implementation notes — before this owner approval

Current local batch: 30 October 2026. Fixed definitions and their wording evidence
remain the source of truth; approval is not inferred from successful PDF rendering.

## Current revision follow-up — 30 October 2026

All 14 fixed HR documents now share the persistent preparation workbench with inline permitted letterheads, language, declared input controls and refreshed draft preview. Generate actions for eligible fixed definitions also enter this surface before the existing durable issuer. Sample wording review cannot issue an official original.

The owner-supplied `ERP_HR_LETTERS_FORMS_DETAILED_REVISION_PROPOSAL.md` is a proposal, not approval. Thirteen bilingual drafts were revised against it, with a separate version increment; confirmation v2 and its explicit approval are preserved, and the unapproved v3 is excluded. Structured operational tables collect owner/evidence/decision fields without inventing completed reviews. Source/approval gaps remain held. No bank salary-transfer undertaking is introduced.

Local frontend authentication and public verification use separate origins. Configure server-side `PUBLIC_VERIFICATION_BASE_URL=https://erp.algt.net` for a local frontend connected to live ERP data; keep its auth/navigation origin local. Verification overrides must be HTTPS origins without credentials, path, query or fragment. Missing QR preparation stops issuance; a retained QR-less plan is held for reconciliation. Existing originals are never silently replaced. Owner must deliberately Generate New for an already-issued QR-less original.

Evidence and proposal crosswalk: `CODEX_AUDIT_13_09_2026/IMPLEMENTATION/HR_LETTERS_REVISION_20261030/RESULTS.md` and `PROPOSAL_CROSSWALK.md`. No migration, push, deployment or browser testing for this follow-up.

## Approved certificate

The owner explicitly instructed: keep the supplied English and Arabic wording,
approve **Employment Confirmation Certificate**, and enable official generation
locally without browser testing, push or deployment.

`HR_EMPLOYMENT_CONFIRMATION` retains wording version **2**, the supplied prose,
request-scoped recipient controls and authoritative employee/company fields.
Both wording records now identify approval by the system owner on **2026-10-30**.
The existing local official-issuance flag was already enabled; it was not changed.
Normal current permissions, company letterhead, approval/signing rules, numbering,
QR lifecycle, source validation and durable recovery still apply when the owner
actually issues a document. No real document was issued by implementation tests.

Because the approved wording confirms current employment, its fetcher holds
inactive, suspended, terminated, archived, unknown-status and future-start records
for HR review. Active, on-leave and probation records remain eligible subject to
the existing field/authority checks. No employee status or link is changed.

Because the approved wording confirms current employment, its fetcher holds
inactive, suspended, terminated, archived, unknown-status and future-start records
for HR review. Active, on-leave and probation records remain eligible subject to
the existing field/authority checks. No employee status or link is changed.

## Bilingual proposals

The other **13** definitions are complete English/Arabic proposals, supported in
English, Arabic and bilingual previews. They remain **draft / pending business
approval**. No approval identity/date is fabricated for those proposals.

The registry composes these proposals in
`src/lib/official-documents/definitions/hr/review-drafts.ts`; their earlier source
definitions remain retained. The owner-approved Employment Confirmation is not
wrapped or rewritten. Revised wording gets a new definition version.

Choose **Preview draft**, then use **sample details for wording review** to see
the complete text without requiring actual payroll, warning, leave or custody
records. Sample mode uses a fictitious person and labelled example facts, remains
within current employee/company permissions and governed letterhead selection,
revalidates current access after rendering and creates no issuance/history/file.
It cannot switch on official issuance or bypass wording approval.

Bank Salary Transfer, Embassy/Consulate, Handover and Leave Confirmation retain
an additional source-workflow hold. Their sample previews work, but they cannot
certify an actual account, approved leave, handover or application outcome merely
because wording was drafted. Approved source selection and validation must be
completed before their later official activation.

Clearance and handover forms retain owner-specific sign-off. They do not clear
stock, settle payroll, waive rights or impersonate IT/store/asset authorities.
The warning draft describes recorded facts and response/receipt; it does not
invent an automatic termination sanction. Experience/end-of-service wording and
required source particulars must be reviewed before that proposal is approved.

## Online database and local review

All 14 codes are already active in the online ERP registry. No database migration,
registry/policy edit or employee/business-data write is needed for this batch.
The owner's instruction to apply any necessary database modifications online is
respected without creating unnecessary mutations. Application changes remain
local until a later explicit publication/release request.

Review evidence and the complete bilingual sample text are retained privately at
`CODEX_AUDIT_13_09_2026/IMPLEMENTATION/HR_WORDING_CATALOGUE_20261030/`.
The shared layout is frame **7**: single-language Arabic form/checklist headings
and body dates render in Arabic; the existing letterhead, isolated bilingual
issue-date line, immutable originals and QR/reference controls are retained.
Unresolved older-version render operations retain their existing reconciliation
requirements; they are never silently regenerated from new wording.
