# ERP DMS.1A — Architecture Review, Corrections, Existing Document Inventory, and Final Approval Gate

**Phase:** ERP DMS.1A  
**Type:** Review + Correction + Approval Gate (No Implementation)  
**Date:** 2026-06-14  
**Project:** ALGT ERP — Alliance Gulf Transport  
**Status:** REVIEW COMPLETE — Awaiting Sameer approval decisions before DMS.2  
**Output folder:** `implementation_Review/Phase_DMS_1_Planning/`

---

## 1. Executive Summary

DMS.1A performed a full audit of the existing ALGT ERP codebase for all document-related database tables, forms, server actions, and routes. The audit revealed that the Party Master already contains a functioning but **fragmented** partial DMS system:

- `party_document_types` — 14 seeded document types, fully functional
- `party_documents` — active, metadata-only (file storage placeholder, never used)
- `party_licenses` — active structured license records with `license_document_id FK`
- `party_tax_registrations` — active with `certificate_document_id FK`
- `party_document_statuses` — active
- `MASTER_PARTY_DOCUMENT` numbering rule — active

The Party Documents tab is **live but metadata-only** with an explicit note: *"Document metadata only. File upload will be added in the DMS phase."*

**Key correction to DMS.1 plan:** The DMS system must **absorb and replace** `party_documents` as the file storage layer. However, `party_documents` metadata records are valuable and must be **migrated** to DMS, not discarded. The `party_document_types` seeded data (14 types) must be **migrated into `dms_document_types`** during DMS.3.

**AI Settings gap found:** No AI Settings module exists in the ERP. `ERP SETTINGS.1` must be created **before DMS.9** (AI phases). The DMS.2 foundation should include placeholder `erp_ai_provider_configs` tables.

**Recommended next sequence:**
```
ERP DMS.2 → ERP DMS.3 → ERP DMS.4 → ERP DMS.5 → ERP DMS.6 (Party migration)
→ ERP DMS.7 → ERP DMS.8 → ERP SETTINGS.1 → ERP DMS.9 → DMS.10 → DMS.11 ...
```

---

## 2. DMS.1 Plan Review Result

| Section | Assessment | Correction Needed |
|---------|------------|-------------------|
| Database schema proposal (20+ tables) | ✅ Sound and complete | Minor: add `erp_ai_provider_configs` table to DMS.2 scope |
| Supabase Storage architecture | ✅ Sound | No change |
| AI provider abstraction interfaces | ✅ Sound | No change |
| Document types catalogue (35 types) | ✅ Good | Must include the 14 existing `party_document_types` codes — ensure no duplicates (`TRADE_LICENSE`, `MOA`, `TRN_CERTIFICATE`, etc. already exist) |
| Confidentiality model | ✅ Sound | No change |
| ERP linking model (`dms_document_links`) | ✅ Sound | Must include `party_license` and `party_tax_registration` as valid entity_types for linking |
| Phase list (14 phases) | ⚠️ Needs update | Insert `ERP SETTINGS.1` before DMS.9; add DMS.1A; DMS.6 must include `party_documents` migration |
| Open decisions for Sameer | ✅ 10 decisions listed | Add 3 more: file migration from `party_documents`, numbering rule merge, `party_license` linking |
| Numbering | ⚠️ Conflict | `MASTER_PARTY_DOCUMENT` already exists. DMS must decide: keep it or replace with `MASTER_DMS_DOCUMENT` |
| Missing: AI Settings module | ❌ Not in DMS.1 | SETTINGS.1 must be planned before DMS.9 |

---

## 3. Existing Document Inventory Method

**Search method:**
- Full schema grep across all 12 migration files for: `document`, `license`, `expiry`, `file_path`, `certificate`, `upload`, `storage`, `permit`, `compliance`
- Source code inspection of all `*document*` and `*license*` feature files
- Server action audit for `party-documents.ts` and `party-licenses.ts`
- Direct table definition extraction from `20260614060000_erp_base_002f5a1_party_master_tables.sql`

---

## 4. Existing Document-Related DB Tables Inventory

### 4.1 Complete Inventory Table

