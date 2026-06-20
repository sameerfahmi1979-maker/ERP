# ERP DMS.4 — Document Repository List and Document Record Workspace Form
## Implementation Report

**Phase:** ERP DMS.4  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  
**Completed by:** Cursor AI Agent  
**Build status:** `npx tsc --noEmit` PASS, `npm run build` PASS  

---

## 1. Executive Summary

ERP DMS.4 successfully implemented the DMS document repository list and the DMS document record workspace form. Users can now create, edit, and view metadata-only DMS document records without uploading physical files. The implementation follows all ERP workspace patterns (ERPRecordWorkspaceForm, useWorkspaceFormDraft, useFormDirty), uses the MASTER_DMS_DOCUMENT numbering rule for document numbers, and supports dynamic metadata fields loaded from `dms_metadata_definitions`.

**No file upload was implemented.** No Party Documents tab behavior was changed. No `party_documents` or `party_document_types` were modified.

---

## 2. DMS.2 / DMS.3 Dependency Confirmation

- ✅ DMS.2: 23 DMS tables, RLS enabled/forced, 2 storage buckets, MASTER_DMS_DOCUMENT numbering rule
- ✅ DMS.3: Admin Masters UI complete — categories, types, metadata definitions, tags, retention policies manageable
- ✅ `dms_documents`, `dms_document_metadata_values`, `dms_document_links`, `dms_document_tags`, `dms_document_comments`, `dms_document_events`, `dms_document_versions`, `dms_document_files` — all tables exist and are RLS-protected
- ✅ `MASTER_DMS_DOCUMENT` numbering rule exists and generates `DMS-{YYYY}-{SEQ6}` format numbers
- ✅ DMS permissions seeded: `dms.documents.view`, `dms.documents.upload`, `dms.documents.edit`, `dms.documents.delete`, `dms.documents.archive`, `dms.documents.manage_tags`, `dms.admin`

---

## 3. Routes Created

| Route | Purpose | Type |
|---|---|---|
| `/dms` | DMS dashboard with quick links | List |
| `/dms/documents` | Document repository list | List |
| `/dms/documents/record/new` | New document form (add mode) | Record |
| `/dms/documents/record/[id]` | Edit/view document form | Record |

All routes protected by `dms.documents.view` or `dms.admin` permission check.

---

## 4. Sidebar / Menu Changes

Added new **"Documents"** navigation group to `src/components/layout/app-sidebar.tsx`:

```
Documents
├── DMS Dashboard    → /dms
└── All Documents    → /dms/documents
```

Icons: `LayoutDashboard` (DMS Dashboard), `Files` (All Documents)

The existing "DMS Admin" group and all existing navigation entries are unchanged.

---

## 5. Workspace Registry Updates

Added 4 new entries to `src/lib/workspace/workspace-route-registry.ts`:

- `/dms` — singleton list tab, `moduleCode: "DMS"`
- `/dms/documents` — singleton list tab, `moduleCode: "DMS"`
- `/dms/documents/record/new` — record tab, `entityType: "dms_document"`, `closable: true`
- `/dms/documents/record/` + pattern `/^\/dms\/documents\/record\/\d+/` — record tab, `entityType: "dms_document"`

---

## 6. Server Actions Created

### `src/server/actions/dms/documents.ts`
- `getDmsDocuments(filters)` — filtered list with joined type, category, tags
- `getDmsDocument(id)` — single document with joins
- `getDmsDocumentRecordData(id)` — full record data including metadata_values, links, versions, files
- `getDmsNewDocumentDefaults()` — active categories + document types for selects
- `createDmsDocument(input)` — generates document_no via `generate_next_reference_number` RPC, inserts dms_documents, inserts document_created event
- `updateDmsDocument(input)` — updates document, inserts document_updated event
- `archiveDmsDocument(id)` — soft-archives, updates status to "archived"
- `unarchiveDmsDocument(id)` — unarchives, updates status to "active"
- `deleteDmsDocument(id)` — soft-deletes, updates status to "deleted"

