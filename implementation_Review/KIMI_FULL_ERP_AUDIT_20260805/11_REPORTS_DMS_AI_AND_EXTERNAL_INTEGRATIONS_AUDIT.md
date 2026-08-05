# 11 — Reports, DMS, AI and External Integrations Audit

Audit date: 2026-08-05 · Cross-consolidates Phases 2/4/6/7/8 evidence for these subsystems.

## 1. Report Center & official documents (Confirmed)

- **Runner** (`lib/report-center/report-runner.ts`): registry-driven; permission filter per report; branding resolution with multi-company manual-template fallback; run logs (running/failed) with duration; **redaction engine** with sensitive profiles; clean controlled errors for missing fetchers. Mature design ✅.
- **30 fetchers implemented**: 1 admin + 12 HR core + 6 HR "important" + 11 HR letters/forms (`report-fetchers.ts:82-120`). **4 active registry reports without fetchers** (HR-001).
- **Official documents**: code-based templates (Template Studio retired), Gotenberg HTML→PDF with error classification (`html-adapter.ts`), issuance engine with lifecycle tests (459-test suite covers issuance/status/allowlists), QR + public `/verify/[token]` (fails closed on invalid token — live probe ✅).
- **Schedules**: DB schedules + worker endpoint; flags `OUTPUT_SCHEDULES_*` — runtime cadence Needs verification.
- Gaps: HR-001 stubs; report fetchers all HR/admin — no DMS/party/finance reports registered; template governance screens exist (governance route) — workflow Needs verification.

## 2. DMS pipeline (Confirmed — deepest module)

- **55 server-action files** covering: upload sessions, batch intake, OCR (Azure DI adapter), AI understanding/classification (`prompt-builders.ts` — UAE/Arabic-specialized), orchestration pipelines, review queue, apply-to-ERP with target registry (80-test file ✅), apply-correction with conflict detection, entity matching + link suggester, semantic + embedding search (`search_dms_documents_by_embedding` RPCs live), metadata definitions/suggestions, approvals, renewals, retention, expiry reminders (email bridge), notifications, QA, observability, temp/session cleanup.
- **File access**: permissioned proxy with preview/download split + confidentiality check ✅ (doc 06).
- **Storage**: 4 private buckets ✅.
- Findings: SEC-008 (no prompt-injection framing); `expiry-reminders.ts:903` type bug (doc 09); `claim_dms_ai_jobs` anon-grant Needs verification (doc 05 §3b); intake/poll API auth pattern spot-verified only.

## 3. AI platform (Confirmed)

- Common AI settings (providers, model cost rates, per-purpose routing: general/chat/ocr/classification/extraction), AI dashboard, audit explainer, data-quality, duplicates, compliance, risk — all permission-gated admin screens.
- Observability: usage logs + cost rates tables live; `log-dms-ai-usage` tested ✅.
- PII flow: documents (identity, salary certs) are sent to OpenAI with full content (system prompt demands full transcription incl. MRZ) — **raw PII to external provider by design**; no redaction-before-send found. PRIV-001 (Medium — confirm DPA/provider config; consider regional endpoints).
- Human review enforced before apply-to-ERP (review queue) ✅; AI cannot mutate ERP records directly in reviewed flows.

## 4. External integrations (Confirmed)

| Service | Config | Failure behavior |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` env; provider abstraction (`factory.ts`, adapters) | Structured error classes; job retry via claim/recover |
| Azure Document Intelligence | env key; adapter + OCR lib | deferred-provider enum honest |
| Gotenberg | `GOTENBERG_URL` + timeout env | `classifyGotenbergError` — classified failures ✅ |
| Microsoft Graph | **DB-stored provider config + vault `secret_ref`** (good) | queue + backoff ✅ |
| Supabase Realtime | flag `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` + provider + hooks | publication status Needs verification |

## 5. Integration risks (register cross-refs)
SEC-008 prompt injection · PRIV-001 PII to OpenAI · SEC-007 console email logging · DB-004 stale generated types break typed RPC/table usage · OPS-002 env-example drift (Microsoft mail vars) · Needs verification: Gotenberg/DI availability in deployment (envs present locally only).
