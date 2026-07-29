# HR.14B — Existing Employee Record Updates from Existing DMS Documents

**Phase:** HR.14B  
**Date:** 2026-07-09  
**Status:** CLOSED / PASS  
**tsc:** PASS (0 errors)  
**build:** PASS (Next.js 16 production build, 0 errors)

---

## 1. Executive Summary

HR.14B implements "Add from Documents" wizard actions inside the Employee Profile → Compliance tab, allowing HR users to create compliance child records for **existing employees** by selecting already-uploaded DMS documents and reviewing AI-extracted field suggestions before saving.

Three record types are fully implemented:
- **Identity Documents** (employee_identity_documents)
- **Medical Insurance** (employee_medical_insurances)
- **Dependents** (employee_dependents)

No new DMS menus, no new HR intake sidebar, and no duplicate DMS upload flow were added. Everything uses the existing DMS module documents.

---

## 2. Scope Implemented

| Target | Status | Notes |
|---|---|---|
| Identity Document from DMS | ✅ Implemented | Passport/EID duplicate check enforced |
| Medical Insurance from DMS | ✅ Implemented | Full insurance field mapping |
| Dependent from DMS | ✅ Implemented | Multi-document merge supported |
| Training / Access Card | ⏭ Deferred | No suitable mapper exists; deferred to HR.14C |
| Feature flag `ERP_AI_HR_DOCUMENT_TO_RECORD` | ✅ Implemented | Default disabled; system_admin bypasses |
| DMS linking `link_role = hr14b_source` | ✅ Implemented | All saved records link DMS docs |
| Passport/EID duplicate blocking | ✅ Implemented | Reuses HR.14A `runIdentityDocumentDuplicateChecks` |
| Permissions: hr.compliance.manage + dms.documents.view | ✅ Implemented | Server-side enforcement on all actions |
| Audit logging | ✅ Implemented | All 3 create actions log to audit |
| `revalidatePath` on save | ✅ Implemented | Employee profile page is revalidated |

---