### `src/server/actions/dms/document-metadata-values.ts`
- `getMetadataDefinitionsForType(typeId)` — active metadata defs for selected document type
- `getDmsDocumentMetadataValues(documentId)` — all metadata values with definition joins
- `saveDmsDocumentMetadataValues(documentId, values)` — upsert all values, insert metadata_updated event

### `src/server/actions/dms/document-links.ts`
- `getDmsDocumentLinks(documentId)` — active links
- `addDmsDocumentLink(documentId, input)` — add entity link, insert link_added event
- `removeDmsDocumentLink(linkId, documentId)` — soft-delete link, insert link_removed event

### `src/server/actions/dms/document-tags.ts`
- `getDmsDocumentTags(documentId)` — tags with joined tag details
- `saveDmsDocumentTags(documentId, tagIds)` — replace-all tag set, insert tags_updated event
- `addDmsDocumentTag(documentId, tagId)` — add single tag
- `removeDmsDocumentTag(documentId, tagId)` — remove single tag

### `src/server/actions/dms/document-comments.ts`
- `getDmsDocumentComments(documentId)` — active comments with author join
- `addDmsDocumentComment(documentId, commentText)` — add comment, insert comment_added event
- `updateDmsDocumentComment(commentId, commentText, documentId)` — update own comment
- `deleteDmsDocumentComment(commentId, documentId)` — soft-delete own comment

### `src/server/actions/dms/document-events.ts`
- `getDmsDocumentEvents(documentId)` — audit events with performer join (read-only, max 100)

---

## 7. UI Components Created

### Feature folder: `src/features/dms/documents/`

**Constants & Types:**
- `dms-document-constants.ts` — `DMS_DOCUMENT_STATUSES`, `DMS_CONFIDENTIALITY_LEVELS`, `DMS_ENTITY_TYPES` with labels

**Badges:**
- `dms-document-status-badge.tsx` — colored badges for all 9 document statuses
- `dms-confidentiality-badge.tsx` — colored badges for 6 confidentiality levels
- `dms-expiry-badge.tsx` — Expired / Expiring ≤7d / Expiring ≤30d / Valid / No Expiry with `getExpiryState()` and `getDaysRemaining()` utilities

**List:**
- `dms-documents-table.tsx` — client-side filtered table with search, type/category/status/confidentiality/expiry filters; columns: document_no, title, type, status, confidentiality, expiry, tags, created_at; actions: open, archive/unarchive, delete

**Record Form:**
- `dms-document-record-form.tsx` — full `ERPRecordWorkspaceForm` implementation with all workspace hooks (draft, dirty, section state, scroll state), 10 sections, auto-close on Save & Close

### Sections: `src/features/dms/documents/sections/`

| Section | File | Status |
|---|---|---|
| Overview | `dms-document-overview-section.tsx` | Full CRUD — title, description, document type, category, status, confidentiality, issue/expiry date, company/branch IDs. Auto-populates category + confidentiality on type change. |
| Metadata | `dms-document-metadata-section.tsx` | Dynamic fields from `dms_metadata_definitions`. Supports text, textarea, number, date, datetime, boolean, select, multi_select, currency, json, and reference types. Save separately. |
| Links | `dms-document-links-section.tsx` | View existing links; add link (entity_type + entity_id + role + is_primary); remove link (soft-delete) |
| Tags | `dms-document-tags-section.tsx` | Assign/remove tags using `dms_tags`; save-all pattern with visual color display |
| Versions | `dms-document-versions-section.tsx` | Placeholder — reads existing versions if any; upload blocked until DMS.5 |
| Files | `dms-document-files-section.tsx` | Placeholder — reads existing files if any; no download/preview; upload blocked until DMS.5 |
| Expiry | `dms-document-expiry-section.tsx` | Expiry status banner, days remaining, validity period, DMS.8 reminder placeholder |
| Approvals | `dms-document-approvals-section.tsx` | Placeholder for future workflow |
| Comments | `dms-document-comments-section.tsx` | Add/delete own comments; Ctrl+Enter shortcut; real-time refresh via TanStack Query |
| Audit | `dms-document-audit-section.tsx` | Chronological `dms_document_events` timeline; read-only |

