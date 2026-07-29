# ERP DMS AI ORCH.1 — One-Click Upload & Full AI Processing Pipeline Plan

**Phase:** ERP DMS AI ORCH.1 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Author:** Cursor AI  

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** When a user clicks "Upload & AI Fill", the ERP must automatically orchestrate the full DMS AI pipeline — OCR, extraction, content sync, summary, intelligence (completeness + risk), semantic embedding, and optional tag/link suggestions — producing an AI-prepared draft document ready for mandatory human review.

**Critical constraints (locked):**
- No auto-approval, no bulk approval, no confidence-based approval
- Human review remains mandatory at every approval step
- All AI calls through existing server-side provider layer only
- No direct OpenAI SDK in feature/orchestrator code
- No raw OCR/prompt/response logging
- Existing manual admin tools preserved
- Single-file and batch flows both preserved
- One-by-one approval preserved (batch governance)
- RLS not weakened

**Recommended architecture:** Progressive step-by-step orchestrator with per-step status tracking. Critical path completes before review screen is shown. Best-effort enhancements run after draft creation, either asynchronously or progressively from the client.

---

## 2. Current DMS AI Capability Inventory

### Currently available AI/processing actions

| Action | Server action | Flag required | Runs on draft | Idempotent |
|---|---|---|---|---|
| OCR (text layer) | `triggerDmsOcrForFile` | `DMS_OCR` | Yes (any document_id) | Yes (check ocr_status) |
| OCR (AI vision) | same — uses GPT-4.1 vision | `DMS_OCR` | Yes | Skip if already complete |
| Content text sync | `writeDocumentContentTextSystem` (internal) | `DMS_CONTENT_TEXT_SYNC` | Yes | Yes (sha256 dedup) |
| AI intake classify/extract | `startAiIntakeFromUploadSession` | `DMS_CLASSIFICATION` + `DMS_EXTRACTION` | Session-based (no doc yet) | Skip if result exists |
| AI analysis (re-classify) | `runDmsAiAnalysisForDocument` | `DMS_CLASSIFICATION` | After draft doc created | Supersede old result |
| AI summary | `generateAndSaveDmsAiSummary` | `DMS_AI_SUMMARY` | Yes (draft doc) | Skip if status=complete |
| Completeness evaluation | `evaluateDmsDocumentCompleteness` | `DMS_COMPLETENESS` | Yes | Yes (overwrite) |
| Risk evaluation | `evaluateDmsDocumentRisk` | `DMS_RISK_SCORE` | Yes | Yes (overwrite) |
| Combined intelligence | `evaluateDmsDocumentIntelligence` | Both | Yes | Yes |
| Embedding generation | `generateDmsDocumentEmbedding` | `DMS_SEMANTIC_SEARCH` | Yes | Skip if status=complete |
| Auto tag suggestions | `suggestDmsDocumentTags` | `DMS_AUTO_TAGS` | Yes | Supersede old pending |
| Smart link suggestions | `suggestDmsDocumentLinks` | `DMS_SMART_LINKS` | Yes | Supersede old pending |

**All flags are currently ENABLED in live DB** (except `ERP_AI_*` form fill flags).

---

## 3. Current Upload & AI Fill Flow Audit

### Current single-file flow

```
1. User uploads file → dms-temp bucket → dms_upload_sessions created
2. User clicks "Upload & AI Fill"
3. startAiIntakeFromUploadSession(sessionCode):
   a. Downloads temp file
   b. Extracts file content (PDF text layer OR base64 images)
   c. Runs OCR + AI classification/extraction combined
   d. Stores result in dms_ai_extraction_jobs + dms_ai_extraction_results
   e. Stores field suggestions in dms_intake_review_values
   f. Sets dms_upload_sessions.intake_status = "review_pending"
   g. Returns sessionCode → redirect to /dms/intake/[sessionCode]
4. User reviews AI-pre-filled form on intake review screen
5. User clicks "Approve & Save" → approveAiIntakeAndCreateDocument:
   a. Generates document_no via RPC
   b. Creates dms_documents (status=active) 
   c. Copies file dms-temp → dms-documents
   d. Creates dms_document_versions v1 + dms_document_files
   e. Saves metadata/tags/links from review values
   f. Generates expiry reminders
   g. Writes OCR text to content_text (via writeDocumentContentTextSystem)
   h. Sets session approved, dms_upload_sessions.document_id
```

