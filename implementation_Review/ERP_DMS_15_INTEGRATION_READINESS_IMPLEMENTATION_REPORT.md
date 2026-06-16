# ERP DMS.15 — Integration Readiness Implementation Report

**Phase:** ERP DMS.15  
**Title:** Integration Readiness for HR, Fleet, Workshop, Projects, Finance, HSE  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-16  
**Author:** Cursor AI (Sonnet 4.6)

---

## 1. Phase Objective

Prepare DMS to be safely reused by all future ERP modules (HR, Fleet, Workshop, Projects, Finance, HSE) by building:

- A canonical entity type registry for DMS document links
- Reusable server actions for entity-linked document management
- Reusable UI components (Documents tab, compliance cards)
- Query key + invalidation coverage
- Party Master integration preserved and forward-compatible

This phase does NOT build any operational module. It builds the bridge.

---

## 2. Files Created

| File | Purpose |
|---|---|
| `src/lib/dms/dms-entity-types.ts` | Canonical entity type registry (24 entity types) |
| `src/features/dms/entity-documents/dms-entity-documents-tab.tsx` | Reusable DMS entity documents tab component |
| `src/features/dms/entity-documents/dms-entity-document-compliance-cards.tsx` | Compliance summary cards component |
| `src/features/dms/entity-documents/index.ts` | Public exports barrel file |

---

## 3. Files Modified

| File | Change |
|---|---|
| `src/features/dms/documents/dms-document-constants.ts` | Re-exports from canonical lib (backward compatible) |
| `src/server/actions/dms/entity-documents.ts` | Added compliance summary action, AI-era fields, canonical entity type validation |
| `src/lib/query/query-keys.ts` | Added `entityDocumentCompliance`, `attachableDocuments` query keys |
| `src/lib/query/invalidation.ts` | Extended `invalidateDmsEntityDocuments` to also clear compliance + attachable caches |

---

## 4. Migration Required

**No database migration required.**

The existing `dms_document_links` table schema supports all integration patterns:
- `entity_type` (text, free-form — accepts all registered types)
- `entity_id` (bigint)
- `link_role`, `is_primary`, `notes`, `deleted_at` — all present

---

## 5. Entity Type Registry

**File:** `src/lib/dms/dms-entity-types.ts`

24 entity types registered across 6 future modules:

| Constant | Code | Module |
|---|---|---|
| `PARTY` | `party` | Party Master (live) |
| `PARTY_LICENSE` | `party_license` | Party Master (live) |
| `PARTY_TAX_REGISTRATION` | `party_tax_registration` | Party Master (live) |
| `COMPANY` | `company` | Admin |
| `BRANCH` | `branch` | Admin |
| `BANK` | `bank` | Admin |
| `EMPLOYEE` | `employee` | HR (future) |
| `EMPLOYEE_COMPLIANCE` | `employee_compliance` | HR (future) |
| `VEHICLE` | `vehicle` | Fleet (future) |
| `EQUIPMENT` | `equipment` | Fleet (future) |
| `FLEET_ASSET` | `fleet_asset` | Fleet (future) |
| `WORKSHOP_JOB` | `workshop_job` | Workshop (future) |
| `WORKSHOP_SERVICE` | `workshop_service` | Workshop (future) |
| `PROJECT` | `project` | Projects (future) |
| `CONTRACT` | `contract` | Projects/Finance (future) |
| `SITE` | `site` | Projects (future) |
| `INVOICE` | `invoice` | Finance (future) |
| `PAYMENT` | `payment` | Finance (future) |
| `PURCHASE_ORDER` | `purchase_order` | Finance (future) |
| `HSE_INCIDENT` | `hse_incident` | HSE (future) |
| `HSE_PERMIT` | `hse_permit` | HSE (future) |
| `HSE_TRAINING` | `hse_training` | HSE (future) |
| `HSE_INSPECTION` | `hse_inspection` | HSE (future) |
| `JOB_CARD` | `job_card` | Workshop/Fleet (future) |

Also exported: `DMS_ENTITY_TYPE_LABELS`, `DMS_ENTITY_REQUIRED_DOCUMENT_HINTS`, `getDmsEntityTypeLabel()`, `isValidDmsEntityType()`

---

## 6. Server Actions Added / Extended

**File:** `src/server/actions/dms/entity-documents.ts`

### Pre-existing (extended):
- **`getDmsDocumentsByEntity(entityType, entityId)`** — extended to include AI-era fields: `ai_summary`, `ai_risk_level`, `ai_risk_score`, `completeness_score`. Confidential documents have `ai_summary` redacted for non-admin users. Imports updated to use canonical entity type lib.
- **`linkDmsDocumentToEntity(documentId, entityType, entityId, options?)`** — updated entity type validation to use expanded `DMS_ENTITY_TYPE_CODES` (now 24 types vs 14 before).
- **`unlinkDmsDocumentFromEntity(linkId, documentId, entityType, entityId)`** — unchanged, already correct.
- **`getAvailableDmsDocumentsForLink(entityType, entityId, search?)`** — unchanged, already correct.

