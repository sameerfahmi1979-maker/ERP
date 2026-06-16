# ERP DMS OCR-AI FIX.1 — OCR / AI Text Pipeline Deep Investigation and Unified Fix Plan

**Project:** ALGT ERP
**Repository:** `c:\dev\agt-erp`
**Status:** PLAN ONLY — Awaiting Sameer/ChatGPT review and approval before implementation
**Date:** 2026-06-16
**Supabase project:** `https://mmiefuieduzdiiwnqpie.supabase.co` (via `user-supabase`)
**Trigger case:** `DMS-2026-000013` (`sameer_EID_3028.pdf` — scanned Emirates ID PDF)

> **This is NOT original ERP DMS.14.** Original DMS.14 remains reserved for **Integration Readiness for HR,
> Fleet, Workshop, Projects, Finance, and HSE**. This document supersedes the mis-named working file
> `ERP_DMS_14_OCR_AI_PIPELINE_DEEP_INVESTIGATION_AND_FIX_PLAN.md`.

---

## 1. Title / Status / Date / Purpose

- **Title:** ERP DMS OCR-AI FIX.1 — OCR / AI Text Pipeline Deep Investigation and Unified Fix Plan
- **Status:** PLAN ONLY — no code, no migration, no RLS change executed.
- **Date:** 2026-06-16
- **Purpose:** Diagnose why OCR / extracted text is not working for DMS documents (notably scanned IDs and
  image-based PDFs) and define a single, unified fix that makes **all six document-intelligence menus**
  (OCR/Text, Extracted Text, AI Summary, Semantic Search, Ask AI, AI Analysis) reliably show AI-extracted text.

---

## 2. Why This Is Not Original DMS.14

The earlier working file was mistakenly numbered "DMS 14". The DMS roadmap reserves **DMS.14** for
**Integration Readiness** across HR, Fleet, Workshop, Projects, Finance, and HSE. To avoid corrupting the
roadmap sequence, this OCR/AI text-pipeline repair is tracked as a **named fix gate**:

```
ERP DMS OCR-AI FIX.1 — OCR / AI Text Pipeline Deep Fix
```

It slots **before** DMS real-document UAT and before original DMS.13 security QA and DMS.14 integration work
(see §20).

---

## 3. Executive Summary

OCR is **supposed** to run through GPT‑4.1 vision, but the **live database proves the running server still
executes the old `pdf-parse` text-layer path**, which returns empty text for scanned/image PDFs and stores
nothing. On top of that stale-deployment issue there are **five real code/data defects** that each
independently break the chain. Because **every downstream menu reads from the same two tables**
(`dms_document_files.ocr_text` and `dms_document_content.content_text`), a single upstream failure cascades
into all six menus showing "no text".

**Is OCR using AI? No** — for `DMS-2026-000013`, every OCR job used `provider = pdf_text` (pdf-parse), never
vision. The AI never saw the file during the manual "Run OCR" clicks (though it *did* read it during intake,
yet the transcription was not persisted).

The unified fix: (A) actually ship vision OCR, (B) route every flow through one extractor
`extractFileContent`, (C) capture the transcription reliably (token bump + JSON salvage), (D) persist through
one shared writer `persistFileOcrResult`, (E) repair approval-time content sync with a vision fallback,
(F) backfill broken documents, (G) polish UI failure states, (H) verify with a real-document matrix.

---

## 4. Current Symptoms

- For `DMS-2026-000013`: **OCR/Text** shows no text; **Extracted Text** shows "No extracted text yet";
  **AI Summary** says "No extracted text available. Run OCR or AI intake first"; **Semantic** has nothing to
  index; **Ask AI** has no content to answer from; **AI Analysis** errors on the scanned PDF.
- "Run OCR" appears to succeed (job marked completed) but no text is stored.
- Document-level OCR status shows `complete` while the file shows `not_started` — a visible contradiction.

---

## 5. Live Database Audit Evidence (`user-supabase`, project `mmiefuieduzdiiwnqpie`)

### 5.1 Document + file state (document_id = 13)
```
document_no            = DMS-2026-000013
doc.ocr_status         = complete         ← document-level says complete
doc.ocr_text_available = false            ← but no text available (contradiction)
doc.ai_status          = not_required
file.file_name         = sameer_EID_3028.pdf   (application/pdf)
file.ocr_status        = not_started      ← file-level says not started (contradiction)
file.ocr_provider      = null
file.ocr_text          = null             ← NO text stored anywhere
```