### What AI steps currently run automatically
- ✅ OCR + AI classification/extraction (during startAiIntakeFromUploadSession)
- ✅ content_text sync (during approveAiIntakeAndCreateDocument, non-fatal)

### What AI steps do NOT run automatically
- ❌ AI summary (manual only via "Generate Summary" button on document tab)
- ❌ Completeness evaluation (manual only via "Evaluate Intelligence" button)
- ❌ Risk evaluation (same)
- ❌ Embedding generation (manual only via admin bulk tool or per-document button)
- ❌ Re-classification via AI analysis (separate from intake)
- ❌ Auto tag suggestions (manual only)
- ❌ Smart link suggestions (manual only)

### Current batch flow
```
1. User selects multiple files → createDmsUploadBatch (creates dms_upload_batches)
2. Client uploads each file individually
3. For each file: startAiIntakeAndCreateDraft (runs OCR+AI, creates pending_ai_review draft)
4. User navigates to Batch Review Queue
5. For each draft: approves one-by-one via finalizeDraftIntake
```

### Key observations
- Draft documents created with `status = 'pending_ai_review'` have `id` and can receive post-creation AI steps
- `dms_upload_sessions` already has `intake_status`, `review_status`, `ai_job_id`, `ai_result_id`, `document_id`
- There is NO per-step progress tracking beyond these coarse fields
- After approval, no intelligence steps run automatically

---

## 4. Gap Analysis: Current Manual Steps vs Desired One-Click Flow

| Step | Currently | ORCH.1 Goal |
|---|---|---|
| File upload | Manual (done) | Same |
| OCR + AI extraction | Runs on "Upload & AI Fill" | Same (existing) |
| content_text sync | Runs at approval time | Move to post-OCR phase |
| Draft creation | Runs during AI intake | Same |
| AI summary | Manual button on doc tab | Auto after draft created |
| Completeness evaluation | Manual | Auto after draft + content |
| Risk evaluation | Manual | Auto after draft + content |
| Semantic embedding | Admin bulk tool | Auto after summary |
| Auto tags | Manual button | Auto after draft + content (optional) |
| Smart links | Manual button | Auto after draft (optional) |
| AI analysis (re-classify) | Manual | Optional background step |
| Review screen | Opens after OCR/extraction | Open after all best-effort steps, with status |
| Progress feedback | None (spinner only) | Step-by-step progress timeline |

---

## 5. Proposed ORCH.1 Architecture

### Core design decision: Progressive server-driven pipeline

**Rejected: Single blocking server action.** One call that does all 13 steps would timeout (OCR + summary + embedding can be 15–30 seconds total). Not safe for Next.js server actions with 30s timeout in some environments.

**Adopted: Progressive step-by-step orchestration with client coordination.**

```
Client triggers "Upload & AI Fill"
  │
  ▼
[STEP 1 — Critical Path] startAiIntakeFromUploadSession (existing)
  → OCR + AI extraction → draft intake session
  → Redirect to /dms/intake/[sessionCode] (show progress)
  │
  ▼
[STEP 2 — Best-effort, server-driven batch]
runDmsAiOrchestrationPostDraft(sessionCode)
  → createDraftDocument if not already (for single-file: already done)
  → generateAndSaveDmsAiSummary (FAST: 2–5s)
  → evaluateDmsDocumentIntelligence (FAST: 0ms — deterministic, no AI)
  → generateDmsDocumentEmbedding (AI: 1–2s)
  → suggestDmsDocumentTags (AI: 1–3s)
  → suggestDmsDocumentLinks (AI: 1–3s)
  → Mark session with orchestration_complete / orchestration_warnings
  │
  ▼
Review screen shows:
  → AI-filled form (existing)
  → AI Summary badge
  → Intelligence scores
  → Pending tag/link suggestions
  → Warning if any best-effort step failed
```

### Orchestrator function

```typescript
// New function to create:
runDmsAiOrchestrationPostDraft(input: {
  sessionCode: string;
  documentId: number; // draft document id
  userProfileId: number;
  isAdmin: boolean;
}): Promise<DmsOrchestrationResult>
```

