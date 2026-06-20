# ERP Enterprise DMS Architecture Standard

**Document:** ALGT ERP — Enterprise DMS Architecture Standard  
**Phase:** ERP DMS.1  
**Date:** 2026-06-14  
**Status:** ARCHITECTURE APPROVED FOR PLANNING — Implementation pending DMS.2 approval  
**Owner:** ALGT ERP Architecture  
**Reference Plan:** `implementation_Review/Phase_DMS_1_Planning/ERP_DMS_1_AI_READY_ENTERPRISE_DMS_RESEARCH_AND_ARCHITECTURE_PLAN.md`

---

## 1. Purpose and Scope

This document defines the architectural standards and design decisions for the ALGT ERP Document Management System (DMS). It is a normative reference for all DMS phases (DMS.2 through DMS.14).

Any code, migration, UI screen, or configuration that relates to DMS must conform to the standards in this document.

This document covers:
- Database architecture standards
- Storage architecture standards
- AI/OCR pipeline standards
- Security and confidentiality standards
- ERP integration standards
- UI/UX standards
- Background processing standards
- Audit and compliance standards

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | PostgreSQL via Supabase | BIGINT PKs, RLS, full-text search |
| File Storage | Supabase Storage | S3-compatible; private buckets; signed URLs |
| Server | Next.js 16 App Router + Server Actions | ERP standard |
| Frontend | React + TypeScript + Tailwind CSS | ERP standard |
| OCR (Phase 1) | Tesseract via Supabase Edge Function | Local, no API cost |
| OCR (Phase 2+) | Azure Document Intelligence | Higher accuracy, Arabic support |
| AI Classification | Azure OpenAI GPT-4.1 / OpenAI GPT-4o | Provider-agnostic abstraction |
| AI Extraction | Azure Document Intelligence + OpenAI | Structured JSON output |
| Background Jobs | Supabase Edge Functions + pg_cron | Job polling from queue tables |
| Full-Text Search | PostgreSQL `tsvector` + GIN index | Native, no external search engine |
| Semantic Search | `pgvector` HNSW index (DMS.12+) | OpenAI `text-embedding-3-small` |
| Auth | Supabase Auth + RLS | ERP standard |

---

## 3. Database Architecture Standards

### 3.1 Naming

- All DMS tables prefixed: `dms_`
- All DMS indexes prefixed: `idx_dms_`
- All DMS RLS policies follow pattern: `dms_{table}_{operation}`
- All DMS functions prefixed: `dms_`

### 3.2 Primary Keys

All DMS tables use `BIGINT GENERATED ALWAYS AS IDENTITY` primary keys.

No UUID primary keys in DMS tables (exception: `session_code` in `dms_upload_sessions` is a `VARCHAR` UUID-style key for URL safety, but `id` remains BIGINT).

### 3.3 Audit Columns

All DMS tables that represent mutable records must include:
```sql
created_by   BIGINT REFERENCES user_profiles(id),
created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_by   BIGINT REFERENCES user_profiles(id),
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
```

Event and log tables (`dms_document_events`, `dms_ai_extraction_jobs`) omit `updated_*` as they are append-only.

### 3.4 Soft Delete

Mutable DMS tables support soft delete:
```sql
deleted_at   TIMESTAMPTZ NULL
```

Queries must always include `WHERE deleted_at IS NULL` unless explicitly retrieving deleted records.

### 3.5 RLS Policy Standard

Every DMS table must have RLS enabled:
```sql
ALTER TABLE dms_{tablename} ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_{tablename} FORCE ROW LEVEL SECURITY;
```

RLS policies for `dms_documents` must enforce:
1. User is authenticated
2. User has `dms.documents.view` permission OR is document owner
3. Confidentiality level matches user's access tier

### 3.6 Required Indexes

Minimum required indexes per table:

**`dms_documents`:**
- `idx_dms_documents_type` on `document_type_id`
- `idx_dms_documents_status` on `status`
- `idx_dms_documents_expiry` on `expiry_date` WHERE `expiry_date IS NOT NULL`
- `idx_dms_documents_company` on `owning_company_id`