### 5.2 OCR jobs (`dms_ai_extraction_jobs`, document_id = 13)
| job | time (UTC) | provider | model | status |
|----|-----------|----------|-------|--------|
| #60 | 06:10 | **pdf_text** | pdf-parse@text-layer | completed |
| #59 | 06:00 | **pdf_text** | pdf-parse@text-layer | completed |
| #56 | 05:19 | **pdf_text** | pdf-parse@text-layer | completed |
| #55 | 05:15 | **pdf_text** | pdf-parse@text-layer | completed |
| #54 | 04:58 | **pdf_text** | pdf-parse@text-layer | completed |
| #53 | 04:58 | **pdf_text** | pdf-parse@text-layer | completed |

> **Smoking gun:** jobs #59 (10:00 local) and #60 (10:10 local) ran **after** the vision-only OCR rewrite, yet
> still used `pdf_text` → the new code is **not running** (stale server / Turbopack cache). pdf-parse returns
> empty for this scanned EID, marks the job "completed", stores `ocr_text = null`.

### 5.3 AI intake result (`dms_ai_extraction_results`, document_id = 13)
```
result #22  ai_status = accepted   result_type = combined   classification_confidence = high
suggested_title = "Emirates ID — Sameer Fahmi Ibrahim Abu Elayyan"
raw_ocr_text = NULL     ← AI READ the card (correct name!) but transcription NOT persisted
raw_response_json keys = { warnings, field_count, classification, suggested_title, suggested_description }
```

### 5.4 Extracted content (`dms_document_content`, document_id = 13)
```
(no rows)   ← table is EMPTY for this document → Extracted Text / AI Summary / Semantic / Ask AI all blank
```

> **No fresh-audit contradictions:** all prior findings (RC‑1…RC‑6) re-confirmed against the live DB on
> 2026-06-16.

---

## 6. RLS and Schema Audit Summary

Live audit via `user-supabase` (`pg_class` / `pg_policy`) on 2026-06-16. **No RLS changes are to be made in
this planning phase.**

| Table | RLS enabled | RLS forced | Policies | Notes |
|-------|-------------|-----------|----------|-------|
| `dms_documents` | ✅ | ✅ | 4 | confidentiality gates apply (hr/legal/executive) |
| `dms_document_files` | ✅ | ✅ | 2 | holds per-file `ocr_text` |
| `dms_document_content` | ✅ | ✅ | 2 | holds consolidated `content_text` |
| `dms_ai_extraction_jobs` | ✅ | ✅ | 2 | OCR/AI job audit trail |
| `dms_ai_extraction_results` | ✅ | ✅ | 2 | holds `raw_ocr_text`, `raw_response_json` |
| `dms_upload_sessions` | ✅ | ✅ | 3 | intake sessions |
| `dms_upload_batches` | ✅ | ✅ | 3 | batch intake (owner-scoped + admin) |
| `erp_ai_provider_configs` | ✅ | ✅ | 4 | AI provider config; secrets via env only |
| `erp_ai_feature_flags` | ✅ | ✅ | 2 | feature flags |

**Conclusion:** RLS is enabled **and forced** on every table in scope. No low-risk exceptions identified. The
fix will continue to use the RLS-enforced client for user-facing reads/writes and the admin client only where
existing project patterns require it (storage download, system content sync), always **after** permission
checks. **Supabase tool: `user-supabase` only. `plugin-supabase-supabase` must never be used (wrong project).**

Relevant column facts confirmed:
- `dms_documents.ocr_status` default = `'not_required'`; `ocr_text_available` default = `false`.
- `dms_document_content` columns: `content_text`, `content_text_source`, `content_text_char_count`,
  `is_truncated`, `content_text_sha256`, timestamps.
- `dms_ai_extraction_results.raw_ocr_text` exists (text); `raw_response_json` is sanitized on write.

---

## 7. Code Path Audit

### 7.1 Run OCR button path
- **UI component:** `src/features/dms/documents/sections/dms-document-ocr-section.tsx` → `OcrFileRow.handleRun`
  (per file) and `handleTriggerAll` (all files).
- **Server action:** `triggerDmsOcrForFile` (and `triggerDmsOcrForDocument`) in
  `src/server/actions/dms/ocr.ts`.
