# ERP DMS.1 — AI-Ready Enterprise DMS: Research and Architecture Plan

**Phase:** ERP DMS.1  
**Type:** Research + Architecture Planning (No Implementation)  
**Date:** 2026-06-14  
**Project:** ALGT ERP — Alliance Gulf Transport  
**Status:** PLANNING COMPLETE — Awaiting Sameer approval to proceed to DMS.2  
**Output folder:** `implementation_Review/Phase_DMS_1_Planning/`

---

## 1. Executive Summary

ALGT ERP currently has a basic Party Documents tab (file upload per party record) backed by the `party_document_types` lookup table. This is not an enterprise DMS — it is a simple file attachment system.

The ALGT business operates transport, logistics, scrap, waste, demolition, workshop, and project operations across the UAE. Every business area generates critical documents: trade licenses, insurance policies, vehicle registrations, project contracts, method statements, HSE permits, employee passports, invoices, and hundreds more. Currently these are managed in filing cabinets, email attachments, and shared drives with no expiry tracking, no version control, no audit trail, and no AI intelligence.

This plan designs an **enterprise-grade, AI-ready Document Management System (DMS)** that:
- Centralizes all company documents in a single repository
- Links documents to ERP records (parties, employees, vehicles, projects, finance)
- Uses AI to extract, classify, and suggest metadata from scanned/uploaded documents
- Tracks expiry and renewal with automated reminders
- Enforces granular access control and confidentiality
- Provides full-text search including OCR text
- Integrates with the existing workspace tab system and `ERPRecordWorkspaceForm` standard

The DMS will be built in phases (DMS.2 through DMS.14) following the existing ALGT ERP workspace standards. **Phase DMS.1 is planning only — no code, no migrations, no implementation.**

---

## 2. Research Method

The following research was conducted:
- GitHub/documentation study of 5 major open-source DMS systems
- Review of enterprise AI document processing patterns (Azure AI, OpenAI, Google Document AI)
- Analysis of Supabase Storage capabilities for enterprise file management
- Review of current ALGT ERP architecture (workspace, Party Master, numbering, RBAC, Supabase)
- Study of PostgreSQL full-text search, `tsvector`, `pgvector` for document indexing

---

## 3. Open-Source DMS Comparison

### 3.1 Paperless-ngx

**Repository:** `paperless-ngx/paperless-ngx`  
**Language:** Python (Django) + Angular frontend  
**Stars:** 22,000+  
**License:** GPL-3.0

**Architecture:**
- Django REST API backend
- Celery + Redis task queue for async OCR and classification
- PostgreSQL for metadata; Tantivy/Whoosh for full-text search
- OCRmyPDF + Tesseract for OCR (100+ languages)
- scikit-learn ML classifier (TF-IDF + multi-label) for auto-tagging

**Key Features:**
| Feature | Details |
|---------|---------|
| Document intake | Consume folder, email ingestion, API upload, scanner integration |
| OCR | OCRmyPDF wraps Tesseract; embeds text layer into PDF; preserves original |
| Auto-classification | ML model trained on existing tagged documents; tags, correspondents, document types |
| Metadata | Custom fields (text, number, date, URL, select, monetary), saved views |
| Archive | PDF/A generation from scanned docs; original file always retained |
| Search | Full-text via Tantivy; trigram search; date/tag/correspondent filters |
| Workflow | Triggers on upload, content match, or schedule |
| Permissions | Per-user document visibility; role-based access |
| Storage paths | Dynamic path templates per document type/date |

**Ideas to Adopt for ALGT:**
- ✅ Consume inbox pattern → `dms_upload_sessions` + temporary storage
- ✅ PDF/A archive copy separate from original file
- ✅ OCR text stored on document; fed into full-text search index
- ✅ Storage path templates: `{company}/{year}/{doc_type}/{document_id}/`
- ✅ Duplicate detection by file checksum (SHA-256)
- ✅ Auto-classification as ML suggestion (for future DMS.10+ phases)
- ✅ Custom fields per document type (dynamic metadata definitions)
- ✅ Background task queue for OCR processing
- ✅ Email-to-DMS ingestion (future phase)

**Ideas to Avoid:**
- ❌ Home-lab scope (no multi-tenant enterprise needs)
- ❌ scikit-learn internal classifier — ALGT will use external AI APIs (OpenAI/Azure)
- ❌ Whoosh search engine — ALGT uses PostgreSQL, will use `tsvector` + `pgvector`

---

### 3.2 Mayan EDMS

**Repository:** `mayan-edms/Mayan-EDMS`  
**Language:** Python (Django)  
**License:** Apache 2.0  
**Stars:** 4,000+

**Architecture:**
- Modular Django apps (40+ app modules)
- Celery + RabbitMQ task queue
- Multiple storage backends (local, S3, SFTP, WebDAV)
- OpenAI workflow integration (GPT-driven workflow automation)

**Key Features:**
| Feature | Details |
|---------|---------|
| Document versioning | Multiple file versions per document; page remapping across versions |
| Metadata | User-defined metadata fields per document type; templates; Dublin Core/ISO 23081 |
| Workflow engine | State machine with states, transitions, actions, escalations, expiration |
| Document types | Type-specific metadata, permissions, retention, storage paths |
| Indexing | Dynamic tree indexes built from metadata values |
| Check-in/check-out | Exclusive edit locks |
| Smart links | Auto-link documents based on matching rules |
| Cabinets/folders | Virtual folder organization |
| Events system | Audit trail for every document action |
| AI integration | OpenAI-driven agentic workflow automation (v4.6+) |
| Antivirus | ClamAV integration via file metadata driver |

**Ideas to Adopt for ALGT:**
- ✅ State machine workflow (Draft → Pending Review → Approved → Active → Expired → Archived)
- ✅ User-defined metadata per document type (dynamic metadata definitions system)
- ✅ Document file + version separation (`dms_documents` → `dms_document_versions` → `dms_document_files`)
- ✅ Check-in/check-out model for controlled editing
- ✅ Smart links → `dms_document_links` generic ERP entity linking
- ✅ Events system → `dms_document_events` audit trail
- ✅ Antivirus scan trigger in upload pipeline (placeholder in Phase 1)
- ✅ OpenAI workflow actions → AI extraction jobs linked to workflow engine

**Ideas to Avoid:**
- ❌ 40+ Django app complexity — ALGT DMS will be a focused Supabase/Next.js implementation
- ❌ Complex tree index builder — ALGT will use simpler tag + folder structure

---

### 3.3 Papermerge

**Repository:** `ciur/papermerge` / `papermerge/papermerge-core`  
**Language:** Python (FastAPI) + React frontend  
**License:** Apache 2.0

**Architecture:**
- REST API backend (FastAPI)
- Distributed workers via Redis message queue
- S3-compatible storage (native S3 support; stateless app containers)
- Multiple search engine backends (Xapian, Whoosh, Elasticsearch, Solr)
- Separate OCR worker; separate S3 worker; separate path template worker

**Key Features:**
| Feature | Details |
|---------|---------|
| Desktop-like UI | Dual panel file browser; drag and drop |
| Page management | Delete, reorder, rotate, merge, move, extract individual pages |
| OCR | OCRmyPDF; overlaid text layer; downloadable OCRed document |
| Folder structure | Hierarchical folders + tags; documents organized like a file system |
| Document types | Categories with Jinja path templates |
| Custom fields | Per document type |
| Document versioning | Non-destructive; original always available |
| Multi-user | Per-folder permissions |
| S3 native | Stateless design; workers use S3 as source of truth |

**Ideas to Adopt for ALGT:**
- ✅ S3-compatible storage (Supabase Storage is S3-compatible)
- ✅ Stateless app containers — Supabase Storage as the single storage truth
- ✅ Path template per document type: `dms/{company}/{year}/{type_code}/{document_id}/`
- ✅ Non-destructive versioning: original file always retained in `dms-originals` bucket path
- ✅ Separate background workers for OCR/AI (Supabase Edge Functions per phase)
- ✅ Page management UI for scanned documents (future phase)

