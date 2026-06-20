

---

# Revision Notes — 2026-06-18 Correction Update

- Corrected Source of Truth reference to last confirmed closed gate (ERP COMMON AI.15 + FIX.1 hotfix). Common AI.1–AI.7 and AI.13–AI.15 are complete for existing ERP scope. AI.8 HR AI remains deferred until real HR module exists.
- Added Master Data Reuse Matrix (§2.5) — HR must never duplicate existing global tables.
- Reinforced single Employee Profile / single Dashboard / single Search as non-negotiable product rules (§4).
- Removed all finance/costing scope (salary payment history, gratuity calculation, accounting posting) from HR v1.
- Improved database schema: removed premature `hr_candidate_id` FK from `employees`; added `employee_recruitment_links` deferred to HR.8; added UAE-specific optional fields on `employee_identity_documents`; added `hr_mohre_establishments` table; replaced `UNIQUE(employee_id, attendance_date)` constraint with daily summary approach; expanded readiness to support context types (general/site/client/role/assignment); added `employee_document_links` as preferred DMS many-to-many approach; standardised soft-delete columns across all tables; added parent employee metadata on all child audit events.
- Reordered implementation phases: HR.0–HR.13 (13 phases). Recruitment & Onboarding moved to HR.8 after Operations. Reports/Email/Export separated before HR AI. Final QA closure now HR.13.
- Corrected RLS/permissions: replaced `hr.employees.delete` with `hr.employees.archive`; added supervisor limited-view concept; added company-scope alignment note; confirmed medical/payroll RLS helper functions.
- Added HR AI subphases (HR AI.1–HR AI.7) planned for HR.12.
- Added AI readiness requirements to HR.2–HR.10 (entity types, route links, DMS links, deterministic outputs, AI Review tab placeholder).
- Added email preview requirement; confirmed no AI auto-send.
- Split 47 reports into 15 Core (HR.11) and 32 Extended (later phases or HR.11 extension).
- Added new UAT tests: single dashboard, single search, drill-down, compliance from profile, non-payroll export masking, supervisor limited view, child audit parent_employee_id.
- Updated open questions with recommended defaults.

---


# 1. Executive Summary

The ALGT ERP HR Module is a complete, enterprise-grade Human Resources management system designed for Alliance Gulf's UAE transport, logistics, demolition, and workshop operations. It is heavily influenced by:

- **ADNOC site/plant access requirements** — CICPA passes, ATA training, ADSD, WMS/PTW, offshore medical
- **UAE Labour Law and MOHRE compliance** — WPS, Emirates ID, labour card, residence visa
- **Multi-site/multi-company operations** — company, branch, department, designation, work site
- **PRO (Public Relations Officer) process management** — visa/Emirates ID/labour card renewals
- **Readiness-driven HR** — employees cannot be assigned unless fully compliant

## Core Design Philosophy

1. **One Employee Profile** — the central workspace for all HR data
2. **One HR Dashboard** — aggregated monitoring view; drill-down opens Employee Profile at the relevant tab
3. **One HR Search** — unified search across all HR dimensions
4. **Compliance-first** — every compliance domain lives inside Employee Profile tabs, not separate modules
5. **AI-assisted, human-confirmed** — AI fills, suggests, and flags; humans review and approve every action
6. **DMS-backed documents** — all physical documents stored and linked via existing DMS
7. **Master data reuse** — HR never duplicates tables that already exist globally

## Phase Summary (HR.0 – HR.13)

| Phase | Name | Key Output |
|---|---|---|
| HR.0 | Readiness Audit | Final plan confirmation, no implementation |
| HR.1 | HR Settings Foundation | All HR lookup/config tables, permissions |
| HR.2 | Employee Master + Profile Shell | `employees` table, list, Overview + Profile tabs |
| HR.3 | Compliance Inside Employee Profile | Legal docs, insurance, dependents, access cards, training, medical |
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

# 2. Current ERP Context and Assumptions

## 2.1 What Already Exists (Relevant to HR)

| Component | Status | Notes |
|---|---|---|
| `owner_companies` table | LIVE | Extended with trade_name, main_activity, compliance_status (COMMON MD.1) |
| `branches` table | LIVE | Extended with emirate_id, city_id, cost_center_id (COMMON MD.1) |
| `departments` table | LIVE | Created in COMMON MD.1 |
| `designations` table | LIVE | Created in COMMON MD.1 |
| `work_sites` table | LIVE | Created in COMMON MD.1 |
| `work_calendars` + `work_shifts` | LIVE | Created in COMMON MD.1 |
| `approval_roles` table | LIVE | Created in COMMON MD.1 |
| `countries` table | LIVE | Global geography — used for nationality, issue country |
| `emirates` / `cities` / `areas` tables | LIVE | Global geography lookups |
| `banks` table | LIVE | Finance Basics — employee WPS bank FK |
| `dms_required_document_rules` | LIVE | 8 seeded rules; HR rules added in HR.3 |
| DMS full stack (DMS.1–DMS.15) | LIVE | OCR, AI summary, extraction, batch intake, semantic search |
| `DmsEntityDocumentsTab` | LIVE | Ready for any entity — import from `@/features/dms/entity-documents` |
| Common AI stack (AI.0–AI.7, AI.13–AI.15) | LIVE | Complete for existing ERP scope — AI.8 HR AI deferred |
| `erp_ai_feature_flags` | LIVE | HR AI flags added in HR.12 |
| `ai.*` permissions (34 codes) | LIVE | HR AI will extend with `ai.hr.*` codes in HR.12 |
| `logAudit()` | LIVE | Standard audit helper — all HR mutations use this |
| `getAuthContext()` + `hasPermission()` | LIVE | Standard RBAC — all HR server actions use these |
| `ERPRecordWorkspaceForm` | LIVE | Main employee form |
| `ERPChildDialogForm` | LIVE | All HR child records |
| `ERPCombobox` | LIVE | All async HR dropdowns |
| `useWorkspaceFormDraft` | LIVE | Employee workspace form must use this |
| `queryKeys` + `invalidation` | LIVE | HR adds keys under `queryKeys.hr.*` |
| Party Master | LIVE | Employees are NOT Party records — separate `employees` table |
| Email engine (SETTINGS.2 + NOTIFICATIONS.1) | LIVE | HR emails via existing `erp_email_queue` |

## 2.2 What Does NOT Exist Yet

- No `employees` table or any HR-specific tables
- No HR routes, sidebar items, server actions, or UI
- No HR permissions or HR AI feature flags
- No HR AI integration (deferred to HR.12)
- No HR-specific DMS entity types beyond what DMS.15 pre-registered (`employee`, `employee_compliance`)

## 2.3 Confirmed ERP AI Status

**Last confirmed closed gate:** ERP COMMON AI.15 — AI Data Quality Monitor (**CLOSED / PASS ✅**)  
**Previous hotfix:** ERP COMMON AI FIX.1 — Critical AI Audit Fixes (**CLOSED / PASS ✅**)

**Common AI phases complete for existing ERP scope:** AI.0, AI.1A–AI.1G, AI.2, AI.3, AI.4, AI.5, AI.6, AI.7, AI.13, AI.14, AI.15  
**Deferred (module-specific AI):** AI.8 (HR), AI.9 (Fleet), AI.10 (Workshop), AI.11 (Procurement), AI.12 (Transport) — none may be implemented until their base ERP module exists.

## 2.4 Existing Patterns HR Must Follow

```typescript
// Standard server action pattern
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

## 2.5 Master Data Reuse Matrix

**Non-negotiable rule:** The HR module must reuse existing system/common master data wherever available. Cursor must **never** create duplicate HR-specific tables for data that already exists globally.

| Data / Function | Reuse Existing Source | Do NOT Create |
|---|---|---|
| Owner company / employer / sponsor | `owner_companies` | ~~hr_companies~~ |
| Branch | `branches` | ~~hr_branches~~ |
| Departments | `departments` | ~~hr_departments~~ |
| Designations | `designations` | ~~hr_designations~~ |
| Work sites / locations | `work_sites` | ~~hr_sites~~ |
| Work calendars | `work_calendars` | ~~hr_calendars~~ |
| Work shifts | `work_shifts` | ~~hr_shifts~~ |
| Countries / Nationalities | `countries` (existing global) | ~~hr_nationalities~~ |
| Emirates / Cities / Areas | existing global geography tables | ~~hr_emirates~~ |
| Banks | `banks` (Finance Basics) | ~~hr_banks~~ |
| DMS documents | existing DMS + `DmsEntityDocumentsTab` | ~~hr_documents_store~~ |
| Required document rules | `dms_required_document_rules` | ~~hr_document_rules~~ |
| Email queue | `erp_email_queue` | ~~hr_email_queue~~ |
| Notification templates | `erp_notification_templates` | ~~hr_templates~~ |
| Audit logs | `audit_logs` via `logAudit()` | ~~hr_audit_logs~~ |
| RBAC | `getAuthContext()` + `hasPermission()` | ~~hr_permission_check~~ |
| Query keys / invalidation | existing `queryKeys` + invalidation helpers | ~~hr_query_helpers~~ |
| Workspace form | `ERPRecordWorkspaceForm` | ~~HRRecordForm~~ |
| Child dialogs | `ERPChildDialogForm` | ~~HRChildDialog~~ |
| Async dropdowns | `ERPCombobox` | ~~HRDropdown~~ |
| Export / print engine | existing global engine if available | — |
| AI provider bridge | existing Common AI provider bridge | ~~hr_ai_provider~~ |

**Field-level reuse examples:**
- `employees.nationality_id` → `countries.id` (NOT a new `hr_nationalities` table)
- `employees.owner_company_id` → `owner_companies.id`
- `employees.branch_id` → `branches.id`
- `employees.department_id` → `departments.id`
- `employees.designation_id` → `designations.id`
- `employees.primary_work_site_id` → `work_sites.id`
- `employee_shift_assignments.work_calendar_id` → `work_calendars.id`
- `employee_shift_assignments.work_shift_id` → `work_shifts.id`
- `employee_wps_profiles.bank_id` → `banks.id` (Finance Basics)
- `employee_identity_documents.issue_country_id` → `countries.id`

---

# 3. Non-Negotiable Architecture Rules

| Rule | Requirement |
|---|---|
| Primary keys | BIGINT identity, never UUID |
| RLS | Enabled + Forced on all HR tables — never disable |
| Server mutations | `getAuthContext()` → `hasPermission()` → Zod → `logAudit()` → `revalidatePath()` |
| Async dropdowns | `ERPCombobox` or approved wrapper — never shadcn `<Select>` for async data |
| Main forms | `ERPRecordWorkspaceForm` + `useWorkspaceFormDraft` |
| Child forms | `ERPChildDialogForm` |
| Query keys | Under `queryKeys.hr.*` namespace |
| Bank details | Reference `banks.id` from Finance Basics — no free-text bank names |
| Documents | Via existing DMS (`DmsEntityDocumentsTab`) — no custom file upload |
| Email | Via existing `erp_email_queue` — no direct SMTP calls |
| AI | Via existing Common AI provider bridge — no new provider patterns, no direct OpenAI imports |
| Sensitive fields | Never in workspace draft store (IBAN, passport_number, emirates_id_number, salary, basic_salary, gross_salary, medical_result, restriction_details, disciplinary_details) |
| Sensitive redaction | Must happen **server-side** before data reaches UI or export generator |
| Audit child events | All child-record mutations log `parent_employee_id`, `employee_code`, `employee_name` |
| Employees archive | Employees are **archived** (soft delete) — never hard deleted. Use `hr.employees.archive`, not `hr.employees.delete` |
| No finance/costing | Employee cost analytics, gratuity calculation, accounting posting — all deferred to Finance module |
| No auto-AI | No auto-save, auto-approve, auto-merge, auto-delete, auto-send from AI |
| No UUID | Unless Sameer explicitly approves for a specific case |
| Master data reuse | Always reuse existing global tables — see §2.5. Never create duplicate HR-specific tables |

---

# 4. HR Product Principles

## 4.1 Employee Profile is the Central Workspace

The main workflow is:
```
HR Dashboard (alert) → Employees list → Open Employee Profile → Update in tabs
```

**Do not create** separate operational screens for:
- Compliance documents
- Medical insurance
- Dependents
- Access cards
- Training certificates
- Medical records
- PRO renewals for a single employee
- Employee documents

All of these are maintained inside Employee Profile tabs.

## 4.2 Compliance-Driven Operations

ALGT operates on ADNOC, CICPA-regulated, and client-controlled sites. An employee cannot be deployed unless all legal documents, medical fitness, training/certifications, access cards, and medical insurance are valid, and no HR or disciplinary hold is active. The HR module surfaces these as a **Readiness Score** per employee.

## 4.3 UAE/ADNOC/CICPA Specifics

| Concept | Description |
|---|---|
| CICPA Pass | Capital Infrastructure & Contracting Partners Association — required for ADNOC sites |
| ADNOC ATA | ADNOC Approved Training for site access |
| H2S | Hydrogen Sulphide awareness — mandatory for oil/gas sites |
| ADSD | Abu Dhabi Safety Driving — mandatory for drivers on ADNOC/client sites |
| WMS/PTW | Work Method Statement / Permit to Work — safety qualification |
| WPS | Wage Protection System — UAE Ministry of Human Resources mandatory salary payment |
| MOHRE | Ministry of Human Resources and Emiratisation |
| Emirates ID | UAE national identity card — mandatory for all residents |
| PRO | Public Relations Officer — responsible for government document renewals |

## 4.4 Single HR Dashboard

**Rule:** There must be **only one HR Dashboard** — `/admin/hr/dashboard`.

The dashboard is for monitoring and drill-down only. It does not become a separate editing module. Clicking a dashboard row or alert must open Employee Profile directly at the relevant tab and related child record section.

| Example Alert | Opens |
|---|---|
| Expired CICPA | Employee Profile → Compliance tab → Access Cards section |
| Missing IBAN | Employee Profile → Payroll & WPS tab |
| Pending visa renewal PRO | Employee Profile → HR Actions tab → PRO Processes |
| H2S expired | Employee Profile → Compliance tab → Training section |
| Employee blocked | Employee Profile → Operations tab → Readiness section |

## 4.5 Single HR Search

**Rule:** There must be **only one HR Search engine** — `/admin/hr/search`.

It must search and filter across:
- Employee master profile, personal info, employment details
- Legal documents (Emirates ID, passport, visa, labour card)
- Medical insurance and dependents
- Access cards (CICPA, ADNOC, client site)
- Training certificates (H2S, ADSD, ADNOC ATA, etc.)
- Medical records and fitness status
- Attendance and leave
- Payroll / WPS readiness
- Assignments and readiness dimensions
- PRO processes
- DMS-linked HR documents
- AI findings and suggestions
- Audit metadata (where permission allows)

No multiple HR search engines. No separate compliance search. No separate training search.

## 4.6 AI — Deeply Integrated, Human-Review First

AI must be planned as deeply integrated across HR and the ERP:
- AI search (natural language HR queries)
- AI fill from uploaded documents (Emirates ID, passport, visa, insurance, CICPA, training certificates)
- AI correction suggestions
- AI compliance warnings
- AI readiness explanation (why is this employee blocked?)
- AI data quality checks
- AI duplicate detection
- AI HR letter/email drafts
- AI assistant actions

**AI must remain human-review first — without exception:**
- No auto-save
- No auto-approval
- No auto-delete
- No auto-merge
- No auto-send email
- No raw OCR text, AI prompts, or raw AI responses stored or displayed in any log or UI
- No direct OpenAI SDK imports outside the existing Common AI provider bridge

**AI.8 / HR AI implementation is deferred until real HR tables and screens exist (HR.12), but every phase from HR.2 onwards must be AI-ready** (stable entity types, route links, DMS document links, deterministic compliance outputs, audit metadata, AI Review tab placeholder).

## 4.7 Departments and Designations Reuse

`departments` and `designations` tables already exist from COMMON MD.1. HR must reference these directly — no new department/designation tables.

## 4.8 Work Sites and Calendars Reuse

`work_sites`, `work_calendars`, and `work_shifts` already exist. Employee assignments reference `work_sites`. Attendance uses `work_calendars` and `work_shifts`.

---

# 5. Final HR Sidebar

## 5.1 Sidebar Structure

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

## 5.2 Why These Main Menus

| Menu | Rationale | What Was Merged Into Employee Profile |
|---|---|---|
| **Dashboard** | Single aggregated monitoring view — no editing here | N/A |
| **Employees** | Master list + Employee Profile workspace | Compliance, documents, training, insurance, medical, access cards, PRO (per employee) |
| **Recruitment** | Workflow exists before the employee record is created | Pre-hire candidates, interviews, offer letters |
| **Attendance & Leave** | Daily operational view across all employees | Per-employee Time tab inside Profile |
| **Payroll & WPS** | Restricted permissions, salary-run workflow | Employee payroll profile inside Profile |
| **Assignments** | Cross-employee site readiness query | Per-employee Operations tab inside Profile |
| **End of Service** | Multi-department clearance workflow | Per-employee EOS case inside HR Actions tab |
| **HR Search** | Full-text + AI search across all HR dimensions | N/A |
| **HR Settings** | Admin config — categories, types, matrices, numbering | N/A |

**Not creating** separate main sidebar items for:
Compliance & Documents · Medical Insurance · Dependents · Access Cards · Training & Certifications · Medical Records · PRO Processes (per employee) — all inside Employee Profile.

---

# 6. Employee Profile Workspace Design

## 6.1 Route Structure

```
/admin/hr/employees                         ← Employee list
/admin/hr/employees/record/new              ← New employee form
/admin/hr/employees/record/[id]             ← Employee Profile workspace
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