### New:
- **`getDmsEntityDocumentComplianceSummary(entityType, entityId)`** — returns `DmsEntityDocumentComplianceSummary` with:
  - `totalDocuments`
  - `expiredDocuments` (expiry_date < today)
  - `expiringSoonDocuments` (expiry_date within 30 days)
  - `missingRequiredDocuments` (returns 0 in v1 — full enforcement deferred to when modules define exact required types)
  - `highRiskDocuments` (ai_risk_level = "high")
  - `criticalRiskDocuments` (ai_risk_level = "critical")
  - `latestExpiryDate`

All actions require `dms.documents.view` or `dms.admin` permission. Write actions require `dms.documents.edit` or `dms.admin`.

---

## 7. UI Components Added

### `DmsEntityDocumentsTab`
**File:** `src/features/dms/entity-documents/dms-entity-documents-tab.tsx`

Props:
```ts
{
  entityType: string;
  entityId: number;
  entityLabel?: string;        // Auto-derived from entity type if not provided
  canUpload?: boolean;
  canLinkExisting?: boolean;
  canUnlink?: boolean;
  compact?: boolean;
  showComplianceCards?: boolean;  // Default: true
  onChildOpen?: (open: boolean) => void;
}
```

Features:
- Lists all linked documents with document number, title, type, status badge, expiry badge, risk badge
- AI summary snippet (redacted if confidential)
- Completeness score display
- File count badge
- Open in DMS button (links to `/dms/documents/record/[id]`)
- Attach Existing Document dialog (search + select + link)
- Unlink button (with confirmation — does NOT delete document)
- Empty state
- Refresh button
- Inline compliance cards (optional)
- Security info notice

### `DmsEntityDocumentComplianceCards`
**File:** `src/features/dms/entity-documents/dms-entity-document-compliance-cards.tsx`

Shows 5 KPI cards: Total, Expired, Expiring Soon, High Risk, Critical Risk.  
Uses `getDmsEntityDocumentComplianceSummary` action with `entityDocumentCompliance` query key.

---

## 8. Party Master Integration Result

**Decision: Leave Party DMS tab unchanged.**

The existing `party-dms-documents-tab.tsx` works correctly and uses its own server actions in `party-dms-documents.ts` which internally delegate to the same `entity-documents.ts` actions. Refactoring it to use `DmsEntityDocumentsTab` directly would be low-risk but offers no functional gain in this phase.

**Backward compatibility maintained:** `dms-document-constants.ts` now re-exports from the canonical lib, so all existing imports of `DMS_ENTITY_TYPES`, `DMS_ENTITY_TYPE_LABELS` continue to work without any change.

Future modules should use `DmsEntityDocumentsTab` directly from `@/features/dms/entity-documents`.

---

## 9. Permissions / Security Handling

| Action | Permission Required |
|---|---|
| View linked docs | `dms.documents.view` or `dms.admin` |
| Get compliance summary | `dms.documents.view` or `dms.admin` |
| Link/attach document | `dms.documents.edit` or `dms.admin` |
| Unlink document | `dms.documents.edit` or `dms.admin` |
| Upload for entity | Existing DMS upload permissions |

- `content_text` is never returned in entity document lists
- `ai_summary` is redacted for confidential documents (hr/legal/executive) for non-admin users
- No RLS changes made

---

## 10. RLS Findings

- `dms_document_links` RLS: enabled, forced, correct — no changes needed
- `dms_documents` RLS: correct — filters by user context automatically via `createClient()`
- All server actions use `createClient()` (RLS-enforced) for data reads
- No weakening of RLS in this phase

---

## 11. Known Limitations

1. **`missingRequiredDocuments` always returns 0** in `getDmsEntityDocumentComplianceSummary`. Full enforcement requires a DB table mapping `(entity_type, document_type_code)` required combinations — deferred to when individual modules are built. The `DMS_ENTITY_REQUIRED_DOCUMENT_HINTS` constant in the entity types lib provides the roadmap.

2. **Upload-for-entity** opens the DMS upload inbox with entity context via URL query params (`?entityType=&entityId=`). The upload inbox does not yet auto-populate the entity link on document approval. This requires a future enhancement when individual modules are implemented and their approval workflows are defined.

3. **Party DMS tab** is not yet refactored to use `DmsEntityDocumentsTab`. Left as-is to avoid risk; the reusable component is the standard for all future modules.

4. **Attach dialog** is embedded within `DmsEntityDocumentsTab` rather than as a separate standalone component file. For modules needing the dialog independently, they can extract from the tab or the dialog can be extracted in a future refactor.

---

## 12. TypeScript Result

```
npx tsc --noEmit
Exit code: 0 — No errors
```

---

## 13. Build Result

```
npm run build
✓ Compiled successfully in 7.8s
✓ TypeScript passed
✓ All pages generated
Exit code: 0 — PASS
```

---

## 14. Source of Truth Update

`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated with:
- ERP DMS.15 marked as CLOSED / PASS ✅
- Entity type registry details
- Reusable component paths
- Party Master integration decision
- TS/Build results
- Next phase recommendation

---

## 15. Recommended Next Phase

**ERP 003 — HR Module** (Employee Records, Compliance, Onboarding) — can immediately use `DmsEntityDocumentsTab` with `entityType="employee"` for employee document management without any additional DMS infrastructure work.

Alternatively, the next DMS enhancement could be:
- **DMS.16** — Upload-for-entity deep integration (passing entity context through the approval workflow so newly uploaded documents are auto-linked to the entity on approval)
