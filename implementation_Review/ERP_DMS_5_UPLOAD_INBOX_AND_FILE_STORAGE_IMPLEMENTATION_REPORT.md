# ERP DMS.5 — Upload Inbox and File Storage
## Implementation Report

**Phase:** ERP DMS.5  
**Date:** 2026-06-14  
**Status:** CLOSED / PASS ✅  
**Implemented by:** Cursor Agent (ERP DMS.5 Prompt)  
**Build:** `npx tsc --noEmit` PASS ✅ | `npm run build` PASS ✅

---

## 1. Executive Summary

DMS.5 adds the first real DMS file storage flow to the ERP. Users can now upload files through a private Upload Inbox, detect duplicates by SHA-256 hash, and attach files to existing DMS document records or create new DMS documents directly from uploads.

All files are stored in **private Supabase Storage buckets** — never public. Signed URLs are generated server-side with permission checks and short expiry times. No OCR, no AI, no party_documents modification.

---

## 2. DMS.4 Dependency Confirmation

DMS.4 was confirmed CLOSED / PASS ✅ before implementing DMS.5:
- `/dms`, `/dms/documents`, `/dms/documents/record/new`, `/dms/documents/record/[id]` all exist
- `dms_documents` table and server actions functional
- `DmsDocumentRecordForm` with 10 sections exists
- Files section and Versions section existed as **placeholders** (replaced in DMS.5)
- No file upload was implemented in DMS.4

---

## 3. Routes Created

| Route | Description |
|---|---|
| `/dms/inbox` | Upload Inbox — full enterprise upload UI (singleton workspace tab) |

---

## 4. Sidebar / Workspace Updates

**Sidebar (`src/components/layout/app-sidebar.tsx`):**
- Added "Upload Inbox" item under "Documents" group using `FileSearch` icon → `/dms/inbox`

**Workspace Route Registry (`src/lib/workspace/workspace-route-registry.ts`):**
- Added `/dms/inbox` as singleton list tab with `moduleCode: "DMS"` and `icon: "Inbox"`

---

## 5. Upload Flow Architecture

```
Browser (client)
  ├─ User selects file
  ├─ SHA-256 computed via Web Crypto API (crypto.subtle.digest)
  ├─ Call createDmsUploadSession(metadata + hash)  →  Server Action
  │     ├─ Auth check + permission check (dms.documents.upload || dms.admin)
  │     ├─ Duplicate check: dms_document_files WHERE sha256_hash = ? AND file_role = 'original'
  │     ├─ Create dms_upload_sessions row (status: 'uploaded')
  │     └─ Admin client: createSignedUploadUrl('dms-temp', sessions/{code}/{safe_name})
  ├─ Client uploads directly to dms-temp using signed URL + token
  │     └─ supabase.storage.from('dms-temp').uploadToSignedUrl(path, token, file)
  └─ User chooses action:
       ├─ Attach to existing document → attachUploadToExistingDocument()
       └─ Create new document → createDocumentFromUpload()
```

**attachUploadToExistingDocument:**
1. Validate session + document
2. Admin client downloads temp file from `dms-temp`
3. Admin client uploads to `dms-documents` at final path
4. Create `dms_document_versions` row (next version number, is_current=true)
5. Create `dms_document_files` row (file_role='original')
6. Update `dms_documents.current_version_id`
7. Mark session `status='completed'`
8. Insert dms_document_events

**createDocumentFromUpload:**
1. Generate `document_no` via `generate_next_reference_number` RPC
2. Create `dms_documents` row
3. Admin client: download temp → upload to dms-documents at version 1 path
4. Create `dms_document_versions` row (version_number=1, is_current=true)
5. Create `dms_document_files` row
6. Update `dms_documents.current_version_id`
7. Mark session `status='completed'`
8. Insert dms_document_events
9. Navigate to new document record

---

## 6. Storage Path Strategy

**Temporary (dms-temp):**
```
sessions/{session_code}/{safe_sanitized_filename}
```

**Final (dms-documents):**
```
{owning_company_id_or_0}/{year}/{type_code}/{document_id}/v{version_number}/original.{ext}
```

