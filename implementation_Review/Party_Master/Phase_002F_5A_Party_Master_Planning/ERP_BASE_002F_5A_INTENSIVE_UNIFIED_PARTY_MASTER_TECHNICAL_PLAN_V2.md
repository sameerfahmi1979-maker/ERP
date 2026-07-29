# ERP BASE 002F.5A — Intensive Unified Party Master Technical Plan v2

**Document type:** Planning report (review only — no implementation)  
**Phase:** ERP BASE 002F.5A  
**Version:** v2 — full prompt pass, gaps closed  
**Status:** DRAFT FOR SAMEER REVIEW  
**Generated:** 2026-06-13  
**Prompt source:** `ChatGPT/ERP_BASE_002F_5A_INTENSIVE_PARTY_MASTER_PLANNING_PROMPT.md`  
**Supersedes:** `ERP_BASE_002F_5A_INTENSIVE_UNIFIED_PARTY_MASTER_TECHNICAL_PLAN.md` (v1)

---

## v2 Changes vs v1

| Area | v1 Gap | v2 Fix |
|---|---|---|
| Profile FK columns | Used `text` codes for Customer Category, Vendor Type etc. instead of proper `bigint` FKs to dedicated lookup tables | All profile FKs now reference dedicated lookup master tables per §5 Dynamic Data Rule |
| SQL RLS policies | Only `parties` and `party_contacts` had complete policy blocks; all other tables said "apply similarly" | v2 SQL has complete RLS for all 25+ tables |
| Service category seeds | Only 8 of 40+ specified | v2 SQL seeds all 42 categories from prompt §17 |
| Numbering rules SQL | Only 1 of 8 rules had full INSERT | v2 SQL has all 8 rules with complete columns |
| Role→permission mapping | Only `system_admin` mapped | v2 maps all 10 roles per prompt §27 |
| Missing indexes | `issuing_authority_party_id`, `party_contacts(mobile)`, `party_addresses(country,emirate,city)`, `party_documents(document_type_id)`, `party_documents(expiry_date)` | All added |
| `party_relationships` duplicate constraint | No partial unique index | Added |
| Lookup master FKs in profiles | `customer_category_code text` | Replaced with `bigint` FKs to dedicated tables |
| `party_natures` seed | Missing Partnership, Sole Proprietorship | Added |
| Relationship types seed | Incomplete | Full 13 types |

---

## 1. Executive Summary

ALGT ERP replaces six siloed party tables (`customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies`) with a single unified **Party Master**. One legal entity (`parties`) carries **multiple party type assignments** simultaneously. Role-specific attributes live in six optional 1:1 **profile tables**. All comboboxes resolve to database tables — no hardcoded React enums.

**This phase produces planning artifacts only.** No migrations applied, no source code changed, Customer module untouched.

### Deliverables (this folder)

| # | File | Notes |
|---|---|---|
| 1 | `ERP_BASE_002F_5A_INTENSIVE_UNIFIED_PARTY_MASTER_TECHNICAL_PLAN_V2.md` | This doc |
| 2 | `ERP_BASE_002F_5A_PARTY_MASTER_DATABASE_FIELD_MAP_V2.md` | Full table/column/FK/index/RLS/seed spec |
| 3 | `ERP_BASE_002F_5A_PARTY_MASTER_UI_UX_AND_FIELD_MAP_V2.md` | Every screen, tab, field, control, source |
| 4 | `ERP_BASE_002F_5A_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_V2.sql` | Complete DDL, seeds, RLS, numbering, permissions |

---

## 2. Current State (Live — verified)

### 2.1 Supabase `mmiefuieduzdiiwnqpie`

- **56 public tables**, all RLS enabled.
- Six siloed party parent tables: `customers`, `vendors`, `subcontractors`, `consultants`, `government_authorities`, `recruitment_agencies` — near-identical wide columns (names, TRN, geography, ICV block, CICPA, audit).
- Child tables per entity: `*_contacts`, `*_addresses`, `*_documents`, `*_bank_details` (except `government_authorities` — no bank table).
- Global lookup engine: `global_lookup_categories` / `global_lookup_values` with REV1 seeds.
- Geography masters: `countries`, `emirates`, `cities`, `areas_zones`.
- Finance masters: `currencies`, `payment_terms`, `tax_types`, `banks`.
- Numbering: `global_numbering_rules` with entity rules `MASTER_CUSTOMER` → `CUST-000001`, etc.
- Permissions: `master_data.party_master.view` / `.manage` (4 codes from 002F.3E.2).