## 6.2 Employee List Screen

**Route:** `/admin/hr/employees`

**Table columns:** Employee Code | Full Name EN | Nationality | Department | Designation | Status | Compliance Status | Readiness | Site | Joining Date | Actions

**Filters panel:** Company, Branch, Department, Designation, Category, Status, Nationality, Site, Employment Type, Expiry Alert, Readiness Status, HR Hold

**Actions per row:** Open Profile, Quick View (hover card), Upload Document, Quick Contact

**Table actions:** Add Employee, Export (Excel/CSV/PDF), Print, Filter, Search bar, AI Search toggle

## 6.3 Employee Profile Shell

**Component:** `EmployeeProfileWorkspaceForm` (extends `ERPRecordWorkspaceForm`)

**Header (always visible):**
```
[Photo] [Employee Code] [Full Name EN / Arabic Name]
        [Status Badge] [Compliance Badge] [Readiness Badge]
        [Department] [Designation] [Branch] [Site]
        [Joining Date] [Service Duration] [Mobile]
        [Edit] [Print] [Export] [Ask AI] [More Actions ▾]
```

**Tab bar (10 tabs):**
```
Overview | Profile | Compliance | Time | Payroll & WPS | Operations | HR Actions | Documents | AI Review | Audit
```

## 6.4 Lazy Loading Rule

Employee Profile tabs must **lazy-load** heavy sections:
- Overview and Profile load immediately on profile open
- Compliance, Time, Payroll & WPS, Operations, HR Actions, Documents, AI Review, and Audit load **only when the user opens that tab**

## 6.5 Permission-Controlled Tabs

| Tab | Hidden / Masked If |
|---|---|
| Payroll & WPS | User lacks `hr.payroll.view` — salary figures masked or tab hidden |
| Medical Records (in Compliance) | User lacks `hr.medical.view` — medical sub-section hidden |
| Disciplinary (in HR Actions) | User lacks `hr.actions.view` — disciplinary sub-section hidden |
| AI Review | User lacks `hr.ai.review` — hidden |
| Audit | Sensitive fields redacted based on data sensitivity and user permissions |

## 6.6 Dashboard / Search Drill-Down

Dashboard alerts and HR Search results must open the Employee Profile **directly at the relevant tab** and, where possible, highlight the related child record.

---

# 7. Employee Profile Tabs and Fields

## 7.1 Overview Tab

**Purpose:** Read-only summary with alerts, status cards, snapshots, and quick actions. No form editing on this tab.

**Component:** `EmployeeOverviewTab` (loads immediately — not lazy)

### 7.1.1 Critical Alerts Panel

A collapsible alert list. Badge count shows on the tab label if alerts > 0.

| Alert Type | Source Table | Severity | Dashboard / Search Link |
|---|---|---|---|
| Document expired | `employee_identity_documents` | CRITICAL | ✅ |
| Document expiring ≤60 days | `employee_identity_documents` | HIGH | ✅ |
| Medical insurance expired | `employee_medical_insurances` | CRITICAL | ✅ |
| Medical insurance expiring ≤60 days | `employee_medical_insurances` | HIGH | ✅ |
| Dependent document expiring | `employee_dependents` | MEDIUM | ✅ |
| CICPA / access card expired | `employee_access_cards` | CRITICAL | ✅ |
| Required training expired | `employee_training_certificates` | HIGH | ✅ |
| Medical fitness expired | `employee_medical_records` | HIGH | ✅ |
| Employee blocked | `employee_block_events` | CRITICAL | ✅ |
| Payroll hold | `employee_payroll_holds` | HIGH | ✅ |
| AI warning | Common AI findings | MEDIUM | ✅ |
| Data quality issue | `erp_ai_data_quality_findings` | VARIES | ✅ |
| Missing mandatory document | `dms_required_document_rules` | HIGH | ✅ |
| HR hold / disciplinary | `employee_disciplinary_actions` | HIGH | ✅ |

Each alert shows: severity · source tab · due/expiry date · quick action · dismiss (where appropriate)

### 7.1.2 New Summary Cards (added in correction update)

In addition to the 12 status summary cards, the Overview must include these 4 cards:

| Card | Content |
|---|---|
| **Next Critical Expiry** | Shows the single nearest upcoming expiry across all compliance records for this employee |
| **Renewal In Progress** | Count of active PRO processes, with stage summary |
| **Document Verification** | Verified count / Total linked documents — shows missing required docs |
| **AI / Data Quality** | Open AI suggestions count + data quality findings count |

### 7.1.3 Status Summary Cards (12 cards)

Each card: Status badge + last updated date + quick action button

| Card | Source Tables | Status Values |
|---|---|---|
| Legal Documents | `employee_identity_documents` | All Valid / Expiring / Expired / Incomplete |
| Medical Insurance | `employee_medical_insurances` | Active / Expiring / Expired / Not Covered |
| Dependents | `employee_dependents` count + doc status | All OK / Issues Found / None |
| Access Cards | `employee_access_cards` | All Valid / Expiring / Expired / Missing |
| Training | `employee_training_certificates` | Complete / Expiring / Expired / Missing Required |
| Medical Fitness | `employee_medical_records` | Fit / Restricted / Expired / Missing |
| Attendance (This Month) | `employee_attendance` | Present/Absent counts |
| Leave Balance | `employee_leave_balances` | Days remaining |
| Payroll / WPS | `employee_payroll_profiles` | Ready / Hold / Missing Data |
| Assignment Readiness | `employee_readiness_status` | Ready / Partially Ready / Blocked |
| AI Review | `erp_ai_field_suggestions` | Clean / Pending Suggestions |
| Documents | DMS link count + missing required | Complete / Incomplete |

> **Removed from Overview:** Employee cost analytics, salary payment history, last payment date, finance/accounting summaries. These are Finance module concerns and are deferred.

> **Payroll section in Overview shows only:** WPS status badge, payroll hold yes/no, bank/IBAN completeness (masked), salary profile exists yes/no.

### 7.1.4 Snapshots (collapsible panels)

| Snapshot | Key Data Shown |
|---|---|
| Compliance Snapshot | EID expiry, Visa expiry, Labour card expiry, Passport expiry |
| Assignment & Readiness | Current site, client, readiness score, blocked reason if any |
| Legal / Contract / Probation | Contract type, probation end, notice period, contract end |
| Medical Insurance & Dependents | Policy number, insurer, expiry, dependent count |
| Training & Site Access | CICPA status, H2S status, ADSD status, last training date |
| Attendance & Leave | Attendance %, leave balance, days absent this month |
| Payroll / WPS Snapshot | WPS status, payroll hold flag, IBAN completeness (masked) |
| PRO Process Snapshot | Open PRO processes count, next expected completion |
| Document Verification | Verified count, pending count, missing count |
| Assets / PPE / Accommodation | Camp, room, PPE issued, company mobile, SIM |
| HR Hold / Disciplinary | Active hold yes/no, last warning date, open cases |
| Emergency / HSE | Blood group, emergency contact name, emergency contact mobile |
| AI Summary | Last AI scan date, open suggestions count, last suggestion action |
| Recent Activity Timeline | Last 5 audit events on this employee from `audit_logs` |

### 7.1.5 Quick Actions

```
[Edit Employee] [Upload Document] [Renew Document] [Add Dependent]
[Add Access Card] [Add Training] [Add Leave Request] [Update Assignment]
[Generate HR Letter ▾] [Ask AI] [AI Review] [Print Profile] [Export ▾]
```

---

## 7.2 Profile Tab

**Purpose:** Core personal and employment data. Main editable form.  
**Draft:** `useWorkspaceFormDraft({ formId: "employee-profile-tab" })`

### Section A: Personal Information

| Field | Type | Required | Classification | Notes |
|---|---|---|---|---|
| Employee Code | Text (auto) | Yes | System | Auto-generated (`EMP-YYYY-000001`) |
| Full Name (English) | Text | Yes | UAE Mandatory | As per passport |
| Full Name (Arabic) | Text | Yes | UAE Mandatory | As per Emirates ID |
| Known Name / Short Name | Text | No | Operational | Display name |
| Gender | Select | Yes | UAE Mandatory | Male / Female |
| Nationality | ERPCombobox → `countries` | Yes | UAE Mandatory | `nationality_id → countries.id` |
| Date of Birth | Date | Yes | UAE Mandatory | |
| Marital Status | Select | No | Operational | Single / Married / Divorced / Widowed |
| Mobile Number | Text | Yes | Operational | +971 format |
| Personal Email | Email | No | Operational | |
| UAE Residential Address | Text | No | Operational | |
| Home Country Address | Text | No | Operational | |
| Blood Group | Select | Yes | HSE / ADNOC | A+ A- B+ B- O+ O- AB+ AB- |
| Photo | DMS link | No | Operational | Linked via DMS entity type `employee` |
| Emergency Contact Name | Text | Yes | Operational | |
| Emergency Contact Mobile | Text | Yes | Operational | |
| Emergency Contact Relationship | Select | Yes | Operational | FK `hr_relationship_types` |

### Section B: Employment Details

| Field | Type | Required | Classification | Notes |
|---|---|---|---|---|
| Employer Company | ERPCombobox → `owner_companies` | Yes | ALGT Operational | |
| Branch | ERPCombobox → `branches` | Yes | ALGT Operational | Filtered by company |
| Department | ERPCombobox → `departments` | Yes | ALGT Operational | Global `departments` table |
| Designation | ERPCombobox → `designations` | Yes | ALGT Operational | Global `designations` table |
| Employee Category | ERPCombobox → `hr_employee_categories` | Yes | ALGT Operational | HR-specific lookup |
| Employment Type | ERPCombobox → `hr_employment_types` | Yes | UAE Mandatory | HR-specific lookup |
| Joining Date | Date | Yes | UAE Mandatory | |
| Actual Joining Date | Date | No | ALGT Operational | May differ from official |
| Employee Status | Select | Yes | System | Active / Inactive / On Leave / Probation / Suspended / Terminated |
| Reporting Manager | ERPCombobox → `employees` | No | Operational | Self-referential FK |
| Direct Supervisor | ERPCombobox → `employees` | No | Operational | Self-referential FK |
| Work Location | ERPCombobox → `work_sites` | No | Operational | Global `work_sites` table |
| Sponsor Company | ERPCombobox → `owner_companies` | No | UAE Mandatory | May differ from employer |
| MOHRE Establishment | ERPCombobox → `hr_mohre_establishments` | No | UAE Mandatory | See §16.3 |
| Probation Start Date | Date | No | UAE Labour Law | |
| Probation End Date | Date | No | UAE Labour Law | Calculated from start + configurable days |
| Contract Type | Select | Yes | UAE Mandatory | Limited / Unlimited |
| Contract Start Date | Date | Yes | UAE Mandatory | |
| Contract End Date | Date | Conditional | UAE Mandatory | Required if Limited |
| Notice Period (Days) | Number | No | UAE Labour Law | |
| Inactive Date | Date | No | System | Auto-set on status change |
| Inactive Reason | Text | No | System | |

### Section C: Recruitment & Hiring History (read-only after hire, linked via `employee_recruitment_links`)

This section shows read-only data populated after HR.8 (Recruitment & Onboarding) is implemented.

---

## 7.3 Compliance Tab

**Purpose:** All legal, medical, training, insurance, dependent, and access card records.  
**Component:** `EmployeeComplianceTab` (lazy-loaded)