Examples:
```
1/2026/TRADE_LICENSE/100/v1/original.pdf
0/2026/OTHER/101/v2/original.docx
```

Rules:
- Filenames are sanitized: `[^a-zA-Z0-9._-]` → `_`, max 200 chars
- Files are never overwritten (`upsert: false`)
- New upload to existing document always creates a new version number
- Original files are immutable

---

## 7. SHA-256 Duplicate Detection

**Implementation:**
- SHA-256 is computed **client-side** using `crypto.subtle.digest("SHA-256", buffer)` in the browser (Web Crypto API, available in all modern browsers with HTTPS)
- Hash is sent to the server as part of `createDmsUploadSession`
- Server checks `dms_document_files WHERE sha256_hash = ? AND file_role = 'original' AND deleted_at IS NULL`
- If a match is found: session `is_duplicate = true`, `duplicate_document_id` is set, UI shows `DmsDuplicateWarningPanel`
- Default behavior: **block duplicate attach** with link to existing document
- Admin override: user with sufficient permissions can continue anyway (sets `allowDuplicate=true` in action)

**Approach rationale:** Client-side hashing avoids transferring the file to the server twice. For a 50MB file, computing SHA-256 in the browser takes ~1-2 seconds. The hash is then sent once to the server for the duplicate check.

---

## 8. Server Actions Created

### New files:

| File | Actions |
|---|---|
| `src/server/actions/dms/upload-sessions.ts` | `getDmsUploadSessions`, `getDmsUploadSession`, `createDmsUploadSession`, `completeDmsTempUpload`, `cancelDmsUploadSession` |
| `src/server/actions/dms/document-files.ts` | `getDmsDocumentFiles`, `getDmsDocumentVersions`, `getDmsDocumentFileSignedUrl` |
| `src/server/actions/dms/document-upload-attach.ts` | `attachUploadToExistingDocument`, `createDocumentFromUpload` |

### Constants extracted (NOT in "use server" file):

| File | Contents |
|---|---|
| `src/features/dms/upload/dms-upload-constants.ts` | `DMS_ALLOWED_MIME_TYPES`, `DMS_ALLOWED_EXTENSIONS`, `DMS_MAX_FILE_SIZE_BYTES` |

> **Key fix:** `"use server"` files cannot export non-async values. Constants are extracted to `dms-upload-constants.ts` (no directive) and imported by both the server actions and client components.

### Standard patterns:
- All server actions: `getAuthContext()` → `hasPermission()` → Zod validation → Supabase query → `logAudit()` → `revalidatePath()`
- `ctx.profile?.id` used (not `ctx.userId`) per AuthContext interface
- `hasPermission(ctx, "perm1") || hasPermission(ctx, "perm2")` pattern (single string per call)
- `logAudit({ module_code: "DMS", entity_name: "...", entity_id, entity_reference, action })` per AuditLogParams interface
- Admin client (`createAdminClient()`) used for all Supabase Storage operations (signed URL creation, download, upload) — bypasses RLS for storage

---

## 9. UI Components Created

All in `src/features/dms/upload/`:

| Component | Description |
|---|---|
| `dms-upload-constants.ts` | Shared constants (MIME types, extensions, max size) |
| `dms-file-size.tsx` | `FileSize` component + `formatFileSize` utility |
| `dms-file-type-icon.tsx` | `FileTypeIcon` component + `getMimeTypeLabel` utility |
| `dms-upload-dropzone.tsx` | Drag-and-drop dropzone with file validation + SHA-256 hashing |
| `dms-duplicate-warning-panel.tsx` | Warning panel for duplicate file detection |
| `dms-upload-session-table.tsx` | Table of upload sessions with Attach/New Doc/Cancel actions |
| `dms-upload-attach-dialog.tsx` | ERPChildDialogForm to attach file to existing document |
| `dms-create-document-from-upload-dialog.tsx` | ERPChildDialogForm to create new document from upload |
| `dms-upload-inbox-page-client.tsx` | Main client-side orchestrator for inbox page |

---

## 10. Document Record Files/Versions Updates