---

## 8. Query Hooks / Invalidation Updates

### `src/lib/query/query-keys.ts` additions:
```typescript
dms.documents(filters?)    → ["dms", "documents", filters?]
dms.document(id)           → ["dms", "documents", id]
dms.documentRecord(id)     → ["dms", "documents", id, "record"]
dms.documentMetadata(id)   → ["dms", "documents", id, "metadata"]
dms.documentMetadataDefs(typeId) → ["dms", "metadata-defs", typeId]
dms.documentLinks(id)      → ["dms", "documents", id, "links"]
dms.documentTags(id)       → ["dms", "documents", id, "tags"]
dms.documentComments(id)   → ["dms", "documents", id, "comments"]
dms.documentEvents(id)     → ["dms", "documents", id, "events"]
dms.newDocumentDefaults()  → ["dms", "new-document-defaults"]
```

### `src/lib/query/invalidation.ts` additions:
- `invalidateDmsDocuments(qc)` — invalidates all documents
- `invalidateDmsDocument(qc, id)` — invalidates specific document
- `invalidateDmsDocumentRecord(qc, id)` — invalidates document + list

---

## 9. Validation Rules Implemented

- `title`: required, max 500 chars
- `document_type_id`: required, positive integer
- `category_id`: required, positive integer
- `status`: one of 8 valid statuses (enum)
- `confidentiality_level`: one of 6 valid levels (enum)
- `issue_date` / `expiry_date`: valid date strings when provided
- `expiry_date >= issue_date` cross-field validation
- `owning_company_id` / `owning_branch_id`: positive integer when provided
- Link: `entity_type` from approved list, `entity_id` positive number
- Comment: non-empty, max 2000 chars
- Zod v4 used throughout (`.issues[0]?.message` pattern)

---

## 10. Permissions Used

| Action | Required Permission |
|---|---|
| View list / record | `dms.documents.view` OR `dms.admin` |
| Create document | `dms.documents.upload` OR `dms.admin` |
| Edit document / metadata / links / tags | `dms.documents.edit` OR `dms.admin` |
| Archive / unarchive | `dms.documents.archive` OR `dms.admin` |
| Soft-delete | `dms.documents.delete` OR `dms.admin` |
| Manage tags on document | `dms.documents.edit` OR `dms.documents.manage_tags` OR `dms.admin` |
| Add / delete comments | `dms.documents.view` OR `dms.admin` |
| View audit events | `dms.documents.view` OR `dms.admin` |

---

## 11. Audit Events Implemented

### Global ERP audit log (`logAudit`):
- `create` on `dms_documents`
- `update` on `dms_documents`
- `archive` / `unarchive` / `delete` on `dms_documents`
- `update` on `dms_document_metadata_values`
- `create` / `delete` on `dms_document_links`
- `update` on `dms_document_tags`
- `create` / `update` / `delete` on `dms_document_comments`

### DMS-specific `dms_document_events` events:
`document_created`, `document_updated`, `archived`, `unarchived`, `deleted`, `metadata_updated`, `link_added`, `link_removed`, `tags_updated`, `comment_added`, `comment_updated`, `comment_deleted`

---

## 12. Dynamic Metadata Implementation

Metadata fields are loaded from `dms_metadata_definitions` filtered by `document_type_id` and `is_active = true`, ordered by `sort_order`. Field types supported:

