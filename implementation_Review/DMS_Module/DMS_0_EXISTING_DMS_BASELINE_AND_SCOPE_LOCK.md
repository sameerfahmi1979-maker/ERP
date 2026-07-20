# DMS.0 — Existing DMS Baseline & Scope Lock

**Prepared:** 2026-07-20
**Auditor:** Senior ERP QA / Supabase RLS / Next.js specialist
**Repository:** `C:\dev\agt-erp` — branch `main`
**Strict Rule:** Audit and planning only. No code, SQL, migrations, or RLS changes created or modified.

---

## 1. Executive Summary

The DMS module in this repository is **fully implemented and production-active** under an independent
migration track (`erp_dms_2` → `erp_dms_ai_phase17`, currently at 50+ DMS migrations). The module
covers document ingestion, OCR, AI extraction, expiry, renewals, notifications, AI observability,
semantic search, entity linking, and admin tooling.

The old `028` planning track is **permanently abandoned** for this repository — it targeted a
different project structure (`apps/web/`) that does not exist here. The existing DMS implementation
is the source of truth.

**Three enhancements remain unimplemented and form the basis of DMS.1–DMS.3:**
1. **Notification Bell** (top-bar, live unread count, Realtime-driven) — server infrastructure complete, UI stub only
2. **Document Approval Workflow** (submit/approve/reject/withdraw UI) — no tables, no server actions, UI section is a placeholder
3. **Confidentiality enforcement** (RLS-level filtering per role) — field exists, display badge exists, enforcement deferred

**DMS.1 is READY WITH KNOWN RISKS.** All server/DB infrastructure for the notification bell
is in place. Implementation requires only 2 files: 1 new component, 1 line change in `app-header.tsx`.

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Found? | Notes |
|---|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ Found | Primary source of truth (>300K chars) |
| `.cursor/rules/**` | ✅ Found | Multiple `.mdc` rules: child-dialog, workspace-save-close, bank-master, party-master, AI settings |
| `AGENTS.md` | ✅ Found | References `node_modules/next/dist/docs/` for Next.js guidance |
| `CLAUDE.md` | ✅ Found (references AGENTS.md) | |
| `implementation_Review/DMS_Module/028_current_implementation_status_audit.md` | ✅ Found | 028 track formally closed |
| `implementation_Review/DMS_Module/DMS_NOTIFY_1A_NOTIFICATION_BELL_AUDIT_AND_PLAN.md` | ✅ Found | Bell audit complete, ready to implement |
| `implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md` | ✅ Found | Full enhancement analysis |
| `docs/system-foundation/dms/028_current_implementation_status_audit.md` | ✅ Found | Confirms 028 abandoned |
| `docs/system-foundation/security/00_RLS_HELPER_FUNCTIONS.md` | ❌ Not found | See §3 |
| `docs/system-foundation/security/01_PERMISSIONS_CATALOG.md` | ❌ Not found | See §3 |
| `docs/system-foundation/notifications/**` | ❌ Not found | See §3 |

---

## 3. Missing Rule / Source Files

The following expected documentation files do not exist in the repository.
This is not a blocker — the live migration files and source code serve as ground truth.

| Missing File | Impact |
|---|---|
| `docs/system-foundation/security/00_RLS_HELPER_FUNCTIONS.md` | Not blocking — RLS helpers verified directly in migrations |
| `docs/system-foundation/security/01_PERMISSIONS_CATALOG.md` | Not blocking — permission codes verified in migrations/code |
| `docs/system-foundation/notifications/**` | Not blocking — notification infrastructure confirmed from migrations and server actions |
| `docs/system-foundation/master-data/**` | Not blocking |
| `docs/system-foundation/architecture/**` | Not blocking |

**No file relied on in this report was invented. All claims are backed by inspected source code
or migration SQL.**

---

## 4. Repository Structure Confirmation

| Expected Structure | Actual Path | Match? |
|---|---|---|
| Old 028: `apps/web/src/app/(erp)/dms/` | Does not exist | ❌ — 028 invalid |
| Actual DMS app: `src/app/(protected)/dms/` | ✅ Exists | ✅ |
| DMS features: `src/features/dms/` | ✅ Exists (116+ files) | ✅ |
| DMS server actions: `src/server/actions/dms/` | ✅ Exists (51 files) | ✅ |
| Admin DMS: `src/app/(protected)/admin/dms/` | ✅ Exists (8 routes) | ✅ |
| Database types: `src/types/database.ts` | ✅ Exists (primary type file) | ✅ |
| Legacy `database.types.ts` | ❌ Does not exist | N/A — correct |
| Notifications: `src/server/actions/notifications/notifications.ts` | ✅ Exists | ✅ |
| Global notifications page: `src/app/(protected)/notifications/page.tsx` | ✅ Exists | ✅ |

---

## 5. Old 028 Track Closure

### Status: PERMANENTLY CLOSED

| Check | Result |
|---|---|
| `028_001_dms_permissions_and_helpers.sql` migration | ❌ Does not exist |
| `028_002_*.sql` migration | ❌ Does not exist |
| `028_003_*.sql` migration | ❌ Does not exist |
| Old 028 helper functions (`user_can_read_dms_catalog()`) | ❌ Do not exist |
| Old 028 RPC (`rpc_dms_repository_search`) | ❌ Does not exist |
| Old 028 app path (`apps/web/src/app/(erp)/dms/`) | ❌ Does not exist |

### Why old 028 prompts are unsafe to run as-is

1. They target `apps/web/src/app/(erp)/dms/` — a monorepo structure that does not exist here.
2. They attempt to create tables/RPCs that may conflict with the existing `erp_dms_2`–`erp_dms_17` migrations.
3. They reference `database.types.ts` which does not exist (project uses `src/types/database.ts`).
4. They were written before the current DMS implementation existed.

### Replacement

The existing DMS implementation under the `erp_dms_*` migration track **is** the source of truth.
Enhancement phases DMS.1–DMS.4 (this plan) build on top of the existing implementation.
No old 028 artifacts should ever be introduced into this repository.

---

## 6. Existing DMS Route Inventory

