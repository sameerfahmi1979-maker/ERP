# ALGT ERP — HR Module Full Master Implementation Plan

**Document:** `implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.md`  
**Date:** 2026-06-18  
**Status:** PLANNING ONLY — No implementation performed  
**Company:** Alliance Gulf — UAE transport, logistics, scrap, waste, demolition, workshop  
**Context:** ADNOC/CICPA/Abu Dhabi operations, WPS, UAE Labour Law compliance

---

## Revision Notes — 2026-06-18 HR.0 Final Decision Confirmation

Sameer confirmed all remaining HR.0 prerequisite decisions required before generating the future HR.1 implementation prompt:

- Employee code: `EMP-{SEQ6}` → `EMP-000001`
- One employer company per employee in v1
- Leave reset default: joining anniversary, configurable
- WPS applicable by default with per-employee exemption option
- Probation configurable, default as per contract
- Expiry alert default: 60 days, configurable
- CICPA scope configurable by access card type/readiness rule
- EOS financial calculation deferred to Finance module
- Employee photo through DMS pipeline via `photo_dms_document_id`
- Salary certificates/NOC as PDF v1; DOCX deferred (not in existing export engine)
- Employee count: unlimited/scalable enterprise design
- HR AI priority: AI Search + AI Fill first in HR.12
- Leave approval default: HR Manager only, configurable
- Arabic name: strongly recommended, NOT DB `NOT NULL`

All open questions in §29 are now closed. HR.0 is ready to close. The next step is to generate a separate HR.1 implementation prompt. HR.1 must not start until Sameer explicitly approves that HR.1 prompt. No HR.1 implementation was performed in HR.0.

---

## Revision Notes — 2026-06-18 Employee Count Scalability Decision

Sameer confirmed employee count must be treated as **unlimited / scalable**. The HR module must be designed for enterprise-scale data volumes with server-side pagination, indexed search/filtering, batched exports, cached readiness summaries, and no client-side full-table loading. This decision closes open question Q11 and elevates scalability from a medium risk to a confirmed design constraint.

**Impact across all phases:** Every HR phase (HR.1–HR.13) that creates a table with employee FK must also add the required B-tree and GIN/trigram indexes in the same migration. No phase may defer indexing to a later phase.

---

## Revision Notes — 2026-06-18 HR.0 Readiness Audit Corrections

**Source:** HR.0 Readiness Audit (`implementation_Review/HR_Phases/Phase_HR_0/ERP_HR_0_READINESS_AUDIT_AND_FINAL_PLAN_CONFIRMATION_REPORT.md`)

**Corrections applied:**

1. **Employee code format** — The live numbering engine format tokens are `{DOC}, {SEQ}, {SEQ3}, {SEQ4}, {SEQ5}, {SEQ6}`. There is NO `{YYYY}` dynamic year token. The plan's default `EMP-YYYY-000001` cannot be produced by the existing engine. Recommended format updated to `EMP-{SEQ6}` → `EMP-000001`. Affected lines: §16.2 schema comment, §29 Q1, §30 numbering readiness item.

2. **DOCX letter export** — The live export engine supports CSV, Excel, PDF, Print only. There is NO DOCX/Word utility in `src/lib/export/`. The HR.11 Word/DOCX letter generation requirement must use PDF via `exportToPDF()` for v1, or implement a separate DOCX generation solution. Affected lines: §22 export format table, §25 HR.11 acceptance criteria.

---

## Revision Notes — 2026-06-18 Deep Review and Integration Strengthening

**Reviewed:** Live source code, migrations, SOT, DMS entity types, RLS helper functions, query-keys, RBAC patterns.

**Improvements applied:**
- SOT wording clarified and finalised: "Latest confirmed AI foundation state" block.
- Master Data Reuse Matrix updated: `approval_roles` added (confirmed in COMMON MD.1); table name uncertainty resolved against live schema.
- DMS entity types status confirmed from live `src/lib/dms/dms-entity-types.ts`: `employee` + `employee_compliance` are CONFIRMED registered.
- RLS helper functions: plan now uses the actual live DB function names (`current_user_has_permission()`, `current_user_has_permission_in_company()`, `current_user_owner_company_id()`, `current_user_has_role()`, `current_user_is_global_admin()`, `current_user_has_permission_any_scope()`).
- DB schema: recommended indexes added (§16.10) — pg_trgm confirmed in use by existing ERP.
- Every phase definition now explicitly states: goal, scope, DB migrations, server actions, UI, permissions/RLS, DMS, AI readiness, acceptance criteria, TS/build, implementation report, SOT update.
- New §31: Final Implementation Feasibility Review — plan strength ratings, remaining gaps, Cursor warnings, final go/no-go.
- Phase definitions strengthened with implementation report and SOT update requirements.

**Remaining gaps before HR.0:**
- Sameer must confirm employee code format (§29 Q1).
- Sameer must confirm leave balance reset policy (§29 Q3).
- Sameer must confirm leave approval level count (§29 Q13).
- ~~Sameer must confirm expected employee count for performance indexing decisions.~~ **CLOSED (HR.0): Employee count is unlimited / scalable. All HR lists, dashboards, search, reports, attendance, readiness, and exports must be server-side paginated/indexed. No client-side full-table loading. See §28 scalability risk.**

**Plan readiness:** READY for HR.0 Readiness Audit — pending Sameer approval.

---

## Revision Notes — 2026-06-18 Correction Update (v1)