**`dms_document_files`:**
- `idx_dms_files_document` on `document_id`
- `idx_dms_files_hash` on `sha256_hash`
- GIN `idx_dms_files_fts` on `ocr_text_search`

**`dms_document_links`:**
- Unique on `(document_id, entity_type, entity_id)`
- `idx_dms_links_entity` on `(entity_type, entity_id)`

**`dms_document_events`:**
- `idx_dms_events_document` on `document_id`
- `idx_dms_events_type` on `event_type`

---

## 4. File Storage Architecture Standards

### 4.1 Bucket Definitions

| Bucket | Access | Purpose | Retention |
|--------|--------|---------|-----------|
| `dms-documents` | Private | All permanent document files | Permanent (governed by retention policies) |
| `dms-temp` | Private | Upload sessions, pre-review files | Auto-purge after 14 days |

### 4.2 Storage Path Standard

```
Permanent path: {owning_company_id}/{year}/{type_code}/{document_id}/{file_role}.{ext}

Examples:
1/2026/TRADE_LICENSE/100/original.pdf
1/2026/TRADE_LICENSE/100/processed.pdf
1/2026/TRADE_LICENSE/100/archive.pdf
1/2026/TRADE_LICENSE/100/preview.webp

Temp path: sessions/{session_id}/upload.{ext}
```

### 4.3 File Roles

| Role | Description | Immutable? |
|------|-------------|------------|
| `original` | User's original uploaded file | YES — never modified or deleted |
| `processed` | OCR-embedded PDF (text layer added) | YES |
| `archive_pdf_a` | PDF/A-1b archival standard copy | YES |
| `preview` | Compressed preview (WebP, max 800px) | No — regenerable |

### 4.4 SHA-256 Deduplication

Before storing any file:
1. Compute SHA-256 hash of file bytes
2. Query `dms_document_files WHERE sha256_hash = {hash} AND file_role = 'original'`
3. If match found: warn user of duplicate, provide link to existing document
4. If no match: proceed with upload

### 4.5 Signed URL Policy

- All signed URLs generated server-side only (server action or API route)
- Signed URL expiry: 1 hour for downloads, 5 minutes for previews
- Permission check MUST complete before signed URL generation
- All signed URL generations are logged to `dms_document_events` (event: `downloaded` or `previewed`)

---

## 5. AI/OCR Pipeline Standards

### 5.1 Provider Abstraction (Non-Negotiable)

All OCR and AI integrations MUST be accessed via the ALGT DMS provider interfaces:

```typescript
// src/lib/dms/providers/types.ts
interface DocumentOcrProvider { ... }
interface DocumentAiClassifier { ... }
interface DocumentAiExtractor { ... }
interface DocumentSuggestionEngine { ... }
```

Factory functions return the configured provider based on environment:

```typescript
// src/lib/dms/providers/factory.ts
export function getOcrProvider(): DocumentOcrProvider;
export function getAiClassifier(): DocumentAiClassifier;
export function getAiExtractor(): DocumentAiExtractor;
```

**Never import Azure/OpenAI SDK directly in DMS feature code.** Always go through the factory.

### 5.2 Confidence Scoring Standard

All AI-generated values must carry a confidence score:

| Level | Score Range | UI Display | Action Required |
|-------|-------------|------------|-----------------|
| `high` | 0.85 – 1.00 | Green badge | Review recommended but often fast |
| `medium` | 0.60 – 0.84 | Yellow badge | Review carefully |
| `low` | 0.30 – 0.59 | Orange badge | Manual correction likely needed |
| `needs_manual_review` | 0.00 – 0.29 | Red badge | AI could not extract reliably |

### 5.3 Human Review Requirement

**Mandatory for Phase 1 (DMS.5–DMS.12):**
- All AI-extracted fields go to `dms_review_queue`
- Reviewer must explicitly Accept, Edit, or Reject each field
- Only after "Confirm & Save" do fields write to `dms_document_metadata_values`
- The `dms_ai_extraction_results` record is kept permanently (audit)