### Session status tracking

Rather than a new table, **extend `dms_upload_sessions`** with:
```sql
orchestration_status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','complete','complete_with_warnings','failed'))
orchestration_steps_json JSONB -- per-step status: {step: code, status, started_at, completed_at, error_code}
orchestration_started_at TIMESTAMPTZ
orchestration_completed_at TIMESTAMPTZ
```

This avoids a new table and keeps orchestration state with the session it belongs to. See Section 11 (DB Impact) for SQL review.

---

## 6. Pipeline Step-by-Step Design

### Phase A — Critical Path (must complete before review screen)

| Step | Code | Action | Required | If fails |
|---|---|---|---|---|
| 1 | `upload_received` | File in dms-temp | Yes | Abort entire flow |
| 2 | `ocr_and_extraction` | `startAiIntakeFromUploadSession` | Yes | Abort → show error on inbox |
| 3 | `draft_ready` | Draft intake session ready | Yes | Session status = failed |

**On critical path failure:** User stays on inbox. Error message shown. No draft. Session can be retried.

### Phase B — Best-Effort (run after draft exists, before review screen if fast enough)

| Step | Code | Action | Required | If fails |
|---|---|---|---|---|
| 4 | `content_sync` | `writeDocumentContentTextSystem` | Best-effort | Log warning, skip |
| 5 | `ai_summary` | `generateAndSaveDmsAiSummary` | Best-effort | Log warning, skip |
| 6 | `intelligence` | `evaluateDmsDocumentIntelligence` | Best-effort | Log warning, skip |
| 7 | `embedding` | `generateDmsDocumentEmbedding` | Best-effort | Log warning, skip |
| 8 | `tag_suggestions` | `suggestDmsDocumentTags` | Best-effort | Log warning, skip |
| 9 | `link_suggestions` | `suggestDmsDocumentLinks` | Best-effort | Log warning, skip |

**On any best-effort failure:** Continue to next step. Mark step `failed` in `orchestration_steps_json`. Set `orchestration_status = 'complete_with_warnings'`. Show warning on review screen with retry buttons.

### Phase C — Post-Approval (run after finalizeDraftIntake / approveAiIntakeAndCreateDocument)

| Step | Code | When | Notes |
|---|---|---|---|
| 10 | `expiry_reminders` | On approval (existing) | Already runs in current flow |
| 11 | `final_content_sync` | On approval (existing) | Already runs in approveAiIntakeAndCreateDocument |

---

## 7. Single-File Flow Design

```
Inbox → Upload file → Click "Upload & AI Fill"
  ↓
[Client] POST startAiIntakeFromUploadSession (existing)
  ↓
[Server] OCR + classification/extraction → session.intake_status = 'review_pending'
  ↓
[Client] Navigate to /dms/intake/[sessionCode]
  ↓
[Server] New orchestration call: runDmsAiOrchestrationPostDraft(sessionCode)
   → runs Phase B steps (summary, intelligence, embedding, tags, links)
   → saves orchestration_steps_json to dms_upload_sessions
   → returns step results (no sensitive content)
  ↓
[Client] Review screen shows:
   → AI-filled form fields
   → AI summary (if available)
   → Intelligence scores
   → Pending tag/link suggestions
   → Orchestration status bar (green = all complete, amber = warnings, red = critical failed)
  ↓
User reviews and clicks "Approve & Save"
  ↓
[Server] approveAiIntakeAndCreateDocument (existing) → document becomes active
```

### UX for single-file

- Intake review page calls orchestration in `useEffect` on mount
- While orchestration runs, show step-progress indicator (non-blocking)
- Form is editable immediately even while best-effort steps are running
- Steps complete = badges appear on review screen (Summary ✓, Risk ✓, Embedding ✓, Tags ✓)

---

## 8. Batch Flow Design