**Ideas to Avoid:**
- ❌ Desktop file browser paradigm — ALGT DMS is ERP-integrated, not a standalone app
- ❌ Complex dual-panel UI as main pattern

---

### 3.4 Teedy (Sismics Docs)

**Repository:** `sismics/docs`  
**Language:** Java (Jersey REST) + AngularJS frontend  
**License:** GPL-2.0

**Key Features:**
| Feature | Details |
|---------|---------|
| Lightweight DMS | Simple, clean document storage |
| Tags | Flexible tagging |
| ACL | Document and folder-level access control |
| Full-text search | Lucene-based; searches OCR text |
| REST API | Clean API for integration |
| PDF preview | Built-in document preview |
| User/group access | Per-user and per-group permissions |

**Ideas to Adopt for ALGT:**
- ✅ Simple tag model (add/remove tags freely)
- ✅ Document preview generation (thumbnail/PDF preview stored separately)
- ✅ Clean ACL model: per-user, per-role, per-confidentiality-level

**Ideas to Avoid:**
- ❌ Java/Jersey stack — not relevant to ALGT's Node.js/Supabase stack
- ❌ Limited enterprise features (no workflow, no expiry, no AI)

---

### 3.5 OpenKM Community + LogicalDOC Community

**OpenKM:**  
**License:** Freeware (Community); GPL (source)  
**Language:** Java  
**Stack:** Spring + Hibernate + Lucene + JBoss/Tomcat

**Key Features:**
- Hierarchical folder repository
- Versioning + check-in/check-out
- OKMFlow: visual workflow engine (no-code BPM)
- OCR + metadata extraction from scanned files
- AI + RAG integration (Mistral, OpenAI, local LLMs) for intelligent search
- GDPR compliance (retention, right-to-erasure)
- Records management (ISO 15489)
- Full REST API
- SAP, Office 365, Google Workspace connectors
- Multi-language OCR indexing

**LogicalDOC Community:**  
**Language:** Java  
**Key Features:**
- Folder-based document organization
- Multi-language full-text indexing
- Tags + metadata templates
- Version control + audit
- Workflow engine (approval routing)
- Microsoft Office add-in
- Event-driven no-code workflows

**Ideas to Adopt for ALGT:**
- ✅ Records management compliance framing (ISO 15489 — retention periods, disposition)
- ✅ AI + RAG for intelligent search (pgvector in PostgreSQL for future DMS.12+)
- ✅ Retention policies per document type (`dms_retention_policies`)
- ✅ GDPR-style right-to-archive/pseudonymize sensitive HR documents
- ✅ Multi-language OCR (English + Arabic OCR packs for Tesseract — important for UAE)
- ✅ Event-driven no-code workflow triggers
- ✅ Office 365 / email integration pattern (future phase)

---

## 4. Lessons from Research — Consolidated for ALGT

| Lesson | Source | ALGT Design Decision |
|--------|--------|----------------------|
| Always retain the original file | All systems | `file_role: 'original'` in `dms_document_files`; originals are immutable |
| Checksum deduplication | Paperless-ngx | SHA-256 on upload; reject or flag duplicates |
| Separate metadata from files | Mayan EDMS | `dms_documents` (metadata) + `dms_document_files` (storage) |
| Background task queue | Paperless-ngx, Papermerge | Supabase Edge Functions + `dms_upload_sessions` job queue |
| Dynamic metadata per document type | Paperless-ngx, Mayan, Papermerge | `dms_metadata_definitions` + `dms_document_metadata_values` |
| Non-destructive versioning | Papermerge, Mayan | New version = new `dms_document_versions` row; old version kept |
| State machine workflow | Mayan EDMS | `dms_document_workflows` with states + transitions |
| Expiry tracking | Mayan, OpenKM | `expiry_date` + `dms_expiry_reminders` engine |
| Full-text search on OCR text | All systems | PostgreSQL `tsvector` on `dms_document_files.ocr_text` |
| AI must go through human review first | Best practice | `dms_review_queue` — AI suggestions never auto-save |
| Confidentiality tiers | OpenKM, LogicalDOC | 6-tier confidentiality model |
| Multi-language OCR | OpenKM, LogicalDOC | English + Arabic Tesseract packs (UAE context) |
| Path templates per doc type | Papermerge | `dms/{company_id}/{year}/{type_code}/{doc_id}/` |
| S3-compatible storage | Papermerge | Supabase Storage (S3-compatible) as single storage truth |

---

## 5. ALGT DMS Vision

### 5.1 Three-Layer Architecture

```
Layer 1: DMS Repository (Central document store)
  ↕ ERP link bridge
Layer 2: ERP-linked documents (per Party, Vehicle, Employee, Project, etc.)
  ↕ AI pipeline
Layer 3: AI-assisted intake (Upload → OCR → Extract → Review → Confirm)
```

### 5.2 Core Design Principles

1. **AI assists, humans decide** — All AI extractions go to review queue; no auto-save
2. **One document, many links** — A single document can link to multiple ERP records
3. **Immutable originals** — Uploaded files are never overwritten; new versions create new records
4. **RLS everywhere** — Supabase Row Level Security enforced on all DMS tables
5. **Confidentiality first** — Access controlled by confidentiality tier + role + entity permission
6. **Expiry-aware** — Every document with an `expiry_date` gets automatic reminders
7. **Fully audited** — Every view, download, edit, approval, version is logged
8. **ERP-native** — Built on `ERPRecordWorkspaceForm` + `ERPChildDialogForm`; same UX as rest of ERP
9. **Provider-agnostic AI** — OCR/AI behind abstraction interfaces; swap providers without redesign
10. **Arabic + English** — OCR must support both languages from day one

---

## 6. AI-Ready Scan/Upload-to-Fill Workflow

### 6.1 Complete Pipeline

```
[User Action]
Upload / Scan / Drag-Drop / Email (future)
         ↓
[DMS Intake]
  1. Validate file type (PDF, JPG, PNG, TIFF, DOCX, XLSX, etc.)
  2. Generate SHA-256 checksum
  3. Check for duplicates in dms_document_files
  4. Store file in Supabase Storage: dms/temp/{session_id}/file.ext
  5. Create dms_upload_sessions record (status: 'uploaded')
  6. Create dms_ai_extraction_jobs record (status: 'pending')
         ↓
[Virus Scan Placeholder]
  7. Flag file as 'scanning' → Update to 'clean' / 'infected'
  8. Reject infected files (do NOT proceed)
         ↓
[OCR Processing] (Supabase Edge Function or server action)
  9. Detect if file already has text layer (digital PDF)
  10. Run OCR if scanned/image-only (Tesseract or Azure OCR)
  11. Extract text → dms_document_files.ocr_text
  12. Store page count, language detection result
  13. Update job status: 'ocr_complete'
         ↓
[AI Classification] (provider-agnostic)
  14. Send OCR text to DocumentAiClassifier
  15. Receive: suggested_document_type_id + confidence score
  16. Update dms_ai_extraction_results: suggested_document_type_id, confidence
         ↓
[AI Field Extraction] (provider-agnostic)
  17. Load extraction schema for suggested document type
  18. Send OCR text + schema to DocumentAiExtractor
  19. Receive: extracted_fields_json (typed key-value pairs + confidence per field)
  20. ERP suggestion: search Party/Employee/Vehicle by extracted names/numbers
  21. Update dms_ai_extraction_results: extracted_fields_json, suggested_links_json
  22. Update job status: 'ai_complete'
         ↓
[Human Review Queue]
  23. Add to dms_review_queue: reviewer_assigned, priority
  24. Notify reviewer (in-app notification + email future)
  25. Reviewer opens AI Review Screen:
      - Left: Document preview (PDF viewer or image)
      - Middle: AI extracted fields with confidence badges
      - Right: Suggested ERP links (Party, Employee, Vehicle, Project)
  26. Reviewer accepts / edits / rejects each field
  27. Reviewer assigns final document type
  28. Reviewer confirms ERP links
  29. Reviewer sets confidentiality level
  30. Reviewer clicks "Confirm & Save"
         ↓
[Document Save]
  31. Create dms_documents record (status: 'pending_review' → 'approved' or 'active')
  32. Move file from temp to final path: dms/{company_id}/{year}/{type_code}/{doc_id}/original.ext
  33. Create dms_document_files record
  34. Create dms_document_versions record (version 1)
  35. Save confirmed metadata → dms_document_metadata_values
  36. Create dms_document_links records (ERP links)
  37. Update full-text search index (tsvector)
  38. Create dms_expiry_reminders if expiry_date set
  39. Write dms_document_events: 'uploaded', 'ai_extracted', 'reviewed', 'approved', 'linked'
  40. Delete temp session
```

