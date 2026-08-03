# ERP DMS AI SPEED.2 — Bolt Speed Enhancement Implementation Report

**Date:** 2026-08-03
**Status:** IMPLEMENTED — awaiting runtime UAT
**Plan:** `ERP_DMS_AI_SPEED_2_BOLT_SPEED_ENHANCEMENT_PLAN.md`
**Predecessor:** `ERP_DMS_AI_SPEED_1_INTAKE_PIPELINE_SPEED_OPTIMIZATION_IMPLEMENTATION_REPORT.md`

---

## 1. Scope Implemented

| Sub-phase | What | Status |
|---|---|---|
| **2C** | Stop re-emitting the transcription in GPT output (both passes + rerun) | ✅ |
| **2N** | Raise input truncation 12k → 48k chars with head+tail sampling | ✅ |
| **2K** | Intake concurrency guard + stale-run sweeper | ✅ |
| **2L** | Client status polling + honest progress UI + upload timeout + error/retry state | ✅ |
| **2M** | Intake token/duration usage logging (`erp_ai_usage_logs`) | ✅ |
| **2D** | Azure polling: 1s interval + `Retry-After` header support | ✅ |
| **2O(a)** | Size-scaled Azure polling budget (60s base + 30s/MB, cap 5 min) | ✅ |
| **2O(b)** | GPT vision fallback page-coverage warning | ✅ |
| **2A** | Auto-start AI on upload completion — flag `DMS_AI_AUTO_START` (id 80), **created OFF** | ✅ |
| **2F** | Classification candidate packets trimmed 12 → 6 (mandatory types still injected) | ✅ |
| **2I** | Candidate DB loading parallelized with OCR | ✅ |

**Not implemented (deliberately deferred, per plan batching):**

| Sub-phase | Why deferred |
|---|---|
| **2B** async intake + worker + live progress | HIGH-effort structural phase (2–3 sessions); worker mechanism decision (in-process interval vs Supabase cron vs external cron) must be made at its start. 2L's polling already removes the worst symptom (lost response → infinite spinner). |
| **2E** per-type mini-model override | Needs storage-design decision + per-type accuracy spot-checks. |
| **2H** reuse AI results for duplicates | Medium effort; separate UX affordance needed. |
| **2O(c)** chunked extraction | Parked in plan — only if complete middle-of-document extraction becomes a requirement. |
| **2G / 2J** | Operational / parked micro items. |

---

## 2. Changes by File

### `src/lib/dms/ai/prompt-builders.ts` (2C + 2N — the #1 Issue #1 fix)
- `MAX_OCR_CHARS` 12,000 → **48,000**; documents beyond that get **head (40k) + tail (8k) sampling** with an explicit `[... middle of document omitted ...]` marker, so signatures/expiry tables at the end survive.
- **Text-only inputs**: prompt now instructs `full_text_transcription = null` — "do NOT copy the provided text back — it is already stored". This was costing ~5,000 output tokens ≈ **60–70s per pass** on 5+ page documents (measured in §7 of the plan).
- **Mixed inputs (text + images)**: transcribe ONLY additional image-visible text.
- **Vision-only inputs**: transcription remains MANDATORY (GPT is the OCR engine there) — unchanged.
- `PROMPT_VERSION` bumped `v3.3` → `v3.4`.
- Safety verified: `fullTextTranscription` is already `string | null` in types; every consumer (`ai-intake` raw_ocr_text, `ocr.ts`, `intelligence-admin.ts`, `approve-ai-intake.ts`) has a `?? ocrText` / `|| content.text` fallback, and `ai-intake` already **prefers local OCR text** over the AI transcription when storing `raw_ocr_text`.

### `src/server/actions/dms/ai-intake.ts` (2K + 2M + 2I + 2L support)
- **2K guard**: if `intake_status` ∈ {`ocr_processing`, `ai_processing`} and `updated_at` < 5 min old → returns `{ status: "already_processing" }` without starting a second pipeline. If stale ≥ 5 min → orphaned `dms_ai_extraction_jobs` rows are marked `failed` ("Stale run — superseded") and a fresh run proceeds.
- **2M logging**: `logDmsAiUsage` (Phase 14 shared helper) now called for **Pass 1** (success + failure), **Pass 2**, and **rerunMetadataExtractionForIntakeSession** with `feature_area='dms_intake'`, operation types `intake_classify_extract_pass1` / `intake_extract_pass2` / `intake_extract_rerun`, token counts, `duration_ms`, `ai_job_id`, `upload_session_id`. No text content is ever logged (redaction layer applies).
- **2I**: `loadClassificationCandidateData(supabase)` promise starts **before** the file download + OCR and is awaited at scoring time — the two DB queries (~0.5–1s) now run concurrently with OCR.
- **2L support**: new lightweight `getAiIntakeStatus(uploadSessionId)` server action returning `{ intakeStatus, sessionCode }` for client polling.
- **2A support**: new `isDmsAiAutoStartEnabled()` reading the `DMS_AI_AUTO_START` flag.

### `src/lib/dms/ai/azure-document-intelligence-adapter.ts` (2D + 2O(a))
- Poll interval 2s → **1s**; honors Azure's **`Retry-After`** header (capped at 10s).
- Fixed 50s poll cap replaced with **size-scaled budget**: `computeAzurePollBudgetMs()` = 60s base + 30s per MB, clamped 60s–300s. A 50-page scan no longer times out mid-OCR and silently degrades to the 4-page GPT vision fallback.

### `src/lib/dms/ocr/ocr-router.ts` (2O(b))
- New `getPdfPageCount()` (pdf-parse, no rendering).
- When the GPT vision fallback fires on a PDF with more pages than were rendered, the router result now carries a visible warning: *"AI vision fallback analyzed only the first N of M pages — results may be incomplete."* The Azure-failure path also records that fallback was used and why.

