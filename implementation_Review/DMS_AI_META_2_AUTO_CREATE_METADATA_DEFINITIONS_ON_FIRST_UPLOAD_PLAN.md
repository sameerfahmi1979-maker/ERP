# DMS AI META.2 � First Upload AI Metadata Suggestions with Authorized Approval

**Phase:** DMS AI META.2  
**Status:** PLANNING � REVISED  
**Date:** 2026-07-01 (original) ? Revised 2026-07-01  
**Predecessor:** DMS AI META.1 (AI-Suggested Metadata Definitions � CLOSED/PASS)  
**Author:** Cursor AI Agent  
**Approval Required:** Sameer must approve before any implementation begins
**Revision Reason:** Original plan removed � silent auto-create without human approval is not acceptable.

---

## 1. Executive Summary

DMS AI META.2 introduces a first-upload AI metadata suggestion workflow for document types
that have zero metadata field definitions. When an authorized user encounters a document type
with no definitions during upload or review, the system offers AI-generated field suggestions
that the authorized user can inspect, edit, and selectively approve before any definitions
are created.

**Governance rule � applies everywhere in this phase:**
> AI suggests. Human chooses. System saves only approved items.

This rule is non-negotiable and applies to all flows, job handlers, server actions, and UI
components in this phase. No background process may insert rows into `dms_metadata_definitions`
without an explicit authorized-user approval action.

**What META.2 adds:**
- A visible warning in the intake review screen when a document type has no definitions
- An inline "Suggest Fields with AI" button for authorized users during intake review
- A background job that generates and queues suggestion batches for admin review
- A checkbox-based review dialog (reuses/extends the META.1 dialog)
- A review queue workflow for DMS Managers to approve suggestions later
- A re-extraction trigger that fires only after definitions are created and approved

**What META.2 explicitly does NOT do:**
- Auto-insert metadata definitions without authorized human approval
- Create definitions in any background job directly
- Bypass the existing `createDmsMetadataDefinition` server action
- Grant definition-creation access to regular uploaders or document viewers

---

## 2. Why the Previous Auto-Create Plan Was Revised

The initial DMS AI META.2 plan (written 2026-07-01) proposed a pipeline step that would
automatically call an AI generation function and insert metadata definitions into
`dms_metadata_definitions` without any human review step. That design was rejected because:

1. AI-generated field definitions affect AI extraction behavior for all future documents
   of that type � incorrect definitions silently degrade extraction quality system-wide.
2. Background system processes must not write to administrative configuration tables
   without human authorization.
3. The ERP's established AI pattern is: AI proposes, human reviews, human approves.
   This was already established in META.1 and in the broader "Apply to ERP" workflows.
4. An admin enabling a feature flag should not constitute blanket authorization to create
   field definitions for any document type that encounters a first upload.

The revised plan corrects all of these issues. Suggestions are generated automatically
(the AI work runs in the background), but the creation step always requires a human click.

---

## 3. Planning Scope and Non-Implementation Rule

This document is a planning file only.

| Rule |
|---|
| No source code changes are made in this document |
| No migrations are applied |
| No schema changes are executed |
| No RLS policies are changed |
| No permission seeds are run |
| No feature flags are inserted |
| No DMS data is modified |
| No AI provider calls are made |

Implementation of any item in this plan requires explicit approval from Sameer and
a separate implementation prompt.

---

## 4. Current System Findings and Files Reviewed

### 4.1 Files Inspected

| File | Notes |
|---|---|
| `src/server/actions/dms/ai-metadata-suggestions.ts` | META.1 server action � suggestMetadataDefinitions(), checkDmsAiProviderAvailable(), canManageDmsMetadata() |
| `src/server/actions/dms/metadata-definitions.ts` | createDmsMetadataDefinition() � the only approved create path |
| `src/server/actions/dms/review-queue.ts` | Phase 12 review queue server actions |
| `src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx` | META.1 review dialog � reusable |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | Admin definitions table |
| `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` | Review queue item drawer |
| `src/lib/dms/review-queue/review-queue-upsert.ts` | upsertDmsReviewQueueItem(), DmsReviewType union |
| `src/lib/dms/orchestration/system-pipeline.ts` | Post-approve pipeline � step-based |
| `src/lib/dms/ai-jobs/job-types.ts` | DMS_AI_JOB_TYPE, payload schemas |
| `src/lib/rbac/route-access-registry.ts` | Route permission map |

### 4.2 Existing Permissions (Live DB � 2026-07-01)

Relevant DMS permissions already in the `permissions` table:

```
dms.admin                        � DMS Admin (full DMS admin)
dms.documents.manage_types       � Manage DMS Document Types
dms.documents.review_ai          � Review AI Extractions
dms.review_queue.view            � View Review Queue
dms.review_queue.manage          � Manage Review Queue Items
```

**No `dms.metadata.ai_suggestions.approve` permission exists yet.** This must be seeded in
the implementation migration.

### 4.3 Existing Review Queue Structure

The `dms_review_queue` table has:
- `review_type TEXT` � identifies the type of review
- `payload_json JSONB` � safe structured data (not document content)
- `idempotency_key TEXT` � prevents duplicate items
- `document_id BIGINT` � the document that triggered the review
- `upload_session_id BIGINT` � the upload session
- `status TEXT` � open / resolved / dismissed
- `resolved_at`, `reviewed_by`, `resolution_code`, `resolution_note`

The `DmsReviewType` union (TypeScript, in `review-queue-upsert.ts`) must be extended with a
new value: `"metadata_definition_suggestions_review"`.

### 4.4 Feature Flags (Live DB � 2026-07-01)

`DMS_AI_AUTO_CREATE_DEFINITIONS` does NOT exist yet � the old plan proposed it but it was
never seeded. The revised plan uses `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` instead.

Existing relevant flags:
```
DMS_AI_REVIEW             = true   � review queue is active
DMS_AI_JOB_QUEUE          = true   � job queue is active
DMS_AI_JOB_QUEUE_WORKER_ENABLED = true
DMS_AI_ORCHESTRATION      = true
```

### 4.5 META.1 Reusability

The META.1 `DmsAiMetadataSuggestionsDialog` component (checkbox-based review, per-row
status, editable fields, "Create Selected" button) is already implemented and working.
META.2 can reuse this dialog in the intake review screen and the review queue item drawer
without rebuilding it. Some props may need extension (trigger source, session context).

