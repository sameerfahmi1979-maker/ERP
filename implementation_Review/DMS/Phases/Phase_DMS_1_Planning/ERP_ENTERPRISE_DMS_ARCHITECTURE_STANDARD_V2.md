# ERP Enterprise DMS Architecture Standard — Version 2

**Document:** ALGT ERP — Enterprise DMS Architecture Standard V2  
**Supersedes:** `ERP_ENTERPRISE_DMS_ARCHITECTURE_STANDARD.md` (V1, DMS.1)  
**Phase:** ERP DMS.1A  
**Date:** 2026-06-14  
**Status:** REVISED — Incorporating DMS.1A audit findings  
**Key Changes from V1:**
- Added existing `party_documents` → DMS migration strategy
- Added `party_document_types` migration plan (14 existing types)
- Added `erp_ai_provider_configs` to DMS.2 scope
- Added `party_license` and `party_tax_registration` to `dms_document_links` entity types
- Added ERP SETTINGS.1 to phase sequence (before DMS.9)
- Clarified that NO file data exists to migrate (file_path columns were always NULL)
- Confirmed dual-layer model: structured license/tax records stay in Party Master; scanned files go to DMS
- Added DMS single-source-of-truth enforcement rule
- Updated phase list to 16 phases

---

## 1. Purpose and Scope

This document defines the normative architectural standards for the ALGT ERP Document Management System (DMS). It supersedes V1 with corrections identified in the DMS.1A audit.

**V2 incorporates critical findings:**
- `party_documents` is an existing active but metadata-only table (no files stored yet)
- `party_document_types` has 14 seeded types that overlap with DMS document types
- `party_licenses.license_document_id` and `party_tax_registrations.certificate_document_id` reference `party_documents`
- No AI settings module exists — `ERP SETTINGS.1` required before AI phases

---

## 2. Technology Stack (Unchanged from V1)

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL via Supabase |
| File Storage | Supabase Storage |
| Server | Next.js 16 App Router + Server Actions |
| Frontend | React + TypeScript + Tailwind CSS |
| OCR (Phase 1) | Tesseract via Supabase Edge Function |
| OCR (Phase 2+) | Azure Document Intelligence |
| AI Classification/Extraction | Azure OpenAI GPT-4.1 / OpenAI GPT-4o |
| Background Jobs | Supabase Edge Functions + pg_cron |
| Full-Text Search | PostgreSQL `tsvector` + GIN index |
| Semantic Search | `pgvector` HNSW (DMS.12+) |

---

## 3. DMS Single Source of Truth Rule (NEW in V2)

> **After DMS.6 is complete, the DMS is the ONLY system for storing document files in ALGT ERP.**

This is a non-negotiable architectural rule:

```
PROHIBITED after DMS.6:
  employee_documents table
  vehicle_documents table
  equipment_documents table
  project_documents table
  vendor_documents table
  Any module-specific *_documents table

REQUIRED for all future modules:
  dms_document_links WHERE entity_type = '{module_entity}' AND entity_id = {record_id}
  
ALLOWED (structured business data, not DMS):
  party_licenses (license number, expiry, authority — structured relational data)
  party_tax_registrations (TRN number, effective dates — structured relational data)
  party_compliance_profiles (approval status, risk rating — structured relational data)
  Any structured metadata where the value is a string/date/number, not a file
```

**Exception:** Migration staging tables may temporarily coexist during DMS.6 with explicit approval.

---

## 4. Dual-Layer Model for Structured Records + Documents (NEW in V2)

For any ERP record that has both structured metadata AND scanned documents:

```
Layer 1 — Structured Record (stays in the ERP module table):
  Example: party_licenses
    license_number    TEXT     ← structured, searchable, queryable
    expiry_date       DATE     ← structured, used by expiry engine
    issuing_authority BIGINT   ← FK to parties, used for party relationships
    license_type      BIGINT   ← FK to license_types, used for filtering

Layer 2 — Scanned Document File (stored in DMS):
  Example: dms_documents
    title: "ALGT Trade License 2026"
    document_type: TRADE_LICENSE
    expiry_date: 2027-01-14
    file: dms-documents/1/2026/TRADE_LICENSE/100/original.pdf

Bridge:
  party_licenses.license_document_id FK → dms_documents(id)
  OR
  dms_document_links(entity_type='party_license', entity_id=license_id)
```

**Rule:** Structured data lives in Party Master. Binary files and their metadata live in DMS.

---

## 5. Database Architecture Standards

### 5.1 Naming (Unchanged)

All DMS tables prefixed `dms_`. All indexes `idx_dms_`. All RLS policies `dms_{table}_{operation}`.

### 5.2 `erp_ai_provider_configs` Table (NEW in V2)

Added to DMS.2 scope. Stores non-sensitive AI provider configuration:

```sql
CREATE TABLE erp_ai_provider_configs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config_code     TEXT UNIQUE NOT NULL,
  -- Examples: 'DEFAULT_OCR', 'DEFAULT_CLASSIFIER', 'DEFAULT_EXTRACTOR', 'DEFAULT_EMBEDDER'
  provider_type   TEXT NOT NULL,
  -- 'openai', 'azure_openai', 'azure_doc_intelligence', 'tesseract', 'google_doc_ai', 'local'
  provider_name   TEXT NOT NULL,
  api_endpoint    TEXT,          -- Base URL (Azure endpoint, etc.). NOT the API key.
  model_id        TEXT,          -- Model name/version (e.g., 'gpt-4.1', 'gpt-4o')
  api_version     TEXT,          -- Azure API version
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_enabled      BOOLEAN NOT NULL DEFAULT false,  -- Disabled until SETTINGS.1 configures it
  config_json     JSONB,         -- Non-sensitive config only (max_tokens, temperature, etc.)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: API KEYS ARE NEVER STORED IN THIS TABLE.
-- Keys are stored in Supabase Vault (supabase.vault.secrets) or environment variables.
```

### 5.3 `dms_document_links` Entity Types (UPDATED in V2)

Definitive list of valid `entity_type` values:

```
'party'                   → parties.id
'party_license'           → party_licenses.id          ← NEW in V2
'party_tax_registration'  → party_tax_registrations.id ← NEW in V2
'employee'                → employees.id    (future)
'vehicle'                 → vehicles.id     (future)
'equipment'               → equipment.id   (future)
'project'                 → projects.id    (future)
'contract'                → contracts.id   (future)
'purchase_order'          → purchase_orders.id (future)
'invoice'                 → invoices.id    (future)
'job_card'                → job_cards.id   (future)
'hse_incident'            → hse_incidents.id (future)
'company'                 → owner_companies.id
'branch'                  → branches.id
'bank'                    → finance_banks.id
```

### 5.4 `dms_documents` Cross-Reference Column for Migration (NEW in V2)

During DMS.6 migration from `party_documents`:

```sql
-- Add to dms_documents table to track migrated records
ALTER TABLE dms_documents
  ADD COLUMN legacy_document_code TEXT NULL,
  -- Stores original PTY-DOC-* code from party_documents during migration
  ADD COLUMN migrated_from_table TEXT NULL;
  -- e.g., 'party_documents'
```

This allows cross-referencing old codes and verifying migration completeness.

---

## 6. Migration Standards (NEW in V2)

### 6.1 `party_document_types` → `dms_document_types` (DMS.3)

All 14 existing `party_document_types` records will be migrated into `dms_document_types` during DMS.3.

Migration mapping:

| party_document_types code | DMS document_types category | expiry_tracking | confidentiality |
|--------------------------|----------------------------|-----------------|-----------------|
| TRADE_LICENSE | COMPANY_DOCUMENTS | Yes | company |
| MOA | LEGAL | No | legal |
| AOA | LEGAL | No | legal |
| TRN_CERTIFICATE | FINANCE | No | finance |
| VAT_CERTIFICATE | FINANCE | No | finance |
| INSURANCE_CERTIFICATE | INSURANCE | Yes | company |
| BANK_GUARANTEE | FINANCE | Yes | finance |
| POWER_OF_ATTORNEY | LEGAL | Yes | legal |
| PASSPORT_COPY | HR | Yes | hr |
| EMIRATES_ID | HR | Yes | hr |
| ISO_CERTIFICATE | QUALITY | Yes | company |
| PREQUALIFICATION | BUSINESS_DEV | Yes | internal |
| CONTRACT | LEGAL | Yes | legal |
| OTHER | GENERAL | No | internal |

### 6.2 `party_documents` → `dms_documents` (DMS.6)

**Step 1:** Create new `dms_documents` records from `party_documents` rows.  
**Step 2:** Create `dms_document_links(entity_type='party', entity_id=party_id)` for each.  
**Step 3:** Update `party_licenses.license_document_id` from `party_documents.id` → new `dms_documents.id`.  
**Step 4:** Update `party_tax_registrations.certificate_document_id` similarly.  
**Step 5:** Store old `party_documents.document_code` in `dms_documents.legacy_document_code`.  
**Step 6:** Verify migration count matches.  
**Step 7:** Change `PartyDocumentsTab` to read from DMS.  
**Step 8:** Disable `MASTER_PARTY_DOCUMENT` numbering rule.  
**Step 9:** Mark `party_documents` as deprecated (retain for 30-day soak period).

**No file migration required** — `party_documents.file_path` has always been NULL.

---

## 7. ERP SETTINGS.1 Requirements (NEW in V2)

**Phase:** ERP SETTINGS.1 — AI Settings Provider Configuration  
**Must complete before:** DMS.9 (OCR Pipeline)  
**Dependencies:** DMS.2 (`erp_ai_provider_configs` table exists)

