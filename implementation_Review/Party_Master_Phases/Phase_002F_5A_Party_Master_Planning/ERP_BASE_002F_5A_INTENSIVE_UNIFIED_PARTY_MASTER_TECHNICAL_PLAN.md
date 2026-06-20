# ERP BASE 002F.5A — Intensive Unified Party Master Technical Plan

**Document type:** Planning report (review only — no implementation)  
**Phase:** ERP BASE 002F.5A  
**Status:** DRAFT FOR SAMEER REVIEW  
**Generated:** 2026-06-13  
**Author:** Cursor (planning agent)  
**Prompt source:** `ChatGPT/ERP_BASE_002F_5A_INTENSIVE_PARTY_MASTER_PLANNING_PROMPT.md`

---

## 1. Executive Summary

ALGT ERP will replace six siloed party-master tables (`customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`) with a **single unified Party Master** architecture. One legal entity (`parties`) can hold multiple **party type assignments** (Customer + Vendor + Subcontractor simultaneously). Role-specific attributes live in **optional profile tables**, not in a wide `parties` row.

**This phase produces planning artifacts only.** No migrations applied. No source code modified. Existing Customer module remains live as UI/code reference until explicit retirement phase **002F.5A.5**.

### Deliverables (this folder)

| # | File | Purpose |
|---|---|---|
| 1 | This document | Architecture, phases, risks, SOT impact |
| 2 | `ERP_BASE_002F_5A_PARTY_MASTER_DATABASE_FIELD_MAP.md` | Every table, column, FK, index, RLS, seed |
| 3 | `ERP_BASE_002F_5A_PARTY_MASTER_UI_UX_AND_FIELD_MAP.md` | Routes, drawer tabs, every field & control |
| 4 | `ERP_BASE_002F_5A_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY.sql` | Draft DDL + seeds + RLS (NOT FOR APPLY) |

---

## 2. Current State (Verified)

### 2.1 Live database (`user-supabase` — `mmiefuieduzdiiwnqpie`)

- **56 public tables**, all RLS enabled (verified 2026-06-12 per SOT).
- **Six duplicate party-master parent tables** with near-identical columns (names, TRN, geography FKs, ICV block, CICPA, audit fields).
- **Child tables per entity:** contacts, addresses, documents, bank_details (except `government_authorities` — no bank table by REV1 design).
- **Lookup engine:** `global_lookup_categories` / `global_lookup_values` with REV1 seeds (`CUSTOMER_TYPES`, `VENDOR_TYPES`, `PARTY_STATUS_TYPES`, etc.).
- **Shared masters:** `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`.
- **Numbering:** `global_numbering_rules` with per-entity codes (`CUSTOMER` → `CUST-000001`, etc.).
- **Permissions:** grouped `master_data.party_master.view` / `.manage` (4 permissions from 002F.3E.2).

### 2.2 Live UI

- **Customer module CLOSED** — reference implementation at `src/features/master-data/customers/`.
- **No UI** for Vendors, Subcontractors, Consultants, Government Authorities, Recruitment Agencies (DB-ready only).
- **Global form runtime standard** closed (prefetch, child TanStack Query, Safe Close, FormData safety).

### 2.3 Strategic pivot

| Old direction (002F.3E / 3A plan) | New direction (002F.5A) |
|---|---|
| Copy Customer → build Vendor module | One Party Master + filtered views |
| Separate codes per role (CUST, VEND, SUBC…) | Single `party_code` (PTY-000001) |
| Duplicate legal entity across tables | One party row, many type assignments |
| Migrate customer test data | **Do not migrate** — clean build |

---

## 3. Target Architecture

### 3.1 Core principle

```
parties (1 legal entity)
  ├── party_type_assignments (N types: CUSTOMER, VENDOR, …)
  ├── party_licenses (N licenses, issuer = PartySelect → another party)
  ├── party_tax_registrations (N TRN/VAT rows)
  ├── party_finance_profiles (1:1 commercial terms)
  ├── party_contacts / party_addresses / party_bank_details (child tables)
  ├── party_documents (DMS-ready metadata)
  ├── party_compliance_profiles (1:1 KYC, approvals, holds, risk)
  ├── party_service_category_assignments (operational classification)
  ├── party_relationships (parent/child graph)
  ├── party_notes (internal notes)
  └── role profiles (0..1 each, conditional on type):
        party_customer_profiles
        party_vendor_profiles
        party_subcontractor_profiles
        party_consultant_profiles
        party_recruitment_agency_profiles
        party_government_authority_profiles
```

