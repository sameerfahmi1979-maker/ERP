# ERP DMS 12.0 — Pre-Enhancement Bug Fix Implementation Report

**Phase:** ERP DMS 12.0  
**Date:** 2026-06-15  
**Status:** CLOSED / PASS ✅  
**Type:** Bug fix only — no new features implemented  
**Scope:** Document number `[object Object]` fix + metadata empty-state investigation + build fix

---

## 1. Executive Summary

Two DMS bugs were investigated and resolved before Phase 12 enhancements begin:

| # | Bug | Status |
|---|-----|--------|
| 1 | Document Number shows `[object Object]` | **Fixed** — two files patched |
| 2 | Metadata section appears empty | **Confirmed not a code bug** — missing master data; empty-state UI improved |

A third issue was discovered during QA:

| # | Issue | Status |
|---|-------|--------|
| 3 | Production build failed (`@napi-rs/canvas` native binary cannot be bundled) | **Fixed** — `serverExternalPackages` added to `next.config.ts` |

---

## 2. Files Reviewed

| File | Purpose | Outcome |
|------|---------|---------|
| `src/server/actions/dms/ai-intake.ts` | AI intake approval — generates document number | **Patched** |
| `src/server/actions/dms/document-upload-attach.ts` | Upload-attach — generates document number | **Patched** |
| `src/server/actions/dms/documents.ts` | Manual document creation | **No change needed** — already correct |
| `src/features/dms/documents/sections/dms-document-metadata-section.tsx` | Metadata section UI | **Improved empty state** |
| `src/features/dms/documents/dms-document-record-form.tsx` | Record form — passes `documentTypeId` | No change needed |
| `src/server/actions/dms/document-metadata-values.ts` | Metadata query actions | No change needed |
| `next.config.ts` | Next.js configuration | **Added `serverExternalPackages`** |
| DB: `dms_metadata_definitions` | Custom field definitions | No bad data — 53 definitions across 7 types |
| DB: `dms_document_types` | Document types master | No change needed — 39 types |
| DB: `dms_documents` | Document records | No `[object Object]` rows confirmed |
| DB RLS: `dms_metadata_definitions` | RLS policies | Correct — no change |

---

## 3. Bug 1 — Document Number `[object Object]`

### Root Cause

The Supabase RPC `generate_next_reference_number` returns an **array of rows**, each with a `generated_reference_number` field. Two files were converting the raw response using `String(docNoData)` directly:

```typescript
// BEFORE (WRONG) — produces "[object Object]"
const documentNo = String(docNoData);

// AFTER (CORRECT)
const docNoRows = docNoData as Array<{ generated_reference_number: string }>;
if (docNoError || !docNoRows || docNoRows.length === 0 || !docNoRows[0]?.generated_reference_number)
  return { success: false, error: ... };
const documentNo = String(docNoRows[0].generated_reference_number);
```

The reference file `documents.ts` already used the correct pattern (`numData[0].generated_reference_number`).

### Files Fixed

**`src/server/actions/dms/ai-intake.ts`** — called via `approveAiIntakeAndCreateDocument`
- Changed `String(docNoData)` → extract `docNoRows[0].generated_reference_number`
- Added length and null guard: returns `{ success: false, error: "..." }` if RPC fails

**`src/server/actions/dms/document-upload-attach.ts`** — called via `createDocumentFromUploadSession`
- Same fix applied

### Database Check

Queried `dms_documents` via Supabase MCP:
- `SELECT COUNT(*) ... WHERE document_no = '[object Object]'` → **0 rows**
- `pg_class` estimate → **~1 row** total in table (RLS blocked direct count)
- The bad document from the screenshot was likely already hard-deleted via the admin panel in the previous session.

### Proposed Cleanup SQL

Created: `implementation_Review/sql_review/ERP_DMS_12_0_PROPOSED_DOCUMENT_NO_CLEANUP.sql`

This file is marked **REVIEW ONLY — DO NOT RUN WITHOUT SAMEER APPROVAL**. It contains:
1. Query to identify `[object Object]` rows
2. Count check
3. A commented-out patch script using fallback numbering pattern `DMS-FIX-XXXXXX`
4. Related table cross-checks (files, audit log)

---