### 6.2 Document Intake Methods

| Method | Phase | Notes |
|--------|-------|-------|
| Manual file upload (web UI) | DMS.5 | Primary initial method |
| Drag and drop | DMS.5 | Via workspace upload form |
| Bulk upload (multiple files) | DMS.5 | Batch session |
| Scanner folder watch | DMS.9+ | Network scanner → monitored folder |
| Email-to-DMS inbox | DMS.13+ | Parse email attachments |
| Mobile photo/scan | DMS.14+ | Mobile-optimized upload |
| API upload | DMS.5+ | REST endpoint for external systems |

---

## 7. AI Provider Abstraction Architecture

### 7.1 Provider Interface Definitions (TypeScript concepts)

```typescript
// ── OCR Provider ──────────────────────────────────────────────────────────
interface DocumentOcrProvider {
  name: string;  // 'tesseract' | 'azure_document_intelligence' | 'google_document_ai'
  extractText(filePath: string, options: OcrOptions): Promise<OcrResult>;
}

interface OcrResult {
  text: string;
  pageCount: number;
  language: string;
  confidence: number; // 0–1
  pages: OcrPage[];
  provider: string;
  modelVersion: string;
  durationMs: number;
}

// ── AI Classifier ──────────────────────────────────────────────────────────
interface DocumentAiClassifier {
  name: string;  // 'openai_gpt4' | 'azure_openai' | 'google_gemini' | 'local_llm'
  classify(ocrText: string, knownTypes: DocumentTypeSchema[]): Promise<ClassificationResult>;
}

interface ClassificationResult {
  suggestedTypeCode: string;
  confidence: 'high' | 'medium' | 'low' | 'needs_manual_review';
  confidenceScore: number; // 0–1
  reasoning: string;
  alternativeTypes: { typeCode: string; score: number }[];
}

// ── AI Extractor ──────────────────────────────────────────────────────────
interface DocumentAiExtractor {
  name: string;
  extract(ocrText: string, schema: ExtractionSchema): Promise<ExtractionResult>;
}

interface ExtractionResult {
  fields: ExtractionField[];
  suggestedLinks: SuggestedErpLink[];
  expiryDateSuggestion: string | null;
  rawResponseJson: unknown;
  provider: string;
  durationMs: number;
}

interface ExtractionField {
  fieldName: string;
  extractedValue: string | null;
  confidence: 'high' | 'medium' | 'low' | 'needs_manual_review';
  sourceTextSnippet: string | null;
  dataType: 'text' | 'date' | 'number' | 'boolean';
}

// ── Suggestion Engine ─────────────────────────────────────────────────────
interface DocumentSuggestionEngine {
  suggestErpLinks(extractedFields: ExtractionField[]): Promise<SuggestedErpLink[]>;
  detectDuplicate(sha256Hash: string, ocrText: string): Promise<DuplicateCheckResult>;
}
```

### 7.2 Provider Configuration

Each provider is configured via environment variables or a `dms_ai_providers` config table:

| Provider | OCR | Classification | Extraction | Phase |
|----------|-----|----------------|------------|-------|
| Tesseract (local) | ✅ | ❌ | ❌ | DMS.9 |
| Azure Document Intelligence | ✅ | ✅ | ✅ | DMS.10+ |
| Azure OpenAI GPT-4.1 | ❌ | ✅ | ✅ | DMS.10+ |
| Google Document AI | ✅ | ✅ | ✅ | Future |
| AWS Textract | ✅ | ✅ | ✅ | Future |
| OpenAI GPT-4o | ❌ | ✅ | ✅ | DMS.10+ |
| Local LLM (Ollama) | ❌ | ✅ | ✅ | Future |

**Recommended Phase 1 (DMS.10):** Azure Document Intelligence for layout + OCR, Azure OpenAI GPT-4.1 for classification and extraction. This combination achieves 95–99% accuracy on structured forms.

---

## 8. Document Type and Metadata Architecture

### 8.1 Document Type Catalogue (Initial)

| Code | Name | Category | Expiry Tracking | Confidentiality Default | Approval Required |
|------|------|----------|-----------------|-------------------------|-------------------|
| `TRADE_LICENSE` | Trade License | Company Documents | Yes (annual) | Company Confidential | Yes |
| `MOA` | Memorandum of Association | Legal | No | Legal Confidential | Yes |
| `AOA` | Articles of Association | Legal | No | Legal Confidential | Yes |
| `TRN_CERTIFICATE` | TRN Certificate | Finance | No | Finance Confidential | No |
| `VAT_CERTIFICATE` | VAT Certificate | Finance | No | Finance Confidential | No |
| `INSURANCE_POLICY` | Insurance Policy | Insurance | Yes (annual) | Company Confidential | Yes |
| `BANK_GUARANTEE` | Bank Guarantee | Finance | Yes | Finance Confidential | Yes |
| `POWER_OF_ATTORNEY` | Power of Attorney | Legal | Yes | Legal Confidential | Yes |
| `PASSPORT_COPY` | Passport Copy | HR | Yes (10yr) | HR Confidential | No |
| `EMIRATES_ID` | Emirates ID | HR | Yes (5yr) | HR Confidential | No |
| `VISA` | Residence Visa | HR | Yes (2yr) | HR Confidential | No |
| `LABOUR_CARD` | Labour Card | HR | Yes (2yr) | HR Confidential | No |
| `DRIVING_LICENSE` | Driving License | HR | Yes | HR Confidential | No |
| `MEDICAL_INSURANCE` | Medical Insurance Card | HR | Yes (annual) | HR Confidential | No |
| `VEHICLE_REGISTRATION` | Vehicle Registration | Fleet | Yes (annual) | Internal | No |
| `VEHICLE_INSURANCE` | Vehicle Insurance | Fleet | Yes (annual) | Internal | Yes |
| `EQUIPMENT_REGISTRATION` | Equipment Registration | Fleet | Yes | Internal | No |
| `CALIBRATION_CERTIFICATE` | Calibration Certificate | Fleet | Yes | Internal | Yes |
| `CICPA_PASS` | CICPA Pass | HSE | Yes | Internal | Yes |
| `ADNOC_GATE_PASS` | ADNOC Gate Pass | HSE | Yes | Internal | Yes |
| `SITE_ACCESS_PERMIT` | Site Access Permit | HSE | Yes | Internal | Yes |
| `ISO_CERTIFICATE` | ISO Certificate | Quality | Yes (3yr) | Company Confidential | Yes |
| `PREQUALIFICATION_DOC` | Prequalification Document | Business Dev | Yes | Internal | Yes |
| `PROJECT_CONTRACT` | Project Contract | Projects | Yes | Legal Confidential | Yes |
| `SUBCONTRACT` | Subcontract Agreement | Projects | Yes | Legal Confidential | Yes |
| `METHOD_STATEMENT` | Method Statement (MS) | HSE | No | Internal | Yes |
| `RISK_ASSESSMENT` | Risk Assessment (TRA) | HSE | No | Internal | Yes |
| `HSE_PERMIT` | HSE Permit to Work | HSE | Yes | Internal | Yes |
| `INSPECTION_REPORT` | Inspection Report | Quality | No | Internal | No |
| `PURCHASE_ORDER` | Purchase Order | Finance | No | Finance Confidential | No |
| `INVOICE` | Invoice | Finance | No | Finance Confidential | No |
| `DELIVERY_NOTE` | Delivery Note | Operations | No | Internal | No |
| `WEIGHBRIDGE_TICKET` | Weighbridge Ticket | Operations | No | Internal | No |
| `BANK_LETTER` | Bank Letter | Finance | No | Finance Confidential | No |
| `NOC` | No Objection Certificate | Legal | Yes | Internal | No |
| `OTHER` | Other Document | General | No | Internal | No |

