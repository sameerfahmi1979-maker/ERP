# ERP DMS.3 — DMS Admin Masters: Categories, Types, Tags, Metadata, Retention
## Implementation Report

**Phase:** ERP DMS.3  
**Date:** 2026-06-14  
**Status:** CLOSED / PASS ✅  
**Implemented by:** Cursor Agent  
**Approved by:** Sameer (via phase prompt `ChatGPT/ERP_DMS_3_DMS_ADMIN_MASTERS_CATEGORIES_TYPES_TAGS_METADATA_RETENTION_PROMPT.md`)

---

## 1. Executive Summary

ERP DMS.3 implements the complete **DMS Admin Masters UI** for managing the master data tables created in DMS.2. Six new admin route pages, six server action files, seven feature components, and a shared constants file were created. The DMS Admin navigation group was added to the sidebar, and all new routes were registered in the workspace route registry.

**No document repository, upload UI, OCR, AI extraction, or document workspace was built.** `party_documents` and `party_document_types` remain fully active and unchanged. This phase is purely admin master data management.

---

## 2. DMS.2 Dependency Confirmation

ERP DMS.2 (Database Foundation) was completed before this phase. All required tables already exist in Supabase:

| Table | Used In DMS.3 |
|---|---|
| `dms_document_categories` | Categories admin CRUD |
| `dms_document_types` | Document Types admin CRUD |
| `dms_metadata_definitions` | Metadata Definitions admin CRUD |
| `dms_tags` | Tags admin CRUD |
| `dms_document_tags` | Tag usage count computation |
| `dms_retention_policies` | Retention Policies admin CRUD |
| `dms_documents` | Used for usage checks before deletion |

---

## 3. Files Created / Modified

### New Server Actions (`src/server/actions/dms/`)

| File | Purpose |
|---|---|
| `categories.ts` | CRUD + activate/deactivate/delete for `dms_document_categories` |
| `document-types.ts` | CRUD + activate/deactivate/duplicate/delete for `dms_document_types` |
| `metadata-definitions.ts` | CRUD + activate/deactivate/reorder/delete for `dms_metadata_definitions` |
| `tags.ts` | CRUD + activate/deactivate/delete for `dms_tags` |
| `retention-policies.ts` | CRUD + activate/deactivate/delete for `dms_retention_policies` |
| `overview.ts` | `getDmsAdminOverviewStats` — parallel count queries for overview dashboard |

### New Feature Components (`src/features/dms/admin/`)

| File | Purpose |
|---|---|
| `dms-constants.ts` | Shared constants (ALLOWED_CONFIDENTIALITY, ALLOWED_ENTITY_TYPES, PARTY_DOC_TYPE_CODES, ALLOWED_FIELD_TYPES, ALLOWED_ACTIONS_ON_EXPIRY) |
| `dms-categories-table.tsx` | List + ERPChildDialogForm for categories |
| `dms-document-types-table.tsx` | List + ERPChildDialogForm for document types; includes party_document_types migration warning banner |
| `dms-metadata-definitions-table.tsx` | List + ERPChildDialogForm for metadata definitions |
| `dms-tags-table.tsx` | List + ERPChildDialogForm + color picker for tags |
| `dms-retention-policies-table.tsx` | List + ERPChildDialogForm for retention policies |
| `dms-overview-client.tsx` | Summary cards, phase timeline, quick links for DMS overview |

### New Route Pages (`src/app/(protected)/admin/dms/`)

| Route | File | Description |
|---|---|---|
| `/admin/dms` | `page.tsx` | DMS Admin overview with stats |
| `/admin/dms/categories` | `categories/page.tsx` | Document Categories management |
| `/admin/dms/document-types` | `document-types/page.tsx` | Document Types management |
| `/admin/dms/metadata-definitions` | `metadata-definitions/page.tsx` | Metadata Definitions management |
| `/admin/dms/tags` | `tags/page.tsx` | Tags management |
| `/admin/dms/retention-policies` | `retention-policies/page.tsx` | Retention Policies management |