### 2.2 Live UI

- **Customer module CLOSED** — reference implementation at `src/features/master-data/customers/`.
- Vendor / Subcontractor / Consultant / Government Authority / Recruitment Agency: DB tables exist, **no UI**.
- Global form runtime standard closed: `ERPDrawerForm`, `ERPFormFooter`, `useFormDirty`, `RequiredLabel`, TanStack Query prefetch + child queries.

### 2.3 Strategic pivot

| Old direction | New direction |
|---|---|
| Copy Customer → build Vendor, then Subcontractor… | One Party Master + filtered views |
| Separate codes per role (`CUST-`, `VEND-`, `SUBC-`…) | Single `party_code` = `PTY-000001` |
| Duplicate legal entity in each silo table | One `parties` row + N type assignments |
| Migrate customer test data | **Discard** — clean build |

---

## 3. Architecture

### 3.1 Table tree

```
parties (1 row per legal entity)
│
├── party_type_assignments (N: CUSTOMER, VENDOR, SUBCONTRACTOR …)
│
├── party_licenses         (N: Trade License, ICV Certificate, ISO …)
├── party_tax_registrations (N: UAE VAT TRN, foreign registrations …)
├── party_finance_profiles  (1:1 — default terms, holds)
│
├── party_contacts          (N child rows)
├── party_addresses         (N child rows)
├── party_bank_details      (N child rows — sensitive permission gate)
├── party_documents         (N metadata rows — DMS file_path nullable)
│
├── party_compliance_profiles (1:1 — KYC, approvals, blacklist, risk, holds)
│
├── party_service_category_assignments (N: DIESEL_SUPPLY, TRANSPORT …)
│
├── party_relationships     (parent↔child graph — no self-link)
├── party_notes             (N — private flag for creator-only visibility)
│
└── role profiles (0 or 1 each, appear only when type is assigned):
      party_customer_profiles      ← when CUSTOMER assigned
      party_vendor_profiles        ← when VENDOR assigned
      party_subcontractor_profiles ← when SUBCONTRACTOR assigned
      party_consultant_profiles    ← when CONSULTANT assigned
      party_recruitment_agency_profiles ← when RECRUITMENT_AGENCY assigned
      party_government_authority_profiles ← when GOVERNMENT_AUTHORITY or LICENSE_ISSUER assigned
```

### 3.2 New lookup master tables (v2: FK-based, not text codes)

All profile role-specific comboboxes reference dedicated small master tables — **not** `text` codes and not global lookup categories. This enables admin CRUD, translation, icon/color metadata, and future reporting joins.

| Lookup master | Used by profile |
|---|---|
| `customer_categories` | `party_customer_profiles.customer_category_id` |
| `customer_statuses` | `party_customer_profiles.customer_status_id` |
| `invoice_methods` | `party_customer_profiles.preferred_invoice_method_id` |
| `vendor_categories` | `party_vendor_profiles.vendor_category_id` |
| `vendor_ratings` | `party_vendor_profiles.vendor_rating_id` |
| `procurement_categories` | `party_vendor_profiles.procurement_category_id` |
| `subcontractor_categories` | `party_subcontractor_profiles.subcontractor_category_id` |
| `work_categories` | `party_subcontractor_profiles.work_category_id` |
| `consultant_types` | `party_consultant_profiles.consultant_type_id` |
| `consultant_specializations` | `party_consultant_profiles.specialization_id` |
| `recruitment_categories` | `party_recruitment_agency_profiles.recruitment_category_id` |
| `authority_types` | `party_government_authority_profiles.authority_type_id` |
| `industry_sectors` | `party_customer_profiles.industry_sector_id` |
| `sales_regions` | `party_customer_profiles.sales_region_id` |

These 14 tables follow the standard lookup master column block (code, name_en, name_ar, is_system, is_active, sort_order + AUD).

### 3.3 Full table count

| Group | Count |
|---|---|
| Core | 3 (`parties`, `party_types`, `party_type_assignments`) |
| Party-specific lookup masters (status/type/role tables) | 17 |
| Role profile lookup masters (new in v2) | 14 |
| Child / transactional | 13 |
| Role profiles | 6 |
| **Total new** | **53** |