### 8.2 Dynamic Metadata System

Each document type has a set of custom metadata fields defined in `dms_metadata_definitions`.

**Supported field types:**

| Type | Description |
|------|-------------|
| `text` | Single-line text |
| `textarea` | Multi-line text |
| `number` | Integer or decimal |
| `date` | ISO date |
| `datetime` | ISO datetime |
| `boolean` | Yes/No |
| `select` | Single option from predefined list |
| `multi_select` | Multiple options |
| `party_ref` | Reference to parties.id |
| `employee_ref` | Reference to employees.id (future) |
| `vehicle_ref` | Reference to vehicles.id (future) |
| `project_ref` | Reference to projects.id (future) |
| `currency` | Currency amount |
| `country_ref` | Reference to countries.id |
| `emirate_ref` | Reference to emirates.id |
| `json` | Raw JSON for complex extractions |

---

## 9. Database Schema Proposal

All tables use `BIGINT` primary keys. Timestamps are `TIMESTAMPTZ`. Soft delete via `deleted_at`.

### 9.1 Core Tables

#### `dms_document_categories`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `category_code` | VARCHAR UNIQUE | e.g., `LEGAL`, `HR`, `FLEET`, `HSE` |
| `name_en` | VARCHAR | Display name |
| `name_ar` | VARCHAR NULL | Arabic name |
| `icon` | VARCHAR NULL | Lucide icon name |
| `sort_order` | INT | |
| `is_active` | BOOLEAN | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

#### `dms_document_types`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `type_code` | VARCHAR UNIQUE | e.g., `TRADE_LICENSE` |
| `name_en` | VARCHAR | |
| `name_ar` | VARCHAR NULL | |
| `category_id` | BIGINT FK → dms_document_categories | |
| `requires_expiry_tracking` | BOOLEAN | |
| `default_confidentiality` | VARCHAR | `internal`, `company`, `hr`, `finance`, `legal`, `executive` |
| `requires_approval` | BOOLEAN | |
| `default_retention_days` | INT NULL | |
| `ai_extraction_schema` | JSONB NULL | Schema for AI extraction |
| `allowed_entity_types` | TEXT[] | `['party', 'employee', 'vehicle', 'project']` |
| `is_system` | BOOLEAN | Seeded by system |
| `is_active` | BOOLEAN | |
| `sort_order` | INT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

#### `dms_metadata_definitions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_type_id` | BIGINT FK → dms_document_types | |
| `field_code` | VARCHAR | Machine key, e.g., `license_number` |
| `field_label_en` | VARCHAR | |
| `field_label_ar` | VARCHAR NULL | |
| `field_type` | VARCHAR | See field types above |
| `is_required` | BOOLEAN | |
| `is_ai_extractable` | BOOLEAN | Include in AI extraction schema |
| `ai_field_hint` | VARCHAR NULL | Prompt hint for AI |
| `options_json` | JSONB NULL | For select/multi_select fields |
| `sort_order` | INT | |
| `is_active` | BOOLEAN | |

#### `dms_documents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_no` | VARCHAR UNIQUE | From numbering engine: `DMS-2026-000001` |
| `title` | VARCHAR | |
| `description` | TEXT NULL | |
| `document_type_id` | BIGINT FK → dms_document_types | |
| `category_id` | BIGINT FK → dms_document_categories | |
| `status` | VARCHAR | `draft`, `pending_review`, `approved`, `rejected`, `active`, `expired`, `archived`, `superseded` |
| `confidentiality_level` | VARCHAR | `internal`, `company`, `hr`, `finance`, `legal`, `executive` |
| `owner_user_id` | BIGINT FK → user_profiles | |
| `owning_company_id` | BIGINT FK → owner_companies | |
| `owning_branch_id` | BIGINT FK → branches NULL | |
| `issue_date` | DATE NULL | |
| `expiry_date` | DATE NULL | |
| `reminder_policy_id` | BIGINT FK NULL → dms_retention_policies | |
| `current_version_id` | BIGINT FK NULL → dms_document_versions | |
| `ocr_status` | VARCHAR | `not_required`, `pending`, `processing`, `complete`, `failed` |
| `ai_status` | VARCHAR | `not_required`, `pending`, `processing`, `complete`, `failed`, `skipped` |
| `review_status` | VARCHAR | `not_required`, `pending`, `in_review`, `approved`, `rejected` |
| `is_archived` | BOOLEAN | |
| `archived_at` | TIMESTAMPTZ NULL | |
| `created_by`, `updated_by` | BIGINT FK | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ NULL | Soft delete |

**Indexes:**
- `idx_dms_documents_type` on `document_type_id`
- `idx_dms_documents_status` on `status`
- `idx_dms_documents_expiry` on `expiry_date` WHERE `expiry_date IS NOT NULL`
- `idx_dms_documents_company_branch` on `(owning_company_id, owning_branch_id)`
- GIN index on `document_no` for trigram search

#### `dms_document_files`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK → dms_documents | |
| `version_id` | BIGINT FK → dms_document_versions NULL | |
| `file_role` | VARCHAR | `original`, `processed`, `preview`, `archive_pdf_a` |
| `storage_bucket` | VARCHAR | `dms-documents` |
| `storage_path` | VARCHAR | Full path in bucket |
| `file_name` | VARCHAR | Original filename |
| `mime_type` | VARCHAR | |
| `file_size_bytes` | BIGINT | |
| `sha256_hash` | VARCHAR(64) UNIQUE per role | Deduplication |
| `page_count` | INT NULL | |
| `ocr_text` | TEXT NULL | Extracted OCR text |
| `ocr_text_search` | TSVECTOR | Generated column from ocr_text |
| `language` | VARCHAR NULL | Detected language code |
| `created_at` | TIMESTAMPTZ | |

**Indexes:**
- `idx_dms_files_document` on `document_id`
- `idx_dms_files_hash` on `sha256_hash` for deduplication
- GIN index on `ocr_text_search` for full-text search

#### `dms_document_versions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK → dms_documents | |
| `version_number` | INT | 1, 2, 3... |
| `version_label` | VARCHAR NULL | e.g., `v1.0`, `2026 Renewal` |
| `change_notes` | TEXT NULL | |
| `created_by` | BIGINT FK | |
| `created_at` | TIMESTAMPTZ | |

#### `dms_tags`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `tag_name` | VARCHAR UNIQUE | |
| `color_hex` | VARCHAR NULL | For UI display |
| `is_active` | BOOLEAN | |

#### `dms_document_tags`
| Column | Type | Notes |
|--------|------|-------|
| `document_id` | BIGINT FK | |
| `tag_id` | BIGINT FK | |
| PRIMARY KEY | `(document_id, tag_id)` | |

#### `dms_document_metadata_values`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK → dms_documents | |
| `definition_id` | BIGINT FK → dms_metadata_definitions | |
| `value_text` | TEXT NULL | |
| `value_number` | NUMERIC NULL | |
| `value_date` | DATE NULL | |
| `value_boolean` | BOOLEAN NULL | |
| `value_json` | JSONB NULL | For multi-select, complex types |
| `created_by` | BIGINT FK | |
| `created_at` | TIMESTAMPTZ | |

#### `dms_document_links`
Generic ERP entity linking — one document to many ERP records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK → dms_documents | |
| `entity_type` | VARCHAR | `party`, `employee`, `vehicle`, `equipment`, `project`, `contract`, `purchase_order`, `invoice`, `job_card`, `hse_incident`, `company`, `branch`, `bank` |
| `entity_id` | BIGINT | ID in the referenced table |
| `link_role` | VARCHAR NULL | `primary`, `related`, `referenced_in`, `supersedes` |
| `is_primary` | BOOLEAN | One primary link per document recommended |
| `linked_by` | BIGINT FK | |
| `linked_at` | TIMESTAMPTZ | |
| `notes` | TEXT NULL | |