### Modified Global Files

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "DMS Admin" navigation group with 6 menu items and new Lucide icons |
| `src/lib/workspace/workspace-route-registry.ts` | Registered all 6 DMS admin routes with titles, icons, and `moduleCode: "DMS"` |
| `src/lib/query/query-keys.ts` | Added `dms` namespace with 6 query key factories |
| `src/lib/query/invalidation.ts` | Added 7 DMS invalidation helpers + `invalidateAllDmsAdmin` |
| `.cursor/rules/erp-dms-standard.mdc` | Updated to V4: status UI-READY, DMS.3 DONE, DMS.4 is next |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated last closed gate, module table, phase tracker |

---

## 4. Server Actions — Pattern Compliance

All server actions follow the mandatory ERP server mutation pattern:

```
"use server"
→ getAuthContext()
→ hasPermission("dms.*")
→ Zod validation
→ Supabase query
→ logAudit(DMS_* event)
→ revalidatePath("/admin/dms/...")
→ return { success, data/error }
```

### Permission Summary

| Action Type | Required Permission |
|---|---|
| View any DMS admin page | `dms.documents.view` OR `dms.admin` |
| Create/update/delete categories | `dms.documents.manage_types` OR `dms.admin` |
| Create/update/delete document types | `dms.documents.manage_types` OR `dms.admin` |
| Create/update/delete metadata definitions | `dms.documents.manage_types` OR `dms.admin` |
| Create/update/delete tags | `dms.documents.manage_tags` OR `dms.admin` |
| Create/update/delete retention policies | `dms.documents.manage_types` OR `dms.admin` |

### Audit Events Logged

| Event | Trigger |
|---|---|
| `DMS_CATEGORY_CREATED` | createDmsCategory |
| `DMS_CATEGORY_UPDATED` | updateDmsCategory |
| `DMS_CATEGORY_ACTIVATED` | activateDmsCategory |
| `DMS_CATEGORY_DEACTIVATED` | deactivateDmsCategory |
| `DMS_CATEGORY_DELETED` | deleteDmsCategory |
| `DMS_DOCUMENT_TYPE_CREATED` | createDmsDocumentType |
| `DMS_DOCUMENT_TYPE_UPDATED` | updateDmsDocumentType |
| `DMS_DOCUMENT_TYPE_ACTIVATED` | activateDmsDocumentType |
| `DMS_DOCUMENT_TYPE_DEACTIVATED` | deactivateDmsDocumentType |
| `DMS_DOCUMENT_TYPE_DUPLICATED` | duplicateDmsDocumentType |
| `DMS_DOCUMENT_TYPE_DELETED` | deleteDmsDocumentType |
| `DMS_METADATA_DEF_CREATED` | createDmsMetadataDefinition |
| `DMS_METADATA_DEF_UPDATED` | updateDmsMetadataDefinition |
| `DMS_METADATA_DEF_ACTIVATED` | activateDmsMetadataDefinition |
| `DMS_METADATA_DEF_DEACTIVATED` | deactivateDmsMetadataDefinition |
| `DMS_METADATA_DEF_DELETED` | deleteDmsMetadataDefinition |
| `DMS_TAG_CREATED` | createDmsTag |
| `DMS_TAG_UPDATED` | updateDmsTag |
| `DMS_TAG_ACTIVATED` | activateDmsTag |
| `DMS_TAG_DEACTIVATED` | deactivateDmsTag |
| `DMS_TAG_DELETED` | deleteDmsTag |
| `DMS_RETENTION_POLICY_CREATED` | createDmsRetentionPolicy |
| `DMS_RETENTION_POLICY_UPDATED` | updateDmsRetentionPolicy |
| `DMS_RETENTION_POLICY_ACTIVATED` | activateDmsRetentionPolicy |
| `DMS_RETENTION_POLICY_DEACTIVATED` | deactivateDmsRetentionPolicy |
| `DMS_RETENTION_POLICY_DELETED` | deleteDmsRetentionPolicy |

---

## 5. Zod Validation Rules

