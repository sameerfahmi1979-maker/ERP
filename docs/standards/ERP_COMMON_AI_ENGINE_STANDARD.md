# ERP Common AI Engine Standard

**Document:** `docs/standards/ERP_COMMON_AI_ENGINE_STANDARD.md`  
**Status:** GOVERNANCE STANDARD (ERP COMMON AI.0)  
**Applies to:** All Common AI phases (1A–15), future module AI integrations  
**Version:** 1.0 — 2026-06-16  

> **This document is a governance standard. It does not implement the Common AI engine.**

---

## 1. Purpose

Define the architecture, security, and development rules for the **Universal Internal AI Engine** — a registry-based system that compares linked DMS documents against registered ERP record forms, suggests fills/corrections/updates, and applies changes only after explicit human approval with full audit.

DMS already provides document OCR, classification, extraction, summaries, search, and per-document intelligence. Common AI extends that foundation to **cross-record form updates** and future ERP-wide intelligence (compliance, risk, duplicates, search, actions).

---

## 2. Strategic Decisions (Locked)

| Decision | Value |
|---|---|
| AI scope | **Internal ERP only** |
| MCP server | **Not required / deferred** |
| Public ERP AI API | **No** |
| Third-party AI connectors | **No** |
| AI provider | **OpenAI API** via existing server-side provider layer |
| Evidence source | **Linked DMS documents only** (`dms_document_links`) |
| Auto-apply suggestions | **No in v1** — human review required |
| Finance / Projects / HSE AI | **Deferred** |

---

## 3. Universal Internal AI Engine — Concept

One engine, built once, reused across modules:

1. **Registry** — each form registers AI-eligible fields, types, validation, document hints, apply handlers.
2. **Evidence loader** — loads linked DMS documents + capped OCR/summary/metadata (never full raw text in suggestion tables).
3. **Structured AI call** — OpenAI via shared provider; JSON output validated with Zod.
4. **Suggestion persistence** — `erp_ai_field_suggestions` (Phase 1B+, not yet implemented).
5. **Human review UI** — accept/reject per suggestion; no silent writes.
6. **Apply engine** — registered handlers only; permission + audit on every apply.

---

## 4. OpenAI Provider Usage

### Existing infrastructure (SETTINGS.1 + DMS.10)

| Component | Role |
|---|---|
| `erp_ai_provider_configs` | Non-sensitive provider config; `secret_ref` = env var name only |
| `erp_ai_usage_logs` | Metadata-only usage log (tokens, model, duration — no prompts/OCR) |
| `src/lib/ai/providers/factory.ts` | ERP-wide provider factory |
| `src/lib/dms/ai/factory.ts` | DMS AI adapter selection (`getDmsAiProvider`) |
| `src/lib/dms/ai/openai-dms-adapter.ts` | Chat Completions, structured JSON, embeddings |

### Rules

- **Existing OpenAI configuration remains the source** for AI provider settings.
- Future Common AI calls must use the **shared provider/service layer** — extend `src/lib/ai/common/` and bridge to DMS adapter where appropriate.
- **Direct module-level OpenAI calls are prohibited.**
- API key stays in `process.env[secretRef]` only — never in DB or client.
- Usage logs store **metadata only** — not prompts, responses, OCR text, or vectors.

---

## 5. Registry-Based Design

Each AI-eligible form registers fields in code (Phase 1A):

```typescript
{
  targetField: string;
  fieldLabel: string;
  fieldType: 'text' | 'date' | 'number' | 'boolean' | 'fk' | 'json';
  documentTypeHints?: string[];
  validationSchema?: ZodSchema;
  isAiEligible: boolean;  // default false
  safetyClassification: 'business_safe' | 'requires_review' | 'restricted';
  applyHandler: (entityId, value) => Promise<void>;
}
```

Pilot entity types (v1): `company`, `party`, `branch`, `site` — explicit permission mapping only.

---

## 6. Feature Flag Rules

All Common AI capabilities are gated by `erp_ai_feature_flags`:

| Flag | Purpose |
|---|---|
| `ERP_AI_FORM_FILL` | Universal fill/correct/update engine |
| `ERP_AI_DOC_UNDERSTANDING` | Document understanding center |
| `ERP_AI_DUPLICATE_DETECT` | Duplicate/conflict detection |
| `ERP_AI_COMPLIANCE` | Record compliance checker |
| `ERP_AI_RISK_SCORE` | Record risk scoring |
| `ERP_AI_ERP_SEARCH` | ERP-wide natural language search |
| `ERP_AI_ACTIONS` | AI action drafts (confirm before execute) |
| `ERP_AI_DAILY_BRIEF` | Management daily brief |
| `ERP_AI_AUDIT_EXPLAINER` | Audit trail explainer |
| `ERP_AI_DATA_QUALITY` | Data quality monitor |

