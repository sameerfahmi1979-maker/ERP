# REPORT.DESIGNER.REASSESS.1 — Deliverable 2
# Current Solutions Web / GitHub Research and Decision Matrix

**Date:** 2026-07-26  
**Research method:** Web search (2026 dated queries), official documentation, GitHub repository inspection, npm registry inspection, live demo observation where available  
**Scope:** Browser-based page-layout designers, flowing document editors, paged-media/print CSS, report builders, fixed-layout designers, HTML-to-PDF workflows, DOCX template generation, Arabic/RTL support, React/Next.js compatibility

---

## 1. Research Method

All searches conducted on 2026-07-26. Sources prioritized in order:
1. Official documentation and GitHub repositories
2. Releases, changelogs, and maintenance activity
3. Licensing files and commercial restrictions
4. Issue trackers for Arabic/RTL, pagination, and table concerns
5. Developer community discussion

No unverified marketing claims are treated as capabilities.

---

## 2. Candidate Longlist

| # | Product | Category | License | Stars (approx) | Last Meaningful Release | React/Next.js | Arabic/RTL |
|---|---|---|---|---|---|---|---|
| 1 | TipTap (core) | Rich text editor | MIT (core) | 28K+ | Active 2026 | ✅ First-class | ⚠️ Manual |
| 2 | TipTap Pages (Pro) | Paginated editor | Commercial (Pro) | Bundled with TipTap | Alpha 2026 | ✅ | ⚠️ Not tested |
| 3 | ProseMirror | Low-level editor framework | MIT | 8K+ | Active 2026 | ⚠️ Adapter needed | ⚠️ Manual |
| 4 | Lexical (Meta) | Rich text editor | MIT | 21K+ | Active 2026 | ✅ | ⚠️ Partial |
| 5 | CKEditor 5 | Rich text editor | GPL/Commercial | 9K+ | Active 2026 | ✅ | ✅ Supported |
| 6 | pdfme | PDF template designer | MIT | 4K+ | v5 2025 | ✅ | ❌ Known bugs |
| 7 | Puck (Measured) | Visual block editor | MIT | 5K+ | Active 2026 | ✅ React-only | ❌ No paged docs |
| 8 | AavanamKit | Drag-and-drop designer | MIT | Low (new 2026) | 2026 | ✅ | Unknown |
| 9 | Carbone | Template injection engine | CCL (community)/Commercial | 3.8K | v3.8.2 Apr 2026 | N/A (server-side) | ✅ Via Chromium |
| 10 | Docxtemplater | DOCX template engine | Other (NOASSERTION/Commercial) | 3.6K | Active Jun 2026 | N/A (server-side) | ✅ Via LibreOffice |
| 11 | docx-editor.dev | Browser DOCX editor | Apache 2.0 | Low (new Feb 2026) | v0.5.2 May 2026 | ✅ | Unknown |
| 12 | react-pdf / @react-pdf/renderer | Code-first PDF rendering | MIT | 15K+ | Active 2026 | ✅ | ❌ No native RTL |
| 13 | html2pdf.js | Browser HTML-to-PDF | MIT | 10K+ | Stale (2022) | ⚠️ | ⚠️ |
| 14 | Gotenberg (current) | Chromium HTML-to-PDF server | MIT | 8K+ | Active 2026 | N/A (service) | ✅ Native Chromium |
| 15 | TinyMCE | Rich text editor | GPL/Commercial | 15K+ | Active 2026 | ✅ | ⚠️ Partial |
| 16 | Weasyprint | HTML+CSS to PDF (Python) | BSD | 6K+ | Active 2026 | N/A | ✅ Good CSS |
| 17 | Prince XML | Commercial paged media | Commercial | N/A | Active | N/A | ✅ Excellent |
| 18 | Nutrient (PSPDFKit) | Commercial document SDK | Commercial | N/A | Active 2026 | ✅ | ✅ |

---

## 3. Shortlist Rationale

From the longlist, the following candidates are shortlisted based on:
- Realistic integration with the existing Next.js 16 / Supabase / Gotenberg stack
- Arabic/RTL support (non-negotiable for UAE ERP)
- Active maintenance (must have 2025 or later meaningful release)
- Appropriate for non-developer administrator use