- **Engine today (running server):** `pdf-parse` via the OCR provider factory (`provider = pdf_text`). The
  vision rewrite exists in source but is **not running** (see §5.2). **Must be AI vision via
  `extractFileContent` + GPT‑4.1.**
- **Provider/model written to jobs:** currently `pdf_text` / `pdf-parse@text-layer`; target `vision` / `gpt-4.1`.
- **Persistence:** writes `dms_document_files.ocr_text`, recomputes `dms_documents` OCR summary, then syncs
  `dms_document_content` (only when text is non-empty).

### 7.2 AI intake approval path
- **Action:** `src/server/actions/dms/ai-intake.ts` (`startAiIntakeFromUploadSession` / approval block ~line 1258).
- **Persists full transcription?** Intended (writes `raw_ocr_text` from local text or
  `fullTextTranscription`, ~line 615), but **observed null** for doc 13 → likely JSON truncation at
  `MAX_TOKENS=6000`.
- **Writes `raw_ocr_text`?** Yes — but it was empty in practice.
- **Syncs `dms_document_content`?** Yes — **but gated** on `raw_ocr_text` being non-empty (~line 1271).
- **If `raw_ocr_text` is empty?** Nothing propagates; file stays `not_started`; content stays empty.
  **No fallback to vision OCR exists today.**

### 7.3 Batch intake approval path
- **Action:** `src/server/actions/dms/batch-intake.ts` (`finalizeDraftIntake`, content sync ~line 887).
- **Same OCR/transcription logic?** Shares the AI output model, but has its **own** copy of the sync block
  (`ocr_provider = "ai_intake"`), gated on `raw_ocr_text` like 7.2.
- **Persists OCR consistently?** Partially — different provider string, separate code path (drift risk).
- **Syncs content text?** Yes when `raw_ocr_text` present; otherwise no.

### 7.4 AI Analysis tab path
- **Action:** `src/server/actions/dms/ai-analysis.ts` (~lines 325–410).
- **Renders scanned PDFs to images?** ❌ **No.** PDFs go through `extractPdfText` only; scanned PDFs yield no
  text, get marked `complete` with `ocr_text=null`, and are **not** pushed to `imageFiles` (that branch is
  `isImage(mime)` only). Result: "No supported file content found".
- **Uses `extractFileContent`?** ❌ No — bespoke `isPdf`/`isImage`/`extractPdfText` logic.
- **Still uses direct `pdf-parse`?** ✅ Yes (`extractPdfText`).
- **Caches OCR into `dms_document_files`?** ✅ Yes (writes `ocr_status`/`ocr_text`), but inconsistently
  (marks scanned PDFs complete with null).

---

## 8. Menu-to-Data-Source Map

| Menu | Server action | Reads from | Fails when |
|------|---------------|-----------|------------|
| OCR / Text | `getDmsFileOcrText` / `triggerDmsOcrForFile` (`ocr.ts`) | `dms_document_files.ocr_text` | OCR stores null (scanned PDF via pdf_text) |
| Extracted Text | `getDocumentContentText` (`document-content.ts`) | `dms_document_content.content_text` | content table empty |
| AI Summary | `generateAndSaveDmsAiSummary` (`ai-summary.ts`, line 187/206) | `dms_document_content.content_text` | content empty → "Run OCR first" |
| Semantic Search | `semantic-search.ts` (line 138–154) | `ai_summary` → fallback `content_text` | both empty |
| Ask AI | `document-qa.ts` (line 201–209) | `content_text` + `ai_summary` + metadata | content empty |
| AI Analysis | `ai-analysis.ts` (line 325–410) | **own** download+extract path | scanned PDF not rendered to images |

---

## 9. Root Cause Analysis

### RC‑1 — Stale deployment: vision-only OCR rewrite is not running *(PRIMARY)*
Jobs #59/#60 prove `pdf_text` still runs after the rewrite. The vision OCR code never took effect (server not
restarted / Turbopack cache). **This is the first thing to fix and verify.**

### RC‑2 — AI intake does not reliably persist `raw_ocr_text`
Correct classification but `raw_ocr_text = null`. Likely cause: vision requests don't use
`response_format: json_object` and `MAX_TOKENS = 6000` truncates the JSON when the transcription is long, so
the long `full_text_transcription` is lost while the small classification survives.

### RC‑3 — Content sync is gated on `raw_ocr_text` with no fallback
`ai-intake.ts` (~1271) and `batch-intake.ts` (~887) only sync `dms_document_content` / flip file
`ocr_status=complete` when `raw_ocr_text` is non-empty. Null transcription → nothing propagates; file stays
`not_started`.