**Auto-save may be introduced in DMS.13 only** after:
- AI accuracy is validated across 500+ documents
- Specific document types are whitelisted for auto-save
- Sameer explicitly approves the auto-save policy

### 5.4 AI Extraction Schema Location

Extraction schemas are stored in `dms_document_types.ai_extraction_schema` (JSONB).

Schema format:
```json
{
  "fields": [
    {
      "name": "field_code",
      "type": "text|date|number|boolean",
      "required": true,
      "prompt": "Human-readable hint for the AI model",
      "format_hint": "Optional format guidance"
    }
  ]
}
```

---

## 6. Security and Confidentiality Standards

### 6.1 Confidentiality Tiers

| Code | Name | Accessible By |
|------|------|---------------|
| `internal` | Internal | All authenticated ERP users |
| `company` | Company Confidential | Users belonging to the owning company |
| `hr` | HR Confidential | HR role + managers |
| `finance` | Finance Confidential | Finance role + managers |
| `legal` | Legal Confidential | Legal team + management |
| `executive` | Executive Restricted | C-level only |

### 6.2 Default Confidentiality by Category

| Category | Default Level |
|----------|---------------|
| HR Documents (passports, visas, IDs) | `hr` |
| Finance Documents (invoices, POs) | `finance` |
| Legal Documents (contracts, MOA) | `legal` |
| Company Documents (trade license, TRN) | `company` |
| Fleet/Equipment | `internal` |
| Operations | `internal` |

### 6.3 Sensitive Document Storage

HR Confidential and Legal Confidential documents must not appear in general document list queries unless the user has the appropriate tier permission.

### 6.4 Permission Check Order

For every DMS server action:
1. `getAuthContext()` — verify authentication
2. `hasPermission(userId, 'dms.documents.{action}')` — check permission
3. Confidentiality level check — verify user can access this confidentiality tier
4. Entity ownership check (optional) — if document is linked to a party the user cannot access

---

## 7. ERP Integration Standards

### 7.1 Generic Link Pattern

DMS integrates with all ERP modules via `dms_document_links`:

```
entity_type values (definitive list):
  'party'          → parties.id
  'employee'       → employees.id  (future)
  'vehicle'        → vehicles.id   (future)
  'equipment'      → equipment.id  (future)
  'project'        → projects.id   (future)
  'contract'       → contracts.id  (future)
  'purchase_order' → purchase_orders.id (future)
  'invoice'        → invoices.id   (future)
  'job_card'       → job_cards.id  (future)
  'hse_incident'   → hse_incidents.id (future)
  'company'        → owner_companies.id
  'branch'         → branches.id
  'bank'           → finance_banks.id
```

### 7.2 ERP Record Document Tab Standard

Every ERP record that supports documents must have a "Documents" workspace tab section.

The Documents tab:
- Uses `ERPDataTable` to list linked documents
- Filters: `getDocumentsByEntity(entityType, entityId)`
- Shows: document_no, title, type, status, expiry_date, confidentiality badge
- Actions: Upload new document, Open in DMS, Unlink
- "Upload" action opens the DMS upload flow with `entity_type` and `entity_id` pre-populated
- "Open in DMS" navigates to `/dms/documents/record/{id}`

**Implementation order:**
- DMS.6: Party Master Documents tab backed by DMS
- Future phases: HR, Fleet, Equipment, Projects when those modules are built

### 7.3 Sidebar Integration

DMS sidebar section (added in DMS.4):
```
Documents
├── Dashboard         /dms
├── Upload Inbox      /dms/inbox
├── All Documents     /dms/documents
├── Review Queue      /dms/review       (badge: pending count)
├── Expiring Soon     /dms/expiring     (badge: expiring <30 days)
└── Search            /dms/search
Admin
└── DMS Admin         /dms/admin
```

---

## 8. Background Processing Standards