| Object | Type | Location | Current Purpose | Status | Reuse in DMS? | Action | Risk | Notes |
|--------|------|----------|-----------------|--------|----------------|--------|------|-------|
| `party_document_types` | DB table (lookup) | `public.party_document_types` | Party document type dropdown | **ACTIVE** — 14 seeded types | **Partial** | Migrate data into `dms_document_types` during DMS.3; deprecate after DMS.6 migration complete | Medium | Codes overlap with DMS plan (TRADE_LICENSE, MOA, TRN_CERTIFICATE, etc.). Merge strategy needed |
| `party_document_statuses` | DB table (lookup) | `public.party_document_statuses` | Document status dropdown (Active, Pending, Expired, etc.) | **ACTIVE** | **No** | Map to `dms_documents.status` enum; retire after DMS.6 | Low | DMS uses VARCHAR status, not FK lookup |
| `party_documents` | DB table | `public.party_documents` | Party-specific document metadata + file placeholder | **ACTIVE (metadata only)** — file_path never used | **Partial** | Migrate data into `dms_documents` + `dms_document_links(entity_type='party')` during DMS.6; keep temporarily until migration verified | **HIGH** | FK from `party_licenses.license_document_id` and `party_tax_registrations.certificate_document_id` must be updated after migration |
| `party_license_types` | DB table (lookup) | `public.party_license_types` | License type dropdown | **ACTIVE** | **No** | Keep — this is structured license business data, not a DMS type | Low | License types are a different concept from document types |
| `party_license_statuses` | DB table (lookup) | `public.party_license_statuses` | License status dropdown | **ACTIVE** | **No** | Keep — structured license data | Low | |
| `party_licenses` | DB table | `public.party_licenses` | Structured party license records (number, expiry, authority) | **ACTIVE — fully functional** | **No (keep as-is)** | Keep structured license records. Add `entity_type='party_license'` to `dms_document_links` for linking DMS documents to license records | **HIGH** | `license_document_id FK → party_documents`. After DMS.6 migration, change this FK to `dms_documents(id)` or use `dms_document_links` |
| `party_tax_statuses` | DB table (lookup) | `public.party_tax_statuses` | Tax status dropdown | **ACTIVE** | **No** | Keep — structured tax data | Low | |
| `party_tax_registrations` | DB table | `public.party_tax_registrations` | Structured VAT/TRN registration records | **ACTIVE — fully functional** | **No (keep as-is)** | Keep structured tax records. `certificate_document_id FK → party_documents`. After DMS.6, migrate to `dms_document_links` | **HIGH** | Same FK migration issue as `party_licenses` |
| `party_compliance_profiles` | DB table | `public.party_compliance_profiles` | KYC, approval status, risk/credit rating per party | **ACTIVE — structured business data** | **No** | Keep entirely — this is compliance metadata, not document storage. No files stored here | Low | No document/file fields; purely structured approval/status data |
| `party_compliance_statuses` | DB table (lookup) | `public.party_compliance_statuses` | Compliance status dropdown | **ACTIVE** | **No** | Keep | Low | |
| `party_note_types` | DB table (lookup) | `public.party_note_types` | Note type dropdown | **ACTIVE** | **No** | Keep — notes ≠ documents | Low | |
| `party_notes` | DB table | `public.party_notes` | Free text notes attached to party | **ACTIVE** | **No** | Keep — notes are not documents | Low | |
| `MASTER_PARTY_DOCUMENT` | Numbering rule | `global_numbering_rules` | Generates `PTY-DOC-{SEQ6}` codes for `party_documents` | **ACTIVE** | **Partial** | Keep active during DMS.6 migration. Decide: merge into `MASTER_DMS_DOCUMENT` or run both in parallel | Medium | Format: `{DOC}-{SEQ6}`. DMS plan proposes `DMS-{YYYY}-{000001}` |

### 4.2 Document-Related Status Objects

| Object | Current Seeded Values | Notes |
|--------|----------------------|-------|
| `party_document_types` | TRADE_LICENSE, MOA, AOA, TRN_CERTIFICATE, VAT_CERTIFICATE, INSURANCE_CERTIFICATE, BANK_GUARANTEE, POWER_OF_ATTORNEY, PASSPORT_COPY, EMIRATES_ID, ISO_CERTIFICATE, PREQUALIFICATION, CONTRACT, OTHER (14 total) | All overlap with DMS document types. Map 1:1 during DMS.3 migration |
| `party_document_statuses` | Assumed: Active, Pending, Expired, Archived | Map to `dms_documents.status` enum during DMS.6 |
| `party_license_types` | Seeded license type codes | Keep |
| `party_license_statuses` | Seeded statuses | Keep |

---

## 5. Existing Document-Related Forms, Routes, and Actions Inventory