---

## 5. Revised Governance Rule: AI Suggests, Human Approves

**This rule appears in every implementation-facing section of this plan:**

```
AI suggests. Human chooses. System saves only approved items.
```

Applied:
- The AI generation step (prompt ? JSON response ? normalize ? deduplicate) runs in
  a background job or inline on button click.
- The result is stored as a **pending suggestion batch** � NOT inserted into
  `dms_metadata_definitions`.
- A human authorized user opens the review dialog, inspects each row, selects/deselects
  fields, optionally edits labels/types, and clicks "Create Selected".
- Only the clicked-through selection is passed to `createDmsMetadataDefinition`.
- `createDmsMetadataDefinition` is the only path that writes to `dms_metadata_definitions`.
  No other path may bypass it.

---

## 6. User Roles and Permission Model

### 6.1 Who May Approve AI Metadata Suggestions

The following principals are authorized to review and create AI-suggested definitions:

| Principal | Reason |
|---|---|
| `system_admin` | Full system authority |
| `group_admin` | Full group authority |
| `dms.admin` | Full DMS administration authority |
| `dms.documents.manage_types` | Existing "manage types" � creating fields is part of this |
| `dms.metadata.ai_suggestions.approve` | **New dedicated permission** (planned � see Section 7) |

### 6.2 Who Must NOT Approve by Default

| Role | Reason |
|---|---|
| Normal uploaders (dms.documents.upload only) | Upload access ? admin configuration access |
| Normal viewers (dms.documents.view only) | Read-only |
| Normal reviewers (dms.documents.review_ai only) | AI review ? schema administration |
| HR users | Unless explicitly assigned dms.metadata.ai_suggestions.approve |

### 6.3 Business Roles Expected to Receive the New Permission

| Role | Assignment |
|---|---|
| DMS Manager | dms.metadata.ai_suggestions.approve |
| Authorized DMS Admin users | dms.metadata.ai_suggestions.approve |
| System Admin | Inherits via system_admin principal |
| Group Admin | Inherits via group_admin principal |

---

## 7. New Permission Plan

### 7.1 Required New Permission

| Field | Value |
|---|---|
| `permission_code` | `dms.metadata.ai_suggestions.approve` |
| `permission_name` | Approve AI Metadata Suggestions |
| `description` | Allows the user to review AI-suggested metadata fields and create selected metadata definitions for DMS document types |
| `module_code` | DMS |
| `category` | DMS Admin ? Metadata Definitions ? AI Suggestions |

### 7.2 Optional Supporting Permission

| Field | Value |
|---|---|
| `permission_code` | `dms.metadata.ai_suggestions.view` |
| `permission_name` | View AI Metadata Suggestions |
| `description` | Allows the user to view pending AI metadata suggestions without approving or creating them |
| `module_code` | DMS |

**Recommendation for META.2:** Defer `dms.metadata.ai_suggestions.view` to a follow-up phase.
Implement only `dms.metadata.ai_suggestions.approve` in META.2. Viewing suggestions without
the ability to approve them has limited utility at this stage and adds implementation surface.

### 7.3 Permission Guard Function (planned code, not implemented)

The new guard function to be added in `ai-metadata-suggestions.ts`:

```typescript
function canApproveAiMetadataSuggestions(
  ctx: Awaited<ReturnType<typeof getAuthContext>>
): boolean {
  return (
    hasPermission(ctx, "dms.metadata.ai_suggestions.approve") ||
    hasPermission(ctx, "dms.documents.manage_types") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.profile?.role_code === "system_admin" ||
    ctx.profile?.role_code === "group_admin"
  );
}
```

This guard is used in:
- `suggestMetadataDefinitions()` � already uses `canManageDmsMetadata`, to be updated
- New `generateAndQueueMetadataSuggestions()` server action
- Intake review screen (client-side permission check for showing buttons)

### 7.4 Permission Seed SQL (planned, not executed)

```sql
-- To be included in the implementation migration
INSERT INTO public.permissions (permission_code, permission_name, description, module_code)
VALUES (
  'dms.metadata.ai_suggestions.approve',
  'Approve AI Metadata Suggestions',
  'Allows the user to review AI-suggested metadata fields and create selected metadata definitions for DMS document types.',
  'DMS'
)
ON CONFLICT (permission_code) DO NOTHING;
```

Role assignment seed (DMS Manager role � adjust role_code to actual value):
```sql
-- Assign to DMS Manager role (adjust role_code as needed)
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT r.role_code, 'dms.metadata.ai_suggestions.approve'
FROM public.roles r
WHERE r.role_code IN ('dms_manager', 'dms_admin')
ON CONFLICT DO NOTHING;
```

---

## 8. Feature Flag Plan

### 8.1 New Feature Flag

| Field | Value |
|---|---|
| `feature_code` | `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` |
| `feature_name` | DMS AI First Upload Metadata Suggestions |
| `description` | When enabled, the system can suggest metadata fields for document types with no definitions during first upload or first approval. Suggestions require authorized human approval before any metadata definitions are created. |
| `is_enabled` | `false` (default) |
| `requires_human_review` | `true` |
| `min_confidence_threshold` | `0.70` |

### 8.2 Old Flag

`DMS_AI_AUTO_CREATE_DEFINITIONS` � never seeded (was only in the old plan). It must NOT be
created. The old name is explicitly deprecated in this plan.

### 8.3 Seed SQL (planned, not executed)

```sql
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES (
  'DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS',
  'DMS AI First Upload Metadata Suggestions',
  'When enabled, the system can suggest metadata fields for document types with no definitions
   during first upload or first approval. Suggestions require authorized human approval before
   any metadata definitions are created.',
    false,
    true,
    0.70
  )
ON CONFLICT (feature_code) DO NOTHING;
```

---

## 9. First Upload / Intake Review User Flow (Flow A)

This flow fires when a user is reviewing a document in the Upload Inbox / Intake Review screen
and the classified document type has zero active metadata definitions.

### 9.1 Step-by-Step

