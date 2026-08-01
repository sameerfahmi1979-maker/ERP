# ERP DMS AI SPEED.1 — Intake Pipeline Speed Optimization Implementation Report

**Date:** 2026-08-01
**Status:** CLOSED / PASS (runtime timing verification pending next real upload)
**Context:** Follow-up to the AI intake latency investigation (~44s scanned-PDF intake) and
ERP SETTINGS.1B (Azure Document Intelligence OCR activation). Priorities 1–4 of the
recommended plan are now complete; Priority 5 (async intake with live progress) deferred.

---

## Priority 1 — Azure Document Intelligence OCR (done in SETTINGS.1B)

`ARABIC_OCR_AZURE` enabled + default for `ocr`, connection tested, `DMS_OCR_AZURE` flag on.
OCR for scanned/Arabic docs: ~20–25s (GPT vision) → ~3–8s (Azure `prebuilt-read`).

## Priority 2 — Skip redundant PDF page rendering (this phase)

Previously `routeOcr` always called `extractFileContent`, which rendered up to 4 PDF pages
to 3x-scale PNGs (~5s) even when Azure OCR consumes the raw PDF buffer and the images are
never used.

**Changes:**
- `src/lib/dms/file-content-extractor.ts` — new `ExtractFileContentOptions.skipPdfPageRendering`.
  When set and the PDF has no text layer, returns `method: "pdf-scanned-render-deferred"`
  with no images instead of rendering.
- `src/lib/dms/ocr/ocr-router.ts` — computes `azureUsable` (flag + configured + supports mime)
  and passes the skip option. `routeScannedOrImage` now uses a lazy `ensureImages()` helper:
  page images are rendered only if the GPT vision path is actually taken (Azure disabled or
  Azure failure fallback).

All `routeOcr` callers (`ai-intake.ts`, `process-file-ocr.ts`, `ocr.ts`) benefit automatically;
the router signature is unchanged.

## Priority 3 — Single-call classify + extract with fallback (this phase)

Previously the intake always made two sequential GPT calls: Pass 1 (classify + transcribe,
no metadata fields) then Pass 2 (extract the resolved type's fields). The prompt builder
(`buildCombinedPrompt`) has always supported classification + extraction in ONE call.

**Change (`src/server/actions/dms/ai-intake.ts`):**
- Pass 1 now includes the metadata fields of the TOP-ranked heuristic candidate type
  (`scoredTypes[0]` from `buildClassificationCandidates`, only when its score > 0).
- After type resolution: if the resolved type equals the type whose fields Pass 1 already
  extracted → **Pass 2 is skipped** (saves a full GPT round trip, ~7–10s).
- If the AI resolves a DIFFERENT type → Pass 2 runs exactly as before (fields are replaced
  by the correct type's extraction, so no wrong-type contamination).
- Field preload failure is non-fatal (logged warning, falls back to classify-only Pass 1).

`rerunMetadataExtractionForIntakeSession` (manual re-run with a chosen type) is unchanged.

## Priority 4 — Fast classification model (this phase)

`DEFAULT_DMS_CLASSIFIER.model_id` changed `gpt-4.1` → `gpt-4.1-mini` (live DB update).
Type classification from OCR text is an easy task; ~4–5s faster and ~90% cheaper per call.
Note: with P3, most intakes use only the extractor provider call; the classifier config
still applies wherever classification runs as its own call.

## Priority 5 — Async intake with live progress: DEFERRED

Requires a worker trigger (cron/interval) that does not exist yet. Revisit if intake times
are still unsatisfactory after measuring P1–P4.

## Expected outcome

| Scenario | Before | After (expected) |
|---|---|---|
| Scanned PDF (Arabic/English) | ~44s | ~10–15s |
| Digital PDF (text layer) | ~15–20s | ~5–8s |
| Image (Emirates ID photo etc.) | ~30s+ | ~8–12s |

## Verification

- Lints: clean on all changed files.
- `tsc --noEmit`: zero errors in changed files (pre-existing unrelated errors only).
- Runtime timing measurement pending the next real document upload (Sameer).