| Object | Type | Location | Current Status | DMS Integration Plan |
|--------|------|----------|----------------|----------------------|
| `PartyDocumentsTab` | UI Component | `src/features/master-data/parties/party-documents-tab.tsx` | **ACTIVE** — Metadata only. Shows explicit note: "File upload will be added in the DMS phase." | **DMS.6**: Replace with DMS-backed list querying `dms_document_links WHERE entity_type='party'`. Keep current tab structure but change data source |
| `PartyLicensesTab` | UI Component | `src/features/master-data/parties/party-licenses-tab.tsx` | **ACTIVE** — Fully functional structured license form | **KEEP** — Party Licenses tab remains structured business data. Add "Link Document" action in DMS.6 to attach a DMS document to a license |
| `party-documents.ts` server actions | Server Actions | `src/server/actions/master-data/party-documents.ts` | **ACTIVE** — `getPartyDocuments`, `createPartyDocument`, `updatePartyDocument`, `deletePartyDocument` | **DMS.6**: Deprecate after migration. Until then, keep active for existing data access |
| `party-licenses.ts` server actions | Server Actions | `src/server/actions/master-data/party-licenses.ts` | **ACTIVE** — Full CRUD | **KEEP** — License actions are structured business logic |
| `getPartyDocumentTypes` | Server Action | `src/server/actions/master-data/parties.ts` | **ACTIVE** — Used by PartyDocumentsTab | **DMS.3**: After migration, replace with `getDmsDocumentTypes(category='PARTY_DOCUMENTS')` |
| `getPartyDocumentStatuses` | Server Action | `src/server/actions/master-data/parties.ts` | **ACTIVE** | **DMS.6**: Retire after migration |
| `usePartyDocumentsQuery` | Hook | `src/features/master-data/parties/hooks/use-party-child-queries.ts` | **ACTIVE** | **DMS.6**: Replace with `useDmsDocumentsByEntityQuery('party', partyId)` |
| `invalidatePartyDocuments` | Invalidation | `src/lib/query/invalidation.ts` | **ACTIVE** | **DMS.6**: Replace with DMS invalidation |

---

## 6. `party_document_types` Deep Review

### Answers to the 9 required questions:

| # | Question | Answer |
|---|---------|--------|
| 1 | Does `party_document_types` exist? | **YES** — Created in `20260614060000_erp_base_002f5a1_party_master_tables.sql` |
| 2 | What columns does it have? | `id`, `document_type_code` (UNIQUE), `name_en`, `name_ar`, `description`, `is_system`, `is_active`, `sort_order`, `created_at/by`, `updated_at/by` |
| 3 | Is it used by Party Documents tab? | **YES** — `getPartyDocumentTypes()` is called via `useQuery` in `PartyDocumentsTab` |
| 4 | Is it used by Party Licenses tab or other forms? | **No** — Licenses tab uses `party_license_types` which is a separate table |
| 5 | Is it populated with useful data? | **YES** — 14 seeded system types: TRADE_LICENSE, MOA, TRN_CERTIFICATE, INSURANCE_CERTIFICATE, PASSPORT_COPY, EMIRATES_ID, CONTRACT, and others. All are directly relevant to ALGT business |
| 6 | Does it overlap with proposed `dms_document_types`? | **YES** — 100% overlap. All 14 codes are in the DMS plan's 35-type catalogue. The 14 existing codes are a subset |
| 7 | Should it be migrated into `dms_document_types`? | **YES** — Migrate during DMS.3. Map `party_document_types` → `dms_document_types` with `category_id` pointing to a "Party Documents" or more specific category |
| 8 | Should it be kept temporarily? | **YES** — Keep active until DMS.6 Party migration is complete and Party Documents tab is DMS-backed. Can be deactivated in DMS.6 |
| 9 | Should future Party Documents tab stop using it? | **YES** — After DMS.6, Party Documents tab queries `dms_document_types` not `party_document_types`. Deprecate after DMS.6 |

### Migration Plan for `party_document_types`

During DMS.3:
```sql
-- Migrate party_document_types into dms_document_types
INSERT INTO dms_document_types (
  type_code, name_en, name_ar, category_id, is_system, is_active, sort_order,
  requires_expiry_tracking, default_confidentiality, requires_approval,
  allowed_entity_types
)
SELECT 
  pdt.document_type_code,
  pdt.name_en,
  pdt.name_ar,
  (SELECT id FROM dms_document_categories WHERE category_code = 'PARTY_DOCUMENTS'),
  pdt.is_system,
  pdt.is_active,
  pdt.sort_order,
  CASE 
    WHEN pdt.document_type_code IN ('TRADE_LICENSE','INSURANCE_CERTIFICATE','BANK_GUARANTEE','POWER_OF_ATTORNEY') THEN true 
    ELSE false 
  END,
  'company',
  CASE WHEN pdt.document_type_code IN ('TRADE_LICENSE','MOA','BANK_GUARANTEE') THEN true ELSE false END,
  ARRAY['party']
FROM party_document_types pdt
ON CONFLICT (type_code) DO NOTHING;
```

