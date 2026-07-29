# REPORT.DESIGNER.REASSESS.1 — Deliverable 4
# Audit Fixture and Evidence Index

**Date:** 2026-07-26  
**Environment:** Read-only audit. No application source code was modified. No database migrations were applied. No packages were added or removed. No production templates were published or activated.  
**Test database:** Live Supabase project `mmiefuieduzdiiwnqpie` — read-only SQL queries only.

---

## 1. Environment

| Attribute | Value |
|---|---|
| OS | Windows 10 (build 26200) |
| Shell | PowerShell |
| Runtime | Next.js 16.2.6 / Turbopack |
| Database | Supabase PostgreSQL (live project) |
| Supabase MCP | `user-supabase` (correct project) |
| Gotenberg | Running at `http://localhost:3100` (dev session) |
| Audit access level | Authenticated admin session in dev server |

---

## 2. Tests Performed

### 2.1 Database Inspection (Read-Only SQL)

| Test | Query | Result | Notes |
|---|---|---|---|
| T-DB-01 | `SELECT id, template_name, template_code, template_type, governance_status, visual_editor_engine, studio_schema_version, version_no, is_active FROM erp_report_templates ORDER BY id` | 21 rows returned | 4 published puck, 1 studio draft |
| T-DB-02 | `SELECT visual_editor_engine, governance_status, COUNT(*) FROM erp_report_templates GROUP BY visual_editor_engine, governance_status` | puck: 1 archived, 12 draft, 4 published; studio: 1 draft | Confirms critical finding D-01 |
| T-DB-03 | `SELECT id, report_code, report_name_en, report_category, document_class, module_code, is_active FROM erp_report_registry ORDER BY module_code, report_category` | 28 rows: 27 HR + 1 ADMIN | Full output catalog documented |

### 2.2 Source Code Inspection (Read-Only)

| Test | Files Inspected | Finding |
|---|---|---|
| T-SRC-01 | `src/lib/template-studio/schema.ts` | 8 block types; no header/footer/QR/signatory/stamp/page-break blocks |
| T-SRC-02 | `src/features/template-studio/template-studio-page-client.tsx` | Studio UI; preview via iframe; no A4 boundary |
| T-SRC-03 | `src/features/template-studio/studio-block-editor.tsx` | Block editing UI; up/down chevrons; no drag-and-drop |
| T-SRC-04 | `src/lib/template-studio/schema-to-el.ts` | Correct single-path mapping to Executive Ledger |
| T-SRC-05 | `src/lib/executive-ledger/` (multiple files) | Canonical HTML builder; `@page` rules; branding injection; QR injection |
| T-SRC-06 | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Full history of Report Designer phases read |
| T-SRC-07 | `implementation_Review/PDF/ERP_GLOBAL_OUTPUT_FRAMEWORK_ALL_12_WORK_PACKAGES_IMPLEMENTATION_UAT_AND_CLOSURE_REPORT.md` | WP12 prerequisite claim vs DB state contradiction identified |
| T-SRC-08 | `package.json` (via Glob and existing knowledge) | TipTap core in dependencies; `@tiptap-pro` absent; `@puckeditor/core` absent (removed WP12) |

### 2.3 Web and GitHub Research

| Test | URL Inspected | Date | Finding |
|---|---|---|---|
| T-WEB-01 | tiptap.dev/docs/pages/core-concepts/limitations | 2026-07-26 | Table row non-splittable = hard limit (infinite loop); officially documented |
| T-WEB-02 | tiptap.dev/blog/release-notes/structured-paginated-real-meet-tiptap-pages | 2026-07-26 | TipTap Pages is alpha; requires Pro; no browser print |
| T-WEB-03 | github.com/pdfme/pdfme/issues/398 | 2026-07-26 | Arabic line-break overlap bug; fixed in 3.2.3; underlying approach still fragile |
| T-WEB-04 | github.com/carboneio/carbone | 2026-07-26 | v3.8.2 Apr 2026; CCL license; Arabic via Chromium confirmed |
| T-WEB-05 | carbone.io/documentation/design/template-formats/html.html | 2026-07-26 | HTML template mode; Chromium PDF; i18n translations; RTL support |
| T-WEB-06 | docxtemplater.com | 2026-07-26 | Industry standard DOCX injection; active Jun 2026; no native PDF |
| T-WEB-07 | registry.npmjs.org/@eigenpal/docx-js-editor | 2026-07-26 | New browser DOCX editor; Apache 2.0; Feb 2026 first publish; Arabic unknown |
| T-WEB-08 | github.com/jafranjemal/aavanamkit | 2026-07-26 | New drag-and-drop designer; 2026; insufficient maturity |
| T-WEB-09 | tiptap.dev/docs/conversion/content-types/page-layout/page-structure | 2026-07-26 | Page size not synced between editor and export |
| T-WEB-10 | dev.to/pavelbuild/generating-pdfs-in-7-languages-including-rtl-arabic | 2026-07-26 | react-pdf RTL requires manual workarounds; no native RTL |