### Sub-section A: Legal Documents

**Table:** `employee_identity_documents`

| Field | Type | Required | Notes |
|---|---|---|---|
| Document Type | ERPCombobox → `hr_identity_document_types` | Yes | EID / Passport / Residence Visa / Labour Card / Work Permit / Employment Contract / Health Card |
| Document Number | Text | Yes | |
| Issue Date | Date | Yes | |
| Expiry Date | Date | Conditional | Not required for Employment Contract |
| Issuing Authority | Text | No | GDRFA / MOHRE / ICP |
| Issue Country | ERPCombobox → `countries` | No | Global countries table |
| Issuing Emirate | ERPCombobox → `emirates` | No | Global emirates table |
| Status | Select | Yes | Active / Expired / Cancelled / Pending |
| Verification Status | Select | Yes | Unverified / Verified / Failed |
| DMS Document Link | FK `dms_documents` | No | Attach via DMS |
| Renewal Status | Select | Yes | Not Required / Pending / In Progress / Complete |
| Notes | Text | No | |
| **UAE-Specific Optional Fields** | | | |
| Emirates ID Application No. | Text | No | Only for EID type |
| Visa File Number | Text | No | Only for Visa type |
| UID Number | Text | No | Unique ID in UAE system |
| Labour Card Number | Text | No | Only for Labour Card type |
| Work Permit Number | Text | No | |
| MOHRE Person Code | Text | No | |
| Profession on Document | Text | No | As stated on visa/labour card |
| Sponsor Company | ERPCombobox → `owner_companies` | No | For visa type |
| Place of Issue | Text | No | |

### Sub-section B: Medical Insurance

**Table:** `employee_medical_insurances`

| Field | Type | Required |
|---|---|---|
| Insurance Provider | Text | Yes |
| TPA (if applicable) | Text | No |
| Policy Number | Text | Yes |
| Insurance Card Number | Text | No |
| Network / Class / Category | Text | No |
| Issue Date | Date | Yes |
| Expiry Date | Date | Yes |
| Employee Covered | Boolean | Yes |
| Dependent Coverage Included | Boolean | Yes |
| Dependent Count Covered | Number | No |
| Status | Select | Yes |
| DMS Copy | FK `dms_documents` | No |
| Renewal Status | Select | Yes |
| Verification Status | Select | Yes |
| Notes | Text | No |

### Sub-section C: Dependents

**Table:** `employee_dependents`

| Field | Type | Required | Notes |
|---|---|---|---|
| Dependent Name (English) | Text | Yes | |
| Dependent Name (Arabic) | Text | No | |
| Relationship | ERPCombobox → `hr_relationship_types` | Yes | |
| Date of Birth | Date | Yes | |
| Nationality | ERPCombobox → `countries` | Yes | Global countries |
| Passport Number | Text | Yes | **Sensitive** |
| Passport Expiry | Date | Yes | |
| Emirates ID Number | Text | No | **Sensitive** |
| Emirates ID Expiry | Date | No | |
| Residence Visa Number | Text | No | |
| Residence Visa Expiry | Date | No | |
| Medical Insurance Provider | Text | No | |
| Medical Insurance Policy | Text | No | |
| Medical Insurance Card | Text | No | |
| Medical Insurance Expiry | Date | No | |
| Sponsored By | Select | No | Employee / Company |
| Active | Boolean | Yes | |
| Notes | Text | No | |
| DMS Documents | `employee_document_links` | No | Via employee_document_links table |

### Sub-section D: Access Cards & Passes

**Table:** `employee_access_cards`

| Field | Type | Required |
|---|---|---|
| Access Type | ERPCombobox → `hr_access_card_types` | Yes |
| Client / Authority | Text | Yes |
| Site / Plant | ERPCombobox → `work_sites` | No |
| Card Number | Text | No |
| Application Reference | Text | No |
| Issue Date | Date | No |
| Expiry Date | Date | No |
| Status | Select | Yes |
| Access Level | Text | No |
| DMS Copy | FK `dms_documents` | No |
| Renewal / Application Status | Select | Yes |
| Notes | Text | No |

### Sub-section E: Training & Certifications

**Table:** `employee_training_certificates` — flexible catalogue via `hr_training_types`

| Field | Type | Required |
|---|---|---|
| Category | ERPCombobox → `hr_training_categories` | Yes |
| Certificate Name | ERPCombobox → `hr_training_types` | Yes |
| Provider / Training Center | Text | No |
| Approval Body | Text | No |
| Certificate Number | Text | No |
| Issue Date | Date | Yes |
| Expiry Date | Date | No |
| Validity Duration (Months) | Number | No |
| Required for Designation | Boolean | Yes |
| Required for Site | Boolean | No |
| Status | Select | Yes |
| DMS Copy | FK `dms_documents` | No |
| Verification Status | Select | Yes |
| Renewal Status | Select | Yes |
| Notes | Text | No |

### Sub-section F: Medical & Health Records

**Table:** `employee_medical_records`  
**Confidentiality:** `hr.medical.view` required — section hidden without this permission

| Field | Type | Required | Notes |
|---|---|---|---|
| Medical Record Type | ERPCombobox → `hr_medical_record_types` | Yes | |
| Medical Center / Clinic | Text | Yes | |
| Report Number | Text | No | |
| Examination Date | Date | Yes | |
| Result | Select | Yes | Fit / Unfit / Conditionally Fit / Under Review |
| Fit for Work | Boolean | Yes | |
| Work Restrictions | Boolean | No | |
| Restriction Details | Text | Conditional | **Sensitive** — required if restrictions = Yes |
| Expiry / Next Due Date | Date | No | |
| Required for Visa | Boolean | No | |
| Required for Site | Boolean | No | |
| Required for Offshore | Boolean | No | |
| DMS Medical Report | FK `dms_documents` | No | Confidential |
| Confidentiality Level | Select | Yes | Internal / Restricted / Medical-Only |
| Notes | Text | No | |

---

## 7.4 Time Tab

**Purpose:** Attendance records, shift assignment, leave requests, overtime.  
**Component:** `EmployeeTimeTab` (lazy-loaded)

### Sub-section A: Attendance

**Table:** `employee_attendance_daily_summary` (see §16 for attendance approach)

Read-only list per employee. Attendance entered from global Attendance & Leave menu.

Columns: Date | Type | Site | Status | Hours | OT Hours | Late Minutes | Missing Punch | Source

### Sub-section B: Shift & Work Calendar

**Table:** `employee_shift_assignments`

Fields: Work Calendar (`work_calendars`) · Work Shift (`work_shifts`) · Weekly Off Day · Overtime Eligible · Attendance Required · Mobile Attendance Allowed · Biometric Required · Effective From · Effective To

### Sub-section C: Leave & Vacation

**Table:** `employee_leave_requests`

Fields: Leave Type · Request Date · Start Date · End Date · Total Days (calculated) · Reason · Approval Status · Approved By · Sick Leave Certificate (DMS) · Return Date · Balance Before / After

**Leave balance summary card:** Entitlement / Used / Balance per leave type.

---

## 7.5 Payroll & WPS Tab

**Purpose:** HR payroll readiness — NOT finance/accounting costing.  
**Component:** `EmployeePayrollTab` (lazy-loaded)  
**Visibility:** Salary figures masked or tab hidden if user lacks `hr.payroll.view`

**This tab covers:**
- Salary profile (basic, allowances, gross — masked for non-payroll)
- WPS status and bank details (IBAN always masked)
- Payroll hold flag and reason
- Salary revision history (append-only log)

**Explicitly excluded:**
- Full payroll run
- Payslip generation
- Salary payment history
- Accounting posting
- Project / employee costing
- Final settlement financial calculation
- Gratuity amount calculation

All deferred to Finance module.

---

## 7.6 Operations Tab

**Purpose:** Assignments, site readiness, blocked status, assets/PPE/accommodation.  
**Component:** `EmployeeOperationsTab` (lazy-loaded)

### Readiness Dimensions

Readiness supports multiple context types:

| Context Type | Meaning |
|---|---|
| `general` | General employment readiness (legal docs, insurance) |
| `site` | Readiness for a specific `work_site_id` |
| `client` | Readiness for a specific client/project |
| `role` | Readiness for a specific `designation_id` |
| `assignment` | Readiness for a specific `assignment_id` |

The `employee_readiness_status` table stores a row per context type, allowing: "Is John ADNOC Ruwais-ready? Is he CICPA-ready for his current designation?"

### Blocked Status Panel

When `is_blocked = true`:
- Blocked From (date)
- Blocked Reason
- Unblock Requirements (list of what must be resolved)
- Quick "Resolve" links to relevant tab / child record

---

## 7.7 HR Actions Tab

**Purpose:** PRO processes, performance, disciplinary, notes, approvals, EOS.  
**Component:** `EmployeeHRActionsTab` (lazy-loaded)

Sub-sections: PRO / Renewal Processes · Performance & Disciplinary · End of Service / Offboarding · Notes · Approvals

**Disciplinary sub-section:** Hidden unless user has `hr.actions.view`

---

## 7.8 Documents Tab

**Purpose:** All DMS documents linked to this employee.

**Component:** `DmsEntityDocumentsTab` from `@/features/dms/entity-documents`

**Document linking approach:** Employee Documents tab uses `employee_document_links` (see §16) to associate DMS documents with specific child records (dependent, training cert, access card, etc.).

---

## 7.9 AI Review Tab

**Purpose:** All AI suggestions, corrections, document extraction, and drafts.  
**Component:** `EmployeeAIReviewTab` (lazy-loaded)  
**Permission:** `hr.ai.review` required — hidden without this permission

In HR.2–HR.11: This tab exists as a **placeholder** showing "AI Review will be available after HR AI integration (HR.12)."

In HR.12: Fully wired to Common AI engine.

**Sections (HR.12+):**

| Section | AI Source | Action |
|---|---|---|
| AI Fill Suggestions | Common AI.1 | Accept / Reject / Apply |
| AI Correction Suggestions | Common AI.1 | Accept / Reject |
| Missing Data Findings | Common AI.15 | Review / Dismiss |
| Duplicate Employee Warning | Common AI.3 | Review |
| Compliance Findings | Common AI.4 | Review |
| Risk Score | Common AI.5 | View explanation |
| Document Extraction Results | DMS AI.10/AI.11 | Review → Apply to child record |
| AI Suggested Actions | Common AI.7 | Review |
| HR Letter / Email Drafts | AI.7 + email | Review → Edit → Send |
| Ask AI | Live AI assistant | Chat |

**Rules:** No auto-save · no auto-apply · every suggestion shows source document snippet (collapsed) · every draft email requires human review and confirmation before sending.

---

## 7.10 Audit Tab

**Purpose:** Complete change history for this employee.  
**Component:** `EmployeeAuditTab` (lazy-loaded)

Sources: `audit_logs` filtered by employee entity + all child entities · AI suggestion events · DMS document events

**Required columns per row:** Timestamp · User · Action · Entity · Field Changed · Old Value · New Value · Notes

**Sensitive masking:** Salary fields masked if no `hr.payroll.view` · Medical fields masked if no `hr.medical.view` · IBAN / account number always masked · Passport / EID partially masked

---

# 8. HR Dashboard Design

**Route:** `/admin/hr/dashboard`  
**Permission:** `hr.dashboard.view`

**Rule:** Monitoring and drill-down only. No editing from dashboard. All actions open Employee Profile at the relevant tab.

## 8.1 Dashboard Filters (sticky top bar)

Company | Branch | Department | Designation | Category | Employee Status | Nationality | Site | Client | Date Range

## 8.2 Dashboard Sections (14 sections)

| Section | Key Metrics | Drill-Down Opens |
|---|---|---|
| Employee Overview | Total active, new joiners, on leave, probation | Employee Profile |
| Compliance & Expiry | Expiring <60d, expired, missing mandatory | Compliance tab |
| Medical Insurance | Active, expiring, expired, not covered | Compliance tab |
| Dependents | Total dependents, expiring docs | Compliance tab |
| Access Cards / CICPA | Active, expiring, expired, missing for site | Compliance tab |
| Training & Certifications | Valid, expiring, expired, missing required | Compliance tab |
| Medical Fitness / Health | Fit, restricted, expired, due | Compliance tab (medical) |
| Attendance Today | Present, absent, on leave, not recorded | Time tab |
| Leave / Vacation | On leave today, pending approval, low balance | Time tab |
| Payroll / WPS Readiness | WPS enrolled, holds, missing IBAN, revisions due | Payroll & WPS tab |
| Assignments / Site Readiness | ADNOC-ready, CICPA-ready, blocked, available | Operations tab |
| PRO Renewals | Open processes, due this week, overdue | HR Actions tab |
| HR Holds / Disciplinary | Active holds, open cases, suspensions | HR Actions tab |
| AI / Data Quality Alerts | Open AI suggestions, data quality findings | AI Review tab |

## 8.3 Export

Export dashboard summary as PDF · Export individual section as Excel · Print dashboard

---

# 9. HR Search Design

**Route:** `/admin/hr/search`  
**Permission:** `hr.search.use`

## 9.1 Search Bar

- Keyword text input (full-text across all indexed HR fields)
- AI Natural Language toggle (delegates to Common AI.6 extended for HR in HR.12)
- Quick filter chips: Active Employees · Expiring Documents · Blocked · On Leave

## 9.2 Advanced Filter Panel

All HR filter dimensions — Company, Branch, Department, Designation, Category, Status, Nationality, Site, Document Type + Expiry State, Training Type + Expiry, Access Card Type + Status, Medical Insurance Status, WPS Status, Leave Status, Attendance Status, AI Issue Status, HR Hold, Blocked

## 9.3 Result Display

- Grouped result cards (Employee → matching child records highlighted)
- Result badges: [Expired] [Expiring] [Blocked] [Hold] [AI Issue] [Missing Doc]
- Pagination (50 per page)
- Select results → Export selected

## 9.4 AI Natural Language Examples

| Query | HR Logic |
|---|---|
| "Show all drivers with CICPA expiring in 30 days and missing H2S" | category=driver, access_cards expiring ≤30d, training H2S missing/expired |
| "Show employees ready for ADNOC Ruwais site" | ADNOC readiness = true, site = Ruwais |
| "Show employees with expired medical insurance" | Insurance expiry < today |
| "Show operators with expired ADSD" | Category=operator, ADSD training expired |
| "Show employees with dependents visa expiring this month" | Dependent residence_visa_expiry in current month |

---

# 10. Recruitment & Onboarding Design