### 3.2 Dynamic data rule

**No hardcoded React enums for business options.** All comboboxes resolve to:

1. **Dedicated master tables** — `party_types`, `party_service_categories_master`, `party_relationship_types`, and small status/type masters (`party_natures`, `party_statuses`, `party_license_types`, etc.).
2. **Existing global lookups** — reuse `CUSTOMER_TYPES`, `VENDOR_TYPES`, `SUBCONTRACTOR_TYPES`, `GOVERNMENT_AUTHORITY_TYPES` via `LookupSelect` / cached hooks for **role profile** fields only.
3. **Existing geography/finance masters** — `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`.
4. **Self-referential PartySelect** — `parties` filtered by type for license issuers, relationships, parent party.

### 3.3 Filtered views (not separate modules)

| Sidebar item | Route | Filter |
|---|---|---|
| All Parties | `/admin/master-data/parties` | none |
| Customers | `.../parties/customers` | `party_types.type_code = 'CUSTOMER'` |
| Vendors | `.../parties/vendors` | `VENDOR` |
| Subcontractors | `.../parties/subcontractors` | `SUBCONTRACTOR` |
| Consultants | `.../parties/consultants` | `CONSULTANT` |
| Recruitment Agencies | `.../parties/recruitment-agencies` | `RECRUITMENT_AGENCY` |
| Government Authorities | `.../parties/government-authorities` | `GOVERNMENT_AUTHORITY` |
| Banks | `.../parties/banks` | `BANK` |
| Insurance Companies | `.../parties/insurance-companies` | `INSURANCE_COMPANY` |
| License Issuers | `.../parties/license-issuers` | `LICENSE_ISSUER` OR `GOVERNMENT_AUTHORITY` OR `FREE_ZONE_AUTHORITY` |
| Party Types | `.../parties/types` | CRUD on `party_types` |
| Service Categories | `.../parties/service-categories` | CRUD on `party_service_categories_master` |
| Relationship Types | `.../parties/relationship-types` | CRUD on `party_relationship_types` |

All list routes share **`PartiesTable`** with `partyTypeFilter?: string | string[]`.

### 3.4 Coexistence with Customer module

| Period | Customer route | Party Master route | Database |
|---|---|---|---|
| Planning (now) | Live | Not built | Old tables only |
| 5A.1–5A.4 impl | Live (reference) | New routes added | **Both** coexist |
| 5A.5 (explicit approval) | Hidden/removed | Primary | Old tables dropped |

**No data migration.** Customer test data discarded at cutover. Cross-reference mapping not required.

---

## 4. Table Inventory Summary

**38 new tables** (see Database Field Map for full column specs):

| Group | Tables | Count |
|---|---|---|
| Core | `parties`, `party_types`, `party_type_assignments` | 3 |
| Lookup masters (party-specific) | `party_natures`, `party_statuses`, `party_license_types`, `party_license_statuses`, `party_tax_statuses`, `party_contact_roles`, `party_contact_departments`, `party_address_types`, `party_document_types`, `party_document_statuses`, `party_compliance_statuses`, `party_approval_statuses`, `party_blacklist_statuses`, `party_risk_ratings`, `party_credit_ratings`, `party_note_types`, `payment_methods` | 17 |
| Child / transactional | `party_licenses`, `party_tax_registrations`, `party_finance_profiles`, `party_contacts`, `party_addresses`, `party_bank_details`, `party_documents`, `party_compliance_profiles`, `party_service_categories_master`, `party_service_category_assignments`, `party_relationship_types`, `party_relationships`, `party_notes` | 13 |
| Role profiles | 6 profile tables | 6 |
| **Total new** | | **39** |

**Reused existing tables (FK targets):** `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`, `user_profiles`, `global_lookup_values` (via code columns on profiles), `global_numbering_rules`, `permissions`, `roles`, `audit_logs`.

**ICV / CICPA:** Modeled as **license rows** (`party_licenses` with type `ICV_CERTIFICATE`) plus optional **document rows** (`party_documents`). Avoid duplicating ICV columns on `parties` (unlike legacy `customers` table). CICPA registration → license type `CICPA_REGISTRATION` or document type.

---

## 5. Numbering Plan

