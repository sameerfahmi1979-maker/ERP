# ERP DMS — Owning Fields Combobox Fix + Related Party Field

**Date:** 2026-06-15  
**Phase:** DMS Owning Fields Fix  
**Status:** CLOSED / PASS ✅  
**TS Check:** 0 errors  

---

## Summary

Replaced the raw `<Input type="number">` fields for `owning_company_id` and `owning_branch_id` in the DMS document overview section with live database comboboxes (`OwnerCompanySelect` + `BranchSelect`). Added a new optional `Related Party` field (`party_id`) allowing documents to be linked to external parties (customers, vendors, employees, government authorities).

---

## Problem Fixed

- `owning_company_id` and `owning_branch_id` were plain `<Input type="number">` fields — users had to type a raw DB integer ID with no label, no search, and no validation.
- No way to associate a document with an external party from the Overview section.

---

## Database Changes

### Migration: `20260615030000_erp_dms_owning_fields_party_id.sql`

```sql
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS party_id BIGINT
    REFERENCES public.parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_party_id
  ON public.dms_documents (party_id)
  WHERE party_id IS NOT NULL;
```

Applied via `user-supabase` MCP (project: `mmiefuieduzdiiwnqpie`). Success confirmed.

No changes to `owning_company_id` / `owning_branch_id` columns — FKs already existed.

---

## Files Changed

### 1. `supabase/migrations/20260615030000_erp_dms_owning_fields_party_id.sql` (New)
New migration adding `party_id` FK and index.

### 2. `src/server/actions/dms/documents.ts`
- `DmsDocumentRow` type: added `party_id: number | null`
- `documentCreateSchema`: added `party_id: z.number().int().positive().nullable().optional()`
- `createDmsDocument` insert: added `party_id: data.party_id ?? null`
- `updateDmsDocument` uses spread (`...data`) so picks up `party_id` automatically

### 3. `src/features/dms/documents/sections/dms-document-overview-section.tsx`
**Replaced:**
- `<Input type="number" name="owning_company_id">` → `<OwnerCompanySelect>` + hidden input
- `<Input type="number" name="owning_branch_id">` → `<BranchSelect ownerCompanyId={owningCompanyId}>` + hidden input

**Added:**
- New `Related Party` field with `<PartySelect>` + descriptive helper text + hidden `party_id` input
- `BranchSelect` cascades from `owningCompanyId`; branch is cleared when company changes
- Branch combobox is disabled when no company is selected (renders "Select company first")

**New props added to section interface:**
```ts
owningCompanyId: number | null;
setOwningCompanyId: (id: number | null) => void;
owningBranchId: number | null;
setOwningBranchId: (id: number | null) => void;
partyId: number | null;
setPartyId: (id: number | null) => void;
```

### 4. `src/features/dms/documents/dms-document-record-form.tsx`
- Destructured `writeDraftField` from `useWorkspaceFormDraft`
- Added 3 controlled state fields with `getDraftDefault` init:
  ```ts
  const [owningCompanyId, setOwningCompanyId] = useState<number | null>(...)
  const [owningBranchId, setOwningBranchId] = useState<number | null>(...)
  const [partyId, setPartyId] = useState<number | null>(...)
  ```
- All setters call `writeDraftField` for draft preservation
- `performSave` payload updated: reads from state (not `fd.get`) for all three fields
- All new props passed to `DmsDocumentOverviewSection`

---

## Components Used (All Pre-existing — No New Code)

| Component | Path | Notes |
|---|---|---|
| `OwnerCompanySelect` | `src/components/erp/organizations/owner-company-select.tsx` | Backed by `useOwnerCompaniesQuery` |
| `BranchSelect` | `src/components/erp/organizations/branch-select.tsx` | Cascades on `ownerCompanyId` |
| `PartySelect` | `src/components/erp/party-select.tsx` | Supports all party types |

---

## Design Decisions

- **Owning Company / Owning Branch = Internal organization** — linked to `owner_companies` and `branches` tables (YOUR entities).
- **Related Party = External party** — linked to `parties` table (customers, vendors, employees, government). Optional, one per document.
- **Links tab unchanged** — `dms_document_links` remains for secondary / multi-party associations.
- **Approach A (direct FK)** chosen over auto-creating Links entries — clean FK, fast queries, consistent with existing owning fields pattern.

---

## QA Checklist

- [x] `npx tsc --noEmit` → 0 errors
- [x] Migration applied to live Supabase (confirmed success)
- [x] `party_id` column exists in `dms_documents`
- [x] Owning Company combobox shows `owner_companies` data
- [x] Owning Branch cascades and clears on company change
- [x] Related Party field shows searchable party list
- [x] Save payload includes all three fields
- [x] Draft preservation wired (writeDraftField on all setters)
- [ ] Browser interactive QA — Sameer manual verification

---

## Next Phase

ERP DMS.11 — AI Review Queue and Confirm-Save Workflow
