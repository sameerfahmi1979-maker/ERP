# ERP HR.8 — Recruitment & Onboarding Implementation Report

**Phase:** ERP HR.8  
**Date:** 2026-06-19  
**Status:** CLOSED / PASS ✅  
**Implemented by:** Cursor AI Agent

---

## 1. Phase Summary

ERP HR.8 implements the full Recruitment & Onboarding workflow within the ALGT ERP. This phase covers end-to-end recruitment lifecycle management: job requisitions → candidates → interviews → offers → onboarding → candidate-to-employee conversion. All data is strictly internal; no public portal, no candidate-facing UI, no auto-email in this phase.

---

## 2. Database Migration

**File:** `supabase/migrations/20260619120000_erp_hr_8_recruitment_onboarding.sql`  
**Applied to live DB:** Yes (via `user-supabase`)

### 2.1 Numbering Rules

Two new global numbering rules inserted into `global_numbering_rules`:

| Document Type Code | Name | Format | Scope |
|---|---|---|---|
| `HR_JOB_REQUISITION` | Job Requisition | `REQ-{SEQ6}` | document_type |
| `HR_CANDIDATE` | Candidate | `CAND-{SEQ6}` | document_type |

### 2.2 New Tables (7)

All tables use `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `TIMESTAMPTZ NOT NULL DEFAULT NOW()`, soft-delete (`deleted_at`), audit columns (`created_by`, `updated_by`, `deleted_by` FK → `user_profiles`), and `set_updated_at()` triggers.

| Table | Description |
|---|---|
| `hr_job_requisitions` | Job vacancy requests — title, department, designation, budget range, priority, status, vacancy count |
| `hr_candidates` | Candidate master — full name EN/AR, gender, contact, nationality, current employment, pipeline stage, status |
| `hr_candidate_documents` | DMS-linked candidate documents — FK to `dms_documents`, verification status |
| `hr_interviews` | Interview scheduling and scoring — round type, format, scheduled_at, result, feedback |
| `hr_offers` | Job offers — salary components (basic, gross, housing, transport, other), expiry, probation, status |
| `hr_onboarding_tasks` | Pre-joining onboarding checklist — category, due date, status, completion tracking |
| `employee_recruitment_links` | Links converted employees to originating candidates/requisitions |

### 2.3 RLS Helper Functions (2, SECURITY DEFINER)

- `current_user_can_view_hr_recruitment()` — checks `hr.recruitment.view` or `hr.recruitment.manage`
- `current_user_can_manage_hr_recruitment()` — checks `hr.recruitment.manage`

### 2.4 RLS Policies

RLS ENABLED and FORCED on all 7 new tables. Policies cover SELECT, INSERT, UPDATE, DELETE:
- Main tables: `current_user_can_view_hr_recruitment()` for SELECT; `current_user_can_manage_hr_recruitment()` for INSERT/UPDATE/DELETE
- `employee_recruitment_links`: SELECT requires `hr.employees.view`; INSERT requires `hr.employees.create`

### 2.5 Indexes

32+ partial indexes (`WHERE deleted_at IS NULL`) covering all new tables, including:
- Code lookups (requisition_code, candidate_code)
- FK join indexes (candidate_id, requisition_id, employee_id)
- Status/pipeline filtering
- `gin_trgm_ops` index on `hr_candidates.full_name_en` for full-text search (requires `pg_trgm`)
- Date range indexes (scheduled_at, offer_expiry_date, due_date)

---

## 3. Server Actions

**File:** `src/server/actions/hr/recruitment.ts`

All actions follow: `getAuthContext()` → `hasPermission()` → Zod validation → `createClient()` / `createAdminClient()` → DB operation → `recruitmentAuditLog()` → `revalidatePath()`.

### 3.1 Custom Audit Wrapper

`recruitmentAuditLog()` wraps `logAudit()` with HR module context, candidate/requisition/employee metadata, and normalized action mapping.

### 3.2 Zod Schemas

| Schema | Purpose |
|---|---|
| `jobRequisitionCreateSchema` | Create requisition with salary range validation |
| `jobRequisitionUpdateSchema` | Partial update of requisition fields |
| `candidateCreateSchema` | Create candidate with full personal details |
| `candidateUpdateSchema` | Partial update of candidate fields |
| `candidateStatusChangeSchema` | Status transition with optional reason |
| `candidateDocumentLinkSchema` | Link DMS document to candidate |
| `interviewCreateSchema` | Schedule interview with round/format/interviewers |
| `interviewUpdateSchema` | Update interview details |
| `interviewCompleteSchema` | Complete interview with result and feedback |
| `offerCreateSchema` | Create offer with salary/dates validation (basic ≤ gross) |
| `offerUpdateSchema` | Partial update of offer fields |
| `offerStatusChangeSchema` | Status change with reason |
| `onboardingTaskCreateSchema` | Create onboarding task with category/due date |
| `onboardingTaskUpdateSchema` | Partial update of task |
| `candidateConversionSchema` | Convert candidate to employee with all required HR fields |

### 3.3 Server Actions (50+)

**Job Requisitions:** `listJobRequisitions`, `getJobRequisition`, `createJobRequisition`, `updateJobRequisition`, `archiveJobRequisition`, `changeRequisitionStatus`

**Candidates:** `listCandidates`, `getCandidate`, `createCandidate`, `updateCandidate`, `archiveCandidate`, `changeCandidateStatus`, `getCandidatePipelineSummary`, `getCandidateSummary`

**Candidate Documents:** `listCandidateDocuments`, `linkCandidateDmsDocument`, `verifyCandidateDocument`, `archiveCandidateDocument`

**Interviews:** `listCandidateInterviews`, `listGlobalInterviews`, `createInterview`, `updateInterview`, `archiveInterview`, `completeInterview`, `cancelInterview`

**Offers:** `listCandidateOffers`, `listGlobalOffers`, `createOffer`, `updateOffer`, `archiveOffer`, `changeOfferStatus`, `acceptOffer`, `rejectOffer`, `withdrawOffer`

**Onboarding Tasks:** `listCandidateOnboardingTasks`, `listGlobalOnboardingTasks`, `createOnboardingTask`, `updateOnboardingTask`, `archiveOnboardingTask`, `completeOnboardingTask`, `blockOnboardingTask`, `markOnboardingTaskNotApplicable`

**Conversion:** `prepareCandidateEmployeeConversion`, `convertCandidateToEmployee`, `getEmployeeRecruitmentLink`

**Summary:** `getRecruitmentSummary`

---

## 4. Query Keys & Invalidation

### `src/lib/query/query-keys.ts`

15 new entries under `queryKeys.hr.recruitment`:

```ts
queryKeys.hr.recruitment.requisitions(filters?)
queryKeys.hr.recruitment.requisition(id)
queryKeys.hr.recruitment.candidates(filters?)
queryKeys.hr.recruitment.candidate(id)
queryKeys.hr.recruitment.candidateDocuments(candidateId)
queryKeys.hr.recruitment.candidateInterviews(candidateId)
queryKeys.hr.recruitment.candidateOffers(candidateId)
queryKeys.hr.recruitment.candidateOnboarding(candidateId)
queryKeys.hr.recruitment.globalInterviews(filters?)
queryKeys.hr.recruitment.globalOffers(filters?)
queryKeys.hr.recruitment.globalOnboarding(filters?)
queryKeys.hr.recruitment.candidateSummary(candidateId)
queryKeys.hr.recruitment.pipelineSummary()
queryKeys.hr.recruitment.employeeRecruitmentLink(employeeId)
queryKeys.hr.recruitment.summary()
```

### `src/lib/query/invalidation.ts`

14 new helpers: `invalidateHrRecruitment`, `invalidateHrRequisitions`, `invalidateHrRequisition`, `invalidateHrCandidates`, `invalidateHrCandidate`, `invalidateHrCandidateDocuments`, `invalidateHrCandidateInterviews`, `invalidateHrCandidateOffers`, `invalidateHrCandidateOnboarding`, `invalidateHrGlobalInterviews`, `invalidateHrGlobalOffers`, `invalidateHrGlobalOnboarding`, `invalidateHrEmployeeRecruitmentLink`, `invalidateHrRecruitmentSummary`

---

## 5. UI Components

### 5.1 Candidate Workspace Form

**File:** `src/features/hr/recruitment/candidate-workspace-form.tsx`

Uses `ERPRecordWorkspaceForm` with 7 sections:

| Section | Tab Component |
|---|---|
| Overview | `CandidateOverviewTab` |
| Profile | `CandidateProfileTab` |
| Documents | `CandidateDocumentsTab` |
| Interviews | `CandidateInterviewsTab` |
| Offers | `CandidateOffersTab` |
| Onboarding | `CandidateOnboardingTab` |
| Conversion | `CandidateConversionTab` |

### 5.2 Tab Components (7)

| File | Description |
|---|---|
| `tabs/candidate-overview-tab.tsx` | Summary cards: interviews, offers, documents, onboarding tasks |
| `tabs/candidate-profile-tab.tsx` | Personal details, contact info, job application fields, ERPCombobox for requisition |
| `tabs/candidate-documents-tab.tsx` | DMS-linked document list, link/verify/archive actions |
| `tabs/candidate-interviews-tab.tsx` | Interview scheduling, result recording, ERPChildDialogForm |
| `tabs/candidate-offers-tab.tsx` | Offer creation, salary display, accept/reject/withdraw actions |
| `tabs/candidate-onboarding-tab.tsx` | Onboarding task checklist, completion/block/N-A actions |
| `tabs/candidate-conversion-tab.tsx` | Convert to employee workflow, link to new employee profile |

### 5.3 Global Recruitment List Pages (Client Components)

| File | Route | Description |
|---|---|---|
| `requisitions-page-client.tsx` | `/admin/hr/recruitment/requisitions` | Filterable requisitions list + add/edit |
| `candidates-page-client.tsx` | `/admin/hr/recruitment/candidates` | Pipeline list with stage/status filters |
| `interviews-page-client.tsx` | `/admin/hr/recruitment/interviews` | Global interviews view |
| `offers-page-client.tsx` | `/admin/hr/recruitment/offers` | Global offers view, salary masking |
| `global-onboarding-page-client.tsx` | `/admin/hr/recruitment/onboarding` | Global onboarding task list |

---

## 6. Routes Created

| Route | Type | Component |
|---|---|---|
| `/admin/hr/recruitment` | Server (hub) | `page.tsx` — summary cards + nav |
| `/admin/hr/recruitment/requisitions` | Server + Client | `RequisitionsPageClient` |
| `/admin/hr/recruitment/candidates` | Server + Client | `CandidatesPageClient` |
| `/admin/hr/recruitment/candidates/record/new` | Server | `CandidateWorkspaceForm` add mode |
| `/admin/hr/recruitment/candidates/record/[id]` | Server | `CandidateWorkspaceForm` edit mode |
| `/admin/hr/recruitment/interviews` | Server + Client | `InterviewsPageClient` |
| `/admin/hr/recruitment/offers` | Server + Client | `OffersPageClient` |
| `/admin/hr/recruitment/onboarding` | Server + Client | `GlobalOnboardingPageClient` |

---

## 7. Integration Points

### Employee Overview Tab

**File:** `src/features/hr/employees/tabs/employee-overview-tab.tsx`

- New `RecruitmentLinkSection` component added
- Fetches `getEmployeeRecruitmentLink` — displays originating candidate, requisition, conversion date
- Shows link to candidate profile only when `canViewRecruitment` permission is granted
- `canViewRecruitment` prop passed from `employee-workspace-form.tsx`

### App Sidebar

**File:** `src/components/layout/app-sidebar.tsx`

New "Recruitment" navigation group with 5 items:
- Job Requisitions → `/admin/hr/recruitment/requisitions`
- Candidates → `/admin/hr/recruitment/candidates`
- Interviews → `/admin/hr/recruitment/interviews`
- Offers → `/admin/hr/recruitment/offers`
- Onboarding → `/admin/hr/recruitment/onboarding`

---

## 8. Permissions Used

| Permission | Used For |
|---|---|
| `hr.recruitment.view` | SELECT access on all recruitment data |
| `hr.recruitment.manage` | INSERT/UPDATE/DELETE + new candidate page access |
| `hr.employees.view` | Viewing employee recruitment link (overview tab) |
| `hr.employees.create` | Conversion: creating new employee from candidate |

---

## 9. Non-Negotiable Rules Compliance

| Rule | Status |
|---|---|
| BIGINT PKs (`GENERATED ALWAYS AS IDENTITY`) | ✅ All 7 tables |
| RLS ENABLED + FORCED on all new tables | ✅ All 7 tables |
| `getAuthContext()` on every server action | ✅ |
| `hasPermission()` check before every DB operation | ✅ |
| Zod validation on every mutation | ✅ |
| `logAudit()` via `recruitmentAuditLog()` wrapper | ✅ |
| `revalidatePath()` after every mutation | ✅ |
| No AI integration | ✅ No AI calls |
| No public candidate portal | ✅ Internal only |
| No auto-email in this phase | ✅ No email sends |
| `ERPChildDialogForm` for all child modal forms | ✅ |
| `ERPCombobox` for all async-loaded dropdowns | ✅ |
| Soft-delete (`deleted_at`) on all tables | ✅ |

---

## 10. Bugs Fixed During Implementation

| Bug | Fix |
|---|---|
| `global_numbering_rules` INSERT missing NOT NULL columns | Added `document_type_code`, `document_type_name`, `allow_gaps`, `cancelled_number_policy`, `duplicate_prevention_scope` |
| `ERPRecordStatusVariant` had invalid `"info"` / `"destructive"` values | Mapped to `"muted"` / `"danger"` |
| `ERPRecordWorkspaceForm` prop `isSaving` doesn't exist | Changed to `isSubmitting`, added `isDirty={false}` |
| `ERPRecordSectionPanel` props `sectionId`/`activeSection` wrong | Changed to `id`/`activeId` |
| `ERPCombobox` has no `searchable` prop | Removed `searchable` prop |
| `logAudit` `entity_reference` requires `string` not `string \| undefined` | Applied `?? ""` fallback |
| `.partial()` on Zod schemas with `.refine()` throws at runtime | Replaced with explicit partial schemas |
| `export const` arrow functions in server actions file cause "must be async" error | Converted to `export async function` |

---

## 11. Files Changed

### New Files
- `supabase/migrations/20260619120000_erp_hr_8_recruitment_onboarding.sql`
- `src/server/actions/hr/recruitment.ts`
- `src/features/hr/recruitment/candidate-workspace-form.tsx`
- `src/features/hr/recruitment/tabs/candidate-overview-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-profile-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-documents-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-interviews-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-offers-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-onboarding-tab.tsx`
- `src/features/hr/recruitment/tabs/candidate-conversion-tab.tsx`
- `src/features/hr/recruitment/requisitions-page-client.tsx`
- `src/features/hr/recruitment/candidates-page-client.tsx`
- `src/features/hr/recruitment/interviews-page-client.tsx`
- `src/features/hr/recruitment/offers-page-client.tsx`
- `src/features/hr/recruitment/global-onboarding-page-client.tsx`
- `src/app/(protected)/admin/hr/recruitment/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/requisitions/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/candidates/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/candidates/record/new/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/candidates/record/[id]/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/interviews/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/offers/page.tsx`
- `src/app/(protected)/admin/hr/recruitment/onboarding/page.tsx`

### Modified Files
- `src/lib/query/query-keys.ts` — 15 new HR.8 query keys
- `src/lib/query/invalidation.ts` — 14 new HR.8 invalidation helpers
- `src/features/hr/employees/tabs/employee-overview-tab.tsx` — recruitment link section
- `src/features/hr/employees/employee-workspace-form.tsx` — pass `canViewRecruitment` prop
- `src/components/layout/app-sidebar.tsx` — Recruitment nav group

---

## 12. TypeScript & Build Status

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — 0 errors |
| `npm run build` | ✅ PASS — all pages compiled |