### RC‑4 — AI Analysis never renders scanned PDFs to images
`ai-analysis.ts` only sends `isImage` MIME types to vision; scanned PDFs are excluded and the call fails. It
also uses bespoke `pdf-parse` instead of the unified `extractFileContent`.

### RC‑5 — OCR status & provider written inconsistently by 4 code paths
`ocr.ts`, `ai-intake.ts` (`ai_intake`), `ai-analysis.ts` (`pdf-parse@text-layer`), `batch-intake.ts`
(`ai_intake`) each write status/provider differently and at different scopes → the doc=`complete` /
file=`not_started` contradiction.

### RC‑6 — UI/UX masks the failure
Old "Run OCR" passed `forceRetry: true` on already-complete files (overwriting good AI text with empty) and
hid the button for `not_supported` types. A UI fix exists in source but is part of the same unshipped build
(RC‑1).

---

## 10. Unified Fix Plan — Steps A–H

### Step A — Deployment/cache verification and provider proof
- **Objective:** Prove the vision-OCR code actually runs.
- **Files likely to change later:** none (operational); possibly `next.config`/scripts if caching is the cause.
- **Expected behavior:** After cache clear + restart, a fresh OCR run on doc 13 records `provider = vision`,
  `model = gpt-4.1`, and populates `dms_document_files.ocr_text`.
- **Acceptance:** New `dms_ai_extraction_jobs` row shows `provider = vision`; `ocr_text` non-null.
- **Risks:** Low. If still `pdf_text`, locate any other job-creating path.
- **Rollback/containment:** Operational only; no code risk.

### Step B — Unified extraction path for all OCR/AI analysis flows
- **Objective:** Every flow uses `extractFileContent(buffer, mime, filename)` (text for digital, rendered page
  images for scanned PDFs, native images, DOCX/XLSX).
- **Files likely to change later:** `ai-analysis.ts` (replace bespoke loop), `ocr.ts` (confirm), helpers.
- **Expected behavior:** Scanned PDFs, images, DOCX, XLSX all produce AI-readable content; no "unsupported".
- **Acceptance:** AI Analysis processes a scanned PDF; no path calls `pdf-parse` directly except inside
  `extractFileContent`.
- **Risks:** Vision cost per file; large PDFs limited to first N pages (warn — see §9.4).
- **Rollback/containment:** Feature-flag the analysis change if needed.

### Step C — Reliable transcription capture and validator hardening
- **Objective:** Never lose the transcription to truncated JSON.
- **Files likely to change later:** `openai-dms-adapter.ts` (`MAX_TOKENS` 6000 → **16000**; consider
  `json_object`), `result-validator.ts` (salvage `full_text_transcription` on parse failure), `prompt-builders.ts`.
- **Expected behavior:** Long bilingual docs return full transcription; partial JSON still yields transcription.
- **Acceptance:** A multi-page scanned doc stores a full transcription; forced-truncation test still recovers text.
- **Risks:** Higher token cost/latency; mitigated by per-file scope.
- **Rollback/containment:** Token value is a constant; easy revert.

### Step D — Shared OCR persistence helper and status reconciliation
- **Objective:** One writer for all OCR results.
- **Files likely to change later:** new `persistFileOcrResult(...)`; callers `ocr.ts`, `ai-intake.ts`,
  `batch-intake.ts`, `ai-analysis.ts`.
- **Expected behavior:** File + document status + `ocr_text_available` + `content_text` always consistent.
- **Acceptance:** No path writes OCR status/text directly except the helper; doc/file statuses never contradict.
- **Risks:** Refactor touch points; covered by verification matrix.
- **Rollback/containment:** Helper is additive; callers switch incrementally.

### Step E — Approval-time fallback OCR and content sync repair
- **Objective:** If `raw_ocr_text` is empty at approval, run vision OCR on the file, then sync content.
- **Files likely to change later:** `ai-intake.ts`, `batch-intake.ts`.
- **Expected behavior:** Approving an image-only doc always ends with populated `ocr_text` + `content_text`.
- **Acceptance:** Approve a scanned doc with empty transcription → content present afterward.
- **Risks:** Extra vision call at approval; acceptable per cost approval.
- **Rollback/containment:** Guarded by the unified helper.