```
Inbox → Select multiple files → "Start Batch AI Fill"
  ↓
[Client] createDmsUploadBatch → batchCode
  ↓
[Client] For each file: startAiIntakeAndCreateDraft (existing — creates pending_ai_review draft)
  ↓
[Client] After all drafts created: navigate to /dms/inbox/batch/[batchCode]
  ↓
[NEW] Batch orchestration: For each draft in batch, run Phase B steps
   → POST runDmsBatchOrchestration(batchCode)
   → processes each draft sequentially
   → updates batch counts
   → per-draft step progress saved to dms_upload_sessions.orchestration_steps_json
  ↓
Batch review queue shows per-draft status (ready, warnings, failed)
  ↓
User reviews each draft → "Review & Approve" one-by-one (existing — NO bulk)
  ↓
ONE-BY-ONE APPROVAL PRESERVED — no bulk approval, no approve-all
```

---

## 9. Status Tracking and Progress UI Design

### Session-level orchestration tracking

New columns on `dms_upload_sessions` (see SQL review):
```json
orchestration_status: "pending" | "running" | "complete" | "complete_with_warnings" | "failed"
orchestration_steps_json: [
  { "step": "content_sync", "status": "completed", "started_at": "...", "completed_at": "...", "duration_ms": 120 },
  { "step": "ai_summary", "status": "completed", "started_at": "...", "completed_at": "...", "duration_ms": 3200 },
  { "step": "intelligence", "status": "completed", "started_at": "...", "completed_at": "...", "duration_ms": 45 },
  { "step": "embedding", "status": "failed", "error_code": "provider_not_configured", "started_at": "..." },
  { "step": "tag_suggestions", "status": "skipped", "reason": "embedding_failed" },
  { "step": "link_suggestions", "status": "skipped", "reason": "embedding_failed" }
]
orchestration_started_at: "2026-..."
orchestration_completed_at: "2026-..."
```

### UI progress component (new)

```tsx
// New component: DmsOrchestrationProgressCard
// Shows on /dms/intake/[sessionCode] while orchestration runs
// Steps: [OCR ✓] [Classification ✓] [Draft ✓] [Summary ✓] [Intelligence ✓] [Embedding ⚠] [Tags —] [Links —]
// Colors: ✓ green, ⚠ amber (warning), ✗ red (failed), — grey (skipped/not run), ⟳ spinner (running)
```

---

## 10. Server Action / Helper Design

### New files to create (Phase ORCH.1)

| File | Purpose |
|---|---|
| `src/server/actions/dms/orchestration.ts` | Main orchestrator actions + session status update |
| `src/lib/dms/orchestration/pipeline-runner.ts` | Internal helper: runs Phase B steps, non-throwing |
| `src/lib/dms/orchestration/step-status.ts` | Types + step code constants |
| `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` | UI progress component |

### Functions to create

```typescript
// orchestration.ts
export async function runDmsAiOrchestrationPostDraft(input: {
  sessionCode: string;
  documentId: number;
}): Promise<ActionResult<OrchestrationRunResult>>

export async function runDmsBatchOrchestration(input: {
  batchCode: string;
}): Promise<ActionResult<BatchOrchestrationResult>>

export async function getDmsOrchestrationStatus(input: {
  sessionCode: string;
}): Promise<ActionResult<OrchestrationStatusRow>>

// pipeline-runner.ts (internal — no server action wrapper)
async function runPipelineStepSafe(
  step: PipelineStepCode,
  fn: () => Promise<{ success: boolean; error?: string }>
): Promise<PipelineStepResult>
```

### Functions to reuse (call internal helpers directly, NOT server action wrappers)

The orchestrator must call **internal helpers**, not the public server action wrappers, to avoid double permission checks and N+1 auth calls:

| Step | Helper to call |
|---|---|
| content_text sync | `writeDocumentContentTextSystem(documentId, text, source)` — already internal |
| AI summary | Need to extract `_generateAndSaveDmsAiSummaryInternal(documentId, ctx)` from ai-summary.ts |
| Intelligence | Need to extract `_evaluateDmsDocumentIntelligenceInternal(documentId)` from ai-intelligence.ts |
| Embedding | Need to extract `_generateDmsDocumentEmbeddingInternal(documentId)` from semantic-search.ts |
| Tags | Need to extract `_suggestDmsDocumentTagsInternal(documentId, ctx)` from ai-tags.ts |
| Links | Need to extract `_suggestDmsDocumentLinksInternal(documentId, ctx)` from ai-links.ts |

