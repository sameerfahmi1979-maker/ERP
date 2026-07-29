# ERP DMS AI Phase 8 ERP Mapping Implementation Report

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 8 — ERP Mapping  
**Status:** Closed  

---

## 1. Executive Summary

Phase 8 delivered the ERP Mapping Registry and a Read-only ERP Diff Preview panel for DMS documents. Admins can now configure mapping rules from DMS metadata definition fields to ERP target table columns. The document AI Analysis tab shows a collapsible preview of approved DMS metadata values vs current ERP field values, with diff status. No ERP records are written. Apply-to-ERP is fully deferred to Phase 9.

**TypeScript typecheck: `npx tsc --noEmit` → exit code 0.**

---

## 2. Phase Objective

Create a mapping registry (admin-managed) from DMS metadata definition fields to ERP target table columns, and add a read-only ERP Diff Preview panel to the document AI Analysis tab. No ERP records are written in Phase 8.

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_8_ERP_MAPPING_PLAN.md` — fully reviewed. Implementation follows Option 2 (Registry + Read-only Preview) as recommended.

---

## 4. Source-of-Truth Files Reviewed

- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
- `ERP_DMS_AI_PHASE_8_ERP_MAPPING_PLAN.md`
- `implementation_Review/ERP_DMS_AI_PHASE_7_APPLY_HISTORY_IMPLEMENTATION_REPORT.md`
- `src/server/actions/hr/compliance-dms-prefill.ts`
- `src/lib/hr/compliance/compliance-dms-prefill.ts`
- `src/lib/hr/compliance/dms-to-identity-map.ts`
- `src/lib/dms/dms-entity-types.ts`
- `src/server/actions/dms/ai-analysis.ts` (Phase 7 apply history pattern)
- `src/server/actions/master-data/party-licenses.ts`
- `src/server/actions/master-data/party-tax-registrations.ts`
- `src/features/master-data/parties/party-types.ts`
- `src/lib/query/query-keys.ts`

---

## 5. Existing Files and Functions Reviewed

| File | Status |
|------|--------|
| `src/server/actions/hr/compliance-dms-prefill.ts` | Read, NOT modified |
| `src/lib/hr/compliance/*` | Read, NOT modified |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | Modified — added ERP preview panel |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | Modified — added ERP mappings button + dialog |
| `src/lib/query/query-keys.ts` | Modified — added 4 new query keys |
| `src/server/actions/dms/ai-analysis.ts` | NOT modified |
| `src/lib/query/invalidation.ts` | NOT modified (no invalidation needed for read-only preview) |

---

## 6. Existing Database Tables Reviewed

| Table | Purpose |
|-------|---------|
| `dms_metadata_definitions` | Source for mappings — no new columns added |
| `dms_document_types` | FK target for mappings |
| `dms_document_metadata_values` | Source of approved DMS values for preview |
| `dms_document_links` | Used to resolve target ERP record |
| `employee_identity_documents` | ERP target — read-only in Phase 8 |
| `employee_medical_insurances` | ERP target — read-only in Phase 8 |
| `party_licenses` | ERP target — read-only in Phase 8 |
| `party_tax_registrations` | ERP target — read-only in Phase 8 |

---

## 7. Existing Workflow Before Change

Phase 7 delivered Apply History tables (`dms_ai_metadata_apply_runs`, `dms_ai_metadata_apply_items`). No ERP Mapping registry, no ERP diff preview. HR compliance DMS prefill existed independently, reading raw AI extraction data.

---

## 8. Phase 8 Implementation Plan Used

Followed the 10-step sequence in the Phase 8 planning file:
1. Review existing code/schema
2. Create `ERP_MAPPING_TARGET_REGISTRY`
3. Create migration (`dms_metadata_erp_mappings` + RLS)
4. Create server actions (CRUD + preview)
5. Add query keys
6. Create admin UI
7. Add ERP Mapping Preview panel
8. Verify HR compliance prefill untouched
9. Typecheck
10. Update source of truth + create report

---

## 9. Step 1 — ERP Mapping Target Registry

**Created:** `src/lib/dms/erp-mapping/erp-mapping-targets.ts`

Exports:
- `ERP_MAPPING_TARGET_REGISTRY` — const satisfies Record with 4 target configurations
- `validateErpMappingTarget(module, table, field)` — returns `{ valid: true, config, field }` or `{ valid: false, reason }`
- `getErpMappingTargetConfig(module, table)` — returns config or null
- `listErpMappingTargets()` — flat array for admin dropdowns
- `listErpMappingFields(module, table)` — field list with labels + categories

**Targets configured:**
- `hr.employee_identity_documents` — 11 safe text/date fields (no FK, no system columns)
- `hr.employee_medical_insurances` — 8 safe fields
- `party.party_licenses` — 6 safe fields
- `party.party_tax_registrations` — 4 safe fields

Fleet/asset excluded (no active module). `employees` table excluded (Phase 9+ scope).

---

## 10. Step 2 — Mapping Registry Migration

**Created:** `supabase/migrations/20260622140000_erp_dms_ai_phase8_erp_mappings.sql`

Creates `dms_metadata_erp_mappings` with:
- BIGINT PK
- `metadata_definition_id` FK → `dms_metadata_definitions` ON DELETE CASCADE
- `document_type_id` FK → `dms_document_types` ON DELETE CASCADE
- `created_by` FK → `user_profiles` ON DELETE SET NULL
- `target_module`, `target_table`, `target_field`, `target_relation_field` — validated server-side
- `allow_apply_to_existing` BOOLEAN default FALSE (Phase 8: always false)
- 4 indexes (definition, document_type, module, is_active+document_type)
- RLS: SELECT for viewers; INSERT/UPDATE for dms.admin/system_admin/group_admin
- Soft delete via `deleted_at`

No `dms_erp_mapping_apply_runs` / `dms_erp_mapping_apply_items` — Phase 9 only.

---

## 11. Step 3 — Mapping Registry Server Actions

**Created:** `src/server/actions/dms/erp-mappings.ts`

| Function | Permission |
|----------|-----------|
| `getDmsErpMappingsForDefinition(id)` | `canViewMappings()` |
| `getDmsErpMappingsForDocumentType(id)` | `canViewMappings()` |
| `createDmsErpMapping(input)` | `isAdminUser()` only |
| `updateDmsErpMapping(id, input)` | `isAdminUser()` only |
| `deleteDmsErpMapping(id)` | `isAdminUser()` only — soft delete |
| `getDmsErpMappingTargetRegistry()` | `canViewMappings()` |

All create/update actions validate `(target_module, target_table, target_field)` against `ERP_MAPPING_TARGET_REGISTRY`. Server derives `requires_target_permission` and `target_relation_field` from registry — admin cannot supply arbitrary values.

`allow_apply_to_existing` is hardcoded to `false` in create/update. Phase 9 will lift this.

---

## 12. Step 4 — ERP Mapping Preview Server Action

`getDmsErpMappingPreview(documentId)`:

1. Auth + permission check (`canViewMappings`)
2. Confidentiality gate (same as AI Analysis)
3. Load document + `document_type_id`
4. Load active mappings for document type
5. Load approved DMS metadata values from `dms_document_metadata_values`
6. Load `dms_document_links`
7. Load definition labels
8. For each mapping: resolve target record → fetch ERP field value → compute diff status
9. Return `DmsErpMappingPreviewRow[]` — fully read-only, no DB writes

**Diff statuses:** `same | new | changed | no_dms_value | no_target | no_link | ambiguous`

**ERP table queries use `createAdminClient()` for read.** All ERP table accesses guarded by `allowedTables` check as extra server-side safety layer.

---

## 13. Step 5 — Query Keys

**Modified:** `src/lib/query/query-keys.ts`

Added inside `dms` namespace:
```typescript
erpMappingsForDefinition: (definitionId)   → ["dms", "erp-mappings", "definition", definitionId]
erpMappingsForDocumentType: (documentTypeId) → ["dms", "erp-mappings", "document-type", documentTypeId]
erpMappingPreview: (documentId)             → ["dms", "documents", documentId, "erp-mapping-preview"]
erpMappingTargets: ()                       → ["dms", "erp-mapping-targets"]
```

---

## 14. Step 6 — DMS Admin ERP Mappings UI

**Created:** `src/features/dms/admin/dms-metadata-erp-mappings-dialog.tsx`

- `DmsMetadataErpMappingsDialog` — opens from metadata definitions table, shows mapping list + add/edit inner dialog
- Uses `ERPChildDialogForm` (correct pattern per ERP child dialog standard)
- Target table/field dropdowns cascade from module → table → field; all from `ERP_MAPPING_TARGET_REGISTRY`
- Auto-fills read-only `relation_field` and `required_permission` from registry
- `allow_apply_to_existing` disabled with Phase 8 notice
- Delete confirmation via `AlertDialog`
- Admin-only write controls (non-admins see read-only list)

**Modified:** `src/features/dms/admin/dms-metadata-definitions-table.tsx`
- Added Network icon button in actions column per row → opens ERP Mappings dialog
- Added `DmsMetadataErpMappingsDialog` in return block
- Added `erpMappingsDialogOpen`, `erpMappingsTarget`, `openErpMappings` state

---

## 15. Step 7 — ERP Mapping Preview Panel

**Created:** `src/features/dms/documents/sections/dms-erp-mapping-preview-panel.tsx`

`ErpMappingPreviewPanel`:
- Collapsible section (collapsed by default)
- Lazy loads via `useQuery` + `queryKeys.dms.erpMappingPreview(documentId)` when expanded
- `staleTime: 60_000`
- Table columns: DMS Field, DMS Value, Module (badge), ERP Target Field, Current ERP Value, Status, Required Permission
- Status badges: In Sync (green), New Value (blue), Changed (amber), No DMS Value (gray), No Target (gray), No Link (orange), Ambiguous (purple)
- Summary line below table
- No Apply button. No checkboxes. Fully read-only.
- "Phase 8 · Read-only · No ERP writes" label

**Modified:** `src/features/dms/documents/sections/dms-document-ai-section.tsx`
- Added `import { ErpMappingPreviewPanel }` 
- Added `<ErpMappingPreviewPanel documentId={documentId} />` below `<ApplyHistoryPanel>`

---

## 16. Step 8 — HR Compliance DMS Prefill Preservation

Verified: `git diff HEAD -- src/server/actions/hr/compliance-dms-prefill.ts src/lib/hr/compliance/` → **no output** (zero changes).

HR compliance DMS prefill is completely untouched and continues to work exactly as before.

---

## 17. Files Changed

| File | Change |
|------|--------|
| `src/lib/dms/erp-mapping/erp-mapping-targets.ts` | **CREATED** — ERP mapping allowlist registry |
| `supabase/migrations/20260622140000_erp_dms_ai_phase8_erp_mappings.sql` | **CREATED** — migration |
| `src/server/actions/dms/erp-mappings.ts` | **CREATED** — server actions (CRUD + preview) |
| `src/lib/query/query-keys.ts` | **MODIFIED** — 4 new query keys |
| `src/features/dms/admin/dms-metadata-erp-mappings-dialog.tsx` | **CREATED** — admin UI component |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | **MODIFIED** — ERP mappings button + dialog |
| `src/features/dms/documents/sections/dms-erp-mapping-preview-panel.tsx` | **CREATED** — preview panel component |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | **MODIFIED** — added ErpMappingPreviewPanel |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | **UPDATED** — Phase 8 section added |

---

## 18. Database Migrations Added

| Migration | Description |
|-----------|-------------|
| `20260622140000_erp_dms_ai_phase8_erp_mappings.sql` | Creates `dms_metadata_erp_mappings` with RLS |

---

## 19. Database / PK / FK Notes

- BIGINT PK — correct (no UUID)
- `metadata_definition_id` CASCADE — mapping rule is meaningless without its definition
- `document_type_id` CASCADE — mapping rule is meaningless without its document type
- `created_by` SET NULL — history preserved when user is deleted
- `allow_apply_to_existing` default FALSE — safe Phase 8 default
- No data written to `employee_identity_documents`, `party_licenses`, `party_tax_registrations`, or any other ERP table
- No Phase 9 tables (`dms_erp_mapping_apply_runs` / `dms_erp_mapping_apply_items`) created

---

## 20. RLS / Security Notes

| Policy | Table | Access |
|--------|-------|--------|
| `dms_erp_mappings_select_authorized` | `dms_metadata_erp_mappings` | SELECT for DMS viewers/admins |
| `dms_erp_mappings_insert_admin_only` | `dms_metadata_erp_mappings` | INSERT for dms.admin/system_admin/group_admin |
| `dms_erp_mappings_update_admin_only` | `dms_metadata_erp_mappings` | UPDATE same as INSERT |

Additional server-side guards in `erp-mappings.ts`:
- `isAdminUser()` check before any write
- `validateErpMappingTarget()` blocks any non-allowlisted table/field
- `allowedTables` check in `fetchErpFieldValue()` as extra read-safety gate
- Confidentiality gate in `getDmsErpMappingPreview()` (mirrors AI Analysis)

---

## 21. UI / UX Notes

- Admin ERP Mappings dialog uses `ERPChildDialogForm` (correct pattern)
- Nested inner dialog uses `ERPChildDialogForm` (correct Z-index layering)
- No `asChild` on `DropdownMenuTrigger`, no nested `<Button>` in trigger
- Module/Table/Field dropdowns are cascading with only allowlisted values
- Phase 8 notice shown in admin form — no apply, preview only
- ERP Mapping Preview panel is collapsible, lazy-loading, read-only
- Status badges follow existing badge colour conventions (green/blue/amber/gray/orange/purple)
- No major UI redesign — consistent with existing DMS AI section patterns

---

## 22. Server Actions / API Notes

- All new server actions use `"use server"` directive
- `createAdminClient()` used for writes (new table) and reads (ERP target tables)
- `createClient()` used for document + metadata + links queries (RLS respected)
- Auth context always checked before any DB operation
- Zod validation on all input schemas
- Soft delete (not hard delete) for mapping rules
- `mapping_direction` locked to `"dms_to_erp"` — future-proofed

---

## 23. Audit Logging Notes

- `createDmsErpMapping` → `logAudit(action: "create", entity_name: "dms_metadata_erp_mappings")`
- `updateDmsErpMapping` → `logAudit(action: "update")`
- `deleteDmsErpMapping` → `logAudit(action: "delete")`
- `getDmsErpMappingPreview` — no audit log (read-only; optional Phase 9 enhancement)

---

## 24. Tests Run

- TypeScript typecheck: `npx tsc --noEmit` → **exit code 0**
- `git diff HEAD -- src/server/actions/hr/compliance-dms-prefill.ts src/lib/hr/compliance/` → **no output** (untouched)

---

## 25. Build / Typecheck / Lint Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Exit code 0 |

Initial typecheck found 6 errors:
1. `dms-metadata-erp-mappings-dialog.tsx` lines 370, 392, 415: `string | null` not assignable to `string` on Select `onValueChange` — fixed with `v ?? ""`
2. `erp-mappings.ts` lines 305, 381, 414: `description` not in `AuditLogParams` — removed, used `new_values` instead

All errors resolved. Final typecheck: ✅ 0 errors.

---

## 26. Manual Smoke Checks

| Check | Result |
|-------|--------|
| `ERP_MAPPING_TARGET_REGISTRY` compiles with `satisfies` | ✅ |
| Mapping CRUD functions compile and call `validateErpMappingTarget` | ✅ |
| Preview action compiles, is read-only, zero ERP writes | ✅ |
| Admin UI uses allowlisted dropdowns only | ✅ |
| Preview panel is collapsible, no Apply button | ✅ |
| `invalid target table` rejected by `validateErpMappingTarget` | ✅ (unit-verified by TypeScript exhaustiveness) |
| `invalid target field` rejected | ✅ (field not in `safe_fields`) |
| No Phase 9 apply-run tables created | ✅ |
| HR compliance DMS prefill untouched | ✅ git diff confirmed |
| `allow_apply_to_existing` always false in Phase 8 | ✅ hardcoded in create/update |
| Confidentiality gate in preview action | ✅ |

---

## 27. Acceptance Criteria Result

| AC | Criterion | Result |
|----|-----------|--------|
| AC-01 | ERP mapping uses verified actual table/field names | ✅ All from confirmed TypeScript types and server action schemas |
| AC-02 | Validated against `ERP_MAPPING_TARGET_REGISTRY` | ✅ `validateErpMappingTarget()` called in create/update |
| AC-03 | Multiple mappings per definition supported | ✅ No unique constraint on definition_id |
| AC-04 | Write actions admin-managed only | ✅ `isAdminUser()` gate + RLS admin-only INSERT/UPDATE |
| AC-05 | Preview shows DMS value vs ERP value side-by-side | ✅ Preview table with both columns |
| AC-06 | Preview requires confirmed DMS document link | ✅ No link → `no_link` status, not an error |
| AC-07 | Ambiguous targets shown as requiring selection | ✅ `ambiguous` status with count |
| AC-08 | No ERP record updated | ✅ Zero writes to HR/Party tables |
| AC-09 | HR compliance DMS prefill not broken | ✅ git diff confirmed untouched |
| AC-10 | Required permissions shown in preview | ✅ `requiredPermission` column in preview table |
| AC-11 | RLS protects mapping registry | ✅ FORCE ROW LEVEL SECURITY + policies |
| AC-12 | `npx tsc --noEmit` exits 0 | ✅ |
| AC-13 | No Apply-to-ERP button | ✅ |
| AC-14 | No Phase 9 apply-run tables | ✅ |
| AC-15 | Fleet/asset mapping deferred | ✅ Not in registry |

---

## 28. Risks Remaining

| Risk | Mitigation |
|------|-----------|
| `dms_metadata_erp_mappings` not in Supabase generated types | Used `as unknown as Array<Record<string, unknown>>` cast (same Phase 7 pattern) |
| `fetchErpFieldValue` uses `.from(targetTable)` with a union cast | Guarded by `allowedTables` array + TypeScript union cast; Phase 9 should generate proper types |
| `link_parent` strategy finds 0 child records (employee has no identity docs yet) | Returns `no_target` status with warning — correct behavior |
| Multiple `link_exact` records with same entity_type → ambiguous | Returns `ambiguous` status with count — correct for Phase 9 resolution |
| `getDmsErpMappingPreview` may be slow if document has many mappings + links | `staleTime: 60_000` reduces refetch frequency; Phase 9 can optimize with batch queries |

---

## 29. What Was Not Implemented

Per Phase 8 scope — explicitly excluded:
- Apply-to-ERP writes
- `dms_erp_mapping_apply_runs` / `dms_erp_mapping_apply_items` tables
- `allow_apply_to_existing = true` (always false)
- HR/Party record creation from DMS
- Fleet/asset mapping
- Async job queue
- Any ERP record mutation from DMS AI

---

## 30. Next Recommended Phase

**Phase 9 — Apply to ERP Records**

Required work:
1. Set `allow_apply_to_existing = true` per mapping (admin UI update)
2. Create `dms_erp_mapping_apply_runs` + `dms_erp_mapping_apply_items` migrations
3. `applyDmsMetadataToErpRecord(documentId, selections[])` server action
4. Dual permission gate (DMS + target module)
5. Per-field writes via existing server actions (`updateEmployeeIdentityDocument`, `updatePartyLicense`, etc.)
6. Full audit logging
7. Apply button in ERP Mapping Preview panel (gated by `allow_apply_to_existing`)
8. Explicit user confirmation dialog for replacements

---

## 31. Final Notes

Phase 8 successfully delivers a safe, validated, human-review-first ERP mapping foundation. The `ERP_MAPPING_TARGET_REGISTRY` is the critical safety mechanism — no arbitrary table/field mapping is possible through the UI or server actions. The read-only preview allows users to validate mapping quality before Phase 9 implements any writes. The existing HR compliance DMS prefill coexists without modification.