| Field | Rule |
|---|---|
| Category `code` | Uppercase snake case, max 50 chars |
| Category `name` | Required, max 100 chars |
| Document Type `type_code` | Uppercase snake case (`/^[A-Z][A-Z0-9_]*$/`), max 50 chars |
| Document Type `default_confidentiality` | Enum: internal, company, hr, finance, legal, executive |
| Metadata `field_code` | Lowercase snake case (`/^[a-z][a-z0-9_]*$/`), max 50 chars |
| Metadata `field_type` | Enum: text, textarea, number, date, datetime, boolean, select, multi_select, …19 types |
| Metadata `options_json` | `z.record(z.string(), z.unknown())` — valid JSON object |
| Tag `tag_code` | Uppercase snake case, max 50 chars |
| Tag `color_hex` | Optional, hex color regex `/^#[0-9A-Fa-f]{6}$/` |
| Retention `policy_code` | Uppercase snake case, max 50 chars |
| Retention `retain_for_days` | Integer, min 1, max 36500 (100 years) |
| Retention `action_on_expiry` | Enum: notify, archive, delete_prompt, review |

---

## 6. UI/UX Decisions

- **Document Types screen**: Displays a prominent blue info banner about `party_document_types` migration (DMS.6). Types originating from `party_document_types` show a "Party" badge. System types show a "System" badge.
- **Tags screen**: Includes a color swatch preview in both the table and the add/edit dialog. Document count per tag is displayed.
- **Retention Policies screen**: Displays a warning note that "delete_prompt" action does not auto-hard-delete documents; it flags them for administrator review.
- **Metadata Definitions screen**: Supports `is_ai_extractable` toggle and `ai_field_hint` text, preparing for DMS.9 AI extraction. JSON editor for `options_json`.
- **Overview screen**: Shows phase timeline (DMS.1–DMS.10) with current phase highlight, plus quick navigation cards.
- All add/edit dialogs use `ERPChildDialogForm` following the existing ERP admin master UI pattern.
- All list pages use `ERPPageHeader` for consistent page titles and breadcrumbs.

---

## 7. `dms-constants.ts` — Module Boundary Fix

**Problem:** Next.js 16 `"use server"` modules may only export async functions. Exporting plain constants from `"use server"` files caused a build failure.

**Solution:** All shared constants (`ALLOWED_CONFIDENTIALITY`, `ALLOWED_ENTITY_TYPES`, `PARTY_DOC_TYPE_CODES`, `ALLOWED_FIELD_TYPES`, `ALLOWED_ACTIONS_ON_EXPIRY`) were moved to a dedicated `src/features/dms/admin/dms-constants.ts` file without a `"use server"` directive. Both server action files and client components import from this file.

---

## 8. TypeScript Issues Fixed

| Issue | Fix Applied |
|---|---|
| `Select.onValueChange` passing `string \| null` to `string` state setter | Added `?? "default"` nullish coalescing on all onValueChange handlers |
| Lucide `Brain` icon does not accept `title` prop | Wrapped `<Brain>` in `<span title="...">` |
| `z.record(z.unknown())` — Zod v4 requires 2 args | Changed to `z.record(z.string(), z.unknown())` |
| `category_id` Select value `null` not assignable to `string` | Added `?? ""` coalescing |

---

## 9. QA Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` (Next.js) | ✅ PASS — All 6 DMS routes compiled |
| Sidebar renders DMS Admin group | ✅ Verified |
| All 6 routes accessible | ✅ Verified |
| Server actions return correct shape | ✅ Verified |

---

## 10. What Was NOT Built (Deferred)

| Item | Phase |
|---|---|
| Document repository list (`/dms/documents`) | DMS.4 |
| Document record workspace form | DMS.4 |
| File upload UI | DMS.5 |
| `party_documents` / `party_document_types` migration | DMS.6 |
| OCR / AI extraction review queue | DMS.9 |
| Document link UI on Party/Employee/Vehicle etc. | DMS.7 |

---

## 11. Key Rules Established in DMS.3

1. **All new document types must be added to `dms_document_types`**, not `party_document_types`.
2. **Do not create a separate Party Document Types management screen.** Manage them from `/admin/dms/document-types`.
3. **`"use server"` files must not export non-function values.** Use a separate constants file.
4. **The DMS Admin sidebar group and workspace registry must be updated for any new DMS admin routes.**

---

## 12. Next Phase

**ERP DMS.4 — Document Repository List + Record Workspace Form**

Awaiting Sameer approval and phase prompt before implementation begins.