---

## 7. Party Documents Tab Review

### Answers to the 9 required questions:

| # | Question | Answer |
|---|---------|--------|
| 1 | Is it only placeholder or functional? | **ACTIVE + FUNCTIONAL** — creates, edits, deletes document records with title, type, number, dates, status, remarks. Explicit note: "Document metadata only. File upload will be added in the DMS phase." |
| 2 | What data source does it use? | `party_documents` table via `getPartyDocuments(partyId)` server action |
| 3 | Does it upload files? | **NO** — `file_path`, `file_name`, `file_mime_type`, `file_size` columns exist in the DB but are **never set** by the UI. Server action ignores file fields |
| 4 | Does it store files in Supabase Storage? | **NO** — No Supabase Storage integration. `file_path` is a plain `TEXT` column, never written to |
| 5 | Does it have document type dropdown? | **YES** — `party_document_types` via `ERPCombobox` |
| 6 | Does it have expiry fields? | **YES** — `expiry_date` (date input) + `expiry_required` checkbox + `renewal_notice_days` (not yet rendered in UI — in DB only) |
| 7 | Does it have versioning? | **NO** — No versioning at all |
| 8 | Does it have audit trail? | **Partial** — `logAudit()` is called in server actions for create/update/delete. No view/download events |
| 9 | What should happen in DMS.6? | **Replace data source with DMS** — Keep the tab UI shell and `ERPChildDialogForm` interaction pattern, but change the data source to `dms_document_links WHERE entity_type='party'` + `dms_documents`. Upload action opens DMS Upload Inbox with party pre-filled |

### Key Gap: `party_documents.file_path` is Never Used

The `file_path TEXT` column in `party_documents` was designed as a placeholder but has never been used. No Supabase Storage integration exists. This means:

**There is NO actual file data to migrate from `party_documents`.** The migration in DMS.6 is purely a metadata migration — document records (title, type, dates, status) move to `dms_documents`, but no files need to be moved because no files were ever stored.

This is actually good news: DMS.6 migration is safe and has zero file migration risk.

---

## 8. Party Licenses, Tax Registrations, and Compliance Review

### 8.1 `party_licenses` — Structured Record with Document Link

`party_licenses` is a rich structured table:
- `license_code` (numbering), `license_type_id`, `license_number`, `license_name`
- `issuing_authority_party_id` (FK → parties), `issuing_country_id`, `issuing_emirate_id`
- `issue_date`, `expiry_date`, `renewal_required`, `renewal_notice_days`
- `license_status_id`, `license_activity_text`
- `license_document_id` (FK → `party_documents`) — link to scanned license document

**Decision:** `party_licenses` **STAYS** as structured business data. The license _number_, _type_, _authority_, _expiry_ are structured relational data that belong in Party Master, not the DMS.

The scanned license _file_ (PDF image of the license) is a DMS document.

**After DMS.6:** Change `license_document_id FK → party_documents` to `license_document_id FK → dms_documents`.

**Add to `dms_document_links.entity_type` allowed values:** `'party_license'` — so a Trade License DMS document can link to both the `parties` record AND the `party_licenses` record.

### 8.2 `party_tax_registrations` — Same Pattern

`party_tax_registrations` has:
- `certificate_document_id FK → party_documents`

Same approach: Keep structured tax record in Party Master. Migrate `certificate_document_id` FK to point to `dms_documents` in DMS.6.

### 8.3 `party_compliance_profiles` — No Document Fields

`party_compliance_profiles` contains only structured compliance approval/status data:
- KYC status, vendor approval, customer approval, HSE approval, finance approval, legal approval
- Risk rating, credit rating
- Payment hold, work hold
- **No file_path, no document_id** — zero document-related fields

**Decision:** Keep entirely in Party Master. No DMS interaction needed.

### 8.4 The Dual-Layer Model (CONFIRMED)

```
Structured record layer (stays in Party Master):
  party_licenses.license_number, expiry_date, issuing_authority_party_id, etc.
  party_tax_registrations.tax_registration_number, effective_from/to, etc.
  party_compliance_profiles.kyc_status, approval statuses, etc.

Document/file layer (moves to DMS):
  party_licenses.license_document_id → dms_documents (scanned Trade License PDF)
  party_tax_registrations.certificate_document_id → dms_documents (scanned TRN certificate)
  party_documents → migrated to dms_documents + dms_document_links
```

---

## 9. Existing Supabase Storage / File Upload Inventory

**Result: NO Supabase Storage integration exists in the current ERP.**

