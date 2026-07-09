# HR.14 Plan Update Report — Existing DMS Document-to-Record Wizard

**Report:** `implementation_Review/HR_Module/HR_14_PLAN_UPDATE_EXISTING_DMS_DOCUMENT_TO_RECORD_WIZARD_REPORT.md`  
**Date:** 2026-07-09  
**Trigger:** `ChatGPT/CURSOR_PROMPT_UPDATE_HR14_PLAN_EXISTING_DMS_DOCUMENT_TO_RECORD_WIZARD.md`  
**Updated plan:** `implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_DEEP_AUDIT_AND_AI_ENHANCEMENT_PLAN.md`  
**Status:** Ready for Sameer review — plan-only, no implementation

---

## 1. Summary of Plan Correction

The original audit plan proposed **HR.14 — AI-Assisted Pre-Hire Intake & Employee Creation from DMS** with:

- A new HR pre-hire intake route/menu
- Optional `hr_pre_hire_intake_sessions` staging table
- Five sub-phases (14A–14E) tied to DMS batch intake sessions

**Sameer rejected the separate intake-menu concept.** The plan is corrected to:

```text
HR.14 — HR Document-to-Record Wizard Using Existing DMS
```

**Exactly two phases:**

| Phase | Name |
|---|---|
| **HR.14A** | Employee Creation from Existing DMS Documents |
| **HR.14B** | Existing Employee Record Updates from Existing DMS Documents |

**Core rule:** DMS remains the only upload/intake engine. HR adds wizard actions that **select existing DMS documents** and convert them into reviewed HR records after human confirmation.

---

## 2. Files Reviewed

### Prompt & plan
- `ChatGPT/CURSOR_PROMPT_UPDATE_HR14_PLAN_EXISTING_DMS_DOCUMENT_TO_RECORD_WIZARD.md`
- `implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_DEEP_AUDIT_AND_AI_ENHANCEMENT_PLAN.md` (original)

### HR server actions
- `src/server/actions/hr/employees.ts` — `createEmployee`, required fields schema
- `src/server/actions/hr/compliance.ts` — compliance CRUD + DMS linking
- `src/server/actions/hr/compliance-dms-prefill.ts` — metadata/OCR/AI prefill for compliance records
- `src/server/actions/hr/ai/identity-document-ai-fill.ts` — identity doc prefill from DMS
- `src/server/actions/hr/ai/employee-ai-fill.ts` — AI fill for existing employees only

### HR UI (existing patterns to reuse)
- `src/features/hr/employees/employees-table.tsx` — HR.14A button placement
- `src/features/hr/employees/compliance/compliance-dms-add-dialog.tsx` — pick doc → prefill → review → save
- `src/features/hr/employees/compliance/identity-document-add-dialog.tsx` — identity variant
- `src/features/hr/employees/tabs/employee-compliance-tab.tsx` — compliance section entry points

### HR lib / mappers
- `src/lib/hr/compliance/dms-to-identity-map.ts`
- `src/lib/hr/compliance/medical-insurance-dms-map.ts`
- `src/lib/hr/compliance/dependent-dms-map.ts`
- `src/lib/hr/compliance/compliance-dms-ocr.ts`
- `src/lib/hr/ai/feature-flags.ts`

### DMS integration
- `src/server/actions/dms/entity-documents.ts` — `linkDmsDocumentToEntity`
- `src/server/actions/dms/batch-intake.ts` — existing batch (not duplicated by HR)
- `src/lib/dms/entity-matching/entity-matcher.ts` — employee match suggestions (review queue only)

### Database tables (confirmed in migrations / code)
- `dms_documents`, `dms_document_links`, `dms_ai_extraction_results`
- `employees`, `employee_status_events`, `employee_document_links`
- `employee_identity_documents`, `employee_medical_insurances`, `employee_dependents`
- `employee_access_cards`, `employee_training_certificates`, `employee_medical_records`

---

## 3. Plan Sections Updated

| Section | Change |
|---|---|
| Header | Added correction note + link to this report |
| §1 Executive Summary | Replaced pre-hire intake recommendation with document-to-record wizard (2 phases) |
| §8.2–8.4 | Removed "chicken-and-egg" as blocker; clarified orphan DMS docs selectable via wizard |
| §9 (full rewrite) | New HR.14 design: principles, architecture, workflows, 2 phases, mapping, permissions, flags, safety, risks |
| §10 E1, E13 | Renamed backlog items to match new naming |
| §11 G11 | Gap reframed as missing "Add from Documents" on Employees list |
| §12 | Condensed; points to §9.10 safety controls |
| §14 Effort | 2 phases, ~12–17 days (down from 5 sub-phases, ~16–22 days) |
| §15 Decision points | Removed intake route options; added wizard-specific decisions |
| §16 Appendix | Added proposed HR.14 file paths; noted existing dialogs to refactor |
| §17 Conclusion | Aligned with Sameer's DMS-first → HR wizard model |