| Route | File | Status |
|---|---|---|
| `/dms` | `src/app/(protected)/dms/page.tsx` | ✅ IMPLEMENTED — Dashboard with stats, charts, recent activity |
| `/dms/documents` | `src/app/(protected)/dms/documents/page.tsx` | ✅ IMPLEMENTED — Full document list with search/filter |
| `/dms/documents/record/[id]` | `src/app/(protected)/dms/documents/record/[id]/page.tsx` | ✅ IMPLEMENTED — Full record form with tabbed sections |
| `/dms/documents/record/new` | `src/app/(protected)/dms/documents/record/new/page.tsx` | ✅ IMPLEMENTED — New document creation form |
| `/dms/inbox` | `src/app/(protected)/dms/inbox/page.tsx` | ✅ IMPLEMENTED — Upload sessions inbox |
| `/dms/inbox/batches` | `src/app/(protected)/dms/inbox/batches/page.tsx` | ✅ IMPLEMENTED — Batch upload management |
| `/dms/intake/[sessionCode]` | `src/app/(protected)/dms/intake/[sessionCode]/page.tsx` | ✅ IMPLEMENTED — AI intake review flow |
| `/dms/review-queue` | `src/app/(protected)/dms/review-queue/page.tsx` | ✅ IMPLEMENTED — AI suggestion review queue |
| `/dms/expiring` | `src/app/(protected)/dms/expiring/page.tsx` | ✅ IMPLEMENTED — Expiry dashboard |
| `/dms/renewals` | `src/app/(protected)/dms/renewals/page.tsx` | ✅ IMPLEMENTED — Renewal requests table |
| `/dms/notifications` | `src/app/(protected)/dms/notifications/page.tsx` | ✅ IMPLEMENTED — Manual DMS notification admin |
| `/admin/dms` | `src/app/(protected)/admin/dms/page.tsx` | ✅ IMPLEMENTED — Admin overview |
| `/admin/dms/categories` | `src/app/(protected)/admin/dms/categories/page.tsx` | ✅ IMPLEMENTED |
| `/admin/dms/document-types` | `src/app/(protected)/admin/dms/document-types/page.tsx` | ✅ IMPLEMENTED |
| `/admin/dms/metadata-definitions` | `src/app/(protected)/admin/dms/metadata-definitions/page.tsx` | ✅ IMPLEMENTED |
| `/admin/dms/tags` | `src/app/(protected)/admin/dms/tags/page.tsx` | ✅ IMPLEMENTED |
| `/admin/dms/retention-policies` | `src/app/(protected)/admin/dms/retention-policies/page.tsx` | ✅ IMPLEMENTED |
| `/admin/dms/intelligence` | `src/app/(protected)/admin/dms/intelligence/page.tsx` | ✅ IMPLEMENTED — AI intelligence admin |
| `/admin/dms/ai-observability` | `src/app/(protected)/admin/dms/ai-observability/page.tsx` | ✅ IMPLEMENTED |
| `/notifications` | `src/app/(protected)/notifications/page.tsx` | ✅ IMPLEMENTED — Global notifications page |

---

## 7. Existing DMS UI Feature Inventory

### Core DMS

| Feature | Status | Evidence |
|---|---|---|
| Dashboard (stats, charts, activity) | ✅ IMPLEMENTED | `dms-dashboard-page-client.tsx`, `dms-documents-over-time-chart.tsx` |
| Document list with search/filter | ✅ IMPLEMENTED | `dms-documents-table.tsx` |
| Document record form (tabbed) | ✅ IMPLEMENTED | `dms-document-record-form.tsx` with multiple section components |
| Document creation | ✅ IMPLEMENTED | `record/new/page.tsx` |
| Document editing | ✅ IMPLEMENTED | `record/[id]/page.tsx` |
| Document links (entity linking) | ✅ IMPLEMENTED | `dms-document-links` section, `dms-link-entity-select.tsx` |
| Document versions | ✅ IMPLEMENTED | `dms-document-files-section.tsx` |
| File upload (single) | ✅ IMPLEMENTED | `dms-upload-dropzone.tsx` |
| Batch upload | ✅ IMPLEMENTED | `dms-batch-upload-progress.tsx`, `/dms/inbox/batches` |
| Inbox upload | ✅ IMPLEMENTED | `dms-upload-session-table.tsx`, `/dms/inbox` |
| AI/OCR intake | ✅ IMPLEMENTED | `dms-ai-intake-page-client.tsx`, `dms-ai-intake-review-form.tsx` |
| AI review workflow | ✅ IMPLEMENTED | `/dms/review-queue`, `dms-review-queue-*.tsx` |
| Review queue | ✅ IMPLEMENTED | `dms-review-queue-table.tsx`, `dms-review-queue-item-drawer.tsx` |
| Expiry dashboard | ✅ IMPLEMENTED | `dms-expiry-dashboard-page-client.tsx`, `dms-expiring-documents-table.tsx` |
| Expiry reminders (manual generation) | ✅ IMPLEMENTED | `dms-reminder-schedule-table.tsx`, `expiry-reminders.ts` action |
| Renewals | ✅ IMPLEMENTED | `dms-renewal-requests-table.tsx`, `dms-complete-renewal-dialog.tsx` |
| DMS notifications page (manual) | ✅ IMPLEMENTED | `dms-notifications-page-client.tsx`, `dms-notifications-table.tsx` |
| Admin: categories | ✅ IMPLEMENTED | `dms-categories-table.tsx` |
| Admin: document types | ✅ IMPLEMENTED | `dms-document-types-table.tsx` |
| Admin: metadata definitions | ✅ IMPLEMENTED | `dms-metadata-definitions-table.tsx` |
| Tags | ✅ IMPLEMENTED | `dms-tags-table.tsx` |
| Retention policies | ✅ IMPLEMENTED | `dms-retention-policies-table.tsx` |
| AI observability | ✅ IMPLEMENTED | `dms-ai-observability-page-client.tsx` with sub-sections |
| Comments / activity | ✅ IMPLEMENTED | `dms-document-comments-section.tsx`, `document-comments.ts` action |
| Semantic search | ✅ IMPLEMENTED | `dms-document-semantic-section.tsx`, `semantic-search.ts` action |
| Standard file name | ✅ IMPLEMENTED | `dms-standard-file-name-field.tsx`, `standard-file-name.ts` |
| ERP mappings preview | ✅ IMPLEMENTED | `dms-erp-mapping-preview-panel.tsx` |
| Apply to ERP | ✅ IMPLEMENTED | `dms-apply-to-erp-item-table.tsx` |
| Apply correction | ✅ IMPLEMENTED | `dms-apply-correction-*.tsx` |
| Confidentiality badge (display) | ✅ IMPLEMENTED | `dms-confidentiality-badge.tsx` |
| Expiry override / ignore | ✅ IMPLEMENTED | `20260707060000_dms_expiry_tracking_override.sql` |
| Risk badge | ✅ IMPLEMENTED | `dms-risk-badge.tsx` |
| AI confidence badge | ✅ IMPLEMENTED | `dms-ai-confidence-badge.tsx` |
| Orchestration progress | ✅ IMPLEMENTED | `dms-orchestration-progress-card.tsx` |
| **Notification bell** | ❌ MISSING | Static stub in `app-header.tsx` — no live count, no dropdown |
| **Document approval workflow UI** | ❌ MISSING | Placeholder text only in `dms-document-approvals-section.tsx` |
| **Confidentiality enforcement (RLS-level)** | ❌ DEFERRED | Field exists, badge exists, RLS not enforcing by confidentiality level |
| Global notification settings / recipient config | ❌ MISSING | Planned in DMS.1 |
| Automated notification scheduler | ❌ MISSING | Manual only — planned in DMS.1 |

