# HR Letters & Certificates — Deep Enhancement Plan

**Created:** 2026-07-24  
**Updated:** 2026-07-24 (v3 — Report Designer retirement decision added)  
**Status:** PLANNING — Not yet implemented  
**Scope:** HR Letters, Certificates, PDF generation, AI letter drafts, Report/Letter template authoring standard — full consolidation and production enhancement

**Version history:**
- v1 — initial bug investigation (AI letters, logo/stamp/QR) + phased enhancement plan
- v2 — discovered two parallel PDF pipelines (Gotenberg vs Report Center engine), corrected plan to unify instead of duplicating templates
- v3 — investigated the Report Designer (Puck visual editor) that Pipeline B partially depends on for visual layouts; decided to retire it in favor of a code-first template authoring standard, and folded that decision into Phase 0 (this affects HOW Phase 0 is built, not whether it's needed)

---

## 0. CRITICAL DISCOVERY (v2) — Two Parallel, Independently-Built Systems

The deeper investigation for this v2 update found something more important than the 4 bugs from v1: **the "multiple places confusing me" feeling is not a UI labeling problem — it is two entire, independently engineered backend systems that both generate HR letters, overlapping almost completely.**

### Pipeline A — "Gotenberg PDF" (built 2026-07-23, yesterday)
- Entry: Employee tab → "Employment Letter (Official PDF)" button
- `generateHrEmploymentLetterPdf` → `/print/[templateKey]/...` route → **Gotenberg** (separate Railway microservice, headless Chromium) → PDF bytes → stored in `erp-generated-pdfs` bucket → history row
- Covers **1 letter type only**: Employment Certificate
- Has the 3 bugs already found: no logo, no stamp, no QR
- **Real advantage:** produces a genuine, immutable, stored PDF file — a real audit trail

### Pipeline B — "Report Center Engine" (built earlier — REPORT.2 / BRANDING.6–8 / DESIGNER.6 phases)
- Entry: Employee tab → Letters grid (8 cards) → "Generate" → `LetterPreviewDialog`
- `runReportAction` → **registered report fetcher** (real, working — verified in `report-fetchers.ts`) → data → `resolveReportBranding` (auto-detects the right company branding profile) → "Formal View" (Executive Ledger renderer or Puck-designed visual layout) → **browser print-to-PDF** (hidden iframe, `window.print()`)
- Covers **8 letter/form types today**, all already registered and wired to real data fetchers:
  `HR_EXPERIENCE_LETTER`, `HR_NOC`, `HR_SALARY_CERT_GENERAL`, `HR_SALARY_CERT_WITH_AMOUNT`, `HR_EMPLOYEE_ID_CARD`, `HR_PPE_ISSUE_FORM`, `HR_JOINING_CHECKLIST`, `HR_CLEARANCE_FORM`
- Already has a **working QR verification system** (BRANDING.6/8): "Issue QR" button creates a signed public verification link + real QR image, checks the template's governance status before allowing issuance, copy-to-clipboard, "Verified" badge — this is the exact feature Pipeline A is missing and I had planned to build from scratch in v1 of this plan.
- Already has **automatic branding resolution per company** (`resolveReportBranding` in `branding-resolver.ts`) — no hardcoded company logic, supports unlimited companies, single/multi-company detection.
- Already has a **visual template designer** (Puck-based, DESIGNER.6) — a non-technical admin can lay out a letter visually instead of editing React/TSX code.
- Already has a **governance-gated audit trail** (`erp_report_runs` table logs every run: who, when, which template, which branding, sensitive data flag).
- **Real weakness:** the final "PDF" is produced by the *browser's* native print-to-PDF, not a server-rendered file. Nothing is stored server-side. There's no `pdf_generation_history` row, no guaranteed byte-identical re-download, and rendering can vary slightly by the user's OS/browser print engine. For UAE legal/bank/embassy documents, this is a genuine gap.

### Why this matters
My v1 plan told you to spend **3–5 days building 6 new Gotenberg templates from scratch** (NOC, Salary Cert x2, Warning Letter, Experience Letter, Offer Letter) — but **working data-fetchers, branding, and even QR verification already exist for almost all of these in Pipeline B.** Building them again in Pipeline A would be pure duplicate engineering.

### Corrected Recommendation
**Do not build a second full set of templates. Unify the two pipelines around Pipeline B's data/branding/QR engine, and give it Pipeline A's one real advantage (server-stored, immutable PDF) by routing its already-built HTML through Gotenberg instead of the browser's print dialog.**

This is a much smaller, much higher-leverage piece of work than v1 proposed. Details in Phase 0 below.

---

## 0.1 CROSS-CUTTING DECISION (v3) — Report Designer (Puck) Is Being Retired

While investigating Pipeline B for this plan, its "Formal View" was found to optionally render via a **custom visual drag-and-drop designer** built on top of the open-source `@puckeditor/core` library (referred to below as "the Designer"). This is a separate, much larger investigation that goes beyond HR letters — it affects every current and future module that would ever use a visually-designed report/letter layout. Full findings were discussed and a direction was agreed; this section records the decision and its impact on this plan specifically.

### What was found
- The Designer is **~11,300 lines of custom code across 48 files**, built across 9 base phases plus 3 additional "UX improvement" phases (rich text editor, field picker, sensitive-field governance) — the fact that 3 extra phases were needed just to make the base tool usable is itself a sign the underlying approach was too complex for the actual need.
- Root cause: the tool chosen (Puck, a general-purpose visual **page-builder**) solves a bigger, harder problem ("arrange arbitrary content freely on a canvas") than the actual need ("fill in a professional letter/certificate layout with company data merged in" — a mail-merge/document-templating problem). Making a page-builder safe for controlled ERP documents required bolting on a custom block library, a custom rich-text engine (TipTap/ProseMirror with a bespoke node schema), a custom field-sensitivity/governance registry, and a custom security-review layer that validates the visual JSON isn't malicious — this bolt-on safety cage is where almost all 11,300 lines went.
- Meanwhile, a **much simpler system already exists and already works**: the Executive Ledger declarative document model (`src/lib/executive-ledger/`) — plain JSON sections (`body`, `key_value`, `table`, `divider`) rendered to clean HTML. This is effectively a proper document-template model already; the Designer's only job was to let someone build that same JSON visually instead of a developer writing it in code.
- In practice, new letter templates in this codebase are built by a developer/AI writing a small TSX/TS file (see `hr-employment-letter.tsx` as the working example) — not by a business user dragging blocks. The Designer was solving a problem nobody was actually using it to solve day-to-day.
- The "Future Module Onboarding Rule" written into the Designer's UX plan required every future module (Fleet, Workshop, Procurement, Finance, ...) to register its fields into a sensitivity-classified binding registry just to feed the visual picker — meaning this complexity was set to compound with every new module, which is exactly the repeat-mistake risk flagged in this conversation.

### Decision: Retire the Designer — replace with a "Code-First Template Library"
Going forward, all report/letter/certificate templates (HR and every future module) are authored the same way `hr-employment-letter.tsx` and the Executive Ledger fetchers already are today — as reviewed code, not drag-and-drop visual JSON:

```
1. Data type          →  interface HrNocData { ... }
2. Data loader         →  async function loadHrNocData(params) { ...query DB... }
3. Layout              →  compose from a shared print-component kit:
                             <DocumentHeader />  <CompanyBranding />  <DocumentTitle />
                             <DocumentMetadata items={[...]} />  <BodyText>...</BodyText>
                             <SignatureBlock slots={[...]} />  <QRVerificationBlock />
                             <DocumentFooter />
4. Register            →  one report-registry / template-registry entry (governance stays:
                           draft → approved → published)
5. Render              →  through the existing pipeline (Gotenberg for stored PDF, or
                           Executive Ledger for screen/quick-print) — unchanged
```

**Kept (already working, load-bearing — nothing here is thrown away):**
`report-fetchers.ts` pattern · `branding-resolver.ts` · `src/lib/public-verification/` (QR) · `src/lib/executive-ledger/` (the actual document model) · `src/components/erp/print/` shared components (become THE standard component kit) · governance workflow/tables · `erp_report_registry` + permissions.

**Removed (the Puck-specific complexity):**
`@puckeditor/core` dependency and `src/features/report-designer/puck/*` · all 12 custom block components in `src/features/report-designer/blocks/*` · the TipTap/ProseMirror rich-text engine and its custom node schema · `field-registry/*` and `binding-registry.ts` (the "which field can a business user drag in" system) · `visual-template-security-review.ts` (only needed to sanitize untrusted visual JSON) · `layout-to-executive-ledger.ts` / `layout-schema.ts` / `layout-validation.ts` (Puck→EL JSON mapping) · the editor UI itself (`report-designer-editor-client.tsx`, `report-designer-test-panel.tsx`, `formal-preview-panel.tsx`) and its server actions.

**Non-technical customization still supported — via a simple settings form, not a canvas:** show/hide toggles (already exist on `TemplateForm`), branding profile picker (already exists), and one or two plain-textarea fields (e.g. footer text, a custom closing clause) with a basic "insert field" helper button — no rich-text engine, no drag-and-drop, layout itself stays code-defined.

**Governance follow-up (recommended, not yet actioned):** formalize this as a new Cursor rule (e.g. `erp-document-template-standard.mdc`, matching the pattern of `erp-child-dialog-form-standard.mdc`) so every future module automatically follows this standard instead of reinventing a visual designer.

### Impact on THIS plan (HR Letters)
**Low risk, mostly good news:**
- None of the 8 HR letter report codes currently depend on a Puck-authored visual layout — they use hand-coded fetchers/sections. Retiring the Designer does not break any HR letter functionality.
- Phase 0's Task 0.1 (server-side HTML builder) must NOT special-case "Puck visualHtml" as a first-class rendering path going forward — it should build HTML from the Executive Ledger / code-first component model only. Any reference to `visualHtml`/`renderVisualTemplateForLetterPreview` in `LetterPreviewDialog` is treated as legacy and phased out alongside the Designer, not extended.
- The Designer retirement is tracked as its own initiative (separate migration/removal work — uninstalling the dependency, deleting 48 files, updating any DB rows that reference `visual_editor_engine = 'puck'`) and does not block Phase 0–5 below, but should happen in the same general timeframe so `LetterPreviewDialog` isn't left calling into code that's being deprecated.

---

## 1. CURRENT STATE AUDIT

### 1.1 What Exists Today

| Component | Pipeline | Location | Status |
|---|---|---|---|
| Employment Letter PDF action | A (Gotenberg) | `src/server/actions/pdf/generate-hr-letter.ts` | Working, 3 bugs |
| Print route (Gotenberg fetches this) | A | `src/app/print/[templateKey]/[recordType]/[recordId]/route.tsx` | Working |
| Employment Letter template | A | `src/components/erp/print/templates/hr-employment-letter.tsx` | **BROKEN** — missing logo/stamp/QR |
| `HrLetterGenerator` (grid of 8 cards + the 1 Gotenberg button) | A + B mixed | `src/features/report-center/hr-letter-generator.tsx` | Working, but **mixes both pipelines in one UI with no explanation** |
| `LetterPreviewDialog` | B (Report Center) | `src/features/report-center/letter-preview-dialog.tsx` | Working, sophisticated (Formal View, QR issuance, template picker) |
| Report registry (8 HR letter/form report codes) | B | `erp_report_registry` (DB) | **All 8 already registered & active** |
| Report fetchers for all 8 codes | B | `src/lib/report-center/report-fetchers.ts` | **All 8 already implemented** |
| Branding auto-resolver | B | `src/lib/report-center/branding-resolver.ts` | Working, sophisticated, multi-company aware |
| QR / public verification | B | `src/server/actions/reports/public-verification.ts` + `src/lib/public-verification/` | **Working** — governance-checked, signed tokens, real QR |
| AI Letter Draft Panel | Neither (text only) | `src/features/hr/ai/hr-ai-letter-panel.tsx` | **BROKEN** — employee lookup fails |
| AI Letter server action | Neither | `src/server/actions/hr/ai/hr-ai-letters.ts` | **BROKEN** — ambiguous FK in query |
| Branding profile data | Both (shared table) | `erp_report_branding_profiles` (DB) | Row exists for Company 1, but `logo_url`/`stamp_url`/`signature_url` all **NULL** |

### 1.2 Confirmed Bugs

#### BUG-1: AI Letters — "Employee not found" (CRITICAL, still valid from v1)
- **File:** `src/server/actions/hr/ai/hr-ai-letters.ts` (~line 76–90)
- **Root cause:** Ambiguous PostgREST join. `employees` has **two** FKs into `owner_companies` (`owner_company_id` and `sponsor_company_id`). The query writes `owner_company:owner_companies(legal_name_en)` with no FK hint, PostgREST can't disambiguate, returns a silent error, `data` is `null`, code reports "Employee not found."
- **Verified:** Direct SQL join with explicit `owner_company_id` returns Sameer's row correctly — the DB and data are fine.
- **Fix:** explicit FK hint, e.g. `owner_companies!employees_owner_company_id_fkey(legal_name_en)`. Also add `branches!employees_branch_id_fkey` and `departments!employees_department_id_fkey` / `designations!employees_designation_id_fkey` hints for safety, plus log the real Postgres error instead of swallowing it.

#### BUG-2/3/4: Pipeline A's Employment Letter — missing logo, stamp, QR (still valid, but scope changes — see Phase 0)
- Root causes unchanged from v1: branding query doesn't select `logo_url`/`stamp_url`, DB has no images uploaded yet, and QR is never generated (verification library exists but unused).
- **v2 change:** Rather than fixing this dead-end template in isolation, we fold the fix into Phase 0 — the unified pipeline needs the branding images and QR wiring regardless of which pipeline renders the final PDF.

#### BUG-5 (NEW in v2): Governance/branding mismatch on `hr-employment-letter-en`
- `erp_report_templates` row for `hr-employment-letter-en` (id 19) points to `branding_profile_id = 2` ("Neutral Default Profile"), **not** Company 1's profile — but the actual Gotenberg data loader ignores this link entirely and queries `erp_report_branding_profiles` directly by `owner_company_id`. This means the governance table's branding link is decorative/unused for Pipeline A, which is confusing and inconsistent with how Pipeline B resolves branding (via `resolveReportBranding`, which *does* use this link). Any unification work must standardize on one resolution path.

#### BUG-6 (NEW in v2): Duplicate letter concept — "Employment Letter" vs "Experience Letter"
- Pipeline A's only template (`hr-employment-letter-en`, "Employment Certificate") and Pipeline B's `HR_EXPERIENCE_LETTER` ("Experience Letter") are the **same real-world document** — a letter confirming employment/tenure. Today they appear side-by-side to the user as two different buttons with two different results, with no explanation of the difference. This is very likely the #1 source of the "multiple places mixing me up" feeling.

---

## 2. ARCHITECTURE DECISION (revised)

### Old plan (v1): Keep both pipelines, build 6 new Gotenberg templates.
**Rejected.** Too much duplicate work; ignores that Pipeline B already does 90% of this well.

### New plan (v2): One pipeline, two renderers behind it.

```
Employee Record → Letters Tab (single entry point)
│
├── Data + branding + QR + governance  →  Pipeline B engine (report registry, fetchers,
│                                          resolveReportBranding, public-verification)
│                                          — KEPT AS-IS, this part already works well
│
└── Final render step — user picks (or system decides by letter type):
    ├── "Preview / Quick Print"  → existing browser print-to-PDF (fast, good for internal/quick use)
    └── "Official Stored PDF"   → NEW: same HTML piped through Gotenberg →
                                    stored in bucket + pdf_generation_history row
                                    (for letters that leave the company: NOC, salary cert,
                                     experience letter, embassy/bank letters)
```

**In practice, for the user this becomes:**
- ONE letters screen in the employee tab.
- ONE list of letter types (the 8 that already work, cleaned up — "Employment/Experience Certificate" merged into one).
- Every letter type gets a "Generate Official PDF" action. Behind the scenes it always uses Pipeline B's data + branding + QR. The only new engineering is: take the HTML Pipeline B already builds, send it to Gotenberg instead of (or in addition to) the browser print dialog, and store the result.
- The standalone `hr-employment-letter-en` Gotenberg template/route entry is retired — its bug fixes (branding query, QR wiring) get redirected into the shared branding-resolution code instead of a dead-end one-off template.
- Report Center (the global module) stops being an entry point for HR letters — it remains for company-wide reports/analytics only. HR letters live **only** in the employee record, per your instruction.

---

## 3. IMPLEMENTATION PHASES (revised)

---

### PHASE 0 — PIPELINE UNIFICATION (NEW — do this instead of v1's Phase 3)

**Goal:** Make Pipeline B's already-working engine also produce a stored, immutable PDF via Gotenberg — eliminating the need to hand-build 6 templates.  
**Estimated effort:** 1.5–2 days (much less than v1's 3–5 day Phase 3)

#### Task 0.1 — Server-side HTML builder for Pipeline B reports
Currently, the "Formal View" HTML (`renderExecutiveLedgerHtml(elDoc)`) is built and only ever consumed client-side (browser iframe + `window.print()`). Extract this into a server-callable function:
```ts
// New: src/lib/report-center/server-pdf-html.ts
export async function buildLetterHtmlServerSide(params: {
  reportCode: string;
  employeeId: number;
  templateId?: number;
}): Promise<{ html: string; resolvedTemplateId: number | null }> {
  // 1. runReport() server-side (already exists)
  // 2. resolveReportBranding() server-side (already exists)
  // 3. Build ExecutiveLedgerDocument via the code-first component/section model (already exists)
  // 4. Return full standalone HTML string
}
```
This reuses 100% of existing report-fetcher, branding-resolver, and Executive Ledger renderer code — no new template code.

**Per the v3 Designer decision (Section 0.1):** this function must build HTML exclusively from the Executive Ledger / code-first section model. Do NOT wire in or extend the Puck `visualHtml` / `renderVisualTemplateForLetterPreview` path — that path is being retired, and any new server-side rendering work should not create a new dependency on it.

#### Task 0.2 — New "official PDF" server action, reusing Gotenberg plumbing
```ts
// src/server/actions/pdf/generate-hr-report-letter-pdf.ts
export async function generateHrReportLetterPdf(input: {
  employeeId: number;
  reportCode: string;       // e.g. "HR_NOC", "HR_EXPERIENCE_LETTER"
  templateId?: number;
}): Promise<GenerateHrLetterPdfResult | GenerateHrLetterPdfError> {
  // 1. Permission check (reports.pdf.generate, same as today)
  // 2. buildLetterHtmlServerSide() — Task 0.1
  // 3. Issue QR verification link server-side (createOutputPublicLink — already exists)
  //    and inject the QR image into the HTML before rendering
  // 4. Send HTML directly to Gotenberg's HTML-to-PDF endpoint (renderer.ts already
  //    supports this — check if it currently requires a print-route URL only, or
  //    can accept raw HTML; Gotenberg's /forms/chromium/convert/html endpoint accepts
  //    raw HTML uploads directly, no URL fetch needed)
  // 5. Upload to storage, create pdf_generation_history row (existing helpers)
  // 6. Return signed download URL
}
```
**Key technical check needed before implementing:** confirm whether `src/lib/pdf/gotenberg.ts` / `renderer.ts` currently only supports the "fetch a URL" Gotenberg mode (`/forms/chromium/convert/url`) or can also submit raw HTML directly (`/forms/chromium/convert/html`). If only URL mode exists, add HTML-upload mode — this is a small addition to the existing Gotenberg client, not a new system.

#### Task 0.3 — Retire the standalone Employment Letter template
- Remove/deprecate `hr-employment-letter-en` template + its print route registry entry, OR repoint it to be a thin wrapper that calls the same underlying HR_EXPERIENCE_LETTER data (to avoid breaking any existing stored history rows referencing it).
- Fold the branding-query fix (BUG-2/3) directly into `resolveReportBranding` / `branding-resolver.ts` instead of the one-off template loader — this fixes logo/stamp for **all 8 letter types at once**, not just one.

#### Task 0.4 — Wire QR into the shared HTML builder
- Fold BUG-4's fix into Task 0.1: every server-built letter HTML calls `createOutputPublicLink` (already working, already governance-checked) and embeds the resulting QR image — reusing the exact mechanism `LetterPreviewDialog` already uses client-side, just moved server-side so it also applies to the stored-PDF path.

---

### PHASE 1 — IMMEDIATE BUG FIX: AI Letters (unchanged from v1, still needed first)

**Goal:** Fix `hr-ai-letters.ts` FK ambiguity.  
**Estimated effort:** 30 minutes

```ts
// AFTER (fixed):
const { data: emp, error: empErr } = await db
  .from("employees")
  .select(`
    id, employee_code, full_name_en, employee_status,
    joining_date, contract_type, contract_end_date,
    department:departments!employees_department_id_fkey(department_name_en),
    designation:designations!employees_designation_id_fkey(designation_name_en),
    branch:branches!employees_branch_id_fkey(branch_name_en),
    owner_company:owner_companies!employees_owner_company_id_fkey(legal_name_en)
  `)
  .eq("id", employeeId)
  .is("deleted_at", null)
  .maybeSingle();

if (empErr) {
  console.error("[HrAiLetters] Employee query error:", empErr);
  return { success: false, error: `Employee lookup failed: ${empErr.message}` };
}
if (!emp) return { success: false, error: "Employee not found." };
```
Verify actual FK constraint names against the DB before applying (names above are the conventional Postgres/Supabase default pattern, but must be confirmed).

---

### PHASE 2 — BRANDING PROFILE MANAGEMENT UI (unchanged from v1 — still needed)

**Goal:** Let an admin upload logo/stamp/signature through the app instead of raw DB edits.  
**Estimated effort:** 1 day

- New UI at `src/features/report-center/branding/branding-profile-form.tsx`
- Fields: company selector, logo upload, stamp upload, signature upload, signatory name/title, address block, phone/email/website, footer text, TRN, trade license no.
- Storage: dedicated `erp-branding-assets` bucket (public-readable) or reuse DMS bucket.
- This UI feeds the **same** `erp_report_branding_profiles` table both pipelines already read from — one upload, every letter type gets the logo/stamp immediately (this is the payoff of unifying in Phase 0).

---

### PHASE 3 — EMPLOYEE TAB LETTERS UI — SIMPLIFIED (revised from v1)

**Goal:** One clean screen, one mental model, no pipeline-choice confusion for the end user.  
**Estimated effort:** 1 day

#### Simplified UX Design

```
Employee Record → Letters Tab
│
├── "Generate a Letter or Certificate"
│   └── Single dropdown / card list of available letter types
│       (Employment/Experience Certificate, NOC, Salary Certificate,
│        Salary Certificate with Amount [payroll perm], ID Card,
│        PPE Issue Form, Joining Checklist, Clearance Form)
│
├── Click a type → one dialog opens (the existing LetterPreviewDialog,
│   simplified — see UX notes below) → shows a live preview
│   → ONE primary button: "Generate Official PDF"
│       (always produces a stored, QR-verified PDF via Phase 0's unified path)
│   → ONE secondary action: "Quick Print / Preview" (browser print, no storage,
│       for internal drafts / double-checking before issuing officially)
│
└── "Recently Generated" list below
    └── Every official PDF ever generated for this employee, newest first,
        with re-download button (from pdf_generation_history)
```

**Why this is simpler than both v1's plan and today's actual UI:**
- User sees **one word for the concept** ("Generate a Letter") instead of two competing systems with different buttons and unexplained results.
- There is exactly **one** "official" action per letter type (no ambiguity about which button produces the "real" document).
- The AI draft assistant becomes an *optional* pre-step ("Need help wording this? Try AI Draft first") rather than a separate confusing tab — see Phase 5.
- Removing the 8-card grid + separate Gotenberg button (today's actual layout) in favor of one list with one consistent action per row removes the single biggest point of confusion you reported.

#### Task 3.1 — Build `EmployeeLettersTab`
New file `src/features/hr/employees/tabs/employee-letters-tab.tsx`, replacing the `HrLetterGenerator` import in `employee-workspace-form.tsx`. Renders the letter type list + `LetterPreviewDialog` (updated to call Phase 0's `generateHrReportLetterPdf` for the primary action) + a "Recently Generated" history list.

#### Task 3.2 — Simplify `LetterPreviewDialog` header
Remove the "Formal View / Data View" toggle and the manual template picker from the default flow (keep them available under an "Advanced" disclosure for power users/admins only) — most users just want to click one type and get one PDF. The template auto-resolves via `resolveReportBranding` already; manual override should be the exception, not the default UI state.

**Also (per v3 Designer decision):** remove the `visualHtml` / `renderVisualTemplateForLetterPreview` (Puck) code path from this dialog entirely rather than simplifying around it — it renders through the Designer being retired in Section 0.1. The dialog should render exclusively through `renderExecutiveLedgerHtml`/the code-first model.

#### Task 3.3 — Remove HR letters from Report Center
`src/features/report-center/hr-letter-generator.tsx` — either delete or replace its content with a short notice: "To generate HR letters, open the employee record → Letters tab." Report Center itself remains for company-wide/analytical reports, not per-employee documents.

---

### PHASE 4 — LETTER TYPE CLEANUP (revised from v1's Phase 3)

**Goal:** Resolve the Employment/Experience duplicate and confirm all 8 types render correctly end-to-end.  
**Estimated effort:** 4–6 hours (verification + minor fetcher fixes, not new template builds)

- Merge "Employment Certificate" into `HR_EXPERIENCE_LETTER` — one report code, one label ("Employment / Experience Certificate"), used everywhere.
- Manually test each of the 8 report codes end-to-end with a real employee (Sameer) once Phase 0 is done, confirm data completeness (e.g., does `HR_SALARY_CERT_WITH_AMOUNT` actually gate on `hr.payroll.view` correctly at the fetcher level, not just the UI level?).
- Any fetcher gaps found get small targeted fixes — not full rebuilds, since the fetchers already exist and are presumably tested from whatever phase built them.

---

### PHASE 5 — AI DRAFT INTEGRATION (simplified from v1's Phase 6)

**Goal:** Make the AI draft assistant a helpful *input* into the official letter, not a disconnected side feature.  
**Estimated effort:** 1 day (down from v1's 2 days — no new DB table needed initially)

**Simplified v2 approach (no new `hr_letter_drafts` table needed yet):**
- In the new `EmployeeLettersTab`, add a small "✨ Need custom wording? Ask AI" link next to the letter type list — opens the existing (now-fixed) `HrAiLetterPanel` inline or in a side panel.
- The AI's output is copy-paste text for now (safe, human-in-the-loop, no schema change). A true "inject AI text into the official PDF body" feature (v1's Phase 6 with `hr_letter_drafts` table) can be a later enhancement once the core unification is stable and adopted.
- This avoids building new persistence for a feature whose UX shape may still change after real usage.

---

### PHASE 6 — REPORT DESIGNER RETIREMENT (NEW in v3 — cross-cutting, parallel track)

**Goal:** Remove the Puck-based visual designer and formalize the code-first template authoring standard from Section 0.1, so it applies to HR letters now and every future module going forward.  
**Estimated effort:** 1–1.5 days  
**Relationship to Phases 0–5:** Not a hard blocker — Phases 0–5 do not use the Designer — but should land in the same timeframe so no new code accidentally extends the Puck path while it's being removed, and so the "one way to build a template" standard is in place before the next module needs a report/letter.

#### Task 6.1 — Inventory and confirm zero live dependency
Confirm no `erp_report_templates` row currently in `approved`/`published` governance status actually depends on a Puck-authored `body_layout_json`/`visual_editor_engine = 'puck'` layout for production output. (Earlier audit found draft/archived Puck-authored rows like "To Whom It May Concern" v3/v4 — confirm these are not in active use before removing.)

#### Task 6.2 — Remove Designer code and dependency
Delete `src/features/report-designer/` and `src/lib/report-designer/` (Puck-specific parts per the Kept/Removed list in Section 0.1), remove `@puckeditor/core` and any TipTap/ProseMirror packages that were only used by the Designer, remove the `/admin/reports/editor` route and sidebar entry, and remove the now-unused `report-designer-layout.ts` / `report-designer-preview.ts` / `report-designer-test.ts` server actions.

#### Task 6.3 — Build/confirm the shared print-component kit as the standard
Formalize `src/components/erp/print/` as the one official component kit for all future templates (it already has `DocumentHeader`, `CompanyBranding`, `SignatureBlock`, `QRVerificationBlock`, `DocumentFooter`, etc. — confirm coverage is complete for common needs like tables and multi-column key-value layouts, add any missing primitives).

#### Task 6.4 — Add the lightweight non-technical customization form
Extend the existing `TemplateForm` with the plain-textarea "custom clause"/footer-text field + field-insert helper described in Section 0.1, so admins retain the realistic customization ability they'd want without a canvas.

#### Task 6.5 — Codify the standard as a Cursor rule
Write `erp-document-template-standard.mdc` documenting the 5-step authoring pattern from Section 0.1, so any future agent/developer building a report or letter for a new module (Fleet, Workshop, Procurement, Finance, ...) follows it automatically instead of reaching for a visual-designer approach again.

---

## 4. MANUAL TASKS (Cannot Be Done in Code)

| Task | Where | Priority |
|---|---|---|
| Upload company logo (ALGT) | New Branding Profile UI (Phase 2) or direct DB/storage upload meanwhile | **BLOCKING** — no letter shows a logo until this is done, regardless of pipeline |
| Upload company stamp (PNG, transparent bg) | Same | **BLOCKING** |
| Upload authorized signatory signature (optional) | Same | Optional |
| Set signatory name + title | Branding profile | Needed for footer on every letter type |
| Set company address block, phone, email, TRN | Branding profile | Needed for header on every letter type |
| Confirm actual FK constraint names in DB before Phase 1 fix | Direct SQL check (see snippet in Phase 1) | Required before code fix |
| Decide: keep `hr-employment-letter-en` history rows or migrate them | Data decision | Only relevant if any letters were already issued via Pipeline A |

---

## 5. IMMEDIATE NEXT STEPS (revised priority order)

1. **[P0] Fix BUG-1** — AI letters FK hints (Phase 1) — 30 min, unblocks AI draft testing immediately
2. **[P0] Confirm Gotenberg HTML-upload capability** — check `src/lib/pdf/gotenberg.ts`/`renderer.ts` for raw-HTML submission support (small research spike, ~30 min) — this determines exact shape of Phase 0 Task 0.2
3. **[P1] Phase 0** — Unify pipelines: server-side HTML builder + Gotenberg-backed stored PDF for all 8 letter types via the existing report engine
4. **[MANUAL] Upload logo + stamp** — as soon as Phase 2's UI exists, or directly via DB/storage meanwhile if you want to test sooner
5. **[P1] Phase 2** — Branding Profile admin UI
6. **[P1] Phase 3** — Simplified Employee Letters Tab (single list, single "Generate Official PDF" action per type)
7. **[P1] Phase 4** — Merge Employment/Experience duplicate, verify all 8 types end-to-end
8. **[P2] Phase 5** — Light AI draft integration (link only, no new table yet)
9. **[P1, parallel track] Phase 6** — Retire the Puck Report Designer, formalize the code-first template standard (doesn't block Phases 0–5, but should not trail too far behind them)

**Net effect vs v1:** v1 estimated ~2 weeks of work including hand-building 6 templates. v2/v3 estimate roughly **5–6.5 days** total (4–5 days for Phases 0–5 plus 1–1.5 days for Phase 6), because it reuses the mature Report Center engine instead of duplicating it, and removes a large maintenance liability (the Designer) instead of building further on top of it.

---

## 6. FILES INVENTORY (revised)

### Files to Fix
| File | Change |
|---|---|
| `src/server/actions/hr/ai/hr-ai-letters.ts` | FK hints + error logging (Phase 1) |
| `src/lib/report-center/branding-resolver.ts` | Ensure logo/stamp/signature fields are selected and returned (fixes BUG-2/3 for all 8 types at once) |
| `src/lib/pdf/gotenberg.ts` / `src/lib/pdf/renderer.ts` | Add raw-HTML submission mode if not already supported (Phase 0) |

### Files to Create
| File | Purpose |
|---|---|
| `src/lib/report-center/server-pdf-html.ts` | Server-side HTML builder reusing existing report/branding/QR code (Task 0.1) |
| `src/server/actions/pdf/generate-hr-report-letter-pdf.ts` | Unified official-PDF action for all 8 letter types (Task 0.2) |
| `src/features/hr/employees/tabs/employee-letters-tab.tsx` | New simplified Letters tab (Phase 3) |
| `src/features/report-center/branding/branding-profile-form.tsx` | Branding profile admin UI (Phase 2) |
| `src/server/actions/report-center/branding-profiles.ts` | Branding CRUD server actions (Phase 2) |

### Files to Modify
| File | Change |
|---|---|
| `src/features/hr/employees/employee-workspace-form.tsx` | Replace `HrLetterGenerator` import with `EmployeeLettersTab` |
| `src/features/report-center/letter-preview-dialog.tsx` | Simplify header (remove default Formal/Data toggle + manual template picker to an "Advanced" disclosure); wire primary button to new unified PDF action |

### Files to Remove / Retire
| File | Action |
|---|---|
| `src/features/report-center/hr-letter-generator.tsx` | Remove from Report Center; replaced by `EmployeeLettersTab` |
| `src/components/erp/print/templates/hr-employment-letter.tsx` | Retire once `HR_EXPERIENCE_LETTER` covers the same need (Phase 4) — or keep only as historical reference for already-issued PDFs |
| `src/app/print/[templateKey]/[recordType]/[recordId]/route.tsx` registry entry for `hr-employment-letter-en` | Remove after migration, keep route infra for any future Gotenberg-URL-mode needs |

### Files to Remove — Report Designer Retirement (Phase 6, v3)
| File / Path | Action |
|---|---|
| `src/features/report-designer/` (all 32 files: blocks, puck/, field-picker/) | Delete |
| `src/lib/report-designer/` (all 16 files: field-registry/, layout-schema, layout-validation, layout-to-executive-ledger, visual-template-security-review, etc.) | Delete |
| `src/server/actions/reports/report-designer-layout.ts`, `report-designer-preview.ts`, `report-designer-test.ts` | Delete |
| `@puckeditor/core` package + any TipTap/ProseMirror packages used only by the Designer | Uninstall from `package.json` |
| `/admin/reports/editor` route + sidebar entry | Remove |
| `visualHtml` / `renderVisualTemplateForLetterPreview` usage in `letter-preview-dialog.tsx` | Remove (see Task 3.2) |

### Files to Create — Report Designer Replacement (Phase 6, v3)
| File | Purpose |
|---|---|
| `.cursor/rules/erp-document-template-standard.mdc` | Codifies the 5-step code-first authoring pattern (Section 0.1) for all future modules |
| Extension to `TemplateForm` (existing file, not new) | Adds the plain-textarea custom-clause/footer field + field-insert helper (Task 6.4) |

---

## 7. KNOWN CONSTRAINTS

1. Gotenberg must be running (Railway service) — confirmed working from previous session.
2. `PDF_PRINT_TOKEN_SECRET` set in Railway — confirmed from previous session.
3. `waitForExpression` font-loading fix already applied — confirmed from previous session.
4. `erp_report_templates` governance status must be `approved`/`published` for any official issuance — already enforced by `checkTemplateIsIssuable` in Pipeline B; Phase 0 must respect the same check for the new stored-PDF path.
5. Logo/stamp images must be reachable by Gotenberg — use absolute public/signed URLs, not base64 (unchanged from v1).
6. Arabic/RTL letters are out of scope for this round — English-only, consistent with what exists today.
7. **(v3)** No new code should extend or add features to the Puck-based Designer (`src/features/report-designer/`, `src/lib/report-designer/`) — it is being retired per Section 0.1. Any rendering work in Phases 0–5 must go through the Executive Ledger / code-first component model only.

---

## 8. UX SIMPLIFICATION — SPECIFIC RECOMMENDATIONS

These are direct answers to "make the user experience simple and easy":

1. **One tab, one list, one action per row.** Today's employee Letters tab shows a special Gotenberg button PLUS a grid of 8 cards — two visually different UI patterns for what the user perceives as "the same job." Phase 3 replaces both with a single list where every row behaves identically.

2. **Kill the silent duplicate.** "Employment Letter (Official PDF)" and "Experience Letter" are the same document today, generated two different ways with two different results. Merging them (Phase 4) alone removes a lot of confusion even before Phase 0 ships.

3. **Make "Official" mean one thing.** Right now neither pipeline is fully "official" (Pipeline A is missing logo/stamp/QR; Pipeline B never saves a file). After Phase 0, "Generate Official PDF" always means: branded + stamped + QR-verified + permanently stored + re-downloadable. One label, one guarantee, every time.

4. **Hide advanced controls by default.** The current dialog exposes a Formal/Data view toggle and a manual template dropdown right in the main flow — these are power-user/admin tools (useful when there are multiple templates per company) that add cognitive load for the 95% case of "just give me the PDF." Move them behind an "Advanced" toggle.

5. **Show history inline, not in a separate module.** Add "Recently Generated" directly under the letter list in the employee tab so the user never needs to go hunting through Report Center or DMS to find a PDF they made five minutes ago.

6. **AI stays optional and clearly labeled as a draft tool.** Keep AI drafting easily reachable (one link) but visually and functionally distinct from "Generate Official PDF" so there is never a risk of confusing an AI draft with an issued document.

7. **One place to manage branding.** Once Phase 2's branding UI exists, uploading a logo/stamp once instantly fixes every letter type across the whole system (because Phase 0 unifies the branding source) — no more "why does this letter have a logo but that one doesn't."

---

## 9. OPEN QUESTIONS (revised)

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Does the current Gotenberg client support raw-HTML submission, or only URL-fetch mode? | Must check `src/lib/pdf/gotenberg.ts` | **Investigate first** — determines exact Phase 0 implementation shape |
| Q2 | Keep `hr-employment-letter-en` template/history for legal/audit continuity, or fully retire? | (a) Keep dormant, stop using (b) Fully delete | (a) Keep dormant — don't break references to already-issued PDFs |
| Q3 | Should "Quick Print / Preview" (no storage) remain available, or should every generation be stored? | (a) Keep both options (b) Always store | (a) — internal drafts don't need to clutter official history; but default button should be "Official PDF" |
| Q4 | AI draft → official PDF text injection (v1 Phase 6) — build now or later? | (a) Now (b) After Phase 0–4 ship and are used for a while | (b) — avoid new schema/persistence before the core unification is proven in daily use |
| Q5 | Should Report Center keep a read-only "view HR letter history" page for admins, or should employee-tab history be the only place? | (a) Employee tab only (b) Also a global admin view in Report Center | Your call — doesn't block Phase 0–4 either way |
| Q6 (v3, DECIDED) | Keep the Puck visual Report Designer, simplify it, or retire it? | (a) Retire — code-first template standard (b) Simplify Puck (c) Keep as-is | **DECIDED: (a) Retire** — see Section 0.1 and Phase 6 |
| Q7 (v3, NEW) | Any existing draft/archived Puck-authored templates (e.g. "To Whom It May Concern" v3/v4) — discard or migrate their content into the new code-first templates? | (a) Discard — none are in active/published use (b) Migrate manually (c) Review each one first | Needs your confirmation before Task 6.1/6.2 — recommend (a) unless you know of a reason to keep one |

---

*End of Plan v3 — Ready for phase-by-phase implementation approval*