### 2.4 Administrator UX Observations (Dev Server)

| Test | Route | Outcome |
|---|---|---|
| T-UX-01 | `/admin/reports/templates` | Template list page loads; all 21 templates visible |
| T-UX-02 | Template Studio editor for draft template | Editor opens; 8 block types available; no A4 boundary visible |
| T-UX-03 | Add heading block, paragraph block, key-value block | Blocks added correctly; TipTap rich text works |
| T-UX-04 | Attempt to add header block | ❌ Not available in block type selector |
| T-UX-05 | Attempt to add QR placeholder block | ❌ Not available |
| T-UX-06 | Click preview | Preview renders in iframe; no page boundary visible |
| T-UX-07 | Attempt to open Puck editor for published template (ID 11) | ❌ Route does not exist (removed in WP12) |
| T-UX-08 | `/admin/reports/templates/governance` | Governance dashboard loads; status cards visible |

---

## 3. Fixtures Created

**No test fixtures were created during this audit.** All database inspection was read-only SQL. No templates were modified, no PDFs were generated, no test records were inserted.

The following existing database records were read (not created or modified):

| Table | Records Inspected | Read-Only? |
|---|---|---|
| `erp_report_templates` | All 21 rows | ✅ Read-only |
| `erp_report_registry` | All 28 rows | ✅ Read-only |
| `erp_generated_pdf_documents` | Existence confirmed; not individually inspected | ✅ Read-only |
| `erp_output_public_links` | Not inspected individually | ✅ Read-only |

---

## 4. Screenshots / PDF Evidence

No screenshots were saved to the file system during this audit (browser-session only observation).

The following evidence exists in the live database:

| Evidence | Location | Status |
|---|---|---|
| Employment Letter PDF | `erp-generated-pdfs` bucket (private) | Exists; SHA-256 verified per WP9 UAT |
| QR verification tokens | `erp_output_public_links` table | Exist; status `issued` or `revoked` |
| Issued document history | `erp_generated_pdf_documents` table | Exists; lifecycle states confirmed |

---

## 5. Blocked Tests and Reasons

| Test | Block Reason | Action Required to Unblock |
|---|---|---|
| Scenario A–J document generation from Studio | Template Studio missing required blocks | Not unblockable without implementation of D-03, D-04, D-11 gap items |
| Arabic/RTL in-editor rendering | No RTL font loading in editor canvas; no Arabic preview | Phase DESIGNER.A.1 must add RTL preview |
| Puck editor for published templates | Route removed in WP12 | Confirm orphaned templates are acceptable (Sameer decision required) |
| WYSIWYG screenshot comparison | Studio preview has no A4 boundary; comparison invalid | Requires A4 boundary implementation |
| Visual regression baseline | No production-published Studio templates exist | Baselines can only be established after Mode A implemented |
| pdfme Arabic real-document test | Read-only audit; no package install | Isolated spike needed (not in ERP repo) |
| Carbone HTML+Arabic end-to-end test | Read-only audit; no package install | Isolated spike needed (not in ERP repo) |
| TipTap Pages Pro evaluation | Pro subscription not held | Evaluate with TipTap trial |

---

## 6. Cleanup Status

**No cleanup is required.** No test fixtures, test templates, test PDFs, or test database records were created during this audit. The environment is unchanged.

---

## 7. Contradictions Found Between Reports and Reality

| Contradiction | Report Claim | Reality | Severity |
|---|---|---|---|
| WP12 prerequisite: "zero published production templates depend on a meaningful Puck layout" | WP12 report and WP13 regression claim this was verified | DB shows 4 published templates with `visual_editor_engine='puck'`; Puck route removed | **High** |
| OUTPUT.3B report: "Template Studio is complete" | Closure report claims Studio is complete | Studio missing header, footer, QR, signatory, stamp, page-break blocks; no A4 preview; 0 published Studio templates | **High** |
| SOT: "REPORT DESIGNER UX.3 CLOSED/PASS" | Implies restricted field governance is complete | Governance code exists; but Studio editor cannot produce a document that actually uses restricted fields in a realistic layout | Medium |

---

*REPORT.DESIGNER.REASSESS.1 — Deliverable 4 complete.*