```
Step 1 � User uploads a document.

Step 2 � AI classifies the document (or user manually selects the document type).

Step 3 � The intake review screen loads the metadata section.
         System queries: COUNT(active definitions for this document_type_id)

Step 4 � If count == 0:
         Show a visible notice in the metadata section:
         ???????????????????????????????????????????????????????????????????????
         ? ?  This document type has no metadata fields yet.                   ?
         ?    AI cannot extract structured data until fields are defined.       ?
         ?                                                                       ?
         ?  [Suggest Fields with AI]   [Skip for Now]    ? if authorized user  ?
         ?                                                                       ?
         ?    OR                                                                 ?
         ?                                                                       ?
         ?  Ask a DMS Manager or authorized admin to create metadata fields.   ?
         ?                                                                       ?  ? if non-authorized user
         ???????????????????????????????????????????????????????????????????????

Step 5a � Authorized user clicks [Suggest Fields with AI]:
  5a-1. Button shows loading spinner.
  5a-2. Client calls suggestMetadataDefinitions(documentTypeId) [existing META.1 action].
  5a-3. AI generates suggestions.
  5a-4. DmsAiMetadataSuggestionsDialog opens with the suggestions list.
  5a-5. All rows are checked by default.
  5a-6. User can uncheck, edit label/type/required/AI extractable/hint per row.
  5a-7. User clicks [Create Selected (N)].
  5a-8. Each selected field is sent to createDmsMetadataDefinition (existing META.1 path).
  5a-9. Per-row status shows: pending ? saving ? saved / failed.
  5a-10. Dialog shows summary: "N fields created successfully."
  5a-11. Metadata section in intake review reloads to show new fields.
  5a-12. Re-extraction is offered: "Fields created. Re-run AI extraction now?" [Yes] [No]
         If [Yes]: triggerReExtraction(uploadSessionId) queues re-extraction for this session.

Step 5b � User clicks [Skip for Now]:
  5b-1. Notice is dismissed for this session.
  5b-2. Document is saved with no metadata values.
  5b-3. Admin can still create definitions later via DMS Admin ? Metadata Definitions.

Step 5c � Suggestions already pending review:
  Notice changes to:
  "AI metadata suggestions are pending review for this document type."
  Button: [Open Suggestions Review]
  Opens the same dialog showing the pending suggestions.

Step 5d � Non-authorized user:
  No buttons shown.
  Message: "Ask a DMS Manager or authorized admin to create metadata fields."
  The document can still be saved without metadata.
```

### 9.2 Intake Review Screen Changes

The component that needs updating is the intake review metadata section, likely inside:
- `src/features/dms/intake/` (specific component TBD during implementation)
- The zero-definition notice is a new UI block rendered when `definitionsCount === 0`

The notice must be:
- Dismissible per session (not stored in DB � only client state)
- Rendered above the empty metadata section
- Visible even when the user is not authorized (shows the "ask admin" message)

---

## 10. Background Suggestion Queue Flow (Flow B)

This flow fires in the background after the first document of a zero-definition type is
approved and a document record is created. The job generates suggestions and stores them
as pending review data � it does NOT insert definitions.

### 10.1 Trigger

Post-approve orchestration pipeline, new step: `metadata_suggestions_check`.

Fires when:
- `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` feature flag = true
- The confirmed document type has zero active definitions
- No suggestion batch already exists for this document type (idempotency)

### 10.2 Step-by-Step

```
Step 1 � Document approved ? approveAiIntakeAndCreateDocument() creates the document record.

Step 2 � Post-approve orchestration pipeline runs (existing queued job).

Step 3 � New step: metadata_suggestions_check
  3a. Read feature flag DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS
  3b. If false ? skip (log: "Feature flag disabled")
  3c. Check definition count for documentTypeId
  3d. If count > 0 ? skip (log: "Definitions already exist")
  3e. Check if a suggestion batch already queued for this type ?
      (query dms_review_queue for open/pending metadata_definition_suggestions_review
       items with source_id matching documentTypeId)
  3f. If already queued ? skip (log: "Suggestions batch already pending")
  3g. Enqueue job: GENERATE_METADATA_DEFINITION_SUGGESTIONS
      Payload: { documentTypeId, triggerDocumentId, source: "post_approve" }
      Idempotency key: "meta_suggestions:type:{documentTypeId}"

Step 4 � Job: GENERATE_METADATA_DEFINITION_SUGGESTIONS runs (background worker)
  4a. Calls AI to generate field suggestions (same prompt logic as META.1)
  4b. Validates and normalizes suggestions (same Zod + normalizeFieldCode as META.1)
  4c. Does NOT insert into dms_metadata_definitions
  4d. Creates a review queue item: review_type = "metadata_definition_suggestions_review"
      payload_json = { suggestions: [...normalizedFields], documentTypeCode, documentTypeName,
                       triggerDocumentId, model, generatedAt }
      idempotency_key = "meta_suggestions:type:{documentTypeId}"
  4e. Logs audit: DMS_AI_METADATA_SUGGESTIONS_GENERATED

Step 5 � DMS Manager / Authorized user sees review queue item.
  5a. Opens review queue ? sees item: "AI Metadata Suggestions � [Document Type Name]"
  5b. Clicks item ? review drawer opens
  5c. Review drawer renders DmsAiMetadataSuggestionsDialog with suggestions from payload_json
  5d. User selects/deselects fields, edits as needed
  5e. Clicks [Create Selected (N)]
  5f. Each selected field ? createDmsMetadataDefinition
  5g. Dialog shows per-row status
  5h. On completion: review queue item resolved (resolution_code: "approved")
  5i. Log audit: DMS_AI_METADATA_SUGGESTIONS_APPROVED
  5j. Re-extraction job enqueued for the trigger document

Step 6 � If user rejects all / dismisses:
  6a. Review queue item dismissed (resolution_code: "rejected")
  6b. Log audit: DMS_AI_METADATA_SUGGESTIONS_REJECTED
  6c. No definitions created
  6d. No re-extraction
```

### 10.3 Key Rule

```
The GENERATE_METADATA_DEFINITION_SUGGESTIONS job stores suggestions in the review queue.
It does NOT write to dms_metadata_definitions.
Only the authorized human approval step (clicking Create Selected) writes to dms_metadata_definitions.
```

---

## 11. Pending Suggestions Storage Options

### Option A � Use Existing Review Queue (payload_json)

Store the full suggestion list in `dms_review_queue.payload_json` for the review item.