### Step F — Backfill admin tool for broken documents
- **Objective:** Repair existing broken documents (doc 13 and all similar).
- **Files likely to change later:** new admin action `adminBackfillMissingOcrText`, admin UI entry.
- **Expected behavior:** Bulk re-run vision OCR + content sync for documents with missing text; also single-doc.
- **Acceptance:** doc 13 + all `ocr_text_available=false` docs become populated; statuses reconciled.
- **Risks:** Cost on large corpora; mitigated by batch size, dry-run, resume, cost warning.
- **Rollback/containment:** Dry-run first; batched, resumable.

### Step G — UI/UX visibility and failure-state polish
- **Objective:** Accurate statuses and actionable failure states.
- **Files likely to change later:** `dms-document-ocr-section.tsx`, content/summary sections.
- **Expected behavior:** "Run OCR (AI)" available for all supported types; clear messages; no silent overwrite.
- **Acceptance:** Buttons/states correct for images and scanned PDFs; no false "complete".
- **Risks:** Low.
- **Rollback/containment:** UI-only.

### Step H — Verification matrix and UAT
- **Objective:** Prove all menus work across real document types (see §15).
- **Files likely to change later:** none (test/verification).
- **Acceptance:** Full matrix passes; no sensitive logs; TS + build pass.
- **Risks:** None.
- **Rollback/containment:** N/A.

---

## 11. Files In Scope

| File | Anticipated change |
|------|--------------------|
| `src/server/actions/dms/ocr.ts` | Confirm vision-only path runs; route through `persistFileOcrResult` |
| `src/server/actions/dms/ai-analysis.ts` | Replace bespoke extraction with `extractFileContent`; render scanned PDFs |
| `src/server/actions/dms/ai-intake.ts` | Persist `raw_ocr_text`; approval-time vision fallback; use helper |
| `src/server/actions/dms/batch-intake.ts` | Same approval-time fallback + helper |
| `src/lib/dms/ai/openai-dms-adapter.ts` | `MAX_TOKENS` → 16000; consider `json_object` for analyze |
| `src/lib/dms/ai/result-validator.ts` | Salvage `full_text_transcription` on truncated JSON |
| `src/lib/dms/ai/prompt-builders.ts` | Reinforce transcription-first; page-limit warning |
| `src/server/actions/dms/document-content.ts` | Consumer of `persistFileOcrResult` |
| `src/lib/dms/ocr/*` | Retire pdf-parse provider chain (partly done) |
| `src/features/dms/documents/sections/dms-document-ocr-section.tsx` | Confirm/extend UI fix |
| (new) `src/server/actions/dms/ocr-backfill.ts` | `adminBackfillMissingOcrText` |
| (new) `src/lib/dms/ocr/persist-file-ocr-result.ts` | Shared persistence helper |

---

## 12. Database / RLS Considerations

- **No schema migration is expected** — all required columns exist (`ocr_text`, `ocr_status`, `ocr_provider`,
  `ocr_model`, `ocr_completed_at`, `ocr_text_available`, `content_text`, `raw_ocr_text`). If the implementation
  finds a genuinely missing column, it must add a migration via `supabase/migrations/` and apply via
  `user-supabase` only.
- **No RLS changes** in this fix. RLS is already enabled+forced on all tables (§6). The shared helper writes
  via existing patterns (RLS client for user actions; admin client only for storage download + system content
  sync, after permission checks).
- **Status reconciliation** is data-only (recompute `dms_documents.ocr_status` from file rows) — no structural
  change.

---

## 13. Security / Confidentiality / Logging Rules

- Do **not** weaken RLS; keep enabled+forced on all tables.
- Do **not** expose OCR text to unauthorized users; respect confidentiality gates for `hr`, `legal`,
  `executive` (admin-only reads as today).
- Do **not** log OCR text, `content_text`, prompts, or raw AI responses.
- Do **not** log Emirates ID / passport / TRN numbers in audit records (audit stores events/metadata only).
- Use the **RLS-enforced client** for user-facing reads/writes.
- Use the **admin client** only where existing project patterns require it (storage download, system content
  sync) and only **after** permission checks.
- API keys (`OPENAI_API_KEY`) remain in **environment variables only**; never in DB rows or client code.

---

## 14. Backfill Strategy