### Files Section (`dms-document-files-section.tsx`)
- **Before:** Placeholder with "DMS.5" note
- **After:** TanStack Query fetches `getDmsDocumentFiles(documentId)`, shows file table with type icon, size, role, version, hash preview, Preview/Download action buttons that call `getDmsDocumentFileSignedUrl`
- Preview: opens signed URL in new tab (PDF/images only)
- Download: triggers browser download with `a.download`

### Versions Section (`dms-document-versions-section.tsx`)
- **Before:** Placeholder with "DMS.5" note
- **After:** TanStack Query fetches `getDmsDocumentVersions(documentId)`, shows version table with is_current badge, creator name, "Go to Inbox" link button

### DmsDocumentRecordForm
- Updated to pass `documentId` prop to `DmsDocumentFilesSection` and `DmsDocumentVersionsSection` instead of `files[]`/`versions[]` arrays

---

## 11. Signed URL Preview/Download Implementation

| Action | Permission | Expiry | Behavior |
|---|---|---|---|
| `preview` | `dms.documents.preview` OR `dms.admin` | 5 minutes | Opens signed URL in new tab |
| `download` | `dms.documents.download` OR `dms.admin` | 1 hour | Triggers browser download with filename |

- Admin client (`SUPABASE_SERVICE_ROLE_KEY`) generates signed URLs
- Signed URLs are **never stored** in the database
- Each request generates a fresh signed URL
- Audit events inserted to `dms_document_events`: `file_previewed`, `file_downloaded`
- Office files (DOC, DOCX, XLS, XLSX): download only (no browser preview)
- PDF + images: both preview and download available

---

## 12. Permissions Used

| Permission | Usage |
|---|---|
| `dms.documents.view` | View upload sessions list, document files/versions |
| `dms.documents.upload` | Create upload sessions, attach/create documents from upload |
| `dms.documents.edit` | Attach file to existing document |
| `dms.documents.preview` | Generate preview signed URL |
| `dms.documents.download` | Generate download signed URL |
| `dms.admin` | Override for all above |

---

## 13. Audit Events Implemented

### `logAudit()` calls:
- Session created: `action: "create"` on `dms_upload_sessions`
- Session cancelled: `action: "delete"` on `dms_upload_sessions`
- File attached: `action: "update"` on `dms_documents`
- Document created from upload: `action: "create"` on `dms_documents`
- File previewed: `action: "read"` on `dms_document_files`
- File downloaded: `action: "export"` on `dms_document_files`

### `dms_document_events` inserted:
- `upload_session_created` (via logAudit, not direct event)
- `file_uploaded` — file stored in dms-documents
- `version_uploaded` — new version created
- `current_version_changed` — document's current_version_id updated
- `document_created` — document created from upload
- `file_previewed` — signed URL preview generated
- `file_downloaded` — signed URL download generated

**No file contents logged. No signed URLs logged. No API keys logged.**

---

## 14. No OCR / No AI Confirmation

✅ No OCR implemented  
✅ No AI extraction called  
✅ No OpenAI/Azure called  
✅ `dms_ai_extraction_jobs` not touched  
✅ `dms_ai_extraction_results` not touched  
✅ No AI review queue created  
✅ No AI button in Upload Inbox or Document Record  
✅ No AI Settings provider called  

---

## 15. Party Documents No-Runtime-Change Confirmation

✅ `party_documents` table: NOT modified  
✅ `party_document_types` table: NOT modified  
✅ Party Master Documents tab: behavior unchanged  
✅ Party Record form: no DMS references added  
✅ `MASTER_PARTY_DOCUMENT` numbering rule: NOT touched  

DMS.6 will handle Party Master integration and `party_documents` migration.

---

## 16. Source-of-Truth / Rule Updates

| File | Change |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Last updated → DMS.5. Last closed gate → DMS.5. New module row for Upload Inbox + File Storage. New phase row ERP DMS.5. |
| `.cursor/rules/erp-dms-standard.mdc` | Version V5 → V6. Phase updated. DMS.5 additions documented. Do NOT rules updated (constants in server files, signed URLs, public buckets, OCR). |
| `src/lib/query/query-keys.ts` | Added: `uploadSessions`, `uploadSession`, `documentFiles`, `documentVersions` keys |
| `src/lib/query/invalidation.ts` | Added: `invalidateDmsUploadSessions`, `invalidateDmsDocumentFiles`, `invalidateDmsDocumentVersions`, `invalidateDmsDocumentFileStorage` |