---

## 8. Existing DMS Backend / Server Action Inventory

### DMS Server Actions (`src/server/actions/dms/` — 51 files)

| Action File | Key Functions | Status |
|---|---|---|
| `documents.ts` | `getDmsDocument`, `createDmsDocument`, `updateDmsDocument`, `deleteDmsDocument` (soft), `purge_dms_document` (RPC hard-delete) | ✅ IMPLEMENTED |
| `notifications.ts` | `generateDmsExpiryNotifications`, `getUnreadDmsNotificationsCount`, `getDmsNotifications`, `markDmsNotificationRead`, `markAllDmsNotificationsRead` | ✅ IMPLEMENTED |
| `dms-email-bridge.ts` | `bridgeDueDmsNotificationsToGlobal`, `processEmailQueue` | ✅ IMPLEMENTED |
| `expiry-reminders.ts` | `generateDmsExpiryRemindersForDocument`, `getDmsExpiryReminders`, `updateDmsExpiryReminder` | ✅ IMPLEMENTED |
| `document-files.ts` | upload, version, delete file actions | ✅ IMPLEMENTED |
| `document-tags.ts` | `addTagToDocument`, `removeTagFromDocument` | ✅ IMPLEMENTED |
| `document-links.ts` | `createDocumentLink`, `removeDocumentLink` | ✅ IMPLEMENTED |
| `upload-sessions.ts` | session CRUD, status transitions | ✅ IMPLEMENTED |
| `batch-intake.ts` | batch upload orchestration | ✅ IMPLEMENTED |
| `categories.ts` | category CRUD | ✅ IMPLEMENTED |
| `document-types.ts` | type CRUD | ✅ IMPLEMENTED |
| `metadata-definitions.ts` | metadata definition CRUD | ✅ IMPLEMENTED |
| `document-metadata-values.ts` | metadata value CRUD | ✅ IMPLEMENTED |
| `tags.ts` | tag CRUD | ✅ IMPLEMENTED |
| `retention-policies.ts` | retention policy CRUD | ✅ IMPLEMENTED |
| `renewals.ts` | renewal workflow actions | ✅ IMPLEMENTED |
| `review-queue.ts` | review queue workflow | ✅ IMPLEMENTED |
| `ai-analysis.ts` | AI classification, extraction | ✅ IMPLEMENTED |
| `ai-intake.ts` | AI intake orchestration | ✅ IMPLEMENTED |
| `ai-intelligence.ts` | intelligence pipeline | ✅ IMPLEMENTED |
| `ai-observability.ts` | AI cost/usage observability | ✅ IMPLEMENTED |
| `ai-summary.ts` | AI document summary | ✅ IMPLEMENTED |
| `ai-risk.ts` | AI risk scoring | ✅ IMPLEMENTED |
| `ai-search.ts` | AI-powered search | ✅ IMPLEMENTED |
| `ai-metadata-suggestions.ts` | AI metadata suggestion generation | ✅ IMPLEMENTED |
| `ai-tags.ts` | AI auto-tagging | ✅ IMPLEMENTED |
| `ai-completeness.ts` | AI completeness scoring | ✅ IMPLEMENTED |
| `ai-jobs.ts` | AI job queue management | ✅ IMPLEMENTED |
| `ai-links.ts` | AI entity linking | ✅ IMPLEMENTED |
| `ocr.ts` | OCR extraction | ✅ IMPLEMENTED |
| `semantic-search.ts` | Vector / semantic search | ✅ IMPLEMENTED |
| `entity-documents.ts` | `getAvailableDmsDocumentsForLink`, `linkDmsDocumentToEntity` | ✅ IMPLEMENTED |
| `entity-matching.ts` | Entity matching from extractions | ✅ IMPLEMENTED |
| `orchestration.ts` | Full-pipeline orchestration | ✅ IMPLEMENTED |
| `apply-to-erp.ts` | Apply AI results to ERP entities | ✅ IMPLEMENTED |
| `apply-correction.ts` | Correction proposals | ✅ IMPLEMENTED |
| `erp-mappings.ts` | ERP field mapping configuration | ✅ IMPLEMENTED |
| `document-comments.ts` | Comments and activity log | ✅ IMPLEMENTED |
| `document-events.ts` | Event tracking | ✅ IMPLEMENTED |
| `document-content.ts` | Document text content | ✅ IMPLEMENTED |
| `document-understanding.ts` | Deep document understanding | ✅ IMPLEMENTED |
| `document-qa.ts` | QA / validation checks | ✅ IMPLEMENTED |
| `document-upload-attach.ts` | Upload + attach in one step | ✅ IMPLEMENTED |
| `dashboard.ts` | Dashboard KPI aggregation | ✅ IMPLEMENTED |
| `overview.ts` | Overview stats | ✅ IMPLEMENTED |
| `standard-file-name.ts` | Standard file name generation | ✅ IMPLEMENTED |
| `validation.ts` | Document validation | ✅ IMPLEMENTED |
| `session-cleanup.ts` | Upload session cleanup | ✅ IMPLEMENTED |
| `metadata-suggestion-queue.ts` | Metadata suggestion queue | ✅ IMPLEMENTED |
| `metadata-suggestion-review.ts` | Metadata suggestion review | ✅ IMPLEMENTED |
| `intelligence-admin.ts` | Intelligence admin actions | ✅ IMPLEMENTED |
| `ai-orch_1` | AI orchestration columns | ✅ IMPLEMENTED |

### Global Notifications Server Actions (`src/server/actions/notifications/notifications.ts`)

| Action | Status |
|---|---|
| `getMyNotifications(filters?)` | ✅ IMPLEMENTED |
| `getAllNotifications(filters?)` | ✅ IMPLEMENTED |
| `getUnreadNotificationCount()` | ✅ IMPLEMENTED |
| `createNotification(input)` | ✅ IMPLEMENTED |
| `markNotificationRead(id)` | ✅ IMPLEMENTED |
| `markAllMyNotificationsRead()` | ✅ IMPLEMENTED |
| `dismissNotification(id)` | ✅ IMPLEMENTED |
| `archiveNotification(id)` | ✅ IMPLEMENTED |
| Approval server actions | ❌ MISSING |

---

## 9. Existing DMS Database / Migration Inventory

### Migration Track Summary