**Route group:** `/admin/hr/recruitment/`  
**Phase:** HR.8 (after HR.7 — HR Actions)

## 10.1 Screens

| Screen | Route | Table |
|---|---|---|
| Manpower Requests | `.../manpower-requests` | `hr_manpower_requests` |
| Job Openings | `.../job-openings` | `hr_job_openings` |
| Candidates | `.../candidates` | `hr_candidates` |
| Interview Evaluations | `.../interviews` | `hr_candidate_interviews` |
| Offer Letters | `.../offers` | `hr_offer_letters` |
| New Joiners | `.../new-joiners` | Filtered `hr_candidates` (accepted + awaiting conversion) |
| Onboarding Checklist | Per-employee in Profile | `hr_onboarding_checklists` + `hr_onboarding_tasks` |
| Probation Tracking | Filtered list | `employees` (status=Probation) |

## 10.2 Employee–Recruitment Linkage

**Correction from v1 plan:** Do NOT put `hr_candidate_id` directly in `employees` table at HR.2 — `hr_candidates` does not exist yet at HR.2.

**Solution:** Create `employee_recruitment_links` in HR.8:

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

Employee Profile (Profile tab, Section C) shows recruitment history by joining to this table — only populated after HR.8.

## 10.3 Convert Candidate to Employee

"New Joiners" screen: "Convert to Employee" action creates the `employees` record pre-filled from candidate profile and creates the `employee_recruitment_links` record linking the two.

---

# 11. Attendance & Leave Design

**Route group:** `/admin/hr/time/`

## 11.1 Attendance Approach (Corrected from v1)

**Problem with `UNIQUE(employee_id, attendance_date)`:** This constraint breaks if split shifts, corrections, or multiple biometric punches exist in v1.

**Recommended v1 approach:** Two-table pattern:
- `employee_attendance_punches` — raw punches (each check-in / check-out / import record, no unique constraint)
- `employee_attendance_daily_summary` — one approved summary row per employee per date (`UNIQUE(employee_id, attendance_date)`)

HR manually approves or the system auto-summarises daily punches into the summary. Corrections update the summary row.

| Table | Purpose |
|---|---|
| `employee_attendance_punches` | Raw biometric / manual / import punches |
| `employee_attendance_daily_summary` | Approved daily attendance: status, total hours, OT, late minutes |
| `employee_attendance_corrections` | Correction records linked to summary |

## 11.2 Screens

| Screen | Route |
|---|---|
| Daily Attendance | `/admin/hr/time/attendance` |
| Leave Requests | `/admin/hr/time/leave` |
| Shift Calendar | `/admin/hr/time/shifts` |
| Overtime | `/admin/hr/time/overtime` |

## 11.3 Leave Approval Workflow

1. Employee (or HR) submits request → `employee_leave_requests.approval_status = pending`
2. Supervisor approves (if configured in `hr_approval_workflows`)
3. HR Manager approves → leave balance deducted → status = approved
4. Leave balance calculated from `employee_leave_balances` per leave type per year

---

# 12. Payroll & WPS Design

**Route group:** `/admin/hr/payroll/`

## 12.1 Scope

HR Payroll & WPS is **readiness and WPS preparation only** — NOT a full payroll system.

**Included in HR.5:**
- `employee_payroll_profiles` — salary components, payroll group, effective date
- `employee_salary_components` — named allowances (preferred over `other_allowances_json`)
- `employee_salary_revisions` — append-only salary change log
- `employee_payroll_holds`
- `employee_wps_profiles` — bank, IBAN, labour card, MOHRE person code, WPS status

**Gross salary** is calculated server-side from sum of `employee_salary_components` — not manually edited by user.

**Deferred to Finance module:**
- Payroll run
- Payslip generation
- Salary payment history
- Accounting posting
- Project costing
- Final settlement financial calculation
- Gratuity amount calculation

## 12.2 WPS SIF Export

- Generates WPS Salary Information File for MOHRE / WPS agent submission
- Validates: all employees have valid IBAN or exchange house, labour card numbers present, gross salary ≥ minimum wage, no salary hold
- Export format: CSV per Central Bank of UAE specification
- Permission: `hr.payroll.manage` — export masked for non-payroll users
- Audit event: `wps_export_generated`

---

# 13. Assignments & Readiness Design

**Route group:** `/admin/hr/assignments/`

## 13.1 Readiness Engine

Deterministic TypeScript engine — no AI required for base readiness calculation:

1. Load `hr_readiness_rule_templates` for employee's designation + context (site, client, role)
2. Check each rule against employee's compliance records
3. Store results per context type in `employee_readiness_status`
4. Set `overall_readiness_score` (0–100)
5. Set `is_blocked` if any critical rule fails

## 13.2 Readiness Contexts

| Dimension | Passes If |
|---|---|
| Legal-Ready | EID + Passport + Visa + Labour Card all active, not expiring within configurable threshold |
| Medical-Ready | Required medical fitness records valid for designation/site |
| Training-Ready | All required training for designation/site valid |
| CICPA-Ready | Active CICPA pass for required site |
| ADNOC-Ready | CICPA + H2S + ADNOC ATA + Medical + Visa all valid |
| Offshore-Ready | Offshore medical + H2S + confined space + visa + passport valid |
| Driver-Ready | Driving license + ADSD + Medical + EID + Visa valid |
| Insurance-Ready | Active insurance coverage |
| Overall Blocked | Any active HR hold or disciplinary suspension |

## 13.3 Screens

| Screen | Route |
|---|---|
| Site Readiness Matrix | `/admin/hr/assignments/readiness` |
| Blocked Employees | `/admin/hr/assignments/blocked` |
| Assignment History | `/admin/hr/assignments/history` |

---

# 14. End of Service Design

**Route group:** `/admin/hr/eos/`

## 14.1 EOS Scope

HR manages the **process and clearance status** — not financial calculation.

**Included:**
- EOS case (resignation, termination, contract end, retirement, death)
- Clearance checklist (asset return, IT access, accommodation, visa cancellation, labour cancellation, insurance cancellation, CICPA cancellation, exit interview)
- Employee archive (status = Archived; profile becomes read-only)

**Deferred to Finance module:**
- Gratuity amount calculation
- Final settlement financial amounts
- Accounting entries

## 14.2 Screens

| Screen | Route | Table |
|---|---|---|
| EOS Cases | `/admin/hr/eos/cases` | `employee_end_of_service_cases` |
| Clearance | `/admin/hr/eos/clearance` | `employee_clearance_items` |

---

# 15. HR Settings Design

**Route group:** `/admin/hr/settings/`

| Screen | Route | Table | Notes |
|---|---|---|---|
| Employee Categories | .../categories | `hr_employee_categories` | Driver / Operator / etc. |
| Employment Types | .../employment-types | `hr_employment_types` | Full-time / Contract |
| Grades | .../grades | `hr_grades` | |
| Document Types | .../document-types | `hr_identity_document_types` | EID / Passport / Visa |
| Access Card Types | .../access-card-types | `hr_access_card_types` | CICPA / ADNOC / Port |
| Training Categories | .../training-categories | `hr_training_categories` | Safety / HSE / Operator |
| Training Types | .../training-types | `hr_training_types` | Flexible catalogue |
| Medical Record Types | .../medical-types | `hr_medical_record_types` | |
| Leave Types | .../leave-types | `hr_leave_types` | Annual / Sick / Emergency |
| Relationship Types | .../relationship-types | `hr_relationship_types` | Spouse / Child / Parent |
| Salary Components | .../salary-components | `hr_salary_component_types` | Housing / Transport |
| Payroll Groups | .../payroll-groups | `hr_payroll_groups` | Monthly / Weekly |
| MOHRE Establishments | .../mohre-establishments | `hr_mohre_establishments` | See §16 |
| HR Numbering | .../numbering | Numbering rules | Employee code format |
| Readiness Rules | .../readiness-rules | `hr_readiness_rule_templates` | |
| Role Requirement Matrix | .../role-matrix | `hr_role_requirement_matrix` | |
| Site Requirement Matrix | .../site-matrix | `hr_site_requirement_matrix` | |
| PRO Process Types | .../pro-types | `hr_pro_process_types` | |
| Approval Workflows | .../approval-workflows | `hr_approval_workflows` | |
| Medical Confidentiality | .../medical-settings | Config | Who can see medical |
| HR AI Settings | .../ai-settings | `erp_ai_feature_flags` (hr.*) | HR.12+ only |

---

# 16. Database Schema Plan

## 16.1 Core Table: `employees`

```sql
CREATE TABLE employees (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_code             TEXT NOT NULL UNIQUE,                -- EMP-2026-000001

  -- Personal
  full_name_en              TEXT NOT NULL,
  full_name_ar              TEXT,
  known_name                TEXT,
  gender                    TEXT NOT NULL CHECK (gender IN ('male','female')),
  nationality_id            BIGINT REFERENCES countries(id),    -- global countries
  date_of_birth             DATE NOT NULL,
  marital_status            TEXT,
  mobile_number             TEXT NOT NULL,
  personal_email            TEXT,
  uae_address               TEXT,
  home_country_address      TEXT,
  blood_group               TEXT CHECK (blood_group IN ('A+','A-','B+','B-','O+','O-','AB+','AB-')),
  photo_dms_document_id     BIGINT REFERENCES dms_documents(id),

  -- Employment (references EXISTING global tables only)
  owner_company_id          BIGINT NOT NULL REFERENCES owner_companies(id),
  branch_id                 BIGINT REFERENCES branches(id),
  department_id             BIGINT REFERENCES departments(id),        -- COMMON MD.1
  designation_id            BIGINT REFERENCES designations(id),       -- COMMON MD.1
  employee_category_id      BIGINT REFERENCES hr_employee_categories(id),
  employment_type_id        BIGINT REFERENCES hr_employment_types(id),
  joining_date              DATE NOT NULL,
  actual_joining_date       DATE,
  employee_status           TEXT NOT NULL DEFAULT 'active'
                            CHECK (employee_status IN ('active','inactive','on_leave','probation',
                                                       'suspended','terminated','archived')),
  reporting_manager_id      BIGINT REFERENCES employees(id),
  supervisor_id             BIGINT REFERENCES employees(id),
  primary_work_site_id      BIGINT REFERENCES work_sites(id),        -- COMMON MD.1
  sponsor_company_id        BIGINT REFERENCES owner_companies(id),
  mohre_establishment_id    BIGINT REFERENCES hr_mohre_establishments(id),

  -- Contract
  probation_start_date      DATE,
  probation_end_date        DATE,
  contract_type             TEXT CHECK (contract_type IN ('limited','unlimited')),
  contract_start_date       DATE,
  contract_end_date         DATE,
  notice_period_days        INT,

  -- Status tracking
  inactive_date             DATE,
  inactive_reason           TEXT,

  -- Emergency Contact
  emergency_contact_name    TEXT NOT NULL,
  emergency_contact_mobile  TEXT NOT NULL,
  emergency_contact_relationship TEXT,

  -- NOTE: No hr_candidate_id here. Recruitment linkage is in employee_recruitment_links (HR.8).

  -- Soft delete standard
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);
-- RLS: ENABLED + FORCED
```

## 16.2 Compliance Tables

All compliance tables follow the soft-delete standard: `created_at, updated_at, created_by, updated_by, deleted_at, deleted_by`.

```sql
-- employee_identity_documents (with optional UAE-specific fields)
CREATE TABLE employee_identity_documents (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type_id          BIGINT NOT NULL REFERENCES hr_identity_document_types(id),
  document_number           TEXT NOT NULL,
  issue_date                DATE NOT NULL,
  expiry_date               DATE,
  issuing_authority         TEXT,
  issue_country_id          BIGINT REFERENCES countries(id),        -- global countries
  issuing_emirate_id        BIGINT REFERENCES emirates(id),         -- global emirates
  status                    TEXT NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expired','cancelled','pending')),
  verification_status       TEXT NOT NULL DEFAULT 'unverified'
                            CHECK (verification_status IN ('unverified','verified','failed')),
  verified_by               BIGINT REFERENCES user_profiles(id),
  verified_at               TIMESTAMPTZ,
  dms_document_id           BIGINT REFERENCES dms_documents(id),
  renewal_status            TEXT NOT NULL DEFAULT 'not_required',

  -- UAE-specific optional fields (NULL when not applicable to document type)
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
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);
```

Other compliance tables (`employee_medical_insurances`, `employee_dependents`, `employee_access_cards`, `employee_training_certificates`, `employee_medical_records`) follow the same pattern with full soft-delete columns.

## 16.3 MOHRE Establishments Table

```sql
CREATE TABLE hr_mohre_establishments (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_company_id      BIGINT NOT NULL REFERENCES owner_companies(id),
  establishment_number  TEXT NOT NULL,
  establishment_name    TEXT NOT NULL,
  emirate_id            BIGINT REFERENCES emirates(id),    -- global emirates
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ
);
-- RLS: ENABLED + FORCED
```

`employees.mohre_establishment_id` references this table. `employee_wps_profiles` may also reference it.

## 16.4 Attendance Tables (Corrected Approach)

```sql
-- Raw punches — no unique constraint per day
CREATE TABLE employee_attendance_punches (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  punch_datetime        TIMESTAMPTZ NOT NULL,
  punch_type            TEXT NOT NULL CHECK (punch_type IN ('in','out','break_start','break_end')),
  work_site_id          BIGINT REFERENCES work_sites(id),
  punch_source          TEXT CHECK (punch_source IN ('biometric','mobile','manual','import')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id)
);

-- Approved daily attendance summary — one row per employee per date
CREATE TABLE employee_attendance_daily_summary (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  attendance_date       DATE NOT NULL,
  attendance_type       TEXT NOT NULL CHECK (attendance_type IN ('site','office','yard','workshop','remote','on_leave','absent','holiday')),
  work_site_id          BIGINT REFERENCES work_sites(id),
  total_hours           NUMERIC(5,2),
  overtime_hours        NUMERIC(5,2) DEFAULT 0,
  late_minutes          INT DEFAULT 0,
  early_out_minutes     INT DEFAULT 0,
  is_missing_punch      BOOLEAN NOT NULL DEFAULT FALSE,
  approval_status       TEXT NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  updated_by            BIGINT REFERENCES user_profiles(id),
  UNIQUE (employee_id, attendance_date)   -- unique on summary only
);

-- Attendance corrections
CREATE TABLE employee_attendance_corrections (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  summary_id            BIGINT NOT NULL REFERENCES employee_attendance_daily_summary(id),
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  correction_reason     TEXT NOT NULL,
  corrected_by          BIGINT NOT NULL REFERENCES user_profiles(id),
  old_values_json       JSONB,
  new_values_json       JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Append-only: no UPDATE, no DELETE policy
);
```