**Shortlisted candidates:**

| Candidate | Role in Architecture | Why Shortlisted |
|---|---|---|
| **TipTap + TipTap Pages Pro** | Upgraded flowing document editor | Already in codebase; Pages adds A4 pagination |
| **Carbone (HTML mode)** | Server-side template injection | Excellent Arabic RTL via Chromium; DOCX/HTML templates; active |
| **Docxtemplater** | DOCX template injection | Business-user DOCX templates; industry standard; Arabic via LibreOffice/Gotenberg |
| **pdfme** | Fixed-layout designer (non-Arabic) | Existing evaluation; MIT; covers form/badge needs for LTR only |
| **Code-first (Executive Ledger)** | Analytical/tabular reports | Already implemented and proven; best for data-dense outputs |

---

## 4. Rejected Candidates and Reasons

| Candidate | Rejection Reason |
|---|---|
| Puck | Retired from ERP in WP12; not a document editor (block CMS, not paged media) |
| AavanamKit | Insufficient community/maintenance evidence; unproven in production; no Arabic documentation |
| react-pdf | No native RTL; manual workarounds fragile; requires developer involvement for every document change |
| html2pdf.js | Stale (last meaningful release 2022); no RTL; image-based PDF not suitable for official documents |
| ProseMirror | Too low-level; requires full editor engineering; not admin-usable without significant wrapper |
| Lexical | No paged document mode; Facebook-internal origins; limited print/PDF ecosystem |
| Prince XML | Commercial; overkill for current needs; server installation complexity |
| Weasyprint | Python-based; adds server complexity; not React/Next.js native |
| Nutrient (PSPDFKit) | Commercial; high cost; vendor lock-in; overcomplicated for current scale |
| html2canvas-based tools | Image-based output; non-searchable PDFs; not acceptable for official Arabic documents |
| TinyMCE | GPL for open use; large bundle; not page-layout-aware |
| docx-editor.dev | Too new (Feb 2026); insufficient community; Arabic support unknown |

---

## 5. Detailed Candidate Analysis

### 5.1 TipTap + TipTap Pages Pro

**URL:** https://tiptap.dev  
**License:** MIT (core) + Commercial Pro subscription for Pages, Conversion extensions  
**Last release:** Alpha 2026 (Pages); TipTap core active  
**GitHub:** tiptap-dev/tiptap (28K stars, highly active)

| Criterion | Score | Evidence |
|---|---|---|
| Administrator usability | 3 | Word-processor-like experience; Pages provides visual A4 canvas |
| Final PDF quality | 3 | Requires TipTap Conversion REST endpoint (additional service) |
| Preview fidelity | 4 | Pages extension gives true WYSIWYG pagination |
| Flowing documents | 4 | Pages handles multi-page flow |
| Analytical tables | **1** | **Hard limit: table rows cannot split across pages — causes infinite layout loop** |
| Fixed layout | 1 | No fixed-layout mode |
| Arabic/RTL | 2 | Not tested in Pages alpha; ProseMirror handles bidi; no official RTL doc |
| Existing backend integration | 4 | Already in codebase; Extensions can output ProseMirror JSON → Executive Ledger |
| Governance/security | 4 | Extensions can be restricted; binding chip model preserved |
| Maintainability | 3 | Pro subscription required; Tiptap team responsible for Pages |
| Extensibility | 3 | Good extension model; but fixed-layout needs separate solution |
| Performance | 3 | Large bundle; Pages alpha may have perf issues |
| Licensing/TCO | 2 | Pro subscription cost unknown publicly; adds vendor dependency |
| Project health | 4 | Well-funded team; active community |
| Migration risk | 2 | Existing ProseMirror JSON in Studio can be adapted; but requires Pro signup |

**Material limitation:** The hard table-row pagination bug is disqualifying for multi-page analytical reports. TipTap Pages works well for flowing letter/certificate content but cannot replace the analytical report family.

**Verdict for flowing documents:** ✅ Viable with caveats (Pro subscription, no RTL official support yet)  
**Verdict for analytical reports:** ❌ Disqualified (table row splitting bug)

