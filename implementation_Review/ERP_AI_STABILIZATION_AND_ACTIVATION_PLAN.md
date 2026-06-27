# ERP AI Stabilization and Activation Plan

**Date:** 2026-06-27  
**Prepared by:** Cursor AI Agent (planning only — read-only audit)  
**Scope:** ALGT ERP AI system, all phases through Phase 17  
**Trigger:** Accepted recommendation from `ERP_FULL_AI_MODULE_CURRENT_STATE_EXPLANATION_AND_DIRECTION_REPORT.md`  

---

## 1. Executive Summary

### Why stabilization is needed

The ALGT ERP has accumulated 17 DMS AI phases, 7+ Common AI modules, 66 feature flags, 7 AI provider configs, and approximately 25 AI-related database tables. Phase 17 (Apply Correction Proposal) has closed as LIVE PASS / CLOSED. The system is now feature-rich but carries:

1. **One unverified build** — `npm run build` was not run during Phase 17 UAT due to environment constraints (dev server was running). TypeScript (0 errors), 269 tests pass, and lint clean give strong assurance, but a clean production build has not been confirmed since before Phase 17 was wired.
2. **Two live UAT artifacts** — a draft correction proposal (id=2, status=draft, harmless) and a `party_licenses.id=2 remarks` value set to `"UAT Test Correction - Phase 17"` during UAT.
3. **Phase 17 still behind flag** — `DMS_AI_APPLY_CORRECTION_PROPOSALS=false`. Phase is closed; admin decision to enable for production is pending.
4. **Stale source-of-truth** — `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` covers only through Phase 15. `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` references Phase 17 warnings that are now resolved.
5. **Zero live data in backend-ready features** — Risk scoring (0 scores), field suggestions (0 suggestions) have fully implemented backends that have never been triggered against live data.
6. **Navigation ambiguity** — AI features are spread across `/dms/`, `/admin/dms/`, `/admin/ai/`, and `/admin/settings/ai/`. The Common AI routes have unclear UI integration status.
7. **Playwright E2E blocked** — automated E2E spec exists but cannot run without `E2E_USER_PASSWORD`.

### What is ready but disabled

| Feature | Flag | Status |
|---|---|---|
| Apply Correction Proposals | `DMS_AI_APPLY_CORRECTION_PROPOSALS` | Built, UAT closed, admin can enable |
| Apply Correction Restore Previous | `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | Built, unit-tested, should remain OFF for now |
| Azure Document Intelligence OCR | `DMS_OCR_AZURE` | Adapter built, needs test doc and cost review |

### What is built but not yet producing live data

| Feature | Backend | Live Data | Gap |
|---|---|---|---|
| Risk Scoring | ✅ full engine | 0 scores | Admin trigger not run on any entity |
| Field Suggestions | ✅ full engine (15 Stage-1 handlers) | 0 suggestions | Pilot entities not scanned |
| Duplicate Detection | ✅ full engine | 1 candidate | Scan run once; not on schedule |
| Playwright E2E | ✅ spec exists | Cannot run | `E2E_USER_PASSWORD` not set |

### What must be cleaned before new phases

1. Verify `npm run build` passes cleanly.
2. Restore `party_licenses.id=2 remarks` to its correct value via UI.
3. Cancel or document the draft correction proposal (id=2).
4. Update stale source-of-truth documents.
5. Remove stale Phase 17 warnings from `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`.
6. Document feature flag decisions (especially `DMS_AI_APPLY_CORRECTION_PROPOSALS`).

### Direction recommendation

Do not start Phase 18, Phase 16 Tier 3, HR AI, or any new AI development. First stabilize, then activate what is already built.

---

## 2. Planning Scope and Non-Implementation Rule

**This document is a plan only.** Nothing in this document is an instruction to:

- Change source code
- Run migrations
- Mutate database data
- Enable or disable feature flags permanently
- Create new UI
- Create new server actions
- Implement new features
- Start Phase 18 or Phase 16 Tier 3

Each numbered item is a **planned action** for a future execution prompt. Every action in this plan must be individually reviewed and approved by Sameer before execution begins.

---

## 3. Files and Reports Reviewed

### Primary sources (read during this planning pass)

| File | Status |
|---|---|
| `implementation_Review/ERP_FULL_AI_MODULE_CURRENT_STATE_EXPLANATION_AND_DIRECTION_REPORT.md` | ✅ Reviewed (978 lines) |
| `implementation_Review/ERP_DMS_AI_PHASE_17_BROWSER_UAT_AND_CLOSURE_REPORT.md` | ✅ Reviewed (416 lines) |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ Reviewed (>200KB — key sections read) |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | ❌ File not found at root (may be at `implementation_Review/AI_Enhancement/ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`) |

### Reports referenced but not re-read (already synthesized in AI inventory report)

- Phase 15: `ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_IMPLEMENTATION_REPORT.md`
- Phase 16 Tier 2: `ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_REPORT.md`
- Phase 17 implementation: `ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_IMPLEMENTATION_REPORT.md`
- Common AI phases 0–1G, 3–7, 13–15 (in `implementation_Review/AI_Enhancement/`)

---

## 4. Current AI State Baseline

### Latest closed phase

**ERP DMS AI Phase 17 — Apply Correction Proposal**  
Status: **LIVE PASS / CLOSED ✅**  
Verified by: Browser UAT report 2026-06-27  
Flags: Both `DMS_AI_APPLY_CORRECTION_*` flags restored to `false` after UAT.

### AI infrastructure counts (live DB as of 2026-06-27)

| Metric | Count |
|---|---|
| AI feature flags | 66 total |
| Enabled flags | 62 |
| Disabled flags | 4 |
| AI provider configs | 7 |
| AI-related DB tables | ~25+ |
| AI usage log entries | 69 |
| AI extraction results | 83 |
| Job queue entries | 45 |
| Review queue items | 6 open |
| Compliance findings | 31 |
| Apply runs | 6 |
| Apply items | 6 |
| Correction proposals | 2 (1 draft, 1 applied/UAT) |
| Risk scores | **0** |
| Field suggestions | **0** |
| Duplicate candidates | 1 |

### Disabled flags (4)

| Flag | Reason |
|---|---|
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` | Phase 17 built+UAT closed; pending admin enable decision |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | Supplementary to above; keep OFF until PROPOSALS is stable |
| `DMS_OCR_AZURE` | Adapter built; needs Arabic test doc + cost review before enabling |
| `LOCAL_LLM` | Stub only; provider failed test; keep OFF indefinitely |