## 16.5 Employee Readiness Status (Context-Aware)

```sql
CREATE TABLE employee_readiness_status (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id),
  readiness_context_type    TEXT NOT NULL DEFAULT 'general'
                            CHECK (readiness_context_type IN ('general','site','client','role','assignment')),
  work_site_id              BIGINT REFERENCES work_sites(id),      -- nullable: site context
  designation_id            BIGINT REFERENCES designations(id),    -- nullable: role context
  assignment_id             BIGINT,                                 -- nullable: assignment context (FK added in HR.6)

  -- Readiness dimensions
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
  last_calculated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unblock_requirements      JSONB,

  UNIQUE (employee_id, readiness_context_type, work_site_id, designation_id)
);
-- RLS: ENABLED + FORCED
```

## 16.6 Employee Document Links (Preferred DMS Many-to-Many)

Avoids modifying stable DMS core link tables. HR-specific document associations stored here:

```sql
CREATE TABLE employee_document_links (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id           BIGINT NOT NULL REFERENCES employees(id),
  dms_document_id       BIGINT NOT NULL REFERENCES dms_documents(id),
  related_record_type   TEXT,    -- 'employee_identity_document' | 'employee_dependent' | etc.
  related_record_id     BIGINT,  -- FK to the specific child table row
  relation_purpose      TEXT,    -- e.g. 'passport_copy' | 'training_certificate' | 'medical_report'
  verification_status   TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (verification_status IN ('unverified','verified','failed')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            BIGINT REFERENCES user_profiles(id),
  deleted_at            TIMESTAMPTZ,
  deleted_by            BIGINT REFERENCES user_profiles(id),
  UNIQUE (employee_id, dms_document_id)
);
-- RLS: ENABLED + FORCED
```

## 16.7 Soft Delete Standard

All editable HR master/detail tables include:

```sql
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by      BIGINT REFERENCES user_profiles(id),
updated_by      BIGINT REFERENCES user_profiles(id),
deleted_at      TIMESTAMPTZ,                           -- soft delete timestamp
deleted_by      BIGINT REFERENCES user_profiles(id)   -- who archived it
```

**Append-only event tables** (`employee_attendance_corrections`, `employee_block_events`, `employee_salary_revisions`, `employee_status_events`) have **SELECT + INSERT policies only** — no UPDATE, no DELETE.

## 16.8 Payroll Tables

```sql
-- employee_salary_components (preferred over JSON allowances)
CREATE TABLE employee_salary_components (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id),
  component_type_id         BIGINT NOT NULL REFERENCES hr_salary_component_types(id),
  amount                    NUMERIC(12,2) NOT NULL,
  effective_from            DATE NOT NULL,
  effective_to              DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id),
  deleted_at                TIMESTAMPTZ,
  deleted_by                BIGINT REFERENCES user_profiles(id)
);

-- employee_wps_profiles (bank_id references Finance Basics banks)
CREATE TABLE employee_wps_profiles (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id               BIGINT NOT NULL REFERENCES employees(id) UNIQUE,
  wps_applicable            BOOLEAN NOT NULL DEFAULT TRUE,
  wps_status                TEXT NOT NULL DEFAULT 'active'
                            CHECK (wps_status IN ('active','hold','exempt','not_enrolled')),
  bank_id                   BIGINT REFERENCES banks(id),    -- Finance Basics banks table
  account_holder_name       TEXT,
  account_number            TEXT,                           -- masked/encrypted
  iban                      TEXT,                           -- masked/encrypted
  exchange_house            TEXT,
  salary_payment_method     TEXT NOT NULL DEFAULT 'bank_transfer'
                            CHECK (salary_payment_method IN ('bank_transfer','exchange_house','cheque')),
  labour_card_number        TEXT,
  mohre_person_code         TEXT,
  mohre_establishment_id    BIGINT REFERENCES hr_mohre_establishments(id),
  salary_effective_date     DATE NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                BIGINT REFERENCES user_profiles(id),
  updated_by                BIGINT REFERENCES user_profiles(id)
);
```

## 16.9 HR Settings Tables (abbreviated)

All HR settings tables follow: `BIGINT identity PK, code TEXT UNIQUE, name_en TEXT, name_ar TEXT, is_active BOOLEAN, created_at, updated_at, created_by`

| Table | Seed Data |
|---|---|
| `hr_employee_categories` | DRIVER, OPERATOR, TECHNICIAN, SUPERVISOR, ADMIN, ENGINEER, LABORER, HSE, SECURITY |
| `hr_employment_types` | FULL_TIME, PART_TIME, CONTRACT, SECONDMENT, TEMPORARY |
| `hr_identity_document_types` | EMIRATES_ID, PASSPORT, RESIDENCE_VISA, LABOUR_CARD, WORK_PERMIT, EMPLOYMENT_CONTRACT, HEALTH_CARD |
| `hr_access_card_types` | CICPA, ADNOC_PLANT, CLIENT_SITE, PORT, OFFSHORE, PROJECT_GATE |
| `hr_training_categories` | SAFETY, HSE, OPERATOR, DRIVING, ENVIRONMENTAL, SITE_SPECIFIC |
| `hr_training_types` | H2S, ADSD, WMS_PTW, ADNOC_ATA, CICPA_INDUCTION, OFFSHORE, RIGGER, SCAFFOLDING, FIRST_AID, FIRE_WATCH, CONFINED_SPACE, FORKLIFT, CRANE, DEFENSIVE_DRIVING, WASTE_ENV, AGT + 10 more |
| `hr_leave_types` | ANNUAL, SICK, EMERGENCY, MATERNITY, PATERNITY, UNPAID, HAJJ, COMPASSIONATE |
| `hr_relationship_types` | SPOUSE, CHILD, PARENT, SIBLING, OTHER |
| `hr_medical_record_types` | VISA_MEDICAL, PRE_EMPLOYMENT, PERIODIC, OFFSHORE, DRIVER, SICK_LEAVE, RESTRICTION, RETURN_TO_WORK, INCIDENT |
| `hr_salary_component_types` | BASIC, HOUSING_ALLOWANCE, TRANSPORT_ALLOWANCE, FOOD_ALLOWANCE, OVERTIME, OTHER |
| `hr_payroll_groups` | MONTHLY, WEEKLY |
| `hr_pro_process_types` | VISA_RENEWAL, EID_RENEWAL, LABOUR_CARD, MEDICAL_FITNESS, INSURANCE_RENEWAL, CICPA_APPLICATION, PLANT_CARD, TRAINING_RENEWAL |

---

# 17. Relationship Map

```
owner_companies ──────────────────────┐
branches ─────────────────────────────┤
departments (COMMON MD.1) ────────────┤
designations (COMMON MD.1) ───────────┤──→ employees (core)
work_sites (COMMON MD.1) ─────────────┤
countries (global) ───────────────────┤
hr_employee_categories ───────────────┘
hr_mohre_establishments ──────────────┘

employees ──→ employee_identity_documents ──→ hr_identity_document_types, countries, emirates
          ──→ employee_medical_insurances
          ──→ employee_dependents ──→ hr_relationship_types, countries
          ──→ employee_access_cards ──→ hr_access_card_types, work_sites
          ──→ employee_training_certificates ──→ hr_training_types, hr_training_categories
          ──→ employee_medical_records ──→ hr_medical_record_types
          ──→ employee_shift_assignments ──→ work_calendars, work_shifts (COMMON MD.1)
          ──→ employee_attendance_punches
          ──→ employee_attendance_daily_summary
          ──→ employee_leave_requests ──→ hr_leave_types
          ──→ employee_leave_balances
          ──→ employee_salary_components ──→ hr_salary_component_types
          ──→ employee_payroll_profiles ──→ hr_payroll_groups
          ──→ employee_wps_profiles ──→ banks (Finance Basics), hr_mohre_establishments
          ──→ employee_salary_revisions (append-only)
          ──→ employee_assignments ──→ work_sites
          ──→ employee_readiness_status (context-aware)
          ──→ employee_block_events (append-only)
          ──→ employee_assets_facilities
          ──→ employee_document_links ──→ dms_documents
          ──→ employee_pro_processes ──→ hr_pro_process_types
          ──→ employee_performance_reviews
          ──→ employee_disciplinary_actions
          ──→ employee_notes
          ──→ employee_end_of_service_cases
          ──→ employee_clearance_items
          ──→ employee_recruitment_links (HR.8) ──→ hr_candidates, hr_manpower_requests, hr_offer_letters

All child mutations ──→ audit_logs via logAudit() with parent_employee_id + employee_code + employee_name
AI (HR.12+) ──→ erp_ai_field_suggestions, erp_ai_duplicate_candidates, erp_ai_compliance_findings,
               erp_ai_risk_scores, erp_ai_data_quality_findings (all entity_type='employee' variants)
```

---

# 18. RLS and Permission Plan

## 18.1 HR Permission Codes

```text
-- Employee access
hr.employees.view             — view employee list and basic profile
hr.employees.create           — create new employee
hr.employees.update           — update employee fields
hr.employees.archive          — archive/soft-delete employee  ← NOT hr.employees.delete

-- Profile
hr.employee_profile.view      — view full employee profile (all tabs)
hr.employee_profile.manage    — manage employee profile (edit all sections)

-- Compliance
hr.compliance.view            — view legal docs, insurance, dependents, access, training
hr.compliance.manage          — add/edit compliance records

-- Medical (elevated — hidden without this)
hr.medical.view               — view medical records and fitness reports
hr.medical.manage             — add/edit medical records

-- Payroll (elevated — masked without this)
hr.payroll.view               — view salary, IBAN, bank details (unmasked)
hr.payroll.manage             — edit payroll profile and WPS data

-- Time
hr.attendance.view            — view attendance records
hr.attendance.manage          — record/correct attendance
hr.leave.view                 — view leave requests and balances
hr.leave.manage               — approve/reject leave requests

-- Recruitment
hr.recruitment.view           — view manpower requests, candidates, offers
hr.recruitment.manage         — manage full recruitment workflow

-- Operations
hr.assignments.view           — view assignments and readiness
hr.assignments.manage         — update assignments, readiness, assets

-- HR Actions
hr.actions.view               — view PRO processes, performance, disciplinary
hr.actions.manage             — create/update PRO processes, performance, disciplinary

-- End of Service
hr.eos.view                   — view EOS cases and clearance
hr.eos.manage                 — manage EOS and clearance process

-- Dashboard, Search, Settings
hr.dashboard.view             — view HR dashboard
hr.search.use                 — use HR search
hr.settings.view              — view HR settings/master data
hr.settings.manage            — manage HR settings/master data

-- AI
hr.ai.review                  — view and review AI suggestions for HR
hr.ai.apply_suggestion        — apply AI field suggestions to employee records

-- Admin
hr.admin                      — full HR administration access
```

## 18.2 Role Mappings

| Permission | system_admin | group_admin | company_admin | hr_manager | hr_officer | payroll_officer | pro_officer | hse_officer | operations_manager | supervisor |
|---|---|---|---|---|---|---|---|---|---|---|
| hr.employees.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hr.employees.create | ✅ | ✅ | ✅ | ✅ | ✅ | | | | | |
| hr.employees.update | ✅ | ✅ | ✅ | ✅ | ✅ | | | | | |
| hr.employees.archive | ✅ | ✅ | | ✅ | | | | | | |
| hr.compliance.view | ✅ | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | ✅ | |
| hr.compliance.manage | ✅ | ✅ | | ✅ | ✅ | | ✅ | | | |
| hr.medical.view | ✅ | ✅ | | ✅ | | | | ✅ | | |
| hr.medical.manage | ✅ | ✅ | | ✅ | | | | | | |
| hr.payroll.view | ✅ | ✅ | ✅ | ✅ | | ✅ | | | | |
| hr.payroll.manage | ✅ | ✅ | | ✅ | | ✅ | | | | |
| hr.attendance.view | ✅ | ✅ | ✅ | ✅ | ✅ | | | | ✅ | ✅ |
| hr.attendance.manage | ✅ | ✅ | | ✅ | ✅ | | | | ✅ | ✅ |
| hr.leave.view | ✅ | ✅ | ✅ | ✅ | ✅ | | | | ✅ | ✅ |
| hr.leave.manage | ✅ | ✅ | | ✅ | ✅ | | | | ✅ | ✅ |
| hr.recruitment.view | ✅ | ✅ | ✅ | ✅ | ✅ | | | | | |
| hr.recruitment.manage | ✅ | ✅ | | ✅ | ✅ | | | | | |
| hr.assignments.view | ✅ | ✅ | ✅ | ✅ | ✅ | | | ✅ | ✅ | ✅ |
| hr.assignments.manage | ✅ | ✅ | | ✅ | | | | | ✅ | |
| hr.actions.view | ✅ | ✅ | ✅ | ✅ | ✅ | | ✅ | | | |
| hr.actions.manage | ✅ | ✅ | | ✅ | ✅ | | ✅ | | | |
| hr.eos.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | | | | |
| hr.eos.manage | ✅ | ✅ | | ✅ | ✅ | | | | | |
| hr.dashboard.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hr.search.use | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| hr.settings.view | ✅ | ✅ | ✅ | ✅ | | | | | | |
| hr.settings.manage | ✅ | ✅ | | ✅ | | | | | | |
| hr.ai.review | ✅ | ✅ | | ✅ | ✅ | | | | | |
| hr.ai.apply_suggestion | ✅ | ✅ | | ✅ | ✅ | | | | | |
| hr.admin | ✅ | ✅ | | | | | | | | |

## 18.3 Supervisor Limited View

Supervisors can view employees in their team with these restrictions:

| Can See | Cannot See |
|---|---|
| Basic employee profile (name, designation, status, mobile) | Salary, gross, IBAN, allowances |
| Attendance and leave status | Medical records and fitness reports |
| Assignment and readiness/block status | Full legal document numbers (partial mask) |
| Compliance summary badges (Green/Amber/Red) | Disciplinary details |
| | Dependents |
| | AI findings |

## 18.4 Company Scope

**Important:** The ERP supports multiple companies per user (group_admin, company_admin). Cursor must inspect `current_user_has_permission()` and the existing company-scope patterns in `src/lib/rbac/check.ts` **before** implementing HR RLS helper functions — align with the current pattern rather than assuming a single `current_user_company_id()`.

## 18.5 RLS Helper Functions