Reused from live DB: `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`, `user_profiles`, `global_numbering_rules`, `permissions`, `roles`, `role_permissions`, `audit_logs`.

### 3.4 Filtered views (not duplicate tables)

| Route | Filter applied |
|---|---|
| `/admin/master-data/parties` | none |
| `.../parties/customers` | `type_code = 'CUSTOMER'` |
| `.../parties/vendors` | `'VENDOR'` |
| `.../parties/subcontractors` | `'SUBCONTRACTOR'` |
| `.../parties/consultants` | `'CONSULTANT'` |
| `.../parties/recruitment-agencies` | `'RECRUITMENT_AGENCY'` |
| `.../parties/government-authorities` | `'GOVERNMENT_AUTHORITY'` |
| `.../parties/banks` | `'BANK'` |
| `.../parties/insurance-companies` | `'INSURANCE_COMPANY'` |
| `.../parties/license-issuers` | `type_code IN ('LICENSE_ISSUER','GOVERNMENT_AUTHORITY','FREE_ZONE_AUTHORITY')` |
| `.../parties/types` | Admin CRUD on `party_types` |
| `.../parties/service-categories` | Admin CRUD on `party_service_categories_master` |
| `.../parties/relationship-types` | Admin CRUD on `party_relationship_types` |

All list pages share one `PartiesTable` component with `partyTypeFilter?: string | string[]`.

### 3.5 Customer module coexistence

| Period | Customer module | Party Master | DB state |
|---|---|---|---|
| Planning (now) | Live | Not built | Legacy only |
| 5A.1–5A.4 | Live (reference only) | New routes added | Both coexist |
| 5A.5 (explicit Sameer approval) | Hidden then archived | Primary | Legacy tables dropped |

No data migration. Customer test data discarded at cutover.

---

## 4. Numbering Rules Plan

| Rule code | Prefix | Format | Example | Phase |
|---|---|---|---|---|
| `MASTER_PARTY` | PTY | PTY-{SEQ6} | PTY-000001 | **5A.1 — required** |
| `MASTER_PARTY_CONTACT` | PTY-CON | PTY-CON-{SEQ6} | PTY-CON-000001 | 5A.2 |
| `MASTER_PARTY_ADDRESS` | PTY-ADDR | PTY-ADDR-{SEQ6} | PTY-ADDR-000001 | 5A.2 |
| `MASTER_PARTY_BANK` | PTY-BANK | PTY-BANK-{SEQ6} | PTY-BANK-000001 | 5A.2 |
| `MASTER_PARTY_LICENSE` | PTY-LIC | PTY-LIC-{SEQ6} | PTY-LIC-000001 | 5A.2 |
| `MASTER_PARTY_TAX` | PTY-TAX | PTY-TAX-{SEQ6} | PTY-TAX-000001 | 5A.2 |
| `MASTER_PARTY_DOCUMENT` | PTY-DOC | PTY-DOC-{SEQ6} | PTY-DOC-000001 | 5A.2 (UI placeholder) |
| `MASTER_PARTY_NOTE` | PTY-NOTE | PTY-NOTE-{SEQ6} | PTY-NOTE-000001 | 5A.4 (can defer) |

All: 6-digit sequence, no manual override, gaps allowed, never reset. Same pattern as existing `MASTER_CUSTOMER`.

Legacy rules (`MASTER_CUSTOMER`, `MASTER_VENDOR`, etc.) untouched until 5A.5.

---

## 5. Dynamic Data Rule — No Hardcoded Lists

Every combobox/dropdown in the UI connects to one of:

1. **Party-specific master tables** — `party_types`, `party_natures`, `party_statuses`, `party_license_types`, `party_license_statuses`, `party_tax_statuses`, `party_contact_roles`, `party_contact_departments`, `party_address_types`, `party_document_types`, `party_document_statuses`, `party_compliance_statuses`, `party_approval_statuses`, `party_blacklist_statuses`, `party_risk_ratings`, `party_credit_ratings`, `party_note_types`, `payment_methods`.
2. **Role profile lookup masters** — all 14 tables in §3.2.
3. **Service/relationship masters** — `party_service_categories_master`, `party_relationship_types`.
4. **Existing global masters** — `countries`, `emirates`, `cities`, `areas_zones`, `currencies`, `payment_terms`, `tax_types`, `banks`.
5. **Self-referential PartySelect** — `parties` filtered by type for license issuers, parent party, relationship nodes.