**Feasibility assessment (based on live DB inspection):**
- `payload_json` column is `JSONB` � supports arbitrary structure
- `upsertDmsReviewQueueItem()` accepts `payloadJson: Record<string, unknown>` � flexible
- The existing `sanitizePayload()` guard strips suspicious keys but allows normal data arrays
- `idempotency_key` on the review item prevents duplicate suggestion batches
- Suggestion list for a typical document type is 5�25 fields, ~200�800 bytes of JSON � well within JSONB limits
- Review drawer can read `payload_json` and pass to the dialog component
- **Verdict: Option A is safe and viable for META.2**

**Suggested payload_json structure:**
```json
{
  "document_type_id": 42,
  "document_type_code": "EJARI",
  "document_type_name": "EJARI Contract",
  "trigger_document_id": 1234,
  "model": "gpt-4o",
  "generated_at": "2026-07-01T08:00:00Z",
  "suggestion_count": 12,
  "suggestions": [
    {
      "field_code": "contract_number",
      "field_label_en": "Contract Number",
      "field_type": "text",
      "is_required": true,
      "is_ai_extractable": true,
      "ai_field_hint": "EJARI registration number (e.g. EJARI-2024-XXXXX)",
      "ai_reasoning": "Always printed on EJARI certificates as the primary identifier"
    }
    /* ... more suggestions ... */
  ]
}
```

**Constraints:**
- Field codes, labels, hints � safe string data; no document content
- `ai_reasoning` is display-only metadata � safe
- No OCR text, no AI raw responses, no document content in payload

### Option B � Dedicated Suggestion Tables

Create:
- `dms_ai_metadata_suggestion_batches` (one per document type generation run)
- `dms_ai_metadata_suggestion_items` (one row per suggested field)

**Verdict: Defer Option B to a future phase.**

Option B provides better auditability and retry workflows but requires a DB migration and
additional server actions. For META.2, Option A's review queue approach is sufficient.
If the review queue becomes a bottleneck or suggestion batches grow complex, Option B can
be implemented as DMS AI META.2B.

---

## 12. Recommended Storage Design

**META.2 uses Option A: Review Queue payload_json.**

- Suggestions stored in `dms_review_queue.payload_json`
- One review queue item per document type (idempotency key ensures uniqueness)
- Item status tracks the lifecycle: `open` ? `resolved` (approved) or `dismissed` (rejected)
- `reviewed_by` and `resolved_at` track who approved and when
- `resolution_code`: `"approved"` | `"rejected"` | `"partial_approved"`
- `resolution_note`: optional admin note

The review queue item for suggestions uses:
```
review_type = "metadata_definition_suggestions_review"
source_type = "document_type"
source_id   = "{documentTypeId}"
```

---

## 13. Checkbox-Based Suggestion Review UX

The review dialog (reusing/extending `DmsAiMetadataSuggestionsDialog` from META.1) shows:

### 13.1 Per-Row Fields

| Column | Behavior |
|---|---|
| Include checkbox | Checked by default; user unchecks to exclude |
| Field Code | Read-only (AI-generated, normalized) |
| Field Label | Editable text input |
| Field Type | Dropdown (text, number, date, boolean � no select/multi_select) |
| Required | Toggle switch |
| AI Extractable | Toggle switch (default: true) |
| AI Hint | Editable text � passed to createDmsMetadataDefinition |
| Reasoning | Display only � explains AI's rationale; NOT saved to DB |
| Status | pending ? saving ? ? saved / ? failed |
| Error | Inline error message if creation fails |

### 13.2 Default State

- All rows checked by default
- Authorized user unchecks any rows they do not want
- Only checked rows are submitted on [Create Selected (N)]

### 13.3 Create Selected Button

```
[Create Selected (12)]
```

Label updates to reflect checked count dynamically.

### 13.4 Partial Failure Behavior

If 12 selected and 2 fail:
- 10 rows show ? saved
- 2 rows show ? failed with error message
- Dialog remains open
- User can deselect failed rows, fix the label/type, and retry
- "Create Selected" button re-enables for rows still in pending/failed state

### 13.5 Success State

When all selected rows are saved:
- Dialog shows: "N fields created successfully for [Document Type Name]."
- If triggered from Flow A (intake review): offer re-extraction
- If triggered from Flow B (review queue item): mark item resolved

---

## 14. DMS Admin Review Workflow

### 14.1 Review Queue

The primary admin channel for Flow B suggestions is the DMS Review Queue at `/dms/review-queue`.

Review queue item display:
- **Icon:** Sparkles (AI)
- **Title:** "AI Metadata Suggestions � [Document Type Name]"
- **Badge:** Normal priority
- **Reason:** "This document type had no metadata definitions on first upload. AI has suggested fields for review."
- **Status:** Open / Resolved

### 14.2 Opening the Review Item

When an authorized user clicks the review item:
- The review drawer opens (extending `dms-review-queue-item-drawer.tsx`)
- The drawer reads `payload_json.suggestions` and renders `DmsAiMetadataSuggestionsDialog`
  in embedded mode (not a modal � fits within the drawer)
- User selects/edits/creates fields
- On completion: item is resolved via `resolveDmsReviewQueueItem()`

### 14.3 Metadata Definitions Admin Page

In `/admin/dms/metadata-definitions`, the document type selector should show:
- A badge on document types that have a pending `metadata_definition_suggestions_review` item:
  "AI Suggestions Pending Review"
- Clicking the badge opens the suggestion review dialog

### 14.4 How DMS Manager Reviews Later

If the uploader was non-authorized and used "Skip for Now" in Flow A, and if Flow B generated
a background suggestion batch, the DMS Manager will:
1. See the review queue item in `/dms/review-queue`
2. Open it, review suggestions, approve selected fields
3. Re-extraction will then be offered for the trigger document

If neither Flow A nor Flow B ran (feature flag was off or AI provider unavailable), the
DMS Manager can still use the META.1 "Suggest Fields with AI" button in
`/admin/dms/metadata-definitions` to generate and approve suggestions manually.
META.1 remains the fallback and the fully-manual path.

---

## 15. Metadata Definitions Creation Flow

Only one creation path exists. It is unchanged from META.1:

```
createDmsMetadataDefinition(input) ? src/server/actions/dms/metadata-definitions.ts
```

The new `created_from_ai_suggestion` column (see Section 18) is passed as `true` when the
definition was created through the AI suggestion review dialog.