**Removed from plan:**
- `hr_pre_hire_intake_sessions` table
- `/admin/hr/employees/intake/new` route
- HR Pre-Hire Intake sidebar
- HR.14C, 14D, 14E as separate sub-phases
- `hr.pre_hire_intake.*` permissions
- `ERP_AI_HR_PRE_HIRE_INTAKE`, `ERP_AI_HR_BUNDLE_EXTRACT`, `ERP_AI_HR_CREATE_FROM_DMS` flags

---

## 4. Final Recommended Two Phases

### HR.14A — Employee Creation from Existing DMS Documents

**Entry:** HR → Employees → **Add from Documents**

**Deliverables:**
- Multi-select DMS document picker (existing documents only)
- Bundle aggregator reading `dms_ai_extraction_results` + metadata
- Review wizard: profile + compliance suggestions + manual required fields + conflict resolution
- Atomic save: employee + status event + compliance children + DMS links + audit

**Not in scope:** new intake menu, new DMS upload flow, staging table

### HR.14B — Existing Employee Record Updates from Existing DMS Documents

**Entry:** Employee Profile → Compliance → **Add from Documents** (per section)

**Deliverables:**
- **Add Dependent from Documents**
- Standardize identity / medical / training / access card / medical record flows on shared wizard
- Refactor `ComplianceDmsAddDialog` + `identity-document-add-dialog.tsx` to shared components
- Single-target save + DMS link + audit

**Reuse:** maximum overlap with HR.14A picker, aggregator (single-doc mode), review UI

---

## 5. Final User Workflow

### Employee creation (HR.14A)

```text
DMS upload (existing) → HR Employees → Add from Documents →
select existing DMS docs → review extractions → complete manual fields →
Save → employee + compliance + links created
```

### Dependent (HR.14B)

```text
Employee Profile → Compliance → Dependents → Add Dependent from Documents →
select DMS docs → review → Save → dependent + links
```

### Compliance record (HR.14B)

```text
Employee Profile → Compliance → [section] → Add from Documents →
select DMS doc(s) → review → Save → compliance record + links
```

---

## 6. Menu / Action Placement Decision

| Decision | Choice |
|---|---|
| New DMS menu | **No** |
| New HR intake sidebar | **No** — rejected by Sameer |
| Duplicate DMS batch intake | **No** |
| HR → Employees → Add from Documents | **Yes** — HR.14A |
| Employee Profile → Compliance → Add from Documents | **Yes** — HR.14B |
| Employee Profile → Dependents → Add Dependent from Documents | **Yes** — HR.14B |
| Employee Profile → Documents → optional action | **Optional** — HR.14B stretch |

---

## 7. Risks and Notes

| Risk | Note |
|---|---|
| Users may not understand DMS-first step | Wizard step 1 copy: "Documents must be uploaded in DMS before using this wizard" |
| Existing `ComplianceDmsAddDialog` overlap | HR.14B should consolidate UX — avoid maintaining two picker implementations |
| Documents without extraction | Show pending state; allow manual entry or link to DMS to run AI |
| Multi-doc conflicts | Required conflict-resolution step in HR.14A before Save |
| Permission sprawl | Prefer existing `hr.employees.create`, `hr.compliance.manage`, `dms.documents.view`, `hr.ai.use` |
| Feature flag rollout | Propose `ERP_AI_HR_DOCUMENT_TO_EMPLOYEE` + `ERP_AI_HR_DOCUMENT_TO_COMPLIANCE`; all disabled by default |

**Existing code advantage:** `ComplianceDmsAddDialog` already implements pick → prefill → review → save for one compliance type on an existing employee. HR.14A generalizes this to multi-doc employee create; HR.14B standardizes all compliance entry points on the same shared wizard.

---

## 8. Readiness for Sameer Review

| Item | Status |
|---|---|
| Plan corrected per Sameer direction | ✅ |
| Two phases only | ✅ |
| No new intake menu | ✅ |
| DMS remains single intake engine | ✅ |
| User workflows documented | ✅ |
| Technical architecture documented | ✅ |
| Permissions / flags proposed | ✅ |
| Safety / audit controls documented | ✅ |
| Implementation | ❌ Not started (plan-only) |

**Recommended Sameer actions:**
1. Approve HR.14 two-phase scope
2. Confirm minimum document requirement for employee create (e.g. passport or EID)
3. Confirm whether optional Documents tab action is in HR.14B or deferred
4. Approve formal HR.14A implementation prompt when ready

---

*End of update report.*