- `text` → `<Input type="text">`
- `textarea` → `<Textarea>`
- `number` / `currency` → `<Input type="number">`
- `date` → `<Input type="date">`
- `datetime` → `<Input type="datetime-local">`
- `boolean` → `<Switch>`
- `select` (options from `options_json.values`) → `<Select>`
- `multi_select` → checkbox group
- `json` → `<Textarea>` with monospace font
- Reference types (`party_ref`, `employee_ref`, etc.) → `<Input type="text">` (deferred to appropriate DMS phase with full selectors)

Values saved to/loaded from `dms_document_metadata_values` with correct typed columns (`value_text`, `value_number`, `value_date`, `value_datetime`, `value_boolean`, `value_json`). AI extractable fields show a purple "AI" badge.

---

## 13. Tags / Links / Comments / Expiry / Audit Implementation

- **Tags**: Multi-select with visual color chips from `dms_tags`; save-all (delete+insert) pattern
- **Links**: Read/write `dms_document_links`; entity_type dropdown uses approved `DMS_ENTITY_TYPES` list; soft-delete
- **Comments**: Append-only with Ctrl+Enter shortcut; soft-delete own comments only; author name via user_profiles join
- **Expiry**: Visual banner (green/amber/orange/red) based on days remaining; DMS.8 reminder placeholder shown
- **Audit**: Read-only chronological timeline of `dms_document_events` with human-readable event labels

---

## 14. File Upload Explicitly Deferred

- ❌ No file upload UI created
- ❌ No write to `dms_document_files`
- ❌ No write to `dms_document_versions`  
- ❌ No Supabase Storage usage
- ❌ No signed URL generation
- ✅ `dms_document_files` read-only display if records exist (e.g. manually inserted)
- ✅ `dms_document_versions` read-only display if records exist
- ✅ Placeholder banners shown in Versions and Files sections pointing to DMS.5

---

## 15. Party Documents No-Runtime-Change Confirmation

- ✅ `party_documents` table: UNCHANGED
- ✅ `party_document_types` table: UNCHANGED  
- ✅ `PartyDocumentsTab` component: UNCHANGED
- ✅ Party document server actions: UNCHANGED
- ✅ Party Master record form: UNCHANGED
- ✅ A migration notice is shown on the DMS Dashboard (`/dms`) page explaining Party Documents migration is deferred to DMS.6

---

## 16. Source of Truth / Rule Updates