No new server action creates definitions directly. The suggestion review dialog (already
built in META.1) calls `createDmsMetadataDefinition` in a loop for each accepted row.

---

## 16. Re-Extraction After Approval

Re-extraction for the trigger document runs only after authorized definitions are created.

### 16.1 When Re-Extraction Is Offered

**Flow A (inline during intake review):**
After "Create Selected" completes with at least one definition created:
- Show inline prompt: "Fields created. Re-run AI extraction for this document?"
- [Yes, Re-run Now] � triggers extraction on the current upload session
- [No, Continue] � user proceeds without re-extraction

**Flow B (after review queue approval):**
After `createDmsMetadataDefinition` calls complete:
- Automatically enqueue `AI_RE_EXTRACTION` job for the trigger document
- User sees a toast: "Definitions created. AI will re-extract metadata for the triggering document."

### 16.2 Re-Extraction Job

Job type: `AI_RE_EXTRACTION` (new, but simpler than originally planned)

Payload:
```typescript
{
  documentId: number;
  source: "metadata_suggestions_approved" | "admin_manual_retry";
}
```

What the job does:
1. Loads the document's stored OCR text from `dms_document_content`
2. Loads the newly created definitions via `loadMetadataFieldsForDocumentType()`
3. Calls AI extraction-only (no reclassification)
4. Upserts results into `dms_document_metadata_values`
5. Does NOT overwrite values where `review_status = 'approved'` (human-reviewed values preserved)

### 16.3 Re-Extraction Safety Rules

```
1. Only runs after definitions exist
2. Does not run as part of suggestion generation � only after approval
3. Does not overwrite human-approved metadata values
4. Non-fatal: failure does not affect the document record
5. Runs at low priority (5) � never preempts normal intake jobs
6. Idempotency key: "re_extraction:doc:{documentId}:after_meta_approval"
```

---

## 17. Job Queue Plan

### 17.1 New Job Type: GENERATE_METADATA_DEFINITION_SUGGESTIONS

| Field | Value |
|---|---|
| Constant | `DMS_AI_JOB_TYPE.GENERATE_METADATA_DEFINITION_SUGGESTIONS` |
| String value | `"generate_metadata_definition_suggestions"` |
| Purpose | Generate AI field suggestions, store in review queue � never insert definitions |
| Max attempts | 2 |
| Priority | 4 |

Payload schema (planned TypeScript):
```typescript
export const GenerateMetadataDefinitionSuggestionsPayloadSchema = z.object({
  documentTypeId:    z.number().int().positive(),
  triggerDocumentId: z.number().int().positive(),
  source:            z.enum(["post_approve", "admin_manual"]),
});
```

**Critical rule:** The job handler for this type must NEVER write to `dms_metadata_definitions`.
It may only write to `dms_review_queue`.

### 17.2 New Job Type: AI_RE_EXTRACTION

| Field | Value |
|---|---|
| Constant | `DMS_AI_JOB_TYPE.AI_RE_EXTRACTION` |
| String value | `"ai_re_extraction"` |
| Purpose | Re-run AI metadata extraction on a document using newly created definitions |
| Max attempts | 3 |
| Priority | 5 |

Fires only after definitions are confirmed created. Never fires after suggestion generation alone.

### 17.3 Removed Job Type

`AUTO_CREATE_METADATA_DEFINITIONS` � from the old plan � must NOT be created.
It is explicitly rejected.

### 17.4 Handler Files (planned paths)

```
src/lib/dms/ai-jobs/handlers/generate-metadata-definition-suggestions.handler.ts
src/lib/dms/ai-jobs/handlers/ai-re-extraction.handler.ts
```

---

## 18. Database / Migration Plan

### 18.1 New Column: dms_metadata_definitions.created_from_ai_suggestion

Purpose: Mark definitions that were originally created through an AI suggestion review
workflow (META.1 or META.2). Admin can filter these for audit purposes.

```sql
ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS created_from_ai_suggestion BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dms_metadata_definitions.created_from_ai_suggestion IS
  'True when this definition was created by an authorized user approving an AI-suggested field.
   These definitions are AI-assisted but human-approved. Never set by background jobs directly.';
```

Note: The old plan used `is_ai_auto_created`. This plan uses `created_from_ai_suggestion` because:
- The definition was NOT auto-created; it was created by a human approving an AI suggestion
- The term "AI-Assisted" is more accurate than "Auto-Created"

### 18.2 New Column: dms_metadata_definitions.ai_suggestion_trigger_document_id

Purpose: Track which document triggered the AI suggestion workflow that led to this definition.

```sql
ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS ai_suggestion_trigger_document_id BIGINT
    REFERENCES public.dms_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dms_metadata_definitions.ai_suggestion_trigger_document_id IS
  'The document ID that triggered the AI suggestion workflow which led to this definition being
   created. NULL for manually created definitions or definitions created without a trigger document.';
```

### 18.3 New Columns: dms_document_types � Suggestion Tracking

These track the lifecycle of the suggestion workflow for each document type. They enable
idempotency in the pipeline step and provide status for the admin UI badge.

```sql
ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_generated_at TIMESTAMPTZ NULL;

ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_approved_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.dms_document_types.ai_suggestions_generated_at IS
  'Timestamp when AI metadata suggestions were last generated for this document type.
   Used as an idempotency indicator for the background suggestion queue.
   NULL means no suggestions have been generated.';

COMMENT ON COLUMN public.dms_document_types.ai_suggestions_approved_at IS
  'Timestamp when an authorized user last approved AI-suggested definitions for this type.
   NULL means no suggestions have been approved via the AI suggestion workflow.
   Manual definition creation does not update this column.';
```

### 18.4 No `definitions_auto_created_at` Column

The old plan proposed `definitions_auto_created_at`. This plan removes it. The column names
`ai_suggestions_generated_at` and `ai_suggestions_approved_at` replace it with better semantics.

### 18.5 DmsReviewType Union Extension (TypeScript � not SQL)

Add to `DmsReviewType` in `src/lib/dms/review-queue/review-queue-upsert.ts`:
```typescript
| "metadata_definition_suggestions_review"
```

### 18.6 Indexes (planned)