Required functionality:
- Route: `/admin/settings/ai`
- Sidebar entry: Settings → AI Provider
- Uses `ERPRecordWorkspaceForm` with provider selection sections
- CRUD for `erp_ai_provider_configs` records
- Test Connection action (calls provider API with a health check prompt)
- Global AI enable/disable toggle
- Per-provider enable/disable
- API keys: stored in Supabase Vault (`supabase.vault.create_secret()`), never in the DB
- Key display: masked (`sk-...****`) with no full reveal option
- Usage logging placeholder (cost tracking future)

**Security requirement:**  
API keys must ONLY be accessed via server actions. No key must ever reach the client. The UI only stores the key in Vault and shows masked display.

---

## 8. AI/OCR Pipeline Standards (Unchanged from V1)

Provider interfaces remain the same as V1:
- `DocumentOcrProvider`
- `DocumentAiClassifier`
- `DocumentAiExtractor`
- `DocumentSuggestionEngine`

All accessed via factory functions. Never import Azure/OpenAI SDK directly in DMS feature code.

AI Settings integration:
```typescript
// Factory reads from erp_ai_provider_configs at runtime
export function getOcrProvider(): DocumentOcrProvider {
  const config = await getActiveProviderConfig('DEFAULT_OCR');
  if (!config.is_enabled) return new TesseractOcrProvider(); // fallback
  return new AzureDocumentIntelligenceProvider(config);
}
```

---

## 9. Phase List (UPDATED V2 — 16 Phases)

| # | Phase | Status |
|---|-------|--------|
| 1 | DMS.1 | COMPLETE (planning) |
| 2 | DMS.1A | COMPLETE (this document) |
| 3 | **DMS.2** | NEXT — DB Foundation, RLS, buckets, `erp_ai_provider_configs`, numbering |
| 4 | DMS.3 | Admin Masters + `party_document_types` migration |
| 5 | DMS.4 | Document Repository List + Record Workspace Form |
| 6 | DMS.5 | Upload Inbox + File Storage (first real files!) |
| 7 | DMS.6 | Party Master Integration + `party_documents` migration |
| 8 | DMS.7 | Versioning + Audit Trail |
| 9 | DMS.8 | Expiry + Renewal + Notifications |
| 10 | **ERP SETTINGS.1** | AI Settings Provider UI (before DMS.9) |
| 11 | DMS.9 | OCR Pipeline (Tesseract first) |
| 12 | DMS.10 | AI Classification + Extraction |
| 13 | DMS.11 | AI Review Queue |
| 14 | DMS.12 | Full-Text Search + Advanced Search |
| 15 | DMS.13 | Security / RLS / Confidentiality QA |
| 16 | DMS.14 | HR/Fleet/Workshop/Projects integration readiness |

---

## 10. UI/UX Standards (Unchanged from V1 with additions)

### Party Documents Tab — DMS.6 Transition

**Before DMS.6 (current):**
- Reads from `party_documents` table
- Shows metadata + explicit placeholder note
- No file upload

**After DMS.6:**
- Reads from `dms_document_links WHERE entity_type='party' AND entity_id={partyId}` → `dms_documents`
- "Add Document" → opens DMS Upload Inbox with party_id pre-filled
- "Open" → navigates to `/dms/documents/record/{id}` in workspace
- Shows: document_no, title, document_type, status, confidentiality badge, expiry_date (with expiry badge), file_role availability
- Keep `ERPChildDialogForm` shell for metadata editing; full record in DMS workspace

### Party Licenses Tab — No Change

Stays entirely in Party Master. No DMS integration required in the license form itself. Only `license_document_id` FK is migrated in DMS.6.

---

## 11. Prohibited Patterns (V2 Additions)

V1 prohibitions remain. Additional V2 prohibitions:

- ❌ Do NOT write to `party_documents.file_path`, `file_name`, `file_mime_type`, or `file_size` — these are deprecated placeholders
- ❌ Do NOT create new `*_documents` tables for any ERP module after DMS.6
- ❌ Do NOT store AI provider API keys in any database table — use Supabase Vault only
- ❌ Do NOT add more seeded types to `party_document_types` after DMS.3 — all new types go in `dms_document_types`
- ❌ Do NOT reference `party_document_types` in any new form after DMS.6 — use `dms_document_types`
- ❌ Do NOT call AI providers directly in DMS code — use factory functions that read from `erp_ai_provider_configs`

---

## 12. Acceptance Criteria for V2 Compliance

A DMS implementation is V2-compliant when:

1. `party_documents` data is migrated to `dms_documents` + `dms_document_links`
2. `party_document_types` data is migrated to `dms_document_types`
3. `party_licenses.license_document_id` FK points to `dms_documents`
4. `party_tax_registrations.certificate_document_id` FK points to `dms_documents`
5. Party Documents tab reads from DMS (entity link query)
6. No new module creates a `*_documents` table
7. AI API keys are in Supabase Vault, not in any DB column
8. All AI calls go through provider factory reading `erp_ai_provider_configs`
9. `erp_ai_provider_configs` table exists with RLS enabled
10. `dms_document_links` accepts `entity_type IN ('party', 'party_license', 'party_tax_registration', ...)`