| Phase | Migration File | Core Tables/Changes |
|---|---|---|
| DMS.2 | `20260614192000_erp_dms_2_*` | Foundation: `dms_documents`, `dms_document_categories`, `dms_document_types`, `dms_metadata_definitions`, `dms_document_versions`, `dms_document_files`, `dms_tags`, `dms_document_tags`, `dms_document_metadata_values`, `dms_document_links`; storage buckets; RLS; numbering |
| DMS.6 | `20260614215551_erp_dms_6_*` | Party documents migration |
| DMS.7 | `20260614221455_erp_dms_7_*` | File cleanup hardening |
| DMS.8 | `20260614224102_erp_dms_8_*` | `dms_expiry_reminders`, `dms_notification_queue`, expiry pipeline |
| DMS.8a | `20260615003816_erp_dms_8a_*` | Bridge columns on `dms_notification_queue`: `global_notification_id`, `global_email_queue_id`, `bridge_status` |
| DMS.9 | `20260615010000_erp_dms_9_*` | OCR pipeline: `dms_ocr_results`, `dms_ocr_jobs` |
| DMS.10 | `20260615020000_erp_dms_10_*` | AI classification: `dms_ai_extraction_results`, `dms_ai_classification_results` |
| DMS.11 | `20260615040000_erp_dms_11_*` | AI first intake pipeline |
| DMS.12.1 | `20260615060000_erp_dms_12_1_*` | Content text foundation: `dms_document_content` |
| DMS.12.3–4 | `20260615070000/080000` | Intelligence indexes, suggestion tables: `dms_ai_metadata_suggestions` |
| DMS.12.5 | `20260615100000_erp_dms_12_5_*` | Semantic search: `pgvector`, `dms_document_embeddings` |
| DMS.13 | `20260615120000_erp_dms_13_*` | Batch upload: `dms_batch_upload_sessions`, `dms_batch_upload_items` |
| DMS AI Phase 1–17 | `20260617` → `20260701` | Full AI orchestration, job queue, observability, apply-to-ERP, correction, token cost |
| DMS Renewal v2 | `20260703000000_dms_renewal_workflow_v2.sql` | Enhanced renewal workflow |
| DMS Versions/Files RLS | `20260703020000_dms_versions_files_rls_parity.sql` | RLS parity for versions and files |
| RBAC HR/DMS roles | `20260706100000_erp_rbac_hr_dms_role_permissions.sql` | Permission grants for hr_manager and dms_manager roles |
| Expiry override | `20260707060000_dms_expiry_tracking_override.sql` | Ignore expiry per document |
| FK cascade rules | `20260709093700/093800` | Hard delete FK cascade + enhanced purge RPC |

### Key Table Summary

| Table | Purpose | Status |
|---|---|---|
| `dms_documents` | Central document metadata | ✅ Live |
| `dms_document_categories` | Category master | ✅ Live |
| `dms_document_types` | Type master | ✅ Live |
| `dms_metadata_definitions` | Custom metadata fields | ✅ Live |
| `dms_document_metadata_values` | Per-document metadata values | ✅ Live |
| `dms_document_versions` | Document version history | ✅ Live |
| `dms_document_files` | Physical file records | ✅ Live |
| `dms_document_links` | Entity links (party, employee, etc.) | ✅ Live |
| `dms_tags` / `dms_document_tags` | Tag system | ✅ Live |
| `dms_expiry_reminders` | Per-document expiry reminder schedule | ✅ Live |
| `dms_notification_queue` | DMS-specific notification queue | ✅ Live (with bridge columns) |
| `dms_ocr_results` / `dms_ocr_jobs` | OCR pipeline | ✅ Live |
| `dms_ai_extraction_results` | AI field extractions | ✅ Live |
| `dms_ai_classification_results` | AI classification outputs | ✅ Live |
| `dms_ai_metadata_suggestions` | AI metadata suggestion queue | ✅ Live |
| `dms_document_embeddings` | pgvector semantic embeddings | ✅ Live |
| `dms_document_content` | Full text content | ✅ Live |
| `dms_upload_sessions` | Upload session tracking | ✅ Live |
| `dms_batch_upload_sessions` | Batch upload sessions | ✅ Live |
| `dms_approve_runs` | AI intake approve-run records | ✅ Live |
| `erp_notifications` | Global ERP notification table | ✅ Live |
| `erp_email_queue` | Email delivery queue | ✅ Live |
| `erp_notification_templates` | Email/in-app templates | ✅ Live (18 templates seeded) |
| `erp_notification_delivery_logs` | Delivery audit log | ✅ Live |
| `dms_document_approvals` | Document approval workflow records | ❌ DOES NOT EXIST |
| `dms_document_workflows` | Approval workflow definitions | ❌ DOES NOT EXIST |
| `dms_document_workflow_steps` | Workflow step definitions | ❌ DOES NOT EXIST |

---

## 10. Existing Notification Infrastructure Inventory

| Item | Status | Notes |
|---|---|---|
| `erp_notifications` table | ✅ IMPLEMENTED | `status` default `'unread'`, `recipient_user_id` indexed, `deleted_at` soft-delete |
| `dms_notification_queue` table | ✅ IMPLEMENTED | With `bridge_status`, `global_notification_id`, `global_email_queue_id` |
| `dms_expiry_reminders` table | ✅ IMPLEMENTED | Per-document reminder schedule |
| `erp_email_queue` table | ✅ IMPLEMENTED | RLS narrowed in USERS.5 |
| `erp_notification_templates` table | ✅ IMPLEMENTED | 18 templates seeded including `DMS_EXPIRY_REMINDER` |
| `erp_notification_delivery_logs` table | ✅ IMPLEMENTED | |
| Global notifications page (`/notifications`) | ✅ IMPLEMENTED | Full tabs: All / Unread / Dismissed |
| `getMyNotifications` server action | ✅ IMPLEMENTED | |
| `getUnreadNotificationCount` server action | ✅ IMPLEMENTED | |
| `markNotificationRead` server action | ✅ IMPLEMENTED | |
| `markAllMyNotificationsRead` server action | ✅ IMPLEMENTED | |
| `dismissNotification` server action | ✅ IMPLEMENTED | |
| `generateDmsExpiryNotifications` action | ✅ IMPLEMENTED | Manual trigger only |
| `bridgeDueDmsNotificationsToGlobal` action | ✅ IMPLEMENTED | Manual trigger only |
| `processEmailQueue` action | ✅ IMPLEMENTED | Manual trigger only |
| DMS notification bridge columns | ✅ IMPLEMENTED | `global_notification_id`, `global_email_queue_id` on `dms_notification_queue` |
| Manual DMS notification buttons in `/dms/notifications` | ✅ IMPLEMENTED | Admin must run steps manually |
| Realtime invalidation hook (`RealtimeProvider`) | ✅ IMPLEMENTED | Subscribes to `erp_notifications`, calls `invalidateMyNotifications` |
| TanStack query key `["notifications","unread-count"]` | ✅ IMPLEMENTED | Defined in `query-keys.ts` |
| Notification bell (live) | ❌ MISSING | Static stub only — see §11 |
| Global recipient notification settings | ❌ MISSING | No admin config page for who receives expiry alerts |
| Automatic notification scheduler | ❌ MISSING | No pg_cron or Edge Function scheduler yet |
| HR compliance expiry templates | ⚠️ PARTIAL | `DMS_EXPIRY_REMINDER` template exists; HR-specific templates not confirmed |
| Email feature flags for DMS | ✅ IMPLEMENTED | `DMS_EXPIRY_EMAILS` flag checked in bridge action |

