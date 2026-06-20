# ERP SETTINGS.1 — AI Settings Provider Configuration
## Implementation Report

**Phase:** ERP SETTINGS.1  
**Date:** 2026-06-14  
**Status:** CLOSED / PASS ✅  
**Reporter:** Cursor (automated)  
**Next Phase:** ERP DMS.2 — Database Foundation, RLS, Numbering, Storage Buckets

---

## 1. Executive Summary

ERP SETTINGS.1 delivers the ERP-wide AI settings foundation required before DMS AI/OCR phases (DMS.9+).
Sameer can now navigate to **Admin → AI Settings** and configure OpenAI provider credentials, view feature flag status, and test connections — all with zero API keys stored in the database.

Key achievements:
- 3 new database tables with RLS enforced
- 6 pre-seeded provider configurations (all disabled)
- 7 AI feature flags (all disabled)
- 5 SETTINGS permissions
- Secure key handling: only env var name + masked preview stored in DB
- Provider abstraction factory (`src/lib/ai/providers/factory.ts`) ready for DMS AI phases
- Full Settings UI at `/admin/settings/ai`
- All rule `.mdc` files consolidated under `.cursor/rules/`
- TypeScript: **PASS** (0 errors) | ESLint: **PASS** (0 errors, 0 warnings in new files)

---

## 2. Rule File Placement Audit

### Before SETTINGS.1

| File | Location | Status |
|---|---|---|
| `erp-dms-standard.mdc` | `implementation_Review/Phase_DMS_1_Planning/erp-dms-standard.mdc` | Outside `.cursor/rules/` |
| All other `.mdc` files | `.cursor/rules/` | Correct |

### After SETTINGS.1

| File | Final Location | Action |
|---|---|---|
| `erp-dms-standard.mdc` | `.cursor/rules/erp-dms-standard.mdc` | Copied from planning folder |
| `erp-ai-settings-standard.mdc` | `.cursor/rules/erp-ai-settings-standard.mdc` | Created new |
| `algt-erp-source-of-truth.mdc` | `.cursor/rules/algt-erp-source-of-truth.mdc` | Updated — added AI Settings reference |
| `erp-bank-master-standard.mdc` | `.cursor/rules/erp-bank-master-standard.mdc` | Already correct |
| `erp-child-dialog-form-standard.mdc` | `.cursor/rules/erp-child-dialog-form-standard.mdc` | Already correct |
| `erp-workspace-tabs-standard.mdc` | `.cursor/rules/erp-workspace-tabs-standard.mdc` | Already correct |
| `erp-record-workspace-form-standard.mdc` | `.cursor/rules/erp-record-workspace-form-standard.mdc` | Already correct |
| `erp-workspace-unsaved-form-draft-standard.mdc` | `.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc` | Already correct |
| `erp-party-master-standard.mdc` | `.cursor/rules/erp-party-master-standard.mdc` | Already correct |
| `erp-combobox-standard.mdc` | `.cursor/rules/erp-combobox-standard.mdc` | Already correct |
| `erp-drawer-child-dialog-blocking.mdc` | `.cursor/rules/erp-drawer-child-dialog-blocking.mdc` | Already correct |