### Critical notes from inventory report

- All 11 primary AI tables: RLS enabled + FORCE RLS enabled ✅
- No raw AI content (prompts, OCR text, responses) stored in audit/correction tables ✅
- `correction_value_json` format enforced as scalar-only `{"v": scalar}` ✅
- No DELETE policy on `dms_ai_erp_apply_correction_proposals` ✅
- `npm run build` not verified since before Phase 17 ⚠️
- `party_licenses.id=2 remarks` = UAT test value ⚠️
- Draft correction proposal id=2 exists (harmless but untidy) ⚠️

---

## 5. Stabilization Priorities

### P0 — Must do before enabling more AI

These are blockers. No new AI features or flag enables should happen until P0 is resolved.

| ID | Action | Reason |
|---|---|---|
| P0-1 | Run `npm run build` (production build) and confirm 0 errors | Never run after Phase 17; required for deployment confidence |
| P0-2 | Restore `party_licenses.id=2 remarks` to correct value via party admin UI | UAT test data left in live party record |
| P0-3 | Cancel or document draft correction proposal (id=2) via `cancelApplyCorrectionProposal` server action | Untidy UAT artifact; proposal is in `draft`, never confirmed |
| P0-4 | Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — mark Phase 17 CLOSED, remove stale warnings | Source of truth is partially stale; guards may confuse future agents |
| P0-5 | Document admin decision on `DMS_AI_APPLY_CORRECTION_PROPOSALS` enablement | Cannot safely enable other AI without knowing this is decided |

### P1 — Should do before next feature phase

