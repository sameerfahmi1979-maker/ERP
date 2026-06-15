# ERP DMS — AI-First Upload-to-Fill Workflow Standard

**Document:** `docs/standards/ERP_DMS_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_STANDARD.md`  
**Status:** APPROVED STANDARD (DMS.10A)  
**Applies to:** All DMS document intake flows, upload dialogs, and AI-assisted creation  
**Version:** 1.0 — 2026-06-15  

---

## 1. Core Principle

> In the ALGT ERP DMS, the primary document creation path is **Upload-First, AI-Fills, User-Reviews, then Save**. Manual data entry before upload is the fallback path, not the default.

---

## 2. The AI-First Intake Flow

Every new DMS document created from a file upload MUST follow this sequence:

```
1. User uploads file (dropzone / scan)
2. File stored in dms-temp bucket via signed URL
3. Draft document auto-created (status = "pending_ai_review")
   - title  = original filename (no extension, sanitized)
   - type   = null (AI will suggest)
   - category = null (AI will suggest)
4. File moved to dms-documents bucket; dms_document_files created
5. runDmsAiAnalysisForDocument() called automatically
6. User redirected to AI Review screen
7. AI-filled form shown with confidence badges
8. User reviews, corrects wrong or missing fields
9. User clicks "Approve & Save"
10. applyAiResultToDocument() writes all accepted values
11. status → "active" (or "pending_review" if approval workflow enabled)
12. Expiry reminders generated
13. Audit event: "document_ai_reviewed_and_approved"
```

---

## 3. Document Status Values

| Status | Meaning | Who sets it |
|---|---|---|
| `draft` | Created manually, no AI involved | User via manual form |
| `pending_ai_review` | Created from upload, awaiting AI review | System (AI-first intake) |
| `pending_review` | Awaiting human approval (separate approvals workflow) | System or user |
| `approved` | Approved via approvals workflow | Approver |
| `active` | Finalized, active document | User (approve & save) or system |
| `rejected` | Rejected | Approver |
| `expired` | Expired by expiry date | System |
| `archived` | Manually archived | User |
| `superseded` | Replaced by newer version | System |

Documents in `pending_ai_review` that are older than 7 days with no files attached may be cleaned up by a scheduled job (planned, DMS.12+).

---

## 4. AI Review Screen Requirements

The AI Review screen MUST:

1. Show AI-suggested values as **pre-filled editable controls** — not as static text in a separate tab.
2. Show a **confidence badge** next to every AI-filled field.
3. Allow the user to **edit any field** directly in the review form.
4. Have a prominent **"Approve & Save"** footer action.
5. Have a **"Re-run AI"** button if results are poor.
6. Have a **"Save Draft"** button to preserve the current state without finalizing.
7. Have a **"Discard"** option (cancels AI intake, marks document as abandoned).
8. **Never auto-save** any AI suggestion without explicit user action.
9. Required fields (title, document type, category) MUST be validated before approval is allowed.

Confidence badge display:
- `high` (≥ 0.80) — shown prominently, no warning
- `medium` (0.50–0.79) — shown with a review cue
- `low` (< 0.50) — shown with a clear warning; field highlighted for manual review
- `needs_manual_review` — AI explicitly flagged this field; must not be auto-accepted

---

## 5. Manual Creation Path (Fallback)

The manual creation path (existing `DmsCreateDocumentFromUploadDialog` or the New Document form) MUST remain available as a fallback. It should NOT be the default for file-based document creation.

Use manual path when:
- User knows the document type and wants to enter fields directly
- AI is not configured or has no active provider
- Document is a pure metadata record with no file attachment

---

## 6. Prohibited Patterns

The following MUST NEVER occur in the DMS intake flow:

```
❌ AI auto-saves document type, category, title, or metadata without user confirmation.
❌ AI changes dms_documents fields without user-triggered applyAiResultToDocument().
❌ User is forced to fill title + type before AI runs.
❌ AI results are only visible in a separate tab (not in the creation/review form).
❌ OCR text, AI prompts, or raw AI responses are logged in audit events.
❌ API keys are returned to the client.
❌ dms_document_metadata_values is populated before AI review approval.
```

---

## 7. Server Action Contracts

### `createDraftDocumentFromUpload(uploadSessionId)`

- Input: `upload_session_id`
- Creates `dms_documents` with `status = "pending_ai_review"`, minimal title
- Copies file from dms-temp → dms-documents
- Sets `dms_upload_sessions.document_id = newDocId`
- Returns: `{ documentId, documentNo }`

### `runDmsAiAnalysisForDocument(documentId)` (existing — DMS.10)

- Already handles PDF text extraction + image vision in one call
- Can be called immediately after draft creation
- Stores results in `dms_ai_extraction_jobs` + `dms_ai_extraction_results`

### `applyAiResultToDocument(documentId, aiResultId, accepted, metadataValues)`

- Input: accepted field values (after user review)
- Updates `dms_documents` with confirmed type, category, title, dates
- Inserts `dms_document_metadata_values` for accepted metadata fields
- Updates `dms_ai_extraction_results.ai_status = "accepted"`
- Sets `dms_documents.status = "active"` (or `"pending_review"`)
- Generates expiry reminders if expiry_date is set
- Writes audit event: `"document_ai_reviewed_and_approved"`

---

## 8. UX Copy Standards

| Action | Button label |
|---|---|
| Trigger AI intake from inbox | "Upload & AI Fill" |
| Approve in review screen | "Approve & Save" |
| Save without finalizing | "Save Draft" |
| Re-run AI analysis | "Re-run AI" |
| Discard AI intake | "Discard" |
| Open manual creation | "Create Manually" |

Do NOT use:
- "Run OCR" as a user-visible primary action (OCR is internal to AI pipeline)
- "Submit" or generic labels
- "AI Submit" (confusing)

---

## 9. Related Standards and Rules

| Document | Path |
|---|---|
| DMS standard | `.cursor/rules/erp-dms-standard.mdc` |
| AI-first upload rule | `.cursor/rules/erp-dms-ai-first-upload-standard.mdc` |
| AI settings standard | `.cursor/rules/erp-ai-settings-standard.mdc` |
| Workspace form standard | `docs/standards/ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md` |
| DMS.10 report | `implementation_Review/ERP_DMS_10_AI_DOCUMENT_CLASSIFICATION_AND_EXTRACTION_PROVIDER_ABSTRACTION_IMPLEMENTATION_REPORT.md` |
| DMS.10A report | `implementation_Review/ERP_DMS_10A_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_INVESTIGATION_AND_REDESIGN_REPORT.md` |