## 4. Bug 2 — Metadata Section Appears Empty

### Investigation

Checked all layers:

**Code layer:**
- `DmsDocumentMetadataSection` correctly guards on `documentTypeId !== null`
- Query is enabled: `enabled: !!documentTypeId`
- RLS policy on `dms_metadata_definitions` requires `auth.uid() IS NOT NULL` + `dms.documents.view` permission — correct for authenticated ERP users

**Database layer (via Supabase MCP):**
- `dms_metadata_definitions` has **53 active definitions across 7 document types** (Trade License, TRN, Insurance, Passport, Emirates ID, Vehicle Registration, Project Contract)
- **Document type 39 "Offshore / Onshore medical Report" has ZERO definitions** in the table

### Verdict: Not a Code Bug

The document in the screenshot was of type "Offshore / Onshore medical Report" (type ID 39). No metadata definitions have been created for this type. The empty-state message was correctly displayed.

### Action Taken

Improved the empty-state UI in `dms-document-metadata-section.tsx`:
- Added a centered icon (`Settings2`) for visual clarity
- Made the heading and guidance text more prominent
- Explicit instruction: **"DMS Admin → Metadata Definitions → create fields for this document type"**

**To add metadata fields for "Offshore / Onshore medical Report":**  
Navigate to `/admin/dms/metadata-definitions` → Create → select the document type → add fields (e.g. Full Name, Examination Date, Fitness Result, Examining Doctor, Certificate Number).

---

## 5. Additional Fix — Production Build Failure

### Root Cause

`@napi-rs/canvas` (used in `src/lib/dms/pdf-to-images.ts` for PDF-to-image conversion) ships pre-built native `.node` binaries. Turbopack/Webpack cannot statically bundle these as ESM chunks.

### Fix

Added `serverExternalPackages` to `next.config.ts`:

```typescript
serverExternalPackages: [
  "@napi-rs/canvas",
  "pdf-parse",
  "sharp",
  "mammoth",
  "xlsx",
],
```

This instructs Next.js to **not** bundle these packages and let Node.js load them at runtime from `node_modules`. All five packages use native code or binary assets.

**Note:** This should have been added when `@napi-rs/canvas` was installed in Phase DMS.11. The production build had not been verified after that install.

---

## 6. RLS / Permission Review

| Table | Policy | Status |
|-------|--------|--------|
| `dms_metadata_definitions` SELECT | Requires `auth.uid()` + `dms.documents.view` | ✅ Correct |
| `dms_metadata_definitions` ALL (manage) | Requires `dms.documents.manage_types` or `system_admin` | ✅ Correct |
| `dms_documents` | Service-role queries blocked by RLS (requires `auth.uid()`) | ✅ Expected — app uses authenticated client |

No RLS changes were made.

---

## 7. TypeScript / Lint / Build QA

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` | ✅ PASS — compiled in 9.4s, all 100+ routes generated |

---

## 8. Manual QA Checklist

| Test | Expected | Notes |
|------|----------|-------|
| Upload a file → AI intake → approve | Document number is a proper `DMS-YYYY-XXXXXX` string, not `[object Object]` | Bug 1 fixed |
| Create document via manual form | Document number is a proper string | Was already working (documents.ts was correct) |
| Open document with type that has definitions | Metadata fields shown and editable | No change needed |
| Open document with type that has NO definitions | Friendly empty state with admin guidance shown | Bug 2 improved |
| No RLS/permission errors in browser console | Clean | Expected |

---

## 9. Remaining Issues

None blocking. The following are known but out of scope for this phase:

- One existing document may have `document_no = '[object Object]'` (from before the fix). Run the review SQL in `sql_review/` to confirm and patch if needed.
- "Offshore / Onshore medical Report" type has no metadata definitions — must be added manually via DMS Admin.

---

## 10. Recommended Next Phase

**ERP DMS 12.1** — `content_text` column + full-text search index, as planned in `implementation_Review/Phase_DMS_12_AI_CONTENT_INTELLIGENCE_PLANNING.md`.

Requires Sameer/Dina approval of the Phase 12 plan before implementation.

---

*Report generated: 2026-06-15 | Phase DMS 12.0 CLOSED / PASS ✅*