```sql
-- View permission with company scope
CREATE OR REPLACE FUNCTION current_user_can_view_employee(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_has_permission('hr.employees.view') AND
    (
      current_user_has_permission('hr.admin') OR
      current_user_has_role('system_admin') OR
      current_user_has_role('group_admin') OR
      EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = p_employee_id
          AND e.deleted_at IS NULL
          -- company scope check: align with existing ERP RBAC pattern
      )
    )
  );
END;
$$;

-- Medical data — requires elevated permission
CREATE OR REPLACE FUNCTION current_user_can_view_employee_medical(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.medical.view')
  );
END;
$$;

-- Payroll data — requires elevated permission
CREATE OR REPLACE FUNCTION current_user_can_view_employee_payroll(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.payroll.view')
  );
END;
$$;

-- Disciplinary data — requires elevated permission
CREATE OR REPLACE FUNCTION current_user_can_view_employee_disciplinary(p_employee_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  RETURN (
    current_user_can_view_employee(p_employee_id) AND
    current_user_has_permission('hr.actions.view')
  );
END;
$$;
```

---

# 19. DMS Integration Plan

## 19.1 DMS Entity Types for HR

Add to `src/lib/dms/dms-entity-types.ts` during HR.3:

| Entity Type | Used For | Already Registered? |
|---|---|---|
| `employee` | General employee documents | ✅ Yes (DMS.15) |
| `employee_compliance` | General compliance docs | ✅ Yes (DMS.15) |
| `employee_identity_document` | Passport scan, EID scan, visa copy | ❌ HR.3 |
| `employee_medical_insurance` | Insurance card copy | ❌ HR.3 |
| `employee_dependent` | Dependent document copies | ❌ HR.3 |
| `employee_access_card` | CICPA/ADNOC card copy | ❌ HR.3 |
| `employee_training_certificate` | Certificate scans | ❌ HR.3 |
| `employee_medical_record` | Medical fitness reports (confidential) | ❌ HR.3 |
| `employee_contract` | Employment contract | ❌ HR.3 |
| `employee_leave_request` | Sick leave certificate | ❌ HR.4 |
| `employee_eos_case` | EOS settlement documents | ❌ HR.7 |

## 19.2 DMS Required Document Rules (seeded in HR.3)

Add to `dms_required_document_rules`:

| Entity Type | Document Type | Mandatory |
|---|---|---|
| `employee` | Emirates ID | Yes |
| `employee` | Passport | Yes |
| `employee` | Residence Visa | Yes (non-GCC) |
| `employee` | Labour Card | Yes |
| `employee` | Employment Contract | Yes |

## 19.3 Document Linking Strategy

**Primary document copy:** Each compliance child table stores `dms_document_id` for the primary scan.

**Many-to-many / related record links:** Use `employee_document_links` table (§16.6). This avoids modifying stable DMS core tables.

**Employee Documents tab:** Uses `DmsEntityDocumentsTab` from `@/features/dms/entity-documents`. Shows `employee_document_links` with `related_record_type` and `related_record_id` for context badges.

**AI document extraction:** Existing DMS AI pipeline (OCR + extraction) is used — HR adds entity registries to Common AI.1 in HR.12, creating AI fill suggestions from document uploads.

---

# 20. AI Integration Plan

## 20.1 AI Readiness Requirements (HR.2–HR.10)

Every phase from HR.2 onwards must leave the module AI-ready. This means:

| Requirement | When |
|---|---|
| Stable entity types registered in `dms-entity-types.ts` | HR.3 |
| Stable route links (Employee Profile URL pattern) | HR.2 |
| DMS document links using `employee_document_links` | HR.3 |
| Deterministic compliance outputs (status, expiry dates) | HR.3 |
| Deterministic readiness outputs (`employee_readiness_status`) | HR.6 |
| Audit metadata with `parent_employee_id` on child events | HR.2+ |
| AI Review tab placeholder visible (locked/disabled) | HR.2 |
| Data quality fields/statuses present (`verification_status`, `renewal_status`) | HR.3 |

## 20.2 HR AI Subphases (HR.12)

HR.12 — HR AI Integration — splits into these subphases:

| Subphase | Name | Scope |
|---|---|---|
| HR AI.1 | HR AI Registry and Feature Flags | New `ai.hr.*` permissions, 7 HR AI feature flags, HR entity registries added to Common AI.1 |
| HR AI.2 | AI Fill from Documents | AI fill from Emirates ID, Passport, Visa, Insurance card, Training certificates, Access cards → suggestions in AI Review tab |
| HR AI.3 | AI Correction and Conflict Detection | AI correction suggestions, duplicate employee detection, conflicting data detection |
| HR AI.4 | AI HR Search / Natural Language | Extend Common AI.6 search engine for HR — natural language employee queries |
| HR AI.5 | AI Compliance and Readiness Explanation | Extend Common AI.4/AI.5 for HR — compliance checker, risk scoring, readiness explanation |
| HR AI.6 | AI HR Letters and Email Drafts | New assistant actions: `PREPARE_HR_LETTER_DRAFT`, `PREPARE_RENEWAL_CHECKLIST`, `PREPARE_HR_EMAIL_DRAFT` |
| HR AI.7 | HR AI Security, RLS, Runtime QA, UAT | Full security audit of HR AI feature flags, permissions, sensitive data handling |

## 20.3 AI Priority Order

1. AI Search (natural language HR queries)
2. AI Fill from documents (Emirates ID, passport, visa → employee_identity_documents)
3. AI Correction suggestions
4. AI Compliance / readiness explanation
5. AI Letters / email drafts

## 20.4 Common AI Phases Applied to HR

| Common AI Phase | HR Application (HR.12+) |
|---|---|
| AI.1 — Universal AI Fill | Fill employee identity/compliance fields from document uploads |
| AI.2 — Document Understanding | Per-document Understanding tab for all employee-linked documents |
| AI.3 — Duplicate Detection | Detect duplicate employees (same passport, EID, name+DOB) |
| AI.4 — Compliance Checker | Check required documents missing, expired, or unverified |
| AI.5 — Risk Scoring | Employee risk score (expiry, missing docs, compliance findings) |
| AI.6 — Search | Natural language HR search |
| AI.7 — Assistant | HR assistant actions (letter drafts, renewal checklists, explain blocked) |
| AI.13 — Dashboard | HR section added to AI Daily Dashboard |
| AI.14 — Audit Explainer | Explain why employee status changed |
| AI.15 — Data Quality Monitor | HR-specific rules (missing IBAN, invalid EID format, missing DOB, etc.) |

## 20.5 New HR AI Feature Flags (HR.12)

```text
ERP_AI_HR_FILL          — AI fill from HR documents (default: false)
ERP_AI_HR_COMPLIANCE    — AI compliance checker for HR (default: false)
ERP_AI_HR_DUPLICATE     — AI duplicate employee detection (default: false)
ERP_AI_HR_RISK          — AI risk scoring for employees (default: false)
ERP_AI_HR_ASSISTANT     — AI assistant for HR actions (default: false)
ERP_AI_HR_LETTERS       — AI letter/email drafting (default: false)
ERP_AI_HR_DATA_QUALITY  — Data quality monitor for HR (default: false)
```

## 20.6 New HR AI Permissions (HR.12)

```text
ai.hr.fill            — trigger AI fill for employee records
ai.hr.review          — review AI findings for HR
ai.hr.apply           — apply AI suggestions to employee records
ai.hr.letters         — use AI letter/email drafting
ai.hr.admin           — manage HR AI settings and flags
```

---

# 21. Email Integration Plan

## 21.1 All HR Emails Use Existing Engine

All HR emails go through `erp_email_queue` using `queueEmail()` from `src/server/actions/notifications/email-queue.ts`.

## 21.2 Email Rules

- **Email preview required** before send: user must see and confirm email content before queuing
- **No AI auto-send**: AI drafts the text; user reviews; user clicks Confirm to send
- **DMS attachments**: only attached after permission check — e.g. salary certificates require `hr.payroll.view`
- **Generated PDF/DOCX**: HR letters generated as PDF/DOCX attachments, reviewed before send
- **Audit event**: `hr_email_sent` logged to `audit_logs` for every sent email
- **Link to HR process**: email queue record includes `related_entity_type` and `related_entity_id` where applicable

## 21.3 HR Email Use Cases

| Trigger | Template | Recipient | Send Mode |
|---|---|---|---|
| Offer letter | `HR_OFFER_LETTER` | Candidate email | Manual (AI drafts, HR reviews, HR sends) |
| Interview invitation | `HR_INTERVIEW_INVITE` | Candidate email | Manual |
| Joining instructions | `HR_JOINING_INSTRUCTIONS` | Employee email | Manual |
| Document renewal reminder | `HR_DOCUMENT_RENEWAL_REMINDER` | Employee + PRO | Manual |
| Leave approval / rejection | `HR_LEAVE_DECISION` | Employee | Auto-on approval action |
| Salary certificate / NOC | `HR_SALARY_CERTIFICATE` | Employee | Manual (AI drafts, HR reviews) |
| EOS clearance request | `HR_EOS_CLEARANCE` | Department heads | Manual |
| HR document request | `HR_DOCUMENT_REQUEST` | Employee / Supervisor | Manual |

Templates seeded in `erp_notification_templates` during HR.1.

---

# 22. Export / Print / Report Plan

## 22.1 Export Formats

| Format | Use |
|---|---|
| PDF | Formal reports, employee profile print, HR letters |
| Excel (.xlsx) | Tabular data, WPS SIF preparation |
| CSV | Raw data export |
| Word/DOCX | HR letters, salary certificates, NOC |
| Print View | Browser print-optimized layout |

**All exports must respect permissions and redaction. Server-side data must be masked before generating the file.**

## 22.2 Core Reports (HR.11 — 15 reports)

These 15 reports must be implemented in HR.11:

| # | Report | Filters | Key Columns | Permission |
|---|---|---|---|---|
| 1 | Employee Master | Company/Branch/Dept/Status | Code, Name, Nationality, Designation, Status, Joining | hr.employees.view |
| 2 | Active Employees | Company/Branch/Dept/Category | Code, Name, Dept, Designation, Status | hr.employees.view |
| 3 | Emirates ID Expiry | Expiry range, company | Name, EID No, Expiry, Status | hr.compliance.view |
| 4 | Passport Expiry | Expiry range | Name, Passport No, Expiry, Nationality | hr.compliance.view |
| 5 | Residence Visa Expiry | Expiry range | Name, Visa No, Expiry, Issuing Authority | hr.compliance.view |
| 6 | Labour Card Expiry | Expiry range | Name, Labour No, Expiry | hr.compliance.view |
| 7 | Medical Insurance Expiry | Expiry range, provider | Name, Policy, Insurer, Expiry, Status | hr.compliance.view |
| 8 | CICPA / Access Card Expiry | Type, expiry range | Name, Card No, Site, Expiry | hr.compliance.view |
| 9 | Training Expiry | Type, expiry range | Name, Training, Provider, Expiry | hr.compliance.view |
| 10 | Missing Documents | Entity type, company | Name, Doc Type, Required, Missing | hr.compliance.view |
| 11 | Attendance | Date range, dept, site | Name, Date, Status, Hours, OT, Late | hr.attendance.view |
| 12 | Leave Balance | Year, dept | Name, Type, Entitled, Used, Balance | hr.leave.view |
| 13 | Payroll / WPS Readiness | Company | Name, Gross (masked), WPS Status, IBAN Status | hr.payroll.view |
| 14 | Blocked Employees | Block reason, site | Name, Reason, Since, Unblock Requirements | hr.assignments.view |
| 15 | Site Readiness | Site, dimension | Name, Site, All readiness dimensions | hr.assignments.view |

## 22.3 Extended Reports (HR.11 extension or later phases)

32 additional reports planned — implemented after core reports are stable:

Inactive/Terminated · New Joiners · Probation · Dependents Expiry · Plant Access Card Expiry · H2S Expiry/Missing · ADSD Expiry · WMS/PTW Expiry · ADNOC Readiness · Medical Fitness · HR Hold / Disciplinary · EOS · Clearance Pending · AI Suggestions Pending · HR Data Quality · Salary Revision History · Missing IBAN · Salary Hold · PRO Renewal Pending · Medical Insurance by Provider · Offshore-Ready · Driver-Ready · Available Employees · Sick Leave · Overtime · Absence · Turnover · Candidate Pipeline · Onboarding Checklist Status · Unverified Documents · WPS SIF Export · Employee Master Export (full)

---

# 23. Audit Logging Plan

## 23.1 Standard Audit Events

All HR mutations use `logAudit()` with `module_code: 'HR'`. Every child-record mutation must include `parent_employee_id`, `employee_code`, `employee_name` in `metadata_json` so the Employee Audit tab can reconstruct full history.

```typescript
await logAudit({
  module_code: "HR",
  entity_name: "employee_identity_documents",
  entity_id: doc.id,
  entity_reference: doc.document_number,
  action: "create",
  new_values: { ...validated },
  metadata_json: {
    parent_employee_id: employee.id,
    employee_code: employee.employee_code,
    employee_name: employee.full_name_en,
  },
});
```

## 23.2 Key Audit Events

| Action | Entity | Notes |
|---|---|---|
| `create` | `employees` | New employee |
| `update` | `employees` | Field change |
| `status_change` | `employees` | Status transition |
| `archive` | `employees` | Soft delete |
| `create` / `update` / `verified` | `employee_identity_documents` | |
| `create` / `update` | `employee_medical_insurances` | |
| `create` / `update` | `employee_dependents` | |
| `create` / `update` | `employee_access_cards` | |
| `create` / `update` | `employee_training_certificates` | |
| `create` / `update` | `employee_medical_records` | |
| `create` | `employee_attendance_daily_summary` | |
| `corrected` | `employee_attendance_corrections` | Attendance correction |
| `create` / `approved` / `rejected` | `employee_leave_requests` | |
| `salary_revised` | `employee_salary_revisions` | Salary change |
| `payroll_hold` | `employee_payroll_holds` | Hold placed |
| `assigned` | `employee_assignments` | Site assignment |
| `blocked` / `unblocked` | `employee_block_events` | |
| `pro_stage_changed` | `employee_pro_processes` | PRO update |
| `disciplinary_action` | `employee_disciplinary_actions` | Warning/case |
| `eos_initiated` / `eos_clearance_updated` | `employee_end_of_service_cases` | |
| `hr_email_sent` | `erp_email_queue` | Email sent from HR |

## 23.3 Sensitive Masking in Audit