## 3. Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260709140000_hr14b_document_to_record_feature_flag.sql` | Inserts `ERP_AI_HR_DOCUMENT_TO_RECORD` feature flag (is_enabled = false) |
| `src/server/actions/hr/document-to-record.ts` | All HR.14B server actions (8 functions) |
| `src/features/hr/employees/document-to-record/hr-doc-to-record-wizard.tsx` | Shared wizard component (all 3 target types) |
| `implementation_Review/HR_Module/HR_14B_EXISTING_EMPLOYEE_RECORD_UPDATES_FROM_EXISTING_DMS_DOCUMENTS_IMPLEMENTATION_REPORT.md` | This report |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/hr/ai/types.ts` | Added `DOCUMENT_TO_RECORD: "ERP_AI_HR_DOCUMENT_TO_RECORD"` to `HR_AI_FEATURE_FLAGS` |
| `src/lib/hr/document-to-record/types.ts` | Added HR.14B types: `Hr14bTargetType`, `HrDmsDocForRecord`, `HrIdentityDocDraft`, `HrInsuranceDraft`, `HrDependentDraft`, + 3 Zod schemas with `CreateXFromDmsInput` types |
| `src/features/hr/employees/tabs/employee-compliance-tab.tsx` | Extended `SectionHeader` with `onAddFromDocs/canAddFromDocs`; added `FileStack` import; added HR.14B wizard state + `HrDocumentToRecordWizard` mounts in Identity, Insurance, Dependent sections; added `useQuery` call for feature flag check in main `EmployeeComplianceTab` |

---

## 5. Migration Summary

Applied via `user-supabase` MCP `apply_migration`:

```sql
INSERT INTO erp_ai_feature_flags (
  feature_code, feature_name, description, is_enabled, requires_human_review
) VALUES (
  'ERP_AI_HR_DOCUMENT_TO_RECORD',
  'HR Document-to-Record Wizard',
  '...description...',
  false,
  true
) ON CONFLICT (feature_code) DO NOTHING;
```

Migration status: **APPLIED SUCCESSFULLY**.

---

## 6. UI Entry Points

All buttons appear inside **Employee Profile → Compliance tab** when:
- The user has `hr.compliance.manage` permission
- The `ERP_AI_HR_DOCUMENT_TO_RECORD` feature flag is enabled (or user is system_admin)

| Section | Button Label |
|---|---|
| Legal Documents | "From Documents" |
| Medical Insurance | "From Documents" |
| Dependents | "From Documents" |

Buttons appear to the left of the existing "Add" button in each section header.

---

## 7. Wizard Workflow

**Step 1 — Select DMS Document(s)**
- Displays all DMS documents the user can access (RLS-scoped)
- Documents linked to the current employee appear first (badge: "Linked")
- Extraction status badges: "AI ready" / "OCR only" / "No extraction"
- Search box filters by document title
- For `dependent` type: multiple documents can be selected (merged)
- For `identity_document`/`medical_insurance`: single document selection

**Step 2 — Review & Confirm Draft**
- All fields prefilled from DMS extraction results using existing mappers
- User can edit every field before saving
- For identity documents: document type must be resolved (either auto-mapped or user-selected)
- For passport/EID: blocking duplicate check shown before save button is enabled
- Required fields are marked; submit button disabled until valid

---

## 8. Identity Document from DMS

Uses existing mappers from `src/lib/hr/compliance/dms-to-identity-map.ts`:
- `mapExtractionToIdentityForm()` — full field mapping
- `mapDmsTypeCodeToHrIdentityCode()` — DMS type → HR identity type resolution
- `normalizeDateValue()` — date normalization

Server action flow:
1. `aggregateIdentityDocumentFromDms(employeeId, documentId)` — loads DMS extraction, maps fields, returns `HrIdentityDocDraft`
2. `createIdentityDocumentFromDms(input)` — validates, checks passport/EID duplicates, inserts, links DMS doc, audits

`dms_document_id` is set on `employee_identity_documents` record directly.

---

## 9. Medical Insurance from DMS

Uses existing mappers from `src/lib/hr/compliance/medical-insurance-dms-map.ts`:
- `mapExtractionToMedicalInsuranceFields()` — full insurance field mapping
- `normalizeMedicalInsuranceAiFields()` — alias normalization

Server action flow:
1. `aggregateMedicalInsuranceFromDms(employeeId, documentId)` — maps extraction → `HrInsuranceDraft`
2. `createMedicalInsuranceFromDms(input)` — validates, inserts, links DMS doc, audits

`dms_document_id` is set on `employee_medical_insurances` record directly.

---

## 10. Dependent from DMS

Uses existing mappers from `src/lib/hr/compliance/dependent-dms-map.ts`:
- `mapFieldsToDependentByTypeCode()` — type-aware dependent field mapping
- `mergeDependentFields()` — merges multiple documents (fill-empty strategy)

Multi-document support: user selects 1–N documents; their extractions are merged using fill-empty priority.

Server action flow:
1. `aggregateDependentFromDms(employeeId, documentIds)` — iterates all selected docs, merges → `HrDependentDraft`
2. `createDependentFromDms(input)` — validates, inserts, links all source DMS docs, audits

No `dms_document_id` column on `employee_dependents`; documents are linked through `dms_document_links` with `link_role = 'hr14b_source'` for each source document.

---

## 11. Training / Access Card Support

**Deferred to HR.14C**. Reasons:
- No dedicated training/access card DMS mappers exist (unlike identity, insurance, dependent which have complete mapper files)
- Training certificates require `training_type_id` which needs UI lookup integration
- Access cards require `access_type_id` with site/client context not extractable from DMS alone

Both are noted in `Hr14bTargetType` definition as potential future extensions.

---

## 12. DMS Linking

Every document used in HR.14B is linked via `dms_document_links`:

```typescript
await adminClient.from("dms_document_links").upsert({
  document_id: dmsDocumentId,
  entity_type: "employee",
  entity_id: employeeId,
  link_role: "hr14b_source",
}, { onConflict: "document_id,entity_type,entity_id" });
```

- `entity_type = 'employee'`
- `entity_id = employeeId`
- `link_role = 'hr14b_source'`
- `upsert` prevents duplicate links if the document was already linked by other means

Additionally, `dms_document_id` is set directly on the created record for `identity_document` and `medical_insurance` (both tables have this column). For `dependent`, the entity link is the only association.

DMS entity document cache is invalidated via `invalidateDmsEntityDocuments(qc, "employee", employeeId)` after save.

---

## 13. Duplicate / Conflict Handling

**Identity Document duplicates:**
- Passport/EID number checked against existing `employee_identity_documents` across all employees
- Duplicate with different employee → **blocks save** (server-side `runIdentityDocumentDuplicateChecks`)
- Same check runs in `aggregateIdentityDocumentFromDms` (client-side warning) AND `createIdentityDocumentFromDms` (server-side gate)
- Document number is never logged in audit metadata (security)

**Conflict handling:**
- All draft fields are shown in the review step for manual inspection
- No auto-overwrite of any field
- User must confirm all values before clicking save
- There is no "keep existing / use document" UI conflict picker for HR.14B records (these are new records being created, not updates to existing ones)

---

## 14. Permissions / Feature Flags

**Server-side permission check** (`checkHr14bAccess()`):
1. `hr.compliance.manage` OR `hr.admin` OR `system_admin` role
2. `dms.documents.view` OR `dms.admin`
3. `ERP_AI_HR_DOCUMENT_TO_RECORD` feature flag enabled (bypassed for `system_admin`)

**Client-side visibility:**
- `checkHrDocumentToRecordEnabled()` server action queried once via `useQuery` in `EmployeeComplianceTab`
- "From Documents" buttons only shown when `canManageDoc && documentWizardEnabled`
- System admin sees the button regardless of flag state (server action bypasses flag for admins)

**Feature flag default:** `is_enabled = false`. Must be enabled in Admin → AI Settings.

---

## 15. Security / Redaction / AI Safety

| Rule | Status |
|---|---|
| No raw OCR text exposed in UI | ✅ — OCR/extraction data stays server-side; only mapped field values returned to client |
| No raw AI prompt/response stored | ✅ — Reads existing `dms_ai_extraction_results` only, no new AI calls |
| No direct OpenAI SDK import | ✅ |
| No AI auto-save | ✅ — Save only happens on explicit user submit |
| No AI auto-merge | ✅ — User reviews all fields |
| No auto-overwrite | ✅ |
| Passport/EID duplicate blocking | ✅ — Blocks save when another employee owns same document number |
| Document access revalidated before linking | ✅ — `adminClient` checks DMS doc before insert |
| Audit metadata excludes full document numbers | ✅ — `document_number` deliberately omitted from identity doc audit |

---

## 16. Audit Logging

All three create actions log to the audit trail:

| Action | `entity_name` | `action` code |
|---|---|---|
| Create identity doc | `employee_identity_documents` | `hr14b.create_identity_document_from_dms` |
| Create insurance | `employee_medical_insurances` | `hr14b.create_medical_insurance_from_dms` |
| Create dependent | `employee_dependents` | `hr14b.create_dependent_from_dms` |

All entries include: `employee_id`, `dms_document_id(s)`, `entity_reference` (employee code), `created_by_profile_id`.

---

## 17. Explicit Scope Not Implemented

Per the prompt scope boundary:

| Item | Reason |
|---|---|
| New DMS menu | Not created |
| New HR intake sidebar | Not created |
| Duplicate DMS upload flow | Not created |
| Training certificate from DMS | Deferred — no mapper |
| Access card from DMS | Deferred — no mapper |
| Recruitment candidate conversion | Out of scope |
| Direct AI provider calls | Out of scope |
| AI auto-save/merge/approve | Out of scope |

---

## 18. TypeScript Result

```
npx tsc --noEmit → exit code 0, 0 errors
```

---

## 19. Build Result

```
npm run build → exit code 0
Next.js 16.2.6 Turbopack production build
✓ Compiled successfully in 20.7s
✓ TypeScript passed
✓ All pages generated
```

---

## 20. Issues / Notes

- During implementation, the `CountrySelect` component uses `onValueChange` (not `onChange`) — corrected.
- The `DependentsSection` `initialForm()` was partially overwritten during the StrReplace for `dmsWizardOpen` state — immediately corrected; `dms_document_id`, `dependent_name_en`, `dependent_name_ar`, `relationship_type_id` were restored.
- The `erp_ai_feature_flags` table uses `feature_name` (not `label`) — migration corrected before applying.
- The wizard suppresses the `ERPChildDialogForm` default footer submit button by passing `onSubmit={undefined}`. Each wizard step renders its own action buttons inside the body (Back / Save), with the default Cancel still available from the dialog footer.
- The `useQuery as useLookupQuery` alias was removed (duplicate import) — clean single import.

---

## 21. Recommended Next Phase

```
HR.14B QA — Runtime Test, Security Review, and Gap Report
```

Key QA items to verify:
- Enable `ERP_AI_HR_DOCUMENT_TO_RECORD` flag and confirm buttons appear
- Select a DMS document with extraction → verify fields prefilled
- Edit fields in review step → verify saved correctly
- Test passport/EID duplicate blocking
- Test multi-document dependent merge
- Verify `dms_document_links` rows created with `link_role = hr14b_source`
- Verify audit log entries created
- Test that buttons are hidden when feature flag is disabled

---

## 22. Mandatory Scope Checklist

- [x] HR.14B only implemented
- [x] No new DMS menu created
- [x] No new HR intake/sidebar created
- [x] No duplicate DMS upload flow created
- [x] Existing Employee Profile Compliance action added
- [x] Identity document from DMS implemented
- [x] Medical insurance from DMS implemented
- [x] Dependent from DMS implemented
- [x] Training/access card deferred with reason (no mapper)
- [x] Shared wizard/reusable pattern used (`HrDocumentToRecordWizard`)
- [x] DMS documents selected from existing DMS
- [x] DMS links created with `link_role = hr14b_source`
- [x] `dms_document_id` set where supported (identity_doc, insurance; dependent uses entity link only)
- [x] Passport/EID duplicate blocking enforced
- [x] Existing value conflicts require human review (all fields shown in review step)
- [x] No auto-overwrite
- [x] No auto-save
- [x] Permissions enforced server-side
- [x] Feature flag default disabled (`is_enabled = false`)
- [x] No direct AI provider import
- [x] Audit logging implemented
- [x] SOT updated
- [x] Implementation report created
- [x] tsc run (PASS)
- [x] build run (PASS)