| Rule code | Document type | Prefix | Example | Phase |
|---|---|---|---|---|
| `MASTER_PARTY` | `PARTY` | PTY | PTY-000001 | **5A.1 required** |
| `MASTER_PARTY_CONTACT` | `PARTY_CONTACT` | PTY-CON | PTY-CON-000001 | 5A.2 |
| `MASTER_PARTY_ADDRESS` | `PARTY_ADDRESS` | PTY-ADDR | PTY-ADDR-000001 | 5A.2 |
| `MASTER_PARTY_BANK` | `PARTY_BANK_DETAIL` | PTY-BANK | PTY-BANK-000001 | 5A.2 |
| `MASTER_PARTY_LICENSE` | `PARTY_LICENSE` | PTY-LIC | PTY-LIC-000001 | 5A.2 |
| `MASTER_PARTY_TAX` | `PARTY_TAX_REGISTRATION` | PTY-TAX | PTY-TAX-000001 | 5A.2 |
| `MASTER_PARTY_DOCUMENT` | `PARTY_DOCUMENT` | PTY-DOC | PTY-DOC-000001 | 5A.2 (placeholder UI) |
| `MASTER_PARTY_NOTE` | `PARTY_NOTE` | PTY-NOTE | PTY-NOTE-000001 | 5A.4 defer OK |

All rules: 6-digit sequence, `{PREFIX}-{SEQ6}`, no manual override, gaps allowed — same pattern as existing `MASTER_CUSTOMER` rule.

**Legacy numbering rules** (`CUSTOMER`, `VENDOR`, etc.) remain until 5A.5 table drop; not used by Party Master.

---

## 6. Permissions Plan

Replace coarse `master_data.party_master.view/manage` with granular permissions (draft SQL seeds 22 codes):

```
master_data.parties.view
master_data.parties.create
master_data.parties.edit
master_data.parties.delete
master_data.parties.deactivate
master_data.parties.manage_types
master_data.parties.manage_service_categories
master_data.parties.manage_licenses
master_data.parties.manage_tax
master_data.parties.manage_contacts
master_data.parties.manage_addresses
master_data.parties.manage_bank_details
master_data.parties.verify_bank_details
master_data.parties.manage_documents
master_data.parties.manage_compliance
master_data.parties.approve
master_data.parties.blacklist
master_data.parties.manage_relationships
master_data.parties.override_duplicate
master_data.parties.export
master_data.parties.print
```

**Backward compatibility:** During coexistence, server actions check **either** new `.parties.*` **or** legacy `.party_master.*` until Customer retirement.

### Role mapping (draft)

| Role | Permissions |
|---|---|
| `system_admin` | All |
| `group_admin` | All except delete |
| `company_admin` | view, create, edit, deactivate, manage_*, export, print |
| `finance_manager` | view, manage_tax, manage_bank_details, verify_bank_details, manage_compliance (finance fields), approve (finance) |
| `procurement_manager` | view, create, edit, manage_contacts/addresses, export |
| `hr_manager` | view, manage_contacts, recruitment profile fields |
| `hse_manager` | view, manage_compliance (HSE approval), manage_documents |
| `operations_manager` | view, edit, manage_contacts/addresses, manage_relationships |
| `branch_admin` | view, create, edit (scoped later by branch — phase 2) |
| `viewer` | view, export |

Sensitive: bank details, verification, blacklist, holds, duplicate override, delete — gated at UI **and** server action **and** RLS where feasible.

---

## 7. RLS Plan

Pattern mirrors existing `customers_*_policy`:

```sql
SELECT: is_active = true OR has parties.view OR system_admin
INSERT: has parties.create OR parties.edit OR system_admin
UPDATE: has parties.edit AND (NOT is_locked OR system_admin) AND (NOT is_system OR system_admin)
DELETE: system_admin only (or parties.delete if granted)
```

**Elevated tables:**

| Table | Extra rule |
|---|---|
| `party_bank_details` | SELECT requires `manage_bank_details` OR `view` + masked columns in UI |
| `party_compliance_profiles` | SELECT for view; UPDATE for manage_compliance / approve / blacklist |
| `party_documents` | SELECT for view; file path restricted |
| `party_notes` | `is_private = true` → creator OR system_admin OR `parties.manage_compliance` |

RLS uses existing helpers: `current_user_has_permission()`, `current_user_has_role()`.

---

## 8. Duplicate Detection Plan

**Function (review draft in SQL):** `find_possible_duplicate_parties(p_legal_name_en, p_trn, p_license_number, p_iban, p_email, ...)`

| Match | Severity | Action |
|---|---|---|
| Active TRN exact | Block | Override requires `override_duplicate` + audit |
| Active license number exact | Block | Same |
| IBAN exact | Warning → Block (config) | Permission-based |
| Legal/trade name similarity (pg_trgm) | Warning | Show candidates, allow proceed with audit |
| Email / mobile exact | Warning | Non-blocking |