```sql
CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_suggestion
  ON public.dms_metadata_definitions(created_from_ai_suggestion)
  WHERE created_from_ai_suggestion = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_trigger_doc
  ON public.dms_metadata_definitions(ai_suggestion_trigger_document_id)
  WHERE ai_suggestion_trigger_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_document_types_ai_suggestions_gen
  ON public.dms_document_types(ai_suggestions_generated_at)
  WHERE ai_suggestions_generated_at IS NOT NULL AND deleted_at IS NULL;
```

### 18.7 Full Migration File (planned, not executed)

```sql
-- Migration: 20260702000000_dms_ai_meta2_first_upload_suggestions.sql

BEGIN;

-- 1. dms_metadata_definitions: AI-assisted tracking
ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS created_from_ai_suggestion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS ai_suggestion_trigger_document_id BIGINT
    REFERENCES public.dms_documents(id) ON DELETE SET NULL;

-- 2. dms_document_types: suggestion lifecycle tracking
ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_generated_at TIMESTAMPTZ NULL;

ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS ai_suggestions_approved_at TIMESTAMPTZ NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_suggestion
  ON public.dms_metadata_definitions(created_from_ai_suggestion)
  WHERE created_from_ai_suggestion = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_metadata_definitions_ai_trigger_doc
  ON public.dms_metadata_definitions(ai_suggestion_trigger_document_id)
  WHERE ai_suggestion_trigger_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_document_types_ai_suggestions_gen
  ON public.dms_document_types(ai_suggestions_generated_at)
  WHERE ai_suggestions_generated_at IS NOT NULL AND deleted_at IS NULL;

-- 4. Feature flag
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES (
  'DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS',
  'DMS AI First Upload Metadata Suggestions',
  'When enabled, the system suggests metadata fields for document types with no definitions
   during first upload or approval. Suggestions require authorized human approval.',
  false,
  true,
  0.70
)
ON CONFLICT (feature_code) DO NOTHING;

-- 5. New permission
INSERT INTO public.permissions (permission_code, permission_name, description, module_code)
VALUES (
  'dms.metadata.ai_suggestions.approve',
  'Approve AI Metadata Suggestions',
  'Allows the user to review AI-suggested metadata fields and create selected metadata definitions for DMS document types.',
  'DMS'
)
ON CONFLICT (permission_code) DO NOTHING;

-- 6. Assign to DMS Manager role (adjust role_code to actual value)
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT r.role_code, 'dms.metadata.ai_suggestions.approve'
FROM public.roles r
WHERE r.role_code IN ('dms_manager', 'dms_admin')
ON CONFLICT DO NOTHING;

COMMIT;
```

---

## 19. Audit Logging Plan

All audit events are suggestion/approval oriented. The term "auto-created" must not appear
in any audit event name or payload.

### 19.1 Audit Events

| Event | When | Who Logs |
|---|---|---|
| `DMS_AI_METADATA_SUGGESTIONS_GENERATED` | Job completes generating suggestions | Job handler |
| `DMS_AI_METADATA_SUGGESTIONS_REVIEWED` | User opens the review dialog | Client action (optional � low priority) |
| `DMS_AI_METADATA_SUGGESTIONS_APPROVED` | User clicks Create Selected and at least 1 field is created | Server action |
| `DMS_AI_METADATA_SUGGESTIONS_SKIPPED` | User clicks Skip for Now | Client or server (best-effort) |
| `DMS_AI_METADATA_SUGGESTIONS_REJECTED` | User dismisses/rejects all suggestions | Server action |
| `DMS_AI_METADATA_REEXTRACTION_ENQUEUED` | Re-extraction job is enqueued after approval | Server action |
| `DMS_METADATA_FIELD_CREATED` | Each definition row created | Existing � unchanged from META.1 |

### 19.2 Safe Audit Payload Structure

For `DMS_AI_METADATA_SUGGESTIONS_APPROVED`:
```json
{
  "document_type_id": 42,
  "document_type_code": "EJARI",
  "trigger_document_id": 1234,
  "suggestion_count": 12,
  "selected_count": 10,
  "rejected_count": 2,
  "created_count": 10,
  "approved_by_profile_id": 5,
  "model": "gpt-4o",
  "source": "intake_review" | "review_queue"
}
```

### 19.3 Must NOT Log

```
prompt text
raw AI response JSON
document content / OCR text
file bytes or paths
sensitive metadata values
API keys or secret refs
```

---

## 20. UI/UX Plan

### 20.1 Upload Inbox / Intake Review � Zero-Definition Notice

Location: Metadata tab / section inside the intake review screen  
Trigger: `definitionsCount === 0` for the confirmed document type

```
?? No Metadata Fields ???????????????????????????????????????????????????
?  ?  This document type has no metadata fields defined yet.            ?
?     AI cannot extract structured data until fields are created.        ?
?                                                                         ?
?  [ ? Suggest Fields with AI ]    [ Skip for Now ]                     ?
?                                                                         ?
?  (Only shown to authorized users)                                       ?
???????????????????????????????????????????????????????????????????????????
```

For non-authorized users:
```
?? No Metadata Fields ???????????????????????????????????????????????????
?  ?  This document type has no metadata fields defined yet.            ?
?     Ask a DMS Manager or authorized admin to create metadata fields.  ?
???????????????????????????????????????????????????????????????????????????
```

When suggestions are pending review:
```
?? AI Suggestions Pending ???????????????????????????????????????????????
?  ?  AI metadata suggestions are ready for review.                     ?
?     [ Open Suggestions Review ]                                        ?
???????????????????????????????????????????????????????????????????????????
```

### 20.2 DMS Admin ? Metadata Definitions Table

- Column or badge on document types with `ai_suggestions_generated_at IS NOT NULL`
  and no definitions yet: **"AI Suggestions Pending Review"** � links to review queue item
- `created_from_ai_suggestion = true` rows show an **"AI-Assisted"** badge next to the label
- New filter option: "Source: All | Manual | AI-Assisted"

### 20.3 Review Queue Item Display

New item type `metadata_definition_suggestions_review`:
- Icon: Sparkles
- Title: "AI Metadata Suggestions � {document_type_name}"
- Description: "AI has suggested {N} metadata fields for this document type. Review and approve the fields you need."
- Badge: Normal priority (or High if many types pending)

### 20.4 Settings UI � Feature Flag Toggle

Location: `/admin/settings/ai` or `/admin/settings` AI section

```
DMS AI First Upload Metadata Suggestions
When enabled, the system suggests metadata fields for document types that have no
definitions when the first document is uploaded. Suggestions always require authorized
approval � no definitions are created automatically.
[Toggle: OFF]
```

