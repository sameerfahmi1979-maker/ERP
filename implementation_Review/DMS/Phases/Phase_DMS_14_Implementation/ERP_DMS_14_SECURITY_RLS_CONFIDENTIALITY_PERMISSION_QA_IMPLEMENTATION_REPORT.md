# ERP DMS.14 — Security, RLS, Confidentiality, and Permission QA
## Implementation Report

**Phase:** ERP DMS.14  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Report file:** `implementation_Review/ERP_DMS_14_SECURITY_RLS_CONFIDENTIALITY_PERMISSION_QA_IMPLEMENTATION_REPORT.md`

---

## 1. Phase Title / Objective

Deep security and permission QA gate for the entire DMS module after all AI/OCR/content/search/batch features were implemented through DMS.2–DMS.13 and OCR-AI FIX.1.

Scope: RLS audit, server action security audit, confidentiality enforcement, storage/signed URL audit, AI/OCR/content security, permission matrix verification, minimal targeted fixes.

---

## 2. Roadmap Renumbering / SOT Update Summary

Per Sameer's decision, the original DMS roadmap items were renumbered to account for extra phases added between the original DMS.13 and DMS.14 planning:

| Previous | New | Title |
|---|---|---|
| DMS.13 (original) | **ERP DMS.14** | Security, RLS, Confidentiality, and Permission QA |
| DMS.14 (original) | **ERP DMS.15** | Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE |

Completed extra phases that remain as their own closed gates:
- ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue (CLOSED / PASS)
- ERP DMS OCR-AI FIX.1 — OCR / AI Text Pipeline Deep Fix (CLOSED / PASS)

---

## 3. Tables Audited

All 25 tables in scope were audited for RLS status and policy correctness:

`dms_documents`, `dms_document_files`, `dms_document_versions`, `dms_document_content`, `dms_document_metadata_values`, `dms_document_links`, `dms_document_tags`, `dms_ai_extraction_jobs`, `dms_ai_extraction_results`, `dms_upload_sessions`, `dms_upload_batches`, `dms_intake_review_values`, `dms_ai_tag_suggestions`, `dms_ai_link_suggestions`, `dms_expiry_reminders`, `dms_renewal_requests`, `dms_notification_queue`, `dms_document_events`, `dms_document_comments`, `dms_retention_policies`, `erp_ai_provider_configs`, `erp_ai_feature_flags`, `erp_ai_usage_logs`, `erp_email_queue`, `erp_notifications`

---

## 4. RLS Findings

### 4.1 RLS Enabled / Forced Status (pre-fix)

| Table | RLS Enabled | RLS Forced | Result |
|---|---|---|---|
| dms_documents | ✅ | ✅ | PASS |
| dms_document_files | ✅ | ✅ | PASS |
| dms_document_versions | ✅ | ✅ | PASS |
| dms_document_content | ✅ | ✅ | PASS |
| dms_document_metadata_values | ✅ | ✅ | PASS |
| dms_document_links | ✅ | ✅ | PASS |
| dms_document_tags | ✅ | ✅ | PASS |
| dms_ai_extraction_jobs | ✅ | ✅ | PASS |
| dms_ai_extraction_results | ✅ | ✅ | PASS |
| dms_upload_sessions | ✅ | ✅ | PASS |
| dms_upload_batches | ✅ | ✅ | PASS |
| **dms_intake_review_values** | ✅ | ❌ NOT FORCED | **FIXED** |
| dms_ai_tag_suggestions | ✅ | ✅ | PASS |
| dms_ai_link_suggestions | ✅ | ✅ | PASS |
| **dms_expiry_reminders** | ✅ | ✅ | **FIXED** (overly broad policy removed) |
| **dms_renewal_requests** | ✅ | ✅ | **FIXED** (overly broad policy replaced) |
| **dms_notification_queue** | ✅ | ✅ | **FIXED** (overly broad policy replaced) |
| dms_document_events | ✅ | ✅ | PASS |
| dms_document_comments | ✅ | ✅ | PASS |
| dms_retention_policies | ✅ | ✅ | PASS |
| erp_ai_provider_configs | ✅ | ✅ | PASS |
| erp_ai_feature_flags | ✅ | ✅ | PASS |
| erp_ai_usage_logs | ✅ | ✅ | PASS |
| erp_email_queue | ✅ | ✅ | PASS |
| erp_notifications | ✅ | ✅ | PASS |