---

## 11. Existing Approval Infrastructure Inventory

| Item | Status | Notes |
|---|---|---|
| `dms_document_approvals` table | ❌ MISSING | No migration found |
| `dms_document_workflows` table | ❌ MISSING | No migration found |
| `dms_document_workflow_steps` table | ❌ MISSING | No migration found |
| `dms_approve_runs` table | ✅ EXISTS — but different purpose | This table tracks **AI intake approve-run** events (not document approval workflow); created in `erp_dms_ai_phase4` |
| Submit for approval action | ❌ MISSING | |
| Approve action | ❌ MISSING | |
| Reject action | ❌ MISSING | |
| Withdraw action | ❌ MISSING | |
| Pending approval queue UI | ❌ MISSING | |
| Approval panel in document record | ⚠️ PARTIAL | `dms-document-approvals-section.tsx` exists but shows placeholder text: *"Approval workflow will be implemented in a future DMS phase."* |
| Approval history | ❌ MISSING | |
| Workflow admin UI | ❌ MISSING | |
| Approval notification templates | ❌ MISSING | Templates for `DOCUMENT_APPROVAL_REQUESTED`, `DOCUMENT_APPROVED`, `DOCUMENT_REJECTED` not in seeds |
| Approval RBAC permissions (`dms.documents.approve`) | ✅ PARTIAL | `dms.documents.approve` permission code granted to `hr_manager` role in `20260706100000`, but no server action enforces it for a real approval workflow |

> **Important:** `dms_approve_runs` is NOT a document approval workflow table. It tracks AI intake
> batch events (approve/reject an entire AI-suggested document intake session). This must not be
> reused or renamed for the document approval workflow — create new `dms_document_approvals` tables.

---

## 12. Existing Permissions / RLS Inventory

### DMS Permission Codes (confirmed in migrations/code)

| Permission Code | Confirmed | Used In |
|---|---|---|
| `dms.documents.view` | ✅ | RLS policies, server actions |
| `dms.documents.edit` | ✅ | RLS policies, server actions |
| `dms.documents.upload` | ✅ | RLS policies |
| `dms.documents.delete` | ✅ | RLS policies |
| `dms.documents.download` | ✅ | RLS policies, role grants |
| `dms.documents.preview` | ✅ | RLS policies |
| `dms.documents.manage_types` | ✅ | RLS policies |
| `dms.documents.manage_tags` | ✅ | RLS policies, role grants |
| `dms.documents.approve` | ✅ | Role grants only — no enforcement action |
| `dms.documents.ocr.view` | ✅ | Role grants |
| `dms.admin` | ✅ | RLS policies |
| `dms.expiry.view` | ✅ | Role grants |
| `dms.expiry.manage` | ✅ | Role grants |
| `dms.expiry.dismiss` | ✅ | Role grants |
| `dms.renewals.manage` | ✅ | Role grants |
| `dms.notifications.view` | ✅ | Role grants |
| `dms.documents.view_sensitive` | ❌ MISSING | Referenced in enhancement plan but not in any migration |
| `dms.documents.view.hr` | ✅ | Legacy; superseded by `dms.documents.view` in RBAC phase |
| `notifications.manage` | ✅ | Notification server actions |
| `notifications.admin` | ✅ | Notification server actions |
| `notifications.email_queue.*` | ✅ | `erp_users_5_security_hardening_email_queue_rls.sql` |
| `dms.approvals.*` | ❌ MISSING | No approval permission codes defined |

### RLS Policy Quality

| Table | Policy Type | Risk |
|---|---|---|
| `dms_documents` | Permission-scoped (`dms.documents.view`, `dms.documents.edit`) | ✅ Good |
| `dms_document_files` | Permission-scoped | ✅ Good |
| `dms_document_versions` | Permission-scoped | ✅ Good |
| `erp_notifications` | ⚠️ BROAD — `authenticated ALL USING (true)` | **Pre-existing risk** — any user can read any notification at DB level |
| `erp_email_queue` | Scoped to `notifications.*` permissions | ✅ Hardened in USERS.5 |
| `dms_approve_runs` | Scoped to upload session ownership | ✅ Good |
| `dms_notification_queue` | Needs verification | ⚠️ To be checked in DMS.3 |

---

## 13. Existing Realtime Infrastructure Inventory

| Item | Status | Notes |
|---|---|---|
| `RealtimeProvider` component | ✅ IMPLEMENTED | `src/components/layout/realtime-provider.tsx` |
| `erp_notifications` Realtime subscription | ✅ IMPLEMENTED | Event `*`, debounce 500ms |
| `dms_upload_sessions` Realtime subscription | ✅ IMPLEMENTED | Event `*`, debounce 300ms |
| `invalidateMyNotifications` called on `erp_notifications` events | ✅ IMPLEMENTED | Invalidates `["notifications","my"]` and `["notifications","unread-count"]` |
| `useRealtimeSync` hook | ✅ IMPLEMENTED | `src/hooks/realtime/use-realtime-sync.ts` |
| Consumer of `["notifications","unread-count"]` query | ❌ MISSING | No component reads this key — the bell stub does NOT use `useQuery` |
| `NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` flag | ✅ IMPLEMENTED | Guard in `RealtimeProvider` |

---

## 14. Existing Email Pipeline Inventory