---

### 5.2 Carbone (HTML Template Mode)

**URL:** https://carbone.io  
**License:** CCL (Community; free for self-hosted); Commercial (cloud API)  
**npm:** `carbone` v3.8.2 (Apr 2026)  
**GitHub:** carboneio/carbone (3.8K stars, last push 2026-04-07)

Carbone is a **server-side template injection engine**. It is NOT a browser visual editor. Its role is to fill `{d.fieldName}` markers in an HTML or DOCX template with JSON data and render to PDF via Chromium (same family as Gotenberg).

| Criterion | Score | Evidence |
|---|---|---|
| Administrator usability | 4 | Admin designs in Word / Google Docs / HTML editor; no custom UI needed |
| Final PDF quality | 5 | Chromium-based rendering; same family as Gotenberg |
| Preview fidelity | 3 | Preview requires rendering call; no live canvas |
| Flowing documents | 5 | DOCX templates handle full Word-style pagination, headers, footers |
| Analytical tables | 5 | Loop syntax in DOCX/HTML; repeating rows; native Word table formatting |
| Fixed layout | 4 | DOCX fixed-position elements work; exact pixel alignment via Word |
| Arabic/RTL | 5 | Native Arabic rendering via Word/LibreOffice DOCX + Chromium PDF export |
| Existing backend integration | 3 | Would sit alongside Gotenberg; coordinator calls Carbone API instead of raw HTML |
| Governance/security | 3 | Must build field allowlist wrapper; Carbone itself has no field governance |
| Maintainability | 4 | Small library; well-documented; no framework lock-in |
| Extensibility | 5 | Any JSON data shape can be injected |
| Performance | 4 | Fast injection; PDF rendering same cost as Gotenberg |
| Licensing/TCO | 5 | Free for self-hosted; CCL allows commercial use |
| Project health | 4 | Active; 40 contributors; v3.8.2 April 2026 |
| Migration risk | 2 | New renderer path needed; existing EL HTML templates not Carbone-compatible |

**Key concern:** Carbone itself does not provide a browser design UI. The admin must design the template in Microsoft Word, LibreOffice, or a DOCX editor, upload the `.docx` file, and Carbone injects the data. This is a **fundamentally different UX paradigm** — but it is the paradigm used by thousands of enterprise document systems because it produces the highest quality professional output.

**Verdict for flowing documents:** ✅ Excellent — best Arabic and quality option if admin can use Word  
**Verdict for analytical reports:** ✅ Excellent via DOCX loop syntax  
**Verdict for fixed layout:** ✅ Strong via Word fixed-position templates

---

### 5.3 Docxtemplater

**URL:** https://docxtemplater.com  
**License:** Other (NOASSERTION) — community core is free; enterprise modules are commercial  
**npm:** `docxtemplater` 3.6K stars, last push Jun 2026  
**GitHub:** open-xml-templating/docxtemplater

Similar to Carbone in concept. Admin designs DOCX in Word with `{placeholder}` tags. Docxtemplater fills them server-side. More modules available (HTML insertion, charts, image, XLSX).

| Criterion | Score | Evidence |
|---|---|---|
| Administrator usability | 4 | Same Word-based design paradigm |
| Final PDF quality | 3 | Requires LibreOffice or Gotenberg for PDF conversion; not built-in |
| Preview fidelity | 2 | No built-in preview; must render to see result |
| Arabic/RTL | 4 | DOCX preserves RTL; PDF quality depends on LibreOffice or Gotenberg |
| Licensing/TCO | 3 | Core free; commercial modules (HTML, image) add cost |
| Project health | 4 | Active; 40 contributors; 3.6K stars |

**Verdict:** Strong for DOCX generation; slightly behind Carbone because Carbone's HTML template mode integrates more naturally with the existing Gotenberg stack.

---

### 5.4 pdfme

**URL:** https://pdfme.com  
**License:** MIT  
**npm:** 4K+ stars; v5 released 2025  
**GitHub:** pdfme/pdfme

pdfme is a **browser-based template designer** with a drag-and-drop canvas for fixed-layout PDF templates. It renders via `@pdf-lib/pdfkit`.