**Rules:**
- All new flags default to **`is_enabled = false`** until Sameer enables for UAT/production.
- Do not remove or alter existing DMS AI flags.
- `requires_human_review` defaults to **`true`** for capabilities that write or suggest writes.
- Check flags in server actions before any Common AI operation.

---

## 7. Permission Rules

Common AI permissions use the `ai.*` namespace (seeded in COMMON AI.0).

| Action | Required permissions |
|---|---|
| View AI suggestions | Target record **view** + `ai.field_suggestions.view` |
| Generate suggestions | Target record **view** + `dms.documents.view` + `ai.field_suggestions.generate` |
| Accept/apply suggestions | Target record **manage** + `ai.field_suggestions.apply` |
| Admin bulk operations | `ai.common.admin` |

Applying a suggestion always requires **both** AI apply permission **and** target record manage permission.

---

## 8. RLS Rules

- All new Common AI tables: **BIGINT PK**, **RLS ENABLED + FORCED**.
- Phase 1 v1 uses **explicit pilot entity permission mapping** — no generic dynamic entity resolver.
- Allowed pilot types: `company`, `branch`, `site`, `party`.
- No dynamic SQL. No unregistered entity types.
- Future module entities require explicit registration in a new phase.

---

## 9. Audit Rules

- Every generate / accept / reject / apply / supersede must log to audit.
- Phase 1+ will use `erp_ai_field_suggestion_events` (append-only).
- Use existing `logAudit()` pattern in server actions.
- Rejected and superseded suggestions are **retained** for traceability.

---

## 10. Sensitive Data and Logging Rules

### Never log

- Raw prompt text
- Raw OCR text
- Raw AI response JSON
- API keys
- Full document content
- Sensitive extracted values (Emirates ID, passport, bank account) unless explicitly approved and masked

### Safe to log

- Feature area, operation, model ID, token counts, duration_ms, prompt_version
- Entity type, entity ID, suggestion count, status transitions
- Sanitized error codes

### Suggestion table storage (Phase 1B+)

Allowed: field name, label, sanitized old/new values, source document/file IDs, confidence, short excerpt, short reason.

Not allowed: full OCR, full content_text, full prompt, raw AI response, long unredacted excerpts.

Long document content remains in DMS only.

---

## 11. Prompt and Output Handling

- Use structured JSON output (`response_format: json_object`) + Zod validation.
- Version prompts with `PROMPT_VERSION` constants.
- Cap input text (follow DMS patterns: 8k–20k chars).
- Validate all AI output before persistence — never trust raw model output.
- On validation failure: mark suggestion as `needs_human_review` or `failed`; do not apply.

---

## 12. Non-Updatable Field Rules

AI must **never** update:

- Primary keys (`id`)
- Foreign keys — unless explicitly registered and safely validated
- System codes (`party_code`, `site_code`, department codes, etc.)
- Numbering fields (`document_no`, reference numbers from `generateNextReference()`)
- `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`
- Audit fields
- Status fields — unless explicitly approved in registry
- Any field not registered with `isAiEligible: true`

Every AI-eligible field must be explicitly registered with target field, label, type, validation, source document hints, apply handler, and safety classification.

---

## 13. DMS as Evidence Source

- Only documents **linked** to the target entity via `dms_document_links` may be used as evidence.
- DMS confidentiality tiers (`hr`, `legal`, `executive`) apply — same gates as DMS 12.x.
- Do not duplicate DMS OCR/extraction pipelines — **consume** DMS outputs.
- Files stay in Supabase Storage — never store file bytes in Common AI tables.

---

## 14. Phase 1 Staged Implementation Plan

Do **not** build Phase 1 in one Cursor run. Sub-phases:

| Sub-phase | Scope |
|---|---|
| **1A** | Registry, types, prompt contract, output schema |
| **1B** | DB tables, RLS, permissions, server action skeleton |
| **1C** | DMS evidence loader |
| **1D** | Suggestion generation and storage |
| **1E** | Accept / reject / apply engine |
| **1F** | UI panel and pilot integration |
| **1G** | Security, RLS, runtime QA, UAT |

### Pilot rollout

- **Stage 1:** Organization (`company`) + Party (`party`) — trade license, TRN, VAT, POA documents.
- **Stage 2:** Branch + Work Site — only after Stage 1 UAT passes.

---

## 15. Deferred Capabilities

Not in near roadmap:

- Finance AI, Projects AI, HSE AI
- MCP server
- Public ERP AI endpoints
- Auto-apply without human review (v2 consideration only)
- Auto-merge duplicates

---

## 16. Related Standards and Rules

- `.cursor/rules/erp-ai-settings-standard.mdc` — AI provider config, API keys, feature flags
- `.cursor/rules/erp-common-ai-standard.mdc` — Cursor protection for Common AI work
- `.cursor/rules/erp-dms-standard.mdc` — DMS document source of truth
- `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md` — full roadmap

---

**End of Standard**