**Key design rule:** All permission checks happen ONCE at the orchestrator boundary. Internal helpers trust the caller has already verified permissions.

---

## 11. Database Impact Review

### Recommended approach: Minimal extension to `dms_upload_sessions`

**Rationale:** 
- `dms_upload_sessions` already has `intake_status`, `review_status`, `document_id` — it IS the canonical state for a single-file intake run.
- Adding JSONB `orchestration_steps_json` gives full per-step tracking without a new table.
- Avoids JOIN complexity for batch UI.

**Alternative (new tables):** `dms_ai_orchestration_runs` + `dms_ai_orchestration_run_steps` would be cleaner long-term but adds schema complexity. Recommended as Phase ORCH.2 enhancement if ORCH.1 proves out the pattern.

### Recommended new columns on `dms_upload_sessions`

```sql
-- REVIEW ONLY — see sql_review file
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (orchestration_status IN ('pending','running','complete','complete_with_warnings','failed')),
  ADD COLUMN IF NOT EXISTS orchestration_steps_json JSONB,
  ADD COLUMN IF NOT EXISTS orchestration_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS orchestration_completed_at TIMESTAMPTZ;
```

### No changes needed to these tables

| Table | Reason |
|---|---|
| `dms_documents` | Already has all intelligence columns (`ai_summary`, `ai_risk_level`, etc.) |
| `dms_document_files` | OCR columns already present |
| `dms_document_content` | Already exists |
| `dms_ai_extraction_jobs/results` | Already exists |
| `dms_upload_batches` | No change — existing status tracking sufficient |
| `dms_ai_tag_suggestions` / `dms_ai_link_suggestions` | Already exists |

---

## 12. SQL Review — Recommended / Optional

See: `implementation_Review/sql_review/ERP_DMS_AI_ORCH_1_OPTIONAL_MIGRATION_REVIEW.sql`

---

## 13. RLS and Permission Design

### Permission boundary

All permissions are checked ONCE at the orchestrator server action boundary:

```
getAuthContext()
hasPermission(ctx, 'dms.documents.upload')  // or dms.documents.ai.run
OR dms.admin OR system_admin
```

Internal helpers called by the orchestrator do NOT re-check permissions.

### Client choices

- `createClient()` for reading session/document data (user-scoped, RLS enforced)
- `createAdminClient()` for reading provider configs (same as existing AI actions)
- `createAdminClient()` for writing AI results (same as existing AI actions that bypass RLS for system writes)

### RLS on new columns

The new `orchestration_status` / `orchestration_steps_json` columns are on `dms_upload_sessions`, which already has RLS enabled + forced with ownership-scoped policies. No policy changes needed.

### Confidentiality gates

Documents with confidentiality level `hr`, `legal`, `executive`:
- AI summary generation requires `dms.admin` (existing rule, preserved)
- Orchestrator must pass the `isAdmin` flag through to summary step
- If non-admin + confidential document: skip summary step, mark as `skipped_confidential`

---

## 14. Feature Flag Design

### Existing flags (all currently enabled)

All required DMS AI flags (`DMS_OCR`, `DMS_CLASSIFICATION`, `DMS_EXTRACTION`, `DMS_AI_SUMMARY`, `DMS_COMPLETENESS`, `DMS_RISK_SCORE`, `DMS_SEMANTIC_SEARCH`, `DMS_AUTO_TAGS`, `DMS_SMART_LINKS`) are already enabled in live DB.

The orchestrator checks each flag per step and skips the step if disabled.

### New recommended flag

```sql
-- REVIEW ONLY
INSERT INTO erp_ai_feature_flags (feature_code, feature_name, description, is_enabled, requires_human_review)
VALUES ('DMS_AI_ORCHESTRATION', 'DMS Full AI Pipeline Orchestration',
        'Enables automatic post-upload full AI processing pipeline (summary, intelligence, embedding, tags, links).',
        false, false);
```

**Default: disabled.** Admin must enable after validating each underlying step in production. Orchestrator does nothing extra if flag is disabled — falls back to current behavior (Phase A only).