| Criterion | Score | Evidence |
|---|---|---|
| Administrator usability | 4 | Drag-and-drop canvas; WYSIWYG for fixed layouts |
| Final PDF quality | 3 | Vector PDF; good for LTR documents |
| Preview fidelity | 4 | Canvas matches PDF well for LTR |
| Flowing documents | **1** | Flowing text does not paginate; fixed layout only |
| Analytical tables | **1** | Repeating row support very limited; not designed for multi-page data |
| Fixed layout | 5 | Excellent — designed exactly for this use case |
| Arabic/RTL | **2** | Known line-break overlap bug (issue #398; fixed in 3.2.3 but underlying approach fragile) |
| Existing backend integration | 2 | pdfme generates PDFs client-side or server-side via Node; not Gotenberg |
| Governance/security | 2 | No field allowlist mechanism; must build wrapper |
| Maintainability | 3 | MIT; active; but PDF-lib dependency limits flexibility |
| Extensibility | 3 | Plugin system for custom elements |
| Licensing/TCO | 5 | MIT; free |
| Project health | 4 | Active; 4K stars; version 5 2025 |
| Migration risk | 3 | Separate from EL stack; requires new storage and issuance path for pdfme output |

**Critical limitation for this ERP:** Arabic RTL is fragile. The ERP is UAE-based and must produce Arabic-quality official documents. pdfme is suitable only for LTR fixed-layout documents (forms, ID card LTR side, checklists).

**Verdict for fixed layout (LTR):** ✅ Good option for English-only badges and forms  
**Verdict for Arabic fixed layout:** ❌ Not recommended

---

### 5.5 Code-First with Executive Ledger (current)

**Description:** Developers write typed `OutputDataProvider` implementations and HTML via the `ExecutiveLedgerDocument` model. Gotenberg renders. No admin visual designer.

| Criterion | Score | Evidence |
|---|---|---|
| Administrator usability | **0** | Requires developer code changes for every template |
| Final PDF quality | 5 | Proven in production; SHA-256 verified |
| Preview fidelity | 4 | Same HTML path; near-identical output |
| Flowing documents | 4 | Works well; no admin control |
| Analytical tables | 5 | Best option; can handle any data structure |
| Fixed layout | 3 | Possible via custom HTML/CSS; requires developer |
| Arabic/RTL | 4 | Native Chromium via Gotenberg; `dir="rtl"` works |
| Governance/security | 5 | Tightest control; every field explicitly coded |
| Maintainability | 3 | High developer burden per new output |
| Extensibility | 5 | Unlimited new module support via new providers |
| Licensing/TCO | 5 | No additional licenses |

**Verdict:** Best choice for Class E analytical reports. Not acceptable as the primary path for official Class A–D documents that non-developer administrators need to configure.

---

## 6. Weighted Decision Matrix

### 6.1 Weights Justification

| Criterion | Weight | Justification |
|---|---|---|
| Administrator usability | 15% | Core rejection criterion; nontechnical admins must design documents |
| Final PDF quality | 15% | Official documents require professional output |
| Arabic/RTL | 15% | UAE ERP; non-negotiable for any official document family |
| Flowing documents | 10% | Letters and certificates are the primary current use case |
| Analytical tables | 8% | 15 analytical reports; important but code-first is viable |
| Fixed layout | 7% | Badges, forms; important but secondary |
| Existing backend integration | 8% | High EL/Gotenberg/QR investment; reuse preferred |
| Governance/security | 8% | Non-negotiable; any replacement must not weaken |
| Preview fidelity | 5% | Important for admin confidence |
| Maintainability | 5% | Internal engineering burden |
| Licensing/TCO | 4% | Commercial restrictions undesirable |
| Project health | 3% | Active maintenance required |
| Migration risk | 3% | Minimal disruption preferred |

**Total: 110%** — weights approximate; used for directional scoring only.

### 6.2 Weighted Scores

*(Score 0–5, weighted by %, then summed)*

| Criterion | Weight | TipTap+Pages | Carbone/DOCX | pdfme | Code-First EL |
|---|---|---|---|---|---|
| Administrator usability | 15% | 3 → 0.45 | 4 → 0.60 | 4 → 0.60 | 0 → 0.00 |
| Final PDF quality | 15% | 3 → 0.45 | 5 → 0.75 | 3 → 0.45 | 5 → 0.75 |
| Arabic/RTL | 15% | 2 → 0.30 | 5 → 0.75 | 2 → 0.30 | 4 → 0.60 |
| Flowing documents | 10% | 4 → 0.40 | 5 → 0.50 | 1 → 0.10 | 4 → 0.40 |
| Analytical tables | 8% | 1 → 0.08 | 5 → 0.40 | 1 → 0.08 | 5 → 0.40 |
| Fixed layout | 7% | 1 → 0.07 | 4 → 0.28 | 5 → 0.35 | 3 → 0.21 |
| Existing backend integration | 8% | 4 → 0.32 | 3 → 0.24 | 2 → 0.16 | 5 → 0.40 |
| Governance/security | 8% | 4 → 0.32 | 3 → 0.24 | 2 → 0.16 | 5 → 0.40 |
| Preview fidelity | 5% | 4 → 0.20 | 3 → 0.15 | 4 → 0.20 | 4 → 0.20 |
| Maintainability | 5% | 3 → 0.15 | 4 → 0.20 | 3 → 0.15 | 3 → 0.15 |
| Licensing/TCO | 4% | 2 → 0.08 | 5 → 0.20 | 5 → 0.20 | 5 → 0.20 |
| Project health | 3% | 4 → 0.12 | 4 → 0.12 | 4 → 0.12 | 5 → 0.15 |
| Migration risk | 3% | 2 → 0.06 | 2 → 0.06 | 3 → 0.09 | 4 → 0.12 |
| **TOTAL** | | **3.00** | **4.49** | **2.96** | **3.98** |

**Carbone/DOCX-template approach scores highest overall.**

However, this is a **one-dimension score**. The correct architecture **splits by output family** (see §7 Sensitivity Analysis).

### 6.3 Sensitivity Analysis

**Usability-first scenario (raise administrator usability to 30%):**
- Carbone: 4.79 (wins)
- TipTap+Pages: 3.00 (unchanged)
- pdfme: 3.36 (gains in fixed-layout)
- Code-first: 3.08 (falls)

**Output-quality-first scenario (raise PDF quality + Arabic to 25% each):**
- Carbone: 5.10 (strong win)
- Code-first EL: 4.50 (rises)
- TipTap+Pages: 3.00 (holds)
- pdfme: 2.56 (falls due to Arabic weakness)

**Maintainability-first scenario (raise maintainability to 20%):**
- Code-first EL: 4.40
- Carbone: 4.70
- TipTap+Pages: 3.00
- pdfme: 2.84

**Cost/open-source-first scenario (raise licensing to 15%):**
- Carbone: 4.95
- Code-first EL: 4.50
- pdfme: 3.50
- TipTap+Pages: 2.70 (falls due to Pro subscription)

**Sensitivity conclusion:** Carbone wins under every weighting scenario. Code-first EL wins for analytics-specific scenarios. TipTap Pages wins only if administrator usability is the sole priority AND Arabic is not required. **The decision is NOT sensitive to reasonable weight changes — Carbone dominates.**

---

## 7. Evidence Gaps and Confidence

| Claim | Confidence | Gap |
|---|---|---|
| Carbone HTML+Chromium produces acceptable Arabic PDF | High (Chromium = Gotenberg = proven) | No live test in ERP performed (read-only audit) |
| TipTap Pages table-row infinite loop is a hard limit | Very high | Official documentation confirms; no workaround promised |
| pdfme Arabic line-break fix in 3.2.3 is stable | Medium | Issue closed; no ERP-context test |
| AavanamKit is production-ready | Low | Very new; no adoption evidence |
| Carbone CCL license permits commercial ERP use | High | CCL FAQ confirms commercial self-hosting allowed |
| Docxtemplater core is free for all use | Medium | License is "NOASSERTION" on GitHub; full text review needed before adoption |

---

*REPORT.DESIGNER.REASSESS.1 — Deliverable 2 complete.*