**UI:** On save (Add/Edit), call server check before commit. Show modal with candidate list. No auto-merge in phase 1.

**Index support:** `pg_trgm` on `legal_name_en`, `trade_name_en`; unique partial indexes on active TRN, license numbers, IBAN.

---

## 9. Reusable Components Plan

### 9.1 `PartySelect`

Location: `src/components/erp/party-select/party-select.tsx`

- Extends `ERPCombobox` + TanStack Query hook `usePartySelectQuery(filters)`.
- Search: `party_code`, `display_name`, `legal_name_en`, `trade_name_en`, TRN (join), primary license number.
- Badges: party types, status, blacklist.
- Default filters: `is_active = true`, compliance not blacklisted, approval approved (configurable).
- Props per prompt §24.1.

### 9.2 `PartyTypeCheckboxGrid`

- Loads `party_types` where `is_active`.
- Multi-select + primary radio; marks dirty on change.

### 9.3 `PartyServiceCategorySelector`

- Tree from `party_service_categories_master.parent_category_id`.
- Multi-select + primary flag.

### 9.4 Party form feature module

Copy Customer pattern:

```
src/features/master-data/parties/
  party-prefetch.ts
  hooks/use-party-form-prefetch.ts
  hooks/use-party-child-queries.ts
  components/parties-table.tsx
  components/party-form-drawer.tsx
  components/party-*-section.tsx (contacts, addresses, …)
  components/party-*-profile-section.tsx (conditional)
  types.ts
  validation.ts
server/actions/master-data/parties.ts (+ child action files)
```

---

## 10. Drawer & Runtime Standards

| Requirement | Approach |
|---|---|
| Shell | `ERPDrawerForm` 80% width |
| Footer | `ERPFormFooter` — Add/Edit: Cancel \| Save \| Save & Close; View: Close |
| Safe Close | `useFormDirty` + `UnsavedChangesDialog`; combobox changes mark dirty |
| Tabs | 13 tabs per prompt §9 |
| Lazy load | Child tabs (Contacts+) via `lazyMount`; **Basic + Types + Legal + Tax stay mounted** for FormData parent save |
| Prefetch | `PARTY_FORM_PREFETCH` declaration — geography, finance, all party lookup masters, party_types |
| Child tables | `useChildTableQuery` staleTime 5 min; invalidation via `createChildInvalidator` |
| `effectivePartyId` | Same Add→Save unlock pattern as Customer `effectiveCustomerId` |

---

## 11. Conditional UI Rules

| Condition | UI behavior |
|---|---|
| Type includes CUSTOMER | Show Customer Profile section/tab |
| Type includes VENDOR | Show Vendor Profile |
| Type includes SUBCONTRACTOR | Show Subcontractor Profile |
| Type includes CONSULTANT | Show Consultant Profile |
| Type includes RECRUITMENT_AGENCY | Show Recruitment Agency Profile |
| Type includes GOVERNMENT_AUTHORITY or LICENSE_ISSUER | Show Government Authority Profile |
| Vendor-like types | Bank Details tab expanded by default |
| GOVERNMENT_AUTHORITY only | Bank Details collapsed/hidden unless opened |
| License issuer field | PartySelect filtered to GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY |
| Operational PartySelect | Excludes inactive, blacklisted, non-approved unless props override |

---

## 12. Recommended Implementation Split

### 002F.5A.1 — Database Foundation (1 phase)

- Apply reviewed SQL migration (after Sameer approval).
- All tables, indexes, RLS, seeds (party types, service categories, lookup masters).
- Numbering rules for PARTY + children.
- Permissions seed.
- `find_possible_duplicate_parties` function stub.
- **No UI.**

### 002F.5A.2 — Main Party UI

- All Parties list + drawer tabs 1–7 (Basic, Types, Legal, Tax, Contacts, Addresses, Bank).
- Server actions + Zod + audit.
- Prefetch wiring.
- Documents tab = placeholder (same as Customer).

### 002F.5A.3 — Filtered Views + PartySelect

- 10 filtered list routes.
- Party Types / Service Categories / Relationship Types admin CRUD pages.
- `PartySelect`, `PartyTypeCheckboxGrid`, `PartyServiceCategorySelector`.
- Sidebar menu update (Party Master group; **keep** old Customers link until 5A.5).

### 002F.5A.4 — Compliance, Relationships, Duplicate Control