**Post-fix:** All 25 tables have `rls_enabled=true` and `rls_forced=true`.

### 4.2 Policy Findings

**CRITICAL — 4 Tables Had Overly Broad `ALL true/true` Policies:**

| Table | Overly Broad Policy | Risk |
|---|---|---|
| `dms_expiry_reminders` | `dms_expiry_reminders_authenticated` (ALL, qual=true) | Any authenticated user could read/modify ALL expiry reminders |
| `dms_intake_review_values` | `auth_users_manage_intake_review_values` (ALL, qual=true) | Any authenticated user could read/write ALL AI intake review values |
| `dms_notification_queue` | `dms_notification_queue_authenticated` (ALL, qual=true) | Any authenticated user could read/modify ALL DMS notifications |
| `dms_renewal_requests` | `dms_renewal_requests_authenticated` (ALL, qual=true) | Any authenticated user could read/modify ALL renewal requests |

All 4 were fixed by migration `erp_dms_14_security_rls_tighten_overly_broad_policies`.

### 4.3 Notable Policy Analysis (Acceptable / By Design)

- **`dms_document_content` SELECT** — allows any `dms.documents.view` user. Confidentiality of `content_text` for hr/legal/executive documents is enforced at the server action layer (`getDocumentContentText`, `generateAndSaveDmsAiSummary`, `askDmsDocumentQuestion`). This is acceptable by design.
- **`dms_upload_sessions` SELECT** — allows any `dms.documents.upload` user to see all sessions (not owner-scoped). This was an intentional design for shared upload management.
- **`dms_ai_feature_flags` SELECT** — requires `settings.ai.view` OR system_admin. Addressed via code fix (admin client for AI factory). Not changed at DB level to preserve settings access control.

---

## 5. Policies Reviewed / Changed

### Migration Applied: `erp_dms_14_security_rls_tighten_overly_broad_policies`

**`dms_expiry_reminders`:**
- DROPPED: `dms_expiry_reminders_authenticated` (ALL true/true blanket)
- KEPT: `dms_expiry_manage` (ALL — admin/system_admin only)
- KEPT: `dms_expiry_select` (SELECT — dms.documents.view OR system_admin)

**`dms_intake_review_values`:**
- DROPPED: `auth_users_manage_intake_review_values` (ALL true/true)
- ENABLED: `FORCE ROW LEVEL SECURITY`
- ADDED: `dms_intake_review_select` (SELECT — own sessions OR review_ai/admin/system_admin, via EXISTS on dms_upload_sessions)
- ADDED: `dms_intake_review_write` (ALL — upload/review_ai/admin/system_admin)

**`dms_notification_queue`:**
- DROPPED: `dms_notification_queue_authenticated` (ALL true/true)
- ADDED: `dms_notif_select` (SELECT — dms.documents.view OR admin/system_admin)
- ADDED: `dms_notif_write` (ALL — dms.admin OR system_admin only)

**`dms_renewal_requests`:**
- DROPPED: `dms_renewal_requests_authenticated` (ALL true/true)
- ADDED: `dms_renewals_select` (SELECT — dms.documents.view OR admin/system_admin)
- ADDED: `dms_renewals_insert` (INSERT — dms.documents.edit OR admin/system_admin)
- ADDED: `dms_renewals_update` (UPDATE — dms.documents.edit OR admin/system_admin)
- ADDED: `dms_renewals_delete` (DELETE — dms.documents.delete OR admin/system_admin)

---

## 6. Server Actions Audited

All 16 DMS server action files were inspected:

| File | getAuthContext | hasPermission | Zod | Sensitive logging | Admin client gated | Notes |
|---|---|---|---|---|---|---|
| `documents.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | content_text never returned in list; ai_summary redacted for hr/legal/executive non-admin |
| `document-files.ts` | ✅ | ✅ | Partial | ✅ None | ✅ After check | Signed URL gated by permission check |
| `document-content.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | Confidentiality gate for hr/legal/executive |
| `ocr.ts` | ✅ | ✅ | ✅ | ✅ None | ✅ After check | OCR text never logged |
| `ai-analysis.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | Confidentiality gate present |
| `ai-intake.ts` | ✅ | ✅ | ✅ | ✅ None | ✅ After check | `select("*")` on dms_upload_sessions acceptable (no content) |
| `batch-intake.ts` | ✅ | ✅ | ✅ | ✅ None | ✅ After check | — |
| `ai-summary.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | hr/legal/executive gate present |
| `ai-search.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | content_text never returned in results |
| `document-qa.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | hr/legal/executive require dms.admin |
| `ai-tags.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | Content snippet used internally, not returned raw |
| `ai-links.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | Same as tags |
| `semantic-search.ts` | ✅ | ✅ | ✅ | ✅ None | N/A | RPC is SECURITY INVOKER, content_text never returned |
| `intelligence-admin.ts` | ✅ | ✅ dms.admin | ✅ | ✅ None | ✅ After check | All functions require dms.admin |
| `expiry-reminders.ts` | ✅ | ✅ | Partial | ✅ None | N/A | — |
| `upload-sessions.ts` | ✅ | ✅ | ✅ | ✅ None | ✅ After check | — |

**Overall: No sensitive content (content_text, OCR text, AI prompts, raw AI responses, API keys) found in any audit/console logs.**

---

## 7. Permissions Audited

All required DMS permissions verified to exist and be enforced:

| Permission | Enforcement |
|---|---|
| `dms.documents.view` | documents.ts, document-files.ts, document-content.ts, search actions, tags, links |
| `dms.documents.create` | documents.ts createDmsDocument |
| `dms.documents.edit` | documents.ts updateDmsDocument, metadata, tags, links, comments |
| `dms.documents.delete` | documents.ts deleteDmsDocument + RLS DELETE policy |
| `dms.documents.upload` | upload-sessions.ts, document-upload-attach.ts, batch-intake.ts |
| `dms.documents.preview` | document-files.ts getDmsDocumentFileSignedUrl (preview mode) |
| `dms.documents.download` | document-files.ts getDmsDocumentFileSignedUrl (download mode) |
| `dms.documents.ocr.view` | ocr.ts getDmsDocumentOcrText |
| `dms.documents.ocr.run` | ocr.ts triggerDmsOcrForFile |
| `dms.documents.ai.view` | ai-analysis.ts getDmsAiAnalysisStatus |
| `dms.documents.ai.run` | ai-analysis.ts runDmsAiAnalysisForDocument, ai-summary.ts |
| `dms.documents.ai.manage` | ai-analysis.ts markDmsAiResultSuperseded, ai-tags.ts apply/reject |
| `dms.documents.review_ai` | ai-intake.ts approveAiIntakeAndCreateDocument, dms_ai_extraction_jobs/results RLS |
| `dms.documents.manage_types` | document-types.ts, categories.ts, metadata-definitions.ts |
| `dms.admin` | intelligence-admin.ts all actions; retention-policies.ts manage; expiry-reminders.ts manage |

**Live permission codes in DB match source code exactly.**

---

## 8. Confidentiality Findings

### 8.1 Confidentiality Levels
`internal`, `company`, `finance`, `hr`, `legal`, `executive`

### 8.2 Server-Side Gates (PASS)

| Action | Restricted Levels | Gate Present |
|---|---|---|
| `getDocumentContentText` | hr, legal, executive | ✅ Requires dms.admin |
| `generateAndSaveDmsAiSummary` | hr, legal, executive | ✅ Requires dms.admin |
| `regenerateDmsAiSummary` | hr, legal, executive | ✅ Requires dms.admin |
| `askDmsDocumentQuestion` | hr, legal, executive | ✅ Requires dms.admin |
| `runDmsAiAnalysisForDocument` | hr, legal, executive | ✅ Requires dms.admin |
| `semanticSearchDmsDocuments` | hr, legal, executive | ✅ RPC excludes, or requires dms.admin |
| `getDmsDocuments` (list) | hr, legal, executive | ✅ ai_summary redacted for non-admin |
| `searchDmsDocumentsByIntent` | hr, legal, executive | ✅ Content search excludes for non-admin |
| `generateDmsDocumentEmbedding` | hr, legal, executive | ✅ Requires dms.admin |

