# ERP DMS AI SPEED.2 — Bolt Speed Enhancement Plan

**Date:** 2026-08-01 (investigation for Issue #1 added same day — see §7; implementation 2026-08-03)
**Status:** LARGELY IMPLEMENTED (2026-08-03) — FIX.1 (2C+2N), FIX.2 (2K+2L+2M), Batch 1 (2D+2O a/b), 2A (flag OFF), 2F, 2I done. Remaining: 2B (async worker — structural, own phase), 2E, 2H, 2G/2J (operational/parked), 2O(c) (parked). See `ERP_DMS_AI_SPEED_2_IMPLEMENTATION_REPORT.md`.
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
  **⚠ Scope extended by Issue #1 investigation (§7, RC1):** on 5+ page documents this
  copying costs **~67s in Pass 1 + ~60s in Pass 2** (measured). Must apply to BOTH passes
  AND `rerunMetadataExtractionForIntakeSession`. This is the #1 fix for Issue #1.
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

### TIER 4 — Reliability fixes from Issue #1 investigation (§7) — added 2026-08-01

#### SPEED.2K — Intake concurrency guard + stale-run sweeper (fixes RC3 + RC4)
- **Idea:** `startAiIntakeFromUploadSession` currently early-returns only for
  `review_pending`/`review_in_progress`. Add: (a) if `intake_status` ∈
  {`ocr_processing`, `ai_processing`} and `updated_at` is fresh (<5 min) → return
  `{ status: "already_processing" }` without starting anything; (b) if stale (≥5 min) →
  mark the orphaned `dms_ai_extraction_jobs` row `failed` ("stale — superseded") and allow
  a clean fresh run. Disable the per-row "AI Fill" button for in-flight sessions.
- **Effect:** No more duplicate full-cost parallel runs; no more permanently stuck sessions
  (zombie evidence: session 986 / job 1057).
- **Effort:** LOW–MEDIUM.
- **Files:** `src/server/actions/dms/ai-intake.ts`, `dms-upload-session-table.tsx`,
  `dms-upload-inbox-page-client.tsx`.

#### SPEED.2L — Client status polling + honest progress UI (fixes RC5 + RC6)
- **Idea:** Stop trusting a single 3-minute POST as the only completion signal. After
  starting AI Fill, poll the session status every 3–5s; when `review_pending` appears,
  redirect to review — even if the original server-action promise was lost (dev recompile,
  proxy drop). Banner shows elapsed time and a size-based estimate instead of the false
  "10–30 seconds"; on failure, show explicit retry guidance instead of silently flipping
  back to the green "File ready" banner.
- **Scope extended by Issue #2 (§6):** also harden the **upload phase** itself —
  `uploadToSignedUrl()` currently has no timeout and no progress callback, so a stalled
  storage upload shows "Uploading…" forever. Add upload timeout (size-scaled), real
  progress percentage, and an explicit error + retry state when session creation or the
  storage upload fails.
- **Effect:** Eliminates "spinner forever while the server actually succeeded"
  (sessions 983/984/991 all reached `review_pending` — the user just never got redirected)
  AND the Issue #2 "stuck at uploading" dead-end.
- **Effort:** MEDIUM.
- **Files:** `dms-upload-inbox-page-client.tsx`, `dms-upload-dropzone.tsx`,
  small read-only status server action.

#### SPEED.2M — Intake token/duration usage logging (fixes RC7)
- **Idea:** `openai-dms-adapter.analyze()` already returns `promptTokens`/`completionTokens`
  but the intake path never writes to `erp_ai_usage_logs`. Log one row per intake GPT call
  (Pass 1, Pass 2, rerun) with token counts, `duration_ms`, `upload_session_id`.
- **Effect:** Every future speed/cost question answerable from the DB in seconds.
- **Effort:** LOW.
- **Files:** `src/server/actions/dms/ai-intake.ts`, `src/lib/ai/usage-logger.ts` (reuse).

#### SPEED.2N — Raise text-only input truncation limit (fixes RC2)
- **Idea:** `MAX_OCR_CHARS = 12_000` throws away 42% of a 20k-char document before the
  model sees it (misclassification evidence in §7.3 RC2). Raise the text-only budget to
  ~48k chars (≈12k input tokens — cheap and fast); beyond that, head+tail sampling
  (first ~40k + last ~8k) so end-of-document signatures/expiry tables survive.
- **Effect:** Correct classification + complete field extraction on multi-page documents.
- **Effort:** LOW.
- **Files:** `src/lib/dms/ai/prompt-builders.ts`.

#### SPEED.2O — Large document support, 50+ pages (added 2026-08-03)
- **Context:** Azure resource upgraded to **S0 Standard tier** (2026-08-03) — Azure itself
  now handles up to 2,000 pages / 500MB per document. The remaining 50+ page walls are all
  in OUR code:
- **Idea:**
  (a) **Scale the Azure polling budget by file size** — `MAX_POLLS = 25` × 2s = 50s hard cap
  in `azure-document-intelligence-adapter.ts`. A 50-page scan needs 60–120s on Azure, so the
  adapter times out while Azure is still working, and falls back to GPT vision. Scale the
  budget (e.g. base 60s + ~2s per estimated page, cap ~5 min) and honor Azure's
  `Retry-After` header (overlaps 2D — implement together).
  (b) **Fallback degradation warning** — GPT vision fallback renders only the FIRST 4 pages.
  For a 50-page doc that means AI saw 8% of the content with no indication. When fallback
  fires on a doc with more pages than rendered, record a visible warning on the extraction
  result ("AI analyzed 4 of ~50 pages") and lower confidence.
  (c) **(Optional, later)** chunked extraction for very long text: process 48k-char windows
  and merge fields, if complete middle-of-document extraction ever becomes a requirement.
- **Effect:** 50+ page scanned PDFs OCR completely via Azure instead of silently degrading
  to a 4-page vision fallback.
- **Effort:** LOW (a) + LOW (b); MEDIUM (c, parked).
- **Files:** `src/lib/dms/ai/azure-document-intelligence-adapter.ts`,
  `src/lib/dms/ocr/ocr-router.ts`.
- **Note:** even with (a), a 50-page run keeps one HTTP request open for 1.5–3 min until
  **2B (async)** lands — 2B is effectively REQUIRED for a good 50+ page experience.

## 4. Suggested Execution Order

Revised 2026-08-01 after the Issue #1 investigation (§7) — the bug-fix batch now goes first:

| Batch | Items | Expected gain | Status (2026-08-03) |
|---|---|---|---|
| **FIX.1 (Issue #1)** | 2C + 2N (kill transcription re-emission in both passes + raise input truncation) | 5+ page docs: **2.5–3.5 min → ~30–45s**; correct classification | ✅ IMPLEMENTED |
| **FIX.2 (Issue #1)** | 2K + 2L + 2M (concurrency guard, stale sweeper, client polling, honest UI, usage logging) | No duplicate runs, no zombies, no infinite spinner | ✅ IMPLEMENTED |
| SPEED batch 1 | 2D + 2O(a)(b) (Azure polling speed + size-scaled budget + fallback warning) | −1–2s small docs; 50+ page docs OCR completely | ✅ IMPLEMENTED |
| SPEED batch 2 | 2A auto-start (flagged) | perceived ≈ instant | ✅ IMPLEMENTED — flag `DMS_AI_AUTO_START` created **OFF** (id 80); enable after Sameer confirmation |
| SPEED batch 3 | 2B async + worker + live progress | UX + robustness (structural fix for the whole Issue #1 class; REQUIRED for smooth 50+ page docs) | ⏳ PENDING — own phase (2–3 sessions; worker mechanism decision needed) |
| SPEED batch 4 | 2E + 2F + 2H + 2I | −4–7s + cost cuts | 🔶 PARTIAL — 2F ✅, 2I ✅; 2E + 2H pending |
| Ongoing | 2G production baseline, 2J micro items | −20–40% env overhead | ⏳ operational |

**Realistic end state:** digital PDFs ~3–5s, scanned PDFs ~5–8s actual — and near-zero
perceived wait once auto-start lands.

## 4B. Implementation Readiness Checklist (added 2026-08-03)

Confirmed READY — everything needed to start is in place:

| Prerequisite | Status |
|---|---|
| Root causes understood with live evidence | ✅ §7 (Issue #1), §6 Issue #2 narrowed to client side |
| Configuration verified correct | ✅ §8 audit — Azure default OCR, router on, mini classifier |
| Azure tier | ✅ Upgraded to **S0 Standard** (2026-08-03) — 2,000 pages/500MB per doc |
| Baseline numbers to measure against | ✅ §7.1 (small doc ~20s; 5+ pages 2.5–3.5 min; per-pass durations) |
| Fix order defined | ✅ §4 batches; per-RC mapping in §7.4 |

Open decisions to make DURING implementation (none block the start):

1. **2B worker mechanism** — Phase 9 job queue exists but has NO trigger. Options for
   self-hosted Node: in-process `setInterval` worker (simplest, fits current single-server
   deploy) vs Supabase cron → edge function vs external cron hitting an API route. Decide
   at the start of SPEED batch 3, not before.
2. **2E model-override storage** — per-type column on `dms_document_types` vs a rule in
   `config_json`. Decide at SPEED batch 4.
3. **Issue #2 confirmation** — the 2L defensive fix (upload timeout + progress + error
   state) proceeds regardless; a reproducing file (name/type/size) will confirm which
   suspect actually fires. Ask Sameer to capture it next time it happens.

Per-batch verification gates (apply to every batch):

- Type-check + lint clean before closing.
- Runtime UAT: upload 1 small digital PDF, 1 small scan, 1 five-page scan, 1 fifty-page scan
  (after 2O) — record `dms_ai_extraction_jobs.duration_ms` before/after in the phase report.
- Regression guard: GPT vision fallback still works with `DMS_OCR_AZURE` temporarily off (Rule 5).
- No stuck sessions: `intake_status` must always land in a terminal state (`review_pending`,
  `failed`, etc.) — verify with the §7.1 SQL after each UAT run.

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
| 1 | **BUG (2026-08-01):** Uploading a document with **5+ pages** breaks AI analysis/extraction. Symptoms: very long wait; during the wait the "upload successful" toast appears **multiple times**; the upload/AI state keeps running with no result; closing and reopening the screen repeats the same behavior. Reproducible every time with 5+ page documents. | Root causes RC1–RC7 identified — **see Section 7 (Deep Investigation)**. Fix phases: 2C+2N (output tokens + truncation), 2K (concurrency guard + stale sweeper), 2L (client polling UI), 2B (structural async fix), 2M (observability). | **FIXED ✅ (2026-08-03)** — 2C+2N+2K+2L+2M implemented; zombie session 986/job 1057 swept in DB; awaiting runtime UAT with a 5+ page document. 2B (structural async) still pending as its own phase |
| 2 | **BUG (2026-08-01):** For **some files**, the upload never completes — the system keeps showing the "uploading" state and AI/OCR never starts at all. | **Preliminary findings (2026-08-01):** live DB shows **zero** sessions stuck at `pending` and zero stuck before OCR in 14 days — every session that reaches the DB progresses. So the failure is **client-side, before or during the storage upload**. Prime suspects in `dms-upload-inbox-page-client.tsx` → `handleFileSelected`: (a) `supabase.storage.uploadToSignedUrl()` has **no timeout and no progress callback** — if it stalls (large file, network drop, storage hiccup) the UI shows "Uploading file to secure storage…" forever, progress stuck at 0; (b) `createDmsUploadSession` server action hang (e.g. dev recompile kills the response) leaves the same infinite "uploading" state — no session row is ever created; (c) possible mime/size validation dead-end in the dropzone for specific file types. **Still needed to close the investigation:** exact file name, type, and size of a file that reproduces it (nothing server-side is recorded when it happens, by definition). Solution direction: add upload timeout + real progress reporting + explicit error state to `handleFileSelected`, and log session-creation failures visibly. Fits naturally into **SPEED.2L** (honest progress UI) scope. | **DEFENSIVE FIX APPLIED ✅ (2026-08-03)** — size-scaled upload timeout + explicit error/retry state implemented in `handleFileSelected` (2L). A reproducing file is still wanted to confirm the root suspect, but the UI can no longer hang forever |
| 3 | **AUDIT REQUEST (2026-08-01):** Verify that the enabled AI/OCR options (feature flags + provider configs) are the RIGHT ones to use Azure and get the best result at the fastest speed. | Full configuration audit performed against the live database — **see Section 8**. Verdict: configuration is essentially CORRECT (Azure is default OCR, router on, mini classifier, GPT vision fallback on). 3 follow-up items found: failed `last_test_status` on the Azure config (likely transient — re-test), dead Tesseract config to deactivate, and `DMS_AI_ORCHESTRATION` post-processing awareness. | **INVESTIGATED ✅ (2026-08-01)** — settings verified correct; minor cleanups listed in §8.3 |

---

## 7. Deep Investigation — Issue #1: 5+ Page Documents (2026-08-01)

Investigation performed across **frontend code**, **server actions**, **AI pipeline code**,
and the **live database**. All findings below are backed by real evidence, not theory.

### 7.1 Live Database Evidence (2026-08-01 UTC)

Real intake sessions from today, same user workflow the bug report describes:

| Session | File | OCR chars | AI job duration | Total server time | Outcome |
|---|---|---|---|---|---|
| 983 | MANPREET SINGH RAM SAROOP (5+ pg medical) | **20,694** | 66.9s (Pass 1 only) | **3m 26s** (10:29:57 → 10:33:23) | review_pending — user never saw it |
| 984 | SAME FILE re-uploaded 7 min later | **20,694** | 74.2s (Pass 1 only) | **2m 39s** (10:40:48 → 10:43:27) | review_pending — duplicate full-cost run |
| 991 | MANPREET ADNOC Medical (5+ pg) | **20,694** | 67.3s Pass 1 **+ ~62s Pass 2** | **2m 23s** (10:51:50 → 10:54:13) | review_pending |
| 986 | Gipson residancy (re-upload #2 of 4) | — | job **stuck `processing` forever** | never finished | **STUCK at `ai_processing`** — zombie |
| 985/987/989 | Gipson residancy (visa, 596 OCR chars) | 596 | 17–19s | ~1 min | fine — small docs are OK |
| 988 | Gipson EID (848 OCR chars) | 848 | 19.9s | ~1m15s | fine |

**Confirmed pattern:** small documents (≤1 page, <1k OCR chars) complete in ~20s. 5+ page
documents (≈20k OCR chars) take **2.5–3.5 minutes server-side** while the UI promises
"10–30 seconds". The user gave up, re-uploaded the same file (983→984: identical file,
`file_size_bytes` matches), each re-upload fired a new "File uploaded successfully!" toast,
and one abandoned run (986) is permanently stuck.

### 7.2 Where the Time Actually Goes (5+ page document waterfall)

```
Upload session created ──► temp download + Azure OCR      ~13–16s   (GOOD — Azure is fast)
                       ──► Pass 1 GPT (classify+extract)  ~67–74s   (BAD — RC1: re-emits 20k-char transcription)
                       ──► Pass 2 GPT (type fields)       ~60s      (BAD — RC1 again: re-emits transcription AGAIN)
                       ──► entity match + store result     ~2–5s
                                                    TOTAL  ~2.5–3.5 minutes
```

### 7.3 Root Causes (each verified in code + DB)

**RC1 — Output-token bottleneck: the model re-types the whole document (THE main cause).**
`prompt-builders.ts` SYSTEM_PROMPT makes `full_text_transcription` MANDATORY in the JSON
output, and the text-only prompt says *"Place the full pre-extracted text in
full_text_transcription (you may copy it directly)"*. Output tokens are the slowest part of
an LLM call (~10× slower than input). A 20k-char document ≈ **5,000 output tokens of pure
copying per pass** — and it happens in BOTH Pass 1 and Pass 2. That is the 67s + 60s
measured above. The transcription is ONLY needed when the model itself is the OCR engine
(vision input); when Azure/local OCR already produced `ocrText`, the copy is 100% waste —
`ai-intake.ts` even prefers `localText` over the AI transcription when storing
`raw_ocr_text` (line ~683: `const best = localText ?? aiTranscription`).

**RC2 — 12k-char input truncation corrupts large-document analysis.**
`MAX_OCR_CHARS = 12_000` in `prompt-builders.ts` — a 20,694-char document loses **42% of
its content** before the model ever sees it. Evidence: sessions 983/984 (weak filename)
classified as `OTHER` despite being a medical report, while 991 (same content, filename
contains "ADNOC Medical") classified correctly — the filename rescued what truncation
destroyed. Input tokens are cheap and fast; this limit is far too conservative.

**RC3 — No concurrency guard: every retry spawns a full parallel pipeline.**
`startAiIntakeFromUploadSession` early-returns only for `review_pending` /
`review_in_progress`. If the status is `ocr_processing` or `ai_processing` (i.e. a run IS
in flight), a second click starts a **second complete pipeline** on the same session —
double Azure + double GPT cost, racing status updates. The sessions-table "AI Fill" button
is never disabled for in-flight sessions.

**RC4 — Zombie runs: a killed in-flight action leaves the session stuck forever.**
Session 986 + job 1057: stuck at `ai_processing`/`processing` with no completion, no error,
no timeout. When the Node process recompiles (dev HMR), restarts, or the connection drops
mid-run, nothing ever transitions the session out of the processing state. The UI then
shows a spinner forever, and reopening the page shows the same stuck state — exactly the
reported "keep running without result till I close and open again".

**RC5 — Client `await`s a 3-minute server action over a single HTTP request.**
`handleAiFill` awaits `startAiIntakeFromUploadSession` in one POST. For 2.5–3.5 min runs
this is fragile: dev recompiles kill the response, proxies/browsers may drop it, and if the
response is lost the client promise never settles → banner spins forever even though the
server may have finished successfully (983/984/991 all reached `review_pending` — the user
just never got redirected).

**RC6 — Misleading UX invites the retry loop.**
The banner says *"This may take 10–30 seconds"* (false for large docs). When `handleAiFill`
fails, state silently flips back to the green "File ready" banner. The user re-uploads →
new session → new "File uploaded successfully!" toast (the reported repeated toasts) →
duplicate sessions pile up (4× "Gipson residancy" today; 983+984 both ran at full cost).

**RC7 — Observability gap: intake GPT calls are invisible.**
`openai-dms-adapter.analyze()` returns `promptTokens`/`completionTokens`, but the intake
path never writes them to `erp_ai_usage_logs` (today's log contains only tag/link
suggestions and test connections). Token counts would have proven RC1 instantly.

### 7.4 Solutions (mapped to sub-phases)

| RC | Solution | Phase | Effort |
|---|---|---|---|
| RC1 | When `ocrText` exists (Azure/local OCR succeeded), instruct the model to OMIT `full_text_transcription` (output `null`) in BOTH passes and in `rerunMetadataExtractionForIntakeSession`; keep it mandatory only for vision-only input. `ai-intake.ts` already prefers local text when storing. Expected: 67s→~15s Pass 1, 60s→~10s Pass 2 on 20k-char docs. | **2C** (scope extended) | LOW–MED |
| RC2 | Raise text-only input budget `MAX_OCR_CHARS` 12k → ~48k chars (≈12k tokens, well within gpt-4.1's 1M context); if still over budget use head+tail sampling (first ~40k + last ~8k) so signatures/expiry tables on last pages survive. | **2N** (new) | LOW |
| RC3 | Early-return `{ status: "already_processing" }` when `intake_status` ∈ {`ocr_processing`,`ai_processing`} AND `updated_at` < 5 min old; UI shows "AI is already analyzing this file". Disable per-row AI Fill while in flight. | **2K** (new) | LOW |
| RC4 | Stale-run sweeper: same guard treats a processing session with `updated_at` ≥ 5 min as abandoned → mark old job `failed` ("stale — superseded"), allow a fresh run. (Full fix = async queue with heartbeats, phase 2B.) | **2K** (new) | LOW–MED |
| RC5 | Client stops awaiting one long POST as the only signal: after starting AI Fill, poll `getAiIntakeSession` every 3–5s; when `review_pending` appears → redirect, even if the original promise died. | **2L** (new) | MED |
| RC6 | Honest progress UI: banner shows elapsed time + realistic estimate by file size/page count; on failure show explicit retry guidance instead of silently reverting to the green banner; suppress duplicate-upload of an identical sha256 while a session for it is active. | **2L** (new) | MED |
| RC7 | Write one `erp_ai_usage_logs` row per intake GPT call (Pass 1, Pass 2, rerun) with `input_token_count`/`output_token_count`/`duration_ms`/`upload_session_id` (adapter already returns the counts). | **2M** (new) | LOW |

### 7.5 Expected Result After Fixes

| Scenario | Today (measured) | After 2C+2N+2K (sync pipeline kept) | After 2B (async) |
|---|---|---|---|
| 1-page scan | ~20s | ~12–15s | same, but non-blocking |
| 5+ page scan (20k chars) | **2.5–3.5 min, feels broken** | **~30–45s, reliable** | non-blocking + live progress |
| Retry storm / zombies | duplicate full-cost runs, stuck sessions | blocked by guard + sweeper | impossible by design |

### 7.6 Recommended Fix Order for Issue #1

1. **2C + 2N** — kill the transcription re-emission + raise input truncation (biggest win, lowest risk; fixes the actual slowness).
2. **2K** — concurrency guard + stale sweeper (stops duplicate cost and zombies immediately).
3. **2L** — client polling + honest progress UI (fixes "spinner forever" even when server succeeded).
4. **2M** — usage logging (proves the improvement with real token/duration numbers).
5. **2B** — async pipeline (structural, makes the whole class of problem impossible).

---

## 8. Configuration Audit — "Am I Using the Right Options for Azure + Best Speed?" (Issue #3, 2026-08-01)

Audit of live `erp_ai_feature_flags` and `erp_ai_provider_configs` performed 2026-08-01 ~15:30 UAE.

### 8.1 OCR / Intake Settings — VERIFIED CORRECT ✅

| Setting | Current value | Verdict |
|---|---|---|
| `DMS_OCR_ROUTER` flag | **ON** (enabled 2026-08-01 11:10 UTC) | ✅ Required — activates the three-tier routing (local text → Azure → GPT vision) |
| `DMS_OCR_AZURE` flag | **ON** (enabled 2026-08-01 11:10 UTC) | ✅ Required — allows the router to use Azure |
| `DMS_OCR_GPT_VISION_FALLBACK` flag | **ON** | ✅ Correct — safety net if Azure fails/unreachable; keep on |
| `DMS_OCR_BACKFILL_QUEUE` flag | **ON** | ✅ Fine — only affects admin backfill, not intake speed |
| `DMS_OCR` / `DMS_CLASSIFICATION` / `DMS_EXTRACTION` flags | **ON** | ✅ Required for the intake pipeline |
| `ARABIC_OCR_AZURE` provider | `azure_document_intelligence`, **default for `ocr`**, active, model `prebuilt-read`, api-version `2024-11-30`, endpoint `agt-erp-docintel.cognitiveservices.azure.com` | ✅ Optimal — `prebuilt-read` is Azure's fastest OCR model (right choice over `prebuilt-layout`, which is slower and only needed for table structure); api-version is the current GA |
| `DEFAULT_DMS_CLASSIFIER` provider | `gpt-4.1-mini`, default for `classification` | ✅ Optimal (SPEED.1 P4) |
| `DEFAULT_DMS_EXTRACTOR` provider | `gpt-4.1`, default for `extraction` | ✅ Correct — full model for field accuracy (2E may later downgrade simple types to mini) |
| `DEFAULT_EMBEDDING` provider | `text-embedding-3-small` | ✅ Correct — fast + cheap |

**Bottom line: the options are RIGHT.** Azure is the default OCR engine, the router is on,
the fast classifier is on, and the fallback chain is intact. Runtime evidence agrees: today's
sessions reached OCR text in ~13–16s for 5+ page scans. The remaining slowness is **code
behavior (Section 7, RC1/RC2), not configuration** — no settings change can fix it.

### 8.2 Verified Routing Behavior (code-confirmed)

For every uploaded file the router now does, in order:
1. **Digital PDF with text layer** → local text extraction, ~0s, no external call at all (fastest possible path).
2. **Scanned PDF / image** → Azure `prebuilt-read` on the raw buffer (no PDF→PNG rendering — SPEED.1 P2), English + Arabic + bilingual in one call.
3. **Azure fails or unreachable** → GPT-4.1 vision fallback (pages rendered lazily only in this branch).

### 8.3 Findings That Need Attention (minor)

| # | Finding | Action |
|---|---|---|
| 8.3-A | `ARABIC_OCR_AZURE.last_test_status` = **failed** (2026-08-01 10:48 UTC, 0ms duration — failed before any HTTP call, i.e. the API key env var was momentarily missing in the running process, most likely a dev-server restart racing `.env.local` reload). An earlier test the same morning (10:08) **succeeded**, and real OCR calls worked fine at 10:52. | Re-run **Test Connection** in AI Settings to clear the alarming red status; if it fails again, re-save the key via the provider form. No config change needed. |
| 8.3-B | `DEFAULT_DMS_OCR` (Tesseract) config is still active (non-default). The runtime router never uses Tesseract — it's dead weight that can confuse future audits ("which OCR is actually running?"). | Deactivate (`is_active=false`) or delete the Tesseract config. Cosmetic. |
| 8.3-C | `DMS_AI_ORCHESTRATION` flag is **ON** (description says "Default: disabled"). This triggers the full post-approval AI pipeline (summary, auto-tags, smart links, embeddings) after draft creation. It does NOT slow the intake analysis itself, but it adds GPT calls after approval — worth knowing it's intentional. | Keep ON if the post-processing results are wanted (they are visible in document AI panels); switch OFF only if approval-time cost/speed matters more. Decision, not a bug. |
| 8.3-D | `LOCAL_LLM_DEFAULT` config carries an OpenAI-style masked preview (`sk-p****mPQA`) on an Ollama endpoint ref, and its last test failed. `LOCAL_LLM` flag is OFF so it's inert. | Ignore or clean up the stale preview. Cosmetic only. |

### 8.4 Conclusion

No configuration change will make intake meaningfully faster — the settings already select
the fastest available path. The 5+ page slowness is fully explained by Section 7 (RC1
transcription re-emission + RC2 truncation), which are **code fixes** (SPEED.2C + 2N).