| Item | Status | Notes |
|---|---|---|
| `erp_email_queue` table | ✅ IMPLEMENTED | RLS narrowed |
| `erp_notification_templates` (18 seeds) | ✅ IMPLEMENTED | Including `DMS_EXPIRY_REMINDER` |
| `processEmailQueue` server action | ✅ IMPLEMENTED | Manual trigger |
| Email provider settings (Microsoft Graph / SMTP) | ✅ IMPLEMENTED | `erp_settings_2_email_provider_microsoft_graph.sql` |
| Email feature flags | ✅ IMPLEMENTED | `DMS_EXPIRY_EMAILS` in bridge action |
| `bridgeDueDmsNotificationsToGlobal` action | ✅ IMPLEMENTED | Creates both `erp_notifications` and `erp_email_queue` rows |
| `erp_notification_delivery_logs` | ✅ IMPLEMENTED | |
| Automated email scheduler | ❌ MISSING | No pg_cron or Edge Function |
| Global recipient config | ❌ MISSING | No admin UI or DB table for per-role/user notification subscription rules |
| `DMS_APPROVAL_REQUESTED` email template | ❌ MISSING | |
| `DMS_DOCUMENT_APPROVED` email template | ❌ MISSING | |
| `DMS_DOCUMENT_REJECTED` email template | ❌ MISSING | |

---

## 15. Existing Confidentiality / Sensitive Access Inventory

| Item | Status | Notes |
|---|---|---|
| `confidentiality_level` field on `dms_documents` | ✅ IMPLEMENTED | Values: `internal`, `company`, `hr`, `finance`, `legal`, `executive` |
| `default_confidentiality` on `dms_document_types` | ✅ IMPLEMENTED | |
| `DmsConfidentialityBadge` component | ✅ IMPLEMENTED | Display-only badge in document list and record |
| Server action filtering by `confidentiality_level` | ✅ PARTIAL | `ai-analysis.ts` blocks AI operations on `restricted` levels; `entity-documents.ts` filters; not universally enforced in `documents.ts` list/get |
| `dms.documents.view_sensitive` permission code | ❌ MISSING | No migration seeds this code |
| RLS confidentiality enforcement | ❌ MISSING | RLS does not filter by `confidentiality_level` — anyone with `dms.documents.view` sees all levels |
| `dms_document_access_rules` table | ❌ DOES NOT EXIST | Referenced in enhancement plan as future |
| Masking in list view | ❌ MISSING | All confidentiality levels visible in document list if user has `dms.documents.view` |
| Admin override for sensitive docs | ❌ MISSING | |
| Access logs for sensitive docs | ❌ MISSING | |
| **DMS.3 — Confidentiality enforcement deferred** | ⚠️ DEFERRED | Per user request; will not be implemented in DMS.0–DMS.2 |

---

## 16. Confirmed Working / Implemented Items

Summary of confirmed IMPLEMENTED items:

- ✅ Full DMS route structure (19 routes — user-facing + admin)
- ✅ 51 DMS server action files covering all CRUD, AI, notifications, email, search, entity linking
- ✅ 50+ database migrations: `erp_dms_2` through `erp_dms_ai_phase17`
- ✅ Global notification infrastructure (`erp_notifications`, `erp_email_queue`, templates, delivery logs)
- ✅ DMS notification queue with global bridge columns
- ✅ Manual notification pipeline (generate → bridge → process email)
- ✅ Realtime subscription for `erp_notifications` (fires on every INSERT/UPDATE/DELETE)
- ✅ Global notifications page (`/notifications`) with tabs, mark-all-read, refresh
- ✅ 8 server actions for global notifications (all CRUD lifecycle)
- ✅ AI pipeline: OCR, classification, extraction, metadata suggestions, semantic search, risk scoring, observability
- ✅ DMS confidentiality_level field + display badge
- ✅ DMS permission codes for view, edit, upload, delete, download, preview, manage_types, manage_tags, approve, expiry, renewals, notifications
- ✅ `dms.documents.approve` permission code granted to `hr_manager` role
- ✅ Expiry reminders + renewal workflow
- ✅ Document comments + activity log
- ✅ Retention policies
- ✅ Standard file name generation
- ✅ Apply-to-ERP + correction proposal workflow
- ✅ Hard delete (cascade FK + enhanced purge RPC)
- ✅ `erp_email_queue` RLS hardened (USERS.5)

---

## 17. Confirmed Missing / Gap Items

| # | Gap | Severity | Target Phase |
|---|---|---|---|
| G1 | Notification bell — live count, dropdown, Realtime consumer | **Critical** | DMS.1 |
| G2 | Global notification recipient config (who gets which DMS alerts) | High | DMS.1 |
| G3 | Automated notification scheduler (pg_cron / Edge Function) | High | DMS.1 |
| G4 | Document approval workflow tables (`dms_document_approvals`, `dms_document_workflows`, `dms_document_workflow_steps`) | High | DMS.2 |
| G5 | Approval server actions (submit, approve, reject, withdraw) | High | DMS.2 |
| G6 | Approval panel UI (currently placeholder text) | High | DMS.2 |
| G7 | Approval notification templates (`DOCUMENT_APPROVAL_REQUESTED`, `DOCUMENT_APPROVED`, `DOCUMENT_REJECTED`) | Medium | DMS.2 |
| G8 | `dms.approvals.*` permission codes | Medium | DMS.2 |
| G9 | `dms.documents.view_sensitive` permission code | Medium | DMS.3 |
| G10 | RLS confidentiality enforcement (filter docs by confidentiality level per role) | Medium | DMS.3 |
| G11 | `dms_document_access_rules` table | Low | DMS.3 |
| G12 | Masking confidential documents in list view | Low | DMS.3 |
| G13 | `erp_notifications` broad RLS policy | Medium (security) | DMS.3 |
| G14 | `action_url` safety/allowlisting in notifications | Low | DMS.3 |
| G15 | HR compliance expiry templates (beyond `DMS_EXPIRY_REMINDER`) | Low | DMS.1 |

---

## 18. Items Deferred to Future

| Item | Deferred To | Reason |
|---|---|---|
| Confidentiality enforcement (RLS-level) | DMS.3 | User decision; deferred from original enhancement plan |
| Approval workflow | DMS.2 | No DB tables yet; needs full implementation |
| Automated scheduler | DMS.1 | pg_cron / Edge Function; safe to add without breaking existing system |
| `erp_notifications` broad RLS narrow | DMS.3 | Breaking change; needs careful migration |
| Semantic search admin improvements | DMS.4 (QA/UAT) | Already works; improvements optional |

---

## 19. Items Not Safe to Re-Implement

These items MUST NOT be created or recreated as they already exist or conflict with existing system:

| Item | Reason |
|---|---|
| Old 028 migration files | Conflict with existing `erp_dms_2`–`erp_dms_17` schema |
| Old 028 helper functions (`user_can_read_dms_catalog`) | `current_user_has_permission()` already exists and is used everywhere |
| Old 028 RPCs (`rpc_dms_repository_search`) | Semantic search already implemented via pgvector + `dms-document-semantic-section.tsx` |
| Old 028 app paths (`apps/web/src/app/(erp)/dms/`) | Monorepo structure does not exist |
| `dms_approve_runs` for document approval workflow | This table serves AI intake approve-run events; must not be repurposed |
| New `dms_notification_queue`-like tables | Use existing bridge to `erp_notifications` |
| New DMS document tables duplicating `dms_documents` | `dms_documents` is the single source; do not create a shadow table |

