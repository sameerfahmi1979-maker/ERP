# ERP BASE 002F.5A V3 — Final Review-Only Party Master Technical Plan

**REVIEW ONLY — DO NOT IMPLEMENT**  
**Document type:** Technical plan  
**Phase:** ERP BASE 002F.5A  
**Version:** V3 — Final review-only package  
**Status:** DRAFT FOR SAMEER APPROVAL  
**Generated:** 2026-06-13  
**Prompt:** `ChatGPT/ERP_BASE_002F_5A_V3_FINAL_REVIEW_ONLY_PARTY_MASTER_PLAN.md`  
**Supersedes:** V1 (`Phase_002F_5A_Party_Master_Planning/`) and V2 (`Phase_002F_5A_Party_Master_Planning/*_V2.*`)  
**Output folder:** `implementation_Review/ERP_BASE_002F_5A_Party_Master_V3/`

---

## V3 Fixes vs V2

| # | V2 Issue | V3 Fix |
|---|---|---|
| 1 | Incomplete RLS: "apply similarly" placeholder text | Every table has named, explicit DROP + CREATE POLICY blocks in SQL |
| 2 | `party_finance_profiles` missing `payment_hold_by` and `payment_hold_at` | Added both columns — SUPABASE_VERIFIED: renamed to `finance_hold_by` / `finance_hold_at` per §5.1 |
| 3 | `party_notes` missing `note_code` and `follow_up_date` | Added both; `is_important` removed (not in V3 spec) |
| 4 | Profile `remarks` field unnamed | Each profile has a typed remarks field: `customer_remarks`, `vendor_remarks`, etc. |
| 5 | Missing `view_bank_details` permission | Added; bank details RLS SELECT uses `view_bank_details OR manage_bank_details` |
| 6 | Missing `lock` and `view_audit` permissions | Added both |
| 7 | `manage_service_categories` permission name | Renamed to `manage_services` per V3 prompt §17 |
| 8 | Missing `sales_manager` role mapping | Added |
| 9 | `customer_type_code` text field in customer profile | Removed; all FK-based per §9 dynamic data rule |
| 10 | `PartySelect` missing `cityId` and `excludePartyId` props | Added both |
| 11 | Government Authority profile showed for only 2 types | Correct: visible for GOVERNMENT_AUTHORITY, LICENSE_ISSUER, **and FREE_ZONE_AUTHORITY** |
| 12 | Duplicate function named `find_possible_duplicate_parties` | Renamed to `detect_possible_party_duplicates` per V3 §19 |
| 13 | V2 had 4 output files | V3 adds 5th file: `REVIEW_NOTES_AND_DECISIONS.md` |
| 14 | Filtered view columns didn't include Status/Phone/Email | V3 §12.3 simplified columns include Status, Main Phone, Main Email |

---

## 1. Executive Summary

ALGT ERP replaces six siloed party tables (`customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`) with one unified **Party Master**. A single `parties` row can hold **multiple dynamic party type assignments**. Role-specific data lives in six optional 1:1 **profile tables**.

**No implementation is performed in this phase.** No migrations applied. No source code changed. Customer module untouched until explicit phase 5A.5 retirement.

---

## 2. Current State

### Live database (`mmiefuieduzdiiwnqpie`)

- 56 tables, RLS enabled on all.
- 6 siloed party parent tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`.
- Each has child tables: `*_contacts`, `*_addresses`, `*_documents`, `*_bank_details` (except `government_authorities`).
- Global lookup engine: `global_lookup_categories` / `global_lookup_values` — REV1 seeds for CUSTOMER_TYPES, VENDOR_TYPES, etc.
- Geography masters: `countries`, `emirates`, `cities`, `areas_zones`.
- Finance masters: `currencies`, `payment_terms`, `tax_types`, `banks`.
- Numbering: `global_numbering_rules`.
- Permissions: `master_data.party_master.view` / `.manage`.

### Live UI

- **Customer module CLOSED** — reference at `src/features/master-data/customers/`.
- All other party types: DB only, no UI.
- Global form runtime standard: `ERPDrawerForm`, `ERPFormFooter`, `useFormDirty`, TanStack Query.

---

## 3. Architecture

### 3.1 Table tree

```
parties
├── party_type_assignments (N × party_types)
├── party_licenses         (N)
├── party_tax_registrations (N)
├── party_finance_profiles  (1:1)
├── party_contacts          (N)
├── party_addresses         (N)
├── party_bank_details      (N — permission-gated)
├── party_documents         (N — DMS-ready)
├── party_compliance_profiles (1:1)
├── party_service_category_assignments (N × party_service_categories_master)
├── party_relationships     (N)
├── party_notes             (N)
└── role profiles (0 or 1 each):
      party_customer_profiles      ← CUSTOMER type
      party_vendor_profiles        ← VENDOR type
      party_subcontractor_profiles ← SUBCONTRACTOR type
      party_consultant_profiles    ← CONSULTANT type
      party_recruitment_agency_profiles ← RECRUITMENT_AGENCY type
      party_government_authority_profiles ← GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY
```

### 3.2 Lookup master tables (31 total)

**17 party-specific:** `party_natures`, `party_statuses`, `party_license_types`, `party_license_statuses`, `party_tax_statuses`, `party_contact_roles`, `party_contact_departments`, `party_address_types`, `party_document_types`, `party_document_statuses`, `party_compliance_statuses`, `party_approval_statuses`, `party_blacklist_statuses`, `party_risk_ratings`, `party_credit_ratings`, `party_note_types`, `payment_methods`

**14 role-profile:** `customer_categories`, `customer_statuses`, `invoice_methods`, `vendor_categories`, `vendor_ratings`, `procurement_categories`, `subcontractor_categories`, `work_categories`, `consultant_types`, `consultant_specializations`, `recruitment_categories`, `authority_types`, `industry_sectors`, `sales_regions`

**2 service/relationship:** `party_service_categories_master`, `party_relationship_types`

### 3.3 Full table count

| Group | Count |
|---|---|
| Core (`parties`, `party_types`, `party_type_assignments`) | 3 |
| Party-specific lookup masters | 17 |
| Role-profile lookup masters | 14 |
| Child / transactional | 13 |
| Role profiles | 6 |
| **Total new** | **53** |

Reused existing: `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`, `user_profiles`, `global_numbering_rules`, `permissions`, `roles`, `role_permissions`, `audit_logs`.

### 3.4 Coexistence

| Period | Customer module | Party Master | DB state |
|---|---|---|---|
| Planning | Live | Not built | Legacy only |
| 5A.1–5A.4 | Live reference | New routes | Both coexist |
| 5A.5 (explicit approval only) | Hidden, then archived | Primary | Legacy dropped |

---

## 4. Numbering Plan

| Rule code | Prefix | Example | Phase |
|---|---|---|---|
| MASTER_PARTY | PTY | PTY-000001 | **5A.1** |
| MASTER_PARTY_CONTACT | PTY-CON | PTY-CON-000001 | 5A.2 |
| MASTER_PARTY_ADDRESS | PTY-ADDR | PTY-ADDR-000001 | 5A.2 |
| MASTER_PARTY_BANK | PTY-BANK | PTY-BANK-000001 | 5A.2 |
| MASTER_PARTY_LICENSE | PTY-LIC | PTY-LIC-000001 | 5A.2 |
| MASTER_PARTY_TAX | PTY-TAX | PTY-TAX-000001 | 5A.2 |
| MASTER_PARTY_DOCUMENT | PTY-DOC | PTY-DOC-000001 | 5A.2 |
| MASTER_PARTY_NOTE | PTY-NOTE | PTY-NOTE-000001 | 5A.4 |

All: 6-digit padding, no manual override, gaps allowed, `reserve_on_submit = true`.

---

## 5. Permissions (24 codes — V3)

```
master_data.parties.view
master_data.parties.create
master_data.parties.edit
master_data.parties.delete
master_data.parties.deactivate
master_data.parties.export
master_data.parties.manage_types
master_data.parties.manage_services
master_data.parties.manage_relationships
master_data.parties.manage_licenses
master_data.parties.manage_tax
master_data.parties.manage_contacts
master_data.parties.manage_addresses
master_data.parties.manage_bank_details
master_data.parties.view_bank_details
master_data.parties.verify_bank_details
master_data.parties.manage_documents
master_data.parties.manage_compliance
master_data.parties.approve
master_data.parties.blacklist
master_data.parties.override_duplicate
master_data.parties.lock
master_data.parties.view_audit
master_data.parties.print
```

### Role mapping (V3 — 10 roles, explicit)

| Role | Permissions |
|---|---|
| `system_admin` | ALL 24 |
| `group_admin` | All except `delete`, `lock` |
| `company_admin` | view, create, edit, deactivate, export, manage_types, manage_services, manage_licenses, manage_tax, manage_contacts, manage_addresses, manage_bank_details, view_bank_details, manage_documents, manage_compliance, approve, view_audit, print |
| `branch_admin` | view, create, edit, deactivate, export, manage_contacts, manage_addresses, view_audit, print |
| `finance_manager` | view, manage_tax, manage_bank_details, view_bank_details, verify_bank_details, manage_compliance, approve, export, view_audit |
| `procurement_manager` | view, create, edit, manage_contacts, manage_addresses, manage_licenses, manage_documents, export, print, view_audit |
| `sales_manager` | view, create, edit, manage_contacts, manage_addresses, export, print |
| `hr_manager` | view, manage_contacts, manage_documents, export |
| `hse_manager` | view, manage_compliance, manage_documents, manage_licenses |
| `read_only_user` | view, export, print | *(SUPABASE_VERIFIED: live role code is `read_only_user`, not `viewer`)* |

**Note:** If `sales_manager` role does not yet exist in the ERP, treat as planned — do not insert role_permissions until role is created.

**Backward compatibility:** Server actions check new `parties.*` OR legacy `party_master.*` during coexistence.

---

## 6. RLS Principles

Every new table has `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`. Every table has four named policies: `<table>_select_policy`, `<table>_insert_policy`, `<table>_update_policy`, `<table>_delete_policy`.

**No "apply similarly" language in SQL.**

### Standard policy pattern (child/transactional tables)

```sql
SELECT: parties.view OR party_master.view OR system_admin
INSERT: (manage_X OR party_master.manage OR system_admin) + effectivePartyId must be accessible
UPDATE: manage_X OR party_master.manage OR system_admin (+ lock guard for system tables)
DELETE: system_admin only
```

### Elevated

| Table | SELECT | UPDATE extra |
|---|---|---|
| `party_bank_details` | `view_bank_details OR manage_bank_details OR system_admin` | Same |
| `party_compliance_profiles` | `parties.view OR system_admin` | `manage_compliance OR approve OR blacklist` |
| `party_notes` | Standard + private filter | Standard |
| Lookup masters | `auth.uid() IS NOT NULL` | `manage_types/manage_services + system guard` |

---

## 7. Duplicate Detection

**Function:** `detect_possible_party_duplicates(...)` — returns `(party_id, party_code, display_name, match_type, match_score)`.

| Input | Match type | Severity |
|---|---|---|
| TRN | `EXACT_TRN` | Block |
| License number | `EXACT_LICENSE` | Block |
| IBAN | `EXACT_IBAN` | Warning |
| Legal name | `SIMILAR_LEGAL_NAME` (pg_trgm > 0.45) | Warning |
| Trade name | `SIMILAR_TRADE_NAME` | Warning |
| Email | `EXACT_EMAIL` | Warning |
| Mobile | `EXACT_MOBILE` | Warning |

Override requires `override_duplicate` permission + direct `INSERT INTO audit_logs` (SUPABASE_VERIFIED: `logAudit()` does not exist; use direct INSERT with `entity_name='parties'`, `action='DUPLICATE_OVERRIDE'`).

---

## 8. Implementation Split (Prompt §24)

### 002F.5A.1 — Database Foundation
Apply after Sameer approves V3 SQL. All 53 tables, indexes, RLS, seeds, numbering rules, permissions. No UI.

### 002F.5A.2 — Core UI and Drawer
All Parties list, drawer Tabs 1–7 (Basic, Types, Legal, Tax, Contacts, Addresses, Bank), Documents placeholder, server actions, prefetch.

### 002F.5A.3 — Filtered Views, Admin Masters, PartySelect
10 filtered routes, Party Types / Service Categories / Relationship Types admin CRUD, `PartySelect`, `PartyTypeCheckboxGrid`, `PartyServiceCategorySelector`, sidebar Party Master group.

### 002F.5A.4 — Compliance, Duplicate Detection, Permissions QA
Tabs 8–13 (Services, Compliance, Documents metadata, Relationships, Notes, Audit), role profile sections, duplicate detection UI, override audit.

### 002F.5A.5 — Legacy Customer Retirement (explicit approval only)
Hide route, archive source, drop legacy tables, remove legacy permissions/numbering rules, update SOT.

---

## 9. Deliverables (this folder)

| # | File | Status |
|---|---|---|
| 1 | `ERP_BASE_002F_5A_V3_FINAL_REVIEW_ONLY_PARTY_MASTER_TECHNICAL_PLAN.md` | ✅ This document |
| 2 | `ERP_BASE_002F_5A_V3_PARTY_MASTER_DATABASE_FIELD_MAP.md` | ✅ |
| 3 | `ERP_BASE_002F_5A_V3_PARTY_MASTER_UI_UX_AND_FIELD_MAP.md` | ✅ |
| 4 | `ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY.sql` | ✅ |
| 5 | `ERP_BASE_002F_5A_V3_PARTY_MASTER_REVIEW_NOTES_AND_DECISIONS.md` | ✅ |

---

*End of V3 Technical Plan — REVIEW ONLY — DO NOT IMPLEMENT*