- Tabs 8–12 (Services, Compliance, Documents metadata, Relationships, Notes).
- Role profile sections (conditional).
- Duplicate detection UI + override audit.
- Audit tab (read from `audit_logs`).

### 002F.5A.5 — Customer Retirement (explicit approval only)

- Hide `/admin/master-data/customers`.
- Archive `src/features/master-data/customers/`.
- Drop legacy 6 entity table groups + child tables.
- Remove legacy numbering rules + permissions.
- Update SOT.

**Estimated effort:** 5A.1 = 1 session; 5A.2 = 2–3 sessions; 5A.3 = 1–2 sessions; 5A.4 = 2 sessions; 5A.5 = 1 session.

---

## 13. Migration & Rollback Strategy

1. **Review** draft SQL in this folder.
2. Sameer approves → copy to `supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f5a1_party_master_foundation.sql`.
3. Apply via Supabase CLI to staging first.
4. Implement UI against new tables only (no dual-write).
5. Rollback before 5A.5: drop new tables if empty; Customer module untouched.

Draft SQL includes `-- ROLLBACK NOTES` section with `DROP TABLE ... CASCADE` order.

---

## 14. Risks & Assumptions

| Risk | Mitigation |
|---|---|
| Scope too large for one implementation | Split 5A.1–5A.5 as above |
| FormData + 13 tabs performance | Lazy child tabs; keep parent fields mounted |
| Bank detail security | Permission + masked UI; RLS on table |
| DMS not ready | Documents tab metadata-only; `file_path` nullable |
| Lookup proliferation (17 small masters) | Acceptable vs hardcoded; admin CRUD for types later |
| `pg_trgm` extension for duplicate search | Enable in migration if not present |
| Branch/company scoping | Deferred — columns nullable on `parties` for future |
| Legacy modules referencing `customers.id` | None in live ops modules yet; CRM/procurement must use `party_id` when built |

**Assumptions:**

- Test customer data is disposable.
- Existing geography/finance masters are sufficient.
- REV1 lookup value codes remain valid for role profile fields.
- Government authorities still have **no bank_details requirement** at profile level (optional collapsed tab).

---

## 15. Source-of-Truth Impact (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`)

Updates required **after implementation phases** (not now):

| Section | Change |
|---|---|
| §6.4 Modules | Add Party Master rows; mark Customer as LEGACY until 5A.5 |
| §6.6 DB-Ready | Remove vendor/subcontractor/etc. silo tables after 5A.5 |
| §6.8 Phase tracker | Add 002F.5A.1–5A.5 rows |
| §6.10 | Replace Customer reference with Party Master reference |
| §6.11 | Revise dual-classification rules for unified model |
| §6.14 Next phases | Party Master before operational modules |
| §6.15 Completion log | Append each sub-phase |

---

## 16. Acceptance Checklist (Planning Phase)

| # | Criterion | Status |
|---|---|---|
| 1 | Intensive technical plan | ✅ This document |
| 2 | Draft SQL (review only) | ✅ `ERP_BASE_002F_5A_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY.sql` |
| 3 | UI/UX field map | ✅ Separate MD |
| 4 | Database field map | ✅ Separate MD |
| 5 | Phase split recommendation | ✅ §12 |
| 6 | No live DB migration | ✅ |
| 7 | No source code modified | ✅ |
| 8 | Customer table not deleted | ✅ |
| 9 | Customer module not deleted | ✅ |
| 10 | All comboboxes → DB sources in plan | ✅ |
| 11 | Every table/field listed | ✅ Database Field Map |
| 12 | Every tab/field location listed | ✅ UI Field Map |
| 13 | Permissions + RLS listed | ✅ Both docs |
| 14 | Seed categories listed | ✅ Database Field Map §Seeds |
| 15 | Duplicate detection rules | ✅ §8 + SQL function |
| 16 | Numbering rules | ✅ §5 + SQL |
| 17 | SOT impact section | ✅ §15 |

---

## 17. Review Questions for Sameer

1. **Approve table count (39 new)?** Or collapse small lookup masters into `global_lookup_categories`?
2. **ICV as license row vs dedicated `party_icv_profiles`?** Plan uses license + document pattern.
3. **List columns for All Parties vs filtered views** — full 22 columns or simplified (like current Customer list: code, name, type, updated)?
4. **Permission granularity** — 22 codes OK or keep grouped view/manage for phase 1?
5. **Proceed order:** 5A.1 DB first, or parallel UI mock on draft types?

---

*End of ERP BASE 002F.5A Technical Plan — PLANNING ONLY*