If `DMS_AI_ORCHESTRATION` is disabled, `runDmsAiOrchestrationPostDraft` returns immediately with `status = 'skipped_feature_disabled'`. No cost, no side effects.

---

## 15. Error Handling and Retry Design

### Error tiers

| Tier | Example | Behavior |
|---|---|---|
| Critical (Phase A) | OCR provider not configured | Abort. No draft. Error on inbox. Session stays in `upload_ready`. User can retry "Upload & AI Fill". |
| Warning (Phase B) | Summary fails | Mark step failed. Continue to next step. Set `orchestration_status = 'complete_with_warnings'`. Retry button shown on review screen. |
| Non-blocking (Phase B) | Embedding fails | Same as warning. User can generate embedding manually from document tab. |
| Ignored (Phase C) | Expiry reminder fails | Non-fatal as in current flow. |

### Retry behavior

- Phase A retry: Click "Upload & AI Fill" again (session already exists, intake status = pending, checks existing result first)
- Phase B retry: New action `retryDmsOrchestrationStep(sessionCode, stepCode)` — runs specific failed step again
- Individual step retry: existing manual buttons preserved (Run OCR, Generate Summary, etc.)

### Idempotency

| Step | Idempotency rule |
|---|---|
| OCR | Skip if `ocr_status = 'complete'` on file |
| AI intake | Skip if `ai_result_id` already set on session |
| content_text sync | sha256 dedup (already in place) |
| AI summary | Skip if `ai_summary_status = 'complete'` |
| Intelligence | Always run (deterministic, no AI cost) |
| Embedding | Skip if `summary_embedding_status = 'complete'` |
| Tags | Supersede old pending (existing behavior) |
| Links | Supersede old pending (existing behavior) |

---

## 16. Idempotency and Cost Control

### AI costs per pipeline run (estimate)

| Step | AI cost | Notes |
|---|---|---|
| OCR/extraction | 1–3 API calls (GPT-4.1 vision) | High cost — skip if already done |
| AI summary | 1 call (GPT-4.1) | Medium cost — skip if complete |
| Embedding | 1 call (text-embedding-3-small) | Low cost — skip if complete |
| Tags | 1 call | Low cost — supersede old |
| Links | 1 call | Low cost — supersede old |
| Intelligence | 0 AI calls — deterministic | No cost |

### Cost control rules

1. Always check existing status before calling AI
2. Skip if already complete and not explicitly forcing regeneration
3. Never call AI twice for the same draft session
4. `DMS_AI_ORCHESTRATION` flag = off → zero extra cost

---

## 17. Security and Sensitive Data Rules

Inherited from existing DMS rules (DMS.14 verified):
- Raw OCR text NEVER logged
- AI prompt content NEVER logged
- Raw AI response NEVER logged in audit
- API keys NEVER returned to client
- Content text NEVER in list/search responses
- `erp_ai_usage_logs` stores metadata only (model, tokens, duration, operation — no content)
- Orchestration step log: step code, status, duration_ms, error_code — NO content

### New rule for ORCH.1

`orchestration_steps_json` stored on session must contain:
- Allowed: step code, status, started_at, completed_at, duration_ms, error_code
- Never: prompt text, OCR text, AI response, extracted values, file content

---

## 18. UI/UX Design

### Intake review screen changes

**Current:** Opens as soon as `startAiIntakeFromUploadSession` completes  
**ORCH.1:** Opens as usual; orchestration progress card appears at top, runs Phase B steps in background

```
┌─────────────────────────────────────────────────────────┐
│  AI Processing Pipeline                                  │
│  ✓ OCR & Extraction   ✓ Draft Created   ✓ Summary       │
│  ✓ Intelligence       ⟳ Embedding...   — Tags   — Links │
│                                                          │
│  [Retry Failed Steps]                                    │
└─────────────────────────────────────────────────────────┘
[Existing AI-filled review form — editable while pipeline runs]
```

### Review form still shows immediately

The pipeline card is non-blocking. User can review and approve the draft even while embedding/tags/links are still running. Steps that complete while user is reviewing auto-update the card.

### Batch queue changes

Each batch draft item shows a status chip:
- 🟢 Ready (all steps complete)
- 🟡 Ready with warnings (some best-effort steps failed)
- ⟳ Processing (pipeline running)
- 🔴 Failed (critical step failed)