**Indexes:**
- Unique on `(document_id, entity_type, entity_id)`
- `idx_dms_links_entity` on `(entity_type, entity_id)` — used to fetch all documents for a Party/Vehicle/etc.

#### `dms_upload_sessions`
Temporary intake sessions before document is fully processed.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `session_code` | VARCHAR UNIQUE | UUID-style session key |
| `status` | VARCHAR | `uploaded`, `scanning`, `ocr_pending`, `ocr_processing`, `ai_pending`, `ai_processing`, `review_pending`, `completed`, `failed`, `expired` |
| `original_filename` | VARCHAR | |
| `mime_type` | VARCHAR | |
| `file_size_bytes` | BIGINT | |
| `sha256_hash` | VARCHAR(64) | |
| `temp_storage_path` | VARCHAR | Path in temp bucket |
| `is_duplicate` | BOOLEAN | SHA256 duplicate detected |
| `duplicate_document_id` | BIGINT NULL FK | |
| `uploaded_by` | BIGINT FK | |
| `uploaded_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | Sessions expire if not reviewed within N days |
| `completed_at` | TIMESTAMPTZ NULL | |
| `error_message` | TEXT NULL | |

#### `dms_ai_extraction_jobs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `upload_session_id` | BIGINT FK → dms_upload_sessions | |
| `document_id` | BIGINT FK NULL → dms_documents | Set after review completes |
| `job_type` | VARCHAR | `ocr`, `classify`, `extract`, `suggest_links` |
| `provider` | VARCHAR | `tesseract`, `azure_document_intelligence`, `openai_gpt4` |
| `model` | VARCHAR NULL | Model version |
| `status` | VARCHAR | `pending`, `processing`, `complete`, `failed`, `skipped` |
| `started_at` | TIMESTAMPTZ NULL | |
| `completed_at` | TIMESTAMPTZ NULL | |
| `duration_ms` | INT NULL | |
| `error_message` | TEXT NULL | |
| `retry_count` | INT DEFAULT 0 | |

#### `dms_ai_extraction_results`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `job_id` | BIGINT FK → dms_ai_extraction_jobs | |
| `upload_session_id` | BIGINT FK | |
| `suggested_document_type_id` | BIGINT FK NULL | |
| `classification_confidence` | VARCHAR | `high`, `medium`, `low`, `needs_manual_review` |
| `classification_score` | NUMERIC(4,3) | 0.000–1.000 |
| `extracted_fields_json` | JSONB | Array of `{field_name, value, confidence, source_snippet}` |
| `suggested_links_json` | JSONB | Array of `{entity_type, entity_id, entity_name, match_reason}` |
| `expiry_date_suggestion` | DATE NULL | AI-suggested expiry date |
| `raw_ocr_text` | TEXT NULL | |
| `raw_response_json` | JSONB NULL | Full provider response |
| `reviewed_by` | BIGINT FK NULL | |
| `reviewed_at` | TIMESTAMPTZ NULL | |
| `review_action` | VARCHAR NULL | `accepted`, `modified`, `rejected` |

#### `dms_review_queue`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `upload_session_id` | BIGINT FK | |
| `assigned_to` | BIGINT FK NULL → user_profiles | |
| `priority` | VARCHAR | `urgent`, `normal`, `low` |
| `status` | VARCHAR | `pending`, `in_review`, `completed`, `rejected`, `escalated` |
| `queued_at` | TIMESTAMPTZ | |
| `review_started_at` | TIMESTAMPTZ NULL | |
| `review_completed_at` | TIMESTAMPTZ NULL | |
| `notes` | TEXT NULL | |

#### `dms_document_workflows`
Defines workflow templates for document types.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `workflow_code` | VARCHAR UNIQUE | |
| `name` | VARCHAR | |
| `document_type_id` | BIGINT FK NULL | NULL = all types |
| `is_active` | BOOLEAN | |

#### `dms_document_workflow_steps`
States in a workflow.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `workflow_id` | BIGINT FK | |
| `step_code` | VARCHAR | |
| `step_name` | VARCHAR | |
| `is_initial` | BOOLEAN | |
| `is_final` | BOOLEAN | |
| `requires_role` | VARCHAR NULL | Role code for this step |
| `sort_order` | INT | |

#### `dms_document_approvals`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK | |
| `workflow_step_id` | BIGINT FK | |
| `action` | VARCHAR | `approved`, `rejected`, `escalated` |
| `actioned_by` | BIGINT FK | |
| `actioned_at` | TIMESTAMPTZ | |
| `comments` | TEXT NULL | |

#### `dms_document_access_rules`
Override access rules for specific documents or document types.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK NULL | NULL = type-level rule |
| `document_type_id` | BIGINT FK NULL | |
| `principal_type` | VARCHAR | `user`, `role`, `branch`, `company` |
| `principal_id` | BIGINT | |
| `permission` | VARCHAR | `view`, `download`, `edit`, `delete`, `approve` |
| `granted` | BOOLEAN | True = allow; False = explicit deny |

#### `dms_document_events`
Immutable audit log.

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK | |
| `event_type` | VARCHAR | See event types below |
| `description` | TEXT NULL | |
| `performed_by` | BIGINT FK | |
| `performed_at` | TIMESTAMPTZ | |
| `metadata_json` | JSONB NULL | Extra context |

**Event types:**
`uploaded`, `ocr_started`, `ocr_completed`, `ocr_failed`, `ai_extracted`, `ai_failed`, `reviewed`, `approved`, `rejected`, `linked`, `link_removed`, `downloaded`, `previewed`, `version_uploaded`, `metadata_changed`, `status_changed`, `expired`, `expiry_reminder_sent`, `archived`, `restored`, `deleted`, `access_denied`, `shared_externally`

#### `dms_expiry_reminders`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK | |
| `reminder_days_before` | INT | 90, 60, 30, 14, 7 |
| `reminder_date` | DATE | Computed: expiry_date - reminder_days_before |
| `status` | VARCHAR | `pending`, `sent`, `dismissed` |
| `sent_at` | TIMESTAMPTZ NULL | |
| `recipients_json` | JSONB NULL | Array of user_ids or email addresses |

#### `dms_retention_policies`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `policy_code` | VARCHAR UNIQUE | |
| `name` | VARCHAR | |
| `retain_for_days` | INT | |
| `action_on_expiry` | VARCHAR | `archive`, `notify`, `delete_prompt` |
| `applies_to_types` | TEXT[] NULL | Document type codes |

#### `dms_document_comments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK | |
| `comment_text` | TEXT | |
| `created_by` | BIGINT FK | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `dms_saved_searches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `user_id` | BIGINT FK | |
| `search_name` | VARCHAR | |
| `filter_json` | JSONB | Serialized filter state |
| `is_shared` | BOOLEAN | |

---

## 10. Supabase Storage Architecture

### 10.1 Bucket Design

```
Buckets:
├── dms-documents      (private) — all permanent document files
│   └── {company_id}/{year}/{type_code}/{document_id}/
│       ├── original.{ext}       → file_role: 'original'
│       ├── processed.pdf        → file_role: 'processed' (OCR embedded)
│       ├── archive.pdf          → file_role: 'archive_pdf_a' (PDF/A standard)
│       └── preview.webp         → file_role: 'preview' (thumbnail)
│
└── dms-temp           (private) — upload sessions, purged after completion
    └── sessions/{session_id}/
        └── upload.{ext}