**No hardcoded enum arrays in React for any of these.** System metadata may be seeded with `is_system = true` but still lives in a table.

---

## 6. Permissions Plan (21 codes)

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

### Role mapping (v2 — complete per prompt §27)

| Role | Permissions granted |
|---|---|
| `system_admin` | ALL 21 |
| `group_admin` | All except `delete` |
| `company_admin` | view, create, edit, deactivate, manage_types, manage_service_categories, manage_licenses, manage_tax, manage_contacts, manage_addresses, manage_bank_details, manage_documents, manage_compliance, approve, export, print |
| `branch_admin` | view, create, edit, deactivate, manage_contacts, manage_addresses, export, print |
| `finance_manager` | view, manage_tax, manage_bank_details, verify_bank_details, manage_compliance, approve, export, print |
| `procurement_manager` | view, create, edit, manage_contacts, manage_addresses, manage_licenses, manage_documents, export, print |
| `hr_manager` | view, manage_contacts, manage_documents, export |
| `hse_manager` | view, manage_compliance, manage_documents, manage_licenses |
| `operations_manager` | view, edit, manage_contacts, manage_addresses, manage_relationships, export |
| `viewer` | view, export, print |

**Backward compatibility:** Server actions check new `parties.*` OR legacy `party_master.*` during coexistence phase until 5A.5.

---

## 7. RLS Plan (v2 — complete table matrix)

All 53 new tables: RLS enabled. Policy pattern per table group:

### Core + Child tables (standard)

```sql
SELECT: is_active=true OR parties.view OR system_admin
INSERT: parties.create OR parties.edit OR party_master.manage OR system_admin
UPDATE: parties.edit + lock/system guard OR system_admin
DELETE: system_admin only
```

### Elevated security

| Table | Elevated rule |
|---|---|
| `party_bank_details` | SELECT: `manage_bank_details` OR `system_admin` only |
| `party_compliance_profiles` | UPDATE: `manage_compliance` OR `approve` OR `blacklist` |
| `party_documents` | SELECT: view; `file_path` exposed only at server action layer |
| `party_notes (is_private=true)` | SELECT: creator OR system_admin OR `manage_compliance` |

### Lookup masters

```sql
SELECT: any authenticated user
INSERT/UPDATE: manage_types OR manage_service_categories OR system_admin
DELETE: system_admin only (system rows blocked)
```

Uses existing helpers: `current_user_has_permission()`, `current_user_has_role()`.

---

## 8. Duplicate Detection Plan

**DB function:** `find_possible_duplicate_parties(...)` — returns table of `(party_id, party_code, display_name, match_type, match_score)`.

| Input field | Match type | Severity | Action |
|---|---|---|---|
| `p_trn` | EXACT_TRN | **Block** | Requires `override_duplicate` + audit log |
| `p_license_number` | EXACT_LICENSE | **Block** | Same |
| `p_iban` | EXACT_IBAN | **Warning/Block** | Config; permission-based override |
| `p_legal_name_en` | SIMILAR_NAME (pg_trgm > 0.45) | Warning | Show list; non-blocking |
| `p_trade_name_en` | SIMILAR_NAME | Warning | Non-blocking |
| `p_email` | EXACT_EMAIL | Warning | Non-blocking |
| `p_mobile` | EXACT_MOBILE | Warning | Non-blocking |
| `p_website` | EXACT_WEBSITE | Warning | Non-blocking |

**UI flow:** Save button → call `checkPartyDuplicates()` server action → if blocks returned: show modal listing candidates → user acknowledges or overrides (logs `DUPLICATE_OVERRIDE` audit event). No auto-merge in phase 1.

**Index support:** `pg_trgm` GIN on `legal_name_en`, `trade_name_en`; partial unique indexes on active TRN, license number, IBAN.

---

## 9. Reusable Components Plan

### 9.1 `PartySelect` — `src/components/erp/party-select/party-select.tsx`

Extends `ERPCombobox` + `usePartySelectQuery(filters)` TanStack hook.