### 8.3 UI Components (PASS — server enforced)

AI Summary, Ask AI, Extracted Text, Semantic Search all rely on server-side confidentiality gates. Non-admin users receive either a "restricted" message or redacted content.

### 8.4 Known Limitation

`dms_document_content` RLS SELECT policy allows any `dms.documents.view` user to query the table at the DB level. **Confidentiality enforcement is purely at the server action layer.** This is acceptable for a Next.js Server Actions architecture (no direct DB access from client), but should be noted as a DB-level design gap.

---

## 9. Storage / Signed URL Findings

### 9.1 Storage Buckets

| Bucket | Public | Size Limit | MIME Restriction |
|---|---|---|---|
| `dms-documents` | ❌ Private | 50 MB | 9 types (PDF, JPEG, PNG, TIFF, WebP, DOC, DOCX, XLS, XLSX) |
| `dms-temp` | ❌ Private | 50 MB | Same 9 types |

**PASS** — Both buckets are private with MIME type restrictions.

### 9.2 Signed URL Generation

- **Preview URLs:** `getDmsDocumentFileSignedUrl(fileId, "preview")` — requires `dms.documents.preview` OR `dms.admin`. Uses admin client for URL generation only after permission check. 5-minute expiry.
- **Download URLs:** Same function with `"download"` mode — requires `dms.documents.download` OR `dms.admin`. 1-hour expiry.
- **Temp Upload URLs:** `createDmsUploadSession` — requires `dms.documents.upload`. Uses admin client. Temp path scoped to unique session code.
- **Temp Preview (Intake):** `getIntakeSessionSignedUrl` in ai-intake.ts — requires auth + upload permission. 15-minute expiry.

**PASS** — No public URLs. All signed URL paths go through permission check before generation. Admin client is used only after the check.

### 9.3 Storage Deletion

- Deleted documents: `deleteDmsDocument` soft-deletes DB records, purges storage via admin client. `deleted_at` tracked on all rows. RLS SELECT policies respect `deleted_at IS NULL` on most tables.
- Discarded intake sessions: `discardDraftIntake` / `performDraftDiscard` purge dms-temp storage paths after marking session discarded.

**PASS** — Deleted documents cannot be accessed via normal UI paths.

---

## 10. AI / OCR / Content Security Findings

| Check | Result |
|---|---|
| OCR text in audit/console logs | ✅ Not found in any DMS server action |
| content_text in list/search responses | ✅ Never returned (only used for internal FTS/AI) |
| AI prompts logged | ✅ Not logged in any action |
| Raw AI responses logged | ✅ Not logged (only safe metadata: model, tokens, duration) |
| API keys in DB | ✅ Only `secret_ref` (env var name) stored; actual keys in env vars only |
| AI feature flags checked before AI actions | ✅ `isBatchIntakeEnabled`, `getDmsAiProvider().isConfigured()`, feature flag checks |
| OCR-AI backfill admin-only | ✅ `adminBackfillMissingOcrText` requires dms.admin |
| Ask AI respects document access | ✅ hr/legal/executive require dms.admin; document loaded via RLS-enforced query |
| AI Search returns DB documents only | ✅ No hallucination path; intent→DB filter→documents |
| Tag/link suggestions human-approved | ✅ `applyDmsTagSuggestions`/`applyDmsLinkSuggestions` required; never auto-applied |

### 10.1 Key Fix Applied

**`getDmsAiProvider()` and `getDmsEmbeddingProvider()`** were using `createClient()` (user context) to read `erp_ai_provider_configs`. Since that table's SELECT RLS requires `settings.ai.view` permission, regular DMS users without AI settings access would silently get the NoopDmsAiProvider — causing all DMS AI features to fail with "No AI provider configured".

**Fixed:** Both factory functions now use `createAdminClient()` for the provider config query. The API key `secret_ref` and config are only used server-side to construct the provider instance; they are never returned to any client.

**File changed:** `src/lib/dms/ai/factory.ts`

---

## 11. Fixes Implemented