```

### 10.2 Storage Rules

| Rule | Implementation |
|------|----------------|
| Private buckets | No public access; all access via signed URLs |
| Signed URL generation | Server-side only after `hasPermission(user, 'dms.documents.download', documentId)` check |
| File size limit | PDF/images: 50MB. Office docs: 25MB. Enforce in server action before upload |
| Allowed MIME types | `application/pdf`, `image/jpeg`, `image/png`, `image/tiff`, `application/msword`, `application/vnd.openxmlformats-officedocument.*` |
| Storage path immutability | Once a file is saved at a path, path never changes. New version = new path |
| Original retention | Original file is NEVER overwritten. Even after versioning |
| SHA-256 deduplication | Compute checksum before upload; reject or flag duplicates with existing document reference |
| RLS on storage | Supabase Storage RLS policy enforces document access rules |

### 10.3 Signed URL Flow

```typescript
// Server action — generate signed URL after permission check
async function getDmsDocumentUrl(documentId: number, fileRole: 'original' | 'preview') {
  const authContext = await getAuthContext();
  const permission = fileRole === 'original' 
    ? 'dms.documents.download' 
    : 'dms.documents.view';
  
  if (!await hasPermission(authContext.userId, permission, { documentId })) {
    throw new Error('Access denied');
  }
  
  const file = await getDocumentFile(documentId, fileRole);
  const { data } = await supabase.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, 3600); // 1 hour expiry
  
  return data.signedUrl;
}
```

---

## 11. Full-Text Search Strategy

### 11.1 Search Tiers

| Tier | Method | Phase |
|------|--------|-------|
| Metadata search | SQL filter (title, document_no, type, status, tags) | DMS.4 |
| Advanced filters | Parameterized SQL (date range, expiry, links, category) | DMS.4 |
| OCR full-text search | PostgreSQL `tsvector` on `dms_document_files.ocr_text` | DMS.12 |
| Tag search | SQL join on `dms_document_tags` | DMS.4 |
| Entity-linked search | SQL join on `dms_document_links` | DMS.6 |
| Expiry search | SQL filter on `expiry_date` | DMS.8 |
| Semantic search | `pgvector` + embeddings (OpenAI `text-embedding-3-small`) | DMS.12+ |

### 11.2 PostgreSQL Full-Text Index

```sql
-- Generated tsvector column on document files for OCR text
ALTER TABLE dms_document_files
  ADD COLUMN ocr_text_search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(ocr_text, ''))
  ) STORED;

CREATE INDEX idx_dms_files_fts ON dms_document_files USING GIN(ocr_text_search);

-- Combined search including title and document number
CREATE INDEX idx_dms_documents_search ON dms_documents USING GIN(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(document_no, ''))
);
```

### 11.3 Arabic Language Support

```sql
-- For Arabic OCR text, separate tsvector with 'arabic' dictionary
ALTER TABLE dms_document_files
  ADD COLUMN ocr_text_search_ar tsvector
  GENERATED ALWAYS AS (
    to_tsvector('arabic', coalesce(ocr_text, ''))
  ) STORED;
```

**Note:** Arabic `ts_config` requires installing the appropriate PostgreSQL text search configuration. Verify availability in Supabase before DMS.12.

### 11.4 Semantic Search (Future DMS.12+)

```sql
-- pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE dms_document_files
  ADD COLUMN embedding vector(1536); -- OpenAI text-embedding-3-small

CREATE INDEX ON dms_document_files USING hnsw(embedding vector_cosine_ops);
```

---

## 12. Permissions and Security Model

### 12.1 Confidentiality Levels

| Level | Code | Who Can Access |
|-------|------|----------------|
| Public/Internal | `internal` | All authenticated users |
| Company Confidential | `company` | All users in the owning company |
| HR Confidential | `hr` | HR managers and above |
| Finance Confidential | `finance` | Finance managers and above |
| Legal Confidential | `legal` | Legal team + management |
| Executive Restricted | `executive` | C-level executives only |

### 12.2 Permission Codes

```
dms.documents.view           — View document metadata
dms.documents.preview        — View document preview/thumbnail
dms.documents.download       — Download original file
dms.documents.upload         — Upload new document
dms.documents.edit           — Edit document metadata
dms.documents.delete         — Soft-delete document
dms.documents.archive        — Archive document
dms.documents.approve        — Approve/reject document in workflow
dms.documents.review_ai      — Review AI extraction queue
dms.documents.manage_types   — Manage document types and metadata definitions
dms.documents.manage_tags    — Manage tags
dms.documents.manage_security — Manage access rules
dms.documents.share_external  — Generate external sharing links (future)
dms.admin                    — Full DMS administration
```

### 12.3 RLS Enforcement

```sql
-- Example RLS policy for dms_documents
CREATE POLICY "dms_documents_select" ON dms_documents
FOR SELECT USING (
  -- User is authenticated
  auth.uid() IS NOT NULL
  AND (
    -- User has global view permission
    EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid()
      AND permission_code = 'dms.documents.view'
    )
    OR
    -- User is document owner
    owner_user_id = (SELECT id FROM user_profiles WHERE auth_id = auth.uid())
  )
  AND (
    -- Confidentiality check
    confidentiality_level = 'internal'
    OR (confidentiality_level = 'company' AND owning_company_id IN (
      SELECT company_id FROM user_branch_assignments WHERE user_id = auth.uid()
    ))
    OR (confidentiality_level IN ('hr', 'finance', 'legal', 'executive') AND EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid()
      AND permission_code = 'dms.documents.view.' || confidentiality_level
    ))
  )
);
```

---

## 13. Document Status Lifecycle

```
                    ┌─────────────┐
                    │    Draft    │
                    └──────┬──────┘
                           │ Upload complete
                    ┌──────▼──────┐
                    │  Pending    │
                    │   Review    │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐  ┌───▼────┐  ┌──▼──────┐
        │ Approved  │  │Rejected│  │ Active  │
        └─────┬─────┘  └────────┘  └──┬──────┘
              │ Admin confirm          │
        ┌─────▼──────────────────────▼──┐
        │           Active               │
        └────────────────┬───────────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
        ┌─────▼────┐ ┌───▼───┐ ┌──▼────────┐
        │ Expired  │ │Archived│ │Superseded │
        └──────────┘ └───────┘ └───────────┘
```

---

## 14. Versioning Model

```
dms_documents (id: 100, title: "Trade License 2026")
  ├── dms_document_versions (version 1, 2025)
  │     └── dms_document_files: original_2025.pdf, processed_2025.pdf
  └── dms_document_versions (version 2, 2026 renewal)
        └── dms_document_files: original_2026.pdf, processed_2026.pdf
                                              ↑ current_version_id
```

Rules:
- New file upload on existing document = new version
- Original file from every version is retained forever
- `current_version_id` points to the latest active version
- Users can view and download any historical version
- `status` changes to `superseded` for old versions

---

## 15. Expiry and Renewal Engine

### 15.1 Reminder Schedule

| Days Before Expiry | Priority | Recipients |
|-------------------|----------|------------|
| 90 days | Low | Document owner |
| 60 days | Normal | Document owner + branch manager |
| 30 days | High | Document owner + branch manager + department head |
| 14 days | Urgent | All of above + company admin |
| 7 days | Critical | All of above + executive notification |

### 15.2 Expiry Dashboard Counts

- Expired documents (past `expiry_date`)
- Expiring within 7 days
- Expiring within 30 days
- Expiring within 60 days
- Documents missing expiry date (where `requires_expiry_tracking = true`)

### 15.3 Renewal Tracking

When a new version is uploaded and reviewed for an expired document, the system automatically:
1. Updates `dms_documents.expiry_date` from the new metadata
2. Changes status from `expired` → `active`
3. Cancels old pending reminders
4. Creates new reminders based on new expiry date
5. Logs event: `renewed`

---

## 16. ERP Linking Model

### 16.1 `dms_document_links` Design

One document can be linked to multiple ERP records simultaneously:

```
Document: "ABC Trading Trade License 2026"
  ├── Link 1: entity_type='party', entity_id=42, is_primary=true
  ├── Link 2: entity_type='branch', entity_id=5, is_primary=false
  └── Link 3: entity_type='company', entity_id=1, is_primary=false