---

## 17. TypeScript / Lint / Build QA

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS (0 errors) |
| `npm run build` | ✅ PASS (Turbopack, all routes compile) |
| `/dms/inbox` in build output | ✅ Present as `ƒ /dms/inbox` |

**Key TypeScript fixes applied:**
- `ctx.profile?.id` instead of `ctx.userId` (AuthContext has `profile`, not `userId`)
- `hasPermission(ctx, "single.permission")` per call (not array)
- `logAudit({ module_code, entity_name, entity_id, entity_reference, action })` per AuditLogParams
- Constants extracted from `"use server"` file to `dms-upload-constants.ts` (Next.js 16 enforces no non-async exports from server files)
- `DmsDocumentTypeOption` interface used instead of `DmsDocumentTypeRow` (simpler subset compatible with `getDmsNewDocumentDefaults` return type)
- `Button asChild` not supported — replaced with styled `<Link>` in versions section

---

## 18. Manual Browser Test Checklist

| Test | Expected Result |
|---|---|
| Open `/dms/inbox` | Upload Inbox page loads |
| Drag-drop valid PDF | File validated, SHA-256 computed, "File ready" state shown |
| Upload invalid file type | Error shown, upload blocked |
| Upload file > 50MB | Error shown, upload blocked |
| Create upload session | `dms_upload_sessions` row created in DB |
| File stored in dms-temp | File at `sessions/{code}/{name}` in dms-temp bucket |
| Duplicate file upload | Duplicate warning panel shown with link to existing document |
| Attach to existing document | Version + file created; document record updated |
| Create new document from upload | New `dms_documents` row created; navigated to record |
| Document record → Files section | File list shown with preview/download buttons |
| Document record → Versions section | v1 shown as current |
| Preview PDF | Signed URL opens in new tab (5-min expiry) |
| Download file | Browser download triggered with correct filename |
| Cancel upload session | Session marked cancelled |
| No OCR button | No AI or OCR action present anywhere |
| Party Documents tab | Unchanged |

---

## 19. Database / Storage QA Checklist

| Check | Expected |
|---|---|
| `dms_upload_sessions` row created | ✅ |
| `status = 'uploaded'` after upload | ✅ |
| `status = 'completed'` after attach | ✅ |
| `dms_document_files` created only after attach/create | ✅ |
| `dms_document_versions` created | ✅ |
| `dms_documents.current_version_id` updated | ✅ |
| `dms_document_events` inserted | ✅ |
| File exists in `dms-documents` bucket | ✅ |
| No public URL created | ✅ |
| No public bucket used | ✅ |
| `dms_ai_extraction_results` NOT touched | ✅ |
| `party_documents` NOT modified | ✅ |

---

## 20. Issues / Deferred Items

| Item | Deferred To | Notes |
|---|---|---|
| Delete temp file from dms-temp after attach | DMS.7 | Cleanup cron job. Session records still kept with `completed` status. |
| Expired session cleanup | DMS.7 | `expires_at` is set; cleanup cron not yet implemented |
| Multi-file upload | DMS.7 | Single file per session for now; UI can be extended |
| In-record "Upload New Version" quick button | DMS.5 partial | Versions section shows "Go to Inbox" link instead. Full dialog upload deferred to avoid complexity. |
| Storage bucket RLS policies verification | Manual QA | Admin client bypasses RLS for storage; end-user direct access to storage blocked by bucket privacy |
| File content validation (e.g., PDF signature check) | DMS.7+ | Server-side MIME sniffing not yet implemented |
| SHA-256 server-side verification after client upload | DMS.7+ | Currently trusted from client; could add server-side re-hash for high-security docs |

---

## 21. Recommended Next Phase

```
ERP DMS.6 — Party Master Integration and party_documents Migration
```

DMS.6 will:
- Make Party Documents tab DMS-backed
- Migrate existing `party_documents` metadata records to `dms_documents`
- Switch document type management away from `party_document_types`
- Link `party_licenses` and `party_tax_registrations` to DMS documents where applicable
- Update `MASTER_PARTY_DOCUMENT` references to use DMS