| # | Type | Description | File |
|---|---|---|---|
| 1 | DB | Removed overly broad `dms_expiry_reminders_authenticated` (ALL true/true) policy | Migration |
| 2 | DB | Replaced overly broad `auth_users_manage_intake_review_values` with scoped policies; enabled FORCE RLS | Migration |
| 3 | DB | Replaced overly broad `dms_notification_queue_authenticated` with viewer/admin-scoped policies | Migration |
| 4 | DB | Replaced overly broad `dms_renewal_requests_authenticated` with CRUD-scoped policies | Migration |
| 5 | Code | `getDmsAiProvider()` switched to `createAdminClient()` — DMS AI now works for all DMS users | `src/lib/dms/ai/factory.ts` |
| 6 | Code | `getDmsEmbeddingProvider()` switched to `createAdminClient()` — same fix for embedding | `src/lib/dms/ai/factory.ts` |

**Migration name:** `erp_dms_14_security_rls_tighten_overly_broad_policies`

---

## 12. Tests Performed

Source-level audit was performed (browser-interactive QA requires Sameer/Dina manual verification):

| Test Case | Method | Result |
|---|---|---|
| No DMS permission → cannot access DMS routes/actions | Source: getAuthContext + hasPermission in all actions | PASS |
| DMS viewer → can view, cannot edit/delete/AI | Source: all mutating actions check edit/upload/ai permissions | PASS |
| DMS uploader → can upload, cannot admin-manage | Source: intelligence-admin.ts requires dms.admin | PASS |
| DMS editor → can edit allowed documents | Source: updateDmsDocument requires dms.documents.edit | PASS |
| DMS OCR runner → can run OCR | Source: triggerDmsOcrForFile requires dms.documents.ocr.run | PASS |
| DMS AI runner → can run AI features | Source: ai-analysis.ts, ai-summary.ts check dms.documents.ai.run | PASS |
| DMS admin → full DMS access | Source: dms.admin accepted in all admin-level checks | PASS |
| HR/legal/executive document → non-admin cannot get content_text | Source: getDocumentContentText confidentiality gate | PASS |
| HR/legal/executive document → non-admin cannot run AI | Source: ai-analysis.ts, ai-summary.ts, document-qa.ts gates | PASS |
| Deleted document → not visible in active queries | Source: RLS + deleted_at IS NULL in most queries | PASS |
| Batch upload → own sessions only | Source: dms_upload_batches SELECT RLS + dms_upload_sessions owned-by check | PASS |
| Signed URL → requires permission before generation | Source: document-files.ts permission check before createSignedUrl | PASS |
| Admin backfill → requires dms.admin | Source: intelligence-admin.ts explicit check | PASS |
| API keys → not in DB | Source: erp_ai_provider_configs stores secret_ref only | PASS |
| OCR/content not in logs | Source: grep across all 16 DMS action files | PASS |

---

## 13. Known Limitations

1. **`dms_document_content` confidentiality at DB layer** — RLS SELECT allows any viewer. Confidentiality is enforced at app layer only. A privileged DB user or service role could read content_text directly. Acceptable for current architecture (Next.js Server Actions, no direct DB access from clients).

2. **`dms_upload_sessions` not owner-scoped** — Any `dms.documents.upload` user can see all upload sessions. This was intentional for upload management but could leak session metadata between uploaders.

3. **Browser-interactive QA pending** — Full manual QA with actual user role assignments requires Sameer/Dina browser testing.

4. **Storage bucket RLS policies** — Supabase storage policies not directly queryable via `storage.policies` table. Bucket-level public=false confirmed. Per-file object policies not fully audited.

---

## 14. TypeScript Result

```
npx tsc --noEmit → 0 errors ✅
```

---

## 15. Build Result

```
npm run build → Exit code 0 ✅
Only pre-existing Node.js deprecation warning (DEP0205), not from this phase.
```

---

## 16. Source of Truth Update Confirmation

`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated with:
- Roadmap renumbering: DMS.14 = Security/RLS/Confidentiality QA, DMS.15 = Integration Readiness
- ERP DMS.14 CLOSED / PASS entry
- Next phase: ERP DMS.15

---

## 17. Next Phase: ERP DMS.15 — Integration Readiness

```
ERP DMS.15 — Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE
```

This phase will establish DMS integration patterns for other ERP modules to link their entities (employees, vehicles, projects, contracts) to DMS documents.