- ✅ `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated: `Last updated`, `Last closed gate`, new DMS Document Repository module row, new ERP DMS.4 phase row in phase tracker
- ✅ `.cursor/rules/erp-dms-standard.mdc` updated: version V4→V5, phase/status updated to DMS.4, DMS.4 additions documented, new "Do NOT" rules added (no file upload before DMS.5, no client-side numbering, no hardcoded metadata, no Party Documents tab before DMS.6), phase sequence updated (DMS.4 DONE, DMS.5 NEXT)

---

## 17. TypeScript / Lint / Build QA

```
npx tsc --noEmit  → Exit 0 (PASS) — 0 errors
npm run build     → Exit 0 (PASS) — all 4 new routes compiled
```

### TypeScript fixes applied:
1. **Zod v4 `.issues`**: Changed `parsed.error.errors[0]` → `parsed.error.issues[0]` in documents.ts, document-comments.ts, document-links.ts
2. **`logAudit` `entity_reference` required**: Added `entity_reference: String(id)` to all logAudit calls missing it (documents.ts, document-comments.ts, document-links.ts, document-tags.ts, document-metadata-values.ts)
3. **Supabase join type casting**: Used `as unknown as T[]` for Supabase joined data in document-comments.ts, document-events.ts, document-metadata-values.ts, document-tags.ts, documents.ts
4. **`ERPCombobox` prop name**: Changed `onChange` → `onValueChange` in overview section
5. **`ERPFieldGrid` no `cols` prop**: Replaced with `div.grid.grid-cols-2.gap-4` pattern
6. **`ERPRecordStatusVariant` uses `"danger"`**: Changed `"error"` → `"danger"` in record form
7. **`status` type casting**: Cast `status as "draft" | ...` for Zod enum compatibility
8. **`markDirty(tabId, dirty)`**: Fixed call signature to pass `activeTab?.id` and `true`

---

## 18. Manual Browser Test Checklist

| Test | Expected Result |
|---|---|
| DMS Documents sidebar item appears | ✅ "Documents" group with Dashboard + All Documents |
| Open /dms | ✅ Dashboard with quick links |
| Open /dms/documents | ✅ Document list loads |
| Filters work | ✅ Search, type, category, status, confidentiality, expiry filters |
| New Document button opens workspace form | ✅ Opens in new workspace tab |
| Required field validation | ✅ Title + document type + category required |
| Selecting document type auto-populates category + confidentiality | ✅ Yes |
| Metadata section loads fields for TRADE_LICENSE type | ✅ Dynamic fields from dms_metadata_definitions |
| Create metadata-only document works | ✅ Yes |
| Document number generated from MASTER_DMS_DOCUMENT | ✅ DMS-{YYYY}-{SEQ6} format |
| Created document appears in list | ✅ Yes |
| Edit document works | ✅ Yes |
| View mode prevents editing | ✅ All fields disabled in view mode |
| Dynamic metadata values save and reload | ✅ Upsert to dms_document_metadata_values |
| Tags can be assigned and reload | ✅ saveDmsDocumentTags |
| Links section displays and can add/remove | ✅ Yes |
| Comments can be added and reload | ✅ Yes |
| Audit section shows document_created | ✅ Yes |
| Versions section shows placeholder | ✅ "No file versions uploaded yet" |
| Files section shows placeholder and no upload | ✅ "No files attached yet" |
| Expiry badge works | ✅ Colored badge based on days remaining |
| Archive/unarchive works | ✅ Via table action buttons |
| Soft delete works | ✅ Via table action buttons with confirm |
| Party Documents tab behavior unchanged | ✅ Not modified |
| No upload UI exists | ✅ Confirmed |
| No file uploaded to Supabase Storage | ✅ Confirmed |
| No OCR/AI actions exist | ✅ Confirmed |

---

## 19. Database / RLS QA

| Test | Expected |
|---|---|
| New `dms_documents` row created | ✅ Yes |
| `document_no` generated via numbering rule | ✅ DMS-YYYY-XXXXXX format |
| `dms_document_metadata_values` saved correctly | ✅ Upsert by (document_id, definition_id) |
| `dms_document_tags` saved correctly | ✅ Replace-all pattern |
| `dms_document_events` inserted on all mutations | ✅ Yes |
| `dms_document_links` inserted only if link added | ✅ Yes |
| No `dms_document_files` row inserted by DMS.4 create | ✅ Confirmed |
| `party_documents` unchanged | ✅ Confirmed |
| `party_document_types` unchanged | ✅ Confirmed |

---

## 20. Issues / Deferred Items

| Item | Status |
|---|---|
| Party/company/branch selector for Links section | Deferred — uses numeric ID input for now. Full selectors in future phase. |
| Country/region/city reference fields in Metadata | Deferred — uses text input. Full selectors in future phase. |
| Confidentiality-based RLS filtering | Deferred to DMS.13 (column-level security) |
| Expiry reminder notifications | Deferred to DMS.8 |
| Approval workflow | Deferred to future phase |
| File upload + versioning | Deferred to DMS.5 |
| OCR extraction | Deferred to DMS.9 |
| AI extraction | Deferred to DMS.10/DMS.11 |
| Party Documents DMS linking | Deferred to DMS.6 |

---

## 21. Recommended Next Phase

**ERP DMS.5 — Upload Inbox and File Storage**

DMS.5 will implement:
- File upload UI (drag-and-drop + browse)
- `dms_upload_sessions` for temporary file staging
- Move from `dms-temp` to `dms-documents` storage bucket
- `dms_document_files` and `dms_document_versions` creation
- SHA-256 duplicate detection
- File status on document record
- First real file attachment to DMS documents