| Prop | Type | Behavior |
|---|---|---|
| `typeCode` | string? | Single type filter |
| `typeCodes` | string[]? | Multi type |
| `serviceCategoryCode` | string? | Service category filter |
| `serviceCategoryCodes` | string[]? | Multi service |
| `statusCode` | string? | Party status |
| `approvalStatusCode` | string? | Compliance approval |
| `countryId` | number? | Geography |
| `emirateId` | number? | Geography |
| `includeInactive` | boolean | Default false |
| `includeBlacklisted` | boolean | Default false; requires `blacklist` permission |
| `value` | number? | party.id |
| `onChange` | fn | |
| `disabled` | boolean | |
| `placeholder` | string | |

Search fields: `party_code`, `display_name`, `legal_name_en`, `trade_name_en`, TRN (join), primary license number.  
Display: `PTY-000001 — Display Name` + type badge + status badge.  
Default exclusions: inactive, blacklisted, non-approved (unless props override).

Usage examples:
```tsx
<PartySelect typeCode="CUSTOMER" />
<PartySelect typeCode="GOVERNMENT_AUTHORITY" />
<PartySelect typeCodes={["GOVERNMENT_AUTHORITY", "LICENSE_ISSUER", "FREE_ZONE_AUTHORITY"]} />
<PartySelect typeCode="VENDOR" serviceCategoryCode="DIESEL_SUPPLY" />
<PartySelect typeCodes={["VENDOR", "SUBCONTRACTOR"]} approvalStatusCode="APPROVED" />
```

### 9.2 `PartyTypeCheckboxGrid`

Loads `party_types WHERE is_active ORDER BY sort_order`. Multi-checkbox + primary radio. Changes mark `formDirty`.

### 9.3 `PartyServiceCategorySelector`

Tree from `party_service_categories_master` (self-ref `parent_category_id`). Multi-select + primary flag.

### 9.4 Feature module file structure

```
src/features/master-data/parties/
  party-prefetch.ts                         (PARTY_FORM_PREFETCH declaration)
  hooks/
    use-party-form-prefetch.ts
    use-party-child-queries.ts
  components/
    parties-table.tsx                        (shared; accepts partyTypeFilter prop)
    party-form-drawer.tsx                    (13 tabs, Safe Close, FormData safety)
    party-basic-section.tsx
    party-types-section.tsx
    party-licenses-section.tsx
    party-tax-section.tsx
    party-contacts-section.tsx
    party-addresses-section.tsx
    party-bank-details-section.tsx
    party-services-section.tsx
    party-compliance-section.tsx
    party-documents-section.tsx
    party-relationships-section.tsx
    party-notes-section.tsx
    party-audit-section.tsx
    profiles/
      party-customer-profile-section.tsx     (conditional: CUSTOMER type)
      party-vendor-profile-section.tsx
      party-subcontractor-profile-section.tsx
      party-consultant-profile-section.tsx
      party-recruitment-profile-section.tsx
      party-authority-profile-section.tsx
  types.ts
  validation.ts
server/actions/master-data/
  parties.ts
  party-contacts.ts
  party-addresses.ts
  party-bank-details.ts
  party-licenses.ts
  party-tax.ts
  party-documents.ts
  party-compliance.ts
  party-services.ts
  party-relationships.ts
  party-notes.ts
```

---

## 10. Drawer Runtime Standards

| Standard | Requirement |
|---|---|
| Shell | `ERPDrawerForm` — 80% desktop width |
| Footer (Add/Edit) | Cancel \| Save \| Save & Close |
| Footer (View) | Close only |
| Safe Close | `useFormDirty` + `UnsavedChangesDialog`; combobox changes mark dirty |
| Tab count | 13 tabs (prompt §9) |
| Lazy loading | Tabs 1–4 (Basic, Types, Legal, Tax) stay mounted for FormData parent save; tabs 5–13 lazy `lazyMount` |
| `effectivePartyId` | After Add→Save: `effectivePartyId = party.id ?? createdPartyId` unlocks child tabs — mirrors Customer `effectiveCustomerId` fix |
| Prefetch | `PARTY_FORM_PREFETCH` declaration: geography, finance masters, all 17 party lookup masters, party_types, party_service_categories_master |
| Child queries | `useChildTableQuery` with `staleTime: 5 * 60 * 1000` (5 min) |
| Invalidation | `createChildInvalidator(queryKeys.parties.children)` |

---

## 11. Conditional Display Rules