- Salary / gross salary → masked `***` if no `hr.payroll.view`
- IBAN / account number → always masked `AE**...****`
- Passport number → partial mask `A1234**`
- Emirates ID → partial mask `784-****-*`
- Medical record change details → hidden if no `hr.medical.view`
- Disciplinary details → hidden if no `hr.actions.view`

---

# 24. Sensitive Data and Redaction Plan

## 24.1 Sensitive Fields

The following fields are classified as sensitive and must be redacted server-side before reaching UI or export:

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
```

## 24.2 Redaction Rules

| Field Group | Visible To | Masked / Hidden For |
|---|---|---|
| Salary, gross, allowances | `hr.payroll.view` + | Others: `***` |
| IBAN / account number | `hr.payroll.manage` | Others: `AE**...****` |
| Bank name | `hr.payroll.view` + | Not sensitive |
| Medical results, restrictions | `hr.medical.view` + | Others: entire sub-section hidden |
| Medical DMS report link | `hr.medical.view` + | Others: hidden |
| Passport number | `hr.compliance.view` + | Others: partial `A123***` |
| Emirates ID number | `hr.compliance.view` + | Others: partial `784-****` |
| Dependent passport number | `hr.compliance.view` + | Others: partial |
| Disciplinary warning details | `hr.actions.view` + | Others: only "HR Hold Active" badge shown |

## 24.3 Draft Store Denylist

These fields must **never** be stored in `useWorkspaceFormDraft` (extends existing `DRAFT_FIELD_DENYLIST`):

```text
iban, account_number, passport_number, emirates_id_number
salary, basic_salary, gross_salary, medical_result, restriction_details, disciplinary_details
dependent_passport_number, dependent_emirates_id_number
```

**Rule:** If sensitive draft exclusion cannot be guaranteed in a tab, **disable workspace draft entirely** for the Payroll, Medical Records, and Disciplinary sub-sections. Never rely on client-side filtering alone.

## 24.4 Redaction Must Be Server-Side

Sensitive fields must be masked in the server action response — not in React. Export generators must receive pre-masked data. No raw sensitive value must reach the client payload for a non-authorized user.

---

# 25. Implementation Phases

**Rule:** Each phase is implemented separately and only after Sameer/Dina explicit approval. No phase starts without the previous phase closure report and SOT update.

## HR.0 — Readiness Audit and Final Plan

**Goal:** Confirm plan, verify codebase readiness, no implementation.

**Scope:**
- Audit existing `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `countries`, `emirates`, `banks` tables — confirm ready for HR FK use
- Audit existing DMS entity types — confirm `employee` and `employee_compliance` are pre-registered
- Audit Common AI phase status — confirm AI.1–AI.7, AI.13–AI.15 complete
- Audit `erp_notification_templates` — plan HR email templates
- Confirm numbering rules engine (`generateNextReference`) available for employee codes
- Produce final approved plan (this document + corrections)

---

## HR.1 — HR Settings Foundation

**Goal:** Create all HR lookup/config tables, seed data, permissions, MOHRE establishments, UI settings screens.

**DB migrations:**
- All HR settings tables (§16.9) — `hr_employee_categories`, `hr_employment_types`, `hr_grades`, `hr_identity_document_types`, `hr_access_card_types`, `hr_training_categories`, `hr_training_types` (20+ seeds), `hr_medical_record_types`, `hr_leave_types`, `hr_relationship_types`, `hr_salary_component_types`, `hr_payroll_groups`, `hr_mohre_establishments`, `hr_pro_process_types`, `hr_readiness_rule_templates`, `hr_role_requirement_matrix`, `hr_site_requirement_matrix`, `hr_approval_workflows`
- Seed all 28+ HR permissions with role mappings
- Seed HR email templates in `erp_notification_templates`
- Seed HR numbering rule (employee code prefix `EMP`)
- RLS on all settings tables

**UI:** `/admin/hr/settings/` with CRUD for each settings table  
**TypeScript/Build:** TS PASS | Build PASS

---

## HR.2 — Employee Master and Profile Shell

**Goal:** Core `employees` table, list screen, profile shell with Overview + Profile tabs.

**DB migrations:**
- `employees` table (§16.1) — no `hr_candidate_id`
- `employee_status_events` (append-only status log)
- RLS policies and helper functions (aligned with existing RBAC pattern)
- Numbering rule: `EMP` prefix

**Server actions:** `createEmployee`, `updateEmployee`, `getEmployee`, `getEmployees`, `archiveEmployee`, `getEmployeeOverview`

**UI:**
- `/admin/hr/employees` — list with filters, table, quick view
- `/admin/hr/employees/record/new` — new employee form
- `/admin/hr/employees/record/[id]` — profile shell: header + 10-tab bar + Overview tab + Profile tab
- AI Review tab: placeholder ("HR AI integration planned for HR.12")
- HR sidebar entries

**AI Readiness:** Route URL pattern stable · AI Review tab placeholder visible · audit events include `parent_employee_id`  
**TypeScript/Build:** TS PASS | Build PASS

---

## HR.3 — Compliance Inside Employee Profile

**Goal:** All 6 compliance child tables inside the Compliance tab.

**DB migrations:**
- `employee_identity_documents` (with UAE-specific optional fields)
- `employee_medical_insurances`
- `employee_dependents`
- `employee_access_cards`
- `employee_training_certificates`
- `employee_medical_records`
- `employee_document_links` (DMS many-to-many approach)
- All RLS policies (medical sub-section uses `current_user_can_view_employee_medical()`)
- Add HR DMS entity types to `dms-entity-types.ts` (7 new types)
- Add HR DMS required document rules (5 rules)

**Server actions:** CRUD for all 6 compliance tables + document link actions + verification actions

**UI:**
- Compliance tab with 6 collapsible sub-sections
- Each: table + `ERPChildDialogForm` for add/edit
- Medical Records sub-section: hidden if no `hr.medical.view`
- Expiry color coding (Green ≥60d / Amber <60d / Red expired)
- Compliance tab badge count

**AI Readiness:** Stable entity types, `verification_status` and `renewal_status` fields present, DMS links wired  
**TypeScript/Build:** TS PASS | Build PASS

---

## HR.4 — Time Foundation

**Goal:** Attendance (two-table approach), shift assignment, leave, overtime inside Time tab.

**DB migrations:**
- `employee_attendance_punches` (raw, no unique constraint per day)
- `employee_attendance_daily_summary` (approved summary, `UNIQUE(employee_id, attendance_date)`)
- `employee_attendance_corrections` (append-only)
- `employee_shift_assignments` (references `work_calendars`, `work_shifts`)
- `employee_leave_requests`
- `employee_leave_balances`
- `employee_overtime_records`
- All RLS policies

**Server actions:** Attendance CRUD, leave CRUD + approval actions, shift assignment, overtime

**UI:**
- Time tab in Employee Profile (Attendance list + Shift + Leave + Balance)
- `/admin/hr/time/attendance` — daily attendance global view
- `/admin/hr/time/leave` — leave request management + approval workflow
- `/admin/hr/time/shifts` — shift assignment (bulk)

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.5 — Payroll & WPS Readiness

**Goal:** Salary profile, salary components, WPS data, MOHRE establishment linkage inside Payroll tab.

**DB migrations:**
- `employee_payroll_profiles`
- `employee_salary_components` (separate table, not JSON)
- `employee_salary_revisions` (append-only)
- `employee_payroll_holds`
- `employee_wps_profiles` (bank_id → `banks.id` Finance Basics, mohre_establishment_id → `hr_mohre_establishments`)
- All RLS policies with `current_user_can_view_employee_payroll()` helper

**Server actions:** Payroll CRUD with server-side salary masking, salary revision, WPS validation, WPS SIF export

**UI:**
- Payroll & WPS tab — salary masked for non-payroll users
- `/admin/hr/payroll/salaries` — global salary view
- `/admin/hr/payroll/wps` — WPS file preparation + export

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.6 — Operations and Readiness

**Goal:** Assignments, context-aware readiness engine, blocked status, assets inside Operations tab.

**DB migrations:**
- `employee_assignments`
- `employee_readiness_status` (context-aware: general/site/client/role/assignment)
- `employee_block_events` (append-only)
- `employee_assets_facilities`
- All RLS policies

**Server actions:**
- `updateEmployeeAssignment`, `computeEmployeeReadiness(employeeId, contextType, contextId)`, `blockEmployee`, `unblockEmployee`, `getReadinessMatrix`

**Readiness engine:** Deterministic TypeScript — no AI. Reads `hr_readiness_rule_templates` + compliance data.

**UI:**
- Operations tab in Employee Profile (Assignment + Readiness Matrix + Assets)
- `/admin/hr/assignments/readiness` — cross-employee site readiness
- `/admin/hr/assignments/blocked` — blocked employees list

**AI Readiness:** Deterministic readiness output stable (`employee_readiness_status`)  
**TypeScript/Build:** TS PASS | Build PASS

---

## HR.7 — HR Actions

**Goal:** PRO processes, performance, disciplinary, notes, EOS case inside HR Actions tab.

**DB migrations:**
- `employee_pro_processes`
- `employee_performance_reviews`
- `employee_disciplinary_actions`
- `employee_notes`
- `employee_approvals`
- `employee_end_of_service_cases`
- `employee_clearance_items`
- All RLS policies (disciplinary uses `current_user_can_view_employee_disciplinary()`)

**Server actions:** Full CRUD for all tables + EOS workflow + clearance tracking

**UI:**
- HR Actions tab in Employee Profile (5 sub-sections)
- Disciplinary sub-section hidden if no `hr.actions.view`
- `/admin/hr/eos/cases` — EOS management
- `/admin/hr/eos/clearance` — clearance tracker

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.8 — Recruitment & Onboarding

**Goal:** Full recruitment workflow — manpower requests through new joiner conversion.

**DB migrations:**
- `hr_manpower_requests`
- `hr_job_openings`
- `hr_candidates`
- `hr_candidate_interviews`
- `hr_offer_letters`
- `hr_onboarding_checklists` + `hr_onboarding_tasks`
- `employee_recruitment_links` — links `employees` to `hr_candidates`, `hr_manpower_requests`, `hr_offer_letters`

**Server actions:** Full CRUD + `convertCandidateToEmployee` (creates employee + recruitment link)

**UI:**
- `/admin/hr/recruitment/manpower-requests`
- `/admin/hr/recruitment/candidates`
- `/admin/hr/recruitment/new-joiners` (+ Convert button)
- Onboarding checklist per employee (inside Profile tab Section C)
- Probation tracking view

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.9 — Single HR Dashboard

**Goal:** One comprehensive HR dashboard — monitoring only, no editing.

**Server actions:** `getHRDashboardOverview`, `getHRDashboardSection(sectionCode, filters)`

**UI:**
- `/admin/hr/dashboard` — 14 sections, all filters
- Every row click → Employee Profile at relevant tab + child record section
- Export summary as PDF

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.10 — Single HR Search

**Goal:** Comprehensive HR search — deterministic + AI-placeholder.

**DB:** `hr_recent_searches` table

**Server actions:** `searchHREmployees`, `getHRSearchSuggestions`, `saveHRRecentSearch` (AI natural language delegated to HR AI.4 in HR.12)

**UI:**
- `/admin/hr/search` — keyword + advanced filters + AI search (placeholder until HR.12)
- Result cards with badges + open employee link + export

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.11 — Reports / Print / Export / Email

**Goal:** 15 core reports, HR letters, email templates.

**Server actions:** `generateHRReport(reportType, filters)` — parameterised report engine with server-side redaction

**UI:**
- `/admin/hr/reports` — report library index
- Individual report pages with filters + export buttons
- HR letter generation (DOCX/PDF from template)
- Email preview + confirm before send

**Note:** Implement 15 core reports first. Extended reports planned for HR.11 extension or later.

**TypeScript/Build:** TS PASS | Build PASS

---

## HR.12 — HR AI Integration

**Goal:** Connect Common AI phases to HR entities — AI fill, search, compliance, readiness explanation, letters.

**DB migrations:**
- 7 HR AI feature flags (all default false)
- HR AI permissions (5 new `ai.hr.*` codes)
- Common AI.1 HR entity registries (employee, identity_doc, training_cert, access_card)
- Common AI.4 HR compliance rules
- Common AI.15 HR data quality rules (missing IBAN, invalid EID format, missing DOB, etc.)

**Subphases:** HR AI.1 → HR AI.2 → HR AI.3 → HR AI.4 → HR AI.5 → HR AI.6 → HR AI.7 (each approved separately)

**Deliverables per subphase:**
- HR AI.1: Registries + flags + permissions
- HR AI.2: AI fill from Emirates ID / Passport / Visa / Insurance / Training / Access cards
- HR AI.3: AI corrections + duplicate employee detection
- HR AI.4: Natural language HR search wired to Common AI.6
- HR AI.5: Compliance checker + risk scoring + readiness explanation for HR entities
- HR AI.6: New assistant actions — `PREPARE_HR_LETTER_DRAFT`, `PREPARE_RENEWAL_CHECKLIST`, `PREPARE_HR_EMAIL_DRAFT`
- HR AI.7: Full security audit of HR AI — flags, permissions, sensitive field handling, RLS

**TypeScript/Build:** TS PASS | Build PASS (per subphase)

---

## HR.13 — Security / RLS / QA / UAT Closure

**Goal:** Full security audit, RLS verification, permissions matrix check, UAT closure.

**Scope:**
- Verify all HR tables: `relrowsecurity=true, relforcerowsecurity=true`
- Verify append-only event tables have SELECT + INSERT only — no UPDATE/DELETE policies
- Test all RLS helper functions (view_employee, view_employee_medical, view_employee_payroll, view_employee_disciplinary)
- Test sensitive data masking (payroll, medical, disciplinary, passport, EID)
- TypeScript: 0 errors
- Build: PASS
- Full UAT checklist execution
- Produce closure report + update SOT

---

# 26. Phase-by-Phase Acceptance Criteria