- Corrected Source of Truth reference.
- Added System Master Data Reuse Matrix.
- Reinforced single Employee Profile / single Dashboard / single Search rules.
- Removed finance/costing scope from HR v1.
- Improved database schema plan for migration order, sensitive fields, UAE document fields, readiness context, and HR-DMS linking.
- Reordered phases to include Recruitment & Onboarding and separate Reports/Email/Export before HR AI.
- Added stronger RLS, permission, redaction, and UAT requirements.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current ERP Context and Assumptions](#2-current-erp-context-and-assumptions)
3. [Non-Negotiable Architecture Rules](#3-non-negotiable-architecture-rules)
4. [HR Product Principles](#4-hr-product-principles)
5. [Final HR Sidebar](#5-final-hr-sidebar)
6. [Employee Profile Workspace Design](#6-employee-profile-workspace-design)
7. [Employee Profile Tabs and Fields](#7-employee-profile-tabs-and-fields)
8. [HR Dashboard Design](#8-hr-dashboard-design)
9. [HR Search Design](#9-hr-search-design)
10. [Recruitment & Onboarding Design](#10-recruitment--onboarding-design)
11. [Attendance & Leave Design](#11-attendance--leave-design)
12. [Payroll & WPS Design](#12-payroll--wps-design)
13. [Assignments & Readiness Design](#13-assignments--readiness-design)
14. [End of Service Design](#14-end-of-service-design)
15. [HR Settings Design](#15-hr-settings-design)
16. [Database Schema Plan](#16-database-schema-plan)
17. [Relationship Map](#17-relationship-map)
18. [RLS and Permission Plan](#18-rls-and-permission-plan)
19. [DMS Integration Plan](#19-dms-integration-plan)
20. [AI Integration Plan](#20-ai-integration-plan)
21. [Email Integration Plan](#21-email-integration-plan)
22. [Export / Print / Report Plan](#22-export--print--report-plan)
23. [Audit Logging Plan](#23-audit-logging-plan)
24. [Sensitive Data and Redaction Plan](#24-sensitive-data-and-redaction-plan)
25. [Implementation Phases](#25-implementation-phases)
26. [Phase-by-Phase Acceptance Criteria](#26-phase-by-phase-acceptance-criteria)
27. [QA and UAT Strategy](#27-qa-and-uat-strategy)
28. [Risks, Dependencies, and Deferred Items](#28-risks-dependencies-and-deferred-items)
29. [Open Questions / Decisions Needed from Sameer](#29-open-questions--decisions-needed-from-sameer)
30. [Cursor Implementation Readiness Checklist](#30-cursor-implementation-readiness-checklist)
31. [Final Implementation Feasibility Review](#31-final-implementation-feasibility-review)

---

## 1. Executive Summary

The ALGT ERP HR Module is a complete, enterprise-grade Human Resources management system for Alliance Gulf's UAE transport, logistics, demolition, and workshop operations:

- **ADNOC site/plant access requirements** — CICPA passes, ATA training, ADSD, WMS/PTW, offshore medical
- **UAE Labour Law and MOHRE compliance** — WPS, Emirates ID, labour card, residence visa
- **Multi-site/multi-company operations** — company, branch, department, designation, work site
- **PRO (Public Relations Officer) process management** — visa/Emirates ID/labour card renewals
- **Readiness-driven HR** — employees cannot be assigned unless fully compliant

### Core Design Philosophy

1. **One Employee Profile** — the central workspace for all HR data
2. **One HR Dashboard** — aggregated monitoring view; drill-down opens Employee Profile at the relevant tab
3. **One HR Search** — unified search across all HR dimensions
4. **Compliance-first** — every compliance domain lives inside Employee Profile tabs, not separate modules
5. **AI-assisted, human-confirmed** — AI fills, suggests, and flags; humans review and approve every action
6. **DMS-backed documents** — all physical documents stored and linked via existing DMS
7. **Master data reuse** — HR never duplicates tables that already exist globally

### Phase Summary (HR.0 – HR.13)

| Phase | Name | Key Output |
|---|---|---|
| HR.0 | Readiness Audit | Final plan confirmation, live DB check, no implementation |
| HR.1 | HR Settings Foundation | All HR lookup/config tables, permissions |
| HR.2 | Employee Master + Profile Shell | `employees` table, list, Overview + Profile tabs |
| HR.3 | Compliance Inside Employee Profile | Legal docs, insurance, dependents, access, training, medical |
| HR.4 | Time Foundation | Attendance, shifts, leave, overtime |
| HR.5 | Payroll & WPS Readiness | Salary profiles, WPS fields, bank details |
| HR.6 | Operations & Readiness | Assignments, readiness engine, assets/PPE |
| HR.7 | HR Actions | PRO, notes, disciplinary, EOS readiness |
| HR.8 | Recruitment & Onboarding | Manpower requests, candidates, interviews, offers, new joiners |
| HR.9 | Single HR Dashboard | Monitoring only, drill-down to Employee Profile |
| HR.10 | Single HR Search | Deterministic + AI-ready search |
| HR.11 | Reports / Print / Export / Email | 15 core reports first |
| HR.12 | HR AI Integration | AI search, fill, correction, explanation, letters |
| HR.13 | Security / RLS / QA / UAT Closure | Final gate |

---

## 2. Current ERP Context and Assumptions

### 2.1 What Already Exists (Relevant to HR)

| Component | Status | Source | Notes |
|---|---|---|---|
| `owner_companies` table | ✅ LIVE | COMMON MD.1 | Extended with trade_name, compliance_status |
| `branches` table | ✅ LIVE | COMMON MD.1 | Extended with emirate_id, city_id |
| `departments` table | ✅ LIVE | COMMON MD.1 | HR reuses this — do not create `hr_departments` |
| `designations` table | ✅ LIVE | COMMON MD.1 | HR reuses this — do not create `hr_designations` |
| `work_sites` table | ✅ LIVE | COMMON MD.1 | HR reuses this — do not create `hr_sites` |
| `work_calendars` + `work_shifts` | ✅ LIVE | COMMON MD.1 | HR reuses these |
| `approval_roles` table | ✅ LIVE | COMMON MD.1 | HR reuses for approval workflow configuration |
| `dms_required_document_rules` | ✅ LIVE | COMMON MD.1 | 8 seeded rules; HR adds rules in HR.3 |
| `countries` table | ✅ LIVE | Base foundation | Global geography — nationality, issue country |
| `emirates` / `cities` / `areas` | ✅ LIVE | Base foundation | Global geography lookups |
| `banks` table | ✅ LIVE | Finance Basics | Employee WPS bank FK |
| DMS stack (DMS.1–DMS.15) | ✅ LIVE | DMS phases | OCR, AI, batch, semantic search |
| `DmsEntityDocumentsTab` | ✅ LIVE | DMS.15 | `@/features/dms/entity-documents` |
| DMS entity types `employee` + `employee_compliance` | ✅ CONFIRMED | `src/lib/dms/dms-entity-types.ts` lines 31–32 | Pre-registered. HR adds more in HR.3. |
| Common AI stack (AI.0–AI.7, AI.13–AI.15) | ✅ LIVE | AI phases | Complete for existing ERP scope |
| `logAudit()` | ✅ LIVE | `src/server/actions/audit.ts` | Standard audit helper |
| `getAuthContext()` + `hasPermission()` | ✅ LIVE | `src/lib/rbac/check.ts` | Standard RBAC |
| `generateNextReference()` | ✅ LIVE | `src/server/actions/numbering.ts` | Employee code generation |
| `ERPRecordWorkspaceForm` + `ERPChildDialogForm` + `ERPCombobox` | ✅ LIVE | ERP UI standards | All HR forms use these |
| `useWorkspaceFormDraft` | ✅ LIVE | ERP UI standards | Employee workspace form must use this |
| `queryKeys` + invalidation | ✅ LIVE | `src/lib/query/query-keys.ts` | HR adds keys under `queryKeys.hr.*` |
| `erp_email_queue` + `queueEmail()` | ✅ LIVE | NOTIFICATIONS.1 | `src/server/actions/notifications/email-queue.ts` |
| `erp_notification_templates` + `renderNotificationTemplate()` | ✅ LIVE | NOTIFICATIONS.1 | Template engine |
| `pg_trgm` GIN indexes | ✅ LIVE | Existing migrations | Used for fuzzy/FTS search — HR can add GIN indexes on name fields |
| DB RLS helper functions (8 confirmed) | ✅ LIVE | Base foundation migration | See §18.5 for exact names |

### 2.2 What Does NOT Exist Yet

- No `employees` table or any HR-specific tables
- No HR routes, sidebar items, server actions, or UI
- No HR permissions or HR AI feature flags
- No HR AI integration (deferred to HR.12)
- No `queryKeys.hr.*` namespace
- Additional HR DMS entity types beyond `employee` and `employee_compliance`

### 2.3 Latest Confirmed AI Foundation State

```text
Latest confirmed AI foundation state:
- ERP COMMON AI.15 — AI Data Quality Monitor is the last major closed Common AI phase.
- ERP COMMON AI FIX.1 — Critical AI Audit Fixes is the latest hotfix after Common AI.15 (confirmed in SOT).
- Common AI.1–AI.7 and AI.13–AI.15 are complete for the existing ERP scope.
- AI.8 HR AI remains deferred until the real HR module exists.
- AI.9–AI.12 (Fleet, Workshop, Procurement, Transport) are also deferred until those modules exist.
```

**Cursor must not implement or reference AI.8–AI.12 until the corresponding base module is confirmed implemented and Sameer explicitly approves the AI phase prompt.**

### 2.4 Existing Patterns HR Must Follow

```typescript
// Standard server action pattern — ALL HR server actions must use this
"use server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { revalidatePath } from "next/cache";

export async function createEmployee(input: unknown) {
  const ctx = await getAuthContext();
  if (!ctx.profile) return { error: "Not authenticated" };
  if (!hasPermission(ctx, "hr.employees.create")) return { error: "Insufficient permissions" };
  const validated = employeeSchema.parse(input);
  const admin = createAdminClient();
  const { data, error } = await admin.from("employees").insert(validated).select().single();
  if (error) return { error: error.message };
  await logAudit({
    module_code: "HR",
    entity_name: "employees",
    entity_id: data.id,
    entity_reference: data.employee_code,
    action: "create",
    new_values: { ...validated },
  });
  revalidatePath("/admin/hr/employees");
  return { data, error: null };
}
```

### 2.5 Master Data Reuse Matrix

**Non-negotiable rule:** The HR module must reuse existing system/common master data wherever available. Cursor must **never** create duplicate HR-specific tables for data that already exists globally.

**If a table name is uncertain, Cursor must inspect the live schema and use the existing table name instead of creating a duplicate HR-specific table.**

| Data / Function | Reuse Existing Source | Status | Do NOT Create |
|---|---|---|---|
| Owner company / employer / sponsor | `owner_companies` | ✅ CONFIRMED LIVE | ~~hr_companies~~ |
| Branch | `branches` | ✅ CONFIRMED LIVE | ~~hr_branches~~ |
| Departments | `departments` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_departments~~ |
| Designations | `designations` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_designations~~ |
| Work sites / locations | `work_sites` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_sites~~ |
| Work calendars | `work_calendars` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_calendars~~ |
| Work shifts | `work_shifts` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_shifts~~ |
| Approval roles / workflow roles | `approval_roles` | ✅ CONFIRMED LIVE (COMMON MD.1) | ~~hr_approval_roles~~ |
| Countries / Nationalities | `countries` | ✅ CONFIRMED LIVE | ~~hr_nationalities~~ |
| Emirates | `emirates` | ✅ CONFIRMED LIVE | ~~hr_emirates~~ |
| Cities | `cities` | ✅ CONFIRMED LIVE | ~~hr_cities~~ |
| Areas / zones | `area_zones` (inspect live schema) | Inspect before use | ~~hr_areas~~ |
| Banks | `banks` (Finance Basics) | ✅ CONFIRMED LIVE | ~~hr_banks~~ |
| DMS documents | DMS stack + `DmsEntityDocumentsTab` | ✅ CONFIRMED LIVE | ~~hr_documents_store~~ |
| DMS entity types | `dms-entity-types.ts` (add here) | ✅ CONFIRMED LIVE | — |
| DMS required document rules | `dms_required_document_rules` | ✅ CONFIRMED LIVE | ~~hr_document_rules~~ |
| Email queue | `erp_email_queue` via `queueEmail()` | ✅ CONFIRMED LIVE | ~~hr_email_queue~~ |
| Notification templates | `erp_notification_templates` | ✅ CONFIRMED LIVE | ~~hr_templates~~ |
| Audit logs | `audit_logs` via `logAudit()` | ✅ CONFIRMED LIVE | ~~hr_audit_logs~~ |
| RBAC | `getAuthContext()` + `hasPermission()` | ✅ CONFIRMED LIVE | ~~hr_permission_check~~ |
| DB RLS helpers | `current_user_has_permission()` etc. | ✅ CONFIRMED LIVE | ~~hr_rls_functions~~ |
| Permissions + role_permissions | Standard `permissions` + `role_permissions` tables | ✅ CONFIRMED LIVE | ~~hr_permissions~~ |
| Feature flags | `erp_ai_feature_flags` (HR AI flags added in HR.12) | ✅ CONFIRMED LIVE | ~~hr_feature_flags~~ |
| Query keys / invalidation | `queryKeys` (add `queryKeys.hr.*`) | ✅ CONFIRMED LIVE | ~~HRQueryHelpers~~ |
| Workspace form | `ERPRecordWorkspaceForm` | ✅ CONFIRMED LIVE | ~~HRRecordForm~~ |
| Child dialogs | `ERPChildDialogForm` | ✅ CONFIRMED LIVE | ~~HRChildDialog~~ |
| Async dropdowns | `ERPCombobox` | ✅ CONFIRMED LIVE | ~~HRDropdown~~ |
| Draft handling | `useWorkspaceFormDraft` | ✅ CONFIRMED LIVE | ~~HRDraftStore~~ |
| Numbering | `generateNextReference()` | ✅ CONFIRMED LIVE | ~~HRNumbering~~ |
| Export / print engine | Existing global engine | Inspect availability | — |
| AI provider bridge | Existing Common AI provider bridge | ✅ CONFIRMED LIVE | ~~hr_ai_provider~~ |
| Common AI modules (AI.1–AI.7, AI.13–AI.15) | Extend existing — no fork | ✅ CONFIRMED LIVE | ~~HRCommonAi~~ |

**If HR needs configuration not available globally, only then create HR-specific settings tables** (e.g. `hr_employee_categories`, `hr_training_types`, `hr_leave_types`).

---

## 3. Non-Negotiable Architecture Rules

| Rule | Requirement |
|---|---|
| Primary keys | BIGINT GENERATED ALWAYS AS IDENTITY — never UUID |
| RLS | ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY on every HR table |
| Server mutations | `getAuthContext()` → `hasPermission()` → Zod → `logAudit()` → `revalidatePath()` |
| Async dropdowns | `ERPCombobox` — never shadcn `<Select>` for async/database-sourced data |
| Main forms | `ERPRecordWorkspaceForm` + `useWorkspaceFormDraft` |
| Child forms | `ERPChildDialogForm` |
| Query keys | Under `queryKeys.hr.*` namespace |
| Bank details | Reference `banks.id` (Finance Basics) — never free-text bank names |
| Documents | Via DMS + `DmsEntityDocumentsTab` + `employee_document_links` — no custom HR file upload store |
| Email | Via `erp_email_queue` + `queueEmail()` — no direct SMTP, no HR-specific queue |
| AI | Via existing Common AI provider bridge — no direct OpenAI SDK imports in HR code |
| Sensitive field redaction | Server-side before client payload — never rely on client-side filtering alone |
| Draft denylist | Sensitive fields excluded from `useWorkspaceFormDraft` store |
| Audit child events | All child-record mutations include `parent_employee_id`, `employee_code`, `employee_name` in `metadata_json` |
| Employee lifecycle | Archived/soft-deleted — never hard-deleted. Use `hr.employees.archive`, not `hr.employees.delete` |
| Finance/costing out of scope | EOS gratuity calculation, payroll run, payslips, accounting posting — all deferred to Finance module |
| No auto-AI actions | No auto-save, auto-approve, auto-merge, auto-delete, auto-send from any AI |
| Master data reuse | Always reuse existing global tables (§2.5) — never create duplicate HR-specific tables |
| One phase at a time | Each phase implemented separately. Never skip phases. Each requires Sameer approval. |

---

## 4. HR Product Principles

### 4.1 One Employee Profile

**The Employee Profile is the central HR workspace.**

The main workflow:
```
HR Dashboard (alert) → Employees list → Employee Profile → Update inside tabs
```

**Do not create separate working modules for:**
- Compliance documents
- Medical insurance
- Dependents
- Access cards (CICPA, ADNOC)
- Training certificates
- Medical records
- PRO renewals for a single employee
- Employee documents

All of these are maintained inside Employee Profile tabs.

### 4.2 Compliance-Driven Operations

Employees cannot be deployed unless all legal documents, medical fitness, training/certifications, access cards, and medical insurance are valid, and no HR or disciplinary hold is active. The HR module surfaces these as a **Readiness Score** per employee.

### 4.3 UAE / ADNOC / CICPA Specifics

| Concept | Description |
|---|---|
| CICPA Pass | Capital Infrastructure & Contracting Partners Association — required for ADNOC sites |
| ADNOC ATA | ADNOC Approved Training |
| H2S | Hydrogen Sulphide awareness — mandatory for oil/gas sites |
| ADSD | Abu Dhabi Safety Driving — mandatory for vehicle operators on client sites |
| WMS/PTW | Work Method Statement / Permit to Work |
| WPS | Wage Protection System — UAE mandatory salary payment system |
| MOHRE | Ministry of Human Resources and Emiratisation |
| Emirates ID | UAE national identity card |
| PRO | Public Relations Officer — government document renewals |

### 4.4 Single HR Dashboard — Monitoring Only

**Rule: There is only ONE HR Dashboard** at `/admin/hr/dashboard`.

Monitoring and drill-down only. No editing from the dashboard. Every alert and row click opens the Employee Profile **at the relevant tab** and, where possible, highlights the child record.

| Dashboard Alert Example | Opens |
|---|---|
| Expired CICPA | Employee Profile → Compliance → Access Cards section |
| Missing IBAN | Employee Profile → Payroll & WPS tab |
| Pending visa PRO | Employee Profile → HR Actions → PRO Processes |
| H2S expired | Employee Profile → Compliance → Training section |
| Blocked employee | Employee Profile → Operations → Readiness section |

### 4.5 Single HR Search Engine

**Rule: There is only ONE HR Search engine** at `/admin/hr/search`.

It searches and filters across all HR data: employee profile, legal docs, medical insurance, dependents, access cards, training, medical records, attendance, leave, payroll/WPS readiness, assignments, PRO processes, DMS-linked documents, AI findings, audit metadata (where permitted).

No separate compliance search. No separate training search.

### 4.6 AI — Deeply Integrated, Human-Review First

AI is planned across all HR dimensions:
- AI search (natural language HR queries)
- AI fill from uploaded documents (Emirates ID, passport, visa, insurance, CICPA, certificates)
- AI correction suggestions
- AI compliance warnings
- AI readiness explanation (why is this employee blocked?)
- AI data quality checks
- AI duplicate employee detection
- AI HR letter/email drafts
- AI assistant actions

**Hard rules (no exceptions):**

| Forbidden | Rule |
|---|---|
| AI auto-save | Never |
| AI auto-approval | Never |
| AI auto-delete | Never |
| AI auto-merge | Never |
| AI auto-send email | Never |
| Raw OCR text in logs | Never |
| Raw AI prompt/response in logs | Never |
| Direct OpenAI imports in HR code | Never — use Common AI provider bridge only |

**HR AI (HR.12) is deferred until HR.2–HR.11 are implemented and stable.** But every phase from HR.2 onwards must be AI-ready.

### 4.7 Departments, Designations, Work Sites — Reuse Global Tables

`departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, and `approval_roles` already exist from COMMON MD.1. HR references these via FK. No new HR-specific tables for these concepts.

---

## 5. Final HR Sidebar

### 5.1 Sidebar Structure

```
HR
├── Dashboard              /admin/hr/dashboard
├── Employees              /admin/hr/employees
├── Recruitment            /admin/hr/recruitment
│   ├── Manpower Requests
│   ├── Job Openings
│   ├── Candidates
│   └── New Joiners
├── Attendance & Leave     /admin/hr/time
│   ├── Daily Attendance
│   ├── Leave Requests
│   └── Shift Calendar
├── Payroll & WPS          /admin/hr/payroll
│   ├── Salary Profiles
│   ├── WPS Readiness
│   └── Reports
├── Assignments            /admin/hr/assignments
│   ├── Site Readiness
│   └── Blocked Employees
├── End of Service         /admin/hr/eos
│   ├── Cases
│   └── Clearance
├── HR Search              /admin/hr/search
└── HR Settings            /admin/hr/settings
    ├── Employee Categories
    ├── Document Types
    ├── Training Types
    ├── Leave Types
    ├── Readiness Rules
    └── Approval Workflows
```

### 5.2 What Is NOT a Main Sidebar Item

The following are employee-specific and belong inside the Employee Profile tabs:

- Compliance & Documents
- Medical Insurance
- Dependents
- Access Cards / CICPA
- Training & Certifications
- Medical Records
- PRO Processes (per employee)
- HR Notes (per employee)

---

## 6. Employee Profile Workspace Design

### 6.1 Route Structure

```
/admin/hr/employees                         Employee list
/admin/hr/employees/record/new              New employee form
/admin/hr/employees/record/[id]             Employee Profile workspace
/admin/hr/employees/record/[id]?tab=overview
/admin/hr/employees/record/[id]?tab=profile
/admin/hr/employees/record/[id]?tab=compliance
/admin/hr/employees/record/[id]?tab=time
/admin/hr/employees/record/[id]?tab=payroll
/admin/hr/employees/record/[id]?tab=operations
/admin/hr/employees/record/[id]?tab=hractions
/admin/hr/employees/record/[id]?tab=documents
/admin/hr/employees/record/[id]?tab=ai
/admin/hr/employees/record/[id]?tab=audit
```

### 6.2 Employee List Screen

**Table columns:** Employee Code · Full Name (EN) · Nationality · Department · Designation · Status · Compliance Status · Readiness · Site · Joining Date · Actions

**Filter panel:** Company · Branch · Department · Designation · Category · Status · Nationality · Site · Employment Type · Expiry Alert · Readiness Status · HR Hold

**Actions:** Add Employee · Export (Excel/CSV/PDF) · Print · Filter · Search bar · AI Search toggle

> **Scalability rule (employee count is unlimited):** Employee list must use server-side pagination. Default page size: **50 employees per page**. No full employee table loading into client. All filter/sort operations must execute server-side via parameterised queries. The list server action must accept `page`, `pageSize`, and `filters` params and return a paginated result with total count.

### 6.3 Employee Profile Shell

**Component:** `EmployeeProfileWorkspaceForm` extending `ERPRecordWorkspaceForm`

**Header (always visible):**
```
[Photo] [Employee Code]  [Full Name EN / Arabic Name]
         [Status Badge]  [Compliance Badge]  [Readiness Badge]
         [Department] · [Designation] · [Branch] · [Site]
         [Joining Date] · [Service: X years] · [Mobile]
         [Edit] [Print] [Export] [Ask AI] [More ▾]
```

**10 main tabs:**
```
Overview | Profile | Compliance | Time | Payroll & WPS | Operations | HR Actions | Documents | AI Review | Audit
```

### 6.4 Lazy Loading

- **Overview + Profile** — load immediately on profile open
- **All other tabs** (Compliance, Time, Payroll & WPS, Operations, HR Actions, Documents, AI Review, Audit) — lazy-load only when the user opens that tab

### 6.5 Permission-Controlled Tabs

| Tab / Sub-section | Requires Permission | Behaviour Without |
|---|---|---|
| Payroll & WPS | `hr.payroll.view` | Salary figures masked; tab may be hidden |
| Medical Records sub-section | `hr.medical.view` | Sub-section entirely hidden |
| Disciplinary sub-section | `hr.actions.view` | Sub-section hidden; badge-only shown |
| AI Review | `hr.ai.review` | Tab hidden |
| Audit | — | Sensitive values masked; tab visible but redacted |

### 6.6 Dashboard / Search Drill-Down

Dashboard alerts and HR Search results must open the Employee Profile directly at the relevant tab, with the matching child record highlighted where possible.

---

## 7. Employee Profile Tabs and Fields

### 7.1 Overview Tab

**Purpose:** Read-only summary. No form editing on this tab.  
**Loads:** Immediately (not lazy).

#### Alert Panel (sticky top)

Badge count on tab label when alerts > 0.

| Alert Type | Source | Severity |
|---|---|---|
| Document expired | `employee_identity_documents` | CRITICAL |
| Document expiring ≤60d | `employee_identity_documents` | HIGH |
| Medical insurance expired/expiring | `employee_medical_insurances` | CRITICAL/HIGH |
| Dependent document expiring | `employee_dependents` | MEDIUM |
| CICPA / access card expired/expiring | `employee_access_cards` | CRITICAL/HIGH |
| Required training expired | `employee_training_certificates` | HIGH |
| Medical fitness expired | `employee_medical_records` | HIGH |
| Employee blocked | `employee_block_events` | CRITICAL |
| Payroll hold | `employee_payroll_holds` | HIGH |
| AI warning | Common AI findings | MEDIUM |
| Data quality issue | `erp_ai_data_quality_findings` | VARIES |
| Missing mandatory document | `dms_required_document_rules` | HIGH |
| HR hold / disciplinary | `employee_disciplinary_actions` | HIGH |

#### 4 Special Summary Cards

| Card | Content |
|---|---|
| **Next Critical Expiry** | Nearest upcoming expiry across all compliance records |
| **Renewal In Progress** | Count of active PRO processes + current stage |
| **Document Verification** | Verified / Total linked documents · missing required docs count |
| **AI / Data Quality** | Open AI suggestions count + data quality findings count |

#### 12 Status Cards

| Card | Source | Status Values |
|---|---|---|
| Legal Documents | `employee_identity_documents` | All Valid / Expiring / Expired / Incomplete |
| Medical Insurance | `employee_medical_insurances` | Active / Expiring / Expired / Not Covered |
| Dependents | `employee_dependents` | All OK / Issues Found / None |
| Access Cards | `employee_access_cards` | All Valid / Expiring / Expired / Missing |
| Training | `employee_training_certificates` | Complete / Expiring / Expired / Missing |
| Medical Fitness | `employee_medical_records` | Fit / Restricted / Expired / Missing |
| Attendance (This Month) | `employee_attendance_daily_summary` | Present/Absent counts |
| Leave Balance | `employee_leave_balances` | Days remaining by type |
| Payroll / WPS | `employee_payroll_profiles` + `employee_wps_profiles` | Ready / Hold / Missing |
| Assignment Readiness | `employee_readiness_status` | Ready / Partially / Blocked |
| AI Review | `erp_ai_field_suggestions` | Clean / Pending Suggestions |
| Documents | DMS link count + missing required | Complete / Incomplete |

#### Snapshot Panels (collapsible)

Compliance Snapshot · Assignment & Readiness · Legal / Contract / Probation · Medical Insurance & Dependents · Training & Site Access · Attendance & Leave · Payroll / WPS Snapshot · PRO Process Snapshot · Document Verification · Assets / PPE / Accommodation · HR Hold / Disciplinary · Emergency / HSE · AI Summary · Recent Activity Timeline (last 5 audit events from `audit_logs`)

#### Explicitly Excluded from Overview

- Employee cost analytics
- Salary payment history
- Finance posting
- Accounting summaries
- Gratuity amount

#### Quick Actions

```
[Edit Employee] [Upload Document] [Renew Document] [Add Dependent]
[Add Access Card] [Add Training] [Add Leave Request] [Update Assignment]
[Generate HR Letter ▾] [Ask AI] [AI Review] [Print Profile] [Export ▾]
```

---

### 7.2 Profile Tab

**Purpose:** Core personal and employment data. Main editable form.  
**Draft:** `useWorkspaceFormDraft({ formId: "employee-profile-tab" })`

#### Section A: Personal Information

| Field | Type | Required | Notes |
|---|---|---|---|
| Employee Code | Text (auto) | Yes | Auto-generated via `generateNextReference()` |
| Full Name (English) | Text | Yes | As per passport |
| Full Name (Arabic) | Text | Recommended | As per Emirates ID — required for UAE compliance output |
| Known Name / Short Name | Text | No | Display name |
| Gender | Select | Yes | Male / Female |
| Nationality | ERPCombobox → `countries` | Yes | `nationality_id → countries.id` |
| Date of Birth | Date | Yes | |
| Marital Status | Select | No | Single / Married / Divorced / Widowed |
| Mobile Number | Text | Yes | +971 format |
| Personal Email | Email | No | |
| UAE Residential Address | Text | No | |
| Home Country Address | Text | No | |
| Blood Group | Select | Recommended | A+ A- B+ B- O+ O- AB+ AB- — required by ADNOC/HSE |
| Photo | DMS link | No | `photo_dms_document_id → dms_documents.id` via DMS |
| Emergency Contact Name | Text | Yes | |
| Emergency Contact Mobile | Text | Yes | |
| Emergency Contact Relationship | Select | Yes | FK `hr_relationship_types` |

#### Section B: Employment Details

| Field | Type | Required | Notes |
|---|---|---|---|
| Employer Company | ERPCombobox → `owner_companies` | Yes | |
| Branch | ERPCombobox → `branches` | Yes | Filtered by company |
| Department | ERPCombobox → `departments` | Yes | Global table — COMMON MD.1 |
| Designation | ERPCombobox → `designations` | Yes | Global table — COMMON MD.1 |
| Employee Category | ERPCombobox → `hr_employee_categories` | Yes | HR-specific |
| Employment Type | ERPCombobox → `hr_employment_types` | Yes | HR-specific |
| Joining Date | Date | Yes | |
| Actual Joining Date | Date | No | May differ from official |
| Employee Status | Select | Yes | active/inactive/on_leave/probation/suspended/terminated/archived |
| Reporting Manager | ERPCombobox → `employees` | No | Self-referential FK |
| Direct Supervisor | ERPCombobox → `employees` | No | Self-referential FK |
| Work Location | ERPCombobox → `work_sites` | No | Global table — COMMON MD.1 |
| Sponsor Company | ERPCombobox → `owner_companies` | No | UAE — may differ from employer |
| MOHRE Establishment | ERPCombobox → `hr_mohre_establishments` | No | UAE compliance |
| Probation Start Date | Date | No | |
| Probation End Date | Date | No | Calculated from start + configurable days |
| Contract Type | Select | Yes | Limited / Unlimited |
| Contract Start Date | Date | Yes | |
| Contract End Date | Date | Conditional | Required if Limited |
| Notice Period (Days) | Number | No | |
| Inactive Date | Date | No | Auto-set on status change |
| Inactive Reason | Text | No | |

#### Section C: Hiring History (read-only after HR.8)

Populated from `employee_recruitment_links` — shows candidate origin, manpower request, offer letter. Read-only. Placeholder shown before HR.8 is implemented.

---

### 7.3 Compliance Tab

**Lazy-loaded.** 6 sub-sections.

#### A: Legal Documents (`employee_identity_documents`)

Required fields: Document Type · Document Number · Issue Date · Expiry Date (conditional) · Issuing Authority · Issue Country (`countries.id`) · Issuing Emirate (`emirates.id`) · Status · Verification Status · Renewal Status · DMS Document Link

Optional UAE-specific fields (use only when applicable to document type):
`emirates_id_application_no` · `visa_file_number` · `uid_number` · `labour_card_number` · `work_permit_number` · `mohre_person_code` · `profession_on_document` · `sponsor_company_id` · `place_of_issue`

Expiry colour coding: Green (≥60 days) · Amber (<60 days) · Red (expired)

#### B: Medical Insurance (`employee_medical_insurances`)

Required fields: Insurance Provider · Policy Number · Issue Date · Expiry Date · Employee Covered · Dependent Coverage · Status · Renewal Status · Verification Status · DMS Copy

Medical insurance is first-class: appears separately in alerts, dashboard KPIs, and the compliance snapshot. Both employee and dependent coverage are tracked.

#### C: Dependents (`employee_dependents`)

Required fields: Dependent Name (EN) · Relationship (`hr_relationship_types`) · Date of Birth · Nationality (`countries.id`) · Passport Number (**Sensitive**) · Passport Expiry · Emirates ID Number (conditional) · Residence Visa Number + Expiry · Medical Insurance details (policy, card, expiry) · Sponsored By · Active

Dependent document expiry alerts surface to the Overview tab and HR Dashboard.

#### D: Access Cards & Passes (`employee_access_cards`)

Required fields: Access Type (`hr_access_card_types`) · Client / Authority · Site (`work_sites.id`) · Card Number · Issue Date · Expiry Date · Status · Access Level · DMS Copy · Renewal Status

#### E: Training & Certifications (`employee_training_certificates`)

Required fields: Training Category (`hr_training_categories`) · Certificate Name (`hr_training_types`) · Provider · Certificate Number · Issue Date · Expiry Date · Validity (months) · Required for Designation · Required for Site · Status · DMS Copy · Verification Status · Renewal Status

#### F: Medical & Health Records (`employee_medical_records`)

**Permission-restricted:** Hidden unless `hr.medical.view`.

Required fields: Medical Record Type (`hr_medical_record_types`) · Medical Center · Examination Date · Result (Fit/Unfit/Conditionally Fit/Under Review) · Fit for Work · Work Restrictions · Restriction Details (**Sensitive** — only if restrictions = Yes) · Expiry / Next Due Date · DMS Medical Report (`dms_documents.id` — confidential) · Confidentiality Level

---

### 7.4 Time Tab

**Lazy-loaded.** 4 sub-sections.

#### A: Attendance

Read-only per-employee view of `employee_attendance_daily_summary`. Corrections link to source summary row. Data entered from global Attendance & Leave screen.

#### B: Shift & Calendar

`employee_shift_assignments` — links to `work_calendars.id` and `work_shifts.id` (global tables). Fields: Effective From · Effective To · Overtime Eligible · Attendance Required.

#### C: Leave Requests

`employee_leave_requests` per employee. Fields: Leave Type (`hr_leave_types`) · Dates · Total Days · Reason · Approval Status · Sick Certificate (DMS link) · Return Date.

Leave balance summary: Entitlement / Used / Balance per type per year.

#### D: Overtime

`employee_overtime_records` — date, hours, reason, approval status.

---

### 7.5 Payroll & WPS Tab

**Lazy-loaded. Salary figures masked or tab hidden if no `hr.payroll.view`.**

Sub-sections:
- **Salary Profile** — pay group, components, effective date, gross (calculated server-side from components)
- **Salary Components** — named allowances from `employee_salary_components`; NOT `other_allowances_json`
- **Salary Revision History** — append-only log `employee_salary_revisions`
- **WPS / Bank Details** — bank FK → `banks.id` (Finance Basics); IBAN always masked
- **Payroll Hold** — active hold flag + reason

**Explicitly excluded from this tab:**
- Payroll run
- Payslip generation
- Salary payment history
- Accounting posting
- Project costing
- EOS gratuity calculation

---

### 7.6 Operations Tab

**Lazy-loaded.**

Sub-sections:
- **Current Assignment** (`employee_assignments`) — site, client, start date, end date
- **Readiness Matrix** (`employee_readiness_status`) — context-aware (see §13)
- **Block Status** (`employee_block_events`) — if blocked: reason, date, requirements to unblock
- **Assets / PPE / Accommodation** (`employee_assets_facilities`) — camp, room, PPE issued, mobile, SIM

No hard FK to fleet or equipment tables — those modules do not exist yet. Text fields for asset description only until Fleet module exists.

---

### 7.7 HR Actions Tab

**Lazy-loaded.** 6 sub-sections.

- **PRO Processes** (`employee_pro_processes`) — type, status, stages, due date, responsible PRO officer
- **Performance Reviews** (`employee_performance_reviews`) — period, rating, reviewer, notes, DMS attachment
- **Disciplinary Actions** (`employee_disciplinary_actions`) — **hidden unless `hr.actions.view`**; type, severity, date, response, outcome, DMS attachment
- **HR Holds** — active hold badge visible to all; details hidden without `hr.actions.view`
- **Notes** (`employee_notes`) — HR officer notes per employee
- **Approvals** (`employee_approvals`) — pending/completed approvals linked to HR processes

EOS section is linked from here (when EOS case exists) and from `/admin/hr/eos/cases`.

---

### 7.8 Documents Tab

**Component:** `DmsEntityDocumentsTab` from `@/features/dms/entity-documents`

**Props:** `entityType="employee"` · `entityId={employee.id}` · `entityLabel={employee.full_name_en}` · permission-gated `canUpload`, `canLinkExisting`, `canUnlink`

For HR child-record document associations, `employee_document_links` stores the HR-specific `related_record_type` and `related_record_id` context alongside the DMS document reference.

Sensitive documents (medical, payroll) show only to users with corresponding permissions.

---

### 7.9 AI Review Tab

**Lazy-loaded. Hidden unless `hr.ai.review`.**

**HR.2–HR.11:** Placeholder card — "HR AI integration planned for HR.12. The system is AI-ready."

**HR.12+:**

| Section | AI Source | User Action |
|---|---|---|
| AI Fill Suggestions | Common AI.1 (HR entity registry) | Accept / Reject / Apply |
| AI Correction Suggestions | Common AI.1 | Accept / Reject |
| Missing Data Findings | Common AI.15 (HR rules) | Review / Dismiss |
| Duplicate Employee Warning | Common AI.3 | Review |
| Compliance Findings | Common AI.4 (HR rules) | Review |
| Risk Score | Common AI.5 | View explanation |
| Document Extraction Results | DMS AI.10/11 | Review → Apply to child record |
| AI Suggested Actions | Common AI.7 | Review |
| HR Letter / Email Drafts | AI.6 + email | Review → Edit → Confirm Send |
| Ask AI | Assistant | Chat |

**Rules:** No auto-save · no auto-apply · every suggestion shows source snippet (collapsed) · every draft email requires explicit Confirm before queuing.

---

### 7.10 Audit Tab

**Lazy-loaded.**

Sources: `audit_logs` filtered by employee entity + all child entities · AI suggestion events · DMS events for linked employee documents

**Columns:** Timestamp · User · Action · Entity · Field Changed · Old Value · New Value · Notes

**Masking:** Salary fields masked if no `hr.payroll.view` · Medical fields hidden if no `hr.medical.view` · IBAN always masked · Passport/EID partially masked · Disciplinary details hidden if no `hr.actions.view`

---

## 8. HR Dashboard Design

**Route:** `/admin/hr/dashboard` · **Permission:** `hr.dashboard.view`

**Rule:** Monitoring and drill-down only. No editing from dashboard.

> **Scalability rule (employee count is unlimited):** Dashboard must use aggregate SQL queries only. No full employee table loading. Use cached/materialized readiness summaries where needed. All drill-down lists must be paginated.

### 8.1 Filters (sticky)

Company · Branch · Department · Designation · Category · Employee Status · Nationality · Site · Client · Date Range

### 8.2 14 Dashboard Sections

| Section | Key Metrics | Drill-Down Opens |
|---|---|---|
| Employee Overview | Total, new joiners, on leave, probation | Employee list |
| Compliance & Expiry | Expiring <60d, expired, missing | Compliance tab |
| Medical Insurance | Active, expiring, expired, uncovered | Compliance tab |
| Dependents | Total, expiring docs | Compliance tab |
| Access Cards / CICPA | Active, expiring, expired, missing for site | Compliance tab |
| Training & Certifications | Valid, expiring, expired, missing required | Compliance tab |
| Medical Fitness | Fit, restricted, expired, due | Compliance tab (medical) |
| Attendance Today | Present, absent, on leave, not recorded | Time tab |
| Leave / Vacation | On leave today, pending approval, low balance | Time tab |
| Payroll / WPS Readiness | WPS enrolled, holds, missing IBAN | Payroll & WPS tab |
| Assignments / Site Readiness | ADNOC-ready, blocked, available | Operations tab |
| PRO Renewals | Open, due this week, overdue | HR Actions tab |
| HR Holds / Disciplinary | Active holds, open cases | HR Actions tab |
| AI / Data Quality | Open suggestions, quality findings | AI Review tab |

---

## 9. HR Search Design

**Route:** `/admin/hr/search` · **Permission:** `hr.search.use`

> **Scalability rule (employee count is unlimited):** All search and filter operations must execute server-side. Results must be paginated (default 50/page). AI search must return scoped/paginated results and must never bypass permissions or load all employees. No client-side full dataset filtering.

### 9.1 Search Modes

| Mode | Engine | Notes |
|---|---|---|
| Keyword / FTS | PostgreSQL FTS + pg_trgm | Available from HR.10 |
| Advanced Filter | Multi-dimensional filter panel | Available from HR.10 |
| AI Natural Language | Common AI.6 extended for HR | Available from HR.12 (HR AI.4) |

### 9.2 Searchable Dimensions

Employee master profile · Legal documents (EID, passport, visa, labour card) · Medical insurance · Dependents · Access cards (CICPA, ADNOC, client) · Training certificates (H2S, ADSD, etc.) · Medical fitness records · Attendance and leave · Payroll/WPS readiness · Assignments and readiness · PRO processes · DMS-linked HR documents · AI findings and suggestions · Audit metadata (where permitted)

### 9.3 AI Natural Language Examples

| Query | Mapped HR Logic |
|---|---|
| "Drivers with CICPA expiring in 30 days" | category=driver + access_cards expiring ≤30d + type=CICPA |
| "Employees ready for ADNOC Ruwais" | readiness ADNOC=true + site=Ruwais |
| "Missing medical insurance" | insurance active = false |
| "Operators with expired ADSD" | category=operator + training ADSD expired |
| "Dependent visa expiring this month" | dependent residence_visa_expiry in current month |

---

## 10. Recruitment & Onboarding Design

**Route group:** `/admin/hr/recruitment/` · **Phase:** HR.8

### 10.1 Screens

| Screen | Route | Table |
|---|---|---|
| Manpower Requests | .../manpower-requests | `hr_manpower_requests` |
| Job Openings | .../job-openings | `hr_job_openings` |
| Candidates | .../candidates | `hr_candidates` |
| Interviews | .../interviews | `hr_candidate_interviews` |
| Offer Letters | .../offers | `hr_offer_letters` |
| New Joiners | .../new-joiners | `hr_candidates` filtered (offer accepted + awaiting conversion) |
| Onboarding Checklist | Per-employee inside Profile | `hr_onboarding_checklists` + `hr_onboarding_tasks` |

### 10.2 Employee–Recruitment Linkage

`hr_candidate_id` is NOT added to `employees` in HR.2 because `hr_candidates` does not exist yet.

In HR.8, create `employee_recruitment_links`:

```sql
CREATE TABLE employee_recruitment_links (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  candidate_id          BIGINT REFERENCES hr_candidates(id),
  manpower_request_id   BIGINT REFERENCES hr_manpower_requests(id),
  offer_letter_id       BIGINT REFERENCES hr_offer_letters(id),
  linked_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by             BIGINT REFERENCES user_profiles(id)
);
```

"Convert to Employee" creates both the `employees` row and the `employee_recruitment_links` row in one transaction.

---

## 11. Attendance & Leave Design

**Route group:** `/admin/hr/time/`

### 11.1 Two-Table Attendance Approach

**Why not `UNIQUE(employee_id, attendance_date)` on raw punches:** Split shifts, corrections, and multiple biometric punches would violate this constraint.

**Recommended v1 pattern:**

| Table | Purpose | Unique Constraint |
|---|---|---|
| `employee_attendance_punches` | Raw biometric/manual/import punches | None per day |
| `employee_attendance_daily_summary` | Approved daily attendance | `UNIQUE(employee_id, attendance_date)` |
| `employee_attendance_corrections` | Correction audit (append-only) | None |

Daily summary is created/updated from punches either manually or via a simple summarisation server action.

### 11.2 Leave Approval

1. HR / employee submits request → `approval_status = pending`
2. If `hr_approval_workflows` configured: supervisor approval → HR Manager approval
3. Approved → leave balance deducted from `employee_leave_balances`
4. Sick leave requires DMS sick certificate attachment

---

## 12. Payroll & WPS Design

**Route group:** `/admin/hr/payroll/`

### 12.1 Scope (HR Readiness Only)

| Included in HR | Deferred to Finance |
|---|---|
| `employee_payroll_profiles` | Payroll run |
| `employee_salary_components` (named, not JSON) | Payslip generation |
| `employee_salary_revisions` (append-only) | Salary payment history |
| `employee_payroll_holds` | Accounting posting |
| `employee_wps_profiles` (bank FK to `banks.id`) | Project/employee costing |
| WPS SIF export | EOS gratuity calculation |

Gross salary is calculated server-side from sum of `employee_salary_components` — not a manually edited field.

### 12.2 WPS SIF Export

Validates: IBAN/exchange house present · labour card number · gross salary ≥ minimum wage · no salary hold.

Export format: CSV per Central Bank of UAE WPS specification. Permission: `hr.payroll.manage`. IBAN and account number masked in any non-SIF payroll views.

---

## 13. Assignments & Readiness Design

**Route group:** `/admin/hr/assignments/`

### 13.1 Readiness Engine

Deterministic TypeScript engine — no AI required for base calculation:

1. Load `hr_readiness_rule_templates` for employee's designation + context
2. Evaluate each rule against employee compliance records
3. Store result per context type in `employee_readiness_status`
4. Set `overall_readiness_score` (0–100) and `is_blocked` flag

### 13.2 Readiness Context Types

| `readiness_context_type` | Meaning | FK Fields |
|---|---|---|
| `general` | Employment readiness (legal docs, insurance) | — |
| `site` | Readiness for a specific work site | `work_site_id` |
| `client` | Readiness for a specific client/project | text `client_code` |
| `role` | Readiness for a specific designation | `designation_id` |
| `assignment` | Readiness for a specific assignment | `assignment_id` |

### 13.3 Readiness Dimensions

| Dimension | Passes If |
|---|---|
| `legal_ready` | EID + Passport + Visa + Labour Card all active, not expiring within threshold |
| `medical_ready` | Required medical fitness records valid for designation/site |
| `training_ready` | All required training for designation/site valid |
| `cicpa_ready` | Active CICPA pass |
| `adnoc_ready` | CICPA + H2S + ADNOC ATA + Medical + Visa all valid |
| `offshore_ready` | Offshore medical + H2S + confined space + visa + passport valid |
| `driver_ready` | Driving license + ADSD + medical + EID + visa valid |
| `insurance_ready` | Active medical insurance coverage |
| `is_blocked` | True if any active HR hold or disciplinary suspension |

---

## 14. End of Service Design

**Route group:** `/admin/hr/eos/`

### 14.1 Scope

HR manages the EOS **process and clearance** — no financial calculation.

**Included:** EOS case (resignation/termination/contract end/retirement/death) · Clearance checklist (asset return, IT, accommodation, visa cancellation, labour cancellation, insurance cancellation, CICPA cancellation, exit interview) · Employee archive (status=archived)

**Deferred to Finance module:** Gratuity amount · Final settlement figures · Accounting entries

---

## 15. HR Settings Design

**Route group:** `/admin/hr/settings/`

| Table | Seeds | Notes |
|---|---|---|
| `hr_employee_categories` | DRIVER, OPERATOR, TECHNICIAN, SUPERVISOR, ADMIN, ENGINEER, LABORER, HSE, SECURITY | |
| `hr_employment_types` | FULL_TIME, PART_TIME, CONTRACT, SECONDMENT, TEMPORARY | |
| `hr_grades` | A1-A5, B1-B5 (configurable) | |
| `hr_identity_document_types` | EMIRATES_ID, PASSPORT, RESIDENCE_VISA, LABOUR_CARD, WORK_PERMIT, EMPLOYMENT_CONTRACT, HEALTH_CARD | |
| `hr_access_card_types` | CICPA, ADNOC_PLANT, CLIENT_SITE, PORT, OFFSHORE, PROJECT_GATE | |
| `hr_training_categories` | SAFETY, HSE, OPERATOR, DRIVING, ENVIRONMENTAL, SITE_SPECIFIC | |
| `hr_training_types` | H2S, ADSD, WMS_PTW, ADNOC_ATA, CICPA_INDUCTION, OFFSHORE, RIGGER, SCAFFOLDING, FIRST_AID, FIRE_WATCH, CONFINED_SPACE, FORKLIFT, CRANE, DEFENSIVE_DRIVING, WASTE_ENV + more | 20+ |
| `hr_medical_record_types` | VISA_MEDICAL, PRE_EMPLOYMENT, PERIODIC, OFFSHORE, DRIVER, SICK_LEAVE, RESTRICTION, RETURN_TO_WORK, INCIDENT | |
| `hr_leave_types` | ANNUAL, SICK, EMERGENCY, MATERNITY, PATERNITY, UNPAID, HAJJ, COMPASSIONATE | |
| `hr_relationship_types` | SPOUSE, CHILD, PARENT, SIBLING, OTHER | |
| `hr_salary_component_types` | BASIC, HOUSING_ALLOWANCE, TRANSPORT_ALLOWANCE, FOOD_ALLOWANCE, OVERTIME, OTHER | |
| `hr_payroll_groups` | MONTHLY, WEEKLY | |
| `hr_mohre_establishments` | Managed by HR Admin | Per owner_company |
| `hr_pro_process_types` | VISA_RENEWAL, EID_RENEWAL, LABOUR_CARD, MEDICAL_FITNESS, INSURANCE_RENEWAL, CICPA_APPLICATION, PLANT_CARD, TRAINING_RENEWAL | |
| `hr_readiness_rule_templates` | Seeded by designation + context | |
| `hr_role_requirement_matrix` | What each designation requires | |
| `hr_site_requirement_matrix` | What each site requires | |
| `hr_approval_workflows` | HR-specific approval chains | References `approval_roles` (COMMON MD.1) |

---

## 16. Database Schema Plan

### 16.1 Core Table: `employees`

```sql
CREATE TABLE employees (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code             TEXT NOT NULL UNIQUE,               -- EMP-000001 via generateNextReference() (rule_code='EMP', format='{DOC}-{SEQ6}'); {YYYY} token NOT supported by numbering engine

  -- Personal
  full_name_en              TEXT NOT NULL,
  full_name_ar              TEXT,                               -- strongly recommended; required for UAE compliance
  known_name                TEXT,
  gender                    TEXT NOT NULL CHECK (gender IN ('male','female')),
  nationality_id            BIGINT REFERENCES countries(id),   -- global countries table
  date_of_birth             DATE NOT NULL,
  marital_status            TEXT CHECK (marital_status IN ('single','married','divorced','widowed')),
  mobile_number             TEXT NOT NULL,
  personal_email            TEXT,
  uae_address               TEXT,
  home_country_address      TEXT,
  blood_group               TEXT CHECK (blood_group IN ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  photo_dms_document_id     BIGINT REFERENCES dms_documents(id),

  -- Employment — all FKs reference EXISTING global tables
  owner_company_id          BIGINT NOT NULL REFERENCES owner_companies(id),
  branch_id                 BIGINT REFERENCES branches(id),
  department_id             BIGINT REFERENCES departments(id),         -- COMMON MD.1
  designation_id            BIGINT REFERENCES designations(id),        -- COMMON MD.1
  employee_category_id      BIGINT REFERENCES hr_employee_categories(id),
  employment_type_id        BIGINT REFERENCES hr_employment_types(id),
  joining_date              DATE NOT NULL,
  actual_joining_date       DATE,
  employee_status           TEXT NOT NULL DEFAULT 'active'
                            CHECK (employee_status IN ('active','inactive','on_leave','probation',
                                                       'suspended','terminated','archived')),
  reporting_manager_id      BIGINT REFERENCES employees(id),
  supervisor_id             BIGINT REFERENCES employees(id),
  primary_work_site_id      BIGINT REFERENCES work_sites(id),          -- COMMON MD.1
  sponsor_company_id        BIGINT REFERENCES owner_companies(id),
  mohre_establishment_id    BIGINT REFERENCES hr_mohre_establishments(id),

  -- Contract
  probation_start_date      DATE,
  probation_end_date        DATE,
  contract_type             TEXT CHECK (contract_type IN ('limited','unlimited')),
  contract_start_date       DATE,
  contract_end_date         DATE,
  notice_period_days        INT,

  -- Status
  inactive_date             DATE,
  inactive_reason           TEXT,

  -- Emergency
  emergency_contact_name    TEXT NOT NULL,
  emergency_contact_mobile  TEXT NOT NULL,
  emergency_contact_relationship TEXT,

  -- NOTE: No hr_candidate_id. Use employee_recruitment_links (created in HR.8).

  -- Soft delete
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);
-- ENABLE ROW LEVEL SECURITY;
-- FORCE ROW LEVEL SECURITY;
```

### 16.2 `employee_status_events` (append-only)

```sql
CREATE TABLE employee_status_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  old_status          TEXT,
  new_status          TEXT NOT NULL,
  reason              TEXT,
  effective_date      DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id)
  -- SELECT + INSERT policies only. No UPDATE, no DELETE.
);
```

### 16.3 `employee_document_links` (DMS many-to-many)

```sql
CREATE TABLE employee_document_links (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  dms_document_id       BIGINT NOT NULL REFERENCES dms_documents(id),
  related_record_type   TEXT,    -- 'employee_identity_document' | 'employee_dependent' | etc.
  related_record_id     BIGINT,  -- ID in the child table
  relation_purpose      TEXT,    -- 'passport_copy' | 'training_certificate' | 'medical_report'
  verification_status   TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (verification_status IN ('unverified','verified','failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id),
  UNIQUE (employee_id, dms_document_id)
);
```

### 16.4 Compliance Tables

All compliance tables use soft-delete standard: `created_at, updated_at, created_by, updated_by, deleted_at, deleted_by`.

```sql
-- A: Legal documents with UAE-specific optional fields
CREATE TABLE employee_identity_documents (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type_id          BIGINT NOT NULL REFERENCES hr_identity_document_types(id),
  document_number           TEXT NOT NULL,
  issue_date                DATE NOT NULL,
  expiry_date               DATE,
  issuing_authority         TEXT,
  issue_country_id          BIGINT REFERENCES countries(id),      -- global countries
  issuing_emirate_id        BIGINT REFERENCES emirates(id),       -- global emirates
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expired','cancelled','pending')),
  verification_status       TEXT NOT NULL DEFAULT 'unverified'
                            CHECK (verification_status IN ('unverified','verified','failed')),
  verified_by               BIGINT REFERENCES user_profiles(id),
  verified_at               TIMESTAMPTZ,
  dms_document_id           BIGINT REFERENCES dms_documents(id),
  renewal_status            TEXT NOT NULL DEFAULT 'not_required'
                            CHECK (renewal_status IN ('not_required','pending','in_progress','complete')),
  -- UAE-specific optional fields (NULL when not applicable)
  emirates_id_application_no TEXT,
  visa_file_number           TEXT,
  uid_number                 TEXT,
  labour_card_number         TEXT,
  work_permit_number         TEXT,
  mohre_person_code          TEXT,
  profession_on_document     TEXT,
  sponsor_company_id         BIGINT REFERENCES owner_companies(id),
  place_of_issue             TEXT,
  notes                     TEXT,
  -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- B: Medical insurance (first-class — tracked for both employee and dependents)
CREATE TABLE employee_medical_insurances (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  insurance_provider TEXT NOT NULL, tpa TEXT, policy_number TEXT NOT NULL,
  insurance_card_number TEXT, network_class TEXT,
  issue_date DATE NOT NULL, expiry_date DATE NOT NULL,
  employee_covered BOOLEAN NOT NULL DEFAULT TRUE,
  dependent_coverage_included BOOLEAN NOT NULL DEFAULT FALSE,
  dependent_count_covered INT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','pending')),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  renewal_status TEXT NOT NULL DEFAULT 'pending',
  dms_document_id BIGINT REFERENCES dms_documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- C: Dependents
CREATE TABLE employee_dependents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  dependent_name_en TEXT NOT NULL, dependent_name_ar TEXT,
  relationship_type_id BIGINT NOT NULL REFERENCES hr_relationship_types(id),
  date_of_birth DATE NOT NULL,
  nationality_id BIGINT REFERENCES countries(id),  -- global countries
  passport_number TEXT NOT NULL,   -- SENSITIVE
  passport_expiry DATE NOT NULL,
  emirates_id_number TEXT,         -- SENSITIVE
  emirates_id_expiry DATE,
  residence_visa_number TEXT, residence_visa_expiry DATE,
  medical_insurance_provider TEXT, medical_insurance_policy TEXT,
  medical_insurance_card TEXT, medical_insurance_expiry DATE,
  sponsored_by TEXT CHECK (sponsored_by IN ('employee','company')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- D: Access cards
CREATE TABLE employee_access_cards (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  access_type_id BIGINT NOT NULL REFERENCES hr_access_card_types(id),
  client_authority TEXT NOT NULL, work_site_id BIGINT REFERENCES work_sites(id),
  card_number TEXT, application_reference TEXT,
  issue_date DATE, expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('active','expired','cancelled','suspended','pending','in_application')),
  access_level TEXT, renewal_status TEXT NOT NULL DEFAULT 'not_required',
  dms_document_id BIGINT REFERENCES dms_documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- E: Training certificates
CREATE TABLE employee_training_certificates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  training_category_id BIGINT NOT NULL REFERENCES hr_training_categories(id),
  training_type_id BIGINT NOT NULL REFERENCES hr_training_types(id),
  provider TEXT, approval_body TEXT, certificate_number TEXT,
  issue_date DATE NOT NULL, expiry_date DATE, validity_months INT,
  required_for_designation BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_site BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expired','pending','in_progress')),
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  renewal_status TEXT NOT NULL DEFAULT 'not_required',
  dms_document_id BIGINT REFERENCES dms_documents(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- F: Medical records — confidential
CREATE TABLE employee_medical_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  medical_record_type_id BIGINT NOT NULL REFERENCES hr_medical_record_types(id),
  medical_center TEXT NOT NULL, report_number TEXT,
  examination_date DATE NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('fit','unfit','conditionally_fit','under_review')),
  fit_for_work BOOLEAN NOT NULL,
  work_restrictions BOOLEAN NOT NULL DEFAULT FALSE,
  restriction_details TEXT,      -- SENSITIVE
  expiry_date DATE,
  required_for_visa BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_site BOOLEAN NOT NULL DEFAULT FALSE,
  required_for_offshore BOOLEAN NOT NULL DEFAULT FALSE,
  dms_document_id BIGINT REFERENCES dms_documents(id),  -- confidential document
  confidentiality_level TEXT NOT NULL DEFAULT 'restricted'
    CHECK (confidentiality_level IN ('internal','restricted','medical_only')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);
```

### 16.5 Time Tables

```sql
-- Raw punches — no daily unique constraint
CREATE TABLE employee_attendance_punches (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  punch_datetime  TIMESTAMPTZ NOT NULL,
  punch_type      TEXT NOT NULL CHECK (punch_type IN ('in','out','break_start','break_end')),
  work_site_id    BIGINT REFERENCES work_sites(id),
  punch_source    TEXT CHECK (punch_source IN ('biometric','mobile','manual','import')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      BIGINT REFERENCES user_profiles(id)
);

-- Approved daily summary — unique per employee per date
CREATE TABLE employee_attendance_daily_summary (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  attendance_date     DATE NOT NULL,
  attendance_type     TEXT NOT NULL
    CHECK (attendance_type IN ('site','office','yard','workshop','remote','on_leave','absent','holiday')),
  work_site_id        BIGINT REFERENCES work_sites(id),
  total_hours         NUMERIC(5,2),
  overtime_hours      NUMERIC(5,2) DEFAULT 0,
  late_minutes        INT DEFAULT 0,
  early_out_minutes   INT DEFAULT 0,
  is_missing_punch    BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','queried')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id),
  updated_by          BIGINT REFERENCES user_profiles(id),
  UNIQUE (employee_id, attendance_date)
);

-- Attendance corrections (append-only)
CREATE TABLE employee_attendance_corrections (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_id      BIGINT NOT NULL REFERENCES employee_attendance_daily_summary(id),
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  correction_reason TEXT NOT NULL,
  corrected_by    BIGINT NOT NULL REFERENCES user_profiles(id),
  old_values_json JSONB,
  new_values_json JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- SELECT + INSERT only — no UPDATE, no DELETE
);

-- Shift assignments (calendar + shift from COMMON MD.1)
CREATE TABLE employee_shift_assignments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  work_calendar_id      BIGINT REFERENCES work_calendars(id),   -- COMMON MD.1
  work_shift_id         BIGINT REFERENCES work_shifts(id),      -- COMMON MD.1
  weekly_off_day        TEXT,
  overtime_eligible     BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_required   BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from        DATE NOT NULL,
  effective_to          DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id)
);

-- Leave requests
CREATE TABLE employee_leave_requests (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  leave_type_id   BIGINT NOT NULL REFERENCES hr_leave_types(id),
  request_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      NUMERIC(5,1),       -- calculated server-side
  reason          TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  approved_by     BIGINT REFERENCES user_profiles(id),
  approved_at     TIMESTAMPTZ,
  sick_cert_dms_id BIGINT REFERENCES dms_documents(id),
  return_date     DATE,
  notes           TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Leave balances
CREATE TABLE employee_leave_balances (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  leave_type_id   BIGINT NOT NULL REFERENCES hr_leave_types(id),
  leave_year      INT NOT NULL,
  entitled_days   NUMERIC(5,1) NOT NULL DEFAULT 0,
  used_days       NUMERIC(5,1) NOT NULL DEFAULT 0,
  balance_days    NUMERIC(5,1) GENERATED ALWAYS AS (entitled_days - used_days) STORED,
  carry_forward   NUMERIC(5,1) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, leave_type_id, leave_year)
);

-- Overtime records
CREATE TABLE employee_overtime_records (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  overtime_date   DATE NOT NULL,
  hours           NUMERIC(4,1) NOT NULL,
  reason          TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_by     BIGINT REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_by BIGINT REFERENCES user_profiles(id)
);
```

### 16.6 Payroll / WPS Tables

```sql
-- Payroll profile
CREATE TABLE employee_payroll_profiles (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id) UNIQUE,
  payroll_group_id    BIGINT REFERENCES hr_payroll_groups(id),
  effective_date      DATE NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'AED',
  notes               TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id)
);

-- Named salary components (NOT JSON)
CREATE TABLE employee_salary_components (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  component_type_id   BIGINT NOT NULL REFERENCES hr_salary_component_types(id),
  amount              NUMERIC(12,2) NOT NULL,      -- SENSITIVE
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Salary revision history (append-only)
CREATE TABLE employee_salary_revisions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  effective_date      DATE NOT NULL,
  revision_reason     TEXT,
  old_gross           NUMERIC(12,2),   -- SENSITIVE
  new_gross           NUMERIC(12,2),   -- SENSITIVE
  approved_by         BIGINT REFERENCES user_profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          BIGINT REFERENCES user_profiles(id)
  -- SELECT + INSERT only
);

-- Payroll holds
CREATE TABLE employee_payroll_holds (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  hold_reason     TEXT NOT NULL,
  hold_date       DATE NOT NULL,
  release_date    DATE,
  released_by     BIGINT REFERENCES user_profiles(id),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id)
);

-- WPS profile (bank FK → Finance Basics banks table)
CREATE TABLE employee_wps_profiles (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id             BIGINT NOT NULL REFERENCES employees(id) UNIQUE,
  wps_applicable          BOOLEAN NOT NULL DEFAULT TRUE,
  wps_status              TEXT NOT NULL DEFAULT 'active'
    CHECK (wps_status IN ('active','hold','exempt','not_enrolled')),
  bank_id                 BIGINT REFERENCES banks(id),    -- Finance Basics banks
  account_holder_name     TEXT,
  account_number          TEXT,                            -- SENSITIVE — stored encrypted or masked
  iban                    TEXT,                            -- SENSITIVE — always masked in UI
  exchange_house          TEXT,
  salary_payment_method   TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (salary_payment_method IN ('bank_transfer','exchange_house','cheque')),
  labour_card_number      TEXT,
  mohre_person_code       TEXT,
  mohre_establishment_id  BIGINT REFERENCES hr_mohre_establishments(id),
  salary_effective_date   DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id)
);
```

### 16.7 Operations Tables

```sql
-- Employee assignments
CREATE TABLE employee_assignments (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  work_site_id        BIGINT REFERENCES work_sites(id),       -- COMMON MD.1
  client_code         TEXT,
  project_name        TEXT,
  start_date          DATE NOT NULL,
  end_date            DATE,
  assignment_status   TEXT NOT NULL DEFAULT 'active'
    CHECK (assignment_status IN ('active','completed','cancelled')),
  notes               TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Context-aware readiness status
CREATE TABLE employee_readiness_status (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id),
  readiness_context_type    TEXT NOT NULL DEFAULT 'general'
    CHECK (readiness_context_type IN ('general','site','client','role','assignment')),
  work_site_id              BIGINT REFERENCES work_sites(id),    -- nullable
  designation_id            BIGINT REFERENCES designations(id),  -- nullable (COMMON MD.1)
  assignment_id             BIGINT,                               -- nullable FK added in HR.6
  client_code               TEXT,
  -- Dimensions
  legal_ready               BOOLEAN NOT NULL DEFAULT FALSE,
  medical_ready             BOOLEAN NOT NULL DEFAULT FALSE,
  training_ready            BOOLEAN NOT NULL DEFAULT FALSE,
  cicpa_ready               BOOLEAN NOT NULL DEFAULT FALSE,
  adnoc_ready               BOOLEAN NOT NULL DEFAULT FALSE,
  offshore_ready            BOOLEAN NOT NULL DEFAULT FALSE,
  driver_ready              BOOLEAN NOT NULL DEFAULT FALSE,
  insurance_ready           BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked                BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason              TEXT,
  overall_readiness_score   INT NOT NULL DEFAULT 0 CHECK (overall_readiness_score BETWEEN 0 AND 100),
  unblock_requirements      JSONB,
  last_calculated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, readiness_context_type, work_site_id, designation_id)
);

-- Block events (append-only)
CREATE TABLE employee_block_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  event_type      TEXT NOT NULL CHECK (event_type IN ('blocked','unblocked')),
  reason          TEXT NOT NULL,
  effective_date  DATE NOT NULL,
  created_by      BIGINT REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- SELECT + INSERT only
);

-- Assets and facilities
CREATE TABLE employee_assets_facilities (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  camp_name       TEXT,
  room_number     TEXT,
  company_mobile  TEXT,
  sim_number      TEXT,
  ppe_items_json  JSONB,    -- list of PPE items issued
  notes           TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id)
);
```

### 16.8 HR Actions Tables

```sql
-- PRO processes
CREATE TABLE employee_pro_processes (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  pro_type_id         BIGINT NOT NULL REFERENCES hr_pro_process_types(id),
  reference_number    TEXT,
  responsible_user_id BIGINT REFERENCES user_profiles(id),
  status              TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','awaiting_govt','complete','cancelled')),
  start_date          DATE NOT NULL,
  expected_completion DATE,
  completed_date      DATE,
  notes               TEXT,
  dms_document_id     BIGINT REFERENCES dms_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Performance reviews
CREATE TABLE employee_performance_reviews (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  review_period   TEXT NOT NULL,
  review_date     DATE NOT NULL,
  reviewer_id     BIGINT REFERENCES user_profiles(id),
  rating          TEXT,
  strengths       TEXT,
  areas_of_improvement TEXT,
  notes           TEXT,
  dms_document_id BIGINT REFERENCES dms_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Disciplinary actions — CONFIDENTIAL
CREATE TABLE employee_disciplinary_actions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL REFERENCES employees(id),
  action_type     TEXT NOT NULL
    CHECK (action_type IN ('verbal_warning','written_warning','final_warning','suspension','termination','other')),
  action_date     DATE NOT NULL,
  reason          TEXT NOT NULL,   -- SENSITIVE
  details         TEXT,            -- SENSITIVE
  response_date   DATE,
  employee_response TEXT,          -- SENSITIVE
  outcome         TEXT,
  hr_hold         BOOLEAN NOT NULL DEFAULT FALSE,
  dms_document_id BIGINT REFERENCES dms_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Employee notes
CREATE TABLE employee_notes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  note_type   TEXT NOT NULL DEFAULT 'general',
  note_text   TEXT NOT NULL,
  is_private  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  BIGINT REFERENCES user_profiles(id),
  updated_by  BIGINT REFERENCES user_profiles(id),
  deleted_at  TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Employee approvals
CREATE TABLE employee_approvals (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id       BIGINT NOT NULL REFERENCES employees(id),
  related_entity_type TEXT NOT NULL,   -- 'leave_request' | 'pro_process' | 'payroll_revision'
  related_entity_id BIGINT NOT NULL,
  approval_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','cancelled')),
  requested_by      BIGINT REFERENCES user_profiles(id),
  approved_by       BIGINT REFERENCES user_profiles(id),
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id)
);

-- End of service cases
CREATE TABLE employee_end_of_service_cases (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id         BIGINT NOT NULL REFERENCES employees(id),
  eos_type            TEXT NOT NULL
    CHECK (eos_type IN ('resignation','termination','contract_end','retirement','death','mutual_agreement')),
  initiated_date      DATE NOT NULL,
  last_working_date   DATE,
  exit_interview_done BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_clearance','completed','cancelled')),
  notes               TEXT,
  dms_document_id     BIGINT REFERENCES dms_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ, deleted_by BIGINT REFERENCES user_profiles(id)
);

-- Clearance checklist items
CREATE TABLE employee_clearance_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  eos_case_id       BIGINT NOT NULL REFERENCES employee_end_of_service_cases(id),
  employee_id       BIGINT NOT NULL REFERENCES employees(id),
  clearance_type    TEXT NOT NULL,
  responsible_dept  TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cleared','waived','blocked')),
  cleared_by        BIGINT REFERENCES user_profiles(id),
  cleared_at        TIMESTAMPTZ,
  notes             TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id)
);
```

### 16.9 MOHRE Establishments

```sql
CREATE TABLE hr_mohre_establishments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_company_id      BIGINT NOT NULL REFERENCES owner_companies(id),
  establishment_number  TEXT NOT NULL,
  establishment_name    TEXT NOT NULL,
  emirate_id            BIGINT REFERENCES emirates(id),   -- global emirates
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes                 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES user_profiles(id), updated_by BIGINT REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ
);
```

### 16.10 Recommended Database Indexes

> **SCALABILITY REQUIREMENT (Sameer confirmed 2026-06-18):** Employee count is unlimited. Cursor must add performance indexes **in the same migration phase as each table is created** — not deferred to a later phase. Every HR table with employee FK, date columns, or status columns used in list/search/filter screens must have appropriate B-tree and/or GIN/trigram indexes from day one.

Based on confirmed pg_trgm usage in existing ERP migrations:

```sql
-- Employee search indexes (trigram for fuzzy name search)
CREATE INDEX idx_employees_employee_code ON employees (employee_code);
CREATE INDEX idx_employees_full_name_en_trgm ON employees USING GIN (full_name_en gin_trgm_ops);
CREATE INDEX idx_employees_mobile_number ON employees (mobile_number);
CREATE INDEX idx_employees_owner_company_id ON employees (owner_company_id);
CREATE INDEX idx_employees_branch_id ON employees (branch_id);
CREATE INDEX idx_employees_department_id ON employees (department_id);
CREATE INDEX idx_employees_designation_id ON employees (designation_id);
CREATE INDEX idx_employees_employee_status ON employees (employee_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_joining_date ON employees (joining_date);
CREATE INDEX idx_employees_nationality_id ON employees (nationality_id);
CREATE INDEX idx_employees_primary_work_site_id ON employees (primary_work_site_id);

-- Legal document expiry indexes
CREATE INDEX idx_identity_docs_employee_id ON employee_identity_documents (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_identity_docs_expiry ON employee_identity_documents (expiry_date) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX idx_identity_docs_status ON employee_identity_documents (employee_id, status) WHERE deleted_at IS NULL;

-- Medical insurance expiry
CREATE INDEX idx_medical_insurance_employee_id ON employee_medical_insurances (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_medical_insurance_expiry ON employee_medical_insurances (expiry_date) WHERE deleted_at IS NULL;

-- Access card expiry
CREATE INDEX idx_access_cards_employee_id ON employee_access_cards (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_access_cards_expiry ON employee_access_cards (expiry_date) WHERE deleted_at IS NULL AND status = 'active';

-- Training certificate expiry
CREATE INDEX idx_training_certs_employee_id ON employee_training_certificates (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_training_certs_expiry ON employee_training_certificates (expiry_date) WHERE deleted_at IS NULL AND status = 'valid';

-- Attendance
CREATE INDEX idx_attendance_summary_employee_date ON employee_attendance_daily_summary (employee_id, attendance_date);
CREATE INDEX idx_attendance_summary_date ON employee_attendance_daily_summary (attendance_date);
CREATE INDEX idx_attendance_punches_employee_datetime ON employee_attendance_punches (employee_id, punch_datetime);

-- Leave requests
CREATE INDEX idx_leave_requests_employee_id ON employee_leave_requests (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leave_requests_dates ON employee_leave_requests (start_date, end_date) WHERE approval_status = 'approved';

-- Readiness
CREATE INDEX idx_readiness_employee_context ON employee_readiness_status (employee_id, readiness_context_type);
CREATE INDEX idx_readiness_blocked ON employee_readiness_status (is_blocked) WHERE is_blocked = TRUE;

-- Document links
CREATE INDEX idx_doc_links_employee_id ON employee_document_links (employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_doc_links_dms_document_id ON employee_document_links (dms_document_id);

-- Full text search on employee profile (FTS vector — optional, add if needed)
-- CREATE INDEX idx_employees_search_tsv ON employees USING GIN (
--   to_tsvector('simple', full_name_en || ' ' || COALESCE(full_name_ar,'') || ' ' || employee_code)
-- );
```

### 16.11 Soft Delete Standard

All editable HR tables include:
```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
created_by  BIGINT REFERENCES user_profiles(id)
updated_by  BIGINT REFERENCES user_profiles(id)
deleted_at  TIMESTAMPTZ                           -- NULL = not deleted
deleted_by  BIGINT REFERENCES user_profiles(id)
```

Append-only event tables (`employee_status_events`, `employee_block_events`, `employee_salary_revisions`, `employee_attendance_corrections`) have **SELECT + INSERT policies only** — no UPDATE, no DELETE.

---

## 17. Relationship Map

```
GLOBAL MASTER DATA (existing — reused by HR):
owner_companies, branches, departments, designations, work_sites,
work_calendars, work_shifts, approval_roles (all COMMON MD.1)
countries, emirates, cities (global geography)
banks (Finance Basics)

employees ──────────────────────────────────────────────────────────────────
│ → owner_companies, branches, departments, designations, work_sites
│ → countries (nationality_id), hr_employee_categories, hr_employment_types
│ → hr_mohre_establishments, employees (self-ref: manager/supervisor)
│
├── employee_status_events          (append-only)
├── employee_document_links         → dms_documents
│
├── COMPLIANCE (HR.3)
│   ├── employee_identity_documents → hr_identity_document_types, countries, emirates
│   ├── employee_medical_insurances
│   ├── employee_dependents         → hr_relationship_types, countries
│   ├── employee_access_cards       → hr_access_card_types, work_sites
│   ├── employee_training_certificates → hr_training_types, hr_training_categories
│   └── employee_medical_records    → hr_medical_record_types (CONFIDENTIAL)
│
├── TIME (HR.4)
│   ├── employee_attendance_punches
│   ├── employee_attendance_daily_summary
│   ├── employee_attendance_corrections (append-only)
│   ├── employee_shift_assignments  → work_calendars, work_shifts (COMMON MD.1)
│   ├── employee_leave_requests     → hr_leave_types
│   ├── employee_leave_balances
│   └── employee_overtime_records
│
├── PAYROLL/WPS (HR.5)
│   ├── employee_payroll_profiles   → hr_payroll_groups
│   ├── employee_salary_components  → hr_salary_component_types
│   ├── employee_salary_revisions   (append-only)
│   ├── employee_payroll_holds
│   └── employee_wps_profiles       → banks (Finance Basics), hr_mohre_establishments
│
├── OPERATIONS (HR.6)
│   ├── employee_assignments        → work_sites
│   ├── employee_readiness_status   (context-aware) → work_sites, designations
│   ├── employee_block_events       (append-only)
│   └── employee_assets_facilities
│
├── HR ACTIONS (HR.7)
│   ├── employee_pro_processes      → hr_pro_process_types
│   ├── employee_performance_reviews
│   ├── employee_disciplinary_actions (CONFIDENTIAL)
│   ├── employee_notes
│   ├── employee_approvals
│   ├── employee_end_of_service_cases
│   └── employee_clearance_items
│
└── RECRUITMENT (HR.8)
    └── employee_recruitment_links  → hr_candidates, hr_manpower_requests, hr_offer_letters

All child mutations → audit_logs via logAudit() {
  parent_employee_id, employee_code, employee_name in metadata_json
}

AI (HR.12+) → erp_ai_field_suggestions (entity_type='employee')
            → erp_ai_duplicate_candidates
            → erp_ai_compliance_findings
            → erp_ai_risk_scores
            → erp_ai_data_quality_findings
```

---

## 18. RLS and Permission Plan

### 18.1 Confirmed RLS Helper Functions (from live base foundation migration)

These DB functions **already exist** and HR RLS policies must use them:

```sql
-- Returns current authenticated user's profile ID
current_user_profile_id() → BIGINT

-- Returns current user's primary owner_company_id
current_user_owner_company_id() → BIGINT

-- Returns current user's primary branch_id
current_user_branch_id() → BIGINT

-- Permission checks (use these in HR RLS policies)
current_user_has_permission(permission_code TEXT) → BOOLEAN       -- any scope
current_user_has_permission_any_scope(permission_code TEXT) → BOOLEAN
current_user_has_permission_in_company(permission_code TEXT, company_id BIGINT) → BOOLEAN
current_user_has_permission_in_branch(permission_code TEXT, branch_id BIGINT) → BOOLEAN

-- Role checks
current_user_has_role(role_code TEXT) → BOOLEAN
current_user_has_role_in_company(role_code TEXT, company_id BIGINT) → BOOLEAN
current_user_is_global_admin() → BOOLEAN
```

**Important:** The project has multi-company role mapping (`current_user_has_permission_in_company`). HR RLS helper functions must use this pattern — not assume a single company. Cursor must inspect the existing RBAC/company-scope patterns in `src/lib/rbac/check.ts` before writing any HR RLS function.

### 18.2 HR RLS Helper Function Pattern

```sql
-- HR view permission — aligned with multi-company RBAC pattern
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_company_id BIGINT;
BEGIN
  -- Global admins can see all
  IF current_user_is_global_admin() THEN RETURN TRUE; END IF;
  -- Permission check + company scope
  SELECT owner_company_id INTO v_company_id
  FROM employees WHERE id = p_employee_id AND deleted_at IS NULL;
  RETURN (
    v_company_id IS NOT NULL AND
    current_user_has_permission_in_company('hr.employees.view', v_company_id)
  );
END;
$$;

-- Medical data — elevated permission
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_medical(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.medical.view')
  );
END;
$$;

-- Payroll data — elevated permission
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_payroll(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.payroll.view')
  );
END;
$$;

-- Disciplinary data — elevated permission
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_disciplinary(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.actions.view')
  );
END;
$$;
```

### 18.3 HR Permission Codes

```text
-- Employee
hr.employees.view             view employee list and basic profile
hr.employees.create           create new employee
hr.employees.update           update employee fields
hr.employees.archive          archive/soft-delete employee  (NOT hr.employees.delete)

-- Profile and compliance
hr.employee_profile.view      full profile all tabs
hr.employee_profile.manage    manage all profile sections
hr.compliance.view            legal docs, insurance, dependents, access, training
hr.compliance.manage          add/edit compliance records

-- Sensitive sections (elevated)
hr.medical.view               view medical records
hr.medical.manage             add/edit medical records
hr.payroll.view               view salary, IBAN (unmasked for payroll officer)
hr.payroll.manage             edit payroll profile and WPS data

-- Time
hr.attendance.view
hr.attendance.manage
hr.leave.view
hr.leave.manage

-- Recruitment
hr.recruitment.view
hr.recruitment.manage

-- Operations
hr.assignments.view
hr.assignments.manage

-- HR Actions (disciplinary restricted)
hr.actions.view
hr.actions.manage

-- EOS
hr.eos.view
hr.eos.manage

-- Dashboard / Search / Settings
hr.dashboard.view
hr.search.use
hr.settings.view
hr.settings.manage

-- AI
hr.ai.review                  view and review HR AI suggestions
hr.ai.apply_suggestion        apply HR AI field suggestions

-- Admin
hr.admin                      full HR administration
```

### 18.4 Supervisor Limited View

Supervisors (`hr.employees.view` + supervisor role) can see:

| Can See | Cannot See |
|---|---|
| Basic profile (name, designation, status, mobile) | Salary, allowances, gross |
| Attendance and leave status | IBAN / account number (always masked) |
| Assignment and readiness badges | Medical records and fitness reports |
| Compliance summary badges (Green/Amber/Red) | Full legal document numbers (partial mask only) |
| PRO process status summary | Disciplinary details (badge only: "HR Hold Active") |
| — | Dependents |
| — | AI findings |

### 18.5 Append-Only Event Table Policies

```sql
-- Pattern for all append-only event tables
-- (employee_status_events, employee_block_events, employee_salary_revisions, employee_attendance_corrections)

CREATE POLICY "select_own_company" ON employee_status_events
  FOR SELECT USING (
    current_user_can_view_employee(employee_id)
  );

CREATE POLICY "insert_with_permission" ON employee_status_events
  FOR INSERT WITH CHECK (
    current_user_has_permission('hr.employees.update')
  );

-- NO UPDATE policy
-- NO DELETE policy
```

---

## 19. DMS Integration Plan

### 19.1 DMS Entity Types

**Confirmed from live `src/lib/dms/dms-entity-types.ts`:**

| Entity Type | Status | Registered? |
|---|---|---|
| `employee` | Pre-registered | ✅ YES — line 31 |
| `employee_compliance` | Pre-registered | ✅ YES — line 32 |
| `employee_identity_document` | HR.3 | ❌ Add in HR.3 |
| `employee_medical_insurance` | HR.3 | ❌ Add in HR.3 |
| `employee_dependent` | HR.3 | ❌ Add in HR.3 |
| `employee_access_card` | HR.3 | ❌ Add in HR.3 |
| `employee_training_certificate` | HR.3 | ❌ Add in HR.3 |
| `employee_medical_record` | HR.3 (confidential) | ❌ Add in HR.3 |
| `employee_contract` | HR.3 | ❌ Add in HR.3 |
| `employee_leave_request` | HR.4 | ❌ Add in HR.4 |
| `employee_eos_case` | HR.7 | ❌ Add in HR.7 |

**Rule:** To add a new entity type, update `src/lib/dms/dms-entity-types.ts` — no migration needed. Cursor must update all three exports: `DMS_ENTITY_TYPES`, `DMS_ENTITY_TYPE_LABELS`, and `DMS_ENTITY_REQUIRED_DOCUMENT_HINTS`.

### 19.2 DMS Required Document Rules (HR.3 seeds)

Add rows to `dms_required_document_rules` for HR entity types:

| Entity Type | Document Type Code | Mandatory |
|---|---|---|
| `employee` | EMIRATES_ID | Yes |
| `employee` | PASSPORT | Yes |
| `employee` | UAE_VISA | Yes (non-GCC nationals) |
| `employee` | MEDICAL_CERTIFICATE | Yes |
| `employee` | LABOUR_CONTRACT | Yes |

### 19.3 Document Linking Strategy

1. Each compliance child table stores `dms_document_id` for its primary document copy.
2. For many-to-many (one DMS document linked to multiple child records), use `employee_document_links`.
3. Employee Documents tab uses `DmsEntityDocumentsTab` from `@/features/dms/entity-documents` — props: `entityType="employee"`, `entityId`.
4. No custom HR file upload store — all uploads go through DMS Inbox or DMS upload widget.
5. DMS AI extraction feeds AI Review tab as suggestions only — not auto-applied.

### 19.4 Sensitive Document Rules

- Medical reports (`employee_medical_records.dms_document_id`): only shown to `hr.medical.view`
- Payroll/salary certificates: only shown to `hr.payroll.view`
- DMS confidentiality gate applies: `hr/legal/executive` category documents require `dms.admin`
- Any DMS attachment as email attachment: permission-checked before generating signed URL

---

## 20. AI Integration Plan

### 20.1 AI Readiness Requirements (HR.2–HR.10)

Every phase from HR.2 onwards leaves HR AI-ready:

| Requirement | Phase |
|---|---|
| Stable `employee` entity type in `dms-entity-types.ts` | Already registered ✅ |
| Additional HR entity types added | HR.3 |
| Stable Employee Profile URL pattern (`/admin/hr/employees/record/[id]`) | HR.2 |
| `employee_document_links` for DMS bridging | HR.3 |
| Deterministic compliance statuses (`verification_status`, `renewal_status`, expiry dates) | HR.3 |
| Deterministic readiness scores (`employee_readiness_status`) | HR.6 |
| Audit events with `parent_employee_id` + `employee_code` + `employee_name` | HR.2+ |
| AI Review tab placeholder on Employee Profile | HR.2 |
| Field names consistent with potential AI registry fields | HR.2+ |
| `erp_ai_data_quality_findings` — no HR rules until HR.12 | HR.12 |

### 20.2 HR AI Subphases (HR.12)

| Subphase | Name | Key Deliverables |
|---|---|---|
| HR AI.1 | HR AI Registry and Feature Flags | Common AI.1 HR entity registries (employee, identity_doc, training_cert, access_card); 7 HR AI feature flags (all `false`); 5 `ai.hr.*` permissions |
| HR AI.2 | AI Fill from HR Documents | AI fill from Emirates ID, Passport, Visa, Insurance card, Training certs, Access cards → suggestions in AI Review tab |
| HR AI.3 | AI Correction and Conflict Detection | Duplicate employee detection (same passport, EID, name+DOB); conflicting compliance data warnings |
| HR AI.4 | AI HR Search | Extend Common AI.6 for natural language HR queries |
| HR AI.5 | AI Compliance and Readiness Explanation | Common AI.4 + AI.5 extended for HR; AI explains "why is this employee blocked?" |
| HR AI.6 | AI HR Letters and Email Drafts | New assistant actions: `PREPARE_HR_LETTER_DRAFT`, `PREPARE_RENEWAL_CHECKLIST`, `PREPARE_HR_EMAIL_DRAFT` |
| HR AI.7 | HR AI Security / RLS / QA | Full audit of HR AI flags, permissions, sensitive data handling |

### 20.3 AI Priority Order

1. **AI Search** — natural language HR queries (search by meaning, not just keyword)
2. **AI Fill from documents** — Emirates ID / passport / visa upload → identity document fields
3. **AI Correction** — suggest corrections to conflicting or incomplete HR data
4. **AI Compliance / Readiness Explanation** — explain why employee is non-compliant or blocked
5. **AI Letters / Email Drafts** — draft salary cert, NOC, offer letter, renewal reminder

### 20.4 New HR AI Feature Flags (HR.12)

```text
ERP_AI_HR_FILL          AI fill from HR documents              default: false
ERP_AI_HR_COMPLIANCE    AI compliance checker for HR           default: false
ERP_AI_HR_DUPLICATE     AI duplicate employee detection        default: false
ERP_AI_HR_RISK          AI risk scoring for employees          default: false
ERP_AI_HR_ASSISTANT     AI assistant for HR actions            default: false
ERP_AI_HR_LETTERS       AI letter/email drafting               default: false
ERP_AI_HR_DATA_QUALITY  Data quality monitor for HR            default: false
```

### 20.5 New HR AI Permissions (HR.12)

```text
ai.hr.fill              trigger AI fill for employee records
ai.hr.review            review AI findings for HR
ai.hr.apply             apply AI suggestions to employee records
ai.hr.letters           use AI letter/email drafting
ai.hr.admin             manage HR AI settings and flags
```

---

## 21. Email Integration Plan

### 21.1 All HR Emails via Existing Engine

All HR emails go through `erp_email_queue` using `queueEmail()` from `src/server/actions/notifications/email-queue.ts`. Templates rendered via `renderNotificationTemplate()` from `src/server/actions/notifications/templates.ts`.

### 21.2 Email Rules

| Rule | Requirement |
|---|---|
| Preview before send | User must see and confirm email content before queuing |
| No AI auto-send | AI drafts text; user reviews; user clicks Confirm |
| DMS attachments | Permission-checked before signing URL; attachment requires same permission as document |
| PDF/DOCX attachments | Generated server-side and reviewed by user before send |
| Audit | `hr_email_sent` event logged to `audit_logs` |
| Process linkage | `related_entity_type` + `related_entity_id` set in queue record |

### 21.3 HR Email Templates (seeded in HR.1)

| Template Code | Use | Recipient | Send Mode |
|---|---|---|---|
| `HR_OFFER_LETTER` | Offer letter to candidate | Candidate email | Manual (AI drafts, HR reviews) |
| `HR_INTERVIEW_INVITE` | Interview invitation | Candidate email | Manual |
| `HR_JOINING_INSTRUCTIONS` | Joining instructions | Employee email | Manual |
| `HR_DOCUMENT_RENEWAL_REMINDER` | Document expiry reminder | Employee + PRO | Manual |
| `HR_LEAVE_DECISION` | Leave approval/rejection | Employee | Auto-on HR approval action |
| `HR_SALARY_CERTIFICATE` | Salary certificate | Employee | Manual (AI drafts, HR reviews) |
| `HR_EOS_CLEARANCE` | EOS clearance request | Department heads | Manual |
| `HR_DOCUMENT_REQUEST` | Document request | Employee / Supervisor | Manual |
| `HR_NOC_LETTER` | No Objection Certificate | Employee | Manual |
| `HR_WARNING_LETTER` | Disciplinary warning | Employee | Manual (HR review required) |

---

## 22. Export / Print / Report Plan

> **Scalability rule (employee count is unlimited):** Large reports must require active filters before generation. Batch/chunk export generation must be used where data volume may be very large. Export audit logs must include filter summary and row count — not raw sensitive values. No report may load all employees unconditionally.

### 22.1 Export Formats and Rules

| Format | Use | Redaction |
|---|---|---|
| PDF | Formal reports, profile print, HR letters | Yes — salary/IBAN masked |
| Excel (.xlsx) | Tabular data, WPS SIF preparation | Yes — salary masked for non-payroll |
| CSV | Raw data export | Yes — same as Excel |
| Word / DOCX | HR letters, salary certs, NOC | ⚠️ NOT in existing export engine (`src/lib/export/` supports CSV/Excel/PDF/Print only). HR.11 v1 must use PDF (`exportToPDF()`) for all formal letters. DOCX generation (via docx npm library or pandoc) is a future enhancement requiring separate Sameer approval. |
| Print View | Browser print-optimized layout | Yes — same masking rules |

**Redaction is done server-side before generating the export file.** The export generator must receive pre-masked data — never rely on client-side filtering.

**Export events:** Every export generates an audit event: `hr_export_generated` with export type, filter parameters, and user.

### 22.2 Core Reports — HR.11 (15 reports)

| # | Report | Key Filters | Salary Masked? | Permission |
|---|---|---|---|---|
| 1 | Employee Master | Company/Branch/Dept/Status | Yes | hr.employees.view |
| 2 | Active Employees | Company/Branch/Dept/Category | Yes | hr.employees.view |
| 3 | Emirates ID Expiry | Expiry range, company | No | hr.compliance.view |
| 4 | Passport Expiry | Expiry range | No | hr.compliance.view |
| 5 | Residence Visa Expiry | Expiry range | No | hr.compliance.view |
| 6 | Labour Card Expiry | Expiry range | No | hr.compliance.view |
| 7 | Medical Insurance Expiry | Expiry range, provider | No | hr.compliance.view |
| 8 | CICPA / Access Card Expiry | Type, expiry range | No | hr.compliance.view |
| 9 | Training Expiry | Type, expiry range | No | hr.compliance.view |
| 10 | Missing Documents | Entity type, company | No | hr.compliance.view |
| 11 | Attendance | Date range, dept, site | No | hr.attendance.view |
| 12 | Leave Balance | Year, dept | No | hr.leave.view |
| 13 | Payroll / WPS Readiness | Company | **Yes — salary always masked** | hr.payroll.view |
| 14 | Blocked Employees | Block reason, site | No | hr.assignments.view |
| 15 | Site Readiness | Site, dimension | No | hr.assignments.view |

### 22.3 Extended Reports (HR.11 extension or later)

32 additional reports planned for after core reports are stable: Inactive/Terminated · New Joiners · Probation · Dependents Expiry · H2S Expiry · ADSD Expiry · ADNOC Readiness · Medical Fitness · HR Hold/Disciplinary · EOS · Clearance Pending · AI Suggestions Pending · HR Data Quality · Salary Revision History · Missing IBAN · PRO Renewal Pending · Employee Master Export (full) · WPS SIF Export · and more.

---

## 23. Audit Logging Plan

### 23.1 Standard Audit Event Pattern

```typescript
await logAudit({
  module_code: "HR",
  entity_name: "employee_identity_documents",
  entity_id: doc.id,
  entity_reference: doc.document_number,
  action: "create",
  new_values: { ...validated },
  metadata_json: {
    parent_employee_id: employee.id,       // REQUIRED for all child records
    employee_code: employee.employee_code, // REQUIRED
    employee_name: employee.full_name_en,  // REQUIRED
  },
});
```

**Every HR child-record mutation must include `parent_employee_id`, `employee_code`, and `employee_name`** in `metadata_json` so the Employee Audit tab can reconstruct full history without additional DB joins.

### 23.2 Key Audit Events

| Action | Entity | Notes |
|---|---|---|
| create / update / archive | employees | Status change also writes `employee_status_events` |
| create / update / verified | employee_identity_documents | |
| create / update | employee_medical_insurances | |
| create / update | employee_dependents | |
| create / update | employee_access_cards | |
| create / update | employee_training_certificates | |
| create / update | employee_medical_records | |
| create / approved / rejected | employee_leave_requests | |
| corrected | employee_attendance_corrections | |
| salary_revised | employee_salary_revisions | |
| payroll_hold / payroll_hold_released | employee_payroll_holds | |
| assigned / assignment_completed | employee_assignments | |
| blocked / unblocked | employee_block_events | |
| pro_stage_changed | employee_pro_processes | |
| disciplinary_action | employee_disciplinary_actions | |
| eos_initiated / clearance_updated | employee_end_of_service_cases | |
| hr_email_sent | erp_email_queue | |
| hr_export_generated | — | Export audit event |

### 23.3 Sensitive Field Masking in Audit Tab

| Field | Masked For | Display |
|---|---|---|
| `salary` / `gross` / `amount` | No `hr.payroll.view` | `***` |
| `iban` / `account_number` | Always (no exception) | `AE**...****` |
| `passport_number` | No `hr.compliance.view` | `A123***` |
| `emirates_id_number` | No `hr.compliance.view` | `784-****-*` |
| Medical old/new values | No `hr.medical.view` | `[Medical record change — restricted]` |
| Disciplinary old/new values | No `hr.actions.view` | `[Disciplinary record — restricted]` |

---

## 24. Sensitive Data and Redaction Plan

### 24.1 Sensitive Fields Denylist

```text
iban
account_number
bank_account_number
passport_number
emirates_id_number
dependent_passport_number
dependent_emirates_id_number
salary
basic_salary
gross_salary
medical_result
restriction_details
disciplinary_details
employee_response   (disciplinary)
```

### 24.2 Redaction Rules

| Field Group | Unmasked For | Masked / Hidden For |
|---|---|---|
| Salary, gross, allowances | `hr.payroll.view` | Others: `***` |
| IBAN / account number | `hr.payroll.manage` only | Others: always `AE**...****` |
| Bank name | `hr.payroll.view` | Not sensitive — shown to all |
| Medical results and restrictions | `hr.medical.view` | Sub-section entirely hidden |
| Medical DMS report link | `hr.medical.view` | Hidden |
| Passport number | `hr.compliance.view` | Partial: `A123***` |
| Emirates ID number | `hr.compliance.view` | Partial: `784-****-*` |
| Dependent sensitive numbers | `hr.compliance.view` | Partial mask |
| Disciplinary warning text | `hr.actions.view` | Badge only: "HR Hold Active" |

### 24.3 Draft Denylist Extension

Extend existing `DRAFT_FIELD_DENYLIST` (from `useWorkspaceFormDraft`) with:

```typescript
const HR_SENSITIVE_FIELDS = [
  "iban", "account_number", "passport_number", "emirates_id_number",
  "salary", "basic_salary", "gross_salary", "amount",
  "medical_result", "restriction_details", "disciplinary_details",
  "employee_response", "dependent_passport_number", "dependent_emirates_id_number",
];
```

**Rule:** If sensitive draft exclusion cannot be guaranteed, **disable workspace draft entirely** for the Payroll, Medical Records, and Disciplinary sub-sections.

### 24.4 Redaction Must Be Server-Side

All masking happens in the server action before the response object reaches the client. The export generator receives pre-masked values. No raw sensitive value reaches any React component for an unauthorized user.

---

## 25. Implementation Phases

**Rule: Each phase is implemented separately. No phase begins without:**
1. Sameer / Dina explicit approval of the phase prompt
2. Previous phase implementation report confirmed
3. SOT updated with previous phase closure

**Every phase requires:**
- TS PASS (`npx tsc --noEmit` → 0 errors)
- Build PASS (`npm run build`)
- Implementation report: `implementation_Review/HR_Phases/Phase_HR_XX/ERP_HR_XX_<NAME>_IMPLEMENTATION_REPORT.md`
- SOT update: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

---

### HR.0 — Readiness Audit and Final Plan

**Goal:** Confirm live ERP readiness before any HR implementation. No code changes.

**Scope:**
- Connect to live DB (`user-supabase`) and confirm: `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `approval_roles`, `countries`, `emirates`, `banks`, `dms_required_document_rules` all exist and have data
- Confirm `dms-entity-types.ts` has `employee` and `employee_compliance` registered
- Confirm `generateNextReference()` works for new numbering rule `EMP`
- Confirm all Common AI phases AI.0–AI.7, AI.13–AI.15 are closed
- Confirm numbering prefix `EMP` is not already taken
- Answer any open questions from §29 that Sameer must decide
- Confirm this master plan as final — no changes after approval

**DB migrations:** None  
**Server actions:** None  
**UI:** None  
**Permissions/RLS:** None  
**DMS:** Confirm entity types only  
**AI readiness:** Confirm AI stack state  
**Acceptance criteria:** Written confirmation from Sameer that plan is approved  
**Report:** `implementation_Review/HR_Phases/Phase_HR_0/ERP_HR_0_READINESS_AUDIT_AND_FINAL_PLAN_CONFIRMATION_REPORT.md`  
**SOT update:** Yes — note HR.0 as completed, HR.1 as next

**HR.0 closure decision (confirmed 2026-06-18):**
All 14 open HR.0 prerequisite questions closed by Sameer. All structural readiness confirmed. HR.0 is ready to close after this document update. The next step is to generate a separate HR.1 implementation prompt. No HR.1 implementation is included in HR.0.

---

### HR.1 — HR Settings Foundation

**Confirmed decision inputs for future HR.1 (decisions closed in HR.0):**
- Employee numbering rule: `EMP` with format `{DOC}-{SEQ6}`; expected output `EMP-000001`
- Leave reset default: joining anniversary (configurable)
- Expiry alert default: 60 days (configurable per rule)
- WPS applicable by default; per-employee exemption allowed
- Probation configurable; default: as stated in contract
- Leave approval default: HR Manager only (configurable via `hr_approval_workflows`)
- Employee count: unlimited/scalable; B-tree + GIN indexes required in same migration as each table
- `createEmployee` calls `generateNextReference()` via admin client (no user-level numbering permission exposed)

*This block is planning input only. No HR.1 implementation has been performed.*

**Goal:** All HR lookup tables, seeded data, permissions, numbering rule, email templates.

**DB migrations:**
- All 18 HR settings tables (§15) — all with BIGINT PK, RLS ENABLED+FORCED
- `hr_mohre_establishments` (§16.9)
- Seed all 28+ HR permissions with role mappings to system_admin/group_admin/company_admin/hr_manager/hr_officer/payroll_officer/pro_officer/hse_officer/operations_manager/supervisor
- Seed HR email templates in `erp_notification_templates`
- Seed `hr_training_types` (20+ types — H2S, ADSD, ADNOC ATA, etc.)
- Seed numbering rule for `EMP` prefix in numbering table

**Server actions:** CRUD for all settings tables (getHrEmployeeCategories, getHrTrainingTypes, etc.)  
**UI:** `/admin/hr/settings/` — all settings CRUD screens  
**Permissions:** `hr.settings.view`, `hr.settings.manage`  
**DMS:** None yet  
**AI readiness:** None yet  
**Acceptance criteria:** All 18 settings tables live; all 28+ HR permissions seeded; EMP numbering rule active; email templates seeded; TS PASS; Build PASS  
**Report:** `ERP_HR_1_SETTINGS_FOUNDATION_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.2 — Employee Master and Profile Shell

**Goal:** Core `employees` table, list, new employee form, profile shell with Overview + Profile tabs.

**DB migrations:**
- `employees` table (§16.1) — full schema with BIGINT PK, all FKs to global tables, soft delete
- `employee_status_events` (append-only)
- `employee_document_links` (§16.3) — even though DMS integration is in HR.3
- RLS: `ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;` on both tables
- RLS helper functions: `current_user_can_view_employee()` etc. (using existing DB functions)
- Recommended indexes on `employees` (§16.10 — first group)
- `employee` numbering rule if not in HR.1 migration

**Server actions:** `createEmployee`, `updateEmployee`, `getEmployee`, `getEmployees`, `archiveEmployee`, `getEmployeeStatusHistory`, `getEmployeeOverview`

**UI:**
- `/admin/hr/employees` — list with filters, table, quick view hover card
- `/admin/hr/employees/record/new` — new employee form (ERPRecordWorkspaceForm + useWorkspaceFormDraft)
- `/admin/hr/employees/record/[id]` — profile shell with header, 10-tab bar
- Overview tab — all cards + snapshots (read-only, data from existing tables + placeholder data for tabs not yet built)
- Profile tab — full personal + employment form
- All other tabs — placeholder: "This section is available in phase HR.3+" 
- AI Review tab — placeholder: "HR AI integration is planned for HR.12"
- HR sidebar added: Dashboard, Employees, HR Search, HR Settings

**Permissions:** `hr.employees.view`, `hr.employees.create`, `hr.employees.update`, `hr.employees.archive`  
**DMS:** Photo via `photo_dms_document_id` — basic link only (no full DMS tab yet)  
**AI readiness:** Route pattern stable; AI Review placeholder visible; audit events include `parent_employee_id`  
**Acceptance criteria:** Employees table live with RLS; profile loads; add/edit/archive functional; employee code auto-generated; TS PASS; Build PASS  
**Report:** `ERP_HR_2_EMPLOYEE_MASTER_PROFILE_SHELL_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.3 — Compliance Inside Employee Profile

**Goal:** All 6 compliance child tables inside the Compliance tab + DMS links.

**DB migrations:**
- `employee_identity_documents` with UAE-specific optional fields (§16.4 A)
- `employee_medical_insurances` (§16.4 B)
- `employee_dependents` (§16.4 C)
- `employee_access_cards` (§16.4 D)
- `employee_training_certificates` (§16.4 E)
- `employee_medical_records` (§16.4 F) — CONFIDENTIAL
- RLS on all 6 tables using `current_user_can_view_employee()`, `current_user_can_view_employee_medical()`
- DMS entity types added to `src/lib/dms/dms-entity-types.ts` (7 new types)
- HR DMS required document rules seeded (5 rules in `dms_required_document_rules`)
- Compliance indexes (§16.10 — expiry index group)

**Server actions:** CRUD for all 6 compliance tables + `verifyDocument`, `updateRenewalStatus`, linkDmsDocument

**UI:**
- Compliance tab activated with 6 collapsible sub-sections
- Each sub-section: data table + ERPChildDialogForm for add/edit
- Medical Records sub-section: hidden if no `hr.medical.view`
- Expiry colour coding (Green/Amber/Red)
- Compliance tab badge count
- Overview tab compliance cards now use real data

**Permissions:** `hr.compliance.view`, `hr.compliance.manage`, `hr.medical.view`, `hr.medical.manage`  
**DMS:** `DmsEntityDocumentsTab` not yet on Documents tab — DMS links via `dms_document_id` on each child record only  
**AI readiness:** `verification_status`, `renewal_status`, expiry dates confirmed stable. New DMS entity types registered.  
**Acceptance criteria:** All 6 tables live with RLS; add/edit/verify each type works; expiry colour correct; medical hidden without permission; TS PASS; Build PASS  
**Report:** `ERP_HR_3_COMPLIANCE_EMPLOYEE_PROFILE_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.4 — Time Foundation

**Goal:** Attendance (two-table), shift assignments, leave requests, leave balances, overtime.

**DB migrations:**
- `employee_attendance_punches` (§16.5)
- `employee_attendance_daily_summary` with `UNIQUE(employee_id, attendance_date)` (§16.5)
- `employee_attendance_corrections` (append-only) (§16.5)
- `employee_shift_assignments` → `work_calendars`, `work_shifts` (§16.5)
- `employee_leave_requests` (§16.5)
- `employee_leave_balances` (§16.5)
- `employee_overtime_records` (§16.5)
- Attendance indexes (§16.10)
- RLS on all tables

**Server actions:** `recordAttendancePunch`, `approveAttendanceSummary`, `correctAttendanceSummary`, `assignShift`, `createLeaveRequest`, `approveLeaveRequest`, `rejectLeaveRequest`, `updateLeaveBalance`, `recordOvertime`

**UI:**
- Time tab in Employee Profile — 4 sub-sections (lazy-loaded)
- `/admin/hr/time/attendance` — global daily attendance view
- `/admin/hr/time/leave` — leave request management and approval
- `/admin/hr/time/shifts` — shift assignment (bulk)

**Permissions:** `hr.attendance.view`, `hr.attendance.manage`, `hr.leave.view`, `hr.leave.manage`  
**DMS:** Sick leave certificate link via `sick_cert_dms_id`  
**DMS entity type:** `employee_leave_request` added in HR.4  
**AI readiness:** Attendance and leave data become inputs for AI readiness and data quality checks later  
**Acceptance criteria:** Attendance recorded (punch + summary); leave approved; balance calculated; shift displayed; TS PASS; Build PASS  
**Report:** `ERP_HR_4_TIME_FOUNDATION_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.5 — Payroll & WPS Readiness

**Goal:** Salary profile, named salary components, WPS data inside Payroll & WPS tab.

**DB migrations:**
- `employee_payroll_profiles` (§16.6)
- `employee_salary_components` (§16.6) — named components, not JSON
- `employee_salary_revisions` (append-only) (§16.6)
- `employee_payroll_holds` (§16.6)
- `employee_wps_profiles` with `bank_id → banks.id` (Finance Basics) (§16.6)
- RLS using `current_user_can_view_employee_payroll()`

**Server actions:** `createPayrollProfile`, `updateSalaryComponent`, `addSalaryRevision`, `placePayrollHold`, `releasePayrollHold`, `updateWpsProfile`, `generateWpsSifExport`, `getPayrollSummary`

**Server-side masking:** All salary amounts must be masked in responses for users without `hr.payroll.view`. IBAN always masked.

**UI:**
- Payroll & WPS tab activated with 4 sub-sections (lazy-loaded)
- Salary figures masked or tab hidden if no `hr.payroll.view`
- IBAN always masked regardless of role
- Gross calculated server-side from components
- `/admin/hr/payroll/salaries` — global salary management view (payroll officer only)
- `/admin/hr/payroll/wps` — WPS readiness + SIF export

**Permissions:** `hr.payroll.view`, `hr.payroll.manage`  
**DMS:** None for this phase  
**AI readiness:** WPS fields and salary profile become inputs for data quality monitor (HR.12)  
**Acceptance criteria:** Salary components save and gross calculates server-side; IBAN always masked; salary tab hidden for non-payroll; WPS SIF export produces valid CSV; TS PASS; Build PASS  
**Report:** `ERP_HR_5_PAYROLL_WPS_READINESS_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.6 — Operations and Readiness

**Goal:** Assignments, context-aware readiness engine, blocked status, assets inside Operations tab.

**DB migrations:**
- `employee_assignments` → `work_sites` (§16.7)
- `employee_readiness_status` (context-aware with 5 context types) (§16.7)
- `employee_block_events` (append-only) (§16.7)
- `employee_assets_facilities` (§16.7)
- Readiness indexes (§16.10)
- RLS on all tables

**Server actions:** `updateEmployeeAssignment`, `computeEmployeeReadiness(employeeId, contextType, contextId)`, `blockEmployee`, `unblockEmployee`, `updateAssetsFacilities`, `getSiteReadinessMatrix`, `getBlockedEmployees`

**Readiness engine:** Deterministic TypeScript — reads `hr_readiness_rule_templates` and compliance data. **No AI required.**

**UI:**
- Operations tab in Employee Profile (3 sub-sections: Assignment, Readiness Matrix, Assets)
- Blocked status panel with "unblock requirements" list and resolve links
- `/admin/hr/assignments/readiness` — cross-employee site readiness matrix
- `/admin/hr/assignments/blocked` — blocked employees list with unblock actions
- Sidebar entries for Assignments

**Permissions:** `hr.assignments.view`, `hr.assignments.manage`  
**DMS:** None  
**AI readiness:** `employee_readiness_status` deterministic outputs are stable input for HR AI.5 later  
**Acceptance criteria:** At least 5 readiness dimensions calculated correctly; general + site context types work; blocked employee shows unblock requirements; TS PASS; Build PASS  
**Report:** `ERP_HR_6_OPERATIONS_READINESS_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.7 — HR Actions

**Goal:** PRO processes, performance, disciplinary, notes, approvals, EOS + clearance inside HR Actions tab.

**DB migrations:**
- `employee_pro_processes` (§16.8)
- `employee_performance_reviews` (§16.8)
- `employee_disciplinary_actions` (§16.8) — CONFIDENTIAL RLS
- `employee_notes` (§16.8)
- `employee_approvals` (§16.8)
- `employee_end_of_service_cases` (§16.8)
- `employee_clearance_items` (§16.8)
- RLS using `current_user_can_view_employee_disciplinary()` for disciplinary tables

**Server actions:** CRUD for all 7 tables + EOS workflow + clearance management + archiveEmployee (triggers EOS case)

**UI:**
- HR Actions tab in Employee Profile — 6 sub-sections
- Disciplinary sub-section hidden if no `hr.actions.view` (badge "HR Hold Active" visible to all)
- `/admin/hr/eos/cases` — EOS management
- `/admin/hr/eos/clearance` — clearance tracker
- Sidebar entries for EOS

**DMS entity type:** `employee_eos_case` added  
**Permissions:** `hr.actions.view`, `hr.actions.manage`, `hr.eos.view`, `hr.eos.manage`  
**AI readiness:** PRO process stages are inputs for AI compliance checking later  
**Acceptance criteria:** PRO process tracked through stages; disciplinary hidden without permission; EOS case with clearance checklist; TS PASS; Build PASS  
**Report:** `ERP_HR_7_HR_ACTIONS_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.8 — Recruitment & Onboarding

**Goal:** Full recruitment pipeline from manpower request through new joiner conversion.

**DB migrations:**
- `hr_manpower_requests`
- `hr_job_openings`
- `hr_candidates`
- `hr_candidate_interviews`
- `hr_offer_letters`
- `hr_onboarding_checklists` + `hr_onboarding_tasks`
- `employee_recruitment_links` (§10.2) — links employee ↔ candidate + request + offer
- RLS on all tables

**Server actions:** CRUD for all 7 tables + `convertCandidateToEmployee` (creates `employees` row + `employee_recruitment_links` row in a single transaction)

**UI:**
- `/admin/hr/recruitment/manpower-requests`
- `/admin/hr/recruitment/candidates`
- `/admin/hr/recruitment/new-joiners` + "Convert to Employee" button
- Onboarding checklist inside Employee Profile (Section C — hiring history and onboarding)
- Probation tracking view (filtered employee list)
- Sidebar: Recruitment sub-menu

**Permissions:** `hr.recruitment.view`, `hr.recruitment.manage`  
**DMS:** DMS links for offer letters, contracts (use existing `employee` entity type)  
**AI readiness:** Candidate profiles become inputs for HR AI.2 (AI fill from CV/passport)  
**Acceptance criteria:** Candidate created; interview recorded; offer letter; candidate converted to employee; recruitment link visible on Profile Section C; onboarding checklist functional; TS PASS; Build PASS  
**Report:** `ERP_HR_8_RECRUITMENT_ONBOARDING_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.9 — Single HR Dashboard

**Goal:** One aggregated HR monitoring dashboard — monitoring only, no editing.

**DB:** `hr_dashboard_cache` (optional — for performance on large datasets)

**Server actions:** `getHRDashboardOverview(filters)`, `getHRDashboardSection(sectionCode, filters)` — all read-only

**UI:**
- `/admin/hr/dashboard` — 14 dashboard sections with all filters
- Every row click and alert card navigates to Employee Profile at the correct tab + child record section
- Export dashboard summary as PDF
- Dashboard activated in HR sidebar

**Permissions:** `hr.dashboard.view`  
**DMS:** Read-only DMS compliance stats for Document Verification card  
**AI readiness:** AI/Data Quality section reads from `erp_ai_data_quality_findings` and `erp_ai_field_suggestions` (entity_type='employee') — these work even before HR AI since the tables exist  
**Acceptance criteria:** All 14 sections load with real data; clicking an alert opens Employee Profile at the correct tab; all filters work; export works; TS PASS; Build PASS  
**Report:** `ERP_HR_9_SINGLE_HR_DASHBOARD_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.10 — Single HR Search

**Goal:** One comprehensive HR search engine covering all HR data dimensions.

**DB migrations:**
- `hr_recent_searches` (user-scoped, RLS)
- Optional: GIN trigram index on `employees.full_name_en` and `employees.employee_code` if not added in HR.2 (§16.10)

**Server actions:** `searchHREmployees(query, filters, mode)`, `getHRSearchSuggestions`, `saveHRRecentSearch`, `clearHRRecentSearches`  
AI natural language mode → placeholder returning `{ mode: "ai", message: "Available in HR.12" }` until HR.12

**UI:**
- `/admin/hr/search` — keyword search + advanced filter panel + AI search toggle (disabled until HR.12)
- Result cards with context badges + open Employee Profile link + export selection
- HR Search activated in sidebar

**Permissions:** `hr.search.use`  
**AI readiness:** Search infrastructure stable; AI natural language query slot ready for HR AI.4  
**Acceptance criteria:** Name search returns correct employees; EID number search works; advanced filters all work; recent searches saved; export selected results; AI toggle shows placeholder; TS PASS; Build PASS  
**Report:** `ERP_HR_10_SINGLE_HR_SEARCH_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.11 — Reports / Print / Export / Email

**Goal:** 15 core HR reports, HR letter generation, email send-with-preview.

**Server actions:** `generateHRReport(reportType, filters)` — parameterised, server-side redacted; `generateHRLetter(templateCode, employeeId, params)` — generates DOCX/PDF; `sendHREmail(templateCode, employeeId, payload)` — preview + confirm pattern

**UI:**
- `/admin/hr/reports` — report library index with filter forms and export buttons
- All 15 core reports (§22.2) with PDF/Excel/CSV export
- HR letter generation (salary cert, NOC, warning letter) — DOCX/PDF reviewed before send
- Email preview modal: user sees template-rendered content before clicking "Confirm & Queue"

**Permissions:** Per-report permissions as defined in §22.2  
**Redaction:** Server-side masking applied before generating export files  
**Acceptance criteria:** All 15 core reports export correctly; salary report masked for non-payroll users; HR letter generates readable PDF (DOCX deferred — not in existing export engine); email preview shown before queue; TS PASS; Build PASS  
**Report:** `ERP_HR_11_REPORTS_PRINT_EXPORT_EMAIL_IMPLEMENTATION_REPORT.md`  
**SOT update:** Yes

---

### HR.12 — HR AI Integration

**Goal:** Connect Common AI phases to HR entities — AI fill, search, correction, compliance, letters.

**Implemented as 7 sub-phases (each approved separately by Sameer):**

| Subphase | Description |
|---|---|
| HR AI.1 | Registries + flags + permissions |
| HR AI.2 | AI fill from Emirates ID / Passport / Visa / Insurance / Training / CICPA |
| HR AI.3 | AI corrections + duplicate employee detection |
| HR AI.4 | Natural language HR search (extends Common AI.6) |
| HR AI.5 | Compliance checker + risk scoring + readiness explanation |
| HR AI.6 | New assistant actions: `PREPARE_HR_LETTER_DRAFT`, `PREPARE_RENEWAL_CHECKLIST`, `PREPARE_HR_EMAIL_DRAFT` |
| HR AI.7 | Full security audit of HR AI flags, permissions, sensitive data handling |

**DB migrations per subphase:** 7 HR AI feature flags (all `false` by default); 5 `ai.hr.*` permissions; Common AI.1 HR entity registries; Common AI.15 HR data quality rules

**Permissions:** `ai.hr.fill`, `ai.hr.review`, `ai.hr.apply`, `ai.hr.letters`, `ai.hr.admin`  
**Safety:** All AI suggestions require human accept/apply — no auto-save, auto-apply, auto-send  
**Acceptance criteria per subphase:** AI fill from document produces suggestion in AI Review tab; applying suggestion updates employee record with audit event; no auto-actions; no raw AI response in logs; TS PASS; Build PASS  
**Report (per subphase):** `ERP_HR_12_HR_AI_X_<SUBPHASE_NAME>_IMPLEMENTATION_REPORT.md`  
**SOT update:** After each subphase

---

### HR.13 — Security / RLS / QA / UAT Closure

**Goal:** Full security audit, RLS verification, UAT, final closure.

**Scope:**
- Verify all HR tables: `relrowsecurity=true, relforcerowsecurity=true`
- Verify append-only event tables: SELECT + INSERT policies only — confirmed no UPDATE, no DELETE
- Test all HR RLS helper functions with different user roles
- Test sensitive data masking (payroll, medical, disciplinary, passport, EID)
- Test supervisor limited view
- Test all UAT checklist items from HR.1–HR.12
- TypeScript: 0 errors
- Build: PASS

**Acceptance criteria:** Full security audit passed; all sensitive data correctly masked; no raw sensitive values in any log/export/draft; all UAT tests signed off by Sameer; final closure report produced  
**Report:** `ERP_HR_13_SECURITY_RLS_QA_UAT_CLOSURE_REPORT.md`  
**SOT update:** Yes — HR module marked CLOSED / PASS

---

## 26. Phase-by-Phase Acceptance Criteria

| Phase | Critical Go/No-Go Tests |
|---|---|
| HR.0 | All dependency tables confirmed live; plan approved by Sameer |
| HR.1 | All 18+ settings tables live with seeds; 28+ HR permissions with role mappings; EMP numbering rule active; HR email templates seeded; TS PASS; Build PASS |
| HR.2 | `employees` table live with RLS; CRUD works; profile shell loads with 10 tabs; employee code auto-generated; audit events include parent_employee_id; TS PASS; Build PASS |
| HR.3 | All 6 compliance tables live; add/edit each type works; expiry colour coding correct; medical section hidden without permission; DMS entity types registered; TS PASS; Build PASS |
| HR.4 | Attendance recorded (punch → summary); leave approved and balance deducted; shift displayed; TS PASS; Build PASS |
| HR.5 | Salary components save; gross calculated server-side; IBAN always masked; Payroll tab hidden for non-payroll; WPS SIF export generates valid CSV; TS PASS; Build PASS |
| HR.6 | At least 5 readiness dimensions calculated; general + site context types work; blocked employee shows unblock requirements with resolve links; TS PASS; Build PASS |
| HR.7 | PRO process staged through status values; disciplinary sub-section hidden without permission; EOS case with clearance checklist works; TS PASS; Build PASS |
| HR.8 | Candidate-to-employee conversion creates both rows in one transaction; recruitment link visible on Profile; onboarding checklist functional; TS PASS; Build PASS |
| HR.9 | All 14 dashboard sections load with real data; clicking alert navigates to correct Employee Profile tab; export works; TS PASS; Build PASS |
| HR.10 | Name search and EID search return correct results; advanced filters all work; AI search shows placeholder; TS PASS; Build PASS |
| HR.11 | All 15 core reports export correctly with server-side redaction; HR letter generates PDF (DOCX deferred); email preview shown before queue; TS PASS; Build PASS |
| HR.12 | AI fill produces suggestion in AI Review tab (not auto-applied); no raw AI response in any log; applying suggestion writes audit event; TS PASS; Build PASS (per subphase) |
| HR.13 | All HR tables RLS verified live; all sensitive masking correct; all UAT items signed off; 0 TS errors; Build PASS |

---

## 27. QA and UAT Strategy

### 27.1 Automated Checks

```bash
npx tsc --noEmit    # 0 errors required — every phase
npm run build       # PASS required — every phase
```

### 27.2 RLS Verification SQL

```sql
-- All HR tables must have RLS enabled and forced
SELECT tablename, relrowsecurity, relforcerowsecurity
FROM pg_class
JOIN pg_tables ON tablename = relname AND schemaname = 'public'
WHERE tablename LIKE 'employee%' OR tablename LIKE 'hr_%'
ORDER BY tablename;
-- Expected: ALL rows = (true, true)

-- Append-only tables: SELECT + INSERT only
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'employee_block_events',
    'employee_salary_revisions',
    'employee_status_events',
    'employee_attendance_corrections'
  )
ORDER BY tablename, cmd;
-- Expected: SELECT and INSERT policies only — no UPDATE, no DELETE
```

### 27.3 Core Product UX Tests (HR.9 / HR.10 / HR.13)

| Test | Expected Result |
|---|---|
| Open HR Dashboard | Only ONE dashboard at `/admin/hr/dashboard` |
| Open HR Search | Only ONE search at `/admin/hr/search` |
| Navigate sidebar | No "Compliance" main item; no "Medical Insurance" main item |
| Dashboard: click expired CICPA alert | Opens Employee Profile → Compliance tab → Access Cards section |
| Dashboard: click missing IBAN | Opens Employee Profile → Payroll & WPS tab |
| Dashboard: click pending PRO | Opens Employee Profile → HR Actions tab |
| Update employee compliance | Done from Compliance tab inside Employee Profile — no separate screen |
| Search by name | Returns matching employees |
| Search by EID number | Returns matching employee |
| AI search (before HR.12) | Shows placeholder message — no error |

### 27.4 Permission Tests

| User Role | Expected Access |
|---|---|
| `hr_officer` | Can view employee list; cannot see salary figures; cannot archive employee |
| `payroll_officer` | Salary visible (unmasked); cannot edit non-payroll profile fields |
| `supervisor` | Basic profile, attendance, leave, readiness visible; salary hidden; medical hidden; disciplinary hidden |
| `hse_officer` | Medical fitness records visible; disciplinary hidden; salary hidden |
| Non-HR user | Gets permission denied on all HR routes |

### 27.5 Sensitive Data Tests

| Test | Expected Result |
|---|---|
| Non-payroll user views employee profile | Payroll tab: salary shows `***`; IBAN shows `AE**...**` |
| Non-payroll user exports employee list | Export file: salary columns show `***` |
| Any user views Payroll tab | IBAN always masked regardless of role |
| Non-medical user views Compliance tab | Medical Records sub-section completely hidden |
| Non-disciplinary user views HR Actions | Disciplinary sub-section hidden; badge "HR Hold Active" shown only |
| Supervisor views audit trail | Salary old/new values masked; medical change details hidden |

### 27.6 AI Safety Tests (HR.12)

| Test | Expected Result |
|---|---|
| Upload Emirates ID → AI processes | Suggestion appears in AI Review tab — NOT auto-applied |
| User clicks Accept then Apply | Employee identity doc field updated with audit event |
| HR letter AI draft | AI drafts text; user edits if needed; user clicks Confirm Send — not auto-sent |
| AI email draft | Email preview shown; user confirms; email queued — no auto-send |
| Check `audit_logs` for AI events | No raw OCR text, no raw AI prompt/response in any log row |

### 27.7 Child Audit Metadata Tests

| Test | Expected Result |
|---|---|
| Add identity document | `audit_logs.metadata_json` includes `parent_employee_id`, `employee_code`, `employee_name` |
| Add training certificate | Same as above |
| Add disciplinary action | Sensitive details in `new_values` — masked in Employee Audit tab for non-authorized |
| Employee Audit tab | Shows ALL child record events with full context |

### 27.8 Full UAT Checklist Summary

| Phase | Key UAT Items |
|---|---|
| HR.1 | All settings screens accessible; CRUD each lookup type |
| HR.2 | Add employee; profile loads; overview shows; edit profile; employee code auto-generated |
| HR.3 | Add each compliance type; expiry colours correct; DMS link works; medical hidden without permission |
| HR.4 | Record attendance; approve leave; leave balance calculated; shift visible on profile |
| HR.5 | Salary visible only to payroll user; IBAN always masked; WPS SIF exports correctly |
| HR.6 | Assignment recorded; readiness dimensions correct; blocked reason shows with resolve links |
| HR.7 | PRO process stages through workflow; disciplinary hidden without permission; EOS clearance tracked |
| HR.8 | Candidate → Employee conversion; recruitment link on Profile; onboarding checklist works |
| HR.9 | All 14 sections load; alert clicks navigate to correct tab; export works |
| HR.10 | Keyword search returns correct employees; advanced filters all functional |
| HR.11 | All 15 reports export; salary redacted in exports for non-payroll; letter generated correctly |
| HR.12 | AI fill produces suggestions (not auto-applied); AI search returns reasonable results |
| HR.13 | Full RLS verified; all sensitive masking tested; all UAT items re-confirmed |

---

## 28. Risks, Dependencies, and Deferred Items

### 28.1 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Sensitive data leak (payroll/medical) | CRITICAL | RLS helpers + server-side masking + draft denylist |
| IBAN/account number exposure | CRITICAL | Never returned in client payload; always server-masked |
| Creating duplicate global master tables | HIGH | Strict adherence to §2.5 Master Data Reuse Matrix |
| Company-scope RBAC mismatch | HIGH | Cursor must inspect `current_user_has_permission_in_company()` pattern before writing HR RLS |
| Unlimited employee scale | HIGH | **CONFIRMED DESIGN CONSTRAINT (Sameer, 2026-06-18).** Mitigations: (1) Employee list — server-side pagination, default 50/page, no full-table client load; (2) HR Search — server-side indexed filters + result pagination + AI search returns scoped/paginated results; (3) HR Dashboard — aggregate queries only, no full employee table loading, cache/materialized summaries where needed; (4) Reports/Exports — require filters for large reports, batch/chunk export generation, server-side redaction, audit log includes filter summary + row count (not raw sensitive values); (5) Attendance — indexed by employee/date, raw punches separated from daily summaries; (6) Readiness — cached `employee_readiness_status`, recompute on relevant changes only (not on every page load); (7) Indexes — added in the same phase as each table is created, not deferred. |
| Attendance data volume | MEDIUM | Separate raw punch + daily summary tables; partial indexes |
| Readiness engine performance | MEDIUM | `employee_readiness_status` as cached table — recompute on relevant change events |
| DMS entity type not registered for HR sub-entities | MEDIUM | Must update `dms-entity-types.ts` when adding each new entity type |
| Finance/costing scope creep | MEDIUM | Explicit exclusion list in phase scope definitions |
| Wrong FK migration order | MEDIUM | `hr_mohre_establishments` and `hr_employee_categories` must be created before `employees` |
| Fleet/Equipment FK in Operations tab | LOW | Text fields only for assets until Fleet module exists |

### 28.2 Migration Order (Critical)

```
HR.1 first:
  hr_employee_categories
  hr_employment_types
  hr_identity_document_types
  hr_access_card_types
  hr_training_categories
  hr_training_types
  hr_medical_record_types
  hr_leave_types
  hr_relationship_types
  hr_salary_component_types
  hr_payroll_groups
  hr_mohre_establishments   ← before employees
  hr_pro_process_types
  hr_readiness_rule_templates
  hr_role_requirement_matrix
  hr_site_requirement_matrix
  hr_approval_workflows

HR.2:
  employees                 ← after all HR.1 settings tables + COMMON MD.1 tables confirmed
  employee_status_events
  employee_document_links

HR.3:
  employee_identity_documents
  employee_medical_insurances
  employee_dependents
  employee_access_cards
  employee_training_certificates
  employee_medical_records

...and so on per phase.
```

### 28.3 Dependencies

| Dependency | Status |
|---|---|
| `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `approval_roles` | ✅ LIVE (COMMON MD.1) |
| `countries`, `emirates`, `cities` | ✅ LIVE |
| `banks` (Finance Basics) | ✅ LIVE |
| `DmsEntityDocumentsTab` | ✅ LIVE |
| Common AI provider bridge | ✅ LIVE |
| `logAudit()`, `getAuthContext()`, `hasPermission()` | ✅ LIVE |
| `erp_email_queue`, `erp_notification_templates` | ✅ LIVE |
| `ERPRecordWorkspaceForm`, `ERPChildDialogForm`, `ERPCombobox`, `useWorkspaceFormDraft` | ✅ LIVE |
| `generateNextReference()` | ✅ LIVE |
| Fleet module (vehicle assignment) | ❌ Deferred |
| Finance module (payroll run, payslips, costing) | ❌ Deferred |
| Biometric hardware integration | ❌ Deferred |
| Employee self-service portal | ❌ Deferred |

### 28.4 Deferred Items

| Item | Deferred To |
|---|---|
| Employee self-service (portal) | HR.14+ |
| Finance / payroll run / payslips | Finance module |
| Biometric system integration | HR.14+ or separate integration phase |
| Vehicle / equipment assignment | After Fleet module |
| WPS bank transfer automation | After banking integration |
| EOS gratuity calculation | Finance module |
| Extended reports (32 reports) | HR.11 extension |
| LMS (Learning Management System) | HR.16+ |
| Manpower planning analytics | HR.17+ |

---

## 29. Confirmed HR.0 Decisions from Sameer

All decisions confirmed by Sameer on 2026-06-18. No open questions remain before HR.1 prompt generation.

| # | Question | Confirmed Decision | Status |
|---|---|---|---|
| 1 | Employee code format? | `EMP-{SEQ6}` → `EMP-000001`. HR.1 seeds `EMP` numbering rule with format `{DOC}-{SEQ6}`. `{YYYY}` token not supported — not used. | ✅ CLOSED |
| 2 | Can one employee belong to 2+ `owner_companies` simultaneously? | One employer company per employee in v1 via `employees.owner_company_id`. No multi-company assignment in v1. | ✅ CLOSED |
| 3 | Leave balance reset: joining anniversary or calendar year? | Joining anniversary as default leave reset basis. Configurable in HR Settings. | ✅ CLOSED |
| 4 | WPS applicable to all employees by default? | YES — applicable by default. Per-employee exemption allowed where legally/operationally required. | ✅ CLOSED |
| 5 | Probation period default duration? | Configurable. Default: as stated in the employment contract. | ✅ CLOSED |
| 6 | Expiry alert threshold (30/60/90 days)? | 60 days default. Configurable per document/access/training/insurance rule. | ✅ CLOSED |
| 7 | CICPA pass: site-specific or global? | Configurable by access card type and readiness rule. Not hardcoded globally or site-specifically. | ✅ CLOSED |
| 8 | EOS: should HR calculate gratuity amounts? | NO — deferred to Finance module. HR v1 handles EOS process and clearance only. | ✅ CLOSED |
| 9 | Employee photo: DMS pipeline or direct bucket? | DMS pipeline via `photo_dms_document_id`. No separate direct bucket upload in v1. | ✅ CLOSED |
| 10 | Salary certs / NOC format? | PDF v1 via existing `exportToPDF()`. DOCX deferred — not in existing export engine. AI assists with letter content in HR.12. | ✅ CLOSED |
| 11 | Maximum expected employee count? | Unlimited / scalable enterprise design required. All HR data access server-side paginated/indexed. No client-side full-table loading. | ✅ CLOSED |
| 12 | HR.12 AI priority: fill vs readiness explanation first? | AI Search + AI Fill are first priorities when HR AI starts in HR.12. HR AI remains deferred until HR.12. | ✅ CLOSED |
| 13 | Leave approval: single-level or multi-level? | HR Manager only default (single level). Configurable via `hr_approval_workflows` for future multi-level approvals. | ✅ CLOSED |
| 14 | Arabic name: required or recommended? | Strongly recommended for UAE compliance output. NOT DB `NOT NULL` in v1. | ✅ CLOSED |

---

## 30. Cursor Implementation Readiness Checklist

### Before Every Phase

- [ ] Read `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- [ ] Read this master plan (current version)
- [ ] Read previous phase implementation report
- [ ] Connect to live DB via `user-supabase` (`mmiefuieduzdiiwnqpie.supabase.co`) — NOT `plugin-supabase-supabase`
- [ ] Verify Sameer has approved the specific phase prompt

### Master Data Reuse Check (Before Creating Any Table)

- [ ] Check: does this data already exist in `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `approval_roles`, `countries`, `emirates`, `cities`, `banks`, `owner_companies`, `branches`?
- [ ] If YES → use FK. Do NOT create a new HR-specific table.

### Architecture Standards Check

- [ ] All PKs: `BIGINT GENERATED ALWAYS AS IDENTITY`
- [ ] All tables: `ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`
- [ ] All server actions: `'use server'` + `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()`
- [ ] All child audit events: `parent_employee_id` + `employee_code` + `employee_name` in `metadata_json`
- [ ] Employee workspace form: `useWorkspaceFormDraft` with sensitive field denylist
- [ ] All async dropdowns: `ERPCombobox` — never shadcn `<Select>` for async data
- [ ] New HR query keys under `queryKeys.hr.*` namespace
- [ ] No direct OpenAI imports — use Common AI provider bridge only
- [ ] Redaction server-side before client payload
- [ ] Append-only tables: SELECT + INSERT policies only

### Post-Phase Required

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run build` → PASS
- [ ] All new HR tables confirmed in live DB with `relrowsecurity=true, relforcerowsecurity=true`
- [ ] Implementation report created: `implementation_Review/HR_Phases/Phase_HR_XX/`
- [ ] SOT updated with phase closure
- [ ] Sameer approval before next phase

---

## 31. Final Implementation Feasibility Review

### 31.1 Plan Strength Rating

| Dimension | Rating | Notes |
|---|---|---|
| Architecture readiness | **PASS** | BIGINT PKs, RLS pattern, RBAC pattern, audit pattern all defined. Confirmed live helpers available. |
| Master data integration | **PASS** | §2.5 matrix complete. All 16 global tables/components confirmed live. `approval_roles` added. No duplicate tables planned. |
| DMS integration | **PASS** | `employee` + `employee_compliance` entity types confirmed registered. Additional types planned per phase. `DmsEntityDocumentsTab` ready. `employee_document_links` approach defined. |
| AI integration readiness | **PASS** | Common AI stack confirmed complete. HR AI deferred to HR.12. AI-readiness requirements added to HR.2–HR.10. All 7 HR AI subphases defined. |
| RLS / security readiness | **PASS** | Confirmed live RLS helper functions named and documented. `current_user_has_permission_in_company()` identified for multi-company scope. Medical, payroll, disciplinary each have dedicated helpers. Sensitive field denylist defined. |
| Database schema completeness | **PASS** | All referenced tables are now defined in the plan. Migration order documented (§28.2). Recommended indexes added (§16.10). Soft-delete standard consistent. Append-only event tables identified. |
| Implementation phase clarity | **PASS** | HR.0–HR.13 each have: goal, scope, DB migrations, server actions, UI, permissions/RLS, DMS, AI readiness, acceptance criteria, TS/build, report, SOT update. |
| Report / email / export plan | **PASS** | 15 core reports defined; 32 extended deferred. Server-side redaction rule explicit. Email preview pattern defined. |
| UAT completeness | **PASS** | Product UX, permission, sensitive data, AI safety, and child audit metadata tests all defined. |
| **Overall risk level** | **LOW–MEDIUM** | Low architectural risk. Medium operational risk around sensitive data masking at scale and company-scope RBAC alignment. |

### 31.2 Remaining Gaps Before HR.0

The following must be checked or confirmed during HR.0 before any implementation starts:

1. **Live DB inspection**: Confirm `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `approval_roles` have seed data and are usable for FK references.
2. **Numbering rule**: `EMP` rule code is NOT yet seeded in `global_numbering_rules` — HR.1 must create it. Live engine format tokens: `{DOC}`, `{SEQ}`, `{SEQ3}`, `{SEQ4}`, `{SEQ5}`, `{SEQ6}` — NO `{YYYY}` token. Use `{DOC}-{SEQ6}` format with rule_code=`EMP` to produce `EMP-000001`. Sameer must confirm code format before HR.1.
3. **Geography tables**: Confirm `countries`, `emirates`, `cities` exist with UAE data (particularly all 7 emirates).
4. **Area/zones**: Inspect if `area_zones` table exists — plan references it as "inspect live schema."
5. **Bank data**: Confirm `banks` table has UAE bank data (NBD, FAB, ADCB, etc.) — employees cannot be created without valid bank references.
6. **Open questions §29**: Questions 1, 2, 8, 11, 13 must be decided by Sameer before HR.0 closes.

### 31.3 Remaining Gaps Before HR.1

**No open business decisions remain before HR.1 prompt generation.**

All 14 §29 decisions were confirmed by Sameer on 2026-06-18. See §29 for the complete decision table.

Technical requirements still apply before implementation begins:
1. **HR.1 implementation prompt** must be explicitly approved by Sameer before Cursor starts any HR.1 code.
2. **Cursor must read** this master plan, the HR.0 report, and the SOT before starting any HR.1 implementation work.
3. **Cursor must implement HR.1 only** — no HR.2+ work in the same phase.

Minor items that may be refined during HR.1 implementation (not blocking):
- **Training types scope**: The 20+ training type seed list in §15 is a starting point. Sameer may confirm or expand (e.g., additional ADNOC-specific certifications) when reviewing the HR.1 seed SQL.
- **Payroll groups**: MONTHLY + WEEKLY assumed as defaults. Sameer may add fortnightly or project-based pay groups in the HR.1 settings seed.
- **MOHRE establishment count**: Seeded as configurable. Sameer confirms actual ALGT establishments when reviewing the HR.1 migration.
- **Leave approval workflow**: Single-level HR Manager default is confirmed. Multi-level is configurable via `hr_approval_workflows` and can be configured post-HR.1.

### 31.4 Cursor Warnings

The following warnings must be respected in every HR implementation phase:

```text
⚠ DO NOT implement more than one HR phase at a time.
  Each phase requires separate Sameer approval before starting.

⚠ DO NOT create duplicate master data tables.
  Check §2.5 Master Data Reuse Matrix before creating any new table.
  Specifically: DO NOT create hr_departments, hr_designations, hr_sites,
  hr_calendars, hr_shifts, hr_banks, hr_nationalities, hr_email_queue,
  hr_audit_logs, or any HR fork of a global table.

⚠ DO NOT create finance/accounting scope in HR v1.
  No payroll run. No payslips. No accounting posting. No gratuity calculation.
  No salary payment history. These belong to the Finance module.

⚠ DO NOT create a separate Compliance working module.
  Compliance screens (legal docs, insurance, dependents, access cards,
  training, medical, PRO) must remain inside Employee Profile tabs only.

⚠ DO NOT make AI auto-save, auto-apply, or auto-send anything.
  Every AI suggestion requires explicit human Accept → Apply.
  Every AI email draft requires explicit human Confirm → Queue.
  No raw OCR text, raw AI prompt, or raw AI response in any log.

⚠ DO NOT expose sensitive data in UI responses, exports, workspace drafts, or logs.
  Sensitive fields (IBAN, salary, passport_number, emirates_id_number,
  medical_result, restriction_details, disciplinary_details) must be
  masked server-side before reaching the client.
  IBAN is ALWAYS masked — no exception for any role.

⚠ DO NOT invent new RBAC helper functions.
  Use the existing confirmed DB functions:
  current_user_has_permission(), current_user_has_permission_in_company(),
  current_user_has_role(), current_user_is_global_admin().
  Cursor must align with the existing multi-company RBAC pattern in
  src/lib/rbac/check.ts before writing any HR RLS function.

⚠ DO NOT add hr_candidate_id to employees table in HR.2.
  employee_recruitment_links is created in HR.8 only.

⚠ DO NOT skip append-only enforcement.
  employee_status_events, employee_block_events, employee_salary_revisions,
  employee_attendance_corrections must have SELECT + INSERT policies only.
  No UPDATE, no DELETE policies on these tables.

⚠ DO NOT load all employees into client memory.
  Employee count is UNLIMITED by design (confirmed by Sameer, 2026-06-18).
  All HR lists, dashboards, reports, exports, and search results must be
  server-side paginated or aggregated. Default page size: 50.
  No component may fetch all employees and filter/sort client-side.

⚠ DO NOT defer database indexes to a later phase.
  Every HR table created in any phase must have its indexes
  added in the same migration. Scalability is a design constraint,
  not a future optimisation task.
```

### 31.5 Final Go / No-Go

```text
✅ THIS PLAN IS READY FOR HR.0 READINESS AUDIT.

This plan is a planning document only.
It does not instruct immediate implementation.

Implementation must start only after:
  1. Sameer explicitly approves the HR.0 prompt.
  2. HR.0 Readiness Audit confirms live DB and codebase are ready.
  3. Sameer approves each subsequent phase prompt individually.

No HR code, migration, route, or component must be created
before Sameer approves the specific phase prompt for that phase.
```

---

*Last updated: 2026-06-18 — HR.0 Final Decision Confirmation applied (see Revision Notes at top).*  
*Last reviewed against SOT: 2026-06-18.*  
*Latest confirmed AI foundation state: ERP COMMON AI.15 (last major phase) + ERP COMMON AI FIX.1 (hotfix). Common AI.1–AI.7 and AI.13–AI.15 complete for existing ERP scope. AI.8 HR AI deferred until this HR module exists.*  
*Supabase project: `mmiefuieduzdiiwnqpie.supabase.co` — MCP: `user-supabase`.*  
*Employee count decision: Unlimited / scalable enterprise design confirmed by Sameer on 2026-06-18.*  
*HR.0 final decision confirmation completed by Sameer on 2026-06-18.*  
*Status: HR.0 ready to close; ready for HR.1 implementation prompt generation.*