| Trigger | UI change |
|---|---|
| Type assignment includes CUSTOMER | Show Customer Profile section (Tab 2 or collapsible below) |
| VENDOR | Show Vendor Profile |
| SUBCONTRACTOR | Show Subcontractor Profile |
| CONSULTANT | Show Consultant Profile |
| RECRUITMENT_AGENCY | Show Recruitment Agency Profile |
| GOVERNMENT_AUTHORITY or LICENSE_ISSUER | Show Government Authority Profile |
| VENDOR, SUBCONTRACTOR, CONSULTANT, RECRUITMENT_AGENCY, Scrap Seller, Transport/Equipment/Fuel/Workshop/Spare/Lab/Training/Manpower types | Bank Details tab expanded by default |
| GOVERNMENT_AUTHORITY only (no other types) | Bank Details tab collapsed/hidden unless user expands |
| License Issuer field | `PartySelect typeCodes={["GOVERNMENT_AUTHORITY","LICENSE_ISSUER","FREE_ZONE_AUTHORITY"]}` |
| Operational PartySelect (e.g. in procurement PO) | Exclude inactive, blacklisted, non-approved — configurable via props |
| party_status ≠ ACTIVE | Excluded from operational selectors by default |
| blacklist_status = BLACKLISTED | Excluded unless `includeBlacklisted` + permission |
| payment_hold = true | Flag warning on party in finance/payment workflows |
| work_hold = true | Flag warning on party in operations/site/subcontract workflows |

---

## 12. Implementation Split (Prompt §34)

### 002F.5A.1 — Database Foundation

Apply after Sameer approves draft SQL.

```
Create all 53 new tables
Seed all lookup masters (party types, natures, statuses, license types, …)
Seed all service categories (42+)
Seed all relationship types
Insert 8 numbering rules
Insert 21 permissions, assign to all 10 roles
Enable RLS + draft policies on all tables
Create all indexes + partial unique constraints
Create find_possible_duplicate_parties() function
```

No UI. Legacy tables untouched.

### 002F.5A.2 — Main Party UI

```
/admin/master-data/parties (All Parties list)
PartyFormDrawer with tabs 1–7:
  Tab 1: Basic Information
  Tab 2: Party Types (PartyTypeCheckboxGrid)
  Tab 3: Legal & Licenses (child table)
  Tab 4: Tax & Finance (child table + finance profile)
  Tab 5: Contacts (child table)
  Tab 6: Addresses (child table)
  Tab 7: Bank Details (child table + permission gate)
  Tab 10: Documents (placeholder banner — DMS not ready)
Server actions + Zod + logAudit + revalidatePath
PARTY_FORM_PREFETCH wiring
effectivePartyId pattern
```

### 002F.5A.3 — Filtered Views + PartySelect

```
10 filtered list routes (customers, vendors, …, license-issuers)
Party Types admin CRUD page
Service Categories admin CRUD (tree)
Relationship Types admin CRUD
PartySelect component
PartyTypeCheckboxGrid component
PartyServiceCategorySelector component
Sidebar Party Master group (keep legacy Customers link until 5A.5)
```

### 002F.5A.4 — Compliance, Relationships, Duplicate Control, Profiles

```
Tab 8: Services / Categories
Tab 9: Compliance & Approval
Tab 11: Relationships
Tab 12: Notes & Activity
Tab 13: Audit (read-only from audit_logs)
6 conditional role profile sections
Duplicate detection UI (modal + override audit)
```

### 002F.5A.5 — Customer Retirement (explicit Sameer approval required)

```
Hide /admin/master-data/customers
Remove Customer sidebar link
Archive src/features/master-data/customers/
Drop legacy silo tables in dependency order
Remove legacy numbering rules + permissions
Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md
```

**Estimated effort:** 5A.1 = 1 session; 5A.2 = 2–3; 5A.3 = 2; 5A.4 = 2; 5A.5 = 1.

---

## 13. Migration & Rollback

1. Review `ERP_BASE_002F_5A_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_V2.sql`.
2. Sameer approves → rename/copy to `supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f5a1_party_master_foundation.sql`.
3. Apply via Supabase CLI against staging first.
4. Implement UI against new tables only (no dual-write).
5. Rollback before 5A.5: drop new tables if empty — Customer module never touched.

SQL file contains `-- ROLLBACK:` comments with `DROP TABLE ... CASCADE` in reverse dependency order.

---

## 14. Risks & Assumptions