### 8.1 Job Queue Table

All background jobs are recorded in `dms_ai_extraction_jobs` with status polling.

Status transitions:
```
pending → processing → complete
                     → failed (with retry_count increment, max 3 retries)
                     → skipped
```

### 8.2 Supabase Edge Function Pattern

Each processing step has its own Edge Function:

```
supabase/functions/
├── dms-ocr-processor/          index.ts  — runs OCR on upload session
├── dms-ai-classifier/          index.ts  — classifies document type
├── dms-ai-extractor/           index.ts  — extracts fields
├── dms-preview-generator/      index.ts  — generates preview image
├── dms-expiry-reminder/        index.ts  — daily expiry check (cron)
└── dms-session-cleanup/        index.ts  — purge expired temp sessions
```

### 8.3 Polling vs Push

Phase 1 (DMS.5–DMS.8): Use database polling — job queue table is polled by Edge Function on a schedule.

Phase 2+ (DMS.9+): Evaluate Supabase Realtime triggers or pg_cron for event-driven processing.

### 8.4 Error Handling

Failed jobs:
1. Set `status = 'failed'`, increment `retry_count`, set `error_message`
2. If `retry_count >= 3`: mark as `permanently_failed`, send admin notification
3. Always allow manual retry from the AI Review screen

---

## 9. UI/UX Standards

### 9.1 Workspace Pattern

All DMS screens follow the standard ERP workspace:
- List pages: `ERPDataTable` with standard filters and actions
- Record pages: `ERPRecordWorkspaceForm` with section nav tabs
- Child actions: `ERPChildDialogForm` (size `md` for simple forms, `lg` for complex)

### 9.2 Document Record Section Tabs (Standard)

```typescript
const DMS_DOCUMENT_SECTIONS = [
  { id: 'overview',   label: 'Overview',      icon: FileText   },
  { id: 'preview',    label: 'Document',      icon: Eye        },
  { id: 'metadata',   label: 'Metadata',      icon: ListFilter },
  { id: 'links',      label: 'ERP Links',     icon: Link2      },
  { id: 'versions',   label: 'Versions',      icon: GitBranch  },
  { id: 'tags',       label: 'Tags',          icon: Tag        },
  { id: 'ai',         label: 'AI Extraction', icon: Sparkles   },  // DMS.10+
  { id: 'approvals',  label: 'Approvals',     icon: CheckCircle },
  { id: 'expiry',     label: 'Expiry',        icon: CalendarX  },
  { id: 'comments',   label: 'Comments',      icon: MessageSquare },
  { id: 'audit',      label: 'Audit',         icon: History    },
];
```

### 9.3 Status Badge Colors

| Status | Tailwind Color |
|--------|---------------|
| `draft` | `bg-slate-100 text-slate-600` |
| `pending_review` | `bg-yellow-100 text-yellow-700` |
| `approved` | `bg-blue-100 text-blue-700` |
| `active` | `bg-green-100 text-green-700` |
| `rejected` | `bg-red-100 text-red-700` |
| `expired` | `bg-red-200 text-red-800` |
| `archived` | `bg-slate-200 text-slate-600` |
| `superseded` | `bg-purple-100 text-purple-700` |

### 9.4 Confidentiality Badge Colors

| Level | Color |
|-------|-------|
| `internal` | `bg-slate-100 text-slate-500` |
| `company` | `bg-blue-100 text-blue-600` |
| `hr` | `bg-orange-100 text-orange-700` |
| `finance` | `bg-emerald-100 text-emerald-700` |
| `legal` | `bg-purple-100 text-purple-700` |
| `executive` | `bg-red-100 text-red-700` |

### 9.5 AI Confidence Badge Colors

| Level | Color |
|-------|-------|
| `high` | `bg-green-100 text-green-700` |
| `medium` | `bg-yellow-100 text-yellow-700` |
| `low` | `bg-orange-100 text-orange-700` |
| `needs_manual_review` | `bg-red-100 text-red-700` |

---