| Evidence | Location | Finding |
|----------|----------|---------|
| `party_documents.file_path TEXT` | DB column | Placeholder column only. Never written by any server action. No Supabase Storage calls. |
| `party_documents.file_name TEXT` | DB column | Never written |
| `party_documents.file_mime_type TEXT` | DB column | Never written |
| `party_documents.file_size BIGINT` | DB column | Never written |
| `party-documents-tab.tsx` "No file attached" warning | UI | Shown when `!doc.file_path` — confirms file_path is always null |
| `party-documents.ts` server actions | Server | No Supabase Storage calls. No `supabase.storage.*` calls anywhere in party document actions |

**Conclusion:** The file storage layer is 100% unimplemented. DMS.5 (Upload Inbox and File Storage) is the first time any actual file storage will happen in the ALGT ERP. There is no legacy file data to migrate.

---

## 10. Duplicate and Overlap Analysis

| Conflict | Existing Object | DMS Object | Resolution |
|----------|-----------------|------------|------------|
| Document types | `party_document_types` (14 types) | `dms_document_types` (35 types) | Migrate in DMS.3. `party_document_types` becomes a deprecated table after DMS.6 |
| Document statuses | `party_document_statuses` (lookup table with FK) | `dms_documents.status` (VARCHAR enum) | Map during DMS.6 migration. No FK lookup in DMS |
| Document numbering | `MASTER_PARTY_DOCUMENT` → `PTY-DOC-{SEQ6}` | `MASTER_DMS_DOCUMENT` → `DMS-{YYYY}-{000001}` | Run in parallel. Existing party document codes keep their old format. New DMS documents get DMS format. Cross-reference old code in `dms_documents` metadata |
| Document expiry | `party_documents.expiry_date` | `dms_documents.expiry_date` + `dms_expiry_reminders` | Migrate in DMS.6 + DMS.8 |
| Party-document link | `party_documents.party_id` (FK column) | `dms_document_links(entity_type='party', entity_id)` | After migration, remove `party_id` column from `party_documents` or retire the table |
| License document link | `party_licenses.license_document_id FK → party_documents` | `dms_document_links(entity_type='party_license', entity_id=license_id)` | Alter FK to point to `dms_documents` in DMS.6 |
| Tax reg document link | `party_tax_registrations.certificate_document_id FK → party_documents` | `dms_document_links(entity_type='party_tax_registration', entity_id)` | Same as above |

---

## 11. Corrected DMS Source-of-Truth Decision

### The DMS Must Be the Only Document Storage Source

After DMS.6 is complete:

```
✅ CORRECT — Store in DMS:
  - Trade license PDF
  - TRN/VAT certificate scan
  - Insurance policy document
  - Passport copy
  - Any scanned document file

✅ CORRECT — Keep in Party Master:
  - party_licenses (structured: number, expiry, authority, type)
  - party_tax_registrations (structured: TRN number, effective date)
  - party_compliance_profiles (structured: approval statuses, risk)

❌ WRONG after DMS.6 — Do NOT create:
  - employee_documents table
  - vehicle_documents table
  - equipment_documents table
  - project_documents table
  - Any module-specific document table

✅ CORRECT for future modules:
  - Use dms_document_links(entity_type='employee', entity_id)
  - Use dms_document_links(entity_type='vehicle', entity_id)
  - etc.
```

**New global rule to enforce:**
> Any scanned/uploaded document file in any ERP module MUST be stored in DMS. Module-specific document tables are prohibited after DMS.6.

---

## 12. Revised Database Architecture Notes

### Additions to DMS.1 Plan

1. **Add `erp_ai_provider_configs` table** to DMS.2 scope (placeholder for AI Settings integration):