| Risk | Mitigation |
|---|---|
| 53 new tables feels large | 14 role-profile lookup masters are tiny (5–10 seed rows each); admin CRUD deferred to 5A.3+ |
| FormData + 13 tabs | Tabs 1–4 mounted; tabs 5–13 lazy; parent save only needs tabs 1–4 fields |
| Bank detail security | RLS SELECT restricted to `manage_bank_details`; masked in list UI |
| DMS not ready | `file_path` nullable; Documents tab = metadata + placeholder |
| `pg_trgm` extension | `CREATE EXTENSION IF NOT EXISTS pg_trgm` in migration header |
| Branch/company scoping | `parties` columns for future — deferred to phase 2 |
| CRM modules referencing `customers.id` | None exist yet in live ops modules; build CRM using `party_id` FK |
| Profile FK tables vs global lookups | v2 uses dedicated FK tables for type-safety and CRM join performance |

**Assumptions:**

- Customer test data is disposable.
- Geography/finance masters are sufficient for all party FK fields.
- REV1 global lookup seeds (`CUSTOMER_TYPES`, `VENDOR_TYPES`, etc.) become legacy after Party Master; role profiles use new dedicated FK tables.
- `current_user_has_permission()` and `current_user_has_role()` helpers remain available.
- Government authorities have no bank_details requirement at schema level (tab optional, collapsed).

---

## 15. Source-of-Truth Impact

Update `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` **after each sub-phase completes**:

| Section | Change |
|---|---|
| §6.4 Modules | Add Party Master rows after 5A.2; mark Customer as LEGACY |
| §6.6 DB-Ready | Remove vendor/subcontractor/etc. silo entries after 5A.5 |
| §6.8 Phase tracker | Append rows 002F.5A.1–5A.5 |
| §6.10 | Replace Customer reference implementation with Party Master |
| §6.11 | Revise dual-classification rules for unified model |
| §6.12 Important files | Add Party Master paths |
| §6.14 Next phases | Party Master replaces Vendor copy-building |
| §6.15 Completion log | Row per sub-phase |

---

## 16. Acceptance Checklist (Planning Phase — prompt §33)

| # | Criterion | v2 Status |
|---|---|---|
| 1 | Intensive technical plan | ✅ This document |
| 2 | Draft SQL (review only) | ✅ V2 SQL — complete policies + all 8 numbering rules |
| 3 | UI/UX field map | ✅ V2 — all 13 tabs, every field |
| 4 | Database field map | ✅ V2 — 53 tables, every column |
| 5 | Phase split recommendation | ✅ §12 (5A.1–5A.5) |
| 6 | No live DB migration | ✅ |
| 7 | No source code modified | ✅ |
| 8 | Customer table not deleted | ✅ |
| 9 | Customer module not deleted | ✅ |
| 10 | All comboboxes → DB sources in plan | ✅ — all 35+ field types mapped to tables |
| 11 | Every table and field listed | ✅ Database Field Map v2 |
| 12 | Every tab and field location listed | ✅ UI Field Map v2 |
| 13 | Permissions + RLS listed | ✅ §6, §7; complete in SQL v2 |
| 14 | Every seed category listed | ✅ DB Field Map v2 §8; SQL v2 §7–§8 |
| 15 | Duplicate detection rules | ✅ §8 + SQL function |
| 16 | Numbering rules | ✅ §4; all 8 in SQL v2 |
| 17 | SOT impact section | ✅ §15 |

---

## 17. Review Questions for Sameer

1. **53 tables OK?** Or collapse 14 role-profile lookup masters into `global_lookup_categories`? (v2 recommendation: keep separate for CRM join performance, but global lookups are simpler to set up.)
2. **ICV/CICPA:** Model as license rows (`party_licenses` type = `ICV_CERTIFICATE`) + document (`party_documents`) — no separate profile. Agree?
3. **Filtered view list columns** — full 22-column enterprise table or simplified (code, name, types, updated, actions) per filtered view?
4. **Permission granularity** — 21 codes now. Keep all 21 for phase 1 or start with grouped view/manage and expand later?
5. **Profile section placement** — inside Tab 2 (Party Types) as conditional sub-form, or as additional tabs after Tab 8? Prompt says "tabs or sections" — which do you prefer?
6. **Proceed to 5A.1 DB?** Confirm approval to rename v2 SQL to active migration folder and apply.

---

*End of ERP BASE 002F.5A Technical Plan v2 — PLANNING ONLY*