| Phase | Go/No-Go Criteria |
|---|---|
| HR.0 | Plan reviewed and approved by Sameer; readiness audit confirms all dependency tables exist |
| HR.1 | All settings tables created; all 28+ HR permissions seeded with role mappings; HR numbering rule active; HR email templates seeded; TS PASS; Build PASS |
| HR.2 | `employees` table with RLS live; profile shell loads; Overview + Profile tabs functional; employee CRUD with audit; AI Review tab placeholder present; TS PASS; Build PASS |
| HR.3 | All 6 compliance child tables live with RLS; child forms use `ERPChildDialogForm`; expiry color coding correct; DMS link + `employee_document_links` working; medical sub-section hidden without permission; TS PASS; Build PASS |
| HR.4 | Two-table attendance works; leave approval workflow operational; shift assignment functional; leave balance calculates; TS PASS; Build PASS |
| HR.5 | Salary fields masked for non-payroll users; IBAN masked always; gross calculated server-side from components; WPS SIF export works; TS PASS; Build PASS |
| HR.6 | Readiness engine calculates at least 5 dimensions correctly; context-type supported (general + site); blocked employee shows unblock requirements; TS PASS; Build PASS |
| HR.7 | PRO processes tracked through stages; disciplinary records hidden without permission; EOS case with clearance checklist; TS PASS; Build PASS |
| HR.8 | Candidate-to-employee conversion creates employee + recruitment link; onboarding checklist visible on Profile tab; TS PASS; Build PASS |
| HR.9 | All 14 dashboard sections load; clicking alert row opens Employee Profile at correct tab; all filters work; TS PASS; Build PASS |
| HR.10 | Keyword search returns correct results; advanced filters work; AI search shows placeholder; export works; TS PASS; Build PASS |
| HR.11 | All 15 core reports work with export; server-side salary masking verified in exports; HR letter generation produces readable output; TS PASS; Build PASS |
| HR.12 | AI fill from Emirates ID upload → suggestion in AI Review tab → apply works; HR natural language search returns reasonable results; HR data quality rules produce findings; TS PASS; Build PASS (per subphase) |
| HR.13 | All HR tables: RLS verified live; all sensitive masking tested; supervisor sees only allowed data; 0 TS errors; Build PASS; full UAT checklist signed off by Sameer |

---

# 27. QA and UAT Strategy

## 27.1 Automated Checks (per phase)

```bash
npx tsc --noEmit    # 0 errors required
npm run build       # Build PASS required
```

## 27.2 RLS Verification SQL

```sql
-- All HR tables must have RLS enabled and forced
SELECT tablename, relrowsecurity, relforcerowsecurity
FROM pg_class
JOIN pg_tables ON tablename = relname AND schemaname = 'public'
WHERE tablename LIKE 'employee%' OR tablename LIKE 'hr_%'
ORDER BY tablename;
-- Expected: all (true, true)

-- Append-only tables: only SELECT + INSERT allowed
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('employee_block_events','employee_salary_revisions',
                    'employee_status_events','employee_attendance_corrections')
ORDER BY tablename, cmd;
-- Expected: SELECT and INSERT only — no UPDATE, no DELETE
```

## 27.3 Product UX Tests (Critical — HR.9/HR.10/HR.13)

| Test | Expected |
|---|---|
| Dashboard loads | Only ONE HR Dashboard at `/admin/hr/dashboard` |
| Search loads | Only ONE HR Search at `/admin/hr/search` |
| No separate compliance module | No `/admin/hr/compliance` route exists |
| Dashboard drill-down — expired CICPA | Opens Employee Profile → Compliance tab → Access Cards section |
| Dashboard drill-down — missing IBAN | Opens Employee Profile → Payroll & WPS tab |
| Dashboard drill-down — blocked employee | Opens Employee Profile → Operations tab → Readiness |
| Dashboard drill-down — pending PRO | Opens Employee Profile → HR Actions tab |
| Compliance update | Done from Compliance tab inside Employee Profile |
| Document renewal | Done from HR Actions tab (PRO process) inside Employee Profile |
| Search result click | Opens Employee Profile at relevant tab |

## 27.4 Permission Tests

| Test | Expected |
|---|---|
| Login as `hr_officer` | Can see employee list, cannot see salary figures, cannot archive employee |
| Login as `payroll_officer` | Salary visible, IBAN visible but masked unless `hr.payroll.manage`, cannot edit profile fields |
| Login as `supervisor` | Sees basic profile, attendance, leave, readiness status; cannot see salary, medical, disciplinary, dependents |
| Login as `hse_officer` | Can see medical fitness records; cannot see disciplinary, salary |
| Login as non-HR user | Gets `hr.employees.view` permission denied state on all HR routes |

## 27.5 Sensitive Data Tests

| Test | Expected |
|---|---|
| Non-payroll user views employee profile | Payroll tab: salary shows `***`; IBAN shows `AE**...**` |
| Non-payroll user exports employee data | Export file: salary columns redacted |
| Non-medical user views compliance tab | Medical Records sub-section is hidden entirely |
| Any user views WPS section | IBAN always shows masked regardless of role |
| Supervisor views employee | Full document numbers partially masked |
| Audit tab as non-payroll | Salary old/new values masked in audit history |

## 27.6 AI Safety Tests (HR.12)

| Test | Expected |
|---|---|
| Upload Emirates ID | AI suggestion appears in AI Review tab — NOT auto-applied to identity document |
| Accept AI suggestion | User clicks Accept, then Apply — field updated with audit event |
| HR letter draft | AI drafts text; user must review and click Send; draft cannot be sent automatically |
| AI email draft | Email preview shown; user confirms; HR email queued — no auto-send |
| Raw OCR text in AI logs | Must not appear in `audit_logs`, `erp_ai_usage_logs`, or any server action response |

## 27.7 Child Audit Metadata Tests

| Test | Expected |
|---|---|
| Add identity document to employee | `audit_logs` row includes `metadata_json.parent_employee_id` = employee.id |
| Add training certificate | `audit_logs` row includes `employee_code` and `employee_name` in metadata |
| Employee Audit tab | Shows child record events with full context |

## 27.8 UAT Checklist by Phase (High-Level)

| Phase | UAT Items |
|---|---|
| HR.1 | All settings screens accessible; can CRUD each lookup type |
| HR.2 | Add employee; profile loads; overview shows; edit profile; employee code auto-generated |
| HR.3 | Add each compliance record type; expiry dates color-coded; DMS attachment works; medical section hidden without permission |
| HR.4 | Record attendance (punch + summary); approve leave; shift assignment shows on profile |
| HR.5 | Salary visible only to payroll users; IBAN masked; WPS SIF exports correctly |
| HR.6 | Assignment recorded; readiness dimensions correct; blocked reason shows with resolve links |
| HR.7 | PRO process tracked; disciplinary warning hidden without permission; EOS case created |
| HR.8 | Candidate created; interview recorded; offer letter; candidate converted to employee; recruitment link visible on Profile |
| HR.9 | All 14 dashboard sections load; alerts drill to correct Employee Profile tab; export works |
| HR.10 | Name search returns employee; EID number search returns employee; advanced filters work |
| HR.11 | EID expiry report filters and exports; salary report masked for non-payroll; letter generated |
| HR.12 | AI fill from document; AI search natural language; AI readiness explanation; no auto-actions |
| HR.13 | Full RLS verified; all sensitive masking correct; all UAT items from HR.1–HR.12 re-verified |

---

# 28. Risks, Dependencies, and Deferred Items

## 28.1 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Very large employee count (10,000+) | HIGH | Pagination (50/page), GIN indexes on search fields, materialized readiness summary |
| Sensitive data leak (payroll/medical) | HIGH | RLS helper functions + server-side masking before client payload + draft denylist |
| IBAN/bank details exposure | CRITICAL | Never return in client payloads; masked string from server |
| Attendance data volume (daily rows) | MEDIUM | Separate punch + summary tables; index on `(employee_id, attendance_date)` |
| Readiness engine performance | MEDIUM | `employee_readiness_status` as cached table — recompute on relevant change, not on demand |
| WPS file format changes (Central Bank) | LOW | Abstract WPS export into versioned generator function |
| DMS entity type omission in HR.3 | MEDIUM | Must update `dms-entity-types.ts` — existing DMS code breaks if entity type not registered |
| Company-scope RBAC alignment | MEDIUM | Cursor must read existing RBAC patterns before writing HR RLS helpers — do not assume simple `current_user_company_id()` |
| Duplicate settings tables | HIGH | Follow Master Data Reuse Matrix (§2.5) strictly — Cursor must check existing tables before creating new ones |

## 28.2 Dependencies

| Dependency | Available? |
|---|---|
| `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts` | ✅ COMMON MD.1 |
| `countries`, `emirates`, `cities` tables | ✅ Existing global geography |
| `banks` table (Finance Basics) | ✅ Available |
| `DmsEntityDocumentsTab` | ✅ DMS.15 |
| Common AI provider bridge | ✅ AI.0–AI.7 |
| `logAudit()` | ✅ Standard helper |
| `getAuthContext()` + `hasPermission()` | ✅ Standard RBAC |
| `erp_email_queue` + `erp_notification_templates` | ✅ NOTIFICATIONS.1 |
| `ERPRecordWorkspaceForm`, `ERPChildDialogForm`, `ERPCombobox` | ✅ All available |
| `useWorkspaceFormDraft` | ✅ Available |
| Fleet module (vehicle assignment in Operations tab) | ❌ Deferred |
| Finance / accounting integration | ❌ Deferred |
| Biometric hardware integration | ❌ Deferred |
| Employee self-service portal | ❌ Deferred |
| Payroll run / payslip generation | ❌ Deferred |

## 28.3 Deferred Items

| Item | Deferred To |
|---|---|
| Employee self-service (leave requests, document upload) | HR.14+ |
| Finance / accounting cost analytics per employee | Finance module |
| Payroll run + payslip generation | Finance module or HR.15 |
| Biometric system integration | HR.14+ |
| Vehicle / equipment assignment in Operations tab | After Fleet module |
| WPS bank transfer automation | After banking integration |
| End-of-service gratuity calculation | Finance module |
| HR mobile app | Future mobile phase |
| LMS (Learning Management System) | HR.16+ |
| Manpower planning analytics | HR.17+ |
| Extended reports (32 remaining) | HR.11 extension |

---

# 29. Open Questions / Decisions Needed from Sameer

| # | Question | Recommended Default |
|---|---|---|
| 1 | Employee code format: `EMP-YYYY-000001` or `EMP-000001` or company-specific prefix? | `EMP-YYYY-000001` unless Sameer decides company-specific |
| 2 | Multiple companies per employee: can one employee belong to 2+ `owner_companies` simultaneously? | **One employer company in v1** — single `owner_company_id` FK |
| 3 | Leave balance reset: joining anniversary or calendar year (Jan 1)? | **Configurable in HR Settings — default: joining anniversary** |
| 4 | WPS applicable by default for all employees? | **True by default; can be exempted per employee** |
| 5 | Probation period duration: 90 days, 6 months, or per-contract? | **Configurable in HR Settings — default: as stated in contract** |
| 6 | H2S / document expiry alert threshold: 30 days, 60 days, or 90 days before expiry? | **Configurable per document type — default: 60 days** |
| 7 | CICPA pass site-specific or global? (Does one CICPA pass cover all ADNOC sites?) | **Make configurable by access card type and readiness rule template** |
| 8 | EOS financial calculation: should HR module calculate gratuity amounts? | **Deferred to Finance module** |
| 9 | Employee photo: DMS pipeline or simpler direct storage bucket? | **DMS pipeline — photo linked via `photo_dms_document_id`** |
| 10 | Salary certificates / NOC: ALGT DOCX template or AI-drafted with template selection? | **DOCX template-based; AI can assist with content drafting** |
| 11 | Maximum employee count expected? | Determine for indexing decisions |
| 12 | HR.12 AI priority: AI fill from documents or AI readiness explanation first? | **AI fill first (HR AI.2), then readiness explanation (HR AI.5)** |
| 13 | Leave approval: single-level (HR Manager) or multi-level (Supervisor → HR Manager → GM)? | **Configurable in `hr_approval_workflows` — default: HR Manager only** |
| 14 | Disciplinary records: should supervisor see active hold status (without full details)? | **Yes — show only badge "HR Hold Active"; no details visible to supervisor** |

---

# 30. Cursor Implementation Readiness Checklist

## Pre-Phase Checks (Every Phase)

- [ ] `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` is read
- [ ] This master plan (corrected version) is read
- [ ] Previous phase implementation report is read
- [ ] Live DB accessible via `user-supabase` (project: `mmiefuieduzdiiwnqpie`)
- [ ] All open questions for this phase are resolved (ask Sameer if not)

## Master Data Reuse Check (Before Creating Any Table)

- [ ] Does this data already exist in: `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts`, `countries`, `emirates`, `cities`, `banks`, `owner_companies`, `branches`?
- [ ] If yes → use FK to existing table. Do NOT create a new HR table.

## Technical Readiness (HR.2+)

- [ ] Confirm `departments`, `designations`, `work_sites`, `work_calendars`, `work_shifts` in live DB
- [ ] Confirm `countries` and `emirates` tables exist and are populated
- [ ] Confirm `banks` table exists (Finance Basics)
- [ ] Confirm `DmsEntityDocumentsTab` importable from `@/features/dms/entity-documents`
- [ ] Confirm `logAudit()` importable from `@/server/actions/audit`
- [ ] Confirm `getAuthContext()` + `hasPermission()` importable from `@/lib/rbac/check`
- [ ] Confirm `ERPRecordWorkspaceForm`, `ERPChildDialogForm`, `ERPCombobox` importable

## Implementation Standards to Follow

- [ ] All HR table PKs: `BIGINT GENERATED ALWAYS AS IDENTITY`
- [ ] All HR tables: `ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`
- [ ] All server actions: `'use server'` + `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()`
- [ ] All child audit events: include `parent_employee_id`, `employee_code`, `employee_name` in `metadata_json`
- [ ] All employee workspace forms: `useWorkspaceFormDraft`
- [ ] Sensitive fields excluded from draft store
- [ ] All async dropdowns: `ERPCombobox` (never shadcn `<Select>` for async data)
- [ ] All new HR query keys under `queryKeys.hr.*` namespace
- [ ] No direct OpenAI imports outside Common AI provider bridge
- [ ] Redaction done server-side before client payload
- [ ] Append-only event tables: SELECT + INSERT policies only

## Post-Phase Required

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run build` → PASS
- [ ] All new HR tables confirmed in live DB with RLS enabled+forced
- [ ] Implementation report created in `implementation_Review/HR_Phases/Phase_HR_XX/`
- [ ] SOT updated with phase closure entry
- [ ] Sameer approves before next phase begins

---

*Last updated: 2026-06-18 — Correction Update applied (see Revision Notes at top).*  
*Last reviewed against SOT: 2026-06-18 — SOT last closed gate: ERP COMMON AI FIX.1 (hotfix after ERP COMMON AI.15 — Data Quality Monitor). Common AI.1–AI.7 and AI.13–AI.15 complete for existing ERP scope. AI.8 HR AI deferred until this HR module exists.*
