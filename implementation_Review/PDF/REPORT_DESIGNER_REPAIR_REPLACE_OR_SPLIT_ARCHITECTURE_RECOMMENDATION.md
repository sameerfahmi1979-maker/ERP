# REPORT.DESIGNER.REASSESS.1 — Deliverable 3
# Repair / Replace / Split Architecture Recommendation

**Date:** 2026-07-26  
**Status:** PENDING SAMEER'S APPROVAL — This document does not authorize implementation  
**Recommended direction:** SPLIT into three governed design modes  

---

## 1. Recommendation

> **SPLIT the output platform into three separate, purpose-built design modes.**
>
> Do **not** attempt to build or buy a single editor that covers all five output families. The evidence shows this is technically unreachable without prohibitive custom engineering.

The three modes are:

| Mode | Families Served | Design Approach | Rendering |
|---|---|---|---|
| **A — Structured Template Studio (enhanced)** | Flowing letters, certificates, official Class A–D documents | Enhanced TipTap Studio in the browser | Executive Ledger HTML → Gotenberg |
| **B — DOCX Template Engine** | Complex multi-page, Arabic RTL, multi-column, precise official documents | Admin designs in Word/LibreOffice/Google Docs; uploads `.docx`; Carbone injects | Carbone+Chromium or LibreOffice+Gotenberg |
| **C — Code-First Analytical Reports** | Class E data-dense reports, lists, summaries, exports | Developer-written `OutputDataProvider` + Executive Ledger table sections | Executive Ledger HTML → Gotenberg / Excel / CSV |

**Fixed-layout (badges, ID cards) falls into Mode A or B depending on content complexity. No new fixed-layout visual designer is recommended at this stage.**

---

## 2. What Works Well Today

| Component | Verdict |
|---|---|
| Executive Ledger HTML builder | ✅ Solid, canonical, single code path |
| Gotenberg/Chromium PDF rendering | ✅ Production-proven |
| Issuance coordinator (WP5) | ✅ Serial, QR, hash, storage all working |
| QR verification and revocation | ✅ Public verification page working |
| Output registry and policies | ✅ 28 registered outputs |
| Template governance (draft→review→publish) | ✅ Workflow exists |
| Field registry (28 paths, 4 namespaces) | ✅ HR namespace complete |
| Sensitive field governance | ✅ Three-tier allowlist |
| Audit history | ✅ Append-only events |
| Company isolation and RLS | ✅ No defects found |

---

## 3. What Is Technically Present but Practically Unusable

| Element | Problem |
|---|---|
| Template Studio editor | No A4 page boundary; no header/footer/QR/logo block; cannot be used to design a professional official document |
| Puck layout columns in 4 published templates | Puck removed; admin cannot edit these templates; orphaned in DB |
| `direction: rtl` flag in Studio schema | Set correctly in schema; but no in-editor Arabic preview; not validated against real Arabic content |
| `repeatBinding` in table block | Feature is in schema; not tested with real repeating datasets; no column-width control |
| Studio two-column block | Layout is fixed (equal/left-wide/right-wide); cannot be used for letter headers with logo |

---

## 4. What Is Missing

| Gap | Scope to Repair |
|---|---|
| A4 page boundary in editor | Large — requires TipTap Pages extension (Pro) or complete custom implementation |
| Header/footer block with logo and branding | Medium — new block type; EL HTML already renders it via branding context |
| QR placeholder block | Small — new block type; EL already injects via `verification` input |
| Signatory/stamp block | Small — new block type; EL already renders |
| Page-break block | Small — maps to EL section break |
| Arabic in-editor rendering | Medium — requires RTL-aware TipTap extension + font loading in editor canvas |
| Conditional sections | Large — requires template conditionals engine; not in any current EL section type |
| DOCX template upload + data injection | Large — new integration; Carbone + storage + new coordinator path |
| Field registry beyond HR | Medium per module — resolver + binding registration for each new module |
| Multi-page analytical report pagination | Not worth repairing — code-first is superior |

---

## 5. Repair vs Replace vs Split Analysis

### Gap Table