Warning dialog when enabling:
```
Enabling this will allow background AI jobs to generate metadata field suggestions
for document types without definitions. Suggestions will appear in the DMS Review Queue.
No definitions are created until an authorized user reviews and approves them.
```

---

## 21. Security and Safety Plan

**Governance rule (repeated for emphasis):**
> AI suggests. Human chooses. System saves only approved items.

| Rule | Enforcement |
|---|---|
| Feature flag off by default | `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS = false` |
| No background job inserts definitions | `GENERATE_METADATA_DEFINITION_SUGGESTIONS` handler must NEVER call `createDmsMetadataDefinition` or write to `dms_metadata_definitions` |
| Suggestions require `dms.metadata.ai_suggestions.approve` or equivalent | `canApproveAiMetadataSuggestions()` guard in all approval paths |
| Checkbox accept/reject per field | All suggestions start checked; user must actively include/exclude |
| Only selected fields are created | Loop in review dialog only submits checked rows |
| `createDmsMetadataDefinition` is the only write path | Server action includes its own auth checks |
| AI output validated with Zod before storing | Same schema as META.1 |
| Reserved field codes blocked | Same `RESERVED_FIELD_CODES` set as META.1 |
| select/multi_select excluded from AI types | Same `AI_ALLOWED_FIELD_TYPES` as META.1 |
| Re-extraction only after approval | `AI_RE_EXTRACTION` only enqueued from approval completion handler |
| Re-extraction does not overwrite human-approved values | Upsert skips `review_status = 'approved'` rows |
| Review queue payload contains only safe data | `sanitizePayload()` in `upsertDmsReviewQueueItem()` |
| Audit every suggestion generation and approval | See Section 19 |
| `ai_suggestions_generated_at` idempotency | Prevents duplicate generation for same type |
| System document types skipped | Check `is_system = true` in pipeline step |
| API keys never reach client | All AI calls server-side only |
| No fake user IDs in audit | Job handler uses `created_by = null` (system) |

---

## 22. Testing Plan

### Unit Tests

| Test | What |
|---|---|
| `canApproveAiMetadataSuggestions()` | Returns true for system_admin, group_admin, dms.admin, manage_types, new permission; false for others |
| Idempotency check | If `ai_suggestions_generated_at IS NOT NULL` ? pipeline step returns "skipped" |
| Count > 0 guard | If definitions exist ? step skips |
| Existing review queue item | If open suggestion item exists for type ? step skips |
| Flag = false | Step returns "skipped" immediately |
| is_system = true | Step returns "skipped" |
| Job handler: no definition insert | Assert `createDmsMetadataDefinition` is never called from handler |
| AI returns empty array | Job creates empty suggestion payload, review item created with 0 suggestions |
| AI provider not configured | Job fails gracefully, resets `ai_suggestions_generated_at` to null |
| Partial create failure | 10 succeed, 2 fail; dialog stays open; 10 rows show saved, 2 show failed |
| Re-extraction: human-approved values preserved | Values with `review_status = 'approved'` not overwritten |
| `normalizeFieldCode` shared lib | Same results as META.1 (shared utility) |

### Integration Tests

| Test | What |
|---|---|
| Full Flow A: intake review ? Suggest ? approve 8 of 12 ? 8 definitions created | End-to-end |
| Full Flow B: approve document ? suggestion job queued ? job runs ? review queue item created ? DMS Manager approves ? definitions created ? re-extraction enqueued | End-to-end |
| Skip flow: Skip for Now ? no suggestions queued, document saved without metadata | User choice respected |
| Second approval of same type: no re-trigger (idempotency) | Lock in place |
| Admin creates definition manually before Flow B fires ? Flow B skips | Count guard |
| Feature flag toggled off mid-flow: job cancels gracefully | Flag checked in job handler too |

---

## 23. Browser UAT Plan

| # | Scenario | Expected |
|---|---|---|
| 1 | Flag OFF: upload document of type with 0 defs, approve ? no suggestion job | No review queue item |
| 2 | Enable flag ? upload CV document ? approve ? check review queue within 60s | Review queue item appears |
| 3 | Non-authorized user in intake review: zero-def notice shows "Ask DMS Manager" | No AI buttons visible |
| 4 | Authorized user in intake review: zero-def notice shows [Suggest Fields with AI] | Button visible |
| 5 | Click [Suggest Fields with AI] ? dialog opens with checkboxes | All checked by default |
| 6 | Uncheck 3 rows ? click Create Selected ? only 9 created | Definitions count = 9 |
| 7 | DMS Manager opens review queue item ? dialog loads from payload_json | Suggestions visible |
| 8 | Accept 5 of 12 suggestions in review queue ? 5 definitions created | Review item resolved |
| 9 | Definitions table shows "AI-Assisted" badge for created fields | Badge visible |
| 10 | Filter by "AI-Assisted" in definitions table | Only AI-assisted defs shown |
| 11 | Re-extraction prompt appears after approval ? click Yes ? metadata populated on trigger doc | Document has metadata values |
| 12 | Second upload of same type after definitions created ? no suggestion flow | Normal extraction runs |
| 13 | Admin dismisses suggestion review item ? no definitions created | Item dismissed |
| 14 | AI provider unconfigured ? job fails gracefully, no lock left | ai_suggestions_generated_at reset |
| 15 | is_system document type ? no suggestion job enqueued | Step skips |
| 16 | "Suggest Fields with AI" in /admin/dms/metadata-definitions still works (META.1 unchanged) | META.1 unaffected |

---

## 24. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Admin approves wrong AI field types ? bad extraction for all documents | Medium | High | `created_from_ai_suggestion` badge makes origin visible; admin can delete; re-extraction is not destructive |
| Feature flag enabled but AI provider not configured | Low | Low | Job fails gracefully; resets lock; admin sees failed job in observability |
| `ai_suggestions_generated_at` lock prevents re-trigger after admin deletes all definitions | Medium | Medium | Admin can reset via SQL or future UI toggle; plan this in META.2B |
| Review queue item lost before admin reviews | Low | Low | Review queue has persistent storage; item stays until resolved or dismissed |
| Non-authorized user expects AI button to appear | Medium | Low | Clear "Ask a DMS Manager" message explains access model |
| Re-extraction fails silently | Low | Low | Non-fatal by design; document exists with metadata values from intake |
| Bulk first-uploads trigger many suggestion jobs simultaneously | Medium | Medium | Job queue handles gracefully; idempotency key prevents duplicate jobs per type |
| DMS Manager dismisses suggestion batch and forgets ? type remains definition-less | Medium | Medium | META.1 manual "Suggest" button always available as fallback |

