# ERP SETTINGS.1B — AI API Key UI Management Implementation Report

**Date:** 2026-08-01
**Status:** CLOSED / PASS
**Requested by:** Sameer — "system should take it from AI settings when I click edit configuration … you are free to modify the form and the code to do it."

---

## 1. Problem

Before this phase, entering an API key in the AI Settings "Update API Key" dialog only generated a
masked preview. The actual key had to be manually added to `.env.local` and the dev server restarted.
The Edit AI Provider form had no key field at all ("API keys are managed separately").

## 2. Solution

API keys can now be entered directly in the AI Settings UI. The key is:

1. Written server-side into the project's `.env.local` file under the configured env var name
   (e.g. `AZURE_DOCUMENT_INTELLIGENCE_KEY`).
2. Applied to `process.env` of the running server immediately — **no restart required**.
3. Still **never stored in the database** — only `secret_ref` (env var name) and
   `masked_secret_preview` are persisted, preserving the ERP SETTINGS.1 security standard.

All provider adapters (OpenAI, Azure Document Intelligence, local) already resolve keys via
`process.env[secretRef]` at call time, so the live update takes effect on the next AI call.

## 3. Files Changed

| File | Change |
|---|---|
| `src/lib/settings/env-file-secrets.ts` | **NEW** — `writeEnvSecret(envVarName, secretValue)`: validates env var name, upserts the `KEY=value` line in `.env.local` (creates file if missing), quotes values with special characters, sets `process.env[key]` immediately. Never logs the value. |
| `src/server/actions/settings/ai-settings.ts` | `saveAiProviderSecret` now calls `writeEnvSecret` before saving `secret_ref` + masked preview. Returns an error if the env file cannot be written. |
| `src/features/settings/ai/ai-provider-form-dialog.tsx` | Added inline **API Key** section (env var name + key value with show/hide toggle, masked "Current" preview, per-provider-type env var suggestion). On submit: saves provider config, then chains `saveAiProviderSecret` when a key was entered (works for both Add and Edit — create returns the new config id). |
| `src/features/settings/ai/ai-provider-secret-dialog.tsx` | Messaging updated to reflect the new behavior; `ENV_VAR_SUGGESTIONS` exported for reuse. Dialog remains functional as the dedicated key-update entry point. |

## 4. Security Compliance (erp-ai-settings-standard)

- Key NEVER stored in any DB column — unchanged. Key lives in `.env.local` / `process.env` only.
- Key NEVER returned to the frontend — unchanged; only masked preview.
- Key input cleared after save — unchanged.
- Permission `settings.ai.secrets.manage` enforced server-side before any write.
- Audit log records only `secret_ref` + masked preview.
- Env file written with mode 0600 (no-op on Windows, effective on Linux hosts).

## 5. Deployment Note

The env-file write requires the app process to have write access to its project root
(true for this self-hosted deployment). On read-only/serverless hosts the action returns a clear
error and the env var must be set on the host instead.

## 6. Verification

- `tsc --noEmit`: no errors in changed files (pre-existing unrelated errors in `spikes/` and
  `src/features/permissions|branches|...` remain untouched).
- Lints: clean on all 4 changed files.
- Dev server compiles the settings route without errors.
- Live browser UAT of the full save flow pending Sameer (requires login + a real Azure key).

## 7. Runtime UAT Closure (2026-08-01, Sameer)

- Bug fixed during UAT: "duplicate key value violates unique constraint
  `idx_erp_ai_configs_one_default_per_purpose`" — create/update actions now auto-demote the
  previous default provider for the same purpose before saving.
- Bug fixed during UAT: Test Connection returned "not yet implemented" for
  `azure_document_intelligence` — new `src/lib/ai/providers/azure-document-intelligence-provider.ts`
  registered in the factory; performs an authenticated call to the Azure `info` endpoint.
- UAT finding: endpoint URL was pasted into the API Key field (Azure 401). URL-value guard added
  in provider form, secret dialog, and `writeEnvSecret`.
- Seed-data fix applied via form save: `ARABIC_OCR_AZURE.purpose` corrected from junk text to `ocr`.
- Final result: **Test Connection SUCCESS**. Provider enabled + default for OCR.
  `DMS_OCR_AZURE` feature flag enabled (Sameer-confirmed goal of this phase).
  GPT Vision fallback flag left enabled as safety net.

## 8. How To Use (Azure Document Intelligence example)

1. Open `/admin/settings/ai` → Edit **Azure Document Intelligence (OCR)**.
2. Fill **API Endpoint** with your Azure resource endpoint.
3. In the **API Key** section: keep env var name `AZURE_DOCUMENT_INTELLIGENCE_KEY`, paste KEY 1
   from Azure Portal → your Document Intelligence resource → *Keys and Endpoint*.
4. Toggle **Enabled**, then **Save Changes**.
5. The key is active immediately — use *Test Connection* to verify.