| Gap | Root Cause | Repair Possible? | Repair Scope | Replacement Benefit | Risk | Recommendation |
|---|---|---|---|---|---|---|
| No A4 page boundary | Not implemented in Studio | Yes — TipTap Pages Pro | Large + commercial cost | Higher visual quality | TipTap Pages table-row bug | Repair with TipTap Pages for simple docs; avoid for table-heavy docs |
| No header/footer/logo block | Scope not included in OUTPUT.3A/3B | Yes — new block types | Medium | Same | Low | Repair in Mode A |
| No QR/signatory/stamp block | Same scope gap | Yes — new block types | Small | Same | Low | Repair in Mode A |
| Arabic/RTL preview | Scope gap | Yes — TipTap RTL + font | Medium | Better confidence | TipTap RTL not officially documented for Pages | Repair in Mode A |
| Conditional sections | Schema gap | Partial — static conditions only | Large | Full conditional logic via DOCX | High complexity in Studio | Use Mode B (DOCX) |
| Complex multi-page tables | Architectural gap in TipTap | Yes — but TipTap Pages has hard limit | **Not repairable** | Full DOCX table support | Hard limit | Use Mode B |
| Fixed-layout badge/card | Architecture gap | Possible — code-first HTML | Medium | pdfme design canvas | pdfme Arabic weak | Code-first for now |
| Published templates orphaned (Puck) | WP12 prerequisite not met | Yes — migrate to Studio | Medium | Clean DB state | Data loss risk if not careful | Fix immediately |
| Field registry for non-HR modules | Not built | Yes — per-module resolver | Medium per module | More modules available | None | Build per module as implemented |

### Explicit Answers

1. **Is TipTap being used for a problem it was not designed to solve?**  
   Yes, for multi-page analytical reports with large tables and exact Arabic layout. TipTap is a rich text editor, not a page-layout engine. The TipTap Pages extension is a step toward page layout but carries a hard limitation on table rows that disqualifies it for Class E analytical reports. For Class B–D flowing letters, TipTap is a reasonable fit.

2. **Can the current Template Studio become professional without excessive custom layout engineering?**  
   Partially. Adding the missing blocks (header, footer, QR, signatory, stamp, page break) and the TipTap Pages extension for A4 preview is feasible without extreme custom work. However, it will not deliver: multi-column precise positioning, complex Arabic right-to-left tables, or multi-page analytical reports.

3. **Is one editor realistic for all ERP output families?**  
   No. The five output families (flowing docs, analytical tables, fixed forms, cards/badges, bilingual docs) have irreconcilable layout requirements. One editor that serves all of them does not exist in the open-source ecosystem without commercial tools at enterprise pricing.

4. **Would separate design modes reduce complexity and improve quality?**  
   Yes. Each mode can be purpose-built for its family. The DOCX mode (Carbone) provides the highest quality for formal Arabic RTL documents. The enhanced Studio covers simple English letters. Code-first covers analytics.

5. **Which existing backend components remain reusable in every option?**  
   All of: Executive Ledger HTML builder, Gotenberg, issuance coordinator, QR, serial, storage, history, audit, RLS, company isolation, field registry, output registry, template governance lifecycle.

6. **Which templates must be preserved?**  
   The 4 published templates (IDs 11, 12, 13, 19) must not be deleted. Their history and issued PDFs must remain. The orphaned Puck layout JSON (`visual_layout_json`) can be nulled after the new studio body is saved.

7. **What migration path avoids breaking existing issued PDFs?**  
   Issued PDFs are stored in Supabase Storage with SHA-256 checksums — they are immutable and do not depend on the template editor. Only the template editing experience is affected. Migration of the 4 published templates to the new Studio body (or DOCX templates) is a separate admin task and does not affect any issued document.

---