---

## 20. Known Security / RLS Risks

| # | Risk | Severity | Where |
|---|---|---|---|
| R1 | `erp_notifications` RLS policy is `authenticated ALL USING (true)` — any user can read/write any notification at DB level | **Medium** | Server action correctly filters by `recipient_user_id`, but DB layer has no enforcement |
| R2 | `dms.documents.view_sensitive` permission does not exist — all users with `dms.documents.view` see documents of any confidentiality level | Medium | RLS and server actions |
| R3 | `confidentiality_level` filtering only partial in server actions (inconsistent across `documents.ts`, `ai-analysis.ts`, `entity-documents.ts`) | Medium | Multiple server action files |
| R4 | `action_url` in `erp_notifications` not allowlisted — potential open redirect risk | Low | `notifications.ts` server action |
| R5 | `payload_json` / `metadata_json` fields in notifications could expose sensitive data | Low | `erp_notifications.metadata_json` |
| R6 | Storage bucket/object key exposure — signed URLs or raw paths in document records may leak sensitive content to unauthorized users | Low | `dms_document_files` + storage actions |
| R7 | Cross-company isolation — no explicit `organization_id` filter verified on all DMS queries; relies on `current_user_has_permission` which is branch-scoped | Medium | All DMS list/search queries |
| R8 | `dms_notification_queue` RLS policy not verified in this audit | Low | `dms_notification_queue` |

**None of these risks are fixed in DMS.0. All are carried forward to DMS.3.**

---

## 21. Merged Future Phase Plan

### Phase Structure

```
DMS.0 — Existing DMS Baseline & Scope Lock         ← THIS DOCUMENT (COMPLETE)
DMS.1 — Full Notification System                    ← NEXT
DMS.2 — Full Approval System
DMS.3 — Security & Permissions Hardening
DMS.4 — Full Runtime QA, UAT & Final Sign-Off
```

---

### DMS.1 — Full Notification System

**1. Objective:** Implement a live notification bell in the ERP top bar and automate the DMS
expiry notification pipeline.

**2. Scope:**
- Top-bar notification bell (live unread count, dropdown, per-item actions, mark-all-read)
- Global recipient notification settings (admin page: which roles/users receive which DMS alerts)
- Automated scheduler for DMS expiry notifications (pg_cron or Edge Function)
- DMS expiry alert escalation (warn → urgent → critical based on days remaining)
- Optional: HR compliance expiry alerts if DMS bridge covers HR compliance documents

**3. Main tasks:**
1. Create `src/components/erp/notification-bell.tsx` — bell with `useQuery(["notifications","unread-count"])`, popover dropdown, mark-read/dismiss actions, "View all" link
2. Modify `src/components/layout/app-header.tsx` — replace static stub (lines 84–88) with `<NotificationBell />`
3. Create `/admin/dms/notification-settings` page — global recipient config (which roles/users receive DMS expiry alerts per document type/category)
4. Add DB table or config storage for global recipient rules
5. Auto-generate DMS expiry reminders via pg_cron job or Edge Function + cron schedule
6. Auto-bridge DMS notifications to `erp_notifications` automatically (no manual admin step)
7. Auto-process email queue (pg_cron or Edge Function)

**4. Files likely touched:**
- `src/components/erp/notification-bell.tsx` (NEW)
- `src/components/layout/app-header.tsx` (2-line change)
- `src/app/(protected)/admin/dms/notification-settings/page.tsx` (NEW)
- `src/server/actions/dms/notifications.ts` (extend for recipient config)
- `supabase/migrations/dms_1_notification_scheduler_*.sql` (NEW — pg_cron setup, recipient config table)
- Edge Function: `supabase/functions/dms-expiry-scheduler/index.ts` (NEW — optional if pg_cron used instead)

**5. DB changes expected:**
- New table: `dms_notification_recipient_rules` (or similar) for global recipient config
- pg_cron job registration for expiry notification pipeline
- Possibly new `erp_notification_templates` rows for additional DMS alert types

**6. DB changes NOT allowed:**
- Do NOT modify `erp_notifications` RLS (save for DMS.3)
- Do NOT drop or alter `dms_notification_queue` or `dms_expiry_reminders`
- Do NOT modify `erp_notification_templates` existing rows

**7. UI changes expected:**
- New `NotificationBell` component in app header
- New admin notification settings page
- Bell replaces static stub — rest of header unchanged

**8. Backend/server action changes:**
- New server action: `getUnreadCountForBell()` (or reuse existing `getUnreadNotificationCount`)
- New server action: `getDmsNotificationRecipientRules()` / `saveDmsNotificationRecipientRules()`
- Extend `bridgeDueDmsNotificationsToGlobal` to use recipient rules when determining `recipient_user_id`

**9. Security/RLS notes:**
- Bell fetches only `recipient_user_id = current_user` — no cross-user risk
- Recipient config table needs scoped RLS (`dms.admin` or `system_admin` to manage)

**10. Acceptance criteria:**
- Bell shows live unread count matching DB count
- Badge hides at 0 unread
- Dropdown shows up to 10 most recent unread
- Mark-all-read clears badge without page refresh
- Realtime update increments badge within 1s of new notification insert
- DMS expiry notifications appear in bell after automated pipeline runs
- Admin can configure which roles receive DMS expiry alerts

**11. Must NOT include:**
- Approval workflow implementation
- Confidentiality RLS enforcement
- Broad `erp_notifications` RLS rewrite
- Old 028 migrations or helper functions

**12. Deliverable:**
`implementation_Review/DMS_Module/DMS_1_NOTIFICATION_SYSTEM_IMPLEMENTATION_REPORT.md`

---

### DMS.2 — Full Approval System

**1. Objective:** Implement document approval workflow — submit for approval, approve, reject,
withdraw, pending queue, history, notification integration.

**2. Scope:**
- New DB tables: `dms_document_approvals`, `dms_document_approval_steps`, optionally `dms_approval_workflows`
- Server actions: submit, approve, reject, withdraw
- Approval panel in document record (replaces placeholder)
- Pending approval queue view
- Approval history in document record
- Approval notification templates and email integration
- RBAC: `dms.approvals.submit`, `dms.approvals.review`, `dms.approvals.admin`

