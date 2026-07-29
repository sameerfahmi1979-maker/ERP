# ERP Global Output Framework & HR Letters — Enhancement Plan

**Created:** 2026-07-24
**Updated:** 2026-07-26 (**v6.1 — Correction release: QR policy, reissue model, hashing, lifecycle, Puck preservation, fidelity claims, Template Studio scope, Operations Console, spike scope, decision register**)
**Status:** **PLANNING — NOT IMPLEMENTED.** No code, migration, package, database, storage or infrastructure change has been made under this plan.
**Gate:** REQUIRES SPIKE (`OUTPUT.SPIKE.1`) — and the spike itself runs only after Sameer approves this v6.1.
**This file is the planning source of truth** for the Global ERP Output Framework AND the HR first-adopter implementation. (Filename retained for history; scope is global.)
**Companion evidence (read in this order):**
1. `implementation_Review/PDF/ERP_GLOBAL_OUTPUT_FRAMEWORK_PHASE_2_DEEP_RESEARCH_ARCHITECTURE_DECISION_REPORT.md` (Phase 2)
2. `implementation_Review/PDF/ERP_GLOBAL_OUTPUT_FRAMEWORK_PHASE_2_PLAN_CHANGELOG_AND_DECISION_REGISTER.md`
3. `implementation_Review/HR/HR_LETTERS_0_DEEP_ANALYSIS_INVESTIGATION_ARCHITECTURE_SECURITY_AND_UX_REPORT.md`
Where those documents conflict with this v6.1 (five-year QR default, bulk link reissue, normalized-metadata integrity hash, "same engine" fidelity wording, Puck-draft discard, "17 of 19" count), **this v6.1 prevails**; the corrections are mapped in §0.