---

## 19. Manual Tools Preservation

All existing manual tools remain fully available:

| Tool | Preserved |
|---|---|
| "Run OCR" / "Re-run OCR" button | ✅ Unchanged |
| "AI Analysis" button | ✅ Unchanged |
| "Generate Summary" button | ✅ Unchanged |
| "Evaluate Completeness/Risk" button | ✅ Unchanged |
| "Generate Embedding" button | ✅ Unchanged |
| "Find Similar Documents" | ✅ Unchanged |
| "Suggest Tags" button | ✅ Unchanged |
| "Suggest Links" button | ✅ Unchanged |
| Admin backfill tools | ✅ Unchanged |
| Admin intelligence panel | ✅ Unchanged |

ORCH.1 is an additive orchestration layer. It calls the same internal helpers that the manual buttons call. It does not replace them.

---

## 20. Testing and UAT Plan

### Pre-UAT (source-level)

1. TypeScript typecheck passes
2. Build passes
3. No OpenAI direct import in orchestration.ts / pipeline-runner.ts
4. No sensitive content in orchestration_steps_json
5. `DMS_AI_ORCHESTRATION` flag defaults to `false`
6. Single-file upload flow still works with flag off
7. Batch upload still works with flag off

### UAT — single file

1. Enable `DMS_AI_ORCHESTRATION` via admin AI settings
2. Upload a PDF trade license to DMS inbox
3. Click "Upload & AI Fill"
4. Observe pipeline progress card on review screen
5. Verify all Phase B steps complete (or warn with retry)
6. Verify AI-filled form, AI summary, confidence scores are visible
7. Approve & Save
8. Confirm `ai_summary`, `completeness_score`, `ai_risk_level` set on `dms_documents`
9. Confirm `summary_embedding_status = 'complete'`
10. Confirm pending tag/link suggestions exist
11. Disable flag → verify single-file flow unchanged

### UAT — batch

1. Enable `DMS_AI_ORCHESTRATION`
2. Upload 3 files as batch
3. Verify batch orchestration runs for each draft
4. Navigate batch review queue → confirm per-draft status chips
5. Approve first file one-by-one → confirm still one-by-one (NO bulk)
6. Approve second → third

---

## 21. Risks and Mitigations

| Risk | Probability | Mitigation |
|---|---|---|
| Phase B timeout (embedding slow) | Medium | Move embedding to truly async post-review if >10s |
| Duplicate AI cost on retry | Medium | Idempotency checks at each step |
| Provider not configured | Low | Skip with warning, not error |
| Confidential document summary attempt | Low | Check isAdmin before summary step |
| Large file slow OCR | Medium | OCR already in Phase A — ORCH.1 doesn't change it |
| orchestration_steps_json bloat | Low | Cap to 15 steps, each ≤200 bytes |
| Breaking existing single/batch flows | High | Flag defaults off; test thoroughly |

---

## 22. Implementation File Plan

### New files

```
src/lib/dms/orchestration/types.ts
src/lib/dms/orchestration/pipeline-runner.ts
src/server/actions/dms/orchestration.ts
src/features/dms/orchestration/dms-orchestration-progress-card.tsx
src/features/dms/orchestration/index.ts
```

### Modified files

```
src/features/dms/intake/dms-ai-intake-page-client.tsx   -- add pipeline progress card
src/features/dms/intake/dms-ai-intake-review-form.tsx   -- show intelligence + summary
src/app/(protected)/dms/intake/[sessionCode]/page.tsx   -- pass orchestration props
src/features/dms/upload/dms-upload-inbox-page-client.tsx -- trigger orchestration after AI fill
src/features/dms/upload/dms-batch-review-queue-client.tsx -- show per-draft status chips
src/lib/query/query-keys.ts   -- add queryKeys.dms.orchestrationStatus(sessionCode)
src/lib/query/invalidation.ts -- add invalidateDmsOrchestrationStatus()
```

### Internal helper extractions needed