| ID | Action | Reason |
|---|---|---|
| P1-1 | Update/archive `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (covers only through Phase 15) | Stale — references outdated phase status and roadmap |
| P1-2 | Provide `E2E_USER_PASSWORD` env var and run Playwright E2E | Unblocks automated browser testing |
| P1-3 | Run risk scoring admin trigger on a safe set of entities (Party or Document) | 0 live scores; backend built but never triggered |
| P1-4 | Run field suggestion scan on pilot Company/Party entities | 0 suggestions; 15 handlers built but never run |
| P1-5 | Verify all `/admin/ai/*` routes load correctly in browser | Some common AI routes have unclear UI status |
| P1-6 | Review feature flag table — update descriptions or notes for stale/confusing entries | Some flags may reference old phase names or have unclear purposes |

### P2 — Nice-to-have cleanup

| ID | Action | Reason |
|---|---|---|
| P2-1 | Mark stale implementation plan files (e.g., phase plan MDs at root) as archived | Planning docs at root; confusing for agents |
| P2-2 | Document Azure OCR test plan (no enablement — plan only) | DMS_OCR_AZURE could improve Arabic doc quality |
| P2-3 | Plan AI navigation hub improvement (no implementation) | 7+ scattered AI entry points need clarity |
| P2-4 | Document job queue monitoring gap (no scheduler, no dashboard) | 45 queued jobs; no cron or UI to manage them |

---

## 6. Build / Typecheck / Test / E2E Readiness Plan

### Step 6.1 — npm run build (production build)

**Command:** `npm run build`  
**Expected result:** 0 errors, 0 warnings that block build  
**When to run:** Outside of Turbopack dev server session (stop dev server first, or use a separate environment)  
**If it fails:** Capture full output, identify file and line, fix before enabling any flags

**Known constraint from Phase 17 UAT:**  
> "npm run build not run — dev server running in background; Turbopack dev build is active. TypeScript (clean), tests (269/269), and lint (clean) provide equivalent code correctness assurance."

TypeScript, tests, and lint are all clean. Build failure risk is low but must be verified.

### Step 6.2 — TypeScript type check

**Command:** `npx tsc --noEmit`  
**Current status:** ✅ 0 errors (confirmed during Phase 17 UAT and again during pagination feature work 2026-06-27)  
**Required env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (must be present in `.env.local`)

### Step 6.3 — Lint

**Command:** `npx eslint src/`  
**Current status:** ✅ Clean (Phase 17 UAT confirmed 0 errors; only `.eslintignore` deprecation warning, harmless)  
**Note:** ESLint is also run via Next.js build, so build pass implies lint pass

### Step 6.4 — Unit tests (Vitest)

**Command:** `npx vitest run`  
**Current status:** ✅ 269/269 pass (confirmed Phase 17 UAT 2026-06-27)  
**Notable test suites:**
- `src/lib/ai/observability/safe-usage-redaction.test.ts` — 44 tests (redaction rules)
- `src/lib/dms/apply-correction/__tests__/` — correction source/value/conflict (8+ tests)

### Step 6.5 — Playwright E2E

**Command (expected):** `npx playwright test` or project-specific command  
**Current status:** ❌ Blocked — `E2E_USER_PASSWORD` env var not set  
**Required env vars for E2E:**

| Env Var | Purpose | Source |
|---|---|---|
| `E2E_USER_PASSWORD` | Test user password for browser login | Must be set by Sameer — never hardcode |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Already in .env.local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Already in .env.local |

**Action:** Sameer to provide `E2E_USER_PASSWORD` in `.env.local` (or `.env.test`). Agent must not guess or hardcode this.

### Step 6.6 — Required env vars for full AI functionality

| Env Var | Used By | Risk if Missing |
|---|---|---|
| `OPENAI_API_KEY` | GPT-4.1 classification/extraction/chat/embedding | All AI disabled silently |
| `WORKER_SECRET` | `/api/internal/dms-ai-jobs/process` bearer auth | Job processing silently fails |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Azure DI OCR (flag currently OFF) | OCR falls back to GPT vision |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure DI OCR | Same as above |

**Note:** API keys are stored as `secret_ref` env var names in `erp_ai_provider_configs` — they are never stored in the database directly.

---

## 7. Phase 17 Cleanup Plan

### 7.1 — Handle draft correction proposal (id=2, status=draft)

**What:** During UAT, a first browser attempt created a draft proposal before the state management bug was fixed. The proposal (id=2) has status=`draft` and was never confirmed. No target field was written.

**Risk:** Negligible. Draft proposals are not processed by any server action path. No ERP write occurred.

**Recommended action:** Cancel the draft via the existing `cancelApplyCorrectionProposal(proposalId, reason)` server action. Reason string: `"Phase 17 UAT artifact — cancelled during stabilization"`.

**Method:** Use the admin UI (Document 53 → AI Analysis tab → Apply History → find the draft proposal → cancel), OR invoke the server action directly via the admin console if no UI cancel button exists for drafts.

**What NOT to do:** Do not delete the row — `dms_ai_erp_apply_correction_proposals` has no DELETE policy by design (immutable audit trail).

### 7.2 — Restore party_licenses.id=2 remarks value

**What:** During Phase 17 UAT, a correction proposal was applied that set `party_licenses.id=2 remarks` to `"UAT Test Correction - Phase 17"`. The original value before UAT was `"Verified – entity match: Taqa Al Mansoory"`.

**Risk:** Low. This is a party license remarks field for a test record. The live record value is misleading.

**Recommended action:**  
- Option A (preferred): Open the party record in the Party Master UI → Party Licenses tab → Edit the license record (id=2) → Restore remarks to `"Verified – entity match: Taqa Al Mansoory"` (or leave blank if that is the correct production value — Sameer to confirm what the correct value is).  
- Option B: Create another correction proposal to apply the correct value (requires `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` temporarily). This adds another apply run to the audit trail, which is acceptable but more complex.
- Option C: Direct SQL update as a last resort, with full audit documentation. Not preferred.

**Sameer must confirm** what the correct value of `party_licenses.id=2 remarks` should be before restoring.

### 7.3 — Feature flag decision: DMS_AI_APPLY_CORRECTION_PROPOSALS

**Current state:** `false`  
**Phase 17 UAT result:** LIVE PASS / CLOSED ✅ — all scenarios passed, 2 bugs fixed during UAT  
**Admin decision required:** Enable or keep disabled?

**Recommendation:** Enable for production. The feature has:
- Full browser UAT with pass
- Dual-checkbox human confirmation mandatory
- No auto-rollback, no automatic revert
- RLS + FORCE RLS + no DELETE policy
- Payload safety SQL 10/10 PASS
- Security SQL 11/11 PASS

**How to enable:** Admin AI Settings UI → Feature Flags → find `DMS_AI_APPLY_CORRECTION_PROPOSALS` → toggle ON. (Or direct DB update: `UPDATE erp_ai_feature_flags SET is_enabled=true WHERE feature_code='DMS_AI_APPLY_CORRECTION_PROPOSALS'`.)

**Pre-enable checklist:**
1. P0-1: `npm run build` passes ✅
2. P0-2: `party_licenses.id=2 remarks` restored ✅
3. P0-3: Draft proposal cancelled ✅
4. Sameer approves enablement

### 7.4 — Feature flag decision: DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS

**Current state:** `false`  
**Recommendation:** Keep OFF for now. This supplementary flag enables restore-from-snapshot behavior. UAT did not exercise the full restore browser flow (limited by no safe conflict-free field). Enable only after PROPOSALS is stable in production and restore flow is separately tested.

**Condition to enable:** After `DMS_AI_APPLY_CORRECTION_PROPOSALS` has been live for at least 2 weeks with no issues, and a dedicated restore flow UAT is conducted.

---

## 8. Source-of-Truth Cleanup Plan

### 8.1 — .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md

**What:** Primary source of truth for all agents. Very large file (~220KB). May contain:
- Stale Phase 17 warnings (Phase 17 was not yet closed when some entries were written)
- Incomplete phase status table
- Missing note about the accepted AI inventory report

**Planned updates (do not apply now):**
1. Find and update Phase 17 status entry to `LIVE PASS / CLOSED ✅ 2026-06-27`
2. Remove any warning-level notes about Phase 17 being in progress
3. Add reference to `ERP_FULL_AI_MODULE_CURRENT_STATE_EXPLANATION_AND_DIRECTION_REPORT.md` (2026-06-27) as accepted inventory
4. Add reference to `ERP_AI_STABILIZATION_AND_ACTIVATION_PLAN.md` (this file) as current direction
5. Add note that Phase 18 / Phase 16 Tier 3 / HR AI are deferred pending stabilization completion
6. Update current feature flag summary (62 ON, 4 OFF)
7. Update next action: "Complete stabilization plan execution before starting new phases"

### 8.2 — ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md

**Status:** File not found at expected root path. Likely at `implementation_Review/AI_Enhancement/ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`.  
**Known issue:** Report states it covers only through Phase 15 (stale by 2 phases).

**Planned action (do not apply now):**
1. Locate the file
2. Add a top banner:
   ```
   ⚠️ STALE — This document was last updated for Phase 15.
   For current state, see:
   implementation_Review/ERP_FULL_AI_MODULE_CURRENT_STATE_EXPLANATION_AND_DIRECTION_REPORT.md (2026-06-27)
   implementation_Review/ERP_AI_STABILIZATION_AND_ACTIVATION_PLAN.md (2026-06-27)
   ```
3. Do not delete — it still has valid Phase 1–15 context

### 8.3 — Planning documents at repository root

**Files:** `ERP_DMS_AI_PHASE_*_PLAN.md` files at repo root (e.g., `ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_PLAN.md`)

**Planned action:** Move completed phase plans to `implementation_Review/plans/` or add a `COMPLETED` banner at top. Do not delete — historical record.

### 8.4 — Recommended next source-of-truth update sequence

1. Run `npm run build` → document result
2. Cancel draft proposal → document
3. Restore party license remarks → document
4. Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
5. Archive stale `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
6. Update feature flag decision doc

---

## 9. AI Feature Flag Review Plan

### 9.1 — Disabled flags classification

| Flag | Current State | Recommended State | Reason | UAT Required? | Admin Approval? |
|---|---|---|---|---|---|
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` | ❌ OFF | ✅ **Enable** | Phase 17 closed, browser UAT passed, all safety checks pass | ✅ Done (Phase 17) | ✅ Yes (Sameer) |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | ❌ OFF | ❌ **Keep OFF** | Supplementary; no full flow UAT yet; low urgency | ✅ Required before enabling | ✅ Yes (Sameer) |
| `DMS_OCR_AZURE` | ❌ OFF | ⚠️ **Test first, then decide** | Adapter built; improves Arabic OCR; needs test doc + cost review | ✅ Required | ✅ Yes (Sameer) |
| `LOCAL_LLM` | ❌ OFF | ❌ **Keep OFF indefinitely** | Provider failed test, stub only, no production use case | N/A | N/A |

### 9.2 — Enabled flags (selected) — verification needed

| Flag / Group | Current State | Verification Action | Risk |
|---|---|---|---|
| `DMS_OCR`, `DMS_OCR_ROUTER`, `DMS_OCR_GPT_VISION_FALLBACK` | ✅ ON | Verify GPT vision path active in admin intelligence page | Low |
| `DMS_CLASSIFICATION`, `DMS_EXTRACTION` | ✅ ON | Check at least 1 document has extraction result | Low |
| `DMS_AI_JOB_QUEUE`, `DMS_AI_JOB_QUEUE_WORKER_ENABLED` | ✅ ON | Verify WORKER_SECRET is set; check queue has no stuck jobs | Medium |
| `DMS_AI_APPLY_TO_ERP`, `DMS_AI_APPLY_TO_ERP_PARTY*` | ✅ ON | Verify apply-to-ERP tab appears on document with AI results | Low |
| `ERP_AI_ASSISTANT`, `ERP_AI_ACTIONS` | ✅ ON | Open assistant UI and verify 1 session loads | Low |
| `ERP_AI_RISK_SCORE` | ✅ ON | Flag is ON but 0 scores — admin trigger needed | Low |
| `ERP_AI_FORM_FILL` | ✅ ON | Flag is ON but 0 suggestions — scan needed | Low |
| `ERP_AI_HR_*` (9 flags) | ✅ ON | HR AI backend partially wired; UI integration extent unclear | Medium |

### 9.3 — Flags that may be stale or confusing

| Flag | Note |
|---|---|
| `DMS_OCR_BACKFILL_QUEUE` | References queue mode that may have changed implementation |
| Any flag referencing removed code | Need codebase search to verify each flag code has a live consumer |

**Planned action:** A future "dead flag audit" to grep every `feature_code` value in `erp_ai_feature_flags` against the codebase and confirm each has at least one live code reference. Any flag with no consumer can be documented as stale.

---

## 10. AI Provider and Model Readiness Plan

### 10.1 — Provider config verification table

| Config Code | Provider | Model | Purpose | Current State | Required Env Secret | Recommended Action | Risk |
|---|---|---|---|---|---|---|---|
| `DEFAULT_CHAT` | openai | gpt-4.1 | General chat/assistant | ✅ Enabled, last test success | `OPENAI_API_KEY` | No action — active | None |
| `DEFAULT_DMS_CLASSIFIER` | openai | gpt-4.1 | Document classification | ✅ Enabled, last test success | `OPENAI_API_KEY` | No action — active | None |
| `DEFAULT_DMS_EXTRACTOR` | openai | gpt-4.1 | Metadata extraction | ✅ Enabled, last test success | `OPENAI_API_KEY` | No action — active | None |
| `DEFAULT_EMBEDDING` | openai | text-embedding-3-small | Document + chunk embeddings | ✅ Enabled, last test success | `OPENAI_API_KEY` | No action — active | None |
| `DEFAULT_DMS_OCR` | tesseract | (none) | OCR — legacy | ❌ Disabled | None needed | Keep disabled | None |
| `ARABIC_OCR_AZURE` | azure_document_intelligence | prebuilt-read | Arabic/complex OCR | ❌ Disabled | `AZURE_DOCUMENT_INTELLIGENCE_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Enable only after test (see §11) | Low-Med |
| `LOCAL_LLM_DEFAULT` | local_ollama | (none) | Local LLM | ❌ Disabled, last test **failed** | None | Keep disabled permanently | None |

### 10.2 — Secret reference policy (verified safe)

All secrets are stored as `secret_ref` (env var name) and `masked_secret_preview` only. Raw API keys are never stored in the database. This was confirmed during the AI inventory report.

**Planned verification:** For each enabled provider config, confirm the referenced env var name exists in the deployment environment and returns a non-null value (without exposing the value itself).

### 10.3 — Provider factory verification

**File:** `src/lib/ai/providers/factory.ts`  
**Planned action:** Review that `getAiProvider(configCode)` correctly handles `is_enabled=false` providers (returns null / throws cleanly). Confirm no provider config change is needed before enabling correction proposals.

---

## 11. Azure OCR Activation Readiness Plan

### Context

The Azure Document Intelligence adapter is built and wired:
- Config: `ARABIC_OCR_AZURE` in `erp_ai_provider_configs` (enabled=false)
- Flag: `DMS_OCR_AZURE=false`
- OCR Router: `src/lib/dms/ocr/ocr-router.ts` — when flag is ON, routes to Azure first; falls back to GPT vision

GPT-4.1 vision is currently the primary OCR path and is working. Azure DI would improve quality for:
- Arabic-language documents
- Multi-page PDFs
- Complex layouts (tables, stamps, signatures)

### Activation readiness checklist (plan only — do not execute)

| Step | Action | Status |
|---|---|---|
| AZ-01 | Confirm `AZURE_DOCUMENT_INTELLIGENCE_KEY` and `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` env vars are set | ❓ Unknown — Sameer to confirm |
| AZ-02 | Confirm `ARABIC_OCR_AZURE` config's `api_endpoint` and `api_version` fields are correct | ❓ Unknown — needs DB query |
| AZ-03 | Select 3 test Arabic documents and 3 test complex-layout PDFs already in the system | ❓ To be selected |
| AZ-04 | Run Azure OCR on test documents (flag ON temporarily in dev, not production) | Not done |
| AZ-05 | Compare Azure DI output vs existing GPT vision output for same documents | Not done |
| AZ-06 | Estimate cost per document (Azure DI pricing vs GPT-4.1 vision pricing) | Not calculated |
| AZ-07 | Confirm GPT vision fallback activates correctly when Azure DI fails | Not browser-tested |
| AZ-08 | Admin decision: enable for Arabic docs only, or as global primary path | Not decided |

### Cost estimate guidance

- GPT-4.1 vision: ~$0.01–0.04 per page depending on image size
- Azure Document Intelligence (prebuilt-read): ~$0.001–0.01 per page (varies by tier)
- For high-volume Arabic document intake, Azure DI could be significantly cheaper

### Decision: Do not enable Azure OCR during this stabilization pass.

Enable only after AZ-01 through AZ-08 are completed, reviewed by Sameer, and a separate UAT prompt is executed.

---

## 12. Common AI Activation Readiness Plan

### 12.1 — Feature readiness table

| Common AI Feature | Current Status | Live Data | UI Route | Admin Trigger | Recommended Action | Risk |
|---|---|---|---|---|---|---|
| **Field Suggestions** (COMMON AI.1) | ✅ Backend (15 handlers, Company+Party) | 0 suggestions | Party record: "Field Suggestions" panel | None run yet | Run scan on 2–3 pilot Party records via admin action; review output | Low |
| **Duplicate Detection** (COMMON AI.3) | ✅ Backend | 1 candidate | `/admin/ai/duplicates` | Scan action exists | Verify UI loads + 1 candidate visible; run scan on all parties | Low |
| **Compliance Checker** (COMMON AI.4) | ✅ Backend | 31 findings | `/admin/ai/compliance` | Scan action exists | Verify UI loads + 31 findings visible | Low |
| **Risk Scoring** (COMMON AI.5) | ✅ Backend | **0 scores** | `/admin/ai/risk` | Admin trigger (not yet run) | Run risk score scan on 3–5 Party records; verify score appears | Low-Med |
| **AI Search Across ERP** (COMMON AI.6) | ✅ Backend | Active | Global search or `/admin/search` | N/A | Navigate to search route; verify intent extraction works | Low |
| **ERP AI Assistant** (COMMON AI.7) | ✅ Backend | 1 session, 4 messages | Assistant chat component | N/A | Open assistant; verify session loads; send test read-only query | Low |
| **Daily Dashboard** (COMMON AI.13) | ✅ Backend | Active | `/admin/ai/dashboard` | Summary collectors | Navigate to dashboard; verify data loads | Low |
| **Audit Explainer** (COMMON AI.14) | ✅ Backend | Active | `/admin/ai/audit-explainer` | Per-entry trigger | Open an audit entry; verify explainer generates | Low |
| **Data Quality Monitor** (COMMON AI.15) | ✅ Backend | Unknown | `/admin/ai/data-quality` | Scan action | Navigate to data quality page; verify findings load | Low |

### 12.2 — HR AI hooks (HR.12)

**Flags:** 9 `ERP_AI_HR_*` flags — all `is_enabled=true`  
**Backend:** Tables seeded (`hr_compliance_findings`, `hr_risk_events`); server actions exist  
**UI:** Extent unclear  
**Risk:** Medium — HR data is sensitive  

**Planned action:** Do NOT trigger HR AI scans during this stabilization. Verify which UI routes exist for HR AI and document them. Do not enable any HR write-back or HR AI generation passes until explicitly approved by Sameer with a separate prompt.

### 12.3 — Recommended Common AI activation sequence

1. **Verify routes load** — Navigate to all `/admin/ai/*` routes in browser; document which load and which 404.
2. **Compliance** — Already 31 findings; just verify UI.
3. **Duplicates** — 1 candidate; verify UI; optionally run full scan.
4. **Risk scoring** — Run on 3–5 safe Party records (not HR, not payroll) and review output.
5. **Field suggestions** — Run on 2–3 Party records; review suggestions quality.
6. **Data quality** — Verify UI; run scan if route is accessible.
7. **Daily dashboard** — Verify it loads with real data.
8. **AI search** — Navigate to search; run a test query.
9. **Assistant** — Open chat; send a read-only test message.
10. **Audit explainer** — Open an audit log entry; trigger explanation.

---

## 13. AI Navigation / AI Center Clarity Plan

### Current state (documented — do not implement)

AI features are currently accessible through at least 4 different navigation areas:

| Area | Routes |
|---|---|
| DMS AI pipeline | `/dms/intake/`, `/dms/review-queue`, `/dms/documents/record/[id]` (AI tabs) |
| DMS admin AI | `/admin/dms/intelligence`, `/admin/dms/ai-observability` |
| Common AI | `/admin/ai/dashboard`, `/admin/ai/compliance`, `/admin/ai/duplicates`, `/admin/ai/risk`, `/admin/ai/data-quality`, `/admin/ai/audit-explainer` |
| AI settings | `/admin/settings/ai` (provider config, feature flags) |

There is no unified AI hub or landing page. Users who want to understand AI capabilities must know where to navigate.

### Proposed future AI Center structure (plan only — do not implement)

A future `/admin/ai` landing page should serve as the entry point to all AI capabilities:

```
/admin/ai
├── Overview / Daily Brief
│   └── AI daily summary across all ERP modules
├── DMS Intelligence
│   ├── Pipeline status (jobs, queue, coverage)
│   ├── OCR backfill
│   ├── Semantic index backfill
│   └── → /admin/dms/intelligence
├── AI Observability
│   ├── Token/cost breakdown
│   ├── Model performance
│   └── → /admin/dms/ai-observability
├── Document Review Queue
│   └── → /dms/review-queue
├── Compliance Findings
│   └── → /admin/ai/compliance
├── Duplicate Detection
│   └── → /admin/ai/duplicates
├── Risk Scoring
│   └── → /admin/ai/risk
├── Data Quality
│   └── → /admin/ai/data-quality
├── Field Suggestions
│   └── → /admin/ai/field-suggestions (or Party record panel)
├── AI Search
│   └── → global search
├── AI Assistant
│   └── → assistant chat component
├── Apply-to-ERP Status
│   └── Summary of apply runs, corrections, pending items
├── Apply Correction (Phase 17)
│   └── → document AI Analysis tab (per-document)
└── Settings
    └── → /admin/settings/ai
```

**What this requires (future implementation only):**
- A new `/admin/ai/page.tsx` landing page
- Navigation sidebar entry under "AI"
- Summary cards for each major area
- No new backend work — all data already exists

**This must not be implemented during stabilization.** Document the plan only.

---

## 14. AI Data and UAT Artifact Cleanup Plan

### 14.1 — Draft correction proposal (id=2)

**Data:** `dms_ai_erp_apply_correction_proposals.id=2`, `status='draft'`, `original_apply_item_id=2`, created during Phase 17 UAT first attempt  
**Risk:** Negligible — draft proposals are not processed  
**Action plan:** Call `cancelApplyCorrectionProposal(2, "Phase 17 UAT artifact — stabilization cleanup 2026-06-27")`  
**Via:** Document 53 → AI Analysis tab → Apply History → find proposal → Cancel; or admin console  
**Do not delete:** Table has no DELETE policy — correct behavior  

### 14.2 — party_licenses.id=2 remarks UAT value

**Data:** `party_licenses.id=2.remarks = "UAT Test Correction - Phase 17"`  
**Original value:** `"Verified – entity match: Taqa Al Mansoory"`  
**Action plan:** Edit via Party Master → Party Licenses tab → Edit license id=2 → Restore remarks field  
**Sameer must confirm:** What is the correct production value? The pre-UAT value `"Verified – entity match: Taqa Al Mansoory"` was itself a UAT note — Sameer should decide if it should be blank or a proper business value  
**Do not use SQL:** Prefer UI edit for audit trail  

### 14.3 — Test apply run and item (run id=6)

**Data:** `dms_ai_erp_apply_runs.id=6` with `source_type='correction_proposal'` — the apply run created during Phase 17 UAT confirmation  
**Risk:** None — this is a legitimate apply run entry and is part of the immutable audit trail  
**Action:** No cleanup needed. This is a valid historical record. Document it as a UAT apply run in the phase report.

### 14.4 — AI assistant test session (1 session, 4 messages)

**Data:** `erp_ai_assistant_sessions` (1 row), `erp_ai_assistant_messages` (4 rows)  
**Risk:** None — read-only session, no ERP mutations  
**Action:** No cleanup needed. Leave as-is. Useful as a verified working example.

### 14.5 — Local LLM failed test status

**Data:** `LOCAL_LLM_DEFAULT` provider config has `last_test_status='failed'`  
**Risk:** None  
**Action:** No cleanup needed. Confirm flag stays OFF. The failed status is an accurate record.

### 14.6 — Stale phase plan MDs at repo root

**Files:** `ERP_DMS_AI_PHASE_*_PLAN.md`, `ERP_DMS_AI_PHASE_*_UPGRADE_PLAN.md`, `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` etc. at repo root  
**Risk:** Low — may confuse future agents into treating completed plans as pending work  
**Action plan:** Move to `implementation_Review/plans/` OR add a `## STATUS: COMPLETED — CLOSED [Phase X LIVE PASS]` banner at the top of each  
**Do not delete:** Historical context

### 14.7 — Review queue items (6 open)

**Data:** 6 open items in `dms_review_queue`  
**Risk:** Low — these are real AI-generated items awaiting human review  
**Action:** Navigate to `/dms/review-queue` and process each item (review, resolve, or dismiss as appropriate). This is a regular operational task, not a cleanup.

---

## 15. Production Safety Checklist

Before enabling any new AI feature or flag:

- [ ] **AC-01**: `npm run build` passes with 0 errors
- [ ] **AC-02**: `npx tsc --noEmit` passes with 0 errors
- [ ] **AC-03**: `npx eslint src/` passes with 0 errors
- [ ] **AC-04**: `npx vitest run` passes with 0 failures
- [ ] **AC-05**: E2E_USER_PASSWORD is set and Playwright runs at least 1 spec successfully
- [ ] **AC-06**: `party_licenses.id=2 remarks` restored to correct production value (Sameer confirmed)
- [ ] **AC-07**: Draft correction proposal (id=2) cancelled or documented
- [ ] **AC-08**: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated with Phase 17 CLOSED status
- [ ] **AC-09**: Stale Phase 17 warnings removed from source-of-truth
- [ ] **AC-10**: Feature flag decisions for `DMS_AI_APPLY_CORRECTION_PROPOSALS` documented
- [ ] **AC-11**: All `/admin/ai/*` routes verified to load in browser
- [ ] **AC-12**: Risk scoring trigger run on safe entity sample; output reviewed
- [ ] **AC-13**: Field suggestion scan run on pilot Party; output reviewed
- [ ] **AC-14**: `WORKER_SECRET` env var confirmed set (for job queue processing)
- [ ] **AC-15**: All 11 primary AI tables confirmed RLS + FORCE RLS (already verified; re-confirm after any migration)
- [ ] **AC-16**: No raw AI content (prompts, OCR text, LLM responses) in `erp_ai_usage_logs.metadata_json` (redaction active)
- [ ] **AC-17**: No broad `USING(true)` or `WITH CHECK(true)` policies on AI tables
- [ ] **AC-18**: No `anon` role policies on AI tables
- [ ] **AC-19**: `OPENAI_API_KEY` env var confirmed present (without exposing value)
- [ ] **AC-20**: Job queue has no stuck jobs (status=`processing` with `claimed_at` > 1 hour ago)
- [ ] **AC-21**: No new server actions, migrations, UI, or feature flags added during stabilization

---

## 16. Recommended Activation Order

Execute in this sequence. Do not skip steps. Each step requires Sameer approval before proceeding.

| Step | Action | Preconditions | Risk |
|---|---|---|---|
| **1** | Stop dev server → run `npm run build` → document result | None | Low |
| **2** | Run `npx vitest run` → confirm 269/269 (or higher) pass | None | Low |
| **3** | Navigate to Party Master → edit `party_licenses.id=2` → confirm correct remarks value with Sameer | Sameer confirms correct value | Low |
| **4** | Cancel draft correction proposal (id=2) via UI or server action | None | Low |
| **5** | Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — Phase 17 closed, direction updated | Steps 1–4 complete | Low |
| **6** | Archive/banner stale `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | None | Low |
| **7** | Provide `E2E_USER_PASSWORD` → run Playwright spec → document result | Sameer provides password | Low |
| **8** | Verify all `/admin/ai/*` routes load in browser — document any 404s | Dev server running | Low |
| **9** | Sameer reviews and approves `DMS_AI_APPLY_CORRECTION_PROPOSALS` enablement | Steps 1–8 complete, Sameer review | Low |
| **10** | Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` via Admin AI Settings | Step 9 approved | Low |
| **11** | Verify correction UI appears on Document 53 → "Propose Correction" button visible | Step 10 done | Low |
| **12** | Run risk scoring on 3–5 safe Party records → review output | Steps 1–8 complete | Low-Med |
| **13** | Run field suggestion scan on 2–3 Party records → review output | Steps 1–8 complete | Low |
| **14** | Process 6 open review queue items via `/dms/review-queue` | None | Low |
| **15** | Plan Azure OCR test (AZ-01 through AZ-08) — separate prompt | Steps 1–8 complete | None (plan only) |

---

## 17. What Must Stay Disabled for Now

| Feature / Flag | Reason |
|---|---|
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | Full restore browser UAT not completed; keep OFF until PROPOSALS is stable |
| `DMS_OCR_AZURE` | Needs test doc, cost comparison, and AZ-01 through AZ-08 before enabling |
| `LOCAL_LLM` | Stub only; provider test failed; no production use case; keep OFF permanently |
| HR Apply-to-ERP (any write path) | Not built (Phase 8 is preview only); no implementation in stabilization scope |
| Bulk AI correction | Not built; no automatic or bulk correction path should be created |
| Automatic rollback / undo / revert AI writes | Explicitly forbidden by Phase 17 governance; never implement |
| AI auto-approval of ERP writes | Human confirmation is mandatory for all ERP writes; no auto-approval |
| Raw content logging | `safe-usage-redaction.ts` must remain active; never log raw prompts or OCR text |

---

## 18. What Must Not Be Implemented in This Stabilization

This is a hard boundary. If any of the following is tempting to implement, stop, and create a separate prompt with Sameer's approval.

| Forbidden Action |
|---|
| Phase 18 (any) — not defined, not started |
| Phase 16 Tier 3 — Party contacts + addresses write-back — not started |
| HR AI write-back — not started |
| New AI Center UI (`/admin/ai` landing page) — plan only |
| New server actions |
| New migrations |
| New feature flags |
| New UI components |
| Bulk AI correction engine |
| Automatic rollback or undo |
| AI auto-approval of any ERP write |
| Enabling LOCAL_LLM |
| Enabling Azure OCR without AZ-01–AZ-08 completed |
| Party Contacts / Party Addresses Apply-to-ERP |
| Any HR module changes |

---

## 19. Risks and Mitigations

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| `npm run build` fails due to Phase 17 changes | Medium | Low | TypeScript + tests are clean; most likely fine. Fix identified errors before any flag enables. |
| party_licenses.id=2 has wrong production value | Low | Low | Sameer reviews and confirms correct value before restore |
| Draft proposal (id=2) affects production behavior | Negligible | None | Draft proposals are never processed; no ERP write occurred |
| Risk scoring generates wrong scores on first run | Low | Low | Run on 3 test records only; review before broader rollout |
| Field suggestions quality is poor on first scan | Low | Medium | 15 handlers not field-tested; run on 2–3 records and review before exposing in UI |
| Common AI routes 404 | Low | Medium | Backend is built; UI routing may not be wired for all routes |
| Playwright E2E env var never provided | Low | Low | Document as technical debt; manual browser testing is acceptable substitute |
| Job queue has stuck jobs | Low | Low | Check `claimed_at` timestamp; jobs with old `claimed_at` may need status reset |
| Phase 17 flag enable breaks existing Apply-to-ERP UI | Negligible | None | Verified during Phase 17 UAT: correction UI does not break existing apply history UI |
| HR AI flags are ON but HR AI is unverified | Medium | Low | HR AI flags are seeded but not causing writes; verify routes before any HR AI trigger |

---

## 20. Acceptance Criteria for Future Stabilization Execution

An execution prompt must achieve all of the following before this stabilization is considered complete:

| ID | Acceptance Criterion |
|---|---|
| **AC-STAB-01** | `npm run build` passes or blocker is documented with root cause |
| **AC-STAB-02** | `npx tsc --noEmit`, `npx vitest run`, `npx eslint` all pass |
| **AC-STAB-03** | E2E readiness documented (`E2E_USER_PASSWORD` set or explicitly deferred by Sameer) |
| **AC-STAB-04** | Draft correction proposal (id=2) cancelled or formally documented with reason |
| **AC-STAB-05** | `party_licenses.id=2 remarks` restored to correct production value (Sameer confirmed) |
| **AC-STAB-06** | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated with Phase 17 CLOSED, direction updated |
| **AC-STAB-07** | Stale Phase 17 warnings removed from source-of-truth |
| **AC-STAB-08** | `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` archived/bannered as stale |
| **AC-STAB-09** | `DMS_AI_APPLY_CORRECTION_PROPOSALS` enablement decision documented (ON/OFF with reason) |
| **AC-STAB-10** | All `/admin/ai/*` routes navigated in browser; results documented (load / 404) |
| **AC-STAB-11** | Risk scoring trigger run on 3–5 safe entities; output reviewed by Sameer |
| **AC-STAB-12** | Field suggestion scan run on 2–3 Party records; output reviewed by Sameer |
| **AC-STAB-13** | Azure OCR test plan (AZ-01 through AZ-08) documented |
| **AC-STAB-14** | No new server actions, migrations, UI, flags, or feature implementations performed |
| **AC-STAB-15** | Implementation report `ERP_AI_STABILIZATION_AND_ACTIVATION_EXECUTION_REPORT.md` created |

---

## 21. Recommended Next Cursor Prompt

After Sameer reviews and approves this plan, the next Cursor prompt should be:

```
ERP_AI_STABILIZATION_AND_ACTIVATION_EXECUTION_PROMPT.md
```

**This execution prompt should:**
1. Reference this plan (`ERP_AI_STABILIZATION_AND_ACTIVATION_PLAN.md`) as its input
2. Execute P0 items first (build, cleanup, restore)
3. Execute P1 items in order (SOT update, route verification, risk scoring trigger, field suggestions)
4. Document each AC-STAB-* acceptance criterion with PASS / FAIL
5. Create `implementation_Review/ERP_AI_STABILIZATION_AND_ACTIVATION_EXECUTION_REPORT.md` upon completion
6. NOT implement any new features, flags, migrations, or UI

**Important:** This execution prompt must only be used after Sameer explicitly reviews and approves this plan. It must not be sent to a Cursor agent without that review step.

---

## 22. Final Recommendation

### Do stabilization first

The AI system has 17 closed phases of deeply implemented capabilities. Many of those capabilities are not yet producing live data (risk scoring, field suggestions) or are behind flags that have not been enabled for production (correction proposals, Azure OCR). Adding more phases on top of this would increase technical debt and make the system harder to reason about.

### Do not start Phase 18 yet

Phase 18 has not been defined. There is no agreed scope, prompt, or planning document for Phase 18. Starting Phase 18 before stabilization is complete would be premature and risky.

**After stabilization, the clearest next functional steps are (in order of readiness):**

1. **Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS`** — Built, UAT closed, safety verified. Lowest-risk next activation.
2. **Risk scoring and field suggestions activation** — Backend fully built, never run at scale. High value, low risk.
3. **Azure OCR enablement** — Requires AZ-01 through AZ-08 test plan. Medium complexity, significant OCR quality improvement for Arabic documents.
4. **Phase 16 Tier 3 (Party contacts + addresses write-back)** — Planned but not started. Requires a full planning prompt and Sameer approval.
5. **AI Center navigation hub** — Plan is documented here. Low risk but requires new UI work.
6. **HR AI** — Flags seeded, backend partially wired. Requires a separate HR AI planning session. Do not trigger any HR AI passes until explicitly approved.

### One-sentence summary

> Stabilize first, activate what is already built, then decide what comes next — in that order.

---

*Plan created: 2026-06-27 | No source code, schema, migration, UI, or data changes were made.*