**Version history:**
- v1 — initial bug investigation + phased enhancement plan
- v2 — parallel-pipeline discovery; unify instead of duplicate
- v3 — retire Puck for code-first templates
- v4 — HR.LETTERS.0 evidence reconciliation; lifecycle, storage security, class policies
- v5 — pdfme adoption (later reversed)
- v6 — GLOBAL OUTPUT FRAMEWORK PHASE 2: one governed framework; HTML/CSS canonical; Gotenberg (Chromium) official renderer; TipTap-based structured Template Studio; Puck retirement confirmed low-risk; pdfme rejected for global use; HR = first adopter; phases OUTPUT.SPIKE.1 + OUTPUT.1–6 + RETIRE.0/1
- **v6.1 — CORRECTION RELEASE (this version). Architecture direction unchanged and preserved. Fifteen planning corrections applied: document-class QR validity (no single 5-year default); non-destructive inventory of the 13 existing QR links (no bulk cancel+reissue); request-idempotency separated from content fingerprint so authorized reissue is possible; integrity hash = SHA-256 of exact final stored bytes (normalized-metadata hashing demoted to a test technique); explicit recoverable lifecycle with one canonical FK direction; `dms-temp` cleanup upgraded from proposal to mandatory testable deliverable; Puck history preserved (discard recommendation removed) with an evidence-preservation package; Chromium fidelity re-stated as same-HTML/same-engine-family with mandatory visual regression (no pixel-identity promise); NEW Global Output Operations Console added to architecture and roadmap; Template Studio re-scoped (TipTap = foundation, not a product; protected stamp/signature placeholders; phased evidence-based estimate with a demo gate); OUTPUT.SPIKE.1 scope strengthened; schedules UI to be hidden before the worker exists; global scope/extensibility stated explicitly; approval policy for sensitive documents clarified; open-decisions table rewritten with explicit statuses (no inferred approvals). Template layout counts corrected: 18 rows / 16 empty / 2 meaningful / 0 published-meaningful (v6's "17 of 19" was an arithmetic error).**

---

## 0. v6.1 CORRECTION REGISTER

| # | v6 statement (location) | v6.1 replacement | Affected sections |
|---|---|---|---|
| C1 | "Public link expiry policy — 5-year default proposed" (v6 §8 Q5) | Configurable validity per document class and template: employment/experience = long-term or valid-until-revoked; salary-with-amount + sensitive NOC = ~90 days initial default; internal/analytical/exports/AI = no public QR. No hardcoded document names in the engine. | §3.4, §5, §11 Q5 |
| C2 | "13 existing metadata-only QR links — cancel + reissue circulating ones" (v6 §8 Q4) | Non-destructive inventory → classify each link (preserve / legacy-visible / revoke / expire / reissue / unresolved) → authorized human review before any material action → full audit trail. No bulk automatic action. | §3.5, §7 OUTPUT.1, §11 Q4 |
| C3 | Idempotency key treated as the sole duplicate control (v6 §1.2/§4) | Request-level idempotency (blocks double-click/retry duplicates) separated from a content fingerprint (detects unchanged content, warns, never blocks). Authorized reissue of unchanged documents is explicitly allowed with reason/actor/approval and a `supersedes` chain. | §3.2, §3.3 |
| C4 | "checksum with normalized metadata" as the integrity hash (v6 §1.7; Phase 2 report §21/§27) | Integrity hash = SHA-256 of the **exact final stored PDF bytes** after all rendering and post-processing (incl. optional PDF/A), verifiable against the stored object. Normalized-metadata hashing survives only as a visual/regression-test technique in OUTPUT.5. | §3.2, §5, §7 OUTPUT.5 |
| C5 | Lifecycle summarized in 5 steps; FK direction implicit | Explicit 11-step sequence with failure states (`failed_retryable`, `failed_terminal`, `cancelled`, `reconciliation_required`); ONE canonical FK: `erp_output_public_links.generated_pdf_document_id` → PDF row (the PDF row never references the link). Verification is metadata-only by default; document download is a separate permissioned action. | §3.1, §3.4 |
| C6 | "`dms-temp` cleanup job proposal" (v6 §4 OUTPUT.1) | Mandatory, testable OUTPUT.1 deliverable with retention config, exclusions (legal hold/active processing/failed jobs/manual retain), worker ownership, batching/retry/idempotency, dry-run mode, audit+metrics, orphan reconciliation, alerts, company isolation, tests, disable switch. Remains a pre-production blocker. | §3.6, §7 OUTPUT.1 |
| C7 | "Discard archived Puck drafts after wording snapshot" (v6 §8 Q7 recommendation "Yes") | **Removed.** RETIRE.0 preserves an evidence package for templates 14/15 (locked layout JSON, metadata/governance state, wording extraction, editor screenshots where renderable, rendered reference output, re-authoring map, checksum + audit). Nothing discarded. | §6, §7 RETIRE.0, §11 Q7 |
| C8 | "Preview and final come from the SAME engine … structurally eliminates" mismatch (v6 §1.2) | Same canonical HTML/CSS/assets/data snapshot + same Chromium engine **family**; browser and Gotenberg Chromium versions can differ and may produce visible differences. Fidelity is a **tested guarantee**: version pinning/capture where practical + mandatory browser-vs-Gotenberg visual regression with documented tolerances. | §1.2, §2, §7 SPIKE/OUTPUT.5 |
| C9 | No operations/monitoring surface planned | NEW **Global Output Operations Console** (module-agnostic admin workspace) added to architecture + roadmap (OUTPUT.6) with permissions, company scoping, redaction, separation of duties. | §4, §7 OUTPUT.6 |
| C10 | "Template Studio (~2 days)" (v6 §4 OUTPUT.3) | TipTap is an editing foundation only; the ERP builds schema, chips/allowlists, clause/style controls, governance wiring, preview, versioning, sanitization, accessibility, autosave (if approved), baselines, permissions, audit. Real stamps/signatures NEVER reach the browser editor — protected placeholders in design/preview; server-side injection at issuance under `reports.sign`. Phased estimate with a demo gate (§7 OUTPUT.3A/3B, ~5–6 days total). | §2, §7 OUTPUT.3A/3B |
| C11 | Spike = "one certificate + Arabic smoke page" (v6 §4) | Strengthened spike matrix (§5.1): EN+AR/RTL, fonts, 2 branding profiles + data-driven proof, watermark/header/footer, QR activation-last, placeholders only, short/long text, multi-page pagination/page-breaks/repeating table headers, fixed-size card check, preview-vs-PDF rasterized diff, version capture, final-byte SHA-256, PDF/A as separate experiment with post-conversion hashing, timeout/unavailable/partial-failure behavior. Quantitative acceptance + stop/fallback rule. | §5.1, §7 SPIKE |
| C12 | Schedules: "worker or hide" undecided at production risk (v6 §4 OUTPUT.6 / Q6) | Hide/feature-disable the schedules UI early (OUTPUT.1 allowed change), retain data/history, build the worker later as its own deliverable (OUTPUT.7), re-enable UI only after auth/idempotency/retries/observability/delivery tests + UAT pass. | §7 OUTPUT.1/OUTPUT.7, §11 Q6 |
| C13 | Global scope stated once (v6 §1.1) | Global scope + mandatory onboarding contract re-stated across architecture, phases, decisions; explicitly beyond the 8 cards and the current 26+1 registry rows; one framework ≠ one renderer for everything. | §1, §8, §11 |
| C14 | Approval policy summarized (v6 §1.3) | Clarified: `reports.sign` mandatory before stamp/signature injection; class/template policy may require second approval; salary-with-amount + sensitive NOC default to approval-required unless Sameer approves otherwise; verification pages redact sensitive values; AI outputs are drafts and can never issue/approve/sign/email/publish. | §3.7, §11 Q3 |
| C15 | Open-decisions table mixed recommendations with implied approvals (v6 §8) | Rewritten decision register with evidence, recommendation, explicit status (nothing marked approved without proof), and owner/gate. | §11 |
| C16 | "17 of 19 template rows hold empty layouts" (v6 §0) | **Corrected by live re-verification (2026-07-26):** 18 non-deleted template rows total; 16 have NULL/empty (`{}`) layouts; 2 meaningful (ID 14 archived, ID 15 draft — same "To Whom It May Concern" design); 4 published; **0 published rows have a meaningful layout**. The v6 "17/19" was an arithmetic error; the "16 of 18" figure is scope-identical and correct. HR-specific subset: `hr-employment-letter-en` (ID 19) is published with an empty layout. | §0, §6 |

---

## 1. NORMATIVE GLOBAL ARCHITECTURE (approved in Phase 2 — preserved)

### 1.1 Scope and extensibility (explicit)

One **Global ERP Output Framework** covering: every existing HR letter, certificate, form, card, checklist and report (all 26 HR registry rows + the Admin matrix — and every FUTURE HR output beyond the current eight cards and current registry inventory); the shared table-export engine consumers (Admin, Master Data, DMS); DMS expiry attachments; and all future DMS, Finance, Procurement, Inventory, Fleet, Workshop, Transport, Weighbridge, HSE, Recruitment, Payroll and other module outputs. Unlimited future companies and branding profiles (data rows, never code). Unlimited future output types (registry rows + class policy, never new pipelines). **Mandatory rule: every new module output joins this framework through the registry/provider/template/policy contract (§8). Independent module PDF pipelines are prohibited.** One global framework does NOT mean one identical renderer for every output or one identical layout — the class/adapter model below is the approved shape.

### 1.2 The framework

```
Module (any) ─▶ Output Registry row (module_code, output_code, document_class,
               formats, permissions)                     [erp_report_registry — generalized]
            ─▶ Data contract: OutputDataProvider fetcher (server action;
               getAuthContext + hasPermission + field redaction)
            ─▶ Template Registry (erp_report_templates): structured body JSON
               + frame options; draft→review→publish governance (existing)
            ─▶ Branding resolver: erp_branding_assets versioned; automatic by
               owner_company_id; explicit authorized choice for mixed-company
            ─▶ Class-policy engine (§2): renderer/storage/serial/QR/approval/
               watermark per class — configurable, no hardcoded document names
            ─▶ Issuance coordinator (official classes): §3 lifecycle
            ─▶ Canonical HTML: Executive Ledger server-side builder
               (EN now; AR/RTL is template/profile work, not an engine swap)
                       │
     ┌─────────────────┼──────────────────────────────┐
 Preview (iframe,      Official PDF:                  Analytical/exports:
 watermarked)          Gotenberg RAW-HTML (Chromium)  existing jsPDF/ExcelJS/
                       → erp-generated-pdfs           CSV + Graph email
                         (non-overwritable, private)  (unchanged)
```

**Fidelity rule (corrected — C8):** for designed documents (classes A–D) the admin design preview, the user preview and the final PDF are produced from the **same canonical HTML/CSS, the same assets, the same data snapshot and the same template version**, rendered by the **same engine family (Chromium)** — in-app preview by the user's browser Chromium, final PDF by Gotenberg's pinned Chromium. Pixel identity is NOT promised: Chromium versions and runtime environments differ. The planning guarantee is *tested* fidelity: Gotenberg's Chromium version captured on every issuance, browser-vs-Gotenberg visual regression baselines with documented tolerance and review rules for fonts, line breaks, margins, pagination, tables, stamp/signature position and QR placement (SPIKE.1 + OUTPUT.5). Editor-renders-X-but-prints-Y architectures remain forbidden.

Renderer decisions preserved from Phase 2: Gotenberg/Chromium = official stored-PDF renderer (subject to SPIKE.1); Executive Ledger = canonical HTML builder; TipTap-based structured Template Studio (§2 of studio scope in §4/§7) = admin design surface; jsPDF/ExcelJS/CSV unchanged for classes E/F; Puck retired non-destructively (§6); **pdfme remains rejected as the global engine** and survives only as a future gated candidate for a narrowly justified fixed-size class (D) if later evidence requires it.

## 2. OUTPUT-CLASS STRATEGY (with QR validity — C1)

| Class | Members | Renderer | Stored | Serial | Public QR + default validity | Approval |
|---|---|---|---|---|---|---|
| A Official external docs | employment cert, experience cert (SEPARATE identities — never merged), salary certs, NOC, authority letters | Gotenberg raw-HTML | ✔ immutable | ✔ | ✔ file-bound. Employment/experience: **long-term / valid-until-revoked**. Salary-with-amount + sensitive NOC: **~90-day initial default** (template policy may override) | salary-with-amount + sensitive NOC: **required by default** (Q3); others per template policy |
| B Flowing multi-page letters | long letters/contracts | same | ✔ | ✔ | per template policy | per policy |
| C Internal forms/checklists | PPE, joining, clearance, future DMS cover sheets | same, internal profile | ✔ | optional | ✘ (unless an explicitly approved class policy adds it) | ✘ |
| D Cards/badges/labels | employee ID card, badges, labels | same, fixed `@page` (pdfme/GrapesJS = gated fallback for this class only) | ✔ | card no. | ✘ (internal QR later) | ✘ |
| E Analytical reports | 18 HR + admin matrix + future module reports | existing jsPDF/ExcelJS/CSV/print | run audit | run ref | prohibited | ✘ |
| F Exports/attachments/scheduled | list exports, attachments | ExcelJS/CSV/jsPDF + Graph | ✘ | run ref | prohibited | ✘ |
| G AI drafts | letter wording drafts | never rendered officially | never | never | prohibited | drafts only — can never issue/approve/sign/email/publish |

Validity, revocation, supersession, metadata disclosure and public-download behavior are **configurable per document class and per template** — stored as policy data, never hardcoded to document names.

## 3. ISSUANCE LIFECYCLE, QR, HASH, STORAGE AND REISSUE POLICY

### 3.1 Recoverable lifecycle and canonical sequence (C5)

States: `pending → rendering → uploaded → issued`, plus controlled failure/recovery states: `failed_retryable`, `failed_terminal`, `cancelled`, `reconciliation_required`.

Canonical sequence:
1. validate permissions, company scope, template policy and required data;
2. establish **request idempotency** (§3.3);
3. reserve issuance record + serial where class policy requires (`global_numbering_rules`);
4. create the QR verification token **inactive/non-public**;
5. render the PDF containing the verification token/URL (Gotenberg raw-HTML; Chromium + renderer versions captured);
6. perform permitted post-processing (optional PDF/A, metadata write);
7. calculate **SHA-256 of the exact final stored bytes** (§3.2);
8. upload to non-overwritable, private storage (`erp-generated-pdfs`, unique path);
9. finalize the issuance record and the **one canonical QR-to-PDF relationship**: `erp_output_public_links.generated_pdf_document_id → erp_generated_pdf_documents.id` (the PDF row never references the link — no circular FKs);
10. **activate** public verification only after successful finalization (single UPDATE);
11. compensation/reconciliation: any failure before (10) leaves the token inactive (no orphan valid QR); a scheduled reconciliation sweep detects orphaned storage objects and incomplete issuances and marks `reconciliation_required` for the Operations Console (§4).

### 3.2 Integrity hash (C4)

The issuance integrity checksum is **SHA-256 of the exact final stored PDF bytes** — computed after rendering, all permitted metadata processing, any PDF/A post-processing and any other byte-changing finalization, at/immediately before the final storage step, and verifiable later against the stored object. Stored on the issuance record with template id+version, branding asset versions, renderer/Chromium versions and the data snapshot. **Normalized-metadata hashing is only a visual/regression test technique** (OUTPUT.5) to compare renders across runs — it is never the integrity hash of an issued file.

### 3.3 Request idempotency vs content fingerprint vs reissue (C3)

- **Request-level idempotency:** each generation request carries a client-generated request key; the coordinator enforces uniqueness per request so double-clicks, retries and repeated deliveries of the *same request* cannot create duplicate issuances.
- **Content fingerprint:** hash of (output code + record data snapshot + template version + branding versions), stored for detection/warning ("an identical document was issued on {date} — serial {…}"). It is **not** a uniqueness constraint.
- **Authorized reissue:** an authorized user MAY reissue an unchanged document for a valid business reason. A reissue creates a new issuance record and a new serial where policy requires; records reason, actor, timestamp and approval; links to the prior issuance via `supersedes_issuance_id` (single direction; the prior record gains derived `superseded_by` visibility through query, not a second FK); the earlier immutable record and file are preserved. The PDF hash/content fingerprint must never block a legitimate reissue.

### 3.4 QR verification behavior (C1, C5)

Public verification displays controlled, policy-approved metadata only (document type, serial, issue date, company, validity status). It must **not** automatically expose or allow download of private PDFs — especially salary documents and sensitive NOCs; any document download is a separate, permissioned, policy-controlled action. Display rules are defined separately for: **expired** (validity elapsed — shown as expired, metadata per policy), **revoked** (shown revoked with date, no metadata beyond policy), **superseded** (shown superseded; the newer document is not exposed unless policy allows). Token entropy/enumeration protections and sensitive-value redaction carry forward from HR.LETTERS.0/BRANDING.9 verified state.

### 3.5 Existing 13 QR links (C2)

Non-destructive process (OUTPUT.1 deliverable): inventory each of the 13 live `valid` links → identify document, company, owner, circulation status, expiry, metadata quality, and any linked stored PDF (none are file-bound today — VERIFIED) → classify each as *preserve / legacy-visible / revoke / expire / reissue / unresolved* → **authorized human review (Sameer or delegate) approves any material action per link** → audit trail retained for every action. No bulk cancel, revoke, delete or reissue.

### 3.6 `dms-temp` cleanup — mandatory deliverable (C6)

Upgraded from proposal to a **testable OUTPUT.1 deliverable** (design + acceptance criteria in this plan; implementation in OUTPUT.1; remains a pre-production blocker until implemented and verified):
retention duration + configuration ownership (ops-configurable, default proposed 7 days); eligible object/status rules (only objects with no active intake/job reference); exclusions: legal hold, active processing, failed-job quarantine, manually retained; worker/scheduler ownership on the existing `/api/internal/*` bearer-auth pattern; safe batching with retry + idempotent deletes; **dry-run/report-only mode**; audit records + metrics (objects scanned/deleted/skipped); orphan reconciliation against DMS tables; failure alerts to the Operations Console; company isolation + least-privilege service credentials; test coverage (unit + integration with fixture objects); rollback/disable switch (env flag).

### 3.7 Approvals and sensitive documents (C14)

`reports.sign` is mandatory before any official stamp or signature is injected — injection happens **server-side only** at issuance. Template/class policy may require a second approval. **Salary certificates containing amounts and sensitive NOCs initially require approval** unless Sameer explicitly approves a different policy (Q3). Verification pages redact sensitive values. AI outputs remain drafts and cannot directly issue, approve, sign, email or publish official documents.

## 4. TEMPLATE STUDIO — SCOPE AND SECURITY BOUNDARY (C10)

**TipTap is an editing foundation, not a ready-made ERP Template Studio.** The ERP must build and validate: the structured template schema; approved variable chips + per-output allowlists; clause/section controls (including list-level reorder); style controls (approved fonts, size, weight, color, alignment, spacing); draft/review/publish governance wiring; live A4 preview integration (same canonical HTML builder as issuance); template versioning; sanitization and injection defenses (existing sanitizing ProseMirror renderer extended + allowlist validation at save AND generate); accessibility; autosave/recovery behavior (if approved in the demo gate); visual-regression baselines; permissions and audit.

**Protected-asset boundary:** real stamp and signature images are NEVER exposed to the browser editor. Design and preview use clearly marked protected placeholders; authorized real assets are injected server-side only during official issuance under `reports.sign` and applicable approval policy.

**Boundary preserved:** unrestricted free-pixel design is not part of official-document scope unless separately approved after a class-specific spike (gated add-ons pre-identified: GrapesJS BSD-core / pdfme class-D). Frame geometry (header/footer/margins/stamp/QR positions) remains company-level policy, not editable in the Studio.

**Estimate:** phased and evidence-based — OUTPUT.3A prototype + Sameer demo gate (~1.5 days), OUTPUT.3B full build (~3.5–4.5 days). The v6 "~2 days" estimate is withdrawn as unsupported.

## 5. GLOBAL OUTPUT OPERATIONS CONSOLE (NEW — C9)

A module-agnostic administrator workspace (planned; placed at OUTPUT.6) providing: all-module issuance history; lifecycle status and stage timings; retryable and terminal failures with controlled **retry/cancel** actions; orphan-object and incomplete-issuance reconciliation queues; QR status/expiry/activation/revocation management; template, policy, branding and renderer version visibility per issuance; serial-allocation anomaly detection; download/print/email/delivery history; schedules and delivery status (when the worker exists); renderer/worker health and operational metrics; tenant/company filtering under strict RLS and permission boundaries; immutable audit events for every administrative action.

Security model: new permissions (`outputs.ops.view`, `outputs.ops.retry`, `outputs.ops.revoke` — final names in OUTPUT.1 migration design); company scoping identical to the underlying tables; sensitive-document **metadata visible, content not** — viewing a protected PDF still requires the document-level permission (separation of duties: an ops admin can see that a salary certificate failed without being able to open it); revoke/retry actions audit-logged and, where policy requires, second-approved.

### 5.1 Strengthened `OUTPUT.SPIKE.1` scope (C11) — planning definition only

Safe fixtures + protected placeholders only (no production employees, credentials, stamps, signatures, or live issuance). Test matrix: English; Arabic shaping + RTL layout; embedded and fallback fonts; **two distinct company branding profiles** + proof branding is data-driven (a third synthetic company added as fixture data only); logo/header/footer/watermark behavior; QR rendering with the activation-last design; stamp/signature **placeholders**; short and long body text; multi-page pagination, page breaks, widow/orphan behavior where relevant; repeating table headers; a fixed-size card/label render as a bounded class-D check; browser-preview vs Gotenberg rasterized-page comparison; renderer + Chromium version capture; exact final stored-byte SHA-256; PDF/A as a **separate post-processing experiment including hashing after conversion**; timeout, renderer-unavailable and partial-failure behavior.

Acceptance criteria (quantitative + qualitative): all pages render with correct pagination; fonts embedded (pdffonts); Arabic sample shaped correctly under native-reader review; visual diff between in-app preview and rasterized PDF within documented tolerance per element category (fonts/line breaks/margins/tables/stamp/QR positions) with reviewer sign-off; version capture present; hash reproducible against stored bytes; failure paths degrade cleanly. Evidence artifacts: fixture HTML, PDFs, rasterized diffs, versions log, written result. Rollback: delete spike code. **Stop/fallback rule:** a failed raw-HTML spike does NOT automatically trigger a new global renderer — it returns to the architecture decision gate with evidence (fallback candidate: URL-mode `/print/*`, already working).

## 6. PUCK PRESERVATION AND RETIREMENT GATES (C7, C16)

**Corrected counts (VERIFIED — live DB 2026-07-26):** `erp_report_templates` has **18** non-deleted rows; **16** have NULL/empty (`{}`) `body_layout_json`; **2** have meaningful layouts — **ID 14** (archived) and **ID 15** (draft), both "To Whom It May Concern" (identical size, 7,307 chars); **4** rows are published; **0 published rows have a meaningful layout**. Non-null-but-empty `{}` is NOT a meaningful design; `templateHasVisualLayout()` rejects it, so the Puck visual path fires for zero published templates today (VERIFIED — code). Earlier "17 of 19" (v6) was an arithmetic error; "16 of 18" is correct at whole-table scope.

**RETIRE.0 — Evidence preservation (no discard):** for templates 14 and 15 (and any other meaningful layout found at execution time): preserve original layout JSON in locked legacy history (read-only archive location + DB rows untouched); preserve template metadata and governance status; extract wording/content; capture editor/canvas screenshots where renderable; produce rendered reference output where possible; write a migration/re-authoring map to the Template Studio representation; record a checksum and audit entry for the preserved evidence package.

**RETIRE.1 — Controlled removal (approval-gated, after OUTPUT.3):** remove only approved editor code/routes and **Puck-only** dependencies (`@puckeditor/core`) after the retirement gate passes. Never delete template rows, historical JSON, report runs, generated PDFs or audit records. **TipTap usage re-verified before any dependency change** (current evidence: all 8 `@tiptap/*` packages import only inside the report-designer feature — and TipTap is KEPT for the Studio). Flag-gated single commit; rollback = revert.

## 7. IMPLEMENTATION PHASES (v6.1)

Each phase: objective/scope/dependencies/allowed + excluded changes/deliverables/DB + security impact/tests/acceptance/rollback/stop conditions as stated. **No phase may activate official issuance before the security (OUTPUT.1), lifecycle/renderer (OUTPUT.2), spike (SPIKE.1) and UAT (OUTPUT.5) gates pass.**

### QUICK FIX (pre-phase, 30–60 min) — AI letters FK
Unchanged (verified FK hints + surface the PostgREST error). Independent; no schema change. Rollback: revert.

### OUTPUT.SPIKE.1 — Gotenberg Raw-HTML Fidelity Spike (~1–1.5 days, BLOCKING GATE)
Scope per §5.1. Dependencies: Sameer approves v6.1. Excluded: schema changes, UI, real data/assets, issuance. Acceptance/rollback/stop per §5.1.

### OUTPUT.1 — Global Security & Data-Model Foundation (~2.5–3 days)
- storage.objects explicit policies (`erp-generated-pdfs` + DMS buckets); signed-URL issuance audit; company scoping on generated-PDF/public-link/run SELECTs.
- **`dms-temp` cleanup implementation** per §3.6 (mandatory deliverable, pre-prod blocker).
- **13-link QR inventory process** per §3.5 (classification + human-review workflow; no bulk action).
- Migration (single, designed here, applied in-phase): issuance lifecycle columns (request idempotency key, content fingerprint, serial, branding/renderer versions, snapshot, `supersedes_issuance_id`, revoke/supersede fields, lifecycle state), `erp_output_public_links.generated_pdf_document_id` (canonical FK), class-policy + QR-validity-policy storage, `document_class` on registry, structured-body columns + `visual_editor_engine='studio'`, per-output variable allowlists, Operations Console permissions; backfill `template_id` on the 2 stored PDFs; resolve `hr-employment-letter-en` security-review status.
- `src/lib/issuance/` lifecycle + idempotency module (no UI).
- **Allowed change (C12): hide/feature-disable the schedules UI** (data/history retained).
- Tests: storage-policy denial, scoping, cleanup dry-run, lifecycle unit tests. Rollback: migration down + revert + un-hide flag. Stop: policy tests fail.

### OUTPUT.2 — Renderer & Template Foundation + Issuance Coordinator (~3 days)
- Server HTML builder (EL + structured template body + allowlisted variables + branding data-URIs — fixes BUG-2 globally).
- Promote spike code to the `renderOfficialPdf` adapter (raw-HTML); `/print/*` URL-mode retained for record-context templates.
- `generateOfficialDocument(outputCode, recordId, …)` coordinator implementing §3.1–§3.4 exactly (activation-last QR, final-byte hash, reissue model).
- Retire standalone `generate-hr-letter.ts` path (rows/history kept).
- Write `.cursor/rules/erp-output-framework-standard.mdc`; correct `pdf-architecture.mdc` (NEW-2).
- Tests: lifecycle/idempotency/reissue/partial-failure unit + Gotenberg CI E2E. Rollback: adapters behind flag; old path intact until OUTPUT.5. Stop: coordinator failure-path tests fail.

### OUTPUT.3A — Template Studio Prototype + Demo Gate (~1.5 days)
Prototype per §4 (schema draft + TipTap editor with chips + live preview on fixtures + placeholder assets). **Deliverable: demo to Sameer — explicit checkpoint on the structured-vs-free-form boundary (Q11).** Stop: requirement mismatch → gated add-on evaluation, never a silent rebuild.

### OUTPUT.3B — Template Studio Full Build (~3.5–4.5 days)
Full §4 scope: governance wiring, versioning, sanitization/injection defenses, accessibility, autosave (if approved at 3A), visual baselines, permissions, audit. Depends on 3A gate pass.

### OUTPUT.4 — HR First-Adopter UX (~1.5–2 days)
Employee Letters & Forms tab (validation panel, per-class primary actions, issued-history with Issued/Revoked/Superseded/Failed chips + permissioned Revoke/Reissue, AI-draft side action); simplify `LetterPreviewDialog` (remove visualHtml path); remove letter generator from Report Center; registry shortcuts. Employment and Experience remain separate catalog entries.

### OUTPUT.5 — Security/Runtime/Visual UAT (~2.5 days, production-activation gate)
Full matrix: 26+1 catalog; role/tenant; Gotenberg E2E; **integrity hash = final stored bytes verification** (C4); normalized-metadata comparisons only as regression technique; browser-vs-Gotenberg visual regression per class with documented tolerances (C8); lifecycle/duplicate-click/reissue/partial-failure/orphan-reconciliation; QR activation/expiry/revocation/supersession display behavior per §3.4; storage-policy denial; cross-company isolation; Arabic smoke; load/concurrency/timeout on Gotenberg. **Production activation of the coordinator only after full pass + Sameer sign-off (Q13).**

### OUTPUT.6 — Global Output Operations Console (~2.5–3 days; may start after OUTPUT.2, ships after OUTPUT.5)
Per §5, with permissions/scoping/redaction/separation-of-duties, acceptance criteria (every lifecycle state visible and actionable per permission; no protected content exposure), rollback (feature-flag), and UAT coverage added to the OUTPUT.5 matrix or a follow-up UAT slice.

### OUTPUT.7 — Schedules Worker + UI Re-enable (~1.5 days, decision Q6)
Build `/api/internal/report-schedules/process` worker (existing internal-API auth pattern) with idempotency, retries, observability and delivery tests; re-enable the schedules UI **only after** those pass + UAT. If Sameer instead decides to drop scheduling, the UI stays hidden and data retained.

### REPORT.DESIGNER.RETIRE.0 — Evidence Preservation (parallel with OUTPUT.2/3)
Per §6. No deletions.

### REPORT.DESIGNER.RETIRE.1 — Controlled Removal (approval-gated — Q12, after OUTPUT.3B)
Per §6.

**Sequencing:** QUICK FIX anytime → SPIKE.1 (gate) → OUTPUT.1 → 2 → 3A (gate) → 3B → 4 → 5 (gate) → 6 → 7; RETIRE.0 parallel with 2/3; RETIRE.1 after 3B with explicit approval.
**Estimate (evidence-based, v6.1):** ~21–24 engineering days including UAT and the RETIRE phases (sum of phase ranges above: SPIKE 1–1.5 + OUTPUT.1 2.5–3 + OUTPUT.2 3 + OUTPUT.3A 1.5 + OUTPUT.3B 3.5–4.5 + OUTPUT.4 1.5–2 + OUTPUT.5 2.5 + OUTPUT.6 2.5–3 + OUTPUT.7 1.5 + RETIRE.0/1 ~1.5). v6's 11–13 was optimistic: it under-scoped the Studio, omitted the Console, the `dms-temp` cleanup deliverable and the strengthened spike.

## 8. FUTURE-MODULE ONBOARDING CONTRACT (unchanged, restated as mandatory)

A new module output requires: (1) registry row (`module_code`, `output_code`, `document_class`, formats, permissions); (2) typed `OutputDataProvider` fetcher (server action; `getAuthContext`+`hasPermission`+redaction); (3) permission seeds; (4) template (Studio-authored or code print-kit for record-context docs); (5) branding policy (automatic by `owner_company_id` unless class E mixed-company); (6) class policy row incl. QR validity; (7) fixture + visual baseline + RLS tests; (8) menu entry. **No renderer code, no new pipeline — mandatory for all modules.** Codified as `.cursor/rules/erp-output-framework-standard.mdc` in OUTPUT.2.

## 9. MANUAL / OPS TASKS (v6.1)

| Task | Status |
|---|---|
| Complete ASL signatory name/title | Branding UI, 2 min |
| Rotate static worker bearer secrets | Ops (Q9 — pending) |
| Verify Railway `GOTENBERG_URL`/`PDF_PRINT_TOKEN_SECRET`/`INTERNAL_SITE_URL` before SPIKE.1 (Gotenberg = primary official renderer) | Ops (pre-spike) |
| Optimize 1.1 MB signature PNG | Q8 — pending |
| Decide schedules worker vs permanent hide | Q6 — pending (UI hidden either way in OUTPUT.1) |
| Per-link decisions on the 13 QR links after the OUTPUT.1 inventory | Sameer/delegate review (Q4) |

## 10. FILES-IMPACT INVENTORY (PLANNED — nothing implemented)

**Dependencies:** none added for the core decision (Gotenberg deployed; TipTap installed). Removed at RETIRE.1 only: `@puckeditor/core` (after re-verification). pdfme: NOT installed.
**Fix (planned):** `hr-ai-letters.ts` (FK hints) · branding loader → assets registry + data-URIs · `renderer.ts` raw-HTML wiring · `.cursor/rules/pdf-architecture.mdc` corrections.
**Create (planned):** `src/lib/issuance/*` · `src/lib/output-framework/*` (class + QR-validity policy, adapter contract, allowlists, content fingerprint) · server HTML builder · `src/server/actions/pdf/generate-official-document.ts` · `src/features/report-center/template-studio/*` · `src/features/admin/output-operations/*` (Console) · dms-temp cleanup worker · schedules worker (Q6) · `employee-letters-tab.tsx` · OUTPUT.1 migration · `erp-output-framework-standard.mdc` · RETIRE.0 evidence package under `implementation_Review/PDF/legacy_puck_evidence/`.
**Modify (planned):** `letter-preview-dialog.tsx` · `employee-workspace-form.tsx` · report-center run list · registry menus · schedules UI feature flag.
**Retire (planned, non-destructive):** `hr-letter-generator.tsx` from Report Center · standalone `generate-hr-letter.ts` · `ExecutiveLedgerPreviewDialog`.
**Remove (planned, RETIRE.1 only, approval-gated):** report-designer feature + `@puckeditor/core` + production-renderer stack (TipTap kept; DB rows/history never deleted).

## 11. OPEN DECISIONS AND APPROVAL GATES (v6.1 — explicit statuses; nothing inferred as approved)

| # | Decision / question | Evidence | Recommendation | Status | Gate / owner |
|---|---|---|---|---|---|
| Q1 | Employment + Experience Certificates: share template components while keeping SEPARATE document identities | Phase 2 rule: business identity ≠ technical reuse | Keep separate identities; allow shared components | **Pending Sameer approval** | v6.1 review |
| Q2 | Keep watermarked Quick Print alongside Official PDF | UX analysis (v4/§7 report §18) | Yes | **Pending Sameer approval** | v6.1 review |
| Q3 | Approval policy per class | §3.7; sensitive-data risk | Salary-with-amount + sensitive NOC: approval required initially | **Pending Sameer approval** (default applies unless he overrides) | v6.1 review |
| Q4 | 13 existing QR links | All 13 `valid`, metadata-only, no file binding (VERIFIED — live DB) | Inventory + per-link classification + human review (§3.5) — **no bulk action** | Process **pending approval**; per-link actions **blocked** until OUTPUT.1 inventory + review | OUTPUT.1 / Sameer or delegate |
| Q5 | QR validity policy | §2 class table | Class/template-configurable: employment/experience long-term or until-revoked; salary/sensitive-NOC ~90 days; others none | **Pending Sameer approval** | v6.1 review |
| Q6 | Schedules: build worker vs permanent hide | Worker never wired; failures accumulated (VERIFIED) | Hide UI in OUTPUT.1 (either way); build worker in OUTPUT.7 | Hide = planned; worker decision **pending Sameer** | OUTPUT.7 |
| Q7 | Legacy Puck templates 14/15 | 2 meaningful layouts; 0 published-meaningful (VERIFIED) | **Preserve evidence package; discard nothing** (§6) | Preservation = plan requirement (not optional); re-authoring map **pending RETIRE.0** | RETIRE.0 |
| Q8 | Optimize 1.1 MB signature PNG | Asset audit (HR.LETTERS.0) | Yes | **Pending Sameer/ops** | ops task |
| Q9 | Rotate hardcoded worker bearer secrets | HR.LETTERS.0 finding | Yes | **Pending ops** | pre-production |
| Q10 | Approve `OUTPUT.SPIKE.1` as the blocking gate (scope §5.1) | Raw-HTML mode has zero call sites (VERIFIED — code) | Yes — smallest possible proof, fixtures only | **Pending Sameer approval** | v6.1 review |
| Q11 | Accept the structured Template Studio boundary (wording/style/color/section-reorder; frame governed; NO free-pixel design for official docs) | Puck history: free-form built, 0 production designs, fidelity failure (VERIFIED) | Yes; gated add-ons pre-identified if a class later needs free-form | **Pending Sameer approval** + OUTPUT.3A demo gate | v6.1 review + 3A demo |
| Q12 | Puck retirement (RETIRE.1 removal) | §6; non-destructive; evidence preserved first | Approve after RETIRE.0 evidence package + OUTPUT.3B | **Blocked** until RETIRE.0 + 3B complete; then **pending Sameer approval** | RETIRE.1 gate |
| Q13 | Production activation of official issuance | §7 OUTPUT.5 | Activate only after full UAT pass | **Blocked** until OUTPUT.5 pass; then **pending Sameer sign-off** | OUTPUT.5 gate |

## 12. FINAL NEXT-STEP STATEMENT

This plan is **v6.1, PLANNING — NOT IMPLEMENTED**. The next step is: **Sameer reviews and approves v6.1 → the `OUTPUT.SPIKE.1` execution prompt is prepared and approved → the spike runs on fixtures with protected placeholders → spike evidence is reviewed → only then is `OUTPUT.1` implementation authorized.** No implementation, migration, package, database, storage or infrastructure change may begin before that sequence, and no phase may activate official issuance before the OUTPUT.1 security gate, OUTPUT.2 lifecycle gate, SPIKE.1 fidelity gate and OUTPUT.5 UAT gate have all passed.

*End of Plan v6.1.*