**3. Main tasks:**
1. DB migration: `dms_document_approvals` (id, document_id, status, submitted_by, reviewed_by, submitted_at, reviewed_at, notes)
2. Server actions: `submitForApproval`, `approveDocument`, `rejectDocument`, `withdrawApproval`
3. Approval panel UI in `dms-document-approvals-section.tsx` (replace placeholder)
4. Approval queue page (`/dms/approvals` or integrated into review-queue)
5. Notification templates: `DOCUMENT_APPROVAL_REQUESTED`, `DOCUMENT_APPROVED`, `DOCUMENT_REJECTED`
6. Permission codes: `dms.approvals.submit`, `dms.approvals.review`, `dms.approvals.admin`

**4. Files likely touched:**
- `supabase/migrations/dms_2_document_approval_workflow_*.sql` (NEW)
- `src/server/actions/dms/document-approvals.ts` (NEW)
- `src/features/dms/documents/sections/dms-document-approvals-section.tsx` (REPLACE placeholder)
- `src/features/dms/approvals/` (NEW — approval queue, approval history components)
- `src/app/(protected)/dms/approvals/page.tsx` (NEW — or modify review-queue)

**5. DB changes expected:**
- New tables: `dms_document_approvals`, optionally `dms_approval_workflows`
- New permission codes: `dms.approvals.*`
- New notification template rows

**6. DB changes NOT allowed:**
- Do NOT repurpose or modify `dms_approve_runs` (AI intake table)
- Do NOT modify `dms_documents` core columns

**7. Acceptance criteria:**
- User with `dms.approvals.submit` can submit a document for approval
- User with `dms.approvals.review` can approve or reject
- Status transitions enforced at server/RLS level
- Approval notification delivered to reviewer's bell
- Approval history visible in document record panel

**8. Must NOT include:**
- Confidentiality enforcement
- Old 028 artifacts

**12. Deliverable:**
`implementation_Review/DMS_Module/DMS_2_APPROVAL_SYSTEM_IMPLEMENTATION_REPORT.md`

---

### DMS.3 — Security & Permissions Hardening

**1. Objective:** Narrow broad RLS policies, add missing permission codes, enforce confidentiality
filtering, and fix all security risks documented in §20.

**2. Scope:**
- Narrow `erp_notifications` RLS (R1): scoped `SELECT` for `recipient_user_id = current_user()`
- Add `dms.documents.view_sensitive` permission code + enforce in RLS and server actions (R2)
- Consistent confidentiality filtering across all `dms_documents` server actions (R3)
- `action_url` allowlisting (R4)
- `dms_notification_queue` RLS review and narrowing (R8)
- Cross-company isolation audit for DMS queries (R7)
- `dms_document_access_rules` table (if confidentiality enforcement requires per-doc override)

**3. DB changes expected:**
- Narrow `erp_notifications` RLS policy
- Add `dms.documents.view_sensitive` permission seed
- Possible `dms_document_access_rules` table

**4. DB changes NOT allowed:**
- Do NOT drop or alter `erp_notifications` core columns
- Do NOT alter `dms_documents` confidentiality_level enum values (breaking change)

**12. Deliverable:**
`implementation_Review/DMS_Module/DMS_3_SECURITY_HARDENING_REPORT.md`

---

### DMS.4 — Full Runtime QA, UAT & Final Sign-Off

**1. Objective:** End-to-end runtime validation of all DMS.1, DMS.2, DMS.3 features including
Playwright tests, RLS verification with multiple roles, email delivery test, and final sign-off.

**2. Scope:** Full regression + acceptance testing across all DMS phases.

**12. Deliverable:**
`implementation_Review/DMS_Module/DMS_4_RUNTIME_QA_UAT_FINAL_SIGNOFF.md`

---

## 22. DMS.1 Readiness Check

### Verdict: ✅ READY WITH KNOWN RISKS

| Check | Result |
|---|---|
| `erp_notifications` table exists with correct schema | ✅ |
| `getUnreadNotificationCount()` server action exists | ✅ |
| `getMyNotifications()` server action exists | ✅ |
| `markAllMyNotificationsRead()` server action exists | ✅ |
| `markNotificationRead(id)` server action exists | ✅ |
| Realtime subscription for `erp_notifications` active | ✅ |
| `["notifications","unread-count"]` query key defined | ✅ |
| `AppHeader` renders in `ErpShell` — mount point confirmed | ✅ |
| Bell is currently a static stub — safe to replace | ✅ |
| No DB migration needed for bell component | ✅ |
| DMS bridge to `erp_notifications` works | ✅ |

**Known risks to accept:**
1. `erp_notifications` broad RLS — mitigated by app-layer filtering (carried to DMS.3)
2. Manual-only bridge + scheduler — DMS expiry notifications won't appear in bell until admin runs them manually, until the scheduler is implemented in DMS.1

**Files for DMS.1 bell (exact, 2 files only):**
```
NEW:    src/components/erp/notification-bell.tsx
MODIFY: src/components/layout/app-header.tsx  (replace lines 84–88)
```

---

## 23. Recommended Next Step

**Implement DMS.1 — starting with the notification bell (smallest isolated change):**

1. Create `src/components/erp/notification-bell.tsx`:
   - `useQuery(["notifications", "unread-count"], getUnreadNotificationCount)` for live badge
   - `useQuery(["notifications", "my", { limit: 10, status: "unread" }], getMyNotifications)` for dropdown
   - `useTransition` for `markNotificationRead`, `markAllMyNotificationsRead`, `dismissNotification`
   - Popover from shadcn/ui, severity badge colors, "View all" link to `/notifications`
   - Badge hidden at 0; shows count otherwise; color = red for urgent/critical, amber for warning, blue for info
2. Modify `src/components/layout/app-header.tsx` lines 84–88: replace static stub with `<NotificationBell />`
3. Then implement global recipient settings + automated scheduler as follow-on DMS.1 tasks

---

## 24. Exact Prompt Needed Next

```
DMS.NOTIFY.1B — Notification Bell Implementation

Implement the notification bell component as specified in:
  implementation_Review/DMS_Module/DMS_NOTIFY_1A_NOTIFICATION_BELL_AUDIT_AND_PLAN.md
  implementation_Review/DMS_Module/DMS_0_EXISTING_DMS_BASELINE_AND_SCOPE_LOCK.md

Create exactly:
  NEW:    src/components/erp/notification-bell.tsx
  MODIFY: src/components/layout/app-header.tsx (lines 84–88 only)

Use existing server actions and query keys. No DB migration.
No new server actions unless absolutely necessary.
Follow erp-child-dialog-form-standard.mdc and erp-workspace-save-close-standard.mdc rules.
```

---

## 25. Final Decision

```
DMS.0 BASELINE LOCKED — PROCEED TO DMS.1
```

---

*Audit completed: 2026-07-20 | Read-only inspection — no files modified, no SQL created, no migrations applied.*