From existing server actions, extract internal `_*Internal` helpers for:
- `ai-summary.ts` → `_generateSummaryInternal(documentId, ctx)`
- `ai-intelligence.ts` → `_evaluateIntelligenceInternal(documentId)`
- `semantic-search.ts` → `_generateEmbeddingInternal(documentId, ctx, adminClient)`
- `ai-tags.ts` → `_suggestTagsInternal(documentId, supabase, provider)`
- `ai-links.ts` → `_suggestLinksInternal(documentId, supabase, provider)`

These are refactoring moves only — no behavior change. Existing server actions call the internal helpers. Orchestrator also calls the same helpers.

### DB migration

```
supabase/migrations/<timestamp>_erp_dms_ai_orch_1_orchestration_columns.sql
```

Adds `orchestration_status`, `orchestration_steps_json`, `orchestration_started_at`, `orchestration_completed_at` to `dms_upload_sessions`. Plus new feature flag `DMS_AI_ORCHESTRATION` (disabled by default).

---

## 23. Exact Step-by-Step Cursor Implementation Sequence

1. Apply migration (new columns + feature flag)
2. Create `src/lib/dms/orchestration/types.ts` (pipeline step codes, result types)
3. Create `src/lib/dms/orchestration/pipeline-runner.ts` (safe step runner, no throws)
4. Extract internal helpers from ai-summary, ai-intelligence, semantic-search, ai-tags, ai-links
5. Create `src/server/actions/dms/orchestration.ts` (3 server actions: run, batch, get status)
6. Create `src/features/dms/orchestration/dms-orchestration-progress-card.tsx` (UI)
7. Update intake page to call orchestration + show progress card
8. Update batch queue to show per-draft status chips
9. Update query-keys.ts + invalidation.ts
10. Run typecheck + build
11. UAT with flag enabled on dev/staging

---

## 24. Acceptance Criteria

```text
1. "Upload & AI Fill" → single-file review screen opens
2. Progress card shows per-step status (OCR ✓, Summary ✓, Intelligence ✓, Embedding ✓, Tags ✓, Links ✓)
3. If a best-effort step fails, review screen opens with warning — not blocked
4. Failed step shows retry button
5. Manual retry buttons (Suggest Tags, Generate Summary, etc.) still work
6. AI-filled form + AI summary + intelligence scores visible on review screen
7. Approve & Save still works — document becomes active as before
8. Batch flow: each draft gets orchestration, review queue shows per-draft status
9. ONE-BY-ONE approval preserved — no bulk approve added
10. DMS_AI_ORCHESTRATION=false → no extra steps run (current behavior preserved exactly)
11. No raw OCR/prompt/content/response in logs or UI
12. TypeScript/build pass
13. Existing manual admin tools unchanged
```

---

## 25. Rollback Plan

1. Disable `DMS_AI_ORCHESTRATION` flag (no AI calls, no cost, existing behavior)
2. Revert orchestration.ts / pipeline-runner.ts if needed
3. Remove progress card from intake page
4. DB columns can remain (nullable, ignored if flag off)
5. Single-file and batch flows continue working as before

---

## 26. Next Phase Relationship to ERP COMMON AI.2

ORCH.1 focuses on DMS document processing pipeline — not ERP record field suggestions.

COMMON AI.2 (Document Understanding Center) will:
- Use ORCH.1's enriched DMS documents (with summary, intelligence, embeddings)
- Aggregate cross-document insights for an ERP entity
- Show document-level compliance/risk in entity context

ORCH.1 is a prerequisite for COMMON AI.2 to have fully enriched document data. Recommended sequence: ORCH.1 → COMMON AI.2.

---

## 27. Handoff Summary

This plan is ready for Sameer/ChatGPT review. Key decisions requiring approval:

| Decision | Recommended | Alternative |
|---|---|---|
| Orchestration table | Extend `dms_upload_sessions` with JSONB | New `dms_ai_orchestration_runs` table |
| Phase B timing | Run immediately after Phase A, before review screen | Run lazily as user reviews |
| New feature flag | Yes — `DMS_AI_ORCHESTRATION`, default off | No new flag — use individual flags |
| Internal helper extraction | Yes — refactor existing server actions | Call server action wrappers (double auth) |
| Embedding before/after approval | Before (on draft) | After (on active document) |
| Tags/links on draft | Yes — pending suggestions visible during review | After approval only |

---

**End of Plan**
