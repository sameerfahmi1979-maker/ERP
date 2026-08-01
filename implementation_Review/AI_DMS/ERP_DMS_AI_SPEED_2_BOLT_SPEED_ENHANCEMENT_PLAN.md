# ERP DMS AI SPEED.2 — Bolt Speed Enhancement Plan

**Date:** 2026-08-01
**Status:** PLAN — NOT IMPLEMENTED (awaiting Sameer approval per phase)
**Owner:** Sameer
**Predecessor:** `ERP_DMS_AI_SPEED_1_INTAKE_PIPELINE_SPEED_OPTIMIZATION_IMPLEMENTATION_REPORT.md`

---

## 1. Purpose

Collect ALL remaining speed-enhancement ideas for the DMS OCR + AI analysis pipeline in one
place, so they can be prioritized and executed as separate sub-phases (SPEED.2A, 2B, ...).
Target: uploads feel effectively instant — analysis completes while the user is still in
the inbox.

## 2. Current State (after SETTINGS.1B + SPEED.1, 2026-08-01)

| Done | What |
|---|---|
| ✅ P1 | Azure Document Intelligence OCR live (`ARABIC_OCR_AZURE`, `prebuilt-read`, default for `ocr`, `DMS_OCR_AZURE` flag on). Handles English + Arabic + bilingual. GPT Vision fallback retained. |
| ✅ P2 | OCR router skips PDF→PNG rendering (~5s) when Azure takes the raw buffer; lazy render only on GPT fallback. |
| ✅ P3 | Pass 1 includes top-ranked candidate type's metadata fields (combined classify + extract). Pass 2 skipped when AI confirms the type — saves a full GPT round trip (~7–10s). |
| ✅ P4 | `DEFAULT_DMS_CLASSIFIER` → `gpt-4.1-mini`. |

**Expected current timings:** scanned PDF ~10–15s; digital PDF ~5–8s (dev server).
**Baseline before SPEED.1:** scanned PDF ~44s.

## 3. Enhancement Backlog

### TIER 1 — Perceived speed (feels instant)

#### SPEED.2A — Auto-start AI on upload completion (speculative processing)
- **Idea:** Start `startAiIntakeFromUploadSession` automatically the moment the file lands in
  `dms-temp`, instead of waiting for the user's button click. The file currently sits idle
  for seconds/minutes of human time between upload and click.
- **Effect:** Perceived wait ≈ 0 — results are ready by the time the user opens review.
- **Effort:** LOW–MEDIUM (mostly wiring: fire-and-forget trigger after upload-complete,
  guard against double-start, respect existing `intake_status` state machine).
- **Notes / risks:** Cost — every upload gets analyzed even if the user discards it.
  Add feature flag `DMS_AI_AUTO_START` (default false) + skip when duplicate detected.

#### SPEED.2B — Async intake with live progress (deferred Priority 5)
- **Idea:** Move intake onto the existing Phase 9 job queue (`dms_ai_job_queue`) with
  per-stage status updates (`ocr_processing → classifying → extracting`) and inbox polling.
- **Effect:** User gets control back immediately; watches progress instead of a spinner.
  Also removes server-action timeout risk for very large documents.
- **Effort:** HIGH — requires an actual worker trigger (cron/interval), which is currently
  missing entirely. Per-stage status columns/events + UI polling.
- **Notes:** Combine with 2A for the full "upload → already analyzed" experience.

### TIER 2 — Raw latency reduction

#### SPEED.2C — Stop re-emitting the transcription in GPT output (hidden big win)
- **Idea:** The prompt currently forces the model to copy the full OCR text into
  `full_text_transcription` in its JSON output. Output tokens are the SLOWEST part of an
  LLM call — for a 2-page document this adds ~5–10s of pure copying. When the OCR router
  already produced text (Azure/local), skip that output field and use `ocrText` directly.
- **Effect:** ~5–10s saved per document with OCR text. Also cuts output-token cost sharply.
- **Effort:** LOW–MEDIUM (prompt-builder variant + `raw_ocr_text` handling already prefers
  local text; keep transcription mandatory ONLY for vision-only inputs).
- **Files:** `src/lib/dms/ai/prompt-builders.ts`, `src/server/actions/dms/ai-intake.ts`.

#### SPEED.2D — Faster Azure polling
- **Idea:** Azure adapter polls every 2s (`POLLING_INTERVAL_MS = 2000`). Small docs finish
  in 1–3s, so polling waste can nearly double OCR time. Poll at 500ms–1s, or honor Azure's
  `Retry-After` header.
- **Effect:** 1–2s saved per document. Free.
- **Effort:** LOW.
- **Files:** `src/lib/dms/ai/azure-document-intelligence-adapter.ts`.