## 6. Recommended Target Architecture

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               ALGT ERP Output Platform              │
│                                                     │
│  Mode A: Enhanced Template Studio (TipTap)          │
│  ├── Flowing English/Arabic letters & certificates  │
│  ├── Simple forms and checklists                    │
│  ├── A4 page preview (TipTap Pages Pro)             │
│  └── Renders via: Studio → EL HTML → Gotenberg     │
│                                                     │
│  Mode B: DOCX Template Engine (Carbone)             │
│  ├── Complex Arabic RTL official documents           │
│  ├── Multi-page tables, precise formatting          │
│  ├── Bilingual documents                            │
│  ├── Admin uploads .docx; Carbone injects JSON      │
│  └── Renders via: Carbone → Chromium/Gotenberg     │
│                                                     │
│  Mode C: Code-First Analytical Reports              │
│  ├── Class E: Lists, summaries, compliance reports  │
│  ├── Excel / CSV exports                            │
│  └── Renders via: OutputDataProvider → EL → Gotenberg│
│                                                     │
│  Shared backend (ALL modes):                        │
│  ├── issuance coordinator                           │
│  ├── QR / serial / storage / history                │
│  ├── output registry + class policies               │
│  ├── field registry (governed allowlists)           │
│  ├── template governance (draft→review→publish)     │
│  ├── branding resolver                              │
│  └── RLS + company isolation                        │
└─────────────────────────────────────────────────────┘
```

### 6.2 Mode A — Enhanced Template Studio

**What changes:**
1. Add TipTap Pages Pro extension for A4 page-boundary canvas
2. Add missing block types: `header`, `footer`, `qr_placeholder`, `signatory`, `stamp`, `page_break`. Note: the Puck-era `report-designer/` library already has `BrandingHeaderBlock`, `CompanyLogoBlock`, `SignatoryBlock`, `StampBlock`, `VerificationQrBlock` with Executive Ledger mappings — these can be adapted for Studio rather than built from scratch.
3. Add RTL font loading in editor canvas (Noto Sans Arabic in TipTap, already self-hosted at `public/fonts/`)
4. Improve preview: replace iframe with live TipTap Pages canvas
5. Fix orphaned published templates: migrate Puck `visual_layout_json` → Studio `body_schema_json` for templates 11, 12, 13, 19
6. Note on Arabic PDF capability: `tests/output-spike/evidence/pdf/D4_arabic_rtl_cert.pdf` confirms Gotenberg renders Arabic correctly — the gap is the **editor preview only**, not the renderer

**What is preserved:**
- All existing Studio block types and schema
- Same EL HTML builder and Gotenberg issuance path
- Branding context, QR injection, serial, governance

**Scope estimate:** Medium (3–5 development sprints)  
**TipTap Pro cost:** Evaluate; Pro subscription needed for Pages extension

---

### 6.3 Mode B — DOCX Template Engine

**What changes:**
1. Install Carbone (`npm install carbone`) as a server-side Node module
2. Create new `erp_docx_templates` table: `id`, `template_code`, `owner_company_id`, `governance_status`, `storage_path`, `engine: 'carbone'`, standard audit columns
3. Add DOCX file upload flow (admin uploads `.docx` template to `erp-docx-templates` private bucket)
4. Create `DocxTemplateDataProvider` interface (same contract as `OutputDataProvider` but returns JSON, not HTML)
5. Add `renderDocxTemplate(templateId, dataProviderId, context)` coordinator path
6. This coordinator: fetches DOCX from storage → calls Carbone → gets PDF binary → stores in `erp-generated-pdfs` → completes issuance lifecycle

**What is preserved:**
- All issuance coordinator services (QR, serial, storage, history, audit)
- Field registry governed allowlists (Carbone templates validated against registry before activation)
- RLS and company isolation (same `owner_company_id` pattern)
- Gotenberg kept for HTML path; Carbone uses its own Chromium wrapper for DOCX path (or Gotenberg for HTML templates)

**Scope estimate:** Large (6–10 sprints, including Carbone integration, storage, template governance extension, and UAT)

**Note:** Carbone is NOT a browser design tool. This mode is recommended for organizations where admins are comfortable with Microsoft Word or LibreOffice. The design workflow is: admin opens Word, creates the template, uploads it to the ERP, the system validates it against the field allowlist, and it enters the normal governance lifecycle (draft → review → publish).

---

### 6.4 Mode C — Code-First Analytical Reports (no change)

This mode is already implemented and proven. The 28 registered HR outputs + 1 ADMIN output serve this mode well. Future modules simply add new `OutputDataProvider` implementations.

**No changes recommended** to Mode C except adding field namespaces for new modules as they are implemented.

---

## 7. Output Family Routing

| Output Family | Mode | Rationale |
|---|---|---|
| Flowing English letter/certificate | A or B | A for simple; B for complex |
| Flowing Arabic RTL letter/certificate | **B** | Arabic quality requires DOCX or Carbone |
| Bilingual (English + Arabic) | **B** | DOCX handles mixed direction |
| Salary certificate (Class A sensitive) | A (approved template) | Sensitive field governance enforced |
| Simple English forms and checklists | A | Studio block structure fits |
| Fixed-form (labeled fields, boxes) | B or code-first | DOCX template precise positioning |
| Employee ID card / badge | Code-first (HTML) | Chromium renders HTML badge template |
| Multi-page analytical report | **C** | Code-first only; TipTap cannot paginate tables |
| Excel / CSV export | C | Unchanged |
| Group / summary reports | C | Unchanged |

---

## 8. Migration and Legacy Preservation Strategy

### Immediate (no migration needed):
- All 28 issued PDFs in storage: **UNTOUCHED** — immutable, SHA-256 verified
- `erp_report_template_events` history: **UNTOUCHED**
- `erp_generated_pdf_documents` records: **UNTOUCHED**
- `erp_output_public_links` QR tokens: **UNTOUCHED**

### Short-term (admin task, no data loss):
- 4 published templates with `visual_editor_engine='puck'`:
  - Set `visual_layout_json = NULL` (layout was Puck-specific; cannot be used)
  - Create new Studio `body_schema_json` equivalents manually in Template Studio
  - Governance status remains `published` — a new version can be created via existing governance flow
- 1 archived template (ID 14): no action needed

### Medium-term (new capability):
- Mode B DOCX templates stored in `erp_docx_templates` — separate table, no conflict with existing `erp_report_templates`
- Existing EL-based coordinator path unchanged
- DOCX coordinator path added alongside existing Studio path

---

## 9. Security Boundaries

| Control | Mode A | Mode B | Mode C |
|---|---|---|---|
| RLS + company isolation | ✅ Unchanged | ✅ New table follows same pattern | ✅ Unchanged |
| Field allowlist governance | ✅ Studio enforces | ✅ Carbone output validated against allowlist before publish | ✅ Code enforces |
| Sensitive field gates | ✅ Unchanged | ✅ Template allowlist check on upload | ✅ Unchanged |
| Server-only stamp/signature | ✅ EL coordinator injects | ✅ Carbone template must use placeholder `{d.stamp_path}`; coordinator injects real asset | ✅ Code injects |
| Protected assets never in browser | ✅ | ✅ DOCX uploaded by admin; filled server-side | ✅ |
| Approval before issuance | ✅ Governance lifecycle | ✅ Same governance lifecycle | ✅ Code-controlled |
| Audit history | ✅ | ✅ New audit events for DOCX render | ✅ |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TipTap Pages Pro subscription cost is prohibitive | Medium | High | Evaluate cost early; if unacceptable, implement custom CSS `@page` preview instead |
| Carbone CCL license has undiscovered commercial restriction | Low | High | Full legal review of CCL license before adoption; consider Docxtemplater as alternative |
| Admin users cannot learn DOCX template design | Medium | High | Provide training, starter templates, Word template library; Mode A Studio covers simpler docs |
| Carbone Chromium vs Gotenberg rendering differences | Low | Medium | Test identical documents through both paths early; use Gotenberg for HTML, Carbone's own engine for DOCX |
| Migration of 4 published Puck templates breaks QR links | Low | High | QR links are NOT tied to template editor engine; they reference issued PDF IDs; migration is safe |
| TipTap Pages alpha stability | Medium | Medium | Track alpha → stable progression; pin version; avoid table-heavy documents in Pages |
| Mode B DOCX template approval is slower (admin must use Word) | High | Low | Acceptable trade-off for quality; provide online DOCX editor option in future |

---

## 11. Phased Implementation Plan

> ⚠️ This plan requires Sameer's explicit approval before any implementation begins.

### Gate 0 — IMMEDIATE (no code changes)
1. Set `visual_layout_json = NULL` on 4 orphaned Puck templates
2. Note in DB: `admin_notes = 'Puck layout orphaned; awaiting Mode A Studio recreation'`
3. No impact on issued documents or QR links

### Phase DESIGNER.A.1 — Repair Template Studio (Mode A Foundation)
1. Add missing block types: `header`, `footer`, `qr_placeholder`, `signatory`, `stamp`, `page_break`
2. Improve preview iframe with A4 boundary CSS container (quick fix without TipTap Pages)
3. RTL preview: apply `dir="rtl"` and Noto Arabic font to preview container when `direction='rtl'`
4. Add block-level undo button
5. Add drag-and-drop via `@dnd-kit/core` (already a dev dependency)
6. **Stop/go gate:** Can an admin produce a recognisable HR Employment Letter template? If yes → proceed to A.2.

### Phase DESIGNER.A.2 — TipTap Pages Integration (Mode A Full)
1. Evaluate TipTap Pro pricing
2. Install `@tiptap-pro/extension-pages` (if cost acceptable)
3. Replace iframe preview with TipTap Pages canvas
4. Implement header/footer editing within Pages context
5. **Stop/go gate:** A4 boundary visible in editor; page breaks work; admin can complete Scenario A and D test cases.

### Phase DESIGNER.B.1 — DOCX Template Engine (Mode B Foundation)
1. Install Carbone server-side
2. Create `erp_docx_templates` table + storage bucket + governance lifecycle
3. Build `DocxTemplateUploadPage` (admin uploads `.docx`)
4. Build field allowlist validator (validates `{d.X}` tokens against field registry before governance approval)
5. Build `renderDocxTemplate` coordinator wrapper
6. **Stop/go gate:** Admin uploads DOCX; coordinator generates PDF; QR/serial/storage all work.

### Phase DESIGNER.B.2 — Arabic and Bilingual Templates
1. Validate Carbone + Arabic DOCX → PDF quality with real Arabic content
2. Provide starter DOCX templates for Arabic NOC, Arabic Employment Letter, Bilingual Employment Certificate
3. **Stop/go gate:** Scenario H (Arabic/RTL) and Scenario I (bilingual) both pass visual review.

### Phase DESIGNER.C.1 — Field Registry Expansion (ongoing, per module)
- When Finance, Procurement, etc. are implemented, add new resolver namespaces to `ERP_BINDING_REGISTRY`
- No designer changes required — new namespaces are available to all modes

---

## 12. UAT and Visual Acceptance Plan

### Acceptance Criteria for Future Designer (per prompt §18)

| Criterion | Pass Threshold | Test Method |
|---|---|---|
| Admin creates basic official letter without code | ≤30 minutes for first attempt | Timed admin user test |
| A4 page boundaries visible and reliable | Boundary visible in editor; content respects margins | Visual check in editor |
| Page margins controllable | Admin can set margins in template settings | UI control present + PDF measurement |
| Headers and footers predictable | Header/footer content appears in correct position in PDF | Screenshot comparison |
| Page breaks understandable | Page-break block works; content flows correctly | Multi-page PDF test |
| Dynamic fields can be found and inserted | Admin locates any allowlisted field in ≤2 minutes | User test |
| Restricted fields cannot be used without authorization | Attempt to insert salary field fails without permission | Security test |
| Real fixture preview available | Preview shows realistic data | Functional test |
| Final PDF equivalent to preview | No layout differences > 5% in text position; no missing elements | Screenshot diff |
| Tables work for small and large datasets | 5-row and 50-row tables both render | Functional test |
| Repeating table headers work | Header row repeats on page 2+ | Multi-page PDF test |
| Arabic/RTL is production-quality | Arabic text correctly shaped; RTL direction consistent | Native Arabic speaker review |
| Stamps and signatures protected | No stamp asset visible in browser network inspector | Security test |
| Templates versioned, approved, audited | Governance lifecycle completes | Functional test |
| Issued PDFs immutable | Checksum unchanged after reopen | DB verification |
| Fixed-size designs through appropriate mode | Badge/card output via DOCX or code-first | Functional test |
| No protected secrets in browser | Browser DevTools network tab shows no secret paths | Security test |

---

## 13. Decisions Required from Sameer

1. **TipTap Pages Pro:** Approve or reject commercial subscription. If rejected, Phase A.2 uses custom CSS `@page` boundary (medium quality) instead of native TipTap Pages (high quality).

2. **DOCX template approach (Mode B):** Approve or reject. This requires admins to design templates in Microsoft Word or LibreOffice. If rejected, Mode A must be strengthened to cover Arabic documents.

3. **Carbone vs Docxtemplater:** Choose between Carbone (HTML+DOCX, CCL free) and Docxtemplater (DOCX only, license review needed). Recommend Carbone.

4. **Phase sequencing:** Approve starting with DESIGNER.A.1 (quick Studio repair) while researching Mode B in parallel — OR — do a focused technical spike on Mode B first before committing to Mode A investment.

5. **Orphaned Puck templates (D-01):** Approve setting `visual_layout_json = NULL` on IDs 11, 12, 13, 19, 15 immediately. This is safe (no impact on issued PDFs) but is a DB write that requires approval.

6. **Target timeline:** Agree on sprint allocation. Phase DESIGNER.A.1 is estimated at 2–3 sprints. Phase DESIGNER.B.1 is estimated at 4–6 sprints. These are relative estimates; exact timelines depend on team velocity.

---

*REPORT.DESIGNER.REASSESS.1 — Deliverable 3 complete. PENDING SAMEER'S APPROVAL before implementation.*