Admin action `adminBackfillMissingOcrText` (Step F) must support:
- **Batch size** (default small, e.g. 5–10 docs/run) to control GPT‑4.1 cost.
- **Dry run** (report what would change; no writes, no AI calls or minimal probe).
- **Resume** (skip already-fixed docs; idempotent).
- **Target one document** (e.g. doc 13) or **target all broken documents**
  (`ocr_text_available=false` OR file `ocr_text IS NULL` / `ocr_status != complete`).
- **Cost warning** surfaced before bulk execution.
- **No content logging**; only counts/IDs/status in results.
- **Status reconciliation** as part of each fix (document vs file).

Decision recorded: **backfill scope = BOTH** (bulk-all + on-demand), per Sameer 2026-06-16.

---

## 15. Verification Matrix

For each document type, verify: **OCR/Text · Extracted Text · AI Summary · Semantic Search · Ask AI ·
AI Analysis · document-level OCR flags · file-level OCR flags · `dms_document_content` populated · no sensitive
logs.**

| # | Test document | Key expectation |
|---|---------------|-----------------|
| 1 | Scanned Emirates ID PDF (doc 13) | Vision OCR; full bilingual text; all menus populated |
| 2 | Emirates ID front/back images | Both sides transcribed; all menus populated |
| 3 | Passport image | MRZ + fields transcribed; all menus populated |
| 4 | Scanned trade license PDF | Rendered to images; license fields extracted |
| 5 | Digital PDF with text layer | Text-layer path; no unnecessary vision; all menus populated |
| 6 | DOCX | Text extracted; all menus populated |
| 7 | XLSX | Sheet text extracted; all menus populated |
| 8 | Multi-page scanned PDF | Page-batched vision; transcription not truncated (16k tokens) |
| 9 | Low-quality / rotated image | Best-effort transcription with `[?]` markers; no crash |
| 10 | Confidential HR/legal document | Content restricted to admins; non-admins blocked; no leak/log |

---

## 16. Acceptance Criteria

- New OCR jobs for scanned PDFs use the **AI vision provider**, not `pdf_text`.
- `DMS-2026-000013` OCR/Text is populated after re-run.
- `dms_document_files.ocr_text` populated.
- `dms_document_content.content_text` populated.
- AI Summary can generate.
- Semantic Search can index/search.
- Ask AI can answer based on content.
- AI Analysis can process scanned PDFs.
- Document/file OCR statuses are consistent.
- Broken documents can be backfilled (bulk + single).
- No sensitive text is logged.
- TypeScript passes.
- Build passes.

---

## 17. Hard Rejection Criteria

Reject the later implementation if **any** hold:
1. OCR still uses `pdf_text` for scanned PDFs.
2. AI Analysis still cannot render scanned PDFs.
3. OCR text is persisted in one path but not others.
4. Document/file OCR statuses still contradict after re-run.
5. `dms_document_content` remains empty after successful OCR.
6. OCR/content text is logged.
7. RLS is weakened.
8. Confidential document content leaks.
9. Backfill is missing.
10. TypeScript / build fails.

---

## 18. Implementation Report Requirements

The later implementation must create:
```
implementation_Review/ERP_DMS_OCR_AI_FIX_1_TEXT_PIPELINE_DEEP_FIX_IMPLEMENTATION_REPORT.md
```
Report must include: objective · root causes confirmed · files changed · migration created/applied or
"no migration needed" · RLS findings · OCR provider verification · `DMS-2026-000013` verification ·
menu-by-menu verification · backfill results · security/logging confirmation · TypeScript result ·
build result · known limitations.

---

## 19. Source of Truth Update Requirements (after implementation)

The later implementation must update:
```
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
```
Add a **closed gate**:
```
ERP DMS OCR-AI FIX.1 — OCR / AI Text Pipeline Deep Fix
```
Include: vision OCR confirmed · unified extraction path · shared OCR persistence helper · transcription capture
fix · content sync repair · backfill tool · `DMS-2026-000013` verification · TS/build result · report path.

---

## 20. Remaining Sequence After This Fix

1. **DMS Real-Document UAT** (the verification matrix in §15 with live files).
2. **Original DMS.13 — Security / RLS / Confidentiality / Permission QA.**
3. **Original DMS.14 — Integration Readiness** for HR, Fleet, Workshop, Projects, Finance, HSE.
4. **Optional further DMS polish** only after UAT.

---

## 21. Final Note

This is a planning file only. No implementation, migration, or RLS change has been executed. Awaiting
Sameer/ChatGPT review and approval before generating the implementation prompt.