```

### 16.2 ERP Integration Points

| ERP Module | Integration | Phase |
|------------|-------------|-------|
| Party Master | Party Documents tab backed by DMS | DMS.6 |
| Finance Basics | Bank letters, finance documents | DMS.6+ |
| HR/Employees | Passports, visas, licences (future) | DMS.14 |
| Fleet/Vehicles | Registrations, insurance (future) | DMS.14 |
| Equipment | Calibration, registration (future) | DMS.14 |
| Projects | Contracts, method statements (future) | DMS.14 |
| HSE | Permits, incident reports (future) | DMS.14 |
| Finance/AP | Invoices, POs, receipts (future) | DMS.14 |

---

## 17. UI/UX Architecture

### 17.1 Routes

```
/dms                                     → DMS Dashboard
/dms/inbox                               → Upload Inbox + AI Review Queue
/dms/documents                           → Document Repository (ERPDataTable)
/dms/documents/record/new                → New Document Workspace Form
/dms/documents/record/[id]              → Edit/View Document Workspace Form
/dms/documents/record/[id]/preview      → Full Document Preview Panel
/dms/review                              → AI Review Queue (dedicated)
/dms/expiring                            → Expiry Dashboard
/dms/search                              → Advanced Search
/dms/admin/types                         → Document Types Admin
/dms/admin/categories                    → Document Categories Admin
/dms/admin/tags                          → Tags Admin
/dms/admin/metadata                      → Metadata Definitions Admin
/dms/admin/workflows                     → Workflow Templates Admin
/dms/admin/retention                     → Retention Policies Admin
/dms/admin/settings                      → DMS Settings
```

### 17.2 Document Record Workspace Form Sections

The document workspace form uses `ERPRecordWorkspaceForm` with tabs:

| Section ID | Label | Description |
|------------|-------|-------------|
| `overview` | Overview | Title, type, status, dates, confidentiality |
| `preview` | Document | Embedded PDF/image viewer |
| `metadata` | Metadata | Dynamic custom fields per document type |
| `links` | ERP Links | Linked parties, vehicles, projects |
| `versions` | Versions | Version history and upload new version |
| `tags` | Tags | Assign/remove tags |
| `ai` | AI Extraction | AI results, review actions, confidence |
| `approvals` | Approvals | Workflow state, approval history |
| `expiry` | Expiry & Renewal | Expiry date, reminder schedule, renewal history |
| `comments` | Comments | User comments |
| `audit` | Audit Trail | Full event log |

### 17.3 AI Review Screen Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AI Review — Upload Session #12345                                      │
│  Confidence: MEDIUM   │  Document Type Suggestion: Trade License ✓       │
├──────────────────┬──────────────────────────────────────────────────────┤
│                  │  AI Extracted Fields                                  │
│                  │  ─────────────────────────────────────────────────── │
│  [PDF Viewer]    │  License Number     ABC-2026-001234   [HIGH ●] ✓ Edit │
│                  │  Legal Name         ABC Trading LLC   [HIGH ●] ✓ Edit │
│  Page 1 of 2     │  Issue Date         2026-01-15        [HIGH ●] ✓ Edit │
│                  │  Expiry Date        2027-01-14        [HIGH ●] ✓ Edit │
│  ◄ Prev  Next ►  │  Issuing Authority  DED Dubai         [MED  ●] ✓ Edit │
│                  │  Emirate            Dubai              [HIGH ●] ✓ Edit │
│                  │  Activities         [3 items]         [LOW  ●] ✓ Edit │
│                  │  ─────────────────────────────────────────────────── │
│                  │  Suggested ERP Links                                  │
│                  │  Party: ABC Trading LLC (PTY-000042)  [HIGH ●] ✓ Link │
│                  │                                                       │
│                  │  ⚠ Source snippet available — click field to view     │
├──────────────────┴──────────────────────────────────────────────────────┤
│  Confidentiality: [Company Confidential ▼]    Requires Approval: Yes   │
│  [← Back to Queue]              [Reject]    [Save Without AI]   [Confirm & Save →] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 18. AI Extraction Schemas

### Trade License
```json
{
  "document_type": "TRADE_LICENSE",
  "fields": [
    { "name": "license_number", "type": "text", "required": true, "prompt": "Trade/commercial license number or registration number" },
    { "name": "legal_name", "type": "text", "required": true, "prompt": "Legal company name as registered" },
    { "name": "issue_date", "type": "date", "prompt": "Date of issue (ISO format)" },
    { "name": "expiry_date", "type": "date", "required": true, "prompt": "Expiry or renewal date" },
    { "name": "issuing_authority", "type": "text", "prompt": "Issuing authority (e.g., DED, ADCCI, DDA)" },
    { "name": "emirate", "type": "text", "prompt": "UAE emirate (Dubai, Abu Dhabi, Sharjah, etc.)" },
    { "name": "business_activities", "type": "text", "prompt": "Business activities listed" },
    { "name": "license_type", "type": "text", "prompt": "Type of license (commercial, professional, industrial)" }
  ]
}
```

### TRN / VAT Certificate
```json
{
  "document_type": "TRN_CERTIFICATE",
  "fields": [
    { "name": "trn", "type": "text", "required": true, "prompt": "Tax Registration Number (15 digits)" },
    { "name": "legal_name", "type": "text", "required": true },
    { "name": "issue_date", "type": "date" },
    { "name": "effective_date", "type": "date", "prompt": "VAT registration effective date" }
  ]
}
```

### Emirates ID
```json
{
  "document_type": "EMIRATES_ID",
  "fields": [
    { "name": "emirates_id_number", "type": "text", "required": true, "prompt": "784-YYYY-XXXXXXX-X format" },
    { "name": "full_name_en", "type": "text", "required": true },
    { "name": "full_name_ar", "type": "text" },
    { "name": "nationality", "type": "text" },
    { "name": "date_of_birth", "type": "date" },
    { "name": "expiry_date", "type": "date", "required": true }
  ]
}
```

### Vehicle Registration
```json
{
  "document_type": "VEHICLE_REGISTRATION",
  "fields": [
    { "name": "plate_number", "type": "text", "required": true },
    { "name": "chassis_number", "type": "text" },
    { "name": "engine_number", "type": "text" },
    { "name": "vehicle_make", "type": "text" },
    { "name": "vehicle_model", "type": "text" },
    { "name": "year", "type": "number" },
    { "name": "color", "type": "text" },
    { "name": "expiry_date", "type": "date", "required": true },
    { "name": "registered_to", "type": "text", "prompt": "Owner name or company name" }
  ]
}
```

### Insurance Policy
```json
{
  "document_type": "INSURANCE_POLICY",
  "fields": [
    { "name": "policy_number", "type": "text", "required": true },
    { "name": "insurer_name", "type": "text", "required": true },
    { "name": "insured_party_name", "type": "text" },
    { "name": "start_date", "type": "date", "required": true },
    { "name": "expiry_date", "type": "date", "required": true },
    { "name": "coverage_type", "type": "text", "prompt": "Type of insurance (comprehensive, third party, medical, etc.)" },
    { "name": "premium_amount", "type": "number" },
    { "name": "currency", "type": "text" }
  ]
}
```

### Passport Copy
```json
{
  "document_type": "PASSPORT_COPY",
  "fields": [
    { "name": "passport_number", "type": "text", "required": true },
    { "name": "full_name", "type": "text", "required": true },
    { "name": "nationality", "type": "text" },
    { "name": "date_of_birth", "type": "date" },
    { "name": "place_of_birth", "type": "text" },
    { "name": "issue_date", "type": "date" },
    { "name": "expiry_date", "type": "date", "required": true },
    { "name": "issuing_country", "type": "text" }
  ]
}
```

### Project Contract
```json
{
  "document_type": "PROJECT_CONTRACT",
  "fields": [
    { "name": "contract_number", "type": "text" },
    { "name": "contract_title", "type": "text" },
    { "name": "client_name", "type": "text" },
    { "name": "contractor_name", "type": "text" },
    { "name": "contract_value", "type": "number" },
    { "name": "currency", "type": "text" },
    { "name": "start_date", "type": "date" },
    { "name": "end_date", "type": "date", "required": true },
    { "name": "project_location", "type": "text" },
    { "name": "scope_summary", "type": "text" }
  ]
}
```

---

## 19. Background Job Pipeline

### 19.1 Job Types

| Job | Trigger | Handler | Phase |
|-----|---------|---------|-------|
| `upload_session_created` | File uploaded by user | Server action; create session record | DMS.5 |
| `virus_scan` | Placeholder | Mark as 'clean' in Phase 1 | DMS.5 |
| `ocr_processing` | Upload session created | Supabase Edge Function | DMS.9 |
| `ai_classification` | OCR complete | Supabase Edge Function | DMS.10 |
| `ai_extraction` | Classification complete | Supabase Edge Function | DMS.10 |
| `link_suggestion` | Extraction complete | Server action query against ERP tables | DMS.10 |
| `review_queue_notify` | Extraction complete | In-app notification | DMS.11 |
| `preview_generation` | Document approved | Edge Function (sharp/imagemagick) | DMS.7 |
| `fts_index_update` | Document approved | PostgreSQL trigger updates tsvector | DMS.12 |
| `expiry_reminder` | Daily schedule | Supabase cron job or Edge Function | DMS.8 |
| `session_cleanup` | Daily | Delete expired upload sessions | DMS.5 |

### 19.2 Phase 1 Practical Approach

For DMS.2–DMS.8 (before AI phases), the pipeline is simplified:

```
Upload → Manual OCR trigger (optional) → Manual metadata entry → Save
```

No AI processing in Phase 1. AI pipeline is introduced in DMS.9–DMS.11.

---

## 20. Numbering Design

Document numbers follow the existing `generateNextReference()` engine:

| Rule Code | Format | Example |
|-----------|--------|---------|
| `DMS_DOCUMENT` | `DMS-YYYY-000001` | `DMS-2026-000001` |
| `DMS_TL` | `DMS-TL-YYYY-000001` | `DMS-TL-2026-000001` |
| `DMS_CON` | `DMS-CON-YYYY-000001` | `DMS-CON-2026-000001` |

A global `DMS-YYYY-XXXXXX` number is simplest for Phase 1. Type-specific numbering can be added later.

---

## 21. DMS Dashboard KPIs

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Total Docs  │ Pending AI   │ Pending      │ Expiring     │
│   2,847      │ Review: 12   │ Approval: 8  │ <30 days: 47 │
├──────────────┼──────────────┼──────────────┼──────────────┤
│  Expired     │ OCR Failed   │ Storage Used │ Uploaded     │
│  Docs: 23    │    3         │ 12.4 GB      │ This Month:  │
│              │              │              │ 186          │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Charts:
- Documents by type (top 10)
- Upload trend (last 12 months)
- Expiry calendar
- Documents by status
- Confidentiality distribution

---

## 22. Implementation Phase Plan

| Phase | Title | Key Deliverables | Dependencies |
|-------|-------|-----------------|--------------|
| **DMS.1** | Research & Architecture Plan | This document | None |
| **DMS.2** | Database Foundation & Storage | All DB tables, RLS policies, Storage buckets, numbering rule | SOT approval |
| **DMS.3** | DMS Admin Masters | Categories, Types, Tags, Metadata Definitions, Retention Policies admin screens | DMS.2 |
| **DMS.4** | Document Repository List + Record Form | `ERPDataTable` list, `ERPRecordWorkspaceForm`, all tabs skeleton | DMS.3 |
| **DMS.5** | Upload Inbox & File Storage | Upload component, session management, temp storage, preview | DMS.4 |
| **DMS.6** | ERP Linking | `dms_document_links` UI, Party Documents tab backed by DMS | DMS.5 |
| **DMS.7** | Versioning & Audit Trail | Version upload, version history tab, full event log | DMS.5 |
| **DMS.8** | Expiry & Renewal Tracking | Expiry reminders, renewal workflow, dashboard | DMS.6 |
| **DMS.9** | OCR Pipeline Foundation | Tesseract OCR integration via Edge Function, OCR text stored | DMS.5 |
| **DMS.10** | AI Classification & Extraction | Provider abstraction, Azure/OpenAI integration, extraction results | DMS.9 |
| **DMS.11** | AI Review Queue | Review screen, accept/edit/reject UI, confirm & save flow | DMS.10 |
| **DMS.12** | Full-Text Search | `tsvector` index, advanced search screen, semantic search prep | DMS.9 |
| **DMS.13** | Security/RLS/Confidentiality QA | RLS audit, confidentiality enforcement, permission matrix QA | DMS.12 |
| **DMS.14** | HR/Fleet/Workshop/Project Integration | Link DMS to new ERP modules as they are built | After modules exist |

---

## 23. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Supabase Storage performance with large files (50MB PDFs) | Medium | Medium | Use chunked uploads; CDN for previews |
| OCR quality on Arabic-language scanned documents | High | High | Tesseract Arabic pack; Azure Document Intelligence for Arabic |
| AI extraction accuracy for handwritten documents | High | Medium | Manual override always available; confidence scoring |
| RLS performance on large document table (1M+ rows) | Medium | High | Ensure all RLS policies use indexed columns; test at scale |
| File storage costs growing unbounded | Medium | Medium | Retention policies, archive tier for old documents |
| Users uploading wrong document type (AI misclassification) | Medium | Low | Human review queue catches all misclassifications |
| Signed URL leakage | Low | High | Short expiry (1hr); log all URL generations in audit |
| Duplicate document confusion | Low | Medium | SHA-256 dedup + visual warning in review UI |
| PDF/A conversion failures | Low | Low | Store original; PDF/A is optional archive copy |
| pgvector performance for semantic search | Low | Low | Deferred to DMS.12; use HNSW index |

---

## 24. Open Decisions for Sameer

1. **Which AI provider first?**
   - **Recommended:** Azure Document Intelligence + Azure OpenAI GPT-4.1. Best accuracy for UAE documents, Arabic support, enterprise SLA.
   - Alternative: OpenAI GPT-4o vision (simpler, no Azure setup required).
   - Alternative: Start with manual only (no AI) in DMS.5, add AI in DMS.10 later.

2. **Supabase Storage only, or also external backup?**
   - Supabase Storage is S3-compatible (hosted on AWS S3). For critical legal/financial documents, consider enabling automatic S3 cross-region replication via Supabase Pro.

3. **Should AI auto-save high-confidence results or always require review?**
   - **Recommended:** ALWAYS require human review in Phase 1. Auto-save option can be added as an opt-in per document type in DMS.11.

4. **Which document types should be the pilot (DMS.6)?**
   - **Recommended:** Trade License + TRN Certificate for Party Master pilot. These are common, well-structured, and have clear expiry tracking value.

5. **External sharing in Phase 1?**
   - **Recommended:** Defer to post-DMS.13. External sharing requires careful security design (signed URL expiry, download limits, access revocation).

6. **Should confidential HR documents be encrypted separately?**
   - Supabase Storage encrypts at rest by default. For document-level encryption, additional tooling is needed. Defer to DMS.13 security audit.

7. **Document numbering: global or type-specific?**
   - **Recommended:** Global `DMS-YYYY-XXXXXX` for Phase 1 (DMS.2). Type-specific suffixes can be added later.

8. **DMS organization: folder tree, tags, or both?**
   - **Recommended:** Tags + entity links (no folder tree). Folders add complexity. Tags + ERP links provide better organization for ALGT's use case.

9. **OCR language: English only, or English + Arabic?**
   - **Recommended:** English + Arabic from DMS.9. UAE documents frequently have Arabic text. Azure Document Intelligence supports Arabic natively.

10. **PDF/A archive conversion in Phase 1?**
    - **Recommended:** Defer to DMS.9+. Store original in Phase 1. PDF/A is archival standard but complex to generate correctly.

---

## 25. Recommended Immediate Next Phase

**ERP DMS.2 — Database Foundation and Storage Buckets**

Deliverables:
- Create all 20+ DMS tables with proper indexes, RLS policies, and foreign keys
- Create Supabase Storage buckets: `dms-documents`, `dms-temp`
- Add `MASTER_DMS_DOCUMENT` numbering rule to `global_numbering_rules`
- Seed initial `dms_document_categories` and `dms_document_types` (35 types from Section 8.1)
- Seed initial `dms_metadata_definitions` for Trade License and TRN Certificate
- Run QA: all tables exist, RLS enabled, buckets private, numbering rule works

**Note:** Do NOT start DMS.2 until Sameer reviews this plan and confirms:
- AI provider choice
- Document type pilot selection
- Folder vs tag decision
- External sharing decision