**Note:** The original `implementation_Review/Phase_DMS_1_Planning/erp-dms-standard.mdc` is retained as-is (kept as planning archive; not deleted, as it doesn't impact Cursor rule loading from `.cursor/rules/`).

---

## 3. Migration File Created

**File:** `supabase/migrations/20260614191500_erp_settings_1_ai_settings_provider_configuration.sql`  
**Applied:** ✅ Applied to `mmiefuieduzdiiwnqpie.supabase.co` via `user-supabase` MCP

---

## 4. Tables Created

### `erp_ai_provider_configs`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT IDENTITY PK | |
| `config_code` | TEXT UNIQUE | e.g. DEFAULT_CHAT, DEFAULT_DMS_OCR |
| `provider_type` | TEXT | openai, azure_openai, tesseract, local_ollama, etc. |
| `provider_name` | TEXT | Display name |
| `api_endpoint` | TEXT NULL | For Azure/local providers only |
| `model_id` | TEXT NULL | e.g. gpt-4o |
| `api_version` | TEXT NULL | Azure API version |
| `purpose` | TEXT | general, chat, ocr, classification, extraction, embedding, dms, assistant |
| `is_default` | BOOLEAN | Unique per purpose |
| `is_enabled` | BOOLEAN | All seeded as false |
| `is_active` | BOOLEAN | Soft-delete support |
| `requires_human_review` | BOOLEAN | Default true |
| `confidence_threshold` | NUMERIC(4,3) | Default 0.850 |
| `config_json` | JSONB NULL | Non-sensitive config only |
| `secret_ref` | TEXT NULL | Env var NAME only (e.g. OPENAI_API_KEY) — **NEVER the value** |
| `masked_secret_preview` | TEXT NULL | e.g. sk-****abcd — display only |
| `last_test_status` | TEXT NULL | not_tested, success, failed |
| `last_test_at` | TIMESTAMPTZ NULL | |
| `last_test_message` | TEXT NULL | |
| `notes` | TEXT NULL | |
| `created_by/updated_by` | BIGINT FKs | To user_profiles |
| `deleted_at` | TIMESTAMPTZ NULL | Soft delete |

### `erp_ai_usage_logs`

Append-only log of AI operations (test connections, future OCR, extraction). No sensitive content.

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT IDENTITY PK | |
| `provider_config_id` | BIGINT FK NULL | To erp_ai_provider_configs |
| `feature_area` | TEXT | settings_test, dms, etc. |
| `operation_type` | TEXT | test_connection, ocr, extract, etc. |
| `status` | TEXT | success, failed, skipped |
| `input/output_token_count` | INT NULL | For cost tracking |
| `estimated_cost` | NUMERIC(12,6) NULL | |
| `duration_ms` | INT NULL | |
| `error_message` | TEXT NULL | |
| `metadata_json` | JSONB NULL | Non-sensitive only |

### `erp_ai_feature_flags`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT IDENTITY PK | |
| `feature_code` | TEXT UNIQUE | e.g. DMS_OCR |
| `feature_name` | TEXT | |
| `is_enabled` | BOOLEAN | Default false |
| `requires_human_review` | BOOLEAN | Default true |
| `min_confidence_threshold` | NUMERIC(4,3) | Default 0.850 |

---

## 5. RLS Policies Created

| Table | Policy | Condition |
|---|---|---|
| `erp_ai_provider_configs` | SELECT | `settings.ai.view` OR `system_admin` |
| `erp_ai_provider_configs` | INSERT | `settings.ai.manage` OR `system_admin` |
| `erp_ai_provider_configs` | UPDATE | `settings.ai.manage` OR `system_admin` |
| `erp_ai_provider_configs` | DELETE | `system_admin` only |
| `erp_ai_usage_logs` | SELECT | `settings.ai.usage.view` OR `system_admin` |
| `erp_ai_usage_logs` | INSERT | Any authenticated user (server-side only) |
| `erp_ai_feature_flags` | SELECT | `settings.ai.view` OR `system_admin` |
| `erp_ai_feature_flags` | UPDATE | `settings.ai.manage` OR `system_admin` |

All 3 tables: RLS enabled + forced. No anonymous access.

---

## 6. Permissions Seeded

| Permission Code | Name | Purpose |
|---|---|---|
| `settings.ai.view` | View AI Settings | View provider configurations and flags |
| `settings.ai.manage` | Manage AI Settings | Create/update provider configurations |
| `settings.ai.test` | Test AI Connection | Run test connection actions |
| `settings.ai.secrets.manage` | Manage AI Secrets | Update API key references |
| `settings.ai.usage.view` | View AI Usage Logs | View usage and cost logs |

---

## 7. Server Actions Created

**File:** `src/server/actions/settings/ai-settings.ts`

| Action | Permission Required |
|---|---|
| `getAiProviderConfigs()` | settings.ai.view |
| `getAiProviderConfig(id)` | settings.ai.view |
| `getAiFeatureFlags()` | settings.ai.view |
| `createAiProviderConfig(input)` | settings.ai.manage |
| `updateAiProviderConfig(input)` | settings.ai.manage |
| `deleteAiProviderConfig(id)` | settings.ai.manage |
| `saveAiProviderSecret(id, secretInput)` | settings.ai.secrets.manage |
| `testAiProviderConnection(id)` | settings.ai.test |
| `updateAiFeatureFlag(code, updates)` | settings.ai.manage |
| `getAiUsageLogs(limit)` | settings.ai.usage.view |

All actions: `getAuthContext()` → `hasPermission()` → Zod validation → Supabase → `logAudit()` → `revalidatePath()`.

`saveAiProviderSecret`: receives the actual key, stores only `secret_ref` (env var name) + `masked_secret_preview` — the key value is **never persisted**.

---

## 8. UI Routes/Components Created

### Route
`src/app/(protected)/admin/settings/ai/page.tsx`

### Feature Components (all in `src/features/settings/ai/`)

| Component | Purpose |
|---|---|
| `ai-settings-page-client.tsx` | Main page wrapper, summary cards, tabs |
| `ai-provider-config-list.tsx` | Card list of provider configurations with test, edit, delete |
| `ai-provider-form-dialog.tsx` | Add/Edit provider dialog (ERPChildDialogForm pattern, controlled state) |
| `ai-provider-secret-dialog.tsx` | API key update dialog (masked preview only, key cleared after save) |
| `ai-feature-flags-panel.tsx` | Toggle panel for AI feature flags |
| `ai-usage-log-table.tsx` | Usage log table with status indicators |

### Sidebar
Added **AI Settings** (`Brain` icon) to the Administration group in `src/components/layout/app-sidebar.tsx`.

### UI Sections
1. Overview summary cards (configured, enabled, tested, active features)
2. Security notice banner
3. Providers tab — card per provider with test/edit/key buttons
4. Feature Flags tab — toggle panel with human-review controls
5. Usage Logs tab — append-only log table

---

## 9. Secure Key Storage Method Used

**Method:** Environment Variables (current phase)

- `secret_ref` stores the env var name (e.g. `OPENAI_API_KEY`) — **not the key value**
- `masked_secret_preview` stores display-only masked version (e.g. `sk-****6789`)
- At runtime, server actions read `process.env[secret_ref]` to resolve the actual key
- The key value is **never stored in DB, never returned to frontend, never logged**

**Note on Supabase Vault:** Vault integration was evaluated but not implemented in SETTINGS.1. The current env var approach is secure for single-server deployment. Vault migration can be added in a future phase if multi-tenant secret isolation is required. Documented as deferred item.

---

## 10. Provider Abstraction Files Created

| File | Purpose |
|---|---|
| `src/lib/ai/providers/types.ts` | Core TypeScript interfaces: AiProviderConfig, AiTestConnectionResult, AiProviderInterface, AiFeatureFlag |
| `src/lib/ai/providers/factory.ts` | Factory: `getAiProvider(configCode)`, `getDefaultAiProvider(purpose)` |
| `src/lib/ai/providers/openai-provider.ts` | OpenAI/Azure OpenAI test connection implementation |
| `src/lib/ai/providers/local-provider.ts` | Tesseract/Ollama/local provider test connection implementation |

DMS.9–DMS.11 must use `getAiProvider(configCode)` — never import OpenAI SDK directly.

---

## 11. Test Connection Behavior

- Server-side only (never client-side API calls)
- `OpenAiProvider`: calls `GET /v1/models` with the API key resolved from env var
- `LocalProvider (tesseract)`: returns informational success (no network test needed)
- `LocalProvider (ollama)`: calls `GET /api/tags` on the configured endpoint
- On result: updates `last_test_status`, `last_test_at`, `last_test_message` in DB
- Inserts `erp_ai_usage_logs` row with `operation_type = 'test_connection'`
- Logs via `logAudit()`
- If `OPENAI_API_KEY` env var is not set: returns clear failure message without crashing

---

## 12. Usage Logging Behavior

- Append-only `erp_ai_usage_logs` table
- Currently populated by test connection actions only
- Future DMS phases will log OCR, classify, extract operations
- No document content, prompts, OCR text, or API keys are logged
- Usage tab in AI Settings UI shows last 50 entries

---

## 13. Source-of-Truth Updates

| File | Update |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Added SETTINGS.1 row to completion log, added AI Settings module to module table, updated last-updated date |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Added AI Settings reference paragraph pointing to `erp-ai-settings-standard.mdc` |
| `.cursor/rules/erp-dms-standard.mdc` | Copied from `implementation_Review/Phase_DMS_1_Planning/erp-dms-standard.mdc` |
| `.cursor/rules/erp-ai-settings-standard.mdc` | Created new — enforces all security, abstraction, and DMS integration rules |

DMS rule (`.cursor/rules/erp-dms-standard.mdc`) now reads:
> DMS AI/OCR providers must read from ERP AI Settings via `getAiProvider()`. Never hardcode provider SDKs in DMS code.

---

## 14. QA Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `npx eslint src/features/settings/ai/ src/lib/ai/ src/server/actions/settings/` | **PASS** — 0 errors, 0 warnings |
| Supabase migration applied | **PASS** — success |
| Tables created in live DB | **PASS** — erp_ai_provider_configs, erp_ai_usage_logs, erp_ai_feature_flags |
| RLS enabled on all 3 tables | **PASS** |
| 6 provider seeds applied | **PASS** — all disabled |
| 7 feature flag seeds applied | **PASS** — all disabled |
| 5 permissions seeded | **PASS** |

---

## 15. Manual Browser Test Checklist

| Test | Expected |
|---|---|
| Navigate to Admin → AI Settings | Page loads with 3 tabs |
| Summary cards show correct counts | 6 configured, 0 enabled, 0 tested, 0 active features |
| Provider cards render | 6 cards, all showing "Disabled" and "Not tested" |
| Click "Add Provider" | ERPChildDialogForm opens |
| Fill form and save | Card appears in list |
| Click "Update API Key" | Secret dialog opens, masked preview shown after save |
| Full key not visible in browser Network tab | Key absent from all responses |
| Click "Test Connection" → OpenAI with no env key | Clear failure: "Environment variable 'OPENAI_API_KEY' is not set" |
| Click "Test Connection" → Tesseract | Success: "Tesseract OCR is configured as local provider" |
| Feature Flags tab | 7 flags shown, all inactive |
| Toggle a flag | Saves and updates immediately |
| Toggle "Human review" off | Confirmation dialog appears |
| Usage Logs tab | Empty table initially, row appears after test connection |
| No API key in DB `erp_ai_provider_configs` | Only `secret_ref` (env name) + `masked_secret_preview` |

---

## 16. Security Checklist

| Check | Status |
|---|---|
| API key never stored in any DB column | ✅ Enforced in `saveAiProviderSecret` — key used only for masking |
| API key never returned to frontend | ✅ `mapToConfig()` maps only `secretRef` and `maskedSecretPreview` |
| API key never visible in browser Network tab | ✅ Server action return excludes key value |
| API key never logged | ✅ `logAudit()` logs only `secret_ref` and `masked_preview` |
| RLS on all AI tables | ✅ Enabled and forced |
| Anonymous access blocked | ✅ All policies require auth |
| No AI SDK imported in feature modules | ✅ Only `src/lib/ai/providers/` may import AI SDKs |
| Test connection is server-only | ✅ `testAiProviderConnection` is a server action |

---

## 17. Issues and Deferred Items

| Item | Priority | Deferred To |
|---|---|---|
| Supabase Vault integration for API keys | Low (env vars are secure for current deployment) | Future phase if multi-tenant needed |
| Azure OpenAI test connection (distinct from OpenAI) | Medium | DMS.9 or AI.2 |
| Google Document AI test connection | Medium | DMS.9 |
| AWS Textract test connection | Medium | DMS.9 |
| AI provider config export/import | Low | Future |
| Usage log cost estimation from actual token prices | Low | DMS.10+ |
| Per-user AI usage limits | Low | Future |

---

## 18. Recommended Next Phase

```
ERP DMS.2 — Database Foundation, RLS, Numbering, Storage Buckets
```

**DMS.2 must:**
- Reuse `erp_ai_provider_configs` table — DO NOT recreate it
- Create DMS-specific tables (`dms_document_types`, `dms_documents`, `dms_document_versions`, `dms_document_links`, `dms_document_events`)
- Set up Supabase Storage buckets for document files
- Set up global numbering rule for `DMS_DOCUMENT`
- Enable RLS on all DMS tables

DMS.2 does NOT need to implement any AI logic — that is DMS.9+.