## 10. Audit and Compliance Standards

### 10.1 Immutable Audit Log

`dms_document_events` is append-only. No UPDATE or DELETE on this table.

RLS policy:
```sql
-- No delete allowed by any user
CREATE POLICY "dms_events_no_delete" ON dms_document_events
FOR DELETE USING (false);

-- No update allowed by any user
CREATE POLICY "dms_events_no_update" ON dms_document_events
FOR UPDATE USING (false);
```

### 10.2 Required Audit Events

These events MUST be logged (no exceptions):
- `uploaded` — when a new document file is received
- `downloaded` — when original file signed URL is generated
- `approved` / `rejected` — all approval actions
- `deleted` — soft delete
- `status_changed` — any status transition
- `access_denied` — when a user is denied access (security monitoring)
- `version_uploaded` — new version added

### 10.3 Data Retention

Retention policies (`dms_retention_policies`) define how long documents are kept.

After retention period expires:
1. Document status changes to `archived`
2. Original files move to archive storage path (future: Supabase Storage cold tier)
3. Event: `archived`

Documents are never hard-deleted via the application. Only manual database administrator action (with audit log entry) may permanently delete.

---

## 11. Numbering Standard

Document numbers use the existing `generateNextReference()` engine.

Phase 1 numbering rule:
```
Rule Code: MASTER_DMS_DOCUMENT
Format: DMS-{YYYY}-{000000}
Example: DMS-2026-000001
```

Type-specific numbering (optional, DMS.3+):
```
Rule Code: MASTER_DMS_TRADE_LICENSE
Format: DMS-TL-{YYYY}-{000000}
```

Add numbering rules to `global_numbering_rules` in DMS.2 migration.

---

## 12. Document Type Management

Document types are managed in the `dms_document_types` table (not hardcoded).

Types can be:
- **System types** (`is_system = true`): Seeded by migration, cannot be deleted, can be deactivated
- **Custom types** (`is_system = false`): Created by admins via DMS Admin screen

Initial 35 system document types are defined in the architecture plan (Section 8.1).

Metadata definitions per type are managed in `dms_metadata_definitions`.

Changes to metadata definitions DO NOT retroactively affect existing documents (existing `dms_document_metadata_values` rows are kept).

---

## 13. Integration with Existing Party Documents Tab

**Current state (pre-DMS):**
- Party records have a basic Documents tab
- Files stored ad-hoc (likely direct Supabase Storage or not yet implemented)
- `party_document_types` lookup table exists but is a simple lookup

**Post-DMS.6 state:**
- Party Documents tab becomes a view into `dms_document_links WHERE entity_type='party'`
- Upload from Party Documents tab creates a full DMS document with `party` link
- `party_document_types` lookup is migrated to `dms_document_types` with category = 'Party Documents'
- Old attachment records (if any) are migrated to `dms_documents` + `dms_document_files`

The migration from pre-DMS to DMS-backed documents will be handled in DMS.6 with a data migration script.

---

## 14. Phase Gate Criteria

Each DMS phase must meet these gates before the next phase begins:

| Gate | Criterion |
|------|-----------|
| DMS.2 | All tables created, RLS enabled, storage buckets created, numbering rule works |
| DMS.3 | Admin screens functional; can create document types with metadata |
| DMS.4 | Document list loads, record form opens, all tabs visible |
| DMS.5 | Upload flow works end-to-end; file stored; session created; dedup works |
| DMS.6 | Party Documents tab shows DMS documents; link creation works |
| DMS.7 | New version upload works; old version accessible |
| DMS.8 | Expiry reminders created; dashboard counts accurate |
| DMS.9 | OCR runs on uploaded PDF; text stored; searchable |
| DMS.10 | AI extracts fields; confidence scores shown |
| DMS.11 | Review queue functional; reviewer can accept/modify/reject; document saves |
| DMS.12 | Full-text search returns relevant results from OCR text |
| DMS.13 | RLS audit passes; confidentiality enforced; all permission checks verified |