---

## 25. Items Explicitly Out of Scope

| Item | Reason |
|---|---|
| Silent auto-insertion of definitions without approval | **Explicitly rejected** � see Section 2 |
| select/multi_select field types in AI suggestions | Requires options_json; too risky to auto-generate |
| Arabic labels in auto-generated fields | AI output only produces English labels; add Arabic manually |
| Retroactive suggestion generation for existing zero-definition types | Separate admin-initiated backfill |
| `dms.metadata.ai_suggestions.view` permission | Deferred to future phase |
| Option B dedicated suggestion tables | Deferred to META.2B if needed |
| Admin "rollback all AI-assisted definitions for a type" button | Future enhancement |
| Fully automatic definition creation (no human step) | Permanently deferred until Sameer approves after sufficient UAT evidence |

---

## 26. Revised Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-01 | Plan renames phase to "First Upload AI Metadata Suggestions with Authorized Approval" |
| AC-02 | No silent auto-create behavior remains in the plan |
| AC-03 | New permission `dms.metadata.ai_suggestions.approve` is planned with seed SQL |
| AC-04 | DMS Manager / authorized DMS Admin approval flow is planned (Flow A + Flow B) |
| AC-05 | Zero-definition warning in intake review is planned |
| AC-06 | [Suggest Fields with AI] / [Skip for Now] buttons planned for authorized users |
| AC-07 | AI suggestions use checkbox accept/reject per field |
| AC-08 | Only selected fields are created (unchecked fields are ignored) |
| AC-09 | Existing `createDmsMetadataDefinition` remains the only definition creation path |
| AC-10 | Suggestions stored in review queue `payload_json` (Option A) for pending review |
| AC-11 | Review queue workflow planned: item created, DMS Manager opens, approves, item resolved |
| AC-12 | Re-extraction happens only after accepted definitions are created |
| AC-13 | Feature flag renamed to `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` and defaults false |
| AC-14 | Job type renamed to `GENERATE_METADATA_DEFINITION_SUGGESTIONS` |
| AC-15 | Audit events are suggestion/approval oriented (no "auto-created" terminology) |
| AC-16 | No background job inserts metadata definitions without approval |
| AC-17 | DB plan uses `created_from_ai_suggestion` (not `is_ai_auto_created`), `ai_suggestions_generated_at`, `ai_suggestions_approved_at` |
| AC-18 | No implementation done in this planning update |

---

## 27. Implementation Phases

Implement in this order to reduce risk and deliver incrementally:

| Phase | Work | Deliverable |
|---|---|---|
| META.2A | Migration + new permission seed + feature flag seed | DB ready |
| META.2B | Shared `ai-definition-builder.ts` (extract from META.1 ai-metadata-suggestions.ts) | Refactor � no behavior change |
| META.2C | `generateAndQueueMetadataSuggestions()` server action | Background generation, review queue item |
| META.2D | Job handler: `GENERATE_METADATA_DEFINITION_SUGGESTIONS` | Background flow works |
| META.2E | Pipeline step: `metadata_suggestions_check` in `system-pipeline.ts` | Flow B auto-trigger |
| META.2F | Intake review UI: zero-definition notice + inline suggest button (Flow A) | Flow A |
| META.2G | Review queue item drawer: render suggestion dialog from `payload_json` | Review queue UI |
| META.2H | `AI_RE_EXTRACTION` job + handler | Re-extraction after approval |
| META.2I | Admin UI: "AI-Assisted" badge + filter in metadata definitions table | Admin visibility |
| META.2J | Feature flag toggle in AI Settings + documentation | Final admin controls |

---

## 28. Source-of-Truth Update Plan

After full implementation and UAT:

1. Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:
   - Phase: DMS AI META.2 � First Upload AI Metadata Suggestions with Authorized Approval
   - Status: CLOSED / PASS
   - Migration: `20260702000000_dms_ai_meta2_first_upload_suggestions.sql`
   - New columns: `dms_metadata_definitions.created_from_ai_suggestion`, `ai_suggestion_trigger_document_id`
   - New columns: `dms_document_types.ai_suggestions_generated_at`, `ai_suggestions_approved_at`
   - New flag: `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS` (default false)
   - New permission: `dms.metadata.ai_suggestions.approve`
   - New job types: `GENERATE_METADATA_DEFINITION_SUGGESTIONS`, `AI_RE_EXTRACTION`
   - New review type: `metadata_definition_suggestions_review`

2. Create implementation report:
   `implementation_Review/DMS_AI_META_2_FIRST_UPLOAD_SUGGESTIONS_IMPLEMENTATION_REPORT.md`

---

## 29. Final Recommendation

**META.2 should proceed as an approval-based suggestion workflow only.**

The previous plan's silent auto-create behavior is explicitly rejected. The correct and safe
design is:

```
AI suggests. Human chooses. System saves only approved items.
```

**Recommended first activation scope after full implementation:**
- Enable `DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS = true`
- First target document types: EJARI, CONTRACT, CV � where AI has strong domain knowledge
  and the cost of a wrong definition is low

**Do NOT activate for:**
- Financial instruments (Bank Guarantee, LC)
- Legal documents (Power of Attorney, SPA)
...until at least 3 rounds of UAT evidence confirm suggestion quality

**On fully automatic creation (no human step):**
This must be permanently deferred. It may be reconsidered only after:
1. Sameer gives explicit written approval
2. At least 3 months of UAT evidence shows AI suggestion accuracy ? 90%
3. A dedicated rollback and correction workflow exists for bulk-created definitions

---

*Plan created: 2026-07-01*  
*Plan revised: 2026-07-01 (approval-workflow rewrite)*  
*Status: AWAITING SAMEER REVIEW AND APPROVAL BEFORE IMPLEMENTATION*  
*Predecessor plan: `implementation_Review/DMS_AI_META_1_AI_SUGGESTED_METADATA_DEFINITIONS_PLAN.md`*