```sql
CREATE TABLE erp_ai_provider_configs (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  config_code     TEXT UNIQUE NOT NULL,  -- 'DEFAULT_OCR', 'DEFAULT_CLASSIFIER', etc.
  provider_type   TEXT NOT NULL,         -- 'openai', 'azure_openai', 'azure_doc_intelligence', 'tesseract', 'local'
  provider_name   TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  is_enabled      BOOLEAN DEFAULT false,  -- Disabled until SETTINGS.1 completes
  config_json     JSONB,                  -- Non-sensitive config (model names, endpoints, etc.)
  -- NOTE: API keys stored in Supabase Vault / environment variables only
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

2. **Add `entity_type` values to `dms_document_links`:** Add `party_license` and `party_tax_registration` to the allowed entity_type list.

3. **`party_documents` migration table:** Add cross-reference column to DMS migration:

```sql
-- After DMS.6 migration, add cross-reference
ALTER TABLE party_documents ADD COLUMN dms_document_id BIGINT REFERENCES dms_documents(id) ON DELETE SET NULL;
-- This allows looking up the new DMS record from the old party_documents record during transition
```

4. **Numbering coexistence:** The existing `MASTER_PARTY_DOCUMENT` (`PTY-DOC-{SEQ6}`) numbering rule stays active through DMS.6. New DMS documents use `MASTER_DMS_DOCUMENT` (`DMS-{YYYY}-{000001}`). Migrated documents retain their `PTY-DOC-*` codes stored in `dms_documents` description/notes field.

---

## 13. Revised Storage Architecture Notes

No changes to DMS.1 storage architecture. Key clarification:

**`party_documents.file_path` is completely unused** — there are no files to migrate. DMS.5 is the clean starting point for all file storage. No data migration risk for files.

---

## 14. AI Settings Alignment

### Current State

No AI settings module exists in ALGT ERP. The only settings-related route is `admin/settings/numbering` for numbering rules management.

### Required: `ERP SETTINGS.1 — AI Settings Provider Configuration`

**Scope:**
- Route: `/admin/settings/ai`
- Table: `erp_ai_provider_configs` (created in DMS.2 as placeholder)
- UI: `ERPRecordWorkspaceForm` — configure providers (OpenAI, Azure, local)
- Fields: Provider type, API endpoint, model selection, confidence threshold, enable/disable AI globally, enable OCR, enable classification, enable extraction
- Security: API keys MUST NOT be stored in the database. Use Supabase Vault or environment variables only
- Test connection button
- Per-provider enable/disable toggle

**Timing:**
- `erp_ai_provider_configs` placeholder table: **DMS.2**
- `ERP SETTINGS.1` full UI implementation: **Before DMS.9** (before AI OCR/extraction phases begin)
- Not required for DMS.2–DMS.8 (foundation, upload, linking, versioning, expiry)

**Recommended order:**

```
DMS.2 (DB foundation + erp_ai_provider_configs placeholder)
→ DMS.3 (Admin Masters)
→ DMS.4 (Document Repository)
→ DMS.5 (Upload Inbox)
→ DMS.6 (Party linking + party_documents migration)
→ DMS.7 (Versioning + Audit)
→ DMS.8 (Expiry + Notifications)
→ ERP SETTINGS.1 (AI Settings UI — configure provider before AI phases)
→ DMS.9 (OCR Pipeline)
→ DMS.10 (AI Classification + Extraction)
→ DMS.11 (AI Review Queue)
→ DMS.12 (Full-Text Search)
→ DMS.13 (Security QA)
→ DMS.14 (Future module integrations)
```

---

## 15. Revised Phase List

| Phase | Title | Key Deliverables | Dependencies |
|-------|-------|-----------------|--------------|
| **DMS.1** | Research & Architecture Plan | DMS.1 plan document | None |
| **DMS.1A** | Architecture Review, Corrections, and Final Approval Gate | This document | DMS.1 |
| **DMS.2** | Database Foundation, RLS, Numbering, Storage Buckets | All 20+ DMS tables + `erp_ai_provider_configs` placeholder, `dms-documents` + `dms-temp` buckets, `MASTER_DMS_DOCUMENT` numbering rule, full RLS | Sameer approval |
| **DMS.3** | DMS Admin Masters | Categories, Types (migrate from `party_document_types`), Tags, Metadata Definitions, Retention Policies, Document Statuses admin screens | DMS.2 |
| **DMS.4** | Document Repository List + Record Workspace Form | `ERPDataTable` list, `ERPRecordWorkspaceForm`, all 11 section tabs (skeleton), record routing | DMS.3 |
| **DMS.5** | Upload Inbox & File Storage | Upload component, session management, `dms-temp` storage, deduplication (SHA-256), preview generation | DMS.4 |
| **DMS.6** | Party Master Integration + `party_documents` Migration | `PartyDocumentsTab` → DMS-backed, `dms_document_links(entity_type='party')`, migrate `party_documents` data, update `party_licenses.license_document_id FK → dms_documents`, update `party_tax_registrations.certificate_document_id` FK | DMS.5 |
| **DMS.7** | Versioning & Audit Trail | Version upload, version history tab, complete `dms_document_events` audit log | DMS.5 |
| **DMS.8** | Expiry, Renewal Tracking & Notifications | Expiry reminders, renewal workflow, expiry dashboard, 5-tier reminder schedule | DMS.6 |
| **ERP SETTINGS.1** | AI Settings Provider Configuration | `erp_ai_provider_configs` UI, API key management (Vault), provider selection, test connection | DMS.2 (table exists) |
| **DMS.9** | OCR Pipeline Foundation | Tesseract OCR via Edge Function, OCR text stored in `dms_document_files.ocr_text` | ERP SETTINGS.1 |
| **DMS.10** | AI Classification & Extraction | Provider abstraction, Azure/OpenAI integration, confidence scoring | DMS.9, ERP SETTINGS.1 |
| **DMS.11** | AI Review Queue | Review screen (split-panel: doc + fields), accept/edit/reject, confirm & save | DMS.10 |
| **DMS.12** | Full-Text Search & Advanced Search | `tsvector` index, search screen, save search, `pgvector` prep | DMS.9 |
| **DMS.13** | Security, RLS, Confidentiality & Permission QA | Full security audit, RLS enforcement tests, signed URL audit | DMS.12 |
| **DMS.14** | HR/Fleet/Workshop/Projects Integration Readiness | DMS documents tab standard for future modules, entity_type expansion | After future modules built |

---

## 16. Document Migration and Deprecation Plan

### Migration Timeline

| Object | Keep Until | Migration Action | Target |
|--------|-----------|-----------------|--------|
| `party_document_types` | DMS.6 complete | Migrate 14 types into `dms_document_types` | DMS.3 |
| `party_document_statuses` | DMS.6 complete | Map statuses to DMS `status` enum | DMS.6 |
| `party_documents` | DMS.6 + 1 month soak | Migrate metadata rows to `dms_documents` + `dms_document_links` | DMS.6 |
| `party_documents.file_path/name/mime/size` | Already unused | No file migration needed — columns are always NULL | DMS.6 |
| `party_licenses.license_document_id` FK | DMS.6 | Alter to point to `dms_documents(id)` | DMS.6 |
| `party_tax_registrations.certificate_document_id` FK | DMS.6 | Alter to point to `dms_documents(id)` | DMS.6 |
| `MASTER_PARTY_DOCUMENT` numbering rule | DMS.6 soak | Disable after migration; existing codes preserved in DMS | DMS.6 |
| `getPartyDocuments` server action | DMS.6 | Replace with `getDmsDocumentsByEntity('party', id)` | DMS.6 |
| `getPartyDocumentTypes` server action | DMS.6 | Replace with `getDmsDocumentTypes(category='PARTY_DOCUMENTS')` | DMS.6 |
| `usePartyDocumentsQuery` hook | DMS.6 | Replace with DMS hooks | DMS.6 |

### What NEVER gets migrated/removed

| Object | Reason |
|--------|--------|
| `party_licenses` | Structured business data — stays permanently |
| `party_license_types` | Structured lookup — stays permanently |
| `party_tax_registrations` | Structured business data — stays permanently |
| `party_compliance_profiles` | Approval/risk data — stays permanently |
| `party_notes` | Free-text notes — different from documents |

---

## 17. DMS Rules to Enforce After Approval

The following rules must be added to `.cursor/rules/erp-dms-standard.mdc` after Sameer approves:

1. **DMS Single Source of Truth Rule:** After DMS.6, `party_documents` table is deprecated. All document storage uses DMS. Any PR that creates a module-specific `*_documents` table must be rejected unless it is an explicitly approved migration staging table.

2. **Entity Link Rule:** To link any DMS document to an ERP record, use `dms_document_links(entity_type, entity_id)`. Never add `document_id FK` columns directly to ERP tables (exception: cross-reference migration columns during DMS.6).

3. **party_document_types Deprecation Rule:** After DMS.3, new document types are added only to `dms_document_types`. `party_document_types` is read-only after DMS.3.

4. **AI Settings Rule:** No AI provider (OpenAI, Azure, etc.) may be called directly from DMS code. All AI calls go through provider factory. API keys only from Supabase Vault / env vars.

5. **File Placeholder Cleanup Rule:** The `file_path`, `file_name`, `file_mime_type`, `file_size` columns in `party_documents` are confirmed unused. They must never be written to. DMS.5 introduces the first real file storage.

---

## 18. Open Decisions for Sameer

The following decisions must be made before DMS.2 can proceed.

### Original 10 Decisions (from DMS.1 Plan)

| # | Decision | Recommendation |
|---|---------|---------------|
| 1 | **AI provider first?** | Azure Document Intelligence + Azure OpenAI (best UAE Arabic support, enterprise SLA). Alternative: OpenAI GPT-4o only (simpler setup). |
| 2 | **AI Settings before DMS.2 or before DMS.9?** | Implement `erp_ai_provider_configs` table in **DMS.2** as a placeholder. Build full AI Settings UI as **ERP SETTINGS.1 before DMS.9**. |
| 3 | **OCR: local Tesseract or cloud provider first?** | Start with **Tesseract** (free, no API cost) in DMS.9. Add Azure Document Intelligence in DMS.10 as primary. |
| 4 | **Document pilot types?** | **Trade License + TRN Certificate** — these are used by all ALGT companies and parties, clearly structured, and have expiry tracking value. |
| 5 | **Migrate `party_document_types` into `dms_document_types`?** | **YES** — migrate all 14 existing types in DMS.3. No data loss, clean transition. |
| 6 | **Replace Party Documents tab in DMS.6?** | **YES** — rebuild to read from `dms_document_links`. Keep the `ERPChildDialogForm` shell, change the data source. |
| 7 | **DMS organization: tags, folders, or both?** | **Tags + ERP entity links only** (no folder tree). Tags + `dms_document_links` provide better organization for ALGT's use case than folders. |
| 8 | **All documents require human review initially?** | **YES** — No auto-save of AI results in Phase 1. All AI goes to review queue. |
| 9 | **Store originals only first, or original + processed + preview?** | **Originals only in DMS.5**. Add processed (OCR layer) in DMS.9. Add preview in DMS.7+. |
| 10 | **Versioning active from DMS.4?** | **YES** — DMS.7 is versioning. Keep DMS.4 simple (no versioning). Add versioning in DMS.7. |

### 3 New Decisions from DMS.1A Audit

| # | Decision | Recommendation |
|---|---------|---------------|
| 11 | **Document numbering: keep `MASTER_PARTY_DOCUMENT` in parallel or replace?** | **Keep in parallel**. Existing records keep `PTY-DOC-*` codes. New DMS documents use `DMS-YYYY-XXXXXX`. Cross-reference the old code in `dms_documents.description` or a `legacy_document_code` column. Disable `MASTER_PARTY_DOCUMENT` numbering rule after DMS.6 migration completes. |
| 12 | **`party_licenses.license_document_id` FK migration: alter to `dms_documents` or use `dms_document_links`?** | **Alter FK to `dms_documents`**. Change `party_licenses.license_document_id FK → party_documents` → `party_licenses.license_document_id FK → dms_documents` in DMS.6. Simpler than two-table lookup. |
| 13 | **Expiry reminders: use DMS-specific reminder engine or connect to existing notification engine?** | **DMS-specific in DMS.8** using `dms_expiry_reminders` table. If a global notification engine is built later, wire DMS.8 reminders into it. Do not depend on a global engine that doesn't exist yet. |

---

## 19. Final Approval Checklist

Before Cursor proceeds to DMS.2, Sameer must confirm:

```
[ ] 1. All 13 open decisions above have been answered (or deferred explicitly)
[ ] 2. DMS.2 scope is approved: all 20+ tables + erp_ai_provider_configs + 2 Storage buckets + numbering rule
[ ] 3. DMS.3 scope is approved: Admin masters screens + party_document_types migration
[ ] 4. DMS.6 scope is approved: party_documents migration + license_document_id FK alteration
[ ] 5. ERP SETTINGS.1 timing is confirmed: before DMS.9
[ ] 6. DMS rule is approved: no new module-specific *_documents tables after DMS.6
[ ] 7. AI provider choice is confirmed (even if "Tesseract first, decide cloud provider later")
[ ] 8. Output folder for all DMS planning files confirmed: implementation_Review/Phase_DMS_1_Planning/
[ ] 9. V2 Architecture Standard document is reviewed
[ ] 10. Revised phase list (16 phases) is approved
```

---

## 20. Recommended Next Prompt

**Option A (Recommended):** Proceed to DMS.2 with the full corrected scope.

```
ERP DMS.2 — Database Foundation, RLS, Numbering, Storage Buckets, and AI Config Placeholder
```

Scope:
- Create all 20+ DMS tables with BIGINT PKs, RLS, indexes, foreign keys
- Create `erp_ai_provider_configs` placeholder table
- Create Supabase Storage buckets: `dms-documents`, `dms-temp`
- Add `MASTER_DMS_DOCUMENT` numbering rule to `global_numbering_rules`
- Seed `dms_document_categories` (10 categories)
- Seed `dms_document_types` (35 types, including migrated 14 from `party_document_types`)
- Seed `dms_metadata_definitions` for Trade License and TRN Certificate
- Full RLS for all tables
- QA gate

**Option B:** First implement `ERP SETTINGS.1` before DMS.2 so AI config table design is informed by the Settings UI.

Cursor assessment: **Option A is correct.** The `erp_ai_provider_configs` is a simple placeholder table in DMS.2 that stores non-sensitive provider config. The full Settings UI (ERP SETTINGS.1) can come later. Starting with DMS.2 database foundation is the right sequence — it unblocks DMS.3–DMS.8 which have no AI dependency.