### `src/features/dms/upload/dms-upload-inbox-page-client.tsx` (2L + 2A)
- **Status polling**: after starting AI Fill, the client polls `getAiIntakeStatus` every 4s. When `review_pending` appears it redirects — even if the original server-action response was lost (dev recompile, dropped connection). No more infinite spinner while the server actually succeeded (sessions 983/984/991 pattern).
- **Honest progress banner**: elapsed-seconds counter + size-based estimate (`15–30s` / `30–60s` / `1–3 minutes`) instead of the false fixed "10–30 seconds".
- **Explicit AI error state** (`ai_error` phase): red banner with the error message + "Retry AI Fill" + "Create Manually" buttons — replaces the silent revert to the green "File ready" banner that invited retry loops.
- **`already_processing` handling**: second AI Fill click keeps the banner + polling alive instead of spawning a duplicate pipeline.
- **Upload timeout (Issue #2 defensive fix)**: `uploadToSignedUrl` wrapped in a size-scaled timeout race (60s + 30s/MB, cap 10 min) with an explicit error toast — a stalled storage upload can no longer show "Uploading…" forever.
- **2A auto-start**: when `DMS_AI_AUTO_START` is enabled, AI analysis starts immediately after a successful (non-duplicate) upload.

### `src/features/dms/upload/dms-upload-session-table.tsx` (2K UI)
- Per-row "AI Fill" button disabled with an "AI Running…" spinner label while a fresh (<5 min) run is in flight for that session.

### `src/app/(protected)/dms/inbox/page.tsx` (2A wiring)
- Loads `isDmsAiAutoStartEnabled()` in parallel with the other page data and passes `autoStartEnabled` to the client.

### `src/lib/dms/ai/classification-candidate-builder.ts` (2F + 2I)
- Candidate packet count 12 → **6** (`selectRankedCandidateTypes(scored, 6)`); `MANDATORY_COMMON_TYPE_CODES` (Emirates ID, passport, visa, trade license, etc.) are still force-injected by the selector, so rare-type safety is preserved.
- Split into `loadClassificationCandidateData()` (DB stage) + `buildClassificationCandidates(..., preloaded?)` (scoring stage) for 2I.

---

## 3. Database Changes

| Change | Detail |
|---|---|
| Feature flag inserted | `erp_ai_feature_flags` id 80: `DMS_AI_AUTO_START`, **`is_enabled = false`** (Rule 3 — no flag enabled without Sameer confirmation) |
| Zombie sweep | Session 986 `ai_processing` → `failed`; job 1057 `processing` → `failed` ("Stale run — killed mid-flight, swept during SPEED.2 implementation") |

No schema migrations were needed.

---

## 4. Expected Outcomes

| Scenario | Before | Expected after |
|---|---|---|
| 5+ page scanned doc (20k OCR chars) | 2.5–3.5 min (67s Pass 1 + 60s Pass 2 re-typing transcription) | **~30–45s** (no transcription re-emission; Pass 2 often skipped via SPEED.1 P3) |
| Misclassification of long docs | 42% of content cut at 12k chars | Full content up to 48k; head+tail beyond |
| Double-click AI Fill | Two full parallel pipelines (2× cost) | Second click returns `already_processing`; button disabled in table |
| Killed mid-flight run | Session stuck at `ai_processing` forever | Swept automatically after 5 min on next AI Fill |
| Lost server-action response | Infinite spinner (server actually succeeded) | Poll redirects to review within ~4s of completion |
| Stalled storage upload | "Uploading…" forever | Size-scaled timeout + explicit error + retry |
| 50+ page scan on Azure S0 | Adapter timed out at 50s → silent 4-page GPT fallback | Budget scales to file size (up to 5 min); if fallback still fires, visible page-coverage warning |
| Speed/cost visibility | Intake GPT calls invisible | Every pass logged to `erp_ai_usage_logs` with tokens + duration |

---

## 5. Verification Performed

- **Type-check** (`npm run typecheck`): no new errors — all remaining errors are pre-existing and unrelated (spike scripts, `@/types/database` exports in users/roles/permissions, `expiry-reminders.ts`).
- **Lint**: no linter errors in any changed file.
- **Unit tests** (`npm test`): 22 files, **433 passed / 0 failed**.
- **DB**: flag row verified inserted disabled; zombie session/job verified swept.

### Runtime UAT still required (per plan §4B gates)

1. Upload 1 small digital PDF, 1 small scan, 1 five-page scan, 1 fifty-page scan; record `dms_ai_extraction_jobs.duration_ms` before/after.
2. Verify no session ends in a non-terminal `intake_status`.
3. Regression guard: temporarily disable `DMS_OCR_AZURE` and confirm GPT vision fallback still works (Rule 5) — now with the new coverage warning.
4. Check `erp_ai_usage_logs` rows appear with `feature_area='dms_intake'`.
5. Optional: enable `DMS_AI_AUTO_START` (needs Sameer confirmation) and confirm auto-start after upload.

---

## 6. Security Compliance

- No OCR text, prompts, or API keys logged anywhere (2M goes through `buildSafeMetadata` redaction).
- GPT vision fallback path unchanged and still functional (Azure outage safety net).
- `DMS_AI_AUTO_START` created disabled per erp-ai-settings-standard Rule 3.

## 7. Next Phases

1. **SPEED.2B** — async intake + worker + live progress (2–3 sessions; decide worker mechanism first). Required for a smooth 50+ page experience (single HTTP request currently stays open for the full run).
2. **SPEED.2E** — per-type mini-model override; **SPEED.2H** — duplicate-result reuse.
3. **SPEED.2G** — production-build baseline measurement.