#### SPEED.2E — Mini model for extraction on simple document types
- **Idea:** Extraction of simple types (Emirates ID, salary certificate — 5–10 well-defined
  fields) doesn't need full `gpt-4.1`. Add per-document-type model override (e.g. metadata
  on `dms_document_types` or config_json rule): mini for simple types, full model for
  contracts/complex documents.
- **Effect:** 3–5s saved on the most common documents; ~90% cost cut on those calls.
- **Effort:** MEDIUM (routing rule + admin setting; accuracy spot-check per type).

#### SPEED.2F — Trim the classification prompt
- **Idea:** Pass 1 sends 12 ranked candidate packets with full metadata rollups. Top 5–6
  candidates classify just as accurately with a meaningfully smaller prompt.
- **Effect:** Modest input-token latency savings; lower cost. May slightly reduce accuracy
  on rare types — keep `MANDATORY_COMMON_TYPE_CODES` injection.
- **Effort:** LOW (`selectRankedCandidateTypes(scored, 12)` → 6, measure).
- **Files:** `src/lib/dms/ai/classification-candidate-builder.ts`.

### TIER 3 — Environment and housekeeping

#### SPEED.2G — Production build for real measurements
- **Idea:** All timings so far are on `npm run dev` (Turbopack compile + HMR overhead).
  `npm run build && npm start` typically shaves 20–40% off server-action latency.
- **Effort:** NONE (operational). Measure before/after to re-baseline the numbers.

#### SPEED.2H — Reuse AI results for duplicate files
- **Idea:** SHA-256 duplicate detection already exists. When the same file is re-uploaded,
  offer the previous AI result instantly instead of re-running the pipeline.
- **Effect:** Duplicate uploads → ~0s.
- **Effort:** MEDIUM (copy/link previous `dms_ai_extraction_results` to new session +
  UI affordance "reused previous analysis").

#### SPEED.2I — Parallelize candidate building with OCR
- **Idea:** `buildClassificationCandidates` (DB queries) currently runs after OCR completes;
  it only needs `ocrText` for scoring. Run type/definition loading concurrently with OCR
  and score afterward.
- **Effect:** ~0.5–1s.
- **Effort:** LOW–MEDIUM (refactor builder into load + score stages).

#### SPEED.2J — Misc micro-optimizations (park until needed)
- Honor smaller `detail` level for GPT vision fallback images (high → auto) when quality allows.
- Reduce rendered fallback pages from 4 → 2 for classification-only needs.
- HTTP keep-alive / connection reuse for Azure + OpenAI calls (Node fetch agent).
- Skip `matchEntitiesToParties` sequential loop → single batched query.

## 4. Suggested Execution Order

| Phase | Items | Expected gain | Effort |
|---|---|---|---|
| SPEED.2A | 2C + 2D (prompt output skip + Azure polling) | −6–12s real latency | ~1 session |
| SPEED.2B | 2A auto-start (flagged) | perceived ≈ instant | ~1 session |
| SPEED.2C | 2B async + worker + live progress | UX + robustness | 2–3 sessions |
| SPEED.2D | 2E + 2F + 2H + 2I | −4–7s + cost cuts | 1–2 sessions |
| Ongoing | 2G production baseline, 2J micro items | −20–40% env overhead | operational |

**Realistic end state:** digital PDFs ~3–5s, scanned PDFs ~5–8s actual — and near-zero
perceived wait once auto-start lands.

## 5. Rules

1. Each sub-phase gets its own implementation report in `implementation_Review/AI_DMS/`.
2. Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` after each sub-phase closure.
3. No feature flags enabled without Sameer confirmation (per erp-ai-settings-standard).
4. Never log OCR text, prompts, or API keys in any of these changes.
5. GPT Vision fallback must keep working after every change (Azure outage safety net).
6. Measure timings before/after each sub-phase (use `dms_ai_extraction_jobs.duration_ms`
   and `erp_ai_usage_logs.duration_ms`) and record them in the phase report.

## 6. Open Issues Log (Sameer — add your issues here)

| # | Issue / observation | Related item | Status |
|---|---|---|---|
| 1 | **BUG (2026-08-01):** Uploading a document with **5+ pages** breaks AI analysis/extraction. Symptoms: very long wait; during the wait the "upload successful" toast appears **multiple times**; the upload/AI state keeps running with no result; closing and reopening the screen repeats the same behavior. Reproducible every time with 5+ page documents. | Likely SPEED.2B (sync server action timeout → client retry loop; async pipeline is the structural fix). Suspects to check during investigation: server-action/proxy timeout on long AI runs, client retry firing duplicate `startAiIntakeFromUploadSession`, `intake_status` guard for `ocr_processing`/`ai_processing` (early-return exists only for `review_pending`/`review_in_progress`), duplicate toast on re-mount, Azure/GPT latency on 5+ pages, `MAX_OCR_CHARS` truncation. | OPEN — investigation requested, not started |
